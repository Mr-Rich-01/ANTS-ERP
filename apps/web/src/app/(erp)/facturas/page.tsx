'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';
import {
  INVOICE_COUNT,
  INVOICE_FILTERS,
  INVOICE_STATS,
  INVOICE_STATUS,
  INVOICE_TOTAL,
  INVOICES,
} from '@/lib/data/invoices';

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

export default function FacturasPage() {
  const router = useRouter();
  const [filter, setFilter] = useState('Todas');

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Estatísticas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        {INVOICE_STATS.map((s) => (
          <div
            key={s.label}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '15px 17px',
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.label}</span>
            <span className="tnum" style={{ fontSize: 21, fontWeight: 700, color: s.color }}>
              {s.value}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{s.sub}</span>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--bd-soft)',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--field)',
              border: '1px solid var(--field-bd)',
              borderRadius: 9,
              padding: '0 11px',
              height: 36,
              width: 260,
              maxWidth: '40vw',
            }}
          >
            <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
              <Icon name="search" size={16} />
            </span>
            <input
              placeholder="Pesquisar nº, cliente…"
              style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {INVOICE_FILTERS.map((label) => {
              const active = filter === label;
              return (
                <button
                  key={label}
                  onClick={() => setFilter(label)}
                  style={{
                    height: 36,
                    padding: '0 13px',
                    borderRadius: 9,
                    border: `1px solid ${active ? ACCENT : 'var(--border)'}`,
                    background: active ? ACCENT : 'var(--card)',
                    color: active ? '#fff' : 'var(--text2)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 36,
              padding: '0 12px',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--text2)',
            }}
          >
            <Icon name="download" size={15} />
            Exportar
          </button>
          <button
            onClick={() => router.push('/facturas/nova')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 36,
              padding: '0 13px',
              borderRadius: 9,
              border: 'none',
              background: ACCENT,
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <Icon name="plus" size={15} />
            Nova factura
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={{ ...th, width: 42, textAlign: 'center' }}>
                  <input type="checkbox" style={{ accentColor: ACCENT }} />
                </th>
                <th style={th}>Documento</th>
                <th style={th}>Cliente</th>
                <th style={th}>Emissão</th>
                <th style={th}>Vencimento</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {INVOICES.map((inv) => {
                const [label, color, bg] = INVOICE_STATUS[inv.status];
                return (
                  <tr
                    key={inv.number}
                    onClick={() => router.push(`/facturas/documento?n=${encodeURIComponent(inv.number)}`)}
                    className="ants-row"
                    style={{ borderBottom: '1px solid var(--bd-soft2)', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <input type="checkbox" style={{ accentColor: ACCENT }} onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td
                      className="font-mono"
                      style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}
                    >
                      {inv.number}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {inv.client}
                      <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                        NUIT {inv.nuit}
                      </div>
                    </td>
                    <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {inv.date}
                    </td>
                    <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {inv.due}
                    </td>
                    <td
                      className="tnum"
                      style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}
                    >
                      {fmt(inv.total)}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 11.5,
                          fontWeight: 600,
                          color,
                          background: bg,
                          padding: '3px 9px',
                          borderRadius: 20,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                        {label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          border: 'none',
                          background: 'none',
                          color: 'var(--text3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="more-horizontal" size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={5} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  Total facturado · {INVOICE_COUNT} documentos
                </td>
                <td
                  className="tnum"
                  style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}
                >
                  {fmt(INVOICE_TOTAL)}
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
