'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { civilDateInTimeZone } from '@ants/shared';
import { Icon } from '@/components/Icon';
import { SearchCombobox, type ComboOption } from '@/components/ui/SearchCombobox';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';
import { createCustomerRefundAction, refundAdvanceAction } from '@/app/(erp)/facturas/actions';

export interface AdvanceOpt {
  id: string;
  number: string;
  remaining: number;
}

export interface CreditNoteOpt {
  id: string;
  number: string;
  total: number;
  available: number;
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

export function NovaDevolucaoClient({
  customerId,
  customerName,
  creditAvailable,
  openAdvances,
  refundableCreditNotes,
  accounts,
  preselectedAdvanceId,
  canChangeCustomer,
}: {
  customerId: string;
  customerName: string;
  creditAvailable: number;
  openAdvances: AdvanceOpt[];
  refundableCreditNotes: CreditNoteOpt[];
  accounts: AccountOpt[];
  preselectedAdvanceId: string | null;
  canChangeCustomer: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => createIdempotencyKey());
  const [issueDate] = useState(() => civilDateInTimeZone());
  const [origin, setOrigin] = useState<'ADVANCE' | 'CREDIT_NOTE'>(preselectedAdvanceId || refundableCreditNotes.length === 0 ? 'ADVANCE' : openAdvances.length === 0 ? 'CREDIT_NOTE' : 'ADVANCE');
  const [advanceId, setAdvanceId] = useState(preselectedAdvanceId ?? '');
  const [creditNoteId, setCreditNoteId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'MPESA' | 'EMOLA' | 'CARD' | 'TRANSFER'>('CASH');
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const advanceOptions = useMemo<ComboOption[]>(
    () => openAdvances.map((a) => ({ value: a.id, label: a.number, sublabel: `Saldo ${fmt(a.remaining)}` })),
    [openAdvances],
  );
  const noteOptions = useMemo<ComboOption[]>(
    () => refundableCreditNotes.map((n) => ({ value: n.id, label: n.number, sublabel: `Crédito disponível ${fmt(n.available)}` })),
    [refundableCreditNotes],
  );
  const accountOptions = useMemo<ComboOption[]>(() => accounts.map((a) => ({ value: a.id, label: a.label })), [accounts]);

  const isAdvance = origin === 'ADVANCE';
  const selectedAdvance = openAdvances.find((a) => a.id === advanceId);
  const selectedNote = refundableCreditNotes.find((n) => n.id === creditNoteId);
  const ceiling = isAdvance ? selectedAdvance?.remaining ?? 0 : Math.min(selectedNote?.available ?? 0, creditAvailable);
  const value = Number(amount);
  const canSubmit =
    (isAdvance ? Boolean(advanceId) : Boolean(creditNoteId)) &&
    Number.isFinite(value) &&
    value > 0 &&
    Boolean(accountId) &&
    reason.trim().length >= 3 &&
    !pending;

  const submit = () => {
    setError(null);
    if (isAdvance && !advanceId) return setError('Seleccione o recibo de adiantamento de origem.');
    if (!isAdvance && !creditNoteId) return setError('Seleccione a nota de crédito de origem.');
    if (!Number.isFinite(value) || value <= 0) return setError('Indique um valor positivo.');
    if (!accountId) return setError('Seleccione a conta de caixa, banco ou carteira móvel.');
    if (reason.trim().length < 3) return setError('Indique o motivo da devolução.');
    startTransition(async () => {
      const base = { idempotencyKey, issueDate, amount: value, method, accountId, reason: reason.trim(), notes: notes.trim() || undefined };
      const res = isAdvance
        ? await refundAdvanceAction({ ...base, advanceId })
        : await createCustomerRefundAction({ ...base, customerId, origin: 'CREDIT_NOTE', creditNoteId });
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/facturas/devolucao?id=${res.id}`);
    });
  };

  return (
    <div style={{ padding: '14px 26px 30px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Devolução ao Cliente</div>
            {canChangeCustomer && (
              <button onClick={() => router.push('/facturas/devolucoes/nova')} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Icon name="user" size={13} />
                Mudar de cliente
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label}>Cliente</label>
              <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', background: 'var(--card2)', color: 'var(--text)' }}>{customerName}</div>
            </div>
            <div>
              <label style={label}>Origem do crédito</label>
              <select
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value as typeof origin);
                  setError(null);
                }}
                style={fieldStyle}
              >
                <option value="ADVANCE" disabled={openAdvances.length === 0}>
                  Recibo de Adiantamento{openAdvances.length === 0 ? ' (sem RAs abertos)' : ''}
                </option>
                <option value="CREDIT_NOTE" disabled={refundableCreditNotes.length === 0}>
                  Nota de Crédito{refundableCreditNotes.length === 0 ? ' (sem crédito disponível)' : ''}
                </option>
              </select>
            </div>
            <div>
              <label style={label}>{isAdvance ? 'Recibo de adiantamento' : 'Nota de crédito'}</label>
              {isAdvance ? (
                <SearchCombobox
                  options={advanceOptions}
                  value={advanceId}
                  onChange={(v) => setAdvanceId(v)}
                  placeholder={openAdvances.length === 0 ? '— Sem RAs abertos —' : '— Seleccione o RA —'}
                  searchPlaceholder="Pesquisar RA…"
                  emptyText="Sem adiantamentos abertos."
                />
              ) : (
                <SearchCombobox
                  options={noteOptions}
                  value={creditNoteId}
                  onChange={(v) => setCreditNoteId(v)}
                  placeholder={refundableCreditNotes.length === 0 ? '— Sem NCs com crédito —' : '— Seleccione a NC —'}
                  searchPlaceholder="Pesquisar NC…"
                  emptyText="Sem notas de crédito com crédito disponível."
                />
              )}
            </div>
            <div>
              <label style={label}>Data de emissão</label>
              <input type="date" required disabled value={issueDate} style={{ ...fieldStyle, background: 'var(--card2)', cursor: 'default' }} />
            </div>
            <div>
              <label style={label}>Valor a devolver (MT)</label>
              <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="tnum" placeholder="0,00" style={fieldStyle} />
              {ceiling > 0 ? (
                <span style={{ fontSize: 11.5, color: 'var(--text3)', display: 'block', marginTop: 5 }}>
                  Máximo disponível: {fmt(ceiling)}
                </span>
              ) : null}
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
              <label style={label}>Conta de tesouraria (saída)</label>
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
              <label style={label}>Motivo (obrigatório)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: devolução do adiantamento não utilizado; reembolso após nota de crédito…" style={fieldStyle} />
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
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '3px 10px', borderRadius: 20 }}>Devolução</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 10 }}>
            Cliente: <strong style={{ color: 'var(--text)' }}>{customerName}</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bd-soft2)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Origem</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {isAdvance ? selectedAdvance?.number ?? 'RA —' : selectedNote?.number ?? 'NC —'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bd-soft2)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Disponível</span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmt(ceiling)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 4px' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Valor a devolver</span>
              <span className="tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-fg)' }}>
                {Number.isFinite(value) && value > 0 ? fmt(value) : '—'}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5, marginTop: 10 }}>
            Sai da tesouraria e lança contabilidade. NUNCA movimenta stock — quando há devolução
            física de produtos, a entrada em armazém é feita pela Nota de Crédito.
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10, marginTop: 12 }}>
              <Icon name="alert-triangle" size={15} />
              {error}
            </div>
          )}

          <button onClick={submit} disabled={!canSubmit} style={{ width: '100%', height: 46, marginTop: 14, borderRadius: 11, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: canSubmit ? 1 : 0.6, cursor: canSubmit ? 'pointer' : 'default' }}>
            <Icon name="undo-2" size={17} />
            {pending ? 'A registar…' : 'Registar devolução'}
          </button>
          <button onClick={() => router.push('/facturas/devolucoes')} style={{ width: '100%', height: 42, marginTop: 8, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Icon name="x" size={16} />
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
