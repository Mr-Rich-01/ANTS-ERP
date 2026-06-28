import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { getProduct, listProductMovements, hasPermission, DomainError, type StockStatus, type StockMovementType } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { fmt } from '@/lib/format';
import { KpiCard, KpiGrid, type KpiCardData } from '@/components/ui/KpiCard';
import { ProductFormDialog } from '@/components/produtos/ProductFormDialog';

export const dynamic = 'force-dynamic';

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

const STOCK_STATUS: Record<StockStatus, { label: string; color: string; bg: string }> = {
  ok: { label: 'Em stock', color: 'var(--ok)', bg: 'var(--ok-bg)' },
  low: { label: 'Stock baixo', color: 'var(--warn)', bg: 'var(--warn-bg)' },
  out: { label: 'Esgotado', color: 'var(--bad)', bg: 'var(--bad-bg)' },
};

const MOVE_STYLE: Record<StockMovementType, { label: string; color: string; bg: string }> = {
  IN: { label: 'Entrada', color: 'var(--ok)', bg: 'var(--ok-bg)' },
  OUT: { label: 'Saída', color: 'var(--info)', bg: 'var(--info-bg)' },
  ADJUST: { label: 'Ajuste', color: 'var(--warn)', bg: 'var(--warn-bg)' },
};

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export default async function FichaProdutoPage({ searchParams }: { searchParams: { id?: string; sku?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'stock.view')) redirect('/produtos');
  const key = searchParams.id ?? searchParams.sku;
  if (!key) redirect('/produtos');

  const db = forCompany(ctx.companyId);
  let product;
  try {
    product = await getProduct(db, ctx, key);
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Link href="/produtos" style={backBtn}>
            <Icon name="arrow-left" size={16} />
            Voltar a Produtos &amp; Stock
          </Link>
          <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
        </div>
      );
    }
    throw e;
  }

  const movements = await listProductMovements(db, ctx, product.id, 30);
  const st = STOCK_STATUS[product.stockStatus];
  const margin = product.salePrice > 0 ? Math.round(((product.salePrice - product.avgCost) / product.salePrice) * 100) : 0;

  const kpis: KpiCardData[] = [
    { label: 'Stock actual', valueStr: `${product.stock} ${product.unit}`, tone: 'petroleum', icon: 'package', sub: `mín. ${product.minStock} ${product.unit}` },
    { label: 'Preço de venda', valueStr: fmt(product.salePrice), tone: 'green', icon: 'tag', sub: `IVA ${product.taxRate}%` },
    { label: 'Custo médio', valueStr: fmt(product.avgCost), tone: 'blue', icon: 'shopping-cart', sub: 'custo médio ponderado' },
    { label: 'Margem', valueStr: `${margin}%`, tone: 'amber', icon: 'trending-up', sub: 'por unidade' },
  ];

  const canEdit = hasPermission(ctx, 'products.update');
  const canAdjust = hasPermission(ctx, 'stock.adjust');

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link href="/produtos" style={backBtn}>
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
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{product.name}</h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: st.color, background: st.bg, padding: '3px 10px', borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }} />
              {st.label}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 5, marginTop: 8 }}>
            <span className="font-mono" style={{ fontSize: 12.5, color: 'var(--text2)' }}>
              {product.sku}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>
              Categoria: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{product.category ?? '—'}</strong>
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>
              Marca: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{product.brand ?? '—'}</strong>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9, flex: 'none' }}>
          {canAdjust && (
            <Link href="/inventario" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600 }}>
              <Icon name="sliders-horizontal" size={15} />
              Ajustar stock
            </Link>
          )}
          {canEdit && (
            <ProductFormDialog
              mode="edit"
              initial={{
                id: product.id,
                sku: product.sku,
                name: product.name,
                category: product.category,
                brand: product.brand,
                unit: product.unit,
                salePrice: product.salePrice,
                avgCost: product.avgCost,
                taxRate: product.taxRate,
                minStock: product.minStock,
                barcode: product.barcode,
              }}
              trigger={
                <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <Icon name="pencil" size={15} />
                  Editar produto
                </button>
              }
            />
          )}
        </div>
      </div>

      <KpiGrid>
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      {/* Stock por armazém */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Icon name="warehouse" size={15} color="var(--text3)" />
          Stock por armazém
        </span>
        {product.byWarehouse.length === 0 ? (
          <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>Sem stock registado.</span>
        ) : (
          product.byWarehouse.map((w) => (
            <span key={w.warehouseId} style={{ fontSize: 12.5, color: 'var(--text2)' }}>
              {w.warehouseName}: <strong className="tnum" style={{ color: 'var(--text)' }}>{w.quantity} {product.unit}</strong>
            </span>
          ))
        )}
      </div>

      {/* Movimentos */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="history" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Movimentos de stock</div>
        </div>
        {movements.length === 0 ? (
          <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Sem movimentos registados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={{ ...th, padding: '11px 18px' }}>Data</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Documento</th>
                  <th style={th}>Armazém</th>
                  <th style={{ ...th, textAlign: 'right' }}>Quantidade</th>
                  <th style={{ ...th, padding: '11px 18px', textAlign: 'right' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const ms = MOVE_STYLE[m.type];
                  const qtyColor = m.quantity > 0 ? 'var(--ok)' : m.quantity < 0 ? 'var(--bad)' : 'var(--text3)';
                  const qtyStr = `${m.quantity > 0 ? '+ ' : m.quantity < 0 ? '− ' : ''}${Math.abs(m.quantity)}`;
                  return (
                    <tr key={m.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                      <td className="tnum" style={{ padding: '12px 18px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {fmtDate(m.createdAt)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: ms.color, background: ms.bg, padding: '3px 9px', borderRadius: 20 }}>{ms.label}</span>
                      </td>
                      <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                        {m.document ?? '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{m.warehouseCode}</td>
                      <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: qtyColor }}>
                        {qtyStr}
                      </td>
                      <td className="tnum" style={{ padding: '12px 18px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {m.balanceAfter}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  height: 34,
  padding: '0 13px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text2)',
  fontSize: 12.5,
  fontWeight: 600,
  width: 'max-content',
};
