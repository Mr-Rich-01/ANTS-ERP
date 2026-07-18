import Link from 'next/link';
import { NoPermission } from '@/components/NoPermission';
import { forCompany } from '@ants/database';
import { hasPermission, listQuotations, quotationStatusLabel, type QuotationStatus } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { fmt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<QuotationStatus, [string, string]> = {
  DRAFT: ['var(--text3)', 'var(--bd-soft)'],
  ISSUED: ['var(--info)', 'var(--info-bg)'],
  ACCEPTED: ['var(--ok)', 'var(--ok-bg)'],
  REJECTED: ['var(--bad)', 'var(--bad-bg)'],
  CANCELLED: ['var(--text3)', 'var(--bd-soft)'],
};

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd-soft)' };

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default async function CotacoesPage() {
  const ctx = await getContext();
  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para ver as cotações.
      </div>
    );
  }
  if (!hasPermission(ctx, 'sales.view')) return <NoPermission message="Não tem permissão para ver as cotações." />;

  const db = forCompany(ctx.companyId);
  const quotations = await listQuotations(db, ctx);
  const canCreate = hasPermission(ctx, 'sales.create');
  const now = new Date();

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          {quotations.length === 0 ? 'Sem cotações emitidas.' : `${quotations.length} ${quotations.length === 1 ? 'cotação' : 'cotações'}`}
          <span style={{ color: 'var(--text3)' }}> · documento pré-transaccional (sem stock nem contabilidade)</span>
        </div>
        {canCreate && (
          <Link href="/cotacoes/nova" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            <Icon name="plus" size={16} />
            Nova cotação
          </Link>
        )}
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={th}>Número</th>
                <th style={th}>Cliente</th>
                <th style={th}>Emissão</th>
                <th style={th}>Validade</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {quotations.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '36px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    Emita a primeira cotação com «Nova cotação».
                  </td>
                </tr>
              ) : (
                quotations.map((q) => {
                  const [color, bg] = STATUS_COLORS[q.status];
                  const expired = q.status === 'ISSUED' && q.validUntil < now;
                  return (
                    <tr key={q.id} style={{ borderTop: '1px solid var(--bd-soft2)' }}>
                      <td style={{ padding: '11px 14px' }}>
                        <Link href={`/cotacoes/documento?id=${q.id}`} className="font-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-fg)', textDecoration: 'none' }}>
                          {q.number}
                        </Link>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)' }}>{q.customerName}</td>
                      <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{fmtDate(q.issueDate)}</td>
                      <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: expired ? 'var(--bad)' : 'var(--text2)' }}>
                        {fmtDate(q.validUntil)}
                        {expired ? ' · expirada' : ''}
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(q.total)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color, background: bg, padding: '3px 10px', borderRadius: 20 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                          {quotationStatusLabel(q.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
