/**
 * Suite de integracao P1-04 - relatorios contabilisticos V1.
 * Correr com: pnpm test:integration:accounting:reports
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ForbiddenError } from './errors';
import {
  exportAccountLedgerCsv,
  exportAccountingJournalCsv,
  exportTrialBalanceCsv,
  getAccountLedgerReport,
  getAccountingJournalReport,
  getTrialBalanceReport,
} from './accounting';

const CA = 'accounting-reports-a';
const CB = 'accounting-reports-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, userName: 'Operador Contabilistico', permissions: new Set(permissions), isPlatformAdmin: false };
}

const viewPerms = ['accounting.view'];
const exportPerms = ['accounting.view', 'reports.export'];

let ids!: {
  fy: string;
  periodJun: string;
  periodJul: string;
  journal: string;
  salesJournal: string;
  purchasesJournal: string;
  cashJournal: string;
  bankJournal: string;
  cash: string;
  bank: string;
  ar: string;
  ap: string;
  revenue: string;
  purchases: string;
};

async function teardown(companyId: string) {
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.fiscalYear.deleteMany({ where: { companyId } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: { gte: 2 } } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId } });
  await prisma.accountingJournal.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function ledger(companyId: string, code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT') {
  return prisma.ledgerAccount.create({ data: { companyId, code, name, accountType, normalBalance, level: 1, isPosting: true, isActive: true } });
}

async function createEntry(input: {
  companyId: string;
  fiscalYearId: string;
  periodId: string;
  journalId: string;
  number: string;
  date: string;
  description: string;
  reference?: string;
  status?: 'POSTED' | 'REVERSED';
  sourceType?: string;
  sourceId?: string;
  accountingEvent?: string;
  reversalOfId?: string;
  lines: Array<{ ledgerAccountId: string; debit?: number; credit?: number; description?: string }>;
}) {
  const totalDebit = input.lines.reduce((sum, line) => sum + (line.debit ?? 0), 0);
  const totalCredit = input.lines.reduce((sum, line) => sum + (line.credit ?? 0), 0);
  const entry = await prisma.journalEntry.create({
    data: {
      companyId: input.companyId,
      fiscalYearId: input.fiscalYearId,
      accountingPeriodId: input.periodId,
      journalId: input.journalId,
      entryNumber: input.number,
      entryDate: D(input.date),
      postingDate: D(input.date),
      status: input.status ?? 'POSTED',
      description: input.description,
      reference: input.reference ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      accountingEvent: input.accountingEvent ?? null,
      reversalOfId: input.reversalOfId ?? null,
      totalDebit,
      totalCredit,
      postedAt: D(input.date),
      postedById: `${input.companyId}-user`,
      createdById: `${input.companyId}-user`,
    },
  });
  await prisma.journalEntryLine.createMany({
    data: input.lines.map((line, index) => ({
      companyId: input.companyId,
      journalEntryId: entry.id,
      ledgerAccountId: line.ledgerAccountId,
      debit: line.debit ?? 0,
      credit: line.credit ?? 0,
      description: line.description ?? null,
      lineNumber: index + 1,
    })),
  });
  return entry;
}

async function provisionCompanyA() {
  await prisma.company.create({ data: { id: CA, legalName: 'Accounting Reports A' } });
  await prisma.user.create({ data: { companyId: CA, email: 'accounting-reports-a@ants.test', passwordHash: 'x', name: 'Ana Contabilista', mustChangePassword: false } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const periodJun = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 6, code: '2026-06', name: 'Junho', startDate: D('2026-06-01'), endDate: D('2026-06-30'), status: 'OPEN' } });
  const periodJul = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 7, code: '2026-07', name: 'Julho', startDate: D('2026-07-01'), endDate: D('2026-07-31'), status: 'OPEN' } });
  const journal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DG', name: 'Geral', journalType: 'GENERAL', sequencePrefix: 'LG' } });
  const salesJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' } });
  const purchasesJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DC', name: 'Compras', journalType: 'PURCHASES', sequencePrefix: 'LC' } });
  const cashJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' } });
  const bankJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DBC', name: 'Bancos', journalType: 'BANK', sequencePrefix: 'BC' } });
  const cash = (await ledger(CA, '111', 'Caixa', 'ASSET', 'DEBIT')).id;
  const bank = (await ledger(CA, '112', 'Banco', 'ASSET', 'DEBIT')).id;
  const ar = (await ledger(CA, '121', 'Clientes c/c', 'ASSET', 'DEBIT')).id;
  const ap = (await ledger(CA, '211', 'Fornecedores c/c', 'LIABILITY', 'CREDIT')).id;
  const revenue = (await ledger(CA, '411', 'Vendas', 'REVENUE', 'CREDIT')).id;
  const purchases = (await ledger(CA, '521', 'Compras', 'EXPENSE', 'DEBIT')).id;
  ids = { fy: fy.id, periodJun: periodJun.id, periodJul: periodJul.id, journal: journal.id, salesJournal: salesJournal.id, purchasesJournal: purchasesJournal.id, cashJournal: cashJournal.id, bankJournal: bankJournal.id, cash, bank, ar, ap, revenue, purchases };

  await createEntry({
    companyId: CA,
    fiscalYearId: ids.fy,
    periodId: ids.periodJun,
    journalId: ids.journal,
    number: 'AB 2026/0001',
    date: '2026-06-30',
    description: 'Saldo antes do periodo',
    lines: [{ ledgerAccountId: cash, debit: 100 }, { ledgerAccountId: revenue, credit: 100 }],
  });
  await createEntry({
    companyId: CA,
    fiscalYearId: ids.fy,
    periodId: ids.periodJul,
    journalId: ids.salesJournal,
    number: 'LV 2026/0001',
    date: '2026-07-01',
    description: 'Factura emitida FT 2026/0001',
    reference: 'FT 2026/0001',
    sourceType: 'INVOICE',
    sourceId: 'invoice-a',
    accountingEvent: 'SALE_ISSUED',
    lines: [{ ledgerAccountId: ar, debit: 116 }, { ledgerAccountId: revenue, credit: 116 }],
  });
  await createEntry({
    companyId: CA,
    fiscalYearId: ids.fy,
    periodId: ids.periodJul,
    journalId: ids.cashJournal,
    number: 'CX 2026/0001',
    date: '2026-07-02',
    description: 'Recebimento de cliente REC 2026/0001',
    reference: 'REC 2026/0001',
    sourceType: 'CUSTOMER_PAYMENT',
    sourceId: 'payment-a',
    accountingEvent: 'RECEIPT_POSTED',
    lines: [{ ledgerAccountId: cash, debit: 50 }, { ledgerAccountId: ar, credit: 50 }],
  });
  await createEntry({
    companyId: CA,
    fiscalYearId: ids.fy,
    periodId: ids.periodJul,
    journalId: ids.purchasesJournal,
    number: 'LC 2026/0001',
    date: '2026-07-03',
    description: 'Recepcao de compra OC 2026/0001',
    sourceType: 'PURCHASE_RECEIPT',
    sourceId: 'receipt-a',
    accountingEvent: 'PURCHASE_RECEIVED',
    lines: [{ ledgerAccountId: purchases, debit: 80 }, { ledgerAccountId: ap, credit: 80 }],
  });
  await createEntry({
    companyId: CA,
    fiscalYearId: ids.fy,
    periodId: ids.periodJul,
    journalId: ids.bankJournal,
    number: 'BC 2026/0001',
    date: '2026-07-04',
    description: 'Pagamento a fornecedor PG 2026/0001',
    sourceType: 'SUPPLIER_PAYMENT',
    sourceId: 'supplier-payment-a',
    accountingEvent: 'SUPPLIER_PAYMENT_POSTED',
    lines: [{ ledgerAccountId: ap, debit: 30 }, { ledgerAccountId: bank, credit: 30 }],
  });
  const original = await createEntry({
    companyId: CA,
    fiscalYearId: ids.fy,
    periodId: ids.periodJul,
    journalId: ids.salesJournal,
    number: 'LV 2026/0002',
    date: '2026-07-05',
    description: 'Factura depois estornada',
    sourceType: 'INVOICE',
    sourceId: 'invoice-reversed-a',
    accountingEvent: 'SALE_ISSUED',
    status: 'REVERSED',
    lines: [{ ledgerAccountId: cash, debit: 20 }, { ledgerAccountId: revenue, credit: 20 }],
  });
  await createEntry({
    companyId: CA,
    fiscalYearId: ids.fy,
    periodId: ids.periodJul,
    journalId: ids.journal,
    number: 'AJ 2026/0001',
    date: '2026-07-06',
    description: 'Estorno de LV 2026/0002',
    reference: 'LV 2026/0002',
    reversalOfId: original.id,
    lines: [{ ledgerAccountId: revenue, debit: 20 }, { ledgerAccountId: cash, credit: 20 }],
  });
}

async function provisionCompanyB() {
  await prisma.company.create({ data: { id: CB, legalName: 'Accounting Reports B' } });
  await prisma.user.create({ data: { companyId: CB, email: 'accounting-reports-b@ants.test', passwordHash: 'x', name: 'Empresa B User', mustChangePassword: false } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CB, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const period = await prisma.accountingPeriod.create({ data: { companyId: CB, fiscalYearId: fy.id, periodNumber: 7, code: '2026-07', name: 'Julho', startDate: D('2026-07-01'), endDate: D('2026-07-31'), status: 'OPEN' } });
  const journal = await prisma.accountingJournal.create({ data: { companyId: CB, code: 'DG', name: 'Geral B', journalType: 'GENERAL', sequencePrefix: 'LG' } });
  const cash = (await ledger(CB, '111', 'Caixa Empresa B', 'ASSET', 'DEBIT')).id;
  const revenue = (await ledger(CB, '411', 'Vendas Empresa B', 'REVENUE', 'CREDIT')).id;
  await createEntry({
    companyId: CB,
    fiscalYearId: fy.id,
    periodId: period.id,
    journalId: journal.id,
    number: 'LG 2026/9999',
    date: '2026-07-02',
    description: 'Lancamento Empresa B',
    sourceType: 'INVOICE',
    sourceId: 'invoice-b',
    accountingEvent: 'SALE_ISSUED',
    lines: [{ ledgerAccountId: cash, debit: 999 }, { ledgerAccountId: revenue, credit: 999 }],
  });
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await provisionCompanyA();
  await provisionCompanyB();
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.$disconnect();
});

describe('P1-04 - Contabilidade V1 reports', () => {
  it('diario respeita companyId e lista lancamentos reais', async () => {
    const report = await getAccountingJournalReport(prisma, ctx(CA, viewPerms), { from: '2026-07-01', to: '2026-07-31' });
    expect(report.lines.length).toBeGreaterThan(0);
    expect(report.lines.some((line) => line.entryNumber === 'LV 2026/0001' && line.sourceType === 'INVOICE')).toBe(true);
    expect(JSON.stringify(report.lines)).not.toContain('Empresa B');
  });

  it('diario filtra por conta, origem e pesquisa', async () => {
    const byAccount = await getAccountingJournalReport(prisma, ctx(CA, viewPerms), { from: '2026-07-01', to: '2026-07-31', ledgerAccountId: ids.cash });
    expect(byAccount.lines.every((line) => line.entryId === 'never' || byAccount.lines.some((candidate) => candidate.entryId === line.entryId && candidate.accountId === ids.cash))).toBe(true);
    const receipt = await getAccountingJournalReport(prisma, ctx(CA, viewPerms), { from: '2026-07-01', to: '2026-07-31', sourceType: 'CUSTOMER_PAYMENT', q: 'REC 2026/0001' });
    expect(receipt.lines.map((line) => line.entryNumber)).toEqual(['CX 2026/0001', 'CX 2026/0001']);
  });

  it('razao por conta calcula saldo acumulado com saldo inicial', async () => {
    const ledger = await getAccountLedgerReport(prisma, ctx(CA, viewPerms), ids.cash, { from: '2026-07-01', to: '2026-07-31' });
    expect(ledger.openingBalance).toBe(100);
    expect(ledger.totalDebit).toBe(70);
    expect(ledger.totalCredit).toBe(20);
    expect(ledger.closingBalance).toBe(150);
    expect(ledger.rows.at(-1)?.balance).toBe(150);
  });

  it('balancete soma debitos e creditos e confirma equilibrio', async () => {
    const trial = await getTrialBalanceReport(prisma, ctx(CA, viewPerms), { from: '2026-07-01', to: '2026-07-31' });
    expect(trial.totalDebit).toBe(316);
    expect(trial.totalCredit).toBe(316);
    expect(trial.isBalanced).toBe(true);
    expect(trial.rows.some((row) => row.code === '111' && row.openingBalance === 100)).toBe(true);
  });

  it('periodo sem movimentos retorna estado vazio correcto', async () => {
    const trial = await getTrialBalanceReport(prisma, ctx(CA, viewPerms), { from: '2026-08-01', to: '2026-08-31' });
    expect(trial.movementCount).toBe(0);
    expect(trial.totalDebit).toBe(0);
    expect(trial.totalCredit).toBe(0);
  });

  it('CSV do diario respeita filtros', async () => {
    const exported = await exportAccountingJournalCsv(prisma, ctx(CA, exportPerms), { from: '2026-07-01', to: '2026-07-31', sourceType: 'CUSTOMER_PAYMENT' });
    expect(exported.filename).toBe('contabilidade-diario-2026-07-01-2026-07-31.csv');
    expect(exported.content).toContain('REC 2026/0001');
    expect(exported.content).not.toContain('FT 2026/0001');
  });

  it('CSV do razao respeita companyId', async () => {
    const exported = await exportAccountLedgerCsv(prisma, ctx(CA, exportPerms), ids.cash, { from: '2026-07-01', to: '2026-07-31' });
    expect(exported.content).toContain('Caixa');
    expect(exported.content).not.toContain('Empresa B');
  });

  it('CSV do balancete nao inclui dados de outra empresa', async () => {
    const exported = await exportTrialBalanceCsv(prisma, ctx(CA, exportPerms), { from: '2026-07-01', to: '2026-07-31' });
    expect(exported.content).toContain('Clientes c/c');
    expect(exported.content).not.toContain('Vendas Empresa B');
  });

  it('utilizador sem permissao e bloqueado', async () => {
    await expect(getAccountingJournalReport(prisma, ctx(CA, ['reports.export']), { from: '2026-07-01', to: '2026-07-31' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportTrialBalanceCsv(prisma, ctx(CA, ['accounting.view']), { from: '2026-07-01', to: '2026-07-31' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('facturas, recibos, compras, pagamentos e reversoes aparecem no diario', async () => {
    const report = await getAccountingJournalReport(prisma, ctx(CA, viewPerms), { from: '2026-07-01', to: '2026-07-31' });
    const entries = new Set(report.lines.map((line) => `${line.sourceType}:${line.accountingEvent}:${line.status}`));
    expect(entries.has('INVOICE:SALE_ISSUED:POSTED')).toBe(true);
    expect(entries.has('CUSTOMER_PAYMENT:RECEIPT_POSTED:POSTED')).toBe(true);
    expect(entries.has('PURCHASE_RECEIPT:PURCHASE_RECEIVED:POSTED')).toBe(true);
    expect(entries.has('SUPPLIER_PAYMENT:SUPPLIER_PAYMENT_POSTED:POSTED')).toBe(true);
    expect(report.lines.some((line) => line.status === 'REVERSED')).toBe(true);
    expect(report.lines.some((line) => line.description.startsWith('Estorno de'))).toBe(true);
  });
});
