'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import {
  createProduct,
  updateProduct,
  adjustInventory,
  DomainError,
  type ProductInput,
} from '@ants/domain';
import { getContext } from '@/lib/session';

export interface ProductFormState {
  error?: string;
  ok?: boolean;
  id?: string;
}

function readProductInput(formData: FormData): ProductInput {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v : undefined;
  };
  const num = (k: string) => {
    const v = str(k);
    return v === undefined || v.trim() === '' ? undefined : Number(v);
  };
  return {
    sku: str('sku') ?? '',
    name: str('name') ?? '',
    category: str('category'),
    brand: str('brand'),
    unit: str('unit') || 'un',
    salePrice: num('salePrice'),
    avgCost: num('avgCost'),
    taxRate: num('taxRate'),
    minStock: num('minStock'),
    barcode: str('barcode'),
    notes: str('notes'),
  };
}

export async function createProductAction(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id } = await createProduct(forContext(ctx), ctx, readProductInput(formData));
    revalidatePath('/produtos');
    return { ok: true, id };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function updateProductAction(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Produto inválido.' };
  try {
    await updateProduct(forContext(ctx), ctx, id, readProductInput(formData));
    revalidatePath('/produtos');
    revalidatePath('/produtos/ficha');
    return { ok: true, id };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export interface InventoryResult {
  error?: string;
  ok?: boolean;
  adjusted?: number;
}

/** Aplica um ajuste de inventário a um armazém (contagem física). */
export async function adjustInventoryAction(input: {
  warehouseId: string;
  items: Array<{ productId: string; countedQty: number }>;
}): Promise<InventoryResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { adjusted } = await adjustInventory(forContext(ctx), ctx, input.warehouseId, input.items);
    revalidatePath('/inventario');
    revalidatePath('/produtos');
    revalidatePath('/produtos/ficha');
    return { ok: true, adjusted };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
