import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import type { RequestContext } from './context';
import { approvePurchaseOrder, createPurchaseOrder, createSupplierPayment, receivePurchaseOrder, reverseSupplierPayment, type SupplierPaymentInput } from './purchases';
import { reverseMovement } from './treasury';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-supplier-payment-reversal';
const CB = 'smoke-supplier-payment-reversal-b';
const CURRENT_DATE = civilDateInTimeZone();
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const op = ctx(CA, ['purchases.create', 'purchases.approve', 'supplierPayments.reverse']);
const noReverse = ctx(CA, ['purchases.create']);
const treasuryReverseCtx = ctx(CA, ['treasury.reverseMovement']);

interface Ids {
  fy: string;
  period: string;
  purchasesJournal: string;
  cashJournal: string;
  bankJournal: string;
  inventory: string;
  vatInput: string;
  payable: string;
  cashLedger: string;
  bankLedger: string;
  supplier: string;
  supplierB: string;
  warehouse: string;
  product: string;
  cashAccount: string;
  bankAccount: string;
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
  await prisma.supplierPayment.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
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
  await prisma.supplier.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function ledger(companyId: string, code: string, name: string, accountType: 'ASSET' | 'LIABILITY', normalBalance: 'DEBIT' | 'CREDIT', opts: { parentId?: string | null } = {}) {
  return prisma.ledgerAccount.create({
    data: { companyId, code, name, accountType, normalBalance, level: opts.parentId ? 2 : 1, parentId: opts.parentId ?? null },
  });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Supplier Payment Reversal' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const period = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  const purchasesJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DC', name: 'Compras', journalType: 'PURCHASES', sequencePrefix: 'LC' } });
  const cashJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' } });
  const bankJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DBC', name: 'Bancos', journalType: 'BANK', sequencePrefix: 'BC' } });

  const group = (await ledger(CA, '1', 'Activo', 'ASSET', 'DEBIT')).id;
  const inventory = (await ledger(CA, '131', 'Mercadorias', 'ASSET', 'DEBIT', { parentId: group })).id;
  const vatInput = (await ledger(CA, '141', 'IVA dedutivel', 'ASSET', 'DEBIT', { parentId: group })).id;
  const cashLedger = (await ledger(CA, '111', 'Caixa', 'ASSET', 'DEBIT', { parentId: group })).id;
  const bankLedger = (await ledger(CA, '112', 'Banco', 'ASSET', 'DEBIT', { parentId: group })).id;
  const payable = (await ledger(CA, '211', 'Fornecedores', 'LIABILITY', 'CREDIT')).id;

  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory },
      { companyId: CA, systemKey: 'VAT_INPUT', ledgerAccountId: vatInput },
      { companyId: CA, systemKey: 'ACCOUNTS_PAYABLE', ledgerAccountId: payable },
    ],
  });

  const supplier = await prisma.supplier.create({ data: { companyId: CA, name: 'Fornecedor Reversao' } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'SPR', name: 'Produto Reversao', avgCost: 10, salePrice: 100, taxRate: 16 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: product.id, warehouseId: warehouse.id, quantity: 10 } });
  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa', type: 'CASH', ledgerAccountId: cashLedger, balance: 1000, openingBalance: 1000 } });
  const bankAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Banco', type: 'BANK', ledgerAccountId: bankLedger, allowNegative: true, balance: 1000, openingBalance: 1000 } });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Supplier Payment Reversal B' } });
  const supplierB = await prisma.supplier.create({ data: { companyId: CB, name: 'Fornecedor B' } });

  ids = { fy: fy.id, period: period.id, purchasesJournal: purchasesJournal.id, cashJournal: cashJournal.id, bankJournal: bankJournal.id, inventory, vatInput, payable, cashLedger, bankLedger, supplier: supplier.id, supplierB: supplierB.id, warehouse: warehouse.id, product: product.id, cashAccount: cashAccount.id, bankAccount: bankAccount.id };
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

async function order(quantity = 2, unitCost = 100) {
  const created = await createPurchaseOrder(prisma, op, { supplierId: ids.supplier, warehouseId: ids.warehouse, lines: [{ productId: ids.product, quantity, unitCost }] });
  await approvePurchaseOrder(prisma, op, created.id);
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: created.id }, include: { lines: { orderBy: { id: 'asc' } } } });
  return po;
}

async function receive(po: Awaited<ReturnType<typeof order>>, quantity = 1) {
  return receivePurchaseOrder(prisma, op, po.id, [{ lineId: po.lines[0]!.id, quantity }], { idempotencyKey: randomUUID(), receiptDate: CURRENT_DATE });
}

async function payment(overrides: Partial<SupplierPaymentInput> = {}) {
  return createSupplierPayment(prisma, op, {
    idempotencyKey: randomUUID(),
    supplierId: ids.supplier,
    amount: 50,
    method: 'CASH',
    accountId: ids.cashAccount,
    ...overrides,
  });
}

async function reverse(paymentId: string, overrides: Partial<{ idempotencyKey: string; reversalReason: string; reversalDate: string }> = {}) {
  return reverseSupplierPayment(prisma, op, {
    supplierPaymentId: paymentId,
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    reversalReason: overrides.reversalReason ?? 'Motivo valido para estorno',
    reversalDate: overrides.reversalDate ?? CURRENT_DATE,
  });
}

describe('P0-03c - estorno integral de pagamento a fornecedor', () => {
  it('estorna SupplierPayment, Supplier, PurchaseOrder, Tesouraria, Contabilidade e Auditoria', async () => {
    const po = await order();
    await receive(po, 1);
    const pay = await payment({ purchaseOrderId: po.id, amount: 60, accountId: ids.cashAccount });
    const [paymentBefore, supplierBefore, orderBefore, accountBefore, originalMovement, originalEntry, stockBefore] = await Promise.all([
      prisma.supplierPayment.findUniqueOrThrow({ where: { id: pay.id } }),
      prisma.supplier.findUniqueOrThrow({ where: { id: ids.supplier } }),
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } }),
      prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.cashAccount } }),
      prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: pay.id, movementPurpose: 'SUPPLIER_PAYMENT_OUT' } }),
      prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: pay.id, accountingEvent: 'SUPPLIER_PAYMENT_POSTED' }, include: { lines: true } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.product, warehouseId: ids.warehouse } } }),
    ]);

    const result = await reverse(pay.id, { reversalReason: '  Motivo valido para estorno integral  ' });
    const [paymentAfter, supplierAfter, orderAfter, accountAfter, movementAfter, reversalMovement, entryAfter, reversalEntry, audit, stockAfter] = await Promise.all([
      prisma.supplierPayment.findUniqueOrThrow({ where: { id: pay.id } }),
      prisma.supplier.findUniqueOrThrow({ where: { id: ids.supplier } }),
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } }),
      prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.cashAccount } }),
      prisma.treasuryMovement.findUniqueOrThrow({ where: { id: originalMovement.id } }),
      prisma.treasuryMovement.findUniqueOrThrow({ where: { id: result.treasuryReversalId ?? '' } }),
      prisma.journalEntry.findUniqueOrThrow({ where: { id: originalEntry.id } }),
      prisma.journalEntry.findUniqueOrThrow({ where: { id: result.accountingReversalId ?? '' }, include: { lines: true } }),
      prisma.auditLog.findFirstOrThrow({ where: { companyId: CA, action: 'supplier.payment.reverse', entityId: pay.id } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.product, warehouseId: ids.warehouse } } }),
    ]);

    expect(paymentAfter.status).toBe('REVERSED');
    expect(paymentAfter.reversedAt).toBeTruthy();
    expect(paymentAfter.reversedById).toBe(op.userId);
    expect(paymentAfter.reversalReason).toBe('Motivo valido para estorno integral');
    expect(paymentAfter.number).toBe(paymentBefore.number);
    expect(paymentAfter.amount.toString()).toBe(paymentBefore.amount.toString());
    expect(Number(supplierAfter.balance)).toBe(Number(supplierBefore.balance) + 60);
    expect(Number(orderAfter.amountPaid)).toBe(0);
    expect(orderAfter.status).toBe(orderBefore.status);
    expect(orderAfter.lines[0]!.receivedQty).toBe(orderBefore.lines[0]!.receivedQty);
    expect(Number(accountAfter.balance)).toBe(Number(accountBefore.balance) + 60);
    expect(movementAfter.status).toBe('REVERSED');
    expect(reversalMovement.flow).toBe('IN');
    expect(reversalMovement.reversesId).toBe(originalMovement.id);
    expect(entryAfter.status).toBe('REVERSED');
    expect(reversalEntry.reversalOfId).toBe(originalEntry.id);
    expect(reversalEntry.lines.find((l) => l.ledgerAccountId === ids.cashLedger && l.treasuryAccountId === ids.cashAccount && Number(l.debit) === 60)).toBeTruthy();
    expect(reversalEntry.lines.find((l) => l.ledgerAccountId === ids.payable && l.supplierId === ids.supplier && Number(l.credit) === 60)).toBeTruthy();
    expect((audit.newValues as { treasuryMovementReversalId?: string; journalEntryReversalId?: string } | null)?.treasuryMovementReversalId).toBe(reversalMovement.id);
    expect((audit.newValues as { journalEntryReversalId?: string } | null)?.journalEntryReversalId).toBe(reversalEntry.id);
    expect(stockAfter.quantity).toBe(stockBefore.quantity);
  });

  it('preserva outros pagamentos activos e funciona sem PurchaseOrder', async () => {
    const po = await order();
    await receive(po, 2);
    const p1 = await payment({ purchaseOrderId: po.id, amount: 40 });
    const p2 = await payment({ purchaseOrderId: po.id, amount: 30 });
    await reverse(p1.id);
    expect(Number((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).amountPaid)).toBe(30);
    expect((await prisma.supplierPayment.findUniqueOrThrow({ where: { id: p2.id } })).status).toBe('ACTIVE');

    const beforeOrders = await prisma.purchaseOrder.findMany({ where: { companyId: CA }, select: { id: true, amountPaid: true } });
    const direct = await payment({ amount: 25, purchaseOrderId: undefined, accountId: ids.bankAccount });
    await reverse(direct.id);
    const afterOrders = await prisma.purchaseOrder.findMany({ where: { companyId: CA }, select: { id: true, amountPaid: true } });
    expect(afterOrders.map((o) => [o.id, o.amountPaid.toString()])).toEqual(beforeOrders.map((o) => [o.id, o.amountPaid.toString()]));
  });

  it('replay idempotente, conflito de fingerprint e nova chave para REVERSED', async () => {
    const po = await order();
    await receive(po, 1);
    const pay = await payment({ purchaseOrderId: po.id, amount: 50 });
    const key = randomUUID();
    const input = { supplierPaymentId: pay.id, idempotencyKey: key, reversalReason: 'Motivo valido concorrente', reversalDate: CURRENT_DATE };
    const [a, b] = await Promise.all([reverseSupplierPayment(prisma, op, input), reverseSupplierPayment(prisma, op, input)]);
    expect(a.id).toBe(b.id);
    const movement = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: pay.id, movementPurpose: 'SUPPLIER_PAYMENT_OUT' } });
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: pay.id, accountingEvent: 'SUPPLIER_PAYMENT_POSTED' } });
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, reversesId: movement.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, reversalOfId: entry.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'supplier.payment.reverse', entityId: pay.id } })).toBe(1);
    await expect(reverseSupplierPayment(prisma, op, { ...input, reversalReason: 'Motivo valido diferente' })).rejects.toBeInstanceOf(ConflictError);
    await expect(reverse(pay.id)).rejects.toThrow('Este pagamento a fornecedor já foi estornado.');
  });

  it('valida permissao, motivo, data civil e isolamento multiempresa', async () => {
    const po = await order();
    await receive(po, 1);
    const pay = await payment({ purchaseOrderId: po.id, amount: 50 });
    await expect(reverseSupplierPayment(prisma, noReverse, { supplierPaymentId: pay.id, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reverse(pay.id, { reversalReason: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverse(pay.id, { reversalReason: 'curto' })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverse(pay.id, { reversalReason: 'x'.repeat(501) })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverse(pay.id, { reversalDate: '2026-02-30' })).rejects.toBeInstanceOf(ValidationError);
    const otherDate = CURRENT_DATE === '2026-01-01' ? '2026-01-02' : '2026-01-01';
    await expect(reverse(pay.id, { reversalDate: otherDate })).rejects.toThrow('Africa/Maputo');
    await expect(reverse('missing-payment')).rejects.toBeInstanceOf(NotFoundError);
    const paymentB = await prisma.supplierPayment.create({ data: { companyId: CB, number: `PG B/${randomUUID()}`, supplierId: ids.supplierB, amount: 1 } });
    await expect(reverse(paymentB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('periodo/exercicio fechados, inconsistencias e faltas fazem rollback', async () => {
    const po1 = await order();
    await receive(po1, 1);
    const pay1 = await payment({ purchaseOrderId: po1.id, amount: 50 });
    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'CLOSED' } });
    await expect(reverse(pay1.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await prisma.supplierPayment.findUniqueOrThrow({ where: { id: pay1.id } })).status).toBe('ACTIVE');
    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'OPEN' } });

    const po2 = await order();
    await receive(po2, 1);
    const pay2 = await payment({ purchaseOrderId: po2.id, amount: 50 });
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'CLOSED' } });
    await expect(reverse(pay2.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await prisma.supplierPayment.findUniqueOrThrow({ where: { id: pay2.id } })).status).toBe('ACTIVE');
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'OPEN' } });

    const po3 = await order();
    await receive(po3, 1);
    const pay3 = await payment({ purchaseOrderId: po3.id, amount: 50 });
    await prisma.purchaseOrder.update({ where: { id: po3.id }, data: { amountPaid: 999 } });
    await expect(reverse(pay3.id)).rejects.toThrow('valor pago da ordem');
    expect((await prisma.supplierPayment.findUniqueOrThrow({ where: { id: pay3.id } })).status).toBe('ACTIVE');
  });

  it('falhas de Tesouraria ou Contabilidade fazem rollback sem auditoria de sucesso', async () => {
    const po1 = await order();
    await receive(po1, 1);
    const pay1 = await payment({ purchaseOrderId: po1.id, amount: 50 });
    const movement = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: pay1.id } });
    await prisma.treasuryMovement.delete({ where: { id: movement.id } });
    await expect(reverse(pay1.id)).rejects.toThrow('tesouraria');
    expect((await prisma.supplierPayment.findUniqueOrThrow({ where: { id: pay1.id } })).status).toBe('ACTIVE');
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'supplier.payment.reverse', entityId: pay1.id } })).toBe(0);

    const po2 = await order();
    await receive(po2, 1);
    const pay2 = await payment({ purchaseOrderId: po2.id, amount: 50 });
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: pay2.id } });
    const movement2 = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: pay2.id } });
    await prisma.journalEntryLine.deleteMany({ where: { companyId: CA, journalEntryId: entry.id } });
    await prisma.journalEntry.delete({ where: { id: entry.id } });
    await expect(reverse(pay2.id)).rejects.toThrow('contabil');
    expect((await prisma.supplierPayment.findUniqueOrThrow({ where: { id: pay2.id } })).status).toBe('ACTIVE');
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, reversesId: movement2.id } })).toBe(0);
  });

  it('P0-02 continua a bloquear estorno directo na Tesouraria', async () => {
    const po = await order();
    await receive(po, 1);
    const pay = await payment({ purchaseOrderId: po.id, amount: 40 });
    const movement = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: pay.id, movementPurpose: 'SUPPLIER_PAYMENT_OUT' } });
    await expect(reverseMovement(prisma, treasuryReverseCtx, movement.id)).rejects.toThrow('pagamento a fornecedor');
    await expect(reverseMovement(prisma, { ...treasuryReverseCtx, isPlatformAdmin: true }, movement.id)).rejects.toThrow('pagamento a fornecedor');
    expect((await prisma.treasuryMovement.findUniqueOrThrow({ where: { id: movement.id } })).status).toBe('ACTIVE');
  });
});
