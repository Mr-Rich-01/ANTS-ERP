/**
 * Idempotência OPERACIONAL (Fase 8c.2a) — impede a criação duplicada de um documento
 * (ex.: duplo clique em "Emitir factura"). Complementa a idempotência CONTABILÍSTICA
 * (por sourceType/sourceId/accountingEvent).
 *
 * Módulo INTERNO (não exportado pelo barrel). A chave chega do cliente (estável por
 * tentativa); o fingerprint é calculado no servidor a partir do payload canonicalizado.
 */
import { createHash } from 'node:crypto';
import type { Prisma } from '@ants/database';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { ConflictError, ValidationError } from './errors';
import { writeAudit } from './audit';

export type OperationScope =
  | 'INVOICE_CREATE'
  | 'CUSTOMER_PAYMENT_CREATE'
  | 'PURCHASE_RECEIPT_CREATE'
  | 'SUPPLIER_PAYMENT_CREATE'
  | 'INVOICE_CANCEL'
  | 'CUSTOMER_PAYMENT_REVERSE'
  | 'SUPPLIER_PAYMENT_REVERSE'
  | 'PURCHASE_RECEIPT_REVERSE'
  | 'TREASURY_TRANSFER_REVERSE'
  | 'MANUAL_TREASURY_REVERSE'
  | 'QUOTATION_CREATE'
  | 'CREDIT_NOTE_CREATE'
  | 'DEBIT_NOTE_CREATE'
  | 'INVOICE_DRAFT_CREATE'
  | 'INVOICE_DRAFT_ISSUE';

export const OPERATION_IDEMPOTENCY_SCOPES: readonly OperationScope[] = [
  'INVOICE_CREATE',
  'CUSTOMER_PAYMENT_CREATE',
  'PURCHASE_RECEIPT_CREATE',
  'SUPPLIER_PAYMENT_CREATE',
  'INVOICE_CANCEL',
  'CUSTOMER_PAYMENT_REVERSE',
  'SUPPLIER_PAYMENT_REVERSE',
  'PURCHASE_RECEIPT_REVERSE',
  'TREASURY_TRANSFER_REVERSE',
  'MANUAL_TREASURY_REVERSE',
  'QUOTATION_CREATE',
  'CREDIT_NOTE_CREATE',
  'DEBIT_NOTE_CREATE',
  'INVOICE_DRAFT_CREATE',
  'INVOICE_DRAFT_ISSUE',
];

const SCOPES: ReadonlySet<string> = new Set<OperationScope>(OPERATION_IDEMPOTENCY_SCOPES);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Versão actual do algoritmo de canonicalização. Estável a partir da Fase 8c.2a. */
export const FINGERPRINT_VERSION = 'v1' as const;

// ─────────────────────────── Normalizadores (para os construtores de payload) ───────────────────────────

/** Decimal em formato fixo determinístico (2 casas). */
export function fpAmount(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}
/** Inteiro determinístico. */
export function fpInt(n: number): string {
  return String(Math.trunc(n));
}
/** Data como "YYYY-MM-DD" (UTC) ou null. Aceita Date | string | null | undefined. */
export function fpDate(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (typeof d === 'string') return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────── Canonicalização + fingerprint ───────────────────────────

/**
 * Canonicaliza um valor: objectos com chaves ordenadas (sem `undefined`); arrays tratados
 * como MULTISET (ordenados pela representação canónica de cada elemento) — assim a ordem
 * das linhas não altera o fingerprint, mas conteúdo economicamente diferente altera.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((v) => canonicalize(v))
      .map((v) => JSON.stringify(v))
      .sort()
      .map((s) => JSON.parse(s) as unknown);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const cv = canonicalize((value as Record<string, unknown>)[k]);
      if (cv !== undefined) out[k] = cv;
    }
    return out;
  }
  return value;
}

/** Fingerprint versionado do payload: "v1:<sha256>". */
export function canonicalRequestFingerprint(version: typeof FINGERPRINT_VERSION, payload: unknown): string {
  const canonical = JSON.stringify(canonicalize(payload));
  const hash = createHash('sha256').update(canonical).digest('hex');
  return `${version}:${hash}`;
}

// ─────────────────────────── Helper transaccional ───────────────────────────

export interface IdempotentOperationOptions<T> {
  scope: OperationScope;
  idempotencyKey: string;
  requestFingerprint: string;
  /** Relê o recurso (com scoping de empresa) para o replay; devolve null se não existir. */
  loadExisting: (resourceId: string) => Promise<T | null>;
  /** Tipo de recurso esperado no replay. */
  expectedResourceType?: string;
  /** Executa a operação real; devolve o tipo/id do recurso criado e o resultado. */
  run: () => Promise<{ resourceType: string; resourceId: string; result: T }>;
}

/**
 * Executa uma operação de forma idempotente DENTRO da transacção recebida (`tx`).
 * Serializa por (companyId, scope, idempotencyKey) com advisory lock transaccional.
 * Mesma chave + mesmo fingerprint → devolve o recurso existente (replay).
 * Mesma chave + fingerprint diferente → ConflictError. Falha em qualquer passo → rollback total.
 */
export async function runIdempotentOperation<T>(
  tx: Prisma.TransactionClient,
  ctx: RequestContext,
  opts: IdempotentOperationOptions<T>,
): Promise<{ result: T; idempotent: boolean }> {
  const companyId = requireCompany(ctx);
  if (!SCOPES.has(opts.scope)) throw new ValidationError(`Scope de idempotência inválido: ${opts.scope}.`);
  const key = (opts.idempotencyKey ?? '').trim();
  if (!key) throw new ValidationError('Chave de idempotência obrigatória.');
  if (key.length > 100) throw new ValidationError('Chave de idempotência demasiado longa.');
  if (!UUID_RE.test(key)) throw new ValidationError('Chave de idempotência deve ser um UUID.');
  if (!opts.requestFingerprint || !opts.requestFingerprint.startsWith(`${FINGERPRINT_VERSION}:`)) {
    throw new ValidationError('Fingerprint do pedido inválido.');
  }

  // Serializa chamadas concorrentes da mesma chave (parametrizado, sem interpolação).
  const lockKey = `opidem|${companyId}|${opts.scope}|${key}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

  const existing = await tx.operationIdempotency.findFirst({ where: { companyId, scope: opts.scope, idempotencyKey: key } });
  if (existing) {
    if (existing.requestFingerprint !== opts.requestFingerprint) {
      throw new ConflictError('Operação repetida com payload diferente (conflito de idempotência).');
    }
    if (!existing.resourceId) {
      throw new ConflictError('Registo de idempotência sem recurso associado (integridade).');
    }
    if (opts.expectedResourceType && existing.resourceType !== opts.expectedResourceType) {
      throw new ConflictError('Registo de idempotência aponta para um tipo de recurso inesperado (integridade).');
    }
    const resource = await opts.loadExisting(existing.resourceId);
    if (resource == null) {
      throw new ConflictError('Registo de idempotência aponta para um recurso inexistente (integridade).');
    }
    await writeAudit(tx, ctx, {
      action: 'OPERATION_IDEMPOTENT_RETRY',
      entity: existing.resourceType ?? opts.expectedResourceType ?? 'OperationIdempotency',
      entityId: existing.resourceId,
      newValues: {
        scope: opts.scope,
        idempotencyKey: key,
        requestFingerprint: opts.requestFingerprint,
        resourceType: existing.resourceType,
        resourceId: existing.resourceId,
      },
    });
    return { result: resource, idempotent: true };
  }

  const { resourceType, resourceId, result } = await opts.run();
  await tx.operationIdempotency.create({
    data: {
      companyId,
      scope: opts.scope,
      idempotencyKey: key,
      requestFingerprint: opts.requestFingerprint,
      resourceType,
      resourceId,
      createdById: ctx.userId,
      completedAt: new Date(),
    } as Prisma.OperationIdempotencyUncheckedCreateInput,
  });
  return { result, idempotent: false };
}
