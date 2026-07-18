'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Button, Input, Label } from '@ants/ui';
import { Icon } from '@/components/Icon';
import {
  removeCompanyLogoAction,
  updateCompanyProfileAction,
  uploadCompanyLogoAction,
  type CompanyProfileFormState,
} from './actions';

interface BankAccountRow {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  nib: string;
  iban: string;
  swift: string;
  isActive: boolean;
}

interface MobileWalletRow {
  provider: string;
  walletNumber: string;
  accountHolder: string;
  isActive: boolean;
}

export interface CompanyProfileView {
  legalName: string;
  tradeName: string | null;
  nuit: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  logoVersion: string | null;
  bankAccounts: BankAccountRow[];
  mobileWallets: MobileWalletRow[];
}

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' };
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 };
const hint: React.CSSProperties = { fontSize: 12, color: 'var(--text3)' };

function Feedback({ state }: { state: CompanyProfileFormState }) {
  if (state.error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10 }}>
        <Icon name="alert-triangle" size={15} />
        {state.error}
      </div>
    );
  }
  if (state.ok) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '9px 12px', borderRadius: 10 }}>
        <Icon name="check-circle-2" size={15} />
        Alterações guardadas.
      </div>
    );
  }
  return null;
}

function SubmitProfile() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'A guardar…' : 'Guardar alterações'}
    </Button>
  );
}

function SubmitLogo() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'A carregar…' : 'Carregar logótipo'}
    </Button>
  );
}

function Field({
  id,
  label,
  name,
  defaultValue,
  placeholder,
  required,
  mono,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className={mono ? 'font-mono' : undefined}
        style={{ marginTop: 6 }}
      />
    </div>
  );
}

const rowInput: React.CSSProperties = {
  height: 34,
  width: '100%',
  borderRadius: 8,
  border: '1px solid var(--field-bd)',
  background: 'var(--field)',
  padding: '0 9px',
  fontSize: 12.5,
  color: 'var(--text)',
  outline: 'none',
};

export function CompanyProfileClient({ profile }: { profile: CompanyProfileView }) {
  const [profileState, profileAction] = useFormState<CompanyProfileFormState, FormData>(updateCompanyProfileAction, {});
  const [logoState, logoAction] = useFormState<CompanyProfileFormState, FormData>(uploadCompanyLogoAction, {});
  const [removeState, removeAction] = useFormState<CompanyProfileFormState, FormData>(removeCompanyLogoAction, {});

  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>(profile.bankAccounts);
  const [wallets, setWallets] = useState<MobileWalletRow[]>(profile.mobileWallets);

  const bankJson = useMemo(() => JSON.stringify(bankAccounts), [bankAccounts]);
  const walletsJson = useMemo(() => JSON.stringify(wallets), [wallets]);

  const logoUrl = profile.logoVersion ? `/api/company/logo?v=${profile.logoVersion}` : null;

  const setBank = (i: number, patch: Partial<BankAccountRow>) =>
    setBankAccounts((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const setWallet = (i: number, patch: Partial<MobileWalletRow>) =>
    setWallets((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const move = <T,>(rows: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return rows;
    const next = [...rows];
    const tmp = next[i] as T;
    next[i] = next[j] as T;
    next[j] = tmp;
    return next;
  };

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1080 }}>
      {/* Logótipo — form próprio (upload imediato) */}
      <div style={card}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 14,
              background: 'var(--field)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flex: 'none',
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logótipo da empresa" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <Icon name="image" size={26} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={cardTitle}>
              <Icon name="image" size={16} />
              Logótipo
            </div>
            <div style={hint}>PNG, JPG ou WebP · máximo 1 MB. Aparece na barra lateral e nos documentos comerciais.</div>
            <form action={logoAction} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp"
                required
                style={{ fontSize: 12.5, color: 'var(--text2)' }}
              />
              <SubmitLogo />
            </form>
            {logoUrl ? (
              <form action={removeAction}>
                <Button type="submit" size="sm" variant="secondary">
                  <Icon name="trash-2" size={14} />
                  Remover logótipo
                </Button>
              </form>
            ) : null}
            <Feedback state={logoState.error || logoState.ok ? logoState : removeState} />
          </div>
        </div>
      </div>

      {/* Dados + listas — um único form */}
      <form action={profileAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input type="hidden" name="bankAccounts" value={bankJson} />
        <input type="hidden" name="mobileWallets" value={walletsJson} />

        <div style={card}>
          <div style={{ ...cardTitle, marginBottom: 14 }}>
            <Icon name="building-2" size={16} />
            Identidade da empresa
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 13 }}>
            <Field id="cp-legal" label="Nome legal" name="legalName" defaultValue={profile.legalName} required />
            <Field id="cp-trade" label="Nome comercial" name="tradeName" defaultValue={profile.tradeName ?? ''} />
            <Field id="cp-nuit" label="NUIT" name="nuit" defaultValue={profile.nuit ?? ''} placeholder="9 dígitos" mono />
            <Field id="cp-phone" label="Telefone" name="phone" defaultValue={profile.phone ?? ''} placeholder="+258 …" />
            <Field id="cp-email" label="Email" name="email" defaultValue={profile.email ?? ''} placeholder="geral@empresa.co.mz" />
            <Field id="cp-web" label="Website (opcional)" name="website" defaultValue={profile.website ?? ''} placeholder="https://…" />
          </div>
          <div style={{ marginTop: 13 }}>
            <Field id="cp-address" label="Endereço" name="address" defaultValue={profile.address ?? ''} placeholder="Avenida, n.º, cidade" />
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={cardTitle}>
              <Icon name="landmark" size={16} />
              Contas bancárias
            </div>
            <div style={{ flex: 1 }} />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setBankAccounts((rows) => [
                  ...rows,
                  { bankName: '', accountHolder: '', accountNumber: '', nib: '', iban: '', swift: '', isActive: true },
                ])
              }
            >
              <Icon name="plus" size={14} />
              Adicionar conta
            </Button>
          </div>
          <div style={{ ...hint, marginBottom: 12 }}>A ordem das contas é a ordem em que aparecem nos documentos.</div>
          {bankAccounts.length === 0 ? (
            <div style={{ ...hint, padding: '8px 0' }}>Sem contas bancárias configuradas.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bankAccounts.map((a, i) => (
                <div key={i} style={{ border: '1px solid var(--bd-soft)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 9 }}>
                    <input aria-label="Banco" placeholder="Banco *" value={a.bankName} onChange={(e) => setBank(i, { bankName: e.target.value })} style={rowInput} />
                    <input aria-label="Titular" placeholder="Titular" value={a.accountHolder} onChange={(e) => setBank(i, { accountHolder: e.target.value })} style={rowInput} />
                    <input aria-label="Número da conta" placeholder="N.º da conta" value={a.accountNumber} onChange={(e) => setBank(i, { accountNumber: e.target.value })} style={{ ...rowInput }} className="font-mono" />
                    <input aria-label="NIB" placeholder="NIB (21 dígitos)" value={a.nib} onChange={(e) => setBank(i, { nib: e.target.value })} style={rowInput} className="font-mono" />
                    <input aria-label="IBAN" placeholder="IBAN" value={a.iban} onChange={(e) => setBank(i, { iban: e.target.value })} style={rowInput} className="font-mono" />
                    <input aria-label="SWIFT" placeholder="SWIFT" value={a.swift} onChange={(e) => setBank(i, { swift: e.target.value })} style={rowInput} className="font-mono" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                      <input type="checkbox" checked={a.isActive} onChange={(e) => setBank(i, { isActive: e.target.checked })} />
                      Activa (aparece nos documentos)
                    </label>
                    <div style={{ flex: 1 }} />
                    <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => setBankAccounts((rows) => move(rows, i, -1))} title="Subir">
                      <Icon name="arrow-up" size={14} />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={i === bankAccounts.length - 1} onClick={() => setBankAccounts((rows) => move(rows, i, 1))} title="Descer">
                      <Icon name="arrow-down" size={14} />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setBankAccounts((rows) => rows.filter((_, idx) => idx !== i))} title="Remover conta">
                      <Icon name="trash-2" size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={cardTitle}>
              <Icon name="smartphone" size={16} />
              Carteiras móveis
            </div>
            <div style={{ flex: 1 }} />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setWallets((rows) => [...rows, { provider: '', walletNumber: '', accountHolder: '', isActive: true }])}
            >
              <Icon name="plus" size={14} />
              Adicionar carteira
            </Button>
          </div>
          <div style={{ ...hint, marginBottom: 12 }}>M-Pesa, e-Mola, mKesh… (texto livre — novas operadoras são aceites).</div>
          {wallets.length === 0 ? (
            <div style={{ ...hint, padding: '8px 0' }}>Sem carteiras móveis configuradas.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {wallets.map((w, i) => (
                <div key={i} style={{ border: '1px solid var(--bd-soft)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 9 }}>
                    <input aria-label="Operadora" placeholder="Operadora * (ex.: M-Pesa)" value={w.provider} onChange={(e) => setWallet(i, { provider: e.target.value })} style={rowInput} />
                    <input aria-label="Número" placeholder="Número *" value={w.walletNumber} onChange={(e) => setWallet(i, { walletNumber: e.target.value })} style={rowInput} className="font-mono" />
                    <input aria-label="Titular" placeholder="Titular" value={w.accountHolder} onChange={(e) => setWallet(i, { accountHolder: e.target.value })} style={rowInput} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                      <input type="checkbox" checked={w.isActive} onChange={(e) => setWallet(i, { isActive: e.target.checked })} />
                      Activa (aparece nos documentos)
                    </label>
                    <div style={{ flex: 1 }} />
                    <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => setWallets((rows) => move(rows, i, -1))} title="Subir">
                      <Icon name="arrow-up" size={14} />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={i === wallets.length - 1} onClick={() => setWallets((rows) => move(rows, i, 1))} title="Descer">
                      <Icon name="arrow-down" size={14} />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setWallets((rows) => rows.filter((_, idx) => idx !== i))} title="Remover carteira">
                      <Icon name="trash-2" size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SubmitProfile />
          <Feedback state={profileState} />
        </div>
      </form>
    </div>
  );
}
