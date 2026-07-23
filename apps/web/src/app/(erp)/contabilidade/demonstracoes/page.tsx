import { Fragment } from 'react';
import Link from 'next/link';
import { forCompany } from '@ants/database';
import {
  getBalanceSheetReport,
  getCashFlowStatementReport,
  getCompanyPrintProfile,
  getIncomeStatementReport,
  hasPermission,
  listFiscalYears,
  type CashFlowLine,
  type StatementGroupRow,
} from '@ants/domain';
import { Icon } from '@/components/Icon';
import { NoPermission } from '@/components/NoPermission';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter } from '@/components/print/PrintLayout';
import { ACCENT } from '@/lib/erp-nav';
import { fmtNoSymbol } from '@/lib/format';
import { getContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
type StatementView = 'dr' | 'balanco' | 'fluxo';

const pageWrap: React.CSSProperties = { padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 16 };
const panel: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' };
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', background: 'var(--card2)', borderBottom: '1px solid var(--bd-soft)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, color: 'var(--text2)', borderTop: '1px solid var(--bd-soft2)', verticalAlign: 'top' };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '0 10px', fontSize: 12.5, outline: 'none', minWidth: 0 };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' };
const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' };
const sectionTd: React.CSSProperties = { ...td, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.4px', fontSize: 12, background: 'var(--card2)' };
const totalTd: React.CSSProperties = { ...td, fontWeight: 800, color: 'var(--text)' };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function clean(v: string | undefined): string | undefined {
  const value = v?.trim();
  return value ? value : undefined;
}

function viewFromSearch(searchParams: Search): StatementView {
  const v = one(searchParams.view);
  return v === 'balanco' || v === 'fluxo' ? v : 'dr';
}

function datePt(value: string | null | undefined): string {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function generatedAt(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function money(value: number): string {
  return fmtNoSymbol(value);
}

function TabLink({ href, active, icon, label }: { href: string; active: boolean; icon: string; label: string }) {
  return (
    <Link href={href} style={{ ...actionBtn, height: 34, background: active ? ACCENT : 'var(--card)', color: active ? '#fff' : 'var(--text2)', borderColor: active ? ACCENT : 'var(--border)' }}>
      <Icon name={icon} size={14} />
      {label}
    </Link>
  );
}

/** Linhas de um bloco de grupos: grupo a negrito + contas indentadas. */
function GroupRows({ rows }: { rows: StatementGroupRow[] }) {
  if (rows.length === 0) {
    return (
      <tr>
        <td style={{ ...td, color: 'var(--text3)' }} colSpan={2}>Sem movimentos</td>
      </tr>
    );
  }
  return (
    <>
      {rows.map((group) => (
        <Fragment key={group.groupId}>
          <tr className="ants-row">
            <td style={{ ...td, fontWeight: 700, color: 'var(--text)' }}>
              <span className="font-mono" style={{ color: 'var(--accent-fg)' }}>{group.code}</span> {group.name}
            </td>
            <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{money(group.amount)}</td>
          </tr>
          {group.accounts.map((account) => (
            <tr key={account.accountId} className="ants-row">
              <td style={{ ...td, paddingLeft: 34, color: 'var(--text3)' }}>
                <span className="font-mono">{account.code}</span> {account.name}
              </td>
              <td className="tnum" style={{ ...td, textAlign: 'right', color: 'var(--text3)' }}>{money(account.amount)}</td>
            </tr>
          ))}
        </Fragment>
      ))}
    </>
  );
}

function ValidationBadge({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: ok ? 'var(--ok)' : 'var(--bad)', background: ok ? 'var(--ok-bg)' : 'var(--bad-bg)', padding: '3px 8px', borderRadius: 7 }}>
      {ok ? okLabel : badLabel}
    </span>
  );
}

export default async function DemonstracoesPage({ searchParams }: { searchParams: Search }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'accounting.view')) {
    return <NoPermission message="Nao tem permissao para ver a contabilidade." />;
  }

  const db = forCompany(ctx.companyId);
  const view = viewFromSearch(searchParams);
  const canExport = hasPermission(ctx, 'reports.export');
  const fiscalYears = await listFiscalYears(db, ctx);

  // Período: o exercício seleccionado tem precedência sobre as datas livres.
  const exercicioId = clean(one(searchParams.exercicio));
  const selectedYear = exercicioId ? fiscalYears.find((y) => y.id === exercicioId) : undefined;
  const from = selectedYear?.startDate ?? clean(one(searchParams.from));
  const to = selectedYear?.endDate ?? clean(one(searchParams.to));

  const [company, dr, balanco, fluxo] = await Promise.all([
    getCompanyPrintProfile(db, ctx),
    view === 'dr' ? getIncomeStatementReport(db, ctx, { from, to }) : null,
    view === 'balanco' ? getBalanceSheetReport(db, ctx, { to }) : null,
    view === 'fluxo' ? getCashFlowStatementReport(db, ctx, { from, to }) : null,
  ]);
  // Validação cruzada do Balanço: DR calculada INDEPENDENTEMENTE para o
  // exercício corrente até à data — tem de bater com a linha do Capital Próprio.
  const drCross = balanco
    ? await getIncomeStatementReport(db, ctx, { from: balanco.fiscalYear?.startDate ?? `${balanco.asOf.slice(0, 4)}-01-01`, to: balanco.asOf })
    : null;

  const effectiveFrom = dr?.filters.from ?? fluxo?.filters.from ?? from ?? '';
  const effectiveTo = dr?.filters.to ?? fluxo?.filters.to ?? balanco?.asOf ?? to ?? '';
  const periodLabel = view === 'balanco' ? `À data de ${datePt(effectiveTo)}` : `${datePt(effectiveFrom)} a ${datePt(effectiveTo)}`;
  const title = view === 'dr' ? 'Demonstração de Resultados' : view === 'balanco' ? 'Balanço Patrimonial' : 'Demonstração do Fluxo de Caixa';
  const exportKind = view === 'dr' ? 'income-statement' : view === 'balanco' ? 'balance-sheet' : 'cash-flow';
  const exportQs = new URLSearchParams({ kind: exportKind });
  if (effectiveFrom) exportQs.set('from', effectiveFrom);
  if (effectiveTo) exportQs.set('to', effectiveTo);

  const viewQs = (v: StatementView) => {
    const qs = new URLSearchParams({ view: v });
    if (exercicioId) qs.set('exercicio', exercicioId);
    if (effectiveFrom) qs.set('from', effectiveFrom);
    if (effectiveTo) qs.set('to', effectiveTo);
    return `/contabilidade/demonstracoes?${qs.toString()}`;
  };

  const cashFlowSection = (label: string, rows: CashFlowLine[], total: number, emptyMessage: string) => (
    <>
      <tr>
        <td style={sectionTd} colSpan={2}>{label}</td>
      </tr>
      {rows.length === 0 ? (
        <tr>
          <td style={{ ...td, color: 'var(--text3)' }} colSpan={2}>{emptyMessage}</td>
        </tr>
      ) : rows.map((line) => (
        <tr key={line.key} className="ants-row">
          <td style={td}>{line.label}</td>
          <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700, color: line.amount < 0 ? 'var(--bad)' : 'var(--text)' }}>{money(line.amount)}</td>
        </tr>
      ))}
      <tr>
        <td style={totalTd}>Fluxo líquido — {label.toLowerCase()}</td>
        <td className="tnum" style={{ ...totalTd, textAlign: 'right' }}>{money(total)}</td>
      </tr>
    </>
  );

  return (
    <div style={pageWrap}>
      <div className="ants-noprint" style={{ ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 9, borderRadius: 10, display: 'inline-flex' }}>
            <Icon name="bar-chart-3" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Demonstrações financeiras</div>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 4 }}>{title} — {periodLabel} · Valores em MT</div>
          </div>
          <PrintButton label="Imprimir / Guardar PDF" />
          {canExport ? (
            <a href={`/contabilidade/exportar?${exportQs.toString()}&formato=xlsx`} style={{ ...actionBtn, background: ACCENT, color: '#fff', borderColor: ACCENT }}>
              <Icon name="sheet" size={14} />
              Excel
            </a>
          ) : null}
          {canExport ? (
            <Link href={`/contabilidade/exportar?${exportQs.toString()}`} style={actionBtn}>
              <Icon name="download" size={14} />
              CSV
            </Link>
          ) : (
            <span style={{ ...actionBtn, opacity: 0.55, cursor: 'not-allowed' }}>
              <Icon name="download" size={14} />
              CSV sem permissao
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <TabLink href="/contabilidade?view=trial-balance" active={false} icon="scale" label="Balancete" />
          <TabLink href={viewQs('dr')} active={view === 'dr'} icon="trending-up" label="Demonstração de Resultados" />
          <TabLink href={viewQs('balanco')} active={view === 'balanco'} icon="landmark" label="Balanço Patrimonial" />
          <TabLink href={viewQs('fluxo')} active={view === 'fluxo'} icon="wallet" label="Fluxo de Caixa" />
        </div>

        <form method="get" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, alignItems: 'end' }}>
          <input type="hidden" name="view" value={view} />
          <label style={labelStyle}>
            Exercício
            <select name="exercicio" defaultValue={exercicioId ?? ''} style={field}>
              <option value="">Datas livres</option>
              {fiscalYears.map((y) => (
                <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? ' (corrente)' : ''}</option>
              ))}
            </select>
          </label>
          {view !== 'balanco' ? (
            <label style={labelStyle}>
              Data inicial
              <input type="date" name="from" defaultValue={effectiveFrom} style={field} />
            </label>
          ) : null}
          <label style={labelStyle}>
            {view === 'balanco' ? 'À data de' : 'Data final'}
            <input type="date" name="to" defaultValue={effectiveTo} style={field} />
          </label>
          <button type="submit" style={{ ...actionBtn, background: ACCENT, color: '#fff', borderColor: ACCENT }}>
            <Icon name="filter" size={14} />
            Aplicar
          </button>
        </form>
        <div style={{ fontSize: 11.5, color: 'var(--text4)' }}>
          Com um exercício seleccionado, as datas do exercício têm precedência sobre as datas livres.
        </div>
      </div>

      <div className="ants-report-print">
        <div className="ants-print-only">
          <CompanyHeader
            company={company}
            title={title}
            documentNumber={periodLabel}
            meta={<div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.5 }}>Gerado em {generatedAt()}<br />Empresa activa: {company?.legalName ?? ctx.companyId}<br />Valores em MT</div>}
          />
        </div>

        {dr ? (
          <div style={panel}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Demonstração de Resultados</strong>
              <ValidationBadge
                ok={dr.netResult >= 0}
                okLabel={`Excedente de ${money(dr.netResult)} MT`}
                badLabel={`Déficit de ${money(Math.abs(dr.netResult))} MT`}
              />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Descrição</th>
                    <th style={{ ...th, textAlign: 'right' }}>Valor (MT)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={sectionTd} colSpan={2}>Proveitos</td></tr>
                  <GroupRows rows={dr.revenue} />
                  <tr>
                    <td style={totalTd}>Total dos proveitos</td>
                    <td className="tnum" style={{ ...totalTd, textAlign: 'right' }}>{money(dr.totalRevenue)}</td>
                  </tr>
                  <tr><td style={sectionTd} colSpan={2}>Custos</td></tr>
                  <GroupRows rows={dr.expenses} />
                  <tr>
                    <td style={totalTd}>Total dos custos</td>
                    <td className="tnum" style={{ ...totalTd, textAlign: 'right' }}>{money(dr.totalExpenses)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...totalTd, fontSize: 13.5 }}>Resultado líquido do período ({dr.netResult >= 0 ? 'Excedente' : 'Déficit'})</td>
                    <td className="tnum" style={{ ...totalTd, textAlign: 'right', fontSize: 13.5, color: dr.netResult >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{money(dr.netResult)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {balanco ? (
          <div style={panel}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Balanço Patrimonial</strong>
              <ValidationBadge ok={balanco.isBalanced} okLabel="Activo = Passivo + Capital Próprio" badLabel="BALANÇO NÃO FECHA" />
              {drCross ? (
                <ValidationBadge
                  ok={drCross.netResult === balanco.currentYearResult}
                  okLabel="Resultado do exercício = DR"
                  badLabel={`Resultado do exercício ≠ DR (${money(balanco.currentYearResult)} vs ${money(drCross.netResult)})`}
                />
              ) : null}
            </div>
            {!balanco.isBalanced ? (
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--bd-soft)', background: 'var(--bad-bg)', color: 'var(--bad)', fontSize: 12.5, fontWeight: 600 }}>
                O Balanço não fecha — existe lançamento desequilibrado ou erro de cobertura. Investigar no Extrato Diário; nunca forçar.
              </div>
            ) : null}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Descrição</th>
                    <th style={{ ...th, textAlign: 'right' }}>Valor (MT)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={sectionTd} colSpan={2}>Activo</td></tr>
                  <GroupRows rows={balanco.assets} />
                  <tr>
                    <td style={{ ...totalTd, fontSize: 13.5 }}>Total do Activo</td>
                    <td className="tnum" style={{ ...totalTd, textAlign: 'right', fontSize: 13.5 }}>{money(balanco.totalAssets)}</td>
                  </tr>
                  <tr><td style={sectionTd} colSpan={2}>Passivo</td></tr>
                  <GroupRows rows={balanco.liabilities} />
                  <tr>
                    <td style={totalTd}>Total do Passivo</td>
                    <td className="tnum" style={{ ...totalTd, textAlign: 'right' }}>{money(balanco.totalLiabilities)}</td>
                  </tr>
                  <tr><td style={sectionTd} colSpan={2}>Capital Próprio</td></tr>
                  <GroupRows rows={balanco.equity} />
                  <tr className="ants-row">
                    <td style={td}>Resultados de exercícios anteriores (por apurar)</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(balanco.priorYearsResult)}</td>
                  </tr>
                  <tr className="ants-row">
                    <td style={td}>Resultado líquido do exercício (por apurar)</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700, color: balanco.currentYearResult >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{money(balanco.currentYearResult)}</td>
                  </tr>
                  <tr>
                    <td style={totalTd}>Total do Capital Próprio</td>
                    <td className="tnum" style={{ ...totalTd, textAlign: 'right' }}>{money(balanco.totalEquity)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...totalTd, fontSize: 13.5 }}>Total do Passivo + Capital Próprio</td>
                    <td className="tnum" style={{ ...totalTd, textAlign: 'right', fontSize: 13.5 }}>{money(balanco.totalLiabilitiesAndEquity)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ padding: '11px 16px', borderTop: '1px solid var(--bd-soft)', color: 'var(--text3)', fontSize: 12 }}>
              Enquanto não existe fecho de exercício, o resultado das classes de proveitos e custos permanece por apurar e é apresentado nas duas linhas calculadas acima
              {balanco.fiscalYear ? ` (corte no início do exercício ${balanco.fiscalYear.name}, ${datePt(balanco.fiscalYear.startDate)})` : ''}.
            </div>
          </div>
        ) : null}

        {fluxo ? (
          <div style={panel}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Demonstração do Fluxo de Caixa</strong>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--info)', background: 'var(--info-bg)', padding: '3px 8px', borderRadius: 7 }}>Método directo</span>
              <ValidationBadge
                ok={fluxo.closingCash === Math.round((fluxo.openingCash + fluxo.netChange) * 100) / 100}
                okLabel="Caixa inicial + variação = caixa final"
                badLabel="Incoerência na variação de caixa"
              />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Rubrica</th>
                    <th style={{ ...th, textAlign: 'right' }}>Valor (MT)</th>
                  </tr>
                </thead>
                <tbody>
                  {cashFlowSection('Actividades operacionais', fluxo.operating, fluxo.operatingTotal, 'Sem fluxos operacionais no período.')}
                  {cashFlowSection('Actividades de investimento', fluxo.investing, fluxo.investingTotal, 'Sem fluxos de investimento no período (sem activos fixos na V1).')}
                  {cashFlowSection('Actividades de financiamento', fluxo.financing, fluxo.financingTotal, 'Sem fluxos de financiamento no período.')}
                  <tr>
                    <td style={{ ...totalTd, fontSize: 13.5 }}>Variação líquida de caixa</td>
                    <td className="tnum" style={{ ...totalTd, textAlign: 'right', fontSize: 13.5 }}>{money(fluxo.netChange)}</td>
                  </tr>
                  <tr className="ants-row">
                    <td style={td}>Caixa e equivalentes no início do período</td>
                    <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(fluxo.openingCash)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...totalTd, fontSize: 13.5 }}>Caixa e equivalentes no fim do período</td>
                    <td className="tnum" style={{ ...totalTd, textAlign: 'right', fontSize: 13.5 }}>{money(fluxo.closingCash)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ padding: '11px 16px', borderTop: '1px solid var(--bd-soft)', color: 'var(--text3)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>
                Reconciliação com a Tesouraria (movimentos do período): entradas {money(fluxo.treasury.totalIn)} MT · saídas {money(fluxo.treasury.totalOut)} MT · líquido {money(fluxo.treasury.net)} MT
                {fluxo.treasury.difference !== 0
                  ? ` · diferença de ${money(fluxo.treasury.difference)} MT face à demonstração — movimentos manuais de Tesouraria (depósitos, levantamentos, despesas, transferências) ainda não geram lançamentos contabilísticos (limitação V1).`
                  : ' · coincide com a demonstração.'}
              </div>
              {fluxo.internalTransferCount > 0 ? (
                <div>{fluxo.internalTransferCount} lançamento(s) entre contas de caixa excluído(s) das rubricas (movimento interno sem efeito na caixa total).</div>
              ) : null}
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
