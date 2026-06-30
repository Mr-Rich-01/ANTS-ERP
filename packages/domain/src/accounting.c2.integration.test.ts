/**
 * Suite de INTEGRACAO da Fase 8c.2b — facturas e recibos de clientes.
 * Correr com: `pnpm test:integration:accounting:c2` (exige DATABASE_URL).
 * Isolada por empresas de teste (`smoke-c2*`) e sem mutar a demo.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { createInvoice, createPayment, type InvoiceInput, type PaymentInput } from './invoices';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-c2';
const CB = 'smoke-c2-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const salesCtx = ctx(CA, ['sales.create']);
const salesDiscountCtx = ctx(CA, ['sales.create', 'sales.approve_discount']);
const paymentCtx = ctx(CA, ['payments.receive']);

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
  mobileLedger: string;
  otherLedger: string;
  expenseLedger: string;
  inactiveLedger: string;
  groupLedger: string;
  customer: string;
  warehouse: string;
  taxableProduct: string;
  exemptProduct: string;
  cashAccount: string;
  bankAccount: string;
  mobileAccount: string;
  otherAccount: string;
  inactiveAccount: string;
  bCustomer: string;
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

async function ledger(companyId: string, code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT', opts: { isPosting?: boolean; isActive?: boolean; parentId?: string | null } = {}) {
  return prisma.ledgerAccount.create({
    data: {
      companyId,
      code,
      name,
      accountType,
      normalBalance,
      level: opts.parentId ? 2 : 1,
      parentId: opts.parentId ?? null,
      isPosting: opts.isPosting ?? true,
      isActive: opts.isActive ?? true,
    },
  });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke C2' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  const period = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026-01', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  const salesJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' } });
  const cashJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' } });
  const bankJournal = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DBC', name: 'Bancos', journalType: 'BANK', sequencePrefix: 'BC' } });

  const groupLedger = (await ledger(CA, '1', 'Activo', 'ASSET', 'DEBIT', { isPosting: false })).id;
  const ar = (await ledger(CA, '121', 'Clientes', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const cashLedger = (await ledger(CA, '111', 'Caixa', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const bankLedger = (await ledger(CA, '112', 'Banco', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const mobileLedger = (await ledger(CA, '113', 'Mobile', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const otherLedger = (await ledger(CA, '119', 'Outro', 'ASSET', 'DEBIT', { parentId: groupLedger })).id;
  const expenseLedger = (await ledger(CA, '611', 'Despesa', 'EXPENSE', 'DEBIT')).id;
  const inactiveLedger = (await ledger(CA, '198', 'Inactiva', 'ASSET', 'DEBIT', { parentId: groupLedger, isActive: false })).id;
  const vat = (await ledger(CA, '221', 'IVA liquidado', 'LIABILITY', 'CREDIT')).id;
  const revenue = (await ledger(CA, '411', 'Vendas', 'REVENUE', 'CREDIT')).id;

  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar },
      { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue },
      { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: vat },
    ],
  });

  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente C2', paymentTermDays: 0 } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem' } });
  const taxableProduct = await prisma.product.create({ data: { companyId: CA, sku: 'TAX', name: 'Produto IVA', salePrice: 100, taxRate: 16 } });
  const exemptProduct = await prisma.product.create({ data: { companyId: CA, sku: 'EXE', name: 'Produto Isento', salePrice: 50, taxRate: 0 } });
  await prisma.stockLevel.createMany({
    data: [
      { companyId: CA, productId: taxableProduct.id, warehouseId: warehouse.id, quantity: 100000 },
      { companyId: CA, productId: exemptProduct.id, warehouseId: warehouse.id, quantity: 100000 },
    ],
  });

  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa', type: 'CASH', ledgerAccountId: cashLedger } });
  const bankAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Banco', type: 'BANK', ledgerAccountId: bankLedger, allowNegative: true } });
  const mobileAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'M-Pesa', type: 'MOBILE', ledgerAccountId: mobileLedger } });
  const otherAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Outro', type: 'OTHER', ledgerAccountId: otherLedger } });
  const inactiveAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Inactiva', type: 'CASH', status: 'INACTIVE' } });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke C2 B' } });
  const bCustomer = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B' } });

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
    mobileLedger,
    otherLedger,
    expenseLedger,
    inactiveLedger,
    groupLedger,
    customer: customer.id,
    warehouse: warehouse.id,
    taxableProduct: taxableProduct.id,
    exemptProduct: exemptProduct.id,
    cashAccount: cashAccount.id,
    bankAccount: bankAccount.id,
    mobileAccount: mobileAccount.id,
    otherAccount: otherAccount.id,
    inactiveAccount: inactiveAccount.id,
    bCustomer: bCustomer.id,
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

function invoiceInput(overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    idempotencyKey: randomUUID(),
    customerId: ids.customer,
    warehouseId: ids.warehouse,
    paymentMethod: 'TRANSFER',
    lines: [{ productId: ids.taxableProduct, quantity: 1, discountPercent: 0 }],
    ...overrides,
  };
}

async function issue(overrides: Partial<InvoiceInput> = {}, c: RequestContext = salesCtx) {
  return createInvoice(prisma, c, invoiceInput(overrides));
}

async function receipt(invoiceId: string, overrides: Partial<PaymentInput> = {}, c: RequestContext = paymentCtx) {
  return createPayment(prisma, c, {
    idempotencyKey: randomUUID(),
    invoiceId,
    amount: 50,
    method: 'CASH',
    accountId: ids.cashAccount,
    ...overrides,
  });
}

async function entryFor(sourceType: string, sourceId: string, accountingEvent: string) {
  return prisma.journalEntry.findFirst({
    where: { companyId: CA, sourceType, sourceId, accountingEvent },
    include: { lines: { orderBy: { lineNumber: 'asc' } }, journal: true },
  });
}

describe('Fase 8c.2b — facturas e recibos de clientes', () => {
  it('#1 factura tributada gera lançamento correcto', async () => {
    const r = await issue();
    const entry = await entryFor('INVOICE', r.id, 'SALE_ISSUED');
    expect(entry?.journal.journalType).toBe('SALES');
    expect(entry?.description).toBe(`Factura emitida ${r.number}`);
    expect(entry?.reference).toBe(r.number);
    expect(entry?.lines).toHaveLength(3);
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.ar && l.customerId === ids.customer && Number(l.debit) === 116)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.revenue && Number(l.credit) === 100)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.vat && Number(l.credit) === 16)).toBeTruthy();
  });

  it('#2 factura isenta gera duas linhas e não exige VAT_OUTPUT', async () => {
    await prisma.accountingMapping.delete({ where: { companyId_systemKey: { companyId: CA, systemKey: 'VAT_OUTPUT' } } });
    const r = await issue({ lines: [{ productId: ids.exemptProduct, quantity: 2, discountPercent: 0 }] });
    const entry = await entryFor('INVOICE', r.id, 'SALE_ISSUED');
    expect(entry?.lines).toHaveLength(2);
    expect(entry?.lines.some((l) => l.ledgerAccountId === ids.vat)).toBe(false);
    await prisma.accountingMapping.create({ data: { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: ids.vat } });
  });

  it('#3 desconto reduz a receita tributável', async () => {
    const r = await issue({ lines: [{ productId: ids.taxableProduct, quantity: 2, discountPercent: 10 }] }, salesDiscountCtx);
    const entry = await entryFor('INVOICE', r.id, 'SALE_ISSUED');
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.revenue && Number(l.credit) === 180)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.vat && Number(l.credit) === 28.8)).toBeTruthy();
  });

  it('#4 mappings obrigatórios ausentes fazem rollback da factura', async () => {
    await prisma.accountingMapping.delete({ where: { companyId_systemKey: { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE' } } });
    const before = await prisma.invoice.count({ where: { companyId: CA } });
    await expect(issue()).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.invoice.count({ where: { companyId: CA } })).toBe(before);
    await prisma.accountingMapping.create({ data: { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ids.ar } });
  });

  it('#4b mapping de vendas ausente reverte stock, saldo e idempotência da factura', async () => {
    await prisma.accountingMapping.delete({ where: { companyId_systemKey: { companyId: CA, systemKey: 'SALES_REVENUE' } } });
    const [beforeInvoices, beforeMovements, beforeStock, beforeCustomer, beforeOps] = await Promise.all([
      prisma.invoice.count({ where: { companyId: CA } }),
      prisma.stockMovement.count({ where: { companyId: CA } }),
      prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: ids.taxableProduct, warehouseId: ids.warehouse } } }),
      prisma.customer.findUnique({ where: { id: ids.customer } }),
      prisma.operationIdempotency.count({ where: { companyId: CA } }),
    ]);

    await expect(issue()).rejects.toBeInstanceOf(ValidationError);

    const [afterStock, afterCustomer] = await Promise.all([
      prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: ids.taxableProduct, warehouseId: ids.warehouse } } }),
      prisma.customer.findUnique({ where: { id: ids.customer } }),
    ]);
    expect(await prisma.invoice.count({ where: { companyId: CA } })).toBe(beforeInvoices);
    expect(await prisma.stockMovement.count({ where: { companyId: CA } })).toBe(beforeMovements);
    expect(Number(afterStock?.quantity)).toBe(Number(beforeStock?.quantity));
    expect(Number(afterCustomer?.balance)).toBe(Number(beforeCustomer?.balance));
    expect(await prisma.operationIdempotency.count({ where: { companyId: CA } })).toBe(beforeOps);
    await prisma.accountingMapping.create({ data: { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: ids.revenue } });
  });

  it('#4c factura tributada exige mapping de IVA e reverte a operação', async () => {
    await prisma.accountingMapping.delete({ where: { companyId_systemKey: { companyId: CA, systemKey: 'VAT_OUTPUT' } } });
    const [beforeInvoices, beforeEntries] = await Promise.all([
      prisma.invoice.count({ where: { companyId: CA } }),
      prisma.journalEntry.count({ where: { companyId: CA, accountingEvent: 'SALE_ISSUED' } }),
    ]);
    await expect(issue()).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.invoice.count({ where: { companyId: CA } })).toBe(beforeInvoices);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, accountingEvent: 'SALE_ISSUED' } })).toBe(beforeEntries);
    await prisma.accountingMapping.create({ data: { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: ids.vat } });
  });

  it('#5 diário SALES ausente ou ambíguo rejeita e reverte', async () => {
    await prisma.accountingJournal.update({ where: { id: ids.salesJournal }, data: { isActive: false } });
    await expect(issue()).rejects.toBeInstanceOf(ValidationError);
    await prisma.accountingJournal.update({ where: { id: ids.salesJournal }, data: { isActive: true } });
    const extra = await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DV2', name: 'Vendas 2', journalType: 'SALES', sequencePrefix: 'LV2' } });
    await expect(issue()).rejects.toBeInstanceOf(ConflictError);
    await prisma.accountingJournal.delete({ where: { id: extra.id } });
  });

  it('#6 período ou exercício fechado faz rollback', async () => {
    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'CLOSED' } });
    await expect(issue()).rejects.toBeInstanceOf(ConflictError);
    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'OPEN' } });
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'CLOSED' } });
    await expect(issue()).rejects.toBeInstanceOf(ConflictError);
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'OPEN' } });
  });

  it('#7 duplo clique e concorrência criam uma factura e um lançamento', async () => {
    const key = randomUUID();
    const input = invoiceInput({ idempotencyKey: key });
    const [a, b] = await Promise.all([createInvoice(prisma, salesCtx, input), createInvoice(prisma, salesCtx, input)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.invoice.count({ where: { companyId: CA, id: a.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: a.id } })).toBe(1);
  });

  it('#8 mesma chave com payload diferente gera conflito', async () => {
    const key = randomUUID();
    await issue({ idempotencyKey: key });
    await expect(issue({ idempotencyKey: key, lines: [{ productId: ids.taxableProduct, quantity: 2, discountPercent: 0 }] })).rejects.toBeInstanceOf(ConflictError);
  });

  it('#9 stock, saldo e lançamento são atómicos; sem linhas zero nem COGS', async () => {
    const r = await issue();
    const [invoice, stock, customer, entry, cogs] = await Promise.all([
      prisma.invoice.findUnique({ where: { id: r.id } }),
      prisma.stockMovement.count({ where: { companyId: CA, document: r.number } }),
      prisma.customer.findUnique({ where: { id: ids.customer } }),
      entryFor('INVOICE', r.id, 'SALE_ISSUED'),
      prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'INVOICE', sourceId: r.id, accountingEvent: 'COGS_POSTED' } }),
    ]);
    expect(invoice).toBeTruthy();
    expect(stock).toBe(1);
    expect(Number(customer?.balance)).toBeGreaterThan(0);
    expect(entry?.lines.every((l) => (Number(l.debit) > 0) !== (Number(l.credit) > 0))).toBe(true);
    expect(cogs).toBe(0);
  });

  it('#10 permissões operacionais governam factura', async () => {
    await expect(issue({}, ctx(CA, []))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(issue({}, ctx(CA, ['sales.create']))).resolves.toBeTruthy();
  });

  it('#10b chaves de idempotência inválidas são rejeitadas', async () => {
    await expect(issue({ idempotencyKey: 'nao-e-uuid' })).rejects.toBeInstanceOf(ValidationError);
    const inv = await issue();
    await expect(receipt(inv.id, { idempotencyKey: 'nao-e-uuid' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#11 recibo parcial gera movimento e lançamento correcto', async () => {
    const inv = await issue();
    const p = await receipt(inv.id, { amount: 40, accountId: ids.cashAccount });
    const entry = await entryFor('CUSTOMER_PAYMENT', p.id, 'RECEIPT_POSTED');
    const movement = await prisma.treasuryMovement.findFirst({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: p.id, movementPurpose: 'RECEIPT_IN' } });
    expect(movement).toBeTruthy();
    expect(entry?.journal.journalType).toBe('CASH');
    expect(entry?.reference).toBe(p.number);
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.cashLedger && l.treasuryAccountId === ids.cashAccount && Number(l.debit) === 40)).toBeTruthy();
    expect(entry?.lines.find((l) => l.ledgerAccountId === ids.ar && l.customerId === ids.customer && Number(l.credit) === 40)).toBeTruthy();
  });

  it('#12 accountId ausente, conta sem mapping e conta inactiva são rejeitados', async () => {
    const inv = await issue();
    await expect(createPayment(prisma, paymentCtx, { idempotencyKey: randomUUID(), invoiceId: inv.id, amount: 10, method: 'CASH' } as PaymentInput)).rejects.toBeInstanceOf(ValidationError);
    const noMap = await prisma.treasuryAccount.create({ data: { companyId: CA, name: `Sem map ${randomUUID()}`, type: 'CASH' } });
    await expect(receipt(inv.id, { amount: 10, accountId: noMap.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(receipt(inv.id, { amount: 10, accountId: ids.inactiveAccount })).rejects.toBeInstanceOf(ConflictError);
  });

  it('#13 conta razão inactiva ou agrupadora é rejeitada', async () => {
    const inv = await issue();
    const bad = await prisma.treasuryAccount.create({ data: { companyId: CA, name: `Bad ${randomUUID()}`, type: 'CASH', ledgerAccountId: ids.inactiveLedger } });
    await expect(receipt(inv.id, { amount: 10, accountId: bad.id })).rejects.toBeInstanceOf(ValidationError);
    await prisma.treasuryAccount.update({ where: { id: bad.id }, data: { ledgerAccountId: null } });
    await prisma.treasuryAccount.update({ where: { id: bad.id }, data: { ledgerAccountId: ids.groupLedger } });
    await expect(receipt(inv.id, { amount: 10, accountId: bad.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#13b conta razão não-ASSET é rejeitada para tesouraria', async () => {
    const inv = await issue();
    const bad = await prisma.treasuryAccount.create({ data: { companyId: CA, name: `Despesa ${randomUUID()}`, type: 'CASH', ledgerAccountId: ids.expenseLedger } });
    await expect(receipt(inv.id, { amount: 10, accountId: bad.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#14 CASH usa diário CASH; BANK e MOBILE usam BANK; OTHER é rejeitado', async () => {
    const inv1 = await issue();
    expect((await entryFor('CUSTOMER_PAYMENT', (await receipt(inv1.id, { accountId: ids.cashAccount })).id, 'RECEIPT_POSTED'))?.journal.journalType).toBe('CASH');
    const inv2 = await issue();
    expect((await entryFor('CUSTOMER_PAYMENT', (await receipt(inv2.id, { accountId: ids.bankAccount })).id, 'RECEIPT_POSTED'))?.journal.journalType).toBe('BANK');
    const inv3 = await issue();
    expect((await entryFor('CUSTOMER_PAYMENT', (await receipt(inv3.id, { accountId: ids.mobileAccount })).id, 'RECEIPT_POSTED'))?.journal.journalType).toBe('BANK');
    const inv4 = await issue();
    await expect(receipt(inv4.id, { accountId: ids.otherAccount })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#15 recibo idempotente cria um Payment, um TreasuryMovement e um JournalEntry', async () => {
    const inv = await issue();
    const key = randomUUID();
    const input: PaymentInput = { idempotencyKey: key, invoiceId: inv.id, amount: 30, method: 'CASH', accountId: ids.cashAccount };
    const [a, b] = await Promise.all([createPayment(prisma, paymentCtx, input), createPayment(prisma, paymentCtx, input)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.payment.count({ where: { companyId: CA, id: a.id } })).toBe(1);
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: a.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'CUSTOMER_PAYMENT', sourceId: a.id } })).toBe(1);
  });

  it('#16 mesma chave de recibo com payload diferente gera conflito', async () => {
    const inv = await issue();
    const key = randomUUID();
    await receipt(inv.id, { idempotencyKey: key, amount: 20 });
    await expect(receipt(inv.id, { idempotencyKey: key, amount: 25 })).rejects.toBeInstanceOf(ConflictError);
  });

  it('#17 pagamento acima do saldo é rejeitado', async () => {
    const inv = await issue();
    await expect(receipt(inv.id, { amount: 999999 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('#18 falha contabilística faz rollback do Payment e da Tesouraria', async () => {
    const inv = await issue();
    const [invoiceBefore, customerBefore, accountBefore, movementsBefore, entriesBefore] = await Promise.all([
      prisma.invoice.findUnique({ where: { id: inv.id } }),
      prisma.customer.findUnique({ where: { id: ids.customer } }),
      prisma.treasuryAccount.findUnique({ where: { id: ids.cashAccount } }),
      prisma.treasuryMovement.count({ where: { companyId: CA } }),
      prisma.journalEntry.count({ where: { companyId: CA, accountingEvent: 'RECEIPT_POSTED' } }),
    ]);
    await prisma.accountingMapping.delete({ where: { companyId_systemKey: { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE' } } });
    await expect(receipt(inv.id, { amount: 10 })).rejects.toBeInstanceOf(ValidationError);
    const [invoiceAfter, customerAfter, accountAfter] = await Promise.all([
      prisma.invoice.findUnique({ where: { id: inv.id } }),
      prisma.customer.findUnique({ where: { id: ids.customer } }),
      prisma.treasuryAccount.findUnique({ where: { id: ids.cashAccount } }),
    ]);
    expect(await prisma.payment.count({ where: { companyId: CA, invoiceId: inv.id } })).toBe(0);
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA } })).toBe(movementsBefore);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, accountingEvent: 'RECEIPT_POSTED' } })).toBe(entriesBefore);
    expect(Number(invoiceAfter?.amountPaid)).toBe(Number(invoiceBefore?.amountPaid));
    expect(Number(customerAfter?.balance)).toBe(Number(customerBefore?.balance));
    expect(Number(accountAfter?.balance)).toBe(Number(accountBefore?.balance));
    await prisma.accountingMapping.create({ data: { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ids.ar } });
  });

  it('#19 diário de recibo ausente ou ambíguo rejeita', async () => {
    const inv1 = await issue();
    await prisma.accountingJournal.update({ where: { id: ids.cashJournal }, data: { isActive: false } });
    await expect(receipt(inv1.id)).rejects.toBeInstanceOf(ValidationError);
    await prisma.accountingJournal.update({ where: { id: ids.cashJournal }, data: { isActive: true } });
    const extra = await prisma.accountingJournal.create({ data: { companyId: CA, code: `CX${Date.now()}`, name: 'Caixa extra', journalType: 'CASH', sequencePrefix: 'C2' } });
    const inv2 = await issue();
    await expect(receipt(inv2.id)).rejects.toBeInstanceOf(ConflictError);
    await prisma.accountingJournal.delete({ where: { id: extra.id } });
  });

  it('#20 replay não duplica auditoria financeira', async () => {
    const inv = await issue();
    const key = randomUUID();
    const input: PaymentInput = { idempotencyKey: key, invoiceId: inv.id, amount: 10, method: 'CASH', accountId: ids.cashAccount };
    const first = await createPayment(prisma, paymentCtx, input);
    const second = await createPayment(prisma, paymentCtx, input);
    expect(second.id).toBe(first.id);
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'payment.receive', entityId: first.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'OPERATION_IDEMPOTENT_RETRY', entityId: first.id } })).toBe(1);
  });

  it('#20b criação escreve auditoria funcional uma única vez', async () => {
    const inv = await issue();
    const p = await receipt(inv.id, { amount: 10 });
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'invoice.issue', entityId: inv.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'payment.receive', entityId: p.id } })).toBe(1);
  });

  it('#21 utilizador sem accounting.post consegue operar; sem permissão operacional é rejeitado', async () => {
    const inv = await issue({}, ctx(CA, ['sales.create']));
    await expect(receipt(inv.id, { amount: 10 }, ctx(CA, ['payments.receive']))).resolves.toBeTruthy();
    await expect(receipt(inv.id, { amount: 10 }, ctx(CA, []))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('#22 empresa A não lança em dados da empresa B', async () => {
    await expect(issue({ customerId: ids.bCustomer })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('#23 seed demo permanece sem documentos financeiros criados pelo teste', async () => {
    expect(await prisma.invoice.count({ where: { companyId: 'demo-company' } })).toBe(0);
    expect(await prisma.payment.count({ where: { companyId: 'demo-company' } })).toBe(0);
    expect(await prisma.journalEntry.count({ where: { companyId: 'demo-company' } })).toBe(0);
    expect(await prisma.operationIdempotency.count({ where: { companyId: 'demo-company' } })).toBe(0);
  });
});
