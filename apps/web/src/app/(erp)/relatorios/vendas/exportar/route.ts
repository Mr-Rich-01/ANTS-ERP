import { NextResponse } from 'next/server';
import { forCompany } from '@ants/database';
import { DomainError, exportSalesReportXlsx, type SalesReportFilters } from '@ants/domain';
import { getContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

function clean(value: string | null): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

// Mesmos query params da página /relatorios/vendas — zero divergência sistema/Excel (8.9.5).
function filtersFromUrl(url: URL): SalesReportFilters {
  const tipo = clean(url.searchParams.get('tipo'));
  const estado = clean(url.searchParams.get('estado'));
  const ord = clean(url.searchParams.get('ord'));
  const dir = clean(url.searchParams.get('dir'));
  return {
    from: clean(url.searchParams.get('de')),
    to: clean(url.searchParams.get('ate')),
    documentType: tipo === 'VD' || tipo === 'FACTURA' ? tipo : 'ALL',
    search: clean(url.searchParams.get('q')),
    customerId: clean(url.searchParams.get('customerId')),
    userId: clean(url.searchParams.get('vendedor')),
    status: estado === 'CANCELLED' || estado === 'ALL' ? estado : 'ACTIVE',
    sort: ord === 'number' || ord === 'total' ? ord : 'date',
    dir: dir === 'desc' ? 'desc' : 'asc',
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await getContext();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Operacao requer uma empresa activa.' }, { status: 403 });
    }
    const url = new URL(request.url);
    const exported = await exportSalesReportXlsx(forCompany(ctx.companyId), ctx, filtersFromUrl(url));
    return new NextResponse(new Uint8Array(exported.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
