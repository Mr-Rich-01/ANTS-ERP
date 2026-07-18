/**
 * Documentos Comerciais (Sessão S5): Cotação, Nota de Crédito e Nota de Débito.
 *
 * - Cotação: documento PRÉ-TRANSACCIONAL — nunca movimenta stock, saldo ou contabilidade.
 * - Nota de Crédito (NC): sempre contra uma factura emitida; reduz o saldo do cliente;
 *   devolve stock apenas quando returnStock (com snapshot do custo médio por linha);
 *   lança o espelho da venda (D 411 Vendas, D 221 IVA liquidado / C 121 Clientes).
 *   O par 131/CMV da devolução fica para a S10 (decisão aprovada — ver ROADMAP S10).
 * - Nota de Débito (ND): contra um cliente, factura opcional; aumenta o saldo do cliente;
 *   lança D 121 Clientes / C 411 Vendas (+ C 221 IVA). Nunca movimenta stock.
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
import { postAccountingEventTx } from './accounting-events';
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

        for (const p of prepared) {
          // Snapshot do custo médio no momento da devolução (aprovado): o documento
          // e o futuro par 131/CMV (S10) não dependem do custo posterior.
          let unitCost: number | null = null;
          if (data.returnStock && p.productId) {
            const product = await tx.product.findFirst({ where: { id: p.productId, companyId }, select: { avgCost: true } });
            unitCost = product ? round2(Number(product.avgCost)) : null;
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
 * Efeitos: saldo do cliente (incremento) + lançamento D Clientes / C Vendas (+ C IVA).
 * NUNCA movimenta stock.
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

        // D Clientes (total) / C Vendas (base) + C IVA liquidado (IVA).
        // Limitação V1 declarada: sem conta mapeada de «Outros proveitos», credita Vendas.
        const ar = await getMappedAccountTx(tx, companyId, 'ACCOUNTS_RECEIVABLE');
        const revenue = await getMappedAccountTx(tx, companyId, 'SALES_REVENUE');
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
