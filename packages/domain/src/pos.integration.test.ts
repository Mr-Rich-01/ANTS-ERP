/**
 * Suite de integracao POS V1.
 * Correr com: `pnpm test:integration:pos` (exige DATABASE_URL).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import type { RequestContext } from './context';
import { createPosSale, POS_FINAL_CUSTOMER_ID, type PosSaleInput } from './invoices';
import { ForbiddenError, ValidationError } from './errors';

const CA = 'smoke-pos';
const CB = 'smoke-pos-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const CURRENT_DATE = civilDateInTimeZone();

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const posCtx = ctx(CA, ['sales.create', 'payments.receive']);

interface Ids {
  fy: string;
  period: string;
  salesJournal: string;
  cashJournal: string;
  bankJournal: string;
  ar: string;
  revenue: string;
  vat: string;
  cashLedger: string;
  bankLedger: string;
  mpesaLedger: string;
  emolaLedger: string;
  customer: string;
  otherCustomer: string;
  warehouse: string;
  product: string;
  cashAccount: string;
  bankAccount: string;
  mpesaAccount: string;
  emolaAccount: string;
}

let ids!: Ids;

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { companyId } });
  await prisma.stockLevel.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.treasuryAccount.updateMany({ where: { companyId }, data: { ledgerAccountId: null } });
  await prisma.treasuryAccount.deleteMany({ where: { companyId } });
  await prisma.accountingMapping.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.fiscalYear.deleteMany({ where: { companyId } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: { gte: 2 } } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId } });
  await prisma.accountingJournal.deleteMany({ where: { companyId } });
  await prisma.documentCounter.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function ledger(companyId: string, code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'REVENUE', normalBalance: 'DEBIT' | 'CREDIT', parentId?: string) {
  return prisma.ledgerAccount.create({
    data: {
      companyId,
      code,
      name,
      accountType,
      normalBalance,
      level: parentId ? 2 : 1,
      parentId: parentId ?? null,
      isPosting: true,
    },
  });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke POS' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const period = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  const salesJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' } });
  const cashJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' } });
  const bankJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DB', name: 'Banco', journalType: 'BANK', sequencePrefix: 'BC' } });

  const group = (await ledger(CA, '1', 'Activo', 'ASSET', 'DEBIT')).id;
  const ar = (await ledger(CA, '121', 'Clientes', 'ASSET', 'DEBIT', group)).id;
  const cashLedger = (await ledger(CA, '111', 'Caixa', 'ASSET', 'DEBIT', group)).id;
  const bankLedger = (await ledger(CA, '112', 'Banco', 'ASSET', 'DEBIT', group)).id;
  const mpesaLedger = (await ledger(CA, '1131', 'M-Pesa', 'ASSET', 'DEBIT', group)).id;
  const emolaLedger = (await ledger(CA, '1132', 'e-Mola', 'ASSET', 'DEBIT', group)).id;
  const vat = (await ledger(CA, '221', 'IVA liquidado', 'LIABILITY', 'CREDIT')).id;
  const revenue = (await ledger(CA, '411', 'Vendas', 'REVENUE', 'CREDIT')).id;
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar },
      { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue },
      { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: vat },
    ],
  });

  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente POS', paymentTermDays: 0 } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'POS', name: 'Loja POS' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'POS-1', name: 'Produto POS', salePrice: 100, taxRate: 16 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: product.id, warehouseId: warehouse.id, quantity: 50 } });
  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa POS', type: 'CASH', ledgerAccountId: cashLedger } });
  const bankAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Cartao POS', type: 'BANK', ledgerAccountId: bankLedger } });
  const mpesaAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'M-Pesa POS', type: 'MOBILE', ledgerAccountId: mpesaLedger } });
  const emolaAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'e-Mola POS', type: 'MOBILE', ledgerAccountId: emolaLedger } });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke POS B' } });
  const otherCustomer = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B' } });

  ids = {
    fy: fy.id,
    period: period.id,
    salesJournal: salesJournal.id,
    cashJournal: cashJournal.id,
    bankJournal: bankJournal.id,
    ar,
    revenue,
    vat,
    cashLedger,
    bankLedger,
    mpesaLedger,
    emolaLedger,
    customer: customer.id,
    otherCustomer: otherCustomer.id,
    warehouse: warehouse.id,
    product: product.id,
    cashAccount: cashAccount.id,
    bankAccount: bankAccount.id,
    mpesaAccount: mpesaAccount.id,
    emolaAccount: emolaAccount.id,
  };
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await provision();
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.$disconnect();
});

function input(overrides: Partial<PosSaleInput> = {}): PosSaleInput {
  return {
    invoiceIdempotencyKey: randomUUID(),
    paymentIdempotencyKey: randomUUID(),
    issueDate: CURRENT_DATE,
    customerId: ids.customer,
    warehouseId: ids.warehouse,
    paymentMethod: 'CASH',
    lines: [{ productId: ids.product, quantity: 2, discountPercent: 0 }],
    ...overrides,
  };
}

describe('POS V1', () => {
  it('cria factura paga, recibo, stock, tesouraria, contabilidade e auditoria', async () => {
    const beforeStock = await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.product, warehouseId: ids.warehouse } } });
    const beforeAccount = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.cashAccount } });

    const result = await createPosSale(prisma, posCtx, input());

    const [invoice, payment, stock, account, invoiceEntry, paymentEntry, stockMovement, treasuryMovement, invoiceAudit, paymentAudit] = await Promise.all([
      prisma.invoice.findUniqueOrThrow({ where: { id: result.invoiceId } }),
      prisma.payment.findUniqueOrThrow({ where: { id: result.paymentId } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.product, warehouseId: ids.warehouse } } }),
      prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.cashAccount } }),
      prisma.journalEntry.findFirst({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: result.invoiceId, accountingEvent: 'SALE_ISSUED' } }),
      prisma.journalEntry.findFirst({ where: { companyId: CA, sourceType: 'CUSTOMER_PAYMENT', sourceId: result.paymentId, accountingEvent: 'RECEIPT_POSTED' } }),
      prisma.stockMovement.findFirst({ where: { companyId: CA, invoiceId: result.invoiceId, type: 'OUT' } }),
      prisma.treasuryMovement.findFirst({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: result.paymentId, movementPurpose: 'RECEIPT_IN' } }),
      prisma.auditLog.findFirst({ where: { companyId: CA, action: 'invoice.issue', entityId: result.invoiceId } }),
      prisma.auditLog.findFirst({ where: { companyId: CA, action: 'payment.receive', entityId: result.paymentId } }),
    ]);

    expect(invoice.status).toBe('PAID');
    expect(Number(invoice.total)).toBe(232);
    expect(Number(invoice.amountPaid)).toBe(232);
    expect(Number(payment.amount)).toBe(232);
    expect(stock.quantity).toBe(beforeStock.quantity - 2);
    expect(Number(account.balance)).toBe(Number(beforeAccount.balance) + 232);
    expect(stockMovement?.reason).toBe('Venda POS');
    expect(treasuryMovement).toBeTruthy();
    expect(treasuryMovement?.accountId).toBe(ids.cashAccount);
    expect(invoiceEntry).toBeTruthy();
    expect(paymentEntry).toBeTruthy();
    expect(invoiceAudit).toBeTruthy();
    expect(paymentAudit).toBeTruthy();
  });

  it.each([
    ['CASH', 'cashAccount'],
    ['MPESA', 'mpesaAccount'],
    ['EMOLA', 'emolaAccount'],
    ['CARD', 'bankAccount'],
  ] as const)('resolve automaticamente a conta POS para %s', async (method, accountKey) => {
    const result = await createPosSale(
      prisma,
      posCtx,
      input({ paymentMethod: method, lines: [{ productId: ids.product, quantity: 1, discountPercent: 0 }] }),
    );
    const movement = await prisma.treasuryMovement.findFirstOrThrow({
      where: { companyId: CA, sourceType: 'RECEIPT', sourceId: result.paymentId, movementPurpose: 'RECEIPT_IN' },
    });
    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId: CA, sourceType: 'CUSTOMER_PAYMENT', sourceId: result.paymentId, accountingEvent: 'RECEIPT_POSTED' },
      include: { lines: true },
    });
    const expectedAccountId = ids[accountKey];
    expect(movement.accountId).toBe(expectedAccountId);
    expect(entry.lines.some((line) => line.treasuryAccountId === expectedAccountId && Number(line.debit) === 116)).toBe(true);
  });

  it('bloqueia checkout POS quando a conta automatica fica ambigua', async () => {
    const duplicate = await ledger(CA, `111-${randomUUID()}`, 'Caixa duplicada', 'ASSET', 'DEBIT', ids.cashLedger);
    const account = await prisma.treasuryAccount.create({ data: { companyId: CA, name: `Caixa Loja ${randomUUID()}`, type: 'CASH', ledgerAccountId: duplicate.id } });
    const beforeInvoices = await prisma.invoice.count({ where: { companyId: CA } });
    const beforePayments = await prisma.payment.count({ where: { companyId: CA } });

    await expect(createPosSale(prisma, posCtx, input({ paymentMethod: 'CASH' }))).rejects.toThrow('mais de uma conta de caixa');

    expect(await prisma.invoice.count({ where: { companyId: CA } })).toBe(beforeInvoices);
    expect(await prisma.payment.count({ where: { companyId: CA } })).toBe(beforePayments);
    await prisma.treasuryAccount.delete({ where: { id: account.id } });
    await prisma.ledgerAccount.delete({ where: { id: duplicate.id } });
  });

  it('permite Cliente Geral criando o cliente operacional quando necessario (emite VD, S15)', async () => {
    const result = await createPosSale(prisma, posCtx, input({ customerId: POS_FINAL_CUSTOMER_ID, lines: [{ productId: ids.product, quantity: 1, discountPercent: 0 }] }));
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: result.invoiceId } });
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: invoice.customerId } });
    expect(customer.name).toBe('Cliente Geral');
    expect(invoice.documentType).toBe('VD');
    expect(invoice.number.startsWith('VD ')).toBe(true);
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'customer.final_create', entityId: customer.id } })).toBeGreaterThanOrEqual(1);
  });

  it('falha com carrinho vazio', async () => {
    await expect(createPosSale(prisma, posCtx, input({ lines: [] }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('falha sem stock e nao cria documentos parciais', async () => {
    const beforeInvoices = await prisma.invoice.count({ where: { companyId: CA } });
    const beforePayments = await prisma.payment.count({ where: { companyId: CA } });
    await expect(createPosSale(prisma, posCtx, input({ lines: [{ productId: ids.product, quantity: 999, discountPercent: 0 }] }))).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.invoice.count({ where: { companyId: CA } })).toBe(beforeInvoices);
    expect(await prisma.payment.count({ where: { companyId: CA } })).toBe(beforePayments);
  });

  it('falha sem permissoes de venda ou recebimento', async () => {
    await expect(createPosSale(prisma, ctx(CA, ['payments.receive']), input())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createPosSale(prisma, ctx(CA, ['sales.create']), input())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('bloqueia cliente de outra empresa', async () => {
    await expect(createPosSale(prisma, posCtx, input({ customerId: ids.otherCustomer }))).rejects.toThrow('Cliente inválido');
  });

  it('replay com as mesmas chaves nao duplica factura nem recibo', async () => {
    const keyInput = input({ invoiceIdempotencyKey: randomUUID(), paymentIdempotencyKey: randomUUID() });
    const first = await createPosSale(prisma, posCtx, keyInput);
    const replay = await createPosSale(prisma, posCtx, keyInput);
    expect(replay).toEqual(first);
    expect(await prisma.invoice.count({ where: { companyId: CA, id: first.invoiceId } })).toBe(1);
    expect(await prisma.payment.count({ where: { companyId: CA, id: first.paymentId } })).toBe(1);
  });
});
