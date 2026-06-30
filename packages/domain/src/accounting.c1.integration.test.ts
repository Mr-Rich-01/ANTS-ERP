/**
 * Suite de INTEGRAÇÃO da Fase 8c.1 — fundação das integrações contabilísticas.
 * Correr com: `pnpm test:integration:accounting:c1` (exige DATABASE_URL).
 * Determinística, isolada por empresas de teste (`smoke-c1*`), com teardown.
 * Lê o estado de `demo-company` (seed) para os cenários do seed, mas nunca o muta.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ConflictError, ForbiddenError, ValidationError } from './errors';
import { setTreasuryLedgerAccount, listTreasuryLedgerMappings } from './accounting';
import { postAccountingEventTx, reverseAccountingEventTx, resolveTreasuryLedgerTx, resolveJournalByTypeTx, type AccountingEventLine } from './accounting-events';

const CA = 'smoke-c1';
const CB = 'smoke-c1b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
function ctx(companyId: string, perms: string[] = [], isPlatformAdmin = false): RequestContext {
  return { companyId, userId: 'smoke-user', permissions: new Set(perms), isPlatformAdmin };
}
const settings = ctx(CA, ['accounting.manageSettings', 'accounting.view']);
const op = ctx(CA); // contexto operacional (sem gates contabilísticos) p/ os helpers internos

interface Ids {
  fy: string; jan: string; feb: string; mar: string; dg: string; daj: string;
  grp: string; caixaL: string; bancoL: string; vendasL: string; arL: string; inactiveL: string; expenseL: string;
  t1: string; t2: string; t3: string; cust: string;
  bFy: string; bJan: string; bLedger: string;
}
let ids!: Ids;
let demoJournalEntriesBaseline = 0;

async function teardown(companyId: string) {
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingMapping.deleteMany({ where: { companyId } });
  // desligar tesouraria↔razão antes de apagar contas-razão
  await prisma.treasuryAccount.updateMany({ where: { companyId }, data: { ledgerAccountId: null } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.treasuryAccount.deleteMany({ where: { companyId } });
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
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke C1' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const jan = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026-01', name: 'Jan', startDate: D('2026-01-01'), endDate: D('2026-01-31'), status: 'OPEN' } });
  const feb = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 2, code: '2026-02', name: 'Fev', startDate: D('2026-02-01'), endDate: D('2026-02-28'), status: 'OPEN' } });
  const mar = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 3, code: '2026-03', name: 'Mar', startDate: D('2026-03-01'), endDate: D('2026-03-31'), status: 'OPEN' } });
  const dg = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DG', name: 'Geral', journalType: 'GENERAL', sequencePrefix: 'LG', isActive: true } });
  const daj = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DAJ', name: 'Ajust', journalType: 'ADJUSTMENT', sequencePrefix: 'AJ', isActive: true } });
  const grp = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '1', name: 'Activo', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: false, isActive: true } });
  const caixaL = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '11', name: 'Caixa', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, isPosting: true, isActive: true, parentId: grp.id } });
  const bancoL = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '12', name: 'Banco', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, isPosting: true, isActive: true, parentId: grp.id } });
  const vendasL = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '41', name: 'Vendas', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1, isPosting: true, isActive: true } });
  const arL = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '121', name: 'Clientes c/c', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, isPosting: true, isActive: true, parentId: grp.id } });
  const inactiveL = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '199', name: 'Inactiva', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, isPosting: true, isActive: false, parentId: grp.id } });
  const expenseL = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '51', name: 'Despesa', accountType: 'EXPENSE', normalBalance: 'DEBIT', level: 1, isPosting: true, isActive: true } });
  const t1 = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'T1', type: 'CASH' } });
  const t2 = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'T2', type: 'BANK' } });
  const t3 = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'T3', type: 'BANK', status: 'INACTIVE' } });
  const cust = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente C1' } });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke C1B' } });
  const bFy = await prisma.fiscalYear.create({ data: { companyId: CB, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const bJan = await prisma.accountingPeriod.create({ data: { companyId: CB, fiscalYearId: bFy.id, periodNumber: 1, code: '2026-01', name: 'Jan', startDate: D('2026-01-01'), endDate: D('2026-01-31'), status: 'OPEN' } });
  const bLedger = await prisma.ledgerAccount.create({ data: { companyId: CB, code: '11', name: 'Caixa B', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isPosting: true, isActive: true } });

  ids = { fy: fy.id, jan: jan.id, feb: feb.id, mar: mar.id, dg: dg.id, daj: daj.id, grp: grp.id, caixaL: caixaL.id, bancoL: bancoL.id, vendasL: vendasL.id, arL: arL.id, inactiveL: inactiveL.id, expenseL: expenseL.id, t1: t1.id, t2: t2.id, t3: t3.id, cust: cust.id, bFy: bFy.id, bJan: bJan.id, bLedger: bLedger.id };
}

function eventLines(amount = 100, opts: { treasuryAccountId?: string; debitLedger?: string } = {}): AccountingEventLine[] {
  return [
    { ledgerAccountId: opts.debitLedger ?? ids.caixaL, debit: amount, treasuryAccountId: opts.treasuryAccountId ?? null },
    { ledgerAccountId: ids.vendasL, credit: amount },
  ];
}
function postEvent(origin: { sourceType: string; sourceId: string; accountingEvent: string }, lines: AccountingEventLine[], date = '2026-01-15', description = 'Evento') {
  return prisma.$transaction((tx) => postAccountingEventTx(tx, op, { journalType: 'GENERAL', entryDate: D(date), description, origin, lines }));
}

beforeAll(async () => {
  demoJournalEntriesBaseline = await prisma.journalEntry.count({ where: { companyId: 'demo-company' } });
  await teardown(CA);
  await teardown(CB);
  await provision();
});
afterAll(async () => { await teardown(CA); await teardown(CB); await prisma.$disconnect(); });

describe('Fase 8c.1 — fundação das integrações (integração)', () => {
  it('#1 ligar tesouraria→razão com accounting.manageSettings', async () => {
    await setTreasuryLedgerAccount(prisma, settings, ids.t1, ids.caixaL);
    const list = await listTreasuryLedgerMappings(prisma, settings);
    expect(list.find((m) => m.treasuryAccountId === ids.t1)?.ledgerAccountId).toBe(ids.caixaL);
  });

  it('#2 treasury.manageAccounts sozinho não configura mapping', async () => {
    await expect(setTreasuryLedgerAccount(prisma, ctx(CA, ['treasury.manageAccounts']), ids.t2, ids.bancoL)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('#3 cross-company: conta-razão de outra empresa rejeitada', async () => {
    await expect(setTreasuryLedgerAccount(prisma, settings, ids.t2, ids.bLedger)).rejects.toBeInstanceOf(ValidationError);
  });

  it('#4 conta-razão inactiva rejeitada', async () => {
    await expect(setTreasuryLedgerAccount(prisma, settings, ids.t2, ids.inactiveL)).rejects.toBeInstanceOf(ValidationError);
  });

  it('#5 conta-razão agrupadora rejeitada', async () => {
    await expect(setTreasuryLedgerAccount(prisma, settings, ids.t2, ids.grp)).rejects.toBeInstanceOf(ValidationError);
  });

  it('#6 conta-razão não-ASSET rejeitada', async () => {
    await expect(setTreasuryLedgerAccount(prisma, settings, ids.t2, ids.expenseL)).rejects.toBeInstanceOf(ValidationError);
  });

  it('#7 conta-razão já associada a outra tesouraria → conflito (domínio)', async () => {
    await expect(setTreasuryLedgerAccount(prisma, settings, ids.t2, ids.caixaL)).rejects.toBeInstanceOf(ConflictError);
  });

  it('#8 resolveTreasuryLedgerTx sem mapping → erro claro', async () => {
    await expect(prisma.$transaction((tx) => resolveTreasuryLedgerTx(tx, CA, ids.t2))).rejects.toBeInstanceOf(ValidationError);
  });

  it('#9 postAccountingEventTx cria lançamento POSTED equilibrado', async () => {
    const r = await postEvent({ sourceType: 'TEST', sourceId: 'e9', accountingEvent: 'POST' }, eventLines(100));
    expect(r.created).toBe(true);
    const e = await prisma.journalEntry.findFirst({ where: { companyId: CA, id: r.id }, include: { lines: true } });
    expect(e?.status).toBe('POSTED');
    expect(Number(e?.totalDebit)).toBe(100);
    expect(Number(e?.totalCredit)).toBe(100);
    expect(e?.lines.length).toBe(2);
    expect(r.entryNumber).toMatch(/^LG 2026\/\d{4}$/);
  });

  it('#10 idempotência: mesma origem e conteúdo → um lançamento', async () => {
    const o = { sourceType: 'TEST', sourceId: 'e10', accountingEvent: 'POST' };
    const r1 = await postEvent(o, eventLines(50));
    const r2 = await postEvent(o, eventLines(50));
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
    expect(r2.id).toBe(r1.id);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'TEST', sourceId: 'e10' } })).toBe(1);
  });

  it('#11 mesma chave, totais diferentes → conflito de integridade', async () => {
    const o = { sourceType: 'TEST', sourceId: 'e11', accountingEvent: 'POST' };
    await postEvent(o, eventLines(70));
    await expect(postEvent(o, eventLines(90))).rejects.toBeInstanceOf(ConflictError);
  });

  it('#12 período fechado rejeita o evento', async () => {
    await prisma.accountingPeriod.update({ where: { id: ids.feb }, data: { status: 'CLOSED' } });
    await expect(postEvent({ sourceType: 'TEST', sourceId: 'e12', accountingEvent: 'POST' }, eventLines(10), '2026-02-10')).rejects.toBeInstanceOf(ConflictError);
    await prisma.accountingPeriod.update({ where: { id: ids.feb }, data: { status: 'OPEN' } });
  });

  it('#13 exercício fechado rejeita o evento', async () => {
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'CLOSED' } });
    await expect(postEvent({ sourceType: 'TEST', sourceId: 'e13', accountingEvent: 'POST' }, eventLines(10), '2026-01-16')).rejects.toBeInstanceOf(ConflictError);
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'OPEN' } });
  });

  it('#14 estorno de evento: inverte e marca original; idempotente', async () => {
    const o = { sourceType: 'TEST', sourceId: 'e14', accountingEvent: 'POST' };
    const p = await postEvent(o, eventLines(120), '2026-01-17');
    const rev = await prisma.$transaction((tx) => reverseAccountingEventTx(tx, op, { origin: o, reversalDate: D('2026-01-18') }));
    expect(rev.created).toBe(true);
    const original = await prisma.journalEntry.findFirst({ where: { companyId: CA, id: p.id } });
    const reversal = await prisma.journalEntry.findFirst({ where: { companyId: CA, id: rev.reversalId } });
    expect(original?.status).toBe('REVERSED');
    expect(reversal?.status).toBe('POSTED');
    expect(Number(reversal?.totalDebit)).toBe(120);
    const again = await prisma.$transaction((tx) => reverseAccountingEventTx(tx, op, { origin: o, reversalDate: D('2026-01-18') }));
    expect(again.created).toBe(false);
    expect(again.reversalId).toBe(rev.reversalId);
  });

  it('#15 isolamento: empresa não vê lançamentos de outra', async () => {
    const n = await prisma.journalEntry.count({ where: { companyId: CB } });
    expect(n).toBe(0);
  });

  it('#16 seed liga as 5 contas demo a 5 razões distintas', async () => {
    const accts = await prisma.treasuryAccount.findMany({ where: { companyId: 'demo-company' }, select: { ledgerAccountId: true } });
    expect(accts.length).toBe(5);
    const ledgerIds = accts.map((a) => a.ledgerAccountId);
    expect(ledgerIds.every((x) => x !== null)).toBe(true);
    expect(new Set(ledgerIds).size).toBe(5);
  });

  it('#17 dados 8a/8b da demo continuam intactos', async () => {
    expect(await prisma.ledgerAccount.count({ where: { companyId: 'demo-company' } })).toBe(39); // 37 base + 114 + 115
    expect(await prisma.journalEntry.count({ where: { companyId: 'demo-company' } })).toBe(demoJournalEntriesBaseline);
  });

  it('#18 unicidade 1:1 na BD: segunda ligação à mesma razão é rejeitada', async () => {
    // t1 já está ligada a caixaL (#1). Ligar t2 à mesma razão directamente → unique violation.
    await expect(prisma.treasuryAccount.update({ where: { id: ids.t2 }, data: { ledgerAccountId: ids.caixaL } })).rejects.toBeTruthy();
  });

  it('#19 seed determinístico: cada conta demo liga à razão esperada (por chave, não ordem)', async () => {
    const byName = new Map((await prisma.treasuryAccount.findMany({ where: { companyId: 'demo-company' }, include: { ledgerAccount: { select: { code: true } } } })).map((t) => [t.name, t.ledgerAccount?.code]));
    expect(byName.get('Caixa Principal')).toBe('111');
    expect(byName.get('BCI')).toBe('112');
    expect(byName.get('M-Pesa')).toBe('113');
    expect(byName.get('Millennium BIM')).toBe('114');
    expect(byName.get('e-Mola')).toBe('115');
  });

  it('#20 seed não sobrescreve nomes de contas existentes (112/113)', async () => {
    const c112 = await prisma.ledgerAccount.findFirst({ where: { companyId: 'demo-company', code: '112' } });
    const c113 = await prisma.ledgerAccount.findFirst({ where: { companyId: 'demo-company', code: '113' } });
    expect(c112?.name).toBe('Bancos');
    expect(c113?.name).toBe('Carteiras móveis');
    expect(c112?.isPosting).toBe(true); // 112/113 continuam de movimento, sem filhos
  });

  it('#21 contas novas do seed têm provisioningKey estável', async () => {
    expect((await prisma.ledgerAccount.findFirst({ where: { companyId: 'demo-company', code: '114' } }))?.provisioningKey).toBe('TREASURY_BANK_MILLENNIUM_BIM');
    expect((await prisma.ledgerAccount.findFirst({ where: { companyId: 'demo-company', code: '115' } }))?.provisioningKey).toBe('TREASURY_MOBILE_EMOLA');
  });

  it('#22 troca de mapping afecta apenas operações futuras', async () => {
    const o = { sourceType: 'TEST', sourceId: 'e22', accountingEvent: 'POST' };
    const p = await postEvent(o, eventLines(80, { treasuryAccountId: ids.t1, debitLedger: ids.caixaL }), '2026-01-19');
    const lineBefore = await prisma.journalEntryLine.findFirst({ where: { companyId: CA, journalEntryId: p.id, ledgerAccountId: ids.caixaL } });
    expect(lineBefore).toBeTruthy();
    // remapear t1 para outra razão (bancoL) — primeiro libertar caixaL
    await setTreasuryLedgerAccount(prisma, settings, ids.t1, null);
    await setTreasuryLedgerAccount(prisma, settings, ids.t1, ids.bancoL);
    const lineAfter = await prisma.journalEntryLine.findFirst({ where: { companyId: CA, journalEntryId: p.id } , orderBy: { lineNumber: 'asc' } });
    expect(lineAfter?.ledgerAccountId).toBe(ids.caixaL); // lançamento histórico inalterado
  });

  it('#23 estorno usa contas históricas mesmo após mudança de mapping', async () => {
    const o = { sourceType: 'TEST', sourceId: 'e23', accountingEvent: 'POST' };
    const p = await postEvent(o, eventLines(60, { treasuryAccountId: ids.t1, debitLedger: ids.bancoL }), '2026-01-20');
    // muda o mapping de t1 (de bancoL para outra coisa) — liberta e remapeia para caixaL
    await setTreasuryLedgerAccount(prisma, settings, ids.t1, null);
    await setTreasuryLedgerAccount(prisma, settings, ids.t1, ids.caixaL);
    const rev = await prisma.$transaction((tx) => reverseAccountingEventTx(tx, op, { origin: o, reversalDate: D('2026-01-21') }));
    const revLines = await prisma.journalEntryLine.findMany({ where: { companyId: CA, journalEntryId: rev.reversalId }, orderBy: { lineNumber: 'asc' } });
    // a linha de débito original era bancoL(60); no estorno passa a crédito em bancoL — conta histórica preservada
    expect(revLines.some((l) => l.ledgerAccountId === ids.bancoL && Number(l.credit) === 60)).toBe(true);
    expect(p.created).toBe(true);
  });

  it('#24 conta de tesouraria inactiva rejeita resolução para novo evento', async () => {
    await expect(prisma.$transaction((tx) => resolveTreasuryLedgerTx(tx, CA, ids.t3))).rejects.toBeInstanceOf(ConflictError);
  });

  it('#25 múltiplos diários activos do mesmo tipo → erro de ambiguidade', async () => {
    const extra = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DG2', name: 'Geral 2', journalType: 'GENERAL', sequencePrefix: 'LG2', isActive: true } });
    await expect(prisma.$transaction((tx) => resolveJournalByTypeTx(tx, CA, 'GENERAL'))).rejects.toBeInstanceOf(ConflictError);
    await prisma.accountingJournal.delete({ where: { id: extra.id } });
  });

  it('#26 mesma chave e totais, mas linhas diferentes → conflito', async () => {
    const o = { sourceType: 'TEST', sourceId: 'e26', accountingEvent: 'POST' };
    await postEvent(o, [{ ledgerAccountId: ids.caixaL, debit: 100 }, { ledgerAccountId: ids.vendasL, credit: 100 }]);
    // mesmo total (100) mas conta de débito diferente (bancoL)
    await expect(postEvent(o, [{ ledgerAccountId: ids.bancoL, debit: 100 }, { ledgerAccountId: ids.vendasL, credit: 100 }])).rejects.toBeInstanceOf(ConflictError);
  });

  it('#27 concorrência real da mesma chave cria apenas um lançamento', async () => {
    const o = { sourceType: 'TEST', sourceId: 'e27', accountingEvent: 'POST' };
    const [r1, r2] = await Promise.all([postEvent(o, eventLines(40)), postEvent(o, eventLines(40))]);
    expect([r1.created, r2.created].filter(Boolean).length).toBe(1);
    expect(r1.id).toBe(r2.id);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'TEST', sourceId: 'e27' } })).toBe(1);
  });

  it('#28 falha no evento não consome numeração definitiva', async () => {
    const key = `AC:${ids.fy}:${ids.dg}`;
    const before = (await prisma.documentCounter.findFirst({ where: { companyId: CA, key } }))?.value ?? 0;
    await prisma.accountingPeriod.update({ where: { id: ids.mar }, data: { status: 'CLOSED' } });
    await expect(postEvent({ sourceType: 'TEST', sourceId: 'e28', accountingEvent: 'POST' }, eventLines(10), '2026-03-10')).rejects.toBeInstanceOf(ConflictError);
    const afterFail = (await prisma.documentCounter.findFirst({ where: { companyId: CA, key } }))?.value ?? 0;
    expect(afterFail).toBe(before);
    await prisma.accountingPeriod.update({ where: { id: ids.mar }, data: { status: 'OPEN' } });
    const ok = await postEvent({ sourceType: 'TEST', sourceId: 'e28', accountingEvent: 'POST' }, eventLines(10), '2026-03-11');
    const afterOk = (await prisma.documentCounter.findFirst({ where: { companyId: CA, key } }))?.value ?? 0;
    expect(afterOk).toBe(before + 1);
    expect(ok.created).toBe(true);
  });

  it('#29 remoção de mapping é auditada', async () => {
    await setTreasuryLedgerAccount(prisma, settings, ids.t2, ids.arL);
    await setTreasuryLedgerAccount(prisma, settings, ids.t2, null);
    const audits = await prisma.auditLog.count({ where: { companyId: CA, action: 'accounting.treasury_mapping_set', entityId: ids.t2 } });
    expect(audits).toBeGreaterThanOrEqual(2); // atribuição + remoção
  });

  it('#30 cross-company: linha com conta-razão de outra empresa rejeitada', async () => {
    await expect(postEvent({ sourceType: 'TEST', sourceId: 'e30', accountingEvent: 'POST' }, [{ ledgerAccountId: ids.bLedger, debit: 100 }, { ledgerAccountId: ids.vendasL, credit: 100 }])).rejects.toBeInstanceOf(ValidationError);
  });
});
