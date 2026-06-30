import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import { computeDocumentTotals, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';
import { postTreasuryMovementTx } from './treasury';
import { getMappedAccountTx, type AccountingJournalType } from './accounting';
import { postAccountingEventTx, resolveTreasuryLedgerTx } from './accounting-events';
import {
  FINGERPRINT_VERSION,
  canonicalRequestFingerprint,
  fpAmount,
  fpDate,
  fpInt,
  runIdempotentOperation,
} from './operation-idempotency';

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
