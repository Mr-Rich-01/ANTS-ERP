import { NextResponse } from 'next/server';
import { forCompany } from '@ants/database';
import { DomainError, exportCashClosingCsv } from '@ants/domain';
import { getContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

function clean(value: string | null): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export async function GET(request: Request) {
  try {
    const ctx = await getContext();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Operacao requer uma empresa activa.' }, { status: 403 });
    }
    const url = new URL(request.url);
    const accountId = clean(url.searchParams.get('account'));
    if (!accountId) {
      return NextResponse.json({ error: 'Seleccione a conta de tesouraria.' }, { status: 422 });
    }
    const exported = await exportCashClosingCsv(forCompany(ctx.companyId), ctx, {
      accountId,
      dateISO: clean(url.searchParams.get('date')),
    });
    return new NextResponse(exported.content, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exported.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
