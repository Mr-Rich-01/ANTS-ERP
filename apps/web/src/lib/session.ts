import { redirect } from 'next/navigation';
import { validateSessionCompany, type RequestContext } from '@ants/domain';
import { prisma } from '@ants/database';
import { auth } from '@/auth';

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  companyId: string | null;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  permissions: string[];
  availableCompanyIds: string[];
}

/** Devolve o utilizador da sessão, ou null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user as SessionUser;
}

/** Exige sessão autenticada; redirecciona para /login caso contrário. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

/** Constrói o RequestContext (passado aos serviços de domínio). */
export async function getContext(): Promise<RequestContext> {
  const user = await requireSession();
  const activeUser = user.companyId ? await validateSessionCompany(prisma, user.id, user.companyId) : null;
  return {
    companyId: activeUser?.companyId ?? null,
    userId: activeUser?.id ?? user.id,
    userName: activeUser?.name ?? user.name ?? undefined,
    permissions: new Set(activeUser?.permissions ?? []),
    isPlatformAdmin: activeUser?.isPlatformAdmin ?? user.isPlatformAdmin,
  };
}

export async function hasValidActiveCompany(user: SessionUser): Promise<boolean> {
  if (!user.companyId) return false;
  return Boolean(await validateSessionCompany(prisma, user.id, user.companyId));
}
