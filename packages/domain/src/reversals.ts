import type { Prisma } from '@ants/database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import {
  formatAccountingDate,
  formatDisplayDate,
  parseAccountingDate,
  periodRangeLabel,
  resolvePeriodForDate,
} from './accounting';

const REVERSAL_REASON_MIN = 10;
const REVERSAL_REASON_MAX = 500;

export function validateReversalReason(value: unknown): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < REVERSAL_REASON_MIN) {
    throw new ValidationError('Indique um motivo com pelo menos 10 caracteres.');
  }
  if (reason.length > REVERSAL_REASON_MAX) {
    throw new ValidationError('O motivo deve ter no maximo 500 caracteres.');
  }
  return reason;
}

export function parseReversalDateInput(value: string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new ValidationError('Data de reversao invalida.');
    return parseAccountingDate(formatAccountingDate(value));
  }
  return parseAccountingDate(value);
}

export async function validateOpenReversalDateTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  value: string | Date,
): Promise<{ reversalDate: Date; fiscalYearId: string; accountingPeriodId: string }> {
  const reversalDate = parseReversalDateInput(value);
  const { fiscalYearId, accountingPeriodId } = await resolvePeriodForDate(tx, companyId, reversalDate);

  await tx.$queryRaw`SELECT id FROM fiscal_years WHERE id = ${fiscalYearId} AND "companyId" = ${companyId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM accounting_periods WHERE id = ${accountingPeriodId} AND "companyId" = ${companyId} FOR UPDATE`;

  const [year, period] = await Promise.all([
    tx.fiscalYear.findFirst({ where: { companyId, id: fiscalYearId } }),
    tx.accountingPeriod.findFirst({ where: { companyId, id: accountingPeriodId } }),
  ]);
  if (!year || !period) throw new NotFoundError('Exercicio/periodo da reversao nao encontrado.');
  if (year.status !== 'OPEN') throw new ConflictError(`O exercicio da reversao esta ${year.status}.`);
  if (period.status !== 'OPEN') {
    throw new ConflictError(
      `A data de reversao ${formatDisplayDate(reversalDate)} nao pertence a um periodo contabilistico aberto. Periodo disponivel: ${periodRangeLabel(period.startDate, period.endDate)}.`,
    );
  }

  return { reversalDate, fiscalYearId, accountingPeriodId };
}
