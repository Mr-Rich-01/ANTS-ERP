'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import { createCustomer, updateCustomer, DomainError, type CustomerInput } from '@ants/domain';
import { getContext } from '@/lib/session';

export interface CustomerFormState {
  error?: string;
  ok?: boolean;
  id?: string;
}

/** Extrai o input do cliente a partir do FormData (validação fina fica no domínio/Zod). */
function readCustomerInput(formData: FormData): CustomerInput {
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
    segment: str('segment'),
    creditLimit: num('creditLimit'),
    paymentTermDays: num('paymentTermDays'),
    notes: str('notes'),
  };
}

export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id } = await createCustomer(forContext(ctx), ctx, readCustomerInput(formData));
    revalidatePath('/clientes');
    return { ok: true, id };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function updateCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Cliente inválido.' };
  try {
    await updateCustomer(forContext(ctx), ctx, id, readCustomerInput(formData));
    revalidatePath('/clientes');
    revalidatePath('/contas/perfil');
    return { ok: true, id };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
