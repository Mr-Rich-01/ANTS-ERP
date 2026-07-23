'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { fmt } from '@/lib/format';
import { KpiCard, KpiGrid, type KpiCardData } from '@/components/ui/KpiCard';
import { SearchCombobox, type ComboOption } from '@/components/ui/SearchCombobox';
import { createStockCountAction, updateStockCountAction } from './actions';

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
export interface CountListRow {
  id: string;
  number: string;
  status: 'DRAFT' | 'VALIDATED' | 'DISCARDED';
  warehouseLabel: string;
  countedByName: string;
  countedAt: string;
  lineCount: number;
}
export interface DraftPrefill {
  id: string;
  number: string;
  warehouseId: string;
  notes: string;
  lines: Array<{ productId: string; countedQty: number }>;
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

const STATUS_CHIP: Record<CountListRow['status'], { label: string; fg: string; bg: string }> = {
  DRAFT: { label: 'Rascunho', fg: 'var(--info)', bg: 'var(--info-bg)' },
  VALIDATED: { label: 'Validada', fg: 'var(--ok)', bg: 'var(--ok-bg)' },
  DISCARDED: { label: 'Descartada', fg: 'var(--bad)', bg: 'var(--bad-bg)' },
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function InventarioClient({
  warehouseId,
  warehouses,
  lines,
  counts,
  draft,
  canAdjust,
}: {
  warehouseId: string;
  warehouses: WarehouseOption[];
  lines: InventoryViewLine[];
  counts: CountListRow[];
  draft: DraftPrefill | null;
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const draftQtyById = useMemo(() => new Map((draft?.lines ?? []).map((l) => [l.productId, l.countedQty])), [draft]);
  const [counted, setCounted] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.productId, draftQtyById.get(l.productId) ?? l.systemQty])),
  );
  // Só as linhas tocadas (ou já pertencentes ao rascunho) entram na contagem gravada.
  const [touched, setTouched] = useState<Set<string>>(() => new Set(draftQtyById.keys()));
  const [notes, setNotes] = useState(draft?.notes ?? '');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const idempotencyKey = useMemo(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined), []);
  const warehouseComboOptions = useMemo<ComboOption[]>(() => warehouses.map((w) => ({ value: w.id, label: w.label })), [warehouses]);

  const stats = useMemo(() => {
    let conform = 0;
    let diverge = 0;
    let valueImpact = 0;
    for (const l of lines) {
      if (!touched.has(l.productId)) continue;
      const c = counted[l.productId] ?? l.systemQty;
      const diff = c - l.systemQty;
      if (diff === 0) conform += 1;
      else {
        diverge += 1;
        valueImpact += diff * l.avgCost;
      }
    }
    return { conform, diverge, valueImpact, total: touched.size };
  }, [counted, touched, lines]);

  const kpis: KpiCardData[] = [
    { label: 'Itens contados', valueStr: `${stats.total} / ${lines.length}`, tone: 'petroleum', icon: 'clipboard-check', sub: 'linhas incluídas na contagem' },
    { label: 'Conformes', valueStr: String(stats.conform), tone: 'green', icon: 'check-circle-2', sub: 'sem divergência' },
    { label: 'Divergências', valueStr: String(stats.diverge), tone: 'amber', icon: 'alert-triangle', sub: stats.diverge ? 'a ajustar na validação' : 'tudo conforme' },
    {
      label: 'Impacto estimado',
      valueStr: `${stats.valueImpact >= 0 ? '+ ' : '− '}${fmt(Math.abs(stats.valueImpact))}`,
      tone: 'red',
      icon: 'scale',
      sub: stats.valueImpact >= 0 ? 'excedente de stock' : 'déficit de stock',
    },
  ];

  const setQty = (id: string, val: number) => {
    setCounted((p) => ({ ...p, [id]: Math.max(0, Math.trunc(Number.isFinite(val) ? val : 0)) }));
    setTouched((p) => new Set(p).add(id));
  };

  const submit = () => {
    setMsg(null);
    const countLines = lines
      .filter((l) => touched.has(l.productId))
      .map((l) => ({ productId: l.productId, countedQty: counted[l.productId] ?? l.systemQty }));
    if (countLines.length === 0) {
      setMsg({ kind: 'err', text: 'Nenhuma linha contada — altere pelo menos uma quantidade para gravar a contagem.' });
      return;
    }
    startTransition(async () => {
      const res = draft
        ? await updateStockCountAction({ stockCountId: draft.id, notes, lines: countLines })
        : await createStockCountAction({ warehouseId, notes, lines: countLines, idempotencyKey });
      if (res.error) setMsg({ kind: 'err', text: res.error });
      else router.push(`/inventario/contagem?id=${res.id}`);
    });
  };

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/produtos" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' }}>
          <Icon name="arrow-left" size={16} />
          Voltar a Produtos &amp; Stock
        </Link>
        <Link href="/inventario/folha-contagem" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content', marginLeft: 'auto' }}>
          <Icon name="printer" size={15} />
          Folha de contagem física
        </Link>
      </div>

      {draft && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--info)', background: 'var(--info-bg)', padding: '10px 14px', borderRadius: 10, flexWrap: 'wrap' }}>
          <Icon name="pencil" size={15} />
          <span>
            A editar o rascunho <b className="font-mono">{draft.number}</b> — os valores de sistema são actualizados ao gravar.
          </span>
          <Link href={`/inventario/contagem?id=${draft.id}`} style={{ marginLeft: 'auto', color: 'var(--info)', fontWeight: 700, textDecoration: 'underline' }}>
            Cancelar edição
          </Link>
        </div>
      )}

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 11, borderRadius: 13, flex: 'none', display: 'inline-flex' }}>
          <Icon name="clipboard-list" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Contagem de inventário</h2>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--info)', background: 'var(--info-bg)', padding: '3px 10px', borderRadius: 20 }}>
              {draft ? `A editar ${draft.number}` : 'Nova contagem'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 22, rowGap: 6, marginTop: 9, alignItems: 'center' }}>
            <span style={meta}>
              <Icon name="warehouse" size={14} color="var(--text3)" />
              Armazém:
            </span>
            <div style={{ width: 240 }}>
              <SearchCombobox
                options={warehouseComboOptions}
                value={warehouseId}
                onChange={(v) => { if (v && !draft) router.push(`/inventario?warehouse=${v}`); }}
                placeholder="— Seleccione o armazém —"
                searchPlaceholder="Pesquisar armazém…"
                emptyText="Sem armazéns para a pesquisa."
                disabled={Boolean(draft)}
                triggerStyle={{ height: 32, borderRadius: 8, border: '1px solid var(--field-bd)', background: 'var(--field)', padding: '0 10px', fontSize: 12.5 }}
              />
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              placeholder="Observações (opcional)"
              style={{ flex: 1, minWidth: 180, height: 32, borderRadius: 8, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '0 10px', fontSize: 12.5, outline: 'none' }}
            />
          </div>
        </div>
        <button
          onClick={submit}
          disabled={pending}
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, opacity: pending ? 0.6 : 1, cursor: pending ? 'default' : 'pointer', flex: 'none' }}
        >
          <Icon name="save" size={15} />
          {pending ? 'A gravar…' : draft ? 'Actualizar contagem' : 'Gravar contagem (rascunho)'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, border: '1px solid var(--bd-soft)', background: 'var(--card2)', color: 'var(--text2)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.45 }}>
        <Icon name="info" size={16} />
        <span>
          A contagem é gravada como <b>rascunho</b>, sem qualquer efeito em stock, custo médio ou contabilidade. Os ajustes só acontecem na{' '}
          <b>validação</b> (permissão de ajuste de stock), na página da contagem. Só as linhas cuja quantidade alterar entram na contagem.
        </span>
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
                const isTouched = touched.has(l.productId);
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
                      {!isTouched ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)', background: 'var(--card2)', padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text3)' }} />
                          Não contado
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: diff === 0 ? 'var(--ok)' : 'var(--warn)', background: diff === 0 ? 'var(--ok-bg)' : 'var(--warn-bg)', padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: diff === 0 ? 'var(--ok)' : 'var(--warn)' }} />
                          {diff === 0 ? 'Conforme' : diff > 0 ? 'Excedente' : 'Déficit'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={4} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                  Impacto estimado no valor do stock (linhas contadas)
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

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="history" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Contagens registadas</div>
          {canAdjust && <span style={{ fontSize: 12, color: 'var(--text3)' }}>— a validação faz-se na página de cada contagem</span>}
        </div>
        {counts.length === 0 ? (
          <div style={{ padding: '26px 18px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Ainda não há contagens registadas.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Nº</th>
                  <th style={th}>Armazém</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Contada por</th>
                  <th style={{ ...th, textAlign: 'right' }}>Linhas</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => {
                  const chip = STATUS_CHIP[c.status];
                  return (
                    <tr key={c.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                      <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{c.number}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{c.warehouseLabel}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: chip.fg, background: chip.bg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: chip.fg }} />
                          {chip.label}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {c.countedByName}
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDateTime(c.countedAt)}</div>
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12.5, color: 'var(--text2)' }}>{c.lineCount}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        <Link href={`/inventario/contagem?id=${c.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--accent-fg)' }}>
                          Abrir
                          <Icon name="arrow-right" size={13} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
