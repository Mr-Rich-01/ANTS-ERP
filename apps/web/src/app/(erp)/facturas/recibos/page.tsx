import Link from 'next/link';
import { forCompany } from '@ants/database';
import { hasPermission, listCustomerPayments, searchCustomerOptions, type CustomerPaymentListFilters, type PaymentMethod } from '@ants/domain';
import { NoPermission } from '@/components/NoPermission';
import { Icon } from '@/components/Icon';
import { SearchCombobox } from '@/components/ui/SearchCombobox';
import { getContext } from '@/lib/session';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: 'Dinheiro', MPESA: 'M-Pesa', EMOLA: 'e-Mola', CARD: 'Cartão', TRANSFER: 'Transferência' };
const METHODS = Object.entries(METHOD_LABEL) as Array<[PaymentMethod, string]>;

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

/** Lista de recibos de cliente (S15) — cada recibo é um documento independente da factura. */
export default async function RecibosPage({ searchParams }: { searchParams: Search }) {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver os recibos.
      </div>
    );
  }
  if (!hasPermission(ctx, 'sales.view')) return <NoPermission message="Não tem permissão para ver os recibos." />;

  const db = forCompany(ctx.companyId);

  const method = one(searchParams.metodo);
  const status = one(searchParams.estado);
  const from = one(searchParams.de);
  const to = one(searchParams.ate);
  const filters: CustomerPaymentListFilters = {
    q: one(searchParams.q),
    customerId: one(searchParams.customerId),
    invoiceNumber: one(searchParams.factura),
    method: METHODS.some(([m]) => m === method) ? (method as PaymentMethod) : undefined,
    status: status === 'ACTIVE' || status === 'REVERSED' ? status : undefined,
    from: isIsoDate(from) ? from : undefined,
    to: isIsoDate(to) ? to : undefined,
  };

  const canPickCustomer = hasPermission(ctx, 'clients.view');
  const [rows, customerOptions] = await Promise.all([
    listCustomerPayments(db, ctx, filters),
    canPickCustomer ? searchCustomerOptions(db, ctx, { take: 20 }) : Promise.resolve([]),
  ]);
  const selectedCustomer = filters.customerId && canPickCustomer
    ? (await searchCustomerOptions(db, ctx, { ids: [filters.customerId] }))[0]
    : undefined;

  const activeTotal = rows.filter((r) => r.status === 'ACTIVE').reduce((acc, r) => acc + r.amount, 0);
  const activeCount = rows.filter((r) => r.status === 'ACTIVE').length;

  return (
    <div data-screen-label="Recibos" style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/facturas" style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar às facturas
        </Link>
        <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>
          {rows.length >= 300 ? 'A mostrar os 300 recibos mais recentes — refine os filtros.' : null}
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <form method="get" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, alignItems: 'end', padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
          <label style={labelStyle}>
            Nº do recibo
            <input name="q" defaultValue={filters.q ?? ''} placeholder="REC 2026/…" style={field} />
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
            Documento liquidado
            <input name="factura" defaultValue={filters.invoiceNumber ?? ''} placeholder="FT ou VD 2026/…" style={field} />
          </label>
          <label style={labelStyle}>
            Forma de pagamento
            <select name="metodo" defaultValue={filters.method ?? ''} style={field}>
              <option value="">Todas</option>
              {METHODS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Estado
            <select name="estado" defaultValue={filters.status ?? ''} style={field}>
              <option value="">Todos</option>
              <option value="ACTIVE">Activo</option>
              <option value="REVERSED">Anulado</option>
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
            <Link href="/facturas/recibos" style={{ ...topBtn, height: 36, fontSize: 12.5 }}>
              Limpar
            </Link>
          </div>
        </form>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Recibo</th>
                <th style={th}>Cliente</th>
                <th style={th}>Documento liquidado</th>
                <th style={th}>Data</th>
                <th style={th}>Forma de pagamento</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    Nenhum recibo corresponde aos filtros.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const reversed = r.status === 'REVERSED';
                  return (
                    <tr key={r.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)', opacity: reversed ? 0.62 : undefined }}>
                      <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <Link href={`/facturas/recibo?id=${r.id}`} style={{ color: 'var(--accent-fg)', textDecoration: reversed ? 'line-through' : 'none' }}>
                          {r.number}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.customerName}</td>
                      <td className="font-mono" style={{ padding: '12px 14px', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {r.invoiceId ? (
                          <Link href={`/facturas/documento?id=${r.invoiceId}`} style={{ color: 'var(--accent-fg)' }}>
                            {r.invoiceNumber}
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--text3)' }}>—</span>
                        )}
                      </td>
                      <td className="tnum" style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(r.paidAt)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{METHOD_LABEL[r.method]}</td>
                      <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', textDecoration: reversed ? 'line-through' : undefined }}>
                        {fmt(r.amount)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: reversed ? 'var(--bad)' : 'var(--ok)', background: reversed ? 'var(--bad-bg)' : 'var(--ok-bg)', padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: reversed ? 'var(--bad)' : 'var(--ok)' }} />
                          {reversed ? 'Anulado' : 'Activo'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <Link href={`/facturas/recibo?id=${r.id}`} title="Abrir recibo imprimível" style={{ color: 'var(--text4)', display: 'inline-flex' }}>
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
                <td colSpan={5} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  Total recebido (activos) · {activeCount} {activeCount === 1 ? 'recibo' : 'recibos'}
                </td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {fmt(activeTotal)}
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
