'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Indique o email e a palavra-passe.' };
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/' });
    return {};
  } catch (e) {
    // signIn lança um redirect (NEXT_REDIRECT) em caso de sucesso — tem de propagar.
    if (e instanceof AuthError) {
      return { error: 'Credenciais inválidas ou conta bloqueada.' };
    }
    throw e;
  }
}
