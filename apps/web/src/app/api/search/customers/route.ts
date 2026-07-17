import { NextResponse, type NextRequest } from 'next/server';
import { forCompany } from '@ants/database';
import { DomainError, searchCustomerOptions } from '@ants/domain';
import { getContext, getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Pesquisa de clientes para dropdowns pesquisáveis (S2).
 * O `companyId` vem sempre da sessão — a querystring só transporta `q`/`active`.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  try {
    const ctx = await getContext();
    if (!ctx.companyId) return NextResponse.json({ error: 'Sem empresa activa.' }, { status: 403 });
    const params = req.nextUrl.searchParams;
    const rows = await searchCustomerOptions(forCompany(ctx.companyId), ctx, {
      query: params.get('q') ?? undefined,
      onlyActive: params.get('active') === '1',
    });
    return NextResponse.json({
      options: rows.map((c) => ({
        value: c.id,
        label: c.name,
        sublabel: c.nuit ? `NUIT ${c.nuit}` : undefined,
        data: { nuit: c.nuit, phone: c.phone },
      })),
    });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
