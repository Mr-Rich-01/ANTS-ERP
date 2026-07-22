import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { getCompanyPrintProfile, getCustomerRefund, hasPermission, refundOriginLabel, DomainError, type PaymentMethod } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter, MoneyCell, PrintLayout, SignatureBlock } from '@/components/print/PrintLayout';
import { fmt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: 'Dinheiro', MPESA: 'M-Pesa', EMOLA: 'e-Mola', CARD: 'Cartão', TRANSFER: 'Transferência', ADVANCE: 'Adiantamento' };

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

/** Documento imprimível da Devolução ao Cliente (S17) — só dinheiro; stock entra pela NC. */
export default async function DevolucaoPage({ searchParams }: { searchParams: { id?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.view')) redirect('/facturas/devolucoes');
  if (!searchParams.id) redirect('/facturas/devolucoes');

  const db = forCompany(ctx.companyId);
  let refund;
  try {
    refund = await getCustomerRefund(db, ctx, searchParams.id);
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div style={{ padding: '14px 26px 30px' }}>
          <Link href="/facturas/devolucoes" style={topBtn}>
            <Icon name="arrow-left" size={16} />
            Voltar às devoluções
          </Link>
          <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
        </div>
      );
    }
    throw e;
  }
  const company = await getCompanyPrintProfile(db, ctx);

  return (
    <div data-screen-label="Devolução ao Cliente (documento)">
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 26px 0' }}>
        <Link href="/facturas/devolucoes" style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar
        </Link>
        <PrintButton label="Imprimir / Guardar PDF" />
      </div>

      <PrintLayout>
        <CompanyHeader company={company} title="Devolução ao Cliente" documentNumber={refund.number} />

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 32, marginTop: 26 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.6px', color: '#8aa0a3', textTransform: 'uppercase', marginBottom: 8 }}>Devolvido a</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#16282c' }}>{refund.customerName}</div>
            <div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.6, marginTop: 4 }}>
              <strong style={{ color: '#16282c' }}>NUIT:</strong> {refund.customerNuit ?? '-'}
            </div>
          </div>
          <div>
            <Row label="Data" value={fmtDate(refund.issueDate)} />
            <Row label="Origem do crédito" value={`${refundOriginLabel(refund.origin)}${refund.sourceNumber ? ` · ${refund.sourceNumber}` : ''}`} />
            <Row label="Forma de pagamento" value={METHOD_LABEL[refund.method as PaymentMethod] ?? refund.method} />
            <Row label="Conta de tesouraria" value={refund.treasuryAccountName} />
            <Row label="Responsável" value={refund.createdByName ?? '-'} />
          </div>
        </div>

        <div style={{ marginTop: 28, border: '1px solid #dfe7e8', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', background: '#13343b', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>
            <div style={{ padding: '11px 14px' }}>Descrição</div>
            <div style={{ padding: '11px 14px', textAlign: 'right' }}>Valor devolvido</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', borderTop: '1px solid #eef2f2' }}>
            <div style={{ padding: '14px', color: '#16282c' }}>
              Devolução de dinheiro ao cliente com origem em {refundOriginLabel(refund.origin).toLowerCase()}
              {refund.sourceNumber ? ` ${refund.sourceNumber}` : ''}.
              <br />
              <span style={{ fontSize: 11.5, color: '#5f7378' }}>Motivo: {refund.reason}</span>
            </div>
            <div className="tnum" style={{ padding: '14px', textAlign: 'right', fontWeight: 800, color: '#16282c', whiteSpace: 'nowrap' }}>{fmt(refund.amount)}</div>
          </div>
        </div>

        {refund.origin === 'CREDIT_NOTE' && refund.creditNoteProducts.length > 0 ? (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#13343b', marginBottom: 6 }}>
              Produtos da nota de crédito {refund.sourceNumber} (informativo)
            </div>
            <div style={{ border: '1px solid #dfe7e8', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f4f4', color: '#5f7378', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '.4px' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>SKU</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Produto</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Qtd</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Preço unit.</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {refund.creditNoteProducts.map((p, i) => (
                    <tr key={`${p.sku ?? p.description}-${i}`} style={{ borderTop: '1px solid #eef2f2' }}>
                      <td className="font-mono" style={{ padding: '8px 12px', color: '#5f7378' }}>{p.sku ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#16282c' }}>{p.description}</td>
                      <td className="tnum" style={{ padding: '8px 12px', textAlign: 'center' }}>{p.quantity}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}><MoneyCell value={p.unitPrice} /></td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}><MoneyCell value={p.total} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10.5, color: '#8aa0a3', marginTop: 5, lineHeight: 1.5 }}>
              A entrada dos produtos em armazém foi registada pela própria nota de crédito — esta devolução trata apenas do dinheiro.
            </div>
          </div>
        ) : null}

        {refund.notes ? (
          <div style={{ marginTop: 18, padding: '11px 13px', borderRadius: 8, background: '#f8fbfb', color: '#5f7378', fontSize: 12, lineHeight: 1.55 }}>
            <strong>Observações:</strong> {refund.notes}
          </div>
        ) : null}

        <SignatureBlock leftLabel="O cliente (recebi a devolução)" rightLabel="O responsável" />

        <DocumentFooter company={company} />
      </PrintLayout>
    </div>
  );
}
