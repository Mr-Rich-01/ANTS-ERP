// Infra genérica de exportação XLSX (S16, requisito 9) — server-side apenas.
// Valores monetários entram como NÚMEROS com numFmt '#,##0.00' (9.4), nunca texto;
// a conversão para number acontece aqui, na fronteira da célula, com o valor já fechado.
// S18: suporte genérico a MULTI-FOLHA (uma folha por secção/conta) e a linhas
// informativas extra no cabeçalho — `exportTableToXlsx` mantém-se como caso de 1 folha.
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

export interface XlsxSheetInput {
  /** Nome da folha (saneado para as regras do Excel; duplicados são numerados). */
  name: string;
  columns: XlsxColumn[];
  /** Linhas informativas adicionais no cabeçalho da folha (ex.: resumo de KPIs). */
  headerLines?: string[];
  /** Modo plano (sem grupos). Ignorado quando `groups` é fornecido. */
  rows?: Array<Record<string, XlsxCellValue>>;
  groups?: XlsxGroup[];
  grandTotal?: Record<string, XlsxCellValue>;
}

export interface XlsxWorkbookInput {
  title: string;
  companyName: string;
  period?: string;
  exportedBy?: string;
  exportedAt?: Date;
  sheets: XlsxSheetInput[];
}

export interface XlsxTableInput {
  title: string;
  companyName: string;
  period?: string;
  exportedBy?: string;
  exportedAt?: Date;
  sheetName?: string;
  columns: XlsxColumn[];
  headerLines?: string[];
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

/** Regras do Excel: nome ≤ 31 chars, sem []:*?/\ e único no workbook. */
function sanitizeSheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Folha').slice(0, 31);
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n})`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function setCell(cell: ExcelJS.Cell, value: XlsxCellValue, column: XlsxColumn): void {
  if (value === null || value === undefined || value === '') {
    cell.value = null;
    return;
  }
  if (column.type === 'money' || column.type === 'number') {
    // Célula de texto numa coluna numérica (ex.: linha de validação) fica como texto.
    if (typeof value === 'string' && Number.isNaN(Number(value))) {
      cell.value = value;
      cell.alignment = { horizontal: 'right' };
      return;
    }
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

function renderSheet(workbook: ExcelJS.Workbook, input: XlsxWorkbookInput, sheetInput: XlsxSheetInput, usedNames: Set<string>): void {
  const sheet = workbook.addWorksheet(sanitizeSheetName(sheetInput.name, usedNames));
  sheet.columns = sheetInput.columns.map((column) => ({ width: column.width ?? (column.type === 'text' ? 32 : 16) }));

  // Cabeçalho do ficheiro (9.3): título, empresa, período, data de exportação e utilizador.
  const span = Math.max(sheetInput.columns.length, 1);
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
  for (const line of sheetInput.headerLines ?? []) addHeaderLine(line);
  sheet.addRow([]);

  const headerRow = sheet.addRow(sheetInput.columns.map((column) => column.header));
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: 'thin' } };
    const column = sheetInput.columns[colNumber - 1];
    if (column && (column.type === 'money' || column.type === 'number')) cell.alignment = { horizontal: 'right' };
  });

  if (sheetInput.groups) {
    for (const group of sheetInput.groups) {
      const labelRow = sheet.addRow([group.label]);
      sheet.mergeCells(labelRow.number, 1, labelRow.number, span);
      labelRow.getCell(1).font = { bold: true };
      for (const row of group.rows) addDataRow(sheet, sheetInput.columns, row);
      if (group.subtotal) addTotalRow(sheet, sheetInput.columns, group.subtotal, { fill: HEADER_FILL });
    }
  } else {
    for (const row of sheetInput.rows ?? []) addDataRow(sheet, sheetInput.columns, row);
  }

  if (sheetInput.grandTotal) addTotalRow(sheet, sheetInput.columns, sheetInput.grandTotal, { fill: TOTAL_FILL, doubleTop: true });
}

/** Gera um ficheiro XLSX multi-folha com o mesmo cabeçalho institucional em cada folha. */
export async function exportWorkbookToXlsx(input: XlsxWorkbookInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ANTS ERP';
  workbook.created = input.exportedAt ?? new Date();
  const usedNames = new Set<string>();
  for (const sheetInput of input.sheets) renderSheet(workbook, input, sheetInput, usedNames);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Gera um ficheiro XLSX de UMA folha com cabeçalho institucional, grupos com sub-totais e total geral. */
export async function exportTableToXlsx(input: XlsxTableInput): Promise<Buffer> {
  return exportWorkbookToXlsx({
    title: input.title,
    companyName: input.companyName,
    period: input.period,
    exportedBy: input.exportedBy,
    exportedAt: input.exportedAt,
    sheets: [
      {
        name: input.sheetName ?? input.title.slice(0, 31),
        columns: input.columns,
        headerLines: input.headerLines,
        rows: input.rows,
        groups: input.groups,
        grandTotal: input.grandTotal,
      },
    ],
  });
}
