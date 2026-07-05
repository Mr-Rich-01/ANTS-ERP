import type { Prisma, PrismaClient } from '@ants/database';
import { formatMZN, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { hasPermission, requirePermission } from './permissions';
import { ValidationError } from './errors';

export type OperationalReportKey =
  | 'sales'
  | 'customer-statement'
  | 'receivables-aging'
  | 'purchases'
  | 'supplier-statement'
  | 'stock-movements'
  | 'cash-flow'
  | 'audit-operations';

export type FutureReportKey =
  | 'profit-margins'
  | 'stock-valuation'
  | 'bank-reconciliation'
  | 'debt-summary'
  | 'income-statement'
  | 'payroll'
  | 'production'
  | 'custom';

export type ReportKey = OperationalReportKey | FutureReportKey;

export interface ReportDefinition {
  key: ReportKey;
  title: string;
  description: string;
  group: string;
  icon: string;
  status: 'V1' | 'Futuro';
  permission?: string;
  note?: string;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  customerId?: string;
  supplierId?: string;
  productId?: string;
  treasuryAccountId?: string;
  movementType?: 'IN' | 'OUT' | 'ADJUST';
  userId?: string;
}

export interface ReportSummaryItem {
  label: string;
  value: number | string;
  kind?: 'money' | 'count' | 'text';
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  kind?: 'money' | 'count' | 'date' | 'text';
}

export interface ReportSection {
  title: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
}

export interface OperationalReport {
  key: OperationalReportKey;
  title: string;
  description: string;
  periodLabel: string;
  filters: Required<Pick<ReportFilters, 'from' | 'to'>> & ReportFilters;
  summary: ReportSummaryItem[];
  sections: ReportSection[];
}

export interface ReportFilterOptions {
  customers: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; sku: string }>;
  treasuryAccounts: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; email: string | null }>;
}

type ReportPayload = Pick<OperationalReport, 'summary' | 'sections'>;

const DAY_MS = 86_400_000;

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  { key: 'sales', title: 'Relatorio de vendas', description: 'Facturas, recebimentos, clientes, produtos e vendedores.', group: 'Vendas & Clientes', icon: 'trending-up', status: 'V1', permission: 'sales.view' },
  { key: 'customer-statement', title: 'Extracto de clientes', description: 'Saldos, facturas, recebimentos e valores em aberto.', group: 'Vendas & Clientes', icon: 'user-round', status: 'V1', permission: 'clients.view' },
  { key: 'receivables-aging', title: 'Antiguidade de saldos', description: 'Contas a receber por idade: 0-30, 31-60, 61-90 e mais de 90 dias.', group: 'Vendas & Clientes', icon: 'layers', status: 'V1', permission: 'clients.view' },
  { key: 'purchases', title: 'Relatorio de compras', description: 'Ordens, recepcoes, fornecedores, totais e estados.', group: 'Compras & Stock', icon: 'truck', status: 'V1', permission: 'purchases.create' },
  { key: 'supplier-statement', title: 'Extracto de fornecedores', description: 'Compras recebidas, pagamentos e saldo em divida.', group: 'Compras & Stock', icon: 'building', status: 'V1', permission: 'suppliers.view' },
  { key: 'stock-movements', title: 'Movimentos de stock', description: 'Entradas, saidas, ajustes, vendas e compras por produto.', group: 'Compras & Stock', icon: 'package', status: 'V1', permission: 'stock.view' },
  { key: 'cash-flow', title: 'Fluxo de caixa', description: 'Entradas, saidas, saldo por conta e metodo/conta no periodo.', group: 'Financas', icon: 'wallet', status: 'V1', permission: 'treasury.viewReports' },
  { key: 'audit-operations', title: 'Todas as operacoes', description: 'Auditoria por data, utilizador, tipo, entidade e descricao.', group: 'Gestao', icon: 'list', status: 'V1', permission: 'audit.view' },
  { key: 'profit-margins', title: 'Margens de lucro', description: 'Margem bruta robusta por produto e categoria.', group: 'Futuro', icon: 'percent', status: 'Futuro', note: 'Depende de COGS/margem contabilistica completa.' },
  { key: 'stock-valuation', title: 'Valorizacao de stock', description: 'Valor do inventario por armazem.', group: 'Futuro', icon: 'boxes', status: 'Futuro', note: 'Pode ser fase propria de inventario valorizado.' },
  { key: 'bank-reconciliation', title: 'Relatorio bancario', description: 'Movimentos e reconciliacao por conta.', group: 'Futuro', icon: 'landmark', status: 'Futuro', note: 'Conciliacao bancaria ainda nao existe na V1.' },
  { key: 'debt-summary', title: 'Relatorio de dividas', description: 'Contas a receber e a pagar consolidadas.', group: 'Futuro', icon: 'file-clock', status: 'Futuro', note: 'Consolidado avancado fica fora desta fase.' },
  { key: 'income-statement', title: 'Demonstracao de resultados', description: 'Receitas, custos e resultado liquido.', group: 'Futuro', icon: 'book-open', status: 'Futuro', note: 'Relatorio contabilistico avancado.' },
  { key: 'payroll', title: 'Relatorio de salarios', description: 'Folha de pagamento e encargos sociais.', group: 'Futuro', icon: 'banknote', status: 'Futuro', note: 'RH/salarios ainda futuro.' },
  { key: 'production', title: 'Relatorio de producao', description: 'Ordens, consumos e custos de producao.', group: 'Futuro', icon: 'factory', status: 'Futuro', note: 'Producao ainda futuro.' },
  { key: 'custom', title: 'Relatorio personalizado', description: 'Construcao avancada de relatorios.', group: 'Futuro', icon: 'sliders-horizontal', status: 'Futuro', note: 'Construtor de relatorios fora da V1.' },
];

const OPERATIONAL_KEYS = new Set<ReportKey>([
  'sales',
  'customer-statement',
  'receivables-aging',
  'purchases',
  'supplier-statement',
  'stock-movements',
  'cash-flow',
  'audit-operations',
]);

function reportDefinition(key: ReportKey): ReportDefinition {
  const def = REPORT_DEFINITIONS.find((r) => r.key === key);
  if (!def) throw new ValidationError('Relatorio invalido.');
  return def;
}

export function isOperationalReportKey(key: string | undefined): key is OperationalReportKey {
  return Boolean(key && OPERATIONAL_KEYS.has(key as ReportKey));
}

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

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function normalizeFilters(filters: ReportFilters = {}) {
  const today = new Date();
  const fallbackTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const fallbackFrom = new Date(Date.UTC(fallbackTo.getUTCFullYear(), fallbackTo.getUTCMonth(), 1));
  const fromDate = parseCivilDate(filters.from, 'Data inicial') ?? fallbackFrom;
  const toDate = parseCivilDate(filters.to, 'Data final') ?? fallbackTo;
  if (fromDate.getTime() > toDate.getTime()) throw new ValidationError('A data inicial nao pode ser posterior a data final.');
  return {
    ...filters,
    from: isoCivilDate(fromDate),
    to: isoCivilDate(toDate),
    fromDate,
    toDate,
    toExclusive: addDays(toDate, 1),
  };
}

function dateRange(field: string, normalized: ReturnType<typeof normalizeFilters>): Record<string, unknown> {
  return { [field]: { gte: normalized.fromDate, lt: normalized.toExclusive } };
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const value = typeof d === 'string' ? new Date(d) : d;
  return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`;
}

function periodLabel(from: string, to: string): string {
  return `${formatDate(`${from}T00:00:00.000Z`)} a ${formatDate(`${to}T00:00:00.000Z`)}`;
}

function money(value: number): string {
  return formatMZN(round2(value));
}

function userLabel(user: { name: string | null; email: string | null } | undefined, fallback: string | null | undefined): string {
  return user?.name || user?.email || fallback || 'Sem utilizador';
}

function requireReportPermission(ctx: RequestContext, key: OperationalReportKey): ReportDefinition {
  const def = reportDefinition(key);
  if (def.permission) requirePermission(ctx, def.permission);
  return def;
}

export async function getReportFilterOptions(db: PrismaClient, ctx: RequestContext): Promise<ReportFilterOptions> {
  requirePermission(ctx, 'reports.export');
  const companyId = requireCompany(ctx);
  const [customers, suppliers, products, treasuryAccounts, users] = await Promise.all([
    hasPermission(ctx, 'clients.view') ? db.customer.findMany({ where: { companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) : Promise.resolve([]),
    hasPermission(ctx, 'suppliers.view') ? db.supplier.findMany({ where: { companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) : Promise.resolve([]),
    hasPermission(ctx, 'stock.view') ? db.product.findMany({ where: { companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true, sku: true } }) : Promise.resolve([]),
    hasPermission(ctx, 'treasury.view') || hasPermission(ctx, 'treasury.viewReports')
      ? db.treasuryAccount.findMany({ where: { companyId }, orderBy: [{ type: 'asc' }, { name: 'asc' }], select: { id: true, name: true } })
      : Promise.resolve([]),
    hasPermission(ctx, 'audit.view')
      ? db.user.findMany({ where: { companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
  ]);
  return { customers, suppliers, products, treasuryAccounts, users };
}

export async function getOperationalReport(db: PrismaClient, ctx: RequestContext, key: OperationalReportKey, filters: ReportFilters = {}): Promise<OperationalReport> {
  const def = requireReportPermission(ctx, key);
  requireCompany(ctx);
  const normalized = normalizeFilters(filters);
  const report = await buildReport(db, ctx, key, normalized);
  return {
    key,
    title: def.title,
    description: def.description,
    periodLabel: periodLabel(normalized.from, normalized.to),
    filters: normalized,
    ...report,
  };
}

async function buildReport(
  db: PrismaClient,
  ctx: RequestContext,
  key: OperationalReportKey,
  filters: ReturnType<typeof normalizeFilters>,
): Promise<Pick<OperationalReport, 'summary' | 'sections'>> {
  switch (key) {
    case 'sales':
      return salesReport(db, ctx, filters);
    case 'customer-statement':
      return customerStatementReport(db, ctx, filters);
    case 'receivables-aging':
      return receivablesAgingReport(db, ctx, filters);
    case 'purchases':
      return purchasesReport(db, ctx, filters);
    case 'supplier-statement':
      return supplierStatementReport(db, ctx, filters);
    case 'stock-movements':
      return stockMovementsReport(db, ctx, filters);
    case 'cash-flow':
      return cashFlowReport(db, ctx, filters);
    case 'audit-operations':
      return auditOperationsReport(db, ctx, filters);
  }
}

async function salesReport(db: PrismaClient, ctx: RequestContext, filters: ReturnType<typeof normalizeFilters>): Promise<ReportPayload> {
  const companyId = requireCompany(ctx);
  const invoiceWhere: Prisma.InvoiceWhereInput = { companyId, status: { not: 'CANCELLED' }, ...dateRange('issueDate', filters) };
  if (filters.customerId) invoiceWhere.customerId = filters.customerId;
  const [invoices, payments] = await Promise.all([
    db.invoice.findMany({
      where: invoiceWhere,
      include: { lines: true, warehouse: { select: { name: true } } },
      orderBy: { issueDate: 'asc' },
    }),
    db.payment.findMany({
      where: { companyId, status: 'ACTIVE', ...dateRange('paidAt', filters), ...(filters.customerId ? { customerId: filters.customerId } : {}) },
      select: { amount: true },
    }),
  ]);
  const userIds = Array.from(new Set(invoices.map((i) => i.createdBy).filter(Boolean) as string[]));
  const users = userIds.length
    ? await db.user.findMany({ where: { companyId, id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const totalSales = round2(invoices.reduce((sum, i) => sum + Number(i.total), 0));
  const totalReceived = round2(payments.reduce((sum, p) => sum + Number(p.amount), 0));
  const byCustomer = new Map<string, { customer: string; count: number; total: number; received: number; open: number }>();
  const byProduct = new Map<string, { product: string; sku: string; qty: number; total: number }>();
  const byUser = new Map<string, { user: string; count: number; total: number }>();

  for (const invoice of invoices) {
    const c = byCustomer.get(invoice.customerId) ?? { customer: invoice.customerName, count: 0, total: 0, received: 0, open: 0 };
    c.count += 1;
    c.total = round2(c.total + Number(invoice.total));
    c.received = round2(c.received + Number(invoice.amountPaid));
    c.open = round2(c.open + Number(invoice.total) - Number(invoice.amountPaid));
    byCustomer.set(invoice.customerId, c);

    const uid = invoice.createdBy ?? 'none';
    const u = byUser.get(uid) ?? { user: userLabel(userById.get(uid), invoice.createdBy), count: 0, total: 0 };
    u.count += 1;
    u.total = round2(u.total + Number(invoice.total));
    byUser.set(uid, u);

    for (const line of invoice.lines) {
      const pid = line.productId ?? line.description;
      const p = byProduct.get(pid) ?? { product: line.description, sku: line.sku ?? '-', qty: 0, total: 0 };
      p.qty += line.quantity;
      p.total = round2(p.total + Number(line.total));
      byProduct.set(pid, p);
    }
  }

  return {
    summary: [
      { label: 'Total de vendas', value: totalSales, kind: 'money' },
      { label: 'Facturas/vendas', value: invoices.length, kind: 'count' },
      { label: 'Total recebido', value: totalReceived, kind: 'money' },
      { label: 'Ticket medio', value: invoices.length ? round2(totalSales / invoices.length) : 0, kind: 'money' },
    ],
    sections: [
      {
        title: 'Vendas por cliente',
        columns: [
          { key: 'customer', label: 'Cliente' },
          { key: 'count', label: 'Facturas', align: 'right', kind: 'count' },
          { key: 'total', label: 'Total', align: 'right', kind: 'money' },
          { key: 'received', label: 'Recebido', align: 'right', kind: 'money' },
          { key: 'open', label: 'Em aberto', align: 'right', kind: 'money' },
        ],
        rows: [...byCustomer.values()].sort((a, b) => b.total - a.total),
      },
      {
        title: 'Vendas por produto',
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'product', label: 'Produto' },
          { key: 'qty', label: 'Qtd.', align: 'right', kind: 'count' },
          { key: 'total', label: 'Total', align: 'right', kind: 'money' },
        ],
        rows: [...byProduct.values()].sort((a, b) => b.total - a.total),
      },
      {
        title: 'Vendas por utilizador',
        columns: [
          { key: 'user', label: 'Utilizador' },
          { key: 'count', label: 'Facturas', align: 'right', kind: 'count' },
          { key: 'total', label: 'Total', align: 'right', kind: 'money' },
        ],
        rows: [...byUser.values()].sort((a, b) => b.total - a.total),
      },
    ],
  };
}

async function customerStatementReport(db: PrismaClient, ctx: RequestContext, filters: ReturnType<typeof normalizeFilters>): Promise<ReportPayload> {
  const companyId = requireCompany(ctx);
  const where = filters.customerId ? { companyId, id: filters.customerId } : { companyId };
  const [customers, invoices, payments] = await Promise.all([
    db.customer.findMany({ where, orderBy: { name: 'asc' }, select: { id: true, name: true, balance: true } }),
    db.invoice.findMany({
      where: { companyId, status: { not: 'CANCELLED' }, ...dateRange('issueDate', filters), ...(filters.customerId ? { customerId: filters.customerId } : {}) },
      select: { customerId: true, total: true, amountPaid: true },
    }),
    db.payment.findMany({
      where: { companyId, status: 'ACTIVE', ...dateRange('paidAt', filters), ...(filters.customerId ? { customerId: filters.customerId } : {}) },
      select: { customerId: true, amount: true },
    }),
  ]);
  const rows = customers.map((customer) => {
    const customerInvoices = invoices.filter((i) => i.customerId === customer.id);
    const customerPayments = payments.filter((p) => p.customerId === customer.id);
    const total = round2(customerInvoices.reduce((sum, i) => sum + Number(i.total), 0));
    const received = round2(customerPayments.reduce((sum, p) => sum + Number(p.amount), 0));
    const open = round2(customerInvoices.reduce((sum, i) => sum + Number(i.total) - Number(i.amountPaid), 0));
    return { customer: customer.name, balance: Number(customer.balance), invoices: customerInvoices.length, invoiced: total, received, open };
  });
  return {
    summary: [
      { label: 'Clientes', value: rows.length, kind: 'count' },
      { label: 'Facturado', value: round2(rows.reduce((sum, r) => sum + r.invoiced, 0)), kind: 'money' },
      { label: 'Recebido', value: round2(rows.reduce((sum, r) => sum + r.received, 0)), kind: 'money' },
      { label: 'Saldo actual', value: round2(rows.reduce((sum, r) => sum + r.balance, 0)), kind: 'money' },
    ],
    sections: [
      {
        title: 'Extracto resumido de clientes',
        columns: [
          { key: 'customer', label: 'Cliente' },
          { key: 'balance', label: 'Saldo', align: 'right', kind: 'money' },
          { key: 'invoices', label: 'Facturas', align: 'right', kind: 'count' },
          { key: 'received', label: 'Recebimentos', align: 'right', kind: 'money' },
          { key: 'open', label: 'Valores em aberto', align: 'right', kind: 'money' },
        ],
        rows: rows.sort((a, b) => b.balance - a.balance),
      },
    ],
  };
}

async function receivablesAgingReport(db: PrismaClient, ctx: RequestContext, filters: ReturnType<typeof normalizeFilters>): Promise<ReportPayload> {
  const companyId = requireCompany(ctx);
  const ref = filters.toDate;
  const invoices = await db.invoice.findMany({
    where: { companyId, status: { not: 'CANCELLED' }, ...(filters.customerId ? { customerId: filters.customerId } : {}) },
    select: { customerId: true, customerName: true, dueDate: true, total: true, amountPaid: true },
  });
  const byCustomer = new Map<string, { customer: string; b0_30: number; b31_60: number; b61_90: number; b90: number; total: number }>();
  for (const i of invoices) {
    const open = round2(Number(i.total) - Number(i.amountPaid));
    if (open <= 0) continue;
    const age = Math.max(0, Math.floor((ref.getTime() - i.dueDate.getTime()) / DAY_MS));
    const row = byCustomer.get(i.customerId) ?? { customer: i.customerName, b0_30: 0, b31_60: 0, b61_90: 0, b90: 0, total: 0 };
    if (age <= 30) row.b0_30 = round2(row.b0_30 + open);
    else if (age <= 60) row.b31_60 = round2(row.b31_60 + open);
    else if (age <= 90) row.b61_90 = round2(row.b61_90 + open);
    else row.b90 = round2(row.b90 + open);
    row.total = round2(row.total + open);
    byCustomer.set(i.customerId, row);
  }
  const rows = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  return {
    summary: [
      { label: 'Total em aberto', value: round2(rows.reduce((sum, r) => sum + r.total, 0)), kind: 'money' },
      { label: '0-30 dias', value: round2(rows.reduce((sum, r) => sum + r.b0_30, 0)), kind: 'money' },
      { label: '31-60 dias', value: round2(rows.reduce((sum, r) => sum + r.b31_60, 0)), kind: 'money' },
      { label: '+90 dias', value: round2(rows.reduce((sum, r) => sum + r.b90, 0)), kind: 'money' },
    ],
    sections: [
      {
        title: 'Contas a receber por idade',
        columns: [
          { key: 'customer', label: 'Cliente' },
          { key: 'b0_30', label: '0-30 dias', align: 'right', kind: 'money' },
          { key: 'b31_60', label: '31-60 dias', align: 'right', kind: 'money' },
          { key: 'b61_90', label: '61-90 dias', align: 'right', kind: 'money' },
          { key: 'b90', label: '+90 dias', align: 'right', kind: 'money' },
          { key: 'total', label: 'Total', align: 'right', kind: 'money' },
        ],
        rows,
      },
    ],
  };
}

async function purchasesReport(db: PrismaClient, ctx: RequestContext, filters: ReturnType<typeof normalizeFilters>): Promise<ReportPayload> {
  const companyId = requireCompany(ctx);
  const orders = await db.purchaseOrder.findMany({
    where: { companyId, ...dateRange('orderDate', filters), ...(filters.supplierId ? { supplierId: filters.supplierId } : {}) },
    orderBy: { orderDate: 'asc' },
    select: { number: true, orderDate: true, supplierName: true, total: true, receivedValue: true, amountPaid: true, status: true },
  });
  const rows = orders.map((o) => ({
    date: formatDate(o.orderDate),
    number: o.number,
    supplier: o.supplierName,
    total: Number(o.total),
    received: Number(o.receivedValue),
    paid: Number(o.amountPaid),
    status: o.status,
  }));
  return {
    summary: [
      { label: 'Ordens', value: rows.length, kind: 'count' },
      { label: 'Valor total', value: round2(rows.reduce((sum, r) => sum + r.total, 0)), kind: 'money' },
      { label: 'Recepcoes', value: round2(rows.reduce((sum, r) => sum + r.received, 0)), kind: 'money' },
      { label: 'Pago', value: round2(rows.reduce((sum, r) => sum + r.paid, 0)), kind: 'money' },
    ],
    sections: [
      {
        title: 'Compras e recepcoes',
        columns: [
          { key: 'date', label: 'Data', kind: 'date' },
          { key: 'number', label: 'Ordem' },
          { key: 'supplier', label: 'Fornecedor' },
          { key: 'total', label: 'Total', align: 'right', kind: 'money' },
          { key: 'received', label: 'Recepcao', align: 'right', kind: 'money' },
          { key: 'status', label: 'Status' },
        ],
        rows,
      },
    ],
  };
}

async function supplierStatementReport(db: PrismaClient, ctx: RequestContext, filters: ReturnType<typeof normalizeFilters>): Promise<ReportPayload> {
  const companyId = requireCompany(ctx);
  const where = filters.supplierId ? { companyId, id: filters.supplierId } : { companyId };
  const [suppliers, orders, payments] = await Promise.all([
    db.supplier.findMany({ where, orderBy: { name: 'asc' }, select: { id: true, name: true, balance: true } }),
    db.purchaseOrder.findMany({
      where: { companyId, status: { not: 'CANCELLED' }, receivedValue: { gt: 0 }, ...dateRange('orderDate', filters), ...(filters.supplierId ? { supplierId: filters.supplierId } : {}) },
      select: { supplierId: true, receivedValue: true },
    }),
    db.supplierPayment.findMany({
      where: { companyId, status: 'ACTIVE', ...dateRange('paidAt', filters), ...(filters.supplierId ? { supplierId: filters.supplierId } : {}) },
      select: { supplierId: true, amount: true },
    }),
  ]);
  const rows = suppliers.map((supplier) => {
    const supplierOrders = orders.filter((o) => o.supplierId === supplier.id);
    const supplierPayments = payments.filter((p) => p.supplierId === supplier.id);
    const purchases = round2(supplierOrders.reduce((sum, o) => sum + Number(o.receivedValue), 0));
    const paid = round2(supplierPayments.reduce((sum, p) => sum + Number(p.amount), 0));
    return { supplier: supplier.name, purchases, payments: paid, balance: Number(supplier.balance) };
  });
  return {
    summary: [
      { label: 'Fornecedores', value: rows.length, kind: 'count' },
      { label: 'Compras recebidas', value: round2(rows.reduce((sum, r) => sum + r.purchases, 0)), kind: 'money' },
      { label: 'Pagamentos', value: round2(rows.reduce((sum, r) => sum + r.payments, 0)), kind: 'money' },
      { label: 'Saldo em divida', value: round2(rows.reduce((sum, r) => sum + r.balance, 0)), kind: 'money' },
    ],
    sections: [
      {
        title: 'Extracto resumido de fornecedores',
        columns: [
          { key: 'supplier', label: 'Fornecedor' },
          { key: 'purchases', label: 'Compras', align: 'right', kind: 'money' },
          { key: 'payments', label: 'Pagamentos', align: 'right', kind: 'money' },
          { key: 'balance', label: 'Saldo em divida', align: 'right', kind: 'money' },
        ],
        rows: rows.sort((a, b) => b.balance - a.balance),
      },
    ],
  };
}

async function stockMovementsReport(db: PrismaClient, ctx: RequestContext, filters: ReturnType<typeof normalizeFilters>): Promise<ReportPayload> {
  const companyId = requireCompany(ctx);
  const movements = await db.stockMovement.findMany({
    where: { companyId, ...dateRange('createdAt', filters), ...(filters.productId ? { productId: filters.productId } : {}), ...(filters.movementType ? { type: filters.movementType } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { product: { select: { sku: true, name: true } }, warehouse: { select: { name: true } } },
  });
  const userIds = Array.from(new Set(movements.map((m) => m.createdBy).filter(Boolean) as string[]));
  const users = userIds.length ? await db.user.findMany({ where: { companyId, id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const rows = movements.map((m) => {
    const qty = m.quantity;
    const movementKind = m.invoiceId ? 'Venda' : m.purchaseReceiptId ? 'Compra' : m.reversesId ? 'Estorno' : m.type === 'ADJUST' ? 'Ajuste' : m.type === 'IN' ? 'Entrada' : 'Saida';
    return {
      date: formatDate(m.createdAt),
      sku: m.product.sku,
      product: m.product.name,
      type: m.type,
      movement: movementKind,
      in: qty > 0 ? qty : 0,
      out: qty < 0 ? Math.abs(qty) : 0,
      adjust: m.type === 'ADJUST' ? qty : 0,
      warehouse: m.warehouse.name,
      user: userLabel(userById.get(m.createdBy ?? ''), m.createdBy),
      document: m.document ?? '-',
    };
  });
  return {
    summary: [
      { label: 'Movimentos', value: rows.length, kind: 'count' },
      { label: 'Entradas', value: rows.reduce((sum, r) => sum + r.in, 0), kind: 'count' },
      { label: 'Saidas', value: rows.reduce((sum, r) => sum + r.out, 0), kind: 'count' },
      { label: 'Ajustes', value: rows.filter((r) => r.type === 'ADJUST').length, kind: 'count' },
    ],
    sections: [
      {
        title: 'Movimentos de stock',
        columns: [
          { key: 'date', label: 'Data', kind: 'date' },
          { key: 'sku', label: 'SKU' },
          { key: 'product', label: 'Produto' },
          { key: 'movement', label: 'Movimento' },
          { key: 'in', label: 'Entrada', align: 'right', kind: 'count' },
          { key: 'out', label: 'Saida', align: 'right', kind: 'count' },
          { key: 'adjust', label: 'Ajuste', align: 'right', kind: 'count' },
          { key: 'warehouse', label: 'Armazem' },
          { key: 'user', label: 'Utilizador' },
          { key: 'document', label: 'Documento' },
        ],
        rows,
      },
    ],
  };
}

async function cashFlowReport(db: PrismaClient, ctx: RequestContext, filters: ReturnType<typeof normalizeFilters>): Promise<ReportPayload> {
  const companyId = requireCompany(ctx);
  const [movements, accounts] = await Promise.all([
    db.treasuryMovement.findMany({
      where: { companyId, status: 'ACTIVE', ...dateRange('occurredAt', filters), ...(filters.treasuryAccountId ? { accountId: filters.treasuryAccountId } : {}) },
      orderBy: { occurredAt: 'asc' },
      include: { account: { select: { name: true, type: true } } },
    }),
    db.treasuryAccount.findMany({ where: { companyId, ...(filters.treasuryAccountId ? { id: filters.treasuryAccountId } : {}) }, orderBy: { name: 'asc' }, select: { name: true, type: true, balance: true } }),
  ]);
  const rows = movements.map((m) => ({
    date: formatDate(m.occurredAt),
    account: m.account.name,
    method: m.account.type,
    flow: m.flow,
    in: m.flow === 'IN' ? Number(m.amount) : 0,
    out: m.flow === 'OUT' ? Number(m.amount) : 0,
    category: m.category,
    document: m.document ?? '-',
    balanceAfter: Number(m.balanceAfter),
  }));
  const accountRows = accounts.map((a) => ({ account: a.name, method: a.type, balance: Number(a.balance) }));
  return {
    summary: [
      { label: 'Entradas', value: round2(rows.reduce((sum, r) => sum + r.in, 0)), kind: 'money' },
      { label: 'Saidas', value: round2(rows.reduce((sum, r) => sum + r.out, 0)), kind: 'money' },
      { label: 'Saldo liquido', value: round2(rows.reduce((sum, r) => sum + r.in - r.out, 0)), kind: 'money' },
      { label: 'Contas', value: accountRows.length, kind: 'count' },
    ],
    sections: [
      {
        title: 'Movimentos de caixa',
        columns: [
          { key: 'date', label: 'Data', kind: 'date' },
          { key: 'account', label: 'Conta' },
          { key: 'method', label: 'Metodo/Tipo' },
          { key: 'category', label: 'Categoria' },
          { key: 'in', label: 'Entrada', align: 'right', kind: 'money' },
          { key: 'out', label: 'Saida', align: 'right', kind: 'money' },
          { key: 'balanceAfter', label: 'Saldo apos', align: 'right', kind: 'money' },
          { key: 'document', label: 'Documento' },
        ],
        rows,
      },
      {
        title: 'Saldo por conta',
        columns: [
          { key: 'account', label: 'Conta' },
          { key: 'method', label: 'Metodo/Tipo' },
          { key: 'balance', label: 'Saldo actual', align: 'right', kind: 'money' },
        ],
        rows: accountRows,
      },
    ],
  };
}

async function auditOperationsReport(db: PrismaClient, ctx: RequestContext, filters: ReturnType<typeof normalizeFilters>): Promise<ReportPayload> {
  const companyId = requireCompany(ctx);
  const logs = await db.auditLog.findMany({
    where: { companyId, ...dateRange('createdAt', filters), ...(filters.userId ? { userId: filters.userId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  const userIds = Array.from(new Set(logs.map((l) => l.userId).filter(Boolean) as string[]));
  const users = userIds.length ? await db.user.findMany({ where: { companyId, id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const rows = logs.map((log) => ({
    date: formatDate(log.createdAt),
    user: userLabel(userById.get(log.userId ?? ''), log.userId),
    type: log.action,
    entity: log.entity,
    description: log.reason || log.entityId || '-',
    result: log.result ?? '-',
  }));
  return {
    summary: [
      { label: 'Operacoes', value: rows.length, kind: 'count' },
      { label: 'Utilizadores', value: new Set(rows.map((r) => r.user)).size, kind: 'count' },
      { label: 'Sucessos', value: rows.filter((r) => r.result === 'success').length, kind: 'count' },
      { label: 'Periodo', value: periodLabel(filters.from, filters.to), kind: 'text' },
    ],
    sections: [
      {
        title: 'Auditoria operacional',
        columns: [
          { key: 'date', label: 'Data', kind: 'date' },
          { key: 'user', label: 'Utilizador' },
          { key: 'type', label: 'Tipo' },
          { key: 'entity', label: 'Entidade' },
          { key: 'description', label: 'Descricao' },
          { key: 'result', label: 'Resultado' },
        ],
        rows,
      },
    ],
  };
}

function formatCell(value: string | number | null | undefined, kind?: ReportColumn['kind']): string {
  if (value === null || value === undefined) return '';
  if (kind === 'money' && typeof value === 'number') return money(value);
  return String(value);
}

function csvEscape(value: string): string {
  if (/[",\n\r;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvLine(values: string[]): string {
  return values.map(csvEscape).join(';');
}

export async function exportOperationalReportCsv(db: PrismaClient, ctx: RequestContext, key: OperationalReportKey, filters: ReportFilters = {}): Promise<{ filename: string; content: string }> {
  requirePermission(ctx, 'reports.export');
  const report = await getOperationalReport(db, ctx, key, filters);
  const lines: string[] = [
    csvLine([report.title]),
    csvLine(['Periodo', report.periodLabel]),
    csvLine([]),
    csvLine(['Resumo']),
    csvLine(['Indicador', 'Valor']),
    ...report.summary.map((s) => csvLine([s.label, s.kind === 'money' && typeof s.value === 'number' ? money(s.value) : String(s.value)])),
  ];
  for (const section of report.sections) {
    lines.push(csvLine([]), csvLine([section.title]), csvLine(section.columns.map((c) => c.label)));
    for (const row of section.rows) {
      lines.push(csvLine(section.columns.map((c) => formatCell(row[c.key], c.kind))));
    }
  }
  const filename = `${report.key}-${report.filters.from}-${report.filters.to}.csv`;
  return { filename, content: `${lines.join('\r\n')}\r\n` };
}
