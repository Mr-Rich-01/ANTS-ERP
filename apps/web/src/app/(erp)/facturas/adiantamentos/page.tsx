import Link from 'next/link';
import { forCompany } from '@ants/database';
import { advanceStateLabel, hasPermission, listCustomerAdvances, searchCustomerOptions, type CustomerAdvanceListFilters, type CustomerAdvanceState } from '@ants/domain';
import { NoPermission } from '@/components/NoPermission';
import { Icon } from '@/components/Icon';
import { SearchCombobox } from '@/components/ui/SearchCombobox';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

const STATES: CustomerAdvanceState[] = ['ABERTO', 'PARCIAL', 'CONSUMIDO', 'DEVOLVIDO', 'CANCELADO'];
const STATE_COLORS: Record<CustomerAdvanceState, [string, string]> = {
  ABERTO: ['var(--ok)', 'var(--ok-bg)'],
  PARCIAL: ['var(--info)', 'var(--info-bg)'],
  CONSUMIDO: ['var(--text3)', 'var(--bd-soft)'],
  DEVOLVIDO: ['var(--warn)', 'var(--warn-bg)'],
  CANCELADO: ['var(--bad)', 'var(--bad-bg)'],
};

const th: React.CSSProperties = { padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd-soft)' };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '0 10px', fontSize: 12.5, outline: 'none' };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' };
const topBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, textDecoration: 'none' };

function one(v: string | string[] | undefined): string | undefined {
  const value = Array.isArray(v) ? v[0] : v;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function isIsoDate(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Lista de Recibos de Adiantamento (S17) — dinheiro recebido sem factura, com saldo remanescente. */
export default async function AdiantamentosPage({ searchParams }: { searchParams: Search }) {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver os adiantamentos.
      </div>
    );
  }
  if (!hasPermission(ctx, 'sales.view')) return <NoPermission message="Não tem permissão para ver os adiantamentos." />;

  const db = forCompany(ctx.companyId);

  const state = one(searchParams.estado);
  const from = one(searchParams.de);
  const to = one(searchParams.ate);
  const filters: CustomerAdvanceListFilters = {
    q: one(searchParams.q),
    customerId: one(searchParams.customerId),
    state: STATES.some((s) => s === state) ? (state as CustomerAdvanceState) : undefined,
    from: isIsoDate(from) ? from : undefined,
    to: isIsoDate(to) ? to : undefined,
  };

  const canPickCustomer = hasPermission(ctx, 'clients.view');
  const [rows, customerOptions] = await Promise.all([
    listCustomerAdvances(db, ctx, filters),
    canPickCustomer ? searchCustomerOptions(db, ctx, { take: 20 }) : Promise.resolve([]),
  ]);
  const selectedCustomer = filters.customerId && canPickCustomer
    ? (await searchCustomerOptions(db, ctx, { ids: [filters.customerId] }))[0]
    : undefined;

  const openRows = rows.filter((r) => r.state === 'ABERTO' || r.state === 'PARCIAL');
  const openRemaining = openRows.reduce((acc, r) => acc + r.remaining, 0);
  const canCreate = hasPermission(ctx, 'payments.receive');

  return (
    <div data-screen-label="Adiantamentos" style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/facturas" style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar às facturas
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Link href="/facturas/devolucoes" style={topBtn}>
            <Icon name="undo-2" size={16} />
            Devoluções ao cliente
          </Link>
          {canCreate && (
            <Link href="/facturas/adiantamentos/novo" style={{ ...topBtn, border: 'none', background: ACCENT, color: '#fff' }}>
              <Icon name="plus" size={16} />
              Novo adiantamento
            </Link>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <form method="get" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, alignItems: 'end', padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
          <label style={labelStyle}>
            Nº do adiantamento
            <input name="q" defaultValue={filters.q ?? ''} placeholder="RA 2026/…" style={field} />
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
              />
            </label>
          )}
          <label style={labelStyle}>
            Estado
            <select name="estado" defaultValue={filters.state ?? ''} style={field}>
              <option value="">Todos</option>
              {STATES.map((s) => (
                <option key={s} value={s}>{advanceStateLabel(s)}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            De
            <input type="date" name="de" defaultValue={filters.from ?? ''} style={field} />
          </label>
          <label style={labelStyle}>
            Até
            <input type="date" name="ate" defaultValue={filters.to ?? ''} style={field} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={{ height: 36, padding: '0 16px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Filtrar
            </button>
            <Link href="/facturas/adiantamentos" style={{ ...topBtn, height: 36, fontSize: 12.5 }}>
              Limpar
            </Link>
          </div>
        </form>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Adiantamento</th>
                <th style={th}>Cliente</th>
                <th style={th}>Data</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                <th style={{ ...th, textAlign: 'right' }}>Aplicado</th>
                <th style={{ ...th, textAlign: 'right' }}>Devolvido</th>
                <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    Nenhum adiantamento corresponde aos filtros.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const [color, bg] = STATE_COLORS[r.state];
                  const cancelled = r.state === 'CANCELADO';
                  return (
                    <tr key={r.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)', opacity: cancelled ? 0.62 : undefined }}>
                      <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <Link href={`/facturas/adiantamento?id=${r.id}`} style={{ color: 'var(--accent-fg)', textDecoration: cancelled ? 'line-through' : 'none' }}>
                          {r.number}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.customerName}</td>
                      <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(r.issueDate)}</td>
                      <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(r.amount)}</td>
                      <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmt(r.appliedTotal)}</td>
                      <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmt(r.refundedTotal)}</td>
                      <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: r.remaining > 0 ? 'var(--ok)' : 'var(--text3)', whiteSpace: 'nowrap' }}>{fmt(r.remaining)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color, background: bg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                          {advanceStateLabel(r.state)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <Link href={`/facturas/adiantamento?id=${r.id}`} title="Abrir recibo de adiantamento" style={{ color: 'var(--text4)', display: 'inline-flex' }}>
                          <Icon name="chevron-right" size={17} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={6} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  Saldo por aplicar (abertos/parciais) · {openRows.length} {openRows.length === 1 ? 'adiantamento' : 'adiantamentos'}
                </td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {fmt(openRemaining)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
