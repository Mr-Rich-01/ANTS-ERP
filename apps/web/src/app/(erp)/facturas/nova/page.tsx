import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { hasPermission, listWarehouses, searchCustomerOptions, searchProductOptions } from '@ants/domain';
import { getContext } from '@/lib/session';
import { NovaFacturaClient, type CustomerOpt, type ProductOpt, type WarehouseOpt } from './NovaFacturaClient';

export const dynamic = 'force-dynamic';

export default async function NovaFacturaPage() {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.create')) redirect('/facturas');

  const db = forCompany(ctx.companyId);
  // Apenas as primeiras opções — o resto chega por pesquisa server-side (S2).
  const [customers, products, warehouses] = await Promise.all([
    searchCustomerOptions(db, ctx, { onlyActive: true }),
    searchProductOptions(db, ctx),
    listWarehouses(db, ctx),
  ]);

  const customerOpts: CustomerOpt[] = customers.map((c) => ({ id: c.id, name: c.name, nuit: c.nuit, phone: c.phone }));
  const productOpts: ProductOpt[] = products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: p.salePrice, stock: p.stock }));
  const warehouseOpts: WarehouseOpt[] = warehouses.map((w) => ({ id: w.id, label: `${w.name} (${w.code})` }));

  return <NovaFacturaClient customers={customerOpts} products={productOpts} warehouses={warehouseOpts} canDiscount={hasPermission(ctx, 'sales.approve_discount')} canEditIssueDate={false} />;
}
