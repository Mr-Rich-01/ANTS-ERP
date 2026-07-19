/**
 * Suite de INTEGRAÇÃO da Fase 8b — domínio contabilístico contra PostgreSQL real.
 * Fora do `pnpm test` unitário. Correr com: `pnpm test:integration:accounting`
 * (exige DATABASE_URL no ambiente). Determinística, isolada por empresas de teste
 * (`smoke-acc-a` / `smoke-acc-b`) e com teardown — nunca escreve em `demo-company`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ConflictError, ForbiddenError, ValidationError } from './errors';
import {
  updateLedgerAccount,
  setFiscalYearStatus, setAccountingPeriodStatus,
  setAccountingMapping,
  createJournalEntryDraft, updateJournalEntryDraft, deleteJournalEntryDraft,
  postJournalEntry, reverseJournalEntry, createJournalEntryDraftTx,
  listJournalEntries, getJournalEntry,
} from './accounting';

const CA = 'smoke-acc-a';
const CB = 'smoke-acc-b';
const ALL = ['accounting.view', 'accounting.prepare', 'accounting.post', 'accounting.reverse', 'accounting.manageAccounts', 'accounting.managePeriods', 'accounting.unlockPeriods', 'accounting.manageSettings'];

function ctx(companyId: string, perms: string[] = ALL, isPlatformAdmin = false): RequestContext {
  return { companyId, userId: 'smoke-user', permissions: new Set(perms), isPlatformAdmin };
}
const A = ctx(CA);
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

// ids provisionados (atribuídos por completo no fim de provision()).
interface IdMap {
  fyA: string; jan: string; feb: string; mar: string; dg: string; daj: string; dx: string;
  grp: string; caixa: string; vendas: string; inactiveAcc: string; gA: string; gB: string;
  fyB: string; janB: string; dgB: string; caixaB: string; vendasB: string; custB: string;
}
let ids!: IdMap;
let demoJournalEntriesBaseline = 0;

async function teardown(companyId: string) {
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingMapping.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.fiscalYear.deleteMany({ where: { companyId } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: { gte: 2 } } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId } });
  await prisma.accountingJournal.deleteMany({ where: { companyId } });
  await prisma.documentCounter.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function provision() {
  // Empresa A — estrutura completa
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Contabilidade A' } });
  const fyA = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const jan = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fyA.id, periodNumber: 1, code: '2026-01', name: 'Janeiro', startDate: D('2026-01-01'), endDate: D('2026-01-31'), status: 'OPEN' } });
  const feb = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fyA.id, periodNumber: 2, code: '2026-02', name: 'Fevereiro', startDate: D('2026-02-01'), endDate: D('2026-02-28'), status: 'OPEN' } });
  const mar = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fyA.id, periodNumber: 3, code: '2026-03', name: 'Março', startDate: D('2026-03-01'), endDate: D('2026-03-31'), status: 'OPEN' } });
  const dg = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DG', name: 'Geral', journalType: 'GENERAL', sequencePrefix: 'LG', isActive: true } });
  const daj = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DAJ', name: 'Ajustamentos', journalType: 'ADJUSTMENT', sequencePrefix: 'AJ', isActive: true } });
  const dx = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DX', name: 'Inactivo', journalType: 'GENERAL', sequencePrefix: 'DX', isActive: false } });
  const grp = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '1', name: 'Activo', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: false, isActive: true } });
  const caixa = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '11', name: 'Caixa', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, isPosting: true, isActive: true, parentId: grp.id } });
  const vendas = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '41', name: 'Vendas', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1, isPosting: true, isActive: true } });
  const inactiveAcc = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '99', name: 'Inactiva', accountType: 'EXPENSE', normalBalance: 'DEBIT', level: 1, isPosting: true, isActive: false } });
  const gA = await prisma.ledgerAccount.create({ data: { companyId: CA, code: 'GA', name: 'Grupo A', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: false, isActive: true } });
  const gB = await prisma.ledgerAccount.create({ data: { companyId: CA, code: 'GB', name: 'Grupo B', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, isPosting: false, isActive: true, parentId: gA.id } });
  await prisma.accountingMapping.create({ data: { companyId: CA, systemKey: 'CASH_MAIN', ledgerAccountId: caixa.id } });

  // Empresa B — mínima (para isolamento e cross-company)
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Contabilidade B' } });
  const fyB = await prisma.fiscalYear.create({ data: { companyId: CB, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const janB = await prisma.accountingPeriod.create({ data: { companyId: CB, fiscalYearId: fyB.id, periodNumber: 1, code: '2026-01', name: 'Janeiro', startDate: D('2026-01-01'), endDate: D('2026-01-31'), status: 'OPEN' } });
  const dgB = await prisma.accountingJournal.create({ data: { companyId: CB, code: 'DG', name: 'Geral', journalType: 'GENERAL', sequencePrefix: 'LG', isActive: true } });
  const caixaB = await prisma.ledgerAccount.create({ data: { companyId: CB, code: '11', name: 'Caixa B', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: true, isActive: true } });
  const vendasB = await prisma.ledgerAccount.create({ data: { companyId: CB, code: '41', name: 'Vendas B', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1, isPosting: true, isActive: true } });
  const custB = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B' } });

  ids = {
    fyA: fyA.id, jan: jan.id, feb: feb.id, mar: mar.id, dg: dg.id, daj: daj.id, dx: dx.id,
    grp: grp.id, caixa: caixa.id, vendas: vendas.id, inactiveAcc: inactiveAcc.id, gA: gA.id, gB: gB.id,
    fyB: fyB.id, janB: janB.id, dgB: dgB.id, caixaB: caixaB.id, vendasB: vendasB.id, custB: custB.id,
  };
}

function balanced(date = '2026-01-15', amount = 100) {
  return { journalId: ids.dg, entryDate: date, description: 'Lançamento', lines: [{ ledgerAccountId: ids.caixa, debit: amount }, { ledgerAccountId: ids.vendas, credit: amount }] };
}
async function newPostedEntry(date = '2026-01-20') {
  const d = await createJournalEntryDraft(prisma, A, balanced(date));
  return postJournalEntry(prisma, A, d.id);
}
function seq(entryNumber: string): number {
  return Number(entryNumber.split('/')[1]);
}

beforeAll(async () => {
  demoJournalEntriesBaseline = await prisma.journalEntry.count({ where: { companyId: 'demo-company' } });
  await teardown(CA);
  await teardown(CB);
  await provision();
});
afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.$disconnect();
});

describe('Fase 8b — domínio contabilístico (integração)', () => {
  it('#1 conta agrupadora rejeitada', async () => {
    await expect(createJournalEntryDraft(prisma, A, { journalId: ids.dg, entryDate: '2026-01-15', description: 'x', lines: [{ ledgerAccountId: ids.grp, debit: 50 }, { ledgerAccountId: ids.vendas, credit: 50 }] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#2 conta inactiva rejeitada', async () => {
    await expect(createJournalEntryDraft(prisma, A, { journalId: ids.dg, entryDate: '2026-01-15', description: 'x', lines: [{ ledgerAccountId: ids.inactiveAcc, debit: 50 }, { ledgerAccountId: ids.vendas, credit: 50 }] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#3 relação cross-company (cliente de outra empresa) rejeitada', async () => {
    await expect(createJournalEntryDraft(prisma, A, { journalId: ids.dg, entryDate: '2026-01-15', description: 'x', lines: [{ ledgerAccountId: ids.caixa, debit: 50, customerId: ids.custB }, { ledgerAccountId: ids.vendas, credit: 50 }] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#4 draft com menos de duas linhas rejeitado', async () => {
    await expect(createJournalEntryDraft(prisma, A, { journalId: ids.dg, entryDate: '2026-01-15', description: 'x', lines: [{ ledgerAccountId: ids.caixa, debit: 50 }] as never })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#5 linha zero/zero rejeitada', async () => {
    await expect(createJournalEntryDraft(prisma, A, { journalId: ids.dg, entryDate: '2026-01-15', description: 'x', lines: [{ ledgerAccountId: ids.caixa, debit: 0, credit: 0 }, { ledgerAccountId: ids.vendas, credit: 50 }] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#6 linha com débito e crédito em simultâneo rejeitada', async () => {
    await expect(createJournalEntryDraft(prisma, A, { journalId: ids.dg, entryDate: '2026-01-15', description: 'x', lines: [{ ledgerAccountId: ids.caixa, debit: 50, credit: 50 }, { ledgerAccountId: ids.vendas, credit: 50 }] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#7 draft desequilibrado permitido e visível (isBalanced=false)', async () => {
    const d = await createJournalEntryDraft(prisma, A, { journalId: ids.dg, entryDate: '2026-01-15', description: 'desequilibrado', lines: [{ ledgerAccountId: ids.caixa, debit: 100 }, { ledgerAccountId: ids.vendas, credit: 60 }] });
    const e = await getJournalEntry(prisma, A, d.id);
    expect(e.status).toBe('DRAFT');
    expect(e.isBalanced).toBe(false);
    expect(e.totalDebit).toBe(100);
    expect(e.totalCredit).toBe(60);
    await deleteJournalEntryDraft(prisma, A, d.id);
  });

  it('#8 confirmação desequilibrada rejeitada', async () => {
    const d = await createJournalEntryDraft(prisma, A, { journalId: ids.dg, entryDate: '2026-01-15', description: 'deseq', lines: [{ ledgerAccountId: ids.caixa, debit: 100 }, { ledgerAccountId: ids.vendas, credit: 60 }] });
    await expect(postJournalEntry(prisma, A, d.id)).rejects.toBeInstanceOf(ValidationError);
    await deleteJournalEntryDraft(prisma, A, d.id);
  });

  it('#9 período fechado rejeitado na confirmação', async () => {
    const d = await createJournalEntryDraft(prisma, A, balanced('2026-02-10'));
    await setAccountingPeriodStatus(prisma, A, ids.feb, 'CLOSED');
    await expect(postJournalEntry(prisma, A, d.id)).rejects.toBeInstanceOf(ConflictError);
    await setAccountingPeriodStatus(prisma, A, ids.feb, 'OPEN');
    await deleteJournalEntryDraft(prisma, A, d.id);
  });

  it('#10 período bloqueado rejeitado na confirmação', async () => {
    const d = await createJournalEntryDraft(prisma, A, balanced('2026-03-10'));
    await setAccountingPeriodStatus(prisma, A, ids.mar, 'LOCKED');
    await expect(postJournalEntry(prisma, A, d.id)).rejects.toBeInstanceOf(ConflictError);
    await setAccountingPeriodStatus(prisma, A, ids.mar, 'OPEN'); // ctx tem unlockPeriods
    await deleteJournalEntryDraft(prisma, A, d.id);
  });

  it('#11 exercício fechado rejeitado na confirmação', async () => {
    const d = await createJournalEntryDraft(prisma, A, balanced('2026-01-16'));
    await setFiscalYearStatus(prisma, A, ids.fyA, 'CLOSED');
    await expect(postJournalEntry(prisma, A, d.id)).rejects.toBeInstanceOf(ConflictError);
    await setFiscalYearStatus(prisma, A, ids.fyA, 'OPEN');
    await deleteJournalEntryDraft(prisma, A, d.id);
  });

  it('#12 data fora do período rejeitada na confirmação', async () => {
    // Cria um draft directamente com período Jan mas data em Março (estado inconsistente forçado).
    const entry = await prisma.journalEntry.create({ data: { companyId: CA, fiscalYearId: ids.fyA, accountingPeriodId: ids.jan, journalId: ids.dg, entryNumber: `RASCUNHO-x12-${Date.now()}`, entryDate: D('2026-03-15'), description: 'fora', status: 'DRAFT', totalDebit: 100, totalCredit: 100 } });
    await prisma.journalEntryLine.createMany({ data: [{ companyId: CA, journalEntryId: entry.id, ledgerAccountId: ids.caixa, debit: 100, credit: 0, lineNumber: 1 }, { companyId: CA, journalEntryId: entry.id, ledgerAccountId: ids.vendas, debit: 0, credit: 100, lineNumber: 2 }] });
    await expect(postJournalEntry(prisma, A, entry.id)).rejects.toBeInstanceOf(ValidationError);
    await deleteJournalEntryDraft(prisma, A, entry.id);
  });

  it('#13 confirmação válida → POSTED com número definitivo', async () => {
    const d = await createJournalEntryDraft(prisma, A, balanced('2026-01-05'));
    const posted = await postJournalEntry(prisma, A, d.id);
    expect(posted.entryNumber).toMatch(/^LG 2026\/\d{4}$/);
    const e = await getJournalEntry(prisma, A, posted.id);
    expect(e.status).toBe('POSTED');
    expect(e.isBalanced).toBe(true);
    expect(e.entryNumber.startsWith('RASCUNHO-')).toBe(false);
  });

  it('#14 numeração sequencial', async () => {
    const p1 = await newPostedEntry('2026-01-06');
    const p2 = await newPostedEntry('2026-01-07');
    expect(seq(p2.entryNumber)).toBe(seq(p1.entryNumber) + 1);
  });

  it('#15 numeração concorrente sem colisão', async () => {
    const d1 = await createJournalEntryDraft(prisma, A, balanced('2026-01-08'));
    const d2 = await createJournalEntryDraft(prisma, A, balanced('2026-01-09'));
    const [r1, r2] = await Promise.all([postJournalEntry(prisma, A, d1.id), postJournalEntry(prisma, A, d2.id)]);
    expect(r1.entryNumber).not.toBe(r2.entryNumber);
  });

  it('#16 dupla confirmação concorrente → exactamente um conflito', async () => {
    const d = await createJournalEntryDraft(prisma, A, balanced('2026-01-10'));
    const res = await Promise.allSettled([postJournalEntry(prisma, A, d.id), postJournalEntry(prisma, A, d.id)]);
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    const rej = res.filter((r) => r.status === 'rejected').length;
    expect(ok).toBe(1);
    expect(rej).toBe(1);
  });

  it('#17 estorno válido (débitos/créditos invertidos; original REVERSED)', async () => {
    const p = await newPostedEntry('2026-01-11');
    const rev = await reverseJournalEntry(prisma, A, p.id, { reversalDate: '2026-01-12' });
    const original = await getJournalEntry(prisma, A, p.id);
    const reversal = await getJournalEntry(prisma, A, rev.reversalId);
    expect(original.status).toBe('REVERSED');
    expect(reversal.status).toBe('POSTED');
    expect(reversal.reversalOfId).toBe(p.id);
    expect(reversal.totalDebit).toBe(original.totalCredit);
    expect(reversal.totalCredit).toBe(original.totalDebit);
  });

  it('#18 duplo estorno rejeitado', async () => {
    const p = await newPostedEntry('2026-01-13');
    await reverseJournalEntry(prisma, A, p.id, { reversalDate: '2026-01-13' });
    await expect(reverseJournalEntry(prisma, A, p.id, { reversalDate: '2026-01-13' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('#19 edição de POSTED rejeitada', async () => {
    const p = await newPostedEntry('2026-01-14');
    await expect(updateJournalEntryDraft(prisma, A, p.id, balanced('2026-01-14'))).rejects.toBeInstanceOf(ConflictError);
  });

  it('#20 eliminação de POSTED rejeitada', async () => {
    const p = await newPostedEntry('2026-01-17');
    await expect(deleteJournalEntryDraft(prisma, A, p.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('#21 idempotência de origem automática (helper interno)', async () => {
    const origin = { sourceType: 'INVOICE', sourceId: 'inv-123', accountingEvent: 'REVENUE' };
    const lines = [{ ledgerAccountId: ids.caixa, description: null, debit: 100, credit: 0, customerId: null, supplierId: null, treasuryAccountId: null }, { ledgerAccountId: ids.vendas, description: null, debit: 0, credit: 100, customerId: null, supplierId: null, treasuryAccountId: null }];
    const r1 = await prisma.$transaction((tx) => createJournalEntryDraftTx(tx, CA, 'smoke-user', { journalId: ids.dg, entryDate: D('2026-01-18'), description: 'auto', lines, origin }));
    const r2 = await prisma.$transaction((tx) => createJournalEntryDraftTx(tx, CA, 'smoke-user', { journalId: ids.dg, entryDate: D('2026-01-18'), description: 'auto', lines, origin }));
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
    expect(r2.id).toBe(r1.id);
  });

  it('#22 isolamento entre empresas', async () => {
    // Lançamento confirmado em B não é visível a partir de A.
    const dB = await createJournalEntryDraft(prisma, ctx(CB), { journalId: ids.dgB, entryDate: '2026-01-15', description: 'B', lines: [{ ledgerAccountId: ids.caixaB, debit: 30 }, { ledgerAccountId: ids.vendasB, credit: 30 }] });
    const pB = await postJournalEntry(prisma, ctx(CB), dB.id);
    await expect(getJournalEntry(prisma, A, pB.id)).rejects.toBeInstanceOf(Error);
    const listA = await listJournalEntries(prisma, A, { limit: 1000 });
    expect(listA.some((e) => e.id === pB.id)).toBe(false);
  });

  it('#23 mapping para conta agrupadora/inactiva rejeitado', async () => {
    await expect(setAccountingMapping(prisma, A, 'X_GROUP', ids.grp)).rejects.toBeInstanceOf(ValidationError);
    await expect(setAccountingMapping(prisma, A, 'X_INACTIVE', ids.inactiveAcc)).rejects.toBeInstanceOf(ValidationError);
  });

  it('#24 ciclo no plano de contas rejeitado', async () => {
    // gA é pai de gB; tornar gA filho de gB cria um ciclo.
    await expect(updateLedgerAccount(prisma, A, ids.gA, { parentId: ids.gB })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#25 seed e dados da 8a (demo-company) continuam intactos', async () => {
    const [contas, periodos, mappings, exercicios] = await Promise.all([
      prisma.ledgerAccount.count({ where: { companyId: 'demo-company' } }),
      prisma.accountingPeriod.count({ where: { companyId: 'demo-company' } }),
      prisma.accountingMapping.count({ where: { companyId: 'demo-company' } }),
      prisma.fiscalYear.count({ where: { companyId: 'demo-company' } }),
    ]);
    expect(contas).toBe(45); // 37 base (8a) + 114/115 (8c.1) + 312 (S8) + 42/421/55/551 (inventário, S9) + 422 (S10b)
    expect(periodos).toBe(12);
    expect(mappings).toBe(19); // 15 (8a) + OPENING_BALANCE_EQUITY (S8) + INVENTORY_SURPLUS/INVENTORY_SHORTAGE (S9) + OTHER_INCOME (S10b)
    expect(exercicios).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: 'demo-company' } })).toBe(demoJournalEntriesBaseline);
  });

  it('#26 accounting.prepare não permite confirmar', async () => {
    const d = await createJournalEntryDraft(prisma, ctx(CA, ['accounting.prepare', 'accounting.view']), balanced('2026-01-19'));
    await expect(postJournalEntry(prisma, ctx(CA, ['accounting.prepare']), d.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteJournalEntryDraft(prisma, ctx(CA, ['accounting.prepare']), d.id);
  });

  it('#27 accounting.post confirma draft existente mas não o cria/edita', async () => {
    const postOnly = ctx(CA, ['accounting.post']);
    await expect(createJournalEntryDraft(prisma, postOnly, balanced('2026-01-21'))).rejects.toBeInstanceOf(ForbiddenError);
    const d = await createJournalEntryDraft(prisma, A, balanced('2026-01-21'));
    await expect(updateJournalEntryDraft(prisma, postOnly, d.id, balanced('2026-01-21'))).rejects.toBeInstanceOf(ForbiddenError);
    const posted = await postJournalEntry(prisma, postOnly, d.id); // passa o gate e confirma
    expect(posted.entryNumber).toMatch(/^LG 2026\//);
  });

  it('#28 sem accounting.unlockPeriods não reabre LOCKED (com a permissão, reabre)', async () => {
    await setAccountingPeriodStatus(prisma, A, ids.feb, 'LOCKED');
    const manageOnly = ctx(CA, ['accounting.managePeriods']);
    await expect(setAccountingPeriodStatus(prisma, manageOnly, ids.feb, 'OPEN')).rejects.toBeInstanceOf(ForbiddenError);
    const unlocker = ctx(CA, ['accounting.unlockPeriods']);
    await setAccountingPeriodStatus(prisma, unlocker, ids.feb, 'OPEN');
    const p = await prisma.accountingPeriod.findFirst({ where: { companyId: CA, id: ids.feb } });
    expect(p?.status).toBe('OPEN');
  });

  it('#29 falha durante o post não consome número definitivo', async () => {
    const key = `AC:${ids.fyA}:${ids.dg}`;
    const before = (await prisma.documentCounter.findFirst({ where: { companyId: CA, key } }))?.value ?? 0;
    const d = await createJournalEntryDraft(prisma, A, balanced('2026-03-20'));
    await setAccountingPeriodStatus(prisma, A, ids.mar, 'CLOSED');
    await expect(postJournalEntry(prisma, A, d.id)).rejects.toBeInstanceOf(ConflictError);
    const afterFail = (await prisma.documentCounter.findFirst({ where: { companyId: CA, key } }))?.value ?? 0;
    expect(afterFail).toBe(before); // contador não avançou na falha
    await setAccountingPeriodStatus(prisma, A, ids.mar, 'OPEN');
    const posted = await postJournalEntry(prisma, A, d.id);
    const afterOk = (await prisma.documentCounter.findFirst({ where: { companyId: CA, key } }))?.value ?? 0;
    expect(afterOk).toBe(before + 1);
    expect(seq(posted.entryNumber)).toBe(before + 1);
  });

  it('#30 lançamento manual não pode declarar origem automática', async () => {
    // Campos de origem passados na API pública são ignorados (entry fica com origem nula).
    const d = await createJournalEntryDraft(prisma, A, { ...balanced('2026-01-22'), sourceType: 'INVOICE', sourceId: 'x', accountingEvent: 'REVENUE' } as never);
    const e = await getJournalEntry(prisma, A, d.id);
    expect(e.sourceType).toBeNull();
    expect(e.sourceId).toBeNull();
    expect(e.accountingEvent).toBeNull();
    // O helper interno rejeita origem parcial (all-or-none).
    const lines = [{ ledgerAccountId: ids.caixa, description: null, debit: 100, credit: 0, customerId: null, supplierId: null, treasuryAccountId: null }, { ledgerAccountId: ids.vendas, description: null, debit: 0, credit: 100, customerId: null, supplierId: null, treasuryAccountId: null }];
    await expect(prisma.$transaction((tx) => createJournalEntryDraftTx(tx, CA, 'u', { journalId: ids.dg, entryDate: D('2026-01-22'), description: 'parcial', lines, origin: { sourceType: 'INVOICE', sourceId: '', accountingEvent: '' } as never }))).rejects.toBeInstanceOf(ValidationError);
    await deleteJournalEntryDraft(prisma, A, d.id);
  });

  it('#31 postingDate = data contabilística e postedAt é timestamp', async () => {
    const p = await newPostedEntry('2026-01-23');
    const e = await getJournalEntry(prisma, A, p.id);
    expect(e.entryDate).toBe('2026-01-23');
    expect(e.postingDate).toBe('2026-01-23');
    expect(e.postedAt).toBeInstanceOf(Date);
    // postedAt tem componente de tempo (timestamp), não é meia-noite forçada da data.
    const raw = await prisma.journalEntry.findFirst({ where: { companyId: CA, id: p.id }, select: { postedAt: true } });
    expect(raw?.postedAt).toBeTruthy();
  });

  it('#32 diário inactivo rejeitado no lançamento e tratado no estorno', async () => {
    // Lançamento num diário inactivo é rejeitado.
    await expect(createJournalEntryDraft(prisma, A, { journalId: ids.dx, entryDate: '2026-01-24', description: 'x', lines: [{ ledgerAccountId: ids.caixa, debit: 10 }, { ledgerAccountId: ids.vendas, credit: 10 }] })).rejects.toBeInstanceOf(ValidationError);
    // Estorno quando o diário original ficou inactivo → usa o diário de ajustamentos activo.
    const p = await newPostedEntry('2026-01-25'); // no diário DG
    await prisma.accountingJournal.update({ where: { id: ids.dg }, data: { isActive: false } });
    const rev = await reverseJournalEntry(prisma, A, p.id, { reversalDate: '2026-01-25' });
    const reversal = await getJournalEntry(prisma, A, rev.reversalId);
    expect(reversal.journalId).toBe(ids.daj); // ADJUSTMENT, não o DG inactivo
    expect(rev.reversalNumber.startsWith('AJ ')).toBe(true);
    await prisma.accountingJournal.update({ where: { id: ids.dg }, data: { isActive: true } });
  });
});
