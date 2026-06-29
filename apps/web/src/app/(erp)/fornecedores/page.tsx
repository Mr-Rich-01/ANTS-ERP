import { NoPermission } from '@/components/NoPermission';
import { forCompany } from '@ants/database';
import { hasPermission, listSuppliers, supplierKpis, type PayableState } from '@ants/domain';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import { initials } from '@/lib/ui-format';
import type { KpiCardData } from '@/components/ui/KpiCard';
import { FornecedoresClient, type SupplierRow } from './FornecedoresClient';

export const dynamic = 'force-dynamic';

const STATE_STYLE: Record<PayableState, { label: string; color: string; bg: string }> = {
  pagar: { label: 'A pagar', color: 'var(--bad)', bg: 'var(--bad-bg)' },
  adiantamento: { label: 'Adiantamento', color: 'var(--info)', bg: 'var(--info-bg)' },
  regular: { label: 'Regularizado', color: 'var(--ok)', bg: 'var(--ok-bg)' },
};

export default async function FornecedoresPage() {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver os fornecedores.
      </div>
    );
  }
  if (!hasPermission(ctx, 'suppliers.view')) return <NoPermission message="Não tem permissão para ver fornecedores." />;

  const db = forCompany(ctx.companyId);
  const [suppliers, kpi] = await Promise.all([listSuppliers(db, ctx), supplierKpis(db, ctx)]);

  const rows: SupplierRow[] = suppliers.map((s) => {
    const st =
      s.status === 'INACTIVE'
        ? { label: 'Inactivo', color: 'var(--text2)', bg: 'var(--bd-soft)' }
        : STATE_STYLE[s.payableState];
    return {
      id: s.id,
      name: s.name,
      ini: initials(s.name),
      nuit: s.nuit ?? '—',
      phone: s.phone ?? '—',
      balStr: fmt(s.balance),
      balColor: s.balance > 0 ? 'var(--bad)' : s.balance < 0 ? 'var(--info)' : 'var(--text3)',
      statusLabel: st.label,
      statusColor: st.color,
      statusBg: st.bg,
    };
  });

  const kpis: KpiCardData[] = [
    { label: 'Total de fornecedores', valueStr: String(kpi.total), tone: 'petroleum', icon: 'building', sub: `${kpi.newThisMonth} novos no mês` },
    { label: 'Contas a pagar', valueStr: fmt(kpi.payable), tone: 'red', icon: 'arrow-up-right', sub: `${kpi.withPayable} ${kpi.withPayable === 1 ? 'fornecedor' : 'fornecedores'} a pagar` },
    { label: 'Com saldo a pagar', valueStr: String(kpi.withPayable), tone: 'amber', icon: 'clock', sub: `${fmt(kpi.payable)} em aberto` },
    { label: 'Novos no mês', valueStr: String(kpi.newThisMonth), tone: 'green', icon: 'plus', sub: 'este mês' },
  ];

  return <FornecedoresClient kpis={kpis} rows={rows} canCreate={hasPermission(ctx, 'suppliers.create')} />;
}
