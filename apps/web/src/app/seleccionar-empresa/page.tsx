import { redirect } from 'next/navigation';
import { Button } from '@ants/ui';
import { prisma } from '@ants/database';
import { listActiveCompanyMemberships } from '@ants/domain';
import { Icon } from '@/components/Icon';
import { getSessionUser, hasValidActiveCompany, requireSession } from '@/lib/session';
import { ACCENT } from '@/lib/erp-nav';
import { selectCompanyAction } from './actions';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

export default async function SelectCompanyPage({ searchParams }: { searchParams: { erro?: string } }) {
  const user = await requireSession();
  if (user.mustChangePassword) redirect('/trocar-password');

  const allowedCompanyIds = new Set(user.availableCompanyIds);
  const memberships = user.email
    ? (await listActiveCompanyMemberships(prisma, user.email)).filter((membership) => allowedCompanyIds.has(membership.companyId))
    : [];
  if (memberships.length === 1 && !(await hasValidActiveCompany(user))) redirect('/seleccionar-empresa/auto');
  if (memberships.length === 1 && (await hasValidActiveCompany(user))) redirect('/');

  const currentUser = await getSessionUser();

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 18,
          boxShadow: 'var(--shadow)',
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: ACCENT,
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700,
              fontSize: 20,
            }}
          >
            A
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>Seleccione a empresa</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{currentUser?.email}</div>
          </div>
        </div>

        {searchParams.erro && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10, marginBottom: 14 }}>
            <Icon name="alert-triangle" size={15} />
            Empresa inválida ou sem acesso activo.
          </div>
        )}

        {memberships.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: 'var(--text2)', background: 'var(--field)', border: '1px solid var(--field-bd)', borderRadius: 12, padding: 14 }}>
            <Icon name="building-2" size={18} />
            <span>Não existe nenhuma empresa activa associada à sua conta. Contacte o administrador.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 2 }}>Seleccione a empresa com que pretende trabalhar.</div>
            {memberships.map((company) => (
              <form key={company.companyId} action={selectCompanyAction}>
                <input type="hidden" name="companyId" value={company.companyId} />
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    background: 'var(--card)',
                    padding: 12,
                    color: 'var(--text)',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: 'var(--accent-bg)',
                      color: 'var(--accent-fg)',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 700,
                      flex: 'none',
                    }}
                  >
                    {initials(company.tradeName ?? company.legalName) || 'E'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{company.tradeName ?? company.legalName}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{company.legalName}</span>
                  </span>
                  <Icon name="chevron-right" size={17} />
                </button>
              </form>
            ))}
          </div>
        )}

        <form action={async () => {
          'use server';
          const { signOut } = await import('@/auth');
          await signOut({ redirectTo: '/login' });
        }} style={{ marginTop: 18 }}>
          <Button type="submit" variant="ghost" size="sm" className="w-full">
            Terminar sessão
          </Button>
        </form>
      </section>
    </main>
  );
}
