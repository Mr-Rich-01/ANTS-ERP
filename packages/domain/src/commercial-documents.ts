/**
 * Documentos Comerciais (Sessão S5): Cotação, Nota de Crédito e Nota de Débito.
 *
 * - Cotação: documento PRÉ-TRANSACCIONAL — nunca movimenta stock, saldo ou contabilidade.
 * - Nota de Crédito (NC): sempre contra uma factura emitida; reduz o saldo do cliente;
 *   devolve stock apenas quando returnStock (com snapshot do custo médio por linha);
 *   lança o espelho da venda (D 411 Vendas, D 221 IVA liquidado / C 121 Clientes).
 *   O par 131/CMV da devolução fica para a S10 (decisão aprovada — ver ROADMAP S10).
 * - Nota de Débito (ND): contra um cliente, factura opcional; aumenta o saldo do cliente;
 *   lança D 121 Clientes / C 422 Outros proveitos operacionais (+ C 221 IVA) — S10b;
 *   até à S10b creditava a 411 Vendas (a ND histórica fica como verdade histórica).
 *   Nunca movimenta stock.
 * - Anulação de NC (S10b): estorno simétrico dos dois eventos + reversão da devolução.
 */
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import { civilDateInTimeZone, computeLine, computeDocumentTotals, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission, hasPermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';
import { formatAccountingDate, getMappedAccountTx, parseAccountingDate } from './accounting';
import { inventoryCostTotal, postAccountingEventTx, postInventoryCostEventTx, reverseAccountingEventTx, type InventoryCostItem } from './accounting-events';
import { validateOpenReversalDateTx, validateReversalReason } from './reversals';
import {
  FINGERPRINT_VERSION,
  canonicalRequestFingerprint,
  fpAmount,
  fpDate,
  fpInt,
  runIdempotentOperation,
} from './operation-idempotency';

export type QuotationStatus = 'DRAFT' | 'ISSUED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
export type CreditNoteStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';
export type DebitNoteStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';

export function quotationStatusLabel(status: QuotationStatus): string {
  const labels: Record<QuotationStatus, string> = {
    DRAFT: 'Rascunho',
    ISSUED: 'Emitida',
    ACCEPTED: 'Aceite',
    REJECTED: 'Recusada',
    CANCELLED: 'Cancelada',
  };
  return labels[status];
}

export function creditNoteStatusLabel(status: CreditNoteStatus): string {
  const labels: Record<CreditNoteStatus, string> = { DRAFT: 'Rascunho', ISSUED: 'Emitida', CANCELLED: 'Cancelada' };
  return labels[status];
}

export function debitNoteStatusLabel(status: DebitNoteStatus): string {
  const labels: Record<DebitNoteStatus, string> = { DRAFT: 'Rascunho', ISSUED: 'Emitida', CANCELLED: 'Cancelada' };
  return labels[status];
}

// ─────────────────────────── Tipos de leitura ───────────────────────────

export interface QuotationListItem {
  id: string;
  number: string;
  customerName: string;
  issueDate: Date;
  validUntil: Date;
  total: number;
  status: QuotationStatus;
}

export interface CommercialDocumentLine {
  id: string;
  sku: string | null;
  description: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  taxRate: number;
  total: number;
}

export interface QuotationDetail {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerNuit: string | null;
  issueDate: Date;
  validUntil: Date;
  status: QuotationStatus;
  subtotal: number;
  discountTotal: number;
  taxableBase: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  lines: CommercialDocumentLine[];
}

export interface CreditNoteListItem {
  id: string;
  number: string;
  invoiceNumber: string;
  customerName: string;
  issueDate: Date;
  total: number;
  returnStock: boolean;
  status: CreditNoteStatus;
}

export interface CreditNoteDetail {
  id: string;
  number: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerNuit: string | null;
  issueDate: Date;
  reason: string;
  returnStock: boolean;
  warehouseName: string | null;
  status: CreditNoteStatus;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancelledByName: string | null;
  cancellationReason: string | null;
  subtotal: number;
  taxableBase: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  lines: CommercialDocumentLine[];
}

export interface DebitNoteListItem {
  id: string;
  number: string;
  invoiceNumber: string | null;
  customerName: string;
  issueDate: Date;
  total: number;
  status: DebitNoteStatus;
}

export interface DebitNoteDetail {
  id: string;
  number: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  customerId: string;
  customerName: string;
  customerNuit: string | null;
  issueDate: Date;
  reason: string;
  status: DebitNoteStatus;
  subtotal: number;
  taxableBase: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  lines: CommercialDocumentLine[];
}

// ─────────────────────────── Helpers ───────────────────────────

async function nextDocNumber(tx: Prisma.TransactionClient, companyId: string, prefix: string, year: number): Promise<string> {
  const key = `${prefix}-${year}`;
  const counter = await tx.documentCounter.upsert({
    where: { companyId_key: { companyId, key } },
    update: { value: { increment: 1 } },
    create: { companyId, key, value: 1 },
  });
  return `${prefix} ${year}/${String(counter.value).padStart(4, '0')}`;
}

function resolveAllowedIssueDate(value: string): Date {
  const requestedDate = parseAccountingDate(value);
  const currentDate = civilDateInTimeZone();
  if (formatAccountingDate(requestedDate) !== currentDate) {
    throw new ValidationError('A data de emissão deve ser a data actual em Africa/Maputo.');
  }
  return parseAccountingDate(currentDate);
}

function mapLine(l: { id: string; sku: string | null; description: string; unitPrice: Prisma.Decimal; quantity: number; discountPercent?: Prisma.Decimal; taxRate: Prisma.Decimal; total: Prisma.Decimal }): CommercialDocumentLine {
  return {
    id: l.id,
    sku: l.sku,
    description: l.description,
    unitPrice: Number(l.unitPrice),
    quantity: l.quantity,
    discountPercent: l.discountPercent != null ? Number(l.discountPercent) : 0,
    taxRate: Number(l.taxRate),
    total: Number(l.total),
  };
}

// ─────────────────────────── Cotações — leituras ───────────────────────────

export async function listQuotations(db: PrismaClient, ctx: RequestContext): Promise<QuotationListItem[]> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);
  const rows = await db.quotation.findMany({ orderBy: { issueDate: 'desc' } });
  return rows.map((q) => ({
    id: q.id,
    number: q.number,
    customerName: q.customerName,
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    total: Number(q.total),
    status: q.status as QuotationStatus,
  }));
}

export async function getQuotation(db: PrismaClient, ctx: RequestContext, id: string): Promise<QuotationDetail> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);
  const q = await db.quotation.findFirst({ where: { id }, include: { lines: true } });
  if (!q) throw new NotFoundError('Cotação não encontrada.');
  return {
    id: q.id,
    number: q.number,
    customerId: q.customerId,
    customerName: q.customerName,
    customerNuit: q.customerNuit,
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    status: q.status as QuotationStatus,
    subtotal: Number(q.subtotal),
    discountTotal: Number(q.discountTotal),
    taxableBase: Number(q.taxableBase),
    taxTotal: Number(q.taxTotal),
    total: Number(q.total),
    notes: q.notes,
    lines: q.lines.map(mapLine),
  };
}

// ─────────────────────────── Cotações — emissão ───────────────────────────

const quotationInput = z.object({
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  issueDate: z.string().min(1, 'Seleccione a data de emissão.'),
  customerId: z.string().min(1, 'Seleccione um cliente.'),
  validUntil: z.string().min(1, 'Seleccione a validade da cotação.'),
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

export type QuotationInput = z.input<typeof quotationInput>;
type ParsedQuotationInput = z.output<typeof quotationInput>;

function quotationFingerprint(data: ParsedQuotationInput, issueDate: Date): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    issueDate: fpDate(issueDate),
    customerId: data.customerId,
    validUntil: fpDate(data.validUntil),
    notes: data.notes ?? null,
    lines: data.lines.map((l) => ({ productId: l.productId, quantity: fpInt(l.quantity), discountPercent: fpAmount(l.discountPercent) })),
  });
}

/** Emite uma cotação. Documento pré-transaccional: SEM stock, SEM saldo, SEM contabilidade. */
export async function createQuotation(db: PrismaClient, ctx: RequestContext, input: QuotationInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'sales.create');
  const companyId = requireCompany(ctx);
  const parsed = quotationInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const issueDate = resolveAllowedIssueDate(data.issueDate);
  const validUntil = parseAccountingDate(data.validUntil);
  if (validUntil.getTime() < issueDate.getTime()) {
    throw new ValidationError('A validade da cotação não pode ser anterior à data de emissão.');
  }
  if (data.lines.some((l) => l.discountPercent > 0) && !hasPermission(ctx, 'sales.approve_discount')) {
    throw new ValidationError('Sem permissão para aplicar descontos.');
  }
  const requestFingerprint = quotationFingerprint(data, issueDate);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'QUOTATION_CREATE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'Quotation',
      loadExisting: async (resourceId) => {
        return tx.quotation.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
      },
      run: async () => {
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, companyId } });
        if (!customer) throw new NotFoundError('Cliente não encontrado.');

        const prepared: Array<{ productId: string; sku: string | null; description: string; unitPrice: number; quantity: number; discountPercent: number; taxRate: number; total: number }> = [];
        for (const line of data.lines) {
          const product = await tx.product.findFirst({ where: { id: line.productId, companyId } });
          if (!product) throw new NotFoundError('Produto não encontrado.');
          const unitPrice = Number(product.salePrice);
          const taxRate = Number(product.taxRate);
          const r = computeLine({ quantity: line.quantity, unitPrice, discountPercent: line.discountPercent, taxPercent: taxRate });
          prepared.push({ productId: product.id, sku: product.sku, description: product.name, unitPrice, quantity: line.quantity, discountPercent: line.discountPercent, taxRate, total: r.total });
        }

        const totals = computeDocumentTotals(
          prepared.map((p) => ({ quantity: p.quantity, unitPrice: p.unitPrice, discountPercent: p.discountPercent, taxPercent: p.taxRate })),
        );
        if (round2(totals.total) <= 0) throw new ValidationError('O total da cotação tem de ser maior que zero.');

        const number = await nextDocNumber(tx, companyId, 'COT', issueDate.getUTCFullYear());
        const quotation = await tx.quotation.create({
          data: {
            companyId,
            number,
            customerId: customer.id,
            customerName: customer.name,
            customerNuit: customer.nuit,
            issueDate,
            validUntil,
            status: 'ISSUED',
            subtotal: totals.subtotal,
            discountTotal: totals.discount,
            taxableBase: totals.taxable,
            taxTotal: totals.tax,
            total: totals.total,
            notes: data.notes ?? null,
            createdBy: ctx.userId,
          },
        });
        for (const p of prepared) {
          await tx.quotationLine.create({
            data: {
              companyId,
              quotationId: quotation.id,
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
        }

        await writeAudit(tx, ctx, {
          action: 'quotation.issue',
          entity: 'Quotation',
          entityId: quotation.id,
          newValues: {
            number,
            customerId: customer.id,
            customer: customer.name,
            issueDate: formatAccountingDate(issueDate),
            validUntil: formatAccountingDate(validUntil),
            total: totals.total,
            idempotencyKey: data.idempotencyKey,
          },
        });

        return { resourceType: 'Quotation', resourceId: quotation.id, result: { id: quotation.id, number } };
      },
    });
    return op.result;
  });
}

// ─────────────────────────── Notas de Crédito — leituras ───────────────────────────

export async function listCreditNotes(db: PrismaClient, ctx: RequestContext): Promise<CreditNoteListItem[]> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);
  const rows = await db.creditNote.findMany({ orderBy: { issueDate: 'desc' }, include: { invoice: { select: { number: true } } } });
  return rows.map((n) => ({
    id: n.id,
    number: n.number,
    invoiceNumber: n.invoice.number,
    customerName: n.customerName,
    issueDate: n.issueDate,
    total: Number(n.total),
    returnStock: n.returnStock,
    status: n.status as CreditNoteStatus,
  }));
}

export async function getCreditNote(db: PrismaClient, ctx: RequestContext, id: string): Promise<CreditNoteDetail> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);
  const n = await db.creditNote.findFirst({
    where: { id },
    include: { lines: true, invoice: { select: { number: true } }, warehouse: { select: { name: true } } },
  });
  if (!n) throw new NotFoundError('Nota de crédito não encontrada.');
  const cancelledBy = n.cancelledById
    ? await db.user.findFirst({ where: { id: n.cancelledById }, select: { name: true, email: true } })
    : null;
  return {
    id: n.id,
    number: n.number,
    invoiceId: n.invoiceId,
    invoiceNumber: n.invoice.number,
    customerId: n.customerId,
    customerName: n.customerName,
    customerNuit: n.customerNuit,
    issueDate: n.issueDate,
    reason: n.reason,
    returnStock: n.returnStock,
    warehouseName: n.warehouse?.name ?? null,
    status: n.status as CreditNoteStatus,
    cancelledAt: n.cancelledAt,
    cancelledById: n.cancelledById,
    cancelledByName: cancelledBy ? cancelledBy.name || cancelledBy.email : null,
    cancellationReason: n.cancellationReason,
    subtotal: Number(n.subtotal),
    taxableBase: Number(n.taxableBase),
    taxTotal: Number(n.taxTotal),
    total: Number(n.total),
    notes: n.notes,
    lines: n.lines.map((l) => mapLine({ ...l, discountPercent: undefined })),
  };
}

/** Linhas da factura ainda passíveis de crédito (para o formulário da NC). */
export interface CreditableInvoiceLine {
  invoiceLineId: string;
  productId: string | null;
  sku: string | null;
  description: string;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  invoicedQty: number;
  creditedQty: number;
  availableQty: number;
}

export async function getCreditableLines(db: PrismaClient, ctx: RequestContext, invoiceId: string): Promise<{ invoiceNumber: string; customerName: string; lines: CreditableInvoiceLine[] }> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId }, include: { lines: true } });
  if (!invoice) throw new NotFoundError('Factura não encontrada.');
  if (invoice.status === 'DRAFT') throw new ConflictError('A factura é um rascunho — emita-a antes de emitir notas de crédito.');
  const issued = await db.creditNote.findMany({ where: { invoiceId, status: 'ISSUED' }, include: { lines: true } });
  const creditedByLine = new Map<string, number>();
  for (const note of issued) {
    for (const l of note.lines) {
      creditedByLine.set(l.invoiceLineId, (creditedByLine.get(l.invoiceLineId) ?? 0) + l.quantity);
    }
  }
  return {
    invoiceNumber: invoice.number,
    customerName: invoice.customerName,
    lines: invoice.lines.map((l) => {
      const credited = creditedByLine.get(l.id) ?? 0;
      return {
        invoiceLineId: l.id,
        productId: l.productId,
        sku: l.sku,
        description: l.description,
        unitPrice: Number(l.unitPrice),
        discountPercent: Number(l.discountPercent),
        taxRate: Number(l.taxRate),
        invoicedQty: l.quantity,
        creditedQty: credited,
        availableQty: Math.max(0, l.quantity - credited),
      };
    }),
  };
}

// ─────────────────────────── Notas de Crédito — emissão ───────────────────────────

const creditNoteInput = z.object({
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  issueDate: z.string().min(1, 'Seleccione a data de emissão.'),
  invoiceId: z.string().min(1, 'Seleccione a factura de origem.'),
  reason: z.string().trim().min(3, 'Indique o motivo da nota de crédito.').max(500),
  returnStock: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
  lines: z
    .array(
      z.object({
        invoiceLineId: z.string().min(1),
        quantity: z.coerce.number().int().positive('Quantidade inválida.'),
      }),
    )
    .min(1, 'Adicione pelo menos uma linha.'),
});

export type CreditNoteInput = z.input<typeof creditNoteInput>;
type ParsedCreditNoteInput = z.output<typeof creditNoteInput>;

function creditNoteFingerprint(data: ParsedCreditNoteInput, issueDate: Date): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    issueDate: fpDate(issueDate),
    invoiceId: data.invoiceId,
    reason: data.reason,
    returnStock: data.returnStock,
    notes: data.notes ?? null,
    lines: data.lines.map((l) => ({ invoiceLineId: l.invoiceLineId, quantity: fpInt(l.quantity) })),
  });
}

/**
 * Emite uma nota de crédito contra uma factura emitida.
 * Efeitos: saldo do cliente (decremento); stock IN quando returnStock (custo médio
 * intacto, com snapshot em unitCost); lançamento espelho da venda (411/221/121).
 */
export async function createCreditNote(db: PrismaClient, ctx: RequestContext, input: CreditNoteInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'sales.create');
  const companyId = requireCompany(ctx);
  const parsed = creditNoteInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const issueDate = resolveAllowedIssueDate(data.issueDate);
  const requestFingerprint = creditNoteFingerprint(data, issueDate);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'CREDIT_NOTE_CREATE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'CreditNote',
      loadExisting: async (resourceId) => {
        return tx.creditNote.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
      },
      run: async () => {
        // Serializa NCs concorrentes contra a MESMA factura (o lock da idempotência é
        // por chave e não chega): o tecto por linha só é fiável se a leitura das NCs
        // emitidas e a escrita da nova ficarem na mesma secção crítica. Mesmo lock de
        // linha do cancelamento (P0-03a) — também exclui NC vs. cancelamento em curso.
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${data.invoiceId} AND "companyId" = ${companyId} FOR UPDATE`;

        const invoice = await tx.invoice.findFirst({ where: { id: data.invoiceId, companyId }, include: { lines: true } });
        if (!invoice) throw new NotFoundError('Factura não encontrada.');
        if (invoice.status === 'CANCELLED') throw new ConflictError('Não é possível emitir nota de crédito sobre uma factura cancelada.');
        if (invoice.status === 'DRAFT') throw new ConflictError('Não é possível emitir nota de crédito sobre um rascunho de factura.');

        const customer = await tx.customer.findFirst({ where: { id: invoice.customerId, companyId } });
        if (!customer) throw new NotFoundError('Cliente da factura não encontrado.');

        // Quantidades já creditadas por linha (NCs emitidas desta factura).
        const issued = await tx.creditNote.findMany({ where: { companyId, invoiceId: invoice.id, status: 'ISSUED' }, include: { lines: true } });
        const creditedByLine = new Map<string, number>();
        let creditedTotal = 0;
        for (const note of issued) {
          creditedTotal = round2(creditedTotal + Number(note.total));
          for (const l of note.lines) {
            creditedByLine.set(l.invoiceLineId, (creditedByLine.get(l.invoiceLineId) ?? 0) + l.quantity);
          }
        }

        const linesById = new Map(invoice.lines.map((l) => [l.id, l]));
        const seen = new Set<string>();
        const prepared: Array<{
          invoiceLineId: string;
          productId: string | null;
          sku: string | null;
          description: string;
          unitPrice: number;
          quantity: number;
          discountPercent: number;
          taxRate: number;
          total: number;
        }> = [];

        for (const line of data.lines) {
          if (seen.has(line.invoiceLineId)) throw new ValidationError('A mesma linha da factura não pode aparecer duas vezes na nota.');
          seen.add(line.invoiceLineId);
          const origin = linesById.get(line.invoiceLineId);
          if (!origin) throw new NotFoundError('Linha da factura não encontrada.');
          const credited = creditedByLine.get(origin.id) ?? 0;
          const available = origin.quantity - credited;
          if (line.quantity > available) {
            throw new ValidationError(
              `Quantidade a creditar de «${origin.description}» excede o disponível: facturado ${origin.quantity}, já creditado ${credited}, pedido ${line.quantity}.`,
            );
          }
          const unitPrice = Number(origin.unitPrice);
          const discountPercent = Number(origin.discountPercent);
          const taxRate = Number(origin.taxRate);
          const r = computeLine({ quantity: line.quantity, unitPrice, discountPercent, taxPercent: taxRate });
          prepared.push({
            invoiceLineId: origin.id,
            productId: origin.productId,
            sku: origin.sku,
            description: origin.description,
            unitPrice,
            quantity: line.quantity,
            discountPercent,
            taxRate,
            total: r.total,
          });
        }

        const totals = computeDocumentTotals(
          prepared.map((p) => ({ quantity: p.quantity, unitPrice: p.unitPrice, discountPercent: p.discountPercent, taxPercent: p.taxRate })),
        );
        if (round2(totals.total) <= 0) throw new ValidationError('O total da nota de crédito tem de ser maior que zero.');
        if (round2(creditedTotal + totals.total) > round2(Number(invoice.total))) {
          throw new ValidationError('A soma das notas de crédito excederia o total da factura de origem.');
        }
        if (data.returnStock && !prepared.some((p) => p.productId)) {
          throw new ValidationError('A devolução de mercadoria exige pelo menos uma linha com produto.');
        }

        const number = await nextDocNumber(tx, companyId, 'NC', issueDate.getUTCFullYear());
        const creditNote = await tx.creditNote.create({
          data: {
            companyId,
            number,
            invoiceId: invoice.id,
            customerId: customer.id,
            customerName: invoice.customerName,
            customerNuit: invoice.customerNuit,
            issueDate,
            reason: data.reason,
            returnStock: data.returnStock,
            warehouseId: data.returnStock ? invoice.warehouseId : null,
            status: 'ISSUED',
            subtotal: totals.subtotal,
            taxableBase: totals.taxable,
            taxTotal: totals.tax,
            total: totals.total,
            notes: data.notes ?? null,
            createdBy: ctx.userId,
          },
        });

        // Linhas devolvidas com custo (base do par 131/CMV — S10a).
        const returnItems: InventoryCostItem[] = [];
        for (const p of prepared) {
          // Snapshot do custo médio no momento da devolução (aprovado): o documento
          // e o par 131/CMV (S10a) não dependem do custo posterior.
          let unitCost: number | null = null;
          if (data.returnStock && p.productId) {
            const product = await tx.product.findFirst({ where: { id: p.productId, companyId }, select: { avgCost: true } });
            unitCost = product ? round2(Number(product.avgCost)) : null;
            if (unitCost !== null) returnItems.push({ quantity: p.quantity, unitCost });
          }
          await tx.creditNoteLine.create({
            data: {
              companyId,
              creditNoteId: creditNote.id,
              invoiceLineId: p.invoiceLineId,
              productId: p.productId,
              sku: p.sku,
              description: p.description,
              unitPrice: p.unitPrice,
              quantity: p.quantity,
              taxRate: p.taxRate,
              unitCost,
              total: p.total,
            },
          });

          if (data.returnStock && p.productId) {
            const level = await tx.stockLevel.findUnique({
              where: { productId_warehouseId: { productId: p.productId, warehouseId: invoice.warehouseId } },
            });
            const balanceAfter = (level?.quantity ?? 0) + p.quantity;
            await tx.stockLevel.upsert({
              where: { productId_warehouseId: { productId: p.productId, warehouseId: invoice.warehouseId } },
              update: { quantity: balanceAfter },
              create: { companyId, productId: p.productId, warehouseId: invoice.warehouseId, quantity: balanceAfter },
            });
            await tx.stockMovement.create({
              data: {
                companyId,
                productId: p.productId,
                warehouseId: invoice.warehouseId,
                creditNoteId: creditNote.id,
                type: 'IN',
                quantity: p.quantity,
                balanceAfter,
                document: number,
                reason: `Devolução NC (factura ${invoice.number})`,
                createdBy: ctx.userId,
              },
            });
          }
        }

        await tx.customer.update({ where: { id: customer.id }, data: { balance: { decrement: totals.total } } });

        // Espelho da venda: D Vendas (base), D IVA liquidado (IVA) / C Clientes (total).
        const revenue = await getMappedAccountTx(tx, companyId, 'SALES_REVENUE');
        const ar = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_RECEIVABLE');
        const lines = [
          { ledgerAccountId: revenue.id, debit: totals.tax > 0 ? totals.taxable : totals.total, description: `Nota de crédito ${number}` },
          { ledgerAccountId: ar.id, credit: totals.total, customerId: customer.id, description: `Nota de crédito ${number}` },
        ];
        if (totals.tax > 0) {
          const vat = await getMappedAccountTx(tx, companyId, 'VAT_OUTPUT');
          lines.push({ ledgerAccountId: vat.id, debit: totals.tax, description: `Nota de crédito ${number}` });
        }
        await postAccountingEventTx(tx, ctx, {
          journalType: 'SALES',
          entryDate: creditNote.issueDate,
          dateLabel: 'A data de emissão',
          description: `Nota de crédito ${number} (factura ${invoice.number})`,
          reference: number,
          origin: { sourceType: 'CREDIT_NOTE', sourceId: creditNote.id, accountingEvent: 'CREDIT_NOTE_ISSUED' },
          lines,
        });

        // Par da devolução (S10a): a mercadoria volta às existências ao unitCost
        // snapshot das linhas — D Mercadorias / C CMV, lançamento SEPARADO do espelho.
        if (data.returnStock) {
          await postInventoryCostEventTx(tx, ctx, {
            origin: { sourceType: 'CREDIT_NOTE', sourceId: creditNote.id, accountingEvent: 'CREDIT_NOTE_COGS_REVERSED' },
            entryDate: creditNote.issueDate,
            dateLabel: 'A data de emissão',
            description: `Reposição de existências ${number} (factura ${invoice.number})`,
            reference: number,
            items: returnItems,
            direction: 'IN',
          });
        }

        await writeAudit(tx, ctx, {
          action: 'credit_note.issue',
          entity: 'CreditNote',
          entityId: creditNote.id,
          newValues: {
            number,
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            customerId: customer.id,
            customer: invoice.customerName,
            issueDate: formatAccountingDate(issueDate),
            reason: data.reason,
            returnStock: data.returnStock,
            total: totals.total,
            taxableBase: totals.taxable,
            taxTotal: totals.tax,
            returnCostTotal: data.returnStock ? inventoryCostTotal(returnItems) : null,
            idempotencyKey: data.idempotencyKey,
            accounting: { sourceType: 'CREDIT_NOTE', accountingEvent: 'CREDIT_NOTE_ISSUED' },
          },
        });

        return { resourceType: 'CreditNote', resourceId: creditNote.id, result: { id: creditNote.id, number } };
      },
    });
    return op.result;
  });
}

// ─────────────────────────── Notas de Crédito — anulação (S10b) ───────────────────────────

const cancelCreditNoteInput = z.object({
  creditNoteId: z.string().min(1, 'Nota de crédito inválida.'),
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  cancellationReason: z.string(),
  cancellationDate: z.string().min(1, 'Data da anulação obrigatória.'),
});

export type CancelCreditNoteInput = z.input<typeof cancelCreditNoteInput>;

export interface CancelCreditNoteResult {
  id: string;
  number: string;
  cancellationDate: string;
  /** Movimentos OUT compensatórios dos IN da devolução (vazio em NC só de valor). */
  stockReversalIds: string[];
  /** Estorno do lançamento espelho CREDIT_NOTE_ISSUED. */
  accountingReversalId: string;
  /** Estorno do par CREDIT_NOTE_COGS_REVERSED; null quando a NC não o lançou. */
  cogsReversalId: string | null;
}

function creditNoteCancellationFingerprint(companyId: string, creditNoteId: string, cancellationDate: Date, cancellationReason: string): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    creditNoteId,
    cancellationDate: fpDate(cancellationDate),
    cancellationReason,
  });
}

function resolveAllowedCancellationDate(value: string): Date {
  const requestedDate = parseAccountingDate(value);
  const currentDate = civilDateInTimeZone();
  if (formatAccountingDate(requestedDate) !== currentDate) {
    throw new ValidationError('A data da anulação deve ser a data actual em Africa/Maputo.');
  }
  return parseAccountingDate(currentDate);
}

/** Replay idempotente: valida que a anulação registada está completa e devolve-a. */
async function loadCompletedCreditNoteCancellation(tx: Prisma.TransactionClient, companyId: string, creditNoteId: string, cancellationDate: Date): Promise<CancelCreditNoteResult | null> {
  const note = await tx.creditNote.findFirst({ where: { companyId, id: creditNoteId }, select: { id: true, number: true, status: true } });
  if (!note) return null;
  if (note.status !== 'CANCELLED') throw new ConflictError('Registo de idempotência aponta para uma nota de crédito não anulada (integridade).');

  const [originalMovements, originalEntry, cogsEntry] = await Promise.all([
    tx.stockMovement.findMany({ where: { companyId, creditNoteId: note.id, type: 'IN' }, select: { id: true } }),
    tx.journalEntry.findFirst({ where: { companyId, sourceType: 'CREDIT_NOTE', sourceId: note.id, accountingEvent: 'CREDIT_NOTE_ISSUED' }, select: { id: true } }),
    tx.journalEntry.findFirst({ where: { companyId, sourceType: 'CREDIT_NOTE', sourceId: note.id, accountingEvent: 'CREDIT_NOTE_COGS_REVERSED' }, select: { id: true } }),
  ]);
  if (!originalEntry) throw new ConflictError('Registo de idempotência aponta para uma anulação sem lançamento contabilístico original (integridade).');

  const [stockReversals, accountingReversal, cogsReversal] = await Promise.all([
    originalMovements.length
      ? tx.stockMovement.findMany({ where: { companyId, reversesId: { in: originalMovements.map((m) => m.id) } }, select: { id: true } })
      : Promise.resolve([]),
    tx.journalEntry.findFirst({ where: { companyId, reversalOfId: originalEntry.id }, select: { id: true } }),
    cogsEntry
      ? tx.journalEntry.findFirst({ where: { companyId, reversalOfId: cogsEntry.id }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (stockReversals.length !== originalMovements.length || !accountingReversal || (cogsEntry && !cogsReversal)) {
    throw new ConflictError('Registo de idempotência aponta para uma anulação incompleta (integridade).');
  }
  return {
    id: note.id,
    number: note.number,
    cancellationDate: formatAccountingDate(cancellationDate),
    stockReversalIds: stockReversals.map((m) => m.id),
    accountingReversalId: accountingReversal.id,
    cogsReversalId: cogsReversal?.id ?? null,
  };
}

/**
 * Anula integralmente uma nota de crédito emitida (S10b). A NC nunca se apaga:
 * fica CANCELLED com quem/quando/porquê, consultável e imprimível.
 *
 * Efeitos (transacção única, falha total):
 * - saldo do cliente reposto (incremento simétrico do decremento da emissão);
 * - devolução de stock revertida por movimentos OUT compensatórios ligados por
 *   `reversesId` aos IN da NC (custo médio intacto — saídas nunca recalculam);
 *   se a mercadoria devolvida entretanto saiu (vendida), falha por inteiro;
 * - estorno contabilístico histórico do espelho CREDIT_NOTE_ISSUED e, quando
 *   existir, do par CREDIT_NOTE_COGS_REVERSED (via reverseAccountingEventTx);
 * - auditoria `credit_note.cancel` e idempotência CREDIT_NOTE_CANCEL.
 *
 * ORDEM DOS LOCKS (determinística, compatível com cancelInvoice/P0-03a e com
 * createCreditNote — qualquer par destas operações sobre a mesma factura
 * serializa na linha da factura, o primeiro lock de linha comum):
 *   1. fiscal_years + accounting_periods (validateOpenReversalDateTx);
 *   2. invoices (factura de origem da NC) FOR UPDATE;
 *   3. credit_notes (a própria NC) FOR UPDATE;
 *   4. customers FOR UPDATE;
 *   5. stock_levels FOR UPDATE (pela ordem createdAt asc dos movimentos IN,
 *      como cancelInvoice);
 *   6. advisory lock + journal_entries FOR UPDATE (reverseAccountingEventTx).
 * O cancelInvoice usa 1 → 2 → (4 → 5 → 6) sem o passo 3; como ambos adquirem
 * primeiro a factura (2), nunca se cruzam nos locks seguintes da mesma factura.
 */
export async function cancelCreditNote(db: PrismaClient, ctx: RequestContext, input: CancelCreditNoteInput): Promise<CancelCreditNoteResult> {
  requirePermission(ctx, 'invoices.cancel');
  const companyId = requireCompany(ctx);
  const parsed = cancelCreditNoteInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const cancellationReason = validateReversalReason(data.cancellationReason);
  const cancellationDate = resolveAllowedCancellationDate(data.cancellationDate);
  const requestFingerprint = creditNoteCancellationFingerprint(companyId, data.creditNoteId, cancellationDate, cancellationReason);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<CancelCreditNoteResult>(tx, ctx, {
      scope: 'CREDIT_NOTE_CANCEL',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'CreditNote',
      loadExisting: (resourceId) => loadCompletedCreditNoteCancellation(tx, companyId, resourceId, cancellationDate),
      run: async () => {
        // Leitura sem lock (não afecta a ordem de locks) só para o isolamento
        // multiempresa e para conhecer a factura de origem (invoiceId é imutável);
        // o estado da NC é revalidado adiante, já sob lock.
        const preview = await tx.creditNote.findFirst({ where: { companyId, id: data.creditNoteId }, select: { id: true, invoiceId: true } });
        if (!preview) throw new NotFoundError('Nota de crédito não encontrada.');

        // 1. Período/exercício abertos (locks de fiscal_years/accounting_periods).
        await validateOpenReversalDateTx(tx, companyId, cancellationDate);

        // 2. Factura primeiro (o MESMO primeiro lock de cancelInvoice/createCreditNote).
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${preview.invoiceId} AND "companyId" = ${companyId} FOR UPDATE`;
        // 3. A própria NC.
        await tx.$queryRaw`SELECT id FROM credit_notes WHERE id = ${data.creditNoteId} AND "companyId" = ${companyId} FOR UPDATE`;

        const note = await tx.creditNote.findFirst({ where: { companyId, id: data.creditNoteId }, include: { lines: true } });
        if (!note) throw new NotFoundError('Nota de crédito não encontrada.');
        if (note.status === 'CANCELLED') throw new ConflictError('Esta nota de crédito já foi anulada.');
        if (note.status !== 'ISSUED') throw new ConflictError('Só é possível anular notas de crédito emitidas.');

        const invoice = await tx.invoice.findFirst({ where: { companyId, id: note.invoiceId }, select: { id: true, number: true } });
        if (!invoice) throw new NotFoundError('Factura de origem da nota de crédito não encontrada.');

        // 4. Cliente.
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${note.customerId} AND "companyId" = ${companyId} FOR UPDATE`;
        const customer = await tx.customer.findFirst({ where: { companyId, id: note.customerId } });
        if (!customer) throw new NotFoundError('Cliente da nota de crédito não encontrado.');

        // Movimentos IN da devolução (rastreados por creditNoteId — backfill S10b).
        const stockMovements = await tx.stockMovement.findMany({
          where: { companyId, creditNoteId: note.id, type: 'IN' },
          orderBy: { createdAt: 'asc' },
        });
        if (note.returnStock) {
          const lineQuantities = new Map<string, number>();
          for (const l of note.lines) {
            if (!l.productId) continue;
            lineQuantities.set(l.productId, (lineQuantities.get(l.productId) ?? 0) + l.quantity);
          }
          const movementQuantities = new Map<string, number>();
          for (const m of stockMovements) {
            if (m.quantity <= 0) throw new ConflictError('Integridade: movimento de devolução da NC não é uma entrada.');
            movementQuantities.set(m.productId, (movementQuantities.get(m.productId) ?? 0) + m.quantity);
          }
          for (const [productId, quantity] of lineQuantities) {
            if ((movementQuantities.get(productId) ?? 0) !== quantity) {
              throw new ConflictError('Esta nota de crédito foi criada antes da rastreabilidade necessária para anulação automática. Requer revisão administrativa.');
            }
          }
          for (const m of stockMovements) {
            if (!lineQuantities.has(m.productId)) throw new ConflictError('Integridade: movimento de devolução não corresponde às linhas da nota de crédito.');
          }
        } else if (stockMovements.length > 0) {
          throw new ConflictError('Integridade: nota de crédito sem devolução com movimentos de stock associados.');
        }

        const existingStockReversal = stockMovements.length
          ? await tx.stockMovement.findFirst({ where: { companyId, reversesId: { in: stockMovements.map((m) => m.id) } }, select: { id: true } })
          : null;
        if (existingStockReversal) throw new ConflictError('Esta nota de crédito já possui movimentos de stock compensatórios.');

        // 5. Níveis de stock, pela ordem dos movimentos (createdAt asc — cancelInvoice).
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

        // Validação prévia COMPLETA do stock: ou reverte tudo, ou nada. Se a
        // mercadoria devolvida entretanto saiu (ex.: foi vendida), falha por inteiro.
        const insufficient: string[] = [];
        for (const movement of stockMovements) {
          const level = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId: movement.productId, warehouseId: movement.warehouseId } } });
          const available = level && level.companyId === companyId ? level.quantity : 0;
          if (available < movement.quantity) {
            const product = await tx.product.findFirst({ where: { companyId, id: movement.productId }, select: { name: true, sku: true } });
            const label = product ? `${product.name} (${product.sku})` : movement.productId;
            insufficient.push(`${label}: devolvido ${movement.quantity}, disponível ${available}`);
          }
        }
        if (insufficient.length > 0) {
          throw new ConflictError(
            `Não é possível anular a nota de crédito ${note.number}: a mercadoria devolvida já saiu de armazém (ex.: foi vendida) — ${insufficient.join('; ')}. Nada foi alterado.`,
          );
        }

        // OUT compensatórios ligados por reversesId. Saídas nunca recalculam o
        // custo médio — avgCost fica intacto (regra S9/S10a).
        const stockReversalIds: string[] = [];
        for (const movement of stockMovements) {
          const level = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId: movement.productId, warehouseId: movement.warehouseId } } });
          if (!level || level.companyId !== companyId) throw new ConflictError('Integridade: nível de stock da devolução não encontrado.');
          const balanceAfter = level.quantity - movement.quantity;
          await tx.stockLevel.update({
            where: { productId_warehouseId: { productId: movement.productId, warehouseId: movement.warehouseId } },
            data: { quantity: balanceAfter },
          });
          const reversal = await tx.stockMovement.create({
            data: {
              companyId,
              productId: movement.productId,
              warehouseId: movement.warehouseId,
              creditNoteId: note.id,
              reversesId: movement.id,
              type: 'OUT',
              quantity: -movement.quantity,
              balanceAfter,
              document: note.number,
              reason: `Anulação da nota de crédito ${note.number}`,
              createdBy: ctx.userId,
            },
          });
          stockReversalIds.push(reversal.id);
        }

        // Saldo do cliente: a emissão decrementou pelo total — a anulação repõe.
        const total = round2(Number(note.total));
        const customerBalanceBefore = round2(Number(customer.balance));
        const updatedCustomer = await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: total } } });
        const customerBalanceAfter = round2(Number(updatedCustomer.balance));

        // 6. Estornos contabilísticos por verdade histórica (advisory + FOR UPDATE).
        const accountingReversal = await reverseAccountingEventTx(tx, ctx, {
          origin: { sourceType: 'CREDIT_NOTE', sourceId: note.id, accountingEvent: 'CREDIT_NOTE_ISSUED' },
          reversalDate: cancellationDate,
          reason: cancellationReason,
          operationalReference: note.number,
        });
        const cogsEntry = await tx.journalEntry.findFirst({
          where: { companyId, sourceType: 'CREDIT_NOTE', sourceId: note.id, accountingEvent: 'CREDIT_NOTE_COGS_REVERSED' },
          select: { id: true },
        });
        const cogsReversal = cogsEntry
          ? await reverseAccountingEventTx(tx, ctx, {
              origin: { sourceType: 'CREDIT_NOTE', sourceId: note.id, accountingEvent: 'CREDIT_NOTE_COGS_REVERSED' },
              reversalDate: cancellationDate,
              reason: cancellationReason,
              operationalReference: note.number,
            })
          : null;

        await tx.creditNote.update({
          where: { id: note.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: ctx.userId,
            cancellationReason,
          },
        });

        await writeAudit(tx, ctx, {
          action: 'credit_note.cancel',
          entity: 'CreditNote',
          entityId: note.id,
          oldValues: {
            status: note.status,
            customerBalance: customerBalanceBefore,
          },
          newValues: {
            status: 'CANCELLED',
            creditNoteId: note.id,
            creditNoteNumber: note.number,
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            customerId: note.customerId,
            total,
            returnStock: note.returnStock,
            cancellationReason,
            cancellationDate: formatAccountingDate(cancellationDate),
            idempotencyKey: data.idempotencyKey,
            customerBalanceBefore,
            customerBalanceAfter,
            stockMovementOriginalIds: stockMovements.map((m) => m.id),
            stockMovementReversalIds: stockReversalIds,
            journalEntryReversalId: accountingReversal.reversalId,
            cogsEntryOriginalId: cogsEntry?.id ?? null,
            cogsEntryReversalId: cogsReversal?.reversalId ?? null,
          },
        });

        return {
          resourceType: 'CreditNote',
          resourceId: note.id,
          result: {
            id: note.id,
            number: note.number,
            cancellationDate: formatAccountingDate(cancellationDate),
            stockReversalIds,
            accountingReversalId: accountingReversal.reversalId,
            cogsReversalId: cogsReversal?.reversalId ?? null,
          },
        };
      },
    });
    return op.result;
  });
}

// ─────────────────────────── Notas de Débito — leituras ───────────────────────────

export async function listDebitNotes(db: PrismaClient, ctx: RequestContext): Promise<DebitNoteListItem[]> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);
  const rows = await db.debitNote.findMany({ orderBy: { issueDate: 'desc' }, include: { invoice: { select: { number: true } } } });
  return rows.map((n) => ({
    id: n.id,
    number: n.number,
    invoiceNumber: n.invoice?.number ?? null,
    customerName: n.customerName,
    issueDate: n.issueDate,
    total: Number(n.total),
    status: n.status as DebitNoteStatus,
  }));
}

export async function getDebitNote(db: PrismaClient, ctx: RequestContext, id: string): Promise<DebitNoteDetail> {
  requirePermission(ctx, 'sales.view');
  requireCompany(ctx);
  const n = await db.debitNote.findFirst({ where: { id }, include: { lines: true, invoice: { select: { number: true } } } });
  if (!n) throw new NotFoundError('Nota de débito não encontrada.');
  return {
    id: n.id,
    number: n.number,
    invoiceId: n.invoiceId,
    invoiceNumber: n.invoice?.number ?? null,
    customerId: n.customerId,
    customerName: n.customerName,
    customerNuit: n.customerNuit,
    issueDate: n.issueDate,
    reason: n.reason,
    status: n.status as DebitNoteStatus,
    subtotal: Number(n.subtotal),
    taxableBase: Number(n.taxableBase),
    taxTotal: Number(n.taxTotal),
    total: Number(n.total),
    notes: n.notes,
    lines: n.lines.map((l) => mapLine({ ...l, sku: null, discountPercent: undefined })),
  };
}

// ─────────────────────────── Notas de Débito — emissão ───────────────────────────

const debitNoteInput = z.object({
  idempotencyKey: z.string().min(1, 'Chave de idempotência obrigatória.'),
  issueDate: z.string().min(1, 'Seleccione a data de emissão.'),
  customerId: z.string().min(1, 'Seleccione um cliente.'),
  invoiceId: z.string().optional(),
  reason: z.string().trim().min(3, 'Indique o motivo da nota de débito.').max(500),
  notes: z.string().trim().max(1000).optional(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Descreva a linha.').max(300),
        quantity: z.coerce.number().int().positive('Quantidade inválida.'),
        unitPrice: z.coerce.number().positive('Preço unitário inválido.'),
        taxRate: z.coerce.number().min(0).max(100).default(16),
      }),
    )
    .min(1, 'Adicione pelo menos uma linha.'),
});

export type DebitNoteInput = z.input<typeof debitNoteInput>;
type ParsedDebitNoteInput = z.output<typeof debitNoteInput>;

function debitNoteFingerprint(data: ParsedDebitNoteInput, issueDate: Date): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    issueDate: fpDate(issueDate),
    customerId: data.customerId,
    invoiceId: data.invoiceId ?? null,
    reason: data.reason,
    notes: data.notes ?? null,
    lines: data.lines.map((l) => ({ description: l.description, quantity: fpInt(l.quantity), unitPrice: fpAmount(l.unitPrice), taxRate: fpAmount(l.taxRate) })),
  });
}

/**
 * Emite uma nota de débito contra um cliente (factura opcional).
 * Efeitos: saldo do cliente (incremento) + lançamento D Clientes / C Outros
 * proveitos operacionais (+ C IVA). NUNCA movimenta stock.
 */
export async function createDebitNote(db: PrismaClient, ctx: RequestContext, input: DebitNoteInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'sales.create');
  const companyId = requireCompany(ctx);
  const parsed = debitNoteInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const data = parsed.data;
  const issueDate = resolveAllowedIssueDate(data.issueDate);
  const requestFingerprint = debitNoteFingerprint(data, issueDate);

  return db.$transaction(async (tx) => {
    const op = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'DEBIT_NOTE_CREATE',
      idempotencyKey: data.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'DebitNote',
      loadExisting: async (resourceId) => {
        return tx.debitNote.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
      },
      run: async () => {
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, companyId } });
        if (!customer) throw new NotFoundError('Cliente não encontrado.');

        let invoice: { id: string; number: string } | null = null;
        if (data.invoiceId) {
          const found = await tx.invoice.findFirst({ where: { id: data.invoiceId, companyId }, select: { id: true, number: true, customerId: true, status: true } });
          if (!found) throw new NotFoundError('Factura não encontrada.');
          if (found.customerId !== customer.id) throw new ValidationError('A factura indicada pertence a outro cliente.');
          if (found.status === 'CANCELLED') throw new ConflictError('Não é possível referenciar uma factura cancelada.');
          if (found.status === 'DRAFT') throw new ConflictError('Não é possível referenciar um rascunho de factura.');
          invoice = { id: found.id, number: found.number };
        }

        const prepared = data.lines.map((l) => {
          const r = computeLine({ quantity: l.quantity, unitPrice: round2(l.unitPrice), discountPercent: 0, taxPercent: l.taxRate });
          return { description: l.description, unitPrice: round2(l.unitPrice), quantity: l.quantity, taxRate: l.taxRate, total: r.total };
        });
        const totals = computeDocumentTotals(prepared.map((p) => ({ quantity: p.quantity, unitPrice: p.unitPrice, discountPercent: 0, taxPercent: p.taxRate })));
        if (round2(totals.total) <= 0) throw new ValidationError('O total da nota de débito tem de ser maior que zero.');

        const number = await nextDocNumber(tx, companyId, 'ND', issueDate.getUTCFullYear());
        const debitNote = await tx.debitNote.create({
          data: {
            companyId,
            number,
            customerId: customer.id,
            customerName: customer.name,
            customerNuit: customer.nuit,
            invoiceId: invoice?.id ?? null,
            issueDate,
            reason: data.reason,
            status: 'ISSUED',
            subtotal: totals.subtotal,
            taxableBase: totals.taxable,
            taxTotal: totals.tax,
            total: totals.total,
            notes: data.notes ?? null,
            createdBy: ctx.userId,
          },
        });
        for (const p of prepared) {
          await tx.debitNoteLine.create({
            data: {
              companyId,
              debitNoteId: debitNote.id,
              description: p.description,
              unitPrice: p.unitPrice,
              quantity: p.quantity,
              taxRate: p.taxRate,
              total: p.total,
            },
          });
        }

        await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: totals.total } } });

        // D Clientes (total) / C Outros proveitos (base) + C IVA liquidado (IVA).
        // S10b: a ND credita OTHER_INCOME (422) — sem fallback: mapping em falta
        // faz a operação falhar por inteiro com a mensagem do getMappedAccountTx.
        const ar = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_RECEIVABLE');
        const revenue = await getMappedAccountTx(tx, companyId, 'OTHER_INCOME');
        const lines = [
          { ledgerAccountId: ar.id, debit: totals.total, customerId: customer.id, description: `Nota de débito ${number}` },
          { ledgerAccountId: revenue.id, credit: totals.tax > 0 ? totals.taxable : totals.total, description: `Nota de débito ${number}` },
        ];
        if (totals.tax > 0) {
          const vat = await getMappedAccountTx(tx, companyId, 'VAT_OUTPUT');
          lines.push({ ledgerAccountId: vat.id, credit: totals.tax, description: `Nota de débito ${number}` });
        }
        await postAccountingEventTx(tx, ctx, {
          journalType: 'SALES',
          entryDate: debitNote.issueDate,
          dateLabel: 'A data de emissão',
          description: invoice ? `Nota de débito ${number} (factura ${invoice.number})` : `Nota de débito ${number}`,
          reference: number,
          origin: { sourceType: 'DEBIT_NOTE', sourceId: debitNote.id, accountingEvent: 'DEBIT_NOTE_ISSUED' },
          lines,
        });

        await writeAudit(tx, ctx, {
          action: 'debit_note.issue',
          entity: 'DebitNote',
          entityId: debitNote.id,
          newValues: {
            number,
            customerId: customer.id,
            customer: customer.name,
            invoiceId: invoice?.id ?? null,
            invoiceNumber: invoice?.number ?? null,
            issueDate: formatAccountingDate(issueDate),
            reason: data.reason,
            total: totals.total,
            taxableBase: totals.taxable,
            taxTotal: totals.tax,
            idempotencyKey: data.idempotencyKey,
            accounting: { sourceType: 'DEBIT_NOTE', accountingEvent: 'DEBIT_NOTE_ISSUED' },
          },
        });

        return { resourceType: 'DebitNote', resourceId: debitNote.id, result: { id: debitNote.id, number } };
      },
    });
    return op.result;
  });
}
