/**
 * Suite de integração S10b — anulação ponta a ponta de Nota de Crédito.
 * Correr com: `pnpm test:integration:accounting:nc-cancel` (exige DATABASE_URL).
 * Isolada por empresas de teste (`smoke-s10b*`) e sem mutar a demo.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forCompany, prisma } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import type { RequestContext } from './context';
import { cancelInvoice, createInvoice, type InvoiceInput } from './invoices';
import { cancelCreditNote, createCreditNote, getCreditableLines, type CancelCreditNoteInput, type CreditNoteInput } from './commercial-documents';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-s10b';
const CB = 'smoke-s10b-b';
const TODAY = civilDateInTimeZone();
const YEAR = TODAY.slice(0, 4);
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const op = ctx(CA, ['sales.create', 'sales.view', 'invoices.cancel']);
const noCancel = ctx(CA, ['sales.create', 'sales.view']);
const bCtx = ctx(CB, ['sales.create', 'sales.view', 'invoices.cancel']);

let ids!: {
  ar: string;
  revenue: string;
  vat: string;
  inventory: string;
  cogs: string;
  customer: string;
  warehouse: string;
  product: string;
};

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.creditNoteLine.deleteMany({ where: { companyId } });
  await prisma.stockMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.creditNote.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { companyId } });
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
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke S10b' } });
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke S10b B' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: YEAR, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: `${YEAR}-01`, name: YEAR, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' } });

  const root = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '1', name: 'Activo', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: false } });
  const ar = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '121', name: 'Clientes', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, parentId: root.id, isPosting: true } });
  const inventory = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '131', name: 'Mercadorias', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, parentId: root.id, isPosting: true } });
  const vat = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '221', name: 'IVA liquidado', accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 1, isPosting: true } });
  const revenue = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '411', name: 'Vendas', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1, isPosting: true } });
  const cogs = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '511', name: 'CMV', accountType: 'EXPENSE', normalBalance: 'DEBIT', level: 1, isPosting: true } });
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar.id },
      { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue.id },
      { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: vat.id },
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory.id },
      { companyId: CA, systemKey: 'COST_OF_GOODS_SOLD', ledgerAccountId: cogs.id },
    ],
  });

  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente S10b', paymentTermDays: 0 } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'S10B-T', name: 'Produto S10b', salePrice: 100, taxRate: 16, avgCost: 60 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: product.id, warehouseId: warehouse.id, quantity: 1000 } });

  ids = { ar: ar.id, revenue: revenue.id, vat: vat.id, inventory: inventory.id, cogs: cogs.id, customer: customer.id, warehouse: warehouse.id, product: product.id };
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

async function issueInvoice(quantity: number, overrides: Partial<InvoiceInput> = {}) {
  return createInvoice(prisma, op, {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    customerId: ids.customer,
    warehouseId: ids.warehouse,
    lines: [{ productId: ids.product, quantity, discountPercent: 0 }],
    ...overrides,
  });
}

async function issueCreditNote(invoiceId: string, quantity: number, overrides: Partial<CreditNoteInput> = {}) {
  const line = await prisma.invoiceLine.findFirst({ where: { companyId: CA, invoiceId } });
  if (!line) throw new Error('linha da factura de teste em falta');
  return createCreditNote(prisma, op, {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    invoiceId,
    reason: 'Devolução de mercadoria',
    returnStock: true,
    lines: [{ invoiceLineId: line.id, quantity }],
    ...overrides,
  });
}

async function cancelNote(creditNoteId: string, overrides: Partial<CancelCreditNoteInput> = {}) {
  return cancelCreditNote(prisma, op, {
    creditNoteId,
    idempotencyKey: randomUUID(),
    cancellationReason: 'Motivo válido para anulação da NC',
    cancellationDate: TODAY,
    ...overrides,
  });
}

async function customerBalance(): Promise<number> {
  const c = await prisma.customer.findUnique({ where: { id: ids.customer } });
  return Number(c?.balance ?? 0);
}

async function stockQty(): Promise<number> {
  const level = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: ids.product, warehouseId: ids.warehouse } } });
  return level?.quantity ?? 0;
}

async function entryFor(sourceId: string, accountingEvent: string) {
  return prisma.journalEntry.findFirst({
    where: { companyId: CA, sourceType: 'CREDIT_NOTE', sourceId, accountingEvent },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });
}

describe('Sessão S10b — anulação de Nota de Crédito', () => {
  it('#1 NC com devolução: anulação reverte stock (OUT com reversesId), repõe saldo e estorna os DOIS eventos', async () => {
    const inv = await issueInvoice(5);
    const nc = await issueCreditNote(inv.id, 3); // devolve 3 → stock +3, saldo −348
    const balanceBefore = await customerBalance();
    const qtyBefore = await stockQty();

    const r = await cancelNote(nc.id);
    expect(r.stockReversalIds).toHaveLength(1);
    expect(r.accountingReversalId).toBeTruthy();
    expect(r.cogsReversalId).toBeTruthy();

    // Saldo: emissão da NC tirou 348 (3 × 100 × 1.16); a anulação repõe.
    expect(await customerBalance()).toBeCloseTo(balanceBefore + 348, 2);
    // Stock: os 3 devolvidos voltam a sair.
    expect(await stockQty()).toBe(qtyBefore - 3);

    // OUT compensatório ligado ao IN da devolução, com creditNoteId.
    const originalIn = await prisma.stockMovement.findFirst({ where: { companyId: CA, creditNoteId: nc.id, type: 'IN' } });
    const reversalOut = await prisma.stockMovement.findFirst({ where: { companyId: CA, reversesId: originalIn?.id } });
    expect(reversalOut?.type).toBe('OUT');
    expect(reversalOut?.quantity).toBe(-3);
    expect(reversalOut?.creditNoteId).toBe(nc.id);
    expect(reversalOut?.reason).toContain('Anulação da nota de crédito');

    // Estorno simétrico dos dois lançamentos, por verdade histórica.
    const issued = await entryFor(nc.id, 'CREDIT_NOTE_ISSUED');
    const cogsPair = await entryFor(nc.id, 'CREDIT_NOTE_COGS_REVERSED');
    expect(issued?.status).toBe('REVERSED');
    expect(cogsPair?.status).toBe('REVERSED');
    const issuedReversal = await prisma.journalEntry.findFirst({ where: { companyId: CA, reversalOfId: issued?.id }, include: { lines: true } });
    const cogsReversal = await prisma.journalEntry.findFirst({ where: { companyId: CA, reversalOfId: cogsPair?.id }, include: { lines: true } });
    // Espelho invertido: D Clientes (total) / C Vendas (base) + C IVA.
    expect(issuedReversal?.lines.find((l) => l.ledgerAccountId === ids.ar && Number(l.debit) === 348 && l.customerId === ids.customer)).toBeTruthy();
    expect(issuedReversal?.lines.find((l) => l.ledgerAccountId === ids.revenue && Number(l.credit) === 300)).toBeTruthy();
    expect(issuedReversal?.lines.find((l) => l.ledgerAccountId === ids.vat && Number(l.credit) === 48)).toBeTruthy();
    // Par do CMV invertido: D CMV / C Mercadorias ao snapshot 60 × 3 = 180.
    expect(cogsReversal?.lines.find((l) => l.ledgerAccountId === ids.cogs && Number(l.debit) === 180)).toBeTruthy();
    expect(cogsReversal?.lines.find((l) => l.ledgerAccountId === ids.inventory && Number(l.credit) === 180)).toBeTruthy();

    // NC nunca se apaga: fica CANCELLED com quem/quando/porquê.
    const after = await prisma.creditNote.findUnique({ where: { id: nc.id } });
    expect(after?.status).toBe('CANCELLED');
    expect(after?.cancelledById).toBe(op.userId);
    expect(after?.cancelledAt).toBeTruthy();
    expect(after?.cancellationReason).toBe('Motivo válido para anulação da NC');

    // Auditoria da operação.
    const audit = await prisma.auditLog.findFirst({ where: { companyId: CA, action: 'credit_note.cancel', entityId: nc.id } });
    expect(audit).toBeTruthy();
  });

  it('#2 custo médio do produto fica intacto na anulação', async () => {
    const inv = await issueInvoice(2);
    const nc = await issueCreditNote(inv.id, 2);
    await cancelNote(nc.id);
    const product = await prisma.product.findUnique({ where: { id: ids.product } });
    expect(Number(product?.avgCost)).toBe(60);
  });

  it('#3 NC sem devolução: um único estorno, sem movimentos de stock', async () => {
    const inv = await issueInvoice(2);
    const nc = await issueCreditNote(inv.id, 1, { returnStock: false });
    const movBefore = await prisma.stockMovement.count({ where: { companyId: CA } });
    const balanceBefore = await customerBalance();

    const r = await cancelNote(nc.id);
    expect(r.stockReversalIds).toHaveLength(0);
    expect(r.cogsReversalId).toBeNull();
    expect(await prisma.stockMovement.count({ where: { companyId: CA } })).toBe(movBefore);
    expect(await customerBalance()).toBeCloseTo(balanceBefore + 116, 2);
    expect(await entryFor(nc.id, 'CREDIT_NOTE_COGS_REVERSED')).toBeNull();
  });

  it('#4 CRÍTICO: devolução entretanto vendida → falha por inteiro com mensagem clara, nada alterado', async () => {
    // Produto dedicado com stock curto para controlar a insuficiência.
    const scarce = await prisma.product.create({ data: { companyId: CA, sku: 'S10B-S', name: 'Produto Escasso', salePrice: 100, taxRate: 16, avgCost: 60 } });
    await prisma.stockLevel.create({ data: { companyId: CA, productId: scarce.id, warehouseId: ids.warehouse, quantity: 5 } });

    const inv = await issueInvoice(5, { lines: [{ productId: scarce.id, quantity: 5, discountPercent: 0 }] }); // stock 0
    const nc = await issueCreditNote(inv.id, 5); // devolve 5 → stock 5
    await issueInvoice(3, { lines: [{ productId: scarce.id, quantity: 3, discountPercent: 0 }] }); // vende 3 → stock 2

    const balanceBefore = await customerBalance();
    const jeBefore = await prisma.journalEntry.count({ where: { companyId: CA } });
    const movBefore = await prisma.stockMovement.count({ where: { companyId: CA } });

    await expect(cancelNote(nc.id)).rejects.toThrowError(/já saiu de armazém.*devolvido 5, disponível 2.*Nada foi alterado/s);

    // Rollback total: NC continua emitida, saldo/stock/lançamentos intactos.
    const after = await prisma.creditNote.findUnique({ where: { id: nc.id } });
    expect(after?.status).toBe('ISSUED');
    expect(await customerBalance()).toBeCloseTo(balanceBefore, 2);
    expect(await prisma.journalEntry.count({ where: { companyId: CA } })).toBe(jeBefore);
    expect(await prisma.stockMovement.count({ where: { companyId: CA } })).toBe(movBefore);
    const level = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: scarce.id, warehouseId: ids.warehouse } } });
    expect(level?.quantity).toBe(2);
    const issued = await entryFor(nc.id, 'CREDIT_NOTE_ISSUED');
    expect(issued?.status).toBe('POSTED');
  });

  it('#5 desbloqueio: factura com NC anulada volta a ser cancelável (guard indica o caminho antes)', async () => {
    const inv = await issueInvoice(2);
    const nc = await issueCreditNote(inv.id, 1);

    // Antes: o guard bloqueia e indica a NC a anular.
    await expect(
      cancelInvoice(prisma, op, { invoiceId: inv.id, idempotencyKey: randomUUID(), cancellationReason: 'Cancelamento com NC emitida', cancellationDate: TODAY }),
    ).rejects.toThrowError(new RegExp(`Anule primeiro.*${nc.number.replace('/', '\\/')}|${nc.number.replace('/', '\\/')}.*Anule primeiro`, 's'));

    // Depois de anular a NC, o cancelamento integral passa.
    await cancelNote(nc.id);
    const r = await cancelInvoice(prisma, op, { invoiceId: inv.id, idempotencyKey: randomUUID(), cancellationReason: 'Cancelamento após anulação da NC', cancellationDate: TODAY });
    expect(r.id).toBe(inv.id);
    const after = await prisma.invoice.findUnique({ where: { id: inv.id }, select: { status: true } });
    expect(after?.status).toBe('CANCELLED');
  });

  it('#6 NC anulada liberta o tecto de crédito da factura', async () => {
    const inv = await issueInvoice(4);
    const nc = await issueCreditNote(inv.id, 4);
    let creditable = await getCreditableLines(forCompany(CA), op, inv.id);
    expect(creditable.lines[0]?.availableQty).toBe(0);
    await cancelNote(nc.id);
    creditable = await getCreditableLines(forCompany(CA), op, inv.id);
    expect(creditable.lines[0]?.availableQty).toBe(4);
  });

  it('#7 idempotência: replay com a mesma chave devolve o mesmo resultado sem duplicar efeitos', async () => {
    const inv = await issueInvoice(2);
    const nc = await issueCreditNote(inv.id, 2);
    const key = randomUUID();
    const balanceBefore = await customerBalance();

    const first = await cancelNote(nc.id, { idempotencyKey: key });
    const replay = await cancelNote(nc.id, { idempotencyKey: key });
    expect(replay.id).toBe(first.id);
    expect(replay.accountingReversalId).toBe(first.accountingReversalId);
    expect(replay.cogsReversalId).toBe(first.cogsReversalId);
    expect(replay.stockReversalIds.sort()).toEqual(first.stockReversalIds.sort());
    // Efeitos aplicados UMA vez.
    expect(await customerBalance()).toBeCloseTo(balanceBefore + 232, 2);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, reversalOfId: { not: null }, reference: nc.number } })).toBe(2);

    // Mesma chave com payload diferente → conflito de fingerprint.
    await expect(cancelNote(nc.id, { idempotencyKey: key, cancellationReason: 'Outro motivo válido diferente' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('#8 segunda anulação com chave nova é rejeitada (já anulada)', async () => {
    const inv = await issueInvoice(1);
    const nc = await issueCreditNote(inv.id, 1);
    await cancelNote(nc.id);
    await expect(cancelNote(nc.id)).rejects.toThrowError(/já foi anulada/);
  });

  it('#9 motivo obrigatório ≥ 10 caracteres e data tem de ser a actual', async () => {
    const inv = await issueInvoice(1);
    const nc = await issueCreditNote(inv.id, 1);
    await expect(cancelNote(nc.id, { cancellationReason: 'curto' })).rejects.toBeInstanceOf(ValidationError);
    await expect(cancelNote(nc.id, { cancellationDate: `${Number(YEAR) - 1}-01-01` })).rejects.toBeInstanceOf(ValidationError);
    const after = await prisma.creditNote.findUnique({ where: { id: nc.id } });
    expect(after?.status).toBe('ISSUED');
    await cancelNote(nc.id); // deixa o cenário limpo e prova que nada ficou meio-anulado
  });

  it('#10 permissões: sem invoices.cancel é proibido', async () => {
    const inv = await issueInvoice(1);
    const nc = await issueCreditNote(inv.id, 1);
    await expect(cancelCreditNote(prisma, noCancel, { creditNoteId: nc.id, idempotencyKey: randomUUID(), cancellationReason: 'Motivo válido para anulação', cancellationDate: TODAY })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('#11 isolamento multiempresa: empresa B não anula NC da empresa A', async () => {
    const inv = await issueInvoice(1);
    const nc = await issueCreditNote(inv.id, 1);
    await expect(cancelCreditNote(prisma, bCtx, { creditNoteId: nc.id, idempotencyKey: randomUUID(), cancellationReason: 'Motivo válido para anulação', cancellationDate: TODAY })).rejects.toBeInstanceOf(NotFoundError);
    const after = await prisma.creditNote.findUnique({ where: { id: nc.id } });
    expect(after?.status).toBe('ISSUED');
  });

  it('#12 estornos ficam equilibrados (débito = crédito) e referenciam a NC', async () => {
    const inv = await issueInvoice(3);
    const nc = await issueCreditNote(inv.id, 3);
    await cancelNote(nc.id);
    const reversals = await prisma.journalEntry.findMany({ where: { companyId: CA, reversalOfId: { not: null }, reference: nc.number } });
    expect(reversals).toHaveLength(2);
    for (const r of reversals) {
      expect(Number(r.totalDebit)).toBeCloseTo(Number(r.totalCredit), 2);
      expect(r.status).toBe('POSTED');
    }
  });
});
