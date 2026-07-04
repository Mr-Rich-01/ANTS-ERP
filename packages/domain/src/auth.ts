import { hash, verify } from '@node-rs/argon2';
import type { PrismaClient } from '@ants/database';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  companyId: string | null;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  permissions: string[];
  availableCompanyIds: string[];
}

export interface CompanyMembership {
  userId: string;
  companyId: string;
  legalName: string;
  tradeName: string | null;
  userName: string;
  email: string;
}

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; reason: 'invalid' | 'locked' | 'inactive' };

/** Hash de password (Argon2). Reexportado para o fluxo de troca/registo. */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Carrega as chaves de permissão efectivas de um utilizador (via perfis). */
export async function loadPermissions(db: PrismaClient, userId: string): Promise<string[]> {
  const rows = await db.rolePermission.findMany({
    where: { role: { userRoles: { some: { userId } } } },
    select: { permission: { select: { key: true } } },
  });
  return [...new Set(rows.map((r) => r.permission.key))];
}

export async function listActiveCompanyMemberships(db: PrismaClient, email: string): Promise<CompanyMembership[]> {
  const rows = await db.user.findMany({
    where: {
      email: email.toLowerCase().trim(),
      status: 'ACTIVE',
      companyId: { not: null },
      company: { status: 'ACTIVE' },
    },
    orderBy: [{ company: { legalName: 'asc' } }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      companyId: true,
      company: { select: { legalName: true, tradeName: true } },
    },
  });

  return rows
    .filter((u): u is typeof u & { companyId: string; company: NonNullable<typeof u.company> } => Boolean(u.companyId && u.company))
    .map((u) => ({
      userId: u.id,
      companyId: u.companyId,
      legalName: u.company.legalName,
      tradeName: u.company.tradeName,
      userName: u.name,
      email: u.email,
    }));
}

export async function selectActiveCompanyForEmail(
  db: PrismaClient,
  email: string,
  companyId: string,
): Promise<AuthenticatedUser | null> {
  const user = await db.user.findFirst({
    where: {
      email: email.toLowerCase().trim(),
      companyId,
      status: 'ACTIVE',
      company: { status: 'ACTIVE' },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    companyId: user.companyId,
    isPlatformAdmin: user.isPlatformAdmin,
    mustChangePassword: user.mustChangePassword,
    permissions: user.isPlatformAdmin ? [] : await loadPermissions(db, user.id),
    availableCompanyIds: user.companyId ? [user.companyId] : [],
  };
}

export async function validateSessionCompany(
  db: PrismaClient,
  userId: string,
  companyId: string,
): Promise<AuthenticatedUser | null> {
  const user = await db.user.findFirst({
    where: {
      id: userId,
      companyId,
      status: 'ACTIVE',
      company: { status: 'ACTIVE' },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    companyId: user.companyId,
    isPlatformAdmin: user.isPlatformAdmin,
    mustChangePassword: user.mustChangePassword,
    permissions: user.isPlatformAdmin ? [] : await loadPermissions(db, user.id),
    availableCompanyIds: user.companyId ? [user.companyId] : [],
  };
}

/**
 * Autentica um utilizador por email + password. Aplica bloqueio por tentativas
 * falhadas e devolve o contexto (empresa, permissões) em caso de sucesso.
 * Se o email existir em mais de uma empresa activa, não escolhe uma empresa:
 * devolve uma sessão autenticada sem companyId para forçar selecção explícita.
 */
export async function authenticate(
  db: PrismaClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const users = await db.user.findMany({
    where: { email: normalizedEmail },
    include: { company: { select: { status: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!users.length) return { ok: false, reason: 'invalid' };

  const activeUsers = users.filter((u) => u.status === 'ACTIVE');
  if (!activeUsers.length) return { ok: false, reason: 'inactive' };

  const now = new Date();
  const unlockedUsers = activeUsers.filter((u) => !u.lockedUntil || u.lockedUntil <= now);
  if (!unlockedUsers.length) return { ok: false, reason: 'locked' };

  const matched = [];
  for (const user of unlockedUsers) {
    if (await verify(user.passwordHash, password).catch(() => false)) {
      matched.push(user);
    }
  }

  if (!matched.length) {
    await Promise.all(
      unlockedUsers.map((user) => {
        const failed = user.failedLoginCount + 1;
        return db.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: failed,
            lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          },
        });
      }),
    );
    return { ok: false, reason: 'invalid' };
  }

  await db.user.updateMany({
    where: { id: { in: matched.map((u) => u.id) } },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const activeCompanyUsers = matched.filter((u) => u.companyId && u.company?.status === 'ACTIVE');
  const selected = activeCompanyUsers.length === 1 ? activeCompanyUsers[0] : null;
  const user = selected ?? matched[0];
  if (!user) return { ok: false, reason: 'invalid' };
  const permissions = selected && !selected.isPlatformAdmin ? await loadPermissions(db, selected.id) : [];
  const availableCompanyIds = activeCompanyUsers.map((u) => u.companyId).filter((id): id is string => Boolean(id));

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      companyId: selected?.companyId ?? null,
      isPlatformAdmin: user.isPlatformAdmin,
      mustChangePassword: user.mustChangePassword,
      permissions,
      availableCompanyIds,
    },
  };
}
