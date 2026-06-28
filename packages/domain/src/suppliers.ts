import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';

export type SupplierType = 'INDIVIDUAL' | 'COMPANY';
/** Estado de conta do fornecedor derivado do saldo. */
export type PayableState = 'pagar' | 'adiantamento' | 'regular';

export interface SupplierListItem {
  id: string;
  name: string;
  type: SupplierType;
  nuit: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  creditLimit: number;
  balance: number;
  status: 'ACTIVE' | 'INACTIVE';
  payableState: PayableState;
}

export interface SupplierDetail extends SupplierListItem {
  address: string | null;
  province: string | null;
  district: string | null;
  paymentTermDays: number;
  notes: string | null;
  createdAt: Date;
}

export interface SupplierKpis {
  /** Total de fornecedores (qualquer estado). */
  total: number;
  /** Soma dos saldos a pagar (> 0) — contas a pagar. */
  payable: number;
  /** Número de fornecedores com saldo a pagar (> 0). */
  withPayable: number;
  /** Fornecedores criados no mês corrente. */
  newThisMonth: number;
}

/** Estado de conta a partir do saldo: > 0 a pagar · < 0 adiantamento · 0 regular. */
export function payableStateOf(balance: number): PayableState {
  if (balance > 0) return 'pagar';
  if (balance < 0) return 'adiantamento';
  return 'regular';
}

function toListItem(s: {
  id: string;
  name: string;
  type: SupplierType;
  nuit: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  creditLimit: unknown;
  balance: unknown;
  status: 'ACTIVE' | 'INACTIVE';
}): SupplierListItem {
  const balance = Number(s.balance);
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    nuit: s.nuit,
    phone: s.phone,
    email: s.email,
    category: s.category,
    creditLimit: Number(s.creditLimit),
    balance,
    status: s.status,
    payableState: payableStateOf(balance),
  };
}

// ─────────────────────────── Leituras ───────────────────────────

/** Lista os fornecedores da empresa activa, ordenados por nome. */
export async function listSuppliers(db: PrismaClient, ctx: RequestContext): Promise<SupplierListItem[]> {
  requirePermission(ctx, 'suppliers.view');
  requireCompany(ctx);
  const rows = await db.supplier.findMany({ orderBy: { name: 'asc' } });
  return rows.map(toListItem);
}

/** Detalhe de um fornecedor da empresa activa. */
export async function getSupplier(db: PrismaClient, ctx: RequestContext, id: string): Promise<SupplierDetail> {
  requirePermission(ctx, 'suppliers.view');
  requireCompany(ctx);
  // `db` é isolado por empresa — só encontra fornecedores da empresa activa.
  const s = await db.supplier.findFirst({ where: { id } });
  if (!s) throw new NotFoundError('Fornecedor não encontrado.');
  return {
    ...toListItem(s),
    address: s.address,
    province: s.province,
    district: s.district,
    paymentTermDays: s.paymentTermDays,
    notes: s.notes,
    createdAt: s.createdAt,
  };
}

/** Indicadores de topo do módulo de fornecedores. */
export async function supplierKpis(db: PrismaClient, ctx: RequestContext): Promise<SupplierKpis> {
  requirePermission(ctx, 'suppliers.view');
  requireCompany(ctx);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, withPayable, creditors, newThisMonth] = await Promise.all([
    db.supplier.count(),
    db.supplier.count({ where: { balance: { gt: 0 } } }),
    db.supplier.findMany({ where: { balance: { gt: 0 } }, select: { balance: true } }),
    db.supplier.count({ where: { createdAt: { gte: startOfMonth } } }),
  ]);

  const payable = creditors.reduce((sum, c) => sum + Number(c.balance), 0);
  return { total, payable, withPayable, newThisMonth };
}

// ─────────────────────────── Mutações ───────────────────────────

const NUIT_RE = /^\d{9}$/;

function emptyToNull(schema: z.ZodString) {
  return schema
    .transform((s) => (s === '' ? null : s))
    .nullish();
}

const supplierInput = z.object({
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
  category: emptyToNull(z.string().trim().max(80)),
  creditLimit: z.coerce.number().min(0, 'O limite de crédito não pode ser negativo.').default(0),
  paymentTermDays: z.coerce.number().int().min(0).max(365).default(0),
  notes: emptyToNull(z.string().trim().max(1000)),
});

export type SupplierInput = z.input<typeof supplierInput>;

function parseInput(input: SupplierInput) {
  const parsed = supplierInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return parsed.data;
}

/** Cria um fornecedor na empresa activa. NUIT único por empresa. */
export async function createSupplier(
  db: PrismaClient,
  ctx: RequestContext,
  input: SupplierInput,
): Promise<{ id: string }> {
  requirePermission(ctx, 'suppliers.create');
  requireCompany(ctx);
  const data = parseInput(input);

  if (data.nuit) {
    const dup = await db.supplier.findFirst({ where: { nuit: data.nuit } });
    if (dup) throw new ConflictError('Já existe um fornecedor com este NUIT.');
  }

  // `db` injecta o companyId automaticamente em runtime (Supplier ∈ COMPANY_SCOPED)
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
    category: data.category ?? null,
    creditLimit: data.creditLimit,
    paymentTermDays: data.paymentTermDays,
    notes: data.notes ?? null,
    createdBy: ctx.userId,
  } satisfies Omit<Prisma.SupplierUncheckedCreateInput, 'companyId'>;
  const created = await db.supplier.create({ data: data2 as Prisma.SupplierUncheckedCreateInput });
  return { id: created.id };
}

/** Actualiza um fornecedor da empresa activa. NUIT único por empresa (excluindo o próprio). */
export async function updateSupplier(
  db: PrismaClient,
  ctx: RequestContext,
  id: string,
  input: SupplierInput,
): Promise<void> {
  requirePermission(ctx, 'suppliers.update');
  requireCompany(ctx);
  const data = parseInput(input);

  const existing = await db.supplier.findFirst({ where: { id } });
  if (!existing) throw new NotFoundError('Fornecedor não encontrado.');

  if (data.nuit) {
    const dup = await db.supplier.findFirst({ where: { nuit: data.nuit, id: { not: id } } });
    if (dup) throw new ConflictError('Já existe um fornecedor com este NUIT.');
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
    category: data.category ?? null,
    creditLimit: data.creditLimit,
    paymentTermDays: data.paymentTermDays,
    notes: data.notes ?? null,
    updatedBy: ctx.userId,
  } satisfies Prisma.SupplierUncheckedUpdateInput;
  await db.supplier.update({ where: { id }, data: data2 });
}
