'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid, type KpiCardData } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';

export type PoStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

export interface PoRow {
  id: string;
  number: string;
  supplierName: string;
  supplierNuit: string;
  dateStr: string;
  etaStr: string;
  totalStr: string;
  status: PoStatus;
}

const STATUS: Record<PoStatus, [string, string, string]> = {
  DRAFT: ['Rascunho', 'var(--text3)', 'var(--bd-soft)'],
  SENT: ['Enviada', 'var(--info)', 'var(--info-bg)'],
  PARTIAL: ['Recepção parcial', 'var(--warn)', 'var(--warn-bg)'],
  RECEIVED: ['Recebida', 'var(--ok)', 'var(--ok-bg)'],
  CANCELLED: ['Cancelada', 'var(--text3)', 'var(--bd-soft)'],
};

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

export function ComprasClient({ kpis, rows, totalStr, canCreate }: { kpis: KpiCardData[]; rows: PoRow[]; totalStr: string; canCreate: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.number.toLowerCase().includes(term) || r.supplierName.toLowerCase().includes(term));
  }, [q, rows]);

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KpiGrid>
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Ordens de compra</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--field)', border: '1px solid var(--field-bd)', borderRadius: 9, padding: '0 11px', height: 36, width: 240, maxWidth: '34vw', marginLeft: 8 }}>
            <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
              <Icon name="search" size={16} />
            </span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar nº, fornecedor…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }} />
          </div>
          <div style={{ flex: 1 }} />
          {canCreate && (
            <button onClick={() => router.push('/compras/ordem/nova')} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <Icon name="plus" size={15} />
              Nova ordem
            </button>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Documento</th>
                <th style={th}>Fornecedor</th>
                <th style={th}>Data</th>
                <th style={th}>Entrega</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    {rows.length === 0 ? 'Ainda não há ordens de compra. Crie a primeira.' : 'Nenhuma ordem corresponde à pesquisa.'}
                  </td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const [label, color, bg] = STATUS[o.status];
                  const canReceive = o.status === 'SENT' || o.status === 'PARTIAL';
                  return (
                    <tr key={o.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)', cursor: 'pointer' }} onClick={() => router.push(`/compras/ordem?id=${o.id}`)}>
                      <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                        {o.number}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {o.supplierName}
                        <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                          NUIT {o.supplierNuit}
                        </div>
                      </td>
                      <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {o.dateStr}
                      </td>
                      <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {o.etaStr}
                      </td>
                      <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {o.totalStr}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color, background: bg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                          {label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        {canReceive && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/recepcao?order=${o.id}`);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--accent-fg)', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' }}
                          >
                            <Icon name="package-check" size={14} />
                            Receber
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={4} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  Total · {rows.length} {rows.length === 1 ? 'ordem' : 'ordens'}
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
