'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { civilDateInTimeZone } from '@ants/shared';
import { Icon } from '@/components/Icon';
import { SearchCombobox, type ComboOption } from '@/components/ui/SearchCombobox';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';
import { createCustomerAdvanceAction } from '@/app/(erp)/facturas/actions';

export interface CustomerOpt {
  id: string;
  name: string;
  nuit: string;
}

export interface AccountOpt {
  id: string;
  label: string;
}

const cardBox: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' };
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 };
const fieldStyle: React.CSSProperties = { width: '100%', height: 42, border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', fontSize: 13.5, background: 'var(--card)', color: 'var(--text)', outline: 'none' };

function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const METHODS = [
  ['CASH', 'Dinheiro'],
  ['MPESA', 'M-Pesa'],
  ['EMOLA', 'e-Mola'],
  ['CARD', 'Cartão'],
  ['TRANSFER', 'Transferência'],
] as const;

export function NovoAdiantamentoClient({ customers, accounts, preselectedCustomer }: { customers: CustomerOpt[]; accounts: AccountOpt[]; preselectedCustomer: { id: string; name: string } | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => createIdempotencyKey());
  const [issueDate] = useState(() => civilDateInTimeZone());
  const [customerId, setCustomerId] = useState(preselectedCustomer?.id ?? '');
  const [customerLabel, setCustomerLabel] = useState(preselectedCustomer?.name ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'MPESA' | 'EMOLA' | 'CARD' | 'TRANSFER'>('CASH');
  const [accountId, setAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const customerDefaults = useMemo<ComboOption[]>(
    () => customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.nuit ? `NUIT ${c.nuit}` : undefined })),
    [customers],
  );
  const accountOptions = useMemo<ComboOption[]>(() => accounts.map((a) => ({ value: a.id, label: a.label })), [accounts]);
  const value = Number(amount);
  const canSubmit = Boolean(customerId) && Number.isFinite(value) && value > 0 && Boolean(accountId) && !pending;

  const submit = () => {
    setError(null);
    if (!customerId) return setError('Seleccione um cliente.');
    if (!Number.isFinite(value) || value <= 0) return setError('Indique um valor positivo.');
    if (!accountId) return setError('Seleccione a conta de caixa, banco ou carteira móvel.');
    startTransition(async () => {
      const res = await createCustomerAdvanceAction({
        idempotencyKey,
        issueDate,
        customerId,
        amount: value,
        method,
        accountId,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/facturas/adiantamento?id=${res.id}`);
    });
  };

  return (
    <div style={{ padding: '14px 26px 30px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 15 }}>Recibo de Adiantamento</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label}>Cliente</label>
              <SearchCombobox
                searchEndpoint="/api/search/customers?active=1"
                defaultOptions={customerDefaults}
                value={customerId}
                selectedLabel={customerLabel || undefined}
                onChange={(v, option) => {
                  setCustomerId(v);
                  setCustomerLabel(option?.label ?? '');
                }}
                placeholder={customers.length === 0 ? '— Sem clientes —' : '— Seleccione o cliente —'}
                searchPlaceholder="Pesquisar por nome ou NUIT…"
                emptyText="Sem clientes para a pesquisa."
              />
            </div>
            <div>
              <label style={label}>Data de emissão</label>
              <input type="date" required disabled value={issueDate} style={{ ...fieldStyle, background: 'var(--card2)', cursor: 'default' }} />
            </div>
            <div>
              <label style={label}>Valor recebido (MT)</label>
              <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="tnum" placeholder="0,00" style={fieldStyle} />
            </div>
            <div>
              <label style={label}>Forma de pagamento</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} style={fieldStyle}>
                {METHODS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>Conta de tesouraria</label>
              <SearchCombobox
                options={accountOptions}
                value={accountId}
                onChange={(v) => setAccountId(v)}
                placeholder={accounts.length === 0 ? '— Sem contas disponíveis —' : '— Seleccione a conta —'}
                searchPlaceholder="Pesquisar conta…"
                emptyText="Sem contas para a pesquisa."
              />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label}>Motivo / referência</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex.: adiantamento por encomenda; reserva de mercadoria…" style={fieldStyle} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label}>Observações</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionais…" style={{ width: '100%', minHeight: 60, resize: 'vertical', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 12px', fontSize: 13, background: 'var(--card)', color: 'var(--text)', outline: 'none' }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: 'sticky', top: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Resumo</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '3px 10px', borderRadius: 20 }}>Adiantamento</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 10 }}>
            Cliente: <strong style={{ color: 'var(--text)' }}>{customerLabel || '—'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 4px' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Valor a receber</span>
            <span className="tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-fg)' }}>
              {Number.isFinite(value) && value > 0 ? fmt(value) : '—'}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5, marginTop: 10 }}>
            Entra na tesouraria e fica como saldo do cliente para liquidar facturas ou devolver.
            Sem IVA — o IVA nasce na factura. Não altera a dívida em conta corrente.
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10, marginTop: 12 }}>
              <Icon name="alert-triangle" size={15} />
              {error}
            </div>
          )}

          <button onClick={submit} disabled={!canSubmit} style={{ width: '100%', height: 46, marginTop: 14, borderRadius: 11, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: canSubmit ? 1 : 0.6, cursor: canSubmit ? 'pointer' : 'default' }}>
            <Icon name="hand-coins" size={17} />
            {pending ? 'A registar…' : 'Registar adiantamento'}
          </button>
          <button onClick={() => router.push('/facturas/adiantamentos')} style={{ width: '100%', height: 42, marginTop: 8, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Icon name="x" size={16} />
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
