import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import { computeLine, computeDocumentTotals, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission, hasPermission } from './permissions';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';
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

export type InvoiceStatus = 'ISSUED' | 'PARTIAL' | 'PAID' | 'CANCELLED';
/** Estado apresentado (inclui "vencido", derivado da data). */
export type InvoiceDisplayStatus = 'pago' | 'parcial' | 'pendente' | 'vencido' | 'cancelado';
export type PaymentMethod = 'CASH' | 'MPESA' | 'EMOLA' | 'CARD' | 'TRANSFER';

export interface InvoiceListItem {
  id: string;
  number: string;
  customerName: string;
  customerNuit: string | null;
  issueDate: Date;
  dueDate: Date;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  displayStatus: InvoiceDisplayStatus;
}

export interface InvoiceLineItem {
  id: string;
  sku: string | null;
  description: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  taxRate: number;
  total: number;
}

export interface InvoicePaymentItem {
  id: string;
  number: string;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
}

export interface InvoiceDetail {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerNuit: string | null;
  warehouseName: string;
  issueDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
  displayStatus: InvoiceDisplayStatus;
  subtotal: number;
  discountTotal: number;
  taxableBase: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  outstanding: number;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  lines: InvoiceLineItem[];
  payments: InvoicePaymentItem[];
}

export interface InvoiceKpis {
  invoiced: number;
  received: number;
  pending: number;
  overdue: number;
  count: number;
}

export interface StatementRow {
  date: Date;
  doc: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}
export interface CustomerStatement {
  openingBalance: number;
  rows: StatementRow[];
  closingBalance: number;
}

function displayStatus(status: InvoiceStatus, dueDate: Date, now: Date): InvoiceDisplayStatus {
  if (status === 'CANCELLED') return 'cancelado';
  if (status === 'PAID') return 'pago';
  if ((status === 'ISSUED' || status === 'PARTIAL') && dueDate < now) return 'vencido';
  if (status === 'PARTIAL') return 'parcial';
  return 'pendente';
}

// ─────────────────────────── Leituras ───────────────────────────

export async function listInvoices(db: PrismaClient, ctx: RequestContext): Promise<InvoiceListItem[]> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);
  const now = new Date();
  const rows = await db.invoice.findMany({ orderBy: { issueDate: 'desc' } });
  return rows.map((i) => ({
    id: i.id,
    number: i.number,
    customerName: i.customerName,
    customerNuit: i.customerNuit,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    total: Number(i.total),
    amountPaid: Number(i.amountPaid),
    status: i.status as InvoiceStatus,
    displayStatus: displayStatus(i.status as InvoiceStatus, i.dueDate, now),
  }));
}

export async function getInvoice(db: PrismaClient, ctx: RequestContext, id: string): Promise<InvoiceDetail> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);
  const i = await db.invoice.findFirst({
    where: { id },
    include: {
      lines: { orderBy: { id: 'asc' } },
      payments: { orderBy: { paidAt: 'asc' } },
      warehouse: { select: { name: true } },
    },
  });
  if (!i) throw new NotFoundError('Factura não encontrada.');
  const total = Number(i.total);
  const amountPaid = Number(i.amountPaid);
  return {
    id: i.id,
    number: i.number,
    customerId: i.customerId,
    customerName: i.customerName,
    customerNuit: i.customerNuit,
    warehouseName: i.warehouse.name,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    status: i.status as InvoiceStatus,
    displayStatus: displayStatus(i.status as InvoiceStatus, i.dueDate, new Date()),
    subtotal: Number(i.subtotal),
    discountTotal: Number(i.discountTotal),
    taxableBase: Number(i.taxableBase),
    taxTotal: Number(i.taxTotal),
    total,
    amountPaid,
    outstanding: round2(total - amountPaid),
    paymentMethod: (i.paymentMethod as PaymentMethod | null) ?? null,
    notes: i.notes,
    lines: i.lines.map((l) => ({
      id: l.id,
      sku: l.sku,
      description: l.description,
      unitPrice: Number(l.unitPrice),
      quantity: l.quantity,
      discountPercent: Number(l.discountPercent),
      taxRate: Number(l.taxRate),
      total: Number(l.total),
    })),
    payments: i.payments.map((p) => ({
      id: p.id,
      number: p.number,
      amount: Number(p.amount),
      method: p.method as PaymentMethod,
      paidAt: p.paidAt,
    })),
  };
}

export async function invoiceKpis(db: PrismaClient, ctx: RequestContext): Promise<InvoiceKpis> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);
  const now = new Date();
  const rows = await db.invoice.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: { total: true, amountPaid: true, dueDate: true, status: true },
  });
  let invoiced = 0;
  let received = 0;
  let pending = 0;
  let overdue = 0;
  for (const i of rows) {
    const total = Number(i.total);
    const paid = Number(i.amountPaid);
    const out = round2(total - paid);
    invoiced += total;
    received += paid;
    if (out > 0) {
      if (i.dueDate < now) overdue += out;
      else pending += out;
    }
  }
  return { invoiced: round2(invoiced), received: round2(received), pending: round2(pending), overdue: round2(overdue), count: rows.length };
}

/** Extracto de conta-corrente do cliente (saldo inicial + facturas/recibos). */
export async function getCustomerStatement(db: PrismaClient, ctx: RequestContext, customerId: string): Promise<CustomerStatement> {
  requirePermission(ctx, 'clients.view');
  requireCompany(ctx);
  const customer = await db.customer.findFirst({ where: { id: customerId }, select: { balance: true } });
  if (!customer) throw new NotFoundError('Cliente não encontrado.');

  const [invoices, payments] = await Promise.all([
    db.invoice.findMany({ where: { customerId, status: { not: 'CANCELLED' } }, select: { number: true, issueDate: true, total: true } }),
    db.payment.findMany({ where: { customerId }, select: { number: true, paidAt: true, amount: true } }),
  ]);

  type Ev = { date: Date; doc: string; description: string; debit: number; credit: number };
  const events: Ev[] = [
    ...invoices.map((i) => ({ date: i.issueDate, doc: i.number, description: 'Factura de venda', debit: Number(i.total), credit: 0 })),
    ...payments.map((p) => ({ date: p.paidAt, doc: p.number, description: 'Recibo de pagamento', debit: 0, credit: Number(p.amount) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const closingBalance = Number(customer.balance);
  const netDocs = events.reduce((acc, e) => acc + e.debit - e.credit, 0);
  const openingBalance = round2(closingBalance - netDocs);

  let running = openingBalance;
  const rows: StatementRow[] = events.map((e) => {
    running = round2(running + e.debit - e.credit);
    return { date: e.date, doc: e.doc, description: e.description, debit: e.debit, credit: e.credit, balance: running };
  });

  return { openingBalance, rows, closingBalance: round2(closingBalance) };
}

// ─────────────────────────── Mutações ───────────────────────────

async function nextDocNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  prefix: string,
  year: number,
): Promise<string> {
  const key = `${prefix}-${year}`;
  const counter = await tx.documentCounter.upsert({
    where: { companyId_key: { companyId, key } },
    update: { value: { increment: 1 } },
    create: { companyId, key, value: 1 },
  });
  return `${prefix} ${year}/${String(counter.value).padStart(4, '0')}`;
}

const invoiceInput = z.object({
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  customerId: z.string().min(1, 'Seleccione um cliente.'),
  warehouseId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  paymentMethod: z.enum(['CASH', 'MPESA', 'EMOLA', 'CARD', 'TRANSFER']).optional(),
  notes: z.string().trim().max(1000).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().positive('Quantidade inválida.'),
        discountPercent: z.coerce.number().min(0).max(100).default(0),
      }),
    )
    .min(1, 'Adicione pelo menos uma linha.'),
});

export type InvoiceInput = z.input<typeof invoiceInput>;
type ParsedInvoiceInput = z.output<typeof invoiceInput>;

function invoiceFingerprint(data: ParsedInvoiceInput): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    customerId: data.customerId,
    warehouseId: data.warehouseId ?? null,
    dueDate: fpDate(data.dueDate),
    paymentMethod: data.paymentMethod ?? null,
    notes: data.notes ?? null,
    lines: data.lines.map((l) => ({
      productId: l.productId,
      quantity: fpInt(l.quantity),
      discountPercent: fpAmount(l.discountPercent),
    })),
  });
}

function assertConsistentTotals(totals: { taxable: number; tax: number; total: number }): void {
  if (round2(totals.taxable + totals.tax) !== round2(totals.total)) {
    throw new ValidationError('Total da factura inconsistente com incidência e imposto.');
  }
  if (round2(totals.total) <= 0) {
    throw new ValidationError('O total da factura tem de ser maior que zero.');
  }
}

/** Emite uma factura: valida stock, baixa stock (OUT), incrementa o saldo do cliente. */
export async function createInvoice(db: PrismaClient, ctx: RequestContext, input: InvoiceInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'sales.create');
  const companyId = requireCompany(ctx);
  const parsed = invoiceInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const requestFingerprint = invoiceFingerprint(data);

  if (data.lines.some((l) => l.discountPercent > 0) && !hasPermission(ctx, 'sales.approve_discount')) {
    throw new ForbiddenError('Sem permissão para aplicar descontos.');
  }

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'INVOICE_CREATE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'Invoice',
      loadExisting: async (resourceId) => {
        const invoice = await tx.invoice.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
        return invoice;
      },
      run: async () => {
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, companyId } });
        if (!customer) throw new NotFoundError('Cliente não encontrado.');

        const warehouse = data.warehouseId
          ? await tx.warehouse.findFirst({ where: { id: data.warehouseId, companyId, status: 'ACTIVE' } })
          : await tx.warehouse.findFirst({ where: { companyId, status: 'ACTIVE' }, orderBy: { code: 'asc' } });
        if (!warehouse) throw new NotFoundError('Armazém não encontrado.');

        const prepared = [] as Array<{
          productId: string;
          sku: string | null;
          description: string;
          unitPrice: number;
          quantity: number;
          discountPercent: number;
          taxRate: number;
          total: number;
          available: number;
        }>;

        for (const line of data.lines) {
          const product = await tx.product.findFirst({ where: { id: line.productId, companyId } });
          if (!product) throw new NotFoundError('Produto não encontrado.');
          const level = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } } });
          const available = level?.quantity ?? 0;
          if (available < line.quantity) {
            throw new ValidationError(`Stock insuficiente para ${product.name}: disponível ${available}, pedido ${line.quantity}.`);
          }
          const unitPrice = Number(product.salePrice);
          const taxRate = Number(product.taxRate);
          const r = computeLine({ quantity: line.quantity, unitPrice, discountPercent: line.discountPercent, taxPercent: taxRate });
          prepared.push({
            productId: product.id,
            sku: product.sku,
            description: product.name,
            unitPrice,
            quantity: line.quantity,
            discountPercent: line.discountPercent,
            taxRate,
            total: r.total,
            available,
          });
        }

        const totals = computeDocumentTotals(
          prepared.map((p) => ({ quantity: p.quantity, unitPrice: p.unitPrice, discountPercent: p.discountPercent, taxPercent: p.taxRate })),
        );
        assertConsistentTotals(totals);

        const issueDate = new Date();
        const dueDate = data.dueDate ?? new Date(issueDate.getTime() + customer.paymentTermDays * 86_400_000);
        const number = await nextDocNumber(tx, companyId, 'FT', issueDate.getFullYear());

        const invoice = await tx.invoice.create({
          data: {
            companyId,
            branchId: ctx.branchId ?? null,
            number,
            customerId: customer.id,
            customerName: customer.name,
            customerNuit: customer.nuit,
            warehouseId: warehouse.id,
            issueDate,
            dueDate,
            status: 'ISSUED',
            subtotal: totals.subtotal,
            discountTotal: totals.discount,
            taxableBase: totals.taxable,
            taxTotal: totals.tax,
            total: totals.total,
            amountPaid: 0,
            paymentMethod: data.paymentMethod ?? null,
            notes: data.notes ?? null,
            createdBy: ctx.userId,
          },
        });

        for (const p of prepared) {
          await tx.invoiceLine.create({
            data: {
              companyId,
              invoiceId: invoice.id,
              productId: p.productId,
              sku: p.sku,
              description: p.description,
              unitPrice: p.unitPrice,
              quantity: p.quantity,
              discountPercent: p.discountPercent,
              taxRate: p.taxRate,
              total: p.total,
            },
          });
          const balanceAfter = p.available - p.quantity;
          await tx.stockLevel.update({
            where: { productId_warehouseId: { productId: p.productId, warehouseId: warehouse.id } },
            data: { quantity: balanceAfter },
          });
          await tx.stockMovement.create({
            data: {
              companyId,
              productId: p.productId,
              warehouseId: warehouse.id,
              type: 'OUT',
              quantity: -p.quantity,
              balanceAfter,
              document: number,
              reason: 'Venda',
              createdBy: ctx.userId,
            },
          });
        }

        await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: totals.total } } });

        const ar = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_RECEIVABLE');
        const revenue = await getMappedAccountTx(tx, companyId, 'SALES_REVENUE');
        const lines = [
          { ledgerAccountId: ar.id, debit: totals.total, customerId: customer.id, description: `Factura emitida ${number}` },
          { ledgerAccountId: revenue.id, credit: totals.tax > 0 ? totals.taxable : totals.total, description: `Factura emitida ${number}` },
        ];
        if (totals.tax > 0) {
          const vat = await getMappedAccountTx(tx, companyId, 'VAT_OUTPUT');
          lines.push({ ledgerAccountId: vat.id, credit: totals.tax, description: `Factura emitida ${number}` });
        }

        await postAccountingEventTx(tx, ctx, {
          journalType: 'SALES',
          entryDate: invoice.issueDate,
          description: `Factura emitida ${number}`,
          reference: number,
          origin: { sourceType: 'INVOICE', sourceId: invoice.id, accountingEvent: 'SALE_ISSUED' },
          lines,
        });

        await writeAudit(tx, ctx, {
          action: 'invoice.issue',
          entity: 'Invoice',
          entityId: invoice.id,
          newValues: {
            number,
            customerId: customer.id,
            customer: customer.name,
            total: totals.total,
            taxableBase: totals.taxable,
            taxTotal: totals.tax,
            idempotencyKey: data.idempotencyKey,
            accounting: { sourceType: 'INVOICE', accountingEvent: 'SALE_ISSUED' },
          },
        });

        return { resourceType: 'Invoice', resourceId: invoice.id, result: { id: invoice.id, number } };
      },
    });
    return op.result;
  });
}

const paymentInput = z.object({
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  invoiceId: z.string().min(1, 'Factura inválida.'),
  amount: z.coerce.number().positive('O valor deve ser positivo.'),
  method: z.enum(['CASH', 'MPESA', 'EMOLA', 'CARD', 'TRANSFER']).default('CASH'),
  accountId: z.string().min(1, 'Seleccione a conta de caixa, banco ou carteira móvel para concluir o pagamento.'),
  notes: z.string().trim().max(500).optional(),
});

export type PaymentInput = z.input<typeof paymentInput>;
type ParsedPaymentInput = z.output<typeof paymentInput>;

function paymentFingerprint(data: ParsedPaymentInput): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    invoiceId: data.invoiceId,
    amount: fpAmount(round2(data.amount)),
    method: data.method,
    accountId: data.accountId,
    notes: data.notes ?? null,
  });
}

function journalTypeForTreasury(type: 'CASH' | 'BANK' | 'MOBILE' | 'OTHER'): AccountingJournalType {
  if (type === 'CASH') return 'CASH';
  if (type === 'BANK' || type === 'MOBILE') return 'BANK';
  throw new ValidationError('A conta financeira seleccionada não possui uma regra de diário contabilístico.');
}

/** Regista um recibo: baixa o saldo do cliente e marca a factura paga/parcial. */
export async function createPayment(db: PrismaClient, ctx: RequestContext, input: PaymentInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'payments.receive');
  const companyId = requireCompany(ctx);
  const parsed = paymentInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const amount = round2(data.amount);
  const requestFingerprint = paymentFingerprint(data);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'CUSTOMER_PAYMENT_CREATE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'Payment',
      loadExisting: async (resourceId) => {
        const payment = await tx.payment.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
        if (!payment) return null;
        const [movement, entry] = await Promise.all([
          tx.treasuryMovement.findFirst({ where: { companyId, sourceType: 'RECEIPT', sourceId: payment.id, movementPurpose: 'RECEIPT_IN' }, select: { id: true } }),
          tx.journalEntry.findFirst({ where: { companyId, sourceType: 'CUSTOMER_PAYMENT', sourceId: payment.id, accountingEvent: 'RECEIPT_POSTED' }, select: { id: true } }),
        ]);
        if (!movement || !entry) {
          throw new ConflictError('Registo de idempotência aponta para um recibo incompleto (integridade).');
        }
        return payment;
      },
      run: async () => {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${data.invoiceId} AND "companyId" = ${companyId} FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({ where: { id: data.invoiceId, companyId } });
        if (!invoice) throw new NotFoundError('Factura não encontrada.');
        if (invoice.status === 'CANCELLED') throw new ConflictError('A factura está cancelada.');
        const total = Number(invoice.total);
        const paid = Number(invoice.amountPaid);
        const outstanding = round2(total - paid);
        if (outstanding <= 0) throw new ConflictError('A factura já está totalmente paga.');
        if (amount > outstanding) throw new ValidationError(`O valor excede o saldo em dívida (${outstanding.toFixed(2)} MT).`);

        const treasury = await resolveTreasuryLedgerTx(tx, companyId, data.accountId);
        const journalType = journalTypeForTreasury(treasury.treasuryType);
        const ar = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_RECEIVABLE');

        const number = await nextDocNumber(tx, companyId, 'REC', new Date().getFullYear());
        const payment = await tx.payment.create({
          data: {
            companyId,
            number,
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            amount,
            method: data.method,
            notes: data.notes ?? null,
            createdBy: ctx.userId,
          },
        });

        const newPaid = round2(paid + amount);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaid: newPaid, status: newPaid >= total ? 'PAID' : 'PARTIAL' },
        });
        await tx.customer.update({ where: { id: invoice.customerId }, data: { balance: { decrement: amount } } });

        const treasuryMovement = await postTreasuryMovementTx(tx, companyId, ctx.userId, {
          accountId: data.accountId,
          flow: 'IN',
          amount,
          category: 'Recibo',
          description: `Recibo ${number} — ${invoice.customerName}`,
          document: number,
          source: 'RECEIPT',
          sourceType: 'RECEIPT',
          sourceId: payment.id,
          movementPurpose: 'RECEIPT_IN',
          occurredAt: payment.paidAt,
        });

        await postAccountingEventTx(tx, ctx, {
          journalType,
          entryDate: payment.paidAt,
          description: `Recebimento de cliente ${number}`,
          reference: number,
          origin: { sourceType: 'CUSTOMER_PAYMENT', sourceId: payment.id, accountingEvent: 'RECEIPT_POSTED' },
          lines: [
            { ledgerAccountId: treasury.ledgerAccountId, debit: amount, treasuryAccountId: treasury.treasuryAccountId, description: `Recebimento de cliente ${number}` },
            { ledgerAccountId: ar.id, credit: amount, customerId: invoice.customerId, description: `Recebimento de cliente ${number}` },
          ],
        });

        await writeAudit(tx, ctx, {
          action: 'payment.receive',
          entity: 'Payment',
          entityId: payment.id,
          newValues: {
            number,
            invoice: invoice.number,
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            amount,
            treasuryAccountId: data.accountId,
            treasuryMovementId: treasuryMovement.movementId,
            idempotencyKey: data.idempotencyKey,
            accounting: { sourceType: 'CUSTOMER_PAYMENT', accountingEvent: 'RECEIPT_POSTED', journalType },
          },
        });

        return { resourceType: 'Payment', resourceId: payment.id, result: { id: payment.id, number } };
      },
    });
    return op.result;
  });
}
