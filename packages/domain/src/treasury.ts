import { z } from 'zod';
import { Prisma, type PrismaClient } from '@ants/database';
import { civilDateInTimeZone, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';
import { FINGERPRINT_VERSION, canonicalRequestFingerprint, fpDate, runIdempotentOperation } from './operation-idempotency';
import { formatAccountingDate } from './accounting';
import { parseReversalDateInput, validateOpenReversalDateTx, validateReversalReason } from './reversals';

export type TreasuryAccountType = 'CASH' | 'BANK' | 'MOBILE' | 'OTHER';
export type TreasuryFlow = 'IN' | 'OUT';
export type TreasuryMovementStatus = 'ACTIVE' | 'REVERSED';

export interface TreasuryMovementOrigin {
  source: string | null;
  sourceType: string | null;
  sourceId: string | null;
  movementPurpose: string | null;
  transferId: string | null;
}

export interface AccountItem {
  id: string;
  name: string;
  type: TreasuryAccountType;
  reference: string | null;
  balance: number;
  allowNegative: boolean;
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
  transferId: string | null;
  source: string;
  sourceType: string | null;
  sourceId: string | null;
  movementPurpose: string | null;
  status: TreasuryMovementStatus;
  reversesId: string | null;
  reversalReason: string | null;
  reversalBlockedReason: string | null;
  createdBy: string | null;
}

export type CashClosingDifferenceStatus = 'PENDING' | 'NONE' | 'SURPLUS' | 'SHORTAGE';
export type CashClosingMethod = 'CASH' | 'MPESA' | 'EMOLA' | 'CARD_BANK' | 'TRANSFER' | 'OTHER';

export interface CashClosingCountInput {
  cash?: number;
  mpesa?: number;
  emola?: number;
  cardBank?: number;
  observations?: string;
}

export interface CashClosingCount {
  cash: number;
  mpesa: number;
  emola: number;
  cardBank: number;
  total: number;
  provided: boolean;
  observations: string | null;
}

export interface CashClosingMethodTotal {
  method: CashClosingMethod;
  label: string;
  expectedIn: number;
  expectedOut: number;
  counted: number;
}

export interface CashClosingMovementItem extends TreasuryMovementItem {
  originLabel: string;
  methodLabel: string;
  entry: number;
  exit: number;
  userLabel: string;
  reference: string;
}

export interface CashClosingReport {
  daily: DailyReport;
  expectedTotal: number;
  counted: CashClosingCount;
  difference: number;
  differenceStatus: CashClosingDifferenceStatus;
  differenceStatusLabel: string;
  methodTotals: CashClosingMethodTotal[];
  movements: CashClosingMovementItem[];
  posSalesTotal: number;
  receiptTotal: number;
  supplierPaymentTotal: number;
  transferTotal: number;
  hasFormalPersistence: false;
}

export interface TreasuryTransferReversalResult {
  transferId: string;
  originalOutMovementId: string;
  originalInMovementId: string;
  reversalInMovementId: string;
  reversalOutMovementId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
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
  accountType: TreasuryAccountType;
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

function mapMovement(m: {
  id: string;
  occurredAt: Date;
  accountId: string;
  account: { name: string };
  flow: string;
  amount: unknown;
  balanceAfter: unknown;
  category: string;
  description: string | null;
  document: string | null;
  transferId: string | null;
  source: string;
  sourceType: string | null;
  sourceId: string | null;
  movementPurpose: string | null;
  status: string;
  reversesId: string | null;
  reversalReason: string | null;
  createdBy: string | null;
}): TreasuryMovementItem {
  const origin = {
    source: m.source,
    sourceType: m.sourceType,
    sourceId: m.sourceId,
    movementPurpose: m.movementPurpose,
    transferId: m.transferId,
  };
  return {
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
    transferId: m.transferId,
    source: m.source,
    sourceType: m.sourceType,
    sourceId: m.sourceId,
    movementPurpose: m.movementPurpose,
    status: m.status as TreasuryMovementStatus,
    reversesId: m.reversesId,
    reversalReason: m.reversalReason,
    reversalBlockedReason: getTreasuryMovementReversalBlockReason(origin),
    createdBy: m.createdBy,
  };
}

const cashClosingCountInput = z.object({
  cash: z.coerce.number().min(0, 'O valor contado em dinheiro nao pode ser negativo.').optional(),
  mpesa: z.coerce.number().min(0, 'O valor contado em M-Pesa nao pode ser negativo.').optional(),
  emola: z.coerce.number().min(0, 'O valor contado em e-Mola nao pode ser negativo.').optional(),
  cardBank: z.coerce.number().min(0, 'O valor contado em cartao/banco nao pode ser negativo.').optional(),
  observations: z.string().trim().max(500, 'As observacoes devem ter no maximo 500 caracteres.').optional(),
});

const METHOD_LABEL: Record<CashClosingMethod, string> = {
  CASH: 'Dinheiro',
  MPESA: 'M-Pesa',
  EMOLA: 'e-Mola',
  CARD_BANK: 'Cartao/Banco',
  TRANSFER: 'Transferencia',
  OTHER: 'Outro',
};

function normalizeCashClosingCount(input: CashClosingCountInput = {}): CashClosingCount {
  const parsed = cashClosingCountInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados invalidos.');
  const data = parsed.data;
  const cash = round2(data.cash ?? 0);
  const mpesa = round2(data.mpesa ?? 0);
  const emola = round2(data.emola ?? 0);
  const cardBank = round2(data.cardBank ?? 0);
  return {
    cash,
    mpesa,
    emola,
    cardBank,
    total: round2(cash + mpesa + emola + cardBank),
    provided: data.cash !== undefined || data.mpesa !== undefined || data.emola !== undefined || data.cardBank !== undefined,
    observations: data.observations?.trim() || null,
  };
}

function classifyCashClosingDifference(difference: number, provided: boolean): { status: CashClosingDifferenceStatus; label: string } {
  if (!provided) return { status: 'PENDING', label: 'Contagem por informar' };
  if (difference === 0) return { status: 'NONE', label: 'Sem diferenca' };
  if (difference > 0) return { status: 'SURPLUS', label: 'Sobra' };
  return { status: 'SHORTAGE', label: 'Falta' };
}

function accountTypeMethod(type: TreasuryAccountType, accountName: string): CashClosingMethod {
  const name = accountName.toLowerCase();
  if (type === 'CASH') return 'CASH';
  if (type === 'MOBILE' && name.includes('m-pesa')) return 'MPESA';
  if (type === 'MOBILE' && name.includes('mpesa')) return 'MPESA';
  if (type === 'MOBILE' && name.includes('e-mola')) return 'EMOLA';
  if (type === 'MOBILE' && name.includes('emola')) return 'EMOLA';
  if (type === 'MOBILE') return 'OTHER';
  if (type === 'BANK') return 'CARD_BANK';
  return 'OTHER';
}

function paymentMethodToClosingMethod(method: string | null | undefined, accountType: TreasuryAccountType, accountName: string): CashClosingMethod {
  if (method === 'CASH') return 'CASH';
  if (method === 'MPESA') return 'MPESA';
  if (method === 'EMOLA') return 'EMOLA';
  if (method === 'CARD') return 'CARD_BANK';
  if (method === 'TRANSFER') return 'TRANSFER';
  return accountTypeMethod(accountType, accountName);
}

function originLabel(movement: TreasuryMovementItem): string {
  if (movement.description?.toLowerCase().includes('pos')) return 'Venda POS';
  if (movement.movementPurpose === 'RECEIPT_IN' || movement.sourceType === 'RECEIPT' || movement.source === 'RECEIPT') return 'Recebimento de cliente';
  if (movement.movementPurpose === 'SUPPLIER_PAYMENT_OUT' || movement.sourceType === 'SUPPLIER_PAYMENT' || movement.source === 'SUPPLIER_PAYMENT') return 'Pagamento a fornecedor';
  if (movement.source === 'TRANSFER' || movement.transferId) return 'Transferencia';
  if (movement.source === 'REVERSAL') return 'Estorno';
  if (movement.source === 'MANUAL') return 'Movimento manual';
  return movement.source || 'Movimento';
}

function countForMethod(counted: CashClosingCount, method: CashClosingMethod): number {
  if (method === 'CASH') return counted.cash;
  if (method === 'MPESA') return counted.mpesa;
  if (method === 'EMOLA') return counted.emola;
  if (method === 'CARD_BANK' || method === 'TRANSFER') return counted.cardBank;
  return 0;
}

export function getTreasuryMovementReversalBlockReason(movement: TreasuryMovementOrigin): string | null {
  if (movement.source === 'REVERSAL') return 'Este movimento já é um estorno.';
  if (movement.sourceType === 'RECEIPT' || movement.source === 'RECEIPT' || movement.movementPurpose === 'RECEIPT_IN') {
    return 'Este movimento foi gerado por um recebimento de cliente. Anule o recebimento no documento de origem.';
  }
  if (movement.sourceType === 'SUPPLIER_PAYMENT' || movement.source === 'SUPPLIER_PAYMENT' || movement.movementPurpose === 'SUPPLIER_PAYMENT_OUT') {
    return 'Este movimento foi gerado por um pagamento a fornecedor. Estorne o pagamento no documento de origem.';
  }
  if (movement.source === 'TRANSFER' || movement.transferId) {
    return 'Este movimento pertence a uma transferência entre contas e não pode ser estornado isoladamente.';
  }
  if (movement.sourceType || movement.sourceId || movement.movementPurpose) {
    return 'Este movimento foi gerado por um documento operacional e não pode ser estornado directamente na Tesouraria. Utilize o fluxo de anulação do documento de origem.';
  }
  return null;
}

export function assertTreasuryMovementCanBeReversed(movement: TreasuryMovementOrigin): void {
  const reason = getTreasuryMovementReversalBlockReason(movement);
  if (reason) throw new ValidationError(reason);
}

// ─────────────────────────── Leituras ───────────────────────────

/** Lista contas. Por omissão só activas; `includeInactive` para extractos históricos. */
export async function listAccounts(db: PrismaClient, ctx: RequestContext, includeInactive = false): Promise<AccountItem[]> {
  requirePermission(ctx, 'treasury.view');
  requireCompany(ctx);
  const rows = await db.treasuryAccount.findMany({
    where: includeInactive ? undefined : { status: 'ACTIVE' },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type as TreasuryAccountType,
    reference: a.reference,
    balance: Number(a.balance),
    allowNegative: a.allowNegative,
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
    // KPIs consolidados ignoram transferências internas e movimentos estornados.
    db.treasuryMovement.findMany({
      where: { occurredAt: { gte: dayStart }, status: 'ACTIVE', source: { not: 'TRANSFER' } },
      select: { flow: true, amount: true },
    }),
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
  return rows.map(mapMovement);
}

/** Relatório diário de uma conta (saldo inicial, entradas, saídas, saldo final). */
export async function dailyReport(db: PrismaClient, ctx: RequestContext, accountId: string, dateISO?: string): Promise<DailyReport> {
  requirePermission(ctx, 'treasury.viewReports');
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
  const after = await db.treasuryMovement.findMany({ where: { accountId, occurredAt: { gte: dayEnd }, status: 'ACTIVE' }, select: { flow: true, amount: true } });

  const currentBalance = Number(account.balance);
  const netAfter = after.reduce((acc, m) => acc + (m.flow === 'IN' ? Number(m.amount) : -Number(m.amount)), 0);
  const closingBalance = round2(currentBalance - netAfter);
  let totalIn = 0;
  let totalOut = 0;
  for (const m of dayMovements) {
    if (m.status !== 'ACTIVE') continue;
    if (m.flow === 'IN') totalIn += Number(m.amount);
    else totalOut += Number(m.amount);
  }
  const openingBalance = round2(closingBalance - totalIn + totalOut);

  return {
    accountId: account.id,
    accountName: account.name,
    accountType: account.type as TreasuryAccountType,
    date: `${String(dayStart.getDate()).padStart(2, '0')}/${String(dayStart.getMonth() + 1).padStart(2, '0')}/${dayStart.getFullYear()}`,
    openingBalance,
    totalIn: round2(totalIn),
    totalOut: round2(totalOut),
    closingBalance,
    operator: ctx.userName ?? 'Operador',
    movements: dayMovements.map(mapMovement),
  };
}

// ─────────────────────────── Helper transaccional ───────────────────────────

/** Prepara o Fecho de Caixa V1 como calculo operacional, sem gravar fecho formal. */
export async function cashClosingReport(
  db: PrismaClient,
  ctx: RequestContext,
  input: { accountId: string; dateISO?: string; counted?: CashClosingCountInput } | string,
  dateISO?: string,
  countedInput?: CashClosingCountInput,
): Promise<CashClosingReport> {
  const normalizedInput = typeof input === 'string' ? { accountId: input, dateISO, counted: countedInput } : input;
  const daily = await dailyReport(db, ctx, normalizedInput.accountId, normalizedInput.dateISO);
  const companyId = requireCompany(ctx);
  const counted = normalizeCashClosingCount(normalizedInput.counted);
  const activeMovements = daily.movements.filter((m) => m.status === 'ACTIVE');
  const receiptIds = activeMovements.filter((m) => m.sourceType === 'RECEIPT' && m.sourceId).map((m) => m.sourceId!) as string[];
  const supplierPaymentIds = activeMovements.filter((m) => m.sourceType === 'SUPPLIER_PAYMENT' && m.sourceId).map((m) => m.sourceId!) as string[];
  const userIds = Array.from(new Set(activeMovements.map((m) => m.createdBy).filter(Boolean) as string[]));

  const [payments, supplierPayments, users] = await Promise.all([
    receiptIds.length
      ? db.payment.findMany({ where: { companyId, id: { in: receiptIds } }, select: { id: true, method: true } })
      : Promise.resolve([]),
    supplierPaymentIds.length
      ? db.supplierPayment.findMany({ where: { companyId, id: { in: supplierPaymentIds } }, select: { id: true, method: true } })
      : Promise.resolve([]),
    userIds.length
      ? db.user.findMany({ where: { companyId, id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
  ]);

  const paymentMethodById = new Map(payments.map((p) => [p.id, p.method]));
  const supplierPaymentMethodById = new Map(supplierPayments.map((p) => [p.id, p.method]));
  const userById = new Map(users.map((u) => [u.id, u.name || u.email || u.id]));
  const methodTotals = new Map<CashClosingMethod, CashClosingMethodTotal>();
  const ensureMethod = (method: CashClosingMethod): CashClosingMethodTotal => {
    const existing = methodTotals.get(method);
    if (existing) return existing;
    const created = { method, label: METHOD_LABEL[method], expectedIn: 0, expectedOut: 0, counted: countForMethod(counted, method) };
    methodTotals.set(method, created);
    return created;
  };
  (['CASH', 'MPESA', 'EMOLA', 'CARD_BANK'] as CashClosingMethod[]).forEach(ensureMethod);

  let posSalesTotal = 0;
  let receiptTotal = 0;
  let supplierPaymentTotal = 0;
  let transferTotal = 0;
  const movements = activeMovements.map<CashClosingMovementItem>((m) => {
    const sourceMethod =
      m.sourceType === 'RECEIPT' && m.sourceId
        ? paymentMethodById.get(m.sourceId)
        : m.sourceType === 'SUPPLIER_PAYMENT' && m.sourceId
          ? supplierPaymentMethodById.get(m.sourceId)
          : null;
    const method = m.source === 'TRANSFER' || m.transferId ? 'TRANSFER' : paymentMethodToClosingMethod(sourceMethod, daily.accountType, daily.accountName);
    const total = ensureMethod(method);
    const entry = m.flow === 'IN' ? m.amount : 0;
    const exit = m.flow === 'OUT' ? m.amount : 0;
    total.expectedIn = round2(total.expectedIn + entry);
    total.expectedOut = round2(total.expectedOut + exit);

    const origin = originLabel(m);
    if (origin === 'Venda POS') posSalesTotal = round2(posSalesTotal + entry);
    if (origin === 'Recebimento de cliente' || origin === 'Venda POS') receiptTotal = round2(receiptTotal + entry);
    if (origin === 'Pagamento a fornecedor') supplierPaymentTotal = round2(supplierPaymentTotal + exit);
    if (origin === 'Transferencia') transferTotal = round2(transferTotal + m.amount);

    return {
      ...m,
      originLabel: origin,
      methodLabel: METHOD_LABEL[method],
      entry,
      exit,
      userLabel: m.createdBy ? userById.get(m.createdBy) ?? m.createdBy : 'Sem utilizador',
      reference: m.document ?? m.sourceId ?? m.transferId ?? m.id,
    };
  });

  const expectedTotal = round2(daily.closingBalance);
  const difference = counted.provided ? round2(counted.total - expectedTotal) : 0;
  const classified = classifyCashClosingDifference(difference, counted.provided);
  return {
    daily,
    expectedTotal,
    counted,
    difference,
    differenceStatus: classified.status,
    differenceStatusLabel: classified.label,
    methodTotals: [...methodTotals.values()].map((m) => ({ ...m, expectedIn: round2(m.expectedIn), expectedOut: round2(m.expectedOut) })),
    movements,
    posSalesTotal,
    receiptTotal,
    supplierPaymentTotal,
    transferTotal,
    hasFormalPersistence: false,
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvLine(values: Array<string | number>): string {
  return values.map((value) => csvEscape(String(value))).join(';');
}

function csvMoney(value: number): string {
  return round2(value).toFixed(2);
}

export async function exportCashClosingCsv(
  db: PrismaClient,
  ctx: RequestContext,
  input: { accountId: string; dateISO?: string },
): Promise<{ filename: string; content: string }> {
  requirePermission(ctx, 'reports.export');
  const report = await cashClosingReport(db, ctx, input);
  const lines = [
    csvLine(['Data', 'Conta', 'Tipo de movimento', 'Origem', 'Entrada', 'Saida', 'Saldo', 'Metodo', 'Referencia', 'Utilizador']),
    ...report.movements.map((movement) =>
      csvLine([
        report.daily.date,
        report.daily.accountName,
        movement.flow === 'IN' ? 'Entrada' : 'Saida',
        movement.originLabel,
        csvMoney(movement.entry),
        csvMoney(movement.exit),
        csvMoney(movement.balanceAfter),
        movement.methodLabel,
        movement.reference,
        movement.userLabel,
      ]),
    ),
  ];
  const safeDate = (input.dateISO ?? report.daily.date.split('/').reverse().join('-')).replace(/[^0-9-]/g, '');
  return {
    filename: `cash-closing-${safeDate}.csv`,
    content: `${lines.join('\r\n')}\r\n`,
  };
}

/**
 * Lança um movimento numa conta dentro de uma transacção. Aplica a regra de saldo
 * negativo (conta.allowNegative) e idempotência por (sourceType, sourceId, purpose):
 * se já existir o movimento para a mesma origem, é um no-op (devolve o saldo actual).
 * Reutilizado por recibos de clientes e pagamentos a fornecedores.
 */
export async function postTreasuryMovementTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  userId: string,
  input: {
    accountId: string;
    flow: TreasuryFlow;
    amount: number;
    category: string;
    description?: string;
    document?: string;
    source?: string;
    counterpartAccountId?: string;
    transferId?: string;
    sourceType?: string;
    sourceId?: string;
    movementPurpose?: string;
    occurredAt?: Date;
  },
): Promise<{ balanceAfter: number; movementId: string; created: boolean }> {
  // Idempotência: se a origem já gerou este movimento, não duplica.
  if (input.sourceType && input.sourceId && input.movementPurpose) {
    const existing = await tx.treasuryMovement.findFirst({
      where: { companyId, sourceType: input.sourceType, sourceId: input.sourceId, movementPurpose: input.movementPurpose },
    });
    if (existing) return { balanceAfter: Number(existing.balanceAfter), movementId: existing.id, created: false };
  }

  const account = await tx.treasuryAccount.findFirst({ where: { id: input.accountId, companyId } });
  if (!account) throw new NotFoundError('Conta de tesouraria não encontrada.');
  if (account.status !== 'ACTIVE') throw new ConflictError('A conta está inactiva.');

  const amount = round2(input.amount);
  if (amount <= 0) throw new ValidationError('O valor deve ser positivo.');

  // Actualização ATÓMICA do saldo (increment/decrement) — bloqueia a linha até ao
  // commit, evitando lost updates em movimentos concorrentes na mesma conta.
  const updated = await tx.treasuryAccount.update({
    where: { id: account.id },
    data: input.flow === 'IN' ? { balance: { increment: amount } } : { balance: { decrement: amount } },
  });
  const balanceAfter = round2(Number(updated.balance));
  if (input.flow === 'OUT' && balanceAfter < 0 && !account.allowNegative) {
    // Reverte a transacção inteira (o decremento não é persistido).
    throw new ValidationError(`Saldo insuficiente na conta ${account.name}.`);
  }
  const created = await tx.treasuryMovement.create({
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
      transferId: input.transferId ?? null,
      source: input.source ?? 'MANUAL',
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      movementPurpose: input.movementPurpose ?? null,
      createdBy: userId,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
  return { balanceAfter, movementId: created.id, created: true };
}

export async function reverseOperationalTreasuryMovementTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  userId: string,
  input: {
    movementId: string;
    reason: string;
    occurredAt: Date;
    expectedSourceType: string;
    expectedSourceId: string;
    expectedMovementPurpose: string;
    reversalPurpose: string;
    description: string;
  },
): Promise<{ reversalId: string; balanceBefore: number; balanceAfter: number }> {
  await tx.$queryRaw`SELECT id FROM treasury_movements WHERE id = ${input.movementId} AND "companyId" = ${companyId} FOR UPDATE`;
  const original = await tx.treasuryMovement.findFirst({ where: { id: input.movementId, companyId } });
  if (!original) throw new NotFoundError('Movimento de tesouraria do recebimento não encontrado.');
  if (original.sourceType !== input.expectedSourceType || original.sourceId !== input.expectedSourceId || original.movementPurpose !== input.expectedMovementPurpose) {
    throw new ConflictError('Movimento de tesouraria não corresponde ao recebimento informado.');
  }
  if (original.status !== 'ACTIVE') throw new ConflictError('O movimento de tesouraria do recebimento já foi estornado.');
  const already = await tx.treasuryMovement.findFirst({ where: { companyId, reversesId: original.id } });
  if (already) throw new ConflictError('O movimento de tesouraria do recebimento já tem movimento compensatório.');

  const account = await tx.treasuryAccount.findFirst({ where: { id: original.accountId, companyId } });
  if (!account) throw new NotFoundError('Conta de tesouraria do recebimento não encontrada.');

  const amount = round2(Number(original.amount));
  const reverseFlow: TreasuryFlow = original.flow === 'IN' ? 'OUT' : 'IN';
  const balanceBefore = round2(Number(account.balance));
  const updated = await tx.treasuryAccount.update({
    where: { id: account.id },
    data: reverseFlow === 'IN' ? { balance: { increment: amount } } : { balance: { decrement: amount } },
  });
  const balanceAfter = round2(Number(updated.balance));
  if (reverseFlow === 'OUT' && balanceAfter < 0 && !account.allowNegative) {
    throw new ValidationError(`Saldo insuficiente na conta ${account.name}.`);
  }

  const reversal = await tx.treasuryMovement.create({
    data: {
      companyId,
      accountId: account.id,
      flow: reverseFlow,
      amount,
      balanceAfter,
      category: original.category,
      description: input.description,
      document: original.document,
      counterpartAccountId: original.counterpartAccountId,
      transferId: original.transferId,
      source: 'REVERSAL',
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      movementPurpose: input.reversalPurpose,
      reversesId: original.id,
      reversalReason: input.reason,
      createdBy: userId,
      occurredAt: input.occurredAt,
    },
  });
  await tx.treasuryMovement.update({ where: { id: original.id }, data: { status: 'REVERSED', reversalReason: input.reason } });
  return { reversalId: reversal.id, balanceBefore, balanceAfter };
}

// ─────────────────────────── Mutações ───────────────────────────

const accountInput = z.object({
  name: z.string().trim().min(1, 'O nome é obrigatório.').max(80),
  type: z.enum(['CASH', 'BANK', 'MOBILE', 'OTHER']).default('BANK'),
  reference: z.string().trim().max(80).optional(),
  openingBalance: z.coerce.number().default(0),
  allowNegative: z.coerce.boolean().optional(),
});
export type AccountInput = z.input<typeof accountInput>;

export async function createAccount(db: PrismaClient, ctx: RequestContext, input: AccountInput): Promise<{ id: string }> {
  requirePermission(ctx, 'treasury.manageAccounts');
  const companyId = requireCompany(ctx);
  const parsed = accountInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;

  const dup = await db.treasuryAccount.findFirst({ where: { name: data.name } });
  if (dup) throw new ConflictError('Já existe uma conta com este nome.');

  // Por omissão, caixa/carteiras não permitem descoberto; banco/outras permitem.
  const allowNegative = data.allowNegative ?? (data.type === 'BANK' || data.type === 'OTHER');
  const created = await db.treasuryAccount.create({
    data: { companyId, name: data.name, type: data.type, reference: data.reference ?? null, allowNegative, openingBalance: round2(data.openingBalance), balance: round2(data.openingBalance), createdBy: ctx.userId } as never,
  });
  await writeAudit(db, ctx, { action: 'treasury.account_create', entity: 'TreasuryAccount', entityId: created.id, newValues: { name: data.name, type: data.type, openingBalance: data.openingBalance, allowNegative } });
  return { id: created.id };
}

/** Activa/desactiva uma conta. Contas com movimentos não são eliminadas — apenas desactivadas. */
export async function setAccountStatus(db: PrismaClient, ctx: RequestContext, accountId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
  requirePermission(ctx, 'treasury.manageAccounts');
  const companyId = requireCompany(ctx);
  const account = await db.treasuryAccount.findFirst({ where: { id: accountId, companyId } });
  if (!account) throw new NotFoundError('Conta não encontrada.');
  if (account.status === status) return;
  await db.treasuryAccount.update({ where: { id: account.id }, data: { status, updatedBy: ctx.userId } });
  await writeAudit(db, ctx, { action: 'treasury.account_status', entity: 'TreasuryAccount', entityId: account.id, oldValues: { status: account.status }, newValues: { status } });
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
  requirePermission(ctx, 'treasury.createMovement');
  const companyId = requireCompany(ctx);
  const parsed = movementInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;

  return db.$transaction(async (tx) => {
    const { balanceAfter, movementId } = await postTreasuryMovementTx(tx, companyId, ctx.userId, {
      accountId: data.accountId,
      flow: data.flow,
      amount: data.amount,
      category: data.category,
      description: data.description,
      source: 'MANUAL',
    });
    await writeAudit(tx, ctx, { action: 'treasury.movement', entity: 'TreasuryMovement', entityId: movementId, newValues: { flow: data.flow, amount: round2(data.amount), category: data.category } });
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

const reverseTransferInput = z.object({
  transferId: z.string().trim().min(1, 'Transferência obrigatória.'),
  idempotencyKey: z.string().trim().min(1, 'Chave de idempotência obrigatória.'),
  reversalReason: z.string(),
  reversalDate: z.string(),
});
export type ReverseTransferInput = z.input<typeof reverseTransferInput>;

function treasuryTransferReversalFingerprint(companyId: string, transferId: string, reversalDate: Date, reversalReason: string): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    transferId,
    reversalDate: fpDate(reversalDate),
    reversalReason,
  });
}

async function loadReversedTreasuryTransferResultTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  transferId: string,
): Promise<TreasuryTransferReversalResult | null> {
  const originals = await tx.treasuryMovement.findMany({ where: { companyId, transferId, source: 'TRANSFER' } });
  if (originals.length !== 2) return null;
  const out = originals.find((m) => m.flow === 'OUT');
  const inn = originals.find((m) => m.flow === 'IN');
  if (!out || !inn || out.status !== 'REVERSED' || inn.status !== 'REVERSED') return null;
  const reversals = await tx.treasuryMovement.findMany({ where: { companyId, reversesId: { in: [out.id, inn.id] } } });
  const reversalIn = reversals.find((m) => m.reversesId === out.id && m.flow === 'IN');
  const reversalOut = reversals.find((m) => m.reversesId === inn.id && m.flow === 'OUT');
  if (!reversalIn || !reversalOut) return null;
  return {
    transferId,
    originalOutMovementId: out.id,
    originalInMovementId: inn.id,
    reversalInMovementId: reversalIn.id,
    reversalOutMovementId: reversalOut.id,
    sourceAccountId: out.accountId,
    destinationAccountId: inn.accountId,
    amount: round2(Number(out.amount)),
  };
}

/** Transferência entre contas: dois movimentos ligados por transferId, atomicamente. */
export async function transfer(db: PrismaClient, ctx: RequestContext, input: TransferInput): Promise<{ transferId: string }> {
  requirePermission(ctx, 'treasury.transfer');
  const companyId = requireCompany(ctx);
  const parsed = transferInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  if (data.fromAccountId === data.toAccountId) throw new ValidationError('As contas de origem e destino têm de ser diferentes.');

  const transferId = `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.$transaction(async (tx) => {
    const from = await tx.treasuryAccount.findFirst({ where: { id: data.fromAccountId, companyId } });
    const to = await tx.treasuryAccount.findFirst({ where: { id: data.toAccountId, companyId } });
    if (!from || !to) throw new NotFoundError('Conta não encontrada.');
    const desc = data.description ?? `Transferência ${from.name} → ${to.name}`;
    // Saída na origem (valida saldo via allowNegative) e entrada no destino — ou falha tudo.
    await postTreasuryMovementTx(tx, companyId, ctx.userId, { accountId: from.id, flow: 'OUT', amount: data.amount, category: 'Transferência', description: desc, source: 'TRANSFER', counterpartAccountId: to.id, transferId });
    await postTreasuryMovementTx(tx, companyId, ctx.userId, { accountId: to.id, flow: 'IN', amount: data.amount, category: 'Transferência', description: desc, source: 'TRANSFER', counterpartAccountId: from.id, transferId });
    await writeAudit(tx, ctx, { action: 'treasury.transfer', entity: 'TreasuryMovement', entityId: transferId, newValues: { from: from.name, to: to.name, amount: round2(data.amount), transferId } });
  });
  return { transferId };
}

export async function reverseTreasuryTransfer(db: PrismaClient, ctx: RequestContext, input: ReverseTransferInput): Promise<TreasuryTransferReversalResult> {
  requirePermission(ctx, 'treasury.reverseTransfer');
  const companyId = requireCompany(ctx);
  const parsed = reverseTransferInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const reversalReason = validateReversalReason(data.reversalReason);
  const reversalDate = parseReversalDateInput(data.reversalDate);
  const currentDate = civilDateInTimeZone();
  if (formatAccountingDate(reversalDate) !== currentDate) {
    throw new ValidationError('A data do estorno deve ser a data actual em Africa/Maputo.');
  }
  const requestFingerprint = treasuryTransferReversalFingerprint(companyId, data.transferId, reversalDate, reversalReason);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<TreasuryTransferReversalResult>(tx, ctx, {
      scope: 'TREASURY_TRANSFER_REVERSE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'TreasuryTransfer',
      loadExisting: (transferId) => loadReversedTreasuryTransferResultTx(tx, companyId, transferId),
      run: async () => {
        await validateOpenReversalDateTx(tx, companyId, reversalDate);

        const initialLegs = await tx.treasuryMovement.findMany({ where: { companyId, transferId: data.transferId, source: 'TRANSFER' } });
        if (initialLegs.length === 0) throw new NotFoundError('Transferência não encontrada.');
        if (initialLegs.length !== 2) {
          throw new ConflictError('Não foi possível estornar a transferência porque as duas pernas originais não estão consistentes.');
        }

        await tx.$queryRaw`
          SELECT id
          FROM treasury_movements
          WHERE "companyId" = ${companyId}
            AND "transferId" = ${data.transferId}
            AND source = 'TRANSFER'
          ORDER BY id
          FOR UPDATE
        `;
        const legs = await tx.treasuryMovement.findMany({ where: { companyId, transferId: data.transferId, source: 'TRANSFER' }, orderBy: { id: 'asc' } });
        if (legs.length !== 2) {
          throw new ConflictError('Não foi possível estornar a transferência porque as duas pernas originais não estão consistentes.');
        }

        const out = legs.find((m) => m.flow === 'OUT');
        const inn = legs.find((m) => m.flow === 'IN');
        if (!out || !inn) {
          throw new ConflictError('Não foi possível estornar a transferência porque as duas pernas originais não estão consistentes.');
        }
        if (out.status === 'REVERSED' || inn.status === 'REVERSED') throw new ConflictError('Esta transferência já foi estornada.');
        if (out.status !== 'ACTIVE' || inn.status !== 'ACTIVE') {
          throw new ConflictError('Não foi possível estornar a transferência porque as duas pernas originais não estão consistentes.');
        }
        const amount = round2(Number(out.amount));
        if (amount <= 0 || amount !== round2(Number(inn.amount))) {
          throw new ConflictError('Não foi possível estornar a transferência porque as duas pernas originais não estão consistentes.');
        }
        if (out.accountId === inn.accountId || out.counterpartAccountId !== inn.accountId || inn.counterpartAccountId !== out.accountId) {
          throw new ConflictError('Não foi possível estornar a transferência porque as duas pernas originais não estão consistentes.');
        }
        if (out.companyId !== companyId || inn.companyId !== companyId || out.transferId !== inn.transferId) {
          throw new ConflictError('Não foi possível estornar a transferência porque as duas pernas originais não estão consistentes.');
        }

        const existingReversal = await tx.treasuryMovement.findFirst({ where: { companyId, reversesId: { in: [out.id, inn.id] } }, select: { id: true } });
        if (existingReversal) throw new ConflictError('Esta transferência já foi estornada.');

        const accountIds = [out.accountId, inn.accountId].sort();
        await tx.$queryRaw`
          SELECT id
          FROM treasury_accounts
          WHERE "companyId" = ${companyId}
            AND id IN (${Prisma.join(accountIds)})
          ORDER BY id
          FOR UPDATE
        `;
        const accounts = await tx.treasuryAccount.findMany({ where: { companyId, id: { in: accountIds } } });
        if (accounts.length !== 2) {
          throw new ConflictError('Não foi possível estornar a transferência porque as contas originais não estão consistentes.');
        }
        const sourceAccount = accounts.find((a) => a.id === out.accountId);
        const destinationAccount = accounts.find((a) => a.id === inn.accountId);
        if (!sourceAccount || !destinationAccount) {
          throw new ConflictError('Não foi possível estornar a transferência porque as contas originais não estão consistentes.');
        }
        if (sourceAccount.status !== 'ACTIVE' || destinationAccount.status !== 'ACTIVE') {
          throw new ConflictError('As contas da transferência devem estar activas para permitir o estorno.');
        }

        const sourceBalanceBefore = round2(Number(sourceAccount.balance));
        const destinationBalanceBefore = round2(Number(destinationAccount.balance));
        const destinationBalanceAfter = round2(destinationBalanceBefore - amount);
        if (destinationBalanceAfter < 0 && !destinationAccount.allowNegative) {
          throw new ValidationError(`Saldo insuficiente na conta ${destinationAccount.name}.`);
        }

        const updatedSource = await tx.treasuryAccount.update({ where: { id: sourceAccount.id }, data: { balance: { increment: amount } } });
        const updatedDestination = await tx.treasuryAccount.update({ where: { id: destinationAccount.id }, data: { balance: { decrement: amount } } });
        const sourceBalanceAfter = round2(Number(updatedSource.balance));
        const finalDestinationBalanceAfter = round2(Number(updatedDestination.balance));
        if (finalDestinationBalanceAfter < 0 && !destinationAccount.allowNegative) {
          throw new ValidationError(`Saldo insuficiente na conta ${destinationAccount.name}.`);
        }

        const description = `Estorno da transferência ${data.transferId} - ${reversalReason}`;
        const reversalIn = await tx.treasuryMovement.create({
          data: {
            companyId,
            accountId: sourceAccount.id,
            flow: 'IN',
            amount,
            balanceAfter: sourceBalanceAfter,
            category: out.category,
            description,
            document: out.document,
            counterpartAccountId: destinationAccount.id,
            transferId: data.transferId,
            source: 'REVERSAL',
            sourceType: 'TREASURY_TRANSFER',
            sourceId: data.transferId,
            movementPurpose: 'TREASURY_TRANSFER_IN_REVERSAL',
            reversesId: out.id,
            reversalReason,
            createdBy: ctx.userId,
            occurredAt: reversalDate,
          },
        });
        const reversalOut = await tx.treasuryMovement.create({
          data: {
            companyId,
            accountId: destinationAccount.id,
            flow: 'OUT',
            amount,
            balanceAfter: finalDestinationBalanceAfter,
            category: inn.category,
            description,
            document: inn.document,
            counterpartAccountId: sourceAccount.id,
            transferId: data.transferId,
            source: 'REVERSAL',
            sourceType: 'TREASURY_TRANSFER',
            sourceId: data.transferId,
            movementPurpose: 'TREASURY_TRANSFER_OUT_REVERSAL',
            reversesId: inn.id,
            reversalReason,
            createdBy: ctx.userId,
            occurredAt: reversalDate,
          },
        });

        await tx.treasuryMovement.updateMany({
          where: { companyId, id: { in: [out.id, inn.id] } },
          data: { status: 'REVERSED', reversalReason },
        });

        const result: TreasuryTransferReversalResult = {
          transferId: data.transferId,
          originalOutMovementId: out.id,
          originalInMovementId: inn.id,
          reversalInMovementId: reversalIn.id,
          reversalOutMovementId: reversalOut.id,
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destinationAccount.id,
          amount,
        };
        await writeAudit(tx, ctx, {
          action: 'treasury.transfer.reverse',
          entity: 'TreasuryTransfer',
          entityId: data.transferId,
          newValues: {
            transferId: data.transferId,
            reversalReason,
            reversalDate: formatAccountingDate(reversalDate),
            idempotencyKey: data.idempotencyKey,
            sourceAccountId: sourceAccount.id,
            sourceAccountName: sourceAccount.name,
            destinationAccountId: destinationAccount.id,
            destinationAccountName: destinationAccount.name,
            amount,
            originalOutMovementId: out.id,
            originalInMovementId: inn.id,
            reversalInMovementId: reversalIn.id,
            reversalOutMovementId: reversalOut.id,
            sourceBalanceBefore,
            sourceBalanceAfter,
            destinationBalanceBefore,
            destinationBalanceAfter: finalDestinationBalanceAfter,
          },
        });
        return { resourceType: 'TreasuryTransfer', resourceId: data.transferId, result };
      },
    });
    return op.result;
  });
}

/**
 * Estorna um movimento: cria um contra-movimento (ACTIVE) ligado ao original
 * (reversesId), marca o original como REVERSED e ajusta o saldo da conta.
 * Movimentos nunca são editados/eliminados — só estornados.
 */
export async function reverseMovement(db: PrismaClient, ctx: RequestContext, movementId: string, reason?: string): Promise<{ reversalId: string }> {
  requirePermission(ctx, 'treasury.reverseMovement');
  const companyId = requireCompany(ctx);

  return db.$transaction(async (tx) => {
    const original = await tx.treasuryMovement.findFirst({ where: { id: movementId, companyId } });
    if (!original) throw new NotFoundError('Movimento não encontrado.');
    if (original.status === 'REVERSED') throw new ConflictError('O movimento já foi estornado.');
    const already = await tx.treasuryMovement.findFirst({ where: { reversesId: original.id } });
    if (already) throw new ConflictError('O movimento já tem um estorno.');
    assertTreasuryMovementCanBeReversed(original);

    const account = await tx.treasuryAccount.findFirst({ where: { id: original.accountId, companyId } });
    if (!account) throw new NotFoundError('Conta não encontrada.');

    const amount = Number(original.amount);
    const reverseFlow: TreasuryFlow = original.flow === 'IN' ? 'OUT' : 'IN';
    const updated = await tx.treasuryAccount.update({
      where: { id: account.id },
      data: reverseFlow === 'IN' ? { balance: { increment: amount } } : { balance: { decrement: amount } },
    });
    const balanceAfter = round2(Number(updated.balance));
    if (reverseFlow === 'OUT' && balanceAfter < 0 && !account.allowNegative) {
      throw new ValidationError(`Saldo insuficiente para estornar na conta ${account.name}.`);
    }
    const reversal = await tx.treasuryMovement.create({
      data: {
        companyId,
        accountId: account.id,
        flow: reverseFlow,
        amount,
        balanceAfter,
        category: original.category,
        description: `Estorno de ${original.category}${reason ? ` — ${reason}` : ''}`,
        document: original.document,
        source: 'REVERSAL',
        reversesId: original.id,
        reversalReason: reason ?? null,
        createdBy: ctx.userId,
      },
    });
    await tx.treasuryMovement.update({ where: { id: original.id }, data: { status: 'REVERSED' } });
    await writeAudit(tx, ctx, { action: 'treasury.reverse', entity: 'TreasuryMovement', entityId: original.id, oldValues: { status: 'ACTIVE' }, newValues: { status: 'REVERSED', reversalId: reversal.id, reason: reason ?? null } });
    return { reversalId: reversal.id };
  });
}
