import { NoPermission } from '@/components/NoPermission';
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
  if (!hasPermission(ctx, 'purchases.create')) return <NoPermission message="Não tem permissão para ver as compras." />;

  const db = forCompany(ctx.companyId);
  const [orders, kpi] = await Promise.all([listPurchaseOrders(db, ctx), purchaseKpis(db, ctx)]);

  const canApprove = hasPermission(ctx, 'purchases.approve');
  const rows: PoRow[] = orders.map((o) => ({
    id: o.id,
    number: o.number,
    supplierName: o.supplierName,
    supplierNuit: o.supplierNuit ?? '—',
    dateStr: fmtDate(o.orderDate),
    etaStr: fmtDate(o.expectedDate),
    totalStr: fmt(o.total),
    status: o.status,
    mineApproved: o.status === 'APPROVED' && o.createdBy === ctx.userId,
    approvedByName: o.approvedByName,
    rejectionReason: o.rejectionReason,
  }));
  const totalStr = fmt(orders.reduce((a, o) => a + o.total, 0));
  const myApprovedCount = rows.filter((r) => r.mineApproved).length;

  const kpis: KpiCardData[] = [
    { label: 'Contas a pagar', valueStr: fmt(kpi.payable), tone: 'red', icon: 'arrow-up-right', sub: 'saldo de fornecedores' },
    { label: 'Aguardam aprovação', valueStr: String(kpi.pendingApproval), tone: 'amber', icon: 'clock', sub: 'por aprovar (Gestor)' },
    { label: 'Por receber', valueStr: String(kpi.toReceive), tone: 'blue', icon: 'package-check', sub: 'aprovadas, aguardam recepção' },
    { label: 'Total de ordens', valueStr: String(kpi.count), tone: 'petroleum', icon: 'file-text', sub: 'no total' },
  ];

  return (
    <ComprasClient
      kpis={kpis}
      rows={rows}
      totalStr={totalStr}
      canCreate={hasPermission(ctx, 'purchases.create')}
      canApprove={canApprove}
      pendingApprovalCount={kpi.pendingApproval}
      myApprovedCount={myApprovedCount}
    />
  );
}
