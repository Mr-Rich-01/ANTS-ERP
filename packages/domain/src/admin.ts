import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@ants/database';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';
import { hashPassword } from './auth';

export interface CompanyUser {
  id: string;
  name: string;
  email: string;
  roleNames: string[];
  status: 'ACTIVE' | 'INACTIVE';
  lastLoginAt: Date | null;
  branchNames: string[];
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
}

export interface AuditEntry {
  id: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  createdAt: Date;
}

export interface CompanyIdentity {
  legalName: string;
  tradeName: string | null;
  nuit: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  currencySymbol: string;
  locale: string;
}

export interface CompanyPrintProfile extends CompanyIdentity {
  address: string | null;
  bankAccounts: Array<{ name: string; type: string; reference: string | null }>;
}

/** Lista os utilizadores da empresa activa (com perfis e filiais). */
export async function listCompanyUsers(db: PrismaClient, ctx: RequestContext): Promise<CompanyUser[]> {
  requirePermission(ctx, 'users.manage');
  const companyId = requireCompany(ctx);
  const users = await db.user.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    include: {
      userRoles: { include: { role: { select: { name: true } } } },
      userBranches: { include: { branch: { select: { name: true } } } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    roleNames: u.userRoles.map((ur) => ur.role.name),
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    branchNames: u.userBranches.map((ub) => ub.branch.name),
  }));
}

/** Lista os perfis da empresa com contagem de utilizadores. */
export async function listRoles(db: PrismaClient, ctx: RequestContext): Promise<RoleSummary[]> {
  requirePermission(ctx, 'users.manage');
  const companyId = requireCompany(ctx);
  const roles = await db.role.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { userRoles: true } } },
  });
  return roles.map((r) => ({ id: r.id, name: r.name, description: r.description, userCount: r._count.userRoles }));
}

/** Lista os registos de auditoria recentes da empresa. */
export async function listRecentAudit(db: PrismaClient, ctx: RequestContext, limit = 50): Promise<AuditEntry[]> {
  requirePermission(ctx, 'audit.view');
  const companyId = requireCompany(ctx);
  const logs = await db.auditLog.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  const userIds = [...new Set(logs.map((l) => l.userId).filter((id): id is string => !!id))];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return logs.map((l) => ({
    id: l.id,
    userName: (l.userId && nameById.get(l.userId)) || 'Sistema',
    action: l.action,
    entity: l.entity,
    entityId: l.entityId,
    oldValues: l.oldValues,
    newValues: l.newValues,
    ipAddress: l.ipAddress,
    createdAt: l.createdAt,
  }));
}

/** Identidade da empresa activa. */
export async function getCompanyIdentity(db: PrismaClient, ctx: RequestContext): Promise<CompanyIdentity | null> {
  const companyId = requireCompany(ctx);
  const c = await db.company.findUnique({ where: { id: companyId } });
  if (!c) return null;
  return {
    legalName: c.legalName,
    tradeName: c.tradeName,
    nuit: c.nuit,
    email: c.email,
    phone: c.phone,
    currency: c.currency,
    currencySymbol: c.currencySymbol,
    locale: c.locale,
  };
}

/** Dados públicos da empresa para documentos imprimíveis, sem saldos nem segredos. */
export async function getCompanyPrintProfile(db: PrismaClient, ctx: RequestContext): Promise<CompanyPrintProfile | null> {
  const companyId = requireCompany(ctx);
  const c = await getCompanyIdentity(db, ctx);
  if (!c) return null;
  const [branch, bankAccounts] = await Promise.all([
    ctx.branchId
      ? db.branch.findFirst({ where: { companyId, id: ctx.branchId }, select: { address: true } })
      : db.branch.findFirst({ where: { companyId, status: 'ACTIVE' }, orderBy: { code: 'asc' }, select: { address: true } }),
    db.treasuryAccount.findMany({
      where: { companyId, status: 'ACTIVE', type: { in: ['BANK', 'MOBILE'] }, reference: { not: null } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      select: { name: true, type: true, reference: true },
      take: 4,
    }),
  ]);
  return {
    ...c,
    address: branch?.address ?? null,
    bankAccounts,
  };
}

export interface PermissionItem {
  key: string;
  module: string;
  description: string | null;
}

/** Catálogo global de permissões (para o formulário de perfis). */
export async function listPermissions(db: PrismaClient): Promise<PermissionItem[]> {
  const perms = await db.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] });
  return perms.map((p) => ({ key: p.key, module: p.module, description: p.description }));
}

// ─────────────────────────── Mutações ───────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateTemporaryPassword(): string {
  const bytes = randomBytes(18);
  let password = '';
  for (const byte of bytes) {
    password += TEMP_PASSWORD_ALPHABET.charAt(byte % TEMP_PASSWORD_ALPHABET.length);
  }
  return `${password.slice(0, 6)}-${password.slice(6, 12)}-${password.slice(12, 18)}`;
}

/** Cria/convida um utilizador na empresa activa, com perfil e password temporária. */
export async function createCompanyUser(
  db: PrismaClient,
  ctx: RequestContext,
  input: { name: string; email: string; roleId?: string },
): Promise<{ id: string; tempPassword: string }> {
  requirePermission(ctx, 'users.manage');
  requireCompany(ctx);

  const name = input.name.trim();
  const email = input.email.toLowerCase().trim();
  if (!name) throw new ValidationError('O nome é obrigatório.');
  if (!EMAIL_RE.test(email)) throw new ValidationError('Email inválido.');

  // `db` é um cliente isolado por empresa — esta procura só vê a empresa activa.
  const existing = await db.user.findFirst({ where: { email } });
  if (existing) throw new ConflictError('Já existe um utilizador com este email.');

  if (input.roleId) {
    const role = await db.role.findFirst({ where: { id: input.roleId } });
    if (!role) throw new ValidationError('Perfil inválido.');
  }

  const tempPassword = generateTemporaryPassword();
  const user = await db.user.create({
    data: { name, email, passwordHash: await hashPassword(tempPassword), mustChangePassword: true, status: 'ACTIVE' },
  });
  if (input.roleId) {
    await db.userRole.create({ data: { userId: user.id, roleId: input.roleId } });
  }
  await writeAudit(db, ctx, { action: 'user.create', entity: 'User', entityId: user.id, newValues: { name, email } });
  return { id: user.id, tempPassword };
}

/** Activa/desactiva um utilizador da empresa. */
export async function setUserStatus(
  db: PrismaClient,
  ctx: RequestContext,
  userId: string,
  status: 'ACTIVE' | 'INACTIVE',
): Promise<void> {
  requirePermission(ctx, 'users.manage');
  requireCompany(ctx);
  if (userId === ctx.userId) throw new ValidationError('Não pode alterar o seu próprio estado.');

  const user = await db.user.findFirst({ where: { id: userId } });
  if (!user) throw new NotFoundError('Utilizador não encontrado.');

  await db.user.update({ where: { id: userId }, data: { status } });
  await writeAudit(db, ctx, {
    action: 'user.status',
    entity: 'User',
    entityId: userId,
    oldValues: { status: user.status },
    newValues: { status },
  });
}

/** Cria um perfil (role) na empresa, com as permissões indicadas. */
export async function createRole(
  db: PrismaClient,
  ctx: RequestContext,
  input: { name: string; description?: string; permissionKeys: string[] },
): Promise<{ id: string }> {
  requirePermission(ctx, 'users.manage');
  requireCompany(ctx);

  const name = input.name.trim();
  if (!name) throw new ValidationError('O nome do perfil é obrigatório.');

  const dup = await db.role.findFirst({ where: { name } });
  if (dup) throw new ConflictError('Já existe um perfil com este nome.');

  const role = await db.role.create({ data: { name, description: input.description?.trim() || null } });
  const perms = await db.permission.findMany({ where: { key: { in: input.permissionKeys } }, select: { id: true } });
  if (perms.length) {
    await db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
  }
  await writeAudit(db, ctx, { action: 'role.create', entity: 'Role', entityId: role.id, newValues: { name, permissions: input.permissionKeys } });
  return { id: role.id };
}
