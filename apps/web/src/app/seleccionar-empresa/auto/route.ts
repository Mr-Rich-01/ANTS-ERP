import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@ants/database';
import { listActiveCompanyMemberships } from '@ants/domain';
import { activateCompanyForSession } from '@/lib/company-selection';
import { getSessionUser } from '@/lib/session';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.redirect(new URL('/login', req.url));

  const allowedCompanyIds = new Set(user.availableCompanyIds);
  const memberships = (await listActiveCompanyMemberships(prisma, user.email)).filter((membership) =>
    allowedCompanyIds.has(membership.companyId),
  );
  if (memberships.length !== 1) return NextResponse.redirect(new URL('/seleccionar-empresa', req.url));

  const [membership] = memberships;
  if (!membership) return NextResponse.redirect(new URL('/seleccionar-empresa', req.url));

  await activateCompanyForSession(user, membership.companyId);
  return NextResponse.redirect(new URL('/', req.url));
}
