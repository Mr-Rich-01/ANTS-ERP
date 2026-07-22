import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { getCustomerAdvance, getCustomerRefundFormContext, hasPermission, listAccounts, searchCustomerOptions, DomainError } from '@ants/domain';
import { NoPermission } from '@/components/NoPermission';
import { Icon } from '@/components/Icon';
import { SearchCombobox } from '@/components/ui/SearchCombobox';
import { getContext } from '@/lib/session';
import { ACCENT } from '@/lib/erp-nav';
import { NovaDevolucaoClient } from './NovaDevolucaoClient';

export const dynamic = 'force-dynamic';

const topBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, textDecoration: 'none' };

/**
 * Nova Devolução ao Cliente (S17). O cliente chega por `?cliente=` (escolhido no passo
 * abaixo), `?ra=` (a partir do documento do RA) ou selecção manual. A devolução trata
 * SÓ do dinheiro — quando há devolução física, o stock entra pela NC referenciada.
 */
export default async function NovaDevolucaoPage({ searchParams }: { searchParams: { cliente?: string; ra?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId) redirect('/facturas/devolucoes');
  if (!hasPermission(ctx, 'treasury.createMovement')) {
    return <NoPermission message="Não tem permissão para registar devoluções ao cliente." />;
  }

  const db = forCompany(ctx.companyId);

  // Entrada a partir de um RA: resolve o cliente e pré-selecciona a origem.
  let customerId = searchParams.cliente?.trim() || undefined;
  let preselectedAdvanceId: string | null = null;
  if (!customerId && searchParams.ra) {
    try {
      const advance = await getCustomerAdvance(db, ctx, searchParams.ra);
      customerId = advance.customerId;
      preselectedAdvanceId = advance.id;
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
    }
  }

  const canPickCustomer = hasPermission(ctx, 'clients.view');

  if (!customerId) {
    const customers = canPickCustomer ? await searchCustomerOptions(db, ctx, { take: 20 }) : [];
    return (
      <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Link href="/facturas/devolucoes" style={topBtn}>
            <Icon name="arrow-left" size={16} />
            Voltar às devoluções
          </Link>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 22px', maxWidth: 520 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Nova devolução ao cliente</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
            Seleccione o cliente para ver os adiantamentos abertos e as notas de crédito com crédito disponível.
          </div>
          {canPickCustomer ? (
            <form method="get" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SearchCombobox
                name="cliente"
                searchEndpoint="/api/search/customers?active=1"
                defaultOptions={customers.map((o) => ({ value: o.id, label: o.name, sublabel: o.nuit ? `NUIT ${o.nuit}` : undefined }))}
                value=""
                placeholder="— Seleccione o cliente —"
                searchPlaceholder="Pesquisar por nome ou NUIT…"
                emptyText="Sem clientes para a pesquisa."
              />
              <button type="submit" style={{ height: 42, borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                Continuar
              </button>
            </form>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>
              Sem permissão para listar clientes — abra a devolução a partir do documento do Recibo de Adiantamento.
            </div>
          )}
        </div>
      </div>
    );
  }

  let formContext;
  try {
    formContext = await getCustomerRefundFormContext(db, ctx, customerId);
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div style={{ padding: '14px 26px 30px' }}>
          <Link href="/facturas/devolucoes/nova" style={topBtn}>
            <Icon name="arrow-left" size={16} />
            Escolher outro cliente
          </Link>
          <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
        </div>
      );
    }
    throw e;
  }

  const accounts = hasPermission(ctx, 'treasury.view')
    ? (await listAccounts(db, ctx)).filter((a) => a.status === 'ACTIVE').map((a) => ({ id: a.id, label: a.name }))
    : [];

  return (
    <NovaDevolucaoClient
      customerId={customerId}
      customerName={formContext.customerName}
      creditAvailable={formContext.creditAvailable}
      openAdvances={formContext.openAdvances}
      refundableCreditNotes={formContext.refundableCreditNotes}
      accounts={accounts}
      preselectedAdvanceId={preselectedAdvanceId}
      canChangeCustomer={canPickCustomer}
    />
  );
}
