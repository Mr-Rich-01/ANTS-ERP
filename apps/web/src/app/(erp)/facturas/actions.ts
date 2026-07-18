'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import { cancelInvoice, createCreditNote, createDebitNote, createInvoice, createPayment, discardInvoiceDraft, issueInvoiceDraft, reverseCustomerPayment, saveInvoiceDraft, updateInvoiceDraft, DomainError, type CancelInvoiceInput, type CreditNoteInput, type DebitNoteInput, type DiscardInvoiceDraftInput, type InvoiceDraftUpdateInput, type InvoiceInput, type IssueInvoiceDraftInput, type PaymentInput, type ReverseCustomerPaymentInput } from '@ants/domain';
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
