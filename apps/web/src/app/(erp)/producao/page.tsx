import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import { FICHA_TECNICA, FICHA_TOTAL, FICHA_UNIT, PROD_BREAKDOWN, PROD_ORDERS, PRODUCTION_KPIS } from '@/lib/data/production';

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

export default function ProducaoPage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KpiGrid>
        {PRODUCTION_KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* Ordens de produção */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Ordens de produção</div>
            <div style={{ flex: 1 }} />
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
              <Icon name="calendar-range" size={15} />
              Planeamento
            </button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
              <Icon name="plus" size={15} />
              Nova ordem
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Ordem</th>
                  <th style={th}>Produto</th>
                  <th style={th}>Qtd.</th>
                  <th style={{ ...th, width: 160 }}>Progresso</th>
                  <th style={{ ...th, textAlign: 'right' }}>Custo</th>
                  <th style={th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {PROD_ORDERS.map((o) => (
                  <tr key={o.number} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                      {o.number}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {o.product}
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{o.date}</div>
                    </td>
                    <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {o.qty}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ flex: 1, height: 7, background: 'var(--bd-soft)', borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 6, width: `${o.prog}%`, background: o.barColor }} />
                        </div>
                        <span className="tnum" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', minWidth: 32, textAlign: 'right' }}>
                          {o.progStr}
                        </span>
                      </div>
                    </td>
                    <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {o.costStr}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: o.statusColor, background: o.statusBg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: o.statusColor }} />
                        {o.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Estado + ficha técnica */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Estado da produção</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
              {PROD_BREAKDOWN.map((b) => (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', border: '1px solid var(--bd-soft)', borderRadius: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flex: 'none' }} />
                  <span className="tnum" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                    {b.count}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
              <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
                <Icon name="clipboard-list" size={17} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Ficha técnica</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Pão de forma 500g · lote de 800 un</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {FICHA_TECNICA.map((m) => (
                <div key={m.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--bd-soft2)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{m.qty}</span>
                  </div>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)' }}>
                    {m.costStr}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 13px', borderRadius: 10, background: 'var(--card2)', marginTop: 11 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Custo materiais</span>
              <span className="tnum" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                {FICHA_TOTAL}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 13px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>Custo unitário estimado</span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-fg)' }}>
                {FICHA_UNIT}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
