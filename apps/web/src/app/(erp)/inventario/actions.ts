'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import {
  createStockCount,
  updateStockCount,
  validateStockCount,
  discardStockCount,
  DomainError,
  type StockCountLineInput,
} from '@ants/domain';
import { getContext } from '@/lib/session';

export interface StockCountActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
  number?: string;
}

function revalidateInventory(): void {
  revalidatePath('/inventario');
  revalidatePath('/inventario/contagem');
  revalidatePath('/produtos');
  revalidatePath('/produtos/ficha');
}

/** Grava uma contagem de inventário como RASCUNHO (zero efeitos). */
export async function createStockCountAction(input: {
  warehouseId: string;
  notes?: string;
  lines: StockCountLineInput[];
  idempotencyKey?: string;
}): Promise<StockCountActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createStockCount(
      forContext(ctx),
      ctx,
      { warehouseId: input.warehouseId, notes: input.notes, lines: input.lines },
      { idempotencyKey: input.idempotencyKey },
    );
    revalidateInventory();
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Actualiza um rascunho de contagem (substitui linhas e refresca snapshots). */
export async function updateStockCountAction(input: {
  stockCountId: string;
  notes?: string;
  lines: StockCountLineInput[];
}): Promise<StockCountActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await updateStockCount(forContext(ctx), ctx, input);
    revalidateInventory();
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Valida uma contagem: só aqui o stock é ajustado e a contabilidade lançada. */
export async function validateStockCountAction(input: {
  stockCountId: string;
  idempotencyKey?: string;
}): Promise<StockCountActionResult & { adjusted?: number; entryNumber?: string | null }> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const result = await validateStockCount(
      forContext(ctx),
      ctx,
      { stockCountId: input.stockCountId },
      { idempotencyKey: input.idempotencyKey },
    );
    revalidateInventory();
    revalidatePath('/contabilidade');
    return { ok: true, id: result.id, number: result.number, adjusted: result.adjusted, entryNumber: result.entryNumber };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Descarta um rascunho de contagem com motivo obrigatório. */
export async function discardStockCountAction(input: { stockCountId: string; reason: string }): Promise<StockCountActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await discardStockCount(forContext(ctx), ctx, input);
    revalidateInventory();
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
