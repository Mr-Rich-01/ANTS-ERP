import { forCompany } from '@ants/database';
import { hasPermission, listAccounts, listMovements, treasuryKpis } from '@ants/domain';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import type { KpiCardData } from '@/components/ui/KpiCard';
import { NoPermission } from '@/components/NoPermission';
import { TesourariaClient, type AccountView, type MovementView } from './TesourariaClient';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = { CASH: 'Caixa', BANK: 'Conta bancária', MOBILE: 'Carteira móvel', OTHER: 'Outra' };

function fmtDateTime(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default async function TesourariaPage() {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver a tesouraria.
      </div>
    );
  }
  if (!hasPermission(ctx, 'treasury.view')) return <NoPermission message="Não tem permissão para ver a tesouraria." />;

  const db = forCompany(ctx.companyId);
  // Inclui contas inactivas (extracto histórico); os selectores de movimento usam só activas.
  const [accounts, movements, kpi] = await Promise.all([listAccounts(db, ctx, true), listMovements(db, ctx, { limit: 30 }), treasuryKpis(db, ctx)]);

  const accountViews: AccountView[] = accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, typeLabel: TYPE_LABEL[a.type] ?? a.type, reference: a.reference ?? '', balanceStr: fmt(a.balance), status: a.status }));
  const movementViews: MovementView[] = movements.map((m) => ({
    id: m.id,
    when: fmtDateTime(m.occurredAt),
    accountName: m.accountName,
    category: m.category,
    description: m.description ?? '—',
    document: m.document ?? '',
    amountStr: `${m.flow === 'IN' ? '+ ' : '− '}${fmt(m.amount)}`,
    amountColor: m.flow === 'IN' ? 'var(--ok)' : 'var(--bad)',
    status: m.status,
    reversal: m.source === 'REVERSAL',
    reversible: m.status === 'ACTIVE' && m.source !== 'REVERSAL',
  }));

  const kpis: KpiCardData[] = [
    { label: 'Caixa disponível', valueStr: fmt(kpi.cashTotal), tone: 'petroleum', icon: 'wallet', sub: 'numerário', valueColor: 'var(--text)' },
    { label: 'Total em bancos', valueStr: fmt(kpi.bankTotal), tone: 'blue', icon: 'landmark', sub: 'contas e carteiras', valueColor: 'var(--text)' },
    { label: 'Entradas hoje', valueStr: fmt(kpi.todayIn), tone: 'green', icon: 'arrow-down-left', sub: 'movimentos do dia', valueColor: 'var(--ok)' },
    { label: 'Saídas hoje', valueStr: fmt(kpi.todayOut), tone: 'red', icon: 'arrow-up-right', sub: 'movimentos do dia', valueColor: 'var(--bad)' },
  ];

  return (
    <TesourariaClient
      kpis={kpis}
      accounts={accountViews}
      movements={movementViews}
      perms={{
        createMovement: hasPermission(ctx, 'treasury.createMovement'),
        transfer: hasPermission(ctx, 'treasury.transfer'),
        manageAccounts: hasPermission(ctx, 'treasury.manageAccounts'),
        reverse: hasPermission(ctx, 'treasury.reverseMovement'),
        viewReports: hasPermission(ctx, 'treasury.viewReports'),
      }}
    />
  );
}
