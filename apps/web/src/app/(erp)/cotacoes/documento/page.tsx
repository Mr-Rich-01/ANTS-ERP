import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { DomainError, getCompanyPrintProfile, getQuotation, hasPermission, quotationStatusLabel } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter, PrintLayout } from '@/components/print/PrintLayout';
import { DocumentLinesTable, DocumentMetaRows, DocumentNoteBox, DocumentPartyBlock, DocumentStatusPill, DocumentTotalsBlock } from '@/components/print/DocumentParts';

export const dynamic = 'force-dynamic';

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

export default async function CotacaoDocumentoPage({ searchParams }: { searchParams: { id?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.view')) redirect('/cotacoes');
  if (!searchParams.id) redirect('/cotacoes');

  const db = forCompany(ctx.companyId);
  let q;
  try {
    q = await getQuotation(db, ctx, searchParams.id);
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div style={{ padding: '14px 26px 30px' }}>
          <Link href="/cotacoes" style={topBtn}>
            <Icon name="arrow-left" size={16} />
            Voltar às cotações
          </Link>
          <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
        </div>
      );
    }
    throw e;
  }
  const company = await getCompanyPrintProfile(db, ctx);
  const expired = q.status === 'ISSUED' && q.validUntil < new Date();
  const statusColor = q.status === 'ACCEPTED' ? '#23835b' : q.status === 'REJECTED' || q.status === 'CANCELLED' ? '#8b3a32' : expired ? '#a3661f' : '#1f6fa3';
  const statusBg = q.status === 'ACCEPTED' ? '#eaf7f0' : q.status === 'REJECTED' || q.status === 'CANCELLED' ? '#fff5f3' : expired ? '#fdf3e4' : '#eaf3fa';

  return (
    <div data-screen-label="Cotação (documento)">
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 26px 0' }}>
        <Link href="/cotacoes" style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar às cotações
        </Link>
        <PrintButton label="Imprimir / Guardar PDF" />
      </div>

      <PrintLayout>
        <CompanyHeader
          company={company}
          title="Cotação"
          documentNumber={q.number}
          status={<DocumentStatusPill label={expired ? 'Expirada' : quotationStatusLabel(q.status)} color={statusColor} bg={statusBg} />}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 22 }}>
          <DocumentPartyBlock title="Cotação para" name={q.customerName} nuit={q.customerNuit} />
          <DocumentMetaRows
            rows={[
              ['Data de emissão', fmtDate(q.issueDate)],
              ['Válida até', fmtDate(q.validUntil)],
            ]}
          />
        </div>

        <DocumentLinesTable lines={q.lines} showDiscount />

        <DocumentTotalsBlock
          subtotal={q.subtotal}
          discountTotal={q.discountTotal}
          taxableBase={q.taxableBase}
          taxTotal={q.taxTotal}
          total={q.total}
          totalLabel="TOTAL DA COTAÇÃO"
          left={q.notes ? <div style={{ fontSize: 11.5, color: '#5f7378', lineHeight: 1.6 }}>{q.notes}</div> : null}
        />

        <DocumentNoteBox>
          Documento sem valor de factura: não constitui título de dívida, não movimenta stock nem contabilidade. Preços válidos até {fmtDate(q.validUntil)}.
        </DocumentNoteBox>

        <DocumentFooter company={company} />
      </PrintLayout>
    </div>
  );
}
