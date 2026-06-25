'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { PRODUCT_COUNT, PRODUCT_ROWS, STOCK_VALUE_STR } from '@/lib/data/products';

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
const toolBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 36,
  padding: '0 12px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--text2)',
};
const pageBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text2)',
  fontSize: 12.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export default function ProdutosPage() {
  const router = useRouter();

  return (
    <div style={{ padding: '14px 26px 30px' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--field)', border: '1px solid var(--field-bd)', borderRadius: 9, padding: '0 11px', height: 36, width: 280, maxWidth: '40vw' }}>
            <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
              <Icon name="search" size={16} />
            </span>
            <input placeholder="Pesquisar produto, SKU…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }} />
          </div>
          <button style={toolBtn}>
            <Icon name="sliders-horizontal" size={15} />
            Filtros
          </button>
          <button style={toolBtn}>
            <Icon name="columns-3" size={15} />
            Colunas
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{PRODUCT_COUNT} produtos</span>
          <button onClick={() => router.push('/inventario')} style={{ ...toolBtn, color: 'var(--accent-fg)', fontWeight: 600 }}>
            <Icon name="clipboard-list" size={15} />
            Inventário
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
            <Icon name="plus" size={15} />
            Novo produto
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={{ ...th, width: 42, textAlign: 'center' }}>
                  <input type="checkbox" style={{ accentColor: ACCENT }} />
                </th>
                <th style={th}>SKU</th>
                <th style={th}>Produto</th>
                <th style={th}>Categoria</th>
                <th style={th}>Marca</th>
                <th style={{ ...th, textAlign: 'right' }}>Preço</th>
                <th style={{ ...th, textAlign: 'right' }}>Stock</th>
                <th style={{ ...th, textAlign: 'right' }}>Mín.</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {PRODUCT_ROWS.map((p) => (
                <tr key={p.sku} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <input type="checkbox" style={{ accentColor: ACCENT }} />
                  </td>
                  <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {p.sku}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    <span onClick={() => router.push('/produtos/ficha')} style={{ cursor: 'pointer' }}>
                      {p.name}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{p.cat}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{p.brand}</td>
                  <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {p.priceStr}
                  </td>
                  <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: p.stockColor }}>
                    {p.stock}
                  </td>
                  <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12.5, color: 'var(--text3)' }}>
                    {p.min}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: p.statusColor, background: p.statusBg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.statusColor }} />
                      {p.statusLabel}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    <button style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'none', color: 'var(--text3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="more-horizontal" size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={5} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  Total · {PRODUCT_COUNT} produtos
                </td>
                <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Valor stock</td>
                <td colSpan={2} className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {STOCK_VALUE_STR}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--bd-soft)' }}>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            A mostrar 1–{PRODUCT_COUNT} de {PRODUCT_COUNT}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={pageBtn}>
              <Icon name="chevron-left" size={16} />
            </button>
            <button style={{ ...pageBtn, border: 'none', background: ACCENT, color: '#fff', fontWeight: 600 }}>1</button>
            <button style={pageBtn}>2</button>
            <button style={pageBtn}>
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
