import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { hasPermission, listWarehouses, searchCustomerOptions } from '@ants/domain';
import { NoPermission } from '@/components/NoPermission';
import { getContext } from '@/lib/session';
import { PosClient, type PosCustomerOpt, type PosProductOpt, type PosWarehouseOpt } from './PosClient';

export const dynamic = 'force-dynamic';

export default async function PosPage() {
  const ctx = await getContext();
  if (!ctx.companyId) redirect('/login');

  const canSell = hasPermission(ctx, 'sales.create');
  const canReceive = hasPermission(ctx, 'payments.receive');
  const canViewStock = hasPermission(ctx, 'stock.view');
  const canViewTreasury = hasPermission(ctx, 'treasury.view');
  if (!canSell || !canReceive || !canViewStock || !canViewTreasury) {
    return <NoPermission message="Para usar o POS precisa de permissões para vender, receber pagamentos, ver stock e ver tesouraria." />;
  }

  const db = forCompany(ctx.companyId);
  const canViewCustomers = hasPermission(ctx, 'clients.view');
  // Clientes: apenas as primeiras opções — o resto chega por pesquisa server-side (S2).
  const [customers, warehouses, products] = await Promise.all([
    canViewCustomers ? searchCustomerOptions(db, ctx, { onlyActive: true }) : Promise.resolve([]),
    listWarehouses(db, ctx),
    db.product.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      include: { stockLevels: { select: { warehouseId: true, quantity: true } } },
    }),
  ]);

  const customerOpts: PosCustomerOpt[] = customers.map((c) => ({ id: c.id, name: c.name, nuit: c.nuit, phone: c.phone }));
  const warehouseOpts: PosWarehouseOpt[] = warehouses.map((w) => ({ id: w.id, label: `${w.name} (${w.code})` }));
  const productOpts: PosProductOpt[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category ?? 'Sem categoria',
    price: Number(p.salePrice),
    taxRate: Number(p.taxRate),
    stockByWarehouse: p.stockLevels.map((s) => ({ warehouseId: s.warehouseId, quantity: s.quantity })),
  }));

  return (
    <PosClient
      customers={customerOpts}
      warehouses={warehouseOpts}
      products={productOpts}
      canSelectCustomer={canViewCustomers}
    />
  );
}
