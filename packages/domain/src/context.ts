/**
 * Contexto de pedido — derivado SEMPRE da sessão autenticada, nunca do cliente.
 * É passado a todos os serviços de domínio para garantir o isolamento multiempresa.
 */
export interface RequestContext {
  /** Empresa activa do utilizador (null = Super Admin da plataforma). */
  companyId: string | null;
  /** Utilizador autenticado. */
  userId: string;
  /** Nome do utilizador (para apresentação, ex.: operador de caixa). */
  userName?: string;
  /** Filial activa (opcional). */
  branchId?: string | null;
  /** Permissões efectivas do utilizador (chaves granulares, ex.: "sales.create"). */
  permissions: ReadonlySet<string>;
  isPlatformAdmin: boolean;
  /** Metadados para auditoria. */
  ipAddress?: string;
  userAgent?: string;
}

/** Garante que o contexto pertence a uma empresa (rejeita acesso sem empresa). */
export function requireCompany(ctx: RequestContext): string {
  if (!ctx.companyId) {
    throw new Error('Operação requer uma empresa activa.');
  }
  return ctx.companyId;
}
