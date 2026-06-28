'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { fmt } from '@/lib/format';
import { KpiCard, KpiGrid, type KpiCardData } from '@/components/ui/KpiCard';
import { adjustInventoryAction } from '@/app/(erp)/produtos/actions';

export interface WarehouseOption {
  id: string;
  label: string;
}
export interface InventoryViewLine {
  productId: string;
  sku: string;
  name: string;
  category: string;
  systemQty: number;
  avgCost: number;
}

const th: React.CSSProperties = {
  padding: '11px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.5px',
  color: 'var(--text3)',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--bd-soft)',
};
const meta: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 };

export function InventarioClient({
  warehouseId,
  warehouses,
  lines,
  canAdjust,
}: {
  warehouseId: string;
  warehouses: WarehouseOption[];
  lines: InventoryViewLine[];
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [counted, setCounted] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.productId, l.systemQty])));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const stats = useMemo(() => {
    let conform = 0;
    let diverge = 0;
    let valueImpact = 0;
    for (const l of lines) {
      const c = counted[l.productId] ?? l.systemQty;
      const diff = c - l.systemQty;
      if (diff === 0) conform += 1;
      else {
        diverge += 1;
        valueImpact += diff * l.avgCost;
      }
    }
    return { conform, diverge, valueImpact };
  }, [counted, lines]);

  const kpis: KpiCardData[] = [
    { label: 'Itens contados', valueStr: `${lines.length} / ${lines.length}`, tone: 'petroleum', icon: 'clipboard-check', sub: '100% concluído' },
    { label: 'Conformes', valueStr: String(stats.conform), tone: 'green', icon: 'check-circle-2', sub: 'sem divergência' },
    { label: 'Divergências', valueStr: String(stats.diverge), tone: 'amber', icon: 'alert-triangle', sub: stats.diverge ? 'requer ajuste' : 'tudo conforme' },
    {
      label: 'Impacto no valor',
      valueStr: `${stats.valueImpact >= 0 ? '+ ' : '− '}${fmt(Math.abs(stats.valueImpact))}`,
      tone: 'red',
      icon: 'scale',
      sub: stats.valueImpact >= 0 ? 'ganho de stock' : 'perda de stock',
    },
  ];

  const setQty = (id: string, val: number) => setCounted((p) => ({ ...p, [id]: Math.max(0, Math.trunc(val)) }));

  const submit = () => {
    setMsg(null);
    const items = lines
      .map((l) => ({ productId: l.productId, countedQty: counted[l.productId] ?? l.systemQty }))
      .filter((it, i) => it.countedQty !== lines[i]!.systemQty);
    if (items.length === 0) {
      setMsg({ kind: 'err', text: 'Não há divergências para validar.' });
      return;
    }
    startTransition(async () => {
      const res = await adjustInventoryAction({ warehouseId, items });
      if (res.error) setMsg({ kind: 'err', text: res.error });
      else {
        setMsg({ kind: 'ok', text: `${res.adjusted} ajuste(s) aplicado(s) e registado(s).` });
        router.refresh();
      }
    });
  };

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link href="/produtos" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' }}>
        <Icon name="arrow-left" size={16} />
        Voltar a Produtos &amp; Stock
      </Link>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 11, borderRadius: 13, flex: 'none', display: 'inline-flex' }}>
          <Icon name="clipboard-list" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Contagem de inventário</h2>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--info)', background: 'var(--info-bg)', padding: '3px 10px', borderRadius: 20 }}>Em contagem</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 22, rowGap: 6, marginTop: 9, alignItems: 'center' }}>
            <span style={meta}>
              <Icon name="warehouse" size={14} color="var(--text3)" />
              Armazém:
            </span>
            <select
              value={warehouseId}
              onChange={(e) => router.push(`/inventario?warehouse=${e.target.value}`)}
              style={{ height: 32, borderRadius: 8, border: '1px solid var(--field-bd)', background: 'var(--field)', padding: '0 10px', fontSize: 12.5, color: 'var(--text)', outline: 'none' }}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {canAdjust && (
          <button
            onClick={submit}
            disabled={pending}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, opacity: pending ? 0.6 : 1, cursor: pending ? 'default' : 'pointer', flex: 'none' }}
          >
            <Icon name="check-circle-2" size={15} />
            {pending ? 'A validar…' : 'Validar ajustes'}
          </button>
        )}
      </div>

      {msg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: msg.kind === 'ok' ? 'var(--ok)' : 'var(--bad)', background: msg.kind === 'ok' ? 'var(--ok-bg)' : 'var(--bad-bg)', padding: '10px 14px', borderRadius: 10 }}>
          <Icon name={msg.kind === 'ok' ? 'check-circle-2' : 'alert-triangle'} size={15} />
          {msg.text}
        </div>
      )}

      <KpiGrid>
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="scan-line" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Folha de contagem</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 840 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Produto</th>
                <th style={th}>Categoria</th>
                <th style={{ ...th, textAlign: 'right' }}>Sistema</th>
                <th style={{ ...th, textAlign: 'center' }}>Contado</th>
                <th style={{ ...th, textAlign: 'right' }}>Diferença</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const c = counted[l.productId] ?? l.systemQty;
                const diff = c - l.systemQty;
                const valDiff = diff * l.avgCost;
                const diffColor = diff === 0 ? 'var(--text3)' : diff > 0 ? 'var(--ok)' : 'var(--bad)';
                return (
                  <tr key={l.productId} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {l.name}
                      <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {l.sku}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{l.category}</td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>
                      {l.systemQty}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--field-bd)', background: 'var(--field)', borderRadius: 9, padding: '4px 6px' }}>
                        <button onClick={() => setQty(l.productId, c - 1)} style={iconBtn} aria-label="menos">
                          <Icon name="minus" size={13} color="var(--text3)" />
                        </button>
                        <input
                          className="tnum"
                          type="number"
                          min={0}
                          value={c}
                          onChange={(e) => setQty(l.productId, Number(e.target.value))}
                          style={{ width: 52, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text)', border: 'none', background: 'none', outline: 'none' }}
                        />
                        <button onClick={() => setQty(l.productId, c + 1)} style={iconBtn} aria-label="mais">
                          <Icon name="plus" size={13} color="var(--text3)" />
                        </button>
                      </div>
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: diffColor }}>
                      {diff > 0 ? '+' : ''}
                      {diff}
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: diffColor, whiteSpace: 'nowrap' }}>
                      {diff === 0 ? '—' : `${valDiff > 0 ? '+ ' : '− '}${fmt(Math.abs(valDiff))}`}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: diff === 0 ? 'var(--ok)' : 'var(--warn)', background: diff === 0 ? 'var(--ok-bg)' : 'var(--warn-bg)', padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: diff === 0 ? 'var(--ok)' : 'var(--warn)' }} />
                        {diff === 0 ? 'Conforme' : 'Divergência'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={4} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                  Impacto total no valor do stock
                </td>
                <td colSpan={2} className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: stats.valueImpact >= 0 ? 'var(--ok)' : 'var(--bad)', whiteSpace: 'nowrap' }}>
                  {`${stats.valueImpact >= 0 ? '+ ' : '− '}${fmt(Math.abs(stats.valueImpact))}`}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: 6,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
};
