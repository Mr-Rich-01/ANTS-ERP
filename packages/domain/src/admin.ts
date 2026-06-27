import type { PrismaClient } from '@ants/database';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';

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
