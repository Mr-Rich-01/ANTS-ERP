import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { getProfile, type ProfileType } from '@/lib/data/profile';

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
const meta: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 };

export default function PerfilContaPage({ searchParams }: { searchParams: { type?: string } }) {
  const type: ProfileType = searchParams.type === 'supplier' ? 'supplier' : 'client';
  const pf = getProfile(type);
  const backHref = type === 'supplier' ? '/fornecedores' : '/clientes';

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link
        href={backHref}
        style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' }}
      >
        <Icon name="arrow-left" size={16} />
        Voltar à lista
      </Link>

      {/* Cabeçalho */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 22px', display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <span style={{ width: 60, height: 60, borderRadius: 16, background: 'linear-gradient(135deg,#1b4651,#0e2a30)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 700, flex: 'none' }}>
          {pf.ini}
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{pf.name}</h2>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: pf.typeColor, background: pf.typeBg, padding: '3px 10px', borderRadius: 20 }}>{pf.typeLabel}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 22, rowGap: 6, marginTop: 10 }}>
            <span style={meta}>
              <Icon name="hash" size={14} color="var(--text3)" />
              NUIT {pf.nuit}
            </span>
            <span style={meta}>
              <Icon name="map-pin" size={14} color="var(--text3)" />
              {pf.address}
            </span>
            <span style={meta}>
              <Icon name="phone" size={14} color="var(--text3)" />
              {pf.phone}
            </span>
            <span style={meta}>
              <Icon name="mail" size={14} color="var(--text3)" />
              {pf.email}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9, flex: 'none' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600 }}>
            <Icon name="pencil" size={15} />
            Editar
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
            <Icon name={pf.actionIcon} size={15} />
            {pf.actionLabel}
          </button>
        </div>
      </div>

      {/* Mini KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        {pf.mini.map((m) => (
          <div key={m.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{m.label}</span>
            <span className="tnum" style={{ fontSize: 20, fontWeight: 700, color: m.color }}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      {/* Extracto */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="scroll-text" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Extracto de conta</div>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>· Junho 2026</span>
          <div style={{ flex: 1 }} />
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
            <Icon name="printer" size={14} />
            Imprimir
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
            <Icon name="download" size={14} />
            Exportar
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Data</th>
                <th style={th}>Documento</th>
                <th style={th}>Descrição</th>
                <th style={{ ...th, textAlign: 'right' }}>Débito</th>
                <th style={{ ...th, textAlign: 'right' }}>Crédito</th>
                <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {pf.extract.map((e, i) => (
                <tr key={i} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                  <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {e.date}
                  </td>
                  <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {e.doc}
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)' }}>{e.desc}</td>
                  <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: e.debCol }}>
                    {e.debStr}
                  </td>
                  <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: e.credCol }}>
                    {e.credStr}
                  </td>
                  <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {e.saldoStr}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={5} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                  Saldo final
                </td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                  {pf.saldoFinalStr}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
