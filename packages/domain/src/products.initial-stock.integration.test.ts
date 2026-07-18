/**
 * Suite de INTEGRACAO da Sessao S8 — criacao de produto com stock inicial.
 * Correr com: `pnpm test:integration:products:initial-stock` (exige DATABASE_URL).
 *
 * Cobre: criacao sem stock inicial com zero efeitos, custo unitario obrigatorio
 * com quantidade > 0, avgCost = custo informado (primeira entrada define o custo
 * medio) e evolucao ponderada com recepcao posterior, movimento IN + StockLevel +
 * lancamento de abertura D 131 / C 312 no diario OPENING, falha clara sem mapping
 * (sem fallback), idempotencia com scope PRODUCT_CREATE e isolamento A/B.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { createProduct } from './products';
import { approvePurchaseOrder, createPurchaseOrder, receivePurchaseOrder } from './purchases';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-prod-initial';
const CB = 'smoke-prod-initial-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[], userId = `${companyId}-user`): RequestContext {
  return { companyId, userId, permissions: new Set(permissions), isPlatformAdmin: false };
}

const creator = ctx(CA, ['products.create', 'purchases.create', 'purchases.approve']);
const noCreate = ctx(CA, ['stock.view']);
const creatorB = ctx(CB, ['products.create']);

interface Ids {
  warehouse: string;
  warehouseB: string;
  supplier: string;
  inventoryAccount: string;
  openingAccount: string;
}

let ids!: Ids;
let skuSeq = 0;

function nextSku(): string {
  skuSeq += 1;
  return `S8-${String(skuSeq).padStart(3, '0')}`;
}

function baseInput(sku: string) {
  return { sku, name: `Produto ${sku}`, unit: 'un', salePrice: 100, avgCost: 5, taxRate: 16, minStock: 0 };
}

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.journalEntryLine.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { companyId } });
  await prisma.purchaseReceiptItem.deleteMany({ where: { companyId } });
  await prisma.purchaseReceipt.deleteMany({ where: { companyId } });
  await prisma.purchaseOrderLine.deleteMany({ where: { companyId } });
  await prisma.purchaseOrder.deleteMany({ where: { companyId } });
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
  await prisma.supplier.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Produto Stock Inicial' } });
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN', isCurrent: true } });
  await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: '2026', name: '2026', startDate: D('2026-01-01'), endDate: D('2026-12-31'), status: 'OPEN' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DAB', name: 'Diario de Abertura', journalType: 'OPENING', sequencePrefix: 'AB' } });
  await prisma.accountingJournal.create({ data: { companyId: CA, code: 'DC', name: 'Compras', journalType: 'PURCHASES', sequencePrefix: 'LC' } });

  const activo = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '1', name: 'Activo', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1 } });
  const inventory = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '131', name: 'Mercadorias', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, parentId: activo.id } });
  const vatInput = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '141', name: 'IVA dedutivel', accountType: 'ASSET', normalBalance: 'DEBIT', level: 2, parentId: activo.id } });
  const payable = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '211', name: 'Fornecedores', accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 1 } });
  const capital = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '3', name: 'Capital proprio', accountType: 'EQUITY', normalBalance: 'CREDIT', level: 1 } });
  const opening = await prisma.ledgerAccount.create({ data: { companyId: CA, code: '312', name: 'Regularizacao de abertura de existencias', accountType: 'EQUITY', normalBalance: 'CREDIT', level: 2, parentId: capital.id } });
  await prisma.accountingMapping.createMany({
    data: [
      { companyId: CA, systemKey: 'INVENTORY', ledgerAccountId: inventory.id },
      { companyId: CA, systemKey: 'VAT_INPUT', ledgerAccountId: vatInput.id },
      { companyId: CA, systemKey: 'ACCOUNTS_PAYABLE', ledgerAccountId: payable.id },
      { companyId: CA, systemKey: 'OPENING_BALANCE_EQUITY', ledgerAccountId: opening.id },
    ],
  });

  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'ARM', name: 'Armazem Principal' } });
  const supplier = await prisma.supplier.create({ data: { companyId: CA, name: 'Fornecedor Stock Inicial' } });

  // Empresa B: armazem proprio mas SEM contabilidade provisionada (testa mapping em falta).
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Produto Stock Inicial B' } });
  const warehouseB = await prisma.warehouse.create({ data: { companyId: CB, code: 'ARMB', name: 'Armazem B' } });

  ids = { warehouse: warehouse.id, warehouseB: warehouseB.id, supplier: supplier.id, inventoryAccount: inventory.id, openingAccount: opening.id };
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

async function effects(productId: string) {
  const [levels, movements, entries] = await Promise.all([
    prisma.stockLevel.findMany({ where: { companyId: CA, productId } }),
    prisma.stockMovement.findMany({ where: { companyId: CA, productId } }),
    prisma.journalEntry.findMany({ where: { companyId: CA, sourceType: 'PRODUCT', sourceId: productId }, include: { lines: { orderBy: { lineNumber: 'asc' } } } }),
  ]);
  return { levels, movements, entries };
}

describe('S8 — criacao de produto com stock inicial', () => {
  it('#1 sem stock inicial: produto criado como hoje, zero efeitos em stock/contabilidade', async () => {
    const sku = nextSku();
    const { id, initialStock } = await createProduct(prisma, creator, baseInput(sku));
    expect(initialStock).toBeUndefined();
    const product = await prisma.product.findUniqueOrThrow({ where: { id } });
    expect(Number(product.avgCost)).toBe(5);
    const fx = await effects(id);
    expect(fx.levels).toHaveLength(0);
    expect(fx.movements).toHaveLength(0);
    expect(fx.entries).toHaveLength(0);
  });

  it('#2 quantidade > 0 sem custo unitario e rejeitada sem criar nada', async () => {
    const sku = nextSku();
    await expect(
      createProduct(prisma, creator, baseInput(sku), { initialStock: { quantity: 5, unitCost: 0, warehouseId: ids.warehouse } }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.product.findFirst({ where: { companyId: CA, sku } })).toBeNull();
  });

  it('#3 quantidade > 0 sem armazem e rejeitada; quantidade nao inteira/negativa tambem', async () => {
    const sku = nextSku();
    await expect(
      createProduct(prisma, creator, baseInput(sku), { initialStock: { quantity: 5, unitCost: 10, warehouseId: '' } }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createProduct(prisma, creator, baseInput(sku), { initialStock: { quantity: 2.5, unitCost: 10, warehouseId: ids.warehouse } }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createProduct(prisma, creator, baseInput(sku), { initialStock: { quantity: -3, unitCost: 10, warehouseId: ids.warehouse } }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.product.findFirst({ where: { companyId: CA, sku } })).toBeNull();
  });

  it('#4 com stock inicial: StockLevel, StockMovement IN, avgCost = custo informado e lancamento D 131 / C 312 no diario de Abertura', async () => {
    const sku = nextSku();
    const { id, initialStock } = await createProduct(prisma, creator, baseInput(sku), {
      initialStock: { quantity: 10, unitCost: 12.5, warehouseId: ids.warehouse },
    });
    expect(initialStock).toBeDefined();
    expect(initialStock!.value).toBe(125);

    const product = await prisma.product.findUniqueOrThrow({ where: { id } });
    // Primeira entrada define o custo medio: substitui o custo de catalogo (5).
    expect(Number(product.avgCost)).toBe(12.5);

    const fx = await effects(id);
    expect(fx.levels).toHaveLength(1);
    expect(fx.levels[0]!.warehouseId).toBe(ids.warehouse);
    expect(fx.levels[0]!.quantity).toBe(10);

    expect(fx.movements).toHaveLength(1);
    const movement = fx.movements[0]!;
    expect(movement.type).toBe('IN');
    expect(movement.quantity).toBe(10);
    expect(movement.balanceAfter).toBe(10);
    expect(movement.document).toBe('Stock inicial');
    expect(movement.invoiceId).toBeNull();
    expect(movement.purchaseReceiptId).toBeNull();

    expect(fx.entries).toHaveLength(1);
    const entry = fx.entries[0]!;
    expect(entry.accountingEvent).toBe('PRODUCT_OPENING_STOCK');
    expect(entry.status).toBe('POSTED');
    expect(entry.entryNumber.startsWith('AB ')).toBe(true);
    expect(Number(entry.totalDebit)).toBe(125);
    expect(Number(entry.totalCredit)).toBe(125);
    expect(entry.lines).toHaveLength(2);
    const debit = entry.lines.find((l) => Number(l.debit) > 0)!;
    const credit = entry.lines.find((l) => Number(l.credit) > 0)!;
    expect(debit.ledgerAccountId).toBe(ids.inventoryAccount);
    expect(Number(debit.debit)).toBe(125);
    expect(credit.ledgerAccountId).toBe(ids.openingAccount);
    expect(Number(credit.credit)).toBe(125);

    const audit = await prisma.auditLog.findFirst({ where: { companyId: CA, action: 'product.initial_stock', entityId: id } });
    expect(audit).not.toBeNull();
  });

  it('#5 valor com arredondamento a 2 casas: 3 x 33.335 -> 100.01', async () => {
    const sku = nextSku();
    const { id, initialStock } = await createProduct(prisma, creator, baseInput(sku), {
      initialStock: { quantity: 3, unitCost: 33.335, warehouseId: ids.warehouse },
    });
    // round2(33.335) = 33.34 por unidade; 3 x 33.34 = 100.02 — um unico calculo para avgCost e lancamento.
    expect(initialStock!.unitCost).toBe(33.34);
    expect(initialStock!.value).toBe(100.02);
    const product = await prisma.product.findUniqueOrThrow({ where: { id } });
    expect(Number(product.avgCost)).toBe(33.34);
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: CA, sourceType: 'PRODUCT', sourceId: id } });
    expect(Number(entry.totalDebit)).toBe(100.02);
  });

  it('#6 idempotencia PRODUCT_CREATE: replay com a mesma chave devolve o mesmo produto sem duplicar efeitos', async () => {
    const sku = nextSku();
    const key = randomUUID();
    const options = { idempotencyKey: key, initialStock: { quantity: 4, unitCost: 20, warehouseId: ids.warehouse } };
    const first = await createProduct(prisma, creator, baseInput(sku), options);
    const replay = await createProduct(prisma, creator, baseInput(sku), options);
    expect(replay.id).toBe(first.id);
    expect(replay.initialStock?.movementId).toBe(first.initialStock?.movementId);
    expect(replay.initialStock?.entryId).toBe(first.initialStock?.entryId);

    const fx = await effects(first.id);
    expect(fx.movements).toHaveLength(1);
    expect(fx.entries).toHaveLength(1);
    expect(fx.levels[0]!.quantity).toBe(4);
    expect(await prisma.product.count({ where: { companyId: CA, sku } })).toBe(1);

    // Mesma chave com payload economicamente diferente e conflito de integridade.
    await expect(
      createProduct(prisma, creator, baseInput(sku), { idempotencyKey: key, initialStock: { quantity: 9, unitCost: 20, warehouseId: ids.warehouse } }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('#7 custo medio evolui de forma ponderada com recepcao de compra posterior', async () => {
    const sku = nextSku();
    const { id } = await createProduct(prisma, creator, baseInput(sku), {
      initialStock: { quantity: 10, unitCost: 10, warehouseId: ids.warehouse },
    });
    const po = await createPurchaseOrder(prisma, creator, {
      supplierId: ids.supplier,
      warehouseId: ids.warehouse,
      lines: [{ productId: id, quantity: 10, unitCost: 20 }],
    });
    await approvePurchaseOrder(prisma, creator, po.id);
    const lines = await prisma.purchaseOrderLine.findMany({ where: { companyId: CA, orderId: po.id } });
    await receivePurchaseOrder(prisma, creator, po.id, [{ lineId: lines[0]!.id, quantity: 10 }], { idempotencyKey: randomUUID() });

    const product = await prisma.product.findUniqueOrThrow({ where: { id } });
    // (10 x 10 + 10 x 20) / 20 = 15 — o stock inicial e uma entrada normal do weighted-average.
    expect(Number(product.avgCost)).toBe(15);
    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { productId_warehouseId: { productId: id, warehouseId: ids.warehouse } } });
    expect(level.quantity).toBe(20);
  });

  it('#8 sem permissao products.create e rejeitado', async () => {
    await expect(
      createProduct(prisma, noCreate, baseInput(nextSku()), { initialStock: { quantity: 1, unitCost: 1, warehouseId: ids.warehouse } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('#9 mapping em falta: falha clara e rollback total (sem conta de fallback, produto nao fica criado)', async () => {
    const sku = nextSku();
    await expect(
      createProduct(prisma, creatorB, baseInput(sku), { initialStock: { quantity: 5, unitCost: 10, warehouseId: ids.warehouseB } }),
    ).rejects.toThrowError(/mapping contabil/i);
    expect(await prisma.product.findFirst({ where: { companyId: CB, sku } })).toBeNull();
    expect(await prisma.stockMovement.count({ where: { companyId: CB } })).toBe(0);
    expect(await prisma.journalEntry.count({ where: { companyId: CB } })).toBe(0);
  });

  it('#10 isolamento A/B: armazem de outra empresa nao serve de destino e nada e criado', async () => {
    const sku = nextSku();
    await expect(
      createProduct(prisma, creatorB, baseInput(sku), { initialStock: { quantity: 5, unitCost: 10, warehouseId: ids.warehouse } }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await prisma.product.findFirst({ where: { companyId: CB, sku } })).toBeNull();
    expect(await prisma.stockLevel.count({ where: { companyId: CB } })).toBe(0);
  });
});
