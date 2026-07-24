import Link from 'next/link';
import { forCompany } from '@ants/database';
import {
  DEFAULT_TRIAL_BALANCE_COLUMNS,
  TRIAL_BALANCE_COLUMNS,
  accountingEventLabel,
  accountingJournalTypeLabel,
  accountingSourceTypeLabel,
  getAccountLedgerReport,
  getAccountingJournalReport,
  getGeneralLedgerReport,
  getAccountingReportOptions,
  getCompanyPrintProfile,
  getTrialBalanceClassOptions,
  getTrialBalanceReport,
  hasPermission,
  journalEntryStatusLabel,
  ledgerAccountTypeLabel,
  normalBalanceLabel,
  parseTrialBalanceColumns,
  trialBalanceColumnLabel,
  type AccountingJournalType,
  type AccountingReportFilters,
  type AccountingReportStatusFilter,
  type JournalEntryStatus,
  type NormalBalance,
  type TrialBalanceColumnKey,
  type TrialBalanceReportRow,
  type TrialBalanceSubtotalRow,
} from '@ants/domain';
import { Icon } from '@/components/Icon';
import { NoPermission } from '@/components/NoPermission';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter } from '@/components/print/PrintLayout';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import { SearchCombobox } from '@/components/ui/SearchCombobox';
import { TrialBalanceColumnSelector } from './TrialBalanceColumnSelector';
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
  const contas = clean(one(searchParams.contas));
  return {
    from: clean(one(searchParams.from)) ?? fallback.from,
    to: clean(one(searchParams.to)) ?? fallback.to,
    ledgerAccountId: clean(one(searchParams.account)),
    journalId: clean(one(searchParams.journal)),
    sourceType: clean(one(searchParams.source)),
    journalType: journalTypeFromSearch(clean(one(searchParams.type))),
    status: statusFromSearch(clean(one(searchParams.status))),
    q: clean(one(searchParams.q)),
    accountClass: clean(one(searchParams.classe)),
    accountMovement: contas === 'WITHOUT' || contas === 'ALL' ? contas : undefined,
    groupByRazao: one(searchParams.totalRazao) === '1' || undefined,
    groupByClasse: one(searchParams.totalClasse) === '1' || undefined,
  };
}

function appendFilters(qs: URLSearchParams, view: View, filters: AccountingReportFilters, selectedAccountId?: string, cols?: string) {
  qs.set('view', view);
  if (filters.from) qs.set('from', filters.from);
  if (filters.to) qs.set('to', filters.to);
  if (selectedAccountId) qs.set('account', selectedAccountId);
  if (filters.journalId) qs.set('journal', filters.journalId);
  if (filters.sourceType) qs.set('source', filters.sourceType);
  if (filters.journalType) qs.set('type', filters.journalType);
  if (filters.status) qs.set('status', filters.status);
  if (filters.q) qs.set('q', filters.q);
  if (filters.accountClass) qs.set('classe', filters.accountClass);
  if (filters.accountMovement) qs.set('contas', filters.accountMovement);
  if (filters.groupByRazao) qs.set('totalRazao', '1');
  if (filters.groupByClasse) qs.set('totalClasse', '1');
  if (cols) qs.set('cols', cols);
}

function viewHref(view: View, filters: AccountingReportFilters, selectedAccountId?: string, cols?: string): string {
  const qs = new URLSearchParams();
  appendFilters(qs, view, filters, selectedAccountId, cols);
  return `/contabilidade?${qs.toString()}`;
}

function exportHref(kind: ReportView, filters: AccountingReportFilters, selectedAccountId?: string, cols?: string): string {
  const qs = new URLSearchParams();
  qs.set('kind', kind);
  appendFilters(qs, kind, filters, selectedAccountId, cols);
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

function trialBalanceCell(row: TrialBalanceReportRow, key: TrialBalanceColumnKey) {
  switch (key) {
    case 'type':
      return <td key={key} style={td}>{ledgerAccountTypeLabel(row.accountType)}</td>;
    case 'nature':
      return <td key={key} style={td}>{normalBalanceLabel(row.normalBalance)}</td>;
    case 'opening':
      return <td key={key} className="tnum" style={{ ...td, textAlign: 'right' }}>{balanceValue(row.openingBalance, row.normalBalance)}</td>;
    case 'debit':
      return <td key={key} className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNoSymbol(row.debit)}</td>;
    case 'credit':
      return <td key={key} className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNoSymbol(row.credit)}</td>;
    case 'closingDebit':
      return <td key={key} className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{row.closingDebit ? fmtNoSymbol(row.closingDebit) : '-'}</td>;
    case 'closingCredit':
      return <td key={key} className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{row.closingCredit ? fmtNoSymbol(row.closingCredit) : '-'}</td>;
  }
}

// S18.1: célula de uma linha de subtotal (razão/classe). Saldo inicial é a soma SIGNED do grupo.
function trialBalanceSubtotalCell(sub: TrialBalanceSubtotalRow, key: TrialBalanceColumnKey, cellStyle: React.CSSProperties) {
  const money = (v: number) => v ? fmtNoSymbol(v) : '-';
  switch (key) {
    case 'type':
    case 'nature':
      return <td key={key} style={cellStyle} />;
    case 'opening':
      return <td key={key} className="tnum" style={{ ...cellStyle, textAlign: 'right' }}>{sub.openingBalance ? fmtNoSymbol(sub.openingBalance) : '-'}</td>;
    case 'debit':
      return <td key={key} className="tnum" style={{ ...cellStyle, textAlign: 'right' }}>{money(sub.debit)}</td>;
    case 'credit':
      return <td key={key} className="tnum" style={{ ...cellStyle, textAlign: 'right' }}>{money(sub.credit)}</td>;
    case 'closingDebit':
      return <td key={key} className="tnum" style={{ ...cellStyle, textAlign: 'right' }}>{money(sub.closingDebit)}</td>;
    case 'closingCredit':
      return <td key={key} className="tnum" style={{ ...cellStyle, textAlign: 'right' }}>{money(sub.closingCredit)}</td>;
  }
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
  // S18: variante «todas as contas» do Razão (a consulta de conta única fica intacta).
  const razaoTodas = view === 'ledger' && clean(one(searchParams.razao)) === 'todas';
  const colsParam = clean(one(searchParams.cols));
  const trialColumns = parseTrialBalanceColumns(colsParam);
  const [options, journal, trial, company, trialClasses] = await Promise.all([
    getAccountingReportOptions(db, ctx),
    getAccountingJournalReport(db, ctx, filters),
    getTrialBalanceReport(db, ctx, filters),
    getCompanyPrintProfile(db, ctx),
    getTrialBalanceClassOptions(db, ctx),
  ]);
  const selectedAccountId = filters.ledgerAccountId ?? options.accounts.find((a) => a.isPosting && a.isActive)?.id ?? options.accounts[0]?.id;
  // O Balancete mostra todas as contas por omissão; a navegação/exportação só herda a conta
  // quando escolhida explicitamente (o default `selectedAccountId` serve a vista Razão, não o balancete).
  const balanceteAccountId = filters.ledgerAccountId;
  const generalLedger = razaoTodas ? await getGeneralLedgerReport(db, ctx, filters) : null;
  const ledger = selectedAccountId && !razaoTodas ? await getAccountLedgerReport(db, ctx, selectedAccountId, filters) : null;
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
        label: filters.accountMovement === 'WITHOUT' ? 'Contas sem movimento — validacao global nao se aplica' : 'Validacao global indisponivel com o filtro aplicado',
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
          {canExport && view !== 'chart' && !razaoTodas ? (
            <a href={`${exportHref(view, filters, view === 'trial-balance' ? balanceteAccountId : selectedAccountId, colsParam)}&formato=xlsx`} style={{ ...actionBtn, background: ACCENT, color: '#fff', borderColor: ACCENT }}>
              <Icon name="sheet" size={14} />
              Excel
            </a>
          ) : null}
          {canExport && razaoTodas ? (
            <a href={`${exportHref('ledger', filters, undefined, colsParam)}&razao=todas&formato=xlsx`} style={{ ...actionBtn, background: ACCENT, color: '#fff', borderColor: ACCENT }}>
              <Icon name="sheet" size={14} />
              Excel
            </a>
          ) : null}
          {canExport && view !== 'chart' && !razaoTodas ? (
            <Link href={exportHref(view, filters, view === 'trial-balance' ? balanceteAccountId : selectedAccountId, colsParam)} style={actionBtn}>
              <Icon name="download" size={14} />
              CSV
            </Link>
          ) : razaoTodas ? null : (
            <span style={{ ...actionBtn, opacity: 0.55, cursor: 'not-allowed' }}>
              <Icon name="download" size={14} />
              {view === 'chart' ? 'CSV nos relatorios' : 'CSV sem permissao'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <TabLink href={viewHref('chart', filters, selectedAccountId, colsParam)} active={view === 'chart'} icon="landmark" label="Plano de contas" />
          <TabLink href={viewHref('journal', filters, selectedAccountId, colsParam)} active={view === 'journal'} icon="book-open" label="Extrato Diario" />
          <TabLink href={viewHref('ledger', filters, selectedAccountId, colsParam)} active={view === 'ledger'} icon="list-tree" label="Razao / Extracto" />
          <TabLink href={viewHref('trial-balance', filters, balanceteAccountId, colsParam)} active={view === 'trial-balance'} icon="scale" label="Balancete" />
          <TabLink href={`/contabilidade/demonstracoes?from=${filters.from ?? ''}&to=${filters.to ?? ''}`} active={false} icon="bar-chart-3" label="Demonstrações" />
          {hasPermission(ctx, 'accounting.prepare') || hasPermission(ctx, 'accounting.post') || hasPermission(ctx, 'accounting.reverse') ? (
            <TabLink href="/contabilidade/lancamentos" active={false} icon="pen-line" label="Lançamentos manuais" />
          ) : null}
        </div>

        <form method="get" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, alignItems: 'end' }}>
          <input type="hidden" name="view" value={view} />
          {razaoTodas ? <input type="hidden" name="razao" value="todas" /> : null}
          {colsParam ? <input type="hidden" name="cols" value={colsParam} /> : null}
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
            <SearchCombobox
              name="account"
              options={options.accounts.map((account) => ({
                value: account.id,
                label: `${account.code} - ${account.name}${account.isActive ? '' : ' (inactiva)'}`,
              }))}
              value={selectedAccountId ?? ''}
              placeholder="Todas"
              searchPlaceholder="Pesquisar por código ou nome…"
              emptyText="Sem contas para a pesquisa."
              clearable
              triggerStyle={field}
            />
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
          {view === 'trial-balance' ? (
            <>
              <label style={labelStyle}>
                Classe
                <select name="classe" defaultValue={filters.accountClass ?? ''} style={field}>
                  <option value="">Todas</option>
                  {trialClasses.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Contas
                <select name="contas" defaultValue={filters.accountMovement ?? ''} style={field}>
                  <option value="">Com movimento</option>
                  <option value="WITHOUT">Sem movimento</option>
                  <option value="ALL">Todas</option>
                </select>
              </label>
              <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}>
                <input type="checkbox" name="totalRazao" value="1" defaultChecked={!!filters.groupByRazao} />
                Total por Razão
              </label>
              <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}>
                <input type="checkbox" name="totalClasse" value="1" defaultChecked={!!filters.groupByClasse} />
                Total por Classe
              </label>
            </>
          ) : null}
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
            title={view === 'chart' ? 'Plano de contas' : view === 'ledger' ? (razaoTodas ? 'Razao Geral — todas as contas' : 'Razao / Extracto por conta') : view === 'trial-balance' ? 'Balancete' : 'Extrato Diario'}
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

        {view === 'ledger' && razaoTodas ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="ants-noprint" style={{ ...panel, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Razao Geral — todas as contas</strong>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                {generalLedger?.sections.length ?? 0} conta{(generalLedger?.sections.length ?? 0) === 1 ? '' : 's'} com movimento no periodo
                {generalLedger?.truncated ? ' · relatorio cortado no tecto de linhas — reduza o periodo' : ''}
              </span>
              <Link href={viewHref('ledger', filters, selectedAccountId, colsParam)} style={{ ...actionBtn, marginLeft: 'auto', height: 32 }}>
                <Icon name="list-tree" size={14} />
                Conta unica
              </Link>
            </div>
            {!generalLedger || generalLedger.sections.length === 0 ? (
              <div style={{ ...panel, padding: '34px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Sem movimentos contabilisticos no periodo seleccionado.
              </div>
            ) : (
              generalLedger.sections.map((section, index) => (
                <div key={section.account.id} className={index < generalLedger.sections.length - 1 ? 'ants-page-break-after' : undefined} style={panel}>
                  <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
                    <strong style={{ fontSize: 14, color: 'var(--text)' }}>
                      <span className="font-mono">{section.account.code}</span> — {section.account.name}
                    </strong>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>{['Data', 'Documento', 'Descricao', 'Debito', 'Credito', 'Saldo acumulado'].map((h) => <th key={h} style={{ ...th, textAlign: ['Debito', 'Credito', 'Saldo acumulado'].includes(h) ? 'right' : 'left' }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={5} style={{ ...td, fontWeight: 800, color: 'var(--text)' }}>Saldo inicial</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{balanceValue(section.openingBalance, section.account.normalBalance)}</td>
                        </tr>
                        {section.rows.map((row, rowIndex) => (
                          <tr key={`${row.entryId}-${rowIndex}`} className="ants-row">
                            <td style={td}>{datePt(row.date)}</td>
                            <td className="font-mono" style={{ ...td, color: 'var(--accent-fg)', fontWeight: 700 }}>{row.entryNumber}</td>
                            <td style={td}>{row.description}<br /><span style={{ color: 'var(--text3)' }}>{row.reference ?? (accountingEventLabel(row.accountingEvent) || '-')}</span></td>
                            <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{row.debit ? fmtNoSymbol(row.debit) : '-'}</td>
                            <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{row.credit ? fmtNoSymbol(row.credit) : '-'}</td>
                            <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{balanceValue(row.balance, section.account.normalBalance)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={3} style={{ ...td, fontWeight: 800, color: 'var(--text)', background: 'var(--card2)' }}>Totais da conta</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, background: 'var(--card2)' }}>{fmtNoSymbol(section.totalDebit)}</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, background: 'var(--card2)' }}>{fmtNoSymbol(section.totalCredit)}</td>
                          <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, background: 'var(--card2)' }}>{balanceValue(section.closingBalance, section.account.normalBalance)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {view === 'ledger' && !razaoTodas ? (
          <div style={panel}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 14, color: 'var(--text)' }}>Razao / extracto por conta</strong>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{activeAccount ? `${activeAccount.code} - ${activeAccount.name}` : 'Sem conta seleccionada'}</div>
              </div>
              <Link href={`${viewHref('ledger', filters, selectedAccountId, colsParam)}&razao=todas`} className="ants-noprint" style={{ ...actionBtn, marginLeft: 'auto', height: 32 }}>
                <Icon name="layers" size={14} />
                Todas as contas
              </Link>
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
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--bd-soft)' }} className="ants-noprint">
              <TrialBalanceColumnSelector
                options={TRIAL_BALANCE_COLUMNS.map((key) => ({ key, label: trialBalanceColumnLabel(key) }))}
                selected={trialColumns}
                defaultKeys={DEFAULT_TRIAL_BALANCE_COLUMNS}
              />
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
            {trial.groupingFallbackUsed ? (
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--bd-soft)', background: 'var(--card2)', color: 'var(--text3)', fontSize: 12.5 }}>
                Hierarquia do plano incompleta para algumas contas; agrupamento por prefixo de codigo aplicado.
              </div>
            ) : null}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 460 + trialColumns.length * 110, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Conta</th>
                    <th style={th}>Nome</th>
                    {trialColumns.map((key) => (
                      <th key={key} style={{ ...th, textAlign: key === 'type' || key === 'nature' ? 'left' : 'right' }}>{trialBalanceColumnLabel(key)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trial.rows.length === 0 ? (
                    <EmptyRow colSpan={2 + trialColumns.length} message="Sem movimentos contabilisticos no periodo seleccionado." />
                  ) : trial.displayRows ? trial.displayRows.map((d, i) => {
                    if (d.kind === 'account') {
                      return (
                        <tr key={d.row.accountId} className="ants-row">
                          <td className="font-mono" style={{ ...td, color: 'var(--accent-fg)', fontWeight: 700 }}>{d.row.code}</td>
                          <td style={td}>{d.row.name}</td>
                          {trialColumns.map((key) => trialBalanceCell(d.row, key))}
                        </tr>
                      );
                    }
                    const isClasse = d.kind === 'subtotal-classe';
                    const rowStyle: React.CSSProperties = isClasse
                      ? { ...td, fontWeight: 800, fontSize: 13, color: 'var(--text)', background: 'var(--accent-bg)', borderTop: '2px solid var(--accent-fg)' }
                      : { ...td, fontWeight: 700, color: 'var(--text)', background: 'var(--card2)', borderTop: '1px solid var(--bd-soft)' };
                    return (
                      <tr key={`${d.kind}-${d.code}-${i}`} style={{ breakInside: 'avoid' }}>
                        <td colSpan={2} style={rowStyle}>{d.label}</td>
                        {trialColumns.map((key) => trialBalanceSubtotalCell(d, key, rowStyle))}
                      </tr>
                    );
                  }) : trial.rows.map((row) => (
                    <tr key={row.accountId} className="ants-row">
                      <td className="font-mono" style={{ ...td, color: 'var(--accent-fg)', fontWeight: 700 }}>{row.code}</td>
                      <td style={td}>{row.name}</td>
                      {trialColumns.map((key) => trialBalanceCell(row, key))}
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} style={{ ...td, fontWeight: 800, color: 'var(--text)' }}>Totais</td>
                    {trialColumns.map((key) => (
                      <td key={key} className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800 }}>
                        {key === 'debit' ? fmtNoSymbol(trial.totalDebit)
                          : key === 'credit' ? fmtNoSymbol(trial.totalCredit)
                            : key === 'closingDebit' ? fmtNoSymbol(trial.totalClosingDebit)
                              : key === 'closingCredit' ? fmtNoSymbol(trial.totalClosingCredit)
                                : ''}
                      </td>
                    ))}
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
