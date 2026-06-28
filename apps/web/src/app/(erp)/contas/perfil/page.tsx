import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { getCustomer, hasPermission, DomainError } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { fmt } from '@/lib/format';
import { initials } from '@/lib/ui-format';
import { getProfile, type ProfileType } from '@/lib/data/profile';
import { CustomerFormDialog, type CustomerFormValues } from '@/components/clientes/CustomerFormDialog';

export const dynamic = 'force-dynamic';

const th: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.5px',
  color: 'var(--text3)',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--bd-soft)',
};
const meta: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 };

interface MiniKpi {
  label: string;
  value: string;
  color: string;
}
interface ExtractRow {
  date: string;
  doc: string;
  desc: string;
  debStr: string;
  credStr: string;
  debCol: string;
  credCol: string;
  saldoStr: string;
}
interface ProfileView {
  ini: string;
  name: string;
  typeLabel: string;
  typeColor: string;
  typeBg: string;
  nuit: string;
  address: string;
  phone: string;
  email: string;
  actionLabel: string;
  actionIcon: string;
  mini: MiniKpi[];
  extract: ExtractRow[];
  saldoFinalStr: string;
}

export default async function PerfilContaPage({ searchParams }: { searchParams: { type?: string; id?: string } }) {
  const type: ProfileType = searchParams.type === 'supplier' ? 'supplier' : 'client';
  const backHref = type === 'supplier' ? '/fornecedores' : '/clientes';

  // Cliente real (CRM, Fase 2). Fornecedores continuam com dados de demonstração até à sua fase.
  let view: ProfileView;
  let editInitial: CustomerFormValues | null = null;

  if (type === 'client' && searchParams.id) {
    const ctx = await getContext();
    if (!ctx.companyId || !hasPermission(ctx, 'clients.view')) redirect('/clientes');
    let customer;
    try {
      customer = await getCustomer(forCompany(ctx.companyId), ctx, searchParams.id);
    } catch (e) {
      if (e instanceof DomainError) {
        return (
          <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Link href={backHref} style={backBtn}>
              <Icon name="arrow-left" size={16} />
              Voltar à lista
            </Link>
            <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
          </div>
        );
      }
      throw e;
    }

    const available = customer.creditLimit - customer.balance;
    view = {
      ini: initials(customer.name),
      name: customer.name,
      typeLabel: 'Cliente',
      typeColor: 'var(--accent-fg)',
      typeBg: 'var(--accent-bg)',
      nuit: customer.nuit ?? '—',
      address: customer.address ?? '—',
      phone: customer.phone ?? '—',
      email: customer.email ?? '—',
      actionLabel: 'Nova factura',
      actionIcon: 'receipt-text',
      mini: [
        { label: 'Saldo actual', value: fmt(customer.balance), color: customer.balance > 0 ? 'var(--bad)' : customer.balance < 0 ? 'var(--info)' : 'var(--text)' },
        { label: 'Limite de crédito', value: fmt(customer.creditLimit), color: 'var(--text)' },
        { label: 'Crédito disponível', value: fmt(available), color: available < 0 ? 'var(--bad)' : 'var(--text)' },
        { label: 'Prazo de pagamento', value: `${customer.paymentTermDays} dias`, color: 'var(--text)' },
      ],
      extract: [],
      saldoFinalStr: fmt(customer.balance),
    };
    editInitial = {
      id: customer.id,
      name: customer.name,
      type: customer.type,
      nuit: customer.nuit,
      email: customer.email,
      phone: customer.phone,
      segment: customer.segment,
      province: customer.province,
      district: customer.district,
      address: customer.address,
      creditLimit: customer.creditLimit,
      paymentTermDays: customer.paymentTermDays,
    };
  } else {
    view = getProfile(type);
  }

  const pf = view;

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link href={backHref} style={backBtn}>
        <Icon name="arrow-left" size={16} />
        Voltar à lista
      </Link>

      {/* Cabeçalho */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 22px', display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <span style={{ width: 60, height: 60, borderRadius: 16, background: 'linear-gradient(135deg,#1b4651,#0e2a30)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 700, flex: 'none' }}>
          {pf.ini}
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{pf.name}</h2>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: pf.typeColor, background: pf.typeBg, padding: '3px 10px', borderRadius: 20 }}>{pf.typeLabel}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 22, rowGap: 6, marginTop: 10 }}>
            <span style={meta}>
              <Icon name="hash" size={14} color="var(--text3)" />
              NUIT {pf.nuit}
            </span>
            <span style={meta}>
              <Icon name="map-pin" size={14} color="var(--text3)" />
              {pf.address}
            </span>
            <span style={meta}>
              <Icon name="phone" size={14} color="var(--text3)" />
              {pf.phone}
            </span>
            <span style={meta}>
              <Icon name="mail" size={14} color="var(--text3)" />
              {pf.email}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9, flex: 'none' }}>
          {editInitial ? (
            <CustomerFormDialog
              mode="edit"
              initial={editInitial}
              trigger={
                <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <Icon name="pencil" size={15} />
                  Editar
                </button>
              }
            />
          ) : (
            <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600 }}>
              <Icon name="pencil" size={15} />
              Editar
            </button>
          )}
          <button
            disabled={!!editInitial}
            title={editInitial ? 'Disponível na Fase 4 — Vendas' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, opacity: editInitial ? 0.55 : 1, cursor: editInitial ? 'not-allowed' : 'pointer' }}
          >
            <Icon name={pf.actionIcon} size={15} />
            {pf.actionLabel}
          </button>
        </div>
      </div>

      {/* Mini KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        {pf.mini.map((m) => (
          <div key={m.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{m.label}</span>
            <span className="tnum" style={{ fontSize: 20, fontWeight: 700, color: m.color }}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      {/* Extracto */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="scroll-text" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Extracto de conta</div>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>· Junho 2026</span>
          <div style={{ flex: 1 }} />
        </div>
        {pf.extract.length === 0 ? (
          <div style={{ padding: '40px 18px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text4)', display: 'inline-flex' }}>
              <Icon name="scroll-text" size={28} />
            </span>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text2)' }}>Sem movimentos</div>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', maxWidth: 360 }}>
              Os movimentos de conta-corrente surgem com as facturas e recibos (Fase 4 — Vendas). Saldo actual: <strong className="tnum" style={{ color: 'var(--text)' }}>{pf.saldoFinalStr}</strong>.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Data</th>
                  <th style={th}>Documento</th>
                  <th style={th}>Descrição</th>
                  <th style={{ ...th, textAlign: 'right' }}>Débito</th>
                  <th style={{ ...th, textAlign: 'right' }}>Crédito</th>
                  <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {pf.extract.map((e, i) => (
                  <tr key={i} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {e.date}
                    </td>
                    <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {e.doc}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)' }}>{e.desc}</td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: e.debCol }}>
                      {e.debStr}
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: e.credCol }}>
                      {e.credStr}
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {e.saldoStr}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--card2)' }}>
                  <td colSpan={5} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                    Saldo final
                  </td>
                  <td className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                    {pf.saldoFinalStr}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  height: 34,
  padding: '0 13px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text2)',
  fontSize: 12.5,
  fontWeight: 600,
  width: 'max-content',
};
