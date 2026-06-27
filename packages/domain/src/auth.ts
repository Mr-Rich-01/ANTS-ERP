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

/**
 * Autentica um utilizador por email + password. Aplica bloqueio por tentativas
 * falhadas e devolve o contexto (empresa, permissões) em caso de sucesso.
 * Nota: em Fase 1 assume-se email único no sistema (findFirst).
 */
export async function authenticate(
  db: PrismaClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  const user = await db.user.findFirst({ where: { email: email.toLowerCase().trim() } });
  if (!user) return { ok: false, reason: 'invalid' };

  if (user.status !== 'ACTIVE') return { ok: false, reason: 'inactive' };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, reason: 'locked' };

  const valid = await verify(user.passwordHash, password).catch(() => false);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return { ok: false, reason: 'invalid' };
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const permissions = user.isPlatformAdmin ? [] : await loadPermissions(db, user.id);

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      companyId: user.companyId,
      isPlatformAdmin: user.isPlatformAdmin,
      mustChangePassword: user.mustChangePassword,
      permissions,
    },
  };
}
