import { PrismaClient } from '@prisma/client';
import { prisma } from './client';
import { scopeArgs, type AnyArgs } from './tenant-scope';

/**
 * Cliente Prisma vinculado a uma empresa: filtra/atribui `companyId` automaticamente
 * em todas as queries dos modelos empresariais (2.ª barreira de isolamento).
 */
export function forCompany(companyId: string): PrismaClient {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args as AnyArgs, companyId) as typeof args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

export interface AuditableContext {
  companyId: string | null;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

const AUDITED_OPS = new Set<string>(['create', 'update', 'delete', 'upsert', 'updateMany', 'deleteMany']);
// Modelos que NÃO geram auditoria automática (evita ruído e recursão).
// StockLevel/StockMovement: o próprio movimento é o trilho imutável; a acção
// (ex.: ajuste de inventário) regista uma auditoria explícita e semântica.
const AUDIT_EXCLUDED = new Set<string>(['AuditLog', 'Session', 'StockLevel', 'StockMovement']);

/**
 * Cliente Prisma vinculado ao contexto: isolamento por empresa + auditoria automática
 * (best-effort, pós-operação) das mutações em modelos de negócio. Para precisão
 * transaccional, usar `writeAudit` explicitamente dentro da transacção.
 */
export function forContext(ctx: AuditableContext): PrismaClient {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scoped = ctx.companyId ? scopeArgs(model, operation, args as AnyArgs, ctx.companyId) : (args as AnyArgs);
          const result = await query(scoped as typeof args);

          if (AUDITED_OPS.has(operation) && !AUDIT_EXCLUDED.has(model)) {
            const entityId =
              result && typeof result === 'object' && 'id' in (result as Record<string, unknown>)
                ? String((result as { id: unknown }).id)
                : undefined;
            void prisma.auditLog
              .create({
                data: {
                  companyId: ctx.companyId,
                  userId: ctx.userId,
                  action: `${model.toLowerCase()}.${operation}`,
                  entity: model,
                  entityId: entityId ?? null,
                  newValues: (scoped?.data as never) ?? undefined,
                  ipAddress: ctx.ipAddress ?? null,
                  userAgent: ctx.userAgent ?? null,
                  result: 'success',
                },
              })
              .catch(() => undefined);
          }

          return result;
        },
      },
    },
  }) as unknown as PrismaClient;
}
