import { NextResponse, type NextRequest } from 'next/server';
import { forCompany } from '@ants/database';
import { DomainError, searchProductOptions } from '@ants/domain';
import { fmt } from '@/lib/format';
import { getContext, getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Pesquisa de produtos para dropdowns pesquisáveis (S2).
 * O `companyId` vem sempre da sessão — a querystring só transporta `q`/`detail`.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  try {
    const ctx = await getContext();
    if (!ctx.companyId) return NextResponse.json({ error: 'Sem empresa activa.' }, { status: 403 });
    const params = req.nextUrl.searchParams;
    // `detail=cost` mostra o custo (compras); por omissão mostra preço e stock (vendas).
    const detail = params.get('detail') === 'cost' ? 'cost' : 'price';
    const rows = await searchProductOptions(forCompany(ctx.companyId), ctx, {
      query: params.get('q') ?? undefined,
    });
    return NextResponse.json({
      options: rows.map((p) => ({
        value: p.id,
        label: p.name,
        sublabel: detail === 'cost' ? `${p.sku} · custo ${fmt(p.avgCost)}` : `${p.sku} · ${fmt(p.salePrice)} · stock ${p.stock}`,
        data: { sku: p.sku, name: p.name, price: p.salePrice, cost: p.avgCost, stock: p.stock },
      })),
    });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
