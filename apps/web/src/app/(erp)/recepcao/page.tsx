import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { getPurchaseOrder, hasPermission, DomainError } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { RecepcaoClient, type ReceiveLine } from './RecepcaoClient';

export const dynamic = 'force-dynamic';

const backBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' };

export default async function RecepcaoPage({ searchParams }: { searchParams: { order?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'purchases.create')) redirect('/compras');

  const notice = (message: string) => (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link href="/compras" style={backBtn}>
        <Icon name="arrow-left" size={16} />
        Voltar às compras
      </Link>
      <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{message}</div>
    </div>
  );

  if (!searchParams.order) return notice('Abra uma ordem de compra e escolha "Receber mercadoria".');

  const db = forCompany(ctx.companyId);
  let oc;
  try {
    oc = await getPurchaseOrder(db, ctx, searchParams.order);
  } catch (e) {
    if (e instanceof DomainError) return notice(e.message);
    throw e;
  }

  if (oc.status === 'RECEIVED') return notice(`A ordem ${oc.number} já foi totalmente recebida.`);
  if (oc.status === 'CANCELLED') return notice(`A ordem ${oc.number} está cancelada.`);
  if (oc.status === 'REJECTED') return notice(`A ordem ${oc.number} foi rejeitada e não pode ser recepcionada.`);
  if (oc.status !== 'APPROVED' && oc.status !== 'PARTIAL') {
    return notice(`A ordem ${oc.number} aguarda aprovação de um Gestor e só pode ser recepcionada depois de aprovada.`);
  }

  const lines: ReceiveLine[] = oc.lines
    .map((l) => ({ lineId: l.id, sku: l.sku ?? '—', name: l.description, ordered: l.quantity, alreadyReceived: l.receivedQty, remaining: l.quantity - l.receivedQty, unitCost: l.unitCost, taxRate: l.taxRate }))
    .filter((l) => l.remaining > 0);

  return (
    <RecepcaoClient
      orderId={oc.id}
      orderNumber={oc.number}
      supplierName={oc.supplierName}
      warehouseName={oc.warehouseName}
      lines={lines}
    />
  );
}
