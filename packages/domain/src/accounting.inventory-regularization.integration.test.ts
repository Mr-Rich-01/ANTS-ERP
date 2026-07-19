/**
 * Suite de INTEGRACAO da Sessao S10c — regularizacao retroactiva de existencias.
 * Correr com: `pnpm test:integration:accounting:regularization` (exige DATABASE_URL).
 *
 * Cobre: pre-visualizacao com detalhe por produto (formula do teste-ancora S10a:
 * soma por nivel de stock de round2(qtd x avgCost)), execucao D 131 / C 312 no
 * diario de Abertura quando o fisico excede o saldo (e o inverso no outro
 * sentido), divergencia final ZERO apos a execucao, valor NUNCA fornecido pelo
 * cliente (mismatch entre confirmado e recomputado falha por inteiro),
 * idempotencia com scope proprio (replay + conflito de fingerprint),
 * reutilizacao com nova divergencia, zero divergencia sem lancamento, permissoes,
 * mapping em falta sem fallback com rollback total, auditoria e isolamento A/B.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { executeInventoryRegularization, getInventoryRegularizationPreview } from './inventory-regularization';

const CA = 'smoke-invreg-a';
const CB = 'smoke-invreg-b';
const CD = 'smoke-invreg-d';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const postCtxA = ctx(CA, ['accounting.post']);
const viewCtxA = ctx(CA, ['accounting.view']);
const postCtxB = ctx(CB, ['accounting.post']);
const postCtxD = ctx(CD, ['accounting.post']);

let A!: { inventory: string; equity: string; p1: string; p2: string; p3: string; w1: string; w2: string };
let B!: { product: string };

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.stockLevel.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.accountingMapping.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.fiscalYear.deleteMany({ where: { companyId } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId, level: { gte: 2 } } });
  await prisma.ledgerAccount.deleteMany({ where: { companyId } });
  await prisma.accountingJournal.deleteMany({ where: { companyId } });
  await prisma.documentCounter.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

/** Contabilidade minima: exercicio/periodo abertos, diario DAB e contas 131/312 mapeadas. */
async function provisionAccounting(companyId: string, opts: { withEquityMapping?: boolean } = { withEquityMapping: true }) {
  const fy = await prisma.fiscalYear.create({ data: { companyId, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId, fiscalYearId: fy.id, periodNumber: 1, code: '2026', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId, code: 'DAB', name: 'Abertura', journalType: 'OPENING', sequencePrefix: 'AB' } });
  const inventory = await prisma.ledgerAccount.create({ data: { companyId, code: '131', name: 'Mercadorias', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1 } });
  const equity = await prisma.ledgerAccount.create({ data: { companyId, code: '312', name: 'Regularizacao de abertura de existencias', accountType: 'EQUITY', normalBalance: 'CREDIT', level: 1 } });
  const mappings: Array<{ companyId: string; systemKey: string; ledgerAccountId: string }> = [
    { companyId, systemKey: 'INVENTORY', ledgerAccountId: inventory.id },
  ];
  if (opts.withEquityMapping !== false) mappings.push({ companyId, systemKey: 'OPENING_BALANCE_EQUITY', ledgerAccountId: equity.id });
  await prisma.accountingMapping.createMany({ data: mappings });
  return { inventory: inventory.id, equity: equity.id };
}

async function regularizationEntries(companyId: string) {
  return prisma.journalEntry.findMany({
    where: { companyId, sourceType: 'INVENTORY_REGULARIZATION' },
    include: { lines: { orderBy: { lineNumber: 'asc' } }, journal: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function inventoryBalance(companyId: string, ledgerAccountId: string): Promise<number> {
  const lines = await prisma.journalEntryLine.findMany({
    where: { companyId, ledgerAccountId, journalEntry: { status: { in: ['POSTED', 'REVERSED'] } } },
    select: { debit: true, credit: true },
  });
  return round2(lines.reduce((sum, l) => sum + Number(l.debit) - Number(l.credit), 0));
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await teardown(CD);

  // Empresa A: dois armazens, produto em ambos (formula por nivel), produto sem
  // stock (excluido do detalhe) — e NENHUM lancamento na 131 (o cenario da demo:
  // stock fisico do arranque sem abertura contabilistica).
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Regularizacao A' } });
  const accA = await provisionAccounting(CA);
  const w1 = await prisma.warehouse.create({ data: { companyId: CA, code: 'W1', name: 'Armazem 1' } });
  const w2 = await prisma.warehouse.create({ data: { companyId: CA, code: 'W2', name: 'Armazem 2' } });
  const p1 = await prisma.product.create({ data: { companyId: CA, sku: 'REG-1', name: 'Produto Dois Armazens', salePrice: 60, taxRate: 0, avgCost: 25.75 } });
  const p2 = await prisma.product.create({ data: { companyId: CA, sku: 'REG-2', name: 'Produto Um Armazem', salePrice: 30, taxRate: 0, avgCost: 12 } });
  const p3 = await prisma.product.create({ data: { companyId: CA, sku: 'REG-3', name: 'Produto Sem Stock', salePrice: 10, taxRate: 0, avgCost: 5 } });
  await prisma.stockLevel.createMany({
    data: [
      { companyId: CA, productId: p1.id, warehouseId: w1.id, quantity: 10 },
      { companyId: CA, productId: p1.id, warehouseId: w2.id, quantity: 5 },
      { companyId: CA, productId: p2.id, warehouseId: w1.id, quantity: 4 },
      { companyId: CA, productId: p3.id, warehouseId: w1.id, quantity: 0 },
    ],
  });
  A = { ...accA, p1: p1.id, p2: p2.id, p3: p3.id, w1: w1.id, w2: w2.id };

  // Empresa B (isolamento): stock proprio, sem lancamentos.
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Regularizacao B' } });
  await provisionAccounting(CB);
  const wB = await prisma.warehouse.create({ data: { companyId: CB, code: 'WB', name: 'Armazem B' } });
  const pB = await prisma.product.create({ data: { companyId: CB, sku: 'REG-B', name: 'Produto B', salePrice: 90, taxRate: 0, avgCost: 50 } });
  await prisma.stockLevel.create({ data: { companyId: CB, productId: pB.id, warehouseId: wB.id, quantity: 3 } });
  B = { product: pB.id };

  // Empresa D: SEM mapping OPENING_BALANCE_EQUITY (sem fallback — falha total).
  await prisma.company.create({ data: { id: CD, legalName: 'Smoke Regularizacao D' } });
  await provisionAccounting(CD, { withEquityMapping: false });
  const wD = await prisma.warehouse.create({ data: { companyId: CD, code: 'WD', name: 'Armazem D' } });
  const pD = await prisma.product.create({ data: { companyId: CD, sku: 'REG-D', name: 'Produto D', salePrice: 20, taxRate: 0, avgCost: 7 } });
  await prisma.stockLevel.create({ data: { companyId: CD, productId: pD.id, warehouseId: wD.id, quantity: 2 } });
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await teardown(CD);
  await prisma.$disconnect();
});

// Fisico inicial da empresa A: 10x25.75 + 5x25.75 + 4x12 = 257.50 + 128.75 + 48.00.
const INITIAL_PHYSICAL = 434.25;

let lastKey!: string;
let lastEntryId!: string;

describe('S10c — regularizacao retroactiva de existencias', () => {
  it('#1 pre-visualizacao: detalhe por produto, fisico ao avgCost, saldo 131 e divergencia calculados no momento', async () => {
    const preview = await getInventoryRegularizationPreview(prisma, postCtxA);
    expect(preview.items).toHaveLength(2); // REG-3 sem stock fica fora do detalhe.
    const [i1, i2] = preview.items;
    expect(i1!.sku).toBe('REG-1');
    expect(i1!.quantity).toBe(15); // 10 + 5 nos dois armazens.
    expect(i1!.avgCost).toBe(25.75);
    expect(i1!.value).toBe(386.25);
    expect(i2!.sku).toBe('REG-2');
    expect(i2!.value).toBe(48);
    expect(preview.physicalValue).toBe(INITIAL_PHYSICAL);
    expect(preview.inventoryBalance).toBe(0);
    expect(preview.divergence).toBe(INITIAL_PHYSICAL);
    expect(preview.inventoryAccount.code).toBe('131');
    expect(preview.equityAccount.code).toBe('312');
  });

  it('#2 permissoes: pre-visualizacao e execucao exigem accounting.post', async () => {
    await expect(getInventoryRegularizationPreview(prisma, viewCtxA)).rejects.toThrow(/permiss/i);
    await expect(
      executeInventoryRegularization(prisma, viewCtxA, { expectedDivergence: INITIAL_PHYSICAL }, { idempotencyKey: randomUUID() }),
    ).rejects.toThrow(/permiss/i);
    expect(await regularizationEntries(CA)).toHaveLength(0);
  });

  it('#3 valor confirmado diferente do recomputado: falha por inteiro sem alterar nada', async () => {
    await expect(
      executeInventoryRegularization(prisma, postCtxA, { expectedDivergence: 100 }, { idempotencyKey: randomUUID() }),
    ).rejects.toThrow(/mudaram desde a pré-visualização/);
    expect(await regularizationEntries(CA)).toHaveLength(0);
    expect(await prisma.operationIdempotency.count({ where: { companyId: CA, scope: 'INVENTORY_REGULARIZATION' } })).toBe(0);
  });

  it('#4 execucao (fisico > saldo): D 131 / C 312 no diario de Abertura e divergencia final ZERO', async () => {
    const key = randomUUID();
    const res = await executeInventoryRegularization(prisma, postCtxA, { expectedDivergence: INITIAL_PHYSICAL, notes: 'Corte retroactivo S10c' }, { idempotencyKey: key });
    expect(res.divergence).toBe(INITIAL_PHYSICAL);
    expect(res.entryNumber.startsWith('AB ')).toBe(true);

    const entries = await regularizationEntries(CA);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.status).toBe('POSTED');
    expect(entry.journal.journalType).toBe('OPENING');
    expect(entry.sourceId).toBe(key);
    expect(entry.accountingEvent).toBe('INVENTORY_REGULARIZED');
    expect(Number(entry.totalDebit)).toBe(INITIAL_PHYSICAL);
    expect(entry.lines).toHaveLength(2);
    const debit = entry.lines.find((l) => Number(l.debit) > 0)!;
    const credit = entry.lines.find((l) => Number(l.credit) > 0)!;
    expect(debit.ledgerAccountId).toBe(A.inventory);
    expect(credit.ledgerAccountId).toBe(A.equity);

    // Divergencia a ZERO: saldo 131 = stock fisico ao avgCost (criterio da sessao).
    expect(await inventoryBalance(CA, A.inventory)).toBe(INITIAL_PHYSICAL);
    const after = await getInventoryRegularizationPreview(prisma, postCtxA);
    expect(after.divergence).toBe(0);

    // Auditoria explicita da operacao.
    const audits = await prisma.auditLog.findMany({ where: { companyId: CA, action: 'accounting.inventory_regularization' } });
    expect(audits).toHaveLength(1);

    // Guardado para os testes de idempotencia seguintes.
    lastKey = key;
    lastEntryId = res.entryId;
  });

  it('#5 replay idempotente: mesma chave + mesmo payload devolve o mesmo lancamento sem duplicar', async () => {
    const replay = await executeInventoryRegularization(
      prisma,
      postCtxA,
      { expectedDivergence: INITIAL_PHYSICAL, notes: 'Corte retroactivo S10c' },
      { idempotencyKey: lastKey },
    );
    expect(replay.entryId).toBe(lastEntryId);
    expect(await regularizationEntries(CA)).toHaveLength(1);
  });

  it('#6 mesma chave com payload diferente: conflito de idempotencia', async () => {
    await expect(
      executeInventoryRegularization(prisma, postCtxA, { expectedDivergence: INITIAL_PHYSICAL, notes: 'Outra nota' }, { idempotencyKey: lastKey }),
    ).rejects.toThrow(/conflito de idempotência/);
    expect(await regularizationEntries(CA)).toHaveLength(1);
  });

  it('#7 sem divergencia: a execucao falha com mensagem clara e nada e lancado', async () => {
    await expect(
      executeInventoryRegularization(prisma, postCtxA, { expectedDivergence: 0 }, { idempotencyKey: randomUUID() }),
    ).rejects.toThrow(/nada a regularizar/);
    expect(await regularizationEntries(CA)).toHaveLength(1);
  });

  it('#8 operacao GENERICA e reutilizavel: nova divergencia posterior regulariza com nova chave', async () => {
    // Entrada fisica sem contabilidade (ex.: historico legado adicional): +6 x 12.00 = 72.00.
    await prisma.stockLevel.update({
      where: { productId_warehouseId: { productId: A.p2, warehouseId: A.w1 } },
      data: { quantity: { increment: 6 } },
    });
    const preview = await getInventoryRegularizationPreview(prisma, postCtxA);
    expect(preview.divergence).toBe(72);

    const res = await executeInventoryRegularization(prisma, postCtxA, { expectedDivergence: 72 }, { idempotencyKey: randomUUID() });
    expect(res.divergence).toBe(72);
    expect(await regularizationEntries(CA)).toHaveLength(2);
    expect((await getInventoryRegularizationPreview(prisma, postCtxA)).divergence).toBe(0);
  });

  it('#9 sentido inverso (saldo > fisico): D 312 / C 131 pelo valor absoluto', async () => {
    // Saida fisica sem contabilidade: o armazem 2 perde as 5 unidades de REG-1 (5 x 25.75 = 128.75).
    await prisma.stockLevel.update({
      where: { productId_warehouseId: { productId: A.p1, warehouseId: A.w2 } },
      data: { quantity: 0 },
    });
    const preview = await getInventoryRegularizationPreview(prisma, postCtxA);
    expect(preview.divergence).toBe(-128.75);

    const res = await executeInventoryRegularization(prisma, postCtxA, { expectedDivergence: -128.75 }, { idempotencyKey: randomUUID() });
    expect(res.divergence).toBe(-128.75);

    const entries = await regularizationEntries(CA);
    expect(entries).toHaveLength(3);
    const entry = entries[2]!;
    expect(Number(entry.totalDebit)).toBe(128.75);
    const debit = entry.lines.find((l) => Number(l.debit) > 0)!;
    const credit = entry.lines.find((l) => Number(l.credit) > 0)!;
    expect(debit.ledgerAccountId).toBe(A.equity);
    expect(credit.ledgerAccountId).toBe(A.inventory);
    expect((await getInventoryRegularizationPreview(prisma, postCtxA)).divergence).toBe(0);
  });

  it('#10 mapping em falta (sem fallback): falha total com mensagem clara e rollback', async () => {
    await expect(
      executeInventoryRegularization(prisma, postCtxD, { expectedDivergence: 14 }, { idempotencyKey: randomUUID() }),
    ).rejects.toThrow(/OPENING_BALANCE_EQUITY/);
    expect(await regularizationEntries(CD)).toHaveLength(0);
    expect(await prisma.operationIdempotency.count({ where: { companyId: CD, scope: 'INVENTORY_REGULARIZATION' } })).toBe(0);
    await expect(getInventoryRegularizationPreview(prisma, postCtxD)).rejects.toThrow(/OPENING_BALANCE_EQUITY/);
  });

  it('#11 isolamento A/B: cada empresa ve e regulariza apenas o proprio stock', async () => {
    const previewB = await getInventoryRegularizationPreview(prisma, postCtxB);
    expect(previewB.items).toHaveLength(1);
    expect(previewB.items[0]!.productId).toBe(B.product);
    expect(previewB.divergence).toBe(150); // 3 x 50.00, sem lancamentos.

    const res = await executeInventoryRegularization(prisma, postCtxB, { expectedDivergence: 150 }, { idempotencyKey: randomUUID() });
    expect(res.divergence).toBe(150);
    expect((await getInventoryRegularizationPreview(prisma, postCtxB)).divergence).toBe(0);

    // A empresa A nao foi afectada pela regularizacao da B.
    expect((await getInventoryRegularizationPreview(prisma, postCtxA)).divergence).toBe(0);
    expect(await regularizationEntries(CA)).toHaveLength(3);
  });
});
