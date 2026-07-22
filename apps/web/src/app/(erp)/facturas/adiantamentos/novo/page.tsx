import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { hasPermission, listAccounts, searchCustomerOptions } from '@ants/domain';
import { NoPermission } from '@/components/NoPermission';
import { getContext } from '@/lib/session';
import { NovoAdiantamentoClient } from './NovoAdiantamentoClient';

export const dynamic = 'force-dynamic';

/** Novo Recibo de Adiantamento (S17): dinheiro recebido sem factura. */
export default async function NovoAdiantamentoPage({ searchParams }: { searchParams: { cliente?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId) redirect('/facturas/adiantamentos');
  if (!hasPermission(ctx, 'payments.receive')) {
    return <NoPermission message="Não tem permissão para registar adiantamentos." />;
  }

  const db = forCompany(ctx.companyId);
  const canPickCustomer = hasPermission(ctx, 'clients.view');
  const [customers, accounts] = await Promise.all([
    canPickCustomer ? searchCustomerOptions(db, ctx, { take: 20 }) : Promise.resolve([]),
    hasPermission(ctx, 'treasury.view')
      ? listAccounts(db, ctx).then((all) => all.filter((a) => a.status === 'ACTIVE').map((a) => ({ id: a.id, label: a.name })))
      : Promise.resolve([]),
  ]);
  const preselected = searchParams.cliente && canPickCustomer
    ? (await searchCustomerOptions(db, ctx, { ids: [searchParams.cliente] }))[0] ?? null
    : null;

  return (
    <NovoAdiantamentoClient
      customers={customers.map((c) => ({ id: c.id, name: c.name, nuit: c.nuit ?? '' }))}
      accounts={accounts}
      preselectedCustomer={preselected ? { id: preselected.id, name: preselected.name } : null}
    />
  );
}
