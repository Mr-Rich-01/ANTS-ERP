/**
 * Suite de INTEGRACAO da Sessão S5 — Documentos Comerciais (Cotação, NC, ND).
 * Correr com: `pnpm test:integration:documents` (exige DATABASE_URL).
 * Isolada por empresas de teste (`smoke-s5*`) e sem mutar a demo.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forCompany, prisma } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import type { RequestContext } from './context';
import { cancelInvoice, createInvoice, getCustomerStatement, type InvoiceInput } from './invoices';
import {
  createCreditNote,
  createDebitNote,
  createQuotation,
  getCreditableLines,
  type CreditNoteInput,
  type DebitNoteInput,
  type QuotationInput,
} from './commercial-documents';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-s5';
const CB = 'smoke-s5-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const TODAY = civilDateInTimeZone();
const YEAR = TODAY.slice(0, 4);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const salesCtx = ctx(CA, ['sales.create', 'sales.view']);
const viewOnlyCtx = ctx(CA, ['sales.view', 'clients.view']);
const bCtx = ctx(CB, ['sales.create', 'sales.view']);

interface Ids {
  ar: string;
  revenue: string;
  vat: string;
  customer: string;
  warehouse: string;
  taxableProduct: string;
  exemptProduct: string;
  bCustomer: string;
}

let ids!: Ids;
let demoBaseline!: { invoices: number; journalEntries: number; quotations: number; creditNotes: number; debitNotes: number };

async function demoCounts() {
  const [invoices, journalEntries, quotations, creditNotes, debitNotes] = await Promise.all([
    prisma.invoice.count({ where: { companyId: 'demo-company' } }),
    prisma.journalEntry.count({ where: { companyId: 'demo-company' } }),
    prisma.quotation.count({ where: { companyId: 'demo-company' } }),
    prisma.creditNote.count({ where: { companyId: 'demo-company' } }),
    prisma.debitNote.count({ where: { companyId: 'demo-company' } }),
  ]);
  return { invoices, journalEntries, quotations, creditNotes, debitNotes };
}

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.creditNoteLine.deleteMany({ where: { companyId } });
  await prisma.creditNote.deleteMany({ where: { companyId } });
  await prisma.debitNoteLine.deleteMany({ where: { companyId } });
  await prisma.debitNote.deleteMany({ where: { companyId } });
  await prisma.quotationLine.deleteMany({ where: { companyId } });
  await prisma.quotation.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
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
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke S5' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: YEAR, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: `${YEAR}-01`, name: YEAR, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' } });

  const group = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '1', name: 'Activo', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: false, isActive: true } });
  const ar = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '121', name: 'Clientes', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, parentId: group.id, isPosting: true, isActive: true } });
  const vat = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '221', name: 'IVA liquidado', accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 1, isPosting: true, isActive: true } });
  const revenue = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '411', name: 'Vendas', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1, isPosting: true, isActive: true } });

  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar.id },
      { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue.id },
      { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: vat.id },
    ],
  });

  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente S5', paymentTermDays: 0 } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const taxableProduct = await prisma.product.create({ data: { companyId: CA, sku: 'TAX', name: 'Produto IVA', salePrice: 100, taxRate: 16, avgCost: 60 } });
  const exemptProduct = await prisma.product.create({ data: { companyId: CA, sku: 'EXE', name: 'Produto Isento', salePrice: 50, taxRate: 0, avgCost: 20 } });
  await prisma.stockLevel.createMany({
    data: [
      { companyId: CA, productId: taxableProduct.id, warehouseId: warehouse.id, quantity: 1000 },
      { companyId: CA, productId: exemptProduct.id, warehouseId: warehouse.id, quantity: 1000 },
    ],
  });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke S5 B' } });
  const bCustomer = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B' } });

  ids = { ar: ar.id, revenue: revenue.id, vat: vat.id, customer: customer.id, warehouse: warehouse.id, taxableProduct: taxableProduct.id, exemptProduct: exemptProduct.id, bCustomer: bCustomer.id };
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

function quotationInput(overrides: Partial<QuotationInput> = {}): QuotationInput {
  return {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    customerId: ids.customer,
    validUntil: TODAY,
    lines: [{ productId: ids.taxableProduct, quantity: 2, discountPercent: 0 }],
    ...overrides,
  };
}

async function issueInvoice(overrides: Partial<InvoiceInput> = {}) {
  return createInvoice(prisma, ctx(CA, ['sales.create']), {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    customerId: ids.customer,
    warehouseId: ids.warehouse,
    lines: [{ productId: ids.taxableProduct, quantity: 5, discountPercent: 0 }],
    ...overrides,
  });
}

function creditNoteInput(invoiceId: string, invoiceLineId: string, overrides: Partial<CreditNoteInput> = {}): CreditNoteInput {
  return {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    invoiceId,
    reason: 'Devolução de mercadoria',
    returnStock: false,
    lines: [{ invoiceLineId, quantity: 1 }],
    ...overrides,
  };
}

function debitNoteInput(overrides: Partial<DebitNoteInput> = {}): DebitNoteInput {
  return {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    customerId: ids.customer,
    reason: 'Juros de mora',
    lines: [{ description: 'Juros de mora — 30 dias', quantity: 1, unitPrice: 200, taxRate: 16 }],
    ...overrides,
  };
}

async function invoiceLineOf(invoiceId: string) {
  const line = await prisma.invoiceLine.findFirst({ where: { companyId: CA, invoiceId } });
  if (!line) throw new Error('linha da factura de teste em falta');
  return line;
}

async function entryFor(sourceType: string, sourceId: string, accountingEvent: string) {
  return prisma.journalEntry.findFirst({
    where: { companyId: CA, sourceType, sourceId, accountingEvent },
    include: { lines: { orderBy: { lineNumber: 'asc' } }, journal: true },
  });
}

async function customerBalance(): Promise<number> {
  const c = await prisma.customer.findUnique({ where: { id: ids.customer } });
  return Number(c?.balance ?? 0);
}

describe('Sessão S5 — Documentos Comerciais', () => {
  it('#1 cotação emite com número COT e NÃO gera stock, saldo nem contabilidade', async () => {
    const balanceBefore = await customerBalance();
    const [movBefore, jeBefore, levelBefore] = await Promise.all([
      prisma.stockMovement.count({ where: { companyId: CA } }),
      prisma.journalEntry.count({ where: { companyId: CA } }),
      prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: ids.taxableProduct, warehouseId: ids.warehouse } } }),
    ]);

    const r = await createQuotation(prisma, salesCtx, quotationInput());
    expect(r.number).toMatch(new RegExp(`^COT ${YEAR}/\\d{4}$`));

    const q = await prisma.quotation.findUnique({ where: { id: r.id }, include: { lines: true } });
    expect(q?.status).toBe('ISSUED');
    expect(Number(q?.total)).toBe(232); // 2 × 100 × 1.16
    expect(q?.lines).toHaveLength(1);

    const [movAfter, jeAfter, levelAfter] = await Promise.all([
      prisma.stockMovement.count({ where: { companyId: CA } }),
      prisma.journalEntry.count({ where: { companyId: CA } }),
      prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: ids.taxableProduct, warehouseId: ids.warehouse } } }),
    ]);
    expect(movAfter).toBe(movBefore);
    expect(jeAfter).toBe(jeBefore);
    expect(levelAfter?.quantity).toBe(levelBefore?.quantity);
    expect(await customerBalance()).toBe(balanceBefore);
  });

  it('#2 cotação é idempotente (mesma chave → mesmo documento)', async () => {
    const input = quotationInput();
    const first = await createQuotation(prisma, salesCtx, input);
    const replay = await createQuotation(prisma, salesCtx, input);
    expect(replay.id).toBe(first.id);
    expect(replay.number).toBe(first.number);
    await expect(createQuotation(prisma, salesCtx, { ...input, lines: [{ productId: ids.exemptProduct, quantity: 1, discountPercent: 0 }] })).rejects.toBeInstanceOf(ConflictError);
  });

  it('#3 numeração é atómica sob concorrência (sem duplicados)', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createQuotation(prisma, salesCtx, quotationInput({ idempotencyKey: randomUUID() }))),
    );
    const numbers = new Set(results.map((r) => r.number));
    expect(numbers.size).toBe(5);
  });

  it('#4 NC sem devolução: reduz saldo, sem stock, lançamento espelho da venda', async () => {
    const inv = await issueInvoice();
    const line = await invoiceLineOf(inv.id);
    const balanceBefore = await customerBalance();
    const movBefore = await prisma.stockMovement.count({ where: { companyId: CA } });

    const nc = await createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id, { lines: [{ invoiceLineId: line.id, quantity: 2 }] }));
    expect(nc.number).toMatch(new RegExp(`^NC ${YEAR}/\\d{4}$`));

    // Saldo: −232 (2 × 100 × 1.16); sem movimento de stock.
    expect(await customerBalance()).toBeCloseTo(balanceBefore - 232, 2);
    expect(await prisma.stockMovement.count({ where: { companyId: CA } })).toBe(movBefore);

    const entry = await entryFor('CREDIT_NOTE', nc.id, 'CREDIT_NOTE_ISSUED');
    expect(entry?.journal.journalType).toBe('SALES');
    expect(entry?.lines).toHaveLength(3);
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.revenue && Number(l.debit) === 200)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.vat && Number(l.debit) === 32)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.ar && l.customerId === ids.customer && Number(l.credit) === 232)).toBeTruthy();
    expect(Number(entry?.totalDebit)).toBeCloseTo(Number(entry?.totalCredit), 2);

    // Sem devolução: unitCost não é registado.
    const ncLine = await prisma.creditNoteLine.findFirst({ where: { companyId: CA, creditNoteId: nc.id } });
    expect(ncLine?.unitCost).toBeNull();
  });

  it('#5 NC com devolução: stock IN ao custo médio (snapshot em unitCost)', async () => {
    const inv = await issueInvoice();
    const line = await invoiceLineOf(inv.id);
    const levelBefore = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: ids.taxableProduct, warehouseId: ids.warehouse } } });

    const nc = await createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id, { returnStock: true, lines: [{ invoiceLineId: line.id, quantity: 3 }] }));

    const levelAfter = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: ids.taxableProduct, warehouseId: ids.warehouse } } });
    expect(levelAfter?.quantity).toBe((levelBefore?.quantity ?? 0) + 3);

    const ncRow = await prisma.creditNote.findUnique({ where: { id: nc.id } });
    expect(ncRow?.warehouseId).toBe(ids.warehouse);

    const movement = await prisma.stockMovement.findFirst({ where: { companyId: CA, document: nc.number } });
    expect(movement?.type).toBe('IN');
    expect(movement?.quantity).toBe(3);
    expect(movement?.reason).toContain('Devolução NC');

    // Snapshot do custo médio (60) — nunca o preço de venda (100).
    const ncLine = await prisma.creditNoteLine.findFirst({ where: { companyId: CA, creditNoteId: nc.id } });
    expect(Number(ncLine?.unitCost)).toBe(60);
    expect(ncLine?.invoiceLineId).toBe(line.id);

    // Custo médio do produto intacto.
    const product = await prisma.product.findUnique({ where: { id: ids.taxableProduct } });
    expect(Number(product?.avgCost)).toBe(60);
  });

  it('#6 NC respeita o tecto por linha e por factura', async () => {
    const inv = await issueInvoice(); // 5 unidades facturadas
    const line = await invoiceLineOf(inv.id);

    // Mais do que o facturado → rejeita.
    await expect(createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id, { lines: [{ invoiceLineId: line.id, quantity: 6 }] }))).rejects.toBeInstanceOf(ValidationError);

    // 4 + 2 > 5 → a segunda NC rejeita; 4 + 1 = 5 passa; depois nada resta.
    await createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id, { lines: [{ invoiceLineId: line.id, quantity: 4 }] }));
    await expect(createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id, { lines: [{ invoiceLineId: line.id, quantity: 2 }] }))).rejects.toBeInstanceOf(ValidationError);
    await createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id, { lines: [{ invoiceLineId: line.id, quantity: 1 }] }));
    await expect(createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id, { lines: [{ invoiceLineId: line.id, quantity: 1 }] }))).rejects.toBeInstanceOf(ValidationError);

    const creditable = await getCreditableLines(forCompany(CA), salesCtx, inv.id);
    expect(creditable.lines[0]?.availableQty).toBe(0);
  });

  it('#7 NC sobre factura cancelada é rejeitada', async () => {
    const inv = await issueInvoice();
    const line = await invoiceLineOf(inv.id);
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'CANCELLED' } });
    await expect(createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id))).rejects.toBeInstanceOf(ConflictError);
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'ISSUED' } });
  });

  it('#8 NC é idempotente e exige permissão e isolamento multiempresa', async () => {
    const inv = await issueInvoice();
    const line = await invoiceLineOf(inv.id);

    const input = creditNoteInput(inv.id, line.id);
    const first = await createCreditNote(prisma, salesCtx, input);
    const replay = await createCreditNote(prisma, salesCtx, input);
    expect(replay.id).toBe(first.id);
    // O replay não duplica efeitos: um só lançamento e uma só NC.
    expect(await prisma.creditNote.count({ where: { companyId: CA, invoiceId: inv.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'CREDIT_NOTE', sourceId: first.id } })).toBe(1);

    await expect(createCreditNote(prisma, viewOnlyCtx, creditNoteInput(inv.id, line.id, { idempotencyKey: randomUUID() }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createCreditNote(prisma, bCtx, creditNoteInput(inv.id, line.id, { idempotencyKey: randomUUID() }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('#9 ND aumenta o saldo e lança D Clientes / C Vendas + C IVA', async () => {
    const balanceBefore = await customerBalance();
    const movBefore = await prisma.stockMovement.count({ where: { companyId: CA } });

    const nd = await createDebitNote(prisma, salesCtx, debitNoteInput());
    expect(nd.number).toMatch(new RegExp(`^ND ${YEAR}/\\d{4}$`));

    expect(await customerBalance()).toBeCloseTo(balanceBefore + 232, 2); // 200 × 1.16
    expect(await prisma.stockMovement.count({ where: { companyId: CA } })).toBe(movBefore);

    const entry = await entryFor('DEBIT_NOTE', nd.id, 'DEBIT_NOTE_ISSUED');
    expect(entry?.journal.journalType).toBe('SALES');
    expect(entry?.lines).toHaveLength(3);
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.ar && l.customerId === ids.customer && Number(l.debit) === 232)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.revenue && Number(l.credit) === 200)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.vat && Number(l.credit) === 32)).toBeTruthy();
  });

  it('#10 ND com IVA 0% gera duas linhas; factura de outro cliente é rejeitada', async () => {
    const nd = await createDebitNote(prisma, salesCtx, debitNoteInput({ lines: [{ description: 'Portes', quantity: 1, unitPrice: 150, taxRate: 0 }] }));
    const entry = await entryFor('DEBIT_NOTE', nd.id, 'DEBIT_NOTE_ISSUED');
    expect(entry?.lines).toHaveLength(2);
    expect(entry?.lines.some((l) => l.ledgerAccountId === ids.vat)).toBe(false);

    // Factura de outro cliente (empresa B nem sequer é visível; usar cliente errado da própria empresa).
    const otherCustomer = await prisma.customer.create({ data: { companyId: CA, name: 'Outro Cliente S5' } });
    const inv = await issueInvoice();
    await expect(
      createDebitNote(prisma, salesCtx, debitNoteInput({ customerId: otherCustomer.id, invoiceId: inv.id, idempotencyKey: randomUUID() })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('#11 extracto do cliente inclui NC (crédito) e ND (débito) e reconcilia com o saldo', async () => {
    const statement = await getCustomerStatement(forCompany(CA), viewOnlyCtx, ids.customer);
    expect(statement.rows.some((r) => r.description === 'Nota de crédito' && r.credit > 0)).toBe(true);
    expect(statement.rows.some((r) => r.description === 'Nota de débito' && r.debit > 0)).toBe(true);
    expect(statement.closingBalance).toBeCloseTo(await customerBalance(), 2);
  });

  it('#12 cotação de empresa B não vê clientes da empresa A', async () => {
    await expect(createQuotation(prisma, bCtx, quotationInput({ idempotencyKey: randomUUID() }))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('#13 tecto da NC resiste a duas NCs simultâneas contra a mesma factura', async () => {
    const inv = await issueInvoice(); // 5 unidades facturadas
    const line = await invoiceLineOf(inv.id);
    // Duas NCs de 3 unidades em paralelo: 3 + 3 > 5 — exactamente uma passa.
    const results = await Promise.allSettled([
      createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id, { lines: [{ invoiceLineId: line.id, quantity: 3 }] })),
      createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id, { lines: [{ invoiceLineId: line.id, quantity: 3 }] })),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(ValidationError);
    // Estado final: uma só NC, 3 unidades creditadas, tecto ainda coerente.
    expect(await prisma.creditNote.count({ where: { companyId: CA, invoiceId: inv.id, status: 'ISSUED' } })).toBe(1);
    const creditable = await getCreditableLines(forCompany(CA), salesCtx, inv.id);
    expect(creditable.lines[0]?.availableQty).toBe(2);
  });

  it('#14 factura com NC emitida não pode ser cancelada integralmente (bloqueio conservador)', async () => {
    const inv = await issueInvoice();
    const line = await invoiceLineOf(inv.id);
    await createCreditNote(prisma, salesCtx, creditNoteInput(inv.id, line.id));
    const cancelCtx = ctx(CA, ['invoices.cancel']);
    await expect(
      cancelInvoice(prisma, cancelCtx, {
        idempotencyKey: randomUUID(),
        invoiceId: inv.id,
        cancellationDate: TODAY,
        cancellationReason: 'Tentativa de cancelamento com NC emitida',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    // A factura permanece emitida.
    const after = await prisma.invoice.findUnique({ where: { id: inv.id }, select: { status: true } });
    expect(after?.status).toBe('ISSUED');
  });
});
