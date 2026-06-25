import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import { CONTRACT_KPIS, CONTRACTS, CT_HISTORY, RENEWALS } from '@/lib/data/finance';

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

export default function ContratosPage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KpiGrid>
        {CONTRACT_KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* Lista de contratos */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Contratos</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--field)', border: '1px solid var(--field-bd)', borderRadius: 9, padding: '0 11px', height: 36, width: 210, maxWidth: '30vw', marginLeft: 6 }}>
              <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
                <Icon name="search" size={16} />
              </span>
              <input placeholder="Pesquisar nº, cliente…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }} />
            </div>
            <div style={{ flex: 1 }} />
            <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
              <Icon name="plus" size={15} />
              Novo contrato
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Contrato</th>
                  <th style={th}>Cliente / Serviço</th>
                  <th style={th}>Início</th>
                  <th style={th}>Fim / Renovação</th>
                  <th style={{ ...th, textAlign: 'right' }}>Recorrente</th>
                  <th style={th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {CONTRACTS.map((c) => (
                  <tr key={c.number} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                      {c.number}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {c.client}
                      <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{c.service}</div>
                    </td>
                    <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {c.start}
                    </td>
                    <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {c.end}
                    </td>
                    <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {c.valStr}
                      <div style={{ fontSize: 10.5, color: 'var(--text3)', fontWeight: 500 }}>por mês</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: c.statusColor, background: c.statusBg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.statusColor }} />
                        {c.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Renovações + histórico */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
              <span style={{ color: 'var(--warn)', display: 'inline-flex' }}>
                <Icon name="bell-ring" size={17} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Próximas renovações</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {RENEWALS.map((r) => (
                <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 11, borderBottom: '1px solid var(--bd-soft2)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                    <div style={{ fontSize: 11.5, color: r.noteColor, fontWeight: 500 }}>{r.note}</div>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                      {r.valStr}
                    </div>
                  </div>
                  {r.canRenew && (
                    <button style={{ flex: 'none', height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontSize: 11.5, fontWeight: 600 }}>Renovar</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 15 }}>Histórico de alterações</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {CT_HISTORY.map((h, i) => (
                <div key={h.text} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
                    <span style={{ color: h.color, background: h.bg, padding: 7, borderRadius: 9, display: 'inline-flex' }}>
                      <Icon name={h.icon} size={15} />
                    </span>
                    {i < CT_HISTORY.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--bd-soft)', margin: '3px 0' }} />}
                  </div>
                  <div style={{ paddingBottom: 15 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.35 }}>{h.text}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{h.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
