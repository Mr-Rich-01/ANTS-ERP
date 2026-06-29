/**
 * Helpers INTERNOS de eventos contabilísticos automáticos (Fase 8c).
 *
 * NÃO é exportado pelo barrel (`index.ts`) — só pode ser importado por módulos
 * operacionais do pacote `domain` (facturas, recibos, pagamentos, tesouraria),
 * que já validaram a permissão OPERACIONAL correspondente. Estes helpers NÃO
 * aplicam gates contabilísticos (`accounting.post`/`prepare`) — um caixa pode
 * receber dinheiro sem poder lançar manualmente na Contabilidade.
 *
 * Todas as funções correm DENTRO da transacção do documento (atomicidade total),
 * são idempotentes por (companyId, sourceType, sourceId, accountingEvent) com
 * advisory lock transaccional, e reaplicam todas as regras da Fase 8b.
 */
import type { Prisma } from '@ants/database';
import { round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';
import {
  type AccountingJournalType,
  type EntryOrigin,
  type NormalizedLine,
  dateWithin,
  formatAccountingDate,
  nextEntryNumber,
  recalcTotals,
  resolvePeriodForDate,
  validateLineRelations,
} from './accounting';

export interface AccountingEventLine {
  ledgerAccountId: string;
  debit?: number;
  credit?: number;
  description?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  treasuryAccountId?: string | null;
}

export interface AccountingEventInput {
  /** Diário explícito; se ausente, resolve-se pelo tipo. */
  journalId?: string;
  journalType?: AccountingJournalType;
  /** Data contabilística (UTC, parte da data). */
  entryDate: Date;
  description: string;
  reference?: string | null;
  origin: EntryOrigin;
  lines: AccountingEventLine[];
}

export interface ReverseEventInput {
  origin: EntryOrigin;
  reversalDate: Date;
  reversalJournalId?: string;
  reason?: string;
}

// ─────────────────────────── Resolvers ───────────────────────────

/** Resolve a conta-razão de uma conta de Tesouraria (operações NOVAS: exige tudo activo). */
export async function resolveTreasuryLedgerTx(tx: Prisma.TransactionClient, companyId: string, treasuryAccountId: string): Promise<{ treasuryAccountId: string; ledgerAccountId: string; ledgerCode: string }> {
  const ta = await tx.treasuryAccount.findFirst({ where: { companyId, id: treasuryAccountId } });
  if (!ta) throw new NotFoundError('Conta de tesouraria não encontrada.');
  if (ta.status !== 'ACTIVE') throw new ConflictError(`A conta de tesouraria «${ta.name}» está inactiva.`);
  if (!ta.ledgerAccountId) throw new ValidationError(`A conta de tesouraria «${ta.name}» não tem conta contabilística associada.`);
  const acc = await tx.ledgerAccount.findFirst({ where: { companyId, id: ta.ledgerAccountId } });
  if (!acc) throw new ValidationError('Conta-razão da tesouraria não encontrada.');
  if (!acc.isActive) throw new ValidationError(`A conta-razão «${acc.code}» da tesouraria está inactiva.`);
  if (!acc.isPosting) throw new ValidationError(`A conta-razão «${acc.code}» da tesouraria não é de movimento.`);
  return { treasuryAccountId: ta.id, ledgerAccountId: acc.id, ledgerCode: acc.code };
}

/** Resolve o diário activo de um tipo. Erro se nenhum (config) ou ambíguo (mais de um). */
export async function resolveJournalByTypeTx(tx: Prisma.TransactionClient, companyId: string, journalType: AccountingJournalType): Promise<{ id: string; sequencePrefix: string | null }> {
  const journals = await tx.accountingJournal.findMany({ where: { companyId, journalType, isActive: true } });
  if (journals.length === 0) throw new ValidationError(`Configuração contabilística em falta: não existe diário activo do tipo ${journalType}.`);
  if (journals.length > 1) throw new ConflictError(`Existe mais de um diário activo do tipo ${journalType}; indique o diário explicitamente.`);
  const j = journals[0]!;
  return { id: j.id, sequencePrefix: j.sequencePrefix };
}

// ─────────────────────────── Idempotência ───────────────────────────

function normalizeLineForCompare(l: { ledgerAccountId: string; debit: number; credit: number; customerId: string | null; supplierId: string | null; treasuryAccountId: string | null }): string {
  return [l.ledgerAccountId, l.debit.toFixed(2), l.credit.toFixed(2), l.customerId ?? '', l.supplierId ?? '', l.treasuryAccountId ?? ''].join('|');
}

function linesSignature(lines: Array<{ ledgerAccountId: string; debit: number; credit: number; customerId: string | null; supplierId: string | null; treasuryAccountId: string | null }>): string {
  return lines.map(normalizeLineForCompare).sort().join('#');
}

/** Normaliza e valida uma linha de evento (débito XOR crédito > 0, sem negativos). */
function normalizeEventLine(l: AccountingEventLine, i: number): NormalizedLine {
  const debit = round2(l.debit ?? 0);
  const credit = round2(l.credit ?? 0);
  if (debit < 0 || credit < 0) throw new ValidationError(`Linha ${i + 1}: valores não podem ser negativos.`);
  if (debit > 0 && credit > 0) throw new ValidationError(`Linha ${i + 1}: não pode ter débito e crédito em simultâneo.`);
  if (debit === 0 && credit === 0) throw new ValidationError(`Linha ${i + 1}: débito ou crédito tem de ser maior que zero.`);
  return {
    ledgerAccountId: l.ledgerAccountId,
    description: l.description ?? null,
    debit,
    credit,
    customerId: l.customerId ?? null,
    supplierId: l.supplierId ?? null,
    treasuryAccountId: l.treasuryAccountId ?? null,
  };
}

function assertOrigin(o: EntryOrigin): void {
  if (!o || !o.sourceType || !o.sourceId || !o.accountingEvent) {
    throw new ValidationError('Evento automático requer sourceType, sourceId e accountingEvent.');
  }
}

/** Advisory lock transaccional pela chave canónica do evento (libertado no commit/rollback). */
async function lockEventKey(tx: Prisma.TransactionClient, companyId: string, o: EntryOrigin, scope = ''): Promise<void> {
  const key = `acc-event|${companyId}|${o.sourceType}|${o.sourceId}|${o.accountingEvent}${scope}`;
  // $executeRaw (não $queryRaw): pg_advisory_xact_lock devolve void e o $queryRaw
  // não consegue desserializar essa coluna. O lock liberta no commit/rollback.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

// ─────────────────────────── Posting de evento ───────────────────────────

/**
 * Cria e confirma (POSTED) um lançamento contabilístico para um evento de origem.
 * Idempotente: se já existir para a mesma chave canónica e o conteúdo for equivalente,
 * devolve o existente; se for diferente, lança ConflictError de integridade.
 */
export async function postAccountingEventTx(
  tx: Prisma.TransactionClient,
  ctx: RequestContext,
  input: AccountingEventInput,
): Promise<{ id: string; entryNumber: string; created: boolean }> {
  const companyId = requireCompany(ctx);
  assertOrigin(input.origin);
  const o = input.origin;

  // Serializa por chave canónica (idempotência segura sob concorrência).
  await lockEventKey(tx, companyId, o);

  const lines = input.lines.map((l, i) => normalizeEventLine(l, i));
  if (lines.length < 2) throw new ValidationError('O lançamento precisa de pelo menos duas linhas.');
  const { totalDebit, totalCredit } = recalcTotals(lines);

  // Resolve o diário pretendido (para criar e para comparar na idempotência).
  let journalId: string;
  let sequencePrefix: string | null;
  if (input.journalId) {
    const j = await tx.accountingJournal.findFirst({ where: { companyId, id: input.journalId } });
    if (!j) throw new ValidationError('Diário não encontrado nesta empresa.');
    if (!j.isActive) throw new ValidationError('O diário está inactivo.');
    journalId = j.id;
    sequencePrefix = j.sequencePrefix;
  } else if (input.journalType) {
    const j = await resolveJournalByTypeTx(tx, companyId, input.journalType);
    journalId = j.id;
    sequencePrefix = j.sequencePrefix;
  } else {
    throw new ValidationError('Indique journalId ou journalType para o evento contabilístico.');
  }

  // Já existe um lançamento para esta origem?
  const existing = await tx.journalEntry.findFirst({
    where: { companyId, sourceType: o.sourceType, sourceId: o.sourceId, accountingEvent: o.accountingEvent },
    include: { lines: true },
  });
  if (existing) {
    const sameHeader =
      existing.journalId === journalId &&
      formatAccountingDate(existing.entryDate) === formatAccountingDate(input.entryDate) &&
      existing.description === input.description &&
      (existing.reference ?? '') === (input.reference ?? '') &&
      existing.lines.length === lines.length;
    const sameLines =
      linesSignature(existing.lines.map((l) => ({ ledgerAccountId: l.ledgerAccountId, debit: Number(l.debit), credit: Number(l.credit), customerId: l.customerId, supplierId: l.supplierId, treasuryAccountId: l.treasuryAccountId }))) ===
      linesSignature(lines);
    if (sameHeader && sameLines) {
      return { id: existing.id, entryNumber: existing.entryNumber, created: false };
    }
    throw new ConflictError('Já existe um lançamento para esta origem com conteúdo diferente (conflito de integridade).');
  }

  // Validações 8b: contas de movimento/activas, dimensões da mesma empresa.
  await validateLineRelations(tx, companyId, lines);
  if (totalDebit <= 0) throw new ValidationError('O total do lançamento tem de ser maior que zero.');
  if (totalDebit !== totalCredit) throw new ValidationError(`Lançamento desequilibrado: débito ${totalDebit} ≠ crédito ${totalCredit}.`);

  // Período/exercício abertos para a data contabilística.
  const { fiscalYearId, accountingPeriodId } = await resolvePeriodForDate(tx, companyId, input.entryDate);
  const [year, period] = await Promise.all([
    tx.fiscalYear.findFirst({ where: { companyId, id: fiscalYearId } }),
    tx.accountingPeriod.findFirst({ where: { companyId, id: accountingPeriodId } }),
  ]);
  if (!year || !period) throw new NotFoundError('Exercício/período não encontrado.');
  if (year.status !== 'OPEN') throw new ConflictError(`O exercício está ${year.status}.`);
  if (period.status !== 'OPEN') throw new ConflictError(`O período está ${period.status}.`);
  if (!dateWithin(input.entryDate, period.startDate, period.endDate)) throw new ValidationError('A data do lançamento não pertence ao período.');

  const yearLabel = /^\d{4}$/.test(year.name) ? year.name : String(input.entryDate.getUTCFullYear());
  const entryNumber = await nextEntryNumber(tx, companyId, year.id, journalId, sequencePrefix ?? 'LG', yearLabel);
  const now = new Date();
  const entry = await tx.journalEntry.create({
    data: {
      companyId,
      fiscalYearId: year.id,
      accountingPeriodId: period.id,
      journalId,
      entryNumber,
      entryDate: input.entryDate,
      postingDate: input.entryDate,
      status: 'POSTED',
      description: input.description,
      reference: input.reference ?? null,
      sourceType: o.sourceType,
      sourceId: o.sourceId,
      accountingEvent: o.accountingEvent,
      totalDebit,
      totalCredit,
      postedAt: now,
      postedById: ctx.userId,
      createdById: ctx.userId,
    } as Prisma.JournalEntryUncheckedCreateInput,
  });
  await tx.journalEntryLine.createMany({
    data: lines.map((l, i) => ({
      companyId,
      journalEntryId: entry.id,
      ledgerAccountId: l.ledgerAccountId,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
      lineNumber: i + 1,
      customerId: l.customerId,
      supplierId: l.supplierId,
      treasuryAccountId: l.treasuryAccountId,
    })) as Prisma.JournalEntryLineCreateManyInput[],
  });
  await writeAudit(tx, ctx, {
    action: 'ACCOUNTING_EVENT_POSTED',
    entity: 'JournalEntry',
    entityId: entry.id,
    newValues: { sourceType: o.sourceType, sourceId: o.sourceId, accountingEvent: o.accountingEvent, entryNumber, entryDate: formatAccountingDate(input.entryDate), totalDebit, totalCredit },
  });
  return { id: entry.id, entryNumber, created: true };
}

// ─────────────────────────── Estorno de evento ───────────────────────────

/**
 * Estorna o lançamento de um evento, preservando a VERDADE HISTÓRICA: inverte as
 * linhas do lançamento original (mesmas contas e dimensões), NÃO re-resolve o mapping
 * actual e NÃO falha por desactivações posteriores. Idempotente.
 */
export async function reverseAccountingEventTx(
  tx: Prisma.TransactionClient,
  ctx: RequestContext,
  input: ReverseEventInput,
): Promise<{ reversalId: string; reversalNumber: string; created: boolean }> {
  const companyId = requireCompany(ctx);
  assertOrigin(input.origin);
  const o = input.origin;
  await lockEventKey(tx, companyId, o, '|reverse');

  const original = await tx.journalEntry.findFirst({
    where: { companyId, sourceType: o.sourceType, sourceId: o.sourceId, accountingEvent: o.accountingEvent },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!original) throw new NotFoundError('Lançamento de origem não encontrado para estorno.');

  // Idempotência: se já existe estorno, devolve-o.
  const existingReversal = await tx.journalEntry.findFirst({ where: { companyId, reversalOfId: original.id } });
  if (existingReversal) return { reversalId: existingReversal.id, reversalNumber: existingReversal.entryNumber, created: false };
  if (original.status !== 'POSTED') throw new ConflictError(`Só é possível estornar lançamentos confirmados (estado actual: ${original.status}).`);

  // Diário do estorno: explícito > original (se activo) > ajustamentos activo.
  let journalId = input.reversalJournalId ?? original.journalId;
  let journal = await tx.accountingJournal.findFirst({ where: { companyId, id: journalId } });
  if (!journal) throw new ValidationError('Diário de estorno não encontrado nesta empresa.');
  if (!journal.isActive) {
    if (input.reversalJournalId) throw new ValidationError('O diário de estorno indicado está inactivo.');
    const adj = await tx.accountingJournal.findFirst({ where: { companyId, journalType: 'ADJUSTMENT', isActive: true } });
    if (!adj) throw new ValidationError('O diário original está inactivo; configure um diário de ajustamentos activo.');
    journal = adj;
    journalId = adj.id;
  }

  const { fiscalYearId, accountingPeriodId } = await resolvePeriodForDate(tx, companyId, input.reversalDate);
  const [year, period] = await Promise.all([
    tx.fiscalYear.findFirst({ where: { companyId, id: fiscalYearId } }),
    tx.accountingPeriod.findFirst({ where: { companyId, id: accountingPeriodId } }),
  ]);
  if (!year || !period) throw new NotFoundError('Exercício/período do estorno não encontrado.');
  if (year.status !== 'OPEN') throw new ConflictError(`O exercício do estorno está ${year.status}.`);
  if (period.status !== 'OPEN') throw new ConflictError(`O período do estorno está ${period.status}.`);

  const totalDebit = round2(Number(original.totalCredit));
  const totalCredit = round2(Number(original.totalDebit));
  const yearLabel = /^\d{4}$/.test(year.name) ? year.name : String(input.reversalDate.getUTCFullYear());
  const reversalNumber = await nextEntryNumber(tx, companyId, year.id, journalId, journal.sequencePrefix ?? 'AJ', yearLabel);
  const now = new Date();
  const reversal = await tx.journalEntry.create({
    data: {
      companyId,
      fiscalYearId: year.id,
      accountingPeriodId: period.id,
      journalId,
      entryNumber: reversalNumber,
      entryDate: input.reversalDate,
      postingDate: input.reversalDate,
      status: 'POSTED',
      description: `Estorno de ${original.entryNumber}${input.reason ? ` — ${input.reason}` : ''}`,
      reference: original.entryNumber,
      totalDebit,
      totalCredit,
      postedAt: now,
      postedById: ctx.userId,
      createdById: ctx.userId,
      reversalOfId: original.id,
    } as Prisma.JournalEntryUncheckedCreateInput,
  });
  await tx.journalEntryLine.createMany({
    data: original.lines.map((l, i) => ({
      companyId,
      journalEntryId: reversal.id,
      ledgerAccountId: l.ledgerAccountId,
      description: l.description,
      debit: round2(Number(l.credit)),
      credit: round2(Number(l.debit)),
      lineNumber: i + 1,
      customerId: l.customerId,
      supplierId: l.supplierId,
      treasuryAccountId: l.treasuryAccountId,
    })) as Prisma.JournalEntryLineCreateManyInput[],
  });
  await tx.journalEntry.update({ where: { id: original.id }, data: { status: 'REVERSED' } });
  await writeAudit(tx, ctx, {
    action: 'ACCOUNTING_EVENT_REVERSED',
    entity: 'JournalEntry',
    entityId: original.id,
    oldValues: { status: 'POSTED' },
    newValues: { status: 'REVERSED', reversalId: reversal.id, reversalNumber, sourceType: o.sourceType, sourceId: o.sourceId, accountingEvent: o.accountingEvent },
  });
  return { reversalId: reversal.id, reversalNumber, created: true };
}
