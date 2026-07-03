import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import type { RequestContext } from './context';
import { createPurchaseOrder, createSupplierPayment, receivePurchaseOrder, reversePurchaseReceipt, reverseSupplierPayment, type SupplierPaymentInput } from './purchases';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-purchase-receipt-reversal';
const CB = 'smoke-purchase-receipt-reversal-b';
const CURRENT_DATE = civilDateInTimeZone();
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const op = ctx(CA, ['purchases.create', 'purchaseReceipts.reverse', 'supplierPayments.reverse']);
const noReverse = ctx(CA, ['purchases.create']);

interface Ids {
  fy: string;
  period: string;
  purchasesJournal: string;
  cashJournal: string;
  inventory: string;
  vatInput: string;
  payable: string;
  cashLedger: string;
  supplier: string;
  supplierB: string;
  warehouse: string;
  warehouseB: string;
  product: string;
  cashAccount: string;
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
  await prisma.stockMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
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
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Purchase Receipt Reversal' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const period = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  const purchasesJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DC', name: 'Compras', journalType: 'PURCHASES', sequencePrefix: 'LC' } });
  const cashJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' } });

  const group = (await ledger(CA, '1', 'Activo', 'ASSET', 'DEBIT')).id;
  const inventory = (await ledger(CA, '131', 'Mercadorias', 'ASSET', 'DEBIT', { parentId: group })).id;
  const vatInput = (await ledger(CA, '141', 'IVA dedutivel', 'ASSET', 'DEBIT', { parentId: group })).id;
  const cashLedger = (await ledger(CA, '111', 'Caixa', 'ASSET', 'DEBIT', { parentId: group })).id;
  const payable = (await ledger(CA, '211', 'Fornecedores', 'LIABILITY', 'CREDIT')).id;

  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory },
      { companyId: CA, systemKey: 'VAT_INPUT', ledgerAccountId: vatInput },
      { companyId: CA, systemKey: 'ACCOUNTS_PAYABLE', ledgerAccountId: payable },
    ],
  });

  const supplier = await prisma.supplier.create({ data: { companyId: CA, name: 'Fornecedor Recepcao' } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'PRR', name: 'Produto Recepcao', avgCost: 10, salePrice: 100, taxRate: 16 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: product.id, warehouseId: warehouse.id, quantity: 10 } });
  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa', type: 'CASH', ledgerAccountId: cashLedger, balance: 1000, openingBalance: 1000 } });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Purchase Receipt Reversal B' } });
  const supplierB = await prisma.supplier.create({ data: { companyId: CB, name: 'Fornecedor B' } });
  const warehouseB = await prisma.warehouse.create({ data: { companyId: CB, code: 'ARMB', name: 'Armazem B' } });
  const productB = await prisma.product.create({ data: { companyId: CB, sku: 'PRRB', name: 'Produto B', avgCost: 1, salePrice: 1, taxRate: 0 } });
  const poB = await prisma.purchaseOrder.create({ data: { companyId: CB, number: 'OC B/1', supplierId: supplierB.id, supplierName: supplierB.name, warehouseId: warehouseB.id, subtotal: 1, taxTotal: 0, total: 1 } });
  await prisma.purchaseOrderLine.create({ data: { companyId: CB, orderId: poB.id, productId: productB.id, description: productB.name, unitCost: 1, quantity: 1, taxRate: 0, total: 1 } });

  ids = { fy: fy.id, period: period.id, purchasesJournal: purchasesJournal.id, cashJournal: cashJournal.id, inventory, vatInput, payable, cashLedger, supplier: supplier.id, supplierB: supplierB.id, warehouse: warehouse.id, warehouseB: warehouseB.id, product: product.id, cashAccount: cashAccount.id };
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

async function makeProduct(stockQty = 10, avgCost = 10) {
  const product = await prisma.product.create({ data: { companyId: CA, sku: `PRR-${randomUUID()}`, name: `Produto ${randomUUID()}`, avgCost, salePrice: 100, taxRate: 16 } });
  if (stockQty > 0) await prisma.stockLevel.create({ data: { companyId: CA, productId: product.id, warehouseId: ids.warehouse, quantity: stockQty } });
  return product;
}

async function order(overrides: { productId?: string; quantity?: number; unitCost?: number } = {}) {
  const created = await createPurchaseOrder(prisma, op, {
    supplierId: ids.supplier,
    warehouseId: ids.warehouse,
    lines: [{ productId: overrides.productId ?? ids.product, quantity: overrides.quantity ?? 2, unitCost: overrides.unitCost ?? 100 }],
  });
  return prisma.purchaseOrder.findUniqueOrThrow({ where: { id: created.id }, include: { lines: { orderBy: { id: 'asc' } } } });
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

async function reverseReceipt(receiptId: string, overrides: Partial<{ idempotencyKey: string; reversalReason: string; reversalDate: string }> = {}) {
  return reversePurchaseReceipt(prisma, op, {
    purchaseReceiptId: receiptId,
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    reversalReason: overrides.reversalReason ?? 'Motivo valido para estorno',
    reversalDate: overrides.reversalDate ?? CURRENT_DATE,
  });
}

describe('P0-03d - estorno integral de recepcao de compra', () => {
  it('estorna PurchaseReceipt, stock, PurchaseOrder, Supplier, avgCost, Contabilidade e Auditoria', async () => {
    const po = await order({ quantity: 2, unitCost: 100 });
    const receiptResult = await receive(po, 1);
    const [receiptBefore, supplierBefore, productBefore, levelBefore, originalMovement, originalEntry] = await Promise.all([
      prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receiptResult.id! }, include: { items: true } }),
      prisma.supplier.findUniqueOrThrow({ where: { id: ids.supplier } }),
      prisma.product.findUniqueOrThrow({ where: { id: ids.product } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.product, warehouseId: ids.warehouse } } }),
      prisma.stockMovement.findFirstOrThrow({ where: { companyId: CA, purchaseReceiptId: receiptResult.id, type: 'IN' } }),
      prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'PURCHASE_RECEIPT', sourceId: receiptResult.id, accountingEvent: 'PURCHASE_RECEIVED' }, include: { lines: true } }),
    ]);

    const result = await reverseReceipt(receiptResult.id!, { reversalReason: '  Motivo valido para estorno integral  ' });
    const [receiptAfter, orderAfter, supplierAfter, productAfter, levelAfter, reversalMovement, entryAfter, reversalEntry, audit] = await Promise.all([
      prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receiptResult.id! }, include: { items: true } }),
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } }),
      prisma.supplier.findUniqueOrThrow({ where: { id: ids.supplier } }),
      prisma.product.findUniqueOrThrow({ where: { id: ids.product } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.product, warehouseId: ids.warehouse } } }),
      prisma.stockMovement.findUniqueOrThrow({ where: { id: result.stockReversalIds[0]! } }),
      prisma.journalEntry.findUniqueOrThrow({ where: { id: originalEntry.id } }),
      prisma.journalEntry.findUniqueOrThrow({ where: { id: result.accountingReversalId ?? '' }, include: { lines: true } }),
      prisma.auditLog.findFirstOrThrow({ where: { companyId: CA, action: 'purchase.receipt.reverse', entityId: receiptResult.id } }),
    ]);

    expect(receiptAfter.status).toBe('REVERSED');
    expect(receiptAfter.reversedAt).toBeTruthy();
    expect(receiptAfter.reversedById).toBe(op.userId);
    expect(receiptAfter.reversalReason).toBe('Motivo valido para estorno integral');
    expect(receiptAfter.receiptNumber).toBe(receiptBefore.receiptNumber);
    expect(receiptAfter.items).toHaveLength(receiptBefore.items.length);
    expect(reversalMovement.type).toBe('OUT');
    expect(reversalMovement.quantity).toBe(-originalMovement.quantity);
    expect(reversalMovement.reversesId).toBe(originalMovement.id);
    expect(reversalMovement.purchaseReceiptId).toBe(receiptBefore.id);
    expect(levelAfter.quantity).toBe(levelBefore.quantity - originalMovement.quantity);
    expect(Number(orderAfter.receivedValue)).toBe(0);
    expect(orderAfter.status).toBe('SENT');
    expect(orderAfter.lines[0]!.receivedQty).toBe(0);
    expect(Number(supplierAfter.balance)).toBe(Number(supplierBefore.balance) - Number(receiptBefore.totalAmount));
    expect(Number(productAfter.avgCost)).toBe(10);
    expect(Number(productBefore.avgCost)).toBeGreaterThan(Number(productAfter.avgCost));
    expect(entryAfter.status).toBe('REVERSED');
    expect(reversalEntry.reversalOfId).toBe(originalEntry.id);
    expect(reversalEntry.lines.find((l) => l.ledgerAccountId === ids.payable && l.supplierId === ids.supplier && Number(l.debit) === 116)).toBeTruthy();
    expect(reversalEntry.lines.find((l) => l.ledgerAccountId === ids.inventory && Number(l.credit) === 100)).toBeTruthy();
    expect(reversalEntry.lines.find((l) => l.ledgerAccountId === ids.vatInput && Number(l.credit) === 16)).toBeTruthy();
    expect((audit.newValues as { stockMovementReversalIds?: string[]; journalEntryReversalId?: string } | null)?.stockMovementReversalIds).toContain(reversalMovement.id);
    expect((audit.newValues as { journalEntryReversalId?: string } | null)?.journalEntryReversalId).toBe(reversalEntry.id);
  });

  it('estorna a recepcao mais recente e preserva recepcoes ACTIVE anteriores', async () => {
    const po = await order({ quantity: 2, unitCost: 80 });
    const first = await receive(po, 1);
    const second = await receive(po, 1);
    await reverseReceipt(second.id!);

    const [firstReceipt, secondReceipt, orderAfter] = await Promise.all([
      prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: first.id! } }),
      prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: second.id! } }),
      prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } }),
    ]);
    expect(firstReceipt.status).toBe('ACTIVE');
    expect(secondReceipt.status).toBe('REVERSED');
    expect(orderAfter.lines[0]!.receivedQty).toBe(1);
    expect(Number(orderAfter.receivedValue)).toBe(92.8);
    expect(orderAfter.status).toBe('PARTIAL');
  });

  it('bloqueia SupplierPayment ACTIVE e permite depois de estornar o pagamento', async () => {
    const po = await order({ quantity: 1, unitCost: 100 });
    const receipt = await receive(po, 1);
    const pay = await payment({ purchaseOrderId: po.id, amount: 50 });

    await expect(reverseReceipt(receipt.id!)).rejects.toThrow('pagamentos activos relacionados');
    expect((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id! } })).status).toBe('ACTIVE');

    await reverseSupplierPayment(prisma, op, {
      supplierPaymentId: pay.id,
      idempotencyKey: randomUUID(),
      reversalReason: 'Motivo valido para estorno do pagamento',
      reversalDate: CURRENT_DATE,
    });
    await expect(reverseReceipt(receipt.id!)).resolves.toBeTruthy();
  });

  it('bloqueia stock insuficiente e movimentos posteriores sem efeitos parciais', async () => {
    const productA = await makeProduct(10, 10);
    const poA = await order({ productId: productA.id, quantity: 1, unitCost: 100 });
    const receiptA = await receive(poA, 1);
    await prisma.stockLevel.update({ where: { productId_warehouseId: { productId: productA.id, warehouseId: ids.warehouse } }, data: { quantity: 0 } });
    await expect(reverseReceipt(receiptA.id!)).rejects.toThrow('stock suficiente');
    expect((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receiptA.id! } })).status).toBe('ACTIVE');
    expect(await prisma.stockMovement.count({ where: { companyId: CA, reversesId: { not: null }, purchaseReceiptId: receiptA.id } })).toBe(0);

    const productB = await makeProduct(10, 10);
    const poB = await order({ productId: productB.id, quantity: 1, unitCost: 100 });
    const receiptB = await receive(poB, 1);
    const levelB = await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: productB.id, warehouseId: ids.warehouse } } });
    await prisma.stockLevel.update({ where: { productId_warehouseId: { productId: productB.id, warehouseId: ids.warehouse } }, data: { quantity: levelB.quantity + 1 } });
    await prisma.stockMovement.create({ data: { companyId: CA, productId: productB.id, warehouseId: ids.warehouse, type: 'ADJUST', quantity: 1, balanceAfter: levelB.quantity + 1, document: 'AJUSTE', reason: 'Movimento posterior' } });
    await expect(reverseReceipt(receiptB.id!)).rejects.toThrow('utilização posterior de stock');
    expect((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receiptB.id! } })).status).toBe('ACTIVE');
  });

  it('bloqueia custo medio quando nao ha base anterior segura para reconstruir', async () => {
    const product = await makeProduct(0, 0);
    const po = await order({ productId: product.id, quantity: 1, unitCost: 75 });
    const receipt = await receive(po, 1);
    await expect(reverseReceipt(receipt.id!)).rejects.toThrow('utilização posterior de stock');
    expect((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id! } })).status).toBe('ACTIVE');
  });

  it('replay idempotente, conflito de fingerprint e nova chave para REVERSED', async () => {
    const po = await order({ quantity: 1, unitCost: 100 });
    const receipt = await receive(po, 1);
    const key = randomUUID();
    const input = { purchaseReceiptId: receipt.id!, idempotencyKey: key, reversalReason: 'Motivo valido concorrente', reversalDate: CURRENT_DATE };
    const [a, b] = await Promise.all([reversePurchaseReceipt(prisma, op, input), reversePurchaseReceipt(prisma, op, input)]);
    expect(a.id).toBe(b.id);
    const originalMovement = await prisma.stockMovement.findFirstOrThrow({ where: { companyId: CA, purchaseReceiptId: receipt.id, type: 'IN' } });
    const originalEntry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'PURCHASE_RECEIPT', sourceId: receipt.id, accountingEvent: 'PURCHASE_RECEIVED' } });
    expect(await prisma.stockMovement.count({ where: { companyId: CA, reversesId: originalMovement.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, reversalOfId: originalEntry.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'purchase.receipt.reverse', entityId: receipt.id } })).toBe(1);
    await expect(reversePurchaseReceipt(prisma, op, { ...input, reversalReason: 'Motivo valido diferente' })).rejects.toBeInstanceOf(ConflictError);
    await expect(reverseReceipt(receipt.id!)).rejects.toThrow('Esta recepção já foi estornada.');
  });

  it('valida permissao, motivo, data civil, periodo aberto e isolamento multiempresa', async () => {
    const po = await order({ quantity: 1, unitCost: 100 });
    const receipt = await receive(po, 1);
    await expect(reversePurchaseReceipt(prisma, noReverse, { purchaseReceiptId: receipt.id!, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reverseReceipt(receipt.id!, { reversalReason: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverseReceipt(receipt.id!, { reversalReason: 'curto' })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverseReceipt(receipt.id!, { reversalReason: 'x'.repeat(501) })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverseReceipt(receipt.id!, { reversalDate: '2026-02-30' })).rejects.toBeInstanceOf(ValidationError);
    const otherDate = CURRENT_DATE === '2026-01-01' ? '2026-01-02' : '2026-01-01';
    await expect(reverseReceipt(receipt.id!, { reversalDate: otherDate })).rejects.toThrow('Africa/Maputo');
    await expect(reverseReceipt('missing-receipt')).rejects.toBeInstanceOf(NotFoundError);

    const receiptB = await prisma.purchaseReceipt.create({ data: { companyId: CB, purchaseOrderId: (await prisma.purchaseOrder.findFirstOrThrow({ where: { companyId: CB } })).id, supplierId: ids.supplierB, warehouseId: ids.warehouseB, receiptNumber: `GR B/${randomUUID()}`, receiptDate: D('2026-01-01'), netAmount: 1, taxAmount: 0, totalAmount: 1 } });
    await expect(reverseReceipt(receiptB.id)).rejects.toBeInstanceOf(NotFoundError);

    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'CLOSED' } });
    await expect(reverseReceipt(receipt.id!)).rejects.toBeInstanceOf(ConflictError);
    expect((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id! } })).status).toBe('ACTIVE');
    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'OPEN' } });
  });

  it('falhas de movimento original ou lancamento contabilistico fazem rollback sem auditoria de sucesso', async () => {
    const po1 = await order({ quantity: 1, unitCost: 100 });
    const receipt1 = await receive(po1, 1);
    const movement = await prisma.stockMovement.findFirstOrThrow({ where: { companyId: CA, purchaseReceiptId: receipt1.id, type: 'IN' } });
    await prisma.stockMovement.delete({ where: { id: movement.id } });
    await expect(reverseReceipt(receipt1.id!)).rejects.toThrow('movimentos de stock');
    expect((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt1.id! } })).status).toBe('ACTIVE');
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'purchase.receipt.reverse', entityId: receipt1.id } })).toBe(0);

    const po2 = await order({ quantity: 1, unitCost: 100 });
    const receipt2 = await receive(po2, 1);
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'PURCHASE_RECEIPT', sourceId: receipt2.id } });
    await prisma.journalEntryLine.deleteMany({ where: { companyId: CA, journalEntryId: entry.id } });
    await prisma.journalEntry.delete({ where: { id: entry.id } });
    await expect(reverseReceipt(receipt2.id!)).rejects.toThrow('lançamento contabilístico');
    expect((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt2.id! } })).status).toBe('ACTIVE');
    expect(await prisma.stockMovement.count({ where: { companyId: CA, reversesId: { not: null }, purchaseReceiptId: receipt2.id } })).toBe(0);
  });
});
