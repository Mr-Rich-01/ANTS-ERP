import { Fragment } from 'react';
import Link from 'next/link';
import { forCompany } from '@ants/database';
import {
  getCompanyPrintProfile,
  getSalesReport,
  getSalesReportFilterOptions,
  hasPermission,
  searchCustomerOptions,
  type SalesReportDir,
  type SalesReportFilters,
  type SalesReportRow,
  type SalesReportSort,
  type SalesReportTotals,
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

const th: React.CSSProperties = { padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', background: 'var(--card2)', borderBottom: '1px solid var(--bd-soft)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12.5, color: 'var(--text2)' };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '0 10px', fontSize: 12.5, outline: 'none' };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' };
const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' };

function one(v: string | string[] | undefined): string | undefined {
  const value = Array.isArray(v) ? v[0] : v;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function filtersFromSearch(searchParams: Search): SalesReportFilters {
  const tipo = one(searchParams.tipo);
  const estado = one(searchParams.estado);
  const ord = one(searchParams.ord);
  const dir = one(searchParams.dir);
  return {
    from: one(searchParams.de),
    to: one(searchParams.ate),
    documentType: tipo === 'VD' || tipo === 'FACTURA' ? tipo : 'ALL',
    search: one(searchParams.q),
    customerId: one(searchParams.customerId),
    userId: one(searchParams.vendedor),
    status: estado === 'CANCELLED' || estado === 'ALL' ? estado : 'ACTIVE',
    sort: ord === 'number' || ord === 'total' ? ord : 'date',
    dir: dir === 'desc' ? 'desc' : 'asc',
  };
}

function queryString(filters: SalesReportFilters, overrides: Partial<{ ord: SalesReportSort; dir: SalesReportDir }> = {}): string {
  const qs = new URLSearchParams();
  if (filters.from) qs.set('de', filters.from);
  if (filters.to) qs.set('ate', filters.to);
  if (filters.documentType && filters.documentType !== 'ALL') qs.set('tipo', filters.documentType);
  if (filters.search) qs.set('q', filters.search);
  if (filters.customerId) qs.set('customerId', filters.customerId);
  if (filters.userId) qs.set('vendedor', filters.userId);
  if (filters.status && filters.status !== 'ACTIVE') qs.set('estado', filters.status);
  const ord = overrides.ord ?? filters.sort ?? 'date';
  const dir = overrides.dir ?? filters.dir ?? 'asc';
  if (ord !== 'date') qs.set('ord', ord);
  if (dir !== 'asc') qs.set('dir', dir);
  return qs.toString();
}

function sortHref(filters: SalesReportFilters, ord: SalesReportSort): string {
  const active = (filters.sort ?? 'date') === ord;
  const dir: SalesReportDir = active && (filters.dir ?? 'asc') === 'asc' ? 'desc' : 'asc';
  const qs = queryString(filters, { ord, dir });
  return qs ? `/relatorios/vendas?${qs}` : '/relatorios/vendas';
}

function SortHeader({ label, ord, filters, align }: { label: string; ord: SalesReportSort; filters: SalesReportFilters; align?: 'right' }) {
  const active = (filters.sort ?? 'date') === ord;
  return (
    <th style={{ ...th, textAlign: align ?? 'left' }}>
      <Link href={sortHref(filters, ord)} style={{ color: active ? 'var(--accent-fg)' : 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active ? <Icon name={(filters.dir ?? 'asc') === 'asc' ? 'chevron-up' : 'chevron-down'} size={13} /> : null}
      </Link>
    </th>
  );
}

function generatedAt(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function DataRow({ row }: { row: SalesReportRow }) {
  const struck = row.cancelled ? 'line-through' : undefined;
  return (
    <tr className="ants-row" style={{ borderTop: '1px solid var(--bd-soft2)', opacity: row.cancelled ? 0.62 : undefined }}>
      <td className="tnum" style={{ ...td, whiteSpace: 'nowrap', textDecoration: struck }}>{row.date}</td>
      <td style={{ ...td, color: 'var(--text)', fontWeight: 500 }}>
        <span className="font-mono" style={{ textDecoration: struck }}>{row.description}</span>
        {row.cancelled ? (
          <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '2px 7px', borderRadius: 7, whiteSpace: 'nowrap' }}>CANCELADA</span>
        ) : null}
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{row.customerName}</div>
      </td>
      <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', textDecoration: struck }}>{fmt(row.total)}</td>
      <td className="tnum" style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', textDecoration: struck }}>{fmt(row.vat)}</td>
      <td className="tnum" style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', textDecoration: struck }}>{fmt(row.net)}</td>
    </tr>
  );
}

function TotalRow({ label, totals, grand }: { label: string; totals: SalesReportTotals; grand?: boolean }) {
  const style: React.CSSProperties = {
    ...td,
    fontWeight: 700,
    color: 'var(--text)',
    background: grand ? 'var(--accent-bg)' : 'var(--card2)',
    borderTop: grand ? '2px solid var(--accent-fg)' : '1px solid var(--bd-soft)',
    whiteSpace: 'nowrap',
  };
  return (
    <tr>
      <td colSpan={2} style={{ ...style, fontSize: grand ? 13 : 12.5, letterSpacing: grand ? '.4px' : undefined }}>{label}</td>
      <td className="tnum" style={{ ...style, textAlign: 'right' }}>{fmt(totals.total)}</td>
      <td className="tnum" style={{ ...style, textAlign: 'right' }}>{fmt(totals.vat)}</td>
      <td className="tnum" style={{ ...style, textAlign: 'right' }}>{fmt(totals.net)}</td>
    </tr>
  );
}

/** Relatório de Vendas (S16) — modelo do cliente: VD + Facturas com sub-totais e TOTAL GERAL. */
export default async function RelatorioVendasPage({ searchParams }: { searchParams: Search }) {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver o relatório de vendas.
      </div>
    );
  }
  if (!hasPermission(ctx, 'sales.view')) return <NoPermission message="Não tem permissão para ver o relatório de vendas." />;

  const db = forCompany(ctx.companyId);
  const rawFilters = filtersFromSearch(searchParams);
  const canPickCustomer = hasPermission(ctx, 'clients.view');
  const canExport = hasPermission(ctx, 'reports.export');
  const [report, options, company, customerOptions] = await Promise.all([
    getSalesReport(db, ctx, rawFilters),
    getSalesReportFilterOptions(db, ctx),
    getCompanyPrintProfile(db, ctx),
    canPickCustomer ? searchCustomerOptions(db, ctx, { take: 20 }) : Promise.resolve([]),
  ]);
  const filters = report.filters;
  const selectedCustomer = filters.customerId && canPickCustomer
    ? (await searchCustomerOptions(db, ctx, { ids: [filters.customerId] }))[0]
    : undefined;
  const exportQs = queryString(filters);
  const exportHref = `/relatorios/vendas/exportar${exportQs ? `?${exportQs}` : ''}`;

  return (
    <div data-screen-label="Relatório de Vendas" style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/relatorios" style={actionBtn}>
          <Icon name="arrow-left" size={15} />
          Relatórios
        </Link>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Relatório de Vendas</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>
            VD e Facturas com sub-totais e TOTAL GERAL · {report.periodLabel} · {report.documentCount} documento{report.documentCount === 1 ? '' : 's'}
            {report.cancelledCount > 0 ? ` · ${report.cancelledCount} cancelado${report.cancelledCount === 1 ? '' : 's'} fora dos totais` : ''}
          </div>
        </div>
        <PrintButton label="Imprimir / Guardar PDF" />
        {canExport ? (
          <a href={exportHref} style={{ ...actionBtn, background: ACCENT, color: '#fff', borderColor: ACCENT }}>
            <Icon name="sheet" size={14} />
            Exportar para Excel
          </a>
        ) : null}
      </div>

      <form method="get" className="ants-noprint" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, alignItems: 'end' }}>
        <label style={labelStyle}>
          De
          <input type="date" name="de" defaultValue={filters.from} style={field} />
        </label>
        <label style={labelStyle}>
          Até
          <input type="date" name="ate" defaultValue={filters.to} style={field} />
        </label>
        <label style={labelStyle}>
          Tipo de documento
          <select name="tipo" defaultValue={filters.documentType === 'ALL' ? '' : filters.documentType} style={field}>
            <option value="">Todos</option>
            <option value="VD">VD — Vendas a Dinheiro</option>
            <option value="FACTURA">Facturas</option>
          </select>
        </label>
        <label style={labelStyle}>
          Nº do documento
          <input name="q" defaultValue={filters.search ?? ''} placeholder="VD ou FT 2026/…" style={field} />
        </label>
        {canPickCustomer && (
          <label style={labelStyle}>
            Cliente
            <SearchCombobox
              name="customerId"
              searchEndpoint="/api/search/customers"
              defaultOptions={customerOptions.map((o) => ({ value: o.id, label: o.name }))}
              value={filters.customerId ?? ''}
              selectedLabel={selectedCustomer?.name}
              placeholder="Todos"
              searchPlaceholder="Pesquisar cliente…"
              emptyText="Sem clientes para a pesquisa."
              clearable
              triggerStyle={field}
            />
          </label>
        )}
        <label style={labelStyle}>
          Vendedor
          <select name="vendedor" defaultValue={filters.userId ?? ''} style={field}>
            <option value="">Todos</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Estado
          <select name="estado" defaultValue={filters.status === 'ACTIVE' ? '' : filters.status} style={field}>
            <option value="">Activos</option>
            <option value="CANCELLED">Cancelados</option>
            <option value="ALL">Todos</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" style={{ ...actionBtn, background: ACCENT, color: '#fff', borderColor: ACCENT, cursor: 'pointer' }}>
            <Icon name="play" size={14} />
            Gerar
          </button>
          <Link href="/relatorios/vendas" style={actionBtn}>Limpar</Link>
        </div>
      </form>

      <div className="ants-report-print">
        <div className="ants-print-only">
          <CompanyHeader
            company={company}
            title="Relatório de Vendas"
            documentNumber={report.periodLabel}
            meta={
              <div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.5 }}>
                {filters.status === 'ACTIVE' ? 'Documentos activos' : filters.status === 'CANCELLED' ? 'Documentos cancelados (fora dos totais)' : 'Todos os documentos (cancelados fora dos totais)'}
                <br />
                Gerado em {generatedAt()}
              </div>
            }
          />
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <SortHeader label="Data" ord="date" filters={filters} />
                  <SortHeader label="Descrição" ord="number" filters={filters} />
                  <SortHeader label="Total" ord="total" filters={filters} align="right" />
                  <th style={{ ...th, textAlign: 'right' }}>IVA</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor Líquido</th>
                </tr>
              </thead>
              <tbody>
                {report.documentCount === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                      Nenhum documento corresponde aos filtros.
                    </td>
                  </tr>
                ) : (
                  <>
                    {report.groups.map((group) => (
                      <Fragment key={group.documentType}>
                        <tr>
                          <td colSpan={5} style={{ ...td, fontWeight: 700, color: 'var(--text)', background: 'var(--card2)', borderTop: '1px solid var(--bd-soft)', textTransform: 'uppercase', fontSize: 11.5, letterSpacing: '.5px' }}>
                            {group.label}
                          </td>
                        </tr>
                        {group.rows.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ ...td, color: 'var(--text3)', fontStyle: 'italic' }}>Sem documentos no período.</td>
                          </tr>
                        ) : (
                          group.rows.map((row) => <DataRow key={row.number} row={row} />)
                        )}
                        <TotalRow label={group.subtotalLabel} totals={group.subtotal} />
                      </Fragment>
                    ))}
                    <TotalRow label="TOTAL GERAL" totals={report.grandTotal} grand />
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ants-print-only">
          <DocumentFooter company={company} />
        </div>
      </div>
    </div>
  );
}
