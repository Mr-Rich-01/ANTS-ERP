import { NextResponse } from 'next/server';
import { forCompany } from '@ants/database';
import { DomainError, exportStockCountSheetXlsx, type CountSheetFilters, type CountSheetMode, type CountSheetSort } from '@ants/domain';
import { getContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

function clean(value: string | null): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

// Mesmos query params da página /inventario/folha-contagem — zero divergência página/Excel.
function filtersFromUrl(url: URL): CountSheetFilters {
  const modo = clean(url.searchParams.get('modo'));
  const ord = clean(url.searchParams.get('ord'));
  const dir = clean(url.searchParams.get('dir'));
  return {
    warehouseId: clean(url.searchParams.get('armazem')),
    category: clean(url.searchParams.get('categoria')),
    search: clean(url.searchParams.get('q')),
    mode: modo === 'NEGATIVE' || modo === 'INACTIVE' || modo === 'ALL' ? (modo as CountSheetMode) : 'ZERO',
    sort: ord === 'name' || ord === 'category' ? (ord as CountSheetSort) : 'code',
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
    const exported = await exportStockCountSheetXlsx(forCompany(ctx.companyId), ctx, filtersFromUrl(url));
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
