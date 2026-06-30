export interface SupplierPaymentFormState {
  amount: string | number;
  accountId: string;
  idempotencyKey: string;
  pending?: boolean;
}

export interface ReceiptLineState {
  lineId: string;
  remaining: number;
}

export function supplierPaymentInitialAccountId(): string {
  return '';
}

export function canSubmitSupplierPayment(state: SupplierPaymentFormState): boolean {
  const amount = typeof state.amount === 'number' ? state.amount : Number(state.amount);
  return !state.pending && Number.isFinite(amount) && amount > 0 && state.accountId.trim().length > 0 && state.idempotencyKey.trim().length > 0;
}

export function purchaseOrdersEmptyMessage(totalRows: number, filteredRows: number): string | null {
  if (filteredRows > 0) return null;
  return totalRows === 0 ? 'Ainda não há ordens de compra. Crie a primeira.' : 'Nenhuma ordem corresponde à pesquisa.';
}

export function canSubmitReceipt(lines: ReceiptLineState[], quantities: Record<string, number>, pending?: boolean): boolean {
  if (pending || lines.length === 0) return false;
  return lines.some((line) => {
    const quantity = quantities[line.lineId] ?? 0;
    return quantity > 0 && quantity <= line.remaining;
  });
}
