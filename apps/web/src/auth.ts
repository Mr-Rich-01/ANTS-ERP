import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@ants/database';
import { authenticate, selectActiveCompanyForEmail } from '@ants/domain';

export const { handlers, signIn, signOut, auth, unstable_update: updateSession } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 }, // 8 horas
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds) => {
        if (!creds?.email || !creds?.password) return null;
        const res = await authenticate(prisma, String(creds.email), String(creds.password));
        if (!res.ok) return null;
        const u = res.user;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          companyId: u.companyId,
          isPlatformAdmin: u.isPlatformAdmin,
          mustChangePassword: u.mustChangePassword,
          permissions: u.permissions,
          availableCompanyIds: u.availableCompanyIds,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.companyId = user.companyId ?? null;
        token.isPlatformAdmin = user.isPlatformAdmin;
        token.mustChangePassword = user.mustChangePassword;
        token.permissions = user.permissions;
        token.availableCompanyIds = user.availableCompanyIds;
      }
      if (trigger === 'update' && session?.user?.companyId && token.email) {
        const requestedCompanyId = String(session.user.companyId);
        const allowedCompanyIds = Array.isArray(token.availableCompanyIds) ? token.availableCompanyIds.map(String) : [];
        const selected = allowedCompanyIds.includes(requestedCompanyId)
          ? await selectActiveCompanyForEmail(prisma, String(token.email), requestedCompanyId)
          : null;
        if (selected) {
          token.sub = selected.id;
          token.name = selected.name;
          token.email = selected.email;
          token.companyId = selected.companyId;
          token.isPlatformAdmin = selected.isPlatformAdmin;
          token.mustChangePassword = selected.mustChangePassword;
          token.permissions = selected.permissions;
        }
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? '';
      session.user.companyId = (token.companyId as string | null | undefined) ?? null;
      session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      session.user.permissions = (token.permissions as string[] | undefined) ?? [];
      session.user.availableCompanyIds = (token.availableCompanyIds as string[] | undefined) ?? [];
      return session;
    },
  },
});
