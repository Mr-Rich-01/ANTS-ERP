import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import { round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';

export type TreasuryAccountType = 'CASH' | 'BANK' | 'MOBILE' | 'OTHER';
export type TreasuryFlow = 'IN' | 'OUT';

export interface AccountItem {
  id: string;
  name: string;
  type: TreasuryAccountType;
  reference: string | null;
  balance: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface TreasuryMovementItem {
  id: string;
  occurredAt: Date;
  accountId: string;
  accountName: string;
  flow: TreasuryFlow;
  amount: number;
  balanceAfter: number;
  category: string;
  description: string | null;
  document: string | null;
}

export interface TreasuryKpis {
  cashTotal: number;
  bankTotal: number;
  todayIn: number;
  todayOut: number;
}

export interface DailyReport {
  accountId: string;
  accountName: string;
  date: string;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  operator: string;
  movements: TreasuryMovementItem[];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ─────────────────────────── Leituras ───────────────────────────

export async function listAccounts(db: PrismaClient, ctx: RequestContext): Promise<AccountItem[]> {
  requirePermission(ctx, 'treasury.view');
  requireCompany(ctx);
  const rows = await db.treasuryAccount.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type as TreasuryAccountType,
    reference: a.reference,
    balance: Number(a.balance),
    status: a.status,
  }));
}

export async function treasuryKpis(db: PrismaClient, ctx: RequestContext): Promise<TreasuryKpis> {
  requirePermission(ctx, 'treasury.view');
  requireCompany(ctx);
  const now = new Date();
  const dayStart = startOfDay(now);
  const [accounts, todays] = await Promise.all([
    db.treasuryAccount.findMany({ where: { status: 'ACTIVE' }, select: { type: true, balance: true } }),
    db.treasuryMovement.findMany({ where: { occurredAt: { gte: dayStart } }, select: { flow: true, amount: true } }),
  ]);
  let cashTotal = 0;
  let bankTotal = 0;
  for (const a of accounts) {
    if (a.type === 'CASH') cashTotal += Number(a.balance);
    else bankTotal += Number(a.balance);
  }
  let todayIn = 0;
  let todayOut = 0;
  for (const m of todays) {
    if (m.flow === 'IN') todayIn += Number(m.amount);
    else todayOut += Number(m.amount);
  }
  return { cashTotal: round2(cashTotal), bankTotal: round2(bankTotal), todayIn: round2(todayIn), todayOut: round2(todayOut) };
}

export async function listMovements(db: PrismaClient, ctx: RequestContext, opts: { accountId?: string; limit?: number } = {}): Promise<TreasuryMovementItem[]> {
  requirePermission(ctx, 'treasury.view');
  requireCompany(ctx);
  const rows = await db.treasuryMovement.findMany({
    where: opts.accountId ? { accountId: opts.accountId } : undefined,
    orderBy: { occurredAt: 'desc' },
    take: opts.limit ?? 50,
    include: { account: { select: { name: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    occurredAt: m.occurredAt,
    accountId: m.accountId,
    accountName: m.account.name,
    flow: m.flow as TreasuryFlow,
    amount: Number(m.amount),
    balanceAfter: Number(m.balanceAfter),
    category: m.category,
    description: m.description,
    document: m.document,
  }));
}

/** Relatório diário de uma conta (saldo inicial, entradas, saídas, saldo final). */
export async function dailyReport(db: PrismaClient, ctx: RequestContext, accountId: string, dateISO?: string): Promise<DailyReport> {
  requirePermission(ctx, 'treasury.view');
  requireCompany(ctx);
  const account = await db.treasuryAccount.findFirst({ where: { id: accountId } });
  if (!account) throw new NotFoundError('Conta não encontrada.');

  const base = dateISO ? new Date(dateISO) : new Date();
  const dayStart = startOfDay(base);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const dayMovements = await db.treasuryMovement.findMany({
    where: { accountId, occurredAt: { gte: dayStart, lt: dayEnd } },
    orderBy: { occurredAt: 'asc' },
    include: { account: { select: { name: true } } },
  });
  // Movimentos posteriores ao dia (para derivar o saldo de fecho do dia).
  const after = await db.treasuryMovement.findMany({ where: { accountId, occurredAt: { gte: dayEnd } }, select: { flow: true, amount: true } });

  const currentBalance = Number(account.balance);
  const netAfter = after.reduce((acc, m) => acc + (m.flow === 'IN' ? Number(m.amount) : -Number(m.amount)), 0);
  const closingBalance = round2(currentBalance - netAfter);
  let totalIn = 0;
  let totalOut = 0;
  for (const m of dayMovements) {
    if (m.flow === 'IN') totalIn += Number(m.amount);
    else totalOut += Number(m.amount);
  }
  const openingBalance = round2(closingBalance - totalIn + totalOut);

  return {
    accountId: account.id,
    accountName: account.name,
    date: `${String(dayStart.getDate()).padStart(2, '0')}/${String(dayStart.getMonth() + 1).padStart(2, '0')}/${dayStart.getFullYear()}`,
    openingBalance,
    totalIn: round2(totalIn),
    totalOut: round2(totalOut),
    closingBalance,
    operator: ctx.userName ?? 'Operador',
    movements: dayMovements.map((m) => ({
      id: m.id,
      occurredAt: m.occurredAt,
      accountId: m.accountId,
      accountName: m.account.name,
      flow: m.flow as TreasuryFlow,
      amount: Number(m.amount),
      balanceAfter: Number(m.balanceAfter),
      category: m.category,
      description: m.description,
      document: m.document,
    })),
  };
}

// ─────────────────────────── Helper transaccional ───────────────────────────

/**
 * Lança um movimento numa conta dentro de uma transacção (reutilizado pelos
 * recibos de clientes e pagamentos a fornecedores). Devolve o saldo após.
 */
export async function postTreasuryMovementTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  userId: string,
  input: { accountId: string; flow: TreasuryFlow; amount: number; category: string; description?: string; document?: string; source?: string; counterpartAccountId?: string },
): Promise<number> {
  const account = await tx.treasuryAccount.findFirst({ where: { id: input.accountId, companyId } });
  if (!account) throw new NotFoundError('Conta de tesouraria não encontrada.');
  const amount = round2(input.amount);
  const balanceAfter = round2(Number(account.balance) + (input.flow === 'IN' ? amount : -amount));
  await tx.treasuryAccount.update({ where: { id: account.id }, data: { balance: balanceAfter } });
  await tx.treasuryMovement.create({
    data: {
      companyId,
      accountId: account.id,
      flow: input.flow,
      amount,
      balanceAfter,
      category: input.category,
      description: input.description ?? null,
      document: input.document ?? null,
      counterpartAccountId: input.counterpartAccountId ?? null,
      source: input.source ?? 'MANUAL',
      createdBy: userId,
    },
  });
  return balanceAfter;
}

// ─────────────────────────── Mutações ───────────────────────────

const accountInput = z.object({
  name: z.string().trim().min(1, 'O nome é obrigatório.').max(80),
  type: z.enum(['CASH', 'BANK', 'MOBILE', 'OTHER']).default('BANK'),
  reference: z.string().trim().max(80).optional(),
  openingBalance: z.coerce.number().default(0),
});
export type AccountInput = z.input<typeof accountInput>;

export async function createAccount(db: PrismaClient, ctx: RequestContext, input: AccountInput): Promise<{ id: string }> {
  requirePermission(ctx, 'treasury.manage');
  const companyId = requireCompany(ctx);
  const parsed = accountInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;

  const dup = await db.treasuryAccount.findFirst({ where: { name: data.name } });
  if (dup) throw new ConflictError('Já existe uma conta com este nome.');

  const created = await db.treasuryAccount.create({
    data: { companyId, name: data.name, type: data.type, reference: data.reference ?? null, openingBalance: round2(data.openingBalance), balance: round2(data.openingBalance), createdBy: ctx.userId } as never,
  });
  await writeAudit(db, ctx, { action: 'treasury.account_create', entity: 'TreasuryAccount', entityId: created.id, newValues: { name: data.name, type: data.type, openingBalance: data.openingBalance } });
  return { id: created.id };
}

const movementInput = z.object({
  accountId: z.string().min(1, 'Seleccione uma conta.'),
  flow: z.enum(['IN', 'OUT']),
  amount: z.coerce.number().positive('O valor deve ser positivo.'),
  category: z.string().trim().min(1).max(40).default('Movimento'),
  description: z.string().trim().max(240).optional(),
});
export type MovementInput = z.input<typeof movementInput>;

/** Movimento manual (entrada/saída) numa conta. */
export async function recordMovement(db: PrismaClient, ctx: RequestContext, input: MovementInput): Promise<{ balanceAfter: number }> {
  requirePermission(ctx, 'treasury.manage');
  const companyId = requireCompany(ctx);
  const parsed = movementInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;

  return db.$transaction(async (tx) => {
    const account = await tx.treasuryAccount.findFirst({ where: { id: data.accountId, companyId } });
    if (!account) throw new NotFoundError('Conta não encontrada.');
    if (data.flow === 'OUT' && round2(data.amount) > round2(Number(account.balance))) {
      throw new ValidationError('Saldo insuficiente na conta.');
    }
    const balanceAfter = await postTreasuryMovementTx(tx, companyId, ctx.userId, { accountId: data.accountId, flow: data.flow, amount: data.amount, category: data.category, description: data.description, source: 'MANUAL' });
    await writeAudit(tx, ctx, { action: 'treasury.movement', entity: 'TreasuryAccount', entityId: data.accountId, newValues: { flow: data.flow, amount: round2(data.amount), category: data.category } });
    return { balanceAfter };
  });
}

const transferInput = z.object({
  fromAccountId: z.string().min(1, 'Seleccione a conta de origem.'),
  toAccountId: z.string().min(1, 'Seleccione a conta de destino.'),
  amount: z.coerce.number().positive('O valor deve ser positivo.'),
  description: z.string().trim().max(240).optional(),
});
export type TransferInput = z.input<typeof transferInput>;

/** Transferência entre contas (gera dois movimentos ligados). */
export async function transfer(db: PrismaClient, ctx: RequestContext, input: TransferInput): Promise<void> {
  requirePermission(ctx, 'treasury.manage');
  const companyId = requireCompany(ctx);
  const parsed = transferInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  if (data.fromAccountId === data.toAccountId) throw new ValidationError('As contas de origem e destino têm de ser diferentes.');

  await db.$transaction(async (tx) => {
    const from = await tx.treasuryAccount.findFirst({ where: { id: data.fromAccountId, companyId } });
    const to = await tx.treasuryAccount.findFirst({ where: { id: data.toAccountId, companyId } });
    if (!from || !to) throw new NotFoundError('Conta não encontrada.');
    if (round2(data.amount) > round2(Number(from.balance))) throw new ValidationError('Saldo insuficiente na conta de origem.');

    const desc = data.description ?? `Transferência ${from.name} → ${to.name}`;
    await postTreasuryMovementTx(tx, companyId, ctx.userId, { accountId: from.id, flow: 'OUT', amount: data.amount, category: 'Transferência', description: desc, source: 'TRANSFER', counterpartAccountId: to.id });
    await postTreasuryMovementTx(tx, companyId, ctx.userId, { accountId: to.id, flow: 'IN', amount: data.amount, category: 'Transferência', description: desc, source: 'TRANSFER', counterpartAccountId: from.id });
    await writeAudit(tx, ctx, { action: 'treasury.transfer', entity: 'TreasuryAccount', entityId: from.id, newValues: { from: from.name, to: to.name, amount: round2(data.amount) } });
  });
}
