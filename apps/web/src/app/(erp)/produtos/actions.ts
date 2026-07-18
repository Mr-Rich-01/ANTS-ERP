'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import {
  createProduct,
  updateProduct,
  DomainError,
  type CreateProductOptions,
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

/**
 * Stock inicial (S8): só entra quando quantidade ou custo unitário foram
 * preenchidos — o valor default do selector de armazém nunca cria stock sozinho.
 * Preenchimento parcial segue para o domínio, que valida e devolve o erro claro.
 */
function readCreateOptions(formData: FormData): CreateProductOptions {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const quantity = str('initialQty');
  const unitCost = str('initialUnitCost');
  const idempotencyKey = str('idempotencyKey') || undefined;
  if (quantity === '' && unitCost === '') return { idempotencyKey };
  return {
    idempotencyKey,
    initialStock: { quantity: Number(quantity), unitCost: Number(unitCost), warehouseId: str('initialWarehouseId') },
  };
}

export async function createProductAction(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id } = await createProduct(forContext(ctx), ctx, readProductInput(formData), readCreateOptions(formData));
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

// O ajuste directo de inventário foi removido na Sessão S9 — o fluxo passou a ser
// em duas etapas (contagem em rascunho → validação) em `/inventario/actions.ts`.
