'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';

export type DisplayStatus = 'pago' | 'parcial' | 'pendente' | 'vencido' | 'cancelado';

export interface InvoiceRow {
  id: string;
  number: string;
  customerName: string;
  customerNuit: string;
  dateStr: string;
  dueStr: string;
  totalStr: string;
  status: DisplayStatus;
}
export interface StatCard {
  label: string;
  value: string;
  color: string;
  sub: string;
}

const STATUS: Record<DisplayStatus, [string, string, string]> = {
  pago: ['Pago', 'var(--ok)', 'var(--ok-bg)'],
  parcial: ['Parcial', 'var(--info)', 'var(--info-bg)'],
  pendente: ['Pendente', 'var(--warn)', 'var(--warn-bg)'],
  vencido: ['Vencido', 'var(--bad)', 'var(--bad-bg)'],
  cancelado: ['Cancelado', 'var(--text3)', 'var(--bd-soft)'],
};

const FILTERS = ['Todas', 'Pendentes', 'Pagas', 'Vencidas'] as const;

const th: React.CSSProperties = {
  padding: '11px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.5px',
  color: 'var(--text3)',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--bd-soft)',
};

export function FacturasClient({ stats, rows, totalStr, canCreate }: { stats: StatCard[]; rows: InvoiceRow[]; totalStr: string; canCreate: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Todas');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'Pendentes' && !(r.status === 'pendente' || r.status === 'parcial' || r.status === 'vencido')) return false;
      if (filter === 'Pagas' && r.status !== 'pago') return false;
      if (filter === 'Vencidas' && r.status !== 'vencido') return false;
      if (term && !(r.number.toLowerCase().includes(term) || r.customerName.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [rows, filter, q]);

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.label}</span>
            <span className="tnum" style={{ fontSize: 21, fontWeight: 700, color: s.color }}>
              {s.value}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{s.sub}</span>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--field)', border: '1px solid var(--field-bd)', borderRadius: 9, padding: '0 11px', height: 36, width: 260, maxWidth: '40vw' }}>
            <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
              <Icon name="search" size={16} />
            </span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar nº, cliente…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map((label) => {
              const active = filter === label;
              return (
                <button key={label} onClick={() => setFilter(label)} style={{ height: 36, padding: '0 13px', borderRadius: 9, border: `1px solid ${active ? ACCENT : 'var(--border)'}`, background: active ? ACCENT : 'var(--card)', color: active ? '#fff' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          {canCreate && (
            <button onClick={() => router.push('/facturas/nova')} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <Icon name="plus" size={15} />
              Nova factura
            </button>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Documento</th>
                <th style={th}>Cliente</th>
                <th style={th}>Emissão</th>
                <th style={th}>Vencimento</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    {rows.length === 0 ? 'Ainda não há facturas. Emita a primeira.' : 'Nenhuma factura corresponde ao filtro.'}
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const [label, color, bg] = STATUS[inv.status];
                  return (
                    <tr key={inv.id} onClick={() => router.push(`/facturas/documento?id=${inv.id}`)} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)', cursor: 'pointer' }}>
                      <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                        {inv.number}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {inv.customerName}
                        <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                          NUIT {inv.customerNuit}
                        </div>
                      </td>
                      <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {inv.dateStr}
                      </td>
                      <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {inv.dueStr}
                      </td>
                      <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {inv.totalStr}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color, background: bg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                          {label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <span style={{ color: 'var(--text4)', display: 'inline-flex' }}>
                          <Icon name="chevron-right" size={17} />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={4} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  Total facturado · {rows.length} {rows.length === 1 ? 'documento' : 'documentos'}
                </td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {totalStr}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
