/**
 * Folha de Contagem Física (S18, backlog item 10) — SÓ LEITURA.
 *
 * Lista produto × armazém com o stock do sistema; as colunas «Quantidade Contada»,
 * «Diferença» e «Observações» são SEMPRE vazias (preenchimento manual no papel —
 * requisito 10.4). O registo digital da contagem é o fluxo próprio da S9
 * (`/inventario/contagem`); esta folha não escreve nada.
 */
import type { PrismaClient } from '@ants/database';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { exportTableToXlsx, type XlsxColumn } from './xlsx-export';

export type CountSheetMode = 'ZERO' | 'NEGATIVE' | 'INACTIVE' | 'ALL';
export type CountSheetSort = 'code' | 'name' | 'category';
export type CountSheetDir = 'asc' | 'desc';

/** Tecto defensivo de linhas da folha (produto × armazém). */
const MAX_ROWS = 3000;

export interface CountSheetFilters {
  warehouseId?: string;
  category?: string;
  /** Pesquisa por nome/SKU. */
  search?: string;
  mode?: CountSheetMode;
  sort?: CountSheetSort;
  dir?: CountSheetDir;
}

export interface CountSheetRow {
  productId: string;
  sku: string;
  name: string;
  category: string | null;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  inactive: boolean;
}

export interface CountSheetResult {
  rows: CountSheetRow[];
  filters: Required<Pick<CountSheetFilters, 'mode' | 'sort' | 'dir'>> & Pick<CountSheetFilters, 'warehouseId' | 'category' | 'search'>;
  /** Nome do armazém filtrado (null = todos os armazéns activos). */
  warehouseName: string | null;
  /** true quando o tecto MAX_ROWS cortou a lista. */
  truncated: boolean;
}

export interface CountSheetFilterOptions {
  warehouses: Array<{ id: string; name: string }>;
  categories: string[];
}

export const COUNT_SHEET_MODE_LABEL: Record<CountSheetMode, string> = {
  ZERO: 'Sem stock (= 0)',
  NEGATIVE: 'Stock negativo (< 0)',
  INACTIVE: 'Produtos inactivos',
  ALL: 'Todos os produtos',
};

function normalizeFilters(filters: CountSheetFilters): CountSheetResult['filters'] {
  const mode: CountSheetMode = filters.mode === 'NEGATIVE' || filters.mode === 'INACTIVE' || filters.mode === 'ALL' ? filters.mode : 'ZERO';
  const sort: CountSheetSort = filters.sort === 'name' || filters.sort === 'category' ? filters.sort : 'code';
  const dir: CountSheetDir = filters.dir === 'desc' ? 'desc' : 'asc';
  return {
    mode,
    sort,
    dir,
    warehouseId: filters.warehouseId || undefined,
    category: filters.category?.trim() || undefined,
    search: filters.search?.trim() || undefined,
  };
}

/** Produto × armazém com o stock do sistema, filtrado e ordenado para a folha. */
export async function getStockCountSheet(db: PrismaClient, ctx: RequestContext, input: CountSheetFilters = {}): Promise<CountSheetResult> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const filters = normalizeFilters(input);

  const warehouses = await db.warehouse.findMany({
    where: filters.warehouseId ? { id: filters.warehouseId } : { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const warehouseName = filters.warehouseId ? (warehouses[0]?.name ?? null) : null;

  const products = await db.product.findMany({
    where: {
      status: filters.mode === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      ...(filters.category ? { category: { equals: filters.category, mode: 'insensitive' } } : {}),
      ...(filters.search
        ? { OR: [{ name: { contains: filters.search, mode: 'insensitive' } }, { sku: { contains: filters.search, mode: 'insensitive' } }] }
        : {}),
    },
    select: { id: true, sku: true, name: true, category: true, status: true, stockLevels: { select: { warehouseId: true, quantity: true } } },
  });

  // Uma linha por produto × armazém; produto sem StockLevel no armazém conta como 0.
  let rows: CountSheetRow[] = [];
  for (const product of products) {
    const byWarehouse = new Map(product.stockLevels.map((l) => [l.warehouseId, l.quantity]));
    for (const warehouse of warehouses) {
      rows.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        quantity: byWarehouse.get(warehouse.id) ?? 0,
        inactive: product.status === 'INACTIVE',
      });
    }
  }

  if (filters.mode === 'ZERO') rows = rows.filter((r) => r.quantity === 0);
  else if (filters.mode === 'NEGATIVE') rows = rows.filter((r) => r.quantity < 0);

  const factor = filters.dir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const key = (r: CountSheetRow) => (filters.sort === 'name' ? r.name : filters.sort === 'category' ? (r.category ?? '') : r.sku);
    const cmp = key(a).localeCompare(key(b), 'pt') || a.name.localeCompare(b.name, 'pt') || a.warehouseName.localeCompare(b.warehouseName, 'pt');
    return cmp * factor;
  });

  const truncated = rows.length > MAX_ROWS;
  return { rows: truncated ? rows.slice(0, MAX_ROWS) : rows, filters, warehouseName, truncated };
}

export async function getCountSheetFilterOptions(db: PrismaClient, ctx: RequestContext): Promise<CountSheetFilterOptions> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const [warehouses, categories] = await Promise.all([
    db.warehouse.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.product.findMany({ where: { category: { not: null } }, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
  ]);
  return { warehouses, categories: categories.map((c) => c.category!).filter(Boolean) };
}

const XLSX_COLUMNS: XlsxColumn[] = [
  { key: 'sku', header: 'Código', type: 'text', width: 16 },
  { key: 'name', header: 'Produto', type: 'text', width: 36 },
  { key: 'category', header: 'Categoria', type: 'text', width: 18 },
  { key: 'warehouse', header: 'Armazém', type: 'text', width: 18 },
  { key: 'quantity', header: 'Stock no Sistema', type: 'number', width: 16 },
  { key: 'counted', header: 'Quantidade Contada', type: 'number', width: 18 },
  { key: 'diff', header: 'Diferença', type: 'number', width: 14 },
  { key: 'notes', header: 'Observações', type: 'text', width: 30 },
];

/** Exporta a folha para Excel — mesmas colunas do papel, com as de contagem VAZIAS (10.4). */
export async function exportStockCountSheetXlsx(
  db: PrismaClient,
  ctx: RequestContext,
  input: CountSheetFilters = {},
): Promise<{ filename: string; buffer: Buffer }> {
  requirePermission(ctx, 'reports.export');
  const sheet = await getStockCountSheet(db, ctx, input);
  const companyId = requireCompany(ctx);
  const [company, user] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { legalName: true, tradeName: true } }),
    ctx.userId ? db.user.findFirst({ where: { companyId, id: ctx.userId }, select: { name: true, email: true } }) : Promise.resolve(null),
  ]);

  const buffer = await exportTableToXlsx({
    title: 'Folha de Contagem Física',
    companyName: company?.tradeName || company?.legalName || '',
    period: `${COUNT_SHEET_MODE_LABEL[sheet.filters.mode]} · Armazém: ${sheet.warehouseName ?? 'Todos'}`,
    exportedBy: user?.name || user?.email || undefined,
    exportedAt: new Date(),
    sheetName: 'Folha de Contagem',
    columns: XLSX_COLUMNS,
    rows: sheet.rows.map((r) => ({
      sku: r.sku,
      name: r.inactive ? `${r.name} (inactivo)` : r.name,
      category: r.category ?? '',
      warehouse: r.warehouseName,
      quantity: r.quantity,
      counted: null,
      diff: null,
      notes: null,
    })),
  });
  const today = new Date().toISOString().slice(0, 10);
  return { filename: `folha-contagem-${today}.xlsx`, buffer };
}
