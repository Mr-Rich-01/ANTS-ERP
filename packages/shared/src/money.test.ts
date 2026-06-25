import { describe, expect, it } from 'vitest';
import { computeDocumentTotals, computeLine, formatMZN, round2 } from './money';

describe('round2', () => {
  it('arredonda a 2 casas', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe('computeLine', () => {
  it('aplica desconto e imposto', () => {
    const r = computeLine({ quantity: 2, unitPrice: 100, discountPercent: 10, taxPercent: 16 });
    expect(r.gross).toBe(200);
    expect(r.discount).toBe(20);
    expect(r.net).toBe(180);
    expect(r.tax).toBe(28.8);
    expect(r.total).toBe(208.8);
  });

  it('lida com linha sem desconto/imposto', () => {
    const r = computeLine({ quantity: 3, unitPrice: 50 });
    expect(r.total).toBe(150);
  });
});

describe('computeDocumentTotals', () => {
  it('soma várias linhas', () => {
    const t = computeDocumentTotals([
      { quantity: 1, unitPrice: 100, taxPercent: 16 },
      { quantity: 2, unitPrice: 50, taxPercent: 16 },
    ]);
    expect(t.subtotal).toBe(200);
    expect(t.tax).toBe(32);
    expect(t.total).toBe(232);
  });
});

describe('formatMZN', () => {
  it('formata em meticais', () => {
    expect(formatMZN(1234.5)).toBe('1 234,50 MT');
  });

  it('agrupa milhões e valores pequenos', () => {
    expect(formatMZN(1234567.89)).toBe('1 234 567,89 MT');
    expect(formatMZN(50)).toBe('50,00 MT');
  });

  it('lida com valores negativos e símbolo personalizado', () => {
    expect(formatMZN(-99.5, 'USD')).toBe('-99,50 USD');
  });
});
