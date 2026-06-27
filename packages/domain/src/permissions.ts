import { ForbiddenError } from './errors';
import type { RequestContext } from './context';

/**
 * Garante que o utilizador tem a permissão indicada (validação no servidor —
 * o frontend nunca é a fonte de verdade). Super Admin da plataforma passa sempre.
 */
export function requirePermission(ctx: RequestContext, key: string): void {
  if (ctx.isPlatformAdmin) return;
  if (!ctx.permissions.has(key)) {
    throw new ForbiddenError(`Sem permissão: ${key}`);
  }
}

export function hasPermission(ctx: RequestContext, key: string): boolean {
  return ctx.isPlatformAdmin || ctx.permissions.has(key);
}
