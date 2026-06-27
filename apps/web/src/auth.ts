import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@ants/database';
import { authenticate } from '@ants/domain';

export const { handlers, signIn, signOut, auth } = NextAuth({
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
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.companyId = user.companyId ?? null;
        token.isPlatformAdmin = user.isPlatformAdmin;
        token.mustChangePassword = user.mustChangePassword;
        token.permissions = user.permissions;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? '';
      session.user.companyId = (token.companyId as string | null | undefined) ?? null;
      session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      session.user.permissions = (token.permissions as string[] | undefined) ?? [];
      return session;
    },
  },
});
