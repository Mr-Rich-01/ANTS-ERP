'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { ProductFormDialog, type WarehouseOption } from '@/components/produtos/ProductFormDialog';

export type ProductView = '10' | '50' | '100' | 'todos';

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

const VIEW_OPTIONS: { value: ProductView; label: string }[] = [
  { value: '10', label: 'Top 10' },
  { value: '50', label: 'Top 50' },
  { value: '100', label: 'Top 100' },
  { value: 'todos', label: 'Todos' },
];

/** URL da listagem com o estado (vista/página/pesquisa); omite os defaults para manter a URL limpa. */
function listUrl(state: { vista: ProductView; pagina: number; q: string }): string {
  const params = new URLSearchParams();
  if (state.vista !== '10') params.set('vista', state.vista);
  if (state.vista === 'todos' && state.pagina > 1) params.set('pagina', String(state.pagina));
  if (state.q) params.set('q', state.q);
  const qs = params.toString();
  return qs ? `/produtos?${qs}` : '/produtos';
}

export function ProdutosClient({
  rows,
  total,
  vista,
  pagina,
  totalPages,
  query,
  stockValueStr,
  canCreate,
  canViewInventory,
  warehouses,
}: {
  rows: ProductRow[];
  total: number;
  vista: ProductView;
  pagina: number;
  totalPages: number;
  query: string;
  stockValueStr: string;
  canCreate: boolean;
  canViewInventory: boolean;
  warehouses: WarehouseOption[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(query);

  // Pesquisa server-side com debounce: reflecte o termo na URL (e repõe a página 1).
  useEffect(() => {
    const term = q.trim();
    if (term === query) return;
    const t = setTimeout(() => {
      router.replace(listUrl({ vista, pagina: 1, q: term }));
    }, 300);
    return () => clearTimeout(t);
  }, [q, query, vista, router]);

  const showingAll = vista === 'todos';
  const countLabel = total === 1 ? 'produto' : 'produtos';

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
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
            {VIEW_OPTIONS.map((opt, i) => {
              const active = opt.value === vista;
              return (
                <button
                  key={opt.value}
                  onClick={() => router.push(listUrl({ vista: opt.value, pagina: 1, q: q.trim() }))}
                  style={{
                    height: 34,
                    padding: '0 12px',
                    border: 'none',
                    borderLeft: i === 0 ? 'none' : '1px solid var(--bd-soft)',
                    background: active ? 'var(--accent-bg)' : 'var(--card)',
                    color: active ? 'var(--accent-fg)' : 'var(--text2)',
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {showingAll || rows.length >= total ? `${total} ${countLabel}` : `${rows.length} de ${total} ${countLabel}`}
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
              warehouses={warehouses}
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    {query ? 'Nenhum produto corresponde à pesquisa.' : 'Ainda não há produtos. Crie o primeiro.'}
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
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
                  Total · {total} {countLabel}
                </td>
                <td style={{ padding: '13px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Valor stock</td>
                <td colSpan={3} className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {stockValueStr}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {showingAll && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--bd-soft)' }}>
            <button
              onClick={() => router.push(listUrl({ vista, pagina: pagina - 1, q: q.trim() }))}
              disabled={pagina <= 1}
              style={{ ...toolBtn, height: 32, opacity: pagina <= 1 ? 0.5 : 1, cursor: pagina <= 1 ? 'default' : 'pointer' }}
            >
              <Icon name="chevron-left" size={15} />
              Anterior
            </button>
            <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>
              Página {pagina} de {totalPages}
            </span>
            <button
              onClick={() => router.push(listUrl({ vista, pagina: pagina + 1, q: q.trim() }))}
              disabled={pagina >= totalPages}
              style={{ ...toolBtn, height: 32, opacity: pagina >= totalPages ? 0.5 : 1, cursor: pagina >= totalPages ? 'default' : 'pointer' }}
            >
              Seguinte
              <Icon name="chevron-right" size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
