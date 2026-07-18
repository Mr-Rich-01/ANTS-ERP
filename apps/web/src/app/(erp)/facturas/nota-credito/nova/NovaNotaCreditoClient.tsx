'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { civilDateInTimeZone, computeLine } from '@ants/shared';
import type { CreditableInvoiceLine } from '@ants/domain';
import { Icon } from '@/components/Icon';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';
import { createCreditNoteAction } from '@/app/(erp)/facturas/actions';

const cardBox: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' };
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 };
const fieldStyle: React.CSSProperties = { width: '100%', height: 42, border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', fontSize: 13.5, background: 'var(--card)', color: 'var(--text)', outline: 'none' };
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

export function NovaNotaCreditoClient({ invoiceId, invoiceNumber, customerName, lines }: { invoiceId: string; invoiceNumber: string; customerName: string; lines: CreditableInvoiceLine[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => createIdempotencyKey());
  const [issueDate] = useState(() => civilDateInTimeZone());
  const [reason, setReason] = useState('');
  const [returnStock, setReturnStock] = useState(false);
  const [notes, setNotes] = useState('');
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const setQty = (id: string, value: number, max: number) => {
    setQtys((m) => ({ ...m, [id]: Math.min(max, Math.max(0, Math.trunc(value))) }));
  };

  const selected = useMemo(
    () =>
      lines
        .map((l) => ({ line: l, qty: qtys[l.invoiceLineId] ?? 0 }))
        .filter((s) => s.qty > 0),
    [lines, qtys],
  );

  const totals = useMemo(() => {
    let taxable = 0;
    let tax = 0;
    let total = 0;
    for (const s of selected) {
      const r = computeLine({ quantity: s.qty, unitPrice: s.line.unitPrice, discountPercent: s.line.discountPercent, taxPercent: s.line.taxRate });
      taxable += r.net;
      tax += r.tax;
      total += r.total;
    }
    return { taxable, tax, total };
  }, [selected]);

  const canSubmit = selected.length > 0 && reason.trim().length >= 3 && !pending;

  const emit = () => {
    setError(null);
    if (selected.length === 0) return setError('Indique a quantidade a creditar em pelo menos uma linha.');
    if (reason.trim().length < 3) return setError('Indique o motivo da nota de crédito.');
    startTransition(async () => {
      const res = await createCreditNoteAction({
        idempotencyKey,
        issueDate,
        invoiceId,
        reason: reason.trim(),
        returnStock,
        notes: notes || undefined,
        lines: selected.map((s) => ({ invoiceLineId: s.line.invoiceLineId, quantity: s.qty })),
      });
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/facturas/nota-credito?id=${res.id}`);
    });
  };

  return (
    <div style={{ padding: '14px 26px 30px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Nota de crédito sobre a factura {invoiceNumber}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
            Cliente: <strong style={{ color: 'var(--text)' }}>{customerName}</strong> · Data de emissão: <span className="tnum">{issueDate.split('-').reverse().join('/')}</span>
          </div>
        </div>

        {/* Linhas da factura */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 13px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Linhas a creditar</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={thL}>Descrição</th>
                  <th style={{ ...thL, textAlign: 'right', width: 110 }}>Preço unit.</th>
                  <th style={{ ...thL, textAlign: 'center', width: 90 }}>Facturado</th>
                  <th style={{ ...thL, textAlign: 'center', width: 90 }}>Creditado</th>
                  <th style={{ ...thL, textAlign: 'center', width: 110 }}>A creditar</th>
                  <th style={{ ...thL, textAlign: 'right', width: 120 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const qty = qtys[l.invoiceLineId] ?? 0;
                  const r = qty > 0 ? computeLine({ quantity: qty, unitPrice: l.unitPrice, discountPercent: l.discountPercent, taxPercent: l.taxRate }) : null;
                  const exhausted = l.availableQty === 0;
                  return (
                    <tr key={l.invoiceLineId} style={{ borderTop: '1px solid var(--bd-soft2)', opacity: exhausted ? 0.55 : 1 }}>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{l.description}</div>
                        <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{l.sku ?? ''}</div>
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(l.unitPrice)}</td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'center', fontSize: 13, color: 'var(--text2)' }}>{l.invoicedQty}</td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'center', fontSize: 13, color: 'var(--text2)' }}>{l.creditedQty}</td>
                      <td style={{ padding: '11px 10px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min={0}
                          max={l.availableQty}
                          value={qty}
                          disabled={exhausted}
                          onChange={(e) => setQty(l.invoiceLineId, Number(e.target.value), l.availableQty)}
                          className="tnum"
                          style={{ width: 64, height: 30, textAlign: 'center', border: '1px solid var(--field-bd)', borderRadius: 7, background: exhausted ? 'var(--card2)' : 'var(--field)', color: 'var(--text)', fontSize: 12.5, outline: 'none' }}
                        />
                        <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3 }}>máx. {l.availableQty}</div>
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r ? fmt(r.total) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Motivo & devolução */}
        <div style={cardBox}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 13 }}>Motivo &amp; devolução</div>
          <label style={label}>Motivo (obrigatório)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: devolução de mercadoria; correcção de valor; desconto posterior…" style={fieldStyle} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
            <input type="checkbox" checked={returnStock} onChange={(e) => setReturnStock(e.target.checked)} style={{ width: 16, height: 16 }} />
            Com devolução de mercadoria (entrada de stock no armazém da factura)
          </label>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5, marginTop: 6 }}>
            Sem esta opção, a nota é só de valor (não movimenta stock). A devolução entra ao custo médio actual, registado na nota.
          </div>
          <label style={{ ...label, marginTop: 14 }}>Observações</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionais…" style={{ width: '100%', minHeight: 60, resize: 'vertical', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 12px', fontSize: 13, background: 'var(--card)', color: 'var(--text)', outline: 'none' }} />
        </div>
      </div>

      {/* Resumo */}
      <div style={{ position: 'sticky', top: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Resumo</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '3px 10px', borderRadius: 20 }}>Nota de crédito</span>
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
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Total a creditar</span>
              <span className="tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--bad)' }}>
                {fmt(totals.total)}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5, marginTop: 10 }}>
            Reduz o saldo do cliente e lança contabilidade (espelho da venda). {returnStock ? 'Com entrada de stock.' : 'Sem movimento de stock.'}
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10, marginTop: 12 }}>
              <Icon name="alert-triangle" size={15} />
              {error}
            </div>
          )}

          <button onClick={emit} disabled={!canSubmit} style={{ width: '100%', height: 46, marginTop: 14, borderRadius: 11, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: canSubmit ? 1 : 0.6, cursor: canSubmit ? 'pointer' : 'default' }}>
            <Icon name="file-minus-2" size={17} />
            {pending ? 'A emitir…' : 'Emitir nota de crédito'}
          </button>
          <button onClick={() => router.push(`/facturas/documento?id=${invoiceId}`)} style={{ width: '100%', height: 42, marginTop: 8, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Icon name="x" size={16} />
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
