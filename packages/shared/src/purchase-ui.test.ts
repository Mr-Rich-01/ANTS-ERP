import { describe, expect, it } from 'vitest';
import { canSubmitReceipt, canSubmitSupplierPayment, purchaseOrdersEmptyMessage, supplierPaymentInitialAccountId } from './purchase-ui';

describe('purchaseOrdersEmptyMessage', () => {
  it('descreve compras sem ordens', () => {
    expect(purchaseOrdersEmptyMessage(0, 0)).toBe('Ainda não há ordens de compra. Crie a primeira.');
  });

  it('descreve pesquisa sem resultados sem assumir uma ordem activa', () => {
    expect(purchaseOrdersEmptyMessage(2, 0)).toBe('Nenhuma ordem corresponde à pesquisa.');
    expect(purchaseOrdersEmptyMessage(2, 1)).toBeNull();
  });
});

describe('supplier payment form state', () => {
  it('não deriva accountId de listas vazias ou existentes antes da selecção explícita', () => {
    expect(supplierPaymentInitialAccountId()).toBe('');
  });

  it('mantém o pagamento desactivado sem conta seleccionada', () => {
    expect(canSubmitSupplierPayment({ amount: '84000', accountId: '', idempotencyKey: 'attempt-1' })).toBe(false);
  });

  it('permite submissão apenas com valor, conta e tentativa definidos', () => {
    expect(canSubmitSupplierPayment({ amount: '84000', accountId: 'cash-1', idempotencyKey: 'attempt-1' })).toBe(true);
    expect(canSubmitSupplierPayment({ amount: '0', accountId: 'cash-1', idempotencyKey: 'attempt-1' })).toBe(false);
    expect(canSubmitSupplierPayment({ amount: '84000', accountId: 'cash-1', idempotencyKey: '' })).toBe(false);
    expect(canSubmitSupplierPayment({ amount: '84000', accountId: 'cash-1', idempotencyKey: 'attempt-1', pending: true })).toBe(false);
  });
});

describe('receipt form state', () => {
  it('desactiva recepção sem linhas recebíveis', () => {
    expect(canSubmitReceipt([], {}, false)).toBe(false);
  });

  it('desactiva recepção sem quantidades positivas', () => {
    expect(canSubmitReceipt([{ lineId: 'line-1', remaining: 3 }], { 'line-1': 0 }, false)).toBe(false);
  });

  it('permite recepção quando existe linha e quantidade válida', () => {
    expect(canSubmitReceipt([{ lineId: 'line-1', remaining: 3 }], { 'line-1': 2 }, false)).toBe(true);
  });
});
