import { redirect } from 'next/navigation';
import type { RequestContext } from '@ants/domain';
import { auth } from '@/auth';

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  companyId: string | null;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  permissions: string[];
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
  return {
    companyId: user.companyId,
    userId: user.id,
    permissions: new Set(user.permissions),
    isPlatformAdmin: user.isPlatformAdmin,
  };
}
