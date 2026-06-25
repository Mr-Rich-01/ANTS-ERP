import { formatMZN } from '@ants/shared';

const NBSP = String.fromCharCode(0x00a0);

/**
 * Formata um valor em Meticais como no design original (separador de milhares
 * não-quebrável). Ex.: 84300 → "84 300,00 MT".
 */
export function fmt(value: number): string {
  return formatMZN(value).split(' ').join(NBSP);
}

/** Variante sem o sufixo " MT" (para colunas de débito/crédito). */
export function fmtNoSymbol(value: number): string {
  return fmt(value).replace(NBSP + 'MT', '').replace(' MT', '');
}
