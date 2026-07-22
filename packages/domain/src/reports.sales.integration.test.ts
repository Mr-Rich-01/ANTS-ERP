/**
 * Suite de integracao S16 — Relatorio de Vendas + exportacao XLSX.
 * Correr com: `pnpm test:integration:reports:sales` (exige DATABASE_URL).
 *
 * Cenario (empresa A, Julho 2026):
 *   VD  2026/0001  05/07  net  100,00  iva  16,00  total  116,00  PAID       seller-1
 *   VD  2026/0002  10/07  net  250,50  iva  40,08  total  290,58  PAID       seller-2
 *   VD  2026/0003  12/07  net   75,00  iva  12,00  total   87,00  CANCELLED  seller-1
 *   FT  2026/0001  03/07  net 1000,00  iva 160,00  total 1160,00  ISSUED     seller-2
 *   FT  2026/0002  08/07  net  500,00  iva   0,00  total  500,00  PARTIAL    seller-1  (isenta)
 *   FT  2026/0003  15/07  net  200,00  iva  32,00  total  232,00  CANCELLED  seller-2
 *   RASC 2026/9001 09/07  DRAFT (nunca aparece) · FT 2026/0000 20/06 (fora do periodo)
 */
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forCompany, prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ForbiddenError } from './errors';
import { exportSalesReportXlsx, getSalesReport, getSalesReportFilterOptions, type SalesReportFilters } from './sales-report';
import { exportTableToXlsx } from './xlsx-export';

const CA = 'smoke-sales-report';
const CB = 'smoke-sales-report-b';
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const JULY: SalesReportFilters = { from: '2026-07-01', to: '2026-07-31' };
const MONEY_FMT = '#,##0.00';

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const viewCtx = ctx(CA, ['sales.view', 'reports.export']);
const dbA = forCompany(CA);
const dbB = forCompany(CB);

let customerGeneral!: string;
let customerCompany!: string;

async function teardown(companyId: string) {
  await prisma.invoice.deleteMany({ where: { companyId } });
  await prisma.warehouse.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

interface SeedInvoice {
  number: string;
  issueDate: string;
  documentType: 'FACTURA' | 'VD';
  status: 'ISSUED' | 'PARTIAL' | 'PAID' | 'CANCELLED' | 'DRAFT';
  net: number;
  vat: number;
  customerId: string;
  customerName: string;
  createdBy: string;
}

async function seedInvoice(companyId: string, warehouseId: string, i: SeedInvoice) {
  await prisma.invoice.create({
    data: {
      companyId,
      number: i.number,
      customerId: i.customerId,
      customerName: i.customerName,
      warehouseId,
      issueDate: D(i.issueDate),
      dueDate: D(i.issueDate),
      status: i.status,
      documentType: i.documentType,
      subtotal: i.net,
      discountTotal: 0,
      taxableBase: i.net,
      taxTotal: i.vat,
      total: i.net + i.vat,
      createdBy: i.createdBy,
    },
  });
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);

  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Sales Report' } });
  const warehouse = await prisma.warehouse.create({ data: { companyId: CA, code: 'RS', name: 'Loja RS' } });
  const general = await prisma.customer.create({ data: { companyId: CA, name: 'Cliente Geral' } });
  const alfa = await prisma.customer.create({ data: { companyId: CA, name: 'Empresa Alfa' } });
  customerGeneral = general.id;
  customerCompany = alfa.id;

  const invoices: SeedInvoice[] = [
    { number: 'VD 2026/0001', issueDate: '2026-07-05', documentType: 'VD', status: 'PAID', net: 100, vat: 16, customerId: general.id, customerName: 'Cliente Geral', createdBy: 'seller-1' },
    { number: 'VD 2026/0002', issueDate: '2026-07-10', documentType: 'VD', status: 'PAID', net: 250.5, vat: 40.08, customerId: general.id, customerName: 'Cliente Geral', createdBy: 'seller-2' },
    { number: 'VD 2026/0003', issueDate: '2026-07-12', documentType: 'VD', status: 'CANCELLED', net: 75, vat: 12, customerId: general.id, customerName: 'Cliente Geral', createdBy: 'seller-1' },
    { number: 'FT 2026/0001', issueDate: '2026-07-03', documentType: 'FACTURA', status: 'ISSUED', net: 1000, vat: 160, customerId: alfa.id, customerName: 'Empresa Alfa', createdBy: 'seller-2' },
    { number: 'FT 2026/0002', issueDate: '2026-07-08', documentType: 'FACTURA', status: 'PARTIAL', net: 500, vat: 0, customerId: alfa.id, customerName: 'Empresa Alfa', createdBy: 'seller-1' },
    { number: 'FT 2026/0003', issueDate: '2026-07-15', documentType: 'FACTURA', status: 'CANCELLED', net: 200, vat: 32, customerId: alfa.id, customerName: 'Empresa Alfa', createdBy: 'seller-2' },
    { number: 'RASC 2026/9001', issueDate: '2026-07-09', documentType: 'FACTURA', status: 'DRAFT', net: 300, vat: 48, customerId: alfa.id, customerName: 'Empresa Alfa', createdBy: 'seller-1' },
    { number: 'FT 2026/0000', issueDate: '2026-06-20', documentType: 'FACTURA', status: 'ISSUED', net: 999, vat: 159.84, customerId: alfa.id, customerName: 'Empresa Alfa', createdBy: 'seller-1' },
  ];
  for (const invoice of invoices) await seedInvoice(CA, warehouse.id, invoice);

  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Sales Report B' } });
  const warehouseB = await prisma.warehouse.create({ data: { companyId: CB, code: 'RSB', name: 'Loja RSB' } });
  const generalB = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente Geral' } });
  await seedInvoice(CB, warehouseB.id, {
    number: 'VD 2026/0001',
    issueDate: '2026-07-05',
    documentType: 'VD',
    status: 'PAID',
    net: 40,
    vat: 6.4,
    customerId: generalB.id,
    customerName: 'Cliente Geral',
    createdBy: 'seller-b',
  });
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.$disconnect();
});

describe('S16 — Relatorio de Vendas', () => {
  it('agrupa VD antes de Facturas com as linhas certas (activos por omissao)', async () => {
    const report = await getSalesReport(dbA, viewCtx, JULY);
    expect(report.groups.map((g) => g.documentType)).toEqual(['VD', 'FACTURA']);
    expect(report.groups[0]!.rows.map((r) => r.number)).toEqual(['VD 2026/0001', 'VD 2026/0002']);
    expect(report.groups[1]!.rows.map((r) => r.number)).toEqual(['FT 2026/0001', 'FT 2026/0002']);
    expect(report.documentCount).toBe(4);
    expect(report.cancelledCount).toBe(0);
  });

  it('sub-totais por grupo e TOTAL GERAL = soma dos sub-totais (8.9.4)', async () => {
    const report = await getSalesReport(dbA, viewCtx, JULY);
    expect(report.groups[0]!.subtotal).toEqual({ total: 406.58, vat: 56.08, net: 350.5 });
    expect(report.groups[1]!.subtotal).toEqual({ total: 1660, vat: 160, net: 1500 });
    expect(report.grandTotal).toEqual({ total: 2066.58, vat: 216.08, net: 1850.5 });
    expect(report.grandTotal.total).toBe(report.groups[0]!.subtotal.total + report.groups[1]!.subtotal.total);
  });

  it('total = IVA + liquido por linha e nos agregados (8.9.1), com IVA real e nao total/1,16', async () => {
    const report = await getSalesReport(dbA, viewCtx, { ...JULY, status: 'ALL' });
    for (const group of report.groups) {
      for (const row of group.rows) expect(row.total).toBe(row.vat + row.net);
      expect(group.subtotal.total).toBe(group.subtotal.vat + group.subtotal.net);
    }
    expect(report.grandTotal.total).toBe(report.grandTotal.vat + report.grandTotal.net);

    // Factura isenta: IVA real 0, nunca a formula fixa total/7,25.
    const exempt = report.groups[1]!.rows.find((r) => r.number === 'FT 2026/0002')!;
    expect(exempt.vat).toBe(0);
    expect(exempt.total).toBe(500);
  });

  it('descricao gerada da serie+numero reais (8.9.7)', async () => {
    const report = await getSalesReport(dbA, viewCtx, JULY);
    expect(report.groups[0]!.rows[0]!.description).toBe('VD 2026/0001');
    expect(report.groups[1]!.rows[0]!.description).toBe('Factura 2026/0001');
  });

  it('estado Todos mostra cancelados marcados mas fora de todos os totais (8.6.4/8.9.9)', async () => {
    const active = await getSalesReport(dbA, viewCtx, JULY);
    const all = await getSalesReport(dbA, viewCtx, { ...JULY, status: 'ALL' });
    expect(all.documentCount).toBe(6);
    expect(all.cancelledCount).toBe(2);
    const cancelled = all.groups.flatMap((g) => g.rows).filter((r) => r.cancelled);
    expect(cancelled.map((r) => r.number).sort()).toEqual(['FT 2026/0003', 'VD 2026/0003']);
    expect(cancelled.every((r) => r.status === 'Cancelada')).toBe(true);
    expect(all.groups[0]!.subtotal).toEqual(active.groups[0]!.subtotal);
    expect(all.groups[1]!.subtotal).toEqual(active.groups[1]!.subtotal);
    expect(all.grandTotal).toEqual(active.grandTotal);
  });

  it('estado Cancelados lista so cancelados com totais a zero', async () => {
    const report = await getSalesReport(dbA, viewCtx, { ...JULY, status: 'CANCELLED' });
    expect(report.documentCount).toBe(2);
    expect(report.groups.flatMap((g) => g.rows).every((r) => r.cancelled)).toBe(true);
    expect(report.grandTotal).toEqual({ total: 0, vat: 0, net: 0 });
  });

  it('rascunhos nunca aparecem, nem com estado Todos', async () => {
    const report = await getSalesReport(dbA, viewCtx, { ...JULY, status: 'ALL' });
    expect(report.groups.flatMap((g) => g.rows).some((r) => r.number.startsWith('RASC'))).toBe(false);
  });

  it('filtro de periodo exclui documentos fora do intervalo', async () => {
    const july = await getSalesReport(dbA, viewCtx, JULY);
    expect(july.groups[1]!.rows.some((r) => r.number === 'FT 2026/0000')).toBe(false);
    const wide = await getSalesReport(dbA, viewCtx, { from: '2026-06-01', to: '2026-07-31' });
    expect(wide.groups[1]!.rows.some((r) => r.number === 'FT 2026/0000')).toBe(true);
    expect(wide.grandTotal.total).toBe(2066.58 + 1158.84);
  });

  it('filtro de tipo mostra so o grupo pedido e o total geral desse grupo', async () => {
    const report = await getSalesReport(dbA, viewCtx, { ...JULY, documentType: 'VD' });
    expect(report.groups.map((g) => g.documentType)).toEqual(['VD']);
    expect(report.grandTotal).toEqual({ total: 406.58, vat: 56.08, net: 350.5 });
  });

  it('pesquisa por numero sem distincao de maiusculas', async () => {
    const report = await getSalesReport(dbA, viewCtx, { ...JULY, search: 'vd 2026/0001' });
    expect(report.groups.flatMap((g) => g.rows).map((r) => r.number)).toEqual(['VD 2026/0001']);
  });

  it('filtros por cliente e por vendedor', async () => {
    const byCustomer = await getSalesReport(dbA, viewCtx, { ...JULY, customerId: customerCompany });
    expect(byCustomer.groups.flatMap((g) => g.rows).every((r) => r.customerName === 'Empresa Alfa')).toBe(true);
    expect(byCustomer.documentCount).toBe(2);

    const bySeller = await getSalesReport(dbA, viewCtx, { ...JULY, userId: 'seller-1' });
    expect(bySeller.groups.flatMap((g) => g.rows).map((r) => r.number).sort()).toEqual(['FT 2026/0002', 'VD 2026/0001']);

    const both = await getSalesReport(dbA, viewCtx, { ...JULY, customerId: customerGeneral, userId: 'seller-2' });
    expect(both.groups.flatMap((g) => g.rows).map((r) => r.number)).toEqual(['VD 2026/0002']);
  });

  it('ordenacao por valor e por numero, asc/desc, dentro de cada grupo', async () => {
    const byTotalDesc = await getSalesReport(dbA, viewCtx, { ...JULY, sort: 'total', dir: 'desc' });
    expect(byTotalDesc.groups[0]!.rows.map((r) => r.total)).toEqual([290.58, 116]);
    expect(byTotalDesc.groups[1]!.rows.map((r) => r.total)).toEqual([1160, 500]);

    const byNumber = await getSalesReport(dbA, viewCtx, { ...JULY, sort: 'number', dir: 'asc' });
    expect(byNumber.groups[1]!.rows.map((r) => r.number)).toEqual(['FT 2026/0001', 'FT 2026/0002']);
  });

  it('isolamento multiempresa e permissoes', async () => {
    const fromB = await getSalesReport(dbB, ctx(CB, ['sales.view']), JULY);
    expect(fromB.documentCount).toBe(1);
    expect(fromB.grandTotal).toEqual({ total: 46.4, vat: 6.4, net: 40 });

    await expect(getSalesReport(dbA, ctx(CA, []), JULY)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getSalesReportFilterOptions(dbA, ctx(CA, []))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportSalesReportXlsx(dbA, ctx(CA, ['sales.view']), JULY)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('XLSX: grupos, sub-totais e TOTAL GERAL com valores monetarios como numeros (9.4)', async () => {
    const { filename, buffer } = await exportSalesReportXlsx(dbA, viewCtx, { ...JULY, status: 'ALL' });
    expect(filename).toBe('relatorio-vendas-2026-07-01-2026-07-31.xlsx');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Relatório de Vendas')!;
    expect(sheet).toBeTruthy();

    // Cabecalho do ficheiro (9.3): titulo, empresa e periodo.
    expect(sheet.getRow(1).getCell(1).value).toBe('Relatório de Vendas');
    expect(sheet.getRow(2).getCell(1).value).toBe('Smoke Sales Report');
    expect(sheet.getRow(3).getCell(1).value).toBe('Período: 01/07/2026 a 31/07/2026');

    // Linha 6 = cabecalho da tabela; 7 = grupo VD; 8-10 dados VD; 11 = Sub-Total VD;
    // 12 = grupo Facturas; 13-15 dados FT; 16 = Sub-Total Facturas; 17 = TOTAL GERAL.
    expect(sheet.getRow(6).getCell(1).value).toBe('Data');
    expect(sheet.getRow(6).getCell(5).value).toBe('Valor Líquido');
    expect(sheet.getRow(7).getCell(1).value).toBe('Vendas a Dinheiro (VD)');

    const firstData = sheet.getRow(8);
    expect(firstData.getCell(1).value).toBeInstanceOf(Date);
    expect(firstData.getCell(2).value).toBe('VD 2026/0001');
    expect(typeof firstData.getCell(3).value).toBe('number');
    expect(firstData.getCell(3).value).toBe(116);
    expect(firstData.getCell(3).numFmt).toBe(MONEY_FMT);
    expect(firstData.getCell(4).value).toBe(16);
    expect(firstData.getCell(5).value).toBe(100);

    // Cancelada visivel e identificada (8.6.4) mas fora dos sub-totais.
    expect(sheet.getRow(10).getCell(2).value).toBe('VD 2026/0003 — CANCELADA');

    const subtotalVd = sheet.getRow(11);
    expect(subtotalVd.getCell(2).value).toBe('Sub-Total VD');
    expect(subtotalVd.getCell(3).value).toBe(406.58);
    expect(subtotalVd.getCell(3).numFmt).toBe(MONEY_FMT);

    expect(sheet.getRow(12).getCell(1).value).toBe('Facturas');
    expect(sheet.getRow(13).getCell(2).value).toBe('Factura 2026/0001');
    expect(sheet.getRow(16).getCell(2).value).toBe('Sub-Total Facturas');
    expect(sheet.getRow(16).getCell(3).value).toBe(1660);

    const grand = sheet.getRow(17);
    expect(grand.getCell(2).value).toBe('TOTAL GERAL');
    expect(grand.getCell(3).value).toBe(2066.58);
    expect(grand.getCell(4).value).toBe(216.08);
    expect(grand.getCell(5).value).toBe(1850.5);
    expect(grand.getCell(3).numFmt).toBe(MONEY_FMT);
  });

  it('helper exportTableToXlsx em modo plano (sem grupos) para as restantes tabelas (item 9)', async () => {
    const buffer = await exportTableToXlsx({
      title: 'Tabela simples',
      companyName: 'Smoke Sales Report',
      period: '01/07/2026 a 31/07/2026',
      exportedBy: 'Teste',
      columns: [
        { key: 'name', header: 'Nome', type: 'text' },
        { key: 'qty', header: 'Qtd.', type: 'number' },
        { key: 'value', header: 'Valor', type: 'money' },
      ],
      rows: [
        { name: 'Linha 1', qty: 2, value: 10.5 },
        { name: 'Linha 2', qty: 3, value: 20.25 },
      ],
      grandTotal: { name: 'Total', qty: 5, value: 30.75 },
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.getRow(6).getCell(1).value).toBe('Nome');
    expect(sheet.getRow(7).getCell(1).value).toBe('Linha 1');
    expect(typeof sheet.getRow(7).getCell(3).value).toBe('number');
    expect(sheet.getRow(7).getCell(3).numFmt).toBe(MONEY_FMT);
    expect(sheet.getRow(9).getCell(1).value).toBe('Total');
    expect(sheet.getRow(9).getCell(3).value).toBe(30.75);
  });
});
