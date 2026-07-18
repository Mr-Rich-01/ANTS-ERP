'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import {
  DomainError,
  removeCompanyLogo,
  setCompanyLogo,
  updateCompanyProfile,
  type CompanyProfileInput,
} from '@ants/domain';
import { getContext } from '@/lib/session';

export interface CompanyProfileFormState {
  error?: string;
  ok?: boolean;
}

/** Lê o input do perfil a partir do FormData (listas em JSON de inputs hidden). */
function readProfileInput(formData: FormData): CompanyProfileInput {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v : undefined;
  };
  const jsonList = <T>(k: string): T[] => {
    const raw = str(k);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  };
  return {
    legalName: str('legalName') ?? '',
    tradeName: str('tradeName'),
    nuit: str('nuit'),
    email: str('email'),
    phone: str('phone'),
    address: str('address'),
    website: str('website'),
    bankAccounts: jsonList('bankAccounts'),
    mobileWallets: jsonList('mobileWallets'),
  };
}

function revalidateCompanyData() {
  // Sidebar/topbar (layout) + ecrãs que mostram identidade/cabeçalho da empresa.
  revalidatePath('/', 'layout');
}

export async function updateCompanyProfileAction(
  _prev: CompanyProfileFormState,
  formData: FormData,
): Promise<CompanyProfileFormState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    await updateCompanyProfile(forContext(ctx), ctx, readProfileInput(formData));
    revalidateCompanyData();
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function uploadCompanyLogoAction(
  _prev: CompanyProfileFormState,
  formData: FormData,
): Promise<CompanyProfileFormState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) return { error: 'Escolha um ficheiro de imagem.' };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await setCompanyLogo(forContext(ctx), ctx, { fileName: file.name, mimeType: file.type, bytes });
    revalidateCompanyData();
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function removeCompanyLogoAction(
  _prev: CompanyProfileFormState,
  _formData: FormData,
): Promise<CompanyProfileFormState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    await removeCompanyLogo(forContext(ctx), ctx);
    revalidateCompanyData();
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
