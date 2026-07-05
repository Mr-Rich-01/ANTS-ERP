'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import { createPosSale, DomainError, type PosSaleInput } from '@ants/domain';
import { getContext } from '@/lib/session';

export interface PosSaleActionResult {
  ok?: boolean;
  error?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  paymentNumber?: string;
}

export async function createPosSaleAction(input: PosSaleInput): Promise<PosSaleActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const result = await createPosSale(forContext(ctx), ctx, input);
    revalidatePath('/pos');
    revalidatePath('/facturas');
    revalidatePath('/facturas/documento');
    revalidatePath('/produtos');
    revalidatePath('/inventario');
    revalidatePath('/contas/perfil');
    revalidatePath('/tesouraria');
    revalidatePath('/contabilidade');
    return { ok: true, invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber, paymentNumber: result.paymentNumber };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
