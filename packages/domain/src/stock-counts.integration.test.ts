/**
 * Suite de INTEGRACAO da Sessao S9 — inventario em duas etapas.
 * Correr com: `pnpm test:integration:stock:counts` (exige DATABASE_URL).
 *
 * Cobre: rascunho com zero efeitos, edicao com refresh de snapshots, validacao
 * completa (movimentos ADJUST + lancamento D131/C421 + D551/C131 no diario
 * ADJUSTMENT), idempotencia da validacao (replay nao duplica; revalidar falha),
 * concorrencia contagem→validacao (delta sobre stock corrente; bloqueio de
 * negativos com rollback total), contagem sem diferencas, excedente a custo 0,
 * descarte com motivo, permissoes (contar=stock.view, validar=stock.adjust),
 * mapping/diario em falta com rollback e isolamento A/B.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, forCompany } from '@ants/database';
import type { RequestContext } from './context';
import {
  createStockCount,
  discardStockCount,
  getStockCount,
  listStockCounts,
  updateStockCount,
  validateStockCount,
} from './stock-counts';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-stock-counts';
const CB = 'smoke-stock-counts-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[], userId = `${companyId}-user`): RequestContext {
  return { companyId, userId, permissions: new Set(permissions), isPlatformAdmin: false };
}

const counter = ctx(CA, ['stock.view'], `${CA}-counter`);
const validator = ctx(CA, ['stock.view', 'stock.adjust'], `${CA}-validator`);
const noView = ctx(CA, ['sales.view']);
const bFull = ctx(CB, ['stock.view', 'stock.adjust']);

interface Ids {
  warehouse: string;
  warehouseB: string;
  p1: string; // avgCost 10
  p2: string; // avgCost 20
  p3: string; // avgCost 0
  pB: string;
}

let ids!: Ids;

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.stockCountLine.deleteMany({ where: { companyId } });
  await prisma.stockCount.deleteMany({ where: { companyId } });
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
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Contagens A' } });
  await prisma.user.create({ data: { id: `${CA}-validator`, companyId: CA, email: 'validador@smoke.co.mz', name: 'Validador Smoke', passwordHash: 'x' } });
  await prisma.user.create({ data: { id: `${CA}-counter`, companyId: CA, email: 'contador@smoke.co.mz', name: 'Contador Smoke', passwordHash: 'x' } });
  const year = new Date().getUTCFullYear();
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: String(year), startDate: D(`${year}-01-01`), endDate: D(`${year}-12-31`), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: String(year), name: String(year), startDate: D(`${year}-01-01`), endDate: D(`${year}-12-31`), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DAJ', name: 'Diario de Ajustamentos', journalType: 'ADJUSTMENT', sequencePrefix: 'AJ' } });

  const activo = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '1', name: 'Activo', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1 } });
  const inventory = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '131', name: 'Mercadorias', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, parentId: activo.id } });
  const proveitos = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '4', name: 'Proveitos', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1 } });
  const surplus = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '421', name: 'Excedentes de inventario', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 2, parentId: proveitos.id } });
  const custos = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '5', name: 'Custos e perdas', accountType: 'EXPENSE', normalBalance: 'DEBIT', level: 1 } });
  const shortage = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '551', name: 'Deficits de inventario', accountType: 'EXPENSE', normalBalance: 'DEBIT', level: 2, parentId: custos.id } });
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory.id },
      { companyId: CA, systemKey: 'INVENTORY_SURPLUS', ledgerAccountId: surplus.id },
      { companyId: CA, systemKey: 'INVENTORY_SHORTAGE', ledgerAccountId: shortage.id },
    ],
  });

  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem Contagens' } });
  const p1 = await prisma.product.create({ data: { companyId: CA, sku: 'S9-P1', name: 'Produto Um', avgCost: 10, salePrice: 20 } });
  const p2 = await prisma.product.create({ data: { companyId: CA, sku: 'S9-P2', name: 'Produto Dois', avgCost: 20, salePrice: 40 } });
  const p3 = await prisma.product.create({ data: { companyId: CA, sku: 'S9-P3', name: 'Produto Custo Zero', avgCost: 0, salePrice: 5 } });

  // Empresa B: armazem + produto mas SEM contabilidade (diario/mappings em falta).
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Contagens B' } });
  const warehouseB = await prisma.warehouse.create({ data: { companyId: CB, code: 'ARMB', name: 'Armazem B' } });
  const pB = await prisma.product.create({ data: { companyId: CB, sku: 'S9-PB', name: 'Produto B', avgCost: 7, salePrice: 15 } });
  await prisma.stockLevel.create({ data: { companyId: CB, productId: pB.id, warehouseId: warehouseB.id, quantity: 5 } });

  ids = { warehouse: warehouse.id, warehouseB: warehouseB.id, p1: p1.id, p2: p2.id, p3: p3.id, pB: pB.id };
}

/** Repoe o stock de um produto no armazem A (setup directo, fora do dominio). */
async function setStock(productId: string, quantity: number) {
  await prisma.stockLevel.upsert({
    where: { productId_warehouseId: { productId, warehouseId: ids.warehouse } },
    update: { quantity },
    create: { companyId: CA, productId, warehouseId: ids.warehouse, quantity },
  });
}

async function getLevel(productId: string): Promise<number> {
  const level = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId: ids.warehouse } } });
  return level?.quantity ?? 0;
}

async function countEffects(stockCountId: string) {
  const [movements, entries] = await Promise.all([
    prisma.stockMovement.findMany({ where: { companyId: CA, stockCountId }, orderBy: { createdAt: 'asc' } }),
    prisma.journalEntry.findMany({ where: { companyId: CA, sourceType: 'STOCK_COUNT', sourceId: stockCountId }, include: { lines: { orderBy: { lineNumber: 'asc' } } } }),
  ]);
  return { movements, entries };
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

describe('S9 — inventario em duas etapas', () => {
  it('#1 rascunho: zero efeitos em stock, movimentos e contabilidade; snapshot correcto', async () => {
    await setStock(ids.p1, 10);
    await setStock(ids.p2, 8);
    const { id, number } = await createStockCount(prisma, counter, {
      warehouseId: ids.warehouse,
      notes: 'Contagem de teste',
      lines: [
        { productId: ids.p1, countedQty: 12 },
        { productId: ids.p2, countedQty: 5 },
      ],
    });
    expect(number).toMatch(/^CI \d{4}\/0001$/);

    const count = await prisma.stockCount.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(count.status).toBe('DRAFT');
    expect(count.countedByName).toBe('Contador Smoke');
    const l1 = count.lines.find((l) => l.productId === ids.p1)!;
    expect(l1.systemQty).toBe(10);
    expect(l1.countedQty).toBe(12);
    expect(l1.appliedDiff).toBeNull();

    // Zero efeitos conferidos na BD.
    expect(await getLevel(ids.p1)).toBe(10);
    expect(await getLevel(ids.p2)).toBe(8);
    const fx = await countEffects(id);
    expect(fx.movements).toHaveLength(0);
    expect(fx.entries).toHaveLength(0);
    expect(await prisma.journalEntry.count({ where: { companyId: CA } })).toBe(0);
  });

  it('#2 permissoes: contar exige stock.view; validar exige stock.adjust', async () => {
    await expect(
      createStockCount(prisma, noView, { warehouseId: ids.warehouse, lines: [{ productId: ids.p1, countedQty: 1 }] }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const draft = await createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p1, countedQty: 10 }] });
    await expect(validateStockCount(prisma, counter, { stockCountId: draft.id })).rejects.toBeInstanceOf(ForbiddenError);
    await discardStockCount(prisma, counter, { stockCountId: draft.id, reason: 'Rascunho de teste de permissoes' });
  });

  it('#3 edicao refresca snapshots e substitui linhas; so rascunhos sao editaveis', async () => {
    await setStock(ids.p1, 10);
    const draft = await createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p1, countedQty: 9 }] });

    // Stock muda entre a gravacao e a edicao → o snapshot da edicao reflecte o novo valor.
    await setStock(ids.p1, 6);
    await updateStockCount(prisma, counter, {
      stockCountId: draft.id,
      lines: [
        { productId: ids.p1, countedQty: 7 },
        { productId: ids.p2, countedQty: 8 },
      ],
    });
    const count = await prisma.stockCount.findUniqueOrThrow({ where: { id: draft.id }, include: { lines: true } });
    expect(count.lines).toHaveLength(2);
    expect(count.lines.find((l) => l.productId === ids.p1)!.systemQty).toBe(6);
    expect(count.lines.find((l) => l.productId === ids.p1)!.countedQty).toBe(7);

    await discardStockCount(prisma, counter, { stockCountId: draft.id, reason: 'Limpeza do teste de edicao' });
    await expect(
      updateStockCount(prisma, counter, { stockCountId: draft.id, lines: [{ productId: ids.p1, countedQty: 1 }] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('#4 validacao: movimentos ADJUST + lancamento AJ balanceado (D131/C421 + D551/C131) ao custo medio', async () => {
    await setStock(ids.p1, 10); // contado 12 → excedente +2 @ 10 = 20
    await setStock(ids.p2, 8); //  contado 5 → deficit  −3 @ 20 = 60
    const draft = await createStockCount(prisma, counter, {
      warehouseId: ids.warehouse,
      lines: [
        { productId: ids.p1, countedQty: 12 },
        { productId: ids.p2, countedQty: 5 },
      ],
    });

    const result = await validateStockCount(prisma, validator, { stockCountId: draft.id }, { idempotencyKey: randomUUID() });
    expect(result.adjusted).toBe(2);
    expect(result.surplusValue).toBe(20);
    expect(result.shortageValue).toBe(60);
    expect(result.entryNumber).toMatch(/^AJ /);

    expect(await getLevel(ids.p1)).toBe(12);
    expect(await getLevel(ids.p2)).toBe(5);

    const fx = await countEffects(draft.id);
    expect(fx.movements).toHaveLength(2);
    const m1 = fx.movements.find((m) => m.productId === ids.p1)!;
    expect(m1.type).toBe('ADJUST');
    expect(m1.quantity).toBe(2);
    expect(m1.balanceAfter).toBe(12);
    expect(m1.document).toBe(result.number);
    const m2 = fx.movements.find((m) => m.productId === ids.p2)!;
    expect(m2.quantity).toBe(-3);
    expect(m2.balanceAfter).toBe(5);

    expect(fx.entries).toHaveLength(1);
    const entry = fx.entries[0]!;
    expect(entry.status).toBe('POSTED');
    expect(Number(entry.totalDebit)).toBe(80);
    expect(Number(entry.totalCredit)).toBe(80);
    const byAccount = new Map<string, { debit: number; credit: number }>();
    for (const l of entry.lines) {
      const acc = await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: l.ledgerAccountId } });
      const prev = byAccount.get(acc.code) ?? { debit: 0, credit: 0 };
      byAccount.set(acc.code, { debit: prev.debit + Number(l.debit), credit: prev.credit + Number(l.credit) });
    }
    expect(byAccount.get('131')).toEqual({ debit: 20, credit: 60 });
    expect(byAccount.get('421')).toEqual({ debit: 0, credit: 20 });
    expect(byAccount.get('551')).toEqual({ debit: 60, credit: 0 });

    // avgCost fica intacto nos dois sentidos.
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: ids.p1 } })).avgCost)).toBe(10);
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: ids.p2 } })).avgCost)).toBe(20);

    // Linhas com verdade historica da validacao.
    const lines = await prisma.stockCountLine.findMany({ where: { stockCountId: draft.id } });
    const lp2 = lines.find((l) => l.productId === ids.p2)!;
    expect(lp2.appliedDiff).toBe(-3);
    expect(Number(lp2.appliedUnitCost)).toBe(20);
    expect(Number(lp2.appliedValue)).toBe(-60);

    const count = await prisma.stockCount.findUniqueOrThrow({ where: { id: draft.id } });
    expect(count.status).toBe('VALIDATED');
    expect(count.validatedByName).toBe('Validador Smoke');
    expect(count.journalEntryId).toBe(entry.id);
  });

  it('#5 idempotencia: replay com a mesma chave nao duplica; revalidar sem chave falha', async () => {
    await setStock(ids.p1, 10);
    const draft = await createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p1, countedQty: 11 }] });
    const key = randomUUID();
    const first = await validateStockCount(prisma, validator, { stockCountId: draft.id }, { idempotencyKey: key });
    const movementsBefore = await prisma.stockMovement.count({ where: { companyId: CA, stockCountId: draft.id } });
    const entriesBefore = await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'STOCK_COUNT', sourceId: draft.id } });

    const replay = await validateStockCount(prisma, validator, { stockCountId: draft.id }, { idempotencyKey: key });
    expect(replay).toEqual(first);
    expect(await prisma.stockMovement.count({ where: { companyId: CA, stockCountId: draft.id } })).toBe(movementsBefore);
    expect(await prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'STOCK_COUNT', sourceId: draft.id } })).toBe(entriesBefore);
    expect(await getLevel(ids.p1)).toBe(11);

    await expect(validateStockCount(prisma, validator, { stockCountId: draft.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(validateStockCount(prisma, validator, { stockCountId: draft.id }, { idempotencyKey: randomUUID() })).rejects.toBeInstanceOf(ConflictError);
    expect(await getLevel(ids.p1)).toBe(11);
  });

  it('#6 concorrencia: stock mudou apos a contagem → delta aplicado sobre o stock corrente', async () => {
    await setStock(ids.p1, 10);
    const draft = await createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p1, countedQty: 8 }] });
    // "Venda" de 3 unidades entre a contagem e a validacao (10 → 7).
    await setStock(ids.p1, 7);

    const result = await validateStockCount(prisma, validator, { stockCountId: draft.id }, { idempotencyKey: randomUUID() });
    expect(result.adjusted).toBe(1);
    // diff = 8 − 10 = −2 aplicado sobre 7 → 5 (fisico: 8 contados − 3 vendidos).
    expect(await getLevel(ids.p1)).toBe(5);
    const fx = await countEffects(draft.id);
    expect(fx.movements).toHaveLength(1);
    expect(fx.movements[0]!.quantity).toBe(-2);
    expect(fx.movements[0]!.balanceAfter).toBe(5);
  });

  it('#7 concorrencia: produto vendido abaixo do contado → validacao falha por inteiro (rollback)', async () => {
    await setStock(ids.p1, 10);
    await setStock(ids.p2, 6);
    const draft = await createStockCount(prisma, counter, {
      warehouseId: ids.warehouse,
      lines: [
        { productId: ids.p1, countedQty: 8 }, // diff −2
        { productId: ids.p2, countedQty: 7 }, // diff +1 (linha valida — mas nada pode ser aplicado)
      ],
    });
    // Vendem-se 9 unidades do P1 (10 → 1); aplicar −2 daria −1.
    await setStock(ids.p1, 1);

    await expect(validateStockCount(prisma, validator, { stockCountId: draft.id }, { idempotencyKey: randomUUID() })).rejects.toThrow(/negativ/);
    // Nada foi aplicado: stock, movimentos, lancamentos e estado intactos.
    expect(await getLevel(ids.p1)).toBe(1);
    expect(await getLevel(ids.p2)).toBe(6);
    const fx = await countEffects(draft.id);
    expect(fx.movements).toHaveLength(0);
    expect(fx.entries).toHaveLength(0);
    expect((await prisma.stockCount.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('DRAFT');

    // Recuperacao: editar refresca o snapshot (systemQty 1) e a validacao passa.
    await updateStockCount(prisma, counter, { stockCountId: draft.id, lines: [{ productId: ids.p1, countedQty: 0 }] });
    const result = await validateStockCount(prisma, validator, { stockCountId: draft.id }, { idempotencyKey: randomUUID() });
    expect(result.adjusted).toBe(1);
    expect(await getLevel(ids.p1)).toBe(0);
  });

  it('#8 contagem sem diferencas valida sem movimentos nem lancamento', async () => {
    await setStock(ids.p1, 4);
    const draft = await createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p1, countedQty: 4 }] });
    const result = await validateStockCount(prisma, validator, { stockCountId: draft.id }, { idempotencyKey: randomUUID() });
    expect(result.adjusted).toBe(0);
    expect(result.entryId).toBeNull();
    const fx = await countEffects(draft.id);
    expect(fx.movements).toHaveLength(0);
    expect(fx.entries).toHaveLength(0);
    const count = await prisma.stockCount.findUniqueOrThrow({ where: { id: draft.id }, include: { lines: true } });
    expect(count.status).toBe('VALIDATED');
    expect(count.lines[0]!.appliedDiff).toBe(0);
  });

  it('#9 excedente com custo medio 0: movimento sim, lancamento nao', async () => {
    await setStock(ids.p3, 0);
    const draft = await createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p3, countedQty: 5 }] });
    const result = await validateStockCount(prisma, validator, { stockCountId: draft.id }, { idempotencyKey: randomUUID() });
    expect(result.adjusted).toBe(1);
    expect(result.surplusValue).toBe(0);
    expect(result.entryId).toBeNull();
    expect(await getLevel(ids.p3)).toBe(5);
    const fx = await countEffects(draft.id);
    expect(fx.movements).toHaveLength(1);
    expect(fx.entries).toHaveLength(0);
  });

  it('#10 descarte: motivo obrigatorio (≥ 10), terminal, nunca apagado; descartada nao valida', async () => {
    const draft = await createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p1, countedQty: 3 }] });
    await expect(discardStockCount(prisma, counter, { stockCountId: draft.id, reason: 'curto' })).rejects.toBeInstanceOf(ValidationError);

    await discardStockCount(prisma, counter, { stockCountId: draft.id, reason: 'Contagem duplicada por engano' });
    const count = await prisma.stockCount.findUniqueOrThrow({ where: { id: draft.id } });
    expect(count.status).toBe('DISCARDED');
    expect(count.discardReason).toBe('Contagem duplicada por engano');
    expect(count.discardedByName).toBe('Contador Smoke');
    expect(count.discardedAt).not.toBeNull();

    await expect(validateStockCount(prisma, validator, { stockCountId: draft.id }, { idempotencyKey: randomUUID() })).rejects.toBeInstanceOf(ConflictError);
    await expect(discardStockCount(prisma, counter, { stockCountId: draft.id, reason: 'Segunda tentativa de descarte' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('#11 mapping/diario em falta: validacao falha por inteiro e nada e aplicado (sem fallback)', async () => {
    const draft = await createStockCount(prisma, bFull, { warehouseId: ids.warehouseB, lines: [{ productId: ids.pB, countedQty: 9 }] });
    await expect(validateStockCount(prisma, bFull, { stockCountId: draft.id }, { idempotencyKey: randomUUID() })).rejects.toBeInstanceOf(ValidationError);
    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: ids.pB, warehouseId: ids.warehouseB } } });
    expect(level.quantity).toBe(5);
    expect(await prisma.stockMovement.count({ where: { companyId: CB } })).toBe(0);
    expect((await prisma.stockCount.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('DRAFT');
  });

  it('#12 isolamento A/B: empresa B nao ve nem valida contagens de A; linhas nao aceitam produtos de outra empresa', async () => {
    const draft = await createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p1, countedQty: 2 }] });

    await expect(getStockCount(forCompany(CB), bFull, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(validateStockCount(prisma, bFull, { stockCountId: draft.id }, { idempotencyKey: randomUUID() })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateStockCount(prisma, bFull, { stockCountId: draft.id, lines: [{ productId: ids.pB, countedQty: 1 }] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(discardStockCount(prisma, bFull, { stockCountId: draft.id, reason: 'Tentativa de outra empresa' })).rejects.toBeInstanceOf(NotFoundError);

    // Produto de B numa contagem de A → NotFound (linha de outra empresa).
    await expect(
      createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.pB, countedQty: 1 }] }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const listB = await listStockCounts(forCompany(CB), bFull);
    expect(listB.every((c) => c.id !== draft.id)).toBe(true);

    await discardStockCount(prisma, counter, { stockCountId: draft.id, reason: 'Limpeza do teste de isolamento' });
  });

  it('#13 numeracao CI sequencial por empresa e produto duplicado na mesma contagem rejeitado', async () => {
    const a = await createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p1, countedQty: 1 }] });
    const b = await createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p1, countedQty: 1 }] });
    const seq = (n: string) => Number(n.slice(-4));
    expect(seq(b.number)).toBe(seq(a.number) + 1);

    await expect(
      createStockCount(prisma, counter, {
        warehouseId: ids.warehouse,
        lines: [
          { productId: ids.p1, countedQty: 1 },
          { productId: ids.p1, countedQty: 2 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await discardStockCount(prisma, counter, { stockCountId: a.id, reason: 'Limpeza do teste de numeracao' });
    await discardStockCount(prisma, counter, { stockCountId: b.id, reason: 'Limpeza do teste de numeracao' });
  });

  it('#14 idempotencia da criacao: replay com a mesma chave devolve a mesma contagem', async () => {
    const key = randomUUID();
    const input = { warehouseId: ids.warehouse, lines: [{ productId: ids.p2, countedQty: 5 }] };
    const first = await createStockCount(prisma, counter, input, { idempotencyKey: key });
    const replay = await createStockCount(prisma, counter, input, { idempotencyKey: key });
    expect(replay).toEqual(first);
    expect(await prisma.stockCount.count({ where: { companyId: CA, number: first.number } })).toBe(1);

    // Mesma chave com payload diferente → conflito.
    await expect(
      createStockCount(prisma, counter, { warehouseId: ids.warehouse, lines: [{ productId: ids.p2, countedQty: 6 }] }, { idempotencyKey: key }),
    ).rejects.toBeInstanceOf(ConflictError);
    await discardStockCount(prisma, counter, { stockCountId: first.id, reason: 'Limpeza do teste de idempotencia' });
  });
});
