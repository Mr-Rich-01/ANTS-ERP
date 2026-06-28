'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { ProductFormDialog } from '@/components/produtos/ProductFormDialog';

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  priceStr: string;
  stock: number;
  min: number;
  unit: string;
  stockColor: string;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
}

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
  cursor: 'pointer',
};

export function ProdutosClient({
  rows,
  stockValueStr,
  canCreate,
  canViewInventory,
}: {
  rows: ProductRow[];
  stockValueStr: string;
  canCreate: boolean;
  canViewInventory: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(term) || r.sku.toLowerCase().includes(term) || r.category.toLowerCase().includes(term) || r.brand.toLowerCase().includes(term),
    );
  }, [q, rows]);

  return (
    <div style={{ padding: '14px 26px 30px' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--field)', border: '1px solid var(--field-bd)', borderRadius: 9, padding: '0 11px', height: 36, width: 280, maxWidth: '40vw' }}>
            <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
              <Icon name="search" size={16} />
            </span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar produto, SKU…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }} />
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {filtered.length} {filtered.length === 1 ? 'produto' : 'produtos'}
          </span>
          {canViewInventory && (
            <button onClick={() => router.push('/inventario')} style={{ ...toolBtn, color: 'var(--accent-fg)', fontWeight: 600 }}>
              <Icon name="clipboard-list" size={15} />
              Inventário
            </button>
          )}
          {canCreate && (
            <ProductFormDialog
              mode="create"
              trigger={
                <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <Icon name="plus" size={15} />
                  Novo produto
                </button>
              }
            />
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>SKU</th>
                <th style={th}>Produto</th>
                <th style={th}>Categoria</th>
                <th style={th}>Marca</th>
                <th style={{ ...th, textAlign: 'right' }}>Preço</th>
                <th style={{ ...th, textAlign: 'right' }}>Stock</th>
                <th style={{ ...th, textAlign: 'right' }}>Mín.</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    {rows.length === 0 ? 'Ainda não há produtos. Crie o primeiro.' : 'Nenhum produto corresponde à pesquisa.'}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)', cursor: 'pointer' }} onClick={() => router.push(`/produtos/ficha?id=${p.id}`)}>
                    <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {p.sku}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{p.name}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{p.category}</td>
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
                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                      <span style={{ color: 'var(--text4)', display: 'inline-flex' }}>
                        <Icon name="chevron-right" size={17} />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={5} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  Total · {rows.length} {rows.length === 1 ? 'produto' : 'produtos'}
                </td>
                <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Valor stock</td>
                <td colSpan={3} className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {stockValueStr}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
