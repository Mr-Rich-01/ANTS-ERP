import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: { changed?: string } }) {
  const user = await getSessionUser();
  if (user) redirect('/');
  return <LoginForm notice={searchParams.changed ? 'Palavra-passe alterada. Inicie sessão.' : undefined} />;
}
