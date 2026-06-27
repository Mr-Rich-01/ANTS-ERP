'use server';

import { prisma } from '@ants/database';
import { hashPassword } from '@ants/domain';
import { signOut } from '@/auth';
import { requireSession } from '@/lib/session';

export interface ChangePwState {
  error?: string;
}

export async function changePasswordAction(_prev: ChangePwState, formData: FormData): Promise<ChangePwState> {
  const user = await requireSession();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < 8) return { error: 'A palavra-passe deve ter pelo menos 8 caracteres.' };
  if (password !== confirm) return { error: 'As palavras-passe não coincidem.' };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false },
  });

  // Termina a sessão para emitir um token actualizado; o utilizador entra de novo.
  await signOut({ redirectTo: '/login?changed=1' });
  return {};
}
