import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

declare global {
  var __antsPrisma: PrismaClient | undefined;
}

/**
 * Cliente Prisma singleton.
 * Em desenvolvimento reutiliza a instância para evitar esgotar ligações
 * com o hot-reload.
 */
export const prisma: PrismaClient =
  global.__antsPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__antsPrisma = prisma;
}
