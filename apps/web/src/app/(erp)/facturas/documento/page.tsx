import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import { getCompanyPrintProfile, getInvoice, getInvoiceHistory, hasPermission, invoiceViaLabel, listAccounts, listCustomerAdvances, DomainError, type InvoiceDisplayStatus, type InvoiceHistoryEntry, type PaymentMethod } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { BankDetailsBlock, CompanyHeader, DocumentFooter, PrintLayout } from '@/components/print/PrintLayout';
import { fmt } from '@/lib/format';
import { PaymentDialog } from '@/components/facturas/PaymentDialog';
import { PaymentReversalDialog } from '@/components/facturas/PaymentReversalDialog';
import { InvoiceCancellationDialog } from '@/components/facturas/InvoiceCancellationDialog';
import { InvoiceViaDialog } from '@/components/facturas/InvoiceViaDialog';
import { DraftIssueDialog } from '@/components/facturas/DraftIssueDialog';
import { DraftDiscardDialog } from '@/components/facturas/DraftDiscardDialog';

export const dynamic = 'force-dynamic';

const STATUS: Record<InvoiceDisplayStatus, [string, string, string]> = {
  rascunho: ['Rascunho', 'var(--warn)', 'var(--warn-bg)'],
  pago: ['Pago', 'var(--ok)', 'var(--ok-bg)'],
  parcial: ['Parcial', 'var(--info)', 'var(--info-bg)'],
  pendente: ['Pendente', 'var(--warn)', 'var(--warn-bg)'],
  vencido: ['Vencido', 'var(--bad)', 'var(--bad-bg)'],
  cancelado: ['Cancelado', 'var(--text3)', 'var(--bd-soft)'],
};
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
};

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtDateTime(d: Date): string {
  return `${fmtDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default async function DocumentoPage({ searchParams }: { searchParams: { id?: string; via?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.view')) redirect('/facturas');
  if (!searchParams.id) redirect('/facturas');

  const db = forCompany(ctx.companyId);
  let inv;
  try {
    inv = await getInvoice(db, ctx, searchParams.id);
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
  const accounts = hasPermission(ctx, 'treasury.view') ? (await listAccounts(db, ctx)).filter((a) => a.status === 'ACTIVE').map((a) => ({ id: a.id, label: a.name })) : [];
  let history: InvoiceHistoryEntry[] = [];
  try {
    history = await getInvoiceHistory(db, ctx, inv.id);
  } catch {
    history = [];
  }

  // RAs abertos do cliente (S17): alimentam o método «Adiantamento» no registo de recibo.
  const openAdvances = inv.status !== 'CANCELLED' && inv.status !== 'DRAFT' && hasPermission(ctx, 'payments.receive')
    ? (await listCustomerAdvances(db, ctx, { customerId: inv.customerId })).filter((a) => a.remaining > 0 && a.state !== 'CANCELADO').map((a) => ({ id: a.id, number: a.number, remaining: a.remaining }))
    : [];

  const [statusLabel, statusColor, statusBg] = STATUS[inv.displayStatus];
  const isDraft = inv.status === 'DRAFT';
  const isVd = inv.documentType === 'VD';
  const docTitle = isVd ? 'VD — Venda a Dinheiro' : 'Factura';
  // Banner de via (S15): só quando a URL pede uma via já registada pelo domínio.
  const viaParam = Number(searchParams.via ?? '');
  const via = Number.isInteger(viaParam) && viaParam >= 2 && viaParam <= inv.viaCount + 1 ? viaParam : null;
  const canCreate = hasPermission(ctx, 'sales.create');
  const canReceive = hasPermission(ctx, 'payments.receive') && inv.outstanding > 0 && inv.status !== 'CANCELLED' && !isDraft;
  const canCancelPayment = hasPermission(ctx, 'payments.cancel');
  const canCancelInvoicePermission = hasPermission(ctx, 'invoices.cancel');
  const activePaymentCount = inv.payments.filter((p) => p.status === 'ACTIVE').length;
  const canCancelInvoice = canCancelInvoicePermission && inv.status !== 'CANCELLED' && !isDraft && activePaymentCount === 0;
  const canIssueNotes = canCreate && inv.status !== 'CANCELLED' && !isDraft;
  const disabledCancelMessage = activePaymentCount > 0 ? 'Anule primeiro os recibos activos desta factura.' : null;
  const reversalDate = civilDateInTimeZone();
  const cancellationDate = reversalDate;
  const docTh: React.CSSProperties = { padding: '10px 12px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase' };
  const documentMeta: Array<[string, string, boolean]> = [
    ['Data de emissão', fmtDate(inv.issueDate), true],
    ['Vencimento', fmtDate(inv.dueDate), true],
    ...(inv.cancelledAt ? [['Cancelamento', fmtDateTime(inv.cancelledAt), true] as [string, string, boolean]] : []),
    ...(!isDraft && inv.draftNumber ? [['Origem', inv.draftNumber, true] as [string, string, boolean]] : []),
    ['Pagamento', inv.paymentMethod ? METHOD_LABEL[inv.paymentMethod] : '—', false],
  ];

  return (
    <div data-screen-label={isVd ? 'VD (documento)' : 'Factura (documento)'}>
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 26px 0' }}>
        <Link href="/facturas" style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar às facturas
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {isDraft && canCreate && (
            <>
              <Link href={`/facturas/nova?rascunho=${inv.id}`} style={topBtn}>
                <Icon name="pencil" size={16} />
                Editar rascunho
              </Link>
              <DraftDiscardDialog
                draft={{ id: inv.id, number: inv.number, customerName: inv.customerName, total: inv.total }}
                trigger={
                  <button style={{ ...topBtn, borderColor: '#f0d0cc', background: '#fff5f3', color: '#8b3a32', cursor: 'pointer' }}>
                    <Icon name="trash-2" size={16} />
                    Descartar rascunho
                  </button>
                }
              />
              <DraftIssueDialog
                issueDate={reversalDate}
                draft={{ id: inv.id, number: inv.number, customerName: inv.customerName, total: inv.total, itemCount: inv.lines.length }}
                trigger={
                  <button style={{ ...topBtn, border: 'none', background: 'var(--accent-fg)', color: '#fff', cursor: 'pointer' }}>
                    <Icon name="file-check-2" size={16} />
                    Emitir factura
                  </button>
                }
              />
            </>
          )}
          {canIssueNotes && (
            <>
              <Link href={`/facturas/nota-credito/nova?invoiceId=${inv.id}`} style={topBtn}>
                <Icon name="file-minus-2" size={16} />
                Nota de crédito
              </Link>
              <Link href={`/facturas/nota-debito/nova?invoiceId=${inv.id}`} style={topBtn}>
                <Icon name="file-plus-2" size={16} />
                Nota de débito
              </Link>
            </>
          )}
          {canCancelInvoice && (
            <InvoiceCancellationDialog
              cancellationDate={cancellationDate}
              invoice={{ id: inv.id, number: inv.number, customerName: inv.customerName, total: inv.total, itemCount: inv.lines.length, activePaymentCount }}
              trigger={
                <button style={{ ...topBtn, borderColor: '#f0d0cc', background: '#fff5f3', color: '#8b3a32', cursor: 'pointer' }}>
                  <Icon name="ban" size={16} />
                  Cancelar factura
                </button>
              }
            />
          )}
          {!canCancelInvoice && canCancelInvoicePermission && inv.status !== 'CANCELLED' && disabledCancelMessage && (
            <button disabled title={disabledCancelMessage} style={{ ...topBtn, opacity: 0.72, cursor: 'not-allowed' }}>
              <Icon name="ban" size={16} />
              Cancelar factura
            </button>
          )}
          {canReceive && (
            <PaymentDialog
              invoiceId={inv.id}
              outstanding={inv.outstanding}
              accounts={accounts}
              advances={openAdvances}
              trigger={
                <button style={{ ...topBtn, border: 'none', background: 'var(--accent-fg)', color: '#fff', cursor: 'pointer' }}>
                  <Icon name="banknote" size={16} />
                  Registar recibo
                </button>
              }
            />
          )}
          {!isDraft && (
            <InvoiceViaDialog
              invoice={{ id: inv.id, number: inv.number, customerName: inv.customerName, viaCount: inv.viaCount, isVd }}
              trigger={
                <button style={{ ...topBtn, cursor: 'pointer' }}>
                  <Icon name="copy" size={16} />
                  Emitir {inv.viaCount === 0 ? '2.ª via' : 'nova via'}
                </button>
              }
            />
          )}
          <PrintButton label="Imprimir / Guardar PDF" />
        </div>
      </div>

      <PrintLayout>
          {/* Banner de via (S15) — em destaque no topo do documento */}
          {via && (
            <div style={{ marginBottom: 18, padding: '10px 14px', border: '2px solid #13343b', borderRadius: 8, textAlign: 'center', fontSize: 15, fontWeight: 800, letterSpacing: '2px', color: '#13343b' }}>
              {invoiceViaLabel(via)}
            </div>
          )}

          {/* Cabeçalho */}
          <CompanyHeader
            company={company}
            title={docTitle}
            documentNumber={inv.number}
            status={
              <>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: statusColor, background: statusBg, padding: '3px 10px', borderRadius: 20 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                {statusLabel}
              </div>
              {inv.status === 'CANCELLED' && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#8b3a32', fontWeight: 700, letterSpacing: '.5px' }}>
                  CANCELADA
                </div>
              )}
              {isDraft && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#8a6d1f', fontWeight: 700, letterSpacing: '.5px' }}>
                  RASCUNHO — SEM VALIDADE FISCAL
                </div>
              )}
              </>
            }
          />

          {/* Facturar a + datas */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 22 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.6px', color: '#8aa0a3', textTransform: 'uppercase', marginBottom: 7 }}>{isVd ? 'Cliente' : 'Facturar a'}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#16282c' }}>{inv.customerName}</div>
              <div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.6, marginTop: 3 }}>
                <strong style={{ color: '#16282c' }}>NUIT:</strong> {inv.customerNuit ?? '—'}
              </div>
            </div>
            <div style={{ width: 230, flex: 'none' }}>
              {documentMeta.map(([l, v, border]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: border ? '1px solid #f0f3f3' : undefined }}>
                  <span style={{ fontSize: 11.5, color: '#5f7378' }}>{l}</span>
                  <span className="tnum" style={{ fontSize: 12, fontWeight: 600 }}>
                    {v}
                  </span>
                </div>
              ))}
              {inv.cancellationReason && (
                <div style={{ marginTop: 8, padding: '8px 9px', borderRadius: 6, background: '#fff5f3', color: '#8b3a32', fontSize: 11.5, lineHeight: 1.45 }}>
                  <strong>Motivo:</strong> {inv.cancellationReason}
                  {inv.cancelledByName || inv.cancelledById ? (
                    <>
                      <br />
                      <strong>Responsável:</strong> {inv.cancelledByName ?? inv.cancelledById}
                    </>
                  ) : null}
                  {inv.cancelledAt ? (
                    <>
                      <br />
                      <strong>Data/hora:</strong> {fmtDateTime(inv.cancelledAt)}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Linhas */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 22 }}>
            <thead>
              <tr style={{ background: '#13343b', color: '#fff' }}>
                <th style={{ ...docTh, textAlign: 'left', borderRadius: '6px 0 0 6px' }}>Descrição</th>
                <th style={{ ...docTh, textAlign: 'center', width: 56 }}>Qtd</th>
                <th style={{ ...docTh, textAlign: 'right', width: 110 }}>Preço unit.</th>
                <th style={{ ...docTh, textAlign: 'right', width: 60 }}>Desc.</th>
                <th style={{ ...docTh, textAlign: 'right', width: 120, borderRadius: '0 6px 6px 0' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #eef2f2' }}>
                  <td style={{ padding: '11px 12px', fontSize: 12.5, color: '#16282c' }}>
                    <div style={{ fontWeight: 500 }}>{l.description}</div>
                    <div className="font-mono" style={{ fontSize: 10.5, color: '#9aa7a9' }}>
                      {l.sku ?? ''}
                    </div>
                  </td>
                  <td className="tnum" style={{ padding: '11px 12px', textAlign: 'center', fontSize: 12.5 }}>
                    {l.quantity}
                  </td>
                  <td className="tnum" style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {fmt(l.unitPrice)}
                  </td>
                  <td className="tnum" style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12.5, color: '#5f7378' }}>
                    {l.discountPercent > 0 ? `${l.discountPercent}%` : '—'}
                  </td>
                  <td className="tnum" style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {fmt(l.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagamento + totais */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 22 }}>
            <div style={{ flex: 1, maxWidth: 330 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.6px', color: '#8aa0a3', textTransform: 'uppercase', marginBottom: 7 }}>Recibos</div>
              {inv.payments.length === 0 ? (
                <div style={{ fontSize: 11.5, color: '#9aa7a9' }}>Sem recibos registados.</div>
              ) : (
                inv.payments.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11.5, color: '#5f7378', padding: '5px 0', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <span className="font-mono">
                      {p.number} · {METHOD_LABEL[p.method]} · {fmtDate(p.paidAt)}
                      </span>
                      {p.status === 'REVERSED' && (
                        <div style={{ marginTop: 3, color: '#8b3a32', fontWeight: 700 }}>
                          ANULADO{p.reversedAt ? ` · ${fmtDate(p.reversedAt)}` : ''}{p.reversalReason ? ` · ${p.reversalReason}` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                    <span className="tnum" style={{ color: p.status === 'REVERSED' ? '#8b3a32' : '#16282c', fontWeight: 600, textDecoration: p.status === 'REVERSED' ? 'line-through' : undefined }}>
                      {fmt(p.amount)}
                    </span>
                    <Link className="ants-noprint" href={`/facturas/recibo?id=${p.id}`} title="Abrir recibo imprimível" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: '1px solid #d9e4e5', background: '#f8fbfb', color: '#13343b' }}>
                      <Icon name="file-text" size={14} />
                    </Link>
                    {canCancelPayment && p.status === 'ACTIVE' && (
                      <span className="ants-noprint">
                        <PaymentReversalDialog
                          reversalDate={reversalDate}
                          payment={{ id: p.id, number: p.number, amount: p.amount, customerName: inv.customerName, invoiceNumber: inv.number, treasuryAccountName: p.treasuryAccountName, method: p.method }}
                          trigger={
                            <button title="Anular recibo" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: '1px solid #f0d0cc', background: '#fff5f3', color: '#8b3a32', cursor: 'pointer' }}>
                              <Icon name="undo-2" size={14} />
                            </button>
                          }
                        />
                      </span>
                    )}
                    </div>
                  </div>
                ))
              )}
              {inv.notes && <div style={{ fontSize: 11.5, color: '#5f7378', lineHeight: 1.6, marginTop: 10 }}>{inv.notes}</div>}
            </div>
            <div style={{ width: 280, flex: 'none' }}>
              {[
                ['Subtotal', fmt(inv.subtotal), '#16282c', false],
                ['Desconto', inv.discountTotal > 0 ? `− ${fmt(inv.discountTotal)}` : '—', '#c2453d', false],
                ['Incidência IVA', fmt(inv.taxableBase), '#16282c', true],
                ['IVA (16%)', fmt(inv.taxTotal), '#16282c', true],
              ].map(([l, v, color, border]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: border ? '1px solid #eef2f2' : undefined }}>
                  <span style={{ fontSize: 12.5, color: '#5f7378' }}>{l}</span>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: color as string }}>
                    {v}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', marginTop: 8, background: '#13343b', color: '#fff', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>TOTAL A PAGAR</span>
                <span className="tnum" style={{ fontSize: 18, fontWeight: 700 }}>
                  {fmt(inv.total)}
                </span>
              </div>
              {inv.amountPaid > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 2px 0' }}>
                  <span style={{ fontSize: 11.5, color: '#5f7378' }}>Pago / Em dívida</span>
                  <span className="tnum" style={{ fontSize: 11.5, fontWeight: 600, color: '#16282c' }}>
                    {fmt(inv.amountPaid)} / {fmt(inv.outstanding)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Dados bancários (S15): apenas na factura, depois dos totais — nunca na VD. */}
          {!isVd && !isDraft && <BankDetailsBlock company={company} />}

          <DocumentFooter company={company} />
      </PrintLayout>

      {/* Histórico de alterações (S6) — só no ecrã, não imprime */}
      {history.length > 0 && (
        <div className="ants-noprint" style={{ margin: '18px 26px 30px', maxWidth: 820 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              <Icon name="history" size={16} />
              Histórico de alterações
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {history.map((h, idx) => (
                <div key={h.id} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: idx > 0 ? '1px solid var(--bd-soft2)' : undefined }}>
                  <div className="tnum" style={{ flex: 'none', width: 118, fontSize: 12, color: 'var(--text3)' }}>{fmtDateTime(h.createdAt)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                      {h.label}
                      {h.userName ? <span style={{ fontWeight: 500, color: 'var(--text2)' }}> · {h.userName}</span> : null}
                    </div>
                    {h.details && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, overflowWrap: 'anywhere' }}>{h.details}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
