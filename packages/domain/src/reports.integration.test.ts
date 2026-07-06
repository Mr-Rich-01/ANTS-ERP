/**
 * Suite de integracao dos Relatorios V1.
 * Correr com: `pnpm test:integration:reports` (exige DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ForbiddenError, NotFoundError } from './errors';
import { getCompanyPrintProfile } from './admin';
import { getCustomerPaymentReceipt, getInvoice } from './invoices';
import { exportOperationalReportCsv, getOperationalReport } from './reports';
import { dailyReport } from './treasury';

const CA = 'reports-v1-a';
const CB = 'reports-v1-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, userName: 'Operador Teste', permissions: new Set(permissions), isPlatformAdmin: false };
}

const allPerms = [
  'reports.export',
  'sales.view',
  'clients.view',
  'purchases.create',
  'suppliers.view',
  'stock.view',
  'treasury.viewReports',
  'audit.view',
];

let fixture: {
  invoiceA?: string;
  invoiceB?: string;
  paymentA?: string;
  paymentB?: string;
  accountA?: string;
} = {};

async function teardown(companyId: string) {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.supplierPayment.deleteMany({ where: { companyId } });
  await prisma.purchaseReceiptItem.deleteMany({ where: { companyId } });
  await prisma.purchaseReceipt.deleteMany({ where: { companyId } });
  await prisma.purchaseOrderLine.deleteMany({ where: { companyId } });
  await prisma.purchaseOrder.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { companyId } });
  await prisma.stockLevel.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.treasuryAccount.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.supplier.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function provisionCompanyA() {
  await prisma.company.create({ data: { id: CA, legalName: 'Reports A, Lda.', tradeName: 'Reports A', nuit: '400111222', email: 'print@reports-a.test', phone: '+258 84 111 2222' } });
  await prisma.branch.create({ data: { companyId: CA, code: 'MAP', name: 'Maputo', address: 'Av. Julius Nyerere, Maputo' } });
  const user = await prisma.user.create({ data: { companyId: CA, email: 'reports-a@ants.test', passwordHash: 'x', name: 'Ana Relatorios', mustChangePassword: false } });
  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente A', balance: 150, paymentTermDays: 15 } });
  const supplier = await prisma.supplier.create({ data: { companyId: CA, name: 'Fornecedor A', balance: 200 } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'A', name: 'Armazem A' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'REP-A', name: 'Produto A', salePrice: 100, avgCost: 60 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: product.id, warehouseId: warehouse.id, quantity: 10 } });
  const account = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'BCI Reports', type: 'BANK', reference: 'IBAN TESTE 123', balance: 50 } });
  const invoice = await prisma.invoice.create({
    data: {
      companyId: CA,
      number: 'FT 2026/0001',
      customerId: customer.id,
      customerName: customer.name,
      warehouseId: warehouse.id,
      issueDate: D('2026-07-01'),
      dueDate: D('2026-07-15'),
      subtotal: 300,
      discountTotal: 0,
      taxableBase: 300,
      taxTotal: 48,
      total: 348,
      amountPaid: 198,
      status: 'PARTIAL',
      createdBy: user.id,
    },
  });
  await prisma.invoiceLine.create({ data: { companyId: CA, invoiceId: invoice.id, productId: product.id, sku: product.sku, description: product.name, unitPrice: 100, quantity: 3, taxRate: 16, total: 348 } });
  const payment = await prisma.payment.create({ data: { companyId: CA, number: 'REC 2026/0001', invoiceId: invoice.id, customerId: customer.id, amount: 198, method: 'CASH', paidAt: D('2026-07-02'), createdBy: user.id } });
  await prisma.stockMovement.create({ data: { companyId: CA, productId: product.id, warehouseId: warehouse.id, invoiceId: invoice.id, type: 'OUT', quantity: -3, balanceAfter: 7, document: invoice.number, reason: 'Venda', createdBy: user.id, createdAt: D('2026-07-01') } });
  const order = await prisma.purchaseOrder.create({
    data: {
      companyId: CA,
      number: 'OC 2026/0001',
      supplierId: supplier.id,
      supplierName: supplier.name,
      warehouseId: warehouse.id,
      orderDate: D('2026-07-03'),
      status: 'RECEIVED',
      subtotal: 200,
      taxTotal: 32,
      total: 232,
      receivedValue: 232,
      amountPaid: 32,
      createdBy: user.id,
    },
  });
  await prisma.purchaseOrderLine.create({ data: { companyId: CA, orderId: order.id, productId: product.id, sku: product.sku, description: product.name, unitCost: 200, quantity: 1, receivedQty: 1, taxRate: 16, total: 232 } });
  await prisma.supplierPayment.create({ data: { companyId: CA, number: 'PG 2026/0001', purchaseOrderId: order.id, supplierId: supplier.id, amount: 32, method: 'CASH', paidAt: D('2026-07-04'), createdBy: user.id } });
  await prisma.treasuryMovement.create({ data: { companyId: CA, accountId: account.id, flow: 'IN', amount: 198, balanceAfter: 198, category: 'Recibo', document: payment.number, source: 'RECEIPT', sourceType: 'RECEIPT', sourceId: payment.id, movementPurpose: 'RECEIPT_IN', createdBy: user.id, occurredAt: D('2026-07-02') } });
  await prisma.treasuryMovement.create({ data: { companyId: CA, accountId: account.id, flow: 'OUT', amount: 32, balanceAfter: 166, category: 'Pagamento', document: 'PG 2026/0001', source: 'SUPPLIER_PAYMENT', createdBy: user.id, occurredAt: D('2026-07-04') } });
  await prisma.auditLog.create({ data: { companyId: CA, userId: user.id, action: 'invoice.issue', entity: 'Invoice', entityId: invoice.id, result: 'success', createdAt: D('2026-07-01') } });
  fixture = { ...fixture, invoiceA: invoice.id, paymentA: payment.id, accountA: account.id };
}

async function provisionCompanyB() {
  await prisma.company.create({ data: { id: CB, legalName: 'Reports B, Lda.' } });
  const customer = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B', balance: 999 } });
  const supplier = await prisma.supplier.create({ data: { companyId: CB, name: 'Fornecedor B', balance: 999 } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CB, code: 'B', name: 'Armazem B' } });
  const product = await prisma.product.create({ data: { companyId: CB, sku: 'REP-B', name: 'Produto B', salePrice: 999 } });
  const account = await prisma.treasuryAccount.create({ data: { companyId: CB, name: 'Caixa B', type: 'CASH', balance: 999 } });
  const invoice = await prisma.invoice.create({
    data: {
      companyId: CB,
      number: 'FT 2026/9999',
      customerId: customer.id,
      customerName: customer.name,
      warehouseId: warehouse.id,
      issueDate: D('2026-07-01'),
      dueDate: D('2026-07-15'),
      subtotal: 999,
      discountTotal: 0,
      taxableBase: 999,
      taxTotal: 0,
      total: 999,
      amountPaid: 0,
      createdBy: `${CB}-user`,
    },
  });
  const payment = await prisma.payment.create({ data: { companyId: CB, number: 'REC 2026/9999', invoiceId: invoice.id, customerId: customer.id, amount: 999, method: 'CASH', paidAt: D('2026-07-02') } });
  await prisma.invoiceLine.create({ data: { companyId: CB, invoiceId: invoice.id, productId: product.id, sku: product.sku, description: product.name, unitPrice: 999, quantity: 1, total: 999 } });
  await prisma.stockMovement.create({ data: { companyId: CB, productId: product.id, warehouseId: warehouse.id, invoiceId: invoice.id, type: 'OUT', quantity: -1, balanceAfter: 0, document: invoice.number, reason: 'Venda B', createdAt: D('2026-07-01') } });
  await prisma.purchaseOrder.create({ data: { companyId: CB, number: 'OC 2026/9999', supplierId: supplier.id, supplierName: supplier.name, warehouseId: warehouse.id, orderDate: D('2026-07-03'), subtotal: 999, taxTotal: 0, total: 999, receivedValue: 999, amountPaid: 0 } });
  await prisma.treasuryMovement.create({ data: { companyId: CB, accountId: account.id, flow: 'IN', amount: 999, balanceAfter: 999, category: 'Recibo', document: payment.number, source: 'RECEIPT', sourceType: 'RECEIPT', sourceId: payment.id, movementPurpose: 'RECEIPT_IN', occurredAt: D('2026-07-02') } });
  fixture = { ...fixture, invoiceB: invoice.id, paymentB: payment.id };
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await provisionCompanyA();
  await provisionCompanyB();
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.$disconnect();
});

describe('Relatorios V1 operacionais', () => {
  it('relatorio de vendas respeita companyId', async () => {
    const report = await getOperationalReport(prisma, ctx(CA, allPerms), 'sales', { from: '2026-07-01', to: '2026-07-31' });
    expect(report.summary.find((s) => s.label === 'Total de vendas')?.value).toBe(348);
    expect(JSON.stringify(report.sections)).toContain('Cliente A');
    expect(JSON.stringify(report.sections)).not.toContain('Cliente B');
  });

  it('extracto de clientes calcula saldo correctamente', async () => {
    const report = await getOperationalReport(prisma, ctx(CA, allPerms), 'customer-statement', { from: '2026-07-01', to: '2026-07-31' });
    const row = report.sections[0]!.rows[0]!;
    expect(row.balance).toBe(150);
    expect(row.received).toBe(198);
    expect(row.open).toBe(150);
  });

  it('extracto de fornecedores calcula saldo correctamente', async () => {
    const report = await getOperationalReport(prisma, ctx(CA, allPerms), 'supplier-statement', { from: '2026-07-01', to: '2026-07-31' });
    const row = report.sections[0]!.rows[0]!;
    expect(row.purchases).toBe(232);
    expect(row.payments).toBe(32);
    expect(row.balance).toBe(200);
  });

  it('fluxo de caixa soma entradas e saidas correctamente', async () => {
    const report = await getOperationalReport(prisma, ctx(CA, allPerms), 'cash-flow', { from: '2026-07-01', to: '2026-07-31' });
    expect(report.summary.find((s) => s.label === 'Entradas')?.value).toBe(198);
    expect(report.summary.find((s) => s.label === 'Saidas')?.value).toBe(32);
    expect(report.summary.find((s) => s.label === 'Saldo liquido')?.value).toBe(166);
  });

  it('movimentos de stock respeitam companyId', async () => {
    const report = await getOperationalReport(prisma, ctx(CA, allPerms), 'stock-movements', { from: '2026-07-01', to: '2026-07-31' });
    expect(JSON.stringify(report.sections)).toContain('Produto A');
    expect(JSON.stringify(report.sections)).not.toContain('Produto B');
  });

  it('CSV nao inclui dados de outra empresa', async () => {
    const exported = await exportOperationalReportCsv(prisma, ctx(CA, allPerms), 'sales', { from: '2026-07-01', to: '2026-07-31' });
    expect(exported.content).toContain('Cliente A');
    expect(exported.content).not.toContain('Cliente B');
    expect(exported.filename).toBe('sales-2026-07-01-2026-07-31.csv');
  });

  it('utilizador sem permissao e bloqueado', async () => {
    await expect(getOperationalReport(prisma, ctx(CA, ['reports.export']), 'sales', { from: '2026-07-01', to: '2026-07-31' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportOperationalReportCsv(prisma, ctx(CA, ['sales.view']), 'sales', { from: '2026-07-01', to: '2026-07-31' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('factura e recibo imprimiveis respeitam companyId e permissao', async () => {
    const invoice = await getInvoice(prisma, ctx(CA, allPerms), fixture.invoiceA!);
    const receipt = await getCustomerPaymentReceipt(prisma, ctx(CA, allPerms), fixture.paymentA!);

    expect(invoice.number).toBe('FT 2026/0001');
    expect(receipt.number).toBe('REC 2026/0001');
    expect(receipt.treasuryAccountName).toBe('BCI Reports');
    await expect(getInvoice(prisma, ctx(CA, allPerms), fixture.invoiceB!)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCustomerPaymentReceipt(prisma, ctx(CA, allPerms), fixture.paymentB!)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getInvoice(prisma, ctx(CA, ['reports.export']), fixture.invoiceA!)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('relatorio diario de caixa usa movimentos reais e bloqueia sem permissao', async () => {
    const report = await dailyReport(prisma, ctx(CA, allPerms), fixture.accountA!, '2026-07-02');
    expect(report.movements).toHaveLength(1);
    expect(report.totalIn).toBe(198);
    expect(report.movements[0]?.document).toBe('REC 2026/0001');
    await expect(dailyReport(prisma, ctx(CA, ['sales.view']), fixture.accountA!, '2026-07-02')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('perfil imprimivel da empresa inclui identidade, endereco e referencias sem saldos', async () => {
    const profile = await getCompanyPrintProfile(prisma, ctx(CA, allPerms));
    expect(profile?.legalName).toBe('Reports A, Lda.');
    expect(profile?.nuit).toBe('400111222');
    expect(profile?.address).toBe('Av. Julius Nyerere, Maputo');
    expect(profile?.bankAccounts).toEqual([{ name: 'BCI Reports', type: 'BANK', reference: 'IBAN TESTE 123' }]);
  });
});
