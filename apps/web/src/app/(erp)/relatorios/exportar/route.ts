import { NextResponse } from 'next/server';
import { forCompany } from '@ants/database';
import { DomainError, exportOperationalReportCsv, exportOperationalReportXlsx, isOperationalReportKey, type ReportFilters } from '@ants/domain';
import { getContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

function clean(value: string | null): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

function filtersFromUrl(url: URL): ReportFilters {
  const movementType = clean(url.searchParams.get('movementType'));
  return {
    from: clean(url.searchParams.get('from')),
    to: clean(url.searchParams.get('to')),
    customerId: clean(url.searchParams.get('customerId')),
    supplierId: clean(url.searchParams.get('supplierId')),
    productId: clean(url.searchParams.get('productId')),
    treasuryAccountId: clean(url.searchParams.get('treasuryAccountId')),
    movementType: movementType === 'IN' || movementType === 'OUT' || movementType === 'ADJUST' ? movementType : undefined,
    userId: clean(url.searchParams.get('userId')),
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await getContext();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Operacao requer uma empresa activa.' }, { status: 403 });
    }
    const url = new URL(request.url);
    const report = clean(url.searchParams.get('report'));
    if (!isOperationalReportKey(report)) {
      return NextResponse.json({ error: 'Relatorio invalido.' }, { status: 422 });
    }
    // S18: formato=xlsx — Excel via helper S16 (uma folha por secção); CSV mantém-se.
    if (clean(url.searchParams.get('formato')) === 'xlsx') {
      const exportedXlsx = await exportOperationalReportXlsx(forCompany(ctx.companyId), ctx, report, filtersFromUrl(url));
      return new NextResponse(new Uint8Array(exportedXlsx.buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${exportedXlsx.filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    const exported = await exportOperationalReportCsv(forCompany(ctx.companyId), ctx, report, filtersFromUrl(url));
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
