import Link from 'next/link';
import { forCompany } from '@ants/database';
import {
  accountingEventLabel,
  accountingJournalTypeLabel,
  accountingSourceTypeLabel,
  getAccountLedgerReport,
  getAccountingJournalReport,
  getAccountingReportOptions,
  getCompanyPrintProfile,
  getTrialBalanceReport,
  hasPermission,
  journalEntryStatusLabel,
  ledgerAccountTypeLabel,
  normalBalanceLabel,
  type AccountingJournalType,
  type AccountingReportFilters,
  type AccountingReportStatusFilter,
  type JournalEntryStatus,
  type NormalBalance,
} from '@ants/domain';
import { Icon } from '@/components/Icon';
import { NoPermission } from '@/components/NoPermission';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter } from '@/components/print/PrintLayout';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import { fmt, fmtNoSymbol } from '@/lib/format';
import { getContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
type ReportView = 'journal' | 'ledger' | 'trial-balance';
type View = 'chart' | ReportView;

const pageWrap: React.CSSProperties = { padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 16 };
const panel: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' };
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', background: 'var(--card2)', borderBottom: '1px solid var(--bd-soft)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: 'var(--text2)', borderTop: '1px solid var(--bd-soft2)', verticalAlign: 'top' };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '0 10px', fontSize: 12.5, outline: 'none', minWidth: 0 };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' };
const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function clean(v: string | undefined): string | undefined {
  const value = v?.trim();
  return value ? value : undefined;
}

function todayYearRange() {
  const year = new Date().getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function viewFromSearch(searchParams: Search): View {
  const v = one(searchParams.view);
  return v === 'chart' || v === 'ledger' || v === 'trial-balance' ? v : 'journal';
}

function statusFromSearch(value: string | undefined): AccountingReportStatusFilter | undefined {
  if (value === 'DRAFT' || value === 'POSTED' || value === 'REVERSED' || value === 'POSTED_AND_REVERSED') return value;
  return undefined;
}

function journalTypeFromSearch(value: string | undefined): AccountingJournalType | undefined {
  const allowed = ['GENERAL', 'SALES', 'PURCHASES', 'CASH', 'BANK', 'PAYROLL', 'ADJUSTMENT', 'OPENING'];
  return allowed.includes(value ?? '') ? (value as AccountingJournalType) : undefined;
}

function filtersFromSearch(searchParams: Search): AccountingReportFilters {
  const fallback = todayYearRange();
  return {
    from: clean(one(searchParams.from)) ?? fallback.from,
    to: clean(one(searchParams.to)) ?? fallback.to,
    ledgerAccountId: clean(one(searchParams.account)),
    journalId: clean(one(searchParams.journal)),
    sourceType: clean(one(searchParams.source)),
    journalType: journalTypeFromSearch(clean(one(searchParams.type))),
    status: statusFromSearch(clean(one(searchParams.status))),
    q: clean(one(searchParams.q)),
  };
}

function appendFilters(qs: URLSearchParams, view: View, filters: AccountingReportFilters, selectedAccountId?: string) {
  qs.set('view', view);
  if (filters.from) qs.set('from', filters.from);
  if (filters.to) qs.set('to', filters.to);
  if (selectedAccountId) qs.set('account', selectedAccountId);
  if (filters.journalId) qs.set('journal', filters.journalId);
  if (filters.sourceType) qs.set('source', filters.sourceType);
  if (filters.journalType) qs.set('type', filters.journalType);
  if (filters.status) qs.set('status', filters.status);
  if (filters.q) qs.set('q', filters.q);
}

function viewHref(view: View, filters: AccountingReportFilters, selectedAccountId?: string): string {
  const qs = new URLSearchParams();
  appendFilters(qs, view, filters, selectedAccountId);
  return `/contabilidade?${qs.toString()}`;
}

function exportHref(kind: ReportView, filters: AccountingReportFilters, selectedAccountId?: string): string {
  const qs = new URLSearchParams();
  qs.set('kind', kind);
  appendFilters(qs, kind, filters, selectedAccountId);
  return `/contabilidade/exportar?${qs.toString()}`;
}

function datePt(value: string | null | undefined): string {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function sourceLabel(value: string | null | undefined): string {
  return accountingSourceTypeLabel(value);
}

function statusLabel(status: JournalEntryStatus): string {
  return journalEntryStatusLabel(status);
}

function balanceMoneyLabel(value: number): string {
  return fmt(Math.abs(value));
}

function balanceNatureText(value: number, normalBalance?: NormalBalance): string {
  if (value === 0) return 'Sem saldo';
  const isCreditNature = normalBalance === 'CREDIT';
  return isCreditNature ? (value >= 0 ? 'Credor' : 'Devedor') : value >= 0 ? 'Devedor' : 'Credor';
}

function balanceValue(value: number, normalBalance?: NormalBalance) {
  return (
    <>
      <span>{balanceMoneyLabel(value)}</span>
      {value !== 0 ? <><br /><span style={{ color: 'var(--text3)', fontSize: 11 }}>{balanceNatureText(value, normalBalance)}</span></> : null}
    </>
  );
}

function generatedAt(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ ...td, padding: '28px 12px', textAlign: 'center', color: 'var(--text3)' }}>{message}</td>
    </tr>
  );
}

function TabLink({ href, active, icon, label }: { href: string; active: boolean; icon: string; label: string }) {
  return (
    <Link href={href} style={{ ...actionBtn, height: 34, background: active ? ACCENT : 'var(--card)', color: active ? '#fff' : 'var(--text2)', borderColor: active ? ACCENT : 'var(--border)' }}>
      <Icon name={icon} size={14} />
      {label}
    </Link>
  );
}

export default async function ContabilidadePage({ searchParams }: { searchParams: Search }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'accounting.view')) {
    return <NoPermission message="Nao tem permissao para ver a contabilidade." />;
  }

  const db = forCompany(ctx.companyId);
  const filters = filtersFromSearch(searchParams);
  const view = viewFromSearch(searchParams);
  const [options, journal, trial, company] = await Promise.all([
    getAccountingReportOptions(db, ctx),
    getAccountingJournalReport(db, ctx, filters),
    getTrialBalanceReport(db, ctx, filters),
    getCompanyPrintProfile(db, ctx),
  ]);
  const selectedAccountId = filters.ledgerAccountId ?? options.accounts.find((a) => a.isPosting && a.isActive)?.id ?? options.accounts[0]?.id;
  const ledger = selectedAccountId ? await getAccountLedgerReport(db, ctx, selectedAccountId, filters) : null;
  const activeAccount = ledger?.account ?? options.accounts.find((a) => a.id === selectedAccountId) ?? null;
  const canExport = hasPermission(ctx, 'reports.export');
  const periodLabel = `${datePt(journal.filters.from)} a ${datePt(journal.filters.to)}`;
  const accountById = new Map(options.accounts.map((account) => [account.id, account]));
  const trialByAccountId = new Map(trial.rows.map((row) => [row.accountId, row]));
  const journalTypeOptions: AccountingJournalType[] = ['GENERAL', 'SALES', 'PURCHASES', 'CASH', 'BANK', 'ADJUSTMENT', 'OPENING'];
  const trialStatus = trial.isGlobalBalanceCheckAvailable
    ? {
        value: trial.isBalanced ? 'OK' : 'Erro',
        label: trial.isBalanced ? 'Debito = credito' : 'Debito diferente de credito',
        tone: trial.isBalanced ? ('green' as const) : ('amber' as const),
        color: trial.isBalanced ? 'var(--ok)' : 'var(--bad)',
        background: trial.isBalanced ? 'var(--ok-bg)' : 'var(--bad-bg)',
      }
    : {
        value: 'Filtrado',
        label: 'Validacao global indisponivel com filtro de conta',
        tone: 'blue' as const,
        color: 'var(--info)',
        background: 'var(--info-bg)',
      };

  const kpis = [
    { label: 'Debitos do periodo', valueStr: fmt(journal.totalDebit), sub: `${journal.lines.length} linhas no extrato diario`, tone: 'petroleum' as const, icon: 'arrow-down-left' },
    { label: 'Creditos do periodo', valueStr: fmt(journal.totalCredit), sub: journal.isBalanced ? 'Extrato diario balanceado' : 'Verificar inconsistencias', tone: journal.isBalanced ? ('green' as const) : ('amber' as const), icon: 'arrow-up-right' },
    { label: 'Contas movimentadas', valueStr: String(trial.rows.length), sub: trial.movementCount ? 'Com movimentos reais' : 'Sem movimentos no periodo', tone: 'blue' as const, icon: 'landmark' },
    { label: 'Balancete', valueStr: trialStatus.value, sub: trialStatus.label, tone: trialStatus.tone, icon: 'scale' },
  ];

  return (
    <div style={pageWrap}>
      <div className="ants-noprint" style={{ ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 9, borderRadius: 10, display: 'inline-flex' }}>
            <Icon name="book-open" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Contabilidade V1</div>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 4 }}>Plano de contas, extrato diario, razao e balancete com dados reais - {periodLabel}</div>
          </div>
          <PrintButton label="Imprimir / Guardar PDF" />
          {canExport && view !== 'chart' ? (
            <Link href={exportHref(view, filters, selectedAccountId)} style={actionBtn}>
              <Icon name="download" size={14} />
              CSV
            </Link>
          ) : (
            <span style={{ ...actionBtn, opacity: 0.55, cursor: 'not-allowed' }}>
              <Icon name="download" size={14} />
              {view === 'chart' ? 'CSV nos relatorios' : 'CSV sem permissao'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <TabLink href={viewHref('chart', filters, selectedAccountId)} active={view === 'chart'} icon="landmark" label="Plano de contas" />
          <TabLink href={viewHref('journal', filters, selectedAccountId)} active={view === 'journal'} icon="book-open" label="Extrato Diario" />
          <TabLink href={viewHref('ledger', filters, selectedAccountId)} active={view === 'ledger'} icon="list-tree" label="Razao / Extracto" />
          <TabLink href={viewHref('trial-balance', filters, selectedAccountId)} active={view === 'trial-balance'} icon="scale" label="Balancete" />
        </div>

        <form method="get" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, alignItems: 'end' }}>
          <input type="hidden" name="view" value={view} />
          <label style={labelStyle}>
            Data inicial
            <input type="date" name="from" defaultValue={journal.filters.from} style={field} />
          </label>
          <label style={labelStyle}>
            Data final
            <input type="date" name="to" defaultValue={journal.filters.to} style={field} />
          </label>
          <label style={labelStyle}>
            Conta
            <select name="account" defaultValue={selectedAccountId ?? ''} style={field}>
              <option value="">Todas</option>
              {options.accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.code} - {account.name}{account.isActive ? '' : ' (inactiva)'}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Diario
            <select name="journal" defaultValue={filters.journalId ?? ''} style={field}>
              <option value="">Todos</option>
              {options.journals.map((journalOption) => (
                <option key={journalOption.id} value={journalOption.id}>{journalOption.code} - {journalOption.name}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Origem
            <select name="source" defaultValue={filters.sourceType ?? ''} style={field}>
              <option value="">Todas</option>
              {options.sourceTypes.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Tipo
            <select name="type" defaultValue={filters.journalType ?? ''} style={field}>
              <option value="">Todos</option>
              {journalTypeOptions.map((type) => <option key={type} value={type}>{accountingJournalTypeLabel(type)}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Estado
            <select name="status" defaultValue={filters.status ?? ''} style={field}>
              <option value="">Todos</option>
              <option value="POSTED_AND_REVERSED">Confirmados + estornados</option>
              <option value="POSTED">Confirmado</option>
              <option value="REVERSED">Estornado</option>
              <option value="DRAFT">Rascunho</option>
            </select>
          </label>
          <label style={labelStyle}>
            Pesquisa
            <input name="q" defaultValue={filters.q ?? ''} placeholder="Referencia ou descricao" style={field} />
          </label>
          <button type="submit" style={{ ...actionBtn, background: ACCENT, color: '#fff', borderColor: ACCENT }}>
            <Icon name="filter" size={14} />
            Aplicar
          </button>
        </form>
      </div>

      <KpiGrid>
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </KpiGrid>

      <div className="ants-report-print">
        <div className="ants-print-only">
          <CompanyHeader
            company={company}
            title={view === 'chart' ? 'Plano de contas' : view === 'ledger' ? 'Razao / Extracto por conta' : view === 'trial-balance' ? 'Balancete' : 'Extrato Diario'}
            documentNumber={periodLabel}
            meta={<div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.5 }}>Gerado em {generatedAt()}<br />Empresa activa: {company?.legalName ?? ctx.companyId}</div>}
          />
        </div>

        {view === 'chart' ? (
          <div style={panel}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Plano de contas</strong>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Contas reais da empresa activa, com saldo do periodo quando calculavel.</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Conta', 'Nome', 'Tipo', 'Natureza', 'Estado', 'Conta pai', 'Saldo'].map((h) => <th key={h} style={{ ...th, textAlign: h === 'Saldo' ? 'right' : 'left' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {options.accounts.length === 0 ? (
                    <EmptyRow colSpan={7} message="Sem plano de contas configurado para a empresa activa." />
                  ) : options.accounts.map((account) => {
                    const trialRow = trialByAccountId.get(account.id);
                    const parent = account.parentId ? accountById.get(account.parentId) : null;
                    const signedBalance = trialRow ? trialRow.closingDebit - trialRow.closingCredit : 0;
                    return (
                      <tr key={account.id} className="ants-row">
                        <td className="font-mono" style={{ ...td, color: 'var(--accent-fg)', fontWeight: 700, paddingLeft: 12 + Math.max(account.level - 1, 0) * 14 }}>{account.code}</td>
                        <td style={td}>{account.name}</td>
                        <td style={td}>{ledgerAccountTypeLabel(account.accountType)}</td>
                        <td style={td}>{normalBalanceLabel(account.normalBalance)}</td>
                        <td style={td}>{account.isActive ? 'Activa' : 'Inactiva'} · {account.isPosting ? 'Movimento' : 'Agrupadora'}</td>
                        <td style={td}>{parent ? `${parent.code} - ${parent.name}` : '-'}</td>
                        <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: trialRow ? 700 : 500 }}>{trialRow ? balanceValue(signedBalance, account.normalBalance) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {view === 'journal' ? (
          <div style={panel}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Extrato Diario</strong>
              <span style={{ fontSize: 11, fontWeight: 700, color: journal.isBalanced ? 'var(--ok)' : 'var(--bad)', background: journal.isBalanced ? 'var(--ok-bg)' : 'var(--bad-bg)', padding: '3px 8px', borderRadius: 7 }}>
                {journal.isBalanced ? 'Balanceado' : 'Desequilibrado'}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 1060, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Data', 'Numero', 'Origem', 'Estado', 'Conta', 'Descricao', 'Debito', 'Credito', 'Utilizador'].map((h) => <th key={h} style={{ ...th, textAlign: h === 'Debito' || h === 'Credito' ? 'right' : 'left' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {journal.lines.length === 0 ? (
                    <EmptyRow colSpan={9} message="Sem lancamentos para os filtros seleccionados." />
                  ) : journal.lines.map((line) => (
                    <tr key={`${line.entryId}-${line.lineNumber}`} className="ants-row">
                      <td style={td}>{datePt(line.postingDate ?? line.entryDate)}</td>
                      <td className="font-mono" style={{ ...td, color: 'var(--accent-fg)', fontWeight: 700 }}>{line.entryNumber}</td>
                      <td style={td}>{sourceLabel(line.sourceType)}</td>
                      <td style={td}>{statusLabel(line.status)}</td>
                      <td style={td}><span className="font-mono">{line.accountCode}</span><br /><span style={{ color: 'var(--text3)' }}>{line.accountName}</span></td>
                      <td style={td}>{line.lineDescription ?? line.description}<br /><span style={{ color: 'var(--text3)' }}>{line.reference ?? accountingEventLabel(line.accountingEvent)}</span></td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', color: line.debit ? 'var(--text)' : 'var(--text4)', fontWeight: 700 }}>{line.debit ? fmtNoSymbol(line.debit) : '-'}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', color: line.credit ? 'var(--text)' : 'var(--text4)', fontWeight: 700 }}>{line.credit ? fmtNoSymbol(line.credit) : '-'}</td>
                      <td style={td}>{line.postedByName ?? line.postedById ?? '-'}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={6} style={{ ...td, fontWeight: 800, color: 'var(--text)' }}>Totais</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{fmtNoSymbol(journal.totalDebit)}</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{fmtNoSymbol(journal.totalCredit)}</td>
                    <td style={td} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {view === 'ledger' ? (
          <div style={panel}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Razao / extracto por conta</strong>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{activeAccount ? `${activeAccount.code} - ${activeAccount.name}` : 'Sem conta seleccionada'}</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Data', 'Numero', 'Origem', 'Referencia', 'Descricao', 'Debito', 'Credito', 'Saldo acumulado'].map((h) => <th key={h} style={{ ...th, textAlign: ['Debito', 'Credito', 'Saldo acumulado'].includes(h) ? 'right' : 'left' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={7} style={{ ...td, fontWeight: 800, color: 'var(--text)' }}>Saldo inicial</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{ledger ? balanceValue(ledger.openingBalance, ledger.account?.normalBalance) : '-'}</td>
                  </tr>
                  {!ledger || ledger.rows.length === 0 ? (
                    <EmptyRow colSpan={8} message="Sem movimentos para a conta e periodo seleccionados." />
                  ) : ledger.rows.map((row) => (
                    <tr key={`${row.entryId}-${row.date}`} className="ants-row">
                      <td style={td}>{datePt(row.date)}</td>
                      <td className="font-mono" style={{ ...td, color: 'var(--accent-fg)', fontWeight: 700 }}>{row.entryNumber}</td>
                      <td style={td}>{sourceLabel(row.sourceType)}</td>
                      <td style={td}>{row.reference ?? (accountingEventLabel(row.accountingEvent) || '-')}</td>
                      <td style={td}>{row.description}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{row.debit ? fmtNoSymbol(row.debit) : '-'}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{row.credit ? fmtNoSymbol(row.credit) : '-'}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{balanceValue(row.balance, ledger.account?.normalBalance)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} style={{ ...td, fontWeight: 800, color: 'var(--text)' }}>Totais</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{ledger ? fmtNoSymbol(ledger.totalDebit) : '-'}</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{ledger ? fmtNoSymbol(ledger.totalCredit) : '-'}</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{ledger ? balanceValue(ledger.closingBalance, ledger.account?.normalBalance) : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {view === 'trial-balance' ? (
          <div style={panel}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Balancete</strong>
              <span style={{ fontSize: 11, fontWeight: 700, color: trialStatus.color, background: trialStatus.background, padding: '3px 8px', borderRadius: 7 }}>
                {trial.isGlobalBalanceCheckAvailable ? trialStatus.label : 'Balancete filtrado'}
              </span>
            </div>
            {trial.movementCount === 0 ? (
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--bd-soft)', background: 'var(--card2)', color: 'var(--text3)', fontSize: 12.5 }}>
                Sem movimentos no periodo seleccionado{trial.rows.length ? '; saldos iniciais apresentados quando existem.' : '.'}
              </div>
            ) : null}
            {!trial.isGlobalBalanceCheckAvailable ? (
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--bd-soft)', background: 'var(--card2)', color: 'var(--text3)', fontSize: 12.5 }}>
                Validacao global indisponivel com filtro de conta. Remova o filtro de conta para validar o equilibrio global.
              </div>
            ) : null}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Conta', 'Nome', 'Tipo', 'Natureza', 'Saldo inicial', 'Debito', 'Credito', 'Saldo devedor', 'Saldo credor'].map((h) => <th key={h} style={{ ...th, textAlign: ['Saldo inicial', 'Debito', 'Credito', 'Saldo devedor', 'Saldo credor'].includes(h) ? 'right' : 'left' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {trial.rows.length === 0 ? (
                    <EmptyRow colSpan={9} message="Sem movimentos contabilisticos no periodo seleccionado." />
                  ) : trial.rows.map((row) => (
                    <tr key={row.accountId} className="ants-row">
                      <td className="font-mono" style={{ ...td, color: 'var(--accent-fg)', fontWeight: 700 }}>{row.code}</td>
                      <td style={td}>{row.name}</td>
                      <td style={td}>{ledgerAccountTypeLabel(row.accountType)}</td>
                      <td style={td}>{normalBalanceLabel(row.normalBalance)}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right' }}>{balanceValue(row.openingBalance, row.normalBalance)}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNoSymbol(row.debit)}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNoSymbol(row.credit)}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{row.closingDebit ? fmtNoSymbol(row.closingDebit) : '-'}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{row.closingCredit ? fmtNoSymbol(row.closingCredit) : '-'}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} style={{ ...td, fontWeight: 800, color: 'var(--text)' }}>Totais</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{fmtNoSymbol(trial.totalDebit)}</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{fmtNoSymbol(trial.totalCredit)}</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{fmtNoSymbol(trial.totalClosingDebit)}</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{fmtNoSymbol(trial.totalClosingCredit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="ants-print-only">
          <DocumentFooter company={company} />
        </div>
      </div>
    </div>
  );
}
