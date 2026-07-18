import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';

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
  const where: Prisma.ProductWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { category: { contains: query, mode: 'insensitive' } },
          { brand: { contains: query, mode: 'insensitive' } },
        ],
      }
    : {};
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
    where.id = { in: params.ids };
  } else if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { sku: { contains: query, mode: 'insensitive' } },
    ];
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

function parseInput(input: ProductInput) {
  const parsed = productInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return parsed.data;
}

/** Cria um produto na empresa activa. SKU único por empresa. */
export async function createProduct(db: PrismaClient, ctx: RequestContext, input: ProductInput): Promise<{ id: string }> {
  requirePermission(ctx, 'products.create');
  requireCompany(ctx);
  const data = parseInput(input);

  const dup = await db.product.findFirst({ where: { sku: data.sku } });
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
    createdBy: ctx.userId,
  } satisfies Omit<Prisma.ProductUncheckedCreateInput, 'companyId'>;
  const created = await db.product.create({ data: data2 as Prisma.ProductUncheckedCreateInput });
  return { id: created.id };
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
