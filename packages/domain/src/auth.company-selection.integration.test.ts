import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { prisma } from '@ants/database';
import {
  authenticate,
  hashPassword,
  listActiveCompanyMemberships,
  selectActiveCompanyForEmail,
  validateSessionCompany,
} from './auth';

const EMAIL = 'multiempresa-auth-test@ants.co.mz';
const EMAIL_SINGLE = 'single-company-auth-test@ants.co.mz';
const EMAIL_ZERO = 'zero-company-auth-test@ants.co.mz';
const PASSWORD = 'AuthCompany@123';
const CA = 'auth-company-a';
const CB = 'auth-company-b';
const CI = 'auth-company-inactive';
const CS = 'auth-company-single';
const CZ = 'auth-company-zero';

async function teardown() {
  await prisma.auditLog.deleteMany({ where: { companyId: { in: [CA, CB, CI, CS, CZ] } } });
  await prisma.company.deleteMany({ where: { id: { in: [CA, CB, CI, CS, CZ] } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, EMAIL_SINGLE, EMAIL_ZERO] } } });
  await prisma.permission.deleteMany({ where: { key: { in: ['auth.test.a', 'auth.test.b'] } } });
}

beforeAll(async () => {
  await teardown();

  const passwordHash = await hashPassword(PASSWORD);
  await prisma.permission.createMany({
    data: [
      { key: 'auth.test.a', module: 'auth', description: 'Permissao A' },
      { key: 'auth.test.b', module: 'auth', description: 'Permissao B' },
    ],
    skipDuplicates: true,
  });

  for (const company of [
    { id: CA, legalName: 'Auth Empresa A', status: 'ACTIVE' as const },
    { id: CB, legalName: 'Auth Empresa B', status: 'ACTIVE' as const },
    { id: CI, legalName: 'Auth Empresa Inactiva', status: 'SUSPENDED' as const },
    { id: CS, legalName: 'Auth Empresa Unica', status: 'ACTIVE' as const },
    { id: CZ, legalName: 'Auth Empresa Zero', status: 'SUSPENDED' as const },
  ]) {
    await prisma.company.create({ data: company });
  }

  const roleA = await prisma.role.create({ data: { companyId: CA, name: 'Auth Role A' } });
  const roleB = await prisma.role.create({ data: { companyId: CB, name: 'Auth Role B' } });
  const permA = await prisma.permission.findUniqueOrThrow({ where: { key: 'auth.test.a' } });
  const permB = await prisma.permission.findUniqueOrThrow({ where: { key: 'auth.test.b' } });
  await prisma.rolePermission.createMany({
    data: [
      { roleId: roleA.id, permissionId: permA.id },
      { roleId: roleB.id, permissionId: permB.id },
    ],
  });

  const userA = await prisma.user.create({
    data: { companyId: CA, email: EMAIL, name: 'Utilizador Empresa A', passwordHash, mustChangePassword: false },
  });
  const userB = await prisma.user.create({
    data: { companyId: CB, email: EMAIL, name: 'Utilizador Empresa B', passwordHash, mustChangePassword: false },
  });
  await prisma.user.create({
    data: { companyId: CI, email: EMAIL, name: 'Utilizador Empresa Inactiva', passwordHash, mustChangePassword: false },
  });
  await prisma.user.create({
    data: { companyId: CS, email: EMAIL_SINGLE, name: 'Utilizador Empresa Unica', passwordHash, mustChangePassword: false },
  });
  await prisma.user.create({
    data: { companyId: CZ, email: EMAIL_ZERO, name: 'Utilizador Sem Empresa Activa', passwordHash, mustChangePassword: false },
  });
  await prisma.userRole.createMany({
    data: [
      { userId: userA.id, roleId: roleA.id },
      { userId: userB.id, roleId: roleB.id },
    ],
  });
});

afterAll(async () => {
  await teardown();
});

describe('auth company selection', () => {
  it('entra directamente quando há uma única empresa activa validada', async () => {
    const result = await authenticate(prisma, EMAIL_SINGLE, PASSWORD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.companyId).toBe(CS);
    expect(result.user.availableCompanyIds).toEqual([CS]);
  });

  it('não escolhe implicitamente quando o email tem várias empresas activas', async () => {
    const result = await authenticate(prisma, EMAIL, PASSWORD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.companyId).toBeNull();
    expect(result.user.permissions).toEqual([]);
    expect(result.user.availableCompanyIds.sort()).toEqual([CA, CB]);
  });

  it('autentica sem contexto operacional quando não há empresa activa', async () => {
    const result = await authenticate(prisma, EMAIL_ZERO, PASSWORD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.companyId).toBeNull();
    expect(result.user.availableCompanyIds).toEqual([]);
  });

  it('lista apenas empresas activas associadas ao email autenticado', async () => {
    const memberships = await listActiveCompanyMemberships(prisma, EMAIL);

    expect(memberships.map((m) => m.companyId).sort()).toEqual([CA, CB]);
    expect(memberships.find((m) => m.companyId === CI)).toBeUndefined();
  });

  it('valida a escolha e carrega permissões apenas da empresa seleccionada', async () => {
    const selected = await selectActiveCompanyForEmail(prisma, EMAIL, CB);

    expect(selected?.companyId).toBe(CB);
    expect(selected?.permissions).toEqual(['auth.test.b']);
    expect(selected?.permissions).not.toContain('auth.test.a');
  });

  it('rejeita empresa inactiva ou sem membership para o email', async () => {
    await prisma.company.create({ data: { id: 'auth-company-c', legalName: 'Auth Empresa C' } });
    try {
      await expect(selectActiveCompanyForEmail(prisma, EMAIL, CI)).resolves.toBeNull();
      await expect(selectActiveCompanyForEmail(prisma, EMAIL, 'auth-company-c')).resolves.toBeNull();
    } finally {
      await prisma.company.delete({ where: { id: 'auth-company-c' } });
    }
  });

  it('invalida contexto antigo se a empresa deixar de estar activa', async () => {
    const selected = await selectActiveCompanyForEmail(prisma, EMAIL, CA);
    expect(selected?.companyId).toBe(CA);

    await prisma.company.update({ where: { id: CA }, data: { status: 'SUSPENDED' } });
    try {
      await expect(validateSessionCompany(prisma, selected!.id, CA)).resolves.toBeNull();
    } finally {
      await prisma.company.update({ where: { id: CA }, data: { status: 'ACTIVE' } });
    }
  });
});
