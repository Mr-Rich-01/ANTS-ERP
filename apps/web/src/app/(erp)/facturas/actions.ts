'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import { createInvoice, createPayment, DomainError, type InvoiceInput, type PaymentInput } from '@ants/domain';
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

export async function createPaymentAction(input: PaymentInput): Promise<InvoiceActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createPayment(forContext(ctx), ctx, input);
    revalidatePath('/facturas');
    revalidatePath('/contas/perfil');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
