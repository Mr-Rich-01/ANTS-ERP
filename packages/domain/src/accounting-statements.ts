/**
 * Demonstrações financeiras (S11): Demonstração de Resultados, Balanço
 * Patrimonial e Demonstração do Fluxo de Caixa (método directo).
 *
 * Relatórios de LEITURA pura sobre o razão — nenhuma escrita. As secções são
 * derivadas do tipo (`accountType`) e da hierarquia (`parentId`) do plano de
 * contas, nunca de listas de códigos hardcoded. Tal como o balancete, todos os
 * cálculos incluem lançamentos POSTED e REVERSED (o estorno POSTED anula o
 * original REVERSED — a soma é a verdade).
 *
 * Anti-circularidade (desenho aprovado 2026-07-19): o resultado apresentado no
 * Balanço é calculado por um groupBy PRÓPRIO sobre as contas das classes de
 * resultado — `getBalanceSheetReport` NÃO chama `getIncomeStatementReport`.
 */
import type { Prisma, PrismaClient } from '@ants/database';
import { round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ValidationError } from './errors';
import {
  type LedgerAccountType,
  accountingCsvLine,
  accountingMoneyLabel,
  formatAccountingDate,
  parseAccountingDate,
} from './accounting';
import { exportTableToXlsx, type XlsxCellValue, type XlsxGroup } from './xlsx-export';

// ─────────────────────────────────────────────────────────────
// Tipos e helpers partilhados
// ─────────────────────────────────────────────────────────────

export interface StatementPeriodFilters {
  from?: string;
  to?: string;
}

export interface StatementAccountRow {
  accountId: string;
  code: string;
  name: string;
  /** Valor com o sinal da secção (positivo = natureza normal da secção). */
  amount: number;
}

export interface StatementGroupRow {
  groupId: string;
  code: string;
  name: string;
  amount: number;
  accounts: StatementAccountRow[];
}

interface AccountInfo {
  id: string;
  code: string;
  name: string;
  accountType: LedgerAccountType;
  parentId: string | null;
  level: number;
}

function currentYearRange(): { from: string; to: string } {
  const year = new Date().getUTCFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function normalizePeriod(filters: StatementPeriodFilters = {}): { from: string; to: string } {
  const fallback = currentYearRange();
  const from = filters.from?.trim() || fallback.from;
  const to = filters.to?.trim() || fallback.to;
  if (parseAccountingDate(from) > parseAccountingDate(to)) {
    throw new ValidationError('A data inicial não pode ser posterior à data final.');
  }
  return { from, to };
}

async function loadAccounts(db: PrismaClient, companyId: string): Promise<Map<string, AccountInfo>> {
  const accounts = await db.ledgerAccount.findMany({
    where: { companyId },
    select: { id: true, code: true, name: true, accountType: true, parentId: true, level: true },
  });
  return new Map(accounts.map((a) => [a.id, { ...a, accountType: a.accountType as LedgerAccountType }]));
}

/** Antepassado de nível 2 da conta (o «grupo» do plano); a própria conta se já estiver no nível ≤ 2. */
function groupAncestor(account: AccountInfo, byId: Map<string, AccountInfo>): AccountInfo {
  let current = account;
  const seen = new Set<string>([current.id]);
  while (current.level > 2 && current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current;
}

interface AccountAmount {
  account: AccountInfo;
  amount: number;
}

/** Agrega valores de contas por grupo de nível 2, ordenado por código. */
function buildGroups(items: AccountAmount[], byId: Map<string, AccountInfo>): StatementGroupRow[] {
  const groups = new Map<string, StatementGroupRow>();
  for (const { account, amount } of items) {
    const ancestor = groupAncestor(account, byId);
    let group = groups.get(ancestor.id);
    if (!group) {
      group = { groupId: ancestor.id, code: ancestor.code, name: ancestor.name, amount: 0, accounts: [] };
      groups.set(ancestor.id, group);
    }
    group.amount = round2(group.amount + amount);
    group.accounts.push({ accountId: account.id, code: account.code, name: account.name, amount });
  }
  const rows = [...groups.values()];
  rows.sort((a, b) => a.code.localeCompare(b.code));
  for (const row of rows) row.accounts.sort((a, b) => a.code.localeCompare(b.code));
  return rows;
}

function sumGroups(rows: StatementGroupRow[]): number {
  return round2(rows.reduce((sum, r) => sum + r.amount, 0));
}

const POSTED_OR_REVERSED: Prisma.EnumJournalEntryStatusFilter = { in: ['POSTED', 'REVERSED'] };

/** Soma débito/crédito por conta para lançamentos POSTED+REVERSED num intervalo de datas. */
async function sumsByAccount(
  db: PrismaClient,
  companyId: string,
  entryDate: Prisma.DateTimeFilter,
): Promise<Map<string, { debit: number; credit: number }>> {
  const grouped = await db.journalEntryLine.groupBy({
    by: ['ledgerAccountId'],
    where: { companyId, journalEntry: { companyId, status: POSTED_OR_REVERSED, entryDate } },
    _sum: { debit: true, credit: true },
  });
  return new Map(grouped.map((g) => [g.ledgerAccountId, { debit: round2(Number(g._sum.debit ?? 0)), credit: round2(Number(g._sum.credit ?? 0)) }]));
}

/** Valor com o sinal da secção: tipos de natureza devedora = D−C; credora = C−D. */
function sectionAmount(type: LedgerAccountType, sums: { debit: number; credit: number }): number {
  return type === 'ASSET' || type === 'EXPENSE' ? round2(sums.debit - sums.credit) : round2(sums.credit - sums.debit);
}

// ─────────────────────────────────────────────────────────────
// Demonstração de Resultados
// ─────────────────────────────────────────────────────────────

export interface IncomeStatementReport {
  filters: { from: string; to: string };
  revenue: StatementGroupRow[];
  expenses: StatementGroupRow[];
  totalRevenue: number;
  totalExpenses: number;
  /** Positivo = Excedente; negativo = Déficit. */
  netResult: number;
}

export async function getIncomeStatementReport(db: PrismaClient, ctx: RequestContext, rawFilters: StatementPeriodFilters = {}): Promise<IncomeStatementReport> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const filters = normalizePeriod(rawFilters);
  const [byId, sums] = await Promise.all([
    loadAccounts(db, companyId),
    sumsByAccount(db, companyId, { gte: parseAccountingDate(filters.from), lte: parseAccountingDate(filters.to) }),
  ]);
  const revenueItems: AccountAmount[] = [];
  const expenseItems: AccountAmount[] = [];
  for (const [accountId, s] of sums) {
    const account = byId.get(accountId);
    if (!account) continue;
    if (account.accountType === 'REVENUE') revenueItems.push({ account, amount: sectionAmount('REVENUE', s) });
    else if (account.accountType === 'EXPENSE') expenseItems.push({ account, amount: sectionAmount('EXPENSE', s) });
  }
  const revenue = buildGroups(revenueItems, byId);
  const expenses = buildGroups(expenseItems, byId);
  const totalRevenue = sumGroups(revenue);
  const totalExpenses = sumGroups(expenses);
  return { filters, revenue, expenses, totalRevenue, totalExpenses, netResult: round2(totalRevenue - totalExpenses) };
}

// ─────────────────────────────────────────────────────────────
// Balanço Patrimonial
// ─────────────────────────────────────────────────────────────

export interface BalanceSheetReport {
  /** Data de referência («à data de»). */
  asOf: string;
  /** Exercício que contém a data (corte das duas linhas de resultado); null = corte no ano civil. */
  fiscalYear: { id: string; name: string; startDate: string } | null;
  assets: StatementGroupRow[];
  liabilities: StatementGroupRow[];
  /** Contas EQUITY reais do razão (311, 312, 321, 322…). */
  equity: StatementGroupRow[];
  totalAssets: number;
  totalLiabilities: number;
  /** Soma das contas EQUITY do razão, sem as linhas calculadas. */
  totalEquityAccounts: number;
  /** Resultado (classes 4/5) com data anterior ao início do exercício corrente — por apurar. */
  priorYearsResult: number;
  /** Resultado (classes 4/5) dentro do exercício corrente até à data — por apurar. */
  currentYearResult: number;
  /** Contas EQUITY + as duas linhas de resultado. */
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

export async function getBalanceSheetReport(db: PrismaClient, ctx: RequestContext, rawFilters: Pick<StatementPeriodFilters, 'to'> = {}): Promise<BalanceSheetReport> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const asOf = rawFilters.to?.trim() || currentYearRange().to;
  const asOfDate = parseAccountingDate(asOf);

  const fiscalYear = await db.fiscalYear.findFirst({
    where: { companyId, startDate: { lte: asOfDate }, endDate: { gte: asOfDate } },
    select: { id: true, name: true, startDate: true },
  });
  const exerciseStart = fiscalYear ? fiscalYear.startDate : parseAccountingDate(`${asOfDate.getUTCFullYear()}-01-01`);

  const [byId, cumulative, prior] = await Promise.all([
    loadAccounts(db, companyId),
    // Saldos acumulados de TODAS as contas até à data.
    sumsByAccount(db, companyId, { lte: asOfDate }),
    // Classes de resultado antes do início do exercício corrente (transitado por apurar).
    sumsByAccount(db, companyId, { lt: exerciseStart }),
  ]);

  const assetItems: AccountAmount[] = [];
  const liabilityItems: AccountAmount[] = [];
  const equityItems: AccountAmount[] = [];
  let cumulativeResult = 0;
  let priorYearsResult = 0;
  for (const [accountId, s] of cumulative) {
    const account = byId.get(accountId);
    if (!account) continue;
    const amount = sectionAmount(account.accountType, s);
    if (account.accountType === 'ASSET') assetItems.push({ account, amount });
    else if (account.accountType === 'LIABILITY') liabilityItems.push({ account, amount });
    else if (account.accountType === 'EQUITY') equityItems.push({ account, amount });
    else if (account.accountType === 'REVENUE') cumulativeResult = round2(cumulativeResult + amount);
    else cumulativeResult = round2(cumulativeResult - amount);
  }
  for (const [accountId, s] of prior) {
    const account = byId.get(accountId);
    if (!account) continue;
    if (account.accountType === 'REVENUE') priorYearsResult = round2(priorYearsResult + sectionAmount('REVENUE', s));
    else if (account.accountType === 'EXPENSE') priorYearsResult = round2(priorYearsResult - sectionAmount('EXPENSE', s));
  }
  const currentYearResult = round2(cumulativeResult - priorYearsResult);

  const assets = buildGroups(assetItems, byId);
  const liabilities = buildGroups(liabilityItems, byId);
  const equity = buildGroups(equityItems, byId);
  const totalAssets = sumGroups(assets);
  const totalLiabilities = sumGroups(liabilities);
  const totalEquityAccounts = sumGroups(equity);
  const totalEquity = round2(totalEquityAccounts + priorYearsResult + currentYearResult);
  const totalLiabilitiesAndEquity = round2(totalLiabilities + totalEquity);
  return {
    asOf,
    fiscalYear: fiscalYear ? { id: fiscalYear.id, name: fiscalYear.name, startDate: formatAccountingDate(fiscalYear.startDate) } : null,
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquityAccounts,
    priorYearsResult,
    currentYearResult,
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced: totalAssets === totalLiabilitiesAndEquity,
  };
}

// ─────────────────────────────────────────────────────────────
// Demonstração do Fluxo de Caixa (método directo, sobre o razão)
// ─────────────────────────────────────────────────────────────

export type CashFlowSection = 'OPERATING' | 'INVESTING' | 'FINANCING';

export interface CashFlowLine {
  key: string;
  label: string;
  /** Positivo = entrada de caixa; negativo = saída. */
  amount: number;
}

export interface CashFlowStatementReport {
  filters: { from: string; to: string };
  operating: CashFlowLine[];
  investing: CashFlowLine[];
  financing: CashFlowLine[];
  operatingTotal: number;
  investingTotal: number;
  financingTotal: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
  /** Transferências caixa↔caixa excluídas das rubricas (movimento interno). */
  internalTransferCount: number;
  /** Reconciliação com a Tesouraria operacional (movimentos ACTIVE do período). */
  treasury: { totalIn: number; totalOut: number; net: number; difference: number };
}

/** Rubricas por evento contabilístico; eventos não mapeados caem em «Outros fluxos operacionais». */
const CASH_FLOW_EVENT_RUBRICS: Record<string, { section: CashFlowSection; key: string; label: string }> = {
  RECEIPT_POSTED: { section: 'OPERATING', key: 'customer-receipts', label: 'Recebimentos de clientes' },
  SUPPLIER_PAYMENT_POSTED: { section: 'OPERATING', key: 'supplier-payments', label: 'Pagamentos a fornecedores' },
};
const OTHER_OPERATING = { section: 'OPERATING' as CashFlowSection, key: 'other-operating', label: 'Outros fluxos operacionais' };
const EQUITY_FINANCING = { section: 'FINANCING' as CashFlowSection, key: 'equity-flows', label: 'Entradas e saídas de capital' };

/**
 * Contas-razão de caixa e equivalentes: união das contas ligadas a contas de
 * Tesouraria com as contas dos mappings de meios monetários — definição
 * funcional, nunca por prefixo de código.
 */
async function cashLedgerAccountIds(db: PrismaClient, companyId: string): Promise<Set<string>> {
  const [treasury, mappings] = await Promise.all([
    db.treasuryAccount.findMany({ where: { companyId, ledgerAccountId: { not: null } }, select: { ledgerAccountId: true } }),
    db.accountingMapping.findMany({ where: { companyId, systemKey: { in: ['CASH_MAIN', 'BANK_MAIN', 'MOBILE_MONEY'] } }, select: { ledgerAccountId: true } }),
  ]);
  const ids = new Set<string>();
  for (const t of treasury) if (t.ledgerAccountId) ids.add(t.ledgerAccountId);
  for (const m of mappings) ids.add(m.ledgerAccountId);
  return ids;
}

export async function getCashFlowStatementReport(db: PrismaClient, ctx: RequestContext, rawFilters: StatementPeriodFilters = {}): Promise<CashFlowStatementReport> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const filters = normalizePeriod(rawFilters);
  const fromDate = parseAccountingDate(filters.from);
  const toDate = parseAccountingDate(filters.to);
  const cashIds = await cashLedgerAccountIds(db, companyId);
  const cashIdList = [...cashIds];

  const [opening, closing, entries, treasuryInAgg, treasuryOutAgg] = await Promise.all([
    db.journalEntryLine.aggregate({
      where: { companyId, ledgerAccountId: { in: cashIdList }, journalEntry: { companyId, status: POSTED_OR_REVERSED, entryDate: { lt: fromDate } } },
      _sum: { debit: true, credit: true },
    }),
    db.journalEntryLine.aggregate({
      where: { companyId, ledgerAccountId: { in: cashIdList }, journalEntry: { companyId, status: POSTED_OR_REVERSED, entryDate: { lte: toDate } } },
      _sum: { debit: true, credit: true },
    }),
    // Lançamentos do período que tocam caixa (conjunto limitado — é o próprio conteúdo da demonstração).
    db.journalEntry.findMany({
      where: {
        companyId,
        status: POSTED_OR_REVERSED,
        entryDate: { gte: fromDate, lte: toDate },
        lines: { some: { companyId, ledgerAccountId: { in: cashIdList } } },
      },
      select: {
        id: true,
        accountingEvent: true,
        reversalOf: { select: { accountingEvent: true } },
        lines: { select: { ledgerAccountId: true, debit: true, credit: true } },
      },
    }),
    db.treasuryMovement.aggregate({
      where: { companyId, status: 'ACTIVE', flow: 'IN', occurredAt: { gte: fromDate, lt: new Date(toDate.getTime() + 24 * 60 * 60 * 1000) } },
      _sum: { amount: true },
    }),
    db.treasuryMovement.aggregate({
      where: { companyId, status: 'ACTIVE', flow: 'OUT', occurredAt: { gte: fromDate, lt: new Date(toDate.getTime() + 24 * 60 * 60 * 1000) } },
      _sum: { amount: true },
    }),
  ]);

  const openingCash = round2(Number(opening._sum.debit ?? 0) - Number(opening._sum.credit ?? 0));
  const closingCash = round2(Number(closing._sum.debit ?? 0) - Number(closing._sum.credit ?? 0));

  const byId = await loadAccounts(db, companyId);
  const buckets = new Map<string, { section: CashFlowSection; label: string; amount: number }>();
  let internalTransferCount = 0;
  for (const entry of entries) {
    const cashLines = entry.lines.filter((l) => cashIds.has(l.ledgerAccountId));
    const counterpartLines = entry.lines.filter((l) => !cashIds.has(l.ledgerAccountId));
    const cashDelta = round2(cashLines.reduce((sum, l) => sum + Number(l.debit) - Number(l.credit), 0));
    if (counterpartLines.length === 0) {
      // Transferência caixa↔caixa: movimento interno, fora das rubricas.
      internalTransferCount += 1;
      continue;
    }
    if (cashDelta === 0) continue;
    const event = entry.accountingEvent ?? entry.reversalOf?.accountingEvent ?? null;
    let rubric = event ? CASH_FLOW_EVENT_RUBRICS[event] : undefined;
    if (!rubric) {
      const hasEquityCounterpart = counterpartLines.some((l) => byId.get(l.ledgerAccountId)?.accountType === 'EQUITY');
      rubric = hasEquityCounterpart ? EQUITY_FINANCING : OTHER_OPERATING;
    }
    const bucket = buckets.get(rubric.key) ?? { section: rubric.section, label: rubric.label, amount: 0 };
    bucket.amount = round2(bucket.amount + cashDelta);
    buckets.set(rubric.key, bucket);
  }

  const sectionLines = (section: CashFlowSection): CashFlowLine[] =>
    [...buckets.entries()]
      .filter(([, b]) => b.section === section)
      .map(([key, b]) => ({ key, label: b.label, amount: b.amount }))
      .sort((a, b) => a.label.localeCompare(b.label));
  const operating = sectionLines('OPERATING');
  const investing = sectionLines('INVESTING');
  const financing = sectionLines('FINANCING');
  const operatingTotal = round2(operating.reduce((s, l) => s + l.amount, 0));
  const investingTotal = round2(investing.reduce((s, l) => s + l.amount, 0));
  const financingTotal = round2(financing.reduce((s, l) => s + l.amount, 0));
  const netChange = round2(operatingTotal + investingTotal + financingTotal);

  const treasuryIn = round2(Number(treasuryInAgg._sum.amount ?? 0));
  const treasuryOut = round2(Number(treasuryOutAgg._sum.amount ?? 0));
  const treasuryNet = round2(treasuryIn - treasuryOut);
  return {
    filters,
    operating,
    investing,
    financing,
    operatingTotal,
    investingTotal,
    financingTotal,
    netChange,
    openingCash,
    closingCash,
    internalTransferCount,
    treasury: { totalIn: treasuryIn, totalOut: treasuryOut, net: treasuryNet, difference: round2(treasuryNet - netChange) },
  };
}

// ─────────────────────────────────────────────────────────────
// Exportação CSV (padrão do Extrato Diário: separador «;»)
// ─────────────────────────────────────────────────────────────

function groupCsvLines(rows: StatementGroupRow[]): string[] {
  const lines: string[] = [];
  for (const group of rows) {
    lines.push(accountingCsvLine([group.code, group.name, accountingMoneyLabel(group.amount)]));
    for (const account of group.accounts) {
      lines.push(accountingCsvLine([account.code, `  ${account.name}`, accountingMoneyLabel(account.amount)]));
    }
  }
  return lines;
}

export async function exportIncomeStatementCsv(db: PrismaClient, ctx: RequestContext, filters: StatementPeriodFilters = {}): Promise<{ filename: string; content: string }> {
  requirePermission(ctx, 'reports.export');
  const report = await getIncomeStatementReport(db, ctx, filters);
  const lines = [
    accountingCsvLine(['Demonstração de Resultados']),
    accountingCsvLine(['Período', `${report.filters.from} a ${report.filters.to}`]),
    accountingCsvLine(['Conta', 'Descrição', 'Valor']),
    accountingCsvLine(['', 'PROVEITOS', '']),
    ...groupCsvLines(report.revenue),
    accountingCsvLine(['', 'Total dos proveitos', accountingMoneyLabel(report.totalRevenue)]),
    accountingCsvLine(['', 'CUSTOS', '']),
    ...groupCsvLines(report.expenses),
    accountingCsvLine(['', 'Total dos custos', accountingMoneyLabel(report.totalExpenses)]),
    accountingCsvLine(['', `Resultado líquido do período (${report.netResult >= 0 ? 'Excedente' : 'Déficit'})`, accountingMoneyLabel(report.netResult)]),
  ];
  return { filename: `contabilidade-demonstracao-resultados-${report.filters.from}-${report.filters.to}.csv`, content: lines.join('\n') };
}

export async function exportBalanceSheetCsv(db: PrismaClient, ctx: RequestContext, filters: Pick<StatementPeriodFilters, 'to'> = {}): Promise<{ filename: string; content: string }> {
  requirePermission(ctx, 'reports.export');
  const report = await getBalanceSheetReport(db, ctx, filters);
  const lines = [
    accountingCsvLine(['Balanço Patrimonial']),
    accountingCsvLine(['À data de', report.asOf]),
    accountingCsvLine(['Conta', 'Descrição', 'Valor']),
    accountingCsvLine(['', 'ACTIVO', '']),
    ...groupCsvLines(report.assets),
    accountingCsvLine(['', 'Total do Activo', accountingMoneyLabel(report.totalAssets)]),
    accountingCsvLine(['', 'PASSIVO', '']),
    ...groupCsvLines(report.liabilities),
    accountingCsvLine(['', 'Total do Passivo', accountingMoneyLabel(report.totalLiabilities)]),
    accountingCsvLine(['', 'CAPITAL PRÓPRIO', '']),
    ...groupCsvLines(report.equity),
    accountingCsvLine(['', 'Resultados de exercícios anteriores (por apurar)', accountingMoneyLabel(report.priorYearsResult)]),
    accountingCsvLine(['', 'Resultado líquido do exercício (por apurar)', accountingMoneyLabel(report.currentYearResult)]),
    accountingCsvLine(['', 'Total do Capital Próprio', accountingMoneyLabel(report.totalEquity)]),
    accountingCsvLine(['', 'Total do Passivo + Capital Próprio', accountingMoneyLabel(report.totalLiabilitiesAndEquity)]),
    accountingCsvLine(['Validação', report.isBalanced ? 'Activo = Passivo + Capital Próprio' : 'BALANÇO NÃO FECHA — investigar lançamentos desequilibrados']),
  ];
  return { filename: `contabilidade-balanco-${report.asOf}.csv`, content: lines.join('\n') };
}

export async function exportCashFlowStatementCsv(db: PrismaClient, ctx: RequestContext, filters: StatementPeriodFilters = {}): Promise<{ filename: string; content: string }> {
  requirePermission(ctx, 'reports.export');
  const report = await getCashFlowStatementReport(db, ctx, filters);
  const sectionCsv = (title: string, rows: CashFlowLine[], total: number): string[] => [
    accountingCsvLine([title, '']),
    ...rows.map((l) => accountingCsvLine([l.label, accountingMoneyLabel(l.amount)])),
    accountingCsvLine([`Fluxo líquido — ${title.toLowerCase()}`, accountingMoneyLabel(total)]),
  ];
  const lines = [
    accountingCsvLine(['Demonstração do Fluxo de Caixa (método directo)']),
    accountingCsvLine(['Período', `${report.filters.from} a ${report.filters.to}`]),
    accountingCsvLine(['Rubrica', 'Valor']),
    ...sectionCsv('Actividades operacionais', report.operating, report.operatingTotal),
    ...sectionCsv('Actividades de investimento', report.investing, report.investingTotal),
    ...sectionCsv('Actividades de financiamento', report.financing, report.financingTotal),
    accountingCsvLine(['Variação líquida de caixa', accountingMoneyLabel(report.netChange)]),
    accountingCsvLine(['Caixa e equivalentes no início do período', accountingMoneyLabel(report.openingCash)]),
    accountingCsvLine(['Caixa e equivalentes no fim do período', accountingMoneyLabel(report.closingCash)]),
    accountingCsvLine(['Reconciliação com a Tesouraria — entradas', accountingMoneyLabel(report.treasury.totalIn)]),
    accountingCsvLine(['Reconciliação com a Tesouraria — saídas', accountingMoneyLabel(report.treasury.totalOut)]),
    accountingCsvLine(['Reconciliação com a Tesouraria — diferença', accountingMoneyLabel(report.treasury.difference)]),
  ];
  return { filename: `contabilidade-fluxo-caixa-${report.filters.from}-${report.filters.to}.csv`, content: lines.join('\n') };
}

// ─────────────────────────────────────────────────────────────
// Exportação Excel das demonstrações (S18, item 9)
// ─────────────────────────────────────────────────────────────

async function statementXlsxHeader(db: PrismaClient, ctx: RequestContext): Promise<{ companyName: string; exportedBy: string | undefined }> {
  const companyId = requireCompany(ctx);
  const [company, user] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { legalName: true, tradeName: true } }),
    ctx.userId ? db.user.findFirst({ where: { companyId, id: ctx.userId }, select: { name: true, email: true } }) : Promise.resolve(null),
  ]);
  return { companyName: company?.tradeName || company?.legalName || '', exportedBy: user?.name || user?.email || undefined };
}

const STATEMENT_COLUMNS = [
  { key: 'code', header: 'Conta', type: 'text', width: 10 },
  { key: 'name', header: 'Descrição', type: 'text', width: 46 },
  { key: 'amount', header: 'Valor', type: 'money', width: 17 },
] as const;

function statementGroupRows(rows: StatementGroupRow[]): Array<Record<string, XlsxCellValue>> {
  const out: Array<Record<string, XlsxCellValue>> = [];
  for (const group of rows) {
    out.push({ code: group.code, name: group.name, amount: group.amount });
    for (const account of group.accounts) {
      out.push({ code: account.code, name: `  ${account.name}`, amount: account.amount });
    }
  }
  return out;
}

/** Demonstração de Resultados em Excel — mesmos valores do ecrã/CSV, montantes numéricos. */
export async function exportIncomeStatementXlsx(db: PrismaClient, ctx: RequestContext, filters: StatementPeriodFilters = {}): Promise<{ filename: string; buffer: Buffer }> {
  requirePermission(ctx, 'reports.export');
  const report = await getIncomeStatementReport(db, ctx, filters);
  const header = await statementXlsxHeader(db, ctx);
  const buffer = await exportTableToXlsx({
    title: 'Demonstração de Resultados',
    ...header,
    period: `${report.filters.from} a ${report.filters.to}`,
    exportedAt: new Date(),
    sheetName: 'Demonstração de Resultados',
    columns: [...STATEMENT_COLUMNS],
    groups: [
      { label: 'PROVEITOS', rows: statementGroupRows(report.revenue), subtotal: { name: 'Total dos proveitos', amount: report.totalRevenue } },
      { label: 'CUSTOS', rows: statementGroupRows(report.expenses), subtotal: { name: 'Total dos custos', amount: report.totalExpenses } },
    ],
    grandTotal: { name: `Resultado líquido do período (${report.netResult >= 0 ? 'Excedente' : 'Déficit'})`, amount: report.netResult },
  });
  return { filename: `contabilidade-demonstracao-resultados-${report.filters.from}-${report.filters.to}.xlsx`, buffer };
}

/** Balanço Patrimonial em Excel — secções Activo/Passivo/Capital com validação de fecho. */
export async function exportBalanceSheetXlsx(db: PrismaClient, ctx: RequestContext, filters: Pick<StatementPeriodFilters, 'to'> = {}): Promise<{ filename: string; buffer: Buffer }> {
  requirePermission(ctx, 'reports.export');
  const report = await getBalanceSheetReport(db, ctx, filters);
  const header = await statementXlsxHeader(db, ctx);
  const groups: XlsxGroup[] = [
    { label: 'ACTIVO', rows: statementGroupRows(report.assets), subtotal: { name: 'Total do Activo', amount: report.totalAssets } },
    { label: 'PASSIVO', rows: statementGroupRows(report.liabilities), subtotal: { name: 'Total do Passivo', amount: report.totalLiabilities } },
    {
      label: 'CAPITAL PRÓPRIO',
      rows: [
        ...statementGroupRows(report.equity),
        { code: null, name: 'Resultados de exercícios anteriores (por apurar)', amount: report.priorYearsResult },
        { code: null, name: 'Resultado líquido do exercício (por apurar)', amount: report.currentYearResult },
      ],
      subtotal: { name: 'Total do Capital Próprio', amount: report.totalEquity },
    },
  ];
  const buffer = await exportTableToXlsx({
    title: 'Balanço Patrimonial',
    ...header,
    period: `À data de ${report.asOf}`,
    exportedAt: new Date(),
    sheetName: 'Balanço Patrimonial',
    headerLines: [report.isBalanced ? 'Validação: Activo = Passivo + Capital Próprio' : 'ATENÇÃO: BALANÇO NÃO FECHA — investigar lançamentos desequilibrados'],
    columns: [...STATEMENT_COLUMNS],
    groups,
    grandTotal: { name: 'Total do Passivo + Capital Próprio', amount: report.totalLiabilitiesAndEquity },
  });
  return { filename: `contabilidade-balanco-${report.asOf}.xlsx`, buffer };
}

/** Demonstração do Fluxo de Caixa em Excel — método directo, com reconciliação da Tesouraria. */
export async function exportCashFlowStatementXlsx(db: PrismaClient, ctx: RequestContext, filters: StatementPeriodFilters = {}): Promise<{ filename: string; buffer: Buffer }> {
  requirePermission(ctx, 'reports.export');
  const report = await getCashFlowStatementReport(db, ctx, filters);
  const header = await statementXlsxHeader(db, ctx);
  const section = (title: string, rows: CashFlowLine[], total: number): XlsxGroup => ({
    label: title,
    rows: rows.map((l) => ({ name: l.label, amount: l.amount })),
    subtotal: { name: `Fluxo líquido — ${title.toLowerCase()}`, amount: total },
  });
  const buffer = await exportTableToXlsx({
    title: 'Demonstração do Fluxo de Caixa (método directo)',
    ...header,
    period: `${report.filters.from} a ${report.filters.to}`,
    exportedAt: new Date(),
    sheetName: 'Fluxo de Caixa',
    columns: [
      { key: 'name', header: 'Rubrica', type: 'text', width: 52 },
      { key: 'amount', header: 'Valor', type: 'money', width: 17 },
    ],
    groups: [
      section('Actividades operacionais', report.operating, report.operatingTotal),
      section('Actividades de investimento', report.investing, report.investingTotal),
      section('Actividades de financiamento', report.financing, report.financingTotal),
      {
        label: 'Síntese',
        rows: [
          { name: 'Variação líquida de caixa', amount: report.netChange },
          { name: 'Caixa e equivalentes no início do período', amount: report.openingCash },
          { name: 'Caixa e equivalentes no fim do período', amount: report.closingCash },
          { name: 'Reconciliação com a Tesouraria — entradas', amount: report.treasury.totalIn },
          { name: 'Reconciliação com a Tesouraria — saídas', amount: report.treasury.totalOut },
          { name: 'Reconciliação com a Tesouraria — diferença', amount: report.treasury.difference },
        ],
      },
    ],
  });
  return { filename: `contabilidade-fluxo-caixa-${report.filters.from}-${report.filters.to}.xlsx`, buffer };
}
