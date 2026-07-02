/**
 * Suite de integracao P0-03b - anulacao ponta a ponta de recebimento de cliente.
 * Correr com: `pnpm test:integration:accounting:reversal:customer-payment`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import type { RequestContext } from './context';
import { createInvoice, createPayment, reverseCustomerPayment, type PaymentInput } from './invoices';
import { reverseMovement } from './treasury';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-customer-payment-reversal';
const CB = 'smoke-customer-payment-reversal-b';
const CURRENT_DATE = civilDateInTimeZone();
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const op = ctx(CA, ['sales.create', 'payments.receive', 'payments.cancel']);
const noCancel = ctx(CA, ['sales.create', 'payments.receive']);
const treasuryReverseCtx = ctx(CA, ['treasury.reverseMovement']);

let ids!: {
  fy: string;
  period: string;
  ar: string;
  revenue: string;
  vat: string;
  cashLedger: string;
  customer: string;
  customerB: string;
  warehouse: string;
  product: string;
  cashAccount: string;
};

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { invoice: { warehouse: { companyId } } } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: { warehouse: { companyId } } } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { warehouse: { companyId } } });
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

async function ledger(code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'REVENUE', normalBalance: 'DEBIT' | 'CREDIT', parentId?: string) {
  return prisma.ledgerAccount.create({
    data: { companyId: CA, code, name, accountType, normalBalance, parentId: parentId ?? null, level: parentId ? 2 : 1, isPosting: !parentId ? code !== '1' : true },
  });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Customer Payment Reversal' } });
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Customer Payment Reversal B' } });
  const year = CURRENT_DATE.slice(0, 4);
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: year, startDate: D(`${year}-01-01`), endDate: D(`${year}-12-31`), status: 'OPEN', isCurrent: true } });
  const period = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: `${year}-01`, name: year, startDate: D(`${year}-01-01`), endDate: D(`${year}-12-31`), status: 'OPEN' } });
  await prisma.accountingJournal.createMany({
    data: [
      { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' },
      { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' },
    ],
  });
  const root = (await ledger('1', 'Activo', 'ASSET', 'DEBIT')).id;
  const ar = (await ledger('121', 'Clientes', 'ASSET', 'DEBIT', root)).id;
  const cashLedger = (await ledger('111', 'Caixa', 'ASSET', 'DEBIT', root)).id;
  const vat = (await ledger('221', 'IVA liquidado', 'LIABILITY', 'CREDIT')).id;
  const revenue = (await ledger('411', 'Vendas', 'REVENUE', 'CREDIT')).id;
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar },
      { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue },
      { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: vat },
    ],
  });
  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente P0-03b', paymentTermDays: 0 } });
  const customerB = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B' } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'P03B', name: 'Produto P0-03b', salePrice: 100, taxRate: 16 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: product.id, warehouseId: warehouse.id, quantity: 10000 } });
  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa', type: 'CASH', ledgerAccountId: cashLedger, openingBalance: 1000, balance: 1000 } });
  ids = { fy: fy.id, period: period.id, ar, revenue, vat, cashLedger, customer: customer.id, customerB: customerB.id, warehouse: warehouse.id, product: product.id, cashAccount: cashAccount.id };
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

async function issue() {
  return createInvoice(prisma, op, {
    idempotencyKey: randomUUID(),
    issueDate: CURRENT_DATE,
    customerId: ids.customer,
    warehouseId: ids.warehouse,
    lines: [{ productId: ids.product, quantity: 1, discountPercent: 0 }],
  });
}

async function receipt(invoiceId: string, overrides: Partial<PaymentInput> = {}) {
  return createPayment(prisma, op, {
    idempotencyKey: randomUUID(),
    invoiceId,
    amount: 50,
    method: 'CASH',
    accountId: ids.cashAccount,
    ...overrides,
  });
}

async function reverse(paymentId: string, overrides: Partial<{ idempotencyKey: string; reversalReason: string; reversalDate: string }> = {}) {
  return reverseCustomerPayment(prisma, op, {
    paymentId,
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    reversalReason: overrides.reversalReason ?? 'Motivo valido para anulacao',
    reversalDate: overrides.reversalDate ?? CURRENT_DATE,
  });
}

describe('P0-03b - anulacao de recebimento de cliente', () => {
  it('anula integralmente Payment, Invoice, Customer, Tesouraria, Contabilidade e Auditoria', async () => {
    const inv = await issue();
    const pay = await receipt(inv.id, { amount: 50 });
    const accountBefore = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.cashAccount } });
    const result = await reverse(pay.id, { reversalReason: '  Motivo valido para anulacao integral  ' });

    const [payment, invoice, customer, originalMovement, reversalMovement, originalEntry, reversalEntry, audit] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: pay.id } }),
      prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } }),
      prisma.customer.findUniqueOrThrow({ where: { id: ids.customer } }),
      prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: pay.id, movementPurpose: 'RECEIPT_IN' } }),
      prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: pay.id, movementPurpose: 'RECEIPT_IN_REVERSAL' } }),
      prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'CUSTOMER_PAYMENT', sourceId: pay.id, accountingEvent: 'RECEIPT_POSTED' }, include: { lines: true } }),
      prisma.journalEntry.findUniqueOrThrow({ where: { id: result.accountingReversalId ?? '' }, include: { lines: true } }),
      prisma.auditLog.findFirstOrThrow({ where: { companyId: CA, action: 'customer.payment.reverse', entityId: pay.id } }),
    ]);

    expect(payment.status).toBe('REVERSED');
    expect(payment.reversedAt).toBeTruthy();
    expect(payment.reversedById).toBe(op.userId);
    expect(payment.reversalReason).toBe('Motivo valido para anulacao integral');
    expect(invoice.amountPaid.toString()).toBe('0');
    expect(invoice.status).toBe('ISSUED');
    expect(customer.balance.toString()).toBe('116');
    expect(Number((await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.cashAccount } })).balance)).toBe(Number(accountBefore.balance) - 50);
    expect(originalMovement.status).toBe('REVERSED');
    expect(reversalMovement.flow).toBe('OUT');
    expect(Number(reversalMovement.amount)).toBe(50);
    expect(reversalMovement.reversesId).toBe(originalMovement.id);
    expect(reversalMovement.reversalReason).toBe('Motivo valido para anulacao integral');
    expect(originalEntry.status).toBe('REVERSED');
    expect(reversalEntry.reversalOfId).toBe(originalEntry.id);
    expect(reversalEntry.lines.some((l) => l.ledgerAccountId === ids.ar && l.customerId === ids.customer && Number(l.debit) === 50)).toBe(true);
    expect(reversalEntry.lines.some((l) => l.ledgerAccountId === ids.cashLedger && l.treasuryAccountId === ids.cashAccount && Number(l.credit) === 50)).toBe(true);
    expect((audit.newValues as { treasuryMovementOriginalId?: string; journalEntryReversalId?: string } | null)?.treasuryMovementOriginalId).toBe(originalMovement.id);
    expect((audit.newValues as { treasuryMovementOriginalId?: string; journalEntryReversalId?: string } | null)?.journalEntryReversalId).toBe(reversalEntry.id);
  });

  it('recalcula a factura por pagamentos ACTIVE e preserva os restantes', async () => {
    const inv = await issue();
    const p1 = await receipt(inv.id, { amount: 40 });
    const p2 = await receipt(inv.id, { amount: 30 });

    await reverse(p1.id);
    let invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(invoice.amountPaid.toString()).toBe('30');
    expect(invoice.status).toBe('PARTIAL');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p2.id } })).status).toBe('ACTIVE');

    await reverse(p2.id);
    invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(invoice.amountPaid.toString()).toBe('0');
    expect(invoice.status).toBe('ISSUED');
  });

  it('replay idempotente e concorrencia com a mesma chave nao duplicam efeitos', async () => {
    const inv = await issue();
    const pay = await receipt(inv.id, { amount: 25 });
    const key = randomUUID();
    const input = { paymentId: pay.id, idempotencyKey: key, reversalReason: 'Motivo valido concorrente', reversalDate: CURRENT_DATE };
    const [a, b] = await Promise.all([reverseCustomerPayment(prisma, op, input), reverseCustomerPayment(prisma, op, input)]);

    expect(a.id).toBe(b.id);
    const originalMovement = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: pay.id, movementPurpose: 'RECEIPT_IN' } });
    const originalEntry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'CUSTOMER_PAYMENT', sourceId: pay.id, accountingEvent: 'RECEIPT_POSTED' } });
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, reversesId: originalMovement.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, reversalOfId: originalEntry.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'customer.payment.reverse', entityId: pay.id } })).toBe(1);
  });

  it('mesma chave com payload diferente gera conflito e nova chave para REVERSED rejeita', async () => {
    const inv = await issue();
    const pay = await receipt(inv.id, { amount: 20 });
    const key = randomUUID();
    await reverse(pay.id, { idempotencyKey: key, reversalReason: 'Motivo valido original' });
    await expect(reverse(pay.id, { idempotencyKey: key, reversalReason: 'Motivo valido diferente' })).rejects.toBeInstanceOf(ConflictError);
    await expect(reverse(pay.id, { idempotencyKey: randomUUID() })).rejects.toThrow('Este recebimento já foi anulado.');
  });

  it('valida permissao, motivo e data civil', async () => {
    const inv = await issue();
    const pay = await receipt(inv.id, { amount: 15 });
    await expect(reverseCustomerPayment(prisma, noCancel, { paymentId: pay.id, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reverse(pay.id, { reversalReason: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverse(pay.id, { reversalReason: 'curto' })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverse(pay.id, { reversalReason: 'x'.repeat(501) })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverse(pay.id, { reversalDate: '2026-02-30' })).rejects.toBeInstanceOf(ValidationError);
    const otherDate = CURRENT_DATE === '2026-01-01' ? '2026-01-02' : '2026-01-01';
    await expect(reverse(pay.id, { reversalDate: otherDate })).rejects.toThrow('Africa/Maputo');
  });

  it('periodo e exercicio fechados rejeitam antes de efeitos', async () => {
    const inv1 = await issue();
    const pay1 = await receipt(inv1.id, { amount: 10 });
    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'CLOSED' } });
    await expect(reverse(pay1.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pay1.id } })).status).toBe('ACTIVE');
    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'OPEN' } });

    const inv2 = await issue();
    const pay2 = await receipt(inv2.id, { amount: 10 });
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'CLOSED' } });
    await expect(reverse(pay2.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pay2.id } })).status).toBe('ACTIVE');
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'OPEN' } });
  });

  it('TreasuryMovement ausente provoca rollback total', async () => {
    const inv = await issue();
    const pay = await receipt(inv.id, { amount: 10 });
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    await prisma.treasuryMovement.deleteMany({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: pay.id } });

    await expect(reverse(pay.id)).rejects.toThrow('tesouraria');

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe('ACTIVE');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).amountPaid.toString()).toBe(before.amountPaid.toString());
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'customer.payment.reverse', entityId: pay.id } })).toBe(0);
  });

  it('JournalEntry ausente provoca rollback total', async () => {
    const inv = await issue();
    const pay = await receipt(inv.id, { amount: 10 });
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'CUSTOMER_PAYMENT', sourceId: pay.id } });
    await prisma.journalEntryLine.deleteMany({ where: { companyId: CA, journalEntryId: entry.id } });
    await prisma.journalEntry.delete({ where: { id: entry.id } });

    await expect(reverse(pay.id)).rejects.toThrow('contabil');

    const movement = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: pay.id, movementPurpose: 'RECEIPT_IN' } });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe('ACTIVE');
    expect(movement.status).toBe('ACTIVE');
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, reversesId: movement.id } })).toBe(0);
  });

  it('saldo insuficiente na Tesouraria nao marca o Payment', async () => {
    const inv = await issue();
    const pay = await receipt(inv.id, { amount: 50 });
    await prisma.treasuryAccount.update({ where: { id: ids.cashAccount }, data: { balance: 0 } });

    await expect(reverse(pay.id)).rejects.toThrow('Saldo insuficiente');

    const movement = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: pay.id, movementPurpose: 'RECEIPT_IN' } });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe('ACTIVE');
    expect(movement.status).toBe('ACTIVE');
    await prisma.treasuryAccount.update({ where: { id: ids.cashAccount }, data: { balance: 1000 } });
  });

  it('mantem isolamento multiempresa e bloqueio P0-02 de estorno directo', async () => {
    const inv = await issue();
    const pay = await receipt(inv.id, { amount: 10 });
    const movement = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: pay.id, movementPurpose: 'RECEIPT_IN' } });
    await expect(reverseMovement(prisma, treasuryReverseCtx, movement.id, 'tentativa directa')).rejects.toThrow('recebimento de cliente');

    const paymentB = await prisma.payment.create({ data: { companyId: CB, number: `REC B/${randomUUID()}`, customerId: ids.customerB, amount: 1 } });
    await expect(reverse(paymentB.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
