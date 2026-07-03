'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import {
  createPurchaseOrder,
  receivePurchaseOrder,
  createSupplierPayment,
  reverseSupplierPayment,
  DomainError,
  type PurchaseInput,
  type ReceivePurchaseOptions,
  type ReverseSupplierPaymentInput,
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

export async function receivePurchaseOrderAction(orderId: string, items: Array<{ lineId: string; quantity: number }>, options: ReceivePurchaseOptions = {}): Promise<PurchaseActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { number } = await receivePurchaseOrder(forContext(ctx), ctx, orderId, items, options);
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

export async function reverseSupplierPaymentAction(input: ReverseSupplierPaymentInput): Promise<PurchaseActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, number } = await reverseSupplierPayment(forContext(ctx), ctx, input);
    revalidatePath('/compras');
    revalidatePath('/compras/ordem');
    revalidatePath('/contas/perfil');
    revalidatePath('/tesouraria');
    revalidatePath('/contabilidade');
    return { ok: true, id, number };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
