/**
 * Lógica pura de scoping multiempresa (sem dependências do Prisma), para ser
 * testável isoladamente.
 */

/**
 * Modelos com coluna `companyId`. As queries a estes modelos são automaticamente
 * filtradas pela empresa activa (2.ª barreira de isolamento multiempresa).
 * À medida que entram modelos de negócio (Customer, Invoice, …), adicionar aqui.
 */
export const COMPANY_SCOPED = new Set<string>([
  'Branch',
  'CompanySettings',
  'User',
  'Role',
  'AuditLog',
  'Customer',
  'Supplier',
  'Product',
  'Warehouse',
  'StockLevel',
  'StockMovement',
  'Invoice',
  'InvoiceLine',
  'Payment',
  'DocumentCounter',
  'PurchaseOrder',
  'PurchaseOrderLine',
  'PurchaseReceipt',
  'PurchaseReceiptItem',
  'SupplierPayment',
  'TreasuryAccount',
  'TreasuryMovement',
  'FiscalYear',
  'AccountingPeriod',
  'LedgerAccount',
  'AccountingJournal',
  'JournalEntry',
  'JournalEntryLine',
  'AccountingMapping',
  'OperationIdempotency',
]);

/** Operações cujo `where` deve ser filtrado por companyId. */
export const WHERE_OPS = new Set<string>([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);

export type AnyArgs = Record<string, unknown> | undefined;

/**
 * Aplica o filtro/atribuição de `companyId` aos argumentos de uma operação Prisma.
 * Função pura. Modelos fora de COMPANY_SCOPED ficam intactos.
 * (O Prisma permite filtrar por campos não-únicos no `where` de findUnique/update/delete
 *  desde que exista um campo único, por isso a injecção é uniforme.)
 */
export function scopeArgs(model: string, operation: string, args: AnyArgs, companyId: string): AnyArgs {
  if (!COMPANY_SCOPED.has(model)) return args;
  const a: Record<string, unknown> = { ...(args ?? {}) };

  if (WHERE_OPS.has(operation)) {
    a.where = { ...((a.where as Record<string, unknown>) ?? {}), companyId };
  }

  if (operation === 'create') {
    a.data = { ...((a.data as Record<string, unknown>) ?? {}), companyId };
  } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const d = a.data;
    a.data = Array.isArray(d)
      ? d.map((x) => ({ ...(x as Record<string, unknown>), companyId }))
      : { ...((d as Record<string, unknown>) ?? {}), companyId };
  } else if (operation === 'upsert') {
    a.create = { ...((a.create as Record<string, unknown>) ?? {}), companyId };
  }

  return a;
}
