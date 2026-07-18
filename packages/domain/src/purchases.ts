import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import { civilDateInTimeZone, computeDocumentTotals, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';
import { postTreasuryMovementTx, reverseOperationalTreasuryMovementTx } from './treasury';
import { formatAccountingDate, getMappedAccountTx, parseAccountingDate, type AccountingJournalType } from './accounting';
import { postAccountingEventTx, resolveTreasuryLedgerTx, reverseAccountingEventTx } from './accounting-events';
import {
  FINGERPRINT_VERSION,
  canonicalRequestFingerprint,
  fpAmount,
  fpDate,
  fpInt,
  runIdempotentOperation,
} from './operation-idempotency';
import { validateOpenReversalDateTx, validateReversalReason } from './reversals';

export type PurchaseStatus = 'DRAFT' | 'SENT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

/** Estados em que a OC pode entrar em recepção de mercadorias. */
export const RECEIVABLE_PURCHASE_STATUSES: readonly PurchaseStatus[] = ['APPROVED', 'PARTIAL'];

export interface PurchaseListItem {
  id: string;
  number: string;
  supplierName: string;
  supplierNuit: string | null;
  orderDate: Date;
  expectedDate: Date | null;
  total: number;
  status: PurchaseStatus;
  createdBy: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
}

export interface PurchaseLineItem {
  id: string;
  sku: string | null;
  description: string;
  unitCost: number;
  quantity: number;
  receivedQty: number;
  taxRate: number;
  total: number;
}

export interface SupplierPaymentItem {
  id: string;
  number: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  amount: number;
  method: 'CASH' | 'MPESA' | 'EMOLA' | 'CARD' | 'TRANSFER';
  paidAt: Date;
  status: 'ACTIVE' | 'REVERSED';
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
  treasuryAccountId: string | null;
  treasuryAccountName: string | null;
}

export interface PurchaseReceiptHistoryLine {
  id: string;
  purchaseOrderLineId: string;
  productId: string;
  sku: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  taxRate: number;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface PurchaseReceiptHistoryItem {
  id: string;
  receiptNumber: string;
  receiptDate: Date;
  warehouseId: string;
  warehouseName: string;
  status: 'ACTIVE' | 'REVERSED';
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  items: PurchaseReceiptHistoryLine[];
}

export interface PurchaseDetail {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  supplierNuit: string | null;
  warehouseName: string;
  orderDate: Date;
  expectedDate: Date | null;
  status: PurchaseStatus;
  subtotal: number;
  taxTotal: number;
  total: number;
  receivedValue: number;
  amountPaid: number;
  outstanding: number;
  notes: string | null;
  createdBy: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  rejectedByName: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  lines: PurchaseLineItem[];
  payments: SupplierPaymentItem[];
  receipts: PurchaseReceiptHistoryItem[];
}

export interface PurchaseKpis {
  payable: number;
  openOrders: number;
  toReceive: number;
  pendingApproval: number;
  count: number;
}

export interface ReceivePurchaseOptions {
  /** Chave estável por tentativa; quando presente activa idempotência operacional. */
  idempotencyKey?: string;
  /** Data efectiva da recepção. Se ausente, usa hoje. */
  receiptDate?: Date | string;
  notes?: string;
}

export interface ReceivePurchaseResult {
  id?: string;
  number: string;
  received: number;
}

export interface SupplierStatementRow {
  date: Date;
  doc: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}
export interface SupplierStatement {
  openingBalance: number;
  rows: SupplierStatementRow[];
  closingBalance: number;
}

function lineStatusFully(l: { quantity: number; receivedQty: number }): boolean {
  return l.receivedQty >= l.quantity;
}

// ─────────────────────────── Leituras ───────────────────────────

export async function listPurchaseOrders(db: PrismaClient, ctx: RequestContext): Promise<PurchaseListItem[]> {
  requirePermission(ctx, 'purchases.create');
  requireCompany(ctx);
  const rows = await db.purchaseOrder.findMany({ orderBy: { orderDate: 'desc' } });
  return rows.map((o) => ({
    id: o.id,
    number: o.number,
    supplierName: o.supplierName,
    supplierNuit: o.supplierNuit,
    orderDate: o.orderDate,
    expectedDate: o.expectedDate,
    total: Number(o.total),
    status: o.status as PurchaseStatus,
    createdBy: o.createdBy,
    approvedByName: o.approvedByName,
    approvedAt: o.approvedAt,
    rejectionReason: o.rejectionReason,
  }));
}

export async function getPurchaseOrder(db: PrismaClient, ctx: RequestContext, id: string): Promise<PurchaseDetail> {
  requirePermission(ctx, 'purchases.create');
  requireCompany(ctx);
  const o = await db.purchaseOrder.findFirst({
    where: { id },
    include: {
      lines: { orderBy: { id: 'asc' } },
      payments: { orderBy: { paidAt: 'asc' } },
      receipts: {
        orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          warehouse: { select: { id: true, name: true } },
          items: {
            orderBy: { id: 'asc' },
            include: {
              product: { select: { sku: true, name: true } },
              purchaseOrderLine: { select: { description: true } },
            },
          },
        },
      },
      warehouse: { select: { name: true } },
    },
  });
  if (!o) throw new NotFoundError('Ordem de compra não encontrada.');
  const total = Number(o.total);
  const amountPaid = Number(o.amountPaid);
  const paymentIds = o.payments.map((p) => p.id);
  const paymentMovements = paymentIds.length
    ? await db.treasuryMovement.findMany({
        where: { sourceType: 'SUPPLIER_PAYMENT', sourceId: { in: paymentIds }, movementPurpose: 'SUPPLIER_PAYMENT_OUT' },
        include: { account: { select: { id: true, name: true } } },
      })
    : [];
  const movementByPayment = new Map(paymentMovements.map((m) => [m.sourceId, m]));
  return {
    id: o.id,
    number: o.number,
    supplierId: o.supplierId,
    supplierName: o.supplierName,
    supplierNuit: o.supplierNuit,
    warehouseName: o.warehouse.name,
    orderDate: o.orderDate,
    expectedDate: o.expectedDate,
    status: o.status as PurchaseStatus,
    subtotal: Number(o.subtotal),
    taxTotal: Number(o.taxTotal),
    total,
    receivedValue: Number(o.receivedValue),
    amountPaid,
    outstanding: round2(Number(o.receivedValue) - amountPaid),
    notes: o.notes,
    createdBy: o.createdBy,
    approvedById: o.approvedById,
    approvedByName: o.approvedByName,
    approvedAt: o.approvedAt,
    rejectedByName: o.rejectedByName,
    rejectedAt: o.rejectedAt,
    rejectionReason: o.rejectionReason,
    lines: o.lines.map((l) => ({
      id: l.id,
      sku: l.sku,
      description: l.description,
      unitCost: Number(l.unitCost),
      quantity: l.quantity,
      receivedQty: l.receivedQty,
      taxRate: Number(l.taxRate),
      total: Number(l.total),
    })),
    payments: o.payments.map((p) => ({
      id: p.id,
      number: p.number,
      purchaseOrderId: p.purchaseOrderId,
      purchaseOrderNumber: o.number,
      amount: Number(p.amount),
      method: p.method as SupplierPaymentItem['method'],
      paidAt: p.paidAt,
      status: p.status as SupplierPaymentItem['status'],
      reversedAt: p.reversedAt,
      reversedById: p.reversedById,
      reversalReason: p.reversalReason,
      treasuryAccountId: movementByPayment.get(p.id)?.account.id ?? null,
      treasuryAccountName: movementByPayment.get(p.id)?.account.name ?? null,
    })),
    receipts: o.receipts.map((r) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      receiptDate: r.receiptDate,
      warehouseId: r.warehouse.id,
      warehouseName: r.warehouse.name,
      status: r.status as PurchaseReceiptHistoryItem['status'],
      reversedAt: r.reversedAt,
      reversedById: r.reversedById,
      reversalReason: r.reversalReason,
      netAmount: Number(r.netAmount),
      taxAmount: Number(r.taxAmount),
      totalAmount: Number(r.totalAmount),
      notes: r.notes,
      items: r.items.map((item) => ({
        id: item.id,
        purchaseOrderLineId: item.purchaseOrderLineId,
        productId: item.productId,
        sku: item.product.sku,
        description: item.purchaseOrderLine.description || item.product.name,
        quantity: item.quantity,
        unitCost: Number(item.unitCost),
        taxRate: Number(item.taxRate),
        netAmount: Number(item.netAmount),
        taxAmount: Number(item.taxAmount),
        totalAmount: Number(item.totalAmount),
      })),
    })),
  };
}

export async function listSupplierPayments(db: PrismaClient, ctx: RequestContext, supplierId: string): Promise<SupplierPaymentItem[]> {
  requirePermission(ctx, 'suppliers.view');
  const companyId = requireCompany(ctx);
  const supplier = await db.supplier.findFirst({ where: { companyId, id: supplierId }, select: { id: true } });
  if (!supplier) throw new NotFoundError('Fornecedor não encontrado.');
  const payments = await db.supplierPayment.findMany({
    where: { companyId, supplierId },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    include: { purchaseOrder: { select: { id: true, number: true } } },
  });
  const paymentIds = payments.map((p) => p.id);
  const paymentMovements = paymentIds.length
    ? await db.treasuryMovement.findMany({
        where: { companyId, sourceType: 'SUPPLIER_PAYMENT', sourceId: { in: paymentIds }, movementPurpose: 'SUPPLIER_PAYMENT_OUT' },
        include: { account: { select: { id: true, name: true } } },
      })
    : [];
  const movementByPayment = new Map(paymentMovements.map((m) => [m.sourceId, m]));
  return payments.map((p) => ({
    id: p.id,
    number: p.number,
    purchaseOrderId: p.purchaseOrderId,
    purchaseOrderNumber: p.purchaseOrder?.number ?? null,
    amount: Number(p.amount),
    method: p.method as SupplierPaymentItem['method'],
    paidAt: p.paidAt,
    status: p.status as SupplierPaymentItem['status'],
    reversedAt: p.reversedAt,
    reversedById: p.reversedById,
    reversalReason: p.reversalReason,
    treasuryAccountId: movementByPayment.get(p.id)?.account.id ?? null,
    treasuryAccountName: movementByPayment.get(p.id)?.account.name ?? null,
  }));
}

export async function purchaseKpis(db: PrismaClient, ctx: RequestContext): Promise<PurchaseKpis> {
  requirePermission(ctx, 'purchases.create');
  requireCompany(ctx);
  const [orders, suppliers] = await Promise.all([
    db.purchaseOrder.findMany({ where: { status: { not: 'CANCELLED' } }, select: { status: true } }),
    db.supplier.findMany({ where: { balance: { gt: 0 } }, select: { balance: true } }),
  ]);
  const payable = suppliers.reduce((a, s) => a + Number(s.balance), 0);
  const pendingApproval = orders.filter((o) => o.status === 'PENDING_APPROVAL').length;
  const toReceive = orders.filter((o) => RECEIVABLE_PURCHASE_STATUSES.includes(o.status as PurchaseStatus)).length;
  return { payable: round2(payable), openOrders: pendingApproval + toReceive, toReceive, pendingApproval, count: orders.length };
}

/** Extracto de conta do fornecedor (saldo inicial + recepções a pagar/pagamentos). */
export async function getSupplierStatement(db: PrismaClient, ctx: RequestContext, supplierId: string): Promise<SupplierStatement> {
  requirePermission(ctx, 'suppliers.view');
  requireCompany(ctx);
  const supplier = await db.supplier.findFirst({ where: { id: supplierId }, select: { balance: true } });
  if (!supplier) throw new NotFoundError('Fornecedor não encontrado.');

  const [orders, payments] = await Promise.all([
    db.purchaseOrder.findMany({ where: { supplierId, status: { not: 'CANCELLED' }, receivedValue: { gt: 0 } }, select: { number: true, orderDate: true, receivedValue: true } }),
    db.supplierPayment.findMany({ where: { supplierId, status: 'ACTIVE' }, select: { number: true, paidAt: true, amount: true } }),
  ]);

  type Ev = { date: Date; doc: string; description: string; debit: number; credit: number };
  const events: Ev[] = [
    ...orders.map((o) => ({ date: o.orderDate, doc: o.number, description: 'Recepção de compra', debit: Number(o.receivedValue), credit: 0 })),
    ...payments.map((p) => ({ date: p.paidAt, doc: p.number, description: 'Pagamento a fornecedor', debit: 0, credit: Number(p.amount) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const closingBalance = Number(supplier.balance);
  const netDocs = events.reduce((acc, e) => acc + e.debit - e.credit, 0);
  const openingBalance = round2(closingBalance - netDocs);

  let running = openingBalance;
  const rows: SupplierStatementRow[] = events.map((e) => {
    running = round2(running + e.debit - e.credit);
    return { date: e.date, doc: e.doc, description: e.description, debit: e.debit, credit: e.credit, balance: running };
  });
  return { openingBalance, rows, closingBalance: round2(closingBalance) };
}

// ─────────────────────────── Mutações ───────────────────────────

async function nextDocNumber(tx: Prisma.TransactionClient, companyId: string, prefix: string, year: number): Promise<string> {
  const key = `${prefix}-${year}`;
  const counter = await tx.documentCounter.upsert({
    where: { companyId_key: { companyId, key } },
    update: { value: { increment: 1 } },
    create: { companyId, key, value: 1 },
  });
  return `${prefix} ${year}/${String(counter.value).padStart(4, '0')}`;
}

const purchaseInput = z.object({
  supplierId: z.string().min(1, 'Seleccione um fornecedor.'),
  warehouseId: z.string().optional(),
  expectedDate: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().positive('Quantidade inválida.'),
        unitCost: z.coerce.number().min(0, 'Custo inválido.'),
      }),
    )
    .min(1, 'Adicione pelo menos uma linha.'),
});

export type PurchaseInput = z.input<typeof purchaseInput>;

/** Cria uma ordem de compra (estado PENDING_APPROVAL). Ainda não gera stock nem conta a pagar. */
export async function createPurchaseOrder(db: PrismaClient, ctx: RequestContext, input: PurchaseInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'purchases.create');
  const companyId = requireCompany(ctx);
  const parsed = purchaseInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;

  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, companyId } });
    if (!supplier) throw new NotFoundError('Fornecedor não encontrado.');
    const warehouse = data.warehouseId
      ? await tx.warehouse.findFirst({ where: { id: data.warehouseId, companyId, status: 'ACTIVE' } })
      : await tx.warehouse.findFirst({ where: { companyId, status: 'ACTIVE' }, orderBy: { code: 'asc' } });
    if (!warehouse) throw new NotFoundError('Armazém não encontrado.');

    const prepared = [] as Array<{ productId: string; sku: string | null; description: string; unitCost: number; quantity: number; taxRate: number; total: number }>;
    for (const line of data.lines) {
      const product = await tx.product.findFirst({ where: { id: line.productId, companyId } });
      if (!product) throw new NotFoundError('Produto não encontrado.');
      const taxRate = Number(product.taxRate);
      const gross = round2(line.quantity * line.unitCost);
      const tax = round2(gross * (taxRate / 100));
      prepared.push({ productId: product.id, sku: product.sku, description: product.name, unitCost: line.unitCost, quantity: line.quantity, taxRate, total: round2(gross + tax) });
    }
    const totals = computeDocumentTotals(prepared.map((p) => ({ quantity: p.quantity, unitPrice: p.unitCost, taxPercent: p.taxRate })));
    const orderDate = new Date();
    const number = await nextDocNumber(tx, companyId, 'OC', orderDate.getFullYear());

    const order = await tx.purchaseOrder.create({
      data: {
        companyId,
        branchId: ctx.branchId ?? null,
        number,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierNuit: supplier.nuit,
        warehouseId: warehouse.id,
        orderDate,
        expectedDate: data.expectedDate ?? null,
        status: 'PENDING_APPROVAL',
        subtotal: totals.subtotal,
        taxTotal: totals.tax,
        total: totals.total,
        notes: data.notes ?? null,
        createdBy: ctx.userId,
      },
    });
    for (const p of prepared) {
      await tx.purchaseOrderLine.create({
        data: { companyId, orderId: order.id, productId: p.productId, sku: p.sku, description: p.description, unitCost: p.unitCost, quantity: p.quantity, taxRate: p.taxRate, total: p.total },
      });
    }
    await writeAudit(tx, ctx, { action: 'purchase.order', entity: 'PurchaseOrder', entityId: order.id, newValues: { number, supplier: supplier.name, total: totals.total, status: 'PENDING_APPROVAL' } });
    return { id: order.id, number };
  });
}

export interface PurchaseApprovalResult {
  id: string;
  number: string;
  status: PurchaseStatus;
}

/**
 * Aprova uma OC em PENDING_APPROVAL (gate `purchases.approve`). Pré-transaccional:
 * não gera lançamentos, stock nem tesouraria — apenas o estado + snapshot do aprovador.
 */
export async function approvePurchaseOrder(db: PrismaClient, ctx: RequestContext, orderId: string): Promise<PurchaseApprovalResult> {
  requirePermission(ctx, 'purchases.approve');
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${orderId} AND "companyId" = ${companyId} FOR UPDATE`;
    const order = await tx.purchaseOrder.findFirst({ where: { id: orderId, companyId } });
    if (!order) throw new NotFoundError('Ordem de compra não encontrada.');
    if (order.status === 'APPROVED') throw new ConflictError('A ordem já está aprovada.');
    if (order.status === 'REJECTED') throw new ConflictError('A ordem foi rejeitada e não pode ser aprovada.');
    if (order.status === 'CANCELLED') throw new ConflictError('A ordem está cancelada.');
    if (order.status === 'PARTIAL' || order.status === 'RECEIVED') throw new ConflictError('A ordem já entrou em recepção.');
    if (order.status !== 'PENDING_APPROVAL') throw new ConflictError('A ordem não está a aguardar aprovação.');

    const approver = await tx.user.findFirst({ where: { id: ctx.userId }, select: { name: true, email: true } });
    const approvedByName = approver ? approver.name || approver.email : null;
    const approvedAt = new Date();
    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: 'APPROVED', approvedById: ctx.userId, approvedByName, approvedAt },
    });
    await writeAudit(tx, ctx, {
      action: 'purchase.approve',
      entity: 'PurchaseOrder',
      entityId: order.id,
      oldValues: { status: order.status },
      newValues: { status: 'APPROVED', number: order.number, approvedById: ctx.userId, approvedByName, approvedAt: approvedAt.toISOString() },
    });
    return { id: order.id, number: order.number, status: 'APPROVED' as const };
  });
}

/**
 * Rejeita uma OC em PENDING_APPROVAL (gate `purchases.approve`). Estado terminal;
 * motivo obrigatório (≥ 10 caracteres). A OC nunca é apagada.
 */
export async function rejectPurchaseOrder(db: PrismaClient, ctx: RequestContext, orderId: string, reason: string): Promise<PurchaseApprovalResult> {
  requirePermission(ctx, 'purchases.approve');
  const companyId = requireCompany(ctx);
  const rejectionReason = (reason ?? '').trim();
  if (rejectionReason.length < 10) throw new ValidationError('Indique o motivo da rejeição (mínimo 10 caracteres).');
  if (rejectionReason.length > 500) throw new ValidationError('O motivo da rejeição excede 500 caracteres.');
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${orderId} AND "companyId" = ${companyId} FOR UPDATE`;
    const order = await tx.purchaseOrder.findFirst({ where: { id: orderId, companyId } });
    if (!order) throw new NotFoundError('Ordem de compra não encontrada.');
    if (order.status === 'REJECTED') throw new ConflictError('A ordem já foi rejeitada.');
    if (order.status !== 'PENDING_APPROVAL') throw new ConflictError('Só é possível rejeitar ordens a aguardar aprovação.');

    const rejecter = await tx.user.findFirst({ where: { id: ctx.userId }, select: { name: true, email: true } });
    const rejectedByName = rejecter ? rejecter.name || rejecter.email : null;
    const rejectedAt = new Date();
    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status: 'REJECTED', rejectedById: ctx.userId, rejectedByName, rejectedAt, rejectionReason },
    });
    await writeAudit(tx, ctx, {
      action: 'purchase.reject',
      entity: 'PurchaseOrder',
      entityId: order.id,
      oldValues: { status: order.status },
      reason: rejectionReason,
      newValues: { status: 'REJECTED', number: order.number, rejectedById: ctx.userId, rejectedByName, rejectedAt: rejectedAt.toISOString(), rejectionReason },
    });
    return { id: order.id, number: order.number, status: 'REJECTED' as const };
  });
}

const receiveOptionsInput = z.object({
  idempotencyKey: z.string().min(1).optional(),
  receiptDate: z.union([z.coerce.date(), z.string()]).optional(),
  notes: z.string().trim().max(500).optional(),
});

type ParsedReceiveOptions = z.output<typeof receiveOptionsInput>;

function normalizeReceiptDate(value: ParsedReceiveOptions['receiptDate']): Date {
  if (!value) return new Date();
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new ValidationError('Data de recepção inválida.');
  return d;
}

function receiveFingerprint(
  companyId: string,
  orderId: string,
  warehouseId: string,
  receiptDate: Date,
  items: Array<{ lineId: string; productId: string; quantity: number; unitCost: number; taxRate: number }>,
  notes?: string,
): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    purchaseOrderId: orderId,
    warehouseId,
    receiptDate: fpDate(receiptDate),
    notes: notes ?? null,
    lines: items.map((i) => ({
      lineId: i.lineId,
      productId: i.productId,
      quantity: fpInt(i.quantity),
      unitCost: fpAmount(i.unitCost),
      taxRate: fpAmount(i.taxRate),
    })),
  });
}

function journalTypeForTreasury(type: 'CASH' | 'BANK' | 'MOBILE' | 'OTHER'): AccountingJournalType {
  if (type === 'CASH') return 'CASH';
  if (type === 'BANK' || type === 'MOBILE') return 'BANK';
  throw new ValidationError('A conta financeira seleccionada não possui uma regra de diário contabilístico.');
}

/**
 * Recebe quantidades de uma OC: dá entrada de stock (IN), recalcula o custo médio
 * ponderado, incrementa a conta a pagar do fornecedor e actualiza o estado da OC.
 */
function purchaseStatusFromLines(lines: Array<{ quantity: number; receivedQty: number }>, fallback: PurchaseStatus): PurchaseStatus {
  if (fallback === 'CANCELLED' || fallback === 'REJECTED') return fallback;
  if (lines.length === 0) return fallback;
  if (lines.every(lineStatusFully)) return 'RECEIVED';
  if (lines.some((l) => l.receivedQty > 0)) return 'PARTIAL';
  // Sem nada recebido a OC volta a Aprovada (era 'SENT' antes do fluxo S7).
  return 'APPROVED';
}

export async function receivePurchaseOrder(
  db: PrismaClient,
  ctx: RequestContext,
  orderId: string,
  items: Array<{ lineId: string; quantity: number }>,
  options: ReceivePurchaseOptions = {},
): Promise<ReceivePurchaseResult> {
  requirePermission(ctx, 'purchases.create');
  const companyId = requireCompany(ctx);
  const parsedOptions = receiveOptionsInput.safeParse(options);
  if (!parsedOptions.success) throw new ValidationError(parsedOptions.error.issues[0]?.message ?? 'Dados inválidos.');
  const receiptDate = normalizeReceiptDate(parsedOptions.data.receiptDate);
  const quantitiesByLine = new Map<string, number>();
  for (const item of items) {
    const quantity = Math.trunc(Number(item.quantity));
    if (quantity > 0) quantitiesByLine.set(item.lineId, (quantitiesByLine.get(item.lineId) ?? 0) + quantity);
  }
  const normalizedItems = Array.from(quantitiesByLine, ([lineId, quantity]) => ({ lineId, quantity }));
  if (normalizedItems.length === 0) throw new ValidationError('Indique quantidades a receber.');

  return db.$transaction(async (tx) => {
    const orderForFingerprint = await tx.purchaseOrder.findFirst({ where: { id: orderId, companyId }, include: { lines: true } });
    if (!orderForFingerprint) throw new NotFoundError('Ordem de compra não encontrada.');
    const fingerprintLines = normalizedItems.map((item) => {
      const line = orderForFingerprint.lines.find((l) => l.id === item.lineId);
      if (!line) throw new NotFoundError('Linha da ordem não encontrada.');
      if (!line.productId) throw new ValidationError('Linha sem produto associado.');
      return { lineId: line.id, productId: line.productId, quantity: item.quantity, unitCost: Number(line.unitCost), taxRate: Number(line.taxRate) };
    });
    const requestFingerprint = receiveFingerprint(companyId, orderId, orderForFingerprint.warehouseId, receiptDate, fingerprintLines, parsedOptions.data.notes);

    const runReceipt = async (): Promise<{ resourceType: string; resourceId: string; result: ReceivePurchaseResult }> => {
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${orderId} AND "companyId" = ${companyId} FOR UPDATE`;
      const order = await tx.purchaseOrder.findFirst({ where: { id: orderId, companyId }, include: { lines: true } });
      if (!order) throw new NotFoundError('Ordem de compra não encontrada.');
      if (order.status === 'CANCELLED') throw new ConflictError('A ordem está cancelada.');
      if (order.status === 'RECEIVED') throw new ConflictError('A ordem já foi totalmente recebida.');
      if (order.status === 'REJECTED') throw new ConflictError('A ordem foi rejeitada e não pode ser recepcionada.');
      if (!RECEIVABLE_PURCHASE_STATUSES.includes(order.status as PurchaseStatus)) {
        throw new ConflictError('A ordem aguarda aprovação e só pode ser recepcionada depois de aprovada.');
      }

      const receiptNumber = await nextDocNumber(tx, companyId, 'GR', receiptDate.getFullYear());
      const prepared = [] as Array<{
        lineId: string;
        productId: string;
        description: string;
        quantity: number;
        unitCost: number;
        taxRate: number;
        netAmount: number;
        taxAmount: number;
        totalAmount: number;
      }>;
      let netAmount = 0;
      let taxAmount = 0;
      let totalAmount = 0;

      for (const item of normalizedItems) {
        const line = order.lines.find((l) => l.id === item.lineId);
        if (!line) throw new NotFoundError('Linha da ordem não encontrada.');
        const remaining = line.quantity - line.receivedQty;
        if (item.quantity > remaining) throw new ValidationError(`Recepção excede o pendente em ${line.description} (pendente ${remaining}).`);
        if (!line.productId) throw new ValidationError('Linha sem produto associado.');
        const unitCost = Number(line.unitCost);
        const taxRate = Number(line.taxRate);
        const lineNet = round2(item.quantity * unitCost);
        const lineTax = round2(lineNet * (taxRate / 100));
        const lineTotal = round2(lineNet + lineTax);
        netAmount = round2(netAmount + lineNet);
        taxAmount = round2(taxAmount + lineTax);
        totalAmount = round2(totalAmount + lineTotal);
        prepared.push({
          lineId: line.id,
          productId: line.productId,
          description: line.description,
          quantity: item.quantity,
          unitCost,
          taxRate,
          netAmount: lineNet,
          taxAmount: lineTax,
          totalAmount: lineTotal,
        });
      }

      if (totalAmount <= 0) throw new ValidationError('O total da recepção tem de ser maior que zero.');
      if (round2(netAmount + taxAmount) !== totalAmount) throw new ValidationError('Total da recepção inconsistente com líquido e IVA.');

      const receipt = await tx.purchaseReceipt.create({
        data: {
          companyId,
          purchaseOrderId: order.id,
          supplierId: order.supplierId,
          warehouseId: order.warehouseId,
          receiptNumber,
          receiptDate,
          netAmount,
          taxAmount,
          totalAmount,
          notes: parsedOptions.data.notes ?? null,
          createdById: ctx.userId,
        },
      });

      for (const p of prepared) {
        const product = await tx.product.findFirst({ where: { id: p.productId, companyId }, include: { stockLevels: { select: { quantity: true } } } });
        if (!product) throw new NotFoundError('Produto não encontrado.');

        const oldQty = product.stockLevels.reduce((a, s) => a + s.quantity, 0);
        const oldAvg = Number(product.avgCost);
        const newQty = oldQty + p.quantity;
        const newAvg = newQty > 0 ? round2((oldQty * oldAvg + p.quantity * p.unitCost) / newQty) : p.unitCost;
        await tx.product.update({ where: { id: product.id }, data: { avgCost: newAvg } });

        const level = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId: product.id, warehouseId: order.warehouseId } } });
        const current = level?.quantity ?? 0;
        const balanceAfter = current + p.quantity;
        await tx.stockLevel.upsert({
          where: { productId_warehouseId: { productId: product.id, warehouseId: order.warehouseId } },
          update: { quantity: balanceAfter },
          create: { companyId, productId: product.id, warehouseId: order.warehouseId, quantity: balanceAfter },
        });
        await tx.stockMovement.create({
          data: {
            companyId,
            productId: product.id,
            warehouseId: order.warehouseId,
            purchaseReceiptId: receipt.id,
            type: 'IN',
            quantity: p.quantity,
            balanceAfter,
            document: receiptNumber,
            reason: `Recepção ${order.number}`,
            createdBy: ctx.userId,
          },
        });
        await tx.purchaseOrderLine.update({ where: { id: p.lineId }, data: { receivedQty: { increment: p.quantity } } });
        await tx.purchaseReceiptItem.create({
          data: {
            companyId,
            purchaseReceiptId: receipt.id,
            purchaseOrderLineId: p.lineId,
            productId: product.id,
            quantity: p.quantity,
            unitCost: p.unitCost,
            taxRate: p.taxRate,
            netAmount: p.netAmount,
            taxAmount: p.taxAmount,
            totalAmount: p.totalAmount,
          },
        });
      }

      const refreshedLines = await tx.purchaseOrderLine.findMany({ where: { companyId, orderId: order.id }, select: { quantity: true, receivedQty: true } });
      const allReceived = refreshedLines.every(lineStatusFully);
      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { receivedValue: { increment: totalAmount }, status: allReceived ? 'RECEIVED' : 'PARTIAL' },
      });
      await tx.supplier.update({ where: { id: order.supplierId }, data: { balance: { increment: totalAmount } } });

      const inventory = await getMappedAccountTx(tx, companyId, 'INVENTORY');
      const payable = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_PAYABLE');
      const lines = [
        { ledgerAccountId: inventory.id, debit: netAmount, description: `Recepção de compra ${receiptNumber}` },
        { ledgerAccountId: payable.id, credit: totalAmount, supplierId: order.supplierId, description: `Recepção de compra ${receiptNumber}` },
      ];
      if (taxAmount > 0) {
        const vat = await getMappedAccountTx(tx, companyId, 'VAT_INPUT');
        lines.splice(1, 0, { ledgerAccountId: vat.id, debit: taxAmount, description: `IVA dedutível ${receiptNumber}` });
      }

      await postAccountingEventTx(tx, ctx, {
        journalType: 'PURCHASES',
        entryDate: receipt.receiptDate,
        description: `Recepção de compra ${receiptNumber}`,
        reference: receiptNumber,
        origin: { sourceType: 'PURCHASE_RECEIPT', sourceId: receipt.id, accountingEvent: 'PURCHASE_RECEIVED' },
        lines,
      });

      await writeAudit(tx, ctx, {
        action: 'purchase.receive',
        entity: 'PurchaseReceipt',
        entityId: receipt.id,
        newValues: { receiptNumber, order: order.number, orderId: order.id, supplierId: order.supplierId, netAmount, taxAmount, totalAmount, idempotencyKey: parsedOptions.data.idempotencyKey ?? null },
      });

      return { resourceType: 'PurchaseReceipt', resourceId: receipt.id, result: { id: receipt.id, number: receiptNumber, received: prepared.length } };
    };

    if (!parsedOptions.data.idempotencyKey) {
      return (await runReceipt()).result;
    }

    const op = await runIdempotentOperation<ReceivePurchaseResult>(tx, ctx, {
      scope: 'PURCHASE_RECEIPT_CREATE',
      idempotencyKey: parsedOptions.data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'PurchaseReceipt',
      loadExisting: async (resourceId) => {
        const receipt = await tx.purchaseReceipt.findFirst({ where: { companyId, id: resourceId }, select: { id: true, receiptNumber: true, items: { select: { id: true } } } });
        if (!receipt) return null;
        const [movement, entry] = await Promise.all([
          tx.stockMovement.findFirst({ where: { companyId, purchaseReceiptId: receipt.id }, select: { id: true } }),
          tx.journalEntry.findFirst({ where: { companyId, sourceType: 'PURCHASE_RECEIPT', sourceId: receipt.id, accountingEvent: 'PURCHASE_RECEIVED' }, select: { id: true } }),
        ]);
        if (!movement || !entry) throw new ConflictError('Registo de idempotência aponta para uma recepção incompleta (integridade).');
        return { id: receipt.id, number: receipt.receiptNumber, received: receipt.items.length };
      },
      run: runReceipt,
    });
    return op.result;
  });
}

const reversePurchaseReceiptInput = z.object({
  purchaseReceiptId: z.string().min(1, 'Recepção de compra inválida.'),
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  reversalReason: z.string(),
  reversalDate: z.string().min(1, 'Data do estorno obrigatória.'),
});

export type ReversePurchaseReceiptInput = z.input<typeof reversePurchaseReceiptInput>;

export interface ReversePurchaseReceiptResult {
  id: string;
  number: string;
  reversalDate: string;
  stockReversalIds: string[];
  accountingReversalId: string | null;
}

const PURCHASE_RECEIPT_ACTIVE_PAYMENTS_MESSAGE = 'Esta recepção possui pagamentos activos relacionados. Estorne primeiro os respectivos pagamentos ao fornecedor.';
const PURCHASE_RECEIPT_STOCK_INSUFFICIENT_MESSAGE = 'Não existe stock suficiente para estornar esta recepção. Parte da mercadoria já foi utilizada, transferida ou vendida.';
const PURCHASE_RECEIPT_STOCK_USAGE_MESSAGE = 'Esta recepção já possui utilização posterior de stock e não pode ser estornada automaticamente. Utilize futuramente o fluxo de devolução ao fornecedor.';

function purchaseReceiptReversalFingerprint(companyId: string, purchaseReceiptId: string, reversalDate: Date, reversalReason: string): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    purchaseReceiptId,
    reversalDate: fpDate(reversalDate),
    reversalReason,
  });
}

function resolveAllowedPurchaseReceiptReversalDate(value: string): Date {
  const requestedDate = parseAccountingDate(value);
  const currentDate = civilDateInTimeZone();
  if (formatAccountingDate(requestedDate) !== currentDate) {
    throw new ValidationError('A data do estorno deve ser a data actual em Africa/Maputo.');
  }
  return parseAccountingDate(currentDate);
}

function stockKey(productId: string, warehouseId: string): string {
  return `${productId}|${warehouseId}`;
}

function addQuantity(map: Map<string, number>, key: string, quantity: number): void {
  map.set(key, (map.get(key) ?? 0) + quantity);
}

async function loadCompletedPurchaseReceiptReversal(tx: Prisma.TransactionClient, companyId: string, purchaseReceiptId: string, reversalDate: Date): Promise<ReversePurchaseReceiptResult | null> {
  const receipt = await tx.purchaseReceipt.findFirst({ where: { companyId, id: purchaseReceiptId }, select: { id: true, receiptNumber: true, status: true } });
  if (!receipt) return null;
  if (receipt.status !== 'REVERSED') throw new ConflictError('Registo de idempotência aponta para uma recepção ainda activa (integridade).');

  const [originalMovements, originalEntry] = await Promise.all([
    tx.stockMovement.findMany({ where: { companyId, purchaseReceiptId: receipt.id, type: 'IN' }, select: { id: true } }),
    tx.journalEntry.findFirst({ where: { companyId, sourceType: 'PURCHASE_RECEIPT', sourceId: receipt.id, accountingEvent: 'PURCHASE_RECEIVED' }, select: { id: true } }),
  ]);
  if (!originalEntry) throw new ConflictError('Registo de idempotência aponta para um estorno sem lançamento contabilístico original (integridade).');

  const [stockReversals, accountingReversal] = await Promise.all([
    originalMovements.length
      ? tx.stockMovement.findMany({ where: { companyId, reversesId: { in: originalMovements.map((m) => m.id) } }, select: { id: true, reversesId: true } })
      : Promise.resolve([]),
    tx.journalEntry.findFirst({ where: { companyId, reversalOfId: originalEntry.id }, select: { id: true } }),
  ]);
  if (stockReversals.length !== originalMovements.length || !accountingReversal) {
    throw new ConflictError('Registo de idempotência aponta para um estorno incompleto (integridade).');
  }

  return {
    id: receipt.id,
    number: receipt.receiptNumber,
    reversalDate: formatAccountingDate(reversalDate),
    stockReversalIds: stockReversals.map((m) => m.id),
    accountingReversalId: accountingReversal.id,
  };
}

export async function reversePurchaseReceipt(db: PrismaClient, ctx: RequestContext, input: ReversePurchaseReceiptInput): Promise<ReversePurchaseReceiptResult> {
  requirePermission(ctx, 'purchaseReceipts.reverse');
  const companyId = requireCompany(ctx);
  const parsed = reversePurchaseReceiptInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const reversalReason = validateReversalReason(data.reversalReason);
  const reversalDate = resolveAllowedPurchaseReceiptReversalDate(data.reversalDate);
  const requestFingerprint = purchaseReceiptReversalFingerprint(companyId, data.purchaseReceiptId, reversalDate, reversalReason);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<ReversePurchaseReceiptResult>(tx, ctx, {
      scope: 'PURCHASE_RECEIPT_REVERSE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'PurchaseReceipt',
      loadExisting: (resourceId) => loadCompletedPurchaseReceiptReversal(tx, companyId, resourceId, reversalDate),
      run: async () => {
        await validateOpenReversalDateTx(tx, companyId, reversalDate);
        await tx.$queryRaw`SELECT id FROM purchase_receipts WHERE id = ${data.purchaseReceiptId} AND "companyId" = ${companyId} FOR UPDATE`;
        const receipt = await tx.purchaseReceipt.findFirst({ where: { companyId, id: data.purchaseReceiptId } });
        if (!receipt) throw new NotFoundError('Recepção de compra não encontrada.');
        if (receipt.status === 'REVERSED') throw new ConflictError('Esta recepção já foi estornada.');

        await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${receipt.purchaseOrderId} AND "companyId" = ${companyId} FOR UPDATE`;
        const order = await tx.purchaseOrder.findFirst({ where: { companyId, id: receipt.purchaseOrderId }, select: { id: true, number: true, supplierId: true, warehouseId: true, receivedValue: true, amountPaid: true, status: true } });
        if (!order) throw new NotFoundError('Ordem de compra da recepção não encontrada.');
        if (order.status === 'CANCELLED') throw new ConflictError('A ordem de compra da recepção está cancelada.');
        if (order.supplierId !== receipt.supplierId) throw new ConflictError('Recepção e ordem de compra apontam para fornecedores diferentes (integridade).');
        if (order.warehouseId !== receipt.warehouseId) throw new ConflictError('Recepção e ordem de compra apontam para armazéns diferentes (integridade).');

        await tx.$queryRaw`SELECT id FROM suppliers WHERE id = ${receipt.supplierId} AND "companyId" = ${companyId} FOR UPDATE`;
        const supplier = await tx.supplier.findFirst({ where: { companyId, id: receipt.supplierId } });
        if (!supplier) throw new NotFoundError('Fornecedor da recepção não encontrado.');

        const activePayments = await tx.supplierPayment.findMany({ where: { companyId, purchaseOrderId: order.id, status: 'ACTIVE' }, select: { id: true, amount: true } });
        if (activePayments.length > 0) throw new ConflictError(PURCHASE_RECEIPT_ACTIVE_PAYMENTS_MESSAGE);
        const activePaid = round2(Number((await tx.supplierPayment.aggregate({ where: { companyId, purchaseOrderId: order.id, status: 'ACTIVE' }, _sum: { amount: true } }))._sum.amount ?? 0));
        if (round2(Number(order.amountPaid)) !== activePaid) {
          throw new ConflictError('Integridade: valor pago da ordem não coincide com os pagamentos activos.');
        }

        const [items, orderLines, stockMovements, entries] = await Promise.all([
          tx.purchaseReceiptItem.findMany({ where: { companyId, purchaseReceiptId: receipt.id }, orderBy: { id: 'asc' } }),
          tx.purchaseOrderLine.findMany({ where: { companyId, orderId: order.id }, select: { id: true, quantity: true, receivedQty: true } }),
          tx.stockMovement.findMany({ where: { companyId, purchaseReceiptId: receipt.id, type: 'IN' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
          tx.journalEntry.findMany({ where: { companyId, sourceType: 'PURCHASE_RECEIPT', sourceId: receipt.id, accountingEvent: 'PURCHASE_RECEIVED' }, select: { id: true } }),
        ]);
        if (items.length === 0) throw new ConflictError('Integridade: recepção sem itens.');
        if (stockMovements.length !== items.length) throw new ConflictError('Integridade: recepção sem movimentos de stock originais rastreáveis.');
        if (entries.length !== 1) throw new ConflictError('Integridade: recepção sem lançamento contabilístico PURCHASE_RECEIVED único.');
        const originalEntry = entries[0]!;

        const orderLineById = new Map(orderLines.map((line) => [line.id, line]));
        const itemQtyByStockKey = new Map<string, number>();
        const movementQtyByStockKey = new Map<string, number>();
        const receiptCostByProduct = new Map<string, { quantity: number; cost: number }>();
        for (const item of items) {
          if (!orderLineById.has(item.purchaseOrderLineId)) throw new ConflictError('Integridade: item da recepção não pertence à ordem de compra.');
          if (item.quantity <= 0) throw new ConflictError('Integridade: item da recepção possui quantidade inválida.');
          addQuantity(itemQtyByStockKey, stockKey(item.productId, receipt.warehouseId), item.quantity);
          const cost = receiptCostByProduct.get(item.productId) ?? { quantity: 0, cost: 0 };
          cost.quantity += item.quantity;
          cost.cost = round2(cost.cost + round2(item.quantity * Number(item.unitCost)));
          receiptCostByProduct.set(item.productId, cost);
        }
        for (const movement of stockMovements) {
          if (movement.reversesId) throw new ConflictError('Integridade: movimento original da recepção já referencia outro movimento.');
          if (movement.quantity <= 0 || movement.type !== 'IN') throw new ConflictError('Integridade: movimento de stock da recepção não é uma entrada.');
          if (movement.warehouseId !== receipt.warehouseId) throw new ConflictError('Integridade: movimento de stock não corresponde ao armazém da recepção.');
          addQuantity(movementQtyByStockKey, stockKey(movement.productId, movement.warehouseId), movement.quantity);
        }
        for (const [key, quantity] of itemQtyByStockKey) {
          if ((movementQtyByStockKey.get(key) ?? 0) !== quantity) throw new ConflictError('Integridade: movimentos de stock não correspondem aos itens da recepção.');
        }

        const originalMovementIds = stockMovements.map((m) => m.id);
        const existingStockReversal = await tx.stockMovement.findFirst({ where: { companyId, reversesId: { in: originalMovementIds } }, select: { id: true } });
        if (existingStockReversal) throw new ConflictError('Esta recepção já possui movimentos de stock compensatórios.');

        const uniqueProductIds = Array.from(receiptCostByProduct.keys());
        for (const productId of uniqueProductIds) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} AND "companyId" = ${companyId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM stock_levels WHERE "companyId" = ${companyId} AND "productId" = ${productId} FOR UPDATE`;
        }
        for (const [key, quantity] of itemQtyByStockKey) {
          const [productId, warehouseId] = key.split('|') as [string, string];
          await tx.$queryRaw`SELECT id FROM stock_levels WHERE "companyId" = ${companyId} AND "productId" = ${productId} AND "warehouseId" = ${warehouseId} FOR UPDATE`;
          const level = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
          if (!level || level.companyId !== companyId) throw new ConflictError('Integridade: nível de stock da recepção não encontrado.');
          if (level.quantity < quantity) throw new ConflictError(PURCHASE_RECEIPT_STOCK_INSUFFICIENT_MESSAGE);
        }

        const maxOriginalCreatedAtByProduct = new Map<string, Date>();
        for (const movement of stockMovements) {
          const current = maxOriginalCreatedAtByProduct.get(movement.productId);
          if (!current || movement.createdAt > current) maxOriginalCreatedAtByProduct.set(movement.productId, movement.createdAt);
        }
        for (const [productId, maxOriginalCreatedAt] of maxOriginalCreatedAtByProduct) {
          const later = await tx.stockMovement.findFirst({
            where: { companyId, productId, id: { notIn: originalMovementIds }, createdAt: { gt: maxOriginalCreatedAt } },
            select: { id: true },
          });
          if (later) throw new ConflictError(PURCHASE_RECEIPT_STOCK_USAGE_MESSAGE);
        }

        const avgCostChanges: Array<{ productId: string; before: number; after: number; totalQtyBefore: number; totalQtyAfter: number; reversedQty: number }> = [];
        for (const [productId, received] of receiptCostByProduct) {
          const product = await tx.product.findFirst({ where: { companyId, id: productId }, select: { id: true, avgCost: true } });
          if (!product) throw new NotFoundError('Produto da recepção não encontrado.');
          const productStockLevels = await tx.stockLevel.findMany({ where: { companyId, productId }, select: { quantity: true } });
          const totalQtyBefore = productStockLevels.reduce((sum, level) => sum + level.quantity, 0);
          const totalQtyAfter = totalQtyBefore - received.quantity;
          if (totalQtyAfter <= 0) throw new ConflictError(PURCHASE_RECEIPT_STOCK_USAGE_MESSAGE);
          const avgCostBefore = round2(Number(product.avgCost));
          const avgCostAfter = round2((totalQtyBefore * avgCostBefore - received.cost) / totalQtyAfter);
          if (!Number.isFinite(avgCostAfter) || avgCostAfter < 0) throw new ConflictError(PURCHASE_RECEIPT_STOCK_USAGE_MESSAGE);
          avgCostChanges.push({ productId, before: avgCostBefore, after: avgCostAfter, totalQtyBefore, totalQtyAfter, reversedQty: received.quantity });
        }

        const stockLevelChanges: Array<{ productId: string; warehouseId: string; before: number; after: number; movementId: string; reversalId: string }> = [];
        const stockReversalIds: string[] = [];
        for (const movement of stockMovements) {
          const level = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId: movement.productId, warehouseId: movement.warehouseId } } });
          if (!level || level.companyId !== companyId) throw new ConflictError('Integridade: nível de stock da recepção não encontrado.');
          const quantity = movement.quantity;
          const before = level.quantity;
          const balanceAfter = before - quantity;
          if (balanceAfter < 0) throw new ConflictError(PURCHASE_RECEIPT_STOCK_INSUFFICIENT_MESSAGE);
          await tx.stockLevel.update({
            where: { productId_warehouseId: { productId: movement.productId, warehouseId: movement.warehouseId } },
            data: { quantity: balanceAfter },
          });
          const reversal = await tx.stockMovement.create({
            data: {
              companyId,
              productId: movement.productId,
              warehouseId: movement.warehouseId,
              purchaseReceiptId: receipt.id,
              reversesId: movement.id,
              type: 'OUT',
              quantity: -quantity,
              balanceAfter,
              document: receipt.receiptNumber,
              reason: `Estorno da recepção ${receipt.receiptNumber}`,
              createdBy: ctx.userId,
            },
          });
          stockReversalIds.push(reversal.id);
          stockLevelChanges.push({ productId: movement.productId, warehouseId: movement.warehouseId, before, after: balanceAfter, movementId: movement.id, reversalId: reversal.id });
        }

        for (const change of avgCostChanges) {
          await tx.product.update({ where: { id: change.productId }, data: { avgCost: change.after } });
        }

        const lineQuantityChanges: Array<{ lineId: string; before: number; after: number }> = [];
        const refreshedLines: Array<{ quantity: number; receivedQty: number }> = [];
        for (const line of orderLines) {
          const activeQty = Number(
            (
              await tx.purchaseReceiptItem.aggregate({
                where: { companyId, purchaseOrderLineId: line.id, purchaseReceipt: { status: 'ACTIVE', id: { not: receipt.id } } },
                _sum: { quantity: true },
              })
            )._sum.quantity ?? 0,
          );
          await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: activeQty } });
          lineQuantityChanges.push({ lineId: line.id, before: line.receivedQty, after: activeQty });
          refreshedLines.push({ quantity: line.quantity, receivedQty: activeQty });
        }

        const receivedValueAfter = round2(Number((await tx.purchaseReceipt.aggregate({ where: { companyId, purchaseOrderId: order.id, status: 'ACTIVE', id: { not: receipt.id } }, _sum: { totalAmount: true } }))._sum.totalAmount ?? 0));
        const orderStatusAfter = purchaseStatusFromLines(refreshedLines, order.status as PurchaseStatus);
        await tx.purchaseOrder.update({ where: { id: order.id }, data: { receivedValue: receivedValueAfter, status: orderStatusAfter } });

        const totalAmount = round2(Number(receipt.totalAmount));
        const supplierBalanceBefore = round2(Number(supplier.balance));
        const updatedSupplier = await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { decrement: totalAmount } } });
        const supplierBalanceAfter = round2(Number(updatedSupplier.balance));

        const accountingReversal = await reverseAccountingEventTx(tx, ctx, {
          origin: { sourceType: 'PURCHASE_RECEIPT', sourceId: receipt.id, accountingEvent: 'PURCHASE_RECEIVED' },
          reversalDate,
          reason: reversalReason,
          operationalReference: receipt.receiptNumber,
        });

        await tx.purchaseReceipt.update({
          where: { id: receipt.id },
          data: { status: 'REVERSED', reversedAt: new Date(), reversedById: ctx.userId, reversalReason },
        });

        await writeAudit(tx, ctx, {
          action: 'purchase.receipt.reverse',
          entity: 'PurchaseReceipt',
          entityId: receipt.id,
          oldValues: {
            status: receipt.status,
            supplierBalance: supplierBalanceBefore,
            purchaseOrderReceivedValue: Number(order.receivedValue),
            purchaseOrderStatus: order.status,
          },
          newValues: {
            status: 'REVERSED',
            purchaseReceiptId: receipt.id,
            receiptNumber: receipt.receiptNumber,
            purchaseOrderId: order.id,
            supplierId: supplier.id,
            total: totalAmount,
            reversalReason,
            reversalDate: formatAccountingDate(reversalDate),
            idempotencyKey: data.idempotencyKey,
            supplierBalanceBefore,
            supplierBalanceAfter,
            purchaseOrderReceivedValueBefore: round2(Number(order.receivedValue)),
            purchaseOrderReceivedValueAfter: receivedValueAfter,
            purchaseOrderStatusAfter: orderStatusAfter,
            receivedQtyByLine: lineQuantityChanges,
            stockLevels: stockLevelChanges,
            avgCost: avgCostChanges,
            stockMovementOriginalIds: originalMovementIds,
            stockMovementReversalIds: stockReversalIds,
            journalEntryOriginalId: originalEntry.id,
            journalEntryReversalId: accountingReversal.reversalId,
          },
        });

        return {
          resourceType: 'PurchaseReceipt',
          resourceId: receipt.id,
          result: {
            id: receipt.id,
            number: receipt.receiptNumber,
            reversalDate: formatAccountingDate(reversalDate),
            stockReversalIds,
            accountingReversalId: accountingReversal.reversalId,
          },
        };
      },
    });
    return op.result;
  });
}

const supplierPaymentInput = z.object({
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  supplierId: z.string().min(1, 'Fornecedor inválido.'),
  purchaseOrderId: z.string().optional(),
  amount: z.coerce.number().positive('O valor deve ser positivo.'),
  method: z.enum(['CASH', 'MPESA', 'EMOLA', 'CARD', 'TRANSFER']).default('TRANSFER'),
  /** Conta de tesouraria de onde sai o dinheiro. */
  accountId: z.string().min(1, 'Seleccione a conta financeira para concluir o pagamento.'),
  notes: z.string().trim().max(500).optional(),
});

export type SupplierPaymentInput = z.input<typeof supplierPaymentInput>;
type ParsedSupplierPaymentInput = z.output<typeof supplierPaymentInput>;

function supplierPaymentFingerprint(companyId: string, data: ParsedSupplierPaymentInput, amount: number): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    supplierId: data.supplierId,
    purchaseOrderId: data.purchaseOrderId ?? null,
    accountId: data.accountId,
    amount: fpAmount(amount),
    method: data.method,
    notes: data.notes ?? null,
  });
}

/** Regista um pagamento a fornecedor: baixa o saldo a pagar. */
export async function createSupplierPayment(db: PrismaClient, ctx: RequestContext, input: SupplierPaymentInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'purchases.create');
  const companyId = requireCompany(ctx);
  const parsed = supplierPaymentInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const amount = round2(data.amount);
  const requestFingerprint = supplierPaymentFingerprint(companyId, data, amount);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'SUPPLIER_PAYMENT_CREATE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'SupplierPayment',
      loadExisting: async (resourceId) => {
        const payment = await tx.supplierPayment.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
        if (!payment) return null;
        const [movement, entry] = await Promise.all([
          tx.treasuryMovement.findFirst({ where: { companyId, sourceType: 'SUPPLIER_PAYMENT', sourceId: payment.id, movementPurpose: 'SUPPLIER_PAYMENT_OUT' }, select: { id: true } }),
          tx.journalEntry.findFirst({ where: { companyId, sourceType: 'SUPPLIER_PAYMENT', sourceId: payment.id, accountingEvent: 'SUPPLIER_PAYMENT_POSTED' }, select: { id: true } }),
        ]);
        if (!movement || !entry) throw new ConflictError('Registo de idempotência aponta para um pagamento incompleto (integridade).');
        return payment;
      },
      run: async () => {
        const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, companyId } });
        if (!supplier) throw new NotFoundError('Fornecedor não encontrado.');
        const payable = Number(supplier.balance);
        if (payable <= 0) throw new ConflictError('O fornecedor não tem saldo a pagar.');
        if (amount > round2(payable)) throw new ValidationError(`O valor excede o saldo a pagar (${payable.toFixed(2)} MT).`);

        const treasury = await resolveTreasuryLedgerTx(tx, companyId, data.accountId);
        const journalType = journalTypeForTreasury(treasury.treasuryType);
        const payableAccount = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_PAYABLE');

        let purchaseOrderId: string | null = null;
        if (data.purchaseOrderId) {
          await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${data.purchaseOrderId} AND "companyId" = ${companyId} FOR UPDATE`;
          const order = await tx.purchaseOrder.findFirst({ where: { id: data.purchaseOrderId, companyId } });
          if (!order) throw new NotFoundError('Ordem de compra não encontrada.');
          if (order.supplierId !== supplier.id) throw new ValidationError('A ordem de compra não pertence ao fornecedor indicado.');
          const orderOutstanding = round2(Number(order.receivedValue) - Number(order.amountPaid));
          if (orderOutstanding <= 0) throw new ConflictError('A ordem de compra não tem saldo a pagar.');
          if (amount > orderOutstanding) throw new ValidationError(`O valor excede o saldo em dívida da ordem (${orderOutstanding.toFixed(2)} MT).`);
          purchaseOrderId = order.id;
          await tx.purchaseOrder.update({ where: { id: order.id }, data: { amountPaid: { increment: amount } } });
        }

        const number = await nextDocNumber(tx, companyId, 'PG', new Date().getFullYear());
        const payment = await tx.supplierPayment.create({
          data: { companyId, number, purchaseOrderId, supplierId: supplier.id, amount, method: data.method, notes: data.notes ?? null, createdBy: ctx.userId },
        });
        await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { decrement: amount } } });

        const treasuryMovement = await postTreasuryMovementTx(tx, companyId, ctx.userId, {
          accountId: data.accountId,
          flow: 'OUT',
          amount,
          category: 'Pagamento',
          description: `Pagamento ${number} — ${supplier.name}`,
          document: number,
          source: 'SUPPLIER_PAYMENT',
          sourceType: 'SUPPLIER_PAYMENT',
          sourceId: payment.id,
          movementPurpose: 'SUPPLIER_PAYMENT_OUT',
          occurredAt: payment.paidAt,
        });

        await postAccountingEventTx(tx, ctx, {
          journalType,
          entryDate: payment.paidAt,
          description: `Pagamento a fornecedor ${number}`,
          reference: number,
          origin: { sourceType: 'SUPPLIER_PAYMENT', sourceId: payment.id, accountingEvent: 'SUPPLIER_PAYMENT_POSTED' },
          lines: [
            { ledgerAccountId: payableAccount.id, debit: amount, supplierId: supplier.id, description: `Pagamento a fornecedor ${number}` },
            { ledgerAccountId: treasury.ledgerAccountId, credit: amount, treasuryAccountId: treasury.treasuryAccountId, description: `Pagamento a fornecedor ${number}` },
          ],
        });

        await writeAudit(tx, ctx, {
          action: 'purchase.pay',
          entity: 'SupplierPayment',
          entityId: payment.id,
          newValues: {
            number,
            supplier: supplier.name,
            supplierId: supplier.id,
            purchaseOrderId,
            amount,
            treasuryAccountId: data.accountId,
            treasuryMovementId: treasuryMovement.movementId,
            idempotencyKey: data.idempotencyKey,
            accounting: { sourceType: 'SUPPLIER_PAYMENT', accountingEvent: 'SUPPLIER_PAYMENT_POSTED', journalType },
          },
        });

        return { resourceType: 'SupplierPayment', resourceId: payment.id, result: { id: payment.id, number } };
      },
    });
    return op.result;
  });
}

const reverseSupplierPaymentInput = z.object({
  supplierPaymentId: z.string().min(1, 'Pagamento a fornecedor invÃ¡lido.'),
  idempotencyKey: z.string().min(1, 'Chave de idempotÃªncia obrigatÃ³ria.'),
  reversalReason: z.string(),
  reversalDate: z.string().min(1, 'Data do estorno obrigatÃ³ria.'),
});

export type ReverseSupplierPaymentInput = z.input<typeof reverseSupplierPaymentInput>;

export interface ReverseSupplierPaymentResult {
  id: string;
  number: string;
  reversalDate: string;
  treasuryReversalId: string | null;
  accountingReversalId: string | null;
}

function supplierPaymentReversalFingerprint(companyId: string, supplierPaymentId: string, reversalDate: Date, reversalReason: string): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    supplierPaymentId,
    reversalDate: fpDate(reversalDate),
    reversalReason,
  });
}

function resolveAllowedSupplierPaymentReversalDate(value: string): Date {
  const requestedDate = parseAccountingDate(value);
  const currentDate = civilDateInTimeZone();
  if (formatAccountingDate(requestedDate) !== currentDate) {
    throw new ValidationError('A data do estorno deve ser a data actual em Africa/Maputo.');
  }
  return parseAccountingDate(currentDate);
}

export async function reverseSupplierPayment(db: PrismaClient, ctx: RequestContext, input: ReverseSupplierPaymentInput): Promise<ReverseSupplierPaymentResult> {
  requirePermission(ctx, 'supplierPayments.reverse');
  const companyId = requireCompany(ctx);
  const parsed = reverseSupplierPaymentInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados invÃ¡lidos.');
  const data = parsed.data;
  const reversalReason = validateReversalReason(data.reversalReason);
  const reversalDate = resolveAllowedSupplierPaymentReversalDate(data.reversalDate);
  const requestFingerprint = supplierPaymentReversalFingerprint(companyId, data.supplierPaymentId, reversalDate, reversalReason);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<ReverseSupplierPaymentResult>(tx, ctx, {
      scope: 'SUPPLIER_PAYMENT_REVERSE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'SupplierPayment',
      loadExisting: async (resourceId) => {
        const payment = await tx.supplierPayment.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true, status: true } });
        if (!payment) return null;
        if (payment.status !== 'REVERSED') throw new ConflictError('Registo de idempotÃªncia aponta para um pagamento a fornecedor ainda activo (integridade).');
        const [originalMovement, originalEntry] = await Promise.all([
          tx.treasuryMovement.findFirst({ where: { companyId, sourceType: 'SUPPLIER_PAYMENT', sourceId: payment.id, movementPurpose: 'SUPPLIER_PAYMENT_OUT' }, select: { id: true } }),
          tx.journalEntry.findFirst({ where: { companyId, sourceType: 'SUPPLIER_PAYMENT', sourceId: payment.id, accountingEvent: 'SUPPLIER_PAYMENT_POSTED' }, select: { id: true } }),
        ]);
        if (!originalMovement || !originalEntry) throw new ConflictError('Registo de idempotÃªncia aponta para um estorno incompleto (integridade).');
        const [treasuryReversal, accountingReversal] = await Promise.all([
          tx.treasuryMovement.findFirst({ where: { companyId, reversesId: originalMovement.id }, select: { id: true } }),
          tx.journalEntry.findFirst({ where: { companyId, reversalOfId: originalEntry.id }, select: { id: true } }),
        ]);
        if (!treasuryReversal || !accountingReversal) throw new ConflictError('Registo de idempotÃªncia aponta para um estorno incompleto (integridade).');
        return { id: payment.id, number: payment.number, reversalDate: formatAccountingDate(reversalDate), treasuryReversalId: treasuryReversal.id, accountingReversalId: accountingReversal.id };
      },
      run: async () => {
        await validateOpenReversalDateTx(tx, companyId, reversalDate);
        await tx.$queryRaw`SELECT id FROM supplier_payments WHERE id = ${data.supplierPaymentId} AND "companyId" = ${companyId} FOR UPDATE`;
        const payment = await tx.supplierPayment.findFirst({ where: { companyId, id: data.supplierPaymentId } });
        if (!payment) throw new NotFoundError('Pagamento a fornecedor nÃ£o encontrado.');
        if (payment.status === 'REVERSED') throw new ConflictError('Este pagamento a fornecedor já foi estornado.');

        await tx.$queryRaw`SELECT id FROM suppliers WHERE id = ${payment.supplierId} AND "companyId" = ${companyId} FOR UPDATE`;
        const supplier = await tx.supplier.findFirst({ where: { companyId, id: payment.supplierId } });
        if (!supplier) throw new NotFoundError('Fornecedor do pagamento nÃ£o encontrado.');

        let order: { id: string; number: string; supplierId: string; amountPaid: Prisma.Decimal; receivedValue: Prisma.Decimal; status: string } | null = null;
        let orderAmountPaidBefore: number | null = null;
        let orderAmountPaidAfter: number | null = null;
        let orderStatusAfter: PurchaseStatus | null = null;
        if (payment.purchaseOrderId) {
          await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${payment.purchaseOrderId} AND "companyId" = ${companyId} FOR UPDATE`;
          order = await tx.purchaseOrder.findFirst({ where: { companyId, id: payment.purchaseOrderId }, select: { id: true, number: true, supplierId: true, amountPaid: true, receivedValue: true, status: true } });
          if (!order) throw new NotFoundError('Ordem de compra do pagamento nÃ£o encontrada.');
          if (order.status === 'CANCELLED') throw new ConflictError('A ordem de compra do pagamento estÃ¡ cancelada.');
          if (order.supplierId !== supplier.id) throw new ConflictError('Pagamento e ordem de compra apontam para fornecedores diferentes (integridade).');

          const activePaidBefore = round2(Number((await tx.supplierPayment.aggregate({ where: { companyId, purchaseOrderId: order.id, status: 'ACTIVE' }, _sum: { amount: true } }))._sum.amount ?? 0));
          orderAmountPaidBefore = round2(Number(order.amountPaid));
          if (activePaidBefore !== orderAmountPaidBefore) {
            throw new ConflictError('Integridade: valor pago da ordem nÃ£o coincide com os pagamentos activos.');
          }
        }

        const movements = await tx.treasuryMovement.findMany({ where: { companyId, sourceType: 'SUPPLIER_PAYMENT', sourceId: payment.id, movementPurpose: 'SUPPLIER_PAYMENT_OUT' } });
        if (movements.length !== 1) throw new ConflictError('Integridade: pagamento a fornecedor sem movimento de tesouraria Ãºnico.');
        const originalMovement = movements[0]!;
        if (originalMovement.flow !== 'OUT' || round2(Number(originalMovement.amount)) !== round2(Number(payment.amount))) {
          throw new ConflictError('Integridade: movimento de tesouraria nÃ£o coincide com o pagamento a fornecedor.');
        }

        const entries = await tx.journalEntry.findMany({ where: { companyId, sourceType: 'SUPPLIER_PAYMENT', sourceId: payment.id, accountingEvent: 'SUPPLIER_PAYMENT_POSTED' } });
        if (entries.length !== 1) throw new ConflictError('Integridade: pagamento a fornecedor sem lanÃ§amento contabilÃ­stico Ãºnico.');
        const originalEntry = entries[0]!;

        const amount = round2(Number(payment.amount));
        const supplierBalanceBefore = round2(Number(supplier.balance));
        await tx.supplierPayment.update({
          where: { id: payment.id },
          data: { status: 'REVERSED', reversedAt: new Date(), reversedById: ctx.userId, reversalReason },
        });

        const updatedSupplier = await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: amount } } });
        const supplierBalanceAfter = round2(Number(updatedSupplier.balance));

        if (order) {
          const activePaidAfter = round2(Number((await tx.supplierPayment.aggregate({ where: { companyId, purchaseOrderId: order.id, status: 'ACTIVE' }, _sum: { amount: true } }))._sum.amount ?? 0));
          if (activePaidAfter > round2(Number(order.receivedValue))) {
            throw new ConflictError('Integridade: pagamentos activos excedem o valor recebido da ordem.');
          }
          const lines = await tx.purchaseOrderLine.findMany({ where: { companyId, orderId: order.id }, select: { quantity: true, receivedQty: true } });
          orderStatusAfter = purchaseStatusFromLines(lines, order.status as PurchaseStatus);
          await tx.purchaseOrder.update({ where: { id: order.id }, data: { amountPaid: activePaidAfter, status: orderStatusAfter } });
          orderAmountPaidAfter = activePaidAfter;
        }

        const treasuryReversal = await reverseOperationalTreasuryMovementTx(tx, companyId, ctx.userId, {
          movementId: originalMovement.id,
          reason: reversalReason,
          occurredAt: reversalDate,
          expectedSourceType: 'SUPPLIER_PAYMENT',
          expectedSourceId: payment.id,
          expectedMovementPurpose: 'SUPPLIER_PAYMENT_OUT',
          reversalPurpose: 'SUPPLIER_PAYMENT_OUT_REVERSAL',
          description: `Estorno do pagamento ${payment.number} - ${reversalReason}`,
        });

        const accountingReversal = await reverseAccountingEventTx(tx, ctx, {
          origin: { sourceType: 'SUPPLIER_PAYMENT', sourceId: payment.id, accountingEvent: 'SUPPLIER_PAYMENT_POSTED' },
          reversalDate,
          reason: reversalReason,
          operationalReference: payment.number,
        });

        await writeAudit(tx, ctx, {
          action: 'supplier.payment.reverse',
          entity: 'SupplierPayment',
          entityId: payment.id,
          oldValues: {
            status: payment.status,
            supplierBalance: supplierBalanceBefore,
            purchaseOrderAmountPaid: orderAmountPaidBefore,
            purchaseOrderStatus: order?.status ?? null,
          },
          newValues: {
            status: 'REVERSED',
            supplierPaymentId: payment.id,
            paymentNumber: payment.number,
            supplierId: supplier.id,
            purchaseOrderId: order?.id ?? null,
            amount,
            reversalReason,
            reversalDate: formatAccountingDate(reversalDate),
            idempotencyKey: data.idempotencyKey,
            supplierBalanceBefore,
            supplierBalanceAfter,
            purchaseOrderAmountPaidBefore: orderAmountPaidBefore,
            purchaseOrderAmountPaidAfter: orderAmountPaidAfter,
            purchaseOrderStatusAfter: orderStatusAfter,
            treasuryMovementOriginalId: originalMovement.id,
            treasuryMovementReversalId: treasuryReversal.reversalId,
            treasuryBalanceBefore: treasuryReversal.balanceBefore,
            treasuryBalanceAfter: treasuryReversal.balanceAfter,
            journalEntryOriginalId: originalEntry.id,
            journalEntryReversalId: accountingReversal.reversalId,
          },
        });

        return {
          resourceType: 'SupplierPayment',
          resourceId: payment.id,
          result: {
            id: payment.id,
            number: payment.number,
            reversalDate: formatAccountingDate(reversalDate),
            treasuryReversalId: treasuryReversal.reversalId,
            accountingReversalId: accountingReversal.reversalId,
          },
        };
      },
    });
    return op.result;
  });
}
