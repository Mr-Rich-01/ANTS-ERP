'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import { executeInventoryRegularization, DomainError } from '@ants/domain';
import { getContext } from '@/lib/session';

export interface RegularizationActionResult {
  error?: string;
  ok?: boolean;
  entryId?: string;
  entryNumber?: string;
  divergence?: number;
}

/**
 * Executa a regularização de existências. O valor NÃO vem do cliente como verdade:
 * `expectedDivergence` é apenas a confirmação do que foi pré-visualizado — o domínio
 * recomputa dentro da transacção e falha por inteiro se os valores mudaram.
 */
export async function executeInventoryRegularizationAction(input: {
  expectedDivergence: number;
  notes?: string;
  idempotencyKey: string;
}): Promise<RegularizationActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const res = await executeInventoryRegularization(
      forContext(ctx),
      ctx,
      { expectedDivergence: input.expectedDivergence, notes: input.notes },
      { idempotencyKey: input.idempotencyKey },
    );
    revalidatePath('/contabilidade');
    revalidatePath('/contabilidade/lancamentos');
    revalidatePath('/contabilidade/regularizacao');
    return { ok: true, entryId: res.entryId, entryNumber: res.entryNumber, divergence: res.divergence };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
