import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { DomainError, getCompanyPrintProfile, getPurchaseOrder, hasPermission, type PurchaseStatus } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter, PrintLayout, SignatureBlock } from '@/components/print/PrintLayout';
import { DocumentLinesTable, DocumentMetaRows, DocumentNoteBox, DocumentPartyBlock, DocumentStatusPill, DocumentTotalsBlock } from '@/components/print/DocumentParts';

export const dynamic = 'force-dynamic';

const STATUS: Record<PurchaseStatus, [string, string, string]> = {
  DRAFT: ['Rascunho', '#5f7378', '#eef2f2'],
  SENT: ['Enviada', '#1f6fa3', '#eaf3fa'],
  PARTIAL: ['Recepção parcial', '#a3661f', '#fdf3e4'],
  RECEIVED: ['Recebida', '#23835b', '#eaf7f0'],
  CANCELLED: ['Cancelada', '#8b3a32', '#fff5f3'],
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

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default async function OcDocumentoPage({ searchParams }: { searchParams: { id?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'purchases.create')) redirect('/compras');
  if (!searchParams.id) redirect('/compras');

  const db = forCompany(ctx.companyId);
  let oc;
  try {
    oc = await getPurchaseOrder(db, ctx, searchParams.id);
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div style={{ padding: '14px 26px 30px' }}>
          <Link href="/compras" style={topBtn}>
            <Icon name="arrow-left" size={16} />
            Voltar às compras
          </Link>
          <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
        </div>
      );
    }
    throw e;
  }
  const company = await getCompanyPrintProfile(db, ctx);
  const [statusLabel, statusColor, statusBg] = STATUS[oc.status];

  return (
    <div data-screen-label="Ordem de compra (documento)">
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 26px 0' }}>
        <Link href={`/compras/ordem?id=${oc.id}`} style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar ao detalhe da OC
        </Link>
        <PrintButton label="Imprimir / Guardar PDF" />
      </div>

      <PrintLayout>
        <CompanyHeader
          company={company}
          title="Ordem de Compra"
          documentNumber={oc.number}
          status={<DocumentStatusPill label={statusLabel} color={statusColor} bg={statusBg} />}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 22 }}>
          <DocumentPartyBlock title="Fornecedor" name={oc.supplierName} nuit={oc.supplierNuit} />
          <DocumentMetaRows
            rows={[
              ['Data da ordem', fmtDate(oc.orderDate)],
              ['Entrega prevista', fmtDate(oc.expectedDate)],
              ['Armazém de destino', oc.warehouseName],
            ]}
          />
        </div>

        <DocumentLinesTable
          lines={oc.lines.map((l) => ({ id: l.id, sku: l.sku, description: l.description, unitPrice: l.unitCost, quantity: l.quantity, taxRate: l.taxRate, total: l.total }))}
        />

        <DocumentTotalsBlock
          subtotal={oc.subtotal}
          taxableBase={oc.subtotal}
          taxTotal={oc.taxTotal}
          total={oc.total}
          totalLabel="TOTAL DA ORDEM"
          left={oc.notes ? <div style={{ fontSize: 11.5, color: '#5f7378', lineHeight: 1.6 }}>{oc.notes}</div> : null}
        />

        <DocumentNoteBox>
          Documento pré-transaccional: a ordem de compra não gera lançamentos contabilísticos nem movimentos de stock — os efeitos ocorrem na recepção da mercadoria.
        </DocumentNoteBox>

        <SignatureBlock leftLabel="Elaborado por" rightLabel="Aprovado por" />

        <DocumentFooter company={company} />
      </PrintLayout>
    </div>
  );
}
