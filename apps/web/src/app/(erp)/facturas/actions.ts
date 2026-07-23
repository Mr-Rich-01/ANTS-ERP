'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import { applyAdvanceToInvoice, cancelCreditNote, cancelCustomerAdvance, cancelInvoice, createCreditNote, createCustomerAdvance, createCustomerRefund, createDebitNote, createInvoice, createPayment, discardInvoiceDraft, emitInvoiceVia, issueInvoiceDraft, refundAdvance, reverseCustomerPayment, saveInvoiceDraft, updateInvoiceDraft, DomainError, type ApplyAdvanceInput, type CancelCreditNoteInput, type CancelCustomerAdvanceInput, type CancelInvoiceInput, type CreditNoteInput, type CustomerAdvanceInput, type CustomerRefundInput, type DebitNoteInput, type DiscardInvoiceDraftInput, type EmitInvoiceViaInput, type InvoiceDraftUpdateInput, type InvoiceInput, type IssueInvoiceDraftInput, type PaymentInput, type RefundAdvanceInput, type ReverseCustomerPaymentInput } from '@ants/domain';
import { getContext } from '@/lib/session';

export interface InvoiceActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
  number?: string;
}

export async function createInvoiceAction(input: InvoiceInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createInvoice(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/produtos');
    revalidatePath('/contas/perfil');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function saveInvoiceDraftAction(input: InvoiceInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await saveInvoiceDraft(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function updateInvoiceDraftAction(input: InvoiceDraftUpdateInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await updateInvoiceDraft(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/facturas/documento');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function issueInvoiceDraftAction(input: IssueInvoiceDraftInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await issueInvoiceDraft(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/facturas/documento');
    revalidatePath('/produtos');
    revalidatePath('/inventario');
    revalidatePath('/contas/perfil');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function discardInvoiceDraftAction(input: DiscardInvoiceDraftInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await discardInvoiceDraft(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/facturas/documento');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function createPaymentAction(input: PaymentInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createPayment(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/contas/perfil');
    revalidatePath('/tesouraria');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function reverseCustomerPaymentAction(input: ReverseCustomerPaymentInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await reverseCustomerPayment(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/facturas/documento');
    // S18: um REC de método ADVANCE repõe o saldo no RA — refrescar também os adiantamentos.
    revalidatePath('/facturas/adiantamentos');
    revalidatePath('/facturas/adiantamento');
    revalidatePath('/contas/perfil');
    revalidatePath('/tesouraria');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function createCreditNoteAction(input: CreditNoteInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createCreditNote(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/facturas/notas');
    revalidatePath('/contas/perfil');
    revalidatePath('/produtos');
    revalidatePath('/inventario');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function createDebitNoteAction(input: DebitNoteInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createDebitNote(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/facturas/notas');
    revalidatePath('/contas/perfil');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function cancelCreditNoteAction(input: CancelCreditNoteInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await cancelCreditNote(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/facturas/notas');
    revalidatePath('/facturas/nota-credito');
    revalidatePath('/contas/perfil');
    revalidatePath('/produtos');
    revalidatePath('/inventario');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export interface InvoiceViaActionResult extends InvoiceActionResult {
  via?: number;
}

/** Emite uma via adicional (S15): regista no histórico e devolve o número da via. */
export async function emitInvoiceViaAction(input: EmitInvoiceViaInput): Promise<InvoiceViaActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { via, number } = await emitInvoiceVia(forContext(ctx), ctx, input);
    revalidatePath('/facturas/documento');
    return { ok: true, via, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Recibo de Adiantamento (S17): entrada de dinheiro sem factura. */
export async function createCustomerAdvanceAction(input: CustomerAdvanceInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createCustomerAdvance(forContext(ctx), ctx, input);
    revalidatePath('/facturas/adiantamentos');
    revalidatePath('/contas/perfil');
    revalidatePath('/tesouraria');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Aplica um RA a uma factura (S17): gera um REC com método Adiantamento. */
export async function applyAdvanceToInvoiceAction(input: ApplyAdvanceInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { paymentId, paymentNumber } = await applyAdvanceToInvoice(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/facturas/documento');
    revalidatePath('/facturas/adiantamentos');
    revalidatePath('/contas/perfil');
    revalidatePath('/contabilidade');
    return { ok: true, id: paymentId, number: paymentNumber };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Cancela um RA intacto (S18): tesouraria revertida + estorno do ADVANCE_RECEIVED. */
export async function cancelCustomerAdvanceAction(input: CancelCustomerAdvanceInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await cancelCustomerAdvance(forContext(ctx), ctx, input);
    revalidatePath('/facturas/adiantamentos');
    revalidatePath('/facturas/adiantamento');
    revalidatePath('/contas/perfil');
    revalidatePath('/tesouraria');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Devolução ao Cliente do remanescente de um RA (S17). */
export async function refundAdvanceAction(input: RefundAdvanceInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await refundAdvance(forContext(ctx), ctx, input);
    revalidatePath('/facturas/adiantamentos');
    revalidatePath('/facturas/devolucoes');
    revalidatePath('/contas/perfil');
    revalidatePath('/tesouraria');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Devolução ao Cliente com origem em NC ou recibo (S17) — nunca movimenta stock. */
export async function createCustomerRefundAction(input: CustomerRefundInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createCustomerRefund(forContext(ctx), ctx, input);
    revalidatePath('/facturas/devolucoes');
    revalidatePath('/contas/perfil');
    revalidatePath('/tesouraria');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function cancelInvoiceAction(input: CancelInvoiceInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await cancelInvoice(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/facturas/documento');
    revalidatePath('/contas/perfil');
    revalidatePath('/produtos');
    revalidatePath('/inventario');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
