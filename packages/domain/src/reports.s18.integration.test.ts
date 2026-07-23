/**
 * Suite de integracao S18 — folha de contagem, balancete (classe + sem movimento),
 * Razao Geral «todas as contas» e exportacoes XLSX novas.
 * Correr com: pnpm test:integration:reports:s18 (exige DATABASE_URL).
 */
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forCompany, prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ForbiddenError } from './errors';
import {
  exportGeneralLedgerXlsx,
  exportTrialBalanceXlsx,
  getAccountLedgerReport,
  getGeneralLedgerReport,
  getTrialBalanceClassOptions,
  getTrialBalanceReport,
} from './accounting';
import { exportIncomeStatementXlsx } from './accounting-statements';
import { exportStockCountSheetXlsx, getCountSheetFilterOptions, getStockCountSheet } from './stock-count-sheet';

const CA = 'smoke-s18-reports';
const CB = 'smoke-s18-reports-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const acctCtx = ctx(CA, ['accounting.view', 'reports.export']);
const stockCtx = ctx(CA, ['stock.view', 'reports.export']);
const dbA = forCompany(CA);
const dbB = forCompany(CB);

interface Ids {
  fy: string;
  period: string;
  journal: string;
  cash: string;
  ar: string;
  revenue: string;
  dormant: string;
  w1: string;
  w2: string;
}

let ids!: Ids;

async function teardown(companyId: string) {
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.fiscalYear.deleteMany({ where: { companyId } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: { gte: 2 } } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId } });
  await prisma.accountingJournal.deleteMany({ where: { companyId } });
  await prisma.stockLevel.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function createEntry(input: {
  periodId: string;
  number: string;
  date: string;
  description: string;
  lines: Array<{ ledgerAccountId: string; debit?: number; credit?: number }>;
}) {
  const totalDebit = input.lines.reduce((sum, line) => sum + (line.debit ?? 0), 0);
  const totalCredit = input.lines.reduce((sum, line) => sum + (line.credit ?? 0), 0);
  const entry = await prisma.journalEntry.create({
    data: {
      companyId: CA,
      fiscalYearId: ids.fy,
      accountingPeriodId: input.periodId,
      journalId: ids.journal,
      entryNumber: input.number,
      entryDate: D(input.date),
      postingDate: D(input.date),
      status: 'POSTED',
      description: input.description,
      totalDebit,
      totalCredit,
      postedAt: D(input.date),
      postedById: `${CA}-user`,
      createdById: `${CA}-user`,
    },
  });
  await prisma.journalEntryLine.createMany({
    data: input.lines.map((line, index) => ({
      companyId: CA,
      journalEntryId: entry.id,
      ledgerAccountId: line.ledgerAccountId,
      debit: line.debit ?? 0,
      credit: line.credit ?? 0,
      lineNumber: index + 1,
    })),
  });
  return entry;
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke S18 Reports' } });
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke S18 Reports B' } });
  await prisma.user.create({ data: { companyId: CA, email: 's18-reports@ants.test', passwordHash: 'x', name: 'Utilizador S18', mustChangePassword: false } });

  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const period = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  const journal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DG', name: 'Geral', journalType: 'GENERAL', sequencePrefix: 'LG' } });

  // Plano com classes de nivel 1 (deriva o filtro por classe) e contas de movimento de nivel 2.
  const mk = (code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT', level: number, posting: boolean) =>
    prisma.ledgerAccount.create({ data: { companyId: CA, code, name, accountType, normalBalance, level, isPosting: posting, isActive: true } });
  await mk('1', 'Activo', 'ASSET', 'DEBIT', 1, false);
  await mk('4', 'Proveitos', 'REVENUE', 'CREDIT', 1, false);
  const cash = (await mk('111', 'Caixa', 'ASSET', 'DEBIT', 2, true)).id;
  const ar = (await mk('121', 'Clientes c/c', 'ASSET', 'DEBIT', 2, true)).id;
  const revenue = (await mk('411', 'Vendas', 'REVENUE', 'CREDIT', 2, true)).id;
  // Conta de movimento SEM linhas — alvo do modo «sem movimento».
  const dormant = (await mk('131', 'Mercadorias', 'ASSET', 'DEBIT', 2, true)).id;

  ids = { fy: fy.id, period: period.id, journal: journal.id, cash, ar, revenue, dormant, w1: '', w2: '' };

  // Antes do periodo de teste (saldo inicial de 121 e 411).
  await createEntry({ periodId: period.id, number: 'LG 2026/0001', date: '2026-02-10', description: 'Venda a credito antes do periodo', lines: [{ ledgerAccountId: ar, debit: 50 }, { ledgerAccountId: revenue, credit: 50 }] });
  // Dentro do periodo de teste (Junho).
  await createEntry({ periodId: period.id, number: 'LG 2026/0002', date: '2026-06-05', description: 'Venda a dinheiro', lines: [{ ledgerAccountId: cash, debit: 100 }, { ledgerAccountId: revenue, credit: 100 }] });
  await createEntry({ periodId: period.id, number: 'LG 2026/0003', date: '2026-06-20', description: 'Venda a credito', lines: [{ ledgerAccountId: ar, debit: 30 }, { ledgerAccountId: revenue, credit: 30 }] });

  // Stock: 2 armazens; produto com stock, sem stock, negativo e inactivo.
  const w1 = await prisma.warehouse.create({ data: { companyId: CA, code: 'W1', name: 'Armazem Um' } });
  const w2 = await prisma.warehouse.create({ data: { companyId: CA, code: 'W2', name: 'Armazem Dois' } });
  ids.w1 = w1.id;
  ids.w2 = w2.id;
  const p1 = await prisma.product.create({ data: { companyId: CA, sku: 'S18-A', name: 'Produto Com Stock', category: 'Bebidas', salePrice: 10 } });
  await prisma.product.create({ data: { companyId: CA, sku: 'S18-B', name: 'Produto Sem Stock', category: 'Bebidas', salePrice: 10 } });
  const p3 = await prisma.product.create({ data: { companyId: CA, sku: 'S18-C', name: 'Produto Negativo', category: 'Mercearia', salePrice: 10 } });
  await prisma.product.create({ data: { companyId: CA, sku: 'S18-D', name: 'Produto Inactivo', category: 'Mercearia', salePrice: 10, status: 'INACTIVE' } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: p1.id, warehouseId: w1.id, quantity: 5 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: p3.id, warehouseId: w1.id, quantity: -2 } });
}

const PERIOD = { from: '2026-06-01', to: '2026-06-30' };

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

async function reopen(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
}

describe('S18 — folha de contagem, balancete e Razao Geral', () => {
  it('F1: folha de contagem — modo por omissao lista SO produto x armazem com stock zero', async () => {
    const sheet = await getStockCountSheet(dbA, stockCtx, {});
    expect(sheet.filters.mode).toBe('ZERO');
    expect(sheet.rows.every((r) => r.quantity === 0)).toBe(true);
    // Produto Sem Stock aparece nos DOIS armazens; Produto Com Stock so no W2 (onde tem 0).
    const semStock = sheet.rows.filter((r) => r.sku === 'S18-B');
    expect(semStock.length).toBe(2);
    const comStock = sheet.rows.filter((r) => r.sku === 'S18-A');
    expect(comStock.length).toBe(1);
    expect(comStock[0]!.warehouseId).toBe(ids.w2);
    // Inactivos nunca aparecem fora do modo proprio.
    expect(sheet.rows.some((r) => r.sku === 'S18-D')).toBe(false);
  });

  it('F2: folha de contagem — modos negativo/inactivos/todos e filtros de armazem/categoria/pesquisa', async () => {
    const negative = await getStockCountSheet(dbA, stockCtx, { mode: 'NEGATIVE' });
    expect(negative.rows.length).toBe(1);
    expect(negative.rows[0]!.sku).toBe('S18-C');
    expect(negative.rows[0]!.quantity).toBe(-2);

    const inactive = await getStockCountSheet(dbA, stockCtx, { mode: 'INACTIVE' });
    expect(inactive.rows.every((r) => r.sku === 'S18-D' && r.inactive)).toBe(true);
    expect(inactive.rows.length).toBe(2); // 2 armazens

    const all = await getStockCountSheet(dbA, stockCtx, { mode: 'ALL' });
    expect(all.rows.length).toBe(6); // 3 produtos activos x 2 armazens
    expect(all.rows.some((r) => r.quantity === 5)).toBe(true);

    const byWarehouse = await getStockCountSheet(dbA, stockCtx, { mode: 'ALL', warehouseId: ids.w1 });
    expect(byWarehouse.rows.length).toBe(3);
    expect(byWarehouse.warehouseName).toBe('Armazem Um');

    const byCategory = await getStockCountSheet(dbA, stockCtx, { mode: 'ALL', category: 'Bebidas' });
    expect(byCategory.rows.every((r) => r.category === 'Bebidas')).toBe(true);

    const bySearch = await getStockCountSheet(dbA, stockCtx, { mode: 'ALL', search: 'S18-C' });
    expect(bySearch.rows.every((r) => r.sku === 'S18-C')).toBe(true);

    const sorted = await getStockCountSheet(dbA, stockCtx, { mode: 'ALL', sort: 'name', dir: 'desc' });
    const names = sorted.rows.map((r) => r.name);
    expect([...names].sort((a, b) => b.localeCompare(a, 'pt'))).toEqual(names);

    const options = await getCountSheetFilterOptions(dbA, stockCtx);
    expect(options.warehouses.length).toBe(2);
    expect(options.categories).toEqual(['Bebidas', 'Mercearia']);
  });

  it('F3: XLSX da folha — quantidade numerica e colunas de contagem VAZIAS', async () => {
    const { buffer, filename } = await exportStockCountSheetXlsx(dbA, stockCtx, { mode: 'ALL', warehouseId: ids.w1 });
    expect(filename.endsWith('.xlsx')).toBe(true);
    const workbook = await reopen(buffer);
    const sheet = workbook.worksheets[0]!;
    // Encontrar a linha do Produto Com Stock: colunas 5 (stock) numerica; 6-8 vazias.
    let found = false;
    sheet.eachRow((row) => {
      if (row.getCell(1).value === 'S18-A') {
        found = true;
        expect(typeof row.getCell(5).value).toBe('number');
        expect(row.getCell(5).value).toBe(5);
        expect(row.getCell(6).value ?? null).toBeNull();
        expect(row.getCell(7).value ?? null).toBeNull();
        expect(row.getCell(8).value ?? null).toBeNull();
      }
    });
    expect(found).toBe(true);
  });

  it('B1: balancete por omissao mantem o comportamento S11 (so contas com linhas) e D = C', async () => {
    const report = await getTrialBalanceReport(dbA, acctCtx, PERIOD);
    expect(report.rows.map((r) => r.code).sort()).toEqual(['111', '121', '411']);
    expect(report.totalDebit).toBe(130);
    expect(report.totalCredit).toBe(130);
    expect(report.isBalanced).toBe(true);
    expect(report.isGlobalBalanceCheckAvailable).toBe(true);
    // Saldo inicial da 121 vem do lancamento anterior ao periodo.
    const ar = report.rows.find((r) => r.code === '121')!;
    expect(ar.openingBalance).toBe(50);
    expect(ar.debit).toBe(30);
  });

  it('B2: filtro por classe restringe as contas pelo prefixo e desliga a validacao global', async () => {
    const class4 = await getTrialBalanceReport(dbA, acctCtx, { ...PERIOD, accountClass: '4' });
    expect(class4.rows.map((r) => r.code)).toEqual(['411']);
    expect(class4.totalCredit).toBe(130);
    expect(class4.totalDebit).toBe(0);
    expect(class4.isGlobalBalanceCheckAvailable).toBe(false);

    const class1 = await getTrialBalanceReport(dbA, acctCtx, { ...PERIOD, accountClass: '1' });
    expect(class1.rows.map((r) => r.code).sort()).toEqual(['111', '121']);
    expect(class1.totalDebit).toBe(130);

    const options = await getTrialBalanceClassOptions(dbA, acctCtx);
    expect(options.map((c) => c.code)).toEqual(['1', '4']);
  });

  it('B3: «sem movimento» lista contas do plano com tudo a zero; «todas» une os dois universos', async () => {
    const without = await getTrialBalanceReport(dbA, acctCtx, { ...PERIOD, accountMovement: 'WITHOUT' });
    expect(without.rows.map((r) => r.code)).toEqual(['131']);
    expect(without.rows[0]!.openingBalance).toBe(0);
    expect(without.rows[0]!.debit).toBe(0);
    expect(without.rows[0]!.credit).toBe(0);
    expect(without.totalDebit).toBe(0);
    expect(without.isGlobalBalanceCheckAvailable).toBe(false);

    const all = await getTrialBalanceReport(dbA, acctCtx, { ...PERIOD, accountMovement: 'ALL' });
    expect(all.rows.map((r) => r.code).sort()).toEqual(['111', '121', '131', '411']);
    // O invariante D = C mantem-se: as contas a zero nada acrescentam.
    expect(all.totalDebit).toBe(130);
    expect(all.totalCredit).toBe(130);
    expect(all.isBalanced).toBe(true);
    expect(all.isGlobalBalanceCheckAvailable).toBe(true);
  });

  it('R1: Razao Geral «todas as contas» — seccoes com saldo inicial, acumulados e totais por conta', async () => {
    const report = await getGeneralLedgerReport(dbA, acctCtx, PERIOD);
    expect(report.sections.map((s) => s.account.code)).toEqual(['111', '121', '411']);
    expect(report.truncated).toBe(false);
    expect(report.totalDebit).toBe(130);
    expect(report.totalCredit).toBe(130);

    const cash = report.sections.find((s) => s.account.code === '111')!;
    expect(cash.openingBalance).toBe(0);
    expect(cash.rows.length).toBe(1);
    expect(cash.closingBalance).toBe(100);

    const ar = report.sections.find((s) => s.account.code === '121')!;
    expect(ar.openingBalance).toBe(50);
    expect(ar.rows[0]!.balance).toBe(80);
    expect(ar.closingBalance).toBe(80);

    const revenue = report.sections.find((s) => s.account.code === '411')!;
    expect(revenue.openingBalance).toBe(50); // natureza credora
    expect(revenue.rows.map((r) => r.balance)).toEqual([150, 180]);
    expect(revenue.totalCredit).toBe(130);
    expect(revenue.closingBalance).toBe(180);
  });

  it('R2: a seccao de cada conta coincide com a consulta de conta unica (que fica intacta)', async () => {
    const report = await getGeneralLedgerReport(dbA, acctCtx, PERIOD);
    const single = await getAccountLedgerReport(dbA, acctCtx, ids.ar, PERIOD);
    const section = report.sections.find((s) => s.account.id === ids.ar)!;
    expect(section.openingBalance).toBe(single.openingBalance);
    expect(section.totalDebit).toBe(single.totalDebit);
    expect(section.totalCredit).toBe(single.totalCredit);
    expect(section.closingBalance).toBe(single.closingBalance);
    expect(section.rows.map((r) => r.balance)).toEqual(single.rows.map((r) => r.balance));
  });

  it('X1: XLSX do balancete e do Razao Geral reabrem com valores monetarios NUMERICOS', async () => {
    const trial = await exportTrialBalanceXlsx(dbA, acctCtx, PERIOD);
    const trialWb = await reopen(trial.buffer);
    const trialSheet = trialWb.worksheets[0]!;
    let numericMoneyCells = 0;
    trialSheet.eachRow((row) => {
      if (row.getCell(1).value === '411') {
        // Colunas por omissao: Conta, Nome, Tipo, Natureza, Debito, Credito, Saldo devedor, Saldo credor.
        expect(typeof row.getCell(6).value).toBe('number');
        expect(row.getCell(6).value).toBe(130);
        numericMoneyCells += 1;
      }
    });
    expect(numericMoneyCells).toBe(1);

    const general = await exportGeneralLedgerXlsx(dbA, acctCtx, PERIOD);
    const generalWb = await reopen(general.buffer);
    const generalSheet = generalWb.worksheets[0]!;
    const labels: string[] = [];
    generalSheet.eachRow((row) => {
      const first = row.getCell(1).value;
      if (typeof first === 'string') labels.push(first);
    });
    // Seccoes sequenciais por conta com sub-totais.
    expect(labels.some((l) => l.startsWith('111 —'))).toBe(true);
    expect(labels.some((l) => l.startsWith('411 —'))).toBe(true);

    const income = await exportIncomeStatementXlsx(dbA, acctCtx, PERIOD);
    const incomeWb = await reopen(income.buffer);
    const incomeSheet = incomeWb.worksheets[0]!;
    let incomeTotalOk = false;
    incomeSheet.eachRow((row) => {
      if (row.getCell(2).value === 'Total dos proveitos') {
        expect(typeof row.getCell(3).value).toBe('number');
        expect(row.getCell(3).value).toBe(130);
        incomeTotalOk = true;
      }
    });
    expect(incomeTotalOk).toBe(true);
  });

  it('P1: permissoes e isolamento — gates certos e empresa B sem dados de A', async () => {
    await expect(getStockCountSheet(dbA, ctx(CA, []), {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportStockCountSheetXlsx(dbA, ctx(CA, ['stock.view']), {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getGeneralLedgerReport(dbA, ctx(CA, []), PERIOD)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportTrialBalanceXlsx(dbA, ctx(CA, ['accounting.view']), PERIOD)).rejects.toBeInstanceOf(ForbiddenError);

    const ctxB = ctx(CB, ['accounting.view', 'stock.view', 'reports.export']);
    const sheetB = await getStockCountSheet(dbB, ctxB, { mode: 'ALL' });
    expect(sheetB.rows.length).toBe(0);
    const trialB = await getTrialBalanceReport(dbB, ctxB, PERIOD);
    expect(trialB.rows.length).toBe(0);
    const generalB = await getGeneralLedgerReport(dbB, ctxB, PERIOD);
    expect(generalB.sections.length).toBe(0);
  });
});
