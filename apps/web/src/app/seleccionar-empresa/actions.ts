'use server';

import { redirect } from 'next/navigation';
import { activateCompanyForSession } from '@/lib/company-selection';
import { requireSession } from '@/lib/session';

export async function selectCompanyAction(formData: FormData): Promise<void> {
  const user = await requireSession();
  const companyId = String(formData.get('companyId') ?? '');
  const ok = companyId ? await activateCompanyForSession(user, companyId) : false;
  if (!ok) redirect('/seleccionar-empresa?erro=empresa-invalida');
  redirect('/');
}
