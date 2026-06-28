import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { hasPermission, listProducts, productKpis, type StockStatus } from '@ants/domain';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import { ProdutosClient, type ProductRow } from './ProdutosClient';

export const dynamic = 'force-dynamic';

const STOCK_STATUS: Record<StockStatus, { label: string; color: string; bg: string }> = {
  ok: { label: 'Em stock', color: 'var(--ok)', bg: 'var(--ok-bg)' },
  low: { label: 'Stock baixo', color: 'var(--warn)', bg: 'var(--warn-bg)' },
  out: { label: 'Esgotado', color: 'var(--bad)', bg: 'var(--bad-bg)' },
};

export default async function ProdutosPage() {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver os produtos.
      </div>
    );
  }
  if (!hasPermission(ctx, 'stock.view')) redirect('/');

  const db = forCompany(ctx.companyId);
  const [products, kpi] = await Promise.all([listProducts(db, ctx), productKpis(db, ctx)]);

  const rows: ProductRow[] = products.map((p) => {
    const st = STOCK_STATUS[p.stockStatus];
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category ?? '—',
      brand: p.brand ?? '—',
      priceStr: fmt(p.salePrice),
      stock: p.stock,
      min: p.minStock,
      unit: p.unit,
      stockColor: p.stockStatus === 'out' ? 'var(--bad)' : p.stockStatus === 'low' ? 'var(--warn)' : 'var(--text)',
      statusLabel: st.label,
      statusColor: st.color,
      statusBg: st.bg,
    };
  });

  return (
    <ProdutosClient
      rows={rows}
      stockValueStr={fmt(kpi.stockValue)}
      canCreate={hasPermission(ctx, 'products.create')}
      canViewInventory={hasPermission(ctx, 'stock.adjust')}
    />
  );
}
