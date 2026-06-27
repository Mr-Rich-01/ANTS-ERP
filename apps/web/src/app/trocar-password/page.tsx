import { requireSession } from '@/lib/session';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';

export default async function TrocarPasswordPage() {
  await requireSession(); // exige sessão; redirecciona para /login se não houver
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 24,
      }}
    >
      <ChangePasswordForm />
    </div>
  );
}
