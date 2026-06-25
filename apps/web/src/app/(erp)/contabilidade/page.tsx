import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import { ACC_CRED_TOTAL, ACC_DEB_TOTAL, ACC_KPIS, JOURNAL } from '@/lib/data/finance';

const GRID = '78px 1.3fr 1.7fr 140px 140px';
const colHead: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.5px',
  color: 'var(--text3)',
  textTransform: 'uppercase',
};

export default function ContabilidadePage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KpiGrid>
        {ACC_KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="book-open" size={18} />
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Diário contabilístico</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Lançamentos por partidas dobradas · Junho 2026</div>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '4px 11px', borderRadius: 20 }}>
            <Icon name="scale" size={14} />
            Balanceado
          </span>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
            <Icon name="sliders-horizontal" size={14} />
            Filtrar conta
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 600 }}>
            <Icon name="plus" size={14} />
            Novo lançamento
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 820 }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, background: 'var(--card2)', borderBottom: '1px solid var(--bd-soft)' }}>
              <div style={colHead}>Conta</div>
              <div style={colHead}>Nome da conta</div>
              <div style={colHead}>Descrição</div>
              <div style={{ ...colHead, textAlign: 'right' }}>Débito</div>
              <div style={{ ...colHead, textAlign: 'right' }}>Crédito</div>
            </div>

            {JOURNAL.map((j) => (
              <div key={j.doc}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--card3)', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
                  <span className="font-mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent-fg)' }}>
                    {j.doc}
                  </span>
                  <span className="tnum" style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                    {j.date}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{j.desc}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="user" size={13} />
                    {j.user}
                  </span>
                </div>
                {j.lines.map((l, i) => (
                  <div key={i} className="ants-row" style={{ display: 'grid', gridTemplateColumns: GRID, borderBottom: '1px solid var(--bd-soft2)' }}>
                    <div className="font-mono" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>
                      {l.acc}
                    </div>
                    <div style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{l.name}</div>
                    <div style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{l.d}</div>
                    <div className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: l.debCol }}>
                      {l.debStr}
                    </div>
                    <div className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: l.credCol }}>
                      {l.credStr}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: GRID, background: 'var(--card2)', borderTop: '2px solid var(--border)' }}>
              <div style={{ gridColumn: '1 / 4', padding: '13px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Totais do período</div>
              <div className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                {ACC_DEB_TOTAL}
              </div>
              <div className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                {ACC_CRED_TOTAL}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
