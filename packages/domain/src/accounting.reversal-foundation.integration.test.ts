import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import type { RequestContext } from './context';
import { formatAccountingDate } from './accounting';
import { postAccountingEventTx, reverseAccountingEventTx } from './accounting-events';
import { createInvoice, createPayment } from './invoices';
import { createPurchaseOrder, createSupplierPayment, receivePurchaseOrder } from './purchases';
import { reverseMovement } from './treasury';
import {
  FINGERPRINT_VERSION,
  OPERATION_IDEMPOTENCY_SCOPES,
  canonicalRequestFingerprint,
  runIdempotentOperation,
} from './operation-idempotency';
import { parseReversalDateInput, validateOpenReversalDateTx, validateReversalReason } from './reversals';
import { ConflictError, ValidationError } from './errors';

const CA = 'smoke-reversal-foundation';
const CB = 'smoke-reversal-foundation-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const CURRENT_DATE = civilDateInTimeZone();

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const op = ctx(CA, ['sales.create', 'payments.receive', 'purchases.create', 'treasury.reverseMovement']);

let ids!: {
  fy: string;
  jan: string;
  feb: string;
  cash: string;
  revenue: string;
  vatOut: string;
  inventory: string;
  vatIn: string;
  payable: string;
  customer: string;
  supplier: string;
  warehouse: string;
  product: string;
  treasuryAccount: string;
  invoiceA: string;
  invoiceB: string;
  purchaseOrder: string;
};

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.supplierPayment.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.stockMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.purchaseReceiptItem.deleteMany({ where: { companyId } });
  await prisma.purchaseReceipt.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { companyId } });
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
  await prisma.ledgerAccount.deleteMany({ where: { companyId } });
  await prisma.accountingJournal.deleteMany({ where: { companyId } });
  await prisma.documentCounter.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.supplier.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function ledger(code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT') {
  return prisma.ledgerAccount.create({ data: { companyId: CA, code, name, accountType, normalBalance } });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Reversal Foundation' } });
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Reversal Foundation B' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const jan = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026-01', name: 'Jan 2026', startDate: D('2026-01-01'), endDate: D('2026-01-31'), status: 'OPEN' } });
  const feb = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 2, code: '2026-02', name: 'Feb 2026', startDate: D('2026-02-01'), endDate: D('2026-02-28'), status: 'CLOSED' } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 3, code: '2026-03-12', name: 'Mar-Dec 2026', startDate: D('2026-03-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  await prisma.accountingJournal.createMany({
    data: [
      { companyId: CA, code: 'DG', name: 'Geral', journalType: 'GENERAL', sequencePrefix: 'LG' },
      { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' },
      { companyId: CA, code: 'DC', name: 'Compras', journalType: 'PURCHASES', sequencePrefix: 'LC' },
      { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' },
    ],
  });
  const cash = (await ledger('111', 'Caixa', 'ASSET', 'DEBIT')).id;
  const ar = (await ledger('121', 'Clientes', 'ASSET', 'DEBIT')).id;
  const inventory = (await ledger('131', 'Mercadorias', 'ASSET', 'DEBIT')).id;
  const vatIn = (await ledger('141', 'IVA dedutivel', 'ASSET', 'DEBIT')).id;
  const payable = (await ledger('211', 'Fornecedores', 'LIABILITY', 'CREDIT')).id;
  const vatOut = (await ledger('221', 'IVA liquidado', 'LIABILITY', 'CREDIT')).id;
  const revenue = (await ledger('411', 'Vendas', 'REVENUE', 'CREDIT')).id;
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar },
      { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue },
      { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: vatOut },
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory },
      { companyId: CA, systemKey: 'VAT_INPUT', ledgerAccountId: vatIn },
      { companyId: CA, systemKey: 'ACCOUNTS_PAYABLE', ledgerAccountId: payable },
    ],
  });
  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente RF' } });
  const supplier = await prisma.supplier.create({ data: { companyId: CA, name: 'Fornecedor RF' } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'RF', name: 'Produto RF', salePrice: 100, avgCost: 50, taxRate: 16 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: product.id, warehouseId: warehouse.id, quantity: 1000 } });
  const treasuryAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa', type: 'CASH', ledgerAccountId: cash, balance: 1000, openingBalance: 1000 } });
  const invoiceA = await prisma.invoice.create({ data: { companyId: CA, number: 'FT 2026/RF1', customerId: customer.id, customerName: customer.name, warehouseId: warehouse.id, issueDate: D('2026-01-10'), dueDate: D('2026-01-10'), subtotal: 100, discountTotal: 0, taxableBase: 100, taxTotal: 16, total: 116 } });
  const customerB = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B' } });
  const warehouseB = await prisma.warehouse.create({ data: { companyId: CB, code: 'ARM-B', name: 'Armazem B' } });
  const invoiceB = await prisma.invoice.create({ data: { companyId: CB, number: 'FT 2026/RFB', customerId: customerB.id, customerName: customerB.name, warehouseId: warehouseB.id, issueDate: D('2026-01-10'), dueDate: D('2026-01-10'), subtotal: 10, discountTotal: 0, taxableBase: 10, taxTotal: 0, total: 10 } });
  const purchaseOrder = await prisma.purchaseOrder.create({ data: { companyId: CA, number: 'OC 2026/RF1', supplierId: supplier.id, supplierName: supplier.name, warehouseId: warehouse.id, subtotal: 100, taxTotal: 16, total: 116 } });
  await prisma.purchaseOrderLine.create({ data: { companyId: CA, orderId: purchaseOrder.id, productId: product.id, description: product.name, unitCost: 100, quantity: 10, taxRate: 16, total: 1160 } });
  ids = { fy: fy.id, jan: jan.id, feb: feb.id, cash, revenue, vatOut, inventory, vatIn, payable, customer: customer.id, supplier: supplier.id, warehouse: warehouse.id, product: product.id, treasuryAccount: treasuryAccount.id, invoiceA: invoiceA.id, invoiceB: invoiceB.id, purchaseOrder: purchaseOrder.id };
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await provision();
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.$disconnect();
});

async function postEvent(sourceId = randomUUID()) {
  const origin = { sourceType: 'RF', sourceId, accountingEvent: 'POSTED' };
  const posted = await prisma.$transaction((tx) => postAccountingEventTx(tx, op, {
    journalType: 'GENERAL',
    entryDate: D('2026-01-15'),
    description: `Evento ${sourceId}`,
    reference: `DOC-${sourceId}`,
    origin,
    lines: [
      { ledgerAccountId: ids.cash, debit: 25, treasuryAccountId: ids.treasuryAccount },
      { ledgerAccountId: ids.revenue, credit: 25 },
    ],
  }));
  return { origin, posted };
}

describe('P0-03.0 - fundacao tecnica de reversoes', () => {
  it('#1-#4 defaults ACTIVE e metadados nulos em documentos reversiveis', async () => {
    const payment = await prisma.payment.create({ data: { companyId: CA, number: `REC ${randomUUID()}`, invoiceId: ids.invoiceA, customerId: ids.customer, amount: 1 } });
    const supplierPayment = await prisma.supplierPayment.create({ data: { companyId: CA, number: `PG ${randomUUID()}`, supplierId: ids.supplier, amount: 1 } });
    const receipt = await prisma.purchaseReceipt.create({ data: { companyId: CA, purchaseOrderId: ids.purchaseOrder, supplierId: ids.supplier, warehouseId: ids.warehouse, receiptNumber: `GR ${randomUUID()}`, receiptDate: D('2026-01-10'), netAmount: 1, taxAmount: 0, totalAmount: 1 } });

    expect(payment.status).toBe('ACTIVE');
    expect(supplierPayment.status).toBe('ACTIVE');
    expect(receipt.status).toBe('ACTIVE');
    expect([payment.reversedAt, payment.reversedById, payment.reversalReason, supplierPayment.reversedAt, supplierPayment.reversedById, supplierPayment.reversalReason, receipt.reversedAt, receipt.reversedById, receipt.reversalReason]).toEqual(Array(9).fill(null));
  });

  it('#5-#8 StockMovement liga factura da mesma empresa, rejeita cross-company e impede duplo compensatorio', async () => {
    const original = await prisma.stockMovement.create({ data: { companyId: CA, productId: ids.product, warehouseId: ids.warehouse, invoiceId: ids.invoiceA, type: 'OUT', quantity: -1, balanceAfter: 999 } });
    expect(original.invoiceId).toBe(ids.invoiceA);

    await expect(prisma.stockMovement.create({ data: { companyId: CA, productId: ids.product, warehouseId: ids.warehouse, invoiceId: ids.invoiceB, type: 'OUT', quantity: -1, balanceAfter: 998 } })).rejects.toBeTruthy();

    const reversal = await prisma.stockMovement.create({ data: { companyId: CA, productId: ids.product, warehouseId: ids.warehouse, reversesId: original.id, type: 'IN', quantity: 1, balanceAfter: 1000 } });
    expect(reversal.reversesId).toBe(original.id);
    await expect(prisma.stockMovement.create({ data: { companyId: CA, productId: ids.product, warehouseId: ids.warehouse, reversesId: original.id, type: 'IN', quantity: 1, balanceAfter: 1001 } })).rejects.toBeTruthy();
  });

  it('#9-#14 helper de motivo obriga texto util e aplica trim', () => {
    expect(() => validateReversalReason('')).toThrow('pelo menos 10');
    expect(() => validateReversalReason('        ')).toThrow('pelo menos 10');
    expect(() => validateReversalReason('123456789')).toThrow('pelo menos 10');
    expect(validateReversalReason('1234567890')).toBe('1234567890');
    expect(() => validateReversalReason('x'.repeat(501))).toThrow('500');
    expect(validateReversalReason('   motivo valido   ')).toBe('motivo valido');
  });

  it('#15-#20 helper de data valida YYYY-MM-DD, periodo/exercicio aberto e preserva dia civil', async () => {
    await expect(prisma.$transaction((tx) => validateOpenReversalDateTx(tx, CA, '2026-01-10'))).resolves.toMatchObject({ accountingPeriodId: ids.jan });
    expect(() => parseReversalDateInput('2026-02-30')).toThrow(ValidationError);
    await expect(prisma.$transaction((tx) => validateOpenReversalDateTx(tx, CA, '2026-01-31'))).resolves.toMatchObject({ accountingPeriodId: ids.jan });
    await expect(prisma.$transaction((tx) => validateOpenReversalDateTx(tx, CA, '2026-02-10'))).rejects.toBeInstanceOf(ConflictError);
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'CLOSED' } });
    await expect(prisma.$transaction((tx) => validateOpenReversalDateTx(tx, CA, '2026-01-10'))).rejects.toBeInstanceOf(ConflictError);
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'OPEN' } });
    expect(formatAccountingDate(parseReversalDateInput('2026-01-31'))).toBe('2026-01-31');
  });

  it('#21-#23 scopes novos e antigos sao reconhecidos e fingerprint canonico continua estavel', async () => {
    expect(OPERATION_IDEMPOTENCY_SCOPES).toContain('INVOICE_CANCEL');
    expect(OPERATION_IDEMPOTENCY_SCOPES).toContain('INVOICE_CREATE');
    const a = canonicalRequestFingerprint(FINGERPRINT_VERSION, { lines: [{ b: 2, a: 1 }, { a: 3 }], z: 'x' });
    const b = canonicalRequestFingerprint(FINGERPRINT_VERSION, { z: 'x', lines: [{ a: 3 }, { a: 1, b: 2 }] });
    expect(a).toBe(b);

    const key = randomUUID();
    const run = () => prisma.$transaction((tx) => runIdempotentOperation(tx, op, {
      scope: 'INVOICE_CANCEL',
      idempotencyKey: key,
      requestFingerprint: canonicalRequestFingerprint(FINGERPRINT_VERSION, { invoiceId: ids.invoiceA }),
      expectedResourceType: 'Invoice',
      loadExisting: (resourceId) => tx.invoice.findFirst({ where: { companyId: CA, id: resourceId }, select: { id: true } }),
      run: async () => ({ resourceType: 'Invoice', resourceId: ids.invoiceA, result: { id: ids.invoiceA } }),
    }));
    expect((await run()).idempotent).toBe(false);
    expect((await run()).idempotent).toBe(true);
  });

  it('#24-#32 reverseAccountingEventTx inverte linhas, preserva dimensoes e e deterministico', async () => {
    const { origin, posted } = await postEvent();
    const first = await prisma.$transaction((tx) => reverseAccountingEventTx(tx, op, { origin, reversalDate: '2026-01-20', reason: 'Motivo valido para estorno', operationalReference: 'DOC-RF' }));
    const [original, reversal, audit] = await Promise.all([
      prisma.journalEntry.findUnique({ where: { id: posted.id }, include: { lines: true } }),
      prisma.journalEntry.findUnique({ where: { id: first.reversalId }, include: { lines: true } }),
      prisma.auditLog.findFirst({ where: { companyId: CA, action: 'ACCOUNTING_EVENT_REVERSED', entityId: posted.id } }),
    ]);
    expect(original?.status).toBe('REVERSED');
    expect(reversal?.status).toBe('POSTED');
    expect(reversal?.reversalOfId).toBe(posted.id);
    expect(reversal?.reference).toBe('DOC-RF');
    expect(reversal?.entryDate.toISOString().slice(0, 10)).toBe('2026-01-20');
    expect(reversal?.lines.some((l) => l.ledgerAccountId === ids.cash && l.treasuryAccountId === ids.treasuryAccount && Number(l.credit) === 25)).toBe(true);
    expect(reversal?.lines.some((l) => l.ledgerAccountId === ids.revenue && Number(l.debit) === 25)).toBe(true);
    expect((audit?.newValues as { reason?: string; reversedById?: string } | null)?.reason).toBe('Motivo valido para estorno');
    expect((audit?.newValues as { reason?: string; reversedById?: string } | null)?.reversedById).toBe(op.userId);
    const again = await prisma.$transaction((tx) => reverseAccountingEventTx(tx, op, { origin, reversalDate: '2026-01-20', reason: 'Motivo valido para estorno' }));
    expect(again).toMatchObject({ reversalId: first.reversalId, created: false });
  });

  it('#31 concorrencia nao cria duas reversoes contabilisticas', async () => {
    const { origin, posted } = await postEvent();
    const [a, b] = await Promise.all([
      prisma.$transaction((tx) => reverseAccountingEventTx(tx, op, { origin, reversalDate: '2026-01-21', reason: 'Motivo concorrente valido' })),
      prisma.$transaction((tx) => reverseAccountingEventTx(tx, op, { origin, reversalDate: '2026-01-21', reason: 'Motivo concorrente valido' })),
    ]);
    expect(a.reversalId).toBe(b.reversalId);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, reversalOfId: posted.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, id: { in: [a.reversalId, b.reversalId] } } })).toBe(1);
  });

  it('#33-#35 createInvoice preenche StockMovement.invoiceId, emissao e recebimento continuam funcionais', async () => {
    const invoice = await createInvoice(prisma, op, { idempotencyKey: randomUUID(), issueDate: CURRENT_DATE, customerId: ids.customer, warehouseId: ids.warehouse, lines: [{ productId: ids.product, quantity: 1, discountPercent: 0 }] });
    const movement = await prisma.stockMovement.findFirst({ where: { companyId: CA, invoiceId: invoice.id } });
    expect(movement?.invoiceId).toBe(invoice.id);
    const payment = await createPayment(prisma, op, { idempotencyKey: randomUUID(), invoiceId: invoice.id, amount: 50, method: 'CASH', accountId: ids.treasuryAccount });
    expect(await prisma.payment.count({ where: { companyId: CA, id: payment.id, status: 'ACTIVE' } })).toBe(1);
  });

  it('#36 pagamento a fornecedor continua funcional e bloqueio P0-02 permanece activo', async () => {
    const po = await createPurchaseOrder(prisma, op, { supplierId: ids.supplier, warehouseId: ids.warehouse, lines: [{ productId: ids.product, quantity: 1, unitCost: 10 }] });
    const stored = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } });
    await receivePurchaseOrder(prisma, op, po.id, [{ lineId: stored.lines[0]!.id, quantity: 1 }], { idempotencyKey: randomUUID(), receiptDate: D('2026-01-10') });
    const payment = await createSupplierPayment(prisma, op, { idempotencyKey: randomUUID(), supplierId: ids.supplier, purchaseOrderId: po.id, amount: 5, method: 'CASH', accountId: ids.treasuryAccount });
    expect(await prisma.supplierPayment.count({ where: { companyId: CA, id: payment.id, status: 'ACTIVE' } })).toBe(1);
    const movement = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: payment.id } });
    await expect(reverseMovement(prisma, op, movement.id, 'tentativa directa')).rejects.toThrow('pagamento a fornecedor');
  });
});
