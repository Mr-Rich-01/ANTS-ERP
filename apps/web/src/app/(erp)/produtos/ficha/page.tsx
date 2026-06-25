import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import { PRODUCT_DETAIL } from '@/lib/data/products';

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

export default function FichaProdutoPage() {
  const pd = PRODUCT_DETAIL;
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link
        href="/produtos"
        style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' }}
      >
        <Icon name="arrow-left" size={16} />
        Voltar a Produtos &amp; Stock
      </Link>

      {/* Cabeçalho */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 64, height: 64, borderRadius: 15, background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="package" size={28} />
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{pd.name}</h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: pd.statusColor, background: pd.statusBg, padding: '3px 10px', borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: pd.statusColor }} />
              {pd.statusLabel}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 5, marginTop: 8 }}>
            <span className="font-mono" style={{ fontSize: 12.5, color: 'var(--text2)' }}>
              {pd.sku}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>
              Categoria: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{pd.cat}</strong>
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>
              Marca: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{pd.brand}</strong>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9, flex: 'none' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600 }}>
            <Icon name="sliders-horizontal" size={15} />
            Ajustar stock
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
            <Icon name="pencil" size={15} />
            Editar produto
          </button>
        </div>
      </div>

      <KpiGrid>
        {pd.kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      {/* Movimentos */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="history" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Movimentos de stock</div>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>· últimos 30 dias</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={{ ...th, padding: '11px 18px' }}>Data</th>
                <th style={th}>Tipo</th>
                <th style={th}>Documento</th>
                <th style={{ ...th, textAlign: 'right' }}>Quantidade</th>
                <th style={{ ...th, padding: '11px 18px', textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {pd.moves.map((m) => (
                <tr key={`${m.date}-${m.doc}`} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                  <td className="tnum" style={{ padding: '12px 18px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {m.date}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: m.typeColor, background: m.typeBg, padding: '3px 9px', borderRadius: 20 }}>{m.type}</span>
                  </td>
                  <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                    {m.doc}
                  </td>
                  <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: m.qtyColor }}>
                    {m.qtyStr}
                  </td>
                  <td className="tnum" style={{ padding: '12px 18px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {m.balanceStr}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
