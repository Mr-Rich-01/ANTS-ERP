import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import { civilDateInTimeZone, computeLine, computeDocumentTotals, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission, hasPermission } from './permissions';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';
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
  status: 'ACTIVE' | 'REVERSED';
  reversedAt: Date | null;
  reversalReason: string | null;
  treasuryAccountId: string | null;
  treasuryAccountName: string | null;
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
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancellationReason: string | null;
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
  const paymentIds = i.payments.map((p) => p.id);
  const paymentMovements = paymentIds.length
    ? await db.treasuryMovement.findMany({
        where: { sourceType: 'RECEIPT', sourceId: { in: paymentIds }, movementPurpose: 'RECEIPT_IN' },
        include: { account: { select: { id: true, name: true } } },
      })
    : [];
  const movementByPayment = new Map(paymentMovements.map((m) => [m.sourceId, m]));
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
    cancelledAt: i.cancelledAt,
    cancelledById: i.cancelledById,
    cancellationReason: i.cancellationReason,
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
      status: p.status as 'ACTIVE' | 'REVERSED',
      reversedAt: p.reversedAt,
      reversalReason: p.reversalReason,
      treasuryAccountId: movementByPayment.get(p.id)?.account.id ?? null,
      treasuryAccountName: movementByPayment.get(p.id)?.account.name ?? null,
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
    db.payment.findMany({ where: { customerId, status: 'ACTIVE' }, select: { number: true, paidAt: true, amount: true } }),
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
  issueDate: z.string().min(1, 'Seleccione a data de emissão.'),
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

function invoiceFingerprint(data: ParsedInvoiceInput, issueDate: Date): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    issueDate: fpDate(issueDate),
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

function resolveAllowedIssueDate(value: string): Date {
  const requestedDate = parseAccountingDate(value);
  const currentDate = civilDateInTimeZone();
  if (formatAccountingDate(requestedDate) !== currentDate) {
    throw new ValidationError('A data de emissão deve ser a data actual em Africa/Maputo.');
  }
  return parseAccountingDate(currentDate);
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
  const issueDate = resolveAllowedIssueDate(data.issueDate);
  const requestFingerprint = invoiceFingerprint(data, issueDate);

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

        const dueDate = data.dueDate ?? new Date(issueDate.getTime() + customer.paymentTermDays * 86_400_000);
        const number = await nextDocNumber(tx, companyId, 'FT', issueDate.getUTCFullYear());

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
              invoiceId: invoice.id,
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
          dateLabel: 'A data de emissão',
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
            issueDate: formatAccountingDate(invoice.issueDate),
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

export const POS_FINAL_CUSTOMER_ID = '__POS_FINAL_CUSTOMER__';

const posSaleInput = z.object({
  invoiceIdempotencyKey: z.string().min(1, 'Chave de idempotência da factura obrigatória.'),
  paymentIdempotencyKey: z.string().min(1, 'Chave de idempotência do recibo obrigatória.'),
  issueDate: z.string().min(1, 'Seleccione a data de emissão.'),
  customerId: z.string().min(1, 'Seleccione um cliente.'),
  warehouseId: z.string().min(1, 'Seleccione o armazém de saída.'),
  accountId: z.string().trim().optional(),
  paymentMethod: z.enum(['CASH', 'MPESA', 'EMOLA', 'CARD', 'TRANSFER']).default('CASH'),
  notes: z.string().trim().max(1000).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().positive('Quantidade inválida.'),
        discountPercent: z.coerce.number().min(0).max(100).default(0),
      }),
    )
    .min(1, 'Carrinho vazio. Adicione pelo menos um produto.'),
});

export type PosSaleInput = z.input<typeof posSaleInput>;

export interface PosSaleResult {
  invoiceId: string;
  invoiceNumber: string;
  paymentId: string;
  paymentNumber: string;
}

type PosTreasuryCandidate = {
  id: string;
  name: string;
  type: 'CASH' | 'BANK' | 'MOBILE' | 'OTHER';
  ledgerAccountId: string | null;
};

function normaliseTreasuryName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function pickSinglePreferred(candidates: PosTreasuryCandidate[], preferredPattern: RegExp, ambiguousMessage: string): PosTreasuryCandidate {
  if (candidates.length === 1) return candidates[0]!;
  const preferred = candidates.filter((account) => preferredPattern.test(normaliseTreasuryName(account.name)));
  if (preferred.length === 1) return preferred[0]!;
  throw new ValidationError(ambiguousMessage);
}

async function resolvePosTreasuryAccountIdTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  paymentMethod: PaymentMethod,
  requestedAccountId?: string,
): Promise<string> {
  if (requestedAccountId) return requestedAccountId;
  if (paymentMethod === 'TRANSFER') throw new ValidationError('O POS V1 aceita apenas Dinheiro, M-Pesa, e-Mola ou Cartao.');

  const accounts = (await tx.treasuryAccount.findMany({
    where: { companyId, status: 'ACTIVE', type: { in: ['CASH', 'BANK', 'MOBILE'] }, ledgerAccountId: { not: null } },
    orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, type: true, ledgerAccountId: true },
  })) as PosTreasuryCandidate[];

  if (paymentMethod === 'CASH') {
    const cash = accounts.filter((account) => account.type === 'CASH');
    if (cash.length === 0) throw new ValidationError('Nao existe conta de caixa activa e configurada para pagamentos em Dinheiro.');
    return pickSinglePreferred(cash, /\b(caixa principal|principal|default|padrao)\b/, 'Existe mais de uma conta de caixa. Defina uma conta principal/default ou uma configuracao sem ambiguidade.').id;
  }

  if (paymentMethod === 'CARD') {
    const bank = accounts.filter((account) => account.type === 'BANK');
    if (bank.length === 0) throw new ValidationError('Nao existe conta bancaria activa e configurada para pagamentos por Cartao.');
    return pickSinglePreferred(bank, /\b(cartao|card|pos|banco principal|principal|default|padrao)\b/, 'Existe mais de uma conta bancaria possivel para Cartao. Defina uma conta principal/default ou uma conta de cartao sem ambiguidade.').id;
  }

  const walletName = paymentMethod === 'MPESA' ? 'M-Pesa' : 'e-Mola';
  const walletPattern = paymentMethod === 'MPESA' ? /\bm-?pesa\b/ : /\be-?mola\b/;
  const wallet = accounts.filter((account) => account.type === 'MOBILE' && walletPattern.test(normaliseTreasuryName(account.name)));
  if (wallet.length === 0) throw new ValidationError(`Nao existe conta de tesouraria activa e configurada para ${walletName}.`);
  return pickSinglePreferred(wallet, /\b(principal|default|padrao)\b/, `Existe mais de uma conta ${walletName}. Defina uma conta principal/default para evitar ambiguidade.`).id;
}

async function resolvePosCustomerTx(
  tx: Prisma.TransactionClient,
  ctx: RequestContext,
  companyId: string,
  customerId: string,
): Promise<{ id: string; name: string; nuit: string | null; paymentTermDays: number }> {
  if (customerId !== POS_FINAL_CUSTOMER_ID) {
    const customer = await tx.customer.findFirst({ where: { companyId, id: customerId, status: 'ACTIVE' } });
    if (!customer) throw new NotFoundError('Cliente inválido ou inactivo.');
    return { id: customer.id, name: customer.name, nuit: customer.nuit, paymentTermDays: customer.paymentTermDays };
  }

  const existing = await tx.customer.findFirst({
    where: { companyId, name: 'Cliente final', status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return { id: existing.id, name: existing.name, nuit: existing.nuit, paymentTermDays: existing.paymentTermDays };

  const created = await tx.customer.create({
    data: {
      companyId,
      name: 'Cliente final',
      type: 'INDIVIDUAL',
      paymentTermDays: 0,
      creditLimit: 0,
      notes: 'Cliente operacional criado automaticamente pelo POS.',
      createdBy: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, {
    action: 'customer.final_create',
    entity: 'Customer',
    entityId: created.id,
    newValues: { name: created.name, source: 'POS' },
  });
  return { id: created.id, name: created.name, nuit: created.nuit, paymentTermDays: created.paymentTermDays };
}

/** Finaliza uma venda POS simples: factura + recibo, atomicos na mesma transaccao. */
export async function createPosSale(db: PrismaClient, ctx: RequestContext, input: PosSaleInput): Promise<PosSaleResult> {
  requirePermission(ctx, 'sales.create');
  requirePermission(ctx, 'payments.receive');
  const companyId = requireCompany(ctx);
  const parsed = posSaleInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const issueDate = resolveAllowedIssueDate(data.issueDate);

  if (data.lines.some((l) => l.discountPercent > 0) && !hasPermission(ctx, 'sales.approve_discount')) {
    throw new ForbiddenError('Sem permissão para aplicar descontos.');
  }

  return db.$transaction(async (tx) => {
    const customer = await resolvePosCustomerTx(tx, ctx, companyId, data.customerId);
    const invoiceData: ParsedInvoiceInput = {
      idempotencyKey: data.invoiceIdempotencyKey,
      issueDate: data.issueDate,
      customerId: customer.id,
      warehouseId: data.warehouseId,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      lines: data.lines,
    };
    const invoiceRequestFingerprint = invoiceFingerprint(invoiceData, issueDate);

    const invoiceOp = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'INVOICE_CREATE',
      idempotencyKey: invoiceData.idempotencyKey,
      requestFingerprint: invoiceRequestFingerprint,
      expectedResourceType: 'Invoice',
      loadExisting: async (resourceId) => {
        const invoice = await tx.invoice.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
        return invoice;
      },
      run: async () => {
        const warehouse = await tx.warehouse.findFirst({ where: { id: invoiceData.warehouseId, companyId, status: 'ACTIVE' } });
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

        for (const line of invoiceData.lines) {
          const product = await tx.product.findFirst({ where: { id: line.productId, companyId, status: 'ACTIVE' } });
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

        const dueDate = new Date(issueDate.getTime() + customer.paymentTermDays * 86_400_000);
        const number = await nextDocNumber(tx, companyId, 'FT', issueDate.getUTCFullYear());
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
            paymentMethod: invoiceData.paymentMethod ?? null,
            notes: invoiceData.notes ?? null,
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
              invoiceId: invoice.id,
              type: 'OUT',
              quantity: -p.quantity,
              balanceAfter,
              document: number,
              reason: 'Venda POS',
              createdBy: ctx.userId,
            },
          });
        }

        await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: totals.total } } });

        const ar = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_RECEIVABLE');
        const revenue = await getMappedAccountTx(tx, companyId, 'SALES_REVENUE');
        const lines = [
          { ledgerAccountId: ar.id, debit: totals.total, customerId: customer.id, description: `Factura POS ${number}` },
          { ledgerAccountId: revenue.id, credit: totals.tax > 0 ? totals.taxable : totals.total, description: `Factura POS ${number}` },
        ];
        if (totals.tax > 0) {
          const vat = await getMappedAccountTx(tx, companyId, 'VAT_OUTPUT');
          lines.push({ ledgerAccountId: vat.id, credit: totals.tax, description: `Factura POS ${number}` });
        }

        await postAccountingEventTx(tx, ctx, {
          journalType: 'SALES',
          entryDate: invoice.issueDate,
          dateLabel: 'A data de emissão',
          description: `Factura POS ${number}`,
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
            issueDate: formatAccountingDate(invoice.issueDate),
            total: totals.total,
            taxableBase: totals.taxable,
            taxTotal: totals.tax,
            idempotencyKey: invoiceData.idempotencyKey,
            source: 'POS',
            accounting: { sourceType: 'INVOICE', accountingEvent: 'SALE_ISSUED' },
          },
        });

        return { resourceType: 'Invoice', resourceId: invoice.id, result: { id: invoice.id, number } };
      },
    });

    const invoice = await tx.invoice.findFirst({
      where: { companyId, id: invoiceOp.result.id },
      select: { id: true, number: true, total: true },
    });
    if (!invoice) throw new NotFoundError('Factura POS não encontrada após emissão.');

    const accountId = await resolvePosTreasuryAccountIdTx(tx, companyId, data.paymentMethod, data.accountId);
    const paymentData: ParsedPaymentInput = {
      idempotencyKey: data.paymentIdempotencyKey,
      invoiceId: invoice.id,
      amount: round2(Number(invoice.total)),
      method: data.paymentMethod,
      accountId,
      notes: data.notes ? `POS: ${data.notes}` : 'POS',
    };
    const amount = round2(paymentData.amount);
    const paymentRequestFingerprint = paymentFingerprint(paymentData);

    const paymentOp = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'CUSTOMER_PAYMENT_CREATE',
      idempotencyKey: paymentData.idempotencyKey,
      requestFingerprint: paymentRequestFingerprint,
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
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${paymentData.invoiceId} AND "companyId" = ${companyId} FOR UPDATE`;
        const paidInvoice = await tx.invoice.findFirst({ where: { id: paymentData.invoiceId, companyId } });
        if (!paidInvoice) throw new NotFoundError('Factura não encontrada.');
        if (paidInvoice.status === 'CANCELLED') throw new ConflictError('A factura está cancelada.');
        const total = Number(paidInvoice.total);
        const paid = Number(paidInvoice.amountPaid);
        const outstanding = round2(total - paid);
        if (outstanding <= 0) throw new ConflictError('A factura já está totalmente paga.');
        if (amount > outstanding) throw new ValidationError(`O valor excede o saldo em dívida (${outstanding.toFixed(2)} MT).`);

        const treasury = await resolveTreasuryLedgerTx(tx, companyId, paymentData.accountId);
        const journalType = journalTypeForTreasury(treasury.treasuryType);
        const ar = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_RECEIVABLE');

        const number = await nextDocNumber(tx, companyId, 'REC', new Date().getFullYear());
        const payment = await tx.payment.create({
          data: {
            companyId,
            number,
            invoiceId: paidInvoice.id,
            customerId: paidInvoice.customerId,
            amount,
            method: paymentData.method,
            notes: paymentData.notes ?? null,
            createdBy: ctx.userId,
          },
        });

        const newPaid = round2(paid + amount);
        await tx.invoice.update({
          where: { id: paidInvoice.id },
          data: { amountPaid: newPaid, status: newPaid >= total ? 'PAID' : 'PARTIAL' },
        });
        await tx.customer.update({ where: { id: paidInvoice.customerId }, data: { balance: { decrement: amount } } });

        const treasuryMovement = await postTreasuryMovementTx(tx, companyId, ctx.userId, {
          accountId: paymentData.accountId,
          flow: 'IN',
          amount,
          category: 'Recibo',
          description: `Recibo POS ${number} - ${paidInvoice.customerName}`,
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
          description: `Recebimento POS ${number}`,
          reference: number,
          origin: { sourceType: 'CUSTOMER_PAYMENT', sourceId: payment.id, accountingEvent: 'RECEIPT_POSTED' },
          lines: [
            { ledgerAccountId: treasury.ledgerAccountId, debit: amount, treasuryAccountId: treasury.treasuryAccountId, description: `Recebimento POS ${number}` },
            { ledgerAccountId: ar.id, credit: amount, customerId: paidInvoice.customerId, description: `Recebimento POS ${number}` },
          ],
        });

        await writeAudit(tx, ctx, {
          action: 'payment.receive',
          entity: 'Payment',
          entityId: payment.id,
          newValues: {
            number,
            invoice: paidInvoice.number,
            invoiceId: paidInvoice.id,
            customerId: paidInvoice.customerId,
            amount,
            treasuryAccountId: paymentData.accountId,
            treasuryMovementId: treasuryMovement.movementId,
            idempotencyKey: paymentData.idempotencyKey,
            source: 'POS',
            accounting: { sourceType: 'CUSTOMER_PAYMENT', accountingEvent: 'RECEIPT_POSTED', journalType },
          },
        });

        return { resourceType: 'Payment', resourceId: payment.id, result: { id: payment.id, number } };
      },
    });

    return {
      invoiceId: invoiceOp.result.id,
      invoiceNumber: invoiceOp.result.number,
      paymentId: paymentOp.result.id,
      paymentNumber: paymentOp.result.number,
    };
  });
}

const reverseCustomerPaymentInput = z.object({
  paymentId: z.string().min(1, 'Recebimento inválido.'),
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  reversalReason: z.string(),
  reversalDate: z.string().min(1, 'Data da anulação obrigatória.'),
});

export type ReverseCustomerPaymentInput = z.input<typeof reverseCustomerPaymentInput>;

export interface ReverseCustomerPaymentResult {
  id: string;
  number: string;
  reversalDate: string;
  treasuryReversalId: string | null;
  accountingReversalId: string | null;
}

function paymentReversalFingerprint(companyId: string, paymentId: string, reversalDate: Date, reversalReason: string): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    paymentId,
    reversalDate: fpDate(reversalDate),
    reversalReason,
  });
}

function statusForPaidAmount(amountPaid: number, total: number): InvoiceStatus {
  if (amountPaid <= 0) return 'ISSUED';
  if (amountPaid >= total) return 'PAID';
  return 'PARTIAL';
}

function resolveAllowedReversalDate(value: string): Date {
  const requestedDate = parseAccountingDate(value);
  const currentDate = civilDateInTimeZone();
  if (formatAccountingDate(requestedDate) !== currentDate) {
    throw new ValidationError('A data da anulação deve ser a data actual em Africa/Maputo.');
  }
  return parseAccountingDate(currentDate);
}

const cancelInvoiceInput = z.object({
  invoiceId: z.string().min(1, 'Factura inválida.'),
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  cancellationReason: z.string(),
  cancellationDate: z.string().min(1, 'Data do cancelamento obrigatória.'),
});

export type CancelInvoiceInput = z.input<typeof cancelInvoiceInput>;

export interface CancelInvoiceResult {
  id: string;
  number: string;
  cancellationDate: string;
  stockReversalIds: string[];
  accountingReversalId: string | null;
}

function invoiceCancellationFingerprint(companyId: string, invoiceId: string, cancellationDate: Date, cancellationReason: string): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    invoiceId,
    cancellationDate: fpDate(cancellationDate),
    cancellationReason,
  });
}

function resolveAllowedCancellationDate(value: string): Date {
  const requestedDate = parseAccountingDate(value);
  const currentDate = civilDateInTimeZone();
  if (formatAccountingDate(requestedDate) !== currentDate) {
    throw new ValidationError('A data do cancelamento deve ser a data actual em Africa/Maputo.');
  }
  return parseAccountingDate(currentDate);
}

function legacyStockTraceabilityError(): ConflictError {
  return new ConflictError('Esta factura foi criada antes da rastreabilidade necessária para cancelamento automático. Requer revisão administrativa.');
}

function sumLineQuantitiesByProduct(lines: Array<{ productId: string | null; quantity: number }>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!line.productId) continue;
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  }
  return totals;
}

function sumMovementQuantitiesByProduct(movements: Array<{ productId: string; quantity: number }>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const movement of movements) {
    totals.set(movement.productId, (totals.get(movement.productId) ?? 0) + Math.abs(movement.quantity));
  }
  return totals;
}

async function loadCompletedInvoiceCancellation(tx: Prisma.TransactionClient, companyId: string, invoiceId: string, cancellationDate: Date): Promise<CancelInvoiceResult | null> {
  const invoice = await tx.invoice.findFirst({ where: { companyId, id: invoiceId }, select: { id: true, number: true, status: true } });
  if (!invoice) return null;
  if (invoice.status !== 'CANCELLED') throw new ConflictError('Registo de idempotência aponta para uma factura não cancelada (integridade).');

  const [originalMovements, originalEntry] = await Promise.all([
    tx.stockMovement.findMany({ where: { companyId, invoiceId: invoice.id, type: 'OUT' }, select: { id: true } }),
    tx.journalEntry.findFirst({ where: { companyId, sourceType: 'INVOICE', sourceId: invoice.id, accountingEvent: 'SALE_ISSUED' }, select: { id: true } }),
  ]);
  if (!originalEntry) throw new ConflictError('Registo de idempotência aponta para um cancelamento sem lançamento contabilístico original (integridade).');

  const [stockReversals, accountingReversal] = await Promise.all([
    originalMovements.length
      ? tx.stockMovement.findMany({ where: { companyId, reversesId: { in: originalMovements.map((m) => m.id) } }, select: { id: true, reversesId: true } })
      : Promise.resolve([]),
    tx.journalEntry.findFirst({ where: { companyId, reversalOfId: originalEntry.id }, select: { id: true } }),
  ]);
  if (stockReversals.length !== originalMovements.length || !accountingReversal) {
    throw new ConflictError('Registo de idempotência aponta para um cancelamento incompleto (integridade).');
  }
  return {
    id: invoice.id,
    number: invoice.number,
    cancellationDate: formatAccountingDate(cancellationDate),
    stockReversalIds: stockReversals.map((m) => m.id),
    accountingReversalId: accountingReversal.id,
  };
}

export async function cancelInvoice(db: PrismaClient, ctx: RequestContext, input: CancelInvoiceInput): Promise<CancelInvoiceResult> {
  requirePermission(ctx, 'invoices.cancel');
  const companyId = requireCompany(ctx);
  const parsed = cancelInvoiceInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const cancellationReason = validateReversalReason(data.cancellationReason);
  const cancellationDate = resolveAllowedCancellationDate(data.cancellationDate);
  const requestFingerprint = invoiceCancellationFingerprint(companyId, data.invoiceId, cancellationDate, cancellationReason);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<CancelInvoiceResult>(tx, ctx, {
      scope: 'INVOICE_CANCEL',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'Invoice',
      loadExisting: (resourceId) => loadCompletedInvoiceCancellation(tx, companyId, resourceId, cancellationDate),
      run: async () => {
        await validateOpenReversalDateTx(tx, companyId, cancellationDate);
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${data.invoiceId} AND "companyId" = ${companyId} FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({ where: { companyId, id: data.invoiceId } });
        if (!invoice) throw new NotFoundError('Factura não encontrada.');
        if (invoice.status === 'CANCELLED') throw new ConflictError('Esta factura já foi cancelada.');

        const activePayments = await tx.payment.findMany({
          where: { companyId, invoiceId: invoice.id, status: 'ACTIVE' },
          select: { id: true },
        });
        if (activePayments.length > 0) {
          throw new ConflictError('Esta factura possui recebimentos activos. Anule primeiro os respectivos recibos.');
        }
        if (round2(Number(invoice.amountPaid)) !== 0) {
          throw new ConflictError('Integridade: factura sem recebimentos activos mas com valor pago diferente de zero.');
        }

        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${invoice.customerId} AND "companyId" = ${companyId} FOR UPDATE`;
        const customer = await tx.customer.findFirst({ where: { companyId, id: invoice.customerId } });
        if (!customer) throw new NotFoundError('Cliente da factura não encontrado.');

        const [lines, stockMovements, originalEntry] = await Promise.all([
          tx.invoiceLine.findMany({ where: { companyId, invoiceId: invoice.id }, select: { id: true, productId: true, quantity: true } }),
          tx.stockMovement.findMany({ where: { companyId, invoiceId: invoice.id, type: 'OUT' }, orderBy: { createdAt: 'asc' } }),
          tx.journalEntry.findFirst({ where: { companyId, sourceType: 'INVOICE', sourceId: invoice.id, accountingEvent: 'SALE_ISSUED' }, select: { id: true } }),
        ]);
        if (!originalEntry) throw new NotFoundError('Lançamento contabilístico SALE_ISSUED da factura não encontrado.');

        const lineQuantities = sumLineQuantitiesByProduct(lines);
        const movementQuantities = sumMovementQuantitiesByProduct(stockMovements);
        for (const [productId, quantity] of lineQuantities) {
          if ((movementQuantities.get(productId) ?? 0) !== quantity) throw legacyStockTraceabilityError();
        }
        for (const movement of stockMovements) {
          if (movement.quantity >= 0) throw new ConflictError('Integridade: movimento de stock da venda não é uma saída.');
          if (!lineQuantities.has(movement.productId)) throw new ConflictError('Integridade: movimento de stock não corresponde às linhas da factura.');
        }

        const existingStockReversal = stockMovements.length
          ? await tx.stockMovement.findFirst({ where: { companyId, reversesId: { in: stockMovements.map((m) => m.id) } }, select: { id: true } })
          : null;
        if (existingStockReversal) throw new ConflictError('Esta factura já possui movimentos de stock compensatórios.');

        for (const movement of stockMovements) {
          await tx.$queryRaw`
            SELECT id
            FROM stock_levels
            WHERE "companyId" = ${companyId}
              AND "productId" = ${movement.productId}
              AND "warehouseId" = ${movement.warehouseId}
            FOR UPDATE
          `;
        }
        const stockReversalIds: string[] = [];
        for (const movement of stockMovements) {
          const level = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId: movement.productId, warehouseId: movement.warehouseId } } });
          if (!level || level.companyId !== companyId) throw new ConflictError('Integridade: nível de stock da factura não encontrado.');
          const quantity = Math.abs(movement.quantity);
          const balanceAfter = level.quantity + quantity;
          await tx.stockLevel.update({
            where: { productId_warehouseId: { productId: movement.productId, warehouseId: movement.warehouseId } },
            data: { quantity: balanceAfter },
          });
          const reversal = await tx.stockMovement.create({
            data: {
              companyId,
              productId: movement.productId,
              warehouseId: movement.warehouseId,
              invoiceId: invoice.id,
              reversesId: movement.id,
              type: 'IN',
              quantity,
              balanceAfter,
              document: invoice.number,
              reason: `Cancelamento da factura ${invoice.number}`,
              createdBy: ctx.userId,
            },
          });
          stockReversalIds.push(reversal.id);
        }

        const total = round2(Number(invoice.total));
        const customerBalanceBefore = round2(Number(customer.balance));
        const updatedCustomer = await tx.customer.update({ where: { id: customer.id }, data: { balance: { decrement: total } } });
        const customerBalanceAfter = round2(Number(updatedCustomer.balance));

        const accountingReversal = await reverseAccountingEventTx(tx, ctx, {
          origin: { sourceType: 'INVOICE', sourceId: invoice.id, accountingEvent: 'SALE_ISSUED' },
          reversalDate: cancellationDate,
          reason: cancellationReason,
          operationalReference: invoice.number,
        });

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: ctx.userId,
            cancellationReason,
          },
        });

        await writeAudit(tx, ctx, {
          action: 'invoice.cancel',
          entity: 'Invoice',
          entityId: invoice.id,
          oldValues: {
            status: invoice.status,
            amountPaid: Number(invoice.amountPaid),
            customerBalance: customerBalanceBefore,
          },
          newValues: {
            status: 'CANCELLED',
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            customerId: invoice.customerId,
            total,
            cancellationReason,
            cancellationDate: formatAccountingDate(cancellationDate),
            idempotencyKey: data.idempotencyKey,
            customerBalanceBefore,
            customerBalanceAfter,
            stockMovementOriginalIds: stockMovements.map((m) => m.id),
            stockMovementReversalIds: stockReversalIds,
            journalEntryOriginalId: originalEntry.id,
            journalEntryReversalId: accountingReversal.reversalId,
          },
        });

        return {
          resourceType: 'Invoice',
          resourceId: invoice.id,
          result: {
            id: invoice.id,
            number: invoice.number,
            cancellationDate: formatAccountingDate(cancellationDate),
            stockReversalIds,
            accountingReversalId: accountingReversal.reversalId,
          },
        };
      },
    });
    return op.result;
  });
}

export async function reverseCustomerPayment(db: PrismaClient, ctx: RequestContext, input: ReverseCustomerPaymentInput): Promise<ReverseCustomerPaymentResult> {
  requirePermission(ctx, 'payments.cancel');
  const companyId = requireCompany(ctx);
  const parsed = reverseCustomerPaymentInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const reversalReason = validateReversalReason(data.reversalReason);
  const reversalDate = resolveAllowedReversalDate(data.reversalDate);
  const requestFingerprint = paymentReversalFingerprint(companyId, data.paymentId, reversalDate, reversalReason);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<ReverseCustomerPaymentResult>(tx, ctx, {
      scope: 'CUSTOMER_PAYMENT_REVERSE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'Payment',
      loadExisting: async (resourceId) => {
        const payment = await tx.payment.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true, status: true } });
        if (!payment) return null;
        if (payment.status !== 'REVERSED') throw new ConflictError('Registo de idempotência aponta para um recebimento ainda activo (integridade).');
        const [originalMovement, originalEntry] = await Promise.all([
          tx.treasuryMovement.findFirst({ where: { companyId, sourceType: 'RECEIPT', sourceId: payment.id, movementPurpose: 'RECEIPT_IN' }, select: { id: true } }),
          tx.journalEntry.findFirst({ where: { companyId, sourceType: 'CUSTOMER_PAYMENT', sourceId: payment.id, accountingEvent: 'RECEIPT_POSTED' }, select: { id: true } }),
        ]);
        if (!originalMovement || !originalEntry) throw new ConflictError('Registo de idempotência aponta para uma anulação incompleta (integridade).');
        const [treasuryReversal, accountingReversal] = await Promise.all([
          tx.treasuryMovement.findFirst({ where: { companyId, reversesId: originalMovement.id }, select: { id: true } }),
          tx.journalEntry.findFirst({ where: { companyId, reversalOfId: originalEntry.id }, select: { id: true } }),
        ]);
        if (!treasuryReversal || !accountingReversal) throw new ConflictError('Registo de idempotência aponta para uma anulação incompleta (integridade).');
        return { id: payment.id, number: payment.number, reversalDate: formatAccountingDate(reversalDate), treasuryReversalId: treasuryReversal.id, accountingReversalId: accountingReversal.id };
      },
      run: async () => {
        await validateOpenReversalDateTx(tx, companyId, reversalDate);
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${data.paymentId} AND "companyId" = ${companyId} FOR UPDATE`;
        const payment = await tx.payment.findFirst({ where: { companyId, id: data.paymentId } });
        if (!payment) throw new NotFoundError('Recebimento não encontrado.');
        if (payment.status === 'REVERSED') throw new ConflictError('Este recebimento já foi anulado.');
        if (!payment.invoiceId) throw new ConflictError('Recebimento sem factura de origem (integridade).');

        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${payment.invoiceId} AND "companyId" = ${companyId} FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({ where: { companyId, id: payment.invoiceId } });
        if (!invoice) throw new NotFoundError('Factura do recebimento não encontrada.');
        if (invoice.status === 'CANCELLED') throw new ConflictError('A factura do recebimento está cancelada.');
        if (invoice.customerId !== payment.customerId) throw new ConflictError('Recebimento e factura apontam para clientes diferentes (integridade).');

        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${payment.customerId} AND "companyId" = ${companyId} FOR UPDATE`;
        const customer = await tx.customer.findFirst({ where: { companyId, id: payment.customerId } });
        if (!customer) throw new NotFoundError('Cliente do recebimento não encontrado.');

        const movements = await tx.treasuryMovement.findMany({ where: { companyId, sourceType: 'RECEIPT', sourceId: payment.id, movementPurpose: 'RECEIPT_IN' } });
        if (movements.length !== 1) throw new ConflictError('Integridade: recebimento sem movimento de tesouraria único.');
        const originalMovement = movements[0]!;
        if (originalMovement.flow !== 'IN' || round2(Number(originalMovement.amount)) !== round2(Number(payment.amount))) {
          throw new ConflictError('Integridade: movimento de tesouraria não coincide com o recebimento.');
        }

        const entries = await tx.journalEntry.findMany({ where: { companyId, sourceType: 'CUSTOMER_PAYMENT', sourceId: payment.id, accountingEvent: 'RECEIPT_POSTED' } });
        if (entries.length !== 1) throw new ConflictError('Integridade: recebimento sem lançamento contabilístico único.');
        const originalEntry = entries[0]!;

        const amount = round2(Number(payment.amount));
        const customerBalanceBefore = round2(Number(customer.balance));
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'REVERSED', reversedAt: new Date(), reversedById: ctx.userId, reversalReason },
        });

        const activePaid = round2(
          Number(
            (
              await tx.payment.aggregate({
                where: { companyId, invoiceId: invoice.id, status: 'ACTIVE' },
                _sum: { amount: true },
              })
            )._sum.amount ?? 0,
          ),
        );
        const invoiceStatus = statusForPaidAmount(activePaid, round2(Number(invoice.total)));
        await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: activePaid, status: invoiceStatus } });
        const updatedCustomer = await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: amount } } });
        const customerBalanceAfter = round2(Number(updatedCustomer.balance));

        const treasuryReversal = await reverseOperationalTreasuryMovementTx(tx, companyId, ctx.userId, {
          movementId: originalMovement.id,
          reason: reversalReason,
          occurredAt: reversalDate,
          expectedSourceType: 'RECEIPT',
          expectedSourceId: payment.id,
          expectedMovementPurpose: 'RECEIPT_IN',
          reversalPurpose: 'RECEIPT_IN_REVERSAL',
          description: `Anulação do recibo ${payment.number} - ${reversalReason}`,
        });

        const accountingReversal = await reverseAccountingEventTx(tx, ctx, {
          origin: { sourceType: 'CUSTOMER_PAYMENT', sourceId: payment.id, accountingEvent: 'RECEIPT_POSTED' },
          reversalDate,
          reason: reversalReason,
          operationalReference: payment.number,
        });

        await writeAudit(tx, ctx, {
          action: 'customer.payment.reverse',
          entity: 'Payment',
          entityId: payment.id,
          oldValues: {
            status: payment.status,
            invoiceAmountPaid: Number(invoice.amountPaid),
            invoiceStatus: invoice.status,
            customerBalance: customerBalanceBefore,
          },
          newValues: {
            status: 'REVERSED',
            paymentId: payment.id,
            invoiceId: invoice.id,
            customerId: customer.id,
            receiptNumber: payment.number,
            amount,
            reversalReason,
            reversalDate: formatAccountingDate(reversalDate),
            idempotencyKey: data.idempotencyKey,
            invoiceAmountPaid: activePaid,
            invoiceStatus,
            customerBalanceBefore,
            customerBalanceAfter,
            treasuryMovementOriginalId: originalMovement.id,
            treasuryMovementReversalId: treasuryReversal.reversalId,
            treasuryBalanceBefore: treasuryReversal.balanceBefore,
            treasuryBalanceAfter: treasuryReversal.balanceAfter,
            journalEntryOriginalId: originalEntry.id,
            journalEntryReversalId: accountingReversal.reversalId,
          },
        });

        return {
          resourceType: 'Payment',
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
