import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import { formatMZN, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission, hasPermission } from './permissions';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

export type LedgerAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';
export type AccountingJournalType = 'GENERAL' | 'SALES' | 'PURCHASES' | 'CASH' | 'BANK' | 'PAYROLL' | 'ADJUSTMENT' | 'OPENING';
export type FiscalStatus = 'OPEN' | 'CLOSED' | 'LOCKED';
export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export function accountingJournalTypeLabel(type: AccountingJournalType | null | undefined): string {
  const labels: Record<AccountingJournalType, string> = {
    GENERAL: 'Geral',
    SALES: 'Vendas',
    PURCHASES: 'Compras',
    CASH: 'Caixa',
    BANK: 'Banco',
    PAYROLL: 'Salarios',
    ADJUSTMENT: 'Ajuste',
    OPENING: 'Abertura',
  };
  return type ? labels[type] : 'Todos';
}

export function ledgerAccountTypeLabel(type: LedgerAccountType): string {
  const labels: Record<LedgerAccountType, string> = {
    ASSET: 'Activo',
    LIABILITY: 'Passivo',
    EQUITY: 'Capital proprio',
    REVENUE: 'Receita',
    EXPENSE: 'Despesa',
  };
  return labels[type];
}

export function normalBalanceLabel(value: NormalBalance): string {
  return value === 'DEBIT' ? 'Devedora' : 'Credora';
}

export function journalEntryStatusLabel(status: JournalEntryStatus): string {
  const labels: Record<JournalEntryStatus, string> = {
    DRAFT: 'Rascunho',
    POSTED: 'Publicado',
    REVERSED: 'Revertido',
  };
  return labels[status];
}

export function accountingSourceTypeLabel(value: string | null | undefined): string {
  if (!value) return 'Manual';
  const labels: Record<string, string> = {
    INVOICE: 'Factura',
    CUSTOMER_PAYMENT: 'Recebimento de cliente',
    PURCHASE_RECEIPT: 'Recepcao de compra',
    SUPPLIER_PAYMENT: 'Pagamento a fornecedor',
    CREDIT_NOTE: 'Nota de credito',
    DEBIT_NOTE: 'Nota de debito',
    PRODUCT: 'Stock inicial de produto',
    STOCK_COUNT: 'Contagem de inventário',
    REVERSAL: 'Estorno',
  };
  return labels[value] ?? value;
}

export function accountingEventLabel(value: string | null | undefined): string {
  if (!value) return '';
  const labels: Record<string, string> = {
    SALE_ISSUED: 'Factura emitida',
    COGS_POSTED: 'Custo das mercadorias vendidas',
    RECEIPT_POSTED: 'Recebimento registado',
    PURCHASE_RECEIVED: 'Recepcao de compra',
    SUPPLIER_PAYMENT_POSTED: 'Pagamento a fornecedor registado',
    CREDIT_NOTE_ISSUED: 'Nota de credito emitida',
    CREDIT_NOTE_COGS_REVERSED: 'Devolução — reposição de existências',
    DEBIT_NOTE_ISSUED: 'Nota de debito emitida',
    STOCK_COUNT_VALIDATED: 'Contagem de inventário validada',
    REVERSAL_POSTED: 'Estorno registado',
  };
  return labels[value] ?? value;
}

export function accountingMoneyLabel(value: number): string {
  return formatMZN(round2(value));
}

export interface LedgerAccountItem {
  id: string;
  code: string;
  name: string;
  accountType: LedgerAccountType;
  normalBalance: NormalBalance;
  parentId: string | null;
  level: number;
  isPosting: boolean;
  isActive: boolean;
  description: string | null;
}

export interface LedgerAccountNode extends LedgerAccountItem {
  children: LedgerAccountNode[];
}

export interface JournalEntryLineItem {
  id: string;
  lineNumber: number;
  ledgerAccountId: string;
  accountCode?: string;
  accountName?: string;
  description: string | null;
  debit: number;
  credit: number;
  customerId: string | null;
  supplierId: string | null;
  treasuryAccountId: string | null;
}

export interface JournalEntryItem {
  id: string;
  entryNumber: string;
  status: JournalEntryStatus;
  journalId: string;
  fiscalYearId: string;
  accountingPeriodId: string;
  entryDate: string;
  postingDate: string | null;
  description: string;
  reference: string | null;
  totalDebit: number;
  totalCredit: number;
  /** Decisão A: o desequilíbrio do draft fica visível na consulta. */
  isBalanced: boolean;
  sourceType: string | null;
  sourceId: string | null;
  accountingEvent: string | null;
  reversalOfId: string | null;
  postedAt: Date | null;
  lines?: JournalEntryLineItem[];
}

/** Origem automática (Fase 8c). Os três campos são nulos OU todos preenchidos. */
export interface EntryOrigin {
  sourceType: string;
  sourceId: string;
  accountingEvent: string;
}

// ─────────────────────────────────────────────────────────────
// Datas contabilísticas (decisão G) — sem fuso local; estritamente YYYY-MM-DD.
// ─────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Converte "YYYY-MM-DD" para uma data UTC à meia-noite, validando o dia real. */
export function parseAccountingDate(value: string): Date {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new ValidationError('A data deve estar no formato AAAA-MM-DD.');
  }
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || formatAccountingDate(d) !== value) {
    throw new ValidationError(`Data inválida: ${value}.`);
  }
  return d;
}

/** Formata uma data como "YYYY-MM-DD" (parte UTC, sem fuso). */
export function formatAccountingDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatDisplayDate(d: Date): string {
  const [year, month, day] = formatAccountingDate(d).split('-');
  return `${day}/${month}/${year}`;
}

export function periodRangeLabel(start: Date, end: Date): string {
  return `${formatDisplayDate(start)} a ${formatDisplayDate(end)}`;
}

/** Compara apenas a parte da data (UTC). value ∈ [start, end]. */
export function dateWithin(value: Date, start: Date, end: Date): boolean {
  const v = formatAccountingDate(value);
  return v >= formatAccountingDate(start) && v <= formatAccountingDate(end);
}

// ─────────────────────────────────────────────────────────────
// Validação de linhas
// ─────────────────────────────────────────────────────────────

const lineSchema = z.object({
  ledgerAccountId: z.string().min(1, 'Seleccione uma conta.'),
  description: z.string().trim().max(240).optional(),
  debit: z.coerce.number().min(0, 'Valor não pode ser negativo.').default(0),
  credit: z.coerce.number().min(0, 'Valor não pode ser negativo.').default(0),
  customerId: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
  treasuryAccountId: z.string().min(1).optional(),
});
export type JournalLineInput = z.input<typeof lineSchema>;

export interface NormalizedLine {
  ledgerAccountId: string;
  description: string | null;
  debit: number;
  credit: number;
  customerId: string | null;
  supplierId: string | null;
  treasuryAccountId: string | null;
}

/** Valida uma linha: débito XOR crédito > 0, sem negativos. */
function normalizeLine(raw: JournalLineInput, index: number): NormalizedLine {
  const parsed = lineSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(`Linha ${index + 1}: ${parsed.error.issues[0]?.message ?? 'inválida'}.`);
  const debit = round2(parsed.data.debit);
  const credit = round2(parsed.data.credit);
  if (debit < 0 || credit < 0) throw new ValidationError(`Linha ${index + 1}: valores não podem ser negativos.`);
  if (debit > 0 && credit > 0) throw new ValidationError(`Linha ${index + 1}: não pode ter débito e crédito em simultâneo.`);
  if (debit === 0 && credit === 0) throw new ValidationError(`Linha ${index + 1}: débito ou crédito tem de ser maior que zero.`);
  return {
    ledgerAccountId: parsed.data.ledgerAccountId,
    description: parsed.data.description ?? null,
    debit,
    credit,
    customerId: parsed.data.customerId ?? null,
    supplierId: parsed.data.supplierId ?? null,
    treasuryAccountId: parsed.data.treasuryAccountId ?? null,
  };
}

export function recalcTotals(lines: Array<{ debit: number; credit: number }>): { totalDebit: number; totalCredit: number } {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    totalDebit += l.debit;
    totalCredit += l.credit;
  }
  return { totalDebit: round2(totalDebit), totalCredit: round2(totalCredit) };
}

/** Valida que todas as relações das linhas pertencem à empresa e que as contas são de movimento e activas. */
export async function validateLineRelations(tx: Prisma.TransactionClient, companyId: string, lines: NormalizedLine[]): Promise<void> {
  const accountIds = [...new Set(lines.map((l) => l.ledgerAccountId))];
  const accounts = await tx.ledgerAccount.findMany({ where: { companyId, id: { in: accountIds } } });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const acc = byId.get(l.ledgerAccountId);
    if (!acc) throw new ValidationError(`Linha ${i + 1}: conta não encontrada nesta empresa.`);
    if (!acc.isPosting) throw new ValidationError(`Linha ${i + 1}: a conta ${acc.code} é agrupadora e não recebe lançamentos.`);
    if (!acc.isActive) throw new ValidationError(`Linha ${i + 1}: a conta ${acc.code} está inactiva.`);
  }
  // Dimensões analíticas opcionais — confirmar que pertencem à mesma empresa.
  const customerIds = [...new Set(lines.map((l) => l.customerId).filter((x): x is string => !!x))];
  const supplierIds = [...new Set(lines.map((l) => l.supplierId).filter((x): x is string => !!x))];
  const treasuryIds = [...new Set(lines.map((l) => l.treasuryAccountId).filter((x): x is string => !!x))];
  if (customerIds.length) {
    const n = await tx.customer.count({ where: { companyId, id: { in: customerIds } } });
    if (n !== customerIds.length) throw new ValidationError('Cliente de outra empresa ou inexistente numa das linhas.');
  }
  if (supplierIds.length) {
    const n = await tx.supplier.count({ where: { companyId, id: { in: supplierIds } } });
    if (n !== supplierIds.length) throw new ValidationError('Fornecedor de outra empresa ou inexistente numa das linhas.');
  }
  if (treasuryIds.length) {
    const n = await tx.treasuryAccount.count({ where: { companyId, id: { in: treasuryIds } } });
    if (n !== treasuryIds.length) throw new ValidationError('Conta de tesouraria de outra empresa ou inexistente numa das linhas.');
  }
}

/** Resolve o período (e o exercício) que contém a data contabilística. Prefere períodos normais. */
export async function resolvePeriodForDate(
  tx: Prisma.TransactionClient,
  companyId: string,
  date: Date,
): Promise<{ fiscalYearId: string; accountingPeriodId: string }> {
  const accountingDate = parseAccountingDate(formatAccountingDate(date));
  const period = await tx.accountingPeriod.findFirst({
    where: { companyId, startDate: { lte: accountingDate }, endDate: { gte: accountingDate } },
    orderBy: { isAdjustment: 'asc' },
  });
  if (!period) {
    throw new ValidationError(`Não existe período contabilístico para a data ${formatDisplayDate(accountingDate)}.`);
  }
  return { fiscalYearId: period.fiscalYearId, accountingPeriodId: period.id };
}

// ─────────────────────────────────────────────────────────────
// Numeração (decisão D) — definitiva só no post, via DocumentCounter atómico.
// ─────────────────────────────────────────────────────────────

export async function nextEntryNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  fiscalYearId: string,
  journalId: string,
  sequencePrefix: string,
  yearLabel: string,
): Promise<string> {
  const key = `AC:${fiscalYearId}:${journalId}`;
  const counter = await tx.documentCounter.upsert({
    where: { companyId_key: { companyId, key } },
    update: { value: { increment: 1 } },
    create: { companyId, key, value: 1 },
  });
  return `${sequencePrefix} ${yearLabel}/${String(counter.value).padStart(4, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// Mapeamento de DTOs
// ─────────────────────────────────────────────────────────────

function mapAccount(a: {
  id: string; code: string; name: string; accountType: string; normalBalance: string;
  parentId: string | null; level: number; isPosting: boolean; isActive: boolean; description: string | null;
}): LedgerAccountItem {
  return {
    id: a.id, code: a.code, name: a.name,
    accountType: a.accountType as LedgerAccountType,
    normalBalance: a.normalBalance as NormalBalance,
    parentId: a.parentId, level: a.level, isPosting: a.isPosting, isActive: a.isActive, description: a.description,
  };
}

function mapEntry(e: {
  id: string; entryNumber: string; status: string; journalId: string; fiscalYearId: string; accountingPeriodId: string;
  entryDate: Date; postingDate: Date | null; description: string; reference: string | null;
  totalDebit: unknown; totalCredit: unknown; sourceType: string | null; sourceId: string | null;
  accountingEvent: string | null; reversalOfId: string | null; postedAt: Date | null;
  lines?: Array<{ id: string; lineNumber: number; ledgerAccountId: string; description: string | null; debit: unknown; credit: unknown; customerId: string | null; supplierId: string | null; treasuryAccountId: string | null; ledgerAccount?: { code: string; name: string } }>;
}): JournalEntryItem {
  const totalDebit = round2(Number(e.totalDebit));
  const totalCredit = round2(Number(e.totalCredit));
  return {
    id: e.id, entryNumber: e.entryNumber, status: e.status as JournalEntryStatus,
    journalId: e.journalId, fiscalYearId: e.fiscalYearId, accountingPeriodId: e.accountingPeriodId,
    entryDate: formatAccountingDate(e.entryDate), postingDate: e.postingDate ? formatAccountingDate(e.postingDate) : null,
    description: e.description, reference: e.reference,
    totalDebit, totalCredit, isBalanced: totalDebit === totalCredit && totalDebit > 0,
    sourceType: e.sourceType, sourceId: e.sourceId, accountingEvent: e.accountingEvent,
    reversalOfId: e.reversalOfId, postedAt: e.postedAt,
    lines: e.lines?.map((l) => ({
      id: l.id, lineNumber: l.lineNumber, ledgerAccountId: l.ledgerAccountId,
      accountCode: l.ledgerAccount?.code, accountName: l.ledgerAccount?.name,
      description: l.description, debit: round2(Number(l.debit)), credit: round2(Number(l.credit)),
      customerId: l.customerId, supplierId: l.supplierId, treasuryAccountId: l.treasuryAccountId,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// Plano de contas
// ─────────────────────────────────────────────────────────────

export async function listLedgerAccounts(db: PrismaClient, ctx: RequestContext, includeInactive = true): Promise<LedgerAccountItem[]> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const rows = await db.ledgerAccount.findMany({
    where: includeInactive ? { companyId } : { companyId, isActive: true },
    orderBy: { code: 'asc' },
  });
  return rows.map(mapAccount);
}

export async function getLedgerAccountTree(db: PrismaClient, ctx: RequestContext): Promise<LedgerAccountNode[]> {
  const flat = await listLedgerAccounts(db, ctx, true);
  const nodes = new Map<string, LedgerAccountNode>();
  for (const a of flat) nodes.set(a.id, { ...a, children: [] });
  const roots: LedgerAccountNode[] = [];
  for (const a of flat) {
    const node = nodes.get(a.id)!;
    if (a.parentId && nodes.has(a.parentId)) nodes.get(a.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

const createAccountSchema = z.object({
  code: z.string().trim().min(1, 'O código é obrigatório.').max(20),
  name: z.string().trim().min(1, 'O nome é obrigatório.').max(120),
  accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  normalBalance: z.enum(['DEBIT', 'CREDIT']),
  parentId: z.string().min(1).optional(),
  isPosting: z.coerce.boolean().default(true),
  description: z.string().trim().max(240).optional(),
});
export type CreateLedgerAccountInput = z.input<typeof createAccountSchema>;

export async function createLedgerAccount(db: PrismaClient, ctx: RequestContext, input: CreateLedgerAccountInput): Promise<{ id: string }> {
  requirePermission(ctx, 'accounting.manageAccounts');
  const companyId = requireCompany(ctx);
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;

  return db.$transaction(async (tx) => {
    const dup = await tx.ledgerAccount.findFirst({ where: { companyId, code: data.code } });
    if (dup) throw new ConflictError(`Já existe uma conta com o código ${data.code}.`);

    let level = 1;
    if (data.parentId) {
      const parent = await tx.ledgerAccount.findFirst({ where: { companyId, id: data.parentId } });
      if (!parent) throw new ValidationError('Conta-pai não encontrada nesta empresa.');
      if (parent.isPosting) throw new ValidationError('Uma conta de movimento não pode ter filhos.');
      level = parent.level + 1;
    }
    const created = await tx.ledgerAccount.create({
      data: {
        companyId, code: data.code, name: data.name, accountType: data.accountType, normalBalance: data.normalBalance,
        parentId: data.parentId ?? null, level, isPosting: data.isPosting, isActive: true, description: data.description ?? null,
      } as Prisma.LedgerAccountUncheckedCreateInput,
    });
    await writeAudit(tx, ctx, { action: 'accounting.account_create', entity: 'LedgerAccount', entityId: created.id, newValues: { code: data.code, name: data.name, accountType: data.accountType, isPosting: data.isPosting } });
    return { id: created.id };
  });
}

const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).optional(),
  normalBalance: z.enum(['DEBIT', 'CREDIT']).optional(),
  parentId: z.string().min(1).nullable().optional(),
  description: z.string().trim().max(240).nullable().optional(),
  // NOTA: `code`, `provisioningKey`, `isPosting` e `isActive` não são editáveis aqui (decisão F).
});
export type UpdateLedgerAccountInput = z.input<typeof updateAccountSchema>;

export async function updateLedgerAccount(db: PrismaClient, ctx: RequestContext, id: string, input: UpdateLedgerAccountInput): Promise<void> {
  requirePermission(ctx, 'accounting.manageAccounts');
  const companyId = requireCompany(ctx);
  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;

  await db.$transaction(async (tx) => {
    const account = await tx.ledgerAccount.findFirst({ where: { companyId, id } });
    if (!account) throw new NotFoundError('Conta não encontrada.');

    let level = account.level;
    if (data.parentId !== undefined) {
      if (data.parentId === null) {
        level = 1;
      } else {
        if (data.parentId === id) throw new ValidationError('Uma conta não pode ser sua própria pai.');
        const parent = await tx.ledgerAccount.findFirst({ where: { companyId, id: data.parentId } });
        if (!parent) throw new ValidationError('Conta-pai não encontrada nesta empresa.');
        if (parent.isPosting) throw new ValidationError('Uma conta de movimento não pode ter filhos.');
        // Impedir ciclos: subir a hierarquia a partir do novo pai não pode encontrar esta conta.
        let cursor: string | null = parent.id;
        let guard = 0;
        while (cursor && guard++ < 1000) {
          if (cursor === id) throw new ValidationError('Hierarquia circular não é permitida.');
          const up: { parentId: string | null } | null = await tx.ledgerAccount.findFirst({ where: { companyId, id: cursor }, select: { parentId: true } });
          cursor = up?.parentId ?? null;
        }
        level = parent.level + 1;
      }
    }
    await tx.ledgerAccount.update({
      where: { id: account.id },
      data: {
        name: data.name ?? undefined,
        accountType: data.accountType ?? undefined,
        normalBalance: data.normalBalance ?? undefined,
        parentId: data.parentId === undefined ? undefined : data.parentId,
        level,
        description: data.description === undefined ? undefined : data.description,
      },
    });
    await writeAudit(tx, ctx, { action: 'accounting.account_update', entity: 'LedgerAccount', entityId: account.id, oldValues: { name: account.name, parentId: account.parentId }, newValues: { name: data.name, parentId: data.parentId } });
  });
}

export async function setLedgerAccountStatus(db: PrismaClient, ctx: RequestContext, id: string, isActive: boolean): Promise<void> {
  requirePermission(ctx, 'accounting.manageAccounts');
  const companyId = requireCompany(ctx);
  const account = await db.ledgerAccount.findFirst({ where: { companyId, id } });
  if (!account) throw new NotFoundError('Conta não encontrada.');
  if (account.isActive === isActive) return;
  await db.ledgerAccount.update({ where: { id: account.id }, data: { isActive } });
  await writeAudit(db, ctx, { action: 'accounting.account_status', entity: 'LedgerAccount', entityId: account.id, oldValues: { isActive: account.isActive }, newValues: { isActive } });
}

// ─────────────────────────────────────────────────────────────
// Exercícios fiscais
// ─────────────────────────────────────────────────────────────

export async function listFiscalYears(db: PrismaClient, ctx: RequestContext): Promise<Array<{ id: string; name: string; startDate: string; endDate: string; status: FiscalStatus; isCurrent: boolean }>> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const rows = await db.fiscalYear.findMany({ where: { companyId }, orderBy: { startDate: 'desc' } });
  return rows.map((y) => ({ id: y.id, name: y.name, startDate: formatAccountingDate(y.startDate), endDate: formatAccountingDate(y.endDate), status: y.status as FiscalStatus, isCurrent: y.isCurrent }));
}

const createFiscalYearSchema = z.object({
  name: z.string().trim().min(1).max(40),
  startDate: z.string(),
  endDate: z.string(),
});
export type CreateFiscalYearInput = z.input<typeof createFiscalYearSchema>;

export async function createFiscalYear(db: PrismaClient, ctx: RequestContext, input: CreateFiscalYearInput): Promise<{ id: string }> {
  requirePermission(ctx, 'accounting.managePeriods');
  const companyId = requireCompany(ctx);
  const parsed = createFiscalYearSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const start = parseAccountingDate(parsed.data.startDate);
  const end = parseAccountingDate(parsed.data.endDate);
  if (start.getTime() > end.getTime()) throw new ValidationError('A data de início deve ser anterior ou igual à de fim.');

  return db.$transaction(async (tx) => {
    const dup = await tx.fiscalYear.findFirst({ where: { companyId, name: parsed.data.name } });
    if (dup) throw new ConflictError(`Já existe um exercício com o nome ${parsed.data.name}.`);
    // Pré-verificação de sobreposição (a exclusion constraint é a barreira final).
    const overlap = await tx.fiscalYear.findFirst({ where: { companyId, startDate: { lte: end }, endDate: { gte: start } } });
    if (overlap) throw new ConflictError('O exercício sobrepõe-se a outro já existente.');
    const created = await tx.fiscalYear.create({
      data: { companyId, name: parsed.data.name, startDate: start, endDate: end, status: 'OPEN', isCurrent: false, createdById: ctx.userId } as Prisma.FiscalYearUncheckedCreateInput,
    });
    await writeAudit(tx, ctx, { action: 'accounting.fiscalyear_create', entity: 'FiscalYear', entityId: created.id, newValues: { name: parsed.data.name, startDate: parsed.data.startDate, endDate: parsed.data.endDate } });
    return { id: created.id };
  });
}

/** Define o exercício corrente (operação explícita, transaccional e auditada). */
export async function setCurrentFiscalYear(db: PrismaClient, ctx: RequestContext, id: string): Promise<void> {
  requirePermission(ctx, 'accounting.managePeriods');
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const year = await tx.fiscalYear.findFirst({ where: { companyId, id } });
    if (!year) throw new NotFoundError('Exercício não encontrado.');
    if (year.isCurrent) return;
    await tx.fiscalYear.updateMany({ where: { companyId, isCurrent: true }, data: { isCurrent: false } });
    await tx.fiscalYear.update({ where: { id: year.id }, data: { isCurrent: true } });
    await writeAudit(tx, ctx, { action: 'accounting.fiscalyear_set_current', entity: 'FiscalYear', entityId: year.id, newValues: { isCurrent: true } });
  });
}

/** Transição de estado de exercício. LOCKED→OPEN exige accounting.unlockPeriods (ou isPlatformAdmin). */
export async function setFiscalYearStatus(db: PrismaClient, ctx: RequestContext, id: string, target: FiscalStatus): Promise<void> {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const year = await tx.fiscalYear.findFirst({ where: { companyId, id } });
    if (!year) throw new NotFoundError('Exercício não encontrado.');
    assertStateTransitionPermission(ctx, year.status as FiscalStatus, target);
    if (year.status === target) return;
    await tx.fiscalYear.update({ where: { id: year.id }, data: { status: target } });
    await writeAudit(tx, ctx, { action: 'accounting.fiscalyear_status', entity: 'FiscalYear', entityId: year.id, oldValues: { status: year.status }, newValues: { status: target } });
  });
}

/** Gate de permissão por transição de estado (exercícios e períodos). */
function assertStateTransitionPermission(ctx: RequestContext, from: FiscalStatus, to: FiscalStatus): void {
  // Reabrir a partir de LOCKED é a operação sensível.
  if (from === 'LOCKED' && to === 'OPEN') {
    if (ctx.isPlatformAdmin || hasPermission(ctx, 'accounting.unlockPeriods')) return;
    throw new ForbiddenError('Reabrir um período/exercício bloqueado exige accounting.unlockPeriods.');
  }
  requirePermission(ctx, 'accounting.managePeriods');
}

// ─────────────────────────────────────────────────────────────
// Períodos contabilísticos
// ─────────────────────────────────────────────────────────────

export async function listAccountingPeriods(db: PrismaClient, ctx: RequestContext, fiscalYearId?: string): Promise<Array<{ id: string; fiscalYearId: string; periodNumber: number; code: string; name: string; startDate: string; endDate: string; status: FiscalStatus; isAdjustment: boolean }>> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const rows = await db.accountingPeriod.findMany({ where: fiscalYearId ? { companyId, fiscalYearId } : { companyId }, orderBy: [{ fiscalYearId: 'asc' }, { periodNumber: 'asc' }] });
  return rows.map((p) => ({ id: p.id, fiscalYearId: p.fiscalYearId, periodNumber: p.periodNumber, code: p.code, name: p.name, startDate: formatAccountingDate(p.startDate), endDate: formatAccountingDate(p.endDate), status: p.status as FiscalStatus, isAdjustment: p.isAdjustment }));
}

const createPeriodSchema = z.object({
  fiscalYearId: z.string().min(1),
  periodNumber: z.coerce.number().int().positive(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(60),
  startDate: z.string(),
  endDate: z.string(),
  isAdjustment: z.coerce.boolean().default(false),
});
export type CreateAccountingPeriodInput = z.input<typeof createPeriodSchema>;

export async function createAccountingPeriod(db: PrismaClient, ctx: RequestContext, input: CreateAccountingPeriodInput): Promise<{ id: string }> {
  requirePermission(ctx, 'accounting.managePeriods');
  const companyId = requireCompany(ctx);
  const parsed = createPeriodSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const start = parseAccountingDate(parsed.data.startDate);
  const end = parseAccountingDate(parsed.data.endDate);
  if (start.getTime() > end.getTime()) throw new ValidationError('A data de início deve ser anterior ou igual à de fim.');

  return db.$transaction(async (tx) => {
    const year = await tx.fiscalYear.findFirst({ where: { companyId, id: parsed.data.fiscalYearId } });
    if (!year) throw new ValidationError('Exercício não encontrado nesta empresa.');
    if (!dateWithin(start, year.startDate, year.endDate) || !dateWithin(end, year.startDate, year.endDate)) {
      throw new ValidationError('As datas do período têm de estar contidas no exercício.');
    }
    const created = await tx.accountingPeriod.create({
      data: { companyId, fiscalYearId: year.id, periodNumber: parsed.data.periodNumber, code: parsed.data.code, name: parsed.data.name, startDate: start, endDate: end, status: 'OPEN', isAdjustment: parsed.data.isAdjustment } as Prisma.AccountingPeriodUncheckedCreateInput,
    });
    await writeAudit(tx, ctx, { action: 'accounting.period_create', entity: 'AccountingPeriod', entityId: created.id, newValues: { code: parsed.data.code, fiscalYearId: year.id } });
    return { id: created.id };
  });
}

export async function setAccountingPeriodStatus(db: PrismaClient, ctx: RequestContext, id: string, target: FiscalStatus): Promise<void> {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const period = await tx.accountingPeriod.findFirst({ where: { companyId, id } });
    if (!period) throw new NotFoundError('Período não encontrado.');
    assertStateTransitionPermission(ctx, period.status as FiscalStatus, target);
    if (period.status === target) return;
    await tx.accountingPeriod.update({ where: { id: period.id }, data: { status: target } });
    await writeAudit(tx, ctx, { action: 'accounting.period_status', entity: 'AccountingPeriod', entityId: period.id, oldValues: { status: period.status }, newValues: { status: target } });
  });
}

// ─────────────────────────────────────────────────────────────
// Mappings (decisão K)
// ─────────────────────────────────────────────────────────────

export async function listAccountingMappings(db: PrismaClient, ctx: RequestContext): Promise<Array<{ systemKey: string; ledgerAccountId: string; accountCode: string; accountName: string }>> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const rows = await db.accountingMapping.findMany({ where: { companyId }, include: { ledgerAccount: { select: { code: true, name: true } } }, orderBy: { systemKey: 'asc' } });
  return rows.map((m) => ({ systemKey: m.systemKey, ledgerAccountId: m.ledgerAccountId, accountCode: m.ledgerAccount.code, accountName: m.ledgerAccount.name }));
}

export async function setAccountingMapping(db: PrismaClient, ctx: RequestContext, systemKey: string, ledgerAccountId: string): Promise<void> {
  requirePermission(ctx, 'accounting.manageSettings');
  const companyId = requireCompany(ctx);
  if (!systemKey?.trim()) throw new ValidationError('systemKey é obrigatório.');
  await db.$transaction(async (tx) => {
    const account = await assertMappableAccountTx(tx, companyId, ledgerAccountId);
    await tx.accountingMapping.upsert({
      where: { companyId_systemKey: { companyId, systemKey } },
      update: { ledgerAccountId: account.id },
      create: { companyId, systemKey, ledgerAccountId: account.id } as Prisma.AccountingMappingUncheckedCreateInput,
    });
    await writeAudit(tx, ctx, { action: 'accounting.mapping_set', entity: 'AccountingMapping', entityId: systemKey, newValues: { systemKey, ledgerAccountId: account.id } });
  });
}

async function assertMappableAccountTx(tx: Prisma.TransactionClient, companyId: string, ledgerAccountId: string) {
  const account = await tx.ledgerAccount.findFirst({ where: { companyId, id: ledgerAccountId } });
  if (!account) throw new ValidationError('Conta não encontrada nesta empresa.');
  if (!account.isActive) throw new ValidationError('A conta mapeada tem de estar activa.');
  if (!account.isPosting) throw new ValidationError('A conta mapeada tem de ser de movimento (não agrupadora).');
  return account;
}

/**
 * Helper interno de resolução de conta por systemKey — SEM gate de utilizador (Fase 8c).
 * `AccountingMapping.systemKey` é a única fonte funcional. Valida empresa/existência/activa/movimento.
 */
export async function getMappedAccountTx(tx: Prisma.TransactionClient, companyId: string, systemKey: string): Promise<{ id: string; code: string }> {
  const mapping = await tx.accountingMapping.findFirst({ where: { companyId, systemKey } });
  if (!mapping) throw new ValidationError(`Não existe mapping contabilístico para "${systemKey}".`);
  const account = await assertMappableAccountTx(tx, companyId, mapping.ledgerAccountId);
  return { id: account.id, code: account.code };
}

// ─────────────────────────────────────────────────────────────
// Mapping individual de Tesouraria ↔ razão (Fase 8c.1)
// ─────────────────────────────────────────────────────────────

export interface TreasuryLedgerMappingItem {
  treasuryAccountId: string;
  treasuryAccountName: string;
  treasuryStatus: 'ACTIVE' | 'INACTIVE';
  ledgerAccountId: string | null;
  ledgerCode: string | null;
  ledgerName: string | null;
}

export async function listTreasuryLedgerMappings(db: PrismaClient, ctx: RequestContext): Promise<TreasuryLedgerMappingItem[]> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const rows = await db.treasuryAccount.findMany({
    where: { companyId },
    include: { ledgerAccount: { select: { id: true, code: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map((t) => ({
    treasuryAccountId: t.id,
    treasuryAccountName: t.name,
    treasuryStatus: t.status,
    ledgerAccountId: t.ledgerAccountId,
    ledgerCode: t.ledgerAccount?.code ?? null,
    ledgerName: t.ledgerAccount?.name ?? null,
  }));
}

/**
 * Configura/troca/remove (null) a conta-razão de uma conta de Tesouraria.
 * Só `accounting.manageSettings` (não `treasury.manageAccounts`). Transaccional e auditado.
 * Não "rouba" uma conta-razão já associada a outra conta de Tesouraria. Só afecta operações
 * futuras — lançamentos históricos mantêm os seus próprios ledgerAccountId.
 */
export async function setTreasuryLedgerAccount(db: PrismaClient, ctx: RequestContext, treasuryAccountId: string, ledgerAccountId: string | null): Promise<void> {
  requirePermission(ctx, 'accounting.manageSettings');
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const ta = await tx.treasuryAccount.findFirst({ where: { companyId, id: treasuryAccountId } });
    if (!ta) throw new NotFoundError('Conta de tesouraria não encontrada.');
    if (ta.ledgerAccountId === ledgerAccountId) return;

    if (ledgerAccountId !== null) {
      const acc = await tx.ledgerAccount.findFirst({ where: { companyId, id: ledgerAccountId } });
      if (!acc) throw new ValidationError('Conta-razão não encontrada nesta empresa.');
      if (acc.accountType !== 'ASSET') throw new ValidationError('A conta-razão de uma conta de tesouraria tem de ser do tipo ASSET.');
      if (!acc.isActive) throw new ValidationError('A conta-razão tem de estar activa.');
      if (!acc.isPosting) throw new ValidationError('A conta-razão tem de ser de movimento (não agrupadora).');
      const taken = await tx.treasuryAccount.findFirst({ where: { companyId, ledgerAccountId, NOT: { id: ta.id } } });
      if (taken) throw new ConflictError(`A conta-razão já está associada à conta de tesouraria "${taken.name}".`);
    }

    await tx.treasuryAccount.update({ where: { id: ta.id }, data: { ledgerAccountId, updatedBy: ctx.userId } });
    await writeAudit(tx, ctx, { action: 'accounting.treasury_mapping_set', entity: 'TreasuryAccount', entityId: ta.id, oldValues: { ledgerAccountId: ta.ledgerAccountId }, newValues: { ledgerAccountId } });
  });
}

// ─────────────────────────────────────────────────────────────
// Lançamentos — criação de draft
// ─────────────────────────────────────────────────────────────

interface DraftTxInput {
  journalId: string;
  entryDate: Date;
  description: string;
  reference?: string | null;
  lines: NormalizedLine[];
  origin: EntryOrigin | null;
}

/**
 * Helper interno transaccional de criação de draft. Suporta origem automática (8c):
 * os três campos de origem são todos nulos OU todos preenchidos. Idempotente para origem.
 */
export async function createJournalEntryDraftTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  userId: string,
  input: DraftTxInput,
): Promise<{ id: string; entryNumber: string; created: boolean }> {
  // Decisão H: origem all-null ou all-set.
  const o = input.origin;
  if (o && (!o.sourceType || !o.sourceId || !o.accountingEvent)) {
    throw new ValidationError('A origem automática exige sourceType, sourceId e accountingEvent.');
  }
  // Idempotência da origem automática.
  if (o) {
    const existing = await tx.journalEntry.findFirst({ where: { companyId, sourceType: o.sourceType, sourceId: o.sourceId, accountingEvent: o.accountingEvent } });
    if (existing) return { id: existing.id, entryNumber: existing.entryNumber, created: false };
  }

  const journal = await tx.accountingJournal.findFirst({ where: { companyId, id: input.journalId } });
  if (!journal) throw new ValidationError('Diário não encontrado nesta empresa.');
  if (!journal.isActive) throw new ValidationError('O diário está inactivo.');

  if (input.lines.length < 2) throw new ValidationError('O lançamento precisa de pelo menos duas linhas.');
  await validateLineRelations(tx, companyId, input.lines);
  const { fiscalYearId, accountingPeriodId } = await resolvePeriodForDate(tx, companyId, input.entryDate);
  const { totalDebit, totalCredit } = recalcTotals(input.lines);

  // Cria com número transitório e fixa o placeholder RASCUNHO-{id} (decisão D).
  const tmp = `__tmp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const entry = await tx.journalEntry.create({
    data: {
      companyId, fiscalYearId, accountingPeriodId, journalId: journal.id,
      entryNumber: tmp, entryDate: input.entryDate, description: input.description, reference: input.reference ?? null,
      status: 'DRAFT', totalDebit, totalCredit, createdById: userId,
      sourceType: o?.sourceType ?? null, sourceId: o?.sourceId ?? null, accountingEvent: o?.accountingEvent ?? null,
    } as Prisma.JournalEntryUncheckedCreateInput,
  });
  const entryNumber = `RASCUNHO-${entry.id}`;
  await tx.journalEntry.update({ where: { id: entry.id }, data: { entryNumber } });
  await tx.journalEntryLine.createMany({
    data: input.lines.map((l, i) => ({
      companyId, journalEntryId: entry.id, ledgerAccountId: l.ledgerAccountId, description: l.description,
      debit: l.debit, credit: l.credit, lineNumber: i + 1,
      customerId: l.customerId, supplierId: l.supplierId, treasuryAccountId: l.treasuryAccountId,
    })) as Prisma.JournalEntryLineCreateManyInput[],
  });
  return { id: entry.id, entryNumber, created: true };
}

const draftSchema = z.object({
  journalId: z.string().min(1, 'Seleccione um diário.'),
  entryDate: z.string(),
  description: z.string().trim().min(1, 'A descrição é obrigatória.').max(240),
  reference: z.string().trim().max(120).optional(),
  lines: z.array(lineSchema).min(2, 'O lançamento precisa de pelo menos duas linhas.'),
});
export type JournalEntryDraftInput = z.input<typeof draftSchema>;

/** API pública de lançamento manual — NÃO aceita campos de origem (decisão H). */
export async function createJournalEntryDraft(db: PrismaClient, ctx: RequestContext, input: JournalEntryDraftInput): Promise<{ id: string; entryNumber: string }> {
  requirePermission(ctx, 'accounting.prepare');
  const companyId = requireCompany(ctx);
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const entryDate = parseAccountingDate(parsed.data.entryDate);
  const lines = parsed.data.lines.map((l, i) => normalizeLine(l, i));

  return db.$transaction(async (tx) => {
    const res = await createJournalEntryDraftTx(tx, companyId, ctx.userId, {
      journalId: parsed.data.journalId, entryDate, description: parsed.data.description, reference: parsed.data.reference ?? null, lines, origin: null,
    });
    await writeAudit(tx, ctx, { action: 'accounting.draft_create', entity: 'JournalEntry', entityId: res.id, newValues: { journalId: parsed.data.journalId, entryDate: parsed.data.entryDate, lines: lines.length } });
    return { id: res.id, entryNumber: res.entryNumber };
  });
}

export async function updateJournalEntryDraft(db: PrismaClient, ctx: RequestContext, id: string, input: JournalEntryDraftInput): Promise<void> {
  requirePermission(ctx, 'accounting.prepare');
  const companyId = requireCompany(ctx);
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const entryDate = parseAccountingDate(parsed.data.entryDate);
  const lines = parsed.data.lines.map((l, i) => normalizeLine(l, i));

  await db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findFirst({ where: { companyId, id } });
    if (!entry) throw new NotFoundError('Lançamento não encontrado.');
    if (entry.status !== 'DRAFT') throw new ConflictError('Só é possível editar lançamentos em rascunho.');

    const journal = await tx.accountingJournal.findFirst({ where: { companyId, id: parsed.data.journalId } });
    if (!journal) throw new ValidationError('Diário não encontrado nesta empresa.');
    if (!journal.isActive) throw new ValidationError('O diário está inactivo.');
    await validateLineRelations(tx, companyId, lines);
    const { fiscalYearId, accountingPeriodId } = await resolvePeriodForDate(tx, companyId, entryDate);
    const { totalDebit, totalCredit } = recalcTotals(lines);

    await tx.journalEntryLine.deleteMany({ where: { companyId, journalEntryId: entry.id } });
    await tx.journalEntryLine.createMany({
      data: lines.map((l, i) => ({ companyId, journalEntryId: entry.id, ledgerAccountId: l.ledgerAccountId, description: l.description, debit: l.debit, credit: l.credit, lineNumber: i + 1, customerId: l.customerId, supplierId: l.supplierId, treasuryAccountId: l.treasuryAccountId })) as Prisma.JournalEntryLineCreateManyInput[],
    });
    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { journalId: journal.id, fiscalYearId, accountingPeriodId, entryDate, description: parsed.data.description, reference: parsed.data.reference ?? null, totalDebit, totalCredit },
    });
    await writeAudit(tx, ctx, { action: 'accounting.draft_update', entity: 'JournalEntry', entityId: entry.id, newValues: { journalId: journal.id, entryDate: parsed.data.entryDate, lines: lines.length } });
  });
}

/** Elimina um draft com snapshot completo na auditoria (decisão J). */
export async function deleteJournalEntryDraft(db: PrismaClient, ctx: RequestContext, id: string): Promise<void> {
  requirePermission(ctx, 'accounting.prepare');
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findFirst({ where: { companyId, id }, include: { lines: true } });
    if (!entry) throw new NotFoundError('Lançamento não encontrado.');
    if (entry.status !== 'DRAFT') throw new ConflictError('Só é possível eliminar lançamentos em rascunho.');

    const snapshot = {
      id: entry.id, entryNumber: entry.entryNumber, journalId: entry.journalId, fiscalYearId: entry.fiscalYearId,
      accountingPeriodId: entry.accountingPeriodId, entryDate: formatAccountingDate(entry.entryDate), description: entry.description, reference: entry.reference,
      totalDebit: Number(entry.totalDebit), totalCredit: Number(entry.totalCredit),
      lines: entry.lines.map((l) => ({ lineNumber: l.lineNumber, ledgerAccountId: l.ledgerAccountId, description: l.description, debit: Number(l.debit), credit: Number(l.credit), customerId: l.customerId, supplierId: l.supplierId, treasuryAccountId: l.treasuryAccountId })),
    };
    await tx.journalEntryLine.deleteMany({ where: { companyId, journalEntryId: entry.id } });
    await tx.journalEntry.delete({ where: { id: entry.id } });
    await writeAudit(tx, ctx, { action: 'accounting.draft_delete', entity: 'JournalEntry', entityId: entry.id, oldValues: snapshot });
  });
}

// ─────────────────────────────────────────────────────────────
// Confirmação (post) — decisão I (concorrência) + partidas dobradas
// ─────────────────────────────────────────────────────────────

export async function postJournalEntry(db: PrismaClient, ctx: RequestContext, id: string): Promise<{ id: string; entryNumber: string }> {
  requirePermission(ctx, 'accounting.post');
  const companyId = requireCompany(ctx);

  return db.$transaction(async (tx) => {
    // Bloqueia a linha do lançamento (serializa confirmações concorrentes).
    await tx.$queryRaw`SELECT id FROM journal_entries WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    const entry = await tx.journalEntry.findFirst({ where: { companyId, id }, include: { lines: true } });
    if (!entry) throw new NotFoundError('Lançamento não encontrado.');
    if (entry.status !== 'DRAFT') throw new ConflictError('O lançamento já não está em rascunho.');

    // Bloqueia/relê exercício e período.
    await tx.$queryRaw`SELECT id FROM fiscal_years WHERE id = ${entry.fiscalYearId} AND "companyId" = ${companyId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM accounting_periods WHERE id = ${entry.accountingPeriodId} AND "companyId" = ${companyId} FOR UPDATE`;
    const [year, period, journal] = await Promise.all([
      tx.fiscalYear.findFirst({ where: { companyId, id: entry.fiscalYearId } }),
      tx.accountingPeriod.findFirst({ where: { companyId, id: entry.accountingPeriodId } }),
      tx.accountingJournal.findFirst({ where: { companyId, id: entry.journalId } }),
    ]);
    if (!year || !period || !journal) throw new NotFoundError('Exercício, período ou diário em falta.');
    if (!journal.isActive) throw new ConflictError('O diário está inactivo.');
    if (year.status !== 'OPEN') throw new ConflictError(`O exercício contabilístico está ${year.status}.`);
    if (period.status !== 'OPEN') throw new ConflictError(`O período contabilístico ${periodRangeLabel(period.startDate, period.endDate)} está ${period.status}.`);
    if (!dateWithin(entry.entryDate, period.startDate, period.endDate)) {
      throw new ValidationError(
        `A data do lançamento ${formatDisplayDate(entry.entryDate)} não pertence ao período contabilístico. Período disponível: ${periodRangeLabel(period.startDate, period.endDate)}.`,
      );
    }

    if (entry.lines.length < 2) throw new ValidationError('O lançamento precisa de pelo menos duas linhas.');
    const { totalDebit, totalCredit } = recalcTotals(entry.lines.map((l) => ({ debit: Number(l.debit), credit: Number(l.credit) })));
    if (totalDebit <= 0) throw new ValidationError('O total do lançamento tem de ser maior que zero.');
    if (totalDebit !== totalCredit) throw new ValidationError(`Lançamento desequilibrado: débito ${totalDebit} ≠ crédito ${totalCredit}.`);

    const yearLabel = /^\d{4}$/.test(year.name) ? year.name : String(entry.entryDate.getUTCFullYear());
    const entryNumber = await nextEntryNumber(tx, companyId, year.id, journal.id, journal.sequencePrefix ?? 'LG', yearLabel);
    const now = new Date();
    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: 'POSTED', entryNumber, postingDate: entry.entryDate, postedAt: now, postedById: ctx.userId, totalDebit, totalCredit },
    });
    await writeAudit(tx, ctx, { action: 'accounting.post', entity: 'JournalEntry', entityId: entry.id, oldValues: { status: 'DRAFT' }, newValues: { status: 'POSTED', entryNumber, totalDebit, totalCredit } });
    return { id: entry.id, entryNumber };
  });
}

// ─────────────────────────────────────────────────────────────
// Estorno — decisão C + I
// ─────────────────────────────────────────────────────────────

const reverseSchema = z.object({
  reversalDate: z.string().optional(),
  reversalJournalId: z.string().min(1).optional(),
  reason: z.string().trim().max(240).optional(),
});
export type ReverseEntryInput = z.input<typeof reverseSchema>;

export async function reverseJournalEntry(db: PrismaClient, ctx: RequestContext, id: string, input: ReverseEntryInput = {}): Promise<{ reversalId: string; reversalNumber: string }> {
  requirePermission(ctx, 'accounting.reverse');
  const companyId = requireCompany(ctx);
  const parsed = reverseSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const reversalDate = parsed.data.reversalDate ? parseAccountingDate(parsed.data.reversalDate) : parseAccountingDate(formatAccountingDate(new Date()));

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM journal_entries WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    const original = await tx.journalEntry.findFirst({ where: { companyId, id }, include: { lines: true } });
    if (!original) throw new NotFoundError('Lançamento não encontrado.');
    if (original.status !== 'POSTED') throw new ConflictError('Só é possível estornar lançamentos confirmados.');
    const already = await tx.journalEntry.findFirst({ where: { companyId, reversalOfId: original.id } });
    if (already) throw new ConflictError('O lançamento já foi estornado.');

    // Diário do estorno (decisão C).
    let journalId = parsed.data.reversalJournalId ?? original.journalId;
    let journal = await tx.accountingJournal.findFirst({ where: { companyId, id: journalId } });
    if (!journal) throw new ValidationError('Diário de estorno não encontrado nesta empresa.');
    if (!journal.isActive) {
      if (parsed.data.reversalJournalId) throw new ValidationError('O diário de estorno indicado está inactivo.');
      const adj = await tx.accountingJournal.findFirst({ where: { companyId, journalType: 'ADJUSTMENT', isActive: true } });
      if (!adj) throw new ValidationError('O diário original está inactivo; indique um diário de ajustamentos activo.');
      journal = adj;
      journalId = adj.id;
    }

    // Exercício/período abertos para a data do estorno.
    const { fiscalYearId, accountingPeriodId } = await resolvePeriodForDate(tx, companyId, reversalDate);
    await tx.$queryRaw`SELECT id FROM accounting_periods WHERE id = ${accountingPeriodId} AND "companyId" = ${companyId} FOR UPDATE`;
    const [year, period] = await Promise.all([
      tx.fiscalYear.findFirst({ where: { companyId, id: fiscalYearId } }),
      tx.accountingPeriod.findFirst({ where: { companyId, id: accountingPeriodId } }),
    ]);
    if (!year || !period) throw new NotFoundError('Exercício/período do estorno em falta.');
    if (year.status !== 'OPEN') throw new ConflictError(`O exercício do estorno está ${year.status}.`);
    if (period.status !== 'OPEN') throw new ConflictError(`O período do estorno está ${period.status}.`);

    const totalDebit = round2(Number(original.totalCredit));
    const totalCredit = round2(Number(original.totalDebit));
    const yearLabel = /^\d{4}$/.test(year.name) ? year.name : String(reversalDate.getUTCFullYear());
    const reversalNumber = await nextEntryNumber(tx, companyId, year.id, journal.id, journal.sequencePrefix ?? 'AJ', yearLabel);
    const now = new Date();

    const reversal = await tx.journalEntry.create({
      data: {
        companyId, fiscalYearId: year.id, accountingPeriodId: period.id, journalId: journal.id,
        entryNumber: reversalNumber, entryDate: reversalDate, postingDate: reversalDate, status: 'POSTED',
        description: `Estorno de ${original.entryNumber}${parsed.data.reason ? ` — ${parsed.data.reason}` : ''}`,
        reference: original.entryNumber, totalDebit, totalCredit, postedAt: now, postedById: ctx.userId, createdById: ctx.userId,
        reversalOfId: original.id,
      } as Prisma.JournalEntryUncheckedCreateInput,
    });
    // Linhas invertidas (mantêm conta e dimensões; débito↔crédito trocados).
    await tx.journalEntryLine.createMany({
      data: original.lines.map((l, i) => ({
        companyId, journalEntryId: reversal.id, ledgerAccountId: l.ledgerAccountId,
        description: l.description, debit: round2(Number(l.credit)), credit: round2(Number(l.debit)), lineNumber: i + 1,
        customerId: l.customerId, supplierId: l.supplierId, treasuryAccountId: l.treasuryAccountId,
      })) as Prisma.JournalEntryLineCreateManyInput[],
    });
    await tx.journalEntry.update({ where: { id: original.id }, data: { status: 'REVERSED' } });
    await writeAudit(tx, ctx, { action: 'accounting.reverse', entity: 'JournalEntry', entityId: original.id, oldValues: { status: 'POSTED' }, newValues: { status: 'REVERSED', reversalId: reversal.id, reversalNumber } });
    return { reversalId: reversal.id, reversalNumber };
  });
}

// ─────────────────────────────────────────────────────────────
// Consultas / relatórios básicos
// ─────────────────────────────────────────────────────────────

export interface ListEntriesFilter {
  status?: JournalEntryStatus;
  journalId?: string;
  accountingPeriodId?: string;
  fiscalYearId?: string;
  ledgerAccountId?: string;
  sourceType?: string;
  sourceId?: string;
  limit?: number;
}

export async function listJournalEntries(db: PrismaClient, ctx: RequestContext, filter: ListEntriesFilter = {}): Promise<JournalEntryItem[]> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const where: Prisma.JournalEntryWhereInput = { companyId };
  if (filter.status) where.status = filter.status;
  if (filter.journalId) where.journalId = filter.journalId;
  if (filter.accountingPeriodId) where.accountingPeriodId = filter.accountingPeriodId;
  if (filter.fiscalYearId) where.fiscalYearId = filter.fiscalYearId;
  if (filter.sourceType) where.sourceType = filter.sourceType;
  if (filter.sourceId) where.sourceId = filter.sourceId;
  if (filter.ledgerAccountId) where.lines = { some: { companyId, ledgerAccountId: filter.ledgerAccountId } };
  const rows = await db.journalEntry.findMany({ where, orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }], take: filter.limit ?? 100 });
  return rows.map((e) => mapEntry(e));
}

export async function getJournalEntry(db: PrismaClient, ctx: RequestContext, id: string): Promise<JournalEntryItem> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const entry = await db.journalEntry.findFirst({
    where: { companyId, id },
    include: { lines: { orderBy: { lineNumber: 'asc' }, include: { ledgerAccount: { select: { code: true, name: true } } } } },
  });
  if (!entry) throw new NotFoundError('Lançamento não encontrado.');
  return mapEntry(entry);
}

export interface LedgerRow {
  entryId: string;
  entryNumber: string;
  date: string;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
}

/** Razão de uma conta (apenas lançamentos POSTED), com saldo corrido. */
export async function getAccountLedger(db: PrismaClient, ctx: RequestContext, ledgerAccountId: string, opts: { fiscalYearId?: string; accountingPeriodId?: string } = {}): Promise<{ accountId: string; rows: LedgerRow[]; totalDebit: number; totalCredit: number; balance: number }> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const account = await db.ledgerAccount.findFirst({ where: { companyId, id: ledgerAccountId } });
  if (!account) throw new NotFoundError('Conta não encontrada.');
  const entryWhere: Prisma.JournalEntryWhereInput = { companyId, status: 'POSTED' };
  if (opts.fiscalYearId) entryWhere.fiscalYearId = opts.fiscalYearId;
  if (opts.accountingPeriodId) entryWhere.accountingPeriodId = opts.accountingPeriodId;
  const lines = await db.journalEntryLine.findMany({
    where: { companyId, ledgerAccountId, journalEntry: entryWhere },
    include: { journalEntry: { select: { entryNumber: true, postingDate: true, entryDate: true, description: true } } },
    orderBy: [{ journalEntry: { postingDate: 'asc' } }, { lineNumber: 'asc' }],
  });
  const debitNormal = account.normalBalance === 'DEBIT';
  let balance = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: LedgerRow[] = lines.map((l) => {
    const debit = round2(Number(l.debit));
    const credit = round2(Number(l.credit));
    totalDebit += debit;
    totalCredit += credit;
    balance += debitNormal ? debit - credit : credit - debit;
    const d = l.journalEntry.postingDate ?? l.journalEntry.entryDate;
    return { entryId: l.journalEntryId, entryNumber: l.journalEntry.entryNumber, date: formatAccountingDate(d), description: l.journalEntry.description, debit, credit, balance: round2(balance) };
  });
  return { accountId: account.id, rows, totalDebit: round2(totalDebit), totalCredit: round2(totalCredit), balance: round2(balance) };
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
}

/** Balancete básico: soma de débitos/créditos por conta (lançamentos POSTED). */
export async function getTrialBalance(db: PrismaClient, ctx: RequestContext, opts: { fiscalYearId?: string; accountingPeriodId?: string } = {}): Promise<{ rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number }> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const entryWhere: Prisma.JournalEntryWhereInput = { companyId, status: 'POSTED' };
  if (opts.fiscalYearId) entryWhere.fiscalYearId = opts.fiscalYearId;
  if (opts.accountingPeriodId) entryWhere.accountingPeriodId = opts.accountingPeriodId;
  const grouped = await db.journalEntryLine.groupBy({
    by: ['ledgerAccountId'],
    where: { companyId, journalEntry: entryWhere },
    _sum: { debit: true, credit: true },
  });
  const accountIds = grouped.map((g) => g.ledgerAccountId);
  const accounts = await db.ledgerAccount.findMany({ where: { companyId, id: { in: accountIds } }, select: { id: true, code: true, name: true } });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: TrialBalanceRow[] = grouped.map((g) => {
    const debit = round2(Number(g._sum.debit ?? 0));
    const credit = round2(Number(g._sum.credit ?? 0));
    totalDebit += debit;
    totalCredit += credit;
    const a = byId.get(g.ledgerAccountId);
    return { accountId: g.ledgerAccountId, code: a?.code ?? '?', name: a?.name ?? '?', debit, credit };
  });
  rows.sort((a, b) => a.code.localeCompare(b.code));
  return { rows, totalDebit: round2(totalDebit), totalCredit: round2(totalCredit) };
}

// ─────────────────────────────────────────────────────────────
// Relatórios V1 de Contabilidade (P1-04)
// ─────────────────────────────────────────────────────────────

export type AccountingReportKind = 'journal' | 'ledger' | 'trial-balance';
export type AccountingReportStatusFilter = JournalEntryStatus | 'POSTED_AND_REVERSED';

export interface AccountingReportFilters {
  from?: string;
  to?: string;
  ledgerAccountId?: string;
  journalId?: string;
  sourceType?: string;
  journalType?: AccountingJournalType;
  status?: AccountingReportStatusFilter;
  q?: string;
  limit?: number;
}

export interface AccountingReportOptions {
  accounts: Array<{ id: string; code: string; name: string; accountType: LedgerAccountType; normalBalance: NormalBalance; parentId: string | null; level: number; isPosting: boolean; isActive: boolean }>;
  journals: Array<{ id: string; code: string; name: string; journalType: AccountingJournalType; isActive: boolean }>;
  sourceTypes: string[];
  currentFiscalYear: { id: string; name: string; startDate: string; endDate: string } | null;
}

export interface AccountingJournalReportLine {
  entryId: string;
  entryNumber: string;
  entryDate: string;
  postingDate: string | null;
  journalCode: string;
  journalName: string;
  journalType: AccountingJournalType;
  status: JournalEntryStatus;
  description: string;
  reference: string | null;
  sourceType: string | null;
  sourceId: string | null;
  accountingEvent: string | null;
  postedById: string | null;
  postedByName: string | null;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  lineDescription: string | null;
  debit: number;
  credit: number;
}

export interface AccountingJournalReport {
  filters: Required<Pick<AccountingReportFilters, 'from' | 'to'>> & Omit<AccountingReportFilters, 'from' | 'to'>;
  lines: AccountingJournalReportLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  inconsistentEntryNumbers: string[];
}

export interface AccountLedgerReportRow {
  entryId: string;
  entryNumber: string;
  date: string;
  description: string;
  reference: string | null;
  sourceType: string | null;
  accountingEvent: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface AccountLedgerReport {
  filters: Required<Pick<AccountingReportFilters, 'from' | 'to'>> & Omit<AccountingReportFilters, 'from' | 'to'>;
  account: { id: string; code: string; name: string; normalBalance: NormalBalance } | null;
  openingBalance: number;
  rows: AccountLedgerReportRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface TrialBalanceReportRow {
  accountId: string;
  code: string;
  name: string;
  accountType: LedgerAccountType;
  normalBalance: NormalBalance;
  openingBalance: number;
  debit: number;
  credit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface TrialBalanceReport {
  filters: Required<Pick<AccountingReportFilters, 'from' | 'to'>> & Omit<AccountingReportFilters, 'from' | 'to'>;
  rows: TrialBalanceReportRow[];
  totalDebit: number;
  totalCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
  isBalanced: boolean;
  isGlobalBalanceCheckAvailable: boolean;
  movementCount: number;
}

const DEFAULT_REPORT_LIMIT = 500;

function startOfCurrentYear(): string {
  return `${new Date().getUTCFullYear()}-01-01`;
}

function endOfCurrentYear(): string {
  return `${new Date().getUTCFullYear()}-12-31`;
}

function normalizeAccountingReportFilters(filters: AccountingReportFilters = {}): Required<Pick<AccountingReportFilters, 'from' | 'to'>> & Omit<AccountingReportFilters, 'from' | 'to'> {
  const from = filters.from?.trim() || startOfCurrentYear();
  const to = filters.to?.trim() || endOfCurrentYear();
  const fromDate = parseAccountingDate(from);
  const toDate = parseAccountingDate(to);
  if (fromDate > toDate) throw new ValidationError('A data inicial não pode ser posterior à data final.');
  return {
    ...filters,
    from,
    to,
    ledgerAccountId: filters.ledgerAccountId?.trim() || undefined,
    journalId: filters.journalId?.trim() || undefined,
    sourceType: filters.sourceType?.trim() || undefined,
    q: filters.q?.trim() || undefined,
    limit: filters.limit ? Math.min(Math.max(Math.trunc(filters.limit), 1), 2000) : DEFAULT_REPORT_LIMIT,
  };
}

function reportDateWhere(filters: Required<Pick<AccountingReportFilters, 'from' | 'to'>>): Prisma.DateTimeFilter {
  return { gte: parseAccountingDate(filters.from), lte: parseAccountingDate(filters.to) };
}

function postedOrReversedWhere(): Prisma.EnumJournalEntryStatusFilter {
  return { in: ['POSTED', 'REVERSED'] };
}

function reportEntryWhere(companyId: string, filters: ReturnType<typeof normalizeAccountingReportFilters>, opts: { postedOnly?: boolean } = {}): Prisma.JournalEntryWhereInput {
  const where: Prisma.JournalEntryWhereInput = { companyId, entryDate: reportDateWhere(filters) };
  if (opts.postedOnly) {
    where.status = postedOrReversedWhere();
  } else if (filters.status && filters.status !== 'POSTED_AND_REVERSED') {
    where.status = filters.status;
  } else if (filters.status === 'POSTED_AND_REVERSED') {
    where.status = postedOrReversedWhere();
  }
  if (filters.journalId) where.journalId = filters.journalId;
  if (filters.sourceType) where.sourceType = filters.sourceType;
  if (filters.journalType) where.journal = { companyId, journalType: filters.journalType };
  if (filters.ledgerAccountId) where.lines = { some: { companyId, ledgerAccountId: filters.ledgerAccountId } };
  if (filters.q) {
    where.OR = [
      { entryNumber: { contains: filters.q, mode: 'insensitive' } },
      { description: { contains: filters.q, mode: 'insensitive' } },
      { reference: { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

async function postedUserNames(db: PrismaClient, companyId: string, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const users = await db.user.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

export async function getAccountingReportOptions(db: PrismaClient, ctx: RequestContext): Promise<AccountingReportOptions> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const [accounts, journals, sources, currentFiscalYear] = await Promise.all([
    db.ledgerAccount.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, accountType: true, normalBalance: true, parentId: true, level: true, isPosting: true, isActive: true },
    }),
    db.accountingJournal.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, journalType: true, isActive: true },
    }),
    db.journalEntry.findMany({
      where: { companyId, sourceType: { not: null } },
      distinct: ['sourceType'],
      orderBy: { sourceType: 'asc' },
      select: { sourceType: true },
    }),
    db.fiscalYear.findFirst({
      where: { companyId, isCurrent: true },
      select: { id: true, name: true, startDate: true, endDate: true },
    }),
  ]);
  return {
    accounts: accounts.map((a) => ({ ...a, accountType: a.accountType as LedgerAccountType, normalBalance: a.normalBalance as NormalBalance })),
    journals: journals.map((j) => ({ ...j, journalType: j.journalType as AccountingJournalType })),
    sourceTypes: sources.map((s) => s.sourceType).filter((s): s is string => !!s),
    currentFiscalYear: currentFiscalYear
      ? { id: currentFiscalYear.id, name: currentFiscalYear.name, startDate: formatAccountingDate(currentFiscalYear.startDate), endDate: formatAccountingDate(currentFiscalYear.endDate) }
      : null,
  };
}

export async function getAccountingJournalReport(db: PrismaClient, ctx: RequestContext, rawFilters: AccountingReportFilters = {}): Promise<AccountingJournalReport> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const filters = normalizeAccountingReportFilters(rawFilters);
  const entries = await db.journalEntry.findMany({
    where: reportEntryWhere(companyId, filters),
    include: {
      journal: { select: { code: true, name: true, journalType: true } },
      lines: { orderBy: { lineNumber: 'asc' }, include: { ledgerAccount: { select: { id: true, code: true, name: true } } } },
    },
    orderBy: [{ entryDate: 'asc' }, { entryNumber: 'asc' }],
    take: filters.limit,
  });
  const userNames = await postedUserNames(db, companyId, entries.map((e) => e.postedById ?? e.createdById ?? '').filter(Boolean));
  let totalDebit = 0;
  let totalCredit = 0;
  const inconsistentEntryNumbers: string[] = [];
  const lines: AccountingJournalReportLine[] = [];
  for (const e of entries) {
    const entryDebit = round2(Number(e.totalDebit));
    const entryCredit = round2(Number(e.totalCredit));
    if (e.status !== 'DRAFT' && entryDebit !== entryCredit) inconsistentEntryNumbers.push(e.entryNumber);
    for (const l of e.lines) {
      const debit = round2(Number(l.debit));
      const credit = round2(Number(l.credit));
      totalDebit += debit;
      totalCredit += credit;
      lines.push({
        entryId: e.id,
        entryNumber: e.entryNumber,
        entryDate: formatAccountingDate(e.entryDate),
        postingDate: e.postingDate ? formatAccountingDate(e.postingDate) : null,
        journalCode: e.journal.code,
        journalName: e.journal.name,
        journalType: e.journal.journalType as AccountingJournalType,
        status: e.status as JournalEntryStatus,
        description: e.description,
        reference: e.reference,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        accountingEvent: e.accountingEvent,
        postedById: e.postedById ?? e.createdById,
        postedByName: userNames.get(e.postedById ?? e.createdById ?? '') ?? null,
        lineNumber: l.lineNumber,
        accountId: l.ledgerAccount.id,
        accountCode: l.ledgerAccount.code,
        accountName: l.ledgerAccount.name,
        lineDescription: l.description,
        debit,
        credit,
      });
    }
  }
  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  return { filters, lines, totalDebit, totalCredit, isBalanced: totalDebit === totalCredit && inconsistentEntryNumbers.length === 0, inconsistentEntryNumbers };
}

export async function getAccountLedgerReport(db: PrismaClient, ctx: RequestContext, ledgerAccountId: string, rawFilters: AccountingReportFilters = {}): Promise<AccountLedgerReport> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const filters = normalizeAccountingReportFilters({ ...rawFilters, ledgerAccountId });
  const account = await db.ledgerAccount.findFirst({ where: { companyId, id: ledgerAccountId }, select: { id: true, code: true, name: true, normalBalance: true } });
  if (!account) throw new NotFoundError('Conta não encontrada.');

  const opening = await db.journalEntryLine.aggregate({
    where: {
      companyId,
      ledgerAccountId,
      journalEntry: { companyId, status: postedOrReversedWhere(), entryDate: { lt: parseAccountingDate(filters.from) } },
    },
    _sum: { debit: true, credit: true },
  });
  const debitNormal = account.normalBalance === 'DEBIT';
  const openingDebit = round2(Number(opening._sum.debit ?? 0));
  const openingCredit = round2(Number(opening._sum.credit ?? 0));
  const openingBalance = round2(debitNormal ? openingDebit - openingCredit : openingCredit - openingDebit);

  const lines = await db.journalEntryLine.findMany({
    where: { companyId, ledgerAccountId, journalEntry: reportEntryWhere(companyId, filters, { postedOnly: true }) },
    include: { journalEntry: { select: { id: true, entryNumber: true, entryDate: true, postingDate: true, description: true, reference: true, sourceType: true, accountingEvent: true } } },
    orderBy: [{ journalEntry: { entryDate: 'asc' } }, { journalEntry: { entryNumber: 'asc' } }, { lineNumber: 'asc' }],
  });
  let balance = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: AccountLedgerReportRow[] = lines.map((l) => {
    const debit = round2(Number(l.debit));
    const credit = round2(Number(l.credit));
    totalDebit += debit;
    totalCredit += credit;
    balance = round2(balance + (debitNormal ? debit - credit : credit - debit));
    const date = l.journalEntry.postingDate ?? l.journalEntry.entryDate;
    return {
      entryId: l.journalEntry.id,
      entryNumber: l.journalEntry.entryNumber,
      date: formatAccountingDate(date),
      description: l.journalEntry.description,
      reference: l.journalEntry.reference,
      sourceType: l.journalEntry.sourceType,
      accountingEvent: l.journalEntry.accountingEvent,
      debit,
      credit,
      balance,
    };
  });
  return {
    filters,
    account: { id: account.id, code: account.code, name: account.name, normalBalance: account.normalBalance as NormalBalance },
    openingBalance,
    rows,
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    closingBalance: round2(balance),
  };
}

export async function getTrialBalanceReport(db: PrismaClient, ctx: RequestContext, rawFilters: AccountingReportFilters = {}): Promise<TrialBalanceReport> {
  requirePermission(ctx, 'accounting.view');
  const companyId = requireCompany(ctx);
  const filters = normalizeAccountingReportFilters(rawFilters);
  const baseLineWhere: Prisma.JournalEntryLineWhereInput = {
    companyId,
    journalEntry: reportEntryWhere(companyId, filters, { postedOnly: true }),
  };
  if (filters.ledgerAccountId) baseLineWhere.ledgerAccountId = filters.ledgerAccountId;

  const [openingGrouped, periodGrouped] = await Promise.all([
    db.journalEntryLine.groupBy({
      by: ['ledgerAccountId'],
      where: {
        companyId,
        ...(filters.ledgerAccountId ? { ledgerAccountId: filters.ledgerAccountId } : {}),
        journalEntry: {
          companyId,
          status: postedOrReversedWhere(),
          entryDate: { lt: parseAccountingDate(filters.from) },
          ...(filters.journalId ? { journalId: filters.journalId } : {}),
          ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
          ...(filters.journalType ? { journal: { companyId, journalType: filters.journalType } } : {}),
        },
      },
      _sum: { debit: true, credit: true },
    }),
    db.journalEntryLine.groupBy({
      by: ['ledgerAccountId'],
      where: baseLineWhere,
      _sum: { debit: true, credit: true },
      _count: { _all: true },
    }),
  ]);
  const accountIds = [...new Set([...openingGrouped.map((g) => g.ledgerAccountId), ...periodGrouped.map((g) => g.ledgerAccountId)])];
  const accounts = await db.ledgerAccount.findMany({
    where: { companyId, id: { in: accountIds } },
    select: { id: true, code: true, name: true, accountType: true, normalBalance: true },
  });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const openingById = new Map(openingGrouped.map((g) => [g.ledgerAccountId, { debit: round2(Number(g._sum.debit ?? 0)), credit: round2(Number(g._sum.credit ?? 0)) }]));
  const periodById = new Map(periodGrouped.map((g) => [g.ledgerAccountId, { debit: round2(Number(g._sum.debit ?? 0)), credit: round2(Number(g._sum.credit ?? 0)), count: g._count._all }]));
  let totalDebit = 0;
  let totalCredit = 0;
  let totalClosingDebit = 0;
  let totalClosingCredit = 0;
  let movementCount = 0;
  const rows: TrialBalanceReportRow[] = accountIds.map((accountId) => {
    const account = byId.get(accountId);
    const opening = openingById.get(accountId) ?? { debit: 0, credit: 0 };
    const period = periodById.get(accountId) ?? { debit: 0, credit: 0, count: 0 };
    const openingSigned = round2(opening.debit - opening.credit);
    const closingSigned = round2(openingSigned + period.debit - period.credit);
    const closingDebit = round2(Math.max(closingSigned, 0));
    const closingCredit = round2(Math.max(-closingSigned, 0));
    totalDebit += period.debit;
    totalCredit += period.credit;
    totalClosingDebit += closingDebit;
    totalClosingCredit += closingCredit;
    movementCount += period.count;
    return {
      accountId,
      code: account?.code ?? '?',
      name: account?.name ?? '?',
      accountType: (account?.accountType ?? 'ASSET') as LedgerAccountType,
      normalBalance: (account?.normalBalance ?? 'DEBIT') as NormalBalance,
      openingBalance: openingSigned,
      debit: period.debit,
      credit: period.credit,
      closingDebit,
      closingCredit,
    };
  });
  rows.sort((a, b) => a.code.localeCompare(b.code));
  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  return {
    filters,
    rows,
    totalDebit,
    totalCredit,
    totalClosingDebit: round2(totalClosingDebit),
    totalClosingCredit: round2(totalClosingCredit),
    isBalanced: totalDebit === totalCredit,
    isGlobalBalanceCheckAvailable: !filters.ledgerAccountId,
    movementCount,
  };
}

function accountingCsvEscape(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function accountingCsvLine(values: Array<string | number | null | undefined>): string {
  return values.map((v) => accountingCsvEscape(v === null || v === undefined ? '' : String(v))).join(';');
}

export async function exportAccountingJournalCsv(db: PrismaClient, ctx: RequestContext, filters: AccountingReportFilters = {}): Promise<{ filename: string; content: string }> {
  requirePermission(ctx, 'reports.export');
  const report = await getAccountingJournalReport(db, ctx, filters);
  const lines = [
    accountingCsvLine(['Extrato Diário']),
    accountingCsvLine(['Período', `${report.filters.from} a ${report.filters.to}`]),
    accountingCsvLine(['Data', 'Número', 'Diário', 'Estado', 'Origem', 'Evento', 'Referência', 'Descrição', 'Conta', 'Nome da conta', 'Descrição da linha', 'Débito', 'Crédito', 'Utilizador']),
    ...report.lines.map((l) => accountingCsvLine([
      l.postingDate ?? l.entryDate,
      l.entryNumber,
      l.journalCode,
      journalEntryStatusLabel(l.status),
      accountingSourceTypeLabel(l.sourceType),
      accountingEventLabel(l.accountingEvent),
      l.reference,
      l.description,
      l.accountCode,
      l.accountName,
      l.lineDescription,
      accountingMoneyLabel(l.debit),
      accountingMoneyLabel(l.credit),
      l.postedByName ?? l.postedById,
    ])),
    accountingCsvLine(['Totais', '', '', '', '', '', '', '', '', '', '', accountingMoneyLabel(report.totalDebit), accountingMoneyLabel(report.totalCredit), report.isBalanced ? 'Balanceado' : 'Desequilibrado']),
  ];
  return { filename: `contabilidade-extrato-diario-${report.filters.from}-${report.filters.to}.csv`, content: lines.join('\n') };
}

export async function exportAccountLedgerCsv(db: PrismaClient, ctx: RequestContext, ledgerAccountId: string, filters: AccountingReportFilters = {}): Promise<{ filename: string; content: string }> {
  requirePermission(ctx, 'reports.export');
  const report = await getAccountLedgerReport(db, ctx, ledgerAccountId, filters);
  const lines = [
    accountingCsvLine(['Razão / extracto por conta']),
    accountingCsvLine(['Conta', report.account ? `${report.account.code} - ${report.account.name}` : '']),
    accountingCsvLine(['Período', `${report.filters.from} a ${report.filters.to}`]),
    accountingCsvLine(['Saldo inicial', accountingMoneyLabel(Math.abs(report.openingBalance))]),
    accountingCsvLine(['Data', 'Número', 'Origem', 'Evento', 'Referência', 'Descrição', 'Débito', 'Crédito', 'Saldo acumulado']),
    ...report.rows.map((r) => accountingCsvLine([r.date, r.entryNumber, accountingSourceTypeLabel(r.sourceType), accountingEventLabel(r.accountingEvent), r.reference, r.description, accountingMoneyLabel(r.debit), accountingMoneyLabel(r.credit), accountingMoneyLabel(Math.abs(r.balance))])),
    accountingCsvLine(['Totais', '', '', '', '', '', accountingMoneyLabel(report.totalDebit), accountingMoneyLabel(report.totalCredit), accountingMoneyLabel(Math.abs(report.closingBalance))]),
  ];
  const code = report.account?.code ?? 'conta';
  return { filename: `contabilidade-razao-${code}-${report.filters.from}-${report.filters.to}.csv`, content: lines.join('\n') };
}

export async function exportTrialBalanceCsv(db: PrismaClient, ctx: RequestContext, filters: AccountingReportFilters = {}): Promise<{ filename: string; content: string }> {
  requirePermission(ctx, 'reports.export');
  const report = await getTrialBalanceReport(db, ctx, filters);
  const lines = [
    accountingCsvLine(['Balancete']),
    accountingCsvLine(['Período', `${report.filters.from} a ${report.filters.to}`]),
    accountingCsvLine(['Conta', 'Nome da conta', 'Tipo', 'Natureza', 'Saldo inicial', 'Débito', 'Crédito', 'Saldo devedor', 'Saldo credor']),
    ...report.rows.map((r) => accountingCsvLine([r.code, r.name, ledgerAccountTypeLabel(r.accountType), normalBalanceLabel(r.normalBalance), accountingMoneyLabel(Math.abs(r.openingBalance)), accountingMoneyLabel(r.debit), accountingMoneyLabel(r.credit), accountingMoneyLabel(r.closingDebit), accountingMoneyLabel(r.closingCredit)])),
    accountingCsvLine(['Totais', '', '', '', '', accountingMoneyLabel(report.totalDebit), accountingMoneyLabel(report.totalCredit), accountingMoneyLabel(report.totalClosingDebit), accountingMoneyLabel(report.totalClosingCredit)]),
    accountingCsvLine([
      'Validacao',
      report.isGlobalBalanceCheckAvailable
        ? report.isBalanced ? 'Debito = credito' : 'Debito diferente de credito'
        : 'Balancete filtrado; remova o filtro de conta para validar o equilibrio global',
    ]),
  ];
  return { filename: `contabilidade-balancete-${report.filters.from}-${report.filters.to}.csv`, content: lines.join('\n') };
}
