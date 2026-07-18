/**
 * Suite de INTEGRACAO da Sessao S7 — fluxo de aprovacao da Ordem de Compra.
 * Correr com: `pnpm test:integration:purchases:approval` (exige DATABASE_URL).
 *
 * Cobre: criacao em PENDING_APPROVAL sem efeitos, aprovacao com/sem permissao,
 * rejeicao com motivo obrigatorio (terminal), recepcao apenas de OCs aprovadas,
 * observacoes persistidas na recepcao e isolamento multiempresa A/B.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { approvePurchaseOrder, createPurchaseOrder, getPurchaseOrder, receivePurchaseOrder, rejectPurchaseOrder } from './purchases';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-po-approval';
const CB = 'smoke-po-approval-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[], userId = `${companyId}-user`): RequestContext {
  return { companyId, userId, permissions: new Set(permissions), isPlatformAdmin: false };
}

const requester = ctx(CA, ['purchases.create']);
const approver = ctx(CA, ['purchases.create', 'purchases.approve'], `${CA}-gestor`);
const noApprove = ctx(CA, ['purchases.create']);
const approverB = ctx(CB, ['purchases.create', 'purchases.approve']);

interface Ids {
  supplier: string;
  warehouse: string;
  product: string;
}

let ids!: Ids;

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.purchaseReceiptItem.deleteMany({ where: { companyId } });
  await prisma.purchaseReceipt.deleteMany({ where: { companyId } });
  await prisma.purchaseOrderLine.deleteMany({ where: { companyId } });
  await prisma.purchaseOrder.deleteMany({ where: { companyId } });
  await prisma.stockLevel.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.accountingMapping.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.fiscalYear.deleteMany({ where: { companyId } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: { gte: 2 } } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId } });
  await prisma.accountingJournal.deleteMany({ where: { companyId } });
  await prisma.documentCounter.deleteMany({ where: { companyId } });
  await prisma.supplier.deleteMany({ where: { companyId } });
  await prisma.userRole.deleteMany({ where: { user: { companyId } } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke PO Approval' } });
  await prisma.user.create({ data: { id: `${CA}-gestor`, companyId: CA, email: 'gestor@po-approval.test', passwordHash: 'x', name: 'Gestor Aprovador' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DC', name: 'Compras', journalType: 'PURCHASES', sequencePrefix: 'LC' } });

  const group = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '1', name: 'Activo', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1 } });
  const inventory = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '131', name: 'Mercadorias', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, parentId: group.id } });
  const vatInput = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '141', name: 'IVA dedutivel', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, parentId: group.id } });
  const payable = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '211', name: 'Fornecedores', accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 1 } });
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory.id },
      { companyId: CA, systemKey: 'VAT_INPUT', ledgerAccountId: vatInput.id },
      { companyId: CA, systemKey: 'ACCOUNTS_PAYABLE', ledgerAccountId: payable.id },
    ],
  });

  const supplier = await prisma.supplier.create({ data: { companyId: CA, name: 'Fornecedor Aprovacao' } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'POA', name: 'Produto Aprovacao', avgCost: 10, salePrice: 100, taxRate: 16 } });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke PO Approval B' } });

  ids = { supplier: supplier.id, warehouse: warehouse.id, product: product.id };
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

async function newOrder(quantity = 2, unitCost = 100) {
  const created = await createPurchaseOrder(prisma, requester, {
    supplierId: ids.supplier,
    warehouseId: ids.warehouse,
    lines: [{ productId: ids.product, quantity, unitCost }],
  });
  return prisma.purchaseOrder.findUniqueOrThrow({ where: { id: created.id }, include: { lines: { orderBy: { id: 'asc' } } } });
}

async function effectCounts() {
  const [stockMovements, journalEntries, receipts] = await Promise.all([
    prisma.stockMovement.count({ where: { companyId: CA } }),
    prisma.journalEntry.count({ where: { companyId: CA } }),
    prisma.purchaseReceipt.count({ where: { companyId: CA } }),
  ]);
  return { stockMovements, journalEntries, receipts };
}

describe('S7 — fluxo de aprovacao da Ordem de Compra', () => {
  it('#1 criacao entra em PENDING_APPROVAL, sem stock, lancamentos ou conta a pagar', async () => {
    const before = await effectCounts();
    const supplierBefore = await prisma.supplier.findUniqueOrThrow({ where: { id: ids.supplier } });
    const po = await newOrder();
    expect(po.status).toBe('PENDING_APPROVAL');
    expect(po.approvedById).toBeNull();
    expect(po.approvedAt).toBeNull();
    const after = await effectCounts();
    expect(after).toEqual(before);
    const supplierAfter = await prisma.supplier.findUniqueOrThrow({ where: { id: ids.supplier } });
    expect(Number(supplierAfter.balance)).toBe(Number(supplierBefore.balance));
  });

  it('#2 aprovar sem purchases.approve e rejeitado e o estado nao muda', async () => {
    const po = await newOrder();
    await expect(approvePurchaseOrder(prisma, noApprove, po.id)).rejects.toBeInstanceOf(ForbiddenError);
    const stored = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(stored.status).toBe('PENDING_APPROVAL');
  });

  it('#3 aprovar com permissao regista estado, snapshot do aprovador, auditoria e nenhum efeito transaccional', async () => {
    const before = await effectCounts();
    const po = await newOrder();
    const result = await approvePurchaseOrder(prisma, approver, po.id);
    expect(result.status).toBe('APPROVED');
    const stored = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(stored.status).toBe('APPROVED');
    expect(stored.approvedById).toBe(approver.userId);
    expect(stored.approvedByName).toBe('Gestor Aprovador');
    expect(stored.approvedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { companyId: CA, action: 'purchase.approve', entityId: po.id } });
    expect(audit).not.toBeNull();
    const after = await effectCounts();
    expect(after).toEqual(before);
  });

  it('#4 aprovar uma OC ja aprovada e rejeitado (replay limpo)', async () => {
    const po = await newOrder();
    await approvePurchaseOrder(prisma, approver, po.id);
    await expect(approvePurchaseOrder(prisma, approver, po.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('#5 recepcionar OC nao aprovada e rejeitado', async () => {
    const po = await newOrder();
    await expect(
      receivePurchaseOrder(prisma, requester, po.id, [{ lineId: po.lines[0]!.id, quantity: 1 }], { idempotencyKey: randomUUID() }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.purchaseReceipt.count({ where: { companyId: CA, purchaseOrderId: po.id } })).toBe(0);
  });

  it('#6 rejeicao exige motivo com pelo menos 10 caracteres', async () => {
    const po = await newOrder();
    await expect(rejectPurchaseOrder(prisma, approver, po.id, 'curto')).rejects.toBeInstanceOf(ValidationError);
    await expect(rejectPurchaseOrder(prisma, noApprove, po.id, 'Motivo valido de rejeicao')).rejects.toBeInstanceOf(ForbiddenError);
    const stored = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(stored.status).toBe('PENDING_APPROVAL');
  });

  it('#7 rejeicao valida e terminal: regista responsavel/motivo e bloqueia aprovacao e recepcao', async () => {
    const po = await newOrder();
    const result = await rejectPurchaseOrder(prisma, approver, po.id, 'Precos acima do orcamento aprovado');
    expect(result.status).toBe('REJECTED');
    const stored = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(stored.status).toBe('REJECTED');
    expect(stored.rejectedById).toBe(approver.userId);
    expect(stored.rejectedByName).toBe('Gestor Aprovador');
    expect(stored.rejectedAt).not.toBeNull();
    expect(stored.rejectionReason).toBe('Precos acima do orcamento aprovado');
    const audit = await prisma.auditLog.findFirst({ where: { companyId: CA, action: 'purchase.reject', entityId: po.id } });
    expect(audit?.reason).toBe('Precos acima do orcamento aprovado');
    await expect(approvePurchaseOrder(prisma, approver, po.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(rejectPurchaseOrder(prisma, approver, po.id, 'Rejeicao repetida da mesma OC')).rejects.toBeInstanceOf(ConflictError);
    await expect(
      receivePurchaseOrder(prisma, requester, po.id, [{ lineId: po.lines[0]!.id, quantity: 1 }], { idempotencyKey: randomUUID() }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('#8 OC aprovada e recepcionada com observacoes persistidas; parcial -> PARTIAL -> RECEIVED', async () => {
    const po = await newOrder(3, 50);
    await approvePurchaseOrder(prisma, approver, po.id);

    const partial = await receivePurchaseOrder(prisma, requester, po.id, [{ lineId: po.lines[0]!.id, quantity: 1 }], {
      idempotencyKey: randomUUID(),
      notes: 'Caixa exterior danificada; conferido com o motorista.',
    });
    const partialReceipt = await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: partial.id! } });
    expect(partialReceipt.notes).toBe('Caixa exterior danificada; conferido com o motorista.');
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe('PARTIAL');

    await receivePurchaseOrder(prisma, requester, po.id, [{ lineId: po.lines[0]!.id, quantity: 2 }], { idempotencyKey: randomUUID() });
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe('RECEIVED');
    expect(await prisma.stockMovement.count({ where: { companyId: CA, purchaseReceiptId: partial.id! } })).toBe(1);

    const detail = await getPurchaseOrder(prisma, requester, po.id);
    expect(detail.receipts.some((r) => r.notes === 'Caixa exterior danificada; conferido com o motorista.')).toBe(true);
  });

  it('#9 isolamento A/B: empresa B nao aprova, nao rejeita nem recepciona OC da empresa A', async () => {
    const po = await newOrder();
    await expect(approvePurchaseOrder(prisma, approverB, po.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(rejectPurchaseOrder(prisma, approverB, po.id, 'Tentativa de outra empresa')).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      receivePurchaseOrder(prisma, approverB, po.id, [{ lineId: po.lines[0]!.id, quantity: 1 }], { idempotencyKey: randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const stored = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(stored.status).toBe('PENDING_APPROVAL');
  });
});
