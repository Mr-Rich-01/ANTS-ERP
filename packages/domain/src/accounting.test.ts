import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@ants/database';
import type { RequestContext } from './context';
import {
  listLedgerAccounts,
  createLedgerAccount,
  setLedgerAccountStatus,
  listFiscalYears,
  createFiscalYear,
  setCurrentFiscalYear,
  listAccountingPeriods,
  createAccountingPeriod,
  listAccountingMappings,
  setAccountingMapping,
  createJournalEntryDraft,
  updateJournalEntryDraft,
  deleteJournalEntryDraft,
  postJournalEntry,
  reverseJournalEntry,
  listJournalEntries,
  getTrialBalance,
  parseAccountingDate,
  formatAccountingDate,
  dateWithin,
} from './accounting';
import { ForbiddenError, ValidationError } from './errors';

// O `db` nunca é tocado: requirePermission lança antes de qualquer acesso à BD.
const db = {} as PrismaClient;

function ctx(permissions: string[], isPlatformAdmin = false): RequestContext {
  return { companyId: 'company-a', userId: 'u1', permissions: new Set(permissions), isPlatformAdmin };
}

const draft = { journalId: 'j1', entryDate: '2026-03-10', description: 'Teste', lines: [{ ledgerAccountId: 'a', debit: 100 }, { ledgerAccountId: 'b', credit: 100 }] };

describe('Contabilidade — gates de permissão (servidor)', () => {
  it('leituras exigem accounting.view', async () => {
    await expect(listLedgerAccounts(db, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listFiscalYears(db, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAccountingPeriods(db, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAccountingMappings(db, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listJournalEntries(db, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getTrialBalance(db, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('plano de contas exige accounting.manageAccounts', async () => {
    await expect(createLedgerAccount(db, ctx(['accounting.view']), { code: '999', name: 'X', accountType: 'ASSET', normalBalance: 'DEBIT' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setLedgerAccountStatus(db, ctx(['accounting.view']), 'a1', false)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('exercícios/períodos exigem accounting.managePeriods', async () => {
    await expect(createFiscalYear(db, ctx(['accounting.view']), { name: '2027', startDate: '2027-01-01', endDate: '2027-12-31' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setCurrentFiscalYear(db, ctx(['accounting.view']), 'fy1')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createAccountingPeriod(db, ctx(['accounting.view']), { fiscalYearId: 'fy1', periodNumber: 13, code: '2026-13', name: 'Aj', startDate: '2026-12-31', endDate: '2026-12-31' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('mappings exigem accounting.manageSettings', async () => {
    await expect(setAccountingMapping(db, ctx(['accounting.view']), 'CASH_MAIN', 'a1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('preparar draft exige accounting.prepare (não accounting.post)', async () => {
    await expect(createJournalEntryDraft(db, ctx(['accounting.post']), draft)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateJournalEntryDraft(db, ctx(['accounting.post']), 'e1', draft)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteJournalEntryDraft(db, ctx(['accounting.post']), 'e1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('confirmar exige accounting.post; estornar exige accounting.reverse', async () => {
    await expect(postJournalEntry(db, ctx(['accounting.prepare']), 'e1')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reverseJournalEntry(db, ctx(['accounting.post']), 'e1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  // NOTA: setFiscalYearStatus/setAccountingPeriodStatus aplicam o gate por TRANSIÇÃO
  // (unlockPeriods só para LOCKED→OPEN), o que exige ler o estado actual na BD. Por isso
  // o seu gate é verificado no smoke de integração (cenário #28), não aqui.

  it('quem tem a permissão passa o gate (falha depois, já a tocar a BD)', async () => {
    await expect(listLedgerAccounts(db, ctx(['accounting.view']))).rejects.not.toBeInstanceOf(ForbiddenError);
  });
});

describe('Contabilidade — datas contabilísticas (sem fuso)', () => {
  it('parse/format YYYY-MM-DD é estável (UTC, sem mudança de dia)', () => {
    const d = parseAccountingDate('2026-03-10');
    expect(d.toISOString()).toBe('2026-03-10T00:00:00.000Z');
    expect(formatAccountingDate(d)).toBe('2026-03-10');
  });

  it('rejeita formato inválido e dias inexistentes', () => {
    expect(() => parseAccountingDate('10/03/2026')).toThrow(ValidationError);
    expect(() => parseAccountingDate('2026-02-30')).toThrow(ValidationError);
    expect(() => parseAccountingDate('2026-13-01')).toThrow(ValidationError);
  });

  it('compara datas civis incluindo o primeiro, meio e último dia do período', () => {
    const start = parseAccountingDate('2026-06-01');
    const end = parseAccountingDate('2026-06-30');

    expect(dateWithin(new Date('2026-06-01T00:00:00.000Z'), start, end)).toBe(true);
    expect(dateWithin(new Date('2026-06-15T10:00:00.000Z'), start, end)).toBe(true);
    expect(dateWithin(new Date('2026-06-30T20:00:00.000Z'), start, end)).toBe(true);
    expect(dateWithin(new Date('2026-05-31T23:59:59.999Z'), start, end)).toBe(false);
    expect(dateWithin(new Date('2026-07-01T00:00:00.000Z'), start, end)).toBe(false);
  });
});
