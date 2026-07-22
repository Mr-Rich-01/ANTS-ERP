/**
 * Adiantamentos e Devoluções a Clientes (Sessão S17).
 *
 * - Recibo de Adiantamento (RA): dinheiro recebido SEM factura. Sem IVA (o IVA nasce
 *   todo na factura, no SALE_ISSUED). Evento `ADVANCE_RECEIVED`: D Caixa/Banco /
 *   C 241 Adiantamentos de clientes (mapping CUSTOMER_ADVANCES).
 * - Aplicação de RA a factura: gera SEMPRE um REC (Payment método ADVANCE, sem
 *   movimento de tesouraria novo — o dinheiro entrou no RA). Evento `ADVANCE_APPLIED`:
 *   D 241 Adiantamentos / C 121 Clientes.
 * - Devolução ao Cliente (DEV): documento que justifica a saída de dinheiro. Evento
 *   `REFUND_ISSUED`: D 241 (origem ADVANCE) ou D 121 (origem CREDIT_NOTE/RECEIPT) /
 *   C Caixa/Banco. NUNCA movimenta stock nem reverte venda/IVA/CMV — esse papel é
 *   exclusivo da NC (regra aprovada da S17); quando há devolução física, a entrada
 *   de stock acontece na NC referenciada.
 *
 * Todos os consumos de saldo correm sob `FOR UPDATE`; todos os eventos são
 * idempotentes pela chave canónica (companyId, sourceType, sourceId, accountingEvent).
 */
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import { civilDateInTimeZone, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';
import { postTreasuryMovementTx } from './treasury';
import { formatAccountingDate, getMappedAccountTx, parseAccountingDate, type AccountingJournalType } from './accounting';
import { postAccountingEventTx, resolveTreasuryLedgerTx } from './accounting-events';
import {
  FINGERPRINT_VERSION,
  canonicalRequestFingerprint,
  fpAmount,
  fpDate,
  runIdempotentOperation,
} from './operation-idempotency';

/** Métodos de pagamento com dinheiro real (o ADVANCE é reservado aos RECs de aplicação). */
const MONEY_METHODS = ['CASH', 'MPESA', 'EMOLA', 'CARD', 'TRANSFER'] as const;

export type CustomerRefundOrigin = 'ADVANCE' | 'CREDIT_NOTE' | 'RECEIPT';

/** Estado derivado de um RA — nunca é gravado; calcula-se sempre dos acumulados. */
export type CustomerAdvanceState = 'ABERTO' | 'PARCIAL' | 'CONSUMIDO' | 'DEVOLVIDO' | 'CANCELADO';

export function advanceRemaining(a: { amount: number; appliedTotal: number; refundedTotal: number }): number {
  return round2(a.amount - a.appliedTotal - a.refundedTotal);
}

export function advanceState(a: {
  amount: number;
  appliedTotal: number;
  refundedTotal: number;
  cancelledAt: Date | null;
}): CustomerAdvanceState {
  if (a.cancelledAt) return 'CANCELADO';
  const remaining = advanceRemaining(a);
  if (remaining <= 0) {
    return a.refundedTotal > 0 && a.appliedTotal === 0 ? 'DEVOLVIDO' : 'CONSUMIDO';
  }
  return a.appliedTotal > 0 || a.refundedTotal > 0 ? 'PARCIAL' : 'ABERTO';
}

export function advanceStateLabel(state: CustomerAdvanceState): string {
  const labels: Record<CustomerAdvanceState, string> = {
    ABERTO: 'Aberto',
    PARCIAL: 'Parcial',
    CONSUMIDO: 'Consumido',
    DEVOLVIDO: 'Devolvido',
    CANCELADO: 'Cancelado',
  };
  return labels[state];
}

export function refundOriginLabel(origin: CustomerRefundOrigin): string {
  const labels: Record<CustomerRefundOrigin, string> = {
    ADVANCE: 'Recibo de Adiantamento',
    CREDIT_NOTE: 'Nota de Crédito',
    RECEIPT: 'Recibo',
  };
  return labels[origin];
}

// ─────────────────────────── Helpers locais (padrão invoices.ts) ───────────────────────────

async function nextDocNumber(tx: Prisma.TransactionClient, companyId: string, prefix: string, year: number): Promise<string> {
  const key = `${prefix}-${year}`;
  const counter = await tx.documentCounter.upsert({
    where: { companyId_key: { companyId, key } },
    update: { value: { increment: 1 } },
    create: { companyId, key, value: 1 },
  });
  return `${prefix} ${year}/${String(counter.value).padStart(4, '0')}`;
}

function resolveAllowedIssueDate(value: string): Date {
  const requestedDate = parseAccountingDate(value);
  const currentDate = civilDateInTimeZone();
  if (formatAccountingDate(requestedDate) !== currentDate) {
    throw new ValidationError('A data de emissão deve ser a data actual em Africa/Maputo.');
  }
  return parseAccountingDate(currentDate);
}

function journalTypeForTreasury(type: 'CASH' | 'BANK' | 'MOBILE' | 'OTHER'): AccountingJournalType {
  if (type === 'CASH') return 'CASH';
  if (type === 'BANK' || type === 'MOBILE') return 'BANK';
  throw new ValidationError('A conta financeira seleccionada não possui uma regra de diário contabilístico.');
}

// ─────────────────────────── Tipos de leitura ───────────────────────────

export interface CustomerAdvanceListFilters {
  /** Pesquisa pelo número do RA. */
  q?: string;
  customerId?: string;
  state?: CustomerAdvanceState;
  /** Datas pt-MZ (YYYY-MM-DD) sobre issueDate. */
  from?: string;
  to?: string;
}

export interface CustomerAdvanceListItem {
  id: string;
  number: string;
  customerName: string;
  issueDate: Date;
  amount: number;
  appliedTotal: number;
  refundedTotal: number;
  remaining: number;
  method: string;
  state: CustomerAdvanceState;
}

export interface CustomerAdvanceApplicationItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentId: string;
  paymentNumber: string;
  amount: number;
  createdAt: Date;
}

export interface CustomerAdvanceRefundItem {
  id: string;
  number: string;
  amount: number;
  issueDate: Date;
}

export interface CustomerAdvanceDetail {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerNuit: string | null;
  issueDate: Date;
  amount: number;
  appliedTotal: number;
  refundedTotal: number;
  remaining: number;
  method: string;
  treasuryAccountId: string;
  treasuryAccountName: string;
  reference: string | null;
  notes: string | null;
  state: CustomerAdvanceState;
  createdByName: string | null;
  createdAt: Date;
  applications: CustomerAdvanceApplicationItem[];
  refunds: CustomerAdvanceRefundItem[];
}

export interface CustomerRefundListFilters {
  /** Pesquisa pelo número da DEV. */
  q?: string;
  customerId?: string;
  origin?: CustomerRefundOrigin;
  /** Datas pt-MZ (YYYY-MM-DD) sobre issueDate. */
  from?: string;
  to?: string;
}

export interface CustomerRefundListItem {
  id: string;
  number: string;
  customerName: string;
  issueDate: Date;
  amount: number;
  method: string;
  origin: CustomerRefundOrigin;
  sourceNumber: string | null;
}

export interface CustomerRefundProductLine {
  sku: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface CustomerRefundDetail {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerNuit: string | null;
  issueDate: Date;
  amount: number;
  method: string;
  treasuryAccountId: string;
  treasuryAccountName: string;
  origin: CustomerRefundOrigin;
  sourceNumber: string | null;
  reason: string;
  notes: string | null;
  createdByName: string | null;
  createdAt: Date;
  /** Produtos da NC de origem, A TÍTULO INFORMATIVO (o stock entrou pela NC, nunca pela DEV). */
  creditNoteProducts: CustomerRefundProductLine[];
}

/** Resumo de adiantamentos de um cliente — secção própria do extracto (saldo credor separado). */
export interface CustomerAdvanceSummary {
  openAdvances: Array<{ id: string; number: string; issueDate: Date; amount: number; remaining: number; state: CustomerAdvanceState }>;
  /** Total por aplicar/devolver (saldo credor de adiantamentos). */
  totalRemaining: number;
}

// ─────────────────────────── Leituras ───────────────────────────

export async function listCustomerAdvances(
  db: PrismaClient,
  ctx: RequestContext,
  filters: CustomerAdvanceListFilters = {},
): Promise<CustomerAdvanceListItem[]> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);

  const where: Prisma.CustomerAdvanceWhereInput = {};
  if (filters.q?.trim()) where.number = { contains: filters.q.trim(), mode: 'insensitive' };
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.from || filters.to) {
    where.issueDate = {};
    if (filters.from) where.issueDate.gte = parseAccountingDate(filters.from);
    if (filters.to) where.issueDate.lt = new Date(parseAccountingDate(filters.to).getTime() + 86_400_000);
  }

  const rows = await db.customerAdvance.findMany({
    where,
    orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
    take: 300,
  });

  const items = rows.map((a) => {
    const amount = Number(a.amount);
    const appliedTotal = Number(a.appliedTotal);
    const refundedTotal = Number(a.refundedTotal);
    const shape = { amount, appliedTotal, refundedTotal, cancelledAt: a.cancelledAt };
    return {
      id: a.id,
      number: a.number,
      customerName: a.customerName,
      issueDate: a.issueDate,
      amount,
      appliedTotal,
      refundedTotal,
      remaining: advanceRemaining(shape),
      method: a.method,
      state: advanceState(shape),
    };
  });
  // O estado é derivado — o filtro aplica-se depois da projecção.
  return filters.state ? items.filter((i) => i.state === filters.state) : items;
}

export async function getCustomerAdvance(db: PrismaClient, ctx: RequestContext, advanceId: string): Promise<CustomerAdvanceDetail> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);

  const a = await db.customerAdvance.findFirst({
    where: { id: advanceId },
    include: {
      treasuryAccount: { select: { name: true } },
      applications: {
        orderBy: { createdAt: 'asc' },
        include: { invoice: { select: { number: true } }, payment: { select: { number: true } } },
      },
      refunds: { orderBy: { createdAt: 'asc' }, select: { id: true, number: true, amount: true, issueDate: true } },
    },
  });
  if (!a) throw new NotFoundError('Recibo de adiantamento não encontrado.');

  const createdByUser = a.createdBy ? await db.user.findFirst({ where: { id: a.createdBy }, select: { name: true, email: true } }) : null;
  const amount = Number(a.amount);
  const appliedTotal = Number(a.appliedTotal);
  const refundedTotal = Number(a.refundedTotal);
  const shape = { amount, appliedTotal, refundedTotal, cancelledAt: a.cancelledAt };

  return {
    id: a.id,
    number: a.number,
    customerId: a.customerId,
    customerName: a.customerName,
    customerNuit: a.customerNuit,
    issueDate: a.issueDate,
    amount,
    appliedTotal,
    refundedTotal,
    remaining: advanceRemaining(shape),
    method: a.method,
    treasuryAccountId: a.treasuryAccountId,
    treasuryAccountName: a.treasuryAccount.name,
    reference: a.reference,
    notes: a.notes,
    state: advanceState(shape),
    createdByName: createdByUser ? createdByUser.name || createdByUser.email : null,
    createdAt: a.createdAt,
    applications: a.applications.map((ap) => ({
      id: ap.id,
      invoiceId: ap.invoiceId,
      invoiceNumber: ap.invoice.number,
      paymentId: ap.paymentId,
      paymentNumber: ap.payment.number,
      amount: Number(ap.amount),
      createdAt: ap.createdAt,
    })),
    refunds: a.refunds.map((r) => ({ id: r.id, number: r.number, amount: Number(r.amount), issueDate: r.issueDate })),
  };
}

export async function listCustomerRefunds(
  db: PrismaClient,
  ctx: RequestContext,
  filters: CustomerRefundListFilters = {},
): Promise<CustomerRefundListItem[]> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);

  const where: Prisma.CustomerRefundWhereInput = {};
  if (filters.q?.trim()) where.number = { contains: filters.q.trim(), mode: 'insensitive' };
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.origin) where.origin = filters.origin;
  if (filters.from || filters.to) {
    where.issueDate = {};
    if (filters.from) where.issueDate.gte = parseAccountingDate(filters.from);
    if (filters.to) where.issueDate.lt = new Date(parseAccountingDate(filters.to).getTime() + 86_400_000);
  }

  const rows = await db.customerRefund.findMany({
    where,
    orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
    take: 300,
    include: {
      advance: { select: { number: true } },
      creditNote: { select: { number: true } },
      payment: { select: { number: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    customerName: r.customerName,
    issueDate: r.issueDate,
    amount: Number(r.amount),
    method: r.method,
    origin: r.origin as CustomerRefundOrigin,
    sourceNumber: r.advance?.number ?? r.creditNote?.number ?? r.payment?.number ?? null,
  }));
}

export async function getCustomerRefund(db: PrismaClient, ctx: RequestContext, refundId: string): Promise<CustomerRefundDetail> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);

  const r = await db.customerRefund.findFirst({
    where: { id: refundId },
    include: {
      treasuryAccount: { select: { name: true } },
      advance: { select: { number: true } },
      creditNote: {
        select: {
          number: true,
          returnStock: true,
          lines: { select: { sku: true, description: true, quantity: true, unitPrice: true, total: true } },
        },
      },
      payment: { select: { number: true } },
    },
  });
  if (!r) throw new NotFoundError('Devolução ao cliente não encontrada.');

  const createdByUser = r.createdBy ? await db.user.findFirst({ where: { id: r.createdBy }, select: { name: true, email: true } }) : null;

  return {
    id: r.id,
    number: r.number,
    customerId: r.customerId,
    customerName: r.customerName,
    customerNuit: r.customerNuit,
    issueDate: r.issueDate,
    amount: Number(r.amount),
    method: r.method,
    treasuryAccountId: r.treasuryAccountId,
    treasuryAccountName: r.treasuryAccount.name,
    origin: r.origin as CustomerRefundOrigin,
    sourceNumber: r.advance?.number ?? r.creditNote?.number ?? r.payment?.number ?? null,
    reason: r.reason,
    notes: r.notes,
    createdByName: createdByUser ? createdByUser.name || createdByUser.email : null,
    createdAt: r.createdAt,
    creditNoteProducts: (r.creditNote?.lines ?? []).map((l) => ({
      sku: l.sku,
      description: l.description,
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      total: Number(l.total),
    })),
  };
}

/** Adiantamentos com saldo por aplicar de um cliente — alimenta a secção própria do extracto. */
export async function getCustomerAdvanceSummary(db: PrismaClient, ctx: RequestContext, customerId: string): Promise<CustomerAdvanceSummary> {
  requirePermission(ctx, 'clients.view');
  requireCompany(ctx);

  const rows = await db.customerAdvance.findMany({
    where: { customerId, cancelledAt: null },
    orderBy: { issueDate: 'asc' },
  });

  const openAdvances = rows
    .map((a) => {
      const shape = {
        amount: Number(a.amount),
        appliedTotal: Number(a.appliedTotal),
        refundedTotal: Number(a.refundedTotal),
        cancelledAt: a.cancelledAt,
      };
      return {
        id: a.id,
        number: a.number,
        issueDate: a.issueDate,
        amount: shape.amount,
        remaining: advanceRemaining(shape),
        state: advanceState(shape),
      };
    })
    .filter((a) => a.remaining > 0);

  return {
    openAdvances,
    totalRemaining: round2(openAdvances.reduce((sum, a) => sum + a.remaining, 0)),
  };
}

/** Contexto do formulário de Devolução ao Cliente: RAs abertos e NCs com crédito disponível. */
export interface CustomerRefundFormContext {
  customerName: string;
  /** Saldo credor global do cliente (−balance quando negativo; 0 caso contrário). */
  creditAvailable: number;
  openAdvances: Array<{ id: string; number: string; remaining: number }>;
  refundableCreditNotes: Array<{ id: string; number: string; total: number; available: number }>;
}

export async function getCustomerRefundFormContext(db: PrismaClient, ctx: RequestContext, customerId: string): Promise<CustomerRefundFormContext> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);

  const customer = await db.customer.findFirst({ where: { id: customerId }, select: { name: true, balance: true } });
  if (!customer) throw new NotFoundError('Cliente não encontrado.');

  const [advances, creditNotes, refundsByNote] = await Promise.all([
    db.customerAdvance.findMany({ where: { customerId, cancelledAt: null }, orderBy: { issueDate: 'asc' } }),
    db.creditNote.findMany({ where: { customerId, status: 'ISSUED' }, orderBy: { issueDate: 'asc' }, select: { id: true, number: true, total: true } }),
    db.customerRefund.groupBy({ by: ['creditNoteId'], where: { customerId, creditNoteId: { not: null } }, _sum: { amount: true } }),
  ]);
  const refunded = new Map(refundsByNote.map((r) => [r.creditNoteId as string, round2(Number(r._sum.amount ?? 0))]));

  return {
    customerName: customer.name,
    creditAvailable: Math.max(round2(-Number(customer.balance)), 0),
    openAdvances: advances
      .map((a) => ({
        id: a.id,
        number: a.number,
        remaining: advanceRemaining({ amount: Number(a.amount), appliedTotal: Number(a.appliedTotal), refundedTotal: Number(a.refundedTotal) }),
      }))
      .filter((a) => a.remaining > 0),
    refundableCreditNotes: creditNotes
      .map((n) => ({
        id: n.id,
        number: n.number,
        total: round2(Number(n.total)),
        available: round2(Number(n.total) - (refunded.get(n.id) ?? 0)),
      }))
      .filter((n) => n.available > 0),
  };
}

// ─────────────────────────── Criação de RA ───────────────────────────

const advanceInput = z.object({
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  issueDate: z.string().min(1, 'Seleccione a data de emissão.'),
  customerId: z.string().min(1, 'Seleccione um cliente.'),
  amount: z.coerce.number().positive('O valor deve ser positivo.'),
  method: z.enum(MONEY_METHODS).default('CASH'),
  accountId: z.string().min(1, 'Seleccione a conta de caixa, banco ou carteira móvel.'),
  reference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CustomerAdvanceInput = z.input<typeof advanceInput>;
type ParsedAdvanceInput = z.output<typeof advanceInput>;

function advanceFingerprint(data: ParsedAdvanceInput, issueDate: Date): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    issueDate: fpDate(issueDate),
    customerId: data.customerId,
    amount: fpAmount(round2(data.amount)),
    method: data.method,
    accountId: data.accountId,
    reference: data.reference ?? null,
    notes: data.notes ?? null,
  });
}

/**
 * Cria um Recibo de Adiantamento: entrada de tesouraria + evento `ADVANCE_RECEIVED`
 * (D Caixa/Banco / C Adiantamentos de clientes). SEM IVA e SEM tocar no saldo devedor
 * do cliente — o crédito vive no saldo remanescente do próprio RA.
 */
export async function createCustomerAdvance(db: PrismaClient, ctx: RequestContext, input: CustomerAdvanceInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'payments.receive');
  const companyId = requireCompany(ctx);
  const parsed = advanceInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const issueDate = resolveAllowedIssueDate(data.issueDate);
  const amount = round2(data.amount);
  const requestFingerprint = advanceFingerprint(data, issueDate);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'CUSTOMER_ADVANCE_CREATE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'CustomerAdvance',
      loadExisting: async (resourceId) => {
        return tx.customerAdvance.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
      },
      run: async () => {
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, companyId } });
        if (!customer) throw new NotFoundError('Cliente não encontrado.');

        const treasury = await resolveTreasuryLedgerTx(tx, companyId, data.accountId);
        const journalType = journalTypeForTreasury(treasury.treasuryType);
        const advancesAccount = await getMappedAccountTx(tx, companyId, 'CUSTOMER_ADVANCES');

        const number = await nextDocNumber(tx, companyId, 'RA', issueDate.getUTCFullYear());
        const advance = await tx.customerAdvance.create({
          data: {
            companyId,
            number,
            customerId: customer.id,
            customerName: customer.name,
            customerNuit: customer.nuit,
            issueDate,
            amount,
            method: data.method,
            treasuryAccountId: data.accountId,
            reference: data.reference ?? null,
            notes: data.notes ?? null,
            createdBy: ctx.userId,
          },
        });

        const treasuryMovement = await postTreasuryMovementTx(tx, companyId, ctx.userId, {
          accountId: data.accountId,
          flow: 'IN',
          amount,
          category: 'Adiantamento',
          description: `Recibo de adiantamento ${number} — ${customer.name}`,
          document: number,
          source: 'RECEIPT',
          sourceType: 'CUSTOMER_ADVANCE',
          sourceId: advance.id,
          movementPurpose: 'ADVANCE_IN',
          occurredAt: advance.createdAt,
        });

        await postAccountingEventTx(tx, ctx, {
          journalType,
          entryDate: issueDate,
          dateLabel: 'A data de emissão',
          description: `Recibo de adiantamento ${number} — ${customer.name}`,
          reference: number,
          origin: { sourceType: 'CUSTOMER_ADVANCE', sourceId: advance.id, accountingEvent: 'ADVANCE_RECEIVED' },
          lines: [
            { ledgerAccountId: treasury.ledgerAccountId, debit: amount, treasuryAccountId: treasury.treasuryAccountId, description: `Recibo de adiantamento ${number}` },
            { ledgerAccountId: advancesAccount.id, credit: amount, customerId: customer.id, description: `Recibo de adiantamento ${number}` },
          ],
        });

        await writeAudit(tx, ctx, {
          action: 'advance.create',
          entity: 'CustomerAdvance',
          entityId: advance.id,
          newValues: {
            number,
            customerId: customer.id,
            customer: customer.name,
            issueDate: formatAccountingDate(issueDate),
            amount,
            method: data.method,
            treasuryAccountId: data.accountId,
            treasuryMovementId: treasuryMovement.movementId,
            reference: data.reference ?? null,
            idempotencyKey: data.idempotencyKey,
            accounting: { sourceType: 'CUSTOMER_ADVANCE', accountingEvent: 'ADVANCE_RECEIVED', journalType },
          },
        });

        return { resourceType: 'CustomerAdvance', resourceId: advance.id, result: { id: advance.id, number } };
      },
    });
    return op.result;
  });
}

// ─────────────────────────── Aplicação de RA a factura ───────────────────────────

const applyAdvanceInput = z.object({
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  advanceId: z.string().min(1, 'Adiantamento inválido.'),
  invoiceId: z.string().min(1, 'Factura inválida.'),
  amount: z.coerce.number().positive('O valor deve ser positivo.'),
});

export type ApplyAdvanceInput = z.input<typeof applyAdvanceInput>;
type ParsedApplyAdvanceInput = z.output<typeof applyAdvanceInput>;

function applyAdvanceFingerprint(data: ParsedApplyAdvanceInput): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    advanceId: data.advanceId,
    invoiceId: data.invoiceId,
    amount: fpAmount(round2(data.amount)),
  });
}

export interface ApplyAdvanceResult {
  applicationId: string;
  paymentId: string;
  paymentNumber: string;
  advanceRemaining: number;
}

/**
 * Aplica um RA (parcial ou totalmente) a uma factura: cria um REC (Payment método
 * ADVANCE, SEM movimento de tesouraria — o dinheiro entrou no RA) e o evento
 * `ADVANCE_APPLIED` (D Adiantamentos / C Clientes). A factura passa a parcial/paga
 * pelo mecanismo normal. Bloqueia sob `FOR UPDATE` se exceder o saldo do RA ou a
 * dívida da factura.
 */
export async function applyAdvanceToInvoice(db: PrismaClient, ctx: RequestContext, input: ApplyAdvanceInput): Promise<ApplyAdvanceResult> {
  requirePermission(ctx, 'payments.receive');
  const companyId = requireCompany(ctx);
  const parsed = applyAdvanceInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const amount = round2(data.amount);
  const requestFingerprint = applyAdvanceFingerprint(data);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<ApplyAdvanceResult>(tx, ctx, {
      scope: 'CUSTOMER_ADVANCE_APPLY',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'CustomerAdvanceApplication',
      loadExisting: async (resourceId) => {
        const app = await tx.customerAdvanceApplication.findFirst({
          where: { companyId, id: resourceId },
          include: { payment: { select: { id: true, number: true } }, advance: true },
        });
        if (!app) return null;
        return {
          applicationId: app.id,
          paymentId: app.payment.id,
          paymentNumber: app.payment.number,
          advanceRemaining: advanceRemaining({
            amount: Number(app.advance.amount),
            appliedTotal: Number(app.advance.appliedTotal),
            refundedTotal: Number(app.advance.refundedTotal),
          }),
        };
      },
      run: async () => {
        // Ordem de locks consistente com createPayment/cancelInvoice: factura primeiro.
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${data.invoiceId} AND "companyId" = ${companyId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM customer_advances WHERE id = ${data.advanceId} AND "companyId" = ${companyId} FOR UPDATE`;

        const invoice = await tx.invoice.findFirst({ where: { id: data.invoiceId, companyId } });
        if (!invoice) throw new NotFoundError('Factura não encontrada.');
        if (invoice.status === 'CANCELLED') throw new ConflictError('A factura está cancelada.');
        if (invoice.status === 'DRAFT') throw new ConflictError('A factura é um rascunho — emita-a antes de aplicar adiantamentos.');

        const advance = await tx.customerAdvance.findFirst({ where: { id: data.advanceId, companyId } });
        if (!advance) throw new NotFoundError('Recibo de adiantamento não encontrado.');
        if (advance.cancelledAt) throw new ConflictError('O recibo de adiantamento está cancelado.');
        if (advance.customerId !== invoice.customerId) {
          throw new ValidationError('O adiantamento pertence a outro cliente.');
        }

        const remaining = advanceRemaining({
          amount: Number(advance.amount),
          appliedTotal: Number(advance.appliedTotal),
          refundedTotal: Number(advance.refundedTotal),
        });
        if (amount > remaining) {
          throw new ValidationError(`O valor excede o saldo remanescente do adiantamento (${remaining.toFixed(2)} MT).`);
        }
        const total = Number(invoice.total);
        const paid = Number(invoice.amountPaid);
        const outstanding = round2(total - paid);
        if (outstanding <= 0) throw new ConflictError('A factura já está totalmente paga.');
        if (amount > outstanding) throw new ValidationError(`O valor excede o saldo em dívida (${outstanding.toFixed(2)} MT).`);

        const advancesAccount = await getMappedAccountTx(tx, companyId, 'CUSTOMER_ADVANCES');
        const ar = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_RECEIVABLE');

        const number = await nextDocNumber(tx, companyId, 'REC', new Date().getFullYear());
        const payment = await tx.payment.create({
          data: {
            companyId,
            number,
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            amount,
            method: 'ADVANCE',
            notes: `Aplicação do adiantamento ${advance.number}`,
            createdBy: ctx.userId,
          },
        });

        const newPaid = round2(paid + amount);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaid: newPaid, status: newPaid >= total ? 'PAID' : 'PARTIAL' },
        });
        await tx.customer.update({ where: { id: invoice.customerId }, data: { balance: { decrement: amount } } });

        const application = await tx.customerAdvanceApplication.create({
          data: {
            companyId,
            advanceId: advance.id,
            invoiceId: invoice.id,
            paymentId: payment.id,
            amount,
            createdBy: ctx.userId,
          },
        });
        await tx.customerAdvance.update({ where: { id: advance.id }, data: { appliedTotal: { increment: amount } } });

        await postAccountingEventTx(tx, ctx, {
          journalType: 'GENERAL',
          entryDate: payment.paidAt,
          description: `Aplicação do adiantamento ${advance.number} na factura ${invoice.number} (${number})`,
          reference: number,
          origin: { sourceType: 'CUSTOMER_ADVANCE_APPLICATION', sourceId: application.id, accountingEvent: 'ADVANCE_APPLIED' },
          lines: [
            { ledgerAccountId: advancesAccount.id, debit: amount, customerId: invoice.customerId, description: `Aplicação do adiantamento ${advance.number}` },
            { ledgerAccountId: ar.id, credit: amount, customerId: invoice.customerId, description: `Recebimento por adiantamento ${number}` },
          ],
        });

        await writeAudit(tx, ctx, {
          action: 'advance.apply',
          entity: 'CustomerAdvance',
          entityId: advance.id,
          newValues: {
            advanceNumber: advance.number,
            applicationId: application.id,
            invoice: invoice.number,
            invoiceId: invoice.id,
            payment: number,
            paymentId: payment.id,
            amount,
            idempotencyKey: data.idempotencyKey,
            accounting: { sourceType: 'CUSTOMER_ADVANCE_APPLICATION', accountingEvent: 'ADVANCE_APPLIED' },
          },
        });

        return {
          resourceType: 'CustomerAdvanceApplication',
          resourceId: application.id,
          result: {
            applicationId: application.id,
            paymentId: payment.id,
            paymentNumber: number,
            advanceRemaining: round2(remaining - amount),
          },
        };
      },
    });
    return op.result;
  });
}

// ─────────────────────────── Devolução ao Cliente ───────────────────────────

const refundBaseFields = {
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  issueDate: z.string().min(1, 'Seleccione a data de emissão.'),
  amount: z.coerce.number().positive('O valor deve ser positivo.'),
  method: z.enum(MONEY_METHODS).default('CASH'),
  accountId: z.string().min(1, 'Seleccione a conta de caixa, banco ou carteira móvel.'),
  reason: z.string().trim().min(3, 'Indique o motivo da devolução.').max(500),
  notes: z.string().trim().max(1000).optional(),
};

const refundAdvanceInput = z.object({ ...refundBaseFields, advanceId: z.string().min(1, 'Adiantamento inválido.') });
export type RefundAdvanceInput = z.input<typeof refundAdvanceInput>;
type ParsedRefundAdvanceInput = z.output<typeof refundAdvanceInput>;

const customerRefundInput = z
  .object({
    ...refundBaseFields,
    customerId: z.string().min(1, 'Seleccione um cliente.'),
    origin: z.enum(['CREDIT_NOTE', 'RECEIPT']),
    creditNoteId: z.string().optional(),
    paymentId: z.string().optional(),
  })
  .superRefine((val, ctx2) => {
    if (val.origin === 'CREDIT_NOTE' && !val.creditNoteId) {
      ctx2.addIssue({ code: z.ZodIssueCode.custom, message: 'Seleccione a nota de crédito de origem.' });
    }
    if (val.origin === 'RECEIPT' && !val.paymentId) {
      ctx2.addIssue({ code: z.ZodIssueCode.custom, message: 'Seleccione o recibo de origem.' });
    }
  });
export type CustomerRefundInput = z.input<typeof customerRefundInput>;
type ParsedCustomerRefundInput = z.output<typeof customerRefundInput>;

function refundAdvanceFingerprint(data: ParsedRefundAdvanceInput, issueDate: Date): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    origin: 'ADVANCE',
    advanceId: data.advanceId,
    issueDate: fpDate(issueDate),
    amount: fpAmount(round2(data.amount)),
    method: data.method,
    accountId: data.accountId,
    reason: data.reason,
    notes: data.notes ?? null,
  });
}

function customerRefundFingerprint(data: ParsedCustomerRefundInput, issueDate: Date): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    origin: data.origin,
    customerId: data.customerId,
    creditNoteId: data.creditNoteId ?? null,
    paymentId: data.paymentId ?? null,
    issueDate: fpDate(issueDate),
    amount: fpAmount(round2(data.amount)),
    method: data.method,
    accountId: data.accountId,
    reason: data.reason,
    notes: data.notes ?? null,
  });
}

interface RefundPostingArgs {
  number: string;
  customerId: string;
  customerName: string;
  issueDate: Date;
  amount: number;
  /** D Adiantamentos (origem ADVANCE) ou D Clientes (CREDIT_NOTE/RECEIPT). */
  debitAccountId: string;
  refundId: string;
  treasury: { ledgerAccountId: string; treasuryAccountId: string; treasuryType: 'CASH' | 'BANK' | 'MOBILE' | 'OTHER' };
  accountId: string;
}

/** Tesouraria de saída + evento `REFUND_ISSUED` — partilhado pelas duas origens. */
async function postRefundEffectsTx(tx: Prisma.TransactionClient, ctx: RequestContext, companyId: string, args: RefundPostingArgs): Promise<{ movementId: string }> {
  const movement = await postTreasuryMovementTx(tx, companyId, ctx.userId, {
    accountId: args.accountId,
    flow: 'OUT',
    amount: args.amount,
    category: 'Devolução',
    description: `Devolução ao cliente ${args.number} — ${args.customerName}`,
    document: args.number,
    source: 'REFUND',
    sourceType: 'CUSTOMER_REFUND',
    sourceId: args.refundId,
    movementPurpose: 'REFUND_OUT',
  });

  await postAccountingEventTx(tx, ctx, {
    journalType: journalTypeForTreasury(args.treasury.treasuryType),
    entryDate: args.issueDate,
    dateLabel: 'A data de emissão',
    description: `Devolução ao cliente ${args.number} — ${args.customerName}`,
    reference: args.number,
    origin: { sourceType: 'CUSTOMER_REFUND', sourceId: args.refundId, accountingEvent: 'REFUND_ISSUED' },
    lines: [
      { ledgerAccountId: args.debitAccountId, debit: args.amount, customerId: args.customerId, description: `Devolução ao cliente ${args.number}` },
      { ledgerAccountId: args.treasury.ledgerAccountId, credit: args.amount, treasuryAccountId: args.treasury.treasuryAccountId, description: `Devolução ao cliente ${args.number}` },
    ],
  });

  return { movementId: movement.movementId };
}

/**
 * Devolve (parcial ou totalmente) o saldo remanescente de um RA ao cliente:
 * `CustomerRefund` origem ADVANCE + saída de tesouraria + `REFUND_ISSUED`
 * (D Adiantamentos de clientes / C Caixa/Banco). Zero stock, zero conta corrente.
 */
export async function refundAdvance(db: PrismaClient, ctx: RequestContext, input: RefundAdvanceInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'treasury.createMovement');
  const companyId = requireCompany(ctx);
  const parsed = refundAdvanceInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const issueDate = resolveAllowedIssueDate(data.issueDate);
  const amount = round2(data.amount);
  const requestFingerprint = refundAdvanceFingerprint(data, issueDate);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'CUSTOMER_REFUND_CREATE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'CustomerRefund',
      loadExisting: async (resourceId) => {
        return tx.customerRefund.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
      },
      run: async () => {
        await tx.$queryRaw`SELECT id FROM customer_advances WHERE id = ${data.advanceId} AND "companyId" = ${companyId} FOR UPDATE`;
        const advance = await tx.customerAdvance.findFirst({ where: { id: data.advanceId, companyId } });
        if (!advance) throw new NotFoundError('Recibo de adiantamento não encontrado.');
        if (advance.cancelledAt) throw new ConflictError('O recibo de adiantamento está cancelado.');

        const remaining = advanceRemaining({
          amount: Number(advance.amount),
          appliedTotal: Number(advance.appliedTotal),
          refundedTotal: Number(advance.refundedTotal),
        });
        if (amount > remaining) {
          throw new ValidationError(`O valor excede o saldo remanescente do adiantamento (${remaining.toFixed(2)} MT).`);
        }

        const treasury = await resolveTreasuryLedgerTx(tx, companyId, data.accountId);
        const advancesAccount = await getMappedAccountTx(tx, companyId, 'CUSTOMER_ADVANCES');

        const number = await nextDocNumber(tx, companyId, 'DEV', issueDate.getUTCFullYear());
        const refund = await tx.customerRefund.create({
          data: {
            companyId,
            number,
            customerId: advance.customerId,
            customerName: advance.customerName,
            customerNuit: advance.customerNuit,
            issueDate,
            amount,
            method: data.method,
            treasuryAccountId: data.accountId,
            origin: 'ADVANCE',
            advanceId: advance.id,
            reason: data.reason,
            notes: data.notes ?? null,
            createdBy: ctx.userId,
          },
        });
        await tx.customerAdvance.update({ where: { id: advance.id }, data: { refundedTotal: { increment: amount } } });

        const { movementId } = await postRefundEffectsTx(tx, ctx, companyId, {
          number,
          customerId: advance.customerId,
          customerName: advance.customerName,
          issueDate,
          amount,
          debitAccountId: advancesAccount.id,
          refundId: refund.id,
          treasury,
          accountId: data.accountId,
        });

        await writeAudit(tx, ctx, {
          action: 'customer_refund.create',
          entity: 'CustomerRefund',
          entityId: refund.id,
          newValues: {
            number,
            origin: 'ADVANCE',
            advanceNumber: advance.number,
            customerId: advance.customerId,
            customer: advance.customerName,
            issueDate: formatAccountingDate(issueDate),
            amount,
            reason: data.reason,
            treasuryAccountId: data.accountId,
            treasuryMovementId: movementId,
            idempotencyKey: data.idempotencyKey,
            accounting: { sourceType: 'CUSTOMER_REFUND', accountingEvent: 'REFUND_ISSUED' },
          },
        });

        return { resourceType: 'CustomerRefund', resourceId: refund.id, result: { id: refund.id, number } };
      },
    });
    return op.result;
  });
}

/**
 * Devolução ao Cliente com origem em NC (saldo credor após nota de crédito) ou em
 * recibo (RECEIPT — pagamento em excesso/ajuste): valida que o saldo credor do
 * cliente cobre o valor, com tecto adicional pelo documento de origem; evento
 * `REFUND_ISSUED` (D Clientes / C Caixa/Banco) + saída de tesouraria.
 * ZERO stock e ZERO reversão de venda — a NC é a única fonte dessas reversões.
 */
export async function createCustomerRefund(db: PrismaClient, ctx: RequestContext, input: CustomerRefundInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'treasury.createMovement');
  const companyId = requireCompany(ctx);
  const parsed = customerRefundInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const issueDate = resolveAllowedIssueDate(data.issueDate);
  const amount = round2(data.amount);
  const requestFingerprint = customerRefundFingerprint(data, issueDate);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'CUSTOMER_REFUND_CREATE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'CustomerRefund',
      loadExisting: async (resourceId) => {
        return tx.customerRefund.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
      },
      run: async () => {
        // FOR UPDATE no cliente: serializa o consumo do saldo credor.
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${data.customerId} AND "companyId" = ${companyId} FOR UPDATE`;
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, companyId } });
        if (!customer) throw new NotFoundError('Cliente não encontrado.');

        // balance < 0 = saldo a favor do cliente (crédito disponível).
        const creditAvailable = round2(-Number(customer.balance));
        if (amount > creditAvailable) {
          throw new ValidationError(`O valor excede o saldo credor do cliente (${Math.max(creditAvailable, 0).toFixed(2)} MT).`);
        }

        let creditNote: { id: string; number: string } | null = null;
        let payment: { id: string; number: string } | null = null;
        if (data.origin === 'CREDIT_NOTE') {
          const nc = await tx.creditNote.findFirst({
            where: { id: data.creditNoteId!, companyId },
            select: { id: true, number: true, customerId: true, status: true, total: true },
          });
          if (!nc) throw new NotFoundError('Nota de crédito não encontrada.');
          if (nc.customerId !== customer.id) throw new ValidationError('A nota de crédito pertence a outro cliente.');
          if (nc.status !== 'ISSUED') throw new ConflictError('A nota de crédito não está emitida.');
          // Tecto por documento: NC total − devoluções já emitidas contra esta NC.
          const prior = await tx.customerRefund.aggregate({
            where: { companyId, creditNoteId: nc.id },
            _sum: { amount: true },
          });
          const alreadyRefunded = round2(Number(prior._sum.amount ?? 0));
          const availableOnNote = round2(Number(nc.total) - alreadyRefunded);
          if (amount > availableOnNote) {
            throw new ValidationError(`O valor excede o crédito disponível da nota ${nc.number} (${Math.max(availableOnNote, 0).toFixed(2)} MT).`);
          }
          creditNote = { id: nc.id, number: nc.number };
        } else {
          const rec = await tx.payment.findFirst({
            where: { id: data.paymentId!, companyId },
            select: { id: true, number: true, customerId: true, status: true, amount: true, method: true },
          });
          if (!rec) throw new NotFoundError('Recibo não encontrado.');
          if (rec.customerId !== customer.id) throw new ValidationError('O recibo pertence a outro cliente.');
          if (rec.status !== 'ACTIVE') throw new ConflictError('O recibo está anulado.');
          if (rec.method === 'ADVANCE') {
            throw new ConflictError('Este recibo liquidou por adiantamento — devolva pelo próprio Recibo de Adiantamento.');
          }
          const prior = await tx.customerRefund.aggregate({
            where: { companyId, paymentId: rec.id },
            _sum: { amount: true },
          });
          const alreadyRefunded = round2(Number(prior._sum.amount ?? 0));
          const availableOnReceipt = round2(Number(rec.amount) - alreadyRefunded);
          if (amount > availableOnReceipt) {
            throw new ValidationError(`O valor excede o valor disponível do recibo ${rec.number} (${Math.max(availableOnReceipt, 0).toFixed(2)} MT).`);
          }
          payment = { id: rec.id, number: rec.number };
        }

        const treasury = await resolveTreasuryLedgerTx(tx, companyId, data.accountId);
        const ar = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_RECEIVABLE');

        const number = await nextDocNumber(tx, companyId, 'DEV', issueDate.getUTCFullYear());
        const refund = await tx.customerRefund.create({
          data: {
            companyId,
            number,
            customerId: customer.id,
            customerName: customer.name,
            customerNuit: customer.nuit,
            issueDate,
            amount,
            method: data.method,
            treasuryAccountId: data.accountId,
            origin: data.origin,
            creditNoteId: creditNote?.id ?? null,
            paymentId: payment?.id ?? null,
            reason: data.reason,
            notes: data.notes ?? null,
            createdBy: ctx.userId,
          },
        });

        // A devolução consome o saldo credor: balance aproxima-se de zero.
        await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: amount } } });

        const { movementId } = await postRefundEffectsTx(tx, ctx, companyId, {
          number,
          customerId: customer.id,
          customerName: customer.name,
          issueDate,
          amount,
          debitAccountId: ar.id,
          refundId: refund.id,
          treasury,
          accountId: data.accountId,
        });

        await writeAudit(tx, ctx, {
          action: 'customer_refund.create',
          entity: 'CustomerRefund',
          entityId: refund.id,
          newValues: {
            number,
            origin: data.origin,
            creditNoteNumber: creditNote?.number ?? null,
            paymentNumber: payment?.number ?? null,
            customerId: customer.id,
            customer: customer.name,
            issueDate: formatAccountingDate(issueDate),
            amount,
            reason: data.reason,
            treasuryAccountId: data.accountId,
            treasuryMovementId: movementId,
            idempotencyKey: data.idempotencyKey,
            accounting: { sourceType: 'CUSTOMER_REFUND', accountingEvent: 'REFUND_ISSUED' },
          },
        });

        return { resourceType: 'CustomerRefund', resourceId: refund.id, result: { id: refund.id, number } };
      },
    });
    return op.result;
  });
}
