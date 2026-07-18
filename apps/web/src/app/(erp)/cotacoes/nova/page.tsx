import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { hasPermission, searchCustomerOptions, searchProductOptions } from '@ants/domain';
import { getContext } from '@/lib/session';
import { NovaCotacaoClient, type CustomerOpt, type ProductOpt } from './NovaCotacaoClient';

export const dynamic = 'force-dynamic';

export default async function NovaCotacaoPage() {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.create')) redirect('/cotacoes');

  const db = forCompany(ctx.companyId);
  // Apenas as primeiras opções — o resto chega por pesquisa server-side (S2).
  const [customers, products] = await Promise.all([
    searchCustomerOptions(db, ctx, { onlyActive: true }),
    searchProductOptions(db, ctx),
  ]);

  const customerOpts: CustomerOpt[] = customers.map((c) => ({ id: c.id, name: c.name, nuit: c.nuit, phone: c.phone }));
  const productOpts: ProductOpt[] = products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, price: p.salePrice }));

  return <NovaCotacaoClient customers={customerOpts} products={productOpts} canDiscount={hasPermission(ctx, 'sales.approve_discount')} />;
}
