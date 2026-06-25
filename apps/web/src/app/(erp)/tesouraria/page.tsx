import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import { BANKS, CASH_CLOSE, CASH_KPIS, MOVEMENTS } from '@/lib/data/treasury';

const th: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.5px',
  color: 'var(--text3)',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--bd-soft)',
};

export default function TesourariaPage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -6 }}>
        <Link
          href="/tesouraria/fecho"
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}
        >
          <Icon name="receipt-text" size={16} />
          Fecho &amp; relatório diário
        </Link>
      </div>

      <KpiGrid>
        {CASH_KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 11 }}>Contas &amp; carteiras</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
          {BANKS.map((b) => (
            <div key={b.name} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: b.color, background: b.bg, padding: 9, borderRadius: 10, flex: 'none', display: 'inline-flex' }}>
                  <Icon name={b.icon} size={18} />
                </span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{b.type}</div>
                </div>
              </div>
              <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                {b.number}
              </div>
              <div className="tnum" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                {b.balanceStr}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* Movimentos */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Movimentos do dia</div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
              <Icon name="download" size={14} />
              Exportar
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Hora</th>
                  <th style={th}>Documento</th>
                  <th style={th}>Descrição</th>
                  <th style={th}>Método</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {MOVEMENTS.map((m) => (
                  <tr key={m.doc} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {m.time}
                    </td>
                    <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {m.doc}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text)' }}>
                      {m.desc}
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.user}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--text2)', background: 'var(--bd-soft)', padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{m.method}</span>
                    </td>
                    <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: m.amountColor, whiteSpace: 'nowrap' }}>
                      {m.amountStr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Fecho de caixa */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
            <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
              <Icon name="lock" size={17} />
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Fecho de caixa</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Row label="Saldo de abertura" value={CASH_CLOSE.abertura} />
            <Row label="Entradas" value={CASH_CLOSE.entradas} color="var(--ok)" />
            <Row label="Saídas" value={CASH_CLOSE.saidas} color="var(--bad)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--bd-soft2)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Esperado em caixa</span>
              <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-fg)' }}>
                {CASH_CLOSE.esperado}
              </span>
            </div>
            <Row label="Contado" value={CASH_CLOSE.contado} last />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 11px', borderRadius: 9, background: 'var(--ok-bg)', marginTop: 4 }}>
              <span style={{ fontSize: 12.5, color: 'var(--ok)', fontWeight: 600 }}>Diferença</span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ok)' }}>
                {CASH_CLOSE.diferenca}
              </span>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 7 }}>Operador de caixa</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', border: '1px solid var(--bd-soft)', borderRadius: 10 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: '#0e2a30', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>MT</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{CASH_CLOSE.operator}</span>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 7 }}>Assinatura</div>
            <div style={{ height: 64, border: '1.5px dashed var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text4)', fontSize: 12, gap: 7 }}>
              <Icon name="pen-line" size={16} />
              Assine para confirmar o fecho
            </div>
          </div>
          <button style={{ width: '100%', height: 44, marginTop: 14, borderRadius: 11, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="lock" size={17} />
            Fechar caixa
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color, last }: { label: string; value: string; color?: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: last ? undefined : '1px solid var(--bd-soft2)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{label}</span>
      <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: color ?? 'var(--text)' }}>
        {value}
      </span>
    </div>
  );
}
