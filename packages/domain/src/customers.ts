import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';

export type CustomerType = 'INDIVIDUAL' | 'COMPANY';
/** Estado de conta derivado do saldo. */
export type AccountState = 'devedor' | 'credor' | 'regular';

export interface CustomerListItem {
  id: string;
  name: string;
  type: CustomerType;
  nuit: string | null;
  phone: string | null;
  email: string | null;
  segment: string | null;
  creditLimit: number;
  balance: number;
  status: 'ACTIVE' | 'INACTIVE';
  accountState: AccountState;
}

export interface CustomerDetail extends CustomerListItem {
  address: string | null;
  province: string | null;
  district: string | null;
  paymentTermDays: number;
  notes: string | null;
  createdAt: Date;
}

export interface CustomerKpis {
  /** Total de clientes (qualquer estado). */
  total: number;
  /** Soma dos saldos devedores (> 0) — contas a receber. */
  receivable: number;
  /** Número de clientes com dívida (saldo > 0). */
  withDebt: number;
  /** Clientes criados no mês corrente. */
  newThisMonth: number;
}

/** Estado de conta a partir do saldo: > 0 deve · < 0 saldo a favor · 0 regular. */
export function accountStateOf(balance: number): AccountState {
  if (balance > 0) return 'devedor';
  if (balance < 0) return 'credor';
  return 'regular';
}

function toListItem(c: {
  id: string;
  name: string;
  type: CustomerType;
  nuit: string | null;
  phone: string | null;
  email: string | null;
  segment: string | null;
  creditLimit: unknown;
  balance: unknown;
  status: 'ACTIVE' | 'INACTIVE';
}): CustomerListItem {
  const balance = Number(c.balance);
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    nuit: c.nuit,
    phone: c.phone,
    email: c.email,
    segment: c.segment,
    creditLimit: Number(c.creditLimit),
    balance,
    status: c.status,
    accountState: accountStateOf(balance),
  };
}

// ─────────────────────────── Leituras ───────────────────────────

/** Lista os clientes da empresa activa, ordenados por nome. */
export async function listCustomers(db: PrismaClient, ctx: RequestContext): Promise<CustomerListItem[]> {
  requirePermission(ctx, 'clients.view');
  requireCompany(ctx);
  const rows = await db.customer.findMany({ orderBy: { name: 'asc' } });
  return rows.map(toListItem);
}

/** Detalhe de um cliente da empresa activa. */
export async function getCustomer(db: PrismaClient, ctx: RequestContext, id: string): Promise<CustomerDetail> {
  requirePermission(ctx, 'clients.view');
  requireCompany(ctx);
  // `db` é isolado por empresa — só encontra clientes da empresa activa.
  const c = await db.customer.findFirst({ where: { id } });
  if (!c) throw new NotFoundError('Cliente não encontrado.');
  return {
    ...toListItem(c),
    address: c.address,
    province: c.province,
    district: c.district,
    paymentTermDays: c.paymentTermDays,
    notes: c.notes,
    createdAt: c.createdAt,
  };
}

/** Indicadores de topo do módulo de clientes. */
export async function customerKpis(db: PrismaClient, ctx: RequestContext): Promise<CustomerKpis> {
  requirePermission(ctx, 'clients.view');
  requireCompany(ctx);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, withDebt, debtors, newThisMonth] = await Promise.all([
    db.customer.count(),
    db.customer.count({ where: { balance: { gt: 0 } } }),
    db.customer.findMany({ where: { balance: { gt: 0 } }, select: { balance: true } }),
    db.customer.count({ where: { createdAt: { gte: startOfMonth } } }),
  ]);

  const receivable = debtors.reduce((sum, d) => sum + Number(d.balance), 0);
  return { total, receivable, withDebt, newThisMonth };
}

// ─────────────────────────── Mutações ───────────────────────────

const NUIT_RE = /^\d{9}$/;

const customerInput = z.object({
  name: z.string().trim().min(1, 'O nome é obrigatório.').max(160),
  type: z.enum(['INDIVIDUAL', 'COMPANY']).default('COMPANY'),
  nuit: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, ''))
    .refine((s) => s === '' || NUIT_RE.test(s), 'NUIT inválido (9 dígitos).')
    .transform((s) => (s === '' ? null : s))
    .nullish(),
  email: z
    .string()
    .trim()
    .transform((s) => (s === '' ? null : s))
    .refine((s) => s === null || z.string().email().safeParse(s).success, 'Email inválido.')
    .nullish(),
  phone: emptyToNull(z.string().trim().max(40)),
  address: emptyToNull(z.string().trim().max(240)),
  province: emptyToNull(z.string().trim().max(80)),
  district: emptyToNull(z.string().trim().max(80)),
  segment: emptyToNull(z.string().trim().max(80)),
  creditLimit: z.coerce.number().min(0, 'O limite de crédito não pode ser negativo.').default(0),
  paymentTermDays: z.coerce.number().int().min(0).max(365).default(0),
  notes: emptyToNull(z.string().trim().max(1000)),
});

export type CustomerInput = z.input<typeof customerInput>;

function emptyToNull(schema: z.ZodString) {
  return schema
    .transform((s) => (s === '' ? null : s))
    .nullish();
}

function parseInput(input: CustomerInput) {
  const parsed = customerInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return parsed.data;
}

/** Cria um cliente na empresa activa. NUIT único por empresa. */
export async function createCustomer(
  db: PrismaClient,
  ctx: RequestContext,
  input: CustomerInput,
): Promise<{ id: string }> {
  requirePermission(ctx, 'clients.create');
  requireCompany(ctx);
  const data = parseInput(input);

  if (data.nuit) {
    const dup = await db.customer.findFirst({ where: { nuit: data.nuit } });
    if (dup) throw new ConflictError('Já existe um cliente com este NUIT.');
  }

  // `db` injecta o companyId automaticamente em runtime (Customer ∈ COMPANY_SCOPED)
  // e audita via forContext. Ao nível de tipos, companyId é preenchido pelo cast.
  const data2 = {
    name: data.name,
    type: data.type,
    nuit: data.nuit ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    address: data.address ?? null,
    province: data.province ?? null,
    district: data.district ?? null,
    segment: data.segment ?? null,
    creditLimit: data.creditLimit,
    paymentTermDays: data.paymentTermDays,
    notes: data.notes ?? null,
    createdBy: ctx.userId,
  } satisfies Omit<Prisma.CustomerUncheckedCreateInput, 'companyId'>;
  const created = await db.customer.create({ data: data2 as Prisma.CustomerUncheckedCreateInput });
  return { id: created.id };
}

/** Actualiza um cliente da empresa activa. NUIT único por empresa (excluindo o próprio). */
export async function updateCustomer(
  db: PrismaClient,
  ctx: RequestContext,
  id: string,
  input: CustomerInput,
): Promise<void> {
  requirePermission(ctx, 'clients.update');
  requireCompany(ctx);
  const data = parseInput(input);

  const existing = await db.customer.findFirst({ where: { id } });
  if (!existing) throw new NotFoundError('Cliente não encontrado.');

  if (data.nuit) {
    const dup = await db.customer.findFirst({ where: { nuit: data.nuit, id: { not: id } } });
    if (dup) throw new ConflictError('Já existe um cliente com este NUIT.');
  }

  const data2 = {
    name: data.name,
    type: data.type,
    nuit: data.nuit ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    address: data.address ?? null,
    province: data.province ?? null,
    district: data.district ?? null,
    segment: data.segment ?? null,
    creditLimit: data.creditLimit,
    paymentTermDays: data.paymentTermDays,
    notes: data.notes ?? null,
    updatedBy: ctx.userId,
  } satisfies Prisma.CustomerUncheckedUpdateInput;
  await db.customer.update({ where: { id }, data: data2 });
}
