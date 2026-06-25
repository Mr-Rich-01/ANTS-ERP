/**
 * Seed de desenvolvimento — ANTS ERP
 * NUNCA executar em produção (dados fictícios).
 *
 * Cria: permissões base, perfis de sistema, Super Admin da plataforma,
 * empresa demo "ANTS Demo, Lda." com filiais Maputo/Matola e utilizadores.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Catálogo inicial de permissões (granulares, independentes do nome do perfil)
const PERMISSIONS: Array<{ key: string; module: string; description: string }> = [
  { key: 'clients.view', module: 'clients', description: 'Ver clientes' },
  { key: 'clients.create', module: 'clients', description: 'Criar clientes' },
  { key: 'clients.update', module: 'clients', description: 'Editar clientes' },
  { key: 'clients.delete', module: 'clients', description: 'Eliminar clientes' },
  { key: 'sales.view', module: 'sales', description: 'Ver vendas' },
  { key: 'sales.create', module: 'sales', description: 'Criar vendas' },
  { key: 'sales.cancel', module: 'sales', description: 'Cancelar vendas' },
  { key: 'sales.approve_discount', module: 'sales', description: 'Aprovar descontos' },
  { key: 'invoices.issue', module: 'invoices', description: 'Emitir facturas' },
  { key: 'invoices.cancel', module: 'invoices', description: 'Cancelar facturas' },
  { key: 'payments.receive', module: 'payments', description: 'Receber pagamentos' },
  { key: 'payments.cancel', module: 'payments', description: 'Cancelar pagamentos' },
  { key: 'stock.view', module: 'stock', description: 'Ver stock' },
  { key: 'stock.adjust', module: 'stock', description: 'Ajustar stock' },
  { key: 'stock.transfer', module: 'stock', description: 'Transferir stock' },
  { key: 'purchases.create', module: 'purchases', description: 'Criar compras' },
  { key: 'purchases.approve', module: 'purchases', description: 'Aprovar compras' },
  { key: 'accounting.post', module: 'accounting', description: 'Publicar lançamentos' },
  { key: 'accounting.reverse', module: 'accounting', description: 'Estornar lançamentos' },
  { key: 'payroll.process', module: 'payroll', description: 'Processar salários' },
  { key: 'payroll.approve', module: 'payroll', description: 'Aprovar salários' },
  { key: 'reports.export', module: 'reports', description: 'Exportar relatórios' },
  { key: 'users.manage', module: 'users', description: 'Gerir utilizadores' },
  { key: 'settings.manage', module: 'settings', description: 'Gerir configurações' },
  { key: 'audit.view', module: 'audit', description: 'Ver auditoria' },
];

async function main() {
  // 1) Permissões
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description, module: p.module },
      create: p,
    });
  }
  const allPermissions = await prisma.permission.findMany();

  // 2) Super Admin da plataforma (sem empresa)
  const platformPassword = await hash('Admin@123');
  await prisma.user.upsert({
    where: { companyId_email: { companyId: '', email: 'superadmin@ants.co.mz' } },
    update: {},
    create: {
      email: 'superadmin@ants.co.mz',
      passwordHash: platformPassword,
      name: 'Super Administrador',
      isPlatformAdmin: true,
      mustChangePassword: true,
    },
  }).catch(async () => {
    // companyId null não funciona em chave composta única; criar directamente
    const exists = await prisma.user.findFirst({
      where: { email: 'superadmin@ants.co.mz', companyId: null },
    });
    if (!exists) {
      await prisma.user.create({
        data: {
          email: 'superadmin@ants.co.mz',
          passwordHash: platformPassword,
          name: 'Super Administrador',
          isPlatformAdmin: true,
          mustChangePassword: true,
        },
      });
    }
  });

  // 3) Empresa demo
  const company = await prisma.company.upsert({
    where: { id: 'demo-company' },
    update: {},
    create: {
      id: 'demo-company',
      legalName: 'ANTS Demo, Lda.',
      tradeName: 'ANTS Comercial',
      nuit: '400000000',
      email: 'geral@ants.co.mz',
      currency: 'MZN',
      currencySymbol: 'MT',
      timezone: 'Africa/Maputo',
      locale: 'pt-MZ',
      settings: { create: {} },
    },
  });

  // 4) Filiais
  for (const b of [
    { code: 'MAP', name: 'Maputo' },
    { code: 'MAT', name: 'Matola' },
  ]) {
    await prisma.branch.upsert({
      where: { companyId_code: { companyId: company.id, code: b.code } },
      update: {},
      create: { companyId: company.id, code: b.code, name: b.name },
    });
  }

  // 5) Perfil Administrador da Empresa (todas as permissões)
  const adminRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Administrador da Empresa' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'Administrador da Empresa',
      description: 'Acesso total à empresa',
    },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // 6) Utilizador admin da empresa demo
  const adminPassword = await hash('Admin@123');
  const admin = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: 'admin@ants.co.mz' } },
    update: {},
    create: {
      companyId: company.id,
      email: 'admin@ants.co.mz',
      passwordHash: adminPassword,
      name: 'Administrador Demo',
      mustChangePassword: false,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  console.log('Seed concluído: empresa demo, filiais, permissões, perfil e utilizadores.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
