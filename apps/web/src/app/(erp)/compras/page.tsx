'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import { PURCHASE_COUNT, PURCHASE_KPIS, PURCHASE_ORDERS, PURCHASE_TOTAL_STR } from '@/lib/data/purchases';

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

export default function ComprasPage() {
  const router = useRouter();

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KpiGrid>
        {PURCHASE_KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Ordens de compra</div>
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
              width: 240,
              maxWidth: '34vw',
              marginLeft: 8,
            }}
          >
            <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
              <Icon name="search" size={16} />
            </span>
            <input
              placeholder="Pesquisar nº, fornecedor…"
              style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }}
            />
          </div>
          <div style={{ flex: 1 }} />
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
            <Icon name="download" size={15} />
            Exportar
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
            <Icon name="plus" size={15} />
            Nova ordem
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 840 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={{ ...th, width: 42, textAlign: 'center' }}>
                  <input type="checkbox" style={{ accentColor: ACCENT }} />
                </th>
                <th style={th}>Documento</th>
                <th style={th}>Fornecedor</th>
                <th style={th}>Data</th>
                <th style={th}>Entrega</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {PURCHASE_ORDERS.map((o) => (
                <tr key={o.number} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <input type="checkbox" style={{ accentColor: ACCENT }} />
                  </td>
                  <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                    <span
                      onClick={() => router.push('/compras/ordem')}
                      style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--bd-soft)', textUnderlineOffset: 3 }}
                    >
                      {o.number}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {o.supplier}
                    <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                      NUIT {o.nuit}
                    </div>
                  </td>
                  <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {o.date}
                  </td>
                  <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {o.eta}
                  </td>
                  <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {o.totalStr}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: o.statusColor, background: o.statusBg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: o.statusColor }} />
                      {o.statusLabel}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    {o.canReceive && (
                      <button
                        onClick={() => router.push('/recepcao')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          height: 30,
                          padding: '0 11px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--accent-fg)',
                          fontSize: 11.5,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Icon name="package-check" size={14} />
                        Receber
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={5} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  Total · {PURCHASE_COUNT} ordens
                </td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {PURCHASE_TOTAL_STR}
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
