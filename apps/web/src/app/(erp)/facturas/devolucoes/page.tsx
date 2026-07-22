import Link from 'next/link';
import { forCompany } from '@ants/database';
import { hasPermission, listCustomerRefunds, refundOriginLabel, searchCustomerOptions, type CustomerRefundListFilters, type CustomerRefundOrigin } from '@ants/domain';
import { NoPermission } from '@/components/NoPermission';
import { Icon } from '@/components/Icon';
import { SearchCombobox } from '@/components/ui/SearchCombobox';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

const ORIGINS: CustomerRefundOrigin[] = ['ADVANCE', 'CREDIT_NOTE', 'RECEIPT'];
const METHOD_LABEL: Record<string, string> = { CASH: 'Dinheiro', MPESA: 'M-Pesa', EMOLA: 'e-Mola', CARD: 'Cartão', TRANSFER: 'Transferência' };

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

/** Lista de Devoluções ao Cliente (S17) — documentos que justificam a devolução de dinheiro. */
export default async function DevolucoesPage({ searchParams }: { searchParams: Search }) {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver as devoluções.
      </div>
    );
  }
  if (!hasPermission(ctx, 'sales.view')) return <NoPermission message="Não tem permissão para ver as devoluções." />;

  const db = forCompany(ctx.companyId);

  const origin = one(searchParams.origem);
  const from = one(searchParams.de);
  const to = one(searchParams.ate);
  const filters: CustomerRefundListFilters = {
    q: one(searchParams.q),
    customerId: one(searchParams.customerId),
    origin: ORIGINS.some((o) => o === origin) ? (origin as CustomerRefundOrigin) : undefined,
    from: isIsoDate(from) ? from : undefined,
    to: isIsoDate(to) ? to : undefined,
  };

  const canPickCustomer = hasPermission(ctx, 'clients.view');
  const [rows, customerOptions] = await Promise.all([
    listCustomerRefunds(db, ctx, filters),
    canPickCustomer ? searchCustomerOptions(db, ctx, { take: 20 }) : Promise.resolve([]),
  ]);
  const selectedCustomer = filters.customerId && canPickCustomer
    ? (await searchCustomerOptions(db, ctx, { ids: [filters.customerId] }))[0]
    : undefined;

  const total = rows.reduce((acc, r) => acc + r.amount, 0);
  const canCreate = hasPermission(ctx, 'treasury.createMovement');

  return (
    <div data-screen-label="Devoluções ao cliente" style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/facturas" style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar às facturas
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Link href="/facturas/adiantamentos" style={topBtn}>
            <Icon name="hand-coins" size={16} />
            Adiantamentos
          </Link>
          {canCreate && (
            <Link href="/facturas/devolucoes/nova" style={{ ...topBtn, border: 'none', background: ACCENT, color: '#fff' }}>
              <Icon name="plus" size={16} />
              Nova devolução
            </Link>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <form method="get" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, alignItems: 'end', padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
          <label style={labelStyle}>
            Nº da devolução
            <input name="q" defaultValue={filters.q ?? ''} placeholder="DEV 2026/…" style={field} />
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
            Origem
            <select name="origem" defaultValue={filters.origin ?? ''} style={field}>
              <option value="">Todas</option>
              {ORIGINS.map((o) => (
                <option key={o} value={o}>{refundOriginLabel(o)}</option>
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
            <Link href="/facturas/devolucoes" style={{ ...topBtn, height: 36, fontSize: 12.5 }}>
              Limpar
            </Link>
          </div>
        </form>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Devolução</th>
                <th style={th}>Cliente</th>
                <th style={th}>Data</th>
                <th style={th}>Origem</th>
                <th style={th}>Documento de origem</th>
                <th style={th}>Forma de pagamento</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                <th style={{ ...th, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    Nenhuma devolução corresponde aos filtros.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <Link href={`/facturas/devolucao?id=${r.id}`} style={{ color: 'var(--accent-fg)' }}>
                        {r.number}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.customerName}</td>
                    <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(r.issueDate)}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{refundOriginLabel(r.origin)}</td>
                    <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{r.sourceNumber ?? '—'}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{METHOD_LABEL[r.method] ?? r.method}</td>
                    <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(r.amount)}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                      <Link href={`/facturas/devolucao?id=${r.id}`} title="Abrir devolução imprimível" style={{ color: 'var(--text4)', display: 'inline-flex' }}>
                        <Icon name="chevron-right" size={17} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={6} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  Total devolvido · {rows.length} {rows.length === 1 ? 'devolução' : 'devoluções'}
                </td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {fmt(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
