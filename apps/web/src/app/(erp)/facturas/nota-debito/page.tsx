import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { debitNoteStatusLabel, DomainError, getCompanyPrintProfile, getDebitNote, hasPermission } from '@ants/domain';
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

export default async function NotaDebitoDocumentoPage({ searchParams }: { searchParams: { id?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.view')) redirect('/facturas');
  if (!searchParams.id) redirect('/facturas/notas');

  const db = forCompany(ctx.companyId);
  let nd;
  try {
    nd = await getDebitNote(db, ctx, searchParams.id);
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div style={{ padding: '14px 26px 30px' }}>
          <Link href="/facturas/notas" style={topBtn}>
            <Icon name="arrow-left" size={16} />
            Voltar às notas
          </Link>
          <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
        </div>
      );
    }
    throw e;
  }
  const company = await getCompanyPrintProfile(db, ctx);
  const active = nd.status === 'ISSUED';

  return (
    <div data-screen-label="Nota de débito (documento)">
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 26px 0' }}>
        <Link href="/facturas/notas" style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar às notas
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {nd.invoiceId ? (
            <Link href={`/facturas/documento?id=${nd.invoiceId}`} style={topBtn}>
              <Icon name="file-text" size={16} />
              Abrir factura {nd.invoiceNumber}
            </Link>
          ) : null}
          <PrintButton label="Imprimir / Guardar PDF" />
        </div>
      </div>

      <PrintLayout>
        <CompanyHeader
          company={company}
          title="Nota de Débito"
          documentNumber={nd.number}
          status={<DocumentStatusPill label={debitNoteStatusLabel(nd.status)} color={active ? '#23835b' : '#8b3a32'} bg={active ? '#eaf7f0' : '#fff5f3'} />}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 22 }}>
          <DocumentPartyBlock title="Debitar a" name={nd.customerName} nuit={nd.customerNuit} />
          <DocumentMetaRows
            rows={[
              ['Data de emissão', fmtDate(nd.issueDate)],
              ['Factura relacionada', nd.invoiceNumber ?? '—'],
            ]}
          />
        </div>

        <DocumentLinesTable lines={nd.lines} />

        <DocumentTotalsBlock
          subtotal={nd.subtotal}
          taxableBase={nd.taxableBase}
          taxTotal={nd.taxTotal}
          total={nd.total}
          totalLabel="TOTAL A PAGAR"
          left={
            <div style={{ fontSize: 11.5, color: '#5f7378', lineHeight: 1.6 }}>
              <div>
                <strong style={{ color: '#16282c' }}>Motivo:</strong> {nd.reason}
              </div>
              {nd.notes ? <div style={{ marginTop: 8 }}>{nd.notes}</div> : null}
            </div>
          }
        />

        <DocumentNoteBox>
          Nota de débito emitida{nd.invoiceNumber ? ` com referência à factura ${nd.invoiceNumber}` : ''}. O valor foi debitado na conta-corrente do cliente. Sem movimento de mercadoria.
        </DocumentNoteBox>

        <DocumentFooter company={company} />
      </PrintLayout>
    </div>
  );
}
