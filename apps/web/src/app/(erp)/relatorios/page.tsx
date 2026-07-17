import Link from 'next/link';
import { forCompany } from '@ants/database';
import {
  getCompanyPrintProfile,
  getOperationalReport,
  getReportFilterOptions,
  hasPermission,
  isOperationalReportKey,
  REPORT_DEFINITIONS,
  type OperationalReport,
  type OperationalReportKey,
  type ReportColumn,
  type ReportDefinition,
  type ReportFilters,
  type ReportSummaryItem,
} from '@ants/domain';
import { Icon } from '@/components/Icon';
import { NoPermission } from '@/components/NoPermission';
import { PrintButton } from '@/components/PrintButton';
import { SearchCombobox } from '@/components/ui/SearchCombobox';
import { CompanyHeader, DocumentFooter } from '@/components/print/PrintLayout';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

const pageWrap: React.CSSProperties = { padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 16 };
const panel: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' };
const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', background: 'var(--card2)', borderBottom: '1px solid var(--bd-soft)' };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '0 10px', fontSize: 12.5, outline: 'none' };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' };
const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function clean(v: string | undefined): string | undefined {
  const value = v?.trim();
  return value ? value : undefined;
}

function filtersFromSearch(searchParams: Search): ReportFilters {
  const movementType = clean(one(searchParams.movementType));
  return {
    from: clean(one(searchParams.from)),
    to: clean(one(searchParams.to)),
    customerId: clean(one(searchParams.customerId)),
    supplierId: clean(one(searchParams.supplierId)),
    productId: clean(one(searchParams.productId)),
    treasuryAccountId: clean(one(searchParams.treasuryAccountId)),
    movementType: movementType === 'IN' || movementType === 'OUT' || movementType === 'ADJUST' ? movementType : undefined,
    userId: clean(one(searchParams.userId)),
  };
}

function formatValue(value: string | number | null | undefined, kind?: ReportColumn['kind'] | ReportSummaryItem['kind']): string {
  if (value === null || value === undefined) return '-';
  if (kind === 'money' && typeof value === 'number') return fmt(value);
  return String(value);
}

function appendPublicFilters(qs: URLSearchParams, filters: ReportFilters): void {
  const keys: Array<keyof ReportFilters> = ['from', 'to', 'customerId', 'supplierId', 'productId', 'treasuryAccountId', 'movementType', 'userId'];
  for (const key of keys) {
    const value = filters[key];
    if (value) qs.set(key, value);
  }
}

function reportHref(key: string, filters: ReportFilters): string {
  const qs = new URLSearchParams();
  qs.set('report', key);
  appendPublicFilters(qs, filters);
  return `/relatorios?${qs.toString()}`;
}

function exportHref(key: OperationalReportKey, filters: ReportFilters): string {
  const qs = new URLSearchParams();
  qs.set('report', key);
  appendPublicFilters(qs, filters);
  return `/relatorios/exportar?${qs.toString()}`;
}

function generatedAt(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function filtersLabel(filters: ReportFilters): string {
  const labels = [`Periodo: ${filters.from} a ${filters.to}`];
  if (filters.customerId) labels.push('Cliente filtrado');
  if (filters.supplierId) labels.push('Fornecedor filtrado');
  if (filters.productId) labels.push('Produto filtrado');
  if (filters.treasuryAccountId) labels.push('Conta filtrada');
  if (filters.movementType) labels.push(`Tipo: ${filters.movementType}`);
  if (filters.userId) labels.push('Utilizador filtrado');
  return labels.join(' · ');
}

function groupedDefinitions() {
  const groups = new Map<string, ReportDefinition[]>();
  for (const def of REPORT_DEFINITIONS) {
    const key = def.status === 'Futuro' ? 'Futuro' : def.group;
    groups.set(key, [...(groups.get(key) ?? []), def]);
  }
  return [...groups.entries()];
}

function StatusPill({ status }: { status: ReportDefinition['status'] }) {
  const ok = status === 'V1';
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: ok ? 'var(--ok)' : 'var(--text3)', background: ok ? 'var(--ok-bg)' : 'var(--bd-soft)', padding: '3px 7px', borderRadius: 7 }}>
      {ok ? 'V1 real' : 'Futuro'}
    </span>
  );
}

function SummaryGrid({ report }: { report: OperationalReport }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
      {report.summary.map((item) => (
        <div key={item.label} style={{ border: '1px solid var(--bd-soft)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 5 }}>{item.label}</div>
          <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: item.kind === 'money' ? 'var(--accent-fg)' : 'var(--text)' }}>
            {formatValue(item.value, item.kind)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportTable({ report }: { report: OperationalReport }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {report.sections.map((section) => (
        <div key={section.title} style={panel}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{section.title}</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>{section.columns.map((column) => <th key={column.key} style={{ ...th, textAlign: column.align ?? 'left' }}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {section.rows.length === 0 ? (
                  <tr>
                    <td colSpan={section.columns.length} style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Sem dados para os filtros seleccionados.</td>
                  </tr>
                ) : (
                  section.rows.map((row, idx) => (
                    <tr key={idx} className="ants-row" style={{ borderTop: '1px solid var(--bd-soft2)' }}>
                      {section.columns.map((column) => (
                        <td key={column.key} className={column.kind === 'money' || column.kind === 'count' ? 'tnum' : undefined} style={{ padding: '10px 14px', textAlign: column.align ?? 'left', fontSize: 12.5, color: 'var(--text2)', whiteSpace: column.kind === 'money' ? 'nowrap' : undefined }}>
                          {formatValue(row[column.key], column.kind)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function RelatoriosPage({ searchParams }: { searchParams: Search }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'reports.export')) {
    return <NoPermission message="Nao tem permissao para ver e exportar relatorios." />;
  }

  const selectedParam = one(searchParams.report);
  const operationalDefs = REPORT_DEFINITIONS.filter((def) => def.status === 'V1' && isOperationalReportKey(def.key) && (!def.permission || hasPermission(ctx, def.permission)));
  if (operationalDefs.length === 0) {
    return <NoPermission message="Nao tem permissao para os relatorios operacionais V1." />;
  }

  const selectedDef = REPORT_DEFINITIONS.find((def) => def.key === selectedParam) ?? operationalDefs[0]!;
  let selectedKey = operationalDefs[0]!.key as OperationalReportKey;
  if (selectedDef.status === 'V1' && isOperationalReportKey(selectedDef.key) && (!selectedDef.permission || hasPermission(ctx, selectedDef.permission))) {
    selectedKey = selectedDef.key;
  }
  const db = forCompany(ctx.companyId);
  const rawFilters = filtersFromSearch(searchParams);
  const [options, report, company] = await Promise.all([
    getReportFilterOptions(db, ctx),
    getOperationalReport(db, ctx, selectedKey, rawFilters),
    getCompanyPrintProfile(db, ctx),
  ]);
  const filters = report.filters;

  return (
    <div style={pageWrap}>
      <div className="ants-noprint" style={{ ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 9, borderRadius: 10, display: 'inline-flex' }}>
            <Icon name={REPORT_DEFINITIONS.find((d) => d.key === selectedKey)?.icon ?? 'bar-chart-3'} size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{report.title}</div>
              <StatusPill status="V1" />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 4 }}>{report.description} · {report.periodLabel}</div>
          </div>
          <button disabled style={{ ...actionBtn, opacity: 0.48, cursor: 'not-allowed', color: 'var(--bad)' }} title="PDF avancado fica para fase futura">
            <Icon name="file-text" size={14} />
            PDF futuro
          </button>
          <PrintButton label="Imprimir / Guardar PDF" />
          <button disabled style={{ ...actionBtn, opacity: 0.48, cursor: 'not-allowed', color: 'var(--ok)' }} title="Excel avancado fica para fase futura">
            <Icon name="sheet" size={14} />
            Excel futuro
          </button>
          <Link href={exportHref(selectedKey, filters)} style={actionBtn}>
            <Icon name="download" size={14} />
            CSV
          </Link>
        </div>

        <form method="get" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, alignItems: 'end' }}>
          <label style={labelStyle}>
            Relatorio
            <select name="report" defaultValue={selectedKey} style={field}>
              {operationalDefs.map((def) => (
                <option key={def.key} value={def.key}>{def.title}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Data inicial
            <input type="date" name="from" defaultValue={filters.from} style={field} />
          </label>
          <label style={labelStyle}>
            Data final
            <input type="date" name="to" defaultValue={filters.to} style={field} />
          </label>
          {options.customers.length ? (
            <label style={labelStyle}>
              Cliente
              <SearchCombobox
                name="customerId"
                searchEndpoint="/api/search/customers"
                defaultOptions={options.customers.slice(0, 20).map((o) => ({ value: o.id, label: o.name }))}
                value={filters.customerId ?? ''}
                selectedLabel={options.customers.find((o) => o.id === filters.customerId)?.name}
                placeholder="Todos"
                searchPlaceholder="Pesquisar por nome ou NUIT…"
                emptyText="Sem clientes para a pesquisa."
                clearable
                triggerStyle={field}
              />
            </label>
          ) : null}
          {options.suppliers.length ? (
            <label style={labelStyle}>
              Fornecedor
              <SearchCombobox
                name="supplierId"
                options={options.suppliers.map((o) => ({ value: o.id, label: o.name }))}
                value={filters.supplierId ?? ''}
                placeholder="Todos"
                searchPlaceholder="Pesquisar fornecedor…"
                emptyText="Sem fornecedores para a pesquisa."
                clearable
                triggerStyle={field}
              />
            </label>
          ) : null}
          {options.products.length ? (
            <label style={labelStyle}>
              Produto
              <SearchCombobox
                name="productId"
                searchEndpoint="/api/search/products"
                defaultOptions={options.products.slice(0, 20).map((o) => ({ value: o.id, label: o.name, sublabel: o.sku }))}
                value={filters.productId ?? ''}
                selectedLabel={options.products.find((o) => o.id === filters.productId)?.name}
                placeholder="Todos"
                searchPlaceholder="Pesquisar por nome ou SKU…"
                emptyText="Sem produtos para a pesquisa."
                clearable
                triggerStyle={field}
              />
            </label>
          ) : null}
          {options.treasuryAccounts.length ? (
            <label style={labelStyle}>
              Conta
              <SearchCombobox
                name="treasuryAccountId"
                options={options.treasuryAccounts.map((o) => ({ value: o.id, label: o.name }))}
                value={filters.treasuryAccountId ?? ''}
                placeholder="Todas"
                searchPlaceholder="Pesquisar conta…"
                emptyText="Sem contas para a pesquisa."
                clearable
                triggerStyle={field}
              />
            </label>
          ) : null}
          <label style={labelStyle}>
            Tipo stock
            <select name="movementType" defaultValue={filters.movementType ?? ''} style={field}>
              <option value="">Todos</option>
              <option value="IN">Entrada</option>
              <option value="OUT">Saida</option>
              <option value="ADJUST">Ajuste</option>
            </select>
          </label>
          {options.users.length ? (
            <label style={labelStyle}>
              Utilizador
              <select name="userId" defaultValue={filters.userId ?? ''} style={field}>
                <option value="">Todos</option>
                {options.users.map((o) => <option key={o.id} value={o.id}>{o.name || o.email || o.id}</option>)}
              </select>
            </label>
          ) : null}
          <button type="submit" style={{ ...actionBtn, background: ACCENT, color: '#fff', borderColor: ACCENT }}>
            <Icon name="play" size={14} />
            Gerar
          </button>
        </form>
      </div>

      <div className="ants-report-print">
        <div className="ants-print-only">
          <CompanyHeader
            company={company}
            title={report.title}
            documentNumber={report.periodLabel}
            meta={
              <div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.5 }}>
                {filtersLabel(filters)}
                <br />
                Gerado em {generatedAt()}
              </div>
            }
          />
        </div>
        <SummaryGrid report={report} />
        <ReportTable report={report} />
        <div className="ants-print-only">
          <DocumentFooter company={company} />
        </div>
      </div>

      <div className="ants-noprint">
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Biblioteca de relatorios</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>Relatorios V1 usam dados reais, exportam CSV e podem ser impressos/guardados em PDF pelo navegador. PDF e Excel avancados ficam para fase futura.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groupedDefinitions().map(([group, items]) => (
            <div key={group}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 11 }}>{group}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
                {items.map((def) => {
                  const allowed = def.status === 'V1' && isOperationalReportKey(def.key) && (!def.permission || hasPermission(ctx, def.permission));
                  return (
                    <div key={def.key} className="ants-pcard" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 9, borderRadius: 10, flex: 'none', display: 'inline-flex' }}>
                          <Icon name={def.icon} size={18} />
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{def.title}</div>
                            <StatusPill status={def.status} />
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.35, marginTop: 4 }}>{def.note ?? def.description}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 11, borderTop: '1px solid var(--bd-soft2)' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', background: 'var(--bd-soft)', padding: '2px 7px', borderRadius: 6 }}>CSV</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', background: 'var(--bd-soft)', padding: '2px 7px', borderRadius: 6 }}>PDF futuro</span>
                        <div style={{ flex: 1 }} />
                        {allowed ? (
                          <Link href={reportHref(def.key, filters)} style={{ ...actionBtn, height: 32, background: ACCENT, color: '#fff', border: 'none' }}>
                            <Icon name="play" size={13} />
                            Gerar
                          </Link>
                        ) : (
                          <span style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 700 }}>{def.status === 'Futuro' ? 'Futuro' : 'Sem permissao'}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
