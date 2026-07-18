/**
 * Seed de desenvolvimento — ANTS ERP
 * NUNCA executar em produção (dados fictícios).
 *
 * Cria: permissões base, perfis de sistema, Super Admin da plataforma,
 * empresa demo "ANTS Demo, Lda." com filiais Maputo/Matola e utilizadores.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { assertDemoSeedAllowed, DEMO_SEED_PRODUCTION_ERROR } from '../src/demo-seed-guard';

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
  { key: 'supplierPayments.reverse', module: 'supplierPayments', description: 'Estornar pagamentos a fornecedores' },
  { key: 'purchaseReceipts.reverse', module: 'purchaseReceipts', description: 'Estornar recepcoes de compra' },
  { key: 'treasury.view', module: 'treasury', description: 'Ver tesouraria' },
  { key: 'treasury.createMovement', module: 'treasury', description: 'Registar movimentos de tesouraria' },
  { key: 'treasury.transfer', module: 'treasury', description: 'Transferir entre contas' },
  { key: 'treasury.manageAccounts', module: 'treasury', description: 'Gerir contas de tesouraria' },
  { key: 'treasury.viewReports', module: 'treasury', description: 'Ver relatórios de tesouraria' },
  { key: 'treasury.reverseMovement', module: 'treasury', description: 'Estornar movimentos de tesouraria' },
  { key: 'treasury.reverseTransfer', module: 'treasury', description: 'Estornar transferencias de tesouraria' },
  { key: 'products.view', module: 'products', description: 'Ver produtos' },
  { key: 'products.create', module: 'products', description: 'Criar produtos' },
  { key: 'products.update', module: 'products', description: 'Editar produtos' },
  { key: 'stock.view', module: 'stock', description: 'Ver stock' },
  { key: 'stock.adjust', module: 'stock', description: 'Ajustar stock' },
  { key: 'stock.transfer', module: 'stock', description: 'Transferir stock' },
  { key: 'suppliers.view', module: 'suppliers', description: 'Ver fornecedores' },
  { key: 'suppliers.create', module: 'suppliers', description: 'Criar fornecedores' },
  { key: 'suppliers.update', module: 'suppliers', description: 'Editar fornecedores' },
  { key: 'suppliers.delete', module: 'suppliers', description: 'Eliminar fornecedores' },
  { key: 'purchases.create', module: 'purchases', description: 'Criar compras' },
  { key: 'purchases.approve', module: 'purchases', description: 'Aprovar compras' },
  { key: 'accounting.view', module: 'accounting', description: 'Ver contabilidade (plano, lançamentos, relatórios)' },
  { key: 'accounting.prepare', module: 'accounting', description: 'Preparar lançamentos (criar/editar/eliminar rascunhos)' },
  { key: 'accounting.post', module: 'accounting', description: 'Publicar lançamentos' },
  { key: 'accounting.reverse', module: 'accounting', description: 'Estornar lançamentos' },
  { key: 'accounting.manageAccounts', module: 'accounting', description: 'Gerir plano de contas' },
  { key: 'accounting.managePeriods', module: 'accounting', description: 'Gerir exercícios e períodos' },
  { key: 'accounting.unlockPeriods', module: 'accounting', description: 'Reabrir exercícios/períodos bloqueados (LOCKED)' },
  { key: 'accounting.manageSettings', module: 'accounting', description: 'Gerir configuração contabilística (mappings)' },
  { key: 'payroll.process', module: 'payroll', description: 'Processar salários' },
  { key: 'payroll.approve', module: 'payroll', description: 'Aprovar salários' },
  { key: 'reports.export', module: 'reports', description: 'Exportar relatórios' },
  { key: 'users.manage', module: 'users', description: 'Gerir utilizadores' },
  { key: 'settings.manage', module: 'settings', description: 'Gerir configurações' },
  { key: 'audit.view', module: 'audit', description: 'Ver auditoria' },
];

async function seedDemo(prisma: PrismaClient) {
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
      phone: '+258 21 300 000',
      address: 'Av. 25 de Setembro, 1234, Maputo',
      website: 'https://ants.co.mz',
      settings: { create: {} },
    },
  });

  // 3b) Dados da empresa (S4): preenche campos novos só quando ainda vazios
  // (não sobrepõe alterações feitas no ecrã de configuração).
  await prisma.company.updateMany({
    where: { id: company.id, address: null },
    data: { address: 'Av. 25 de Setembro, 1234, Maputo' },
  });
  await prisma.company.updateMany({
    where: { id: company.id, website: null },
    data: { website: 'https://ants.co.mz' },
  });
  await prisma.company.updateMany({
    where: { id: company.id, phone: null },
    data: { phone: '+258 21 300 000' },
  });

  // Contas bancárias e carteiras móveis demo — sem chave única própria,
  // idempotente via findFirst + create.
  for (const [i, acc] of [
    { bankName: 'BCI', accountHolder: 'ANTS Demo, Lda.', accountNumber: '12345678901', nib: '000800001234567890123' },
    { bankName: 'Millennium BIM', accountHolder: 'ANTS Demo, Lda.', accountNumber: '98765432101', nib: '000100009876543210198' },
  ].entries()) {
    const exists = await prisma.companyBankAccount.findFirst({
      where: { companyId: company.id, bankName: acc.bankName, accountNumber: acc.accountNumber },
    });
    if (!exists) {
      await prisma.companyBankAccount.create({ data: { companyId: company.id, sortOrder: i, ...acc } });
    }
  }
  for (const [i, w] of [
    { provider: 'M-Pesa', walletNumber: '84 000 0000', accountHolder: 'ANTS Demo, Lda.' },
    { provider: 'e-Mola', walletNumber: '86 000 0000', accountHolder: 'ANTS Demo, Lda.' },
  ].entries()) {
    const exists = await prisma.companyMobileWallet.findFirst({
      where: { companyId: company.id, provider: w.provider, walletNumber: w.walletNumber },
    });
    if (!exists) {
      await prisma.companyMobileWallet.create({ data: { companyId: company.id, sortOrder: i, ...w } });
    }
  }

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
      keys: ['clients.view', 'clients.create', 'suppliers.view', 'suppliers.create', 'sales.view', 'sales.create', 'sales.approve_discount', 'purchases.create', 'purchases.approve', 'supplierPayments.reverse', 'purchaseReceipts.reverse', 'products.view', 'products.create', 'products.update', 'stock.view', 'stock.adjust', 'treasury.view', 'treasury.createMovement', 'treasury.transfer', 'treasury.manageAccounts', 'treasury.viewReports', 'treasury.reverseMovement', 'treasury.reverseTransfer', 'accounting.view', 'reports.export', 'audit.view'],
    },
    { name: 'Contabilista', description: 'Contabilidade e relatórios', keys: ['accounting.view', 'accounting.prepare', 'accounting.post', 'accounting.reverse', 'accounting.manageAccounts', 'accounting.managePeriods', 'accounting.manageSettings', 'payments.receive', 'suppliers.view', 'supplierPayments.reverse', 'purchaseReceipts.reverse', 'treasury.view', 'treasury.viewReports', 'reports.export', 'audit.view'] },
    { name: 'Caixa', description: 'Vendas e recebimentos', keys: ['sales.view', 'sales.create', 'invoices.issue', 'payments.receive', 'stock.view', 'treasury.view', 'treasury.createMovement', 'treasury.viewReports'] },
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

  // 11) Armazéns demo (1 por filial). Idempotente via @@unique([companyId, code]).
  const branchByCode = new Map(
    (await prisma.branch.findMany({ where: { companyId: company.id }, select: { id: true, code: true } })).map((b) => [b.code, b.id]),
  );
  const warehouseDefs = [
    { code: 'ARM-MAP', name: 'Armazém Maputo', branchCode: 'MAP' },
    { code: 'ARM-MAT', name: 'Armazém Matola', branchCode: 'MAT' },
  ];
  const whByCode = new Map<string, string>();
  for (const w of warehouseDefs) {
    const wh = await prisma.warehouse.upsert({
      where: { companyId_code: { companyId: company.id, code: w.code } },
      update: { name: w.name, branchId: branchByCode.get(w.branchCode) ?? null },
      create: { companyId: company.id, code: w.code, name: w.name, branchId: branchByCode.get(w.branchCode) ?? null },
    });
    whByCode.set(w.code, wh.id);
  }
  const mainWarehouseId = whByCode.get('ARM-MAP')!;

  // 12) Produtos demo (os 9 do design) + stock inicial no armazém de Maputo.
  // Idempotente: upsert por (companyId, sku); stock só é semeado se ainda não houver nível.
  const demoProducts: Array<{
    sku: string;
    name: string;
    category: string;
    brand: string;
    salePrice: number;
    minStock: number;
    stock: number;
  }> = [
    { sku: 'ANTS-RICE-5', name: 'Arroz Tio 5kg', category: 'Mercearia', brand: 'Tio', salePrice: 580, minStock: 80, stock: 420 },
    { sku: 'ANTS-OIL-1', name: 'Óleo Fula 1L', category: 'Mercearia', brand: 'Fula', salePrice: 165, minStock: 60, stock: 38 },
    { sku: 'ANTS-SUG-2', name: 'Açúcar Xinavane 2kg', category: 'Mercearia', brand: 'Xinavane', salePrice: 190, minStock: 50, stock: 260 },
    { sku: 'ANTS-WAT-5', name: 'Água Vumba 5L', category: 'Bebidas', brand: 'Vumba', salePrice: 95, minStock: 40, stock: 0 },
    { sku: 'ANTS-COL-2', name: 'Coca-Cola 2L', category: 'Bebidas', brand: 'Coca-Cola', salePrice: 140, minStock: 60, stock: 312 },
    { sku: 'ANTS-CEM-50', name: 'Cimento Dangote 50kg', category: 'Construção', brand: 'Dangote', salePrice: 720, minStock: 30, stock: 84 },
    { sku: 'ANTS-PAR-500', name: 'Paracetamol 500mg', category: 'Farmácia', brand: 'Genérico', salePrice: 45, minStock: 40, stock: 22 },
    { sku: 'ANTS-SOAP-1', name: 'Sabão Azul 400g', category: 'Higiene', brand: 'Lux', salePrice: 60, minStock: 100, stock: 540 },
    { sku: 'ANTS-RICE-25', name: 'Arroz Tio 25kg', category: 'Mercearia', brand: 'Tio', salePrice: 2650, minStock: 15, stock: 12 },
  ];
  for (const p of demoProducts) {
    const avgCost = Math.round(p.salePrice * 0.72);
    const product = await prisma.product.upsert({
      where: { companyId_sku: { companyId: company.id, sku: p.sku } },
      update: { name: p.name, category: p.category, brand: p.brand, salePrice: p.salePrice, avgCost, minStock: p.minStock, updatedBy: admin.id },
      create: { companyId: company.id, sku: p.sku, name: p.name, category: p.category, brand: p.brand, salePrice: p.salePrice, avgCost, minStock: p.minStock, createdBy: admin.id },
    });
    // Stock inicial (idempotente): só cria nível + movimento se ainda não existir nível.
    const existingLevel = await prisma.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: mainWarehouseId } },
    });
    if (!existingLevel) {
      await prisma.stockLevel.create({
        data: { companyId: company.id, productId: product.id, warehouseId: mainWarehouseId, quantity: p.stock },
      });
      if (p.stock > 0) {
        await prisma.stockMovement.create({
          data: {
            companyId: company.id,
            productId: product.id,
            warehouseId: mainWarehouseId,
            type: 'IN',
            quantity: p.stock,
            balanceAfter: p.stock,
            document: 'Stock inicial',
            reason: 'Carregamento inicial do catálogo (seed)',
            createdBy: admin.id,
          },
        });
      }
    }
  }

  // 13) Contas de tesouraria demo. Idempotente via @@unique([companyId, name]).
  // `key` é um identificador estável do seed (não depende da ordem da BD nem do nome
  // apresentado) usado para ligar deterministicamente a conta do razão (secção 15).
  const treasuryAccounts: Array<{ key: string; name: string; type: 'CASH' | 'BANK' | 'MOBILE' | 'OTHER'; reference?: string; balance: number }> = [
    { key: 'CAIXA_PRINCIPAL', name: 'Caixa Principal', type: 'CASH', reference: 'Numerário', balance: 84300 },
    { key: 'BCI', name: 'BCI', type: 'BANK', reference: 'IBAN ···· 1234567', balance: 192400 },
    { key: 'MILLENNIUM', name: 'Millennium BIM', type: 'BANK', reference: 'IBAN ···· 7654321', balance: 244950 },
    { key: 'MPESA', name: 'M-Pesa', type: 'MOBILE', reference: '84 555 1234', balance: 46200 },
    { key: 'EMOLA', name: 'e-Mola', type: 'MOBILE', reference: '86 222 9090', balance: 18750 },
  ];
  const treasuryIdByKey = new Map<string, string>();
  for (const a of treasuryAccounts) {
    // Banco e "outras" permitem descoberto; caixa e carteiras móveis não.
    const allowNegative = a.type === 'BANK' || a.type === 'OTHER';
    const acc = await prisma.treasuryAccount.upsert({
      where: { companyId_name: { companyId: company.id, name: a.name } },
      update: { type: a.type, reference: a.reference, allowNegative, updatedBy: admin.id },
      create: { companyId: company.id, name: a.name, type: a.type, reference: a.reference, allowNegative, openingBalance: a.balance, balance: a.balance, createdBy: admin.id },
    });
    treasuryIdByKey.set(a.key, acc.id);
  }

  // 14) Contabilidade (Fase 8a) — plano-base, diários, exercício, períodos, mappings.
  //
  // Idempotente e NÃO destrutivo:
  // - contas/diários/exercício/períodos: criados apenas se ausentes (nunca repõem
  //   nome/código/natureza/hierarquia de algo personalizado pelo utilizador);
  // - mappings: criados apenas se ausentes (não repõem repontagens manuais);
  // - exercício corrente (Opção 1): se já existir um isCurrent=true, o novo fica
  //   isCurrent=false; o seed nunca desmarca um exercício corrente existente.
  //
  // Decisão (Fase 8a): exercício de CALENDÁRIO (1 Jan–31 Dez). Não se inventa
  // estrutura dentro de CompanySettings.fiscal; exercícios não-calendário ficam
  // para configuração explícita futura. Sem período 13 nesta fase. Sem lançamentos.

  // Plano de contas inicial (mínimo, hierárquico). provisioningKey = só provisionamento.
  type Acct = {
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    normal: 'DEBIT' | 'CREDIT';
    parent: string | null;
    level: number;
    posting: boolean;
    provisioningKey?: string;
  };
  const chart: Acct[] = [
    // Nível 1 — classes (agrupadoras)
    { code: '1', name: 'Activo', type: 'ASSET', normal: 'DEBIT', parent: null, level: 1, posting: false },
    { code: '2', name: 'Passivo', type: 'LIABILITY', normal: 'CREDIT', parent: null, level: 1, posting: false },
    { code: '3', name: 'Capital próprio', type: 'EQUITY', normal: 'CREDIT', parent: null, level: 1, posting: false },
    { code: '4', name: 'Proveitos', type: 'REVENUE', normal: 'CREDIT', parent: null, level: 1, posting: false },
    { code: '5', name: 'Custos e perdas', type: 'EXPENSE', normal: 'DEBIT', parent: null, level: 1, posting: false },
    // Nível 2 — grupos (agrupadoras)
    { code: '11', name: 'Meios monetários', type: 'ASSET', normal: 'DEBIT', parent: '1', level: 2, posting: false },
    { code: '12', name: 'Clientes', type: 'ASSET', normal: 'DEBIT', parent: '1', level: 2, posting: false },
    { code: '13', name: 'Inventário', type: 'ASSET', normal: 'DEBIT', parent: '1', level: 2, posting: false },
    { code: '14', name: 'Estado (activo)', type: 'ASSET', normal: 'DEBIT', parent: '1', level: 2, posting: false },
    { code: '21', name: 'Fornecedores', type: 'LIABILITY', normal: 'CREDIT', parent: '2', level: 2, posting: false },
    { code: '22', name: 'Estado (passivo)', type: 'LIABILITY', normal: 'CREDIT', parent: '2', level: 2, posting: false },
    { code: '23', name: 'Pessoal', type: 'LIABILITY', normal: 'CREDIT', parent: '2', level: 2, posting: false },
    { code: '31', name: 'Capital', type: 'EQUITY', normal: 'CREDIT', parent: '3', level: 2, posting: false },
    { code: '32', name: 'Resultados', type: 'EQUITY', normal: 'CREDIT', parent: '3', level: 2, posting: false },
    { code: '41', name: 'Vendas', type: 'REVENUE', normal: 'CREDIT', parent: '4', level: 2, posting: false },
    { code: '51', name: 'Custo das vendas', type: 'EXPENSE', normal: 'DEBIT', parent: '5', level: 2, posting: false },
    { code: '52', name: 'Compras', type: 'EXPENSE', normal: 'DEBIT', parent: '5', level: 2, posting: false },
    { code: '53', name: 'Fornecimentos e serviços', type: 'EXPENSE', normal: 'DEBIT', parent: '5', level: 2, posting: false },
    { code: '54', name: 'Custos com pessoal', type: 'EXPENSE', normal: 'DEBIT', parent: '5', level: 2, posting: false },
    // Nível 3 — contas de movimento (posting)
    { code: '111', name: 'Caixa', type: 'ASSET', normal: 'DEBIT', parent: '11', level: 3, posting: true, provisioningKey: 'CASH_MAIN' },
    { code: '112', name: 'Bancos', type: 'ASSET', normal: 'DEBIT', parent: '11', level: 3, posting: true, provisioningKey: 'BANK_MAIN' },
    { code: '113', name: 'Carteiras móveis', type: 'ASSET', normal: 'DEBIT', parent: '11', level: 3, posting: true, provisioningKey: 'MOBILE_MONEY' },
    { code: '121', name: 'Clientes c/c', type: 'ASSET', normal: 'DEBIT', parent: '12', level: 3, posting: true, provisioningKey: 'ACCOUNTS_RECEIVABLE' },
    { code: '131', name: 'Mercadorias', type: 'ASSET', normal: 'DEBIT', parent: '13', level: 3, posting: true, provisioningKey: 'INVENTORY' },
    { code: '141', name: 'IVA dedutível', type: 'ASSET', normal: 'DEBIT', parent: '14', level: 3, posting: true, provisioningKey: 'VAT_INPUT' },
    { code: '211', name: 'Fornecedores c/c', type: 'LIABILITY', normal: 'CREDIT', parent: '21', level: 3, posting: true, provisioningKey: 'ACCOUNTS_PAYABLE' },
    { code: '221', name: 'IVA liquidado', type: 'LIABILITY', normal: 'CREDIT', parent: '22', level: 3, posting: true, provisioningKey: 'VAT_OUTPUT' },
    { code: '231', name: 'Remunerações a pagar', type: 'LIABILITY', normal: 'CREDIT', parent: '23', level: 3, posting: true, provisioningKey: 'SALARIES_PAYABLE' },
    { code: '311', name: 'Capital social', type: 'EQUITY', normal: 'CREDIT', parent: '31', level: 3, posting: true },
    // S8: contrapartida do lançamento de abertura de stock inicial (produto novo sem fornecedor).
    { code: '312', name: 'Regularização de abertura de existências', type: 'EQUITY', normal: 'CREDIT', parent: '31', level: 3, posting: true, provisioningKey: 'OPENING_BALANCE_EQUITY' },
    { code: '321', name: 'Resultado do exercício', type: 'EQUITY', normal: 'CREDIT', parent: '32', level: 3, posting: true },
    { code: '322', name: 'Resultados transitados', type: 'EQUITY', normal: 'CREDIT', parent: '32', level: 3, posting: true },
    { code: '411', name: 'Vendas de mercadorias', type: 'REVENUE', normal: 'CREDIT', parent: '41', level: 3, posting: true, provisioningKey: 'SALES_REVENUE' },
    { code: '511', name: 'Custo das mercadorias vendidas', type: 'EXPENSE', normal: 'DEBIT', parent: '51', level: 3, posting: true, provisioningKey: 'COST_OF_GOODS_SOLD' },
    { code: '521', name: 'Compras de mercadorias', type: 'EXPENSE', normal: 'DEBIT', parent: '52', level: 3, posting: true, provisioningKey: 'PURCHASES_EXPENSE' },
    { code: '531', name: 'Despesas gerais', type: 'EXPENSE', normal: 'DEBIT', parent: '53', level: 3, posting: true, provisioningKey: 'GENERAL_EXPENSE' },
    { code: '532', name: 'Diferenças de caixa', type: 'EXPENSE', normal: 'DEBIT', parent: '53', level: 3, posting: true, provisioningKey: 'CASH_DIFFERENCE' },
    { code: '541', name: 'Salários', type: 'EXPENSE', normal: 'DEBIT', parent: '54', level: 3, posting: true, provisioningKey: 'SALARIES_EXPENSE' },
  ];
  // Inserção por ordem de nível (pais primeiro). Não destrutivo: existente → mantém-se.
  const acctIdByCode = new Map<string, string>();
  for (const a of chart) {
    const existing = await prisma.ledgerAccount.findUnique({
      where: { companyId_code: { companyId: company.id, code: a.code } },
    });
    if (existing) {
      acctIdByCode.set(a.code, existing.id);
      continue;
    }
    const created = await prisma.ledgerAccount.create({
      data: {
        companyId: company.id,
        code: a.code,
        name: a.name,
        accountType: a.type,
        normalBalance: a.normal,
        parentId: a.parent ? acctIdByCode.get(a.parent) ?? null : null,
        level: a.level,
        isPosting: a.posting,
        provisioningKey: a.provisioningKey ?? null,
      },
    });
    acctIdByCode.set(a.code, created.id);
  }

  // Diários contabilísticos. Idempotente (upsert por companyId+code), não destrutivo.
  const journals: Array<{ code: string; name: string; type: 'GENERAL' | 'SALES' | 'PURCHASES' | 'CASH' | 'BANK' | 'PAYROLL' | 'ADJUSTMENT' | 'OPENING'; prefix: string }> = [
    { code: 'DG', name: 'Diário Geral', type: 'GENERAL', prefix: 'LG' },
    { code: 'DV', name: 'Diário de Vendas', type: 'SALES', prefix: 'LV' },
    { code: 'DC', name: 'Diário de Compras', type: 'PURCHASES', prefix: 'LC' },
    { code: 'DCX', name: 'Diário de Caixa', type: 'CASH', prefix: 'CX' },
    { code: 'DBC', name: 'Diário de Bancos', type: 'BANK', prefix: 'BC' },
    { code: 'DSA', name: 'Diário de Salários', type: 'PAYROLL', prefix: 'SA' },
    { code: 'DAJ', name: 'Diário de Ajustamentos', type: 'ADJUSTMENT', prefix: 'AJ' },
    { code: 'DAB', name: 'Diário de Abertura', type: 'OPENING', prefix: 'AB' },
  ];
  for (const j of journals) {
    await prisma.accountingJournal.upsert({
      where: { companyId_code: { companyId: company.id, code: j.code } },
      update: {},
      create: { companyId: company.id, code: j.code, name: j.name, journalType: j.type, sequencePrefix: j.prefix },
    });
  }

  // Mappings (systemKey → conta). Resolvidos por provisioningKey. Criados se ausentes.
  const systemKeys = [
    'CASH_MAIN', 'BANK_MAIN', 'MOBILE_MONEY', 'ACCOUNTS_RECEIVABLE', 'INVENTORY', 'VAT_INPUT',
    'ACCOUNTS_PAYABLE', 'VAT_OUTPUT', 'SALARIES_PAYABLE', 'SALES_REVENUE', 'COST_OF_GOODS_SOLD',
    'PURCHASES_EXPENSE', 'GENERAL_EXPENSE', 'CASH_DIFFERENCE', 'SALARIES_EXPENSE',
    'OPENING_BALANCE_EQUITY',
  ];
  for (const key of systemKeys) {
    const acct = await prisma.ledgerAccount.findUnique({
      where: { companyId_provisioningKey: { companyId: company.id, provisioningKey: key } },
    });
    if (!acct) continue;
    const existing = await prisma.accountingMapping.findUnique({
      where: { companyId_systemKey: { companyId: company.id, systemKey: key } },
    });
    if (!existing) {
      await prisma.accountingMapping.create({
        data: { companyId: company.id, systemKey: key, ledgerAccountId: acct.id },
      });
    }
  }

  // Exercício fiscal de calendário do ano corrente (fuso de Maputo). Opção 1 p/ isCurrent.
  const currentYear = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()),
  );
  const fyName = String(currentYear);
  let fiscalYear = await prisma.fiscalYear.findUnique({
    where: { companyId_name: { companyId: company.id, name: fyName } },
  });
  if (!fiscalYear) {
    const alreadyHasCurrent = await prisma.fiscalYear.findFirst({
      where: { companyId: company.id, isCurrent: true },
    });
    fiscalYear = await prisma.fiscalYear.create({
      data: {
        companyId: company.id,
        name: fyName,
        startDate: new Date(Date.UTC(currentYear, 0, 1)),
        endDate: new Date(Date.UTC(currentYear, 11, 31)),
        status: 'OPEN',
        isCurrent: !alreadyHasCurrent,
        createdById: admin.id,
      },
    });
  }

  // 12 períodos normais (mensais). Sem período 13 nesta fase. Criados se ausentes.
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  for (let m = 1; m <= 12; m++) {
    const code = `${fyName}-${String(m).padStart(2, '0')}`;
    const existing = await prisma.accountingPeriod.findUnique({
      where: { companyId_code: { companyId: company.id, code } },
    });
    if (!existing) {
      await prisma.accountingPeriod.create({
        data: {
          companyId: company.id,
          fiscalYearId: fiscalYear.id,
          periodNumber: m,
          code,
          name: `${months[m - 1]} ${fyName}`,
          startDate: new Date(Date.UTC(currentYear, m - 1, 1)),
          endDate: new Date(Date.UTC(currentYear, m, 0)),
          isAdjustment: false,
          status: 'OPEN',
        },
      });
    }
  }

  // 15) Mapping contabilístico individual das contas de tesouraria (Fase 8c.1).
  // Liga cada conta de tesouraria a uma conta-razão (1:1). Determinístico (por `key`,
  // não por ordem da BD). Não destrutivo: liga só se ausente; nunca rouba uma conta-razão
  // já associada. Bancos/carteiras adicionais → contas-irmãs sob a agrupadora `11`
  // (NUNCA filhos de 112/113, que são contas de movimento). `provisioningKey` permite
  // reencontrar a conta mesmo após renomeação pelo utilizador.
  await provisionTreasuryLedgerMapping(prisma, company.id, [
    { treasuryAccountId: treasuryIdByKey.get('CAIXA_PRINCIPAL')!, existingLedgerCode: '111' },
    { treasuryAccountId: treasuryIdByKey.get('BCI')!, existingLedgerCode: '112' },
    { treasuryAccountId: treasuryIdByKey.get('MPESA')!, existingLedgerCode: '113' },
    { treasuryAccountId: treasuryIdByKey.get('MILLENNIUM')!, createSibling: { code: '114', name: 'Millennium BIM', provisioningKey: 'TREASURY_BANK_MILLENNIUM_BIM', parentCode: '11' } },
    { treasuryAccountId: treasuryIdByKey.get('EMOLA')!, createSibling: { code: '115', name: 'e-Mola', provisioningKey: 'TREASURY_MOBILE_EMOLA', parentCode: '11' } },
  ]);

  console.log('Seed concluído: empresa demo, filiais, permissões, perfis, utilizadores, clientes, fornecedores, produtos, stock, tesouraria e contabilidade (plano, diários, exercício, períodos, mappings + ligação tesouraria↔razão).');
}

/**
 * Provisionamento reutilizável (por empresa) do mapping individual tesouraria↔razão.
 * Demo-específico fica nos argumentos; esta lógica serve qualquer empresa.
 * Para empresas reais, o mapping é configurado explicitamente (accounting.manageSettings);
 * não se cria automaticamente uma conta do razão por cada banco do utilizador.
 */
type TreasuryLedgerLink = {
  treasuryAccountId: string;
  existingLedgerCode?: string;
  createSibling?: { code: string; name: string; provisioningKey: string; parentCode: string };
};

async function provisionTreasuryLedgerMapping(db: PrismaClient, companyId: string, links: TreasuryLedgerLink[]): Promise<void> {
  for (const link of links) {
    const ledgerAccountId = link.createSibling
      ? (await ensureSiblingLedgerAccount(db, companyId, link.createSibling)).id
      : (await requireLedgerByCode(db, companyId, link.existingLedgerCode!)).id;

    const ta = await db.treasuryAccount.findFirst({ where: { id: link.treasuryAccountId, companyId } });
    if (!ta) continue;
    if (ta.ledgerAccountId) continue; // já ligada — não reescreve (não destrutivo)
    const taken = await db.treasuryAccount.findFirst({ where: { companyId, ledgerAccountId, NOT: { id: ta.id } } });
    if (taken) throw new Error(`Conta-razão já associada a outra conta de tesouraria (${taken.name}).`);
    await db.treasuryAccount.update({ where: { id: ta.id }, data: { ledgerAccountId } });
  }
}

async function requireLedgerByCode(db: PrismaClient, companyId: string, code: string) {
  const acc = await db.ledgerAccount.findFirst({ where: { companyId, code } });
  if (!acc) throw new Error(`Conta-razão ${code} não encontrada para o mapping de tesouraria.`);
  return acc;
}

/** Cria (ou reencontra) uma conta-razão de movimento irmã, sob a agrupadora indicada. Idempotente. */
async function ensureSiblingLedgerAccount(db: PrismaClient, companyId: string, spec: { code: string; name: string; provisioningKey: string; parentCode: string }) {
  const byKey = await db.ledgerAccount.findFirst({ where: { companyId, provisioningKey: spec.provisioningKey } });
  if (byKey) return byKey; // reencontrada por provisioningKey (sobrevive a renomeação)
  const byCode = await db.ledgerAccount.findFirst({ where: { companyId, code: spec.code } });
  if (byCode) {
    if (byCode.provisioningKey !== spec.provisioningKey) {
      throw new Error(`Código ${spec.code} ocupado por conta não relacionada (${byCode.name}). Não reutilizado.`);
    }
    return byCode;
  }
  const parent = await db.ledgerAccount.findFirst({ where: { companyId, code: spec.parentCode } });
  if (!parent) throw new Error(`Conta agrupadora ${spec.parentCode} não encontrada.`);
  if (parent.isPosting) throw new Error(`A conta ${spec.parentCode} é de movimento; não pode ter filhos.`);
  return db.ledgerAccount.create({
    data: {
      companyId,
      code: spec.code,
      name: spec.name,
      accountType: 'ASSET',
      normalBalance: 'DEBIT',
      parentId: parent.id,
      level: parent.level + 1,
      isPosting: true,
      isActive: true,
      provisioningKey: spec.provisioningKey,
    },
  });
}

async function main() {
  assertDemoSeedAllowed();
  const prisma = new PrismaClient();
  try {
    await seedDemo(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    if (e instanceof Error && e.message === DEMO_SEED_PRODUCTION_ERROR) {
      console.error(e.message);
    } else {
      console.error(e);
    }
    process.exit(1);
  });
