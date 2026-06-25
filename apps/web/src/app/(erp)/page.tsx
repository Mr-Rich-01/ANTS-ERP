import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import {
  alerts,
  activities,
  areaRev,
  barData,
  barFill,
  donutStyle,
  expPts,
  kpis,
  payLegend,
  revPts,
  topProducts,
} from '@/lib/data/dashboard';

const card: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '18px 20px',
};
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text)' };
const cardSub: React.CSSProperties = { fontSize: 12, color: 'var(--text3)' };

export default function DashboardPage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(214px,1fr))',
          gap: 14,
        }}
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            className="ants-tz"
            style={{ ...card, borderRadius: 16, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 11 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text2)', fontWeight: 500 }}>{k.label}</span>
              <span
                style={{
                  display: 'inline-flex',
                  color: k.iconColor,
                  background: k.iconBg,
                  padding: 7,
                  borderRadius: 9,
                }}
              >
                <Icon name={k.icon} size={16} />
              </span>
            </div>
            <div
              className="tnum"
              style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.6px', color: 'var(--text)' }}
            >
              {k.valueStr}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 11,
                  fontWeight: 600,
                  color: k.trendColor,
                  background: k.trendBg,
                  padding: '2px 7px',
                  borderRadius: 20,
                }}
              >
                <Icon name={k.trendIcon} size={12} />
                {k.trend}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Barras + Donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.9fr 1fr', gap: 14 }}>
        <div className="ants-tz" style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={cardTitle}>Vendas por período</div>
              <div style={cardSub}>Últimos 12 meses · Metical</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: ACCENT }} />
              <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>Vendas mensais</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 180, paddingTop: 8 }}>
            {barData.map((b) => (
              <div
                key={b.m}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 7,
                  height: '100%',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: 26,
                    borderRadius: '6px 6px 3px 3px',
                    background: barFill,
                    height: `${b.h}%`,
                  }}
                />
                <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{b.m}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ants-tz" style={card}>
          <div style={{ ...cardTitle, marginBottom: 4 }}>Formas de pagamento</div>
          <div style={{ ...cardSub, marginBottom: 16 }}>Distribuição das receitas</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 124,
                height: 124,
                borderRadius: '50%',
                background: donutStyle,
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  background: 'var(--card)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>100%</span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>recebido</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
              {payLegend.map((p) => (
                <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flex: 'none' }} />
                  <span style={{ flex: 1, color: 'var(--text2)' }}>{p.label}</span>
                  <span className="tnum" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {p.pct}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Receitas vs Despesas + Top produtos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.9fr 1fr', gap: 14 }}>
        <div className="ants-tz" style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={cardTitle}>Receitas vs. Despesas</div>
              <div style={cardSub}>Fluxo de caixa anual</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text2)' }}>
                <span style={{ width: 16, height: 3, borderRadius: 2, background: ACCENT }} />
                Receitas
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text2)' }}>
                <span style={{ width: 16, height: 3, borderRadius: 2, background: 'var(--bad)' }} />
                Despesas
              </span>
            </div>
          </div>
          <svg viewBox="0 0 660 220" preserveAspectRatio="none" style={{ width: '100%', height: 190, overflow: 'visible' }}>
            <polygon points={areaRev} style={{ fill: 'var(--bd-soft)' }} />
            <polyline
              points={revPts}
              fill="none"
              stroke={ACCENT}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points={expPts}
              fill="none"
              style={{ stroke: 'var(--bad)' }}
              strokeWidth={2.5}
              strokeDasharray="2 7"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="ants-tz" style={card}>
          <div style={{ ...cardTitle, marginBottom: 4 }}>Produtos mais vendidos</div>
          <div style={{ ...cardSub, marginBottom: 16 }}>Este mês · unidades</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {topProducts.map((t) => (
              <div key={t.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ fontWeight: 500, color: 'var(--text)' }}>{t.name}</span>
                  <span className="tnum" style={{ color: 'var(--text2)' }}>
                    {t.qty} un
                  </span>
                </div>
                <div style={{ height: 8, background: 'var(--bd-soft)', borderRadius: 6, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${t.w}%`,
                      background: 'linear-gradient(90deg,#1b4651,#1f8a5b)',
                      borderRadius: 6,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alertas + Actividades */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="ants-tz" style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={cardTitle}>Alertas &amp; pendências</div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                background: 'var(--bad-bg)',
                color: 'var(--bad)',
                padding: '2px 9px',
                borderRadius: 20,
              }}
            >
              6 a tratar
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((a) => (
              <div
                key={a.title}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '11px 12px',
                  borderRadius: 11,
                  background: a.bg,
                }}
              >
                <span style={{ display: 'inline-flex', color: a.color, flex: 'none', marginTop: 1 }}>
                  <Icon name={a.icon} size={17} />
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{a.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ants-tz" style={card}>
          <div style={{ ...cardTitle, marginBottom: 14 }}>Actividades recentes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {activities.map((ac) => (
              <div key={ac.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    color: ac.color,
                    background: ac.bg,
                    padding: 7,
                    borderRadius: 9,
                    flex: 'none',
                  }}
                >
                  <Icon name={ac.icon} size={15} />
                </span>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    flex: 1,
                    borderBottom: '1px solid var(--bd-soft2)',
                    paddingBottom: 11,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{ac.title}</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="tnum" style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {ac.meta}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{ac.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
