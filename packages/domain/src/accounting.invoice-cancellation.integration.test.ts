/**
 * Suite de integracao P0-03a - cancelamento ponta a ponta de factura.
 * Correr com: `pnpm test:integration:accounting:reversal:invoice`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import type { RequestContext } from './context';
import { cancelInvoice, createInvoice, createPayment, reverseCustomerPayment, type InvoiceInput } from './invoices';
import { postAccountingEventTx } from './accounting-events';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-invoice-cancellation';
const CB = 'smoke-invoice-cancellation-b';
const CURRENT_DATE = civilDateInTimeZone();
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const op = ctx(CA, ['sales.create', 'payments.receive', 'payments.cancel', 'invoices.cancel']);
const noCancel = ctx(CA, ['sales.create', 'payments.receive']);

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
  taxableProduct: string;
  exemptProduct: string;
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
  await prisma.stockMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
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
    data: { companyId: CA, code, name, accountType, normalBalance, parentId: parentId ?? null, level: parentId ? 2 : 1, isPosting: parentId ? true : code !== '1' },
  });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Invoice Cancellation' } });
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Invoice Cancellation B' } });
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
  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente P0-03a', paymentTermDays: 0 } });
  const customerB = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B' } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const taxableProduct = await prisma.product.create({ data: { companyId: CA, sku: 'P03A-T', name: 'Produto P0-03a IVA', salePrice: 100, taxRate: 16, avgCost: 43 } });
  const exemptProduct = await prisma.product.create({ data: { companyId: CA, sku: 'P03A-E', name: 'Produto P0-03a Isento', salePrice: 50, taxRate: 0, avgCost: 21 } });
  await prisma.stockLevel.createMany({
    data: [
      { companyId: CA, productId: taxableProduct.id, warehouseId: warehouse.id, quantity: 10000 },
      { companyId: CA, productId: exemptProduct.id, warehouseId: warehouse.id, quantity: 10000 },
    ],
  });
  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa', type: 'CASH', ledgerAccountId: cashLedger, openingBalance: 1000, balance: 1000 } });
  ids = { fy: fy.id, period: period.id, ar, revenue, vat, cashLedger, customer: customer.id, customerB: customerB.id, warehouse: warehouse.id, taxableProduct: taxableProduct.id, exemptProduct: exemptProduct.id, cashAccount: cashAccount.id };
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

function invoiceInput(overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    idempotencyKey: randomUUID(),
    issueDate: CURRENT_DATE,
    customerId: ids.customer,
    warehouseId: ids.warehouse,
    lines: [{ productId: ids.taxableProduct, quantity: 1, discountPercent: 0 }],
    ...overrides,
  };
}

async function issue(overrides: Partial<InvoiceInput> = {}) {
  return createInvoice(prisma, op, invoiceInput(overrides));
}

async function cancel(invoiceId: string, overrides: Partial<{ idempotencyKey: string; cancellationReason: string; cancellationDate: string }> = {}) {
  return cancelInvoice(prisma, op, {
    invoiceId,
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    cancellationReason: overrides.cancellationReason ?? 'Motivo valido para cancelamento',
    cancellationDate: overrides.cancellationDate ?? CURRENT_DATE,
  });
}

async function receipt(invoiceId: string, amount = 50) {
  return createPayment(prisma, op, { idempotencyKey: randomUUID(), invoiceId, amount, method: 'CASH', accountId: ids.cashAccount });
}

async function reversePayment(paymentId: string) {
  return reverseCustomerPayment(prisma, op, { paymentId, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido para anulacao', reversalDate: CURRENT_DATE });
}

async function serviceInvoice() {
  return prisma.$transaction(async (tx) => {
    const number = `FT-SVC-${randomUUID()}`;
    const invoice = await tx.invoice.create({
      data: {
        companyId: CA,
        number,
        customerId: ids.customer,
        customerName: 'Cliente P0-03a',
        warehouseId: ids.warehouse,
        issueDate: D(CURRENT_DATE),
        dueDate: D(CURRENT_DATE),
        status: 'ISSUED',
        subtotal: 25,
        discountTotal: 0,
        taxableBase: 25,
        taxTotal: 0,
        total: 25,
        amountPaid: 0,
        createdBy: op.userId,
      },
    });
    await tx.invoiceLine.create({ data: { companyId: CA, invoiceId: invoice.id, productId: null, description: 'Servico sem stock', unitPrice: 25, quantity: 1, discountPercent: 0, taxRate: 0, total: 25 } });
    await tx.customer.update({ where: { id: ids.customer }, data: { balance: { increment: 25 } } });
    await postAccountingEventTx(tx, op, {
      journalType: 'SALES',
      entryDate: invoice.issueDate,
      description: `Factura emitida ${number}`,
      reference: number,
      origin: { sourceType: 'INVOICE', sourceId: invoice.id, accountingEvent: 'SALE_ISSUED' },
      lines: [
        { ledgerAccountId: ids.ar, debit: 25, customerId: ids.customer, description: `Factura emitida ${number}` },
        { ledgerAccountId: ids.revenue, credit: 25, description: `Factura emitida ${number}` },
      ],
    });
    return { id: invoice.id, number };
  });
}

describe('P0-03a - cancelamento integral de factura', () => {
  it('cancela Invoice, Customer, Stock, Contabilidade e Auditoria numa transaccao', async () => {
    const inv = await issue({ lines: [{ productId: ids.taxableProduct, quantity: 2, discountPercent: 0 }, { productId: ids.exemptProduct, quantity: 3, discountPercent: 0 }] });
    const [beforeInvoice, originals, entryBefore] = await Promise.all([
      prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lines: true } }),
      prisma.stockMovement.findMany({ where: { companyId: CA, invoiceId: inv.id, type: 'OUT' } }),
      prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: inv.id, accountingEvent: 'SALE_ISSUED' }, include: { lines: true } }),
    ]);
    const productCost = await prisma.product.findUniqueOrThrow({ where: { id: ids.taxableProduct }, select: { avgCost: true } });
    const result = await cancel(inv.id, { cancellationReason: '  Motivo valido para cancelamento integral  ' });

    const [invoice, customer, reversals, originalEntry, reversalEntry, audit, taxableLevel, exemptLevel, productAfter] = await Promise.all([
      prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lines: true } }),
      prisma.customer.findUniqueOrThrow({ where: { id: ids.customer } }),
      prisma.stockMovement.findMany({ where: { companyId: CA, reversesId: { in: originals.map((m) => m.id) } } }),
      prisma.journalEntry.findUniqueOrThrow({ where: { id: entryBefore.id } }),
      prisma.journalEntry.findUniqueOrThrow({ where: { id: result.accountingReversalId ?? '' }, include: { lines: true } }),
      prisma.auditLog.findFirstOrThrow({ where: { companyId: CA, action: 'invoice.cancel', entityId: inv.id } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.taxableProduct, warehouseId: ids.warehouse } } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.exemptProduct, warehouseId: ids.warehouse } } }),
      prisma.product.findUniqueOrThrow({ where: { id: ids.taxableProduct }, select: { avgCost: true } }),
    ]);

    expect(invoice.status).toBe('CANCELLED');
    expect(invoice.cancelledAt).toBeTruthy();
    expect(invoice.cancelledById).toBe(op.userId);
    expect(invoice.cancellationReason).toBe('Motivo valido para cancelamento integral');
    expect(invoice.number).toBe(beforeInvoice.number);
    expect(invoice.total.toString()).toBe(beforeInvoice.total.toString());
    expect(invoice.lines).toHaveLength(beforeInvoice.lines.length);
    expect(customer.balance.toString()).toBe('0');
    expect(taxableLevel.quantity).toBe(10000);
    expect(exemptLevel.quantity).toBe(10000);
    expect(reversals).toHaveLength(originals.length);
    expect(reversals.every((m) => m.type === 'IN' && m.invoiceId === inv.id && m.quantity > 0)).toBe(true);
    expect(originalEntry.status).toBe('REVERSED');
    expect(reversalEntry.reversalOfId).toBe(entryBefore.id);
    expect(reversalEntry.lines.some((l) => l.ledgerAccountId === ids.ar && l.customerId === ids.customer && Number(l.credit) === Number(beforeInvoice.total))).toBe(true);
    expect((audit.newValues as { stockMovementReversalIds?: string[]; journalEntryReversalId?: string } | null)?.stockMovementReversalIds).toHaveLength(originals.length);
    expect((audit.newValues as { journalEntryReversalId?: string } | null)?.journalEntryReversalId).toBe(reversalEntry.id);
    expect(productAfter.avgCost.toString()).toBe(productCost.avgCost.toString());
  });

  it('Payment ACTIVE bloqueia; Payment REVERSED nao bloqueia', async () => {
    const inv = await issue();
    const pay = await receipt(inv.id, 50);
    await expect(cancel(inv.id)).rejects.toThrow('Esta factura possui recebimentos activos. Anule primeiro os respectivos recibos.');
    await reversePayment(pay.id);
    await expect(cancel(inv.id)).resolves.toMatchObject({ id: inv.id });
  });

  it('amountPaid inconsistente bloqueia sem corrigir automaticamente', async () => {
    const inv = await issue();
    await prisma.invoice.update({ where: { id: inv.id }, data: { amountPaid: 1 } });
    await expect(cancel(inv.id)).rejects.toThrow('valor pago diferente de zero');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('ISSUED');
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'invoice.cancel', entityId: inv.id } })).toBe(0);
  });

  it('replay idempotente, conflito de fingerprint e nova chave em CANCELLED', async () => {
    const inv = await issue();
    const key = randomUUID();
    const input = { invoiceId: inv.id, idempotencyKey: key, cancellationReason: 'Motivo valido concorrente', cancellationDate: CURRENT_DATE };
    const [a, b] = await Promise.all([cancelInvoice(prisma, op, input), cancelInvoice(prisma, op, input)]);
    expect(a.id).toBe(b.id);
    const originals = await prisma.stockMovement.findMany({ where: { companyId: CA, invoiceId: inv.id, type: 'OUT' } });
    const originalEntry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: inv.id, accountingEvent: 'SALE_ISSUED' } });
    expect(await prisma.stockMovement.count({ where: { companyId: CA, reversesId: { in: originals.map((m) => m.id) } } })).toBe(originals.length);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, reversalOfId: originalEntry.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'invoice.cancel', entityId: inv.id } })).toBe(1);
    await expect(cancelInvoice(prisma, op, { ...input, cancellationReason: 'Motivo valido diferente' })).rejects.toBeInstanceOf(ConflictError);
    await expect(cancel(inv.id)).rejects.toThrow('cancelada');
  });

  it('valida permissao, motivo, data civil e isolamento multiempresa', async () => {
    const inv = await issue();
    await expect(cancelInvoice(prisma, noCancel, { invoiceId: inv.id, idempotencyKey: randomUUID(), cancellationReason: 'Motivo valido', cancellationDate: CURRENT_DATE })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cancel(inv.id, { cancellationReason: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(cancel(inv.id, { cancellationReason: 'curto' })).rejects.toBeInstanceOf(ValidationError);
    await expect(cancel(inv.id, { cancellationReason: 'x'.repeat(501) })).rejects.toBeInstanceOf(ValidationError);
    await expect(cancel(inv.id, { cancellationDate: '2026-02-30' })).rejects.toBeInstanceOf(ValidationError);
    const otherDate = CURRENT_DATE === '2026-01-01' ? '2026-01-02' : '2026-01-01';
    await expect(cancel(inv.id, { cancellationDate: otherDate })).rejects.toThrow('Africa/Maputo');
    const invoiceB = await prisma.invoice.create({
      data: { companyId: CB, number: `FT B/${randomUUID()}`, customerId: ids.customerB, customerName: 'Cliente B', warehouseId: ids.warehouse, issueDate: D(CURRENT_DATE), dueDate: D(CURRENT_DATE), subtotal: 1, discountTotal: 0, taxableBase: 1, taxTotal: 0, total: 1 },
    });
    await expect(cancel(invoiceB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('periodo e exercicio fechados rejeitam antes de efeitos', async () => {
    const inv1 = await issue();
    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'CLOSED' } });
    await expect(cancel(inv1.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv1.id } })).status).toBe('ISSUED');
    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'OPEN' } });

    const inv2 = await issue();
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'CLOSED' } });
    await expect(cancel(inv2.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv2.id } })).status).toBe('ISSUED');
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'OPEN' } });
  });

  it('factura legada sem StockMovement rastreavel faz rollback total', async () => {
    const inv = await issue();
    const beforeCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: ids.customer } });
    await prisma.stockMovement.deleteMany({ where: { companyId: CA, invoiceId: inv.id } });
    await expect(cancel(inv.id)).rejects.toThrow('rastreabilidade necessária');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('ISSUED');
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: ids.customer } })).balance.toString()).toBe(beforeCustomer.balance.toString());
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'invoice.cancel', entityId: inv.id } })).toBe(0);
  });

  it('JournalEntry ausente faz rollback e nao cria compensatorios', async () => {
    const inv = await issue();
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: inv.id } });
    const originals = await prisma.stockMovement.findMany({ where: { companyId: CA, invoiceId: inv.id, type: 'OUT' } });
    await prisma.journalEntryLine.deleteMany({ where: { companyId: CA, journalEntryId: entry.id } });
    await prisma.journalEntry.delete({ where: { id: entry.id } });
    await expect(cancel(inv.id)).rejects.toThrow('SALE_ISSUED');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('ISSUED');
    expect(await prisma.stockMovement.count({ where: { companyId: CA, reversesId: { in: originals.map((m) => m.id) } } })).toBe(0);
  });

  it('factura sem linhas de stock continua elegivel', async () => {
    const inv = await serviceInvoice();
    const result = await cancel(inv.id, { cancellationReason: 'Motivo valido para servico' });
    expect(result.stockReversalIds).toHaveLength(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('CANCELLED');
  });
});
