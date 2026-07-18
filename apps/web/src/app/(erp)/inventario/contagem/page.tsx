import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { DomainError, getStockCount, hasPermission } from '@ants/domain';
import { getContext } from '@/lib/session';
import { ContagemClient, type CountView } from './ContagemClient';

export const dynamic = 'force-dynamic';

export default async function ContagemPage({ searchParams }: { searchParams: { id?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'stock.view')) redirect('/produtos');
  if (!searchParams.id) redirect('/inventario');

  const db = forCompany(ctx.companyId);
  let detail;
  try {
    detail = await getStockCount(db, ctx, searchParams.id);
  } catch (e) {
    if (e instanceof DomainError) redirect('/inventario');
    throw e;
  }

  const view: CountView = {
    id: detail.id,
    number: detail.number,
    status: detail.status,
    warehouseLabel: `${detail.warehouseName} (${detail.warehouseCode})`,
    notes: detail.notes,
    countedByName: detail.countedByName,
    countedAt: detail.countedAt.toISOString(),
    validatedByName: detail.validatedByName,
    validatedAt: detail.validatedAt ? detail.validatedAt.toISOString() : null,
    discardedByName: detail.discardedByName,
    discardedAt: detail.discardedAt ? detail.discardedAt.toISOString() : null,
    discardReason: detail.discardReason,
    journalEntryNumber: detail.journalEntryNumber,
    lines: detail.lines.map((l) => ({
      productId: l.productId,
      productSku: l.productSku,
      productName: l.productName,
      systemQty: l.systemQty,
      countedQty: l.countedQty,
      currentQty: l.currentQty,
      avgCost: l.avgCost,
      appliedDiff: l.appliedDiff,
      appliedUnitCost: l.appliedUnitCost,
      appliedValue: l.appliedValue,
    })),
  };

  return <ContagemClient count={view} canAdjust={hasPermission(ctx, 'stock.adjust')} />;
}
