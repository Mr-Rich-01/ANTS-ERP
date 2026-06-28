import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { customerKpis, hasPermission, listCustomers, type AccountState } from '@ants/domain';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import { initials } from '@/lib/ui-format';
import type { KpiCardData } from '@/components/ui/KpiCard';
import { ClientesClient, type ClientRow } from './ClientesClient';

export const dynamic = 'force-dynamic';

const STATE_STYLE: Record<AccountState, { label: string; color: string; bg: string }> = {
  devedor: { label: 'Com dívida', color: 'var(--bad)', bg: 'var(--bad-bg)' },
  credor: { label: 'Saldo a favor', color: 'var(--info)', bg: 'var(--info-bg)' },
  regular: { label: 'Regularizado', color: 'var(--ok)', bg: 'var(--ok-bg)' },
};

export default async function ClientesPage() {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver os clientes.
      </div>
    );
  }
  if (!hasPermission(ctx, 'clients.view')) redirect('/');

  const db = forCompany(ctx.companyId);
  const [customers, kpi] = await Promise.all([listCustomers(db, ctx), customerKpis(db, ctx)]);

  const rows: ClientRow[] = customers.map((c) => {
    const st =
      c.status === 'INACTIVE'
        ? { label: 'Inactivo', color: 'var(--text2)', bg: 'var(--bd-soft)' }
        : STATE_STYLE[c.accountState];
    return {
      id: c.id,
      name: c.name,
      ini: initials(c.name),
      nuit: c.nuit ?? '—',
      phone: c.phone ?? '—',
      balStr: fmt(c.balance),
      balColor: c.balance > 0 ? 'var(--bad)' : c.balance < 0 ? 'var(--info)' : 'var(--text3)',
      statusLabel: st.label,
      statusColor: st.color,
      statusBg: st.bg,
    };
  });

  const kpis: KpiCardData[] = [
    { label: 'Total de clientes', valueStr: String(kpi.total), tone: 'petroleum', icon: 'users', sub: `${kpi.newThisMonth} novos no mês` },
    { label: 'Contas a receber', valueStr: fmt(kpi.receivable), tone: 'amber', icon: 'arrow-down-left', sub: `${kpi.withDebt} ${kpi.withDebt === 1 ? 'cliente' : 'clientes'} com dívida` },
    { label: 'Clientes com dívida', valueStr: String(kpi.withDebt), tone: 'red', icon: 'alert-triangle', sub: `${fmt(kpi.receivable)} em aberto` },
    { label: 'Novos no mês', valueStr: String(kpi.newThisMonth), tone: 'green', icon: 'user-plus', sub: 'este mês' },
  ];

  return <ClientesClient kpis={kpis} rows={rows} canCreate={hasPermission(ctx, 'clients.create')} />;
}
