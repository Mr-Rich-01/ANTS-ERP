import { NoPermission } from '@/components/NoPermission';
import { forCompany } from '@ants/database';
import { hasPermission, invoiceKpis, listInvoices } from '@ants/domain';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import { FacturasClient, type InvoiceRow, type StatCard } from './FacturasClient';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default async function FacturasPage() {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver as facturas.
      </div>
    );
  }
  if (!hasPermission(ctx, 'sales.view')) return <NoPermission message="Não tem permissão para ver as facturas." />;

  const db = forCompany(ctx.companyId);
  const [invoices, kpi] = await Promise.all([listInvoices(db, ctx), invoiceKpis(db, ctx)]);

  const rows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    customerName: i.customerName,
    customerNuit: i.customerNuit ?? '—',
    dateStr: fmtDate(i.issueDate),
    dueStr: fmtDate(i.dueDate),
    totalStr: fmt(i.total),
    status: i.displayStatus,
  }));

  const stats: StatCard[] = [
    { label: 'Total facturado', value: fmt(kpi.invoiced), color: 'var(--text)', sub: `${kpi.count} ${kpi.count === 1 ? 'documento' : 'documentos'}` },
    { label: 'Recebido', value: fmt(kpi.received), color: 'var(--ok)', sub: 'em recibos' },
    { label: 'Pendente', value: fmt(kpi.pending), color: 'var(--warn)', sub: 'por receber (a prazo)' },
    { label: 'Vencido', value: fmt(kpi.overdue), color: 'var(--bad)', sub: 'em atraso' },
  ];

  return <FacturasClient stats={stats} rows={rows} totalStr={fmt(kpi.invoiced)} canCreate={hasPermission(ctx, 'sales.create')} />;
}
