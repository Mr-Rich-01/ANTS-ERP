// Regras puras de cálculo monetário/fiscal — ANTS ERP
// Mantidas puras (sem I/O) para serem partilhadas web/api e facilmente testáveis.

/** Arredonda a 2 casas decimais evitando erros de vírgula flutuante. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface LineInput {
  quantity: number;
  unitPrice: number;
  /** Percentagem de desconto sobre a linha (0–100). */
  discountPercent?: number;
  /** Percentagem de imposto (ex.: IVA 16). */
  taxPercent?: number;
}

export interface LineResult {
  gross: number;
  discount: number;
  net: number;
  tax: number;
  total: number;
}

/** Calcula uma linha de documento (bruto → desconto → líquido → imposto → total). */
export function computeLine(line: LineInput): LineResult {
  const gross = round2(line.quantity * line.unitPrice);
  const discount = round2(gross * ((line.discountPercent ?? 0) / 100));
  const net = round2(gross - discount);
  const tax = round2(net * ((line.taxPercent ?? 0) / 100));
  const total = round2(net + tax);
  return { gross, discount, net, tax, total };
}

export interface DocumentTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
}

/** Soma as linhas de um documento devolvendo os totais. */
export function computeDocumentTotals(lines: LineInput[]): DocumentTotals {
  return lines.reduce<DocumentTotals>(
    (acc, line) => {
      const r = computeLine(line);
      return {
        subtotal: round2(acc.subtotal + r.gross),
        discount: round2(acc.discount + r.discount),
        taxable: round2(acc.taxable + r.net),
        tax: round2(acc.tax + r.tax),
        total: round2(acc.total + r.total),
      };
    },
    { subtotal: 0, discount: 0, taxable: 0, tax: 0, total: 0 },
  );
}

/** Agrupa milhares com espaço, sem depender de Intl (determinístico). */
function groupThousands(intDigits: string): string {
  let out = '';
  for (let i = 0; i < intDigits.length; i++) {
    if (i > 0 && (intDigits.length - i) % 3 === 0) {
      out += ' ';
    }
    out += intDigits[i];
  }
  return out;
}

/**
 * Formata um valor em Meticais (pt-MZ): 1234.5 → "1 234,50 MT".
 * Determinístico (não usa Intl) para evitar variações de ICU entre ambientes.
 */
export function formatMZN(value: number, symbol = 'MT'): string {
  const negative = value < 0;
  const fixed = Math.abs(round2(value)).toFixed(2);
  const dotIndex = fixed.indexOf('.');
  const intPart = fixed.slice(0, dotIndex);
  const decPart = fixed.slice(dotIndex + 1);
  const grouped = groupThousands(intPart);
  return `${negative ? '-' : ''}${grouped},${decPart} ${symbol}`;
}
