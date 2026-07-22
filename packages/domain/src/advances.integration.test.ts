/**
 * Suite de integracao S17 — Recibo de Adiantamento + Devolucao ao Cliente.
 * Correr com: `pnpm test:integration:advances` (exige DATABASE_URL).
 *
 * Cobre: C1 criacao do RA (ADVANCE_RECEIVED + tesouraria), C2 aplicacao parcial/total
 * a facturas (REC metodo ADVANCE + ADVANCE_APPLIED, bloqueios e concorrencia),
 * C3 devolucao do remanescente (REFUND_ISSUED origem ADVANCE), C4 ciclo NC → devolucao
 * de dinheiro com stock intacto, idempotencia, isolamento A/B, permissoes e o
 * balanco ancora com o passivo CUSTOMER_ADVANCES.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forCompany, prisma } from '@ants/database';
import { civilDateInTimeZone, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import {
  applyAdvanceToInvoice,
  advanceRemaining,
  createCustomerAdvance,
  createCustomerRefund,
  getCustomerAdvance,
  getCustomerAdvanceSummary,
  getCustomerRefund,
  getCustomerRefundFormContext,
  listCustomerAdvances,
  listCustomerRefunds,
  refundAdvance,
  type CustomerAdvanceInput,
} from './advances';
import { createInvoice, createPayment, getCustomerStatement } from './invoices';
import { createCreditNote } from './commercial-documents';
import { getBalanceSheetReport } from './accounting-statements';
import { ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-advances';
const CB = 'smoke-advances-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const CURRENT_DATE = civilDateInTimeZone();
const YEAR = Number(CURRENT_DATE.slice(0, 4));

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const fullCtx = ctx(CA, ['sales.view', 'sales.create', 'payments.receive', 'treasury.createMovement', 'clients.view', 'accounting.view']);
const viewCtx = ctx(CA, ['sales.view']);
const dbA = forCompany(CA);
const dbB = forCompany(CB);

interface Ids {
  customer: string;
  customer2: string;
  /** Cliente exclusivo do ciclo C4 (NC → devolução) — saldo sempre limpo. */
  customer3: string;
  warehouse: string;
  product: string;
  cashAccount: string;
}

let ids!: Ids;

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.customerRefund.deleteMany({ where: { companyId } });
  await prisma.customerAdvanceApplication.deleteMany({ where: { companyId } });
  await prisma.customerAdvance.deleteMany({ where: { companyId } });
  await prisma.payment.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.creditNoteLine.deleteMany({ where: { companyId } });
  await prisma.creditNote.deleteMany({ where: { companyId } });
  await prisma.invoiceLine.deleteMany({ where: { companyId } });
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

async function ledger(companyId: string, code: string, name: string, accountType: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE', normalBalance: 'DEBIT' | 'CREDIT', parentId?: string) {
  return prisma.ledgerAccount.create({
    data: { companyId, code, name, accountType, normalBalance, level: parentId ? 3 : 2, parentId: parentId ?? null, isPosting: !!parentId },
  });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Advances' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: `${YEAR}`, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: `${YEAR}`, name: `${YEAR}`, startDate: D(`${YEAR}-01-01`), endDate: D(`${YEAR}-12-31`), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DV', name: 'Vendas', journalType: 'SALES', sequencePrefix: 'LV' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DCX', name: 'Caixa', journalType: 'CASH', sequencePrefix: 'CX' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DG', name: 'Geral', journalType: 'GENERAL', sequencePrefix: 'LG' } });

  // Grupos de nível 2 (agrupadoras) + contas de movimento de nível 3 — o Balanço agrupa por parentId.
  const gCash = (await ledger(CA, '11', 'Meios monetarios', 'ASSET', 'DEBIT')).id;
  const gAr = (await ledger(CA, '12', 'Clientes', 'ASSET', 'DEBIT')).id;
  const gInv = (await ledger(CA, '13', 'Inventario', 'ASSET', 'DEBIT')).id;
  const gVat = (await ledger(CA, '22', 'Estado', 'LIABILITY', 'CREDIT')).id;
  const gAdv = (await ledger(CA, '24', 'Outros credores', 'LIABILITY', 'CREDIT')).id;
  const gRev = (await ledger(CA, '41', 'Vendas', 'REVENUE', 'CREDIT')).id;
  const gExp = (await ledger(CA, '51', 'Custo das vendas', 'EXPENSE', 'DEBIT')).id;

  const cashLedger = (await ledger(CA, '111', 'Caixa', 'ASSET', 'DEBIT', gCash)).id;
  const ar = (await ledger(CA, '121', 'Clientes c/c', 'ASSET', 'DEBIT', gAr)).id;
  const inventory = (await ledger(CA, '131', 'Mercadorias', 'ASSET', 'DEBIT', gInv)).id;
  const vat = (await ledger(CA, '221', 'IVA liquidado', 'LIABILITY', 'CREDIT', gVat)).id;
  const advances = (await ledger(CA, '241', 'Adiantamentos de clientes', 'LIABILITY', 'CREDIT', gAdv)).id;
  const revenue = (await ledger(CA, '411', 'Vendas', 'REVENUE', 'CREDIT', gRev)).id;
  const cogs = (await ledger(CA, '511', 'CMV', 'EXPENSE', 'DEBIT', gExp)).id;
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'ACCOUNTS_RECEIVABLE', ledgerAccountId: ar },
      { companyId: CA, systemKey: 'SALES_REVENUE', ledgerAccountId: revenue },
      { companyId: CA, systemKey: 'VAT_OUTPUT', ledgerAccountId: vat },
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory },
      { companyId: CA, systemKey: 'COST_OF_GOODS_SOLD', ledgerAccountId: cogs },
      { companyId: CA, systemKey: 'CUSTOMER_ADVANCES', ledgerAccountId: advances },
    ],
  });

  const customer = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente Adiantado', paymentTermDays: 30 } });
  const customer2 = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente Segundo', paymentTermDays: 30 } });
  const customer3 = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente Terceiro', paymentTermDays: 30 } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ADV', name: 'Loja ADV' } });
  const product = await prisma.product.create({ data: { companyId: CA, sku: 'ADV-1', name: 'Produto ADV', salePrice: 100, taxRate: 16, avgCost: 60 } });
  await prisma.stockLevel.create({ data: { companyId: CA, productId: product.id, warehouseId: warehouse.id, quantity: 1000 } });
  const cashAccount = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa ADV', type: 'CASH', ledgerAccountId: cashLedger, allowNegative: true } });

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Advances B' } });

  ids = { customer: customer.id, customer2: customer2.id, customer3: customer3.id, warehouse: warehouse.id, product: product.id, cashAccount: cashAccount.id };
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

function advanceInput(overrides: Partial<CustomerAdvanceInput> = {}): CustomerAdvanceInput {
  return {
    idempotencyKey: randomUUID(),
    issueDate: CURRENT_DATE,
    customerId: ids.customer,
    amount: 500,
    method: 'CASH',
    accountId: ids.cashAccount,
    reference: 'Encomenda de teste',
    ...overrides,
  };
}

async function newInvoice(quantity: number, customerId = ids.customer): Promise<{ id: string; number: string; total: number }> {
  const res = await createInvoice(prisma, fullCtx, {
    idempotencyKey: randomUUID(),
    issueDate: CURRENT_DATE,
    customerId,
    warehouseId: ids.warehouse,
    lines: [{ productId: ids.product, quantity, discountPercent: 0 }],
  });
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: res.id } });
  return { id: res.id, number: res.number, total: Number(inv.total) };
}

async function cashBalance(): Promise<number> {
  const acc = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.cashAccount } });
  return round2(Number(acc.balance));
}

describe('S17 — Recibo de Adiantamento + Devolucao ao Cliente', () => {
  let firstAdvanceId = '';

  it('C1: cria o RA com serie propria, ADVANCE_RECEIVED balanceado e entrada de tesouraria', async () => {
    const cashBefore = await cashBalance();
    const { id, number } = await createCustomerAdvance(prisma, fullCtx, advanceInput());
    firstAdvanceId = id;
    expect(number).toBe(`RA ${YEAR}/0001`);

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId: CA, sourceType: 'CUSTOMER_ADVANCE', sourceId: id, accountingEvent: 'ADVANCE_RECEIVED' },
      include: { lines: { include: { ledgerAccount: true } } },
    });
    const debit = entry.lines.reduce((acc, l) => acc + Number(l.debit), 0);
    const credit = entry.lines.reduce((acc, l) => acc + Number(l.credit), 0);
    expect(debit).toBe(500);
    expect(debit).toBe(credit);
    expect(entry.lines.find((l) => Number(l.debit) > 0)?.ledgerAccount.code).toBe('111');
    expect(entry.lines.find((l) => Number(l.credit) > 0)?.ledgerAccount.code).toBe('241');
    // Dimensao do cliente na linha do passivo.
    expect(entry.lines.find((l) => Number(l.credit) > 0)?.customerId).toBe(ids.customer);

    const movement = await prisma.treasuryMovement.findFirstOrThrow({
      where: { companyId: CA, sourceType: 'CUSTOMER_ADVANCE', sourceId: id, movementPurpose: 'ADVANCE_IN' },
    });
    expect(movement.flow).toBe('IN');
    expect(Number(movement.amount)).toBe(500);
    expect(await cashBalance()).toBe(round2(cashBefore + 500));

    // O RA nao toca no saldo devedor do cliente.
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: ids.customer } });
    expect(Number(customer.balance)).toBe(0);

    const detail = await getCustomerAdvance(dbA, viewCtx, id);
    expect(detail.state).toBe('ABERTO');
    expect(detail.remaining).toBe(500);
  });

  it('C1: replay idempotente do RA nao duplica documento, movimento nem lancamento', async () => {
    const input = advanceInput({ amount: 300 });
    const first = await createCustomerAdvance(prisma, fullCtx, input);
    const replay = await createCustomerAdvance(prisma, fullCtx, input);
    expect(replay).toEqual(first);
    expect(await prisma.customerAdvance.count({ where: { companyId: CA, id: first.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'CUSTOMER_ADVANCE', sourceId: first.id } })).toBe(1);
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, sourceType: 'CUSTOMER_ADVANCE', sourceId: first.id } })).toBe(1);
  });

  it('C2: aplicacao parcial gera REC metodo ADVANCE sem tesouraria e factura parcial', async () => {
    const invoice = await newInvoice(2); // 232,00
    const cashBefore = await cashBalance();
    const result = await applyAdvanceToInvoice(prisma, fullCtx, {
      idempotencyKey: randomUUID(),
      advanceId: firstAdvanceId,
      invoiceId: invoice.id,
      amount: 100,
    });
    expect(result.paymentNumber.startsWith('REC ')).toBe(true);
    expect(result.advanceRemaining).toBe(400);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: result.paymentId } });
    expect(payment.method).toBe('ADVANCE');

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.status).toBe('PARTIAL');
    expect(Number(updated.amountPaid)).toBe(100);

    // Sem movimento de tesouraria novo — o dinheiro entrou no RA.
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, sourceType: 'RECEIPT', sourceId: result.paymentId } })).toBe(0);
    expect(await cashBalance()).toBe(cashBefore);

    // ADVANCE_APPLIED: D 241 / C 121.
    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId: CA, sourceType: 'CUSTOMER_ADVANCE_APPLICATION', sourceId: result.applicationId, accountingEvent: 'ADVANCE_APPLIED' },
      include: { lines: { include: { ledgerAccount: true } } },
    });
    expect(entry.lines.find((l) => Number(l.debit) > 0)?.ledgerAccount.code).toBe('241');
    expect(entry.lines.find((l) => Number(l.credit) > 0)?.ledgerAccount.code).toBe('121');
    expect(entry.lines.reduce((acc, l) => acc + Number(l.debit), 0)).toBe(100);

    // O REC baixa o saldo do cliente como qualquer recibo (232 da factura − 100).
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: ids.customer } });
    expect(Number(customer.balance)).toBe(132);

    // Segunda aplicacao esgota a divida da factura.
    const second = await applyAdvanceToInvoice(prisma, fullCtx, {
      idempotencyKey: randomUUID(),
      advanceId: firstAdvanceId,
      invoiceId: invoice.id,
      amount: 132,
    });
    expect(second.advanceRemaining).toBe(268);
    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paid.status).toBe('PAID');

    const detail = await getCustomerAdvance(dbA, viewCtx, firstAdvanceId);
    expect(detail.state).toBe('PARCIAL');
    expect(detail.applications.length).toBe(2);
  });

  it('C2: replay idempotente da aplicacao devolve o mesmo REC sem duplicar', async () => {
    const invoice = await newInvoice(1); // 116,00
    const key = randomUUID();
    const input = { idempotencyKey: key, advanceId: firstAdvanceId, invoiceId: invoice.id, amount: 50 };
    const first = await applyAdvanceToInvoice(prisma, fullCtx, input);
    const replay = await applyAdvanceToInvoice(prisma, fullCtx, input);
    expect(replay.paymentId).toBe(first.paymentId);
    expect(await prisma.customerAdvanceApplication.count({ where: { companyId: CA, paymentId: first.paymentId } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'CUSTOMER_ADVANCE_APPLICATION', sourceId: first.applicationId } })).toBe(1);
  });

  it('C2: bloqueia exceder o saldo do RA, a divida da factura e clientes trocados', async () => {
    const invoice = await newInvoice(1); // 116,00
    // Excede o saldo remanescente do RA (268 - 50 = 218 disponiveis neste ponto).
    await expect(
      applyAdvanceToInvoice(prisma, fullCtx, { idempotencyKey: randomUUID(), advanceId: firstAdvanceId, invoiceId: invoice.id, amount: 5000 }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Excede a divida da factura.
    await expect(
      applyAdvanceToInvoice(prisma, fullCtx, { idempotencyKey: randomUUID(), advanceId: firstAdvanceId, invoiceId: invoice.id, amount: 200 }),
    ).rejects.toBeInstanceOf(ValidationError);
    // RA de outro cliente.
    const otherInvoice = await newInvoice(1, ids.customer2);
    await expect(
      applyAdvanceToInvoice(prisma, fullCtx, { idempotencyKey: randomUUID(), advanceId: firstAdvanceId, invoiceId: otherInvoice.id, amount: 10 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('C2: duas aplicacoes concorrentes nao consomem mais do que o saldo do RA', async () => {
    const { id: advanceId } = await createCustomerAdvance(prisma, fullCtx, advanceInput({ amount: 100 }));
    const [inv1, inv2] = await Promise.all([newInvoice(1), newInvoice(1)]);
    const results = await Promise.allSettled([
      applyAdvanceToInvoice(prisma, fullCtx, { idempotencyKey: randomUUID(), advanceId, invoiceId: inv1.id, amount: 80 }),
      applyAdvanceToInvoice(prisma, fullCtx, { idempotencyKey: randomUUID(), advanceId, invoiceId: inv2.id, amount: 80 }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const advance = await prisma.customerAdvance.findUniqueOrThrow({ where: { id: advanceId } });
    expect(Number(advance.appliedTotal)).toBe(80);
    expect(advanceRemaining({ amount: 100, appliedTotal: Number(advance.appliedTotal), refundedTotal: 0 })).toBe(20);
    expect(await prisma.customerAdvanceApplication.count({ where: { companyId: CA, advanceId } })).toBe(1);
  });

  it('C3: devolucao total de um RA — REFUND_ISSUED (D 241 / C 111), tesouraria de saida e estado DEVOLVIDO', async () => {
    const { id: advanceId } = await createCustomerAdvance(prisma, fullCtx, advanceInput({ amount: 200 }));
    const cashBefore = await cashBalance();
    const { id: refundId, number } = await refundAdvance(prisma, fullCtx, {
      idempotencyKey: randomUUID(),
      issueDate: CURRENT_DATE,
      advanceId,
      amount: 200,
      method: 'CASH',
      accountId: ids.cashAccount,
      reason: 'Cliente desistiu da encomenda',
    });
    expect(number).toBe(`DEV ${YEAR}/0001`);

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId: CA, sourceType: 'CUSTOMER_REFUND', sourceId: refundId, accountingEvent: 'REFUND_ISSUED' },
      include: { lines: { include: { ledgerAccount: true } } },
    });
    expect(entry.lines.find((l) => Number(l.debit) > 0)?.ledgerAccount.code).toBe('241');
    expect(entry.lines.find((l) => Number(l.credit) > 0)?.ledgerAccount.code).toBe('111');
    expect(entry.lines.reduce((acc, l) => acc + Number(l.debit), 0)).toBe(200);

    const movement = await prisma.treasuryMovement.findFirstOrThrow({
      where: { companyId: CA, sourceType: 'CUSTOMER_REFUND', sourceId: refundId, movementPurpose: 'REFUND_OUT' },
    });
    expect(movement.flow).toBe('OUT');
    expect(await cashBalance()).toBe(round2(cashBefore - 200));

    const detail = await getCustomerAdvance(dbA, viewCtx, advanceId);
    expect(detail.state).toBe('DEVOLVIDO');
    expect(detail.remaining).toBe(0);

    // Bloqueia devolver mais do que o saldo (agora zero).
    await expect(
      refundAdvance(prisma, fullCtx, {
        idempotencyKey: randomUUID(),
        issueDate: CURRENT_DATE,
        advanceId,
        amount: 1,
        method: 'CASH',
        accountId: ids.cashAccount,
        reason: 'Tentativa acima do saldo',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('C3: replay idempotente da devolucao nao duplica DEV, movimento nem lancamento', async () => {
    const { id: advanceId } = await createCustomerAdvance(prisma, fullCtx, advanceInput({ amount: 150 }));
    const input = {
      idempotencyKey: randomUUID(),
      issueDate: CURRENT_DATE,
      advanceId,
      amount: 150,
      method: 'CASH' as const,
      accountId: ids.cashAccount,
      reason: 'Devolucao integral idempotente',
    };
    const first = await refundAdvance(prisma, fullCtx, input);
    const replay = await refundAdvance(prisma, fullCtx, input);
    expect(replay).toEqual(first);
    expect(await prisma.customerRefund.count({ where: { companyId: CA, id: first.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'CUSTOMER_REFUND', sourceId: first.id } })).toBe(1);
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, sourceType: 'CUSTOMER_REFUND', sourceId: first.id } })).toBe(1);
    const advance = await prisma.customerAdvance.findUniqueOrThrow({ where: { id: advanceId } });
    expect(Number(advance.refundedTotal)).toBe(150);
  });

  it('C4: NC devolve o stock; a Devolucao ao Cliente trata SO do dinheiro e zera a conta corrente', async () => {
    // Venda paga a dinheiro: 2 un × 116 = 232.
    const invoice = await newInvoice(2, ids.customer3);
    await createPayment(prisma, fullCtx, {
      idempotencyKey: randomUUID(),
      invoiceId: invoice.id,
      amount: invoice.total,
      method: 'CASH',
      accountId: ids.cashAccount,
    });

    // NC total com devolucao fisica: o stock entra AQUI.
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { companyId: CA, invoiceId: invoice.id } });
    const stockBeforeNc = (await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.product, warehouseId: ids.warehouse } } })).quantity;
    const nc = await createCreditNote(prisma, fullCtx, {
      idempotencyKey: randomUUID(),
      issueDate: CURRENT_DATE,
      invoiceId: invoice.id,
      reason: 'Devolucao integral da mercadoria',
      returnStock: true,
      lines: [{ invoiceLineId: line.id, quantity: 2 }],
    });
    const stockAfterNc = (await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.product, warehouseId: ids.warehouse } } })).quantity;
    expect(stockAfterNc).toBe(stockBeforeNc + 2);

    const customerAfterNc = await prisma.customer.findUniqueOrThrow({ where: { id: ids.customer3 } });
    expect(Number(customerAfterNc.balance)).toBe(-232); // saldo credor

    // Devolucao do dinheiro com origem na NC.
    const formCtx = await getCustomerRefundFormContext(dbA, viewCtx, ids.customer3);
    expect(formCtx.creditAvailable).toBe(232);
    expect(formCtx.refundableCreditNotes.map((n) => n.id)).toContain(nc.id);

    const cashBefore = await cashBalance();
    const { id: refundId } = await createCustomerRefund(prisma, fullCtx, {
      idempotencyKey: randomUUID(),
      issueDate: CURRENT_DATE,
      customerId: ids.customer3,
      origin: 'CREDIT_NOTE',
      creditNoteId: nc.id,
      amount: 232,
      method: 'CASH',
      accountId: ids.cashAccount,
      reason: 'Reembolso apos devolucao da mercadoria',
    });

    // Conta corrente a zero; dinheiro saiu; stock INALTERADO pela devolucao.
    const customerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: ids.customer3 } });
    expect(Number(customerAfter.balance)).toBe(0);
    expect(await cashBalance()).toBe(round2(cashBefore - 232));
    const stockAfterRefund = (await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.product, warehouseId: ids.warehouse } } })).quantity;
    expect(stockAfterRefund).toBe(stockAfterNc);
    expect(await prisma.stockMovement.count({ where: { companyId: CA, document: { startsWith: 'DEV ' } } })).toBe(0);

    // REFUND_ISSUED: D 121 / C 111; e um UNICO evento para esta origem.
    const entries = await prisma.journalEntry.findMany({
      where: { companyId: CA, sourceType: 'CUSTOMER_REFUND', sourceId: refundId },
      include: { lines: { include: { ledgerAccount: true } } },
    });
    expect(entries.length).toBe(1);
    expect(entries[0]!.lines.find((l) => Number(l.debit) > 0)?.ledgerAccount.code).toBe('121');
    expect(entries[0]!.lines.find((l) => Number(l.credit) > 0)?.ledgerAccount.code).toBe('111');

    // O detalhe lista os produtos da NC a titulo informativo.
    const detail = await getCustomerRefund(dbA, viewCtx, refundId);
    expect(detail.origin).toBe('CREDIT_NOTE');
    expect(detail.creditNoteProducts.length).toBe(1);
    expect(detail.creditNoteProducts[0]!.quantity).toBe(2);

    // Segunda devolucao sobre a mesma NC: sem credito disponivel → bloqueada.
    await expect(
      createCustomerRefund(prisma, fullCtx, {
        idempotencyKey: randomUUID(),
        issueDate: CURRENT_DATE,
        customerId: ids.customer3,
        origin: 'CREDIT_NOTE',
        creditNoteId: nc.id,
        amount: 10,
        method: 'CASH',
        accountId: ids.cashAccount,
        reason: 'Segunda tentativa indevida',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('extracto e resumo: REC de adiantamento identificado e saldo de adiantamentos separado', async () => {
    const statement = await getCustomerStatement(dbA, ctx(CA, ['clients.view']), ids.customer);
    expect(statement.rows.some((r) => r.description === 'Recibo (adiantamento aplicado)')).toBe(true);

    const summary = await getCustomerAdvanceSummary(dbA, ctx(CA, ['clients.view']), ids.customer);
    const dbRemaining = (await prisma.customerAdvance.findMany({ where: { companyId: CA, customerId: ids.customer, cancelledAt: null } }))
      .map((a) => advanceRemaining({ amount: Number(a.amount), appliedTotal: Number(a.appliedTotal), refundedTotal: Number(a.refundedTotal) }))
      .filter((r) => r > 0)
      .reduce((acc, r) => acc + r, 0);
    expect(summary.totalRemaining).toBe(round2(dbRemaining));
    expect(summary.openAdvances.length).toBeGreaterThanOrEqual(1);
  });

  it('listas com filtros: adiantamentos por estado/cliente e devolucoes por origem', async () => {
    const all = await listCustomerAdvances(dbA, viewCtx);
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all.every((a) => a.number.startsWith('RA '))).toBe(true);

    const returned = await listCustomerAdvances(dbA, viewCtx, { state: 'DEVOLVIDO' });
    expect(returned.length).toBeGreaterThanOrEqual(2);
    expect(returned.every((a) => a.state === 'DEVOLVIDO')).toBe(true);

    const byCustomer = await listCustomerAdvances(dbA, viewCtx, { customerId: ids.customer2 });
    expect(byCustomer.length).toBe(0); // o cliente 2 nunca teve RA

    const refunds = await listCustomerRefunds(dbA, viewCtx);
    expect(refunds.every((r) => r.number.startsWith('DEV '))).toBe(true);
    const fromNc = await listCustomerRefunds(dbA, viewCtx, { origin: 'CREDIT_NOTE' });
    expect(fromNc.length).toBe(1);
    expect(fromNc[0]!.sourceNumber?.startsWith('NC ')).toBe(true);
    const fromAdvance = await listCustomerRefunds(dbA, viewCtx, { origin: 'ADVANCE' });
    expect(fromAdvance.length).toBeGreaterThanOrEqual(2);
  });

  it('permissoes: cada operacao exige o gate certo', async () => {
    await expect(createCustomerAdvance(prisma, ctx(CA, ['sales.view']), advanceInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      applyAdvanceToInvoice(prisma, ctx(CA, ['sales.view']), { idempotencyKey: randomUUID(), advanceId: firstAdvanceId, invoiceId: 'x', amount: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      refundAdvance(prisma, ctx(CA, ['payments.receive']), {
        idempotencyKey: randomUUID(),
        issueDate: CURRENT_DATE,
        advanceId: firstAdvanceId,
        amount: 1,
        method: 'CASH',
        accountId: ids.cashAccount,
        reason: 'Sem permissao',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listCustomerAdvances(dbA, ctx(CA, []))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listCustomerRefunds(dbA, ctx(CA, []))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('isolamento multiempresa: a empresa B nao ve nem toca nos documentos de A', async () => {
    const ctxB = ctx(CB, ['sales.view', 'payments.receive', 'treasury.createMovement']);
    expect((await listCustomerAdvances(dbB, ctxB)).length).toBe(0);
    expect((await listCustomerRefunds(dbB, ctxB)).length).toBe(0);
    await expect(getCustomerAdvance(dbB, ctxB, firstAdvanceId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      refundAdvance(dbB, ctxB, {
        idempotencyKey: randomUUID(),
        issueDate: CURRENT_DATE,
        advanceId: firstAdvanceId,
        amount: 1,
        method: 'CASH',
        accountId: ids.cashAccount,
        reason: 'Cross-tenant indevido',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('balanco ancora: Activo = Passivo + Capital com adiantamentos abertos, e 241 = soma dos saldos', async () => {
    // Garante que ha pelo menos um RA aberto no momento do fecho.
    await createCustomerAdvance(prisma, fullCtx, advanceInput({ amount: 777 }));

    const report = await getBalanceSheetReport(dbA, fullCtx);
    expect(report.isBalanced).toBe(true);
    expect(report.totalAssets).toBe(report.totalLiabilitiesAndEquity);

    // O grupo 24 do passivo reflecte exactamente o razao da 241…
    const lines = await prisma.journalEntryLine.findMany({
      where: { companyId: CA, ledgerAccount: { code: '241' } },
    });
    const ledger241 = round2(lines.reduce((acc, l) => acc + Number(l.credit) - Number(l.debit), 0));
    const group24 = report.liabilities.find((g) => g.code === '24');
    expect(group24?.amount).toBe(ledger241);

    // …e o razao coincide com o total remanescente operacional dos RAs nao cancelados.
    const advances = await prisma.customerAdvance.findMany({ where: { companyId: CA, cancelledAt: null } });
    const operationalRemaining = round2(
      advances.reduce((acc, a) => acc + advanceRemaining({ amount: Number(a.amount), appliedTotal: Number(a.appliedTotal), refundedTotal: Number(a.refundedTotal) }), 0),
    );
    expect(ledger241).toBe(operationalRemaining);
  });
});
