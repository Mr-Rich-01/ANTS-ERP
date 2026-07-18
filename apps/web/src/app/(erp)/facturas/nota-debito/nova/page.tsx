import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { hasPermission, searchCustomerOptions } from '@ants/domain';
import { getContext } from '@/lib/session';
import { NovaNotaDebitoClient, type CustomerOpt, type LinkedInvoice } from './NovaNotaDebitoClient';

export const dynamic = 'force-dynamic';

export default async function NovaNotaDebitoPage({ searchParams }: { searchParams: { invoiceId?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.create')) redirect('/facturas');

  const db = forCompany(ctx.companyId);
  const customers = await searchCustomerOptions(db, ctx, { onlyActive: true });
  const customerOpts: CustomerOpt[] = customers.map((c) => ({ id: c.id, name: c.name, nuit: c.nuit }));

  // Referência opcional a uma factura (pré-preenche e fixa o cliente).
  let linkedInvoice: LinkedInvoice | null = null;
  if (searchParams.invoiceId) {
    const invoice = await db.invoice.findFirst({
      where: { id: searchParams.invoiceId },
      select: { id: true, number: true, customerId: true, customerName: true, customerNuit: true, status: true },
    });
    if (invoice && invoice.status !== 'CANCELLED' && invoice.status !== 'DRAFT') {
      linkedInvoice = { id: invoice.id, number: invoice.number, customerId: invoice.customerId, customerName: invoice.customerName, customerNuit: invoice.customerNuit ?? '' };
    }
  }

  return <NovaNotaDebitoClient customers={customerOpts} linkedInvoice={linkedInvoice} />;
}
