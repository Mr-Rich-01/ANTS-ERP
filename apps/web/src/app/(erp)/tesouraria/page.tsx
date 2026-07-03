import { forCompany } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
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

function fmtCivilDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
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
  const currentDate = civilDateInTimeZone();

  const accountViews: AccountView[] = accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, typeLabel: TYPE_LABEL[a.type] ?? a.type, reference: a.reference ?? '', balance: a.balance, balanceStr: fmt(a.balance), allowNegative: a.allowNegative, status: a.status }));
  const transferDetailsByOutMovement = new Map<string, MovementView['transferReversal']>();
  const transferGroups = new Map<string, typeof movements>();
  for (const m of movements) {
    if (m.transferId && m.source === 'TRANSFER') {
      transferGroups.set(m.transferId, [...(transferGroups.get(m.transferId) ?? []), m]);
    }
  }
  for (const [transferId, legs] of transferGroups) {
    const out = legs.find((m) => m.flow === 'OUT');
    const inn = legs.find((m) => m.flow === 'IN');
    if (!out || !inn || legs.length !== 2) continue;
    if (out.status !== 'ACTIVE' || inn.status !== 'ACTIVE') continue;
    if (out.accountId === inn.accountId || out.amount !== inn.amount) continue;
    transferDetailsByOutMovement.set(out.id, {
      transferId,
      sourceAccountName: out.accountName,
      destinationAccountName: inn.accountName,
      amountStr: fmt(out.amount),
      originalDate: fmtDateTime(out.occurredAt),
      reversalDate: currentDate,
      reversalDateLabel: fmtCivilDate(currentDate),
      sourceImpact: `+ ${fmt(out.amount)}`,
      destinationImpact: `− ${fmt(inn.amount)}`,
    });
  }
  const movementViews: MovementView[] = movements.map((m) => ({
    id: m.id,
    when: fmtDateTime(m.occurredAt),
    accountId: m.accountId,
    accountName: m.accountName,
    category: m.category,
    description: m.description ?? '—',
    document: m.document ?? '',
    transferId: m.transferId,
    source: m.source,
    amountStr: `${m.flow === 'IN' ? '+ ' : '− '}${fmt(m.amount)}`,
    amountColor: m.flow === 'IN' ? 'var(--ok)' : 'var(--bad)',
    status: m.status,
    reversal: m.source === 'REVERSAL',
    reversalReason: m.reversalReason,
    reversalBlockedReason: m.reversalBlockedReason,
    reversible: m.status === 'ACTIVE' && !m.reversalBlockedReason,
    transferReversal: transferDetailsByOutMovement.get(m.id) ?? null,
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
        reverseTransfer: hasPermission(ctx, 'treasury.reverseTransfer'),
        viewReports: hasPermission(ctx, 'treasury.viewReports'),
      }}
    />
  );
}
