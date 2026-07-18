import { redirect } from 'next/navigation';
import { prisma } from '@ants/database';
import { hasValidActiveCompany, requireSession } from '@/lib/session';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { ScreenHeader } from '@/components/shell/ScreenHeader';

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  if (user.mustChangePassword) redirect('/trocar-password');
  if (!(await hasValidActiveCompany(user))) redirect('/seleccionar-empresa');

  const company = await prisma.company.findUnique({
    where: { id: user.companyId ?? '' },
    select: { legalName: true, tradeName: true, logoUpdatedAt: true },
  });
  // URL versionado (cache imutável no browser); a rota valida a sessão e serve
  // sempre o logótipo da empresa da sessão — nunca por id vindo do cliente.
  const companyLogoUrl = company?.logoUpdatedAt
    ? `/api/company/logo?v=${company.logoUpdatedAt.getTime()}`
    : null;

  const initials = (user.name ?? user.email ?? 'U')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <div
      className="ants-shell"
      style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}
    >
      <Sidebar
        permissions={user.permissions}
        isPlatformAdmin={user.isPlatformAdmin}
        companyLogoUrl={companyLogoUrl}
        companyName={company?.tradeName ?? company?.legalName ?? null}
      />
      <main
        className="ants-main"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <Topbar
          userName={user.name ?? 'Utilizador'}
          userEmail={user.email ?? ''}
          userInitials={initials}
          companyName={company?.tradeName ?? company?.legalName ?? 'Empresa activa'}
          companyLogoUrl={companyLogoUrl}
        />
        <div className="ants-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <ScreenHeader />
          {children}
        </div>
      </main>
    </div>
  );
}
