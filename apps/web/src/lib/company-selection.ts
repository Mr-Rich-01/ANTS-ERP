import { prisma } from '@ants/database';
import { selectActiveCompanyForEmail } from '@ants/domain';
import { updateSession } from '@/auth';
import type { SessionUser } from '@/lib/session';

export async function activateCompanyForSession(user: SessionUser, companyId: string): Promise<boolean> {
  if (!user.email) return false;
  if (!user.availableCompanyIds.includes(companyId)) return false;
  const selected = await selectActiveCompanyForEmail(prisma, user.email, companyId);
  if (!selected?.companyId) return false;

  await updateSession({ user: { companyId: selected.companyId } });
  await prisma.auditLog.create({
    data: {
      companyId: selected.companyId,
      userId: selected.id,
      action: 'auth.company_select',
      entity: 'Company',
      entityId: selected.companyId,
      newValues: { email: selected.email },
      result: 'success',
    },
  });
  return true;
}
