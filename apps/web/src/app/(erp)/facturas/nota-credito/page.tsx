import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import { creditNoteStatusLabel, DomainError, getCompanyPrintProfile, getCreditNote, hasPermission } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter, PrintLayout } from '@/components/print/PrintLayout';
import { DocumentLinesTable, DocumentMetaRows, DocumentNoteBox, DocumentPartyBlock, DocumentStatusPill, DocumentTotalsBlock } from '@/components/print/DocumentParts';
import { CreditNoteCancellationDialog } from '@/components/facturas/CreditNoteCancellationDialog';

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

function fmtDateTime(d: Date): string {
  return `${fmtDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default async function NotaCreditoDocumentoPage({ searchParams }: { searchParams: { id?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.view')) redirect('/facturas');
  if (!searchParams.id) redirect('/facturas/notas');

  const db = forCompany(ctx.companyId);
  let nc;
  try {
    nc = await getCreditNote(db, ctx, searchParams.id);
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
  const active = nc.status === 'ISSUED';
  const canCancel = active && hasPermission(ctx, 'invoices.cancel');
  const cancellationDate = civilDateInTimeZone();

  return (
    <div data-screen-label="Nota de crédito (documento)">
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 26px 0' }}>
        <Link href="/facturas/notas" style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar às notas
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <Link href={`/facturas/documento?id=${nc.invoiceId}`} style={topBtn}>
            <Icon name="file-text" size={16} />
            Abrir factura {nc.invoiceNumber}
          </Link>
          {canCancel && (
            <CreditNoteCancellationDialog
              cancellationDate={cancellationDate}
              note={{ id: nc.id, number: nc.number, invoiceNumber: nc.invoiceNumber, customerName: nc.customerName, total: nc.total, returnStock: nc.returnStock }}
              trigger={
                <button style={{ ...topBtn, borderColor: '#f0d0cc', background: '#fff5f3', color: '#8b3a32', cursor: 'pointer' }}>
                  <Icon name="ban" size={16} />
                  Anular nota de crédito
                </button>
              }
            />
          )}
          <PrintButton label="Imprimir / Guardar PDF" />
        </div>
      </div>

      <PrintLayout>
        <CompanyHeader
          company={company}
          title="Nota de Crédito"
          documentNumber={nc.number}
          status={<DocumentStatusPill label={creditNoteStatusLabel(nc.status)} color={active ? '#23835b' : '#8b3a32'} bg={active ? '#eaf7f0' : '#fff5f3'} />}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 22 }}>
          <DocumentPartyBlock title="Creditar a" name={nc.customerName} nuit={nc.customerNuit} />
          <DocumentMetaRows
            rows={[
              ['Data de emissão', fmtDate(nc.issueDate)],
              ['Factura de origem', nc.invoiceNumber],
              ['Devolução de stock', nc.returnStock ? `Sim${nc.warehouseName ? ` · ${nc.warehouseName}` : ''}` : 'Não (só valor)'],
              ...(nc.cancelledAt ? [['Anulação', fmtDateTime(nc.cancelledAt)] as [string, string]] : []),
            ]}
          />
        </div>

        <DocumentLinesTable lines={nc.lines} />

        <DocumentTotalsBlock
          subtotal={nc.subtotal}
          taxableBase={nc.taxableBase}
          taxTotal={nc.taxTotal}
          total={nc.total}
          totalLabel="TOTAL CREDITADO"
          left={
            <div style={{ fontSize: 11.5, color: '#5f7378', lineHeight: 1.6 }}>
              <div>
                <strong style={{ color: '#16282c' }}>Motivo:</strong> {nc.reason}
              </div>
              {nc.notes ? <div style={{ marginTop: 8 }}>{nc.notes}</div> : null}
              {nc.cancellationReason && (
                <div style={{ marginTop: 8, padding: '8px 9px', borderRadius: 6, background: '#fff5f3', color: '#8b3a32' }}>
                  <strong>Anulada — motivo:</strong> {nc.cancellationReason}
                  {nc.cancelledByName || nc.cancelledById ? (
                    <>
                      <br />
                      <strong>Responsável:</strong> {nc.cancelledByName ?? nc.cancelledById}
                    </>
                  ) : null}
                  {nc.cancelledAt ? (
                    <>
                      <br />
                      <strong>Data/hora:</strong> {fmtDateTime(nc.cancelledAt)}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          }
        />

        <DocumentNoteBox>
          {nc.status === 'CANCELLED' ? (
            <>
              Nota de crédito ANULADA — os efeitos foram integralmente revertidos: saldo do cliente reposto
              {nc.returnStock ? ', mercadoria devolvida voltou a sair de armazém' : ''} e lançamentos estornados. O documento permanece no histórico sem efeitos.
            </>
          ) : (
            <>
              Nota de crédito emitida contra a factura {nc.invoiceNumber}. O valor foi creditado na conta-corrente do cliente.
              {nc.returnStock ? ' A mercadoria devolvida deu entrada em armazém.' : ' Sem movimento de mercadoria.'}
            </>
          )}
        </DocumentNoteBox>

        <DocumentFooter company={company} />
      </PrintLayout>
    </div>
  );
}
