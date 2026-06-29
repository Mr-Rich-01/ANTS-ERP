'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { receivePurchaseOrderAction } from '@/app/(erp)/compras/actions';

export interface ReceiveLine {
  lineId: string;
  sku: string;
  name: string;
  ordered: number;
  alreadyReceived: number;
  remaining: number;
}

const th: React.CSSProperties = { padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd-soft)' };
const meta: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 };
const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer' };

export function RecepcaoClient({ orderId, orderNumber, supplierName, warehouseName, lines }: { orderId: string; orderNumber: string; supplierName: string; warehouseName: string; lines: ReceiveLine[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [recv, setRecv] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.lineId, l.remaining])));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const setQty = (id: string, max: number, val: number) => setRecv((p) => ({ ...p, [id]: Math.max(0, Math.min(max, Math.trunc(val))) }));

  const totalToReceive = useMemo(() => lines.reduce((a, l) => a + (recv[l.lineId] ?? 0), 0), [recv, lines]);

  const submit = () => {
    setMsg(null);
    const items = lines.map((l) => ({ lineId: l.lineId, quantity: recv[l.lineId] ?? 0 })).filter((i) => i.quantity > 0);
    if (items.length === 0) {
      setMsg({ kind: 'err', text: 'Indique quantidades a receber.' });
      return;
    }
    startTransition(async () => {
      const res = await receivePurchaseOrderAction(orderId, items);
      if (res.error) setMsg({ kind: 'err', text: res.error });
      else {
        setMsg({ kind: 'ok', text: `Recepção ${res.number} registada. Stock e conta a pagar actualizados.` });
        router.push(`/compras/ordem?id=${orderId}`);
      }
    });
  };

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link href={`/compras/ordem?id=${orderId}`} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' }}>
        <Icon name="arrow-left" size={16} />
        Voltar à ordem
      </Link>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 11, borderRadius: 13, flex: 'none', display: 'inline-flex' }}>
          <Icon name="package-check" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 className="font-mono" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Recepção · {orderNumber}</h2>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--info)', background: 'var(--info-bg)', padding: '3px 10px', borderRadius: 20 }}>Em recepção</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 22, rowGap: 6, marginTop: 9 }}>
            <span style={meta}>
              <Icon name="building" size={14} color="var(--text3)" />
              {supplierName}
            </span>
            <span style={meta}>
              <Icon name="warehouse" size={14} color="var(--text3)" />
              Destino: {warehouseName}
            </span>
          </div>
        </div>
        <button onClick={submit} disabled={pending} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, opacity: pending ? 0.6 : 1, cursor: pending ? 'default' : 'pointer', flex: 'none' }}>
          <Icon name="check-circle-2" size={15} />
          {pending ? 'A validar…' : 'Validar recepção'}
        </button>
      </div>

      {msg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: msg.kind === 'ok' ? 'var(--ok)' : 'var(--bad)', background: msg.kind === 'ok' ? 'var(--ok-bg)' : 'var(--bad-bg)', padding: '10px 14px', borderRadius: 10 }}>
          <Icon name={msg.kind === 'ok' ? 'check-circle-2' : 'alert-triangle'} size={15} />
          {msg.text}
        </div>
      )}

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="scan-line" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Linhas a receber</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Produto</th>
                <th style={{ ...th, textAlign: 'center' }}>Encomendado</th>
                <th style={{ ...th, textAlign: 'center' }}>Já recebido</th>
                <th style={{ ...th, textAlign: 'center' }}>Pendente</th>
                <th style={{ ...th, textAlign: 'center' }}>Receber agora</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const v = recv[l.lineId] ?? 0;
                return (
                  <tr key={l.lineId} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {l.name}
                      <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {l.sku}
                      </div>
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'center', fontSize: 13, color: 'var(--text2)' }}>
                      {l.ordered}
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'center', fontSize: 13, color: 'var(--text2)' }}>
                      {l.alreadyReceived}
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--warn)' }}>
                      {l.remaining}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--field-bd)', background: 'var(--field)', borderRadius: 9, padding: '4px 6px' }}>
                        <button onClick={() => setQty(l.lineId, l.remaining, v - 1)} style={iconBtn} aria-label="menos">
                          <Icon name="minus" size={13} color="var(--text3)" />
                        </button>
                        <input
                          className="tnum"
                          type="number"
                          min={0}
                          max={l.remaining}
                          value={v}
                          onChange={(e) => setQty(l.lineId, l.remaining, Number(e.target.value))}
                          style={{ width: 54, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text)', border: 'none', background: 'none', outline: 'none' }}
                        />
                        <button onClick={() => setQty(l.lineId, l.remaining, v + 1)} style={iconBtn} aria-label="mais">
                          <Icon name="plus" size={13} color="var(--text3)" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={4} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                  Total de unidades a receber
                </td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent-fg)' }}>
                  {totalToReceive}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
