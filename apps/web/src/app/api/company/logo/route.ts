import { NextResponse, type NextRequest } from 'next/server';
import { forCompany } from '@ants/database';
import { DomainError, getCompanyLogo } from '@ants/domain';
import { getContext, getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Serve o logótipo da empresa da sessão (S4).
 * O `companyId` vem SEMPRE da sessão — a querystring só transporta `v` (versão
 * para cache-busting). Nunca se serve um logótipo por id/caminho vindo do request,
 * por isso a empresa B não consegue pedir o logótipo da A.
 * Cache: ETag derivado de `updatedAt` + max-age imutável quando o URL é versionado,
 * para o BYTEA não ser lido da BD em cada página (o browser guarda a resposta).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  try {
    const ctx = await getContext();
    if (!ctx.companyId) return NextResponse.json({ error: 'Sem empresa activa.' }, { status: 403 });

    const logo = await getCompanyLogo(forCompany(ctx.companyId), ctx);
    if (!logo) return NextResponse.json({ error: 'Logótipo não definido.' }, { status: 404 });

    const version = String(logo.updatedAt.getTime());
    const etag = `"${version}"`;
    const versionedUrl = req.nextUrl.searchParams.get('v') === version;
    const cacheControl = versionedUrl ? 'private, max-age=31536000, immutable' : 'private, max-age=0, must-revalidate';

    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } });
    }

    return new NextResponse(Buffer.from(logo.data), {
      status: 200,
      headers: {
        'Content-Type': logo.mimeType,
        'Content-Length': String(logo.data.byteLength),
        ETag: etag,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
