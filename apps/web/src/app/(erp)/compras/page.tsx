import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { hasPermission, listPurchaseOrders, purchaseKpis } from '@ants/domain';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import type { KpiCardData } from '@/components/ui/KpiCard';
import { ComprasClient, type PoRow } from './ComprasClient';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default async function ComprasPage() {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver as compras.
      </div>
    );
  }
  if (!hasPermission(ctx, 'purchases.create')) redirect('/');

  const db = forCompany(ctx.companyId);
  const [orders, kpi] = await Promise.all([listPurchaseOrders(db, ctx), purchaseKpis(db, ctx)]);

  const rows: PoRow[] = orders.map((o) => ({
    id: o.id,
    number: o.number,
    supplierName: o.supplierName,
    supplierNuit: o.supplierNuit ?? '—',
    dateStr: fmtDate(o.orderDate),
    etaStr: fmtDate(o.expectedDate),
    totalStr: fmt(o.total),
    status: o.status,
  }));
  const totalStr = fmt(orders.reduce((a, o) => a + o.total, 0));

  const kpis: KpiCardData[] = [
    { label: 'Contas a pagar', valueStr: fmt(kpi.payable), tone: 'red', icon: 'arrow-up-right', sub: 'saldo de fornecedores' },
    { label: 'Ordens em aberto', valueStr: String(kpi.openOrders), tone: 'amber', icon: 'clock', sub: 'aguardam recepção' },
    { label: 'Por receber', valueStr: String(kpi.toReceive), tone: 'blue', icon: 'package-check', sub: 'recepções pendentes' },
    { label: 'Total de ordens', valueStr: String(kpi.count), tone: 'petroleum', icon: 'file-text', sub: 'no total' },
  ];

  return <ComprasClient kpis={kpis} rows={rows} totalStr={totalStr} canCreate={hasPermission(ctx, 'purchases.create')} />;
}
