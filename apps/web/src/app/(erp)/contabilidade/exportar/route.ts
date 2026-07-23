import { NextResponse } from 'next/server';
import { forCompany } from '@ants/database';
import {
  DomainError,
  exportAccountLedgerCsv,
  exportAccountLedgerXlsx,
  exportAccountingJournalCsv,
  exportAccountingJournalXlsx,
  exportBalanceSheetCsv,
  exportBalanceSheetXlsx,
  exportCashFlowStatementCsv,
  exportCashFlowStatementXlsx,
  exportIncomeStatementCsv,
  exportIncomeStatementXlsx,
  exportGeneralLedgerXlsx,
  exportTrialBalanceCsv,
  exportTrialBalanceXlsx,
  parseTrialBalanceColumns,
  type AccountingJournalType,
  type AccountingReportFilters,
  type AccountingReportStatusFilter,
} from '@ants/domain';
import { getContext } from '@/lib/session';

export const dynamic = 'force-dynamic';

function clean(value: string | null): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

function statusFromUrl(value: string | null): AccountingReportStatusFilter | undefined {
  if (value === 'DRAFT' || value === 'POSTED' || value === 'REVERSED' || value === 'POSTED_AND_REVERSED') return value;
  return undefined;
}

function typeFromUrl(value: string | null): AccountingJournalType | undefined {
  const allowed = ['GENERAL', 'SALES', 'PURCHASES', 'CASH', 'BANK', 'PAYROLL', 'ADJUSTMENT', 'OPENING'];
  return allowed.includes(value ?? '') ? (value as AccountingJournalType) : undefined;
}

function filtersFromUrl(url: URL): AccountingReportFilters {
  const contas = clean(url.searchParams.get('contas'));
  return {
    from: clean(url.searchParams.get('from')),
    to: clean(url.searchParams.get('to')),
    ledgerAccountId: clean(url.searchParams.get('account')),
    journalId: clean(url.searchParams.get('journal')),
    sourceType: clean(url.searchParams.get('source')),
    journalType: typeFromUrl(url.searchParams.get('type')),
    status: statusFromUrl(url.searchParams.get('status')),
    q: clean(url.searchParams.get('q')),
    accountClass: clean(url.searchParams.get('classe')),
    accountMovement: contas === 'WITHOUT' || contas === 'ALL' ? contas : undefined,
  };
}

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(request: Request) {
  try {
    const ctx = await getContext();
    if (!ctx.companyId) {
      return NextResponse.json({ error: 'Operacao requer uma empresa activa.' }, { status: 403 });
    }
    const url = new URL(request.url);
    const kind = clean(url.searchParams.get('kind')) ?? 'journal';
    const filters = filtersFromUrl(url);
    const db = forCompany(ctx.companyId);

    // S18: formato=xlsx — Excel via helper S16 em todas as vistas; CSV mantém-se.
    if (clean(url.searchParams.get('formato')) === 'xlsx') {
      const exportedXlsx =
        kind === 'trial-balance'
          ? await exportTrialBalanceXlsx(db, ctx, filters, parseTrialBalanceColumns(url.searchParams.get('cols')))
          : kind === 'ledger'
            ? clean(url.searchParams.get('razao')) === 'todas'
              ? await exportGeneralLedgerXlsx(db, ctx, filters)
              : await exportAccountLedgerXlsx(db, ctx, filters.ledgerAccountId ?? '', filters)
            : kind === 'income-statement'
              ? await exportIncomeStatementXlsx(db, ctx, { from: filters.from, to: filters.to })
              : kind === 'balance-sheet'
                ? await exportBalanceSheetXlsx(db, ctx, { to: filters.to })
                : kind === 'cash-flow'
                  ? await exportCashFlowStatementXlsx(db, ctx, { from: filters.from, to: filters.to })
                  : await exportAccountingJournalXlsx(db, ctx, filters);
      if (exportedXlsx) {
        return new NextResponse(new Uint8Array(exportedXlsx.buffer), {
          status: 200,
          headers: {
            'Content-Type': XLSX_CONTENT_TYPE,
            'Content-Disposition': `attachment; filename="${exportedXlsx.filename}"`,
            'Cache-Control': 'no-store',
          },
        });
      }
    }

    const exported =
      kind === 'ledger'
        ? await exportAccountLedgerCsv(db, ctx, filters.ledgerAccountId ?? '', filters)
        : kind === 'trial-balance'
          ? await exportTrialBalanceCsv(db, ctx, filters, parseTrialBalanceColumns(url.searchParams.get('cols')))
          : kind === 'income-statement'
            ? await exportIncomeStatementCsv(db, ctx, { from: filters.from, to: filters.to })
            : kind === 'balance-sheet'
              ? await exportBalanceSheetCsv(db, ctx, { to: filters.to })
              : kind === 'cash-flow'
                ? await exportCashFlowStatementCsv(db, ctx, { from: filters.from, to: filters.to })
                : await exportAccountingJournalCsv(db, ctx, filters);
    return new NextResponse(exported.content, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exported.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
