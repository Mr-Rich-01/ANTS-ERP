/**
 * Suite de INTEGRACAO da Sessão S6 — Melhorias na Fatura (rascunhos, histórico, cancelamento).
 * Correr com: `pnpm test:integration:invoices:drafts` (exige DATABASE_URL).
 * Isolada por empresas de teste (`smoke-s6*`) e sem mutar a demo.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forCompany, prisma } from '@ants/database';
import { civilDateInTimeZone, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import {
  cancelInvoice,
  createInvoice,
  createPayment,
  discardInvoiceDraft,
  getCustomerStatement,
  getInvoiceDraftForEdit,
  getInvoiceHistory,
  invoiceKpis,
  issueInvoiceDraft,
  saveInvoiceDraft,
  updateInvoiceDraft,
  type InvoiceInput,
} from './invoices';
import { createCreditNote } from './commercial-documents';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-s6';
const CB = 'smoke-s6-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const TODAY = civilDateInTimeZone();
const YEAR = TODAY.slice(0, 4);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const salesCtx = ctx(CA, ['sales.create', 'sales.view']);
const fullCtx = ctx(CA, ['sales.create', 'sales.view', 'payments.receive', 'invoices.cancel', 'clients.view']);
const viewOnlyCtx = ctx(CA, ['sales.view', 'clients.view']);
const bCtx = ctx(CB, ['sales.create', 'sales.view']);

interface Ids {
  customer: string;
  warehouse: string;
  product: string;
  scarceProduct: string;
  treasuryAccount: string;
  bCustomer: string;
}

let ids!: Ids;
let demoBaseline!: { invoices: number; journalEntries: number; stockMovements: number };

async function demoCounts() {
  const [invoices, journalEntries, stockMovements] = await Promise.all([
    prisma.invoice.count({ where: { companyId: 'demo-company' } }),
    prisma.journalEntry.count({ where: { companyId: 'demo-company' } }),
    prisma.stockMovement.count({ where: { companyId: 'demo-company' } }),
  ]);
  return { invoices, journalEntries, stockMovements };
}

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.creditNoteLine.deleteMany({ where: { companyId } });
  await prisma.creditNote.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
  await prisma.stockMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { companyId } });
  await prisma.stockLevel.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.treasuryAccount.deleteMany({ where: { companyId } });
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
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke S6' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: YEAR, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: `${YEAR}-01`, name: YEAR, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DC', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'LC' } });

  const ar = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '121', name: 'Clientes', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: true, isActive: true } });
  const vat = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '221', name: 'IVA liquidado', accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 1, isPosting: true, isActive: true } });
  const revenue = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '411', name: 'Vendas', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1, isPosting: true, isActive: true } });
  const cash = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '111', name: 'Caixa', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: true, isActive: true } });
  // S10a: a emissão passou a lançar CMV — as vendas exigem os mappings de existências.
  const inventory = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '131', name: 'Mercadorias', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: true, isActive: true } });
  const cogs = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '511', name: 'CMV', accountType: 'EXPENSE', normalBalance: 'DEBIT', level: 1, isPosting: true, isActive: true } });

  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar.id },
      { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue.id },
      { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: vat.id },
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory.id },
      { companyId: CA, systemKey: 'COST_OF_GOODS_SOLD', ledgerAccountId: cogs.id },
    ],
  });

  const treasuryAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa Principal', type: 'CASH', ledgerAccountId: cash.id } });

  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente S6', paymentTermDays: 0 } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'S6P', name: 'Produto S6', salePrice: 100, taxRate: 16, avgCost: 60 } });
  const scarceProduct = await prisma.product.create({ data: { companyId: CA, sku: 'S6E', name: 'Produto Escasso', salePrice: 40, taxRate: 16, avgCost: 25 } });
  await prisma.stockLevel.createMany({
    data: [
      { companyId: CA, productId: product.id, warehouseId: warehouse.id, quantity: 1000 },
      { companyId: CA, productId: scarceProduct.id, warehouseId: warehouse.id, quantity: 3 },
    ],
  });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke S6 B' } });
  const bCustomer = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B' } });

  ids = { customer: customer.id, warehouse: warehouse.id, product: product.id, scarceProduct: scarceProduct.id, treasuryAccount: treasuryAccount.id, bCustomer: bCustomer.id };
}

beforeAll(async () => {
  demoBaseline = await demoCounts();
  await teardown(CA);
  await teardown(CB);
  await provision();
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  expect(await demoCounts()).toEqual(demoBaseline);
  await prisma.$disconnect();
});

function draftInput(overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    customerId: ids.customer,
    warehouseId: ids.warehouse,
    lines: [{ productId: ids.product, quantity: 5, discountPercent: 0 }],
    ...overrides,
  };
}

async function ftCounter(): Promise<number> {
  const counter = await prisma.documentCounter.findFirst({ where: { companyId: CA, key: `FT-${YEAR}` } });
  return counter?.value ?? 0;
}

async function stockOf(productId: string): Promise<number> {
  const level = await prisma.stockLevel.findFirst({ where: { companyId: CA, productId, warehouseId: ids.warehouse } });
  return level?.quantity ?? 0;
}

async function balanceOf(): Promise<number> {
  const customer = await prisma.customer.findFirst({ where: { companyId: CA, id: ids.customer } });
  return round2(Number(customer?.balance ?? 0));
}

describe('S6 — rascunhos de factura', () => {
  it('grava rascunho sem efeitos: sem stock, sem saldo, sem contabilidade, sem número FT', async () => {
    const stockBefore = await stockOf(ids.product);
    const balanceBefore = await balanceOf();
    const ftBefore = await ftCounter();

    const draft = await saveInvoiceDraft(prisma, salesCtx, draftInput());
    expect(draft.number).toBe(`RASC ${YEAR}/0001`);

    const row = await prisma.invoice.findFirst({ where: { companyId: CA, id: draft.id } });
    expect(row?.status).toBe('DRAFT');
    expect(row?.draftNumber).toBe(draft.number);

    expect(await stockOf(ids.product)).toBe(stockBefore);
    expect(await balanceOf()).toBe(balanceBefore);
    expect(await ftCounter()).toBe(ftBefore);
    expect(await prisma.stockMovement.count({ where: { companyId: CA, invoiceId: draft.id } })).toBe(0);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: draft.id } })).toBe(0);

    const audit = await prisma.auditLog.findFirst({ where: { companyId: CA, entity: 'Invoice', entityId: draft.id, action: 'invoice.draft.create' } });
    expect(audit).not.toBeNull();

    (globalThis as Record<string, unknown>).__s6DraftId = draft.id;
  });

  it('replay idempotente da gravação devolve o mesmo rascunho', async () => {
    const key = randomUUID();
    const input = draftInput({ idempotencyKey: key });
    const first = await saveInvoiceDraft(prisma, salesCtx, input);
    const before = await prisma.invoice.count({ where: { companyId: CA } });
    const replay = await saveInvoiceDraft(prisma, salesCtx, input);
    expect(replay).toEqual(first);
    expect(await prisma.invoice.count({ where: { companyId: CA } })).toBe(before);
    await discardInvoiceDraft(prisma, salesCtx, { draftId: first.id, reason: 'Rascunho auxiliar de teste de replay' });
  });

  it('edita o rascunho: linhas substituídas, totais recalculados, auditoria escrita, ainda sem efeitos', async () => {
    const draftId = (globalThis as Record<string, unknown>).__s6DraftId as string;
    const stockBefore = await stockOf(ids.product);

    await updateInvoiceDraft(prisma, salesCtx, {
      draftId,
      customerId: ids.customer,
      warehouseId: ids.warehouse,
      lines: [{ productId: ids.product, quantity: 2, discountPercent: 0 }],
      notes: 'Editado no teste',
    });

    const row = await prisma.invoice.findFirst({ where: { companyId: CA, id: draftId }, include: { lines: true } });
    expect(row?.lines).toHaveLength(1);
    expect(row?.lines[0]?.quantity).toBe(2);
    expect(round2(Number(row?.total ?? 0))).toBe(round2(2 * 100 * 1.16));
    expect(row?.notes).toBe('Editado no teste');
    expect(await stockOf(ids.product)).toBe(stockBefore);

    const audit = await prisma.auditLog.findFirst({ where: { companyId: CA, entity: 'Invoice', entityId: draftId, action: 'invoice.draft.update' } });
    expect(audit).not.toBeNull();
  });

  it('não permite recibo, NC nem cancelamento sobre um rascunho', async () => {
    const draftId = (globalThis as Record<string, unknown>).__s6DraftId as string;
    await expect(
      createPayment(prisma, fullCtx, { idempotencyKey: randomUUID(), invoiceId: draftId, amount: 10, method: 'CASH', accountId: ids.treasuryAccount }),
    ).rejects.toBeInstanceOf(ConflictError);
    const line = await prisma.invoiceLine.findFirst({ where: { companyId: CA, invoiceId: draftId } });
    await expect(
      createCreditNote(prisma, salesCtx, { idempotencyKey: randomUUID(), issueDate: TODAY, invoiceId: draftId, reason: 'Teste rascunho NC', lines: [{ invoiceLineId: line!.id, quantity: 1 }] }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      cancelInvoice(prisma, fullCtx, { invoiceId: draftId, idempotencyKey: randomUUID(), cancellationReason: 'Cancelar rascunho não permitido', cancellationDate: TODAY }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rascunho fica fora dos KPIs e do extracto do cliente', async () => {
    const dbA = forCompany(CA);
    const kpis = await invoiceKpis(dbA, salesCtx);
    const statement = await getCustomerStatement(dbA, fullCtx, ids.customer);
    const draftDocs = statement.rows.filter((r) => r.doc.startsWith('RASC'));
    expect(draftDocs).toHaveLength(0);
    // Nenhuma factura activa ainda nesta empresa de teste: KPIs a zero apesar do rascunho existir.
    expect(kpis.count).toBe(0);
    expect(kpis.invoiced).toBe(0);
  });

  it('emite o rascunho consumindo o número FT seguinte, sem buracos na série', async () => {
    const draftId = (globalThis as Record<string, unknown>).__s6DraftId as string;
    const a = await createInvoice(prisma, salesCtx, draftInput({ lines: [{ productId: ids.product, quantity: 1, discountPercent: 0 }] }));
    const b = await createInvoice(prisma, salesCtx, draftInput({ lines: [{ productId: ids.product, quantity: 1, discountPercent: 0 }] }));

    const stockBefore = await stockOf(ids.product);
    const balanceBefore = await balanceOf();

    const issued = await issueInvoiceDraft(prisma, salesCtx, { draftId, idempotencyKey: randomUUID(), issueDate: TODAY });

    const seq = (n: string) => Number(n.split('/')[1]);
    expect(seq(b.number)).toBe(seq(a.number) + 1);
    expect(seq(issued.number)).toBe(seq(b.number) + 1);
    expect(issued.number.startsWith('FT ')).toBe(true);

    const row = await prisma.invoice.findFirst({ where: { companyId: CA, id: draftId } });
    expect(row?.status).toBe('ISSUED');
    expect(row?.number).toBe(issued.number);
    expect(row?.draftNumber).toBe(`RASC ${YEAR}/0001`);

    // Efeitos completos: stock, saldo do cliente e lançamento SALE_ISSUED.
    expect(await stockOf(ids.product)).toBe(stockBefore - 2);
    expect(await balanceOf()).toBe(round2(balanceBefore + 2 * 100 * 1.16));
    const entries = await prisma.journalEntry.findMany({
      where: { companyId: CA, sourceType: 'INVOICE', sourceId: draftId, accountingEvent: 'SALE_ISSUED' },
      include: { lines: true },
    });
    expect(entries).toHaveLength(1);
    const totalDebit = round2(entries[0]!.lines.reduce((s, l) => s + Number(l.debit), 0));
    const totalCredit = round2(entries[0]!.lines.reduce((s, l) => s + Number(l.credit), 0));
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(round2(2 * 100 * 1.16));
    expect(await prisma.stockMovement.count({ where: { companyId: CA, invoiceId: draftId, type: 'OUT' } })).toBe(1);
  });

  it('replay idempotente da emissão não duplica efeitos nem números', async () => {
    const stockBefore = await stockOf(ids.product);
    const ftBefore = await ftCounter();
    const key = randomUUID();
    const draft = await saveInvoiceDraft(prisma, salesCtx, draftInput({ lines: [{ productId: ids.product, quantity: 3, discountPercent: 0 }] }));
    const first = await issueInvoiceDraft(prisma, salesCtx, { draftId: draft.id, idempotencyKey: key, issueDate: TODAY });
    const replay = await issueInvoiceDraft(prisma, salesCtx, { draftId: draft.id, idempotencyKey: key, issueDate: TODAY });
    expect(replay).toEqual(first);
    expect(await stockOf(ids.product)).toBe(stockBefore - 3);
    expect(await ftCounter()).toBe(ftBefore + 1);
    // S10a: a emissão lança receita (SALE_ISSUED) + CMV (COGS_POSTED) — um de cada, sem duplicados no replay.
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: draft.id, accountingEvent: 'SALE_ISSUED' } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: draft.id, accountingEvent: 'COGS_POSTED' } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { companyId: CA, invoiceId: draft.id } })).toBe(1);
  });

  it('a emissão valida o stock à data (rascunho nunca bloqueou stock)', async () => {
    const draft = await saveInvoiceDraft(prisma, salesCtx, draftInput({ lines: [{ productId: ids.scarceProduct, quantity: 10, discountPercent: 0 }] }));
    const ftBefore = await ftCounter();
    await expect(issueInvoiceDraft(prisma, salesCtx, { draftId: draft.id, idempotencyKey: randomUUID(), issueDate: TODAY })).rejects.toBeInstanceOf(ValidationError);
    const row = await prisma.invoice.findFirst({ where: { companyId: CA, id: draft.id } });
    expect(row?.status).toBe('DRAFT');
    // Falha antes de consumir número: sem buraco na série FT.
    expect(await ftCounter()).toBe(ftBefore);
    await discardInvoiceDraft(prisma, salesCtx, { draftId: draft.id, reason: 'Rascunho de teste sem stock disponível' });
  });

  it('descarta rascunho com motivo/utilizador/data-hora obrigatórios, sem estorno', async () => {
    const draft = await saveInvoiceDraft(prisma, salesCtx, draftInput());
    await expect(discardInvoiceDraft(prisma, salesCtx, { draftId: draft.id, reason: 'curto' })).rejects.toBeInstanceOf(ValidationError);
    await discardInvoiceDraft(prisma, salesCtx, { draftId: draft.id, reason: 'Rascunho duplicado — descartado no teste' });

    const row = await prisma.invoice.findFirst({ where: { companyId: CA, id: draft.id } });
    expect(row?.status).toBe('CANCELLED');
    expect(row?.cancelledById).toBe(`${CA}-user`);
    expect(row?.cancelledAt).not.toBeNull();
    expect(row?.cancellationReason).toBe('Rascunho duplicado — descartado no teste');
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: draft.id } })).toBe(0);
    expect(await prisma.stockMovement.count({ where: { companyId: CA, invoiceId: draft.id } })).toBe(0);

    await expect(discardInvoiceDraft(prisma, salesCtx, { draftId: draft.id, reason: 'Descartar duas vezes deve falhar' })).rejects.toBeInstanceOf(ConflictError);
    await expect(issueInvoiceDraft(prisma, salesCtx, { draftId: draft.id, idempotencyKey: randomUUID(), issueDate: TODAY })).rejects.toBeInstanceOf(ConflictError);
  });

  it('cancelar factura emitida com recibo activo bloqueia; após anulação do recibo segue', async () => {
    const invoice = await createInvoice(prisma, salesCtx, draftInput({ lines: [{ productId: ids.product, quantity: 1, discountPercent: 0 }] }));
    await createPayment(prisma, fullCtx, { idempotencyKey: randomUUID(), invoiceId: invoice.id, amount: 116, method: 'CASH', accountId: ids.treasuryAccount });
    await expect(
      cancelInvoice(prisma, fullCtx, { invoiceId: invoice.id, idempotencyKey: randomUUID(), cancellationReason: 'Cancelamento com recibo activo', cancellationDate: TODAY }),
    ).rejects.toThrow(/recebimentos activos/);
  });

  it('estorno do cancelamento é idempotente (um único lançamento inverso e uma reposição)', async () => {
    const stockBefore = await stockOf(ids.product);
    const balanceBefore = await balanceOf();
    const invoice = await createInvoice(prisma, salesCtx, draftInput({ lines: [{ productId: ids.product, quantity: 4, discountPercent: 0 }] }));
    const key = randomUUID();
    const first = await cancelInvoice(prisma, fullCtx, { invoiceId: invoice.id, idempotencyKey: key, cancellationReason: 'Cancelamento de teste idempotente', cancellationDate: TODAY });
    const replay = await cancelInvoice(prisma, fullCtx, { invoiceId: invoice.id, idempotencyKey: key, cancellationReason: 'Cancelamento de teste idempotente', cancellationDate: TODAY });
    expect(replay).toEqual(first);

    // Stock e saldo repostos exactamente uma vez.
    expect(await stockOf(ids.product)).toBe(stockBefore);
    expect(await balanceOf()).toBe(balanceBefore);
    const original = await prisma.journalEntry.findFirst({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: invoice.id, accountingEvent: 'SALE_ISSUED' } });
    expect(await prisma.journalEntry.count({ where: { companyId: CA, reversalOfId: original!.id } })).toBe(1);
    const outs = await prisma.stockMovement.findMany({ where: { companyId: CA, invoiceId: invoice.id, type: 'OUT' } });
    expect(await prisma.stockMovement.count({ where: { companyId: CA, reversesId: { in: outs.map((m) => m.id) } } })).toBe(1);
  });

  it('histórico da factura regista criação, edição, emissão e transições', async () => {
    const draftId = (globalThis as Record<string, unknown>).__s6DraftId as string;
    const history = await getInvoiceHistory(prisma, salesCtx, draftId);
    const actions = history.map((h) => h.action);
    expect(actions).toContain('invoice.draft.create');
    expect(actions).toContain('invoice.draft.update');
    expect(actions).toContain('invoice.issue');
    const issueEntry = history.find((h) => h.action === 'invoice.issue');
    expect(issueEntry?.details).toMatch(/rascunho RASC/);
  });

  it('isolamento multiempresa e permissões', async () => {
    const draft = await saveInvoiceDraft(prisma, salesCtx, draftInput());
    await expect(getInvoiceDraftForEdit(prisma, bCtx, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(issueInvoiceDraft(prisma, bCtx, { draftId: draft.id, idempotencyKey: randomUUID(), issueDate: TODAY })).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveInvoiceDraft(prisma, viewOnlyCtx, draftInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(discardInvoiceDraft(prisma, viewOnlyCtx, { draftId: draft.id, reason: 'Sem permissão para descartar' })).rejects.toBeInstanceOf(ForbiddenError);
    await discardInvoiceDraft(prisma, salesCtx, { draftId: draft.id, reason: 'Limpeza do rascunho de isolamento' });
  });
});
