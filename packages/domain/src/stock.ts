import type { PrismaClient } from '@ants/database';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { NotFoundError } from './errors';

export type StockMovementType = 'IN' | 'OUT' | 'ADJUST';

export interface MovementItem {
  id: string;
  createdAt: Date;
  type: StockMovementType;
  document: string | null;
  reason: string | null;
  /** Delta com sinal: > 0 entrada · < 0 saída/ajuste negativo. */
  quantity: number;
  balanceAfter: number;
  warehouseCode: string;
  warehouseName: string;
}

export interface WarehouseItem {
  id: string;
  code: string;
  name: string;
}

export interface InventoryLine {
  productId: string;
  sku: string;
  name: string;
  category: string | null;
  salePrice: number;
  avgCost: number;
  systemQty: number;
}

/** Movimentos de stock de um produto (mais recentes primeiro). */
export async function listProductMovements(
  db: PrismaClient,
  ctx: RequestContext,
  productId: string,
  limit = 20,
): Promise<MovementItem[]> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const rows = await db.stockMovement.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { warehouse: { select: { code: true, name: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    createdAt: m.createdAt,
    type: m.type as StockMovementType,
    document: m.document,
    reason: m.reason,
    quantity: m.quantity,
    balanceAfter: m.balanceAfter,
    warehouseCode: m.warehouse.code,
    warehouseName: m.warehouse.name,
  }));
}

/** Armazéns activos da empresa. */
export async function listWarehouses(db: PrismaClient, ctx: RequestContext): Promise<WarehouseItem[]> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const rows = await db.warehouse.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } });
  return rows.map((w) => ({ id: w.id, code: w.code, name: w.name }));
}

/** Lista de inventário (contagem) — stock de sistema por produto num armazém. */
export async function listInventory(db: PrismaClient, ctx: RequestContext, warehouseId: string): Promise<InventoryLine[]> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const wh = await db.warehouse.findFirst({ where: { id: warehouseId } });
  if (!wh) throw new NotFoundError('Armazém não encontrado.');
  const products = await db.product.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    include: { stockLevels: { where: { warehouseId }, select: { quantity: true } } },
  });
  return products.map((p) => ({
    productId: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    salePrice: Number(p.salePrice),
    avgCost: Number(p.avgCost),
    systemQty: p.stockLevels[0]?.quantity ?? 0,
  }));
}

// O ajuste directo de inventário (`adjustInventory`) foi removido na Sessão S9:
// os ajustes passam pelo fluxo de duas etapas em `stock-counts.ts` (contagem em
// rascunho sem efeitos → validação com movimentos de stock + lançamento no DAJ).
