import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { DomainError, getCompanyPrintProfile, getCustomerPaymentReceipt, hasPermission, type PaymentMethod } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter, PrintLayout } from '@/components/print/PrintLayout';
import { fmt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: 'Dinheiro', MPESA: 'M-Pesa', EMOLA: 'e-Mola', CARD: 'Cartão', TRANSFER: 'Transferência' };
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

export default async function ReciboPage({ searchParams }: { searchParams: { id?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.view')) redirect('/facturas');
  if (!searchParams.id) redirect('/facturas');

  const db = forCompany(ctx.companyId);
  let receipt;
  try {
    receipt = await getCustomerPaymentReceipt(db, ctx, searchParams.id);
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div style={{ padding: '14px 26px 30px' }}>
          <Link href="/facturas" style={topBtn}>
            <Icon name="arrow-left" size={16} />
            Voltar às facturas
          </Link>
          <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
        </div>
      );
    }
    throw e;
  }
  const company = await getCompanyPrintProfile(db, ctx);
  const statusColor = receipt.status === 'ACTIVE' ? '#23835b' : '#8b3a32';
  const statusBg = receipt.status === 'ACTIVE' ? '#eaf7f0' : '#fff5f3';

  return (
    <div data-screen-label="Recibo (documento)">
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 26px 0' }}>
        <Link href={receipt.invoiceId ? `/facturas/documento?id=${receipt.invoiceId}` : '/facturas'} style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {receipt.invoiceId ? (
            <Link href={`/facturas/documento?id=${receipt.invoiceId}`} style={topBtn}>
              <Icon name="file-text" size={16} />
              {receipt.invoiceNumber?.startsWith('VD') ? 'Abrir VD' : 'Abrir factura normal'}
            </Link>
          ) : null}
          <PrintButton label="Imprimir / Guardar PDF" />
        </div>
      </div>

      <PrintLayout>
        <CompanyHeader
          company={company}
          title="Recibo"
          documentNumber={receipt.number}
          status={
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: statusColor, background: statusBg, padding: '3px 10px', borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
              {receipt.status === 'ACTIVE' ? 'Activo' : 'Anulado'}
            </div>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 32, marginTop: 26 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.6px', color: '#8aa0a3', textTransform: 'uppercase', marginBottom: 8 }}>Recebido de</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#16282c' }}>{receipt.customerName}</div>
            <div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.6, marginTop: 4 }}>
              <strong style={{ color: '#16282c' }}>NUIT:</strong> {receipt.customerNuit ?? '-'}
            </div>
          </div>
          <div>
            <Row label="Data" value={fmtDate(receipt.paidAt)} />
            <Row label="Documento liquidado" value={receipt.invoiceNumber ?? '-'} />
            <Row label="Método" value={METHOD_LABEL[receipt.method]} />
            <Row label="Conta de tesouraria" value={receipt.treasuryAccountName ?? '-'} />
            <Row label="Caixa / emissor" value={receipt.emittedBy ?? '-'} />
          </div>
        </div>

        <div style={{ marginTop: 28, border: '1px solid #dfe7e8', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', background: '#13343b', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>
            <div style={{ padding: '11px 14px' }}>Descrição</div>
            <div style={{ padding: '11px 14px', textAlign: 'right' }}>Valor</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', borderTop: '1px solid #eef2f2' }}>
            <div style={{ padding: '14px', color: '#16282c' }}>
              Pagamento de cliente
              {receipt.invoiceNumber
                ? ` referente ${receipt.invoiceNumber.startsWith('VD') ? `à ${receipt.invoiceNumber}` : `à factura ${receipt.invoiceNumber}`}`
                : ''}
            </div>
            <div className="tnum" style={{ padding: '14px', textAlign: 'right', fontWeight: 800, color: '#16282c', whiteSpace: 'nowrap' }}>{fmt(receipt.amount)}</div>
          </div>
        </div>

        {receipt.notes || receipt.reversalReason ? (
          <div style={{ marginTop: 18, padding: '11px 13px', borderRadius: 8, background: receipt.status === 'REVERSED' ? '#fff5f3' : '#f8fbfb', color: receipt.status === 'REVERSED' ? '#8b3a32' : '#5f7378', fontSize: 12, lineHeight: 1.55 }}>
            {receipt.notes ? <div><strong>Observações:</strong> {receipt.notes}</div> : null}
            {receipt.reversalReason ? <div><strong>Anulação:</strong> {receipt.reversalReason}{receipt.reversedAt ? ` · ${fmtDate(receipt.reversedAt)}` : ''}</div> : null}
          </div>
        ) : null}

        <DocumentFooter company={company} />
      </PrintLayout>
    </div>
  );
}
