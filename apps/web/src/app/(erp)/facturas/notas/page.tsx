import Link from 'next/link';
import { NoPermission } from '@/components/NoPermission';
import { forCompany } from '@ants/database';
import { creditNoteStatusLabel, debitNoteStatusLabel, hasPermission, listCreditNotes, listDebitNotes } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { fmt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd-soft)' };
const backBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content', textDecoration: 'none' };

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  const color = active ? 'var(--ok)' : 'var(--text3)';
  const bg = active ? 'var(--ok-bg)' : 'var(--bd-soft)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color, background: bg, padding: '3px 10px', borderRadius: 20 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}

export default async function NotasPage() {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver as notas.
      </div>
    );
  }
  if (!hasPermission(ctx, 'sales.view')) return <NoPermission message="Não tem permissão para ver as notas de crédito e débito." />;

  const db = forCompany(ctx.companyId);
  const [creditNotes, debitNotes] = await Promise.all([listCreditNotes(db, ctx), listDebitNotes(db, ctx)]);
  const canCreate = hasPermission(ctx, 'sales.create');

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/facturas" style={backBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar às facturas
        </Link>
        {canCreate && (
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <Link href="/facturas/nota-debito/nova" style={{ ...backBtn, height: 38 }}>
              <Icon name="file-plus-2" size={16} />
              Nova nota de débito
            </Link>
            <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>
              Nota de crédito: abrir a factura de origem → «Nota de crédito».
            </span>
          </div>
        )}
      </div>

      {/* Notas de crédito */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 12px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          Notas de crédito <span style={{ fontWeight: 500, color: 'var(--text3)', fontSize: 12.5 }}>· reduzem o saldo do cliente</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr>
                <th style={th}>Número</th>
                <th style={th}>Factura</th>
                <th style={th}>Cliente</th>
                <th style={th}>Emissão</th>
                <th style={th}>Devolução</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {creditNotes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    Sem notas de crédito emitidas.
                  </td>
                </tr>
              ) : (
                creditNotes.map((n) => (
                  <tr key={n.id} style={{ borderTop: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <Link href={`/facturas/nota-credito?id=${n.id}`} className="font-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-fg)', textDecoration: 'none' }}>
                        {n.number}
                      </Link>
                    </td>
                    <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>{n.invoiceNumber}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)' }}>{n.customerName}</td>
                    <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{fmtDate(n.issueDate)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{n.returnStock ? 'Com stock' : 'Só valor'}</td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--bad)', whiteSpace: 'nowrap' }}>− {fmt(n.total)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <StatusPill label={creditNoteStatusLabel(n.status)} active={n.status === 'ISSUED'} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notas de débito */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 12px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          Notas de débito <span style={{ fontWeight: 500, color: 'var(--text3)', fontSize: 12.5 }}>· aumentam o saldo do cliente</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr>
                <th style={th}>Número</th>
                <th style={th}>Factura</th>
                <th style={th}>Cliente</th>
                <th style={th}>Emissão</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {debitNotes.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    Sem notas de débito emitidas.
                  </td>
                </tr>
              ) : (
                debitNotes.map((n) => (
                  <tr key={n.id} style={{ borderTop: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <Link href={`/facturas/nota-debito?id=${n.id}`} className="font-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-fg)', textDecoration: 'none' }}>
                        {n.number}
                      </Link>
                    </td>
                    <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)' }}>{n.invoiceNumber ?? '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)' }}>{n.customerName}</td>
                    <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{fmtDate(n.issueDate)}</td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(n.total)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <StatusPill label={debitNoteStatusLabel(n.status)} active={n.status === 'ISSUED'} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
