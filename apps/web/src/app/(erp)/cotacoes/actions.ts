'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import { createQuotation, DomainError, type QuotationInput } from '@ants/domain';
import { getContext } from '@/lib/session';

export interface QuotationActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
  number?: string;
}

export async function createQuotationAction(input: QuotationInput): Promise<QuotationActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createQuotation(forContext(ctx), ctx, input);
    revalidatePath('/cotacoes');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
