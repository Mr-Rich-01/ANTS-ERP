'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import {
  createPurchaseOrder,
  receivePurchaseOrder,
  createSupplierPayment,
  DomainError,
  type PurchaseInput,
  type SupplierPaymentInput,
} from '@ants/domain';
import { getContext } from '@/lib/session';

export interface PurchaseActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
  number?: string;
}

export async function createPurchaseOrderAction(input: PurchaseInput): Promise<PurchaseActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createPurchaseOrder(forContext(ctx), ctx, input);
    revalidatePath('/compras');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function receivePurchaseOrderAction(orderId: string, items: Array<{ lineId: string; quantity: number }>): Promise<PurchaseActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { number } = await receivePurchaseOrder(forContext(ctx), ctx, orderId, items);
    revalidatePath('/compras');
    revalidatePath('/compras/ordem');
    revalidatePath('/produtos');
    revalidatePath('/contas/perfil');
    return { ok: true, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function createSupplierPaymentAction(input: SupplierPaymentInput): Promise<PurchaseActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await createSupplierPayment(forContext(ctx), ctx, input);
    revalidatePath('/compras');
    revalidatePath('/compras/ordem');
    revalidatePath('/contas/perfil');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
