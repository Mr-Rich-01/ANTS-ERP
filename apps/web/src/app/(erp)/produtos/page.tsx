import { NoPermission } from '@/components/NoPermission';
import { forCompany } from '@ants/database';
import { hasPermission, listProductsPage, listWarehouses, productKpis, type StockStatus } from '@ants/domain';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import { ProdutosClient, type ProductRow, type ProductView } from './ProdutosClient';

export const dynamic = 'force-dynamic';

const STOCK_STATUS: Record<StockStatus, { label: string; color: string; bg: string }> = {
  ok: { label: 'Em stock', color: 'var(--ok)', bg: 'var(--ok-bg)' },
  low: { label: 'Stock baixo', color: 'var(--warn)', bg: 'var(--warn-bg)' },
  out: { label: 'Esgotado', color: 'var(--bad)', bg: 'var(--bad-bg)' },
};

const VIEWS: ProductView[] = ['10', '50', '100', 'todos'];
const PAGE_SIZE = 50;

export default async function ProdutosPage({ searchParams }: { searchParams: { vista?: string; pagina?: string; q?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver os produtos.
      </div>
    );
  }
  if (!hasPermission(ctx, 'stock.view')) return <NoPermission message="Não tem permissão para ver produtos." />;

  const vista: ProductView = VIEWS.includes(searchParams.vista as ProductView) ? (searchParams.vista as ProductView) : '10';
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim().slice(0, 80) : '';
  const paginaRaw = Number.parseInt(searchParams.pagina ?? '1', 10);
  let pagina = vista === 'todos' && Number.isFinite(paginaRaw) ? Math.max(paginaRaw, 1) : 1;

  const take = vista === 'todos' ? PAGE_SIZE : Number(vista);

  const db = forCompany(ctx.companyId);
  const canCreate = hasPermission(ctx, 'products.create');
  let [page, kpi, warehouses] = await Promise.all([
    listProductsPage(db, ctx, { query: q, take, skip: (pagina - 1) * take }),
    productKpis(db, ctx),
    canCreate ? listWarehouses(db, ctx) : Promise.resolve([]),
  ]);

  // Página fora do intervalo (ex.: URL antigo após remoção de produtos) → recua para a última.
  const totalPages = vista === 'todos' ? Math.max(Math.ceil(page.total / PAGE_SIZE), 1) : 1;
  if (pagina > totalPages) {
    pagina = totalPages;
    page = await listProductsPage(db, ctx, { query: q, take, skip: (pagina - 1) * take });
  }

  const rows: ProductRow[] = page.items.map((p) => {
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
      total={page.total}
      vista={vista}
      pagina={pagina}
      totalPages={totalPages}
      query={q}
      stockValueStr={fmt(kpi.stockValue)}
      canCreate={canCreate}
      canViewInventory={hasPermission(ctx, 'stock.adjust')}
      warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }))}
    />
  );
}
