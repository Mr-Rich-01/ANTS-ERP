import { describe, expect, it } from 'vitest';
import { scopeArgs } from './tenant-scope';

const C = 'company-a';

describe('scopeArgs — isolamento multiempresa', () => {
  it('injecta companyId no where de findMany (modelo empresarial)', () => {
    const out = scopeArgs('User', 'findMany', { where: { status: 'ACTIVE' } }, C);
    expect(out).toEqual({ where: { status: 'ACTIVE', companyId: C } });
  });

  it('injecta companyId mesmo sem where', () => {
    const out = scopeArgs('Role', 'findMany', undefined, C);
    expect(out).toEqual({ where: { companyId: C } });
  });

  it('injecta companyId no where de findUnique/update/delete', () => {
    expect(scopeArgs('User', 'findUnique', { where: { id: '1' } }, C)).toEqual({ where: { id: '1', companyId: C } });
    expect(scopeArgs('User', 'update', { where: { id: '1' }, data: { name: 'x' } }, C)).toEqual({
      where: { id: '1', companyId: C },
      data: { name: 'x' },
    });
    expect(scopeArgs('User', 'delete', { where: { id: '1' } }, C)).toEqual({ where: { id: '1', companyId: C } });
  });

  it('atribui companyId no data de create', () => {
    const out = scopeArgs('User', 'create', { data: { email: 'a@b.c' } }, C);
    expect(out).toEqual({ data: { email: 'a@b.c', companyId: C } });
  });

  it('atribui companyId a cada linha de createMany', () => {
    const out = scopeArgs('Branch', 'createMany', { data: [{ code: 'MAP' }, { code: 'MAT' }] }, C);
    expect(out).toEqual({ data: [{ code: 'MAP', companyId: C }, { code: 'MAT', companyId: C }] });
  });

  it('upsert: filtra where e atribui no create', () => {
    const out = scopeArgs('Role', 'upsert', { where: { id: '1' }, create: { name: 'Gestor' }, update: {} }, C);
    expect(out).toEqual({ where: { id: '1', companyId: C }, create: { name: 'Gestor', companyId: C }, update: {} });
  });

  it('Customer está no âmbito: injecta companyId no where e no data', () => {
    expect(scopeArgs('Customer', 'findMany', { where: { status: 'ACTIVE' } }, C)).toEqual({
      where: { status: 'ACTIVE', companyId: C },
    });
    expect(scopeArgs('Customer', 'create', { data: { name: 'Cliente X' } }, C)).toEqual({
      data: { name: 'Cliente X', companyId: C },
    });
  });

  it('Supplier está no âmbito: injecta companyId no where e no data', () => {
    expect(scopeArgs('Supplier', 'findMany', undefined, C)).toEqual({ where: { companyId: C } });
    expect(scopeArgs('Supplier', 'create', { data: { name: 'Fornecedor X' } }, C)).toEqual({
      data: { name: 'Fornecedor X', companyId: C },
    });
  });

  it('Produtos & Stock estão no âmbito: injecta companyId', () => {
    expect(scopeArgs('Product', 'findMany', undefined, C)).toEqual({ where: { companyId: C } });
    expect(scopeArgs('Warehouse', 'create', { data: { code: 'ARM' } }, C)).toEqual({ data: { code: 'ARM', companyId: C } });
    expect(scopeArgs('StockLevel', 'findFirst', { where: { productId: 'p1' } }, C)).toEqual({ where: { productId: 'p1', companyId: C } });
    expect(scopeArgs('StockMovement', 'create', { data: { productId: 'p1', quantity: 5 } }, C)).toEqual({
      data: { productId: 'p1', quantity: 5, companyId: C },
    });
  });

  it('Vendas (Invoice/Payment) estão no âmbito: injecta companyId', () => {
    expect(scopeArgs('Invoice', 'findMany', { where: { status: 'ISSUED' } }, C)).toEqual({ where: { status: 'ISSUED', companyId: C } });
    expect(scopeArgs('Payment', 'create', { data: { amount: 100 } }, C)).toEqual({ data: { amount: 100, companyId: C } });
    expect(scopeArgs('DocumentCounter', 'upsert', { where: { id: '1' }, create: { key: 'FT-2026' }, update: {} }, C)).toEqual({
      where: { id: '1', companyId: C },
      create: { key: 'FT-2026', companyId: C },
      update: {},
    });
  });

  it('Compras (PurchaseOrder/PurchaseReceipt/SupplierPayment) estão no âmbito: injecta companyId', () => {
    expect(scopeArgs('PurchaseOrder', 'findMany', { where: { status: 'SENT' } }, C)).toEqual({ where: { status: 'SENT', companyId: C } });
    expect(scopeArgs('PurchaseReceipt', 'create', { data: { receiptNumber: 'GR 2026/0001' } }, C)).toEqual({
      data: { receiptNumber: 'GR 2026/0001', companyId: C },
    });
    expect(scopeArgs('PurchaseReceiptItem', 'findMany', { where: { purchaseReceiptId: 'r1' } }, C)).toEqual({
      where: { purchaseReceiptId: 'r1', companyId: C },
    });
    expect(scopeArgs('SupplierPayment', 'create', { data: { amount: 50 } }, C)).toEqual({ data: { amount: 50, companyId: C } });
  });

  it('Tesouraria (TreasuryAccount/TreasuryMovement) estão no âmbito: injecta companyId', () => {
    expect(scopeArgs('TreasuryAccount', 'findMany', undefined, C)).toEqual({ where: { companyId: C } });
    expect(scopeArgs('TreasuryMovement', 'create', { data: { amount: 10 } }, C)).toEqual({ data: { amount: 10, companyId: C } });
  });

  it('Contabilidade (7 modelos da Fase 8a) está no âmbito: injecta companyId', () => {
    // #1 dos testes obrigatórios: os 7 novos modelos respeitam o isolamento.
    expect(scopeArgs('FiscalYear', 'findMany', undefined, C)).toEqual({ where: { companyId: C } });
    expect(scopeArgs('AccountingPeriod', 'create', { data: { code: '2026-01' } }, C)).toEqual({ data: { code: '2026-01', companyId: C } });
    expect(scopeArgs('LedgerAccount', 'findFirst', { where: { code: '111' } }, C)).toEqual({ where: { code: '111', companyId: C } });
    expect(scopeArgs('AccountingJournal', 'findMany', undefined, C)).toEqual({ where: { companyId: C } });
    expect(scopeArgs('JournalEntry', 'create', { data: { entryNumber: 'X' } }, C)).toEqual({ data: { entryNumber: 'X', companyId: C } });
    expect(scopeArgs('JournalEntryLine', 'create', { data: { debit: 10 } }, C)).toEqual({ data: { debit: 10, companyId: C } });
    expect(scopeArgs('AccountingMapping', 'upsert', { where: { id: '1' }, create: { systemKey: 'CASH_MAIN' }, update: {} }, C)).toEqual({
      where: { id: '1', companyId: C },
      create: { systemKey: 'CASH_MAIN', companyId: C },
      update: {},
    });
  });

  it('OperationIdempotency (Fase 8c.2a) está no âmbito: injecta companyId', () => {
    expect(scopeArgs('OperationIdempotency', 'findFirst', { where: { scope: 'INVOICE_CREATE', idempotencyKey: 'k' } }, C)).toEqual({
      where: { scope: 'INVOICE_CREATE', idempotencyKey: 'k', companyId: C },
    });
    expect(scopeArgs('OperationIdempotency', 'create', { data: { scope: 'INVOICE_CREATE', idempotencyKey: 'k', requestFingerprint: 'v1:x' } }, C)).toEqual({
      data: { scope: 'INVOICE_CREATE', idempotencyKey: 'k', requestFingerprint: 'v1:x', companyId: C },
    });
  });

  it('NÃO altera modelos fora do âmbito (ex.: Permission)', () => {
    const args = { where: { key: 'sales.view' } };
    expect(scopeArgs('Permission', 'findMany', args, C)).toBe(args);
  });

  it('não deixa uma empresa filtrar pela outra (where da empresa prevalece)', () => {
    // Mesmo que o chamador tente forçar outra empresa, o scope reescreve para a activa.
    const out = scopeArgs('User', 'findMany', { where: { companyId: 'company-b' } }, C);
    expect((out as { where: { companyId: string } }).where.companyId).toBe(C);
  });
});
