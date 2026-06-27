import { redirect } from 'next/navigation';
import { prisma } from '@ants/database';
import { getCompanyIdentity, hasPermission, listCompanyUsers, listRecentAudit, listRoles } from '@ants/domain';
import { getContext } from '@/lib/session';
import { AdminClient } from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const ctx = await getContext();

  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para gerir a administração.
      </div>
    );
  }
  if (!hasPermission(ctx, 'users.manage')) redirect('/');

  const canViewAudit = hasPermission(ctx, 'audit.view');
  const [users, roles, audit, company] = await Promise.all([
    listCompanyUsers(prisma, ctx),
    listRoles(prisma, ctx),
    canViewAudit ? listRecentAudit(prisma, ctx) : Promise.resolve([]),
    getCompanyIdentity(prisma, ctx),
  ]);

  return (
    <AdminClient
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roleNames: u.roleNames,
        status: u.status,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        branchNames: u.branchNames,
      }))}
      roles={roles.map((r) => ({ id: r.id, name: r.name, userCount: r.userCount }))}
      audit={audit.map((a) => ({
        id: a.id,
        userName: a.userName,
        action: a.action,
        entity: a.entity,
        entityId: a.entityId,
        oldValues: a.oldValues,
        newValues: a.newValues,
        ipAddress: a.ipAddress,
        createdAt: a.createdAt.toISOString(),
      }))}
      company={company}
      canViewAudit={canViewAudit}
    />
  );
}
