// Relatório de Vendas (S16) — modelo do cliente «Relatório de Venda.xlsx»:
// Data | Descrição | Total | IVA | Valor Líquido, agrupado VD → Facturas, com
// sub-totais por grupo e TOTAL GERAL calculados apenas sobre documentos activos.
// Os valores por linha são os REAIS armazenados no documento (taxTotal/taxableBase
// vindos das linhas na emissão), nunca a divisão fixa total ÷ 1,16.
import type { Prisma, PrismaClient } from '@ants/database';
import { round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ValidationError } from './errors';
import { ACTIVE_INVOICE_STATUSES } from './invoices';
import { exportTableToXlsx, type XlsxCellValue, type XlsxColumn } from './xlsx-export';

export type SalesReportDocumentType = 'ALL' | 'VD' | 'FACTURA';
export type SalesReportStatus = 'ACTIVE' | 'CANCELLED' | 'ALL';
export type SalesReportSort = 'date' | 'number' | 'total';
export type SalesReportDir = 'asc' | 'desc';

export interface SalesReportFilters {
  from?: string;
  to?: string;
  documentType?: SalesReportDocumentType;
  /** Pesquisa pelo número do documento (contém, sem distinção de maiúsculas). */
  search?: string;
  customerId?: string;
  /** Vendedor/emissor (Invoice.createdBy). */
  userId?: string;
  status?: SalesReportStatus;
  sort?: SalesReportSort;
  dir?: SalesReportDir;
}

export interface SalesReportTotals {
  total: number;
  vat: number;
  net: number;
}

export interface SalesReportRow {
  /** Data de emissão em pt-MZ (DD/MM/YYYY). */
  date: string;
  /** Data de emissão civil (YYYY-MM-DD) — célula de data real na exportação XLSX. */
  isoDate: string;
  /** Número real do documento (ex.: «VD 2026/0001», «FT 2026/0034»). */
  number: string;
  /** Descrição do modelo do cliente (ex.: «VD 2026/0001», «Factura 2026/0034»). */
  description: string;
  customerName: string;
  total: number;
  vat: number;
  net: number;
  documentType: 'VD' | 'FACTURA';
  /** Estado em pt-MZ (Emitida/Parcial/Paga/Cancelada). */
  status: string;
  cancelled: boolean;
}

export interface SalesReportGroup {
  documentType: 'VD' | 'FACTURA';
  label: string;
  subtotalLabel: string;
  rows: SalesReportRow[];
  /** Sub-total apenas dos documentos activos do grupo. */
  subtotal: SalesReportTotals;
}

export interface SalesReport {
  title: string;
  periodLabel: string;
  filters: Required<Pick<SalesReportFilters, 'from' | 'to' | 'documentType' | 'status' | 'sort' | 'dir'>> &
    Pick<SalesReportFilters, 'search' | 'customerId' | 'userId'>;
  groups: SalesReportGroup[];
  /** Soma dos sub-totais (apenas documentos activos). */
  grandTotal: SalesReportTotals;
  documentCount: number;
  cancelledCount: number;
}

export interface SalesReportFilterOptions {
  users: Array<{ id: string; name: string | null; email: string | null }>;
}

const DAY_MS = 86_400_000;

const STATUS_LABELS: Record<string, string> = {
  ISSUED: 'Emitida',
  PARTIAL: 'Parcial',
  PAID: 'Paga',
  CANCELLED: 'Cancelada',
};

const GROUP_META: Record<'VD' | 'FACTURA', { label: string; subtotalLabel: string }> = {
  VD: { label: 'Vendas a Dinheiro (VD)', subtotalLabel: 'Sub-Total VD' },
  FACTURA: { label: 'Facturas', subtotalLabel: 'Sub-Total Facturas' },
};

function parseCivilDate(value: string | undefined, label: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`${label} invalida.`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${label} invalida.`);
  return d;
}

function isoCivilDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function normalizeSalesFilters(filters: SalesReportFilters) {
  const today = new Date();
  const fallbackTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const fallbackFrom = new Date(Date.UTC(fallbackTo.getUTCFullYear(), fallbackTo.getUTCMonth(), 1));
  const fromDate = parseCivilDate(filters.from, 'Data inicial') ?? fallbackFrom;
  const toDate = parseCivilDate(filters.to, 'Data final') ?? fallbackTo;
  if (fromDate.getTime() > toDate.getTime()) throw new ValidationError('A data inicial nao pode ser posterior a data final.');
  const documentType: SalesReportDocumentType = filters.documentType === 'VD' || filters.documentType === 'FACTURA' ? filters.documentType : 'ALL';
  const status: SalesReportStatus = filters.status === 'CANCELLED' || filters.status === 'ALL' ? filters.status : 'ACTIVE';
  const sort: SalesReportSort = filters.sort === 'number' || filters.sort === 'total' ? filters.sort : 'date';
  const dir: SalesReportDir = filters.dir === 'desc' ? 'desc' : 'asc';
  return {
    from: isoCivilDate(fromDate),
    to: isoCivilDate(toDate),
    fromDate,
    toExclusive: new Date(toDate.getTime() + DAY_MS),
    documentType,
    status,
    sort,
    dir,
    search: filters.search?.trim() || undefined,
    customerId: filters.customerId?.trim() || undefined,
    userId: filters.userId?.trim() || undefined,
  };
}

/** «VD 2026/0001» fica tal-qual; «FT 2026/0034» → «Factura 2026/0034» (8.9.7). */
function describeDocument(documentType: 'VD' | 'FACTURA', number: string): string {
  if (documentType === 'VD') return number;
  return number.startsWith('FT ') ? `Factura ${number.slice(3)}` : `Factura ${number}`;
}

function emptyTotals(): SalesReportTotals {
  return { total: 0, vat: 0, net: 0 };
}

function addToTotals(acc: SalesReportTotals, row: SalesReportRow): void {
  acc.total = round2(acc.total + row.total);
  acc.vat = round2(acc.vat + row.vat);
  acc.net = round2(acc.net + row.net);
}

function compareRows(a: SalesReportRow & { issueMs: number }, b: SalesReportRow & { issueMs: number }, sort: SalesReportSort): number {
  if (sort === 'number') return a.number.localeCompare(b.number, 'pt');
  if (sort === 'total') return a.total - b.total || a.number.localeCompare(b.number, 'pt');
  return a.issueMs - b.issueMs || a.number.localeCompare(b.number, 'pt');
}

export async function getSalesReport(db: PrismaClient, ctx: RequestContext, filters: SalesReportFilters = {}): Promise<SalesReport> {
  requirePermission(ctx, 'sales.view');
  const companyId = requireCompany(ctx);
  const f = normalizeSalesFilters(filters);

  const where: Prisma.InvoiceWhereInput = {
    companyId,
    issueDate: { gte: f.fromDate, lt: f.toExclusive },
    status:
      f.status === 'ACTIVE'
        ? { in: ACTIVE_INVOICE_STATUSES }
        : f.status === 'CANCELLED'
          ? 'CANCELLED'
          : { in: [...ACTIVE_INVOICE_STATUSES, 'CANCELLED'] },
  };
  if (f.documentType !== 'ALL') where.documentType = f.documentType;
  if (f.customerId) where.customerId = f.customerId;
  if (f.userId) where.createdBy = f.userId;
  if (f.search) where.number = { contains: f.search, mode: 'insensitive' };

  const invoices = await db.invoice.findMany({
    where,
    select: {
      number: true,
      issueDate: true,
      documentType: true,
      status: true,
      customerName: true,
      total: true,
      taxTotal: true,
      taxableBase: true,
    },
  });

  const byType: Record<'VD' | 'FACTURA', Array<SalesReportRow & { issueMs: number }>> = { VD: [], FACTURA: [] };
  for (const invoice of invoices) {
    const documentType = invoice.documentType === 'VD' ? 'VD' : 'FACTURA';
    byType[documentType].push({
      date: formatDate(invoice.issueDate),
      isoDate: isoCivilDate(invoice.issueDate),
      issueMs: invoice.issueDate.getTime(),
      number: invoice.number,
      description: describeDocument(documentType, invoice.number),
      customerName: invoice.customerName,
      total: round2(Number(invoice.total)),
      vat: round2(Number(invoice.taxTotal)),
      net: round2(Number(invoice.taxableBase)),
      documentType,
      status: STATUS_LABELS[invoice.status] ?? invoice.status,
      cancelled: invoice.status === 'CANCELLED',
    });
  }

  const groups: SalesReportGroup[] = [];
  const grandTotal = emptyTotals();
  let cancelledCount = 0;
  for (const documentType of ['VD', 'FACTURA'] as const) {
    if (f.documentType !== 'ALL' && f.documentType !== documentType) continue;
    const rows = byType[documentType].sort((a, b) => (f.dir === 'desc' ? -compareRows(a, b, f.sort) : compareRows(a, b, f.sort)));
    const subtotal = emptyTotals();
    for (const row of rows) {
      if (row.cancelled) cancelledCount += 1;
      else addToTotals(subtotal, row);
    }
    grandTotal.total = round2(grandTotal.total + subtotal.total);
    grandTotal.vat = round2(grandTotal.vat + subtotal.vat);
    grandTotal.net = round2(grandTotal.net + subtotal.net);
    groups.push({
      documentType,
      ...GROUP_META[documentType],
      rows: rows.map(({ issueMs: _issueMs, ...row }) => row),
      subtotal,
    });
  }

  return {
    title: 'Relatório de Vendas',
    periodLabel: `${formatDate(f.fromDate)} a ${formatDate(new Date(f.toExclusive.getTime() - DAY_MS))}`,
    filters: {
      from: f.from,
      to: f.to,
      documentType: f.documentType,
      status: f.status,
      sort: f.sort,
      dir: f.dir,
      search: f.search,
      customerId: f.customerId,
      userId: f.userId,
    },
    groups,
    grandTotal,
    documentCount: invoices.length,
    cancelledCount,
  };
}

const XLSX_COLUMNS: XlsxColumn[] = [
  { key: 'date', header: 'Data', type: 'date', width: 13 },
  { key: 'description', header: 'Descrição', type: 'text', width: 30 },
  { key: 'total', header: 'Total', type: 'money', width: 16 },
  { key: 'vat', header: 'IVA', type: 'money', width: 14 },
  { key: 'net', header: 'Valor Líquido', type: 'money', width: 16 },
];

function xlsxRow(row: SalesReportRow): Record<string, XlsxCellValue> {
  return {
    date: new Date(`${row.isoDate}T00:00:00.000Z`),
    description: row.cancelled ? `${row.description} — CANCELADA` : row.description,
    total: row.total,
    vat: row.vat,
    net: row.net,
  };
}

/** Exporta o Relatório de Vendas no formato do modelo do cliente (8.8/9): mesma fonte de dados da página. */
export async function exportSalesReportXlsx(
  db: PrismaClient,
  ctx: RequestContext,
  filters: SalesReportFilters = {},
): Promise<{ filename: string; buffer: Buffer }> {
  requirePermission(ctx, 'reports.export');
  const report = await getSalesReport(db, ctx, filters);
  const companyId = requireCompany(ctx);
  const [company, user] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { legalName: true, tradeName: true } }),
    ctx.userId ? db.user.findFirst({ where: { companyId, id: ctx.userId }, select: { name: true, email: true } }) : Promise.resolve(null),
  ]);

  const buffer = await exportTableToXlsx({
    title: report.title,
    companyName: company?.tradeName || company?.legalName || '',
    period: report.periodLabel,
    exportedBy: user?.name || user?.email || undefined,
    exportedAt: new Date(),
    sheetName: 'Relatório de Vendas',
    columns: XLSX_COLUMNS,
    groups: report.groups.map((group) => ({
      label: group.label,
      rows: group.rows.map(xlsxRow),
      subtotal: { description: group.subtotalLabel, total: group.subtotal.total, vat: group.subtotal.vat, net: group.subtotal.net },
    })),
    grandTotal: { description: 'TOTAL GERAL', total: report.grandTotal.total, vat: report.grandTotal.vat, net: report.grandTotal.net },
  });
  return { filename: `relatorio-vendas-${report.filters.from}-${report.filters.to}.xlsx`, buffer };
}

/** Vendedores/emissores para o filtro (o gate é o próprio do relatório — sem RBAC novo). */
export async function getSalesReportFilterOptions(db: PrismaClient, ctx: RequestContext): Promise<SalesReportFilterOptions> {
  requirePermission(ctx, 'sales.view');
  const companyId = requireCompany(ctx);
  const users = await db.user.findMany({ where: { companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } });
  return { users };
}
