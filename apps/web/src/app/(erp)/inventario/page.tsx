import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { DomainError, getStockCount, hasPermission, listInventory, listStockCounts, listWarehouses } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { InventarioClient, type CountListRow, type DraftPrefill, type InventoryViewLine, type WarehouseOption } from './InventarioClient';

export const dynamic = 'force-dynamic';

const backBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  height: 34,
  padding: '0 13px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text2)',
  fontSize: 12.5,
  fontWeight: 600,
  width: 'max-content',
};

export default async function InventarioPage({ searchParams }: { searchParams: { warehouse?: string; contagem?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'stock.view')) redirect('/produtos');

  const db = forCompany(ctx.companyId);
  const warehouses = await listWarehouses(db, ctx);
  if (warehouses.length === 0) {
    return (
      <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Link href="/produtos" style={backBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar a Produtos &amp; Stock
        </Link>
        <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>Ainda não há armazéns configurados.</div>
      </div>
    );
  }

  // Modo edição: rascunho existente (linhas prefixadas; armazém fixo ao da contagem).
  let draft: DraftPrefill | null = null;
  if (searchParams.contagem) {
    let detail;
    try {
      detail = await getStockCount(db, ctx, searchParams.contagem);
    } catch (e) {
      if (e instanceof DomainError) redirect('/inventario');
      throw e;
    }
    if (detail.status !== 'DRAFT') redirect(`/inventario/contagem?id=${detail.id}`);
    draft = {
      id: detail.id,
      number: detail.number,
      warehouseId: detail.warehouseId,
      notes: detail.notes ?? '',
      lines: detail.lines.map((l) => ({ productId: l.productId, countedQty: l.countedQty })),
    };
  }

  const selectedId = draft?.warehouseId ?? warehouses.find((w) => w.id === searchParams.warehouse)?.id ?? warehouses[0]!.id;
  const [lines, counts] = await Promise.all([listInventory(db, ctx, selectedId), listStockCounts(db, ctx, 20)]);

  const viewLines: InventoryViewLine[] = lines.map((l) => ({
    productId: l.productId,
    sku: l.sku,
    name: l.name,
    category: l.category ?? '—',
    systemQty: l.systemQty,
    avgCost: l.avgCost,
  }));
  const whOptions: WarehouseOption[] = warehouses.map((w) => ({ id: w.id, label: `${w.name} (${w.code})` }));
  const countRows: CountListRow[] = counts.map((c) => ({
    id: c.id,
    number: c.number,
    status: c.status,
    warehouseLabel: `${c.warehouseName} (${c.warehouseCode})`,
    countedByName: c.countedByName,
    countedAt: c.countedAt.toISOString(),
    lineCount: c.lineCount,
  }));

  return (
    <InventarioClient
      warehouseId={selectedId}
      warehouses={whOptions}
      lines={viewLines}
      counts={countRows}
      draft={draft}
      canAdjust={hasPermission(ctx, 'stock.adjust')}
    />
  );
}
