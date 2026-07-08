/**
 * Suite de integracao Fecho de Caixa V1.
 * Correr com: `pnpm test:integration:treasury:cash-closing` (exige DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ForbiddenError } from './errors';
import { cashClosingReport, exportCashClosingCsv } from './treasury';

const CA = 'cash-close-v1-a';
const CB = 'cash-close-v1-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, userName: 'Caixa Teste', permissions: new Set(permissions), isPlatformAdmin: false };
}

const cashClosingPerms = ['treasury.viewReports', 'reports.export'];

let ids!: {
  userA: string;
  accountA: string;
  accountB: string;
};

async function teardown(companyId: string) {
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.supplierPayment.deleteMany({ where: { companyId } });
  await prisma.purchaseOrderLine.deleteMany({ where: { companyId } });
  await prisma.purchaseOrder.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.treasuryAccount.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.supplier.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function provisionCompanyA() {
  await prisma.company.create({ data: { id: CA, legalName: 'Cash Closing A, Lda.' } });
  const user = await prisma.user.create({ data: { companyId: CA, email: 'cash-a@ants.test', passwordHash: 'x', name: 'Ana Caixa', mustChangePassword: false } });
  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente Caixa', paymentTermDays: 0 } });
  const supplier = await prisma.supplier.create({ data: { companyId: CA, name: 'Fornecedor Caixa' } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'CX', name: 'Armazem Caixa' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'CX-1', name: 'Produto Caixa', salePrice: 100 } });
  const account = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa Principal', type: 'CASH', openingBalance: 100, balance: 250 } });
  const invoice = await prisma.invoice.create({
    data: {
      companyId: CA,
      number: 'FT CX/0001',
      customerId: customer.id,
      customerName: customer.name,
      warehouseId: warehouse.id,
      issueDate: D('2026-07-02'),
      dueDate: D('2026-07-02'),
      subtotal: 150,
      discountTotal: 0,
      taxableBase: 150,
      taxTotal: 0,
      total: 150,
      amountPaid: 150,
      status: 'PAID',
      createdBy: user.id,
    },
  });
  await prisma.invoiceLine.create({ data: { companyId: CA, invoiceId: invoice.id, productId: product.id, sku: product.sku, description: product.name, unitPrice: 150, quantity: 1, taxRate: 0, total: 150 } });
  const payment = await prisma.payment.create({ data: { companyId: CA, number: 'REC CX/0001', invoiceId: invoice.id, customerId: customer.id, amount: 150, method: 'CASH', paidAt: D('2026-07-02'), createdBy: user.id } });
  const order = await prisma.purchaseOrder.create({
    data: {
      companyId: CA,
      number: 'OC CX/0001',
      supplierId: supplier.id,
      supplierName: supplier.name,
      warehouseId: warehouse.id,
      orderDate: D('2026-07-02'),
      subtotal: 30,
      taxTotal: 0,
      total: 30,
      receivedValue: 30,
      amountPaid: 30,
      createdBy: user.id,
    },
  });
  await prisma.purchaseOrderLine.create({ data: { companyId: CA, orderId: order.id, productId: product.id, sku: product.sku, description: product.name, unitCost: 30, quantity: 1, taxRate: 0, total: 30 } });
  const supplierPayment = await prisma.supplierPayment.create({ data: { companyId: CA, number: 'PG CX/0001', purchaseOrderId: order.id, supplierId: supplier.id, amount: 30, method: 'CASH', paidAt: D('2026-07-02'), createdBy: user.id } });
  await prisma.treasuryMovement.createMany({
    data: [
      { companyId: CA, accountId: account.id, flow: 'IN', amount: 150, balanceAfter: 250, category: 'Recibo', description: 'Recibo POS REC CX/0001 - Cliente Caixa', document: payment.number, source: 'RECEIPT', sourceType: 'RECEIPT', sourceId: payment.id, movementPurpose: 'RECEIPT_IN', createdBy: user.id, occurredAt: D('2026-07-02') },
      { companyId: CA, accountId: account.id, flow: 'IN', amount: 50, balanceAfter: 300, category: 'Receita', description: 'Entrada manual de caixa', source: 'MANUAL', createdBy: user.id, occurredAt: D('2026-07-02') },
      { companyId: CA, accountId: account.id, flow: 'OUT', amount: 30, balanceAfter: 270, category: 'Pagamento', description: 'Pagamento a fornecedor', document: supplierPayment.number, source: 'SUPPLIER_PAYMENT', sourceType: 'SUPPLIER_PAYMENT', sourceId: supplierPayment.id, movementPurpose: 'SUPPLIER_PAYMENT_OUT', createdBy: user.id, occurredAt: D('2026-07-02') },
      { companyId: CA, accountId: account.id, flow: 'OUT', amount: 20, balanceAfter: 250, category: 'Transferencia', description: 'Transferencia para banco', source: 'TRANSFER', transferId: 'TRF-CX-1', createdBy: user.id, occurredAt: D('2026-07-02') },
    ],
  });
  ids = { userA: user.id, accountA: account.id, accountB: '' };
}

async function provisionCompanyB() {
  await prisma.company.create({ data: { id: CB, legalName: 'Cash Closing B, Lda.' } });
  const customer = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B' } });
  const account = await prisma.treasuryAccount.create({ data: { companyId: CB, name: 'Caixa B', type: 'CASH', balance: 999 } });
  const payment = await prisma.payment.create({ data: { companyId: CB, number: 'REC B/0001', customerId: customer.id, amount: 999, method: 'CASH', paidAt: D('2026-07-02') } });
  await prisma.treasuryMovement.create({ data: { companyId: CB, accountId: account.id, flow: 'IN', amount: 999, balanceAfter: 999, category: 'Recibo', description: 'Recibo POS B', document: payment.number, source: 'RECEIPT', sourceType: 'RECEIPT', sourceId: payment.id, movementPurpose: 'RECEIPT_IN', occurredAt: D('2026-07-02') } });
  ids.accountB = account.id;
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

describe('Fecho de Caixa V1', () => {
  it('relatorio diario respeita companyId e usa movimentos reais', async () => {
    const report = await cashClosingReport(prisma, ctx(CA, cashClosingPerms), { accountId: ids.accountA, dateISO: '2026-07-02' });
    expect(report.movements).toHaveLength(4);
    expect(JSON.stringify(report.movements)).toContain('REC CX/0001');
    expect(JSON.stringify(report.movements)).not.toContain('REC B/0001');
  });

  it('soma entradas e saidas correctamente', async () => {
    const report = await cashClosingReport(prisma, ctx(CA, cashClosingPerms), { accountId: ids.accountA, dateISO: '2026-07-02' });
    expect(report.daily.totalIn).toBe(200);
    expect(report.daily.totalOut).toBe(50);
    expect(report.expectedTotal).toBe(250);
  });

  it('calcula valores por metodo e conta correctamente', async () => {
    const report = await cashClosingReport(prisma, ctx(CA, cashClosingPerms), { accountId: ids.accountA, dateISO: '2026-07-02', counted: { cash: 250 } });
    const cash = report.methodTotals.find((m) => m.method === 'CASH');
    const transfer = report.methodTotals.find((m) => m.method === 'TRANSFER');
    expect(cash?.expectedIn).toBe(200);
    expect(cash?.expectedOut).toBe(30);
    expect(cash?.counted).toBe(250);
    expect(transfer?.expectedOut).toBe(20);
  });

  it('valor contado igual ao esperado gera diferenca zero', async () => {
    const report = await cashClosingReport(prisma, ctx(CA, cashClosingPerms), { accountId: ids.accountA, dateISO: '2026-07-02', counted: { cash: 250 } });
    expect(report.difference).toBe(0);
    expect(report.differenceStatus).toBe('NONE');
  });

  it('valor contado maior gera sobra', async () => {
    const report = await cashClosingReport(prisma, ctx(CA, cashClosingPerms), { accountId: ids.accountA, dateISO: '2026-07-02', counted: { cash: 251 } });
    expect(report.difference).toBe(1);
    expect(report.differenceStatus).toBe('SURPLUS');
  });

  it('valor contado menor gera falta', async () => {
    const report = await cashClosingReport(prisma, ctx(CA, cashClosingPerms), { accountId: ids.accountA, dateISO: '2026-07-02', counted: { cash: 249 } });
    expect(report.difference).toBe(-1);
    expect(report.differenceStatus).toBe('SHORTAGE');
  });

  it('utilizador sem permissao e bloqueado', async () => {
    await expect(cashClosingReport(prisma, ctx(CA, ['reports.export']), { accountId: ids.accountA, dateISO: '2026-07-02' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportCashClosingCsv(prisma, ctx(CA, ['treasury.viewReports']), { accountId: ids.accountA, dateISO: '2026-07-02' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('CSV respeita filtros e companyId', async () => {
    const exported = await exportCashClosingCsv(prisma, ctx(CA, cashClosingPerms), { accountId: ids.accountA, dateISO: '2026-07-02' });
    expect(exported.filename).toBe('cash-closing-2026-07-02.csv');
    expect(exported.content).toContain('Data;Conta;Tipo de movimento;Origem;Entrada;Saida;Saldo;Metodo;Referencia;Utilizador');
    expect(exported.content).toContain('Venda POS');
    expect(exported.content).toContain('Ana Caixa');
    expect(exported.content).not.toContain('REC B/0001');
  });

  it('periodo sem movimentos mostra estado vazio', async () => {
    const report = await cashClosingReport(prisma, ctx(CA, cashClosingPerms), { accountId: ids.accountA, dateISO: '2026-07-03' });
    expect(report.movements).toHaveLength(0);
    expect(report.daily.totalIn).toBe(0);
    expect(report.daily.totalOut).toBe(0);
  });

  it('calculo do fecho nao altera movimentos originais nem saldo', async () => {
    const beforeCount = await prisma.treasuryMovement.count({ where: { companyId: CA, accountId: ids.accountA } });
    const beforeAccount = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.accountA } });
    await cashClosingReport(prisma, ctx(CA, cashClosingPerms), { accountId: ids.accountA, dateISO: '2026-07-02', counted: { cash: 260 } });
    const afterCount = await prisma.treasuryMovement.count({ where: { companyId: CA, accountId: ids.accountA } });
    const afterAccount = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.accountA } });
    expect(afterCount).toBe(beforeCount);
    expect(Number(afterAccount.balance)).toBe(Number(beforeAccount.balance));
  });

  it('observacoes aparecem no relatorio sem serem persistidas', async () => {
    const report = await cashClosingReport(prisma, ctx(CA, cashClosingPerms), { accountId: ids.accountA, dateISO: '2026-07-02', counted: { cash: 250, observations: 'Conferencia feita com numerario demo.' } });
    expect(report.counted.observations).toBe('Conferencia feita com numerario demo.');
    expect(await prisma.auditLog.count({ where: { companyId: CA } })).toBe(0);
  });
});
