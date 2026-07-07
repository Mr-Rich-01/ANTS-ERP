import { NextResponse } from 'next/server';
import { forCompany } from '@ants/database';
import {
  DomainError,
  exportAccountLedgerCsv,
  exportAccountingJournalCsv,
  exportTrialBalanceCsv,
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
  return {
    from: clean(url.searchParams.get('from')),
    to: clean(url.searchParams.get('to')),
    ledgerAccountId: clean(url.searchParams.get('account')),
    journalId: clean(url.searchParams.get('journal')),
    sourceType: clean(url.searchParams.get('source')),
    journalType: typeFromUrl(url.searchParams.get('type')),
    status: statusFromUrl(url.searchParams.get('status')),
    q: clean(url.searchParams.get('q')),
  };
}

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
    const exported =
      kind === 'ledger'
        ? await exportAccountLedgerCsv(db, ctx, filters.ledgerAccountId ?? '', filters)
        : kind === 'trial-balance'
          ? await exportTrialBalanceCsv(db, ctx, filters)
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
