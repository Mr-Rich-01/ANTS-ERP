import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import { computeDocumentTotals, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';

export type PurchaseStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseListItem {
  id: string;
  number: string;
  supplierName: string;
  supplierNuit: string | null;
  orderDate: Date;
  expectedDate: Date | null;
  total: number;
  status: PurchaseStatus;
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
  lines: PurchaseLineItem[];
}

export interface PurchaseKpis {
  payable: number;
  openOrders: number;
  toReceive: number;
  count: number;
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
  }));
}

export async function getPurchaseOrder(db: PrismaClient, ctx: RequestContext, id: string): Promise<PurchaseDetail> {
  requirePermission(ctx, 'purchases.create');
  requireCompany(ctx);
  const o = await db.purchaseOrder.findFirst({
    where: { id },
    include: { lines: { orderBy: { id: 'asc' } }, warehouse: { select: { name: true } } },
  });
  if (!o) throw new NotFoundError('Ordem de compra não encontrada.');
  const total = Number(o.total);
  const amountPaid = Number(o.amountPaid);
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
  };
}

export async function purchaseKpis(db: PrismaClient, ctx: RequestContext): Promise<PurchaseKpis> {
  requirePermission(ctx, 'purchases.create');
  requireCompany(ctx);
  const [orders, suppliers] = await Promise.all([
    db.purchaseOrder.findMany({ where: { status: { not: 'CANCELLED' } }, select: { status: true } }),
    db.supplier.findMany({ where: { balance: { gt: 0 } }, select: { balance: true } }),
  ]);
  const payable = suppliers.reduce((a, s) => a + Number(s.balance), 0);
  const openOrders = orders.filter((o) => o.status === 'SENT' || o.status === 'PARTIAL').length;
  return { payable: round2(payable), openOrders, toReceive: openOrders, count: orders.length };
}

/** Extracto de conta do fornecedor (saldo inicial + recepções a pagar/pagamentos). */
export async function getSupplierStatement(db: PrismaClient, ctx: RequestContext, supplierId: string): Promise<SupplierStatement> {
  requirePermission(ctx, 'suppliers.view');
  requireCompany(ctx);
  const supplier = await db.supplier.findFirst({ where: { id: supplierId }, select: { balance: true } });
  if (!supplier) throw new NotFoundError('Fornecedor não encontrado.');

  const [orders, payments] = await Promise.all([
    db.purchaseOrder.findMany({ where: { supplierId, status: { not: 'CANCELLED' }, receivedValue: { gt: 0 } }, select: { number: true, orderDate: true, receivedValue: true } }),
    db.supplierPayment.findMany({ where: { supplierId }, select: { number: true, paidAt: true, amount: true } }),
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

/** Cria uma ordem de compra (estado SENT). Ainda não gera stock nem conta a pagar. */
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
        status: 'SENT',
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
    await writeAudit(tx, ctx, { action: 'purchase.order', entity: 'PurchaseOrder', entityId: order.id, newValues: { number, supplier: supplier.name, total: totals.total } });
    return { id: order.id, number };
  });
}

/**
 * Recebe quantidades de uma OC: dá entrada de stock (IN), recalcula o custo médio
 * ponderado, incrementa a conta a pagar do fornecedor e actualiza o estado da OC.
 */
export async function receivePurchaseOrder(
  db: PrismaClient,
  ctx: RequestContext,
  orderId: string,
  items: Array<{ lineId: string; quantity: number }>,
): Promise<{ number: string; received: number }> {
  requirePermission(ctx, 'purchases.create');
  const companyId = requireCompany(ctx);

  return db.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({ where: { id: orderId, companyId }, include: { lines: true } });
    if (!order) throw new NotFoundError('Ordem de compra não encontrada.');
    if (order.status === 'CANCELLED') throw new ConflictError('A ordem está cancelada.');
    if (order.status === 'RECEIVED') throw new ConflictError('A ordem já foi totalmente recebida.');

    const number = await nextDocNumber(tx, companyId, 'GR', new Date().getFullYear());
    let receivedValueDelta = 0;
    let receivedCount = 0;

    for (const item of items) {
      const qty = Math.trunc(item.quantity);
      if (qty <= 0) continue;
      const line = order.lines.find((l) => l.id === item.lineId);
      if (!line) throw new NotFoundError('Linha da ordem não encontrada.');
      const remaining = line.quantity - line.receivedQty;
      if (qty > remaining) throw new ValidationError(`Recepção excede o pendente em ${line.description} (pendente ${remaining}).`);
      if (!line.productId) throw new ValidationError('Linha sem produto associado.');

      const product = await tx.product.findFirst({ where: { id: line.productId, companyId }, include: { stockLevels: { select: { quantity: true } } } });
      if (!product) throw new NotFoundError('Produto não encontrado.');

      // Custo médio ponderado (sobre o stock total existente).
      const oldQty = product.stockLevels.reduce((a, s) => a + s.quantity, 0);
      const oldAvg = Number(product.avgCost);
      const unitCost = Number(line.unitCost);
      const newQty = oldQty + qty;
      const newAvg = newQty > 0 ? round2((oldQty * oldAvg + qty * unitCost) / newQty) : unitCost;
      await tx.product.update({ where: { id: product.id }, data: { avgCost: newAvg } });

      const level = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId: product.id, warehouseId: order.warehouseId } } });
      const current = level?.quantity ?? 0;
      const balanceAfter = current + qty;
      await tx.stockLevel.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: order.warehouseId } },
        update: { quantity: balanceAfter },
        create: { companyId, productId: product.id, warehouseId: order.warehouseId, quantity: balanceAfter },
      });
      await tx.stockMovement.create({
        data: { companyId, productId: product.id, warehouseId: order.warehouseId, type: 'IN', quantity: qty, balanceAfter, document: number, reason: `Recepção ${order.number}`, createdBy: ctx.userId },
      });
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: line.receivedQty + qty } });

      const taxRate = Number(line.taxRate);
      receivedValueDelta = round2(receivedValueDelta + qty * unitCost * (1 + taxRate / 100));
      receivedCount += 1;
    }

    if (receivedCount === 0) throw new ValidationError('Indique quantidades a receber.');

    const updatedLines = order.lines.map((l) => {
      const it = items.find((i) => i.lineId === l.id);
      const add = it ? Math.max(0, Math.trunc(it.quantity)) : 0;
      return { quantity: l.quantity, receivedQty: l.receivedQty + add };
    });
    const allReceived = updatedLines.every(lineStatusFully);

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { receivedValue: { increment: receivedValueDelta }, status: allReceived ? 'RECEIVED' : 'PARTIAL' },
    });
    await tx.supplier.update({ where: { id: order.supplierId }, data: { balance: { increment: receivedValueDelta } } });
    await writeAudit(tx, ctx, { action: 'purchase.receive', entity: 'PurchaseOrder', entityId: order.id, newValues: { receipt: number, order: order.number, value: receivedValueDelta } });

    return { number, received: receivedCount };
  });
}

const supplierPaymentInput = z.object({
  supplierId: z.string().min(1, 'Fornecedor inválido.'),
  purchaseOrderId: z.string().optional(),
  amount: z.coerce.number().positive('O valor deve ser positivo.'),
  method: z.enum(['CASH', 'MPESA', 'EMOLA', 'CARD', 'TRANSFER']).default('TRANSFER'),
  notes: z.string().trim().max(500).optional(),
});

export type SupplierPaymentInput = z.input<typeof supplierPaymentInput>;

/** Regista um pagamento a fornecedor: baixa o saldo a pagar. */
export async function createSupplierPayment(db: PrismaClient, ctx: RequestContext, input: SupplierPaymentInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'purchases.create');
  const companyId = requireCompany(ctx);
  const parsed = supplierPaymentInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const amount = round2(data.amount);

  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, companyId } });
    if (!supplier) throw new NotFoundError('Fornecedor não encontrado.');
    const payable = Number(supplier.balance);
    if (payable <= 0) throw new ConflictError('O fornecedor não tem saldo a pagar.');
    if (amount > round2(payable)) throw new ValidationError(`O valor excede o saldo a pagar (${payable.toFixed(2)} MT).`);

    let purchaseOrderId: string | null = null;
    if (data.purchaseOrderId) {
      const order = await tx.purchaseOrder.findFirst({ where: { id: data.purchaseOrderId, companyId } });
      if (!order) throw new NotFoundError('Ordem de compra não encontrada.');
      purchaseOrderId = order.id;
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { amountPaid: { increment: amount } } });
    }

    const number = await nextDocNumber(tx, companyId, 'PG', new Date().getFullYear());
    const payment = await tx.supplierPayment.create({
      data: { companyId, number, purchaseOrderId, supplierId: supplier.id, amount, method: data.method, notes: data.notes ?? null, createdBy: ctx.userId },
    });
    await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { decrement: amount } } });
    await writeAudit(tx, ctx, { action: 'purchase.pay', entity: 'SupplierPayment', entityId: payment.id, newValues: { number, supplier: supplier.name, amount } });

    return { id: payment.id, number };
  });
}
