import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { hasPermission, listSuppliers, listWarehouses, searchProductOptions } from '@ants/domain';
import { getContext } from '@/lib/session';
import { NovaOrdemClient, type SupplierOpt, type ProductOpt, type WarehouseOpt } from './NovaOrdemClient';

export const dynamic = 'force-dynamic';

export default async function NovaOrdemPage() {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'purchases.create')) redirect('/compras');

  const db = forCompany(ctx.companyId);
  // Produtos: apenas as primeiras opções — o resto chega por pesquisa server-side (S2).
  const [suppliers, products, warehouses] = await Promise.all([listSuppliers(db, ctx), searchProductOptions(db, ctx), listWarehouses(db, ctx)]);

  const supplierOpts: SupplierOpt[] = suppliers
    .filter((s) => s.status === 'ACTIVE')
    .map((s) => ({ id: s.id, name: s.name, nuit: s.nuit ?? '', phone: s.phone ?? '' }));
  const productOpts: ProductOpt[] = products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, cost: p.avgCost }));
  const warehouseOpts: WarehouseOpt[] = warehouses.map((w) => ({ id: w.id, label: `${w.name} (${w.code})` }));

  return <NovaOrdemClient suppliers={supplierOpts} products={productOpts} warehouses={warehouseOpts} />;
}
