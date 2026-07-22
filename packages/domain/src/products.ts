import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import { round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';
import { getMappedAccountTx } from './accounting';
import { postAccountingEventTx } from './accounting-events';
import {
  FINGERPRINT_VERSION,
  canonicalRequestFingerprint,
  fpAmount,
  fpInt,
  runIdempotentOperation,
} from './operation-idempotency';

export type StockStatus = 'ok' | 'low' | 'out';

export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  unit: string;
  salePrice: number;
  avgCost: number;
  minStock: number;
  stock: number;
  status: 'ACTIVE' | 'INACTIVE';
  stockStatus: StockStatus;
}

export interface WarehouseStock {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
}

export interface ProductDetail extends ProductListItem {
  avgCost: number;
  taxRate: number;
  barcode: string | null;
  notes: string | null;
  createdAt: Date;
  byWarehouse: WarehouseStock[];
}

export interface ProductKpis {
  total: number;
  stockUnits: number;
  /** Valor do stock a preço de venda (MZN). */
  stockValue: number;
  lowCount: number;
  outCount: number;
}

/** Estado de stock: <= 0 esgotado · <= mínimo baixo · caso contrário ok. */
export function stockStatusOf(stock: number, minStock: number): StockStatus {
  if (stock <= 0) return 'out';
  if (stock <= minStock) return 'low';
  return 'ok';
}

type ProductWithLevels = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  unit: string;
  salePrice: unknown;
  avgCost: unknown;
  minStock: number;
  status: 'ACTIVE' | 'INACTIVE';
  stockLevels: { quantity: number }[];
};

function toListItem(p: ProductWithLevels): ProductListItem {
  const stock = p.stockLevels.reduce((a, l) => a + l.quantity, 0);
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    brand: p.brand,
    unit: p.unit,
    salePrice: Number(p.salePrice),
    avgCost: Number(p.avgCost),
    minStock: p.minStock,
    stock,
    status: p.status,
    stockStatus: stockStatusOf(stock, p.minStock),
  };
}

// ─────────────────────────── Leituras ───────────────────────────

/** Lista os produtos da empresa activa com stock agregado (todos os armazéns). */
export async function listProducts(db: PrismaClient, ctx: RequestContext): Promise<ProductListItem[]> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const rows = await db.product.findMany({
    orderBy: { name: 'asc' },
    include: { stockLevels: { select: { quantity: true } } },
  });
  return rows.map(toListItem);
}

export interface ProductPage {
  items: ProductListItem[];
  /** Total de produtos que correspondem ao filtro (para paginação). */
  total: number;
}

/**
 * Página da listagem de produtos com pesquisa server-side por nome/SKU/categoria/marca.
 * `take` fica limitado a 100 e `skip` nunca é negativo — a tabela inteira nunca é devolvida.
 */
export async function listProductsPage(
  db: PrismaClient,
  ctx: RequestContext,
  params: { query?: string; take: number; skip?: number },
): Promise<ProductPage> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const take = Math.min(Math.max(Math.trunc(params.take), 1), 100);
  const skip = Math.max(Math.trunc(params.skip ?? 0), 0);
  const query = params.query?.trim();
  // Produtos desactivados ficam fora do catálogo (histórico de documentos mantém-nos).
  const where: Prisma.ProductWhereInput = query
    ? {
        status: 'ACTIVE',
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { category: { contains: query, mode: 'insensitive' } },
          { brand: { contains: query, mode: 'insensitive' } },
        ],
      }
    : { status: 'ACTIVE' };
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { name: 'asc' },
      take,
      skip,
      include: { stockLevels: { select: { quantity: true } } },
    }),
  ]);
  return { items: rows.map(toListItem), total };
}

export interface ProductSearchOption {
  id: string;
  sku: string;
  name: string;
  salePrice: number;
  avgCost: number;
  /** Stock agregado de todos os armazéns. */
  stock: number;
}

/**
 * Pesquisa leve de produtos por nome/SKU para dropdowns pesquisáveis (máx. `take`).
 * `ids` resolve labels de valores já seleccionados.
 */
export async function searchProductOptions(
  db: PrismaClient,
  ctx: RequestContext,
  params: { query?: string; ids?: string[]; take?: number } = {},
): Promise<ProductSearchOption[]> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const take = Math.min(Math.max(params.take ?? 20, 1), 50);
  const query = params.query?.trim();
  const where: Prisma.ProductWhereInput = {};
  if (params.ids?.length) {
    // Por ids não se filtra o estado: documentos existentes podem referir produtos
    // entretanto desactivados e precisam de resolver o label na mesma.
    where.id = { in: params.ids };
  } else {
    where.status = 'ACTIVE';
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
      ];
    }
  }
  const rows = await db.product.findMany({
    where,
    orderBy: { name: 'asc' },
    take,
    select: { id: true, sku: true, name: true, salePrice: true, avgCost: true, stockLevels: { select: { quantity: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    salePrice: Number(p.salePrice),
    avgCost: Number(p.avgCost),
    stock: p.stockLevels.reduce((a, l) => a + l.quantity, 0),
  }));
}

/** Detalhe de um produto (por id ou SKU) com stock por armazém. */
export async function getProduct(db: PrismaClient, ctx: RequestContext, idOrSku: string): Promise<ProductDetail> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const p = await db.product.findFirst({
    where: { OR: [{ id: idOrSku }, { sku: idOrSku }] },
    include: {
      stockLevels: { include: { warehouse: { select: { id: true, code: true, name: true } } } },
    },
  });
  if (!p) throw new NotFoundError('Produto não encontrado.');
  const byWarehouse: WarehouseStock[] = p.stockLevels.map((l) => ({
    warehouseId: l.warehouse.id,
    warehouseCode: l.warehouse.code,
    warehouseName: l.warehouse.name,
    quantity: l.quantity,
  }));
  const base = toListItem({ ...p, stockLevels: p.stockLevels.map((l) => ({ quantity: l.quantity })) });
  return {
    ...base,
    avgCost: Number(p.avgCost),
    taxRate: Number(p.taxRate),
    barcode: p.barcode,
    notes: p.notes,
    createdAt: p.createdAt,
    byWarehouse,
  };
}

/** Indicadores de topo do módulo de produtos. */
export async function productKpis(db: PrismaClient, ctx: RequestContext): Promise<ProductKpis> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const rows = await db.product.findMany({
    where: { status: 'ACTIVE' },
    select: { salePrice: true, minStock: true, stockLevels: { select: { quantity: true } } },
  });
  let stockUnits = 0;
  let stockValue = 0;
  let lowCount = 0;
  let outCount = 0;
  for (const p of rows) {
    const stock = p.stockLevels.reduce((a, l) => a + l.quantity, 0);
    stockUnits += stock;
    stockValue += stock * Number(p.salePrice);
    const st = stockStatusOf(stock, p.minStock);
    if (st === 'out') outCount += 1;
    else if (st === 'low') lowCount += 1;
  }
  return { total: rows.length, stockUnits, stockValue, lowCount, outCount };
}

// ─────────────────────────── Mutações ───────────────────────────

function emptyToNull(schema: z.ZodString) {
  return schema.transform((s) => (s === '' ? null : s)).nullish();
}

const productInput = z.object({
  sku: z.string().trim().min(1, 'O SKU é obrigatório.').max(40),
  name: z.string().trim().min(1, 'O nome é obrigatório.').max(160),
  category: emptyToNull(z.string().trim().max(80)),
  brand: emptyToNull(z.string().trim().max(80)),
  unit: z.string().trim().min(1).max(12).default('un'),
  salePrice: z.coerce.number().min(0, 'O preço não pode ser negativo.').default(0),
  avgCost: z.coerce.number().min(0, 'O custo não pode ser negativo.').default(0),
  taxRate: z.coerce.number().min(0).max(100).default(16),
  minStock: z.coerce.number().int().min(0).default(0),
  barcode: emptyToNull(z.string().trim().max(40)),
  notes: emptyToNull(z.string().trim().max(1000)),
});

export type ProductInput = z.input<typeof productInput>;

/**
 * Stock inicial opcional na CRIAÇÃO do produto (S8). Os três campos são
 * obrigatórios em conjunto: a quantidade exige custo unitário > 0 (senão o
 * custo médio ponderado nasce errado ou a zero) e o armazém de destino.
 */
const initialStockInput = z.object({
  quantity: z.coerce
    .number({ invalid_type_error: 'Quantidade inicial inválida.' })
    .int('A quantidade inicial tem de ser um número inteiro.')
    .positive('A quantidade inicial tem de ser maior que zero.'),
  unitCost: z.coerce
    .number({ invalid_type_error: 'Custo unitário inicial inválido.' })
    .positive('Com quantidade inicial, o custo unitário inicial é obrigatório e tem de ser maior que zero.'),
  warehouseId: z.string().min(1, 'Com quantidade inicial, seleccione o armazém de destino.'),
});

export type InitialStockInput = z.input<typeof initialStockInput>;

export interface CreateProductOptions {
  /** Stock inicial (apenas na criação; produto existente é âmbito da S9). */
  initialStock?: InitialStockInput;
  /** Chave estável por tentativa; quando presente activa idempotência operacional. */
  idempotencyKey?: string;
}

export interface CreateProductResult {
  id: string;
  /** Presente apenas quando foi registado stock inicial. */
  initialStock?: {
    movementId: string;
    entryId: string;
    entryNumber: string;
    quantity: number;
    unitCost: number;
    value: number;
  };
}

function parseInput(input: ProductInput) {
  const parsed = productInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return parsed.data;
}

function createProductFingerprint(
  companyId: string,
  data: ReturnType<typeof parseInput>,
  initialStock: z.output<typeof initialStockInput> | null,
): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    sku: data.sku,
    name: data.name,
    category: data.category ?? null,
    brand: data.brand ?? null,
    unit: data.unit,
    salePrice: fpAmount(data.salePrice),
    avgCost: fpAmount(data.avgCost),
    taxRate: fpAmount(data.taxRate),
    minStock: fpInt(data.minStock),
    barcode: data.barcode ?? null,
    notes: data.notes ?? null,
    initialStock: initialStock
      ? { quantity: fpInt(initialStock.quantity), unitCost: fpAmount(initialStock.unitCost), warehouseId: initialStock.warehouseId }
      : null,
  });
}

/**
 * Cria um produto na empresa activa. SKU único por empresa.
 *
 * Com `options.initialStock` (S8), a MESMA transacção regista a entrada como
 * movimento de stock normal (`StockMovement IN`, nunca escrita directa da
 * quantidade), inicializa o custo médio pela fórmula ponderada (stock anterior
 * é zero ⇒ avgCost = custo unitário informado) e lança a abertura na
 * contabilidade: D 131 Existências (`INVENTORY`) / C capital próprio de
 * abertura (`OPENING_BALANCE_EQUITY`), diário de Abertura, sem IVA — o stock
 * inicial não tem fornecedor. Se um dos mappings não existir, a operação
 * falha por inteiro com mensagem clara (sem conta de fallback).
 */
export async function createProduct(
  db: PrismaClient,
  ctx: RequestContext,
  input: ProductInput,
  options: CreateProductOptions = {},
): Promise<CreateProductResult> {
  requirePermission(ctx, 'products.create');
  const companyId = requireCompany(ctx);
  const data = parseInput(input);

  let initialStock: z.output<typeof initialStockInput> | null = null;
  if (options.initialStock) {
    const parsed = initialStockInput.safeParse(options.initialStock);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Stock inicial inválido.');
    initialStock = parsed.data;
  }
  // Um único cálculo, usado no avgCost, no movimento e no lançamento.
  const unitCost = initialStock ? round2(initialStock.unitCost) : null;
  const openingValue = initialStock && unitCost !== null ? round2(initialStock.quantity * unitCost) : null;
  const requestFingerprint = createProductFingerprint(companyId, data, initialStock);

  return db.$transaction(async (tx) => {
    const runCreate = async (): Promise<{ resourceType: string; resourceId: string; result: CreateProductResult }> => {
      const dup = await tx.product.findFirst({ where: { sku: data.sku, companyId } });
      if (dup) throw new ConflictError('Já existe um produto com este SKU.');

      const created = await tx.product.create({
        data: {
          companyId,
          sku: data.sku,
          name: data.name,
          category: data.category ?? null,
          brand: data.brand ?? null,
          unit: data.unit,
          salePrice: data.salePrice,
          // Primeira entrada define o custo médio: com stock inicial, o custo
          // unitário informado substitui o custo de catálogo do formulário.
          avgCost: unitCost ?? data.avgCost,
          taxRate: data.taxRate,
          minStock: data.minStock,
          barcode: data.barcode ?? null,
          notes: data.notes ?? null,
          createdBy: ctx.userId,
        } as Prisma.ProductUncheckedCreateInput,
      });

      if (!initialStock || unitCost === null || openingValue === null) {
        return { resourceType: 'Product', resourceId: created.id, result: { id: created.id } };
      }

      const warehouse = await tx.warehouse.findFirst({ where: { id: initialStock.warehouseId, companyId, status: 'ACTIVE' } });
      if (!warehouse) throw new NotFoundError('Armazém de destino do stock inicial não encontrado ou inactivo.');
      if (openingValue <= 0) throw new ValidationError('O valor do stock inicial tem de ser maior que zero.');

      await tx.stockLevel.upsert({
        where: { productId_warehouseId: { productId: created.id, warehouseId: warehouse.id } },
        update: { quantity: initialStock.quantity },
        create: { companyId, productId: created.id, warehouseId: warehouse.id, quantity: initialStock.quantity },
      });
      const movement = await tx.stockMovement.create({
        data: {
          companyId,
          productId: created.id,
          warehouseId: warehouse.id,
          type: 'IN',
          quantity: initialStock.quantity,
          balanceAfter: initialStock.quantity,
          document: 'Stock inicial',
          reason: `Stock inicial na criação do produto ${data.sku}`,
          createdBy: ctx.userId,
        },
      });

      const inventory = await getMappedAccountTx(tx, companyId, 'INVENTORY');
      const openingEquity = await getMappedAccountTx(tx, companyId, 'OPENING_BALANCE_EQUITY');
      const entry = await postAccountingEventTx(tx, ctx, {
        journalType: 'OPENING',
        entryDate: new Date(),
        description: `Stock inicial do produto ${data.sku} — ${data.name}`,
        reference: data.sku,
        origin: { sourceType: 'PRODUCT', sourceId: created.id, accountingEvent: 'PRODUCT_OPENING_STOCK' },
        lines: [
          { ledgerAccountId: inventory.id, debit: openingValue, description: `Stock inicial ${data.sku} (${initialStock.quantity} × ${unitCost.toFixed(2)})` },
          { ledgerAccountId: openingEquity.id, credit: openingValue, description: `Abertura de existências ${data.sku}` },
        ],
      });

      await writeAudit(tx, ctx, {
        action: 'product.initial_stock',
        entity: 'Product',
        entityId: created.id,
        newValues: {
          sku: data.sku,
          warehouseId: warehouse.id,
          quantity: initialStock.quantity,
          unitCost,
          value: openingValue,
          avgCost: unitCost,
          stockMovementId: movement.id,
          journalEntryId: entry.id,
          entryNumber: entry.entryNumber,
          idempotencyKey: options.idempotencyKey ?? null,
        },
      });

      return {
        resourceType: 'Product',
        resourceId: created.id,
        result: {
          id: created.id,
          initialStock: { movementId: movement.id, entryId: entry.id, entryNumber: entry.entryNumber, quantity: initialStock.quantity, unitCost, value: openingValue },
        },
      };
    };

    if (!options.idempotencyKey) {
      return (await runCreate()).result;
    }

    const op = await runIdempotentOperation<CreateProductResult>(tx, ctx, {
      scope: 'PRODUCT_CREATE',
      idempotencyKey: options.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'Product',
      loadExisting: async (resourceId) => {
        const product = await tx.product.findFirst({ where: { companyId, id: resourceId }, select: { id: true } });
        if (!product) return null;
        if (!initialStock) return { id: product.id };
        const [movement, entry] = await Promise.all([
          tx.stockMovement.findFirst({ where: { companyId, productId: product.id, type: 'IN', document: 'Stock inicial' }, select: { id: true, quantity: true } }),
          tx.journalEntry.findFirst({
            where: { companyId, sourceType: 'PRODUCT', sourceId: product.id, accountingEvent: 'PRODUCT_OPENING_STOCK' },
            select: { id: true, entryNumber: true },
          }),
        ]);
        if (!movement || !entry) throw new ConflictError('Registo de idempotência aponta para um produto com stock inicial incompleto (integridade).');
        return {
          id: product.id,
          initialStock: {
            movementId: movement.id,
            entryId: entry.id,
            entryNumber: entry.entryNumber,
            quantity: movement.quantity,
            unitCost: unitCost ?? 0,
            value: openingValue ?? 0,
          },
        };
      },
      run: runCreate,
    });
    return op.result;
  });
}

/** Actualiza um produto da empresa activa. SKU único por empresa (excluindo o próprio). */
export async function updateProduct(db: PrismaClient, ctx: RequestContext, id: string, input: ProductInput): Promise<void> {
  requirePermission(ctx, 'products.update');
  requireCompany(ctx);
  const data = parseInput(input);

  const existing = await db.product.findFirst({ where: { id } });
  if (!existing) throw new NotFoundError('Produto não encontrado.');

  const dup = await db.product.findFirst({ where: { sku: data.sku, id: { not: id } } });
  if (dup) throw new ConflictError('Já existe um produto com este SKU.');

  const data2 = {
    sku: data.sku,
    name: data.name,
    category: data.category ?? null,
    brand: data.brand ?? null,
    unit: data.unit,
    salePrice: data.salePrice,
    avgCost: data.avgCost,
    taxRate: data.taxRate,
    minStock: data.minStock,
    barcode: data.barcode ?? null,
    notes: data.notes ?? null,
    updatedBy: ctx.userId,
  } satisfies Prisma.ProductUncheckedUpdateInput;
  await db.product.update({ where: { id }, data: data2 });
}
