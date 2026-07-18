import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import { getPurchaseOrder, hasPermission, listAccounts, DomainError, type PurchaseStatus } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { fmt } from '@/lib/format';
import { PurchaseReceiptReversalDialog } from '@/components/compras/PurchaseReceiptReversalDialog';
import { SupplierPaymentDialog } from '@/components/compras/SupplierPaymentDialog';
import { SupplierPaymentReversalDialog } from '@/components/compras/SupplierPaymentReversalDialog';

export const dynamic = 'force-dynamic';

const STATUS: Record<PurchaseStatus, [string, string, string]> = {
  DRAFT: ['Rascunho', 'var(--text3)', 'var(--bd-soft)'],
  SENT: ['Enviada', 'var(--info)', 'var(--info-bg)'],
  PARTIAL: ['Recepção parcial', 'var(--warn)', 'var(--warn-bg)'],
  RECEIVED: ['Recebida', 'var(--ok)', 'var(--ok-bg)'],
  CANCELLED: ['Cancelada', 'var(--text3)', 'var(--bd-soft)'],
};

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd-soft)' };
const backBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' };

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default async function OcDetalhePage({ searchParams }: { searchParams: { id?: string } }) {
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
        <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Link href="/compras" style={backBtn}>
            <Icon name="arrow-left" size={16} />
            Voltar às compras
          </Link>
          <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
        </div>
      );
    }
    throw e;
  }

  const [statusLabel, statusColor, statusBg] = STATUS[oc.status];
  const canReceive = (oc.status === 'SENT' || oc.status === 'PARTIAL') && hasPermission(ctx, 'purchases.create');
  const canPay = oc.outstanding > 0 && hasPermission(ctx, 'purchases.create');
  const canReversePurchaseReceipt = hasPermission(ctx, 'purchaseReceipts.reverse');
  const canReverseSupplierPayment = hasPermission(ctx, 'supplierPayments.reverse');
  const reversalDate = civilDateInTimeZone();
  const accounts = hasPermission(ctx, 'treasury.view') ? (await listAccounts(db, ctx)).filter((a) => a.status === 'ACTIVE').map((a) => ({ id: a.id, label: a.name })) : [];

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/compras" style={backBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar às compras
        </Link>
        <div style={{ display: 'flex', gap: 9 }}>
          <Link href={`/compras/ordem/documento?id=${oc.id}`} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
            <Icon name="printer" size={15} />
            Documento / Imprimir
          </Link>
          {canPay && (
            <SupplierPaymentDialog
              supplierId={oc.supplierId}
              purchaseOrderId={oc.id}
              suggested={oc.outstanding}
              accounts={accounts}
              trigger={
                <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <Icon name="banknote" size={15} />
                  Registar pagamento
                </button>
              }
            />
          )}
          {canReceive && (
            <Link href={`/recepcao?order=${oc.id}`} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
              <Icon name="package-check" size={15} />
              Receber mercadoria
            </Link>
          )}
        </div>
      </div>

      {/* Cabeçalho */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 22px', display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 className="font-mono" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{oc.number}</h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: statusColor, background: statusBg, padding: '3px 10px', borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
              {statusLabel}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 8 }}>{oc.supplierName}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>NUIT {oc.supplierNuit ?? '—'} · Destino: {oc.warehouseName}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 4, marginTop: 8, fontSize: 12.5, color: 'var(--text2)' }}>
            <span>Data: <strong className="tnum" style={{ color: 'var(--text)' }}>{fmtDate(oc.orderDate)}</strong></span>
            <span>Entrega prevista: <strong className="tnum" style={{ color: 'var(--text)' }}>{fmtDate(oc.expectedDate)}</strong></span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,auto)', gap: '6px 22px', flex: 'none' }}>
          {[
            ['Total', fmt(oc.total)],
            ['Recebido (valor)', fmt(oc.receivedValue)],
            ['Pago', fmt(oc.amountPaid)],
            ['Em dívida', fmt(oc.outstanding)],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'contents' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{l}</span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Linhas */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="list" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Linhas da ordem</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Produto</th>
                <th style={{ ...th, textAlign: 'right' }}>Custo unit.</th>
                <th style={{ ...th, textAlign: 'center' }}>Encomendado</th>
                <th style={{ ...th, textAlign: 'center' }}>Recebido</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {oc.lines.map((l) => {
                const fully = l.receivedQty >= l.quantity;
                return (
                  <tr key={l.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {l.description}
                      <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {l.sku ?? ''}
                      </div>
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {fmt(l.unitCost)}
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'center', fontSize: 13, color: 'var(--text)' }}>
                      {l.quantity}
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: fully ? 'var(--ok)' : l.receivedQty > 0 ? 'var(--warn)' : 'var(--text3)' }}>
                      {l.receivedQty}
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {fmt(l.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={4} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                  Total da ordem (c/ IVA)
                </td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                  {fmt(oc.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="package-check" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Recepções</div>
        </div>
        {oc.receipts.length === 0 ? (
          <div style={{ padding: '18px', fontSize: 12.5, color: 'var(--text3)' }}>Sem recepções registadas.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 840 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Documento</th>
                  <th style={th}>Data</th>
                  <th style={th}>Armazem</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: 'center' }}>Qtd.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...th, textAlign: 'right' }}>Acções</th>
                </tr>
              </thead>
              <tbody>
                {oc.receipts.map((r) => {
                  const reversed = r.status === 'REVERSED';
                  const quantity = r.items.reduce((sum, item) => sum + item.quantity, 0);
                  return (
                    <tr key={r.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)', opacity: reversed ? 0.64 : 1 }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        <span className="font-mono">{r.receiptNumber}</span>
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {r.items.map((item) => (
                            <span key={item.id} style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text3)' }}>
                              {item.description} · {item.quantity} un
                            </span>
                          ))}
                        </div>
                        {reversed && r.reversalReason ? <div style={{ marginTop: 5, fontSize: 11.5, color: '#8b3a32', fontWeight: 600 }}>{r.reversalReason}</div> : null}
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(r.receiptDate)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{r.warehouseName}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 700, color: reversed ? '#8b3a32' : 'var(--ok)', whiteSpace: 'nowrap' }}>
                        {reversed ? `ESTORNADA${r.reversedAt ? ` · ${fmtDate(r.reversedAt)}` : ''}` : 'ACTIVA'}
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{quantity}</td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', textDecoration: reversed ? 'line-through' : undefined }}>{fmt(r.totalAmount)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        {canReversePurchaseReceipt && !reversed ? (
                          <PurchaseReceiptReversalDialog
                            reversalDate={reversalDate}
                            receipt={{
                              id: r.id,
                              receiptNumber: r.receiptNumber,
                              purchaseOrderNumber: oc.number,
                              supplierName: oc.supplierName,
                              warehouseName: r.warehouseName,
                              totalAmount: r.totalAmount,
                              items: r.items.map((item) => ({ id: item.id, description: item.description, quantity: item.quantity, unitCost: item.unitCost, totalAmount: item.totalAmount })),
                            }}
                            trigger={
                              <button title="Estornar recepção" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid #f0d0cc', background: '#fff5f3', color: '#8b3a32', cursor: 'pointer' }}>
                                <Icon name="undo-2" size={14} />
                              </button>
                            }
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="banknote" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Pagamentos</div>
        </div>
        {oc.payments.length === 0 ? (
          <div style={{ padding: '18px', fontSize: 12.5, color: 'var(--text3)' }}>Sem pagamentos registados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Documento</th>
                  <th style={th}>Data</th>
                  <th style={th}>Conta</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                  <th style={{ ...th, textAlign: 'right' }}>Acções</th>
                </tr>
              </thead>
              <tbody>
                {oc.payments.map((p) => {
                  const reversed = p.status === 'REVERSED';
                  return (
                    <tr key={p.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)', opacity: reversed ? 0.64 : 1 }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        <span className="font-mono">{p.number}</span>
                        {reversed && p.reversalReason ? <div style={{ marginTop: 3, fontSize: 11.5, color: '#8b3a32', fontWeight: 600 }}>{p.reversalReason}</div> : null}
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(p.paidAt)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text2)' }}>{p.treasuryAccountName ?? 'Conta não encontrada'}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 700, color: reversed ? '#8b3a32' : 'var(--ok)', whiteSpace: 'nowrap' }}>
                        {reversed ? `ESTORNADO${p.reversedAt ? ` · ${fmtDate(p.reversedAt)}` : ''}` : 'ACTIVO'}
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', textDecoration: reversed ? 'line-through' : undefined }}>{fmt(p.amount)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        {canReverseSupplierPayment && !reversed ? (
                          <SupplierPaymentReversalDialog
                            reversalDate={reversalDate}
                            payment={{ id: p.id, number: p.number, amount: p.amount, supplierName: oc.supplierName, purchaseOrderNumber: oc.number, treasuryAccountName: p.treasuryAccountName, method: p.method }}
                            trigger={
                              <button title="Estornar pagamento" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid #f0d0cc', background: '#fff5f3', color: '#8b3a32', cursor: 'pointer' }}>
                                <Icon name="undo-2" size={14} />
                              </button>
                            }
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
