import type { PrismaClient } from '@ants/database';
import type { RequestContext } from './context';

export interface AuditInput {
  action: string; // ex.: "invoice.issue"
  entity: string; // ex.: "Invoice"
  entityId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  reason?: string;
  result?: 'success' | 'failure';
}

/**
 * Regista uma entrada de auditoria imutável. Nunca guardar passwords/tokens.
 * Aceita um cliente Prisma (ou transacção) para participar na mesma transacção da operação.
 */
export async function writeAudit(
  db: Pick<PrismaClient, 'auditLog'>,
  ctx: RequestContext,
  input: AuditInput,
): Promise<void> {
  await db.auditLog.create({
    data: {
      companyId: ctx.companyId,
      branchId: ctx.branchId ?? null,
      userId: ctx.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      oldValues: input.oldValues as never,
      newValues: input.newValues as never,
      reason: input.reason ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      result: input.result ?? 'success',
    },
  });
}
