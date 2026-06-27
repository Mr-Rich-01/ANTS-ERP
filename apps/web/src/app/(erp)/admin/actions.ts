'use server';

import { revalidatePath } from 'next/cache';
import { forCompany } from '@ants/database';
import { createCompanyUser, createRole, DomainError, setUserStatus } from '@ants/domain';
import { getContext } from '@/lib/session';

export interface InviteState {
  error?: string;
  ok?: boolean;
  tempPassword?: string;
  userName?: string;
}

export async function inviteUserAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  const name = String(formData.get('name') ?? '');
  try {
    const { tempPassword } = await createCompanyUser(forCompany(ctx.companyId), ctx, {
      name,
      email: String(formData.get('email') ?? ''),
      roleId: String(formData.get('roleId') ?? '') || undefined,
    });
    revalidatePath('/admin');
    return { ok: true, tempPassword, userName: name };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export interface RoleState {
  error?: string;
  ok?: boolean;
}

export async function createRoleAction(_prev: RoleState, formData: FormData): Promise<RoleState> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    await createRole(forCompany(ctx.companyId), ctx, {
      name: String(formData.get('name') ?? ''),
      description: String(formData.get('description') ?? ''),
      permissionKeys: formData.getAll('permissions').map(String),
    });
    revalidatePath('/admin');
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function toggleUserStatusAction(userId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<{ error?: string }> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    await setUserStatus(forCompany(ctx.companyId), ctx, userId, status);
    revalidatePath('/admin');
    return {};
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
