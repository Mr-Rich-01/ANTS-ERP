/**
 * Suite de INTEGRACAO da Sessao S11 — demonstracoes financeiras.
 * Correr com: `pnpm test:integration:accounting:statements` (exige DATABASE_URL).
 *
 * TESTE-ANCORA da sessao: numa empresa de teste com movimento completo
 * (abertura S8 + compra + venda com CMV + recibo + NC com devolucao + contagem
 * S9 + ND + regularizacao S10c + lancamentos manuais), o Balanco FECHA
 * (Activo = Passivo + Capital Proprio) e o resultado e validado A TRES PONTAS:
 * valor calculado A MAO a partir do cenario == DR.netResult ==
 * balanco.currentYearResult — nenhum relatorio serve de oraculo ao outro
 * (caminhos de query independentes; ver accounting-statements.ts).
 * Cobre ainda: DR por grupos (41 liquida de NC, 42 com 421+422, 51 liquida da
 * devolucao, 55), Balanco a data intermedia sem misturar exercicios, DFC
 * directo (rubricas por evento, estorno na rubrica do original, transferencia
 * caixa<->caixa excluida, reconciliacao com a Tesouraria), selector de colunas
 * do balancete, permissoes e isolamento A/B.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { civilDateInTimeZone, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { ForbiddenError } from './errors';
import { createInvoice, createPayment, reverseCustomerPayment } from './invoices';
import { createCreditNote, createDebitNote } from './commercial-documents';
import { createProduct } from './products';
import { approvePurchaseOrder, createPurchaseOrder, createSupplierPayment, receivePurchaseOrder } from './purchases';
import { createStockCount, validateStockCount } from './stock-counts';
import { executeInventoryRegularization, getInventoryRegularizationPreview } from './inventory-regularization';
import {
  DEFAULT_TRIAL_BALANCE_COLUMNS,
  createJournalEntryDraft,
  exportTrialBalanceCsv,
  parseTrialBalanceColumns,
  postJournalEntry,
} from './accounting';
import {
  exportBalanceSheetCsv,
  exportCashFlowStatementCsv,
  exportIncomeStatementCsv,
  getBalanceSheetReport,
  getCashFlowStatementReport,
  getIncomeStatementReport,
} from './accounting-statements';

const CA = 'smoke-stmt';
const CB = 'smoke-stmt-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const TODAY = civilDateInTimeZone();
/** Datas dos lancamentos manuais «antigos» (testes de data intermedia/sub-periodo). */
const EARLY = '2026-01-10';
const CUTOFF = '2026-01-31';
const MID_FROM = '2026-02-01';
const YEAR_FROM = '2026-01-01';
const YEAR_TO = '2026-12-31';

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const fullCtx = ctx(CA, [
  'products.create',
  'purchases.create',
  'purchases.approve',
  'sales.create',
  'payments.receive',
  'payments.cancel',
  'stock.view',
  'stock.adjust',
  'accounting.view',
  'accounting.prepare',
  'accounting.post',
  'reports.export',
]);
const viewCtx = ctx(CA, ['accounting.view']);
const noViewCtx = ctx(CA, ['sales.create']);
const ctxB = ctx(CB, ['sales.create', 'accounting.view']);

interface CompanyRefs {
  customer: string;
  warehouse: string;
  supplier: string;
  cashLedger: string;
  bankLedger: string;
  expenseLedger: string;
  capitalLedger: string;
  cashTreasury: string;
  generalJournalId: string;
  p1: string;
  p2: string;
}
let A!: CompanyRefs;
let B!: { customer: string; warehouse: string; product: string };

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.supplierPayment.deleteMany({ where: { companyId } });
  await prisma.debitNoteLine.deleteMany({ where: { companyId } });
  await prisma.debitNote.deleteMany({ where: { companyId } });
  await prisma.creditNoteLine.deleteMany({ where: { companyId } });
  await prisma.stockMovement.updateMany({ where: { companyId }, data: { creditNoteId: null } });
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
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: { gte: 3 } } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: { gte: 2 } } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId } });
  await prisma.accountingJournal.deleteMany({ where: { companyId } });
  await prisma.documentCounter.deleteMany({ where: { companyId } });
  await prisma.supplier.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function provision() {
  // Empresa A: plano HIERARQUICO (raiz -> grupo nivel 2 -> conta de movimento
  // nivel 3) para exercitar a agregacao por grupo via parentId.
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Demonstracoes A' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D(YEAR_FROM), endDate: D(YEAR_TO), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026', name: '2026', startDate: D(YEAR_FROM), endDate: D(YEAR_TO), status: 'OPEN' } });
  const dg = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DG', name: 'Geral', journalType: 'GENERAL', sequencePrefix: 'LG' } });
  await prisma.accountingJournal.createMany({
    data: [
      { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' },
      { companyId: CA, code: 'DC', name: 'Compras', journalType: 'PURCHASES', sequencePrefix: 'LC' },
      { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' },
      { companyId: CA, code: 'DAB', name: 'Abertura', journalType: 'OPENING', sequencePrefix: 'AB' },
      { companyId: CA, code: 'DAJ', name: 'Ajustamentos', journalType: 'ADJUSTMENT', sequencePrefix: 'AJ' },
    ],
  });

  const root = async (code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT') =>
    prisma.ledgerAccount.create({ data: { companyId: CA, code, name, accountType, normalBalance, level: 1, isPosting: false } });
  const group = async (parentId: string, code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT') =>
    prisma.ledgerAccount.create({ data: { companyId: CA, code, name, accountType, normalBalance, level: 2, parentId, isPosting: false } });
  const posting = async (parentId: string, code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT') =>
    prisma.ledgerAccount.create({ data: { companyId: CA, code, name, accountType, normalBalance, level: 3, parentId, isPosting: true } });

  const r1 = await root('1', 'Activo', 'ASSET', 'DEBIT');
  const r2 = await root('2', 'Passivo', 'LIABILITY', 'CREDIT');
  const r3 = await root('3', 'Capital proprio', 'EQUITY', 'CREDIT');
  const r4 = await root('4', 'Proveitos', 'REVENUE', 'CREDIT');
  const r5 = await root('5', 'Custos e perdas', 'EXPENSE', 'DEBIT');
  const g11 = await group(r1.id, '11', 'Meios monetarios', 'ASSET', 'DEBIT');
  const g12 = await group(r1.id, '12', 'Clientes', 'ASSET', 'DEBIT');
  const g13 = await group(r1.id, '13', 'Inventario', 'ASSET', 'DEBIT');
  const g14 = await group(r1.id, '14', 'Estado (activo)', 'ASSET', 'DEBIT');
  const g21 = await group(r2.id, '21', 'Fornecedores', 'LIABILITY', 'CREDIT');
  const g22 = await group(r2.id, '22', 'Estado (passivo)', 'LIABILITY', 'CREDIT');
  const g31 = await group(r3.id, '31', 'Capital', 'EQUITY', 'CREDIT');
  const g32 = await group(r3.id, '32', 'Resultados', 'EQUITY', 'CREDIT');
  const g41 = await group(r4.id, '41', 'Vendas', 'REVENUE', 'CREDIT');
  const g42 = await group(r4.id, '42', 'Outros proveitos', 'REVENUE', 'CREDIT');
  const g51 = await group(r5.id, '51', 'Custo das vendas', 'EXPENSE', 'DEBIT');
  const g53 = await group(r5.id, '53', 'Fornecimentos e servicos', 'EXPENSE', 'DEBIT');
  const g55 = await group(r5.id, '55', 'Perdas de inventario', 'EXPENSE', 'DEBIT');

  const cash = await posting(g11.id, '111', 'Caixa', 'ASSET', 'DEBIT');
  const bank = await posting(g11.id, '112', 'Bancos', 'ASSET', 'DEBIT');
  const ar = await posting(g12.id, '121', 'Clientes c/c', 'ASSET', 'DEBIT');
  const inventory = await posting(g13.id, '131', 'Mercadorias', 'ASSET', 'DEBIT');
  const vatIn = await posting(g14.id, '141', 'IVA dedutivel', 'ASSET', 'DEBIT');
  const ap = await posting(g21.id, '211', 'Fornecedores c/c', 'LIABILITY', 'CREDIT');
  const vatOut = await posting(g22.id, '221', 'IVA liquidado', 'LIABILITY', 'CREDIT');
  const capital = await posting(g31.id, '311', 'Capital social', 'EQUITY', 'CREDIT');
  const opening = await posting(g31.id, '312', 'Regularizacao de abertura de existencias', 'EQUITY', 'CREDIT');
  await posting(g32.id, '321', 'Resultado do exercicio', 'EQUITY', 'CREDIT');
  await posting(g32.id, '322', 'Resultados transitados', 'EQUITY', 'CREDIT');
  const revenue = await posting(g41.id, '411', 'Vendas de mercadorias', 'REVENUE', 'CREDIT');
  const surplus = await posting(g42.id, '421', 'Excedentes de inventario', 'REVENUE', 'CREDIT');
  const otherIncome = await posting(g42.id, '422', 'Outros proveitos operacionais', 'REVENUE', 'CREDIT');
  const cogs = await posting(g51.id, '511', 'Custo das mercadorias vendidas', 'EXPENSE', 'DEBIT');
  const expense = await posting(g53.id, '531', 'Despesas gerais', 'EXPENSE', 'DEBIT');
  const shortage = await posting(g55.id, '551', 'Deficits de inventario', 'EXPENSE', 'DEBIT');

  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar.id },
      { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue.id },
      { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: vatOut.id },
      { companyId: CA, systemKey: 'VAT_INPUT', ledgerAccountId: vatIn.id },
      { companyId: CA, systemKey: 'ACCOUNTS_PAYABLE', ledgerAccountId: ap.id },
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory.id },
      { companyId: CA, systemKey: 'COST_OF_GOODS_SOLD', ledgerAccountId: cogs.id },
      { companyId: CA, systemKey: 'OPENING_BALANCE_EQUITY', ledgerAccountId: opening.id },
      { companyId: CA, systemKey: 'INVENTORY_SURPLUS', ledgerAccountId: surplus.id },
      { companyId: CA, systemKey: 'INVENTORY_SHORTAGE', ledgerAccountId: shortage.id },
      { companyId: CA, systemKey: 'OTHER_INCOME', ledgerAccountId: otherIncome.id },
      { companyId: CA, systemKey: 'CASH_MAIN', ledgerAccountId: cash.id },
    ],
  });
  const cashTreasury = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa', type: 'CASH', ledgerAccountId: cash.id } });
  await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Banco', type: 'BANK', ledgerAccountId: bank.id } });

  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente Demonstracoes', paymentTermDays: 30 } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const supplier = await prisma.supplier.create({ data: { companyId: CA, name: 'Fornecedor Demonstracoes' } });

  A = {
    customer: customer.id,
    warehouse: warehouse.id,
    supplier: supplier.id,
    cashLedger: cash.id,
    bankLedger: bank.id,
    expenseLedger: expense.id,
    capitalLedger: capital.id,
    cashTreasury: cashTreasury.id,
    generalJournalId: dg.id,
    p1: '',
    p2: '',
  };

  // Empresa B (isolamento): minimo para emitir uma factura sem CMV (avgCost 0).
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Demonstracoes B' } });
  const fyB = await prisma.fiscalYear.create({ data: { companyId: CB, name: '2026', startDate: D(YEAR_FROM), endDate: D(YEAR_TO), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CB, fiscalYearId: fyB.id, periodNumber: 1, code: '2026', name: '2026', startDate: D(YEAR_FROM), endDate: D(YEAR_TO), status: 'OPEN' } });
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
  const productB = await prisma.product.create({ data: { companyId: CB, sku: 'B-1', name: 'Produto B', salePrice: 40, taxRate: 0, avgCost: 0 } });
  await prisma.stockLevel.create({ data: { companyId: CB, productId: productB.id, warehouseId: warehouseB.id, quantity: 100 } });
  B = { customer: customerB.id, warehouse: warehouseB.id, product: productB.id };
}

/** Constrói o movimento completo do cenário (valores comentados = «terceira ponta» à mão). */
async function buildScenario() {
  const postManual = async (entryDate: string, description: string, lines: Array<{ ledgerAccountId: string; debit?: number; credit?: number }>) => {
    const draft = await createJournalEntryDraft(prisma, fullCtx, { journalId: A.generalJournalId, entryDate, description, lines });
    await postJournalEntry(prisma, fullCtx, draft.id);
  };

  // (a) Capital em dinheiro (EARLY): D111 500 / C311 500 -> DFC financiamento.
  await postManual(EARLY, 'Entrada de capital em dinheiro', [
    { ledgerAccountId: A.cashLedger, debit: 500 },
    { ledgerAccountId: A.capitalLedger, credit: 500 },
  ]);
  // (b) Despesa manual em dinheiro (EARLY): D531 25 / C111 25 -> DFC outros operacionais.
  await postManual(EARLY, 'Despesa geral paga em dinheiro', [
    { ledgerAccountId: A.expenseLedger, debit: 25 },
    { ledgerAccountId: A.cashLedger, credit: 25 },
  ]);

  // (c) Abertura S8: P1 10 x 100 (D131 1000 / C312 1000), P2 5 x 50 (D131 250 / C312 250).
  const p1 = await createProduct(prisma, fullCtx, { sku: 'S-P1', name: 'Produto Principal', unit: 'un', salePrice: 200, avgCost: 1, taxRate: 16, minStock: 0 }, {
    initialStock: { quantity: 10, unitCost: 100, warehouseId: A.warehouse },
  });
  const p2 = await createProduct(prisma, fullCtx, { sku: 'S-P2', name: 'Produto Secundario', unit: 'un', salePrice: 60, avgCost: 1, taxRate: 0, minStock: 0 }, {
    initialStock: { quantity: 5, unitCost: 50, warehouseId: A.warehouse },
  });
  A.p1 = p1.id;
  A.p2 = p2.id;

  // (d) Compra P1 10 x 120 (IVA 16%): D131 1200 / D141 192 / C211 1392. avgCost -> 110.
  const po = await createPurchaseOrder(prisma, fullCtx, {
    supplierId: A.supplier,
    warehouseId: A.warehouse,
    lines: [{ productId: p1.id, quantity: 10, unitCost: 120 }],
  });
  await approvePurchaseOrder(prisma, fullCtx, po.id);
  const poLines = await prisma.purchaseOrderLine.findMany({ where: { companyId: CA, orderId: po.id } });
  await receivePurchaseOrder(prisma, fullCtx, po.id, [{ lineId: poLines[0]!.id, quantity: 10 }], { idempotencyKey: randomUUID() });

  // (e) Venda 5 x P1 @ 200 + IVA: D121 1160 / C411 1000 / C221 160; CMV D511 550 / C131 550.
  const invoice = await createInvoice(prisma, fullCtx, {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    customerId: A.customer,
    warehouseId: A.warehouse,
    lines: [{ productId: p1.id, quantity: 5, discountPercent: 0 }],
  });

  // (f) Recibo parcial de 800 em caixa: D111 800 / C121 800.
  await createPayment(prisma, fullCtx, {
    idempotencyKey: randomUUID(),
    invoiceId: invoice.id,
    amount: 800,
    method: 'CASH',
    accountId: A.cashTreasury,
  });

  // (g) NC de 1 unidade com devolucao: D411 200 / D221 32 / C121 232; par D131 110 / C511 110.
  const invoiceLines = await prisma.invoiceLine.findMany({ where: { companyId: CA, invoiceId: invoice.id } });
  await createCreditNote(prisma, fullCtx, {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    invoiceId: invoice.id,
    reason: 'Devolucao de uma unidade',
    returnStock: true,
    lines: [{ invoiceLineId: invoiceLines[0]!.id, quantity: 1 }],
  });

  // (h) Pagamento a fornecedor de 392 em caixa: D211 392 / C111 392.
  await createSupplierPayment(prisma, fullCtx, {
    idempotencyKey: randomUUID(),
    supplierId: A.supplier,
    purchaseOrderId: po.id,
    amount: 392,
    method: 'CASH',
    accountId: A.cashTreasury,
  });

  // (i) Contagem S9: P1 16 -> 17 (excedente D131 110 / C421 110), P2 5 -> 4 (deficit D551 50 / C131 50).
  const count = await createStockCount(prisma, fullCtx, {
    warehouseId: A.warehouse,
    lines: [
      { productId: p1.id, countedQty: 17 },
      { productId: p2.id, countedQty: 4 },
    ],
  });
  await validateStockCount(prisma, fullCtx, { stockCountId: count.id }, { idempotencyKey: randomUUID() });

  // (j) ND sem IVA: D121 100 / C422 100.
  await createDebitNote(prisma, fullCtx, {
    idempotencyKey: randomUUID(),
    issueDate: TODAY,
    customerId: A.customer,
    reason: 'Juros de mora do periodo',
    lines: [{ description: 'Juros de mora', quantity: 1, unitPrice: 100, taxRate: 0 }],
  });

  // (k) Stock legado sem contabilidade (P3 10 x 30) + regularizacao S10c: D131 300 / C312 300.
  const p3 = await prisma.product.create({ data: { companyId: CA, sku: 'S-P3', name: 'Produto Legado', salePrice: 90, taxRate: 0, avgCost: 30 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: p3.id, warehouseId: A.warehouse, quantity: 10 } });
  const preview = await getInventoryRegularizationPreview(prisma, fullCtx);
  expect(preview.divergence).toBe(300);
  await executeInventoryRegularization(prisma, fullCtx, { expectedDivergence: preview.divergence }, { idempotencyKey: randomUUID() });
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await provision();
  await buildScenario();
}, 120_000);

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.$disconnect();
});

// ── Valores esperados calculados À MÃO a partir do cenário (terceira ponta) ──
const EXPECTED = {
  cash: 883, // 500 - 25 + 800 - 392
  ar: 228, // 1160 - 800 - 232 + 100
  inventory: 2370, // 1000 + 250 + 1200 - 550 + 110 + 110 - 50 + 300 = fisico: 17x110 + 4x50 + 10x30
  vatIn: 192,
  ap: 1000, // 1392 - 392
  vatOut: 128, // 160 - 32
  capital: 500,
  openingEquity: 1550, // 1000 + 250 + 300
  sales: 800, // 1000 - 200 (liquida da NC)
  surplus: 110,
  otherIncome: 100,
  cogs: 440, // 550 - 110 (liquida da devolucao)
  generalExpense: 25,
  shortage: 50,
  result: 495, // (800 + 110 + 100) - (440 + 25 + 50)
  totalAssets: 3673, // 883 + 228 + 2370 + 192
  totalLiabilities: 1128, // 1000 + 128
  equityAccounts: 2050, // 500 + 1550
};

function groupByCode(rows: Array<{ code: string; amount: number; accounts: Array<{ code: string; amount: number }> }>, code: string) {
  return rows.find((r) => r.code === code);
}

describe('S11 — demonstracoes financeiras', () => {
  it('#1 TESTE-ANCORA: o Balanco FECHA (Activo = Passivo + Capital Proprio) com totais calculados a mao', async () => {
    const b = await getBalanceSheetReport(prisma, fullCtx, { to: YEAR_TO });
    expect(b.totalAssets).toBe(EXPECTED.totalAssets);
    expect(b.totalLiabilities).toBe(EXPECTED.totalLiabilities);
    expect(b.totalEquityAccounts).toBe(EXPECTED.equityAccounts);
    expect(b.totalEquity).toBe(round2(EXPECTED.equityAccounts + EXPECTED.result));
    expect(b.totalLiabilitiesAndEquity).toBe(EXPECTED.totalAssets);
    expect(b.isBalanced).toBe(true);
  });

  it('#2 TESTE-ANCORA: resultado a tres pontas — valor a mao == DR == linha do Capital Proprio do Balanco', async () => {
    const dr = await getIncomeStatementReport(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO });
    const b = await getBalanceSheetReport(prisma, fullCtx, { to: YEAR_TO });
    expect(dr.netResult).toBe(EXPECTED.result);
    expect(b.currentYearResult).toBe(EXPECTED.result);
    expect(b.priorYearsResult).toBe(0);
    expect(dr.netResult).toBe(b.currentYearResult);
  });

  it('#3 DR por grupos: 41 liquida de NC, 42 = 421 + 422, 51 liquida da devolucao, 53 e 55; sem grupos sem movimento', async () => {
    const dr = await getIncomeStatementReport(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO });
    expect(groupByCode(dr.revenue, '41')?.amount).toBe(EXPECTED.sales);
    const g42 = groupByCode(dr.revenue, '42');
    expect(g42?.amount).toBe(round2(EXPECTED.surplus + EXPECTED.otherIncome));
    expect(g42?.accounts.find((a) => a.code === '421')?.amount).toBe(EXPECTED.surplus);
    expect(g42?.accounts.find((a) => a.code === '422')?.amount).toBe(EXPECTED.otherIncome);
    expect(groupByCode(dr.expenses, '51')?.amount).toBe(EXPECTED.cogs);
    expect(groupByCode(dr.expenses, '53')?.amount).toBe(EXPECTED.generalExpense);
    expect(groupByCode(dr.expenses, '55')?.amount).toBe(EXPECTED.shortage);
    expect(dr.revenue.map((r) => r.code)).toEqual(['41', '42']);
    expect(dr.expenses.map((r) => r.code)).toEqual(['51', '53', '55']);
    expect(dr.totalRevenue).toBe(round2(EXPECTED.sales + EXPECTED.surplus + EXPECTED.otherIncome));
    expect(dr.totalExpenses).toBe(round2(EXPECTED.cogs + EXPECTED.generalExpense + EXPECTED.shortage));
  });

  it('#4 seccoes do Balanco contra valores a mao: 131 = stock fisico, 121, grupo 11, 141, 211, 221 e a 312 no grupo 31', async () => {
    const b = await getBalanceSheetReport(prisma, fullCtx, { to: YEAR_TO });
    const g11 = groupByCode(b.assets, '11');
    expect(g11?.amount).toBe(EXPECTED.cash);
    expect(groupByCode(b.assets, '12')?.amount).toBe(EXPECTED.ar);
    const g13 = groupByCode(b.assets, '13');
    expect(g13?.amount).toBe(EXPECTED.inventory);
    // A 131 tem de coincidir com o stock fisico valorizado ao avgCost (pos-regularizacao).
    const levels = await prisma.stockLevel.findMany({ where: { companyId: CA }, include: { product: { select: { avgCost: true } } } });
    const physical = round2(levels.reduce((sum, l) => sum + round2(l.quantity * round2(Number(l.product.avgCost))), 0));
    expect(g13?.amount).toBe(physical);
    expect(groupByCode(b.assets, '14')?.amount).toBe(EXPECTED.vatIn);
    expect(groupByCode(b.liabilities, '21')?.amount).toBe(EXPECTED.ap);
    expect(groupByCode(b.liabilities, '22')?.amount).toBe(EXPECTED.vatOut);
    const g31 = groupByCode(b.equity, '31');
    expect(g31?.amount).toBe(EXPECTED.equityAccounts);
    expect(g31?.accounts.find((a) => a.code === '311')?.amount).toBe(EXPECTED.capital);
    expect(g31?.accounts.find((a) => a.code === '312')?.amount).toBe(EXPECTED.openingEquity);
    // 321/322 sem movimento: o grupo 32 nao aparece.
    expect(groupByCode(b.equity, '32')).toBeUndefined();
  });

  it('#5 Balanco a data intermedia: so os lancamentos ate a data entram e o Balanco continua a fechar', async () => {
    const b = await getBalanceSheetReport(prisma, fullCtx, { to: CUTOFF });
    // Ate 31/01 so existem os dois lancamentos manuais de EARLY: caixa 475, capital 500, resultado -25.
    expect(b.totalAssets).toBe(475);
    expect(groupByCode(b.assets, '11')?.amount).toBe(475);
    expect(b.totalLiabilities).toBe(0);
    expect(b.totalEquityAccounts).toBe(500);
    expect(b.currentYearResult).toBe(-25);
    expect(b.priorYearsResult).toBe(0);
    expect(b.isBalanced).toBe(true);
  });

  it('#6 DFC directo: rubricas por evento/contrapartida, variacao e caixa final = grupo 11 do Balanco', async () => {
    const f = await getCashFlowStatementReport(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO });
    expect(f.operating.find((l) => l.key === 'customer-receipts')?.amount).toBe(800);
    expect(f.operating.find((l) => l.key === 'supplier-payments')?.amount).toBe(-392);
    expect(f.operating.find((l) => l.key === 'other-operating')?.amount).toBe(-25);
    expect(f.financing.find((l) => l.key === 'equity-flows')?.amount).toBe(500);
    expect(f.investing).toHaveLength(0);
    expect(f.operatingTotal).toBe(383); // 800 - 392 - 25
    expect(f.financingTotal).toBe(500);
    expect(f.netChange).toBe(EXPECTED.cash);
    expect(f.openingCash).toBe(0);
    expect(f.closingCash).toBe(EXPECTED.cash);
    expect(f.internalTransferCount).toBe(0);
    const b = await getBalanceSheetReport(prisma, fullCtx, { to: YEAR_TO });
    expect(f.closingCash).toBe(groupByCode(b.assets, '11')?.amount);
  });

  it('#7 DFC de sub-periodo: caixa inicial herda os fluxos anteriores ao periodo', async () => {
    const f = await getCashFlowStatementReport(prisma, fullCtx, { from: MID_FROM, to: YEAR_TO });
    expect(f.openingCash).toBe(475); // 500 - 25 de EARLY
    expect(f.netChange).toBe(408); // 800 - 392
    expect(f.closingCash).toBe(EXPECTED.cash);
    expect(f.operating.find((l) => l.key === 'other-operating')).toBeUndefined();
    expect(f.financing).toHaveLength(0);
  });

  it('#8 reconciliacao com a Tesouraria: diferenca = lancamentos de caixa sem movimento de tesouraria (manuais)', async () => {
    const f = await getCashFlowStatementReport(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO });
    expect(f.treasury.totalIn).toBe(800);
    expect(f.treasury.totalOut).toBe(392);
    expect(f.treasury.net).toBe(408);
    // Os dois manuais (capital +500, despesa -25) nao existem na Tesouraria: 408 - 883 = -475.
    expect(f.treasury.difference).toBe(-475);
  });

  it('#9 estorno de recebimento cai na rubrica do original com sinal contrario (via reversalOf)', async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { companyId: CA, status: { in: ['ISSUED', 'PARTIAL', 'PAID'] } } });
    const payment = await createPayment(prisma, fullCtx, {
      idempotencyKey: randomUUID(),
      invoiceId: invoice.id,
      amount: 100,
      method: 'CASH',
      accountId: A.cashTreasury,
    });
    await reverseCustomerPayment(prisma, fullCtx, {
      paymentId: payment.id,
      idempotencyKey: randomUUID(),
      reversalReason: 'Anulacao para teste de classificacao do DFC',
      reversalDate: TODAY,
    });
    const f = await getCashFlowStatementReport(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO });
    // +100 (original REVERSED) e -100 (estorno POSTED) na MESMA rubrica: liquido continua 800.
    expect(f.operating.find((l) => l.key === 'customer-receipts')?.amount).toBe(800);
    expect(f.netChange).toBe(EXPECTED.cash);
    expect(f.closingCash).toBe(EXPECTED.cash);
  });

  it('#10 transferencia caixa<->caixa e movimento interno: fora das rubricas, caixa total intacta', async () => {
    const draft = await createJournalEntryDraft(prisma, fullCtx, {
      journalId: A.generalJournalId,
      entryDate: TODAY,
      description: 'Deposito de caixa no banco',
      lines: [
        { ledgerAccountId: A.bankLedger, debit: 50 },
        { ledgerAccountId: A.cashLedger, credit: 50 },
      ],
    });
    await postJournalEntry(prisma, fullCtx, draft.id);
    const f = await getCashFlowStatementReport(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO });
    expect(f.internalTransferCount).toBe(1);
    expect(f.netChange).toBe(EXPECTED.cash);
    expect(f.closingCash).toBe(EXPECTED.cash);
    const b = await getBalanceSheetReport(prisma, fullCtx, { to: YEAR_TO });
    const g11 = groupByCode(b.assets, '11');
    expect(g11?.amount).toBe(EXPECTED.cash);
    expect(g11?.accounts.find((a) => a.code === '111')?.amount).toBe(round2(EXPECTED.cash - 50));
    expect(g11?.accounts.find((a) => a.code === '112')?.amount).toBe(50);
    expect(b.isBalanced).toBe(true);
  });

  it('#11 balancete: colunas por omissao SEM saldo inicial; parse e CSV respeitam a seleccao', async () => {
    expect(DEFAULT_TRIAL_BALANCE_COLUMNS).not.toContain('opening');
    expect(parseTrialBalanceColumns(undefined)).toEqual(DEFAULT_TRIAL_BALANCE_COLUMNS);
    expect(parseTrialBalanceColumns('lixo,invalido')).toEqual(DEFAULT_TRIAL_BALANCE_COLUMNS);
    expect(parseTrialBalanceColumns('none')).toEqual([]);
    expect(parseTrialBalanceColumns('opening,debit,credit')).toEqual(['opening', 'debit', 'credit']);
    // Ordem canonica preservada independentemente da ordem no URL.
    expect(parseTrialBalanceColumns('credit,opening')).toEqual(['opening', 'credit']);

    const defaultCsv = await exportTrialBalanceCsv(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO });
    const defaultHeader = defaultCsv.content.split('\n')[2]!;
    expect(defaultHeader).toBe('Conta;Nome da conta;Tipo;Natureza;Débito;Crédito;Saldo devedor;Saldo credor');
    const customCsv = await exportTrialBalanceCsv(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO }, ['opening', 'debit', 'credit']);
    const customHeader = customCsv.content.split('\n')[2]!;
    expect(customHeader).toBe('Conta;Nome da conta;Saldo inicial;Débito;Crédito');
  });

  it('#12 permissoes: relatorios exigem accounting.view; CSVs exigem reports.export', async () => {
    await expect(getIncomeStatementReport(prisma, noViewCtx, {})).rejects.toThrowError(ForbiddenError);
    await expect(getBalanceSheetReport(prisma, noViewCtx, {})).rejects.toThrowError(ForbiddenError);
    await expect(getCashFlowStatementReport(prisma, noViewCtx, {})).rejects.toThrowError(ForbiddenError);
    await expect(exportIncomeStatementCsv(prisma, viewCtx, {})).rejects.toThrowError(ForbiddenError);
    await expect(exportBalanceSheetCsv(prisma, viewCtx, {})).rejects.toThrowError(ForbiddenError);
    await expect(exportCashFlowStatementCsv(prisma, viewCtx, {})).rejects.toThrowError(ForbiddenError);
    // Com accounting.view os relatorios funcionam.
    const dr = await getIncomeStatementReport(prisma, viewCtx, { from: YEAR_FROM, to: YEAR_TO });
    expect(dr.netResult).toBe(EXPECTED.result);
  });

  it('#13 isolamento A/B: os relatorios de A nao veem o movimento de B e vice-versa', async () => {
    await createInvoice(prisma, ctxB, {
      idempotencyKey: randomUUID(),
      issueDate: TODAY,
      customerId: B.customer,
      warehouseId: B.warehouse,
      lines: [{ productId: B.product, quantity: 1, discountPercent: 0 }],
    });
    const drB = await getIncomeStatementReport(prisma, ctxB, { from: YEAR_FROM, to: YEAR_TO });
    expect(drB.netResult).toBe(40);
    const bB = await getBalanceSheetReport(prisma, ctxB, { to: YEAR_TO });
    expect(bB.totalAssets).toBe(40);
    expect(bB.currentYearResult).toBe(40);
    expect(bB.isBalanced).toBe(true);
    // A fica exactamente como estava.
    const drA = await getIncomeStatementReport(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO });
    expect(drA.netResult).toBe(EXPECTED.result);
    const bA = await getBalanceSheetReport(prisma, fullCtx, { to: YEAR_TO });
    expect(bA.totalAssets).toBe(EXPECTED.totalAssets);
  });

  it('#14 CSVs das demonstracoes: titulos, validacao do Balanco e nomes de ficheiro', async () => {
    const dr = await exportIncomeStatementCsv(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO });
    expect(dr.filename).toBe(`contabilidade-demonstracao-resultados-${YEAR_FROM}-${YEAR_TO}.csv`);
    expect(dr.content).toContain('Demonstração de Resultados');
    expect(dr.content).toContain('Excedente');
    const b = await exportBalanceSheetCsv(prisma, fullCtx, { to: YEAR_TO });
    expect(b.filename).toBe(`contabilidade-balanco-${YEAR_TO}.csv`);
    expect(b.content).toContain('Activo = Passivo + Capital Próprio');
    const f = await exportCashFlowStatementCsv(prisma, fullCtx, { from: YEAR_FROM, to: YEAR_TO });
    expect(f.filename).toBe(`contabilidade-fluxo-caixa-${YEAR_FROM}-${YEAR_TO}.csv`);
    expect(f.content).toContain('método directo');
    expect(f.content).toContain('Recebimentos de clientes');
  });
});
