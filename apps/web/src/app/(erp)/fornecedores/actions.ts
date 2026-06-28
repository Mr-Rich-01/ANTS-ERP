'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import { createSupplier, updateSupplier, DomainError, type SupplierInput } from '@ants/domain';
import { getContext } from '@/lib/session';

export interface SupplierFormState {
  error?: string;
  ok?: boolean;
  id?: string;
}

/** Extrai o input do fornecedor a partir do FormData (validação fina fica no domínio/Zod). */
function readSupplierInput(formData: FormData): SupplierInput {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v : undefined;
  };
  const num = (k: string) => {
    const v = str(k);
    return v === undefined || v.trim() === '' ? undefined : Number(v);
  };
  return {
    name: str('name') ?? '',
    type: str('type') === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY',
    nuit: str('nuit'),
    email: str('email'),
    phone: str('phone'),
    address: str('address'),
    province: str('province'),
    district: str('district'),
    category: str('category'),
    creditLimit: num('creditLimit'),
    paymentTermDays: num('paymentTermDays'),
    notes: str('notes'),
  };
}

export async function createSupplierAction(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id } = await createSupplier(forContext(ctx), ctx, readSupplierInput(formData));
    revalidatePath('/fornecedores');
    return { ok: true, id };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function updateSupplierAction(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Fornecedor inválido.' };
  try {
    await updateSupplier(forContext(ctx), ctx, id, readSupplierInput(formData));
    revalidatePath('/fornecedores');
    revalidatePath('/contas/perfil');
    return { ok: true, id };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
