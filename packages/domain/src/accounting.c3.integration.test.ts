/**
 * Suite de INTEGRACAO da Fase 8c.3 — fornecedores, recepcoes de compras e pagamentos.
 * Correr com: `pnpm test:integration:accounting:c3` (exige DATABASE_URL).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { createPurchaseOrder, createSupplierPayment, receivePurchaseOrder, type SupplierPaymentInput } from './purchases';
import { ConflictError, ForbiddenError, ValidationError } from './errors';

const CA = 'smoke-c3';
const CB = 'smoke-c3-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const purchaseCtx = ctx(CA, ['purchases.create']);

interface Ids {
  fy: string;
  jan: string;
  feb: string;
  purchasesJournal: string;
  cashJournal: string;
  bankJournal: string;
  inventory: string;
  vatInput: string;
  payable: string;
  cashLedger: string;
  bankLedger: string;
  mobileLedger: string;
  otherLedger: string;
  expenseLedger: string;
  inactiveLedger: string;
  groupLedger: string;
  supplier: string;
  warehouse: string;
  taxableProduct: string;
  exemptProduct: string;
  cashAccount: string;
  bankAccount: string;
  mobileAccount: string;
  otherAccount: string;
  inactiveAccount: string;
  bSupplier: string;
}

let ids!: Ids;

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
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
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function ledger(companyId: string, code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT', opts: { isPosting?: boolean; isActive?: boolean; parentId?: string | null } = {}) {
  return prisma.ledgerAccount.create({
    data: {
      companyId,
      code,
      name,
      accountType,
      normalBalance,
      level: opts.parentId ? 2 : 1,
      parentId: opts.parentId ?? null,
      isPosting: opts.isPosting ?? true,
      isActive: opts.isActive ?? true,
    },
  });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke C3' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const jan = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026-01', name: 'Jan 2026', startDate: D('2026-01-01'), endDate: D('2026-01-31'), status: 'OPEN' } });
  const feb = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 2, code: '2026-02', name: 'Fev 2026', startDate: D('2026-02-01'), endDate: D('2026-02-28'), status: 'CLOSED' } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 3, code: '2026-03-12', name: 'Mar-Dez 2026', startDate: D('2026-03-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  const purchasesJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DC', name: 'Compras', journalType: 'PURCHASES', sequencePrefix: 'LC' } });
  const cashJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' } });
  const bankJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DBC', name: 'Bancos', journalType: 'BANK', sequencePrefix: 'BC' } });

  const groupLedger = (await ledger(CA, '1', 'Activo', 'ASSET', 'DEBIT', { isPosting: false })).id;
  const inventory = (await ledger(CA, '131', 'Mercadorias', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const vatInput = (await ledger(CA, '141', 'IVA dedutivel', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const cashLedger = (await ledger(CA, '111', 'Caixa', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const bankLedger = (await ledger(CA, '112', 'Banco', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const mobileLedger = (await ledger(CA, '113', 'Mobile', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const otherLedger = (await ledger(CA, '119', 'Outro', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const inactiveLedger = (await ledger(CA, '198', 'Inactiva', 'ASSET', 'DEBIT', { parentId: groupLedger, isActive: false })).id;
  const payable = (await ledger(CA, '211', 'Fornecedores', 'LIABILITY', 'CREDIT')).id;
  const expenseLedger = (await ledger(CA, '611', 'Despesa', 'EXPENSE', 'DEBIT')).id;

  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory },
      { companyId: CA, systemKey: 'VAT_INPUT', ledgerAccountId: vatInput },
      { companyId: CA, systemKey: 'ACCOUNTS_PAYABLE', ledgerAccountId: payable },
    ],
  });

  const supplier = await prisma.supplier.create({ data: { companyId: CA, name: 'Fornecedor C3' } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const taxableProduct = await prisma.product.create({ data: { companyId: CA, sku: 'TAX', name: 'Produto IVA', avgCost: 10, salePrice: 100, taxRate: 16 } });
  const exemptProduct = await prisma.product.create({ data: { companyId: CA, sku: 'EXE', name: 'Produto Isento', avgCost: 5, salePrice: 50, taxRate: 0 } });
  await prisma.stockLevel.createMany({
    data: [
      { companyId: CA, productId: taxableProduct.id, warehouseId: warehouse.id, quantity: 10 },
      { companyId: CA, productId: exemptProduct.id, warehouseId: warehouse.id, quantity: 5 },
    ],
  });

  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa', type: 'CASH', ledgerAccountId: cashLedger, balance: 1000, openingBalance: 1000 } });
  const bankAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Banco', type: 'BANK', ledgerAccountId: bankLedger, allowNegative: true, balance: 1000, openingBalance: 1000 } });
  const mobileAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'M-Pesa', type: 'MOBILE', ledgerAccountId: mobileLedger, balance: 1000, openingBalance: 1000 } });
  const otherAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Outro', type: 'OTHER', ledgerAccountId: otherLedger, allowNegative: true, balance: 1000, openingBalance: 1000 } });
  const inactiveAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Inactiva', type: 'CASH', status: 'INACTIVE', balance: 1000, openingBalance: 1000 } });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke C3 B' } });
  const bSupplier = await prisma.supplier.create({ data: { companyId: CB, name: 'Fornecedor B' } });

  ids = {
    fy: fy.id,
    jan: jan.id,
    feb: feb.id,
    purchasesJournal: purchasesJournal.id,
    cashJournal: cashJournal.id,
    bankJournal: bankJournal.id,
    inventory,
    vatInput,
    payable,
    cashLedger,
    bankLedger,
    mobileLedger,
    otherLedger,
    expenseLedger,
    inactiveLedger,
    groupLedger,
    supplier: supplier.id,
    warehouse: warehouse.id,
    taxableProduct: taxableProduct.id,
    exemptProduct: exemptProduct.id,
    cashAccount: cashAccount.id,
    bankAccount: bankAccount.id,
    mobileAccount: mobileAccount.id,
    otherAccount: otherAccount.id,
    inactiveAccount: inactiveAccount.id,
    bSupplier: bSupplier.id,
  };
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

async function order(lines = [{ productId: ids.taxableProduct, quantity: 2, unitCost: 100 }]) {
  const created = await createPurchaseOrder(prisma, purchaseCtx, { supplierId: ids.supplier, warehouseId: ids.warehouse, lines });
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: created.id }, include: { lines: { orderBy: { id: 'asc' } } } });
  return po;
}

async function receiptFor(lineId: string, quantity: number, overrides: { idempotencyKey?: string; receiptDate?: Date } = {}) {
  const poLine = await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: lineId } });
  return receivePurchaseOrder(prisma, purchaseCtx, poLine.orderId, [{ lineId, quantity }], {
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    receiptDate: overrides.receiptDate ?? D('2026-01-10'),
  });
}

async function payment(overrides: Partial<SupplierPaymentInput> = {}, c: RequestContext = purchaseCtx) {
  return createSupplierPayment(prisma, c, {
    idempotencyKey: randomUUID(),
    supplierId: ids.supplier,
    amount: 50,
    method: 'CASH',
    accountId: ids.cashAccount,
    ...overrides,
  });
}

async function entryFor(sourceType: string, sourceId: string, accountingEvent: string) {
  return prisma.journalEntry.findFirst({
    where: { companyId: CA, sourceType, sourceId, accountingEvent },
    include: { lines: { orderBy: { lineNumber: 'asc' } }, journal: true },
  });
}

describe('Fase 8c.3 — recepcoes de compras e pagamentos a fornecedor', () => {
  it('#1 recepcao cria PurchaseReceipt, StockMovement ligado e lancamento PURCHASE_RECEIVED', async () => {
    const po = await order();
    const r = await receiptFor(po.lines[0]!.id, 1);
    const receipt = await prisma.purchaseReceipt.findUnique({ where: { id: r.id! }, include: { items: true } });
    const movement = await prisma.stockMovement.findFirst({ where: { companyId: CA, purchaseReceiptId: r.id } });
    const entry = await entryFor('PURCHASE_RECEIPT', r.id!, 'PURCHASE_RECEIVED');
    const supplier = await prisma.supplier.findUnique({ where: { id: ids.supplier } });

    expect(receipt?.receiptNumber).toBe(r.number);
    expect(receipt?.items).toHaveLength(1);
    expect(Number(receipt?.netAmount)).toBe(100);
    expect(Number(receipt?.taxAmount)).toBe(16);
    expect(Number(receipt?.totalAmount)).toBe(116);
    expect(movement?.purchaseReceiptId).toBe(receipt?.id);
    expect(entry?.journal.journalType).toBe('PURCHASES');
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.inventory && Number(l.debit) === 100)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.vatInput && Number(l.debit) === 16)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.payable && l.supplierId === ids.supplier && Number(l.credit) === 116)).toBeTruthy();
    expect(Number(supplier?.balance)).toBeGreaterThanOrEqual(116);
  });

  it('#2 duas recepcoes parciais da mesma OC geram duas identidades e dois lancamentos', async () => {
    const po = await order([{ productId: ids.taxableProduct, quantity: 2, unitCost: 20 }]);
    const a = await receiptFor(po.lines[0]!.id, 1);
    const b = await receiptFor(po.lines[0]!.id, 1);
    expect(a.id).not.toBe(b.id);
    expect(await prisma.purchaseReceipt.count({ where: { companyId: CA, purchaseOrderId: po.id } })).toBe(2);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'PURCHASE_RECEIPT', accountingEvent: 'PURCHASE_RECEIVED', sourceId: { in: [a.id!, b.id!] } } })).toBe(2);
    const updated = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(updated?.status).toBe('RECEIVED');
  });

  it('#3 recepcao isenta nao exige VAT_INPUT e nao cria linha zero', async () => {
    await prisma.accountingMapping.delete({ where: { companyId_systemKey: { companyId: CA, systemKey: 'VAT_INPUT' } } });
    const po = await order([{ productId: ids.exemptProduct, quantity: 1, unitCost: 30 }]);
    const r = await receiptFor(po.lines[0]!.id, 1);
    const entry = await entryFor('PURCHASE_RECEIPT', r.id!, 'PURCHASE_RECEIVED');
    expect(entry?.lines).toHaveLength(2);
    expect(entry?.lines.every((l) => (Number(l.debit) > 0) !== (Number(l.credit) > 0))).toBe(true);
    await prisma.accountingMapping.create({ data: { companyId: CA, systemKey: 'VAT_INPUT', ledgerAccountId: ids.vatInput } });
  });

  it('#4 idempotencia da recepcao evita duplo stock, dupla divida e duplo lancamento', async () => {
    const po = await order();
    const key = randomUUID();
    const input = [{ lineId: po.lines[0]!.id, quantity: 1 }];
    const [a, b] = await Promise.all([
      receivePurchaseOrder(prisma, purchaseCtx, po.id, input, { idempotencyKey: key, receiptDate: D('2026-01-10') }),
      receivePurchaseOrder(prisma, purchaseCtx, po.id, input, { idempotencyKey: key, receiptDate: D('2026-01-10') }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await prisma.purchaseReceipt.count({ where: { companyId: CA, id: a.id } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { companyId: CA, purchaseReceiptId: a.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'PURCHASE_RECEIPT', sourceId: a.id } })).toBe(1);
  });

  it('#5 fingerprint diferente na mesma chave de recepcao gera conflito', async () => {
    const po = await order();
    const key = randomUUID();
    await receivePurchaseOrder(prisma, purchaseCtx, po.id, [{ lineId: po.lines[0]!.id, quantity: 1 }], { idempotencyKey: key, receiptDate: D('2026-01-10') });
    await expect(receivePurchaseOrder(prisma, purchaseCtx, po.id, [{ lineId: po.lines[0]!.id, quantity: 2 }], { idempotencyKey: key, receiptDate: D('2026-01-10') })).rejects.toBeInstanceOf(ConflictError);
  });

  it('#6 quantidade acima da pendente e rejeitada', async () => {
    const po = await order([{ productId: ids.taxableProduct, quantity: 1, unitCost: 20 }]);
    await expect(
      receivePurchaseOrder(
        prisma,
        purchaseCtx,
        po.id,
        [{ lineId: po.lines[0]!.id, quantity: 2 }],
        { idempotencyKey: randomUUID(), receiptDate: D('2026-01-10') },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.purchaseReceipt.count({ where: { companyId: CA, purchaseOrderId: po.id } })).toBe(0);
  });

  it('#7 periodo fechado na data da recepcao faz rollback completo', async () => {
    const po = await order();
    const beforeReceipts = await prisma.purchaseReceipt.count({ where: { companyId: CA } });
    const beforeMovements = await prisma.stockMovement.count({ where: { companyId: CA } });
    await expect(receiptFor(po.lines[0]!.id, 1, { receiptDate: D('2026-02-10') })).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.purchaseReceipt.count({ where: { companyId: CA } })).toBe(beforeReceipts);
    expect(await prisma.stockMovement.count({ where: { companyId: CA } })).toBe(beforeMovements);
  });

  it('#8 mapping INVENTORY ausente faz rollback da recepcao', async () => {
    const po = await order();
    const before = await prisma.purchaseReceipt.count({ where: { companyId: CA } });
    await prisma.accountingMapping.delete({ where: { companyId_systemKey: { companyId: CA, systemKey: 'INVENTORY' } } });
    await expect(receiptFor(po.lines[0]!.id, 1)).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.purchaseReceipt.count({ where: { companyId: CA } })).toBe(before);
    await prisma.accountingMapping.create({ data: { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: ids.inventory } });
  });

  it('#9 ordem de compra sem recepcao nao gera lancamento', async () => {
    const po = await order();
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceId: po.id } })).toBe(0);
  });

  it('#10 pagamento parcial a fornecedor cria TreasuryMovement e SUPPLIER_PAYMENT_POSTED', async () => {
    const po = await order();
    await receiptFor(po.lines[0]!.id, 1);
    const p = await payment({ purchaseOrderId: po.id, amount: 40, accountId: ids.cashAccount });
    const movement = await prisma.treasuryMovement.findFirst({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: p.id, movementPurpose: 'SUPPLIER_PAYMENT_OUT' } });
    const entry = await entryFor('SUPPLIER_PAYMENT', p.id, 'SUPPLIER_PAYMENT_POSTED');
    expect(movement).toBeTruthy();
    expect(entry?.journal.journalType).toBe('CASH');
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.payable && l.supplierId === ids.supplier && Number(l.debit) === 40)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.cashLedger && l.treasuryAccountId === ids.cashAccount && Number(l.credit) === 40)).toBeTruthy();
  });

  it('#11 pagamento exige accountId e rejeita conta inactiva, sem mapping ou nao-ASSET', async () => {
    const po = await order();
    await receiptFor(po.lines[0]!.id, 1);
    await expect(payment({ purchaseOrderId: po.id, accountId: undefined } as Partial<SupplierPaymentInput>)).rejects.toBeInstanceOf(ValidationError);
    const noMap = await prisma.treasuryAccount.create({ data: { companyId: CA, name: `Sem map ${randomUUID()}`, type: 'CASH' } });
    await expect(payment({ purchaseOrderId: po.id, accountId: noMap.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(payment({ purchaseOrderId: po.id, accountId: ids.inactiveAccount })).rejects.toBeInstanceOf(ConflictError);
    const bad = await prisma.treasuryAccount.create({ data: { companyId: CA, name: `Despesa ${randomUUID()}`, type: 'CASH', ledgerAccountId: ids.expenseLedger } });
    await expect(payment({ purchaseOrderId: po.id, accountId: bad.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#12 CASH usa CASH; BANK e MOBILE usam BANK; OTHER rejeita', async () => {
    const po1 = await order();
    await receiptFor(po1.lines[0]!.id, 1);
    expect((await entryFor('SUPPLIER_PAYMENT', (await payment({ purchaseOrderId: po1.id, accountId: ids.cashAccount })).id, 'SUPPLIER_PAYMENT_POSTED'))?.journal.journalType).toBe('CASH');
    const po2 = await order();
    await receiptFor(po2.lines[0]!.id, 1);
    expect((await entryFor('SUPPLIER_PAYMENT', (await payment({ purchaseOrderId: po2.id, accountId: ids.bankAccount })).id, 'SUPPLIER_PAYMENT_POSTED'))?.journal.journalType).toBe('BANK');
    const po3 = await order();
    await receiptFor(po3.lines[0]!.id, 1);
    expect((await entryFor('SUPPLIER_PAYMENT', (await payment({ purchaseOrderId: po3.id, accountId: ids.mobileAccount })).id, 'SUPPLIER_PAYMENT_POSTED'))?.journal.journalType).toBe('BANK');
    const po4 = await order();
    await receiptFor(po4.lines[0]!.id, 1);
    await expect(payment({ purchaseOrderId: po4.id, accountId: ids.otherAccount })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#13 pagamento idempotente cria um SupplierPayment, um TreasuryMovement e um JournalEntry', async () => {
    const po = await order();
    await receiptFor(po.lines[0]!.id, 1);
    const key = randomUUID();
    const input: SupplierPaymentInput = { idempotencyKey: key, supplierId: ids.supplier, purchaseOrderId: po.id, amount: 30, method: 'CASH', accountId: ids.cashAccount };
    const [a, b] = await Promise.all([createSupplierPayment(prisma, purchaseCtx, input), createSupplierPayment(prisma, purchaseCtx, input)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.supplierPayment.count({ where: { companyId: CA, id: a.id } })).toBe(1);
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: a.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'SUPPLIER_PAYMENT', sourceId: a.id } })).toBe(1);
  });

  it('#14 pagamento acima da divida da ordem e conflito de fingerprint sao rejeitados', async () => {
    const po = await order();
    await receiptFor(po.lines[0]!.id, 1);
    await expect(payment({ purchaseOrderId: po.id, amount: 999999 })).rejects.toBeInstanceOf(ValidationError);
    const key = randomUUID();
    await payment({ idempotencyKey: key, purchaseOrderId: po.id, amount: 10 });
    await expect(payment({ idempotencyKey: key, purchaseOrderId: po.id, amount: 20 })).rejects.toBeInstanceOf(ConflictError);
  });

  it('#15 utilizador sem accounting.post consegue operar; sem purchases.create e rejeitado', async () => {
    const po = await order();
    await expect(receivePurchaseOrder(prisma, ctx(CA, ['purchases.create']), po.id, [{ lineId: po.lines[0]!.id, quantity: 1 }], { idempotencyKey: randomUUID(), receiptDate: D('2026-01-10') })).resolves.toBeTruthy();
    await expect(receivePurchaseOrder(prisma, ctx(CA, []), po.id, [{ lineId: po.lines[0]!.id, quantity: 1 }], { idempotencyKey: randomUUID(), receiptDate: D('2026-01-10') })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('#16 isolamento entre empresas bloqueia dados cross-company', async () => {
    await expect(createPurchaseOrder(prisma, purchaseCtx, { supplierId: ids.bSupplier, warehouseId: ids.warehouse, lines: [{ productId: ids.taxableProduct, quantity: 1, unitCost: 10 }] })).rejects.toBeTruthy();
  });
});
