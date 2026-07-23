import Link from 'next/link';
import { forCompany } from '@ants/database';
import {
  getCompanyPrintProfile,
  getCountSheetFilterOptions,
  getStockCountSheet,
  hasPermission,
  COUNT_SHEET_MODE_LABEL,
  type CountSheetDir,
  type CountSheetFilters,
  type CountSheetMode,
  type CountSheetSort,
} from '@ants/domain';
import { Icon } from '@/components/Icon';
import { NoPermission } from '@/components/NoPermission';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter, SignatureBlock } from '@/components/print/PrintLayout';
import { getContext } from '@/lib/session';
import { ACCENT } from '@/lib/erp-nav';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', background: 'var(--card2)', borderBottom: '1px solid var(--bd-soft)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, color: 'var(--text2)', borderTop: '1px solid var(--bd-soft2)' };
/** Célula vazia para preenchimento manual: caixa com fundo branco garantido na impressão. */
const writeCell: React.CSSProperties = { ...td, background: '#fff', borderLeft: '1px solid var(--bd-soft)', minWidth: 90 };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '0 10px', fontSize: 12.5, outline: 'none' };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' };
const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' };

function one(v: string | string[] | undefined): string | undefined {
  const value = Array.isArray(v) ? v[0] : v;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function filtersFromSearch(searchParams: Search): CountSheetFilters {
  const modo = one(searchParams.modo);
  const ord = one(searchParams.ord);
  const dir = one(searchParams.dir);
  return {
    warehouseId: one(searchParams.armazem),
    category: one(searchParams.categoria),
    search: one(searchParams.q),
    mode: modo === 'NEGATIVE' || modo === 'INACTIVE' || modo === 'ALL' ? (modo as CountSheetMode) : 'ZERO',
    sort: ord === 'name' || ord === 'category' ? (ord as CountSheetSort) : 'code',
    dir: dir === 'desc' ? 'desc' : 'asc',
  };
}

function queryString(filters: CountSheetFilters, overrides: Partial<{ ord: CountSheetSort; dir: CountSheetDir }> = {}): string {
  const qs = new URLSearchParams();
  if (filters.warehouseId) qs.set('armazem', filters.warehouseId);
  if (filters.category) qs.set('categoria', filters.category);
  if (filters.search) qs.set('q', filters.search);
  if (filters.mode && filters.mode !== 'ZERO') qs.set('modo', filters.mode);
  const ord = overrides.ord ?? filters.sort ?? 'code';
  const dir = overrides.dir ?? filters.dir ?? 'asc';
  if (ord !== 'code') qs.set('ord', ord);
  if (dir !== 'asc') qs.set('dir', dir);
  return qs.toString();
}

function sortHref(filters: CountSheetFilters, ord: CountSheetSort): string {
  const active = (filters.sort ?? 'code') === ord;
  const dir: CountSheetDir = active && (filters.dir ?? 'asc') === 'asc' ? 'desc' : 'asc';
  const qs = queryString(filters, { ord, dir });
  return qs ? `/inventario/folha-contagem?${qs}` : '/inventario/folha-contagem';
}

function SortHeader({ label, ord, filters }: { label: string; ord: CountSheetSort; filters: CountSheetFilters }) {
  const active = (filters.sort ?? 'code') === ord;
  return (
    <th style={th}>
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

/** Folha de Contagem Física (S18, item 10) — lista imprimível com colunas de escrita manual. */
export default async function FolhaContagemPage({ searchParams }: { searchParams: Search }) {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para gerar a folha de contagem.
      </div>
    );
  }
  if (!hasPermission(ctx, 'stock.view')) return <NoPermission message="Não tem permissão para ver o stock." />;

  const db = forCompany(ctx.companyId);
  const rawFilters = filtersFromSearch(searchParams);
  const canExport = hasPermission(ctx, 'reports.export');
  const [sheet, options, company, user] = await Promise.all([
    getStockCountSheet(db, ctx, rawFilters),
    getCountSheetFilterOptions(db, ctx),
    getCompanyPrintProfile(db, ctx),
    ctx.userId ? db.user.findFirst({ where: { id: ctx.userId }, select: { name: true, email: true } }) : Promise.resolve(null),
  ]);
  const filters = sheet.filters;
  const exportQs = queryString(filters);
  const exportHref = `/inventario/folha-contagem/exportar${exportQs ? `?${exportQs}` : ''}`;
  const userName = user?.name || user?.email || '—';

  return (
    <div data-screen-label="Folha de Contagem Física" style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/inventario" style={actionBtn}>
          <Icon name="arrow-left" size={15} />
          Inventário
        </Link>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Folha de Contagem Física</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>
            {COUNT_SHEET_MODE_LABEL[filters.mode]} · Armazém: {sheet.warehouseName ?? 'Todos'} · {sheet.rows.length} linha{sheet.rows.length === 1 ? '' : 's'}
            {sheet.truncated ? ' · lista cortada no tecto — refine os filtros' : ''}
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

      <form method="get" className="ants-noprint" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, alignItems: 'end' }}>
        <label style={labelStyle}>
          Armazém
          <select name="armazem" defaultValue={filters.warehouseId ?? ''} style={field}>
            <option value="">Todos</option>
            {options.warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Categoria
          <select name="categoria" defaultValue={filters.category ?? ''} style={field}>
            <option value="">Todas</option>
            {options.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Produto
          <input name="q" defaultValue={filters.search ?? ''} placeholder="Nome ou código…" style={field} />
        </label>
        <label style={labelStyle}>
          Modo
          <select name="modo" defaultValue={filters.mode === 'ZERO' ? '' : filters.mode} style={field}>
            <option value="">Sem stock (= 0)</option>
            <option value="NEGATIVE">Stock negativo (&lt; 0)</option>
            <option value="INACTIVE">Produtos inactivos</option>
            <option value="ALL">Todos os produtos</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" style={{ ...actionBtn, background: ACCENT, color: '#fff', borderColor: ACCENT, cursor: 'pointer' }}>
            <Icon name="play" size={14} />
            Gerar
          </button>
          <Link href="/inventario/folha-contagem" style={actionBtn}>Limpar</Link>
        </div>
      </form>

      <div className="ants-report-print">
        <div className="ants-print-only">
          <CompanyHeader
            company={company}
            title="Folha de Contagem Física"
            documentNumber={sheet.warehouseName ? `Armazém: ${sheet.warehouseName}` : 'Todos os armazéns'}
            meta={
              <div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.5 }}>
                {COUNT_SHEET_MODE_LABEL[filters.mode]}
                <br />
                Emitido em {generatedAt()} por {userName}
                <br />
                Contagem realizada por: ______________________________
              </div>
            }
          />
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <SortHeader label="Código" ord="code" filters={filters} />
                  <SortHeader label="Produto" ord="name" filters={filters} />
                  <SortHeader label="Categoria" ord="category" filters={filters} />
                  <th style={th}>Armazém</th>
                  <th style={{ ...th, textAlign: 'right' }}>Stock no Sistema</th>
                  <th style={{ ...th, borderLeft: '1px solid var(--bd-soft)' }}>Quantidade Contada</th>
                  <th style={{ ...th, borderLeft: '1px solid var(--bd-soft)' }}>Diferença</th>
                  <th style={{ ...th, borderLeft: '1px solid var(--bd-soft)' }}>Observações</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                      Nenhum produto corresponde aos filtros.
                    </td>
                  </tr>
                ) : (
                  sheet.rows.map((row) => (
                    <tr key={`${row.productId}-${row.warehouseId}`} className="ants-row">
                      <td className="font-mono" style={{ ...td, whiteSpace: 'nowrap' }}>{row.sku}</td>
                      <td style={{ ...td, color: 'var(--text)', fontWeight: 500 }}>
                        {row.name}
                        {row.inactive ? (
                          <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', background: 'var(--bd-soft)', padding: '2px 7px', borderRadius: 7 }}>INACTIVO</span>
                        ) : null}
                      </td>
                      <td style={td}>{row.category ?? '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{row.warehouseName}</td>
                      <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 600, color: row.quantity < 0 ? 'var(--bad)' : 'var(--text)' }}>{row.quantity}</td>
                      <td style={writeCell}>&nbsp;</td>
                      <td style={writeCell}>&nbsp;</td>
                      <td style={{ ...writeCell, minWidth: 150 }}>&nbsp;</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ants-print-only">
          <SignatureBlock leftLabel="Contado por (nome e assinatura)" rightLabel="Conferido por (nome e assinatura)" />
          <DocumentFooter company={company} />
        </div>
      </div>
    </div>
  );
}
