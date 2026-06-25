import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import { EMPLOYEES, HR_KPIS, PAYROLL } from '@/lib/data/hr';

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

export default function RhPage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KpiGrid>
        {HR_KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* Colaboradores */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Colaboradores</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--field)', border: '1px solid var(--field-bd)', borderRadius: 9, padding: '0 11px', height: 36, width: 200, maxWidth: '30vw', marginLeft: 6 }}>
              <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
                <Icon name="search" size={16} />
              </span>
              <input placeholder="Pesquisar…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }} />
            </div>
            <div style={{ flex: 1 }} />
            <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
              <Icon name="user-plus" size={15} />
              Novo colaborador
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Colaborador</th>
                  <th style={th}>Departamento</th>
                  <th style={th}>Contrato</th>
                  <th style={{ ...th, textAlign: 'right' }}>Venc. base</th>
                  <th style={th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {EMPLOYEES.map((e) => (
                  <tr key={e.name} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <span style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#1b4651,#0e2a30)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>
                          {e.ini}
                        </span>
                        <div style={{ lineHeight: 1.25 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{e.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{e.role}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{e.dept}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{e.contract}</td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {e.salStr}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: e.statusColor, background: e.statusBg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.statusColor }} />
                        {e.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Processamento salarial */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
                <Icon name="banknote" size={17} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Processamento salarial</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '3px 10px', borderRadius: 20 }}>Junho · por processar</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              ['Salário bruto', PAYROLL.brutoStr, 'var(--text)'],
              ['Subsídios', PAYROLL.subsStr, 'var(--ok)'],
              ['INSS (3%)', PAYROLL.inssStr, 'var(--bad)'],
              ['IRPS', PAYROLL.irpsStr, 'var(--bad)'],
            ].map(([l, v, color]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--bd-soft2)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{l}</span>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color }}>
                  {v}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 13px', borderRadius: 10, background: 'var(--accent-bg)', marginTop: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Líquido a pagar</span>
              <span className="tnum" style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-fg)' }}>
                {PAYROLL.liquidoStr}
              </span>
            </div>
          </div>
          <button style={{ width: '100%', height: 44, marginTop: 15, borderRadius: 11, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="play-circle" size={17} />
            Processar salários
          </button>
          <button style={{ width: '100%', height: 40, marginTop: 8, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="file-text" size={16} />
            Ver folha de pagamento
          </button>
        </div>
      </div>
    </div>
  );
}
