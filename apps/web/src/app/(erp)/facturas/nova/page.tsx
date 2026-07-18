import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { getInvoiceDraftForEdit, hasPermission, listWarehouses, searchCustomerOptions, searchProductOptions, DomainError } from '@ants/domain';
import { getContext } from '@/lib/session';
import { NovaFacturaClient, type CustomerOpt, type DraftOpt, type ProductOpt, type WarehouseOpt } from './NovaFacturaClient';

export const dynamic = 'force-dynamic';

export default async function NovaFacturaPage({ searchParams }: { searchParams: { rascunho?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.create')) redirect('/facturas');

  const db = forCompany(ctx.companyId);
  // Apenas as primeiras opções — o resto chega por pesquisa server-side (S2).
  const [customers, products, warehouses] = await Promise.all([
    searchCustomerOptions(db, ctx, { onlyActive: true }),
    searchProductOptions(db, ctx),
    listWarehouses(db, ctx),
  ]);

  // Edição de rascunho (S6): carrega o rascunho para o mesmo formulário.
  let draft: DraftOpt | null = null;
  if (searchParams.rascunho) {
    try {
      const d = await getInvoiceDraftForEdit(db, ctx, searchParams.rascunho);
      draft = {
        id: d.id,
        number: d.number,
        customerId: d.customerId,
        customerName: d.customerName,
        customerNuit: d.customerNuit ?? '',
        customerPhone: d.customerPhone ?? '',
        warehouseId: d.warehouseId,
        paymentMethod: d.paymentMethod,
        notes: d.notes ?? '',
        lines: d.lines,
      };
    } catch (e) {
      if (e instanceof DomainError) redirect(`/facturas/documento?id=${searchParams.rascunho}`);
      throw e;
    }
  }

  const customerOpts: CustomerOpt[] = customers.map((c) => ({ id: c.id, name: c.name, nuit: c.nuit, phone: c.phone }));
  const productOpts: ProductOpt[] = products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: p.salePrice, stock: p.stock }));
  const warehouseOpts: WarehouseOpt[] = warehouses.map((w) => ({ id: w.id, label: `${w.name} (${w.code})` }));

  return <NovaFacturaClient customers={customerOpts} products={productOpts} warehouses={warehouseOpts} canDiscount={hasPermission(ctx, 'sales.approve_discount')} canEditIssueDate={false} draft={draft} />;
}
