import { describe, expect, it } from 'vitest';

import { canSubmitInvoiceForm, civilDateInTimeZone, isIsoCivilDate } from './invoice-ui';

describe('invoice issue date helpers', () => {
  it('calcula o dia civil em Africa/Maputo sem depender do UTC do browser', () => {
    const date = new Date('2026-06-30T22:30:00.000Z');
    expect(civilDateInTimeZone(date, 'Africa/Maputo')).toBe('2026-07-01');
    expect(civilDateInTimeZone(date, 'UTC')).toBe('2026-06-30');
  });

  it('valida apenas datas civis reais no formato YYYY-MM-DD', () => {
    expect(isIsoCivilDate('2026-06-30')).toBe(true);
    expect(isIsoCivilDate('2026-02-30')).toBe(false);
    expect(isIsoCivilDate('30/06/2026')).toBe(false);
  });
});

describe('invoice form state', () => {
  it('bloqueia submissao sem data de emissao', () => {
    expect(canSubmitInvoiceForm({ issueDate: '', customerId: 'c1', lineCount: 1, overStockCount: 0, pending: false })).toBe(false);
  });

  it('permite submissao apenas com data, cliente, linhas e stock validos', () => {
    expect(canSubmitInvoiceForm({ issueDate: '2026-06-30', customerId: 'c1', lineCount: 1, overStockCount: 0, pending: false })).toBe(true);
    expect(canSubmitInvoiceForm({ issueDate: '2026-06-30', customerId: '', lineCount: 1, overStockCount: 0, pending: false })).toBe(false);
    expect(canSubmitInvoiceForm({ issueDate: '2026-06-30', customerId: 'c1', lineCount: 0, overStockCount: 0, pending: false })).toBe(false);
    expect(canSubmitInvoiceForm({ issueDate: '2026-06-30', customerId: 'c1', lineCount: 1, overStockCount: 1, pending: false })).toBe(false);
    expect(canSubmitInvoiceForm({ issueDate: '2026-06-30', customerId: 'c1', lineCount: 1, overStockCount: 0, pending: true })).toBe(false);
  });
});
