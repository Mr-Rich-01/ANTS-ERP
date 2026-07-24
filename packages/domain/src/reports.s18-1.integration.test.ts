/**
 * Suite de integracao S18.1 — Balancete com subtotais «Total por Razao» e «Total por Classe».
 * Fixture com hierarquia REAL (parentId) a tres niveis + uma conta com cadeia quebrada (fallback).
 * Correr com: pnpm test:integration:reports:s18-1 (exige DATABASE_URL).
 */
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forCompany, prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ForbiddenError } from './errors';
import {
  buildTrialBalanceDisplayRows,
  exportTrialBalanceCsv,
  exportTrialBalanceXlsx,
  getTrialBalanceReport,
  type TrialBalanceSubtotalRow,
} from './accounting';

const CA = 'smoke-s18-1-balancete';
const CB = 'smoke-s18-1-balancete-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const r2 = (n: number) => Math.round(n * 100) / 100;

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const acctCtx = ctx(CA, ['accounting.view', 'reports.export']);
const dbA = forCompany(CA);
const dbB = forCompany(CB);

interface Ids {
  fy: string;
  period: string;
  journal: string;
  a211: string;
  a212: string;
  a221: string;
  a611: string;
  a311: string;
}
let ids!: Ids;

const PERIOD = { from: '2026-06-01', to: '2026-06-30' };

async function teardown(companyId: string) {
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.fiscalYear.deleteMany({ where: { companyId } });
  // Descendente por nivel: os filhos referenciam o pai via (companyId, parentId).
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: { gte: 3 } } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: 2 } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId } });
  await prisma.accountingJournal.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function createEntry(input: { number: string; date: string; description: string; lines: Array<{ ledgerAccountId: string; debit?: number; credit?: number }> }) {
  const totalDebit = input.lines.reduce((sum, l) => sum + (l.debit ?? 0), 0);
  const totalCredit = input.lines.reduce((sum, l) => sum + (l.credit ?? 0), 0);
  const entry = await prisma.journalEntry.create({
    data: {
      companyId: CA,
      fiscalYearId: ids.fy,
      accountingPeriodId: ids.period,
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
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke S18.1 Balancete' } });
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke S18.1 Balancete B' } });
  await prisma.user.create({ data: { companyId: CA, email: 's18-1-balancete@ants.test', passwordHash: 'x', name: 'Utilizador S18.1', mustChangePassword: false } });

  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const period = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  const journal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DG', name: 'Geral', journalType: 'GENERAL', sequencePrefix: 'LG' } });

  type Kind = 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE';
  const mk = (code: string, name: string, accountType: Kind, normalBalance: 'DEBIT' | 'CREDIT', level: number, posting: boolean, parentId?: string) =>
    prisma.ledgerAccount.create({ data: { companyId: CA, code, name, accountType, normalBalance, level, isPosting: posting, isActive: true, parentId: parentId ?? null } });

  // Classes (nivel 1, agrupadoras)
  const c2 = (await mk('2', 'Terceiros', 'ASSET', 'DEBIT', 1, false)).id;
  const c6 = (await mk('6', 'Custos', 'EXPENSE', 'DEBIT', 1, false)).id;
  // Razoes (nivel 2, agrupadoras)
  const r21 = (await mk('21', 'Clientes', 'ASSET', 'DEBIT', 2, false, c2)).id;
  const r22 = (await mk('22', 'Fornecedores', 'LIABILITY', 'CREDIT', 2, false, c2)).id;
  const r61 = (await mk('61', 'Custo das vendas', 'EXPENSE', 'DEBIT', 2, false, c6)).id;
  // Contas de movimento (nivel 3)
  const a211 = (await mk('211', 'Clientes gerais', 'ASSET', 'DEBIT', 3, true, r21)).id;
  const a212 = (await mk('212', 'Clientes diversos', 'ASSET', 'DEBIT', 3, true, r21)).id;
  const a221 = (await mk('221', 'Fornecedores gerais', 'LIABILITY', 'CREDIT', 3, true, r22)).id;
  await mk('222', 'Fornecedores diversos', 'LIABILITY', 'CREDIT', 3, true, r22); // dormente (so aparece em ALL/WITHOUT)
  const a611 = (await mk('611', 'CMV', 'EXPENSE', 'DEBIT', 3, true, r61)).id;
  // Cadeia QUEBRADA: conta de movimento sem parentId → agrupamento por prefixo (fallback).
  const a311 = (await mk('311', 'Mercadorias', 'ASSET', 'DEBIT', 3, true)).id;

  ids = { fy: fy.id, period: period.id, journal: journal.id, a211, a212, a221, a611, a311 };

  // Saldo inicial (antes do periodo): D 211 50 / C 221 50.
  await createEntry({ number: 'LG 2026/0001', date: '2026-02-10', description: 'Saldo inicial', lines: [{ ledgerAccountId: a211, debit: 50 }, { ledgerAccountId: a221, credit: 50 }] });
  // Dentro do periodo (D = C em cada lancamento).
  await createEntry({ number: 'LG 2026/0002', date: '2026-06-05', description: 'Venda a credito', lines: [{ ledgerAccountId: a211, debit: 30 }, { ledgerAccountId: a221, credit: 30 }] });
  await createEntry({ number: 'LG 2026/0003', date: '2026-06-10', description: 'Outro cliente', lines: [{ ledgerAccountId: a212, debit: 20 }, { ledgerAccountId: a221, credit: 20 }] });
  await createEntry({ number: 'LG 2026/0004', date: '2026-06-15', description: 'Custo', lines: [{ ledgerAccountId: a611, debit: 100 }, { ledgerAccountId: a311, credit: 100 }] });
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

async function reopen(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
}

/** Sequencia compacta: contas pelo codigo, subtotais como `<kind>:<code>`. */
function sequenceOf(report: Awaited<ReturnType<typeof getTrialBalanceReport>>): string[] {
  return (report.displayRows ?? []).map((d) => (d.kind === 'account' ? d.row.code : `${d.kind}:${d.code}`));
}
function subtotals(report: Awaited<ReturnType<typeof getTrialBalanceReport>>): TrialBalanceSubtotalRow[] {
  return (report.displayRows ?? []).filter((d): d is TrialBalanceSubtotalRow => d.kind !== 'account');
}
function findSub(report: Awaited<ReturnType<typeof getTrialBalanceReport>>, kind: TrialBalanceSubtotalRow['kind'], code: string): TrialBalanceSubtotalRow {
  return subtotals(report).find((s) => s.kind === kind && s.code === code)!;
}

describe('S18.1 — Balancete «Total por Razao» e «Total por Classe»', () => {
  it('D0: ambos os toggles desligados = comportamento actual (sem displayRows nem fallback)', async () => {
    const report = await getTrialBalanceReport(dbA, acctCtx, PERIOD);
    expect(report.displayRows).toBeUndefined();
    expect(report.groupingFallbackUsed).toBeUndefined();
    expect(report.rows.map((r) => r.code)).toEqual(['211', '212', '221', '311', '611']);
    expect(report.totalDebit).toBe(150);
    expect(report.totalCredit).toBe(150);
    expect(report.isBalanced).toBe(true);
  });

  it('R1: so «Total por Razao» — grupos, sequencia e subtotais exactos por conta razao', async () => {
    const report = await getTrialBalanceReport(dbA, acctCtx, { ...PERIOD, groupByRazao: true });
    expect(report.groupingFallbackUsed).toBe(true);
    expect(sequenceOf(report)).toEqual([
      '211', '212', 'subtotal-razao:21',
      '221', 'subtotal-razao:22',
      '311', 'subtotal-razao:31',
      '611', 'subtotal-razao:61',
    ]);

    const s21 = findSub(report, 'subtotal-razao', '21');
    expect(s21.label).toBe('Subtotal 21 — Clientes');
    expect(s21.accountCount).toBe(2);
    expect(s21.openingBalance).toBe(50);
    expect(s21.debit).toBe(50);
    expect(s21.credit).toBe(0);
    expect(s21.closingDebit).toBe(100);
    expect(s21.closingCredit).toBe(0);

    const s22 = findSub(report, 'subtotal-razao', '22');
    expect(s22.credit).toBe(50);
    expect(s22.closingCredit).toBe(100);

    // Fallback: 311 sem cadeia → prefixo '31', sem nome.
    const s31 = findSub(report, 'subtotal-razao', '31');
    expect(s31.label).toBe('Subtotal 31');
    expect(s31.name).toBe('');
    expect(s31.credit).toBe(100);

    // Anti-duplicacao / invariante de topo: Σ subtotais razao = totais do relatorio.
    const subs = subtotals(report);
    expect(r2(subs.reduce((a, s) => a + s.debit, 0))).toBe(report.totalDebit);
    expect(r2(subs.reduce((a, s) => a + s.credit, 0))).toBe(report.totalCredit);
    expect(r2(subs.reduce((a, s) => a + s.closingDebit, 0))).toBe(report.totalClosingDebit);
    expect(r2(subs.reduce((a, s) => a + s.closingCredit, 0))).toBe(report.totalClosingCredit);
  });

  it('C1: so «Total por Classe» — subtotal de classe = soma das razoes contidas', async () => {
    const report = await getTrialBalanceReport(dbA, acctCtx, { ...PERIOD, groupByClasse: true });
    expect(sequenceOf(report)).toEqual([
      '211', '212', '221', 'subtotal-classe:2',
      '311', 'subtotal-classe:3',
      '611', 'subtotal-classe:6',
    ]);

    const c2 = findSub(report, 'subtotal-classe', '2');
    expect(c2.label).toBe('Subtotal Classe 2 — Terceiros');
    expect(c2.accountCount).toBe(3); // 211 + 212 + 221
    expect(c2.debit).toBe(50);
    expect(c2.credit).toBe(50);
    expect(c2.openingBalance).toBe(0); // 50 (211) + 0 (212) − 50 (221)

    const c3 = findSub(report, 'subtotal-classe', '3');
    expect(c3.label).toBe('Subtotal Classe 3');
    expect(c3.name).toBe('');

    const subs = subtotals(report);
    expect(r2(subs.reduce((a, s) => a + s.debit, 0))).toBe(report.totalDebit);
    expect(r2(subs.reduce((a, s) => a + s.credit, 0))).toBe(report.totalCredit);
  });

  it('B1: ambos os toggles — hierarquia classe → razoes, subtotal-classe = soma dos subtotais-razao', async () => {
    const report = await getTrialBalanceReport(dbA, acctCtx, { ...PERIOD, groupByRazao: true, groupByClasse: true });
    expect(sequenceOf(report)).toEqual([
      '211', '212', 'subtotal-razao:21',
      '221', 'subtotal-razao:22', 'subtotal-classe:2',
      '311', 'subtotal-razao:31', 'subtotal-classe:3',
      '611', 'subtotal-razao:61', 'subtotal-classe:6',
    ]);

    const s21 = findSub(report, 'subtotal-razao', '21');
    const s22 = findSub(report, 'subtotal-razao', '22');
    const c2 = findSub(report, 'subtotal-classe', '2');
    expect(c2.debit).toBe(r2(s21.debit + s22.debit));
    expect(c2.credit).toBe(r2(s21.credit + s22.credit));
    expect(c2.closingDebit).toBe(r2(s21.closingDebit + s22.closingDebit));
    expect(c2.closingCredit).toBe(r2(s21.closingCredit + s22.closingCredit));

    // Σ dos subtotais de topo (classe) = total geral, invariante em qualquer combinacao.
    const classes = subtotals(report).filter((s) => s.kind === 'subtotal-classe');
    expect(r2(classes.reduce((a, s) => a + s.debit, 0))).toBe(report.totalDebit);
    expect(r2(classes.reduce((a, s) => a + s.credit, 0))).toBe(report.totalCredit);
  });

  it('F1: filtro de classe unica + «Total por Classe» = exactamente um grupo (nao erro)', async () => {
    const report = await getTrialBalanceReport(dbA, acctCtx, { ...PERIOD, accountClass: '2', groupByClasse: true });
    const classes = subtotals(report).filter((s) => s.kind === 'subtotal-classe');
    expect(classes.length).toBe(1);
    expect(classes[0]!.code).toBe('2');
    expect(report.rows.map((r) => r.code)).toEqual(['211', '212', '221']);
  });

  it('F2: «Todas as contas» + «Total por Razao» — conta dormente entra no grupo certo sem alterar valores', async () => {
    const report = await getTrialBalanceReport(dbA, acctCtx, { ...PERIOD, accountMovement: 'ALL', groupByRazao: true });
    expect(report.rows.map((r) => r.code).sort()).toEqual(['211', '212', '221', '222', '311', '611']);
    const s22 = findSub(report, 'subtotal-razao', '22');
    expect(s22.accountCount).toBe(2); // 221 + 222 (dormente)
    expect(s22.credit).toBe(50); // 222 a zero nada acrescenta
    expect(s22.closingCredit).toBe(100);
    // Invariante mantem-se com contas a zero.
    const subs = subtotals(report);
    expect(r2(subs.reduce((a, s) => a + s.credit, 0))).toBe(report.totalCredit);
  });

  it('U1: buildTrialBalanceDisplayRows e uma funcao pura — mesmo input, mesmo output', async () => {
    const report = await getTrialBalanceReport(dbA, acctCtx, PERIOD);
    const chart = await prisma.ledgerAccount.findMany({ where: { companyId: CA }, select: { id: true, code: true, name: true, parentId: true, level: true } });
    const built = buildTrialBalanceDisplayRows(report.rows, chart, { byRazao: true, byClasse: false });
    expect(built.fallbackUsed).toBe(true);
    expect(built.displayRows.map((d) => (d.kind === 'account' ? d.row.code : `${d.kind}:${d.code}`))).toEqual([
      '211', '212', 'subtotal-razao:21',
      '221', 'subtotal-razao:22',
      '311', 'subtotal-razao:31',
      '611', 'subtotal-razao:61',
    ]);
  });

  it('X1: XLSX com subtotais — linhas nas posicoes certas, valores numericos, total geral intacto', async () => {
    const combos: Array<{ groupByRazao?: boolean; groupByClasse?: boolean }> = [
      { groupByRazao: true },
      { groupByClasse: true },
      { groupByRazao: true, groupByClasse: true },
    ];
    for (const combo of combos) {
      const xlsx = await exportTrialBalanceXlsx(dbA, acctCtx, { ...PERIOD, ...combo });
      const wb = await reopen(xlsx.buffer);
      const sheet = wb.worksheets[0]!;
      let subtotalOk = false;
      let totalOk = false;
      sheet.eachRow((row) => {
        const first = row.getCell(1).value;
        if (first === 'Subtotal 21 — Clientes' && (combo.groupByRazao ?? false)) {
          // Colunas por omissao: Conta, Nome, Tipo, Natureza, Debito, Credito, Saldo devedor, Saldo credor.
          expect(typeof row.getCell(5).value).toBe('number');
          expect(row.getCell(5).value).toBe(50);
          expect(row.getCell(1).font?.bold).toBe(true);
          subtotalOk = true;
        }
        if (first === 'Subtotal Classe 2 — Terceiros' && (combo.groupByClasse ?? false)) {
          expect(typeof row.getCell(5).value).toBe('number');
          expect(row.getCell(5).value).toBe(50);
          subtotalOk = true;
        }
        if (first === 'Totais') {
          expect(row.getCell(5).value).toBe(150); // Debito total inalterado
          totalOk = true;
        }
      });
      expect(subtotalOk).toBe(true);
      expect(totalOk).toBe(true);
    }
  });

  it('X2: CSV com subtotais intercalados nas linhas certas', async () => {
    const csv = await exportTrialBalanceCsv(dbA, acctCtx, { ...PERIOD, groupByRazao: true, groupByClasse: true });
    const lines = csv.content.split('\n');
    const bodyStart = lines.findIndex((l) => l.startsWith('Conta;')) + 1;
    const labels = lines.slice(bodyStart).map((l) => l.split(';')[0]);
    // Sequencia: 211,212,Subtotal 21…,221,Subtotal 22…,Subtotal Classe 2…,311,…
    expect(labels.slice(0, 6)).toEqual(['211', '212', 'Subtotal 21 — Clientes', '221', 'Subtotal 22 — Fornecedores', 'Subtotal Classe 2 — Terceiros']);
    expect(labels).toContain('Totais');
  });

  it('P1: gate de permissao mantido e empresa B sem dados de A', async () => {
    await expect(getTrialBalanceReport(dbA, ctx(CA, []), { ...PERIOD, groupByRazao: true })).rejects.toBeInstanceOf(ForbiddenError);
    const reportB = await getTrialBalanceReport(dbB, ctx(CB, ['accounting.view']), { ...PERIOD, groupByRazao: true, groupByClasse: true });
    expect(reportB.rows.length).toBe(0);
    expect(reportB.displayRows).toEqual([]);
  });
});
