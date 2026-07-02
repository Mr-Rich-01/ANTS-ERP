'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@ants/ui';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { loginAction, type LoginState } from '@/app/(auth)/login/actions';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  border: '1px solid var(--field-bd)',
  borderRadius: 10,
  padding: '0 12px',
  fontSize: 14,
  background: 'var(--field)',
  color: 'var(--text)',
  outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--text2)',
  marginBottom: 6,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'A entrar…' : 'Entrar'}
    </Button>
  );
}

export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction] = useFormState<LoginState, FormData>(loginAction, {});

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 400,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow)',
        padding: '32px 30px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: ACCENT,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            fontWeight: 700,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)',
          }}
        >
          A
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '.2px' }}>ANTS ERP</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Inicie sessão na sua conta</div>
        </div>
      </div>

      {notice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '9px 12px', borderRadius: 10, marginBottom: 14 }}>
          <Icon name="check-circle-2" size={15} />
          {notice}
        </div>
      )}

      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label htmlFor="email" style={labelStyle}>
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="username" placeholder="nome@empresa.co.mz" style={inputStyle} required />
        </div>
        <div>
          <label htmlFor="password" style={labelStyle}>
            Palavra-passe
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" style={inputStyle} required />
        </div>

        {state.error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12.5,
              color: 'var(--bad)',
              background: 'var(--bad-bg)',
              padding: '9px 12px',
              borderRadius: 10,
            }}
          >
            <Icon name="alert-triangle" size={15} />
            {state.error}
          </div>
        )}

        <div style={{ marginTop: 4 }}>
          <SubmitButton />
        </div>
      </form>

    </div>
  );
}
