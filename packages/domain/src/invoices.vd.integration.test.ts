/**
 * Suite de integracao S15 — Documentos de Venda (VD, vias, lista de recibos).
 * Correr com: `pnpm test:integration:invoices:vd` (exige DATABASE_URL).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forCompany, prisma } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import type { RequestContext } from './context';
import {
  createPosSale,
  emitInvoiceVia,
  getCustomerStatement,
  invoiceKpis,
  listCustomerPayments,
  listInvoices,
  POS_FINAL_CUSTOMER_ID,
  POS_GENERAL_CUSTOMER_NAME,
  type PosSaleInput,
} from './invoices';
import { ConflictError, ForbiddenError } from './errors';

const CA = 'smoke-vd';
const CB = 'smoke-vd-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const CURRENT_DATE = civilDateInTimeZone();
const YEAR = Number(CURRENT_DATE.slice(0, 4));

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const posCtx = ctx(CA, ['sales.create', 'payments.receive']);
const viewCtx = ctx(CA, ['sales.view']);
const dbA = forCompany(CA);
const dbB = forCompany(CB);

interface Ids {
  customer: string;
  warehouse: string;
  product: string;
  cashAccount: string;
}

let ids!: Ids;

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { companyId } });
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
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function ledger(companyId: string, code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT', parentId?: string) {
  return prisma.ledgerAccount.create({
    data: { companyId, code, name, accountType, normalBalance, level: parentId ? 2 : 1, parentId: parentId ?? null, isPosting: true },
  });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke VD' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: `${YEAR}`, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: `${YEAR}`, name: `${YEAR}`, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' } });

  const group = (await ledger(CA, '1', 'Activo', 'ASSET', 'DEBIT')).id;
  const ar = (await ledger(CA, '121', 'Clientes', 'ASSET', 'DEBIT', group)).id;
  const cashLedger = (await ledger(CA, '111', 'Caixa', 'ASSET', 'DEBIT', group)).id;
  const inventory = (await ledger(CA, '131', 'Mercadorias', 'ASSET', 'DEBIT', group)).id;
  const vat = (await ledger(CA, '221', 'IVA liquidado', 'LIABILITY', 'CREDIT')).id;
  const revenue = (await ledger(CA, '411', 'Vendas', 'REVENUE', 'CREDIT')).id;
  const cogs = (await ledger(CA, '511', 'CMV', 'EXPENSE', 'DEBIT')).id;
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar },
      { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue },
      { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: vat },
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory },
      { companyId: CA, systemKey: 'COST_OF_GOODS_SOLD', ledgerAccountId: cogs },
    ],
  });

  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente Identificado', paymentTermDays: 0 } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'VD', name: 'Loja VD' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'VD-1', name: 'Produto VD', salePrice: 100, taxRate: 16, avgCost: 60 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: product.id, warehouseId: warehouse.id, quantity: 100 } });
  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa VD', type: 'CASH', ledgerAccountId: cashLedger } });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke VD B' } });

  ids = { customer: customer.id, warehouse: warehouse.id, product: product.id, cashAccount: cashAccount.id };
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

function input(overrides: Partial<PosSaleInput> = {}): PosSaleInput {
  return {
    invoiceIdempotencyKey: randomUUID(),
    paymentIdempotencyKey: randomUUID(),
    issueDate: CURRENT_DATE,
    customerId: POS_FINAL_CUSTOMER_ID,
    warehouseId: ids.warehouse,
    paymentMethod: 'CASH',
    lines: [{ productId: ids.product, quantity: 2, discountPercent: 0 }],
    ...overrides,
  };
}

describe('S15 — Documentos de Venda', () => {
  it('POS ao Cliente Geral emite VD com serie propria e cliente operacional novo', async () => {
    const result = await createPosSale(prisma, posCtx, input());
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: result.invoiceId } });
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: invoice.customerId } });

    expect(invoice.documentType).toBe('VD');
    expect(invoice.number).toBe(`VD ${YEAR}/0001`);
    expect(invoice.status).toBe('PAID');
    expect(customer.name).toBe(POS_GENERAL_CUSTOMER_NAME);
  });

  it('POS a cliente identificado continua a emitir FT', async () => {
    const result = await createPosSale(prisma, posCtx, input({ customerId: ids.customer }));
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: result.invoiceId } });
    expect(invoice.documentType).toBe('FACTURA');
    expect(invoice.number).toBe(`FT ${YEAR}/0001`);
  });

  it('series VD e FT sao contadores independentes (a VD nao gasta numeros FT)', async () => {
    const vd = await createPosSale(prisma, posCtx, input());
    const ft = await createPosSale(prisma, posCtx, input({ customerId: ids.customer }));
    expect(vd.invoiceNumber).toBe(`VD ${YEAR}/0002`);
    expect(ft.invoiceNumber).toBe(`FT ${YEAR}/0002`);

    const counters = await prisma.documentCounter.findMany({ where: { companyId: CA, key: { in: [`VD-${YEAR}`, `FT-${YEAR}`] } } });
    expect(counters.find((c) => c.key === `VD-${YEAR}`)?.value).toBe(2);
    expect(counters.find((c) => c.key === `FT-${YEAR}`)?.value).toBe(2);
  });

  it('contabilidade da VD e identica a da factura: SALE_ISSUED balanceado + COGS + RECEIPT', async () => {
    const result = await createPosSale(prisma, posCtx, input({ lines: [{ productId: ids.product, quantity: 1, discountPercent: 0 }] }));
    const [sale, cogs, receipt] = await Promise.all([
      prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: result.invoiceId, accountingEvent: 'SALE_ISSUED' }, include: { lines: true } }),
      prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: result.invoiceId, accountingEvent: 'COGS_POSTED' }, include: { lines: true } }),
      prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'CUSTOMER_PAYMENT', sourceId: result.paymentId, accountingEvent: 'RECEIPT_POSTED' } }),
    ]);

    // 1 × 100 + 16% IVA = 116; débito 121 = 116, crédito 411 = 100, crédito 221 = 16.
    const saleDebit = sale.lines.reduce((acc, l) => acc + Number(l.debit), 0);
    const saleCredit = sale.lines.reduce((acc, l) => acc + Number(l.credit), 0);
    expect(saleDebit).toBe(116);
    expect(saleDebit).toBe(saleCredit);
    expect(sale.description).toContain('VD POS');

    // CMV ao custo médio: 1 × 60 nos dois lados.
    const cogsDebit = cogs.lines.reduce((acc, l) => acc + Number(l.debit), 0);
    const cogsCredit = cogs.lines.reduce((acc, l) => acc + Number(l.credit), 0);
    expect(cogsDebit).toBe(60);
    expect(cogsDebit).toBe(cogsCredit);

    expect(receipt).toBeTruthy();
  });

  it('replay idempotente da VD nao duplica documentos nem consome numeros', async () => {
    const keyInput = input();
    const first = await createPosSale(prisma, posCtx, keyInput);
    const replay = await createPosSale(prisma, posCtx, keyInput);
    expect(replay).toEqual(first);
    expect(await prisma.invoice.count({ where: { companyId: CA, number: first.invoiceNumber } })).toBe(1);
  });

  it('listInvoices e KPIs incluem a VD como documento activo', async () => {
    const rows = await listInvoices(dbA, viewCtx);
    const vdRows = rows.filter((r) => r.documentType === 'VD');
    expect(vdRows.length).toBeGreaterThanOrEqual(1);
    expect(vdRows.every((r) => r.number.startsWith('VD '))).toBe(true);

    const kpi = await invoiceKpis(dbA, viewCtx);
    const activeTotal = await prisma.invoice.aggregate({
      where: { companyId: CA, status: { in: ['ISSUED', 'PARTIAL', 'PAID'] } },
      _sum: { total: true },
    });
    expect(kpi.invoiced).toBe(Number(activeTotal._sum.total));
  });

  it('extracto do cliente descreve a VD como Venda a Dinheiro', async () => {
    const general = await prisma.customer.findFirstOrThrow({ where: { companyId: CA, name: POS_GENERAL_CUSTOMER_NAME } });
    const statement = await getCustomerStatement(dbA, ctx(CA, ['clients.view']), general.id);
    const vdRow = statement.rows.find((r) => r.doc.startsWith('VD '));
    expect(vdRow?.description).toBe('Venda a Dinheiro');
  });

  it('emitInvoiceVia incrementa vias sequencialmente sem tocar no documento', async () => {
    const sale = await createPosSale(prisma, posCtx, input({ customerId: ids.customer }));
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: sale.invoiceId } });

    const second = await emitInvoiceVia(dbA, viewCtx, { invoiceId: sale.invoiceId, reason: 'extravio do original' });
    const third = await emitInvoiceVia(dbA, viewCtx, { invoiceId: sale.invoiceId });
    expect(second.via).toBe(2);
    expect(third.via).toBe(3);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: sale.invoiceId } });
    expect(after.viaCount).toBe(2);
    expect(after.number).toBe(before.number);
    expect(Number(after.total)).toBe(Number(before.total));
    expect(after.issueDate.getTime()).toBe(before.issueDate.getTime());
    expect(after.status).toBe(before.status);

    const audits = await prisma.auditLog.findMany({ where: { companyId: CA, action: 'invoice.via_print', entityId: sale.invoiceId }, orderBy: { createdAt: 'asc' } });
    expect(audits.length).toBe(2);
    expect((audits[0]!.newValues as { via: number; reason: string | null }).via).toBe(2);
    expect((audits[0]!.newValues as { via: number; reason: string | null }).reason).toBe('extravio do original');
    expect((audits[1]!.newValues as { via: number }).via).toBe(3);
  });

  it('emitInvoiceVia bloqueia rascunhos e exige sales.view', async () => {
    const draft = await prisma.invoice.create({
      data: {
        companyId: CA,
        number: `RASC ${YEAR}/9001`,
        customerId: ids.customer,
        customerName: 'Cliente Identificado',
        warehouseId: ids.warehouse,
        dueDate: D(`${YEAR}-12-31`),
        status: 'DRAFT',
        subtotal: 100,
        discountTotal: 0,
        taxableBase: 100,
        taxTotal: 16,
        total: 116,
      },
    });
    await expect(emitInvoiceVia(dbA, viewCtx, { invoiceId: draft.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(emitInvoiceVia(dbA, ctx(CA, []), { invoiceId: draft.id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('listCustomerPayments filtra por estado, metodo, documento e cliente', async () => {
    const all = await listCustomerPayments(dbA, viewCtx);
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all.every((r) => r.number.startsWith('REC '))).toBe(true);

    const active = await listCustomerPayments(dbA, viewCtx, { status: 'ACTIVE' });
    expect(active.length).toBe(all.length); // nenhum anulado nesta suite

    const cash = await listCustomerPayments(dbA, viewCtx, { method: 'CASH' });
    expect(cash.length).toBe(all.length);

    const byVd = await listCustomerPayments(dbA, viewCtx, { invoiceNumber: `VD ${YEAR}/0001` });
    expect(byVd.length).toBe(1);
    expect(byVd[0]!.invoiceNumber).toBe(`VD ${YEAR}/0001`);

    const identified = await listCustomerPayments(dbA, viewCtx, { customerId: ids.customer });
    expect(identified.every((r) => r.customerName === 'Cliente Identificado')).toBe(true);
    expect(identified.length).toBeGreaterThanOrEqual(2);

    const byNumber = await listCustomerPayments(dbA, viewCtx, { q: all[0]!.number });
    expect(byNumber.length).toBe(1);
  });

  it('listCustomerPayments respeita isolamento multiempresa e permissoes', async () => {
    const fromB = await listCustomerPayments(dbB, ctx(CB, ['sales.view']));
    expect(fromB.length).toBe(0);
    await expect(listCustomerPayments(dbA, ctx(CA, []))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('backfill: cliente operacional antigo «Cliente final» renomeado e reutilizado', async () => {
    // Simula uma BD pre-S15: renomeia o cliente operacional de volta e confirma
    // que a migracao de dados (UPDATE por nome) o traria para «Cliente Geral».
    const general = await prisma.customer.findFirstOrThrow({ where: { companyId: CA, name: POS_GENERAL_CUSTOMER_NAME } });
    await prisma.customer.update({ where: { id: general.id }, data: { name: 'Cliente final' } });
    await prisma.$executeRaw`UPDATE "customers" SET "name" = 'Cliente Geral' WHERE "name" = 'Cliente final'`;
    const renamed = await prisma.customer.findUniqueOrThrow({ where: { id: general.id } });
    expect(renamed.name).toBe(POS_GENERAL_CUSTOMER_NAME);

    // E a venda seguinte reutiliza-o em vez de criar um duplicado.
    const before = await prisma.customer.count({ where: { companyId: CA } });
    await createPosSale(prisma, posCtx, input());
    expect(await prisma.customer.count({ where: { companyId: CA } })).toBe(before);
  });
});
