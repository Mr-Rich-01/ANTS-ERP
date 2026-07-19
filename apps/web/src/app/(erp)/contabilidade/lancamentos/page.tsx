import Link from 'next/link';
import { forCompany } from '@ants/database';
import { getAccountingReportOptions, hasPermission, listJournalEntries } from '@ants/domain';
import { Icon } from '@/components/Icon';
import { NoPermission } from '@/components/NoPermission';
import { getContext } from '@/lib/session';
import { LancamentosClient } from './LancamentosClient';

export const dynamic = 'force-dynamic';

/**
 * Lançamentos manuais (S10c) — o domínio é o da Fase 8b:
 * rascunho (`accounting.prepare`) → confirmação (`accounting.post`) → estorno
 * (`accounting.reverse`). A página só orquestra; validações e mensagens vêm do domínio.
 */
export default async function LancamentosManuaisPage() {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'accounting.view')) {
    return <NoPermission message="Nao tem permissao para ver a contabilidade." />;
  }

  const db = forCompany(ctx.companyId);
  const [options, manualEntries] = await Promise.all([
    getAccountingReportOptions(db, ctx),
    listJournalEntries(db, ctx, { manualOnly: true, includeLines: true, limit: 100 }),
  ]);

  const drafts = manualEntries.filter((e) => e.status === 'DRAFT');
  const posted = manualEntries.filter((e) => e.status !== 'DRAFT');

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 9, borderRadius: 10, display: 'inline-flex' }}>
          <Icon name="pen-line" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Lançamentos manuais</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 4 }}>
            Rascunho → confirmação por partidas dobradas → estorno. Rascunhos não afectam saldos; a numeração definitiva é atribuída na confirmação.
          </div>
        </div>
        <Link href="/contabilidade" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
          <Icon name="book-open" size={14} />
          Extrato Diário
        </Link>
        {hasPermission(ctx, 'accounting.post') ? (
          <Link href="/contabilidade/regularizacao" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
            <Icon name="scale" size={14} />
            Regularização de existências
          </Link>
        ) : null}
      </div>

      <LancamentosClient
        accounts={options.accounts
          .filter((a) => a.isPosting)
          .map((a) => ({ id: a.id, code: a.code, name: a.name, isActive: a.isActive }))}
        journals={options.journals.filter((j) => j.isActive).map((j) => ({ id: j.id, code: j.code, name: j.name }))}
        drafts={drafts}
        posted={posted}
        canPrepare={hasPermission(ctx, 'accounting.prepare')}
        canPost={hasPermission(ctx, 'accounting.post')}
        canReverse={hasPermission(ctx, 'accounting.reverse')}
      />
    </div>
  );
}
