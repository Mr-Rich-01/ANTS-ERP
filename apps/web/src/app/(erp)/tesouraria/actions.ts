'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import { createAccount, recordMovement, transfer, DomainError, type AccountInput, type MovementInput, type TransferInput } from '@ants/domain';
import { getContext } from '@/lib/session';

export interface TreasuryResult {
  error?: string;
  ok?: boolean;
}

export async function createAccountAction(input: AccountInput): Promise<TreasuryResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    await createAccount(forContext(ctx), ctx, input);
    revalidatePath('/tesouraria');
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function recordMovementAction(input: MovementInput): Promise<TreasuryResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    await recordMovement(forContext(ctx), ctx, input);
    revalidatePath('/tesouraria');
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function transferAction(input: TransferInput): Promise<TreasuryResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    await transfer(forContext(ctx), ctx, input);
    revalidatePath('/tesouraria');
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
