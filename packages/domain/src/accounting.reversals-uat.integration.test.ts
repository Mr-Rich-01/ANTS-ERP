/**
 * Suite integrada P0-03f - regressao/UAT dos estornos operacionais.
 * Correr com: `pnpm test:integration:accounting:reversal:uat`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { civilDateInTimeZone, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { cancelInvoice, createInvoice, createPayment, reverseCustomerPayment } from './invoices';
import { createPurchaseOrder, createSupplierPayment, receivePurchaseOrder, reversePurchaseReceipt, reverseSupplierPayment } from './purchases';
import { reverseMovement, reverseTreasuryTransfer, transfer } from './treasury';
import { ConflictError, ForbiddenError, NotFoundError } from './errors';

const CA = 'uat-reversal-regression';
const CB = 'uat-reversal-regression-b';
const TEARDOWN_COMPANY = 'uat-reversal-teardown-check';
const CURRENT_DATE = civilDateInTimeZone();
const YEAR = CURRENT_DATE.slice(0, 4);
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const op = ctx(CA, ['sales.create', 'payments.receive', 'payments.cancel', 'invoices.cancel', 'purchases.create', 'supplierPayments.reverse', 'purchaseReceipts.reverse', 'treasury.transfer', 'treasury.reverseTransfer', 'treasury.reverseMovement']);
const noReverse = ctx(CA, ['sales.create', 'payments.receive', 'purchases.create', 'treasury.transfer']);
const crossCompany = ctx(CB, ['payments.cancel', 'invoices.cancel', 'supplierPayments.reverse', 'purchaseReceipts.reverse', 'treasury.reverseTransfer', 'treasury.reverseMovement']);

interface Ids {
  fy: string;
  period: string;
  customer: string;
  supplier: string;
  warehouse: string;
  salesProduct: string;
  purchaseProduct: string;
  cashAccount: string;
  bankAccount: string;
  transferSource: string;
  transferDestination: string;
}

let ids!: Ids;

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.supplierPayment.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
  await prisma.stockMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { companyId } });
  await prisma.purchaseReceiptItem.deleteMany({ where: { companyId } });
  await prisma.purchaseReceipt.deleteMany({ where: { companyId } });
  await prisma.purchaseOrderLine.deleteMany({ where: { companyId } });
  await prisma.purchaseOrder.deleteMany({ where: { companyId } });
  await prisma.stockLevel.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.treasuryAccount.updateMany({ where: { companyId }, data: { ledgerAccountId: null } });
  await prisma.treasuryAccount.deleteMany({ where: { companyId } });
  await prisma.accountingMapping.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.fiscalYear.deleteMany({ where: { companyId } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: { gte: 2 } } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId } });
  await prisma.accountingJournal.deleteMany({ where: { companyId } });
  await prisma.documentCounter.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.supplier.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function ledger(companyId: string, code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'REVENUE', normalBalance: 'DEBIT' | 'CREDIT', parentId?: string) {
  return prisma.ledgerAccount.create({
    data: { companyId, code, name, accountType, normalBalance, parentId: parentId ?? null, level: parentId ? 2 : 1, isPosting: parentId ? true : code !== '1' },
  });
}

async function provisionCompany(companyId: string, legalName: string, full = false): Promise<Ids | null> {
  await prisma.company.create({ data: { id: companyId, legalName } });
  const fy = await prisma.fiscalYear.create({ data: { companyId, name: YEAR, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN', isCurrent: true } });
  const period = await prisma.accountingPeriod.create({ data: { companyId, fiscalYearId: fy.id, periodNumber: 1, code: YEAR, name: YEAR, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN' } });
  if (!full) return null;

  await prisma.accountingJournal.createMany({
    data: [
      { companyId, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' },
      { companyId, code: 'DC', name: 'Compras', journalType: 'PURCHASES', sequencePrefix: 'LC' },
      { companyId, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' },
      { companyId, code: 'DB', name: 'Banco', journalType: 'BANK', sequencePrefix: 'BC' },
    ],
  });
  const root = (await ledger(companyId, '1', 'Activo', 'ASSET', 'DEBIT')).id;
  const ar = (await ledger(companyId, '121', 'Clientes', 'ASSET', 'DEBIT', root)).id;
  const cashLedger = (await ledger(companyId, '111', 'Caixa', 'ASSET', 'DEBIT', root)).id;
  const bankLedger = (await ledger(companyId, '112', 'Banco', 'ASSET', 'DEBIT', root)).id;
  const inventory = (await ledger(companyId, '131', 'Inventario', 'ASSET', 'DEBIT', root)).id;
  const vatInput = (await ledger(companyId, '141', 'IVA dedutivel', 'ASSET', 'DEBIT', root)).id;
  const vatOutput = (await ledger(companyId, '221', 'IVA liquidado', 'LIABILITY', 'CREDIT')).id;
  const payable = (await ledger(companyId, '211', 'Fornecedores', 'LIABILITY', 'CREDIT')).id;
  const revenue = (await ledger(companyId, '411', 'Vendas', 'REVENUE', 'CREDIT')).id;

  await prisma.accountingMapping.createMany({
    data: [
      { companyId, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar },
      { companyId, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue },
      { companyId, systemKey: 'VAT_OUTPUT', ledgerAccountId: vatOutput },
      { companyId, systemKey: 'INVENTORY', ledgerAccountId: inventory },
      { companyId, systemKey: 'VAT_INPUT', ledgerAccountId: vatInput },
      { companyId, systemKey: 'ACCOUNTS_PAYABLE', ledgerAccountId: payable },
    ],
  });

  const customer = await prisma.customer.create({ data: { companyId, name: 'Cliente UAT', paymentTermDays: 0 } });
  const supplier = await prisma.supplier.create({ data: { companyId, name: 'Fornecedor UAT' } });
  const warehouse = await prisma.warehouse.create({ data: { companyId, code: 'ARM', name: 'Armazem UAT' } });
  const salesProduct = await prisma.product.create({ data: { companyId, sku: 'UAT-SALE', name: 'Produto Venda UAT', salePrice: 100, taxRate: 16, avgCost: 25 } });
  const purchaseProduct = await prisma.product.create({ data: { companyId, sku: 'UAT-PUR', name: 'Produto Compra UAT', salePrice: 150, taxRate: 16, avgCost: 10 } });
  await prisma.stockLevel.createMany({
    data: [
      { companyId, productId: salesProduct.id, warehouseId: warehouse.id, quantity: 100 },
      { companyId, productId: purchaseProduct.id, warehouseId: warehouse.id, quantity: 10 },
    ],
  });
  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId, name: 'Caixa UAT', type: 'CASH', ledgerAccountId: cashLedger, openingBalance: 1000, balance: 1000, allowNegative: false } });
  const bankAccount = await prisma.treasuryAccount.create({ data: { companyId, name: 'Banco UAT', type: 'BANK', ledgerAccountId: bankLedger, openingBalance: 1000, balance: 1000, allowNegative: true } });
  const transferSource = await prisma.treasuryAccount.create({ data: { companyId, name: 'Origem Transferencia UAT', type: 'CASH', openingBalance: 500, balance: 500, allowNegative: false } });
  const transferDestination = await prisma.treasuryAccount.create({ data: { companyId, name: 'Destino Transferencia UAT', type: 'BANK', openingBalance: 200, balance: 200, allowNegative: true } });

  return { fy: fy.id, period: period.id, customer: customer.id, supplier: supplier.id, warehouse: warehouse.id, salesProduct: salesProduct.id, purchaseProduct: purchaseProduct.id, cashAccount: cashAccount.id, bankAccount: bankAccount.id, transferSource: transferSource.id, transferDestination: transferDestination.id };
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await teardown(TEARDOWN_COMPANY);
  const provisioned = await provisionCompany(CA, 'UAT Reversal Regression', true);
  if (!provisioned) throw new Error('Fixture UAT incompleta.');
  ids = provisioned;
  await provisionCompany(CB, 'UAT Reversal Regression B');
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await teardown(TEARDOWN_COMPANY);
  await prisma.$disconnect();
});

async function countAudit(action: string) {
  return prisma.auditLog.count({ where: { companyId: CA, action } });
}

async function countReversedAccountingEvent(sourceType: string, sourceId: string, accountingEvent: string) {
  const original = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType, sourceId, accountingEvent } });
  const reversalCount = await prisma.journalEntry.count({ where: { companyId: CA, reversalOfId: original.id } });
  return (original.status === 'REVERSED' ? 1 : 0) + reversalCount;
}

async function setPeriod(status: 'OPEN' | 'CLOSED') {
  await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status } });
}

async function setFiscalYear(status: 'OPEN' | 'CLOSED') {
  await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status } });
}

describe('P0-03f - regressao integrada/UAT dos estornos', () => {
  it('cenario 1: venda, recebimento activo bloqueia cancelamento, anulacao do recibo permite cancelar factura', async () => {
    const issued = await createInvoice(prisma, op, {
      idempotencyKey: randomUUID(),
      issueDate: CURRENT_DATE,
      customerId: ids.customer,
      warehouseId: ids.warehouse,
      lines: [{ productId: ids.salesProduct, quantity: 1, discountPercent: 0 }],
    });
    const invoiceBeforePayment = await prisma.invoice.findUniqueOrThrow({ where: { id: issued.id } });
    const payment = await createPayment(prisma, op, {
      idempotencyKey: randomUUID(),
      invoiceId: issued.id,
      amount: Number(invoiceBeforePayment.total),
      method: 'CASH',
      accountId: ids.cashAccount,
    });

    await expect(cancelInvoice(prisma, op, { invoiceId: issued.id, idempotencyKey: randomUUID(), cancellationReason: 'Motivo valido para bloquear', cancellationDate: CURRENT_DATE })).rejects.toBeInstanceOf(ConflictError);

    const paymentKey = randomUUID();
    const reversed = await reverseCustomerPayment(prisma, op, { paymentId: payment.id, idempotencyKey: paymentKey, reversalReason: 'Motivo valido para anular recibo', reversalDate: CURRENT_DATE });
    const replay = await reverseCustomerPayment(prisma, op, { paymentId: payment.id, idempotencyKey: paymentKey, reversalReason: 'Motivo valido para anular recibo', reversalDate: CURRENT_DATE });
    expect(replay).toEqual(reversed);

    const cancelled = await cancelInvoice(prisma, op, { invoiceId: issued.id, idempotencyKey: randomUUID(), cancellationReason: 'Motivo valido para cancelar factura', cancellationDate: CURRENT_DATE });

    const [paymentRow, invoiceRow, customer, account, stock, paymentReversalEntries, invoiceReversalEntries] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      prisma.invoice.findUniqueOrThrow({ where: { id: issued.id } }),
      prisma.customer.findUniqueOrThrow({ where: { id: ids.customer } }),
      prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.cashAccount } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.salesProduct, warehouseId: ids.warehouse } } }),
      countReversedAccountingEvent('CUSTOMER_PAYMENT', payment.id, 'RECEIPT_POSTED'),
      countReversedAccountingEvent('INVOICE', issued.id, 'SALE_ISSUED'),
    ]);
    expect(paymentRow.status).toBe('REVERSED');
    expect(invoiceRow.status).toBe('CANCELLED');
    expect(Number(invoiceRow.amountPaid)).toBe(0);
    expect(round2(Number(customer.balance))).toBe(0);
    expect(round2(Number(account.balance))).toBe(1000);
    expect(stock.quantity).toBe(100);
    expect(paymentReversalEntries).toBe(2);
    expect(invoiceReversalEntries).toBe(2);
    expect(await countAudit('customer.payment.reverse')).toBeGreaterThanOrEqual(1);
    expect(await countAudit('invoice.cancel')).toBeGreaterThanOrEqual(1);
    expect(cancelled.stockReversalIds.length).toBe(1);
    await expect(reverseCustomerPayment(prisma, op, { paymentId: payment.id, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido repetido recibo', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ConflictError);
    await expect(cancelInvoice(prisma, op, { invoiceId: issued.id, idempotencyKey: randomUUID(), cancellationReason: 'Motivo valido repetido factura', cancellationDate: CURRENT_DATE })).rejects.toBeInstanceOf(ConflictError);
  });

  it('cenario 2: compra, recepcao com pagamento activo bloqueia, estorno do pagamento permite estornar recepcao', async () => {
    const orderCreated = await createPurchaseOrder(prisma, op, {
      supplierId: ids.supplier,
      warehouseId: ids.warehouse,
      lines: [{ productId: ids.purchaseProduct, quantity: 1, unitCost: 100 }],
    });
    const orderWithLines = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderCreated.id }, include: { lines: true } });
    const receipt = await receivePurchaseOrder(prisma, op, orderWithLines.id, [{ lineId: orderWithLines.lines[0]!.id, quantity: 1 }], { idempotencyKey: randomUUID(), receiptDate: CURRENT_DATE });
    if (!receipt.id) throw new Error('Recepcao UAT sem id.');
    const receiptId = receipt.id;
    const receiptRow = await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receiptId } });
    const supplierPayment = await createSupplierPayment(prisma, op, {
      idempotencyKey: randomUUID(),
      supplierId: ids.supplier,
      purchaseOrderId: orderWithLines.id,
      amount: Number(receiptRow.totalAmount),
      method: 'CASH',
      accountId: ids.cashAccount,
    });

    await expect(reversePurchaseReceipt(prisma, op, { purchaseReceiptId: receiptId, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido bloqueio recepcao', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ConflictError);

    await reverseSupplierPayment(prisma, op, { supplierPaymentId: supplierPayment.id, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido para estorno pagamento', reversalDate: CURRENT_DATE });
    const reversedReceipt = await reversePurchaseReceipt(prisma, op, { purchaseReceiptId: receiptId, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido para estorno recepcao', reversalDate: CURRENT_DATE });

    const [paymentRow, receiptAfter, orderAfter, lineAfter, supplier, stock, product, paymentReversalEntries, receiptReversalEntries] = await Promise.all([
      prisma.supplierPayment.findUniqueOrThrow({ where: { id: supplierPayment.id } }),
      prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receiptId } }),
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderWithLines.id } }),
      prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: orderWithLines.lines[0]!.id } }),
      prisma.supplier.findUniqueOrThrow({ where: { id: ids.supplier } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.purchaseProduct, warehouseId: ids.warehouse } } }),
      prisma.product.findUniqueOrThrow({ where: { id: ids.purchaseProduct } }),
      countReversedAccountingEvent('SUPPLIER_PAYMENT', supplierPayment.id, 'SUPPLIER_PAYMENT_POSTED'),
      countReversedAccountingEvent('PURCHASE_RECEIPT', receiptId, 'PURCHASE_RECEIVED'),
    ]);
    expect(paymentRow.status).toBe('REVERSED');
    expect(receiptAfter.status).toBe('REVERSED');
    expect(round2(Number(supplier.balance))).toBe(0);
    expect(round2(Number(orderAfter.amountPaid))).toBe(0);
    expect(round2(Number(orderAfter.receivedValue))).toBe(0);
    expect(lineAfter.receivedQty).toBe(0);
    expect(stock.quantity).toBe(10);
    expect(round2(Number(product.avgCost))).toBe(10);
    expect(paymentReversalEntries).toBe(2);
    expect(receiptReversalEntries).toBe(2);
    expect(await countAudit('supplier.payment.reverse')).toBeGreaterThanOrEqual(1);
    expect(await countAudit('purchase.receipt.reverse')).toBeGreaterThanOrEqual(1);
    expect(reversedReceipt.stockReversalIds.length).toBe(1);
    await expect(reverseSupplierPayment(prisma, op, { supplierPaymentId: supplierPayment.id, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido repetido pagamento', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ConflictError);
    await expect(reversePurchaseReceipt(prisma, op, { purchaseReceiptId: receiptId, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido repetido recepcao', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ConflictError);
  });

  it('cenario 3: transferencia exige estorno atomico e nao cria contabilidade', async () => {
    const created = await transfer(prisma, op, { fromAccountId: ids.transferSource, toAccountId: ids.transferDestination, amount: 50, description: 'Transferencia UAT' });
    const originalLegs = await prisma.treasuryMovement.findMany({ where: { companyId: CA, transferId: created.transferId, source: 'TRANSFER' } });
    expect(originalLegs).toHaveLength(2);
    await expect(reverseMovement(prisma, op, originalLegs[0]!.id, 'tentativa isolada')).rejects.toThrow('transfer');

    const reverseKey = randomUUID();
    const reversed = await reverseTreasuryTransfer(prisma, op, { transferId: created.transferId, idempotencyKey: reverseKey, reversalReason: 'Motivo valido para transferencia', reversalDate: CURRENT_DATE });
    const replay = await reverseTreasuryTransfer(prisma, op, { transferId: created.transferId, idempotencyKey: reverseKey, reversalReason: 'Motivo valido para transferencia', reversalDate: CURRENT_DATE });
    expect(replay).toEqual(reversed);

    const [legsAfter, reversals, source, destination, journalCount] = await Promise.all([
      prisma.treasuryMovement.findMany({ where: { companyId: CA, transferId: created.transferId, source: 'TRANSFER' } }),
      prisma.treasuryMovement.findMany({ where: { companyId: CA, transferId: created.transferId, source: 'REVERSAL' } }),
      prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.transferSource } }),
      prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.transferDestination } }),
      prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'TREASURY_TRANSFER', sourceId: created.transferId } }),
    ]);
    expect(legsAfter.every((m) => m.status === 'REVERSED')).toBe(true);
    expect(reversals).toHaveLength(2);
    expect(round2(Number(source.balance))).toBe(500);
    expect(round2(Number(destination.balance))).toBe(200);
    expect(journalCount).toBe(0);
    expect(await countAudit('treasury.transfer.reverse')).toBeGreaterThanOrEqual(1);
    await expect(reverseTreasuryTransfer(prisma, op, { transferId: created.transferId, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido repetido transferencia', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ConflictError);
  });

  it('cenario 4: seguranca transversal cobre permissao, isolamento, periodo/exercicio fechado e teardown', async () => {
    const invoice = await createInvoice(prisma, op, {
      idempotencyKey: randomUUID(),
      issueDate: CURRENT_DATE,
      customerId: ids.customer,
      warehouseId: ids.warehouse,
      lines: [{ productId: ids.salesProduct, quantity: 1, discountPercent: 0 }],
    });
    const invoiceRow = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    const payment = await createPayment(prisma, op, { idempotencyKey: randomUUID(), invoiceId: invoice.id, amount: Number(invoiceRow.total), method: 'CASH', accountId: ids.cashAccount });

    await expect(reverseCustomerPayment(prisma, noReverse, { paymentId: payment.id, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido sem permissao', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reverseCustomerPayment(prisma, crossCompany, { paymentId: payment.id, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido cross company', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(NotFoundError);

    await setPeriod('CLOSED');
    await expect(reverseCustomerPayment(prisma, op, { paymentId: payment.id, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido periodo fechado', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ConflictError);
    await setPeriod('OPEN');
    await setFiscalYear('CLOSED');
    await expect(reverseCustomerPayment(prisma, op, { paymentId: payment.id, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido exercicio fechado', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ConflictError);
    await setFiscalYear('OPEN');

    await provisionCompany(TEARDOWN_COMPANY, 'UAT Teardown Check');
    await teardown(TEARDOWN_COMPANY);
    expect(await prisma.company.count({ where: { id: TEARDOWN_COMPANY } })).toBe(0);

    await reverseCustomerPayment(prisma, op, { paymentId: payment.id, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido final seguranca', reversalDate: CURRENT_DATE });
    await cancelInvoice(prisma, op, { invoiceId: invoice.id, idempotencyKey: randomUUID(), cancellationReason: 'Motivo valido final seguranca', cancellationDate: CURRENT_DATE });
  });
});
