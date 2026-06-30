import { DEFAULT_TIMEZONE } from './constants';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface InvoiceFormState {
  issueDate: string;
  customerId: string;
  lineCount: number;
  overStockCount: number;
  pending: boolean;
}

export function isIsoCivilDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function civilDateInTimeZone(now: Date = new Date(), timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function canSubmitInvoiceForm(state: InvoiceFormState): boolean {
  return !state.pending && isIsoCivilDate(state.issueDate) && state.customerId.length > 0 && state.lineCount > 0 && state.overStockCount === 0;
}
