/**
 * Suite de INTEGRACAO da Sessao S10a — CMV na venda + par da devolucao nas NCs.
 * Correr com: `pnpm test:integration:accounting:cogs` (exige DATABASE_URL).
 *
 * Cobre: COGS_POSTED como lancamento SEPARADO (SALE_ISSUED intacto) nos tres
 * pontos de emissao (factura, POS, emissao de rascunho), snapshot unitCost na
 * linha da factura capturado NA EMISSAO, venda sem custo (avgCost 0) sem
 * lancamento, par CREDIT_NOTE_COGS_REVERSED ao unitCost snapshot da NC,
 * estorno do CMV no cancelamento (e cancelamento sem CMV como as facturas
 * pre-S10), idempotencia, mapping em falta sem fallback com rollback total,
 * isolamento A/B e o teste-ancora de coerencia: saldo 131 = stock fisico
 * valorizado ao avgCost cruzando abertura S8 + compras + CMV + NC + contagem S9.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { civilDateInTimeZone, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import {
  cancelInvoice,
  createInvoice,
  createPosSale,
  issueInvoiceDraft,
  saveInvoiceDraft,
  type InvoiceInput,
} from './invoices';
import { createCreditNote } from './commercial-documents';
import { createProduct } from './products';
import { approvePurchaseOrder, createPurchaseOrder, receivePurchaseOrder } from './purchases';
import { createStockCount, validateStockCount } from './stock-counts';

const CA = 'smoke-cogs';
const CB = 'smoke-cogs-b';
const CC = 'smoke-cogs-c';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const TODAY = civilDateInTimeZone();

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const salesCtx = ctx(CA, ['sales.create', 'payments.receive', 'invoices.cancel']);
const salesCtxB = ctx(CB, ['sales.create']);
const fullCtxC = ctx(CC, [
  'products.create',
  'purchases.create',
  'purchases.approve',
  'sales.create',
  'invoices.cancel',
  'stock.view',
  'stock.adjust',
]);

interface CompanyAccounting {
  inventory: string;
  cogs: string;
  ar: string;
  revenue: string;
  vat: string;
}

let A!: CompanyAccounting & { customer: string; warehouse: string; prodStd: string; prodZero: string; cashAccount: string };
let C!: CompanyAccounting & { customer: string; warehouse: string; supplier: string };
let B!: { customer: string; warehouse: string; product: string };

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.creditNoteLine.deleteMany({ where: { companyId } });
  await prisma.creditNote.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.stockCountLine.deleteMany({ where: { companyId } });
  await prisma.stockCount.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
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
  await prisma.supplier.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function provisionAccounting(companyId: string, opts: { withPurchases?: boolean; withOpening?: boolean; withAdjustment?: boolean } = {}): Promise<CompanyAccounting> {
  const fy = await prisma.fiscalYear.create({ data: { companyId, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId, fiscalYearId: fy.id, periodNumber: 1, code: '2026', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' } });
  if (opts.withPurchases) await prisma.accountingJournal.create({ data: { companyId, code: 'DC', name: 'Compras', journalType: 'PURCHASES', sequencePrefix: 'LC' } });
  if (opts.withOpening) await prisma.accountingJournal.create({ data: { companyId, code: 'DAB', name: 'Abertura', journalType: 'OPENING', sequencePrefix: 'AB' } });
  if (opts.withAdjustment) await prisma.accountingJournal.create({ data: { companyId, code: 'DAJ', name: 'Ajustamentos', journalType: 'ADJUSTMENT', sequencePrefix: 'AJ' } });

  const group = await prisma.ledgerAccount.create({ data: { companyId, code: '1', name: 'Activo', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: false } });
  const ar = await prisma.ledgerAccount.create({ data: { companyId, code: '121', name: 'Clientes', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, parentId: group.id } });
  const inventory = await prisma.ledgerAccount.create({ data: { companyId, code: '131', name: 'Mercadorias', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, parentId: group.id } });
  const vat = await prisma.ledgerAccount.create({ data: { companyId, code: '221', name: 'IVA liquidado', accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 1 } });
  const revenue = await prisma.ledgerAccount.create({ data: { companyId, code: '411', name: 'Vendas', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1 } });
  const cogs = await prisma.ledgerAccount.create({ data: { companyId, code: '511', name: 'CMV', accountType: 'EXPENSE', normalBalance: 'DEBIT', level: 1 } });
  await prisma.accountingMapping.createMany({
    data: [
      { companyId, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar.id },
      { companyId, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue.id },
      { companyId, systemKey: 'VAT_OUTPUT', ledgerAccountId: vat.id },
      { companyId, systemKey: 'INVENTORY', ledgerAccountId: inventory.id },
      { companyId, systemKey: 'COST_OF_GOODS_SOLD', ledgerAccountId: cogs.id },
    ],
  });
  return { inventory: inventory.id, cogs: cogs.id, ar: ar.id, revenue: revenue.id, vat: vat.id };
}

async function provision() {
  // Empresa A: vendas/POS/NC/cancelamento.
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke CMV A' } });
  const accA = await provisionAccounting(CA);
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' } });
  const cashLedger = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '111', name: 'Caixa', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1 } });
  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa', type: 'CASH', ledgerAccountId: cashLedger.id } });
  const customerA = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente CMV', paymentTermDays: 0 } });
  const warehouseA = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const prodStd = await prisma.product.create({ data: { companyId: CA, sku: 'STD', name: 'Produto Custo', salePrice: 100, taxRate: 16, avgCost: 15.5 } });
  const prodZero = await prisma.product.create({ data: { companyId: CA, sku: 'ZERO', name: 'Servico Sem Custo', salePrice: 50, taxRate: 0, avgCost: 0 } });
  await prisma.stockLevel.createMany({
    data: [
      { companyId: CA, productId: prodStd.id, warehouseId: warehouseA.id, quantity: 10000 },
      { companyId: CA, productId: prodZero.id, warehouseId: warehouseA.id, quantity: 10000 },
    ],
  });
  A = { ...accA, customer: customerA.id, warehouse: warehouseA.id, prodStd: prodStd.id, prodZero: prodZero.id, cashAccount: cashAccount.id };

  // Empresa B: contabilidade SEM mappings de existencias/CMV (sem fallback).
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke CMV B' } });
  const fyB = await prisma.fiscalYear.create({ data: { companyId: CB, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CB, fiscalYearId: fyB.id, periodNumber: 1, code: '2026', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId: CB, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' } });
  const arB = await prisma.ledgerAccount.create({ data: { companyId: CB, code: '121', name: 'Clientes', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1 } });
  const revB = await prisma.ledgerAccount.create({ data: { companyId: CB, code: '411', name: 'Vendas', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1 } });
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CB, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: arB.id },
      { companyId: CB, systemKey: 'SALES_REVENUE', ledgerAccountId: revB.id },
    ],
  });
  const customerB = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B', paymentTermDays: 0 } });
  const warehouseB = await prisma.warehouse.create({ data: { companyId: CB, code: 'ARMB', name: 'Armazem B' } });
  const productB = await prisma.product.create({ data: { companyId: CB, sku: 'B-1', name: 'Produto B', salePrice: 40, taxRate: 0, avgCost: 10 } });
  await prisma.stockLevel.create({ data: { companyId: CB, productId: productB.id, warehouseId: warehouseB.id, quantity: 100 } });
  B = { customer: customerB.id, warehouse: warehouseB.id, product: productB.id };

  // Empresa C: exclusiva do teste de coerencia 131 (nenhum outro teste lhe toca:
  // qualquer manipulacao manual de avgCost noutra empresa nao contamina a igualdade).
  await prisma.company.create({ data: { id: CC, legalName: 'Smoke CMV Coerencia' } });
  const accC = await provisionAccounting(CC, { withPurchases: true, withOpening: true, withAdjustment: true });
  const vatInC = await prisma.ledgerAccount.create({ data: { companyId: CC, code: '141', name: 'IVA dedutivel', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1 } });
  const apC = await prisma.ledgerAccount.create({ data: { companyId: CC, code: '211', name: 'Fornecedores', accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 1 } });
  const openingC = await prisma.ledgerAccount.create({ data: { companyId: CC, code: '312', name: 'Abertura de existencias', accountType: 'EQUITY', normalBalance: 'CREDIT', level: 1 } });
  const surplusC = await prisma.ledgerAccount.create({ data: { companyId: CC, code: '421', name: 'Excedentes de inventario', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1 } });
  const shortageC = await prisma.ledgerAccount.create({ data: { companyId: CC, code: '551', name: 'Deficits de inventario', accountType: 'EXPENSE', normalBalance: 'DEBIT', level: 1 } });
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CC, systemKey: 'VAT_INPUT', ledgerAccountId: vatInC.id },
      { companyId: CC, systemKey: 'ACCOUNTS_PAYABLE', ledgerAccountId: apC.id },
      { companyId: CC, systemKey: 'OPENING_BALANCE_EQUITY', ledgerAccountId: openingC.id },
      { companyId: CC, systemKey: 'INVENTORY_SURPLUS', ledgerAccountId: surplusC.id },
      { companyId: CC, systemKey: 'INVENTORY_SHORTAGE', ledgerAccountId: shortageC.id },
    ],
  });
  const customerC = await prisma.customer.create({ data: { companyId: CC, name: 'Cliente Coerencia', paymentTermDays: 0 } });
  const warehouseC = await prisma.warehouse.create({ data: { companyId: CC, code: 'ARMC', name: 'Armazem C' } });
  const supplierC = await prisma.supplier.create({ data: { companyId: CC, name: 'Fornecedor Coerencia' } });
  C = { ...accC, customer: customerC.id, warehouse: warehouseC.id, supplier: supplierC.id };
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await teardown(CC);
  await provision();
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await teardown(CC);
  await prisma.$disconnect();
});

function invoiceInput(overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    customerId: A.customer,
    warehouseId: A.warehouse,
    lines: [{ productId: A.prodStd, quantity: 3, discountPercent: 0 }],
    ...overrides,
  };
}

async function entriesFor(companyId: string, sourceType: string, sourceId: string, accountingEvent: string) {
  return prisma.journalEntry.findMany({
    where: { companyId, sourceType, sourceId, accountingEvent },
    include: { lines: { orderBy: { lineNumber: 'asc' } }, journal: true },
  });
}

/** Saldo da conta 131 (debitos - creditos) sobre lancamentos POSTED + REVERSED. */
async function inventoryBalance(companyId: string, ledgerAccountId: string): Promise<number> {
  const lines = await prisma.journalEntryLine.findMany({
    where: { companyId, ledgerAccountId, journalEntry: { status: { in: ['POSTED', 'REVERSED'] } } },
    select: { debit: true, credit: true },
  });
  return round2(lines.reduce((sum, l) => sum + Number(l.debit) - Number(l.credit), 0));
}

/** Stock fisico da empresa valorizado ao avgCost corrente de cada produto. */
async function physicalStockValue(companyId: string): Promise<number> {
  const levels = await prisma.stockLevel.findMany({ where: { companyId }, include: { product: { select: { avgCost: true } } } });
  return round2(levels.reduce((sum, l) => sum + round2(l.quantity * round2(Number(l.product.avgCost))), 0));
}

describe('S10a — CMV na venda e par da devolucao', () => {
  it('#1 factura com produtos: SALE_ISSUED intacto + COGS_POSTED separado D 511 / C 131 ao avgCost, snapshot na linha', async () => {
    const r = await createInvoice(prisma, salesCtx, invoiceInput());

    const [sale] = await entriesFor(CA, 'INVOICE', r.id, 'SALE_ISSUED');
    expect(sale).toBeTruthy();
    expect(sale!.journal.journalType).toBe('SALES');
    // O lancamento de receita fica byte-a-byte como antes da S10a: 3 linhas.
    expect(sale!.lines).toHaveLength(3);
    expect(sale!.lines.find((l) => l.ledgerAccountId === A.ar && Number(l.debit) === 348)).toBeTruthy();
    expect(sale!.lines.find((l) => l.ledgerAccountId === A.revenue && Number(l.credit) === 300)).toBeTruthy();
    expect(sale!.lines.find((l) => l.ledgerAccountId === A.vat && Number(l.credit) === 48)).toBeTruthy();

    const [cogs] = await entriesFor(CA, 'INVOICE', r.id, 'COGS_POSTED');
    expect(cogs).toBeTruthy();
    expect(cogs!.status).toBe('POSTED');
    expect(cogs!.journal.journalType).toBe('SALES');
    expect(cogs!.entryNumber.startsWith('LV ')).toBe(true);
    expect(cogs!.reference).toBe(r.number);
    // 3 x 15.50 = 46.50.
    expect(Number(cogs!.totalDebit)).toBe(46.5);
    expect(cogs!.lines).toHaveLength(2);
    const debit = cogs!.lines.find((l) => Number(l.debit) > 0)!;
    const credit = cogs!.lines.find((l) => Number(l.credit) > 0)!;
    expect(debit.ledgerAccountId).toBe(A.cogs);
    expect(Number(debit.debit)).toBe(46.5);
    expect(credit.ledgerAccountId).toBe(A.inventory);
    expect(Number(credit.credit)).toBe(46.5);

    const lines = await prisma.invoiceLine.findMany({ where: { companyId: CA, invoiceId: r.id } });
    expect(lines).toHaveLength(1);
    expect(Number(lines[0]!.unitCost)).toBe(15.5);
  });

  it('#2 venda de produto com avgCost 0: sem lancamento COGS_POSTED', async () => {
    const r = await createInvoice(prisma, salesCtx, invoiceInput({ lines: [{ productId: A.prodZero, quantity: 2, discountPercent: 0 }] }));
    expect(await entriesFor(CA, 'INVOICE', r.id, 'SALE_ISSUED')).toHaveLength(1);
    expect(await entriesFor(CA, 'INVOICE', r.id, 'COGS_POSTED')).toHaveLength(0);
    const lines = await prisma.invoiceLine.findMany({ where: { companyId: CA, invoiceId: r.id } });
    expect(Number(lines[0]!.unitCost)).toBe(0);
  });

  it('#3 snapshot estavel: alterar o avgCost depois da emissao nao muda o lancamento nem a linha', async () => {
    const p = await prisma.product.create({ data: { companyId: CA, sku: 'SNAP', name: 'Produto Snapshot', salePrice: 100, taxRate: 0, avgCost: 12 } });
    await prisma.stockLevel.create({ data: { companyId: CA, productId: p.id, warehouseId: A.warehouse, quantity: 100 } });

    const r1 = await createInvoice(prisma, salesCtx, invoiceInput({ lines: [{ productId: p.id, quantity: 2, discountPercent: 0 }] }));
    await prisma.product.update({ where: { id: p.id }, data: { avgCost: 99 } });

    const [cogs1] = await entriesFor(CA, 'INVOICE', r1.id, 'COGS_POSTED');
    expect(Number(cogs1!.totalDebit)).toBe(24);
    const lines1 = await prisma.invoiceLine.findMany({ where: { companyId: CA, invoiceId: r1.id } });
    expect(Number(lines1[0]!.unitCost)).toBe(12);

    // Nova factura usa o custo corrente (99).
    const r2 = await createInvoice(prisma, salesCtx, invoiceInput({ lines: [{ productId: p.id, quantity: 1, discountPercent: 0 }] }));
    const [cogs2] = await entriesFor(CA, 'INVOICE', r2.id, 'COGS_POSTED');
    expect(Number(cogs2!.totalDebit)).toBe(99);
  });

  it('#4 rascunho S6: unitCost NULL no rascunho; snapshot e CMV capturados NA EMISSAO', async () => {
    const p = await prisma.product.create({ data: { companyId: CA, sku: 'DRAFT', name: 'Produto Rascunho', salePrice: 80, taxRate: 0, avgCost: 7 } });
    await prisma.stockLevel.create({ data: { companyId: CA, productId: p.id, warehouseId: A.warehouse, quantity: 100 } });

    const draft = await saveInvoiceDraft(prisma, salesCtx, invoiceInput({ lines: [{ productId: p.id, quantity: 5, discountPercent: 0 }] }));
    const draftLines = await prisma.invoiceLine.findMany({ where: { companyId: CA, invoiceId: draft.id } });
    expect(draftLines[0]!.unitCost).toBeNull();
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceId: draft.id } })).toBe(0);

    // O custo muda entre a gravacao e a emissao: o CMV usa o custo DA EMISSAO.
    await prisma.product.update({ where: { id: p.id }, data: { avgCost: 9 } });
    const issued = await issueInvoiceDraft(prisma, salesCtx, { draftId: draft.id, idempotencyKey: randomUUID(), issueDate: TODAY });

    const [cogs] = await entriesFor(CA, 'INVOICE', issued.id, 'COGS_POSTED');
    expect(Number(cogs!.totalDebit)).toBe(45); // 5 x 9
    const issuedLines = await prisma.invoiceLine.findMany({ where: { companyId: CA, invoiceId: issued.id } });
    expect(Number(issuedLines[0]!.unitCost)).toBe(9);
  });

  it('#5 POS: venda POS tambem lanca COGS_POSTED', async () => {
    const r = await createPosSale(prisma, salesCtx, {
      invoiceIdempotencyKey: randomUUID(),
      paymentIdempotencyKey: randomUUID(),
      issueDate: TODAY,
      customerId: A.customer,
      warehouseId: A.warehouse,
      accountId: A.cashAccount,
      paymentMethod: 'CASH',
      lines: [{ productId: A.prodStd, quantity: 2, discountPercent: 0 }],
    });
    const [cogs] = await entriesFor(CA, 'INVOICE', r.invoiceId, 'COGS_POSTED');
    expect(cogs).toBeTruthy();
    expect(Number(cogs!.totalDebit)).toBe(31); // 2 x 15.50
  });

  it('#6 idempotencia: replay da emissao nao duplica o COGS_POSTED', async () => {
    const key = randomUUID();
    const input = invoiceInput({ idempotencyKey: key });
    const first = await createInvoice(prisma, salesCtx, input);
    const replay = await createInvoice(prisma, salesCtx, input);
    expect(replay.id).toBe(first.id);
    expect(await entriesFor(CA, 'INVOICE', first.id, 'COGS_POSTED')).toHaveLength(1);
    expect(await entriesFor(CA, 'INVOICE', first.id, 'SALE_ISSUED')).toHaveLength(1);
  });

  it('#7 NC com devolucao: par CREDIT_NOTE_COGS_REVERSED D 131 / C 511 ao unitCost snapshot da NC', async () => {
    const inv = await createInvoice(prisma, salesCtx, invoiceInput({ lines: [{ productId: A.prodStd, quantity: 4, discountPercent: 0 }] }));
    const invLines = await prisma.invoiceLine.findMany({ where: { companyId: CA, invoiceId: inv.id } });

    // O custo muda entre a venda e a NC: o par usa o snapshot DA NC (custo corrente
    // da devolucao — a mercadoria reentra ao custo a que reentra no stock).
    await prisma.product.update({ where: { id: A.prodStd }, data: { avgCost: 20 } });

    const nc = await createCreditNote(prisma, salesCtx, {
      idempotencyKey: randomUUID(),
      issueDate: TODAY,
      invoiceId: inv.id,
      reason: 'Devolucao parcial de mercadoria',
      returnStock: true,
      lines: [{ invoiceLineId: invLines[0]!.id, quantity: 2 }],
    });

    const ncLines = await prisma.creditNoteLine.findMany({ where: { companyId: CA, creditNoteId: nc.id } });
    expect(Number(ncLines[0]!.unitCost)).toBe(20);

    const [pair] = await entriesFor(CA, 'CREDIT_NOTE', nc.id, 'CREDIT_NOTE_COGS_REVERSED');
    expect(pair).toBeTruthy();
    expect(pair!.status).toBe('POSTED');
    expect(Number(pair!.totalDebit)).toBe(40); // 2 x 20
    const debit = pair!.lines.find((l) => Number(l.debit) > 0)!;
    const credit = pair!.lines.find((l) => Number(l.credit) > 0)!;
    expect(debit.ledgerAccountId).toBe(A.inventory);
    expect(credit.ledgerAccountId).toBe(A.cogs);

    // Espelho da venda continua intacto (3 linhas: D 411 / D 221 / C 121).
    const [mirror] = await entriesFor(CA, 'CREDIT_NOTE', nc.id, 'CREDIT_NOTE_ISSUED');
    expect(mirror!.lines).toHaveLength(3);

    await prisma.product.update({ where: { id: A.prodStd }, data: { avgCost: 15.5 } });
  });

  it('#8 NC sem devolucao (so valor): sem par de existencias', async () => {
    const inv = await createInvoice(prisma, salesCtx, invoiceInput({ lines: [{ productId: A.prodStd, quantity: 2, discountPercent: 0 }] }));
    const invLines = await prisma.invoiceLine.findMany({ where: { companyId: CA, invoiceId: inv.id } });
    const nc = await createCreditNote(prisma, salesCtx, {
      idempotencyKey: randomUUID(),
      issueDate: TODAY,
      invoiceId: inv.id,
      reason: 'Correccao de valor sem devolucao',
      returnStock: false,
      lines: [{ invoiceLineId: invLines[0]!.id, quantity: 1 }],
    });
    expect(await entriesFor(CA, 'CREDIT_NOTE', nc.id, 'CREDIT_NOTE_ISSUED')).toHaveLength(1);
    expect(await entriesFor(CA, 'CREDIT_NOTE', nc.id, 'CREDIT_NOTE_COGS_REVERSED')).toHaveLength(0);
  });

  it('#9 cancelamento: estorna SALE_ISSUED E COGS_POSTED; replay devolve os mesmos ids', async () => {
    const inv = await createInvoice(prisma, salesCtx, invoiceInput({ lines: [{ productId: A.prodStd, quantity: 3, discountPercent: 0 }] }));
    const key = randomUUID();
    const result = await cancelInvoice(prisma, salesCtx, {
      idempotencyKey: key,
      invoiceId: inv.id,
      cancellationDate: TODAY,
      cancellationReason: 'Cancelamento de teste S10a',
    });
    expect(result.accountingReversalId).toBeTruthy();
    expect(result.cogsReversalId).toBeTruthy();

    const [sale] = await entriesFor(CA, 'INVOICE', inv.id, 'SALE_ISSUED');
    const [cogs] = await entriesFor(CA, 'INVOICE', inv.id, 'COGS_POSTED');
    expect(sale!.status).toBe('REVERSED');
    expect(cogs!.status).toBe('REVERSED');

    // Estorno do CMV com linhas invertidas: D 131 / C 511, mesmo valor.
    const cogsReversal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: result.cogsReversalId! }, include: { lines: true } });
    expect(cogsReversal.reversalOfId).toBe(cogs!.id);
    expect(Number(cogsReversal.totalDebit)).toBe(46.5);
    expect(cogsReversal.lines.find((l) => Number(l.debit) > 0)!.ledgerAccountId).toBe(A.inventory);
    expect(cogsReversal.lines.find((l) => Number(l.credit) > 0)!.ledgerAccountId).toBe(A.cogs);

    const replay = await cancelInvoice(prisma, salesCtx, {
      idempotencyKey: key,
      invoiceId: inv.id,
      cancellationDate: TODAY,
      cancellationReason: 'Cancelamento de teste S10a',
    });
    expect(replay.accountingReversalId).toBe(result.accountingReversalId);
    expect(replay.cogsReversalId).toBe(result.cogsReversalId);
  });

  it('#10 cancelamento de factura SEM CMV (como as pre-S10): cogsReversalId null e sem erro', async () => {
    const inv = await createInvoice(prisma, salesCtx, invoiceInput({ lines: [{ productId: A.prodZero, quantity: 1, discountPercent: 0 }] }));
    const result = await cancelInvoice(prisma, salesCtx, {
      idempotencyKey: randomUUID(),
      invoiceId: inv.id,
      cancellationDate: TODAY,
      cancellationReason: 'Cancelamento sem CMV',
    });
    expect(result.accountingReversalId).toBeTruthy();
    expect(result.cogsReversalId).toBeNull();
    const [sale] = await entriesFor(CA, 'INVOICE', inv.id, 'SALE_ISSUED');
    expect(sale!.status).toBe('REVERSED');
  });

  it('#11 mapping COST_OF_GOODS_SOLD/INVENTORY em falta: emissao falha por inteiro, sem fallback', async () => {
    const before = {
      invoices: await prisma.invoice.count({ where: { companyId: CB } }),
      entries: await prisma.journalEntry.count({ where: { companyId: CB } }),
      stock: (await prisma.stockLevel.findFirstOrThrow({ where: { companyId: CB, productId: B.product } })).quantity,
    };
    await expect(
      createInvoice(prisma, salesCtxB, {
        idempotencyKey: randomUUID(),
        issueDate: TODAY,
        customerId: B.customer,
        warehouseId: B.warehouse,
        lines: [{ productId: B.product, quantity: 1, discountPercent: 0 }],
      }),
    ).rejects.toThrowError(/mapping contabil/i);
    expect(await prisma.invoice.count({ where: { companyId: CB } })).toBe(before.invoices);
    expect(await prisma.journalEntry.count({ where: { companyId: CB } })).toBe(before.entries);
    expect((await prisma.stockLevel.findFirstOrThrow({ where: { companyId: CB, productId: B.product } })).quantity).toBe(before.stock);
  });

  it('#12 isolamento A/B: lancamentos de A so usam contas de A; a 131 de A nao e tocada por B', async () => {
    const aBalanceBefore = await inventoryBalance(CA, A.inventory);
    await expect(
      createInvoice(prisma, salesCtxB, {
        idempotencyKey: randomUUID(),
        issueDate: TODAY,
        customerId: B.customer,
        warehouseId: B.warehouse,
        lines: [{ productId: B.product, quantity: 1, discountPercent: 0 }],
      }),
    ).rejects.toThrowError(/mapping contabil/i);
    expect(await inventoryBalance(CA, A.inventory)).toBe(aBalanceBefore);
    const foreignLines = await prisma.journalEntryLine.count({ where: { companyId: CB, ledgerAccountId: A.inventory } });
    expect(foreignLines).toBe(0);
  });

  it('#13 COERENCIA 131: abertura S8 + compra + CMV + NC + cancelamento + contagem S9 => saldo 131 = stock fisico ao avgCost', async () => {
    // 1) Abertura S8: P1 10 x 10.00 (D131/C312 100) e P2 5 x 8.00 (40).
    const p1 = await createProduct(prisma, fullCtxC, { sku: 'C-P1', name: 'Coerencia P1', unit: 'un', salePrice: 100, avgCost: 1, taxRate: 16, minStock: 0 }, {
      initialStock: { quantity: 10, unitCost: 10, warehouseId: C.warehouse },
    });
    const p2 = await createProduct(prisma, fullCtxC, { sku: 'C-P2', name: 'Coerencia P2', unit: 'un', salePrice: 60, avgCost: 1, taxRate: 0, minStock: 0 }, {
      initialStock: { quantity: 5, unitCost: 8, warehouseId: C.warehouse },
    });

    // 2) Compra P1 10 x 20.00 -> avgCost 15.00 (D131 200).
    const po = await createPurchaseOrder(prisma, fullCtxC, {
      supplierId: C.supplier,
      warehouseId: C.warehouse,
      lines: [{ productId: p1.id, quantity: 10, unitCost: 20 }],
    });
    await approvePurchaseOrder(prisma, fullCtxC, po.id);
    const poLines = await prisma.purchaseOrderLine.findMany({ where: { companyId: CC, orderId: po.id } });
    await receivePurchaseOrder(prisma, fullCtxC, po.id, [{ lineId: poLines[0]!.id, quantity: 10 }], { idempotencyKey: randomUUID() });
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: p1.id } })).avgCost)).toBe(15);

    // 3) Venda 4 x P1 -> CMV 60 (C131 60).
    const inv1 = await createInvoice(prisma, fullCtxC, {
      idempotencyKey: randomUUID(),
      issueDate: TODAY,
      customerId: C.customer,
      warehouseId: C.warehouse,
      lines: [{ productId: p1.id, quantity: 4, discountPercent: 0 }],
    });

    // 4) NC com devolucao de 1 x P1 -> par D131 15.
    const inv1Lines = await prisma.invoiceLine.findMany({ where: { companyId: CC, invoiceId: inv1.id } });
    await createCreditNote(prisma, fullCtxC, {
      idempotencyKey: randomUUID(),
      issueDate: TODAY,
      invoiceId: inv1.id,
      reason: 'Devolucao de uma unidade',
      returnStock: true,
      lines: [{ invoiceLineId: inv1Lines[0]!.id, quantity: 1 }],
    });

    // 5) Venda 2 x P1 cancelada -> CMV lancado e estornado (efeito liquido 0, stock reposto).
    const inv2 = await createInvoice(prisma, fullCtxC, {
      idempotencyKey: randomUUID(),
      issueDate: TODAY,
      customerId: C.customer,
      warehouseId: C.warehouse,
      lines: [{ productId: p1.id, quantity: 2, discountPercent: 0 }],
    });
    await cancelInvoice(prisma, fullCtxC, {
      idempotencyKey: randomUUID(),
      invoiceId: inv2.id,
      cancellationDate: TODAY,
      cancellationReason: 'Cancelamento no teste de coerencia',
    });

    // 6) Contagem S9: P1 excedente +2 (D131 30) e P2 deficit -3 (C131 24).
    const p1Level = await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: p1.id, warehouseId: C.warehouse } } });
    const p2Level = await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: p2.id, warehouseId: C.warehouse } } });
    expect(p1Level.quantity).toBe(17); // 10 + 10 - 4 + 1 (- 2 + 2 do cancelamento)
    expect(p2Level.quantity).toBe(5);
    const count = await createStockCount(prisma, fullCtxC, {
      warehouseId: C.warehouse,
      lines: [
        { productId: p1.id, countedQty: p1Level.quantity + 2 },
        { productId: p2.id, countedQty: p2Level.quantity - 3 },
      ],
    });
    await validateStockCount(prisma, fullCtxC, { stockCountId: count.id }, { idempotencyKey: randomUUID() });

    // Igualdade-ancora: saldo 131 = stock fisico valorizado ao avgCost corrente.
    const balance = await inventoryBalance(CC, C.inventory);
    const physical = await physicalStockValue(CC);
    // 100 + 40 + 200 - 60 + 15 + (30 - 24) = 301; fisico: 19 x 15 + 2 x 8 = 301.
    expect(balance).toBe(301);
    expect(physical).toBe(301);
    expect(balance).toBe(physical);
  });

  it('#14 validacao de entrada: helper rejeita direccoes invalidas por construcao (linhas equilibradas por definicao)', async () => {
    // O helper recebe as linhas (qtd x unitCost) e calcula o total com a formula
    // unica inventoryCostTotal; um lancamento CMV nunca pode nascer desequilibrado
    // porque debito e credito derivam do MESMO valor.
    const entries = await prisma.journalEntry.findMany({
      where: { companyId: CA, accountingEvent: { in: ['COGS_POSTED', 'CREDIT_NOTE_COGS_REVERSED'] } },
      include: { lines: true },
    });
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(Number(e.totalDebit)).toBe(Number(e.totalCredit));
      expect(e.lines).toHaveLength(2);
      const sum = e.lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
      expect(round2(sum)).toBe(0);
    }
  });
});
