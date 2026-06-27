'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@ants/ui';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { changePasswordAction, type ChangePwState } from '@/app/trocar-password/actions';

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
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'A guardar…' : 'Definir nova palavra-passe'}
    </Button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useFormState<ChangePwState, FormData>(changePasswordAction, {});

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="key-round" size={24} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Definir nova palavra-passe</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 3, lineHeight: 1.5 }}>
            É a sua primeira sessão. Defina uma palavra-passe pessoal antes de continuar.
          </div>
        </div>
      </div>

      <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label htmlFor="password" style={labelStyle}>
            Nova palavra-passe
          </label>
          <input id="password" name="password" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" style={inputStyle} required />
        </div>
        <div>
          <label htmlFor="confirm" style={labelStyle}>
            Confirmar palavra-passe
          </label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" placeholder="Repita a palavra-passe" style={inputStyle} required />
        </div>

        {state.error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10 }}>
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
