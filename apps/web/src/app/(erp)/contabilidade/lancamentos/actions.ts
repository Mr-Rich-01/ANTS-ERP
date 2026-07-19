'use server';

import { revalidatePath } from 'next/cache';
import { forContext } from '@ants/database';
import {
  createJournalEntryDraft,
  updateJournalEntryDraft,
  deleteJournalEntryDraft,
  postJournalEntry,
  reverseJournalEntry,
  DomainError,
  type JournalEntryDraftInput,
} from '@ants/domain';
import { getContext } from '@/lib/session';

export interface JournalEntryActionResult {
  error?: string;
  ok?: boolean;
  id?: string;
  entryNumber?: string;
}

function revalidateAccounting(): void {
  revalidatePath('/contabilidade');
  revalidatePath('/contabilidade/lancamentos');
}

/** Cria um rascunho de lançamento manual (gate `accounting.prepare` no domínio). */
export async function createJournalEntryDraftAction(input: JournalEntryDraftInput): Promise<JournalEntryActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const { id, entryNumber } = await createJournalEntryDraft(forContext(ctx), ctx, input);
    revalidateAccounting();
    return { ok: true, id, entryNumber };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Actualiza um rascunho existente (substitui as linhas). */
export async function updateJournalEntryDraftAction(id: string, input: JournalEntryDraftInput): Promise<JournalEntryActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    await updateJournalEntryDraft(forContext(ctx), ctx, id, input);
    revalidateAccounting();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Elimina um rascunho (snapshot completo fica na auditoria). */
export async function deleteJournalEntryDraftAction(id: string): Promise<JournalEntryActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    await deleteJournalEntryDraft(forContext(ctx), ctx, id);
    revalidateAccounting();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Confirma (POSTED) um rascunho — partidas dobradas validadas no domínio. */
export async function postJournalEntryAction(id: string): Promise<JournalEntryActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const res = await postJournalEntry(forContext(ctx), ctx, id);
    revalidateAccounting();
    return { ok: true, id: res.id, entryNumber: res.entryNumber };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** Estorna um lançamento confirmado (cria lançamento simétrico; original → REVERSED). */
export async function reverseJournalEntryAction(id: string, input: { reason?: string }): Promise<JournalEntryActionResult> {
  const ctx = await getContext();
  if (!ctx.companyId) return { error: 'Sem empresa activa.' };
  try {
    const res = await reverseJournalEntry(forContext(ctx), ctx, id, { reason: input.reason });
    revalidateAccounting();
    return { ok: true, id: res.reversalId, entryNumber: res.reversalNumber };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
