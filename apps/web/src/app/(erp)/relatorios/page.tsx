import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { barData, barFill } from '@/lib/data/dashboard';
import { REPORT_GROUPS, REPORT_STATS, SALES_BY_BRANCH } from '@/lib/data/reports';

const th: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.5px',
  color: 'var(--text3)',
  textTransform: 'uppercase',
};
const formatBtn = (color: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 34,
  padding: '0 12px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  fontSize: 12,
  fontWeight: 600,
  color,
});

export default function RelatoriosPage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Relatório de vendas */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '16px 20px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 8, borderRadius: 10, display: 'inline-flex' }}>
            <Icon name="trending-up" size={18} />
          </span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Relatório de vendas</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Junho 2026 · todas as filiais</div>
          </div>
          <div style={{ flex: 1 }} />
          <button style={formatBtn('var(--bad)')}>
            <Icon name="file-text" size={14} />
            PDF
          </button>
          <button style={formatBtn('var(--ok)')}>
            <Icon name="sheet" size={14} />
            Excel
          </button>
          <button style={formatBtn('var(--text2)')}>
            <Icon name="braces" size={14} />
            CSV
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 180, paddingTop: 8 }}>
            {barData.map((b) => (
              <div key={b.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', maxWidth: 26, borderRadius: '6px 6px 3px 3px', background: barFill, height: `${b.h}%` }} />
                <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{b.m}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {REPORT_STATS.map((s) => (
              <div key={s.label} style={{ padding: '13px 15px', border: '1px solid var(--bd-soft)', borderRadius: 13 }}>
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 5 }}>{s.label}</div>
                <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: s.color }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ overflowX: 'auto', borderTop: '1px solid var(--bd-soft)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={{ ...th, padding: '10px 20px' }}>Filial</th>
                <th style={{ ...th, textAlign: 'right' }}>Nº de vendas</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={{ ...th, padding: '10px 20px', textAlign: 'right' }}>Margem</th>
              </tr>
            </thead>
            <tbody>
              {SALES_BY_BRANCH.map((r) => (
                <tr key={r.branch} className="ants-row" style={{ borderTop: '1px solid var(--bd-soft2)' }}>
                  <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{r.branch}</td>
                  <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12.5, color: 'var(--text2)' }}>
                    {r.count}
                  </td>
                  <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {r.totalStr}
                  </td>
                  <td className="tnum" style={{ padding: '11px 20px', textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: 'var(--ok)' }}>
                    {r.margin}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '12px 20px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Total geral</td>
                <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                  1 842
                </td>
                <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  1 248 600,00 MT
                </td>
                <td className="tnum" style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--ok)' }}>
                  25,4%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Biblioteca de relatórios */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Biblioteca de relatórios</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>Gere qualquer relatório e exporte para PDF, Excel ou CSV</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {REPORT_GROUPS.map((g) => (
            <div key={g.label}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 11 }}>{g.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
                {g.items.map((r) => (
                  <div key={r.name} className="ants-pcard" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 9, borderRadius: 11, flex: 'none', display: 'inline-flex' }}>
                        <Icon name={r.icon} size={18} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{r.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.35, marginTop: 3 }}>{r.desc}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 11, borderTop: '1px solid var(--bd-soft2)' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '2px 7px', borderRadius: 6 }}>PDF</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '2px 7px', borderRadius: 6 }}>XLS</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', background: 'var(--bd-soft)', padding: '2px 7px', borderRadius: 6 }}>CSV</span>
                      <div style={{ flex: 1 }} />
                      <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 600 }}>
                        <Icon name="play" size={13} />
                        Gerar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
