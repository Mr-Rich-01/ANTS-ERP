'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { civilDateInTimeZone, computeLine } from '@ants/shared';
import { Icon } from '@/components/Icon';
import { SearchCombobox, type ComboOption } from '@/components/ui/SearchCombobox';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';
import { createDebitNoteAction } from '@/app/(erp)/facturas/actions';

export interface CustomerOpt {
  id: string;
  name: string;
  nuit: string;
}

export interface LinkedInvoice {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerNuit: string;
}

interface FreeLine {
  key: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

const cardBox: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' };
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 };
const fieldStyle: React.CSSProperties = { width: '100%', height: 42, border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', fontSize: 13.5, background: 'var(--card)', color: 'var(--text)', outline: 'none' };
const cellInput: React.CSSProperties = { height: 32, border: '1px solid var(--field-bd)', borderRadius: 7, background: 'var(--field)', color: 'var(--text)', fontSize: 12.5, outline: 'none', padding: '0 8px' };
const thL: React.CSSProperties = { padding: '9px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase' };

function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let lineSeq = 0;
function newLine(): FreeLine {
  lineSeq += 1;
  return { key: `l${lineSeq}`, description: '', quantity: 1, unitPrice: 0, taxRate: 16 };
}

export function NovaNotaDebitoClient({ customers, linkedInvoice }: { customers: CustomerOpt[]; linkedInvoice: LinkedInvoice | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => createIdempotencyKey());
  const [issueDate] = useState(() => civilDateInTimeZone());
  const [customerId, setCustomerId] = useState(linkedInvoice?.customerId ?? customers[0]?.id ?? '');
  const [customerLabel, setCustomerLabel] = useState(linkedInvoice?.customerName ?? customers[0]?.name ?? '');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<FreeLine[]>([newLine()]);
  const [error, setError] = useState<string | null>(null);

  const customerDefaults = useMemo<ComboOption[]>(
    () => customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.nuit ? `NUIT ${c.nuit}` : undefined })),
    [customers],
  );

  const patch = (key: string, p: Partial<FreeLine>) => setLines((L) => L.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const remove = (key: string) => setLines((L) => (L.length > 1 ? L.filter((l) => l.key !== key) : L));

  const totals = useMemo(() => {
    let taxable = 0;
    let tax = 0;
    let total = 0;
    for (const l of lines) {
      if (!l.description.trim() || l.quantity <= 0 || l.unitPrice <= 0) continue;
      const r = computeLine({ quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: 0, taxPercent: l.taxRate });
      taxable += r.net;
      tax += r.tax;
      total += r.total;
    }
    return { taxable, tax, total };
  }, [lines]);

  const validLines = lines.filter((l) => l.description.trim() && l.quantity > 0 && l.unitPrice > 0);
  const canSubmit = Boolean(customerId) && validLines.length > 0 && reason.trim().length >= 3 && !pending;

  const emit = () => {
    setError(null);
    if (!customerId) return setError('Seleccione um cliente.');
    if (validLines.length === 0) return setError('Adicione pelo menos uma linha com descrição, quantidade e valor.');
    if (reason.trim().length < 3) return setError('Indique o motivo da nota de débito.');
    startTransition(async () => {
      const res = await createDebitNoteAction({
        idempotencyKey,
        issueDate,
        customerId,
        invoiceId: linkedInvoice?.id,
        reason: reason.trim(),
        notes: notes || undefined,
        lines: validLines.map((l) => ({ description: l.description.trim(), quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate })),
      });
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/facturas/nota-debito?id=${res.id}`);
    });
  };

  return (
    <div style={{ padding: '14px 26px 30px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 15 }}>
            Nota de débito {linkedInvoice ? `referente à factura ${linkedInvoice.number}` : '(sem factura de origem)'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label}>Cliente</label>
              {linkedInvoice ? (
                <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', background: 'var(--card2)', color: 'var(--text)' }}>{linkedInvoice.customerName}</div>
              ) : (
                <SearchCombobox
                  searchEndpoint="/api/search/customers?active=1"
                  defaultOptions={customerDefaults}
                  value={customerId}
                  onChange={(v, option) => {
                    setCustomerId(v);
                    setCustomerLabel(option?.label ?? '');
                  }}
                  placeholder={customers.length === 0 ? '— Sem clientes —' : '— Seleccione o cliente —'}
                  searchPlaceholder="Pesquisar por nome ou NUIT…"
                  emptyText="Sem clientes para a pesquisa."
                />
              )}
            </div>
            <div>
              <label style={label}>Data de emissão</label>
              <input type="date" required disabled value={issueDate} style={{ ...fieldStyle, background: 'var(--card2)', cursor: 'default' }} />
            </div>
            <div>
              <label style={label}>Motivo (obrigatório)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: juros de mora; portes; correcção a menor…" style={fieldStyle} />
            </div>
          </div>
        </div>

        {/* Linhas livres */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 13px' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Linhas a debitar</span>
            <button onClick={() => setLines((L) => [...L, newLine()])} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <Icon name="plus" size={14} />
              Adicionar linha
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={thL}>Descrição</th>
                  <th style={{ ...thL, textAlign: 'center', width: 90 }}>Qtd</th>
                  <th style={{ ...thL, textAlign: 'right', width: 130 }}>Preço unit.</th>
                  <th style={{ ...thL, textAlign: 'center', width: 90 }}>IVA</th>
                  <th style={{ ...thL, textAlign: 'right', width: 120 }}>Total</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const r = l.quantity > 0 && l.unitPrice > 0 ? computeLine({ quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: 0, taxPercent: l.taxRate }) : null;
                  return (
                    <tr key={l.key} style={{ borderTop: '1px solid var(--bd-soft2)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <input value={l.description} onChange={(e) => patch(l.key, { description: e.target.value })} placeholder="Descrição da linha…" style={{ ...cellInput, width: '100%' }} />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <input type="number" min={1} value={l.quantity} onChange={(e) => patch(l.key, { quantity: Math.max(1, Math.trunc(Number(e.target.value))) })} className="tnum" style={{ ...cellInput, width: 64, textAlign: 'center' }} />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <input type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => patch(l.key, { unitPrice: Math.max(0, Number(e.target.value)) })} className="tnum" style={{ ...cellInput, width: 110, textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <select value={l.taxRate} onChange={(e) => patch(l.key, { taxRate: Number(e.target.value) })} style={{ ...cellInput, width: 72 }}>
                          <option value={16}>16%</option>
                          <option value={0}>0%</option>
                        </select>
                      </td>
                      <td className="tnum" style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r ? fmt(r.total) : '—'}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <button onClick={() => remove(l.key)} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="trash-2" size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardBox}>
          <label style={label}>Observações</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionais…" style={{ width: '100%', minHeight: 60, resize: 'vertical', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 12px', fontSize: 13, background: 'var(--card)', color: 'var(--text)', outline: 'none' }} />
        </div>
      </div>

      {/* Resumo */}
      <div style={{ position: 'sticky', top: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Resumo</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '3px 10px', borderRadius: 20 }}>Nota de débito</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 10 }}>
            Cliente: <strong style={{ color: 'var(--text)' }}>{linkedInvoice?.customerName ?? customerLabel ?? '—'}</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {([['Incidência', fmt(totals.taxable), true], ['IVA', fmt(totals.tax), true]] as const).map(([l, v, border]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: border ? '1px solid var(--bd-soft2)' : undefined }}>
                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{l}</span>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {v}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 4px' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Total a debitar</span>
              <span className="tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-fg)' }}>
                {fmt(totals.total)}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5, marginTop: 10 }}>
            Aumenta o saldo do cliente e lança contabilidade. Nunca movimenta stock.
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10, marginTop: 12 }}>
              <Icon name="alert-triangle" size={15} />
              {error}
            </div>
          )}

          <button onClick={emit} disabled={!canSubmit} style={{ width: '100%', height: 46, marginTop: 14, borderRadius: 11, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: canSubmit ? 1 : 0.6, cursor: canSubmit ? 'pointer' : 'default' }}>
            <Icon name="file-plus-2" size={17} />
            {pending ? 'A emitir…' : 'Emitir nota de débito'}
          </button>
          <button onClick={() => router.push(linkedInvoice ? `/facturas/documento?id=${linkedInvoice.id}` : '/facturas/notas')} style={{ width: '100%', height: 42, marginTop: 8, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Icon name="x" size={16} />
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
