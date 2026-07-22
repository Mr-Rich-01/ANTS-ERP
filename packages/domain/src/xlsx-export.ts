// Infra genérica de exportação XLSX (S16, requisito 9) — server-side apenas.
// Valores monetários entram como NÚMEROS com numFmt '#,##0.00' (9.4), nunca texto;
// a conversão para number acontece aqui, na fronteira da célula, com o valor já fechado.
import ExcelJS from 'exceljs';

export type XlsxCellValue = string | number | Date | null | undefined;

export interface XlsxColumn {
  key: string;
  header: string;
  type: 'text' | 'money' | 'number' | 'date';
  width?: number;
}

export interface XlsxGroup {
  label: string;
  rows: Array<Record<string, XlsxCellValue>>;
  /** Linha de sub-total destacada; chaves em falta ficam vazias. */
  subtotal?: Record<string, XlsxCellValue>;
}

export interface XlsxTableInput {
  title: string;
  companyName: string;
  period?: string;
  exportedBy?: string;
  exportedAt?: Date;
  sheetName?: string;
  columns: XlsxColumn[];
  /** Modo plano (sem grupos). Ignorado quando `groups` é fornecido. */
  rows?: Array<Record<string, XlsxCellValue>>;
  groups?: XlsxGroup[];
  grandTotal?: Record<string, XlsxCellValue>;
}

const MONEY_FMT = '#,##0.00';
const DATE_FMT = 'dd/mm/yyyy';
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDEE' } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE5E7' } };

function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function setCell(cell: ExcelJS.Cell, value: XlsxCellValue, column: XlsxColumn): void {
  if (value === null || value === undefined || value === '') {
    cell.value = null;
    return;
  }
  if (column.type === 'money' || column.type === 'number') {
    cell.value = Number(value);
    if (column.type === 'money') cell.numFmt = MONEY_FMT;
    cell.alignment = { horizontal: 'right' };
    return;
  }
  if (column.type === 'date') {
    cell.value = value instanceof Date ? value : new Date(String(value));
    cell.numFmt = DATE_FMT;
    return;
  }
  cell.value = String(value);
}

function addDataRow(sheet: ExcelJS.Worksheet, columns: XlsxColumn[], row: Record<string, XlsxCellValue>): ExcelJS.Row {
  const excelRow = sheet.addRow([]);
  columns.forEach((column, index) => setCell(excelRow.getCell(index + 1), row[column.key], column));
  return excelRow;
}

function addTotalRow(sheet: ExcelJS.Worksheet, columns: XlsxColumn[], values: Record<string, XlsxCellValue>, opts: { fill?: ExcelJS.Fill; doubleTop?: boolean } = {}): void {
  const excelRow = addDataRow(sheet, columns, values);
  excelRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    if (opts.fill) cell.fill = opts.fill;
    cell.border = { top: { style: opts.doubleTop ? 'double' : 'thin' } };
  });
}

/** Gera um ficheiro XLSX com cabeçalho institucional, grupos com sub-totais e total geral. */
export async function exportTableToXlsx(input: XlsxTableInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ANTS ERP';
  workbook.created = input.exportedAt ?? new Date();
  const sheet = workbook.addWorksheet(input.sheetName ?? input.title.slice(0, 31));

  sheet.columns = input.columns.map((column) => ({ width: column.width ?? (column.type === 'text' ? 32 : 16) }));

  // Cabeçalho do ficheiro (9.3): título, empresa, período, data de exportação e utilizador.
  const span = Math.max(input.columns.length, 1);
  const addHeaderLine = (text: string, opts: { size?: number; bold?: boolean } = {}) => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, span);
    row.getCell(1).font = { size: opts.size ?? 11, bold: opts.bold ?? false };
  };
  addHeaderLine(input.title, { size: 14, bold: true });
  addHeaderLine(input.companyName, { bold: true });
  if (input.period) addHeaderLine(`Período: ${input.period}`);
  const stamp = formatStamp(input.exportedAt ?? new Date());
  addHeaderLine(input.exportedBy ? `Exportado por ${input.exportedBy} em ${stamp}` : `Exportado em ${stamp}`);
  sheet.addRow([]);

  const headerRow = sheet.addRow(input.columns.map((column) => column.header));
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: 'thin' } };
    const column = input.columns[colNumber - 1];
    if (column && (column.type === 'money' || column.type === 'number')) cell.alignment = { horizontal: 'right' };
  });

  if (input.groups) {
    for (const group of input.groups) {
      const labelRow = sheet.addRow([group.label]);
      sheet.mergeCells(labelRow.number, 1, labelRow.number, span);
      labelRow.getCell(1).font = { bold: true };
      for (const row of group.rows) addDataRow(sheet, input.columns, row);
      if (group.subtotal) addTotalRow(sheet, input.columns, group.subtotal, { fill: HEADER_FILL });
    }
  } else {
    for (const row of input.rows ?? []) addDataRow(sheet, input.columns, row);
  }

  if (input.grandTotal) addTotalRow(sheet, input.columns, input.grandTotal, { fill: TOTAL_FILL, doubleTop: true });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
