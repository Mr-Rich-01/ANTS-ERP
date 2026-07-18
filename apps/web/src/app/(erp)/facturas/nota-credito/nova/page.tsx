import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { DomainError, getCreditableLines, hasPermission } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { NovaNotaCreditoClient } from './NovaNotaCreditoClient';

export const dynamic = 'force-dynamic';

const backBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content', textDecoration: 'none' };

export default async function NovaNotaCreditoPage({ searchParams }: { searchParams: { invoiceId?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'sales.create')) redirect('/facturas');
  if (!searchParams.invoiceId) redirect('/facturas');

  const db = forCompany(ctx.companyId);
  let creditable;
  try {
    creditable = await getCreditableLines(db, ctx, searchParams.invoiceId);
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Link href="/facturas" style={backBtn}>
            <Icon name="arrow-left" size={16} />
            Voltar às facturas
          </Link>
          <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{e.message}</div>
        </div>
      );
    }
    throw e;
  }

  return (
    <NovaNotaCreditoClient
      invoiceId={searchParams.invoiceId}
      invoiceNumber={creditable.invoiceNumber}
      customerName={creditable.customerName}
      lines={creditable.lines}
    />
  );
}
