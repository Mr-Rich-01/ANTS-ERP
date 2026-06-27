import type { DefaultSession } from 'next-auth';

// Aumenta os tipos do Auth.js com o contexto multiempresa do ANTS ERP.
declare module 'next-auth' {
  interface User {
    companyId: string | null;
    isPlatformAdmin: boolean;
    mustChangePassword: boolean;
    permissions: string[];
  }
  interface Session {
    user: {
      id: string;
      companyId: string | null;
      isPlatformAdmin: boolean;
      mustChangePassword: boolean;
      permissions: string[];
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    companyId?: string | null;
    isPlatformAdmin?: boolean;
    mustChangePassword?: boolean;
    permissions?: string[];
  }
}
