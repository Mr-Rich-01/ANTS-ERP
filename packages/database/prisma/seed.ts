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
  { key: 'suppliers.view', module: 'suppliers', description: 'Ver fornecedores' },
  { key: 'suppliers.create', module: 'suppliers', description: 'Criar fornecedores' },
  { key: 'suppliers.update', module: 'suppliers', description: 'Editar fornecedores' },
  { key: 'suppliers.delete', module: 'suppliers', description: 'Eliminar fornecedores' },
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

  // 2) Super Admin da plataforma (sem empresa). companyId null não é coberto pela
  // chave única composta, por isso é idempotente via findFirst + create/update.
  const platformPassword = await hash('Admin@123');
  const existingSuper = await prisma.user.findFirst({
    where: { email: 'superadmin@ants.co.mz', companyId: null },
  });
  if (existingSuper) {
    await prisma.user.update({
      where: { id: existingSuper.id },
      data: { passwordHash: platformPassword, name: 'Super Administrador', isPlatformAdmin: true },
    });
  } else {
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

  // 7) Perfis adicionais (subconjuntos de permissões) + utilizadores demo
  const permByKey = new Map(allPermissions.map((p) => [p.key, p.id]));
  const roleDefs: Array<{ name: string; description: string; keys: string[] }> = [
    {
      name: 'Gestor',
      description: 'Gestão operacional e aprovações',
      keys: ['clients.view', 'clients.create', 'suppliers.view', 'suppliers.create', 'sales.view', 'sales.create', 'sales.approve_discount', 'purchases.create', 'purchases.approve', 'stock.view', 'reports.export', 'audit.view'],
    },
    { name: 'Contabilista', description: 'Contabilidade e relatórios', keys: ['accounting.post', 'accounting.reverse', 'payments.receive', 'suppliers.view', 'reports.export', 'audit.view'] },
    { name: 'Caixa', description: 'Vendas e recebimentos', keys: ['sales.view', 'sales.create', 'invoices.issue', 'payments.receive'] },
    { name: 'Vendedor', description: 'Vendas e clientes', keys: ['sales.view', 'sales.create', 'clients.view', 'clients.create'] },
  ];

  const roleByName = new Map<string, string>();
  for (const rd of roleDefs) {
    const role = await prisma.role.upsert({
      where: { companyId_name: { companyId: company.id, name: rd.name } },
      update: { description: rd.description },
      create: { companyId: company.id, name: rd.name, description: rd.description },
    });
    roleByName.set(rd.name, role.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: rd.keys.map((k) => permByKey.get(k)).filter((id): id is string => !!id).map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  const demoUsers: Array<{ email: string; name: string; role: string; status?: 'ACTIVE' | 'INACTIVE' }> = [
    { email: 'maria@ants.co.mz', name: 'Maria Tembe', role: 'Caixa' },
    { email: 'joao@ants.co.mz', name: 'João Macuácua', role: 'Vendedor' },
    { email: 'ana@ants.co.mz', name: 'Ana Cossa', role: 'Contabilista' },
    { email: 'carlos@ants.co.mz', name: 'Carlos Sitoe', role: 'Vendedor' },
    { email: 'lucia@ants.co.mz', name: 'Lúcia Mondlane', role: 'Gestor', status: 'INACTIVE' },
  ];
  const demoPassword = await hash('Demo@123');
  for (const du of demoUsers) {
    const u = await prisma.user.upsert({
      where: { companyId_email: { companyId: company.id, email: du.email } },
      update: { name: du.name, status: du.status ?? 'ACTIVE' },
      create: { companyId: company.id, email: du.email, name: du.name, passwordHash: demoPassword, mustChangePassword: false, status: du.status ?? 'ACTIVE' },
    });
    const roleId = roleByName.get(du.role);
    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: u.id, roleId } },
        update: {},
        create: { userId: u.id, roleId },
      });
    }
  }

  // 8) Auditoria de exemplo (apenas se ainda não houver registos da empresa)
  const auditCount = await prisma.auditLog.count({ where: { companyId: company.id } });
  if (auditCount === 0) {
    await prisma.auditLog.createMany({
      data: [
        { companyId: company.id, userId: admin.id, action: 'product.price_update', entity: 'Product', entityId: 'ANTS-OIL-1', oldValues: { price: 150 }, newValues: { price: 165 }, result: 'success' },
        { companyId: company.id, userId: admin.id, action: 'invoice.cancel', entity: 'Invoice', entityId: 'FT 2026/0331', reason: 'Erro de facturação', result: 'success' },
        { companyId: company.id, userId: admin.id, action: 'sale.create', entity: 'Sale', entityId: 'VND-2041', newValues: { total: 12500 }, result: 'success' },
      ],
    });
  }

  // 9) Clientes demo (os 6 do design). Idempotente via @@unique([companyId, nuit]).
  // Estado de conta deriva do balance: > 0 com dívida · < 0 saldo a favor · 0 regular.
  const demoCustomers: Array<{
    name: string;
    nuit: string;
    phone: string;
    email?: string;
    address?: string;
    province?: string;
    district?: string;
    segment: string;
    creditLimit: number;
    paymentTermDays: number;
    balance: number;
  }> = [
    { name: 'Distribuidora Maputo, Lda', nuit: '400785214', phone: '+258 84 321 0099', email: 'compras@distmaputo.co.mz', address: 'Av. 24 de Julho, nº 1290', province: 'Maputo Cidade', district: 'KaMpfumo', segment: 'Grossista', creditLimit: 100000, paymentTermDays: 30, balance: 48900 },
    { name: 'Farmácia Sigma', nuit: '400112908', phone: '+258 82 110 2030', province: 'Maputo Cidade', segment: 'Saúde', creditLimit: 50000, paymentTermDays: 0, balance: 0 },
    { name: 'Restaurante Costa do Sol', nuit: '400556711', phone: '+258 84 700 1212', province: 'Maputo Cidade', district: 'KaMaxakeni', segment: 'Restauração', creditLimit: 30000, paymentTermDays: 15, balance: 15200 },
    { name: 'Hotel Polana Lodge', nuit: '400778540', phone: '+258 21 491 001', province: 'Maputo Cidade', district: 'KaMpfumo', segment: 'Hotelaria', creditLimit: 80000, paymentTermDays: 30, balance: 62400 },
    { name: 'Mercearia Bom Preço', nuit: '400334122', phone: '+258 86 555 0099', province: 'Maputo Cidade', segment: 'Retalho', creditLimit: 20000, paymentTermDays: 0, balance: 0 },
    { name: 'Auto Peças Matola', nuit: '400220665', phone: '+258 84 909 8800', province: 'Maputo Província', district: 'Matola', segment: 'Automóvel', creditLimit: 40000, paymentTermDays: 30, balance: -3400 },
  ];
  for (const c of demoCustomers) {
    await prisma.customer.upsert({
      where: { companyId_nuit: { companyId: company.id, nuit: c.nuit } },
      update: {
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        province: c.province,
        district: c.district,
        segment: c.segment,
        creditLimit: c.creditLimit,
        paymentTermDays: c.paymentTermDays,
        balance: c.balance,
        updatedBy: admin.id,
      },
      create: {
        companyId: company.id,
        name: c.name,
        type: 'COMPANY',
        nuit: c.nuit,
        phone: c.phone,
        email: c.email,
        address: c.address,
        province: c.province,
        district: c.district,
        segment: c.segment,
        creditLimit: c.creditLimit,
        paymentTermDays: c.paymentTermDays,
        balance: c.balance,
        createdBy: admin.id,
      },
    });
  }

  // 10) Fornecedores demo (os 6 do design). Idempotente via @@unique([companyId, nuit]).
  // Estado de conta deriva do balance: > 0 a empresa deve (a pagar) · < 0 adiantamento · 0 regular.
  const demoSuppliers: Array<{
    name: string;
    nuit: string;
    phone: string;
    email?: string;
    address?: string;
    province?: string;
    category: string;
    creditLimit: number;
    paymentTermDays: number;
    balance: number;
  }> = [
    { name: 'Dangote Cimento, SA', nuit: '400990112', phone: '+258 21 720 400', email: 'vendas@dangote.co.mz', address: 'Av. das Indústrias, Matola', province: 'Maputo Província', category: 'Construção', creditLimit: 250000, paymentTermDays: 30, balance: 186300 },
    { name: 'Distribuidora Fula', nuit: '400221884', phone: '+258 84 330 1188', province: 'Maputo Cidade', category: 'Distribuição', creditLimit: 100000, paymentTermDays: 30, balance: 0 },
    { name: 'Coca-Cola Sabco', nuit: '400778221', phone: '+258 21 460 700', province: 'Maputo Cidade', category: 'Bebidas', creditLimit: 150000, paymentTermDays: 45, balance: 84000 },
    { name: 'Xinavane Açúcar, SA', nuit: '400112667', phone: '+258 23 110 050', province: 'Maputo Província', category: 'Alimentar', creditLimit: 120000, paymentTermDays: 30, balance: 57000 },
    { name: 'Águas de Moçambique', nuit: '400556003', phone: '+258 21 350 900', province: 'Maputo Cidade', category: 'Utilidades', creditLimit: 0, paymentTermDays: 0, balance: 0 },
    { name: 'Lux Higiene, Lda', nuit: '400334909', phone: '+258 84 221 6677', province: 'Maputo Cidade', category: 'Higiene', creditLimit: 40000, paymentTermDays: 30, balance: 12000 },
  ];
  for (const s of demoSuppliers) {
    await prisma.supplier.upsert({
      where: { companyId_nuit: { companyId: company.id, nuit: s.nuit } },
      update: {
        name: s.name,
        phone: s.phone,
        email: s.email,
        address: s.address,
        province: s.province,
        category: s.category,
        creditLimit: s.creditLimit,
        paymentTermDays: s.paymentTermDays,
        balance: s.balance,
        updatedBy: admin.id,
      },
      create: {
        companyId: company.id,
        name: s.name,
        type: 'COMPANY',
        nuit: s.nuit,
        phone: s.phone,
        email: s.email,
        address: s.address,
        province: s.province,
        category: s.category,
        creditLimit: s.creditLimit,
        paymentTermDays: s.paymentTermDays,
        balance: s.balance,
        createdBy: admin.id,
      },
    });
  }

  console.log('Seed concluído: empresa demo, filiais, permissões, perfis, utilizadores, clientes e fornecedores.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
