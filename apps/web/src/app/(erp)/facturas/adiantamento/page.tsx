import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { advanceStateLabel, getCompanyPrintProfile, getCustomerAdvance, hasPermission, DomainError, type CustomerAdvanceState, type PaymentMethod } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter, PrintLayout, SignatureBlock } from '@/components/print/PrintLayout';
import { fmt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: 'Dinheiro', MPESA: 'M-Pesa', EMOLA: 'e-Mola', CARD: 'Cartão', TRANSFER: 'Transferência', ADVANCE: 'Adiantamento' };
const STATE_COLORS: Record<CustomerAdvanceState, [string, string]> = {
  ABERTO: ['#23835b', '#eaf7f0'],
  PARCIAL: ['#1f6f8b', '#eef7fa'],
  CONSUMIDO: ['#5f7378', '#f1f4f4'],
  DEVOLVIDO: ['#8a6d1a', '#fdf6e3'],
  CANCELADO: ['#8b3a32', '#fff5f3'],
};

const topBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  height: 38,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text2)',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
};

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, padding: '10px 0', borderBottom: '1px solid #eef2f2' }}>
      <span style={{ fontSize: 12, color: '#5f7378' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#16282c', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

/** Documento imprimível do Recibo de Adiantamento (S17) — sem dados bancários (regra S15). */
export default async function AdiantamentoPage({ searchParams }: { searchParams: { id?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.view')) redirect('/facturas/adiantamentos');
  if (!searchParams.id) redirect('/facturas/adiantamentos');

  const db = forCompany(ctx.companyId);
  let advance;
  try {
    advance = await getCustomerAdvance(db, ctx, searchParams.id);
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div style={{ padding: '14px 26px 30px' }}>
          <Link href="/facturas/adiantamentos" style={topBtn}>
            <Icon name="arrow-left" size={16} />
            Voltar aos adiantamentos
          </Link>
          <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
        </div>
      );
    }
    throw e;
  }
  const company = await getCompanyPrintProfile(db, ctx);
  const [stateColor, stateBg] = STATE_COLORS[advance.state];
  const canRefund = hasPermission(ctx, 'treasury.createMovement') && advance.remaining > 0 && advance.state !== 'CANCELADO';

  return (
    <div data-screen-label="Recibo de Adiantamento (documento)">
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 26px 0' }}>
        <Link href="/facturas/adiantamentos" style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {canRefund && (
            <Link href={`/facturas/devolucoes/nova?ra=${advance.id}`} style={topBtn}>
              <Icon name="undo-2" size={16} />
              Devolver remanescente
            </Link>
          )}
          <PrintButton label="Imprimir / Guardar PDF" />
        </div>
      </div>

      <PrintLayout>
        <CompanyHeader
          company={company}
          title="Recibo de Adiantamento"
          documentNumber={advance.number}
          status={
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: stateColor, background: stateBg, padding: '3px 10px', borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: stateColor }} />
              {advanceStateLabel(advance.state)}
            </div>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 32, marginTop: 26 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.6px', color: '#8aa0a3', textTransform: 'uppercase', marginBottom: 8 }}>Recebido de</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#16282c' }}>{advance.customerName}</div>
            <div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.6, marginTop: 4 }}>
              <strong style={{ color: '#16282c' }}>NUIT:</strong> {advance.customerNuit ?? '-'}
            </div>
          </div>
          <div>
            <Row label="Data" value={fmtDate(advance.issueDate)} />
            <Row label="Forma de pagamento" value={METHOD_LABEL[advance.method as PaymentMethod] ?? advance.method} />
            <Row label="Conta de tesouraria" value={advance.treasuryAccountName} />
            <Row label="Motivo / referência" value={advance.reference ?? '-'} />
            <Row label="Caixa / emissor" value={advance.createdByName ?? '-'} />
          </div>
        </div>

        <div style={{ marginTop: 28, border: '1px solid #dfe7e8', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', background: '#13343b', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>
            <div style={{ padding: '11px 14px' }}>Descrição</div>
            <div style={{ padding: '11px 14px', textAlign: 'right' }}>Valor</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', borderTop: '1px solid #eef2f2' }}>
            <div style={{ padding: '14px', color: '#16282c' }}>
              Adiantamento de cliente, por conta de fornecimentos futuros
              {advance.reference ? ` — ${advance.reference}` : ''}. Sem IVA: o imposto é liquidado na factura.
            </div>
            <div className="tnum" style={{ padding: '14px', textAlign: 'right', fontWeight: 800, color: '#16282c', whiteSpace: 'nowrap' }}>{fmt(advance.amount)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
          {([
            ['Aplicado em facturas', advance.appliedTotal],
            ['Devolvido ao cliente', advance.refundedTotal],
            ['Saldo remanescente', advance.remaining],
          ] as const).map(([l, v]) => (
            <div key={l} style={{ border: '1px solid #dfe7e8', borderRadius: 8, padding: '10px 13px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.5px', color: '#8aa0a3', textTransform: 'uppercase' }}>{l}</div>
              <div className="tnum" style={{ fontSize: 15, fontWeight: 800, color: '#16282c', marginTop: 4 }}>{fmt(v)}</div>
            </div>
          ))}
        </div>

        {advance.applications.length > 0 || advance.refunds.length > 0 ? (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#13343b', marginBottom: 6 }}>
              Movimentos do adiantamento
            </div>
            <div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.7 }}>
              {advance.applications.map((a) => (
                <div key={a.id}>
                  {fmtDate(a.createdAt)} · Aplicado à factura <strong style={{ color: '#16282c' }}>{a.invoiceNumber}</strong> pelo recibo {a.paymentNumber} — {fmt(a.amount)}
                </div>
              ))}
              {advance.refunds.map((r) => (
                <div key={r.id}>
                  {fmtDate(r.issueDate)} · Devolvido ao cliente pela <strong style={{ color: '#16282c' }}>{r.number}</strong> — {fmt(r.amount)}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {advance.notes ? (
          <div style={{ marginTop: 18, padding: '11px 13px', borderRadius: 8, background: '#f8fbfb', color: '#5f7378', fontSize: 12, lineHeight: 1.55 }}>
            <strong>Observações:</strong> {advance.notes}
          </div>
        ) : null}

        <SignatureBlock leftLabel="O cliente" rightLabel="Pela empresa" />

        <DocumentFooter company={company} />
      </PrintLayout>
    </div>
  );
}
