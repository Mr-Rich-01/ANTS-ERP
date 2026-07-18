'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label } from '@ants/ui';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { fmt } from '@/lib/format';
import { discardStockCountAction, validateStockCountAction } from '../actions';

export interface CountLineView {
  productId: string;
  productSku: string;
  productName: string;
  systemQty: number;
  countedQty: number;
  currentQty: number;
  avgCost: number;
  appliedDiff: number | null;
  appliedUnitCost: number | null;
  appliedValue: number | null;
}

export interface CountView {
  id: string;
  number: string;
  status: 'DRAFT' | 'VALIDATED' | 'DISCARDED';
  warehouseLabel: string;
  notes: string | null;
  countedByName: string;
  countedAt: string;
  validatedByName: string | null;
  validatedAt: string | null;
  discardedByName: string | null;
  discardedAt: string | null;
  discardReason: string | null;
  journalEntryNumber: string | null;
  lines: CountLineView[];
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

const STATUS_CHIP: Record<CountView['status'], { label: string; fg: string; bg: string }> = {
  DRAFT: { label: 'Rascunho', fg: 'var(--info)', bg: 'var(--info-bg)' },
  VALIDATED: { label: 'Validada', fg: 'var(--ok)', bg: 'var(--ok-bg)' },
  DISCARDED: { label: 'Descartada', fg: 'var(--bad)', bg: 'var(--bad-bg)' },
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ContagemClient({ count, canAdjust }: { count: CountView; canAdjust: boolean }) {
  const chip = STATUS_CHIP[count.status];
  const isDraft = count.status === 'DRAFT';

  const totals = useMemo(() => {
    let surplus = 0;
    let shortage = 0;
    let divergent = 0;
    let staleLines = 0;
    for (const l of count.lines) {
      const diff = isDraft ? l.countedQty - l.systemQty : l.appliedDiff ?? 0;
      const unit = isDraft ? l.avgCost : l.appliedUnitCost ?? 0;
      const value = diff * unit;
      if (diff !== 0) divergent += 1;
      if (value > 0) surplus += value;
      else if (value < 0) shortage += Math.abs(value);
      if (isDraft && l.currentQty !== l.systemQty) staleLines += 1;
    }
    return { surplus, shortage, divergent, staleLines };
  }, [count.lines, isDraft]);

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link href="/inventario" style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' }}>
        <Icon name="arrow-left" size={16} />
        Voltar ao Inventário
      </Link>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 11, borderRadius: 13, flex: 'none', display: 'inline-flex' }}>
          <Icon name="clipboard-check" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 className="font-mono" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{count.number}</h2>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: chip.fg, background: chip.bg, padding: '3px 10px', borderRadius: 20 }}>{chip.label}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 22, rowGap: 6, marginTop: 9 }}>
            <span style={meta}>
              <Icon name="warehouse" size={14} color="var(--text3)" />
              {count.warehouseLabel}
            </span>
            <span style={meta}>
              <Icon name="user" size={14} color="var(--text3)" />
              Contada por {count.countedByName} em {fmtDateTime(count.countedAt)}
            </span>
            {count.status === 'VALIDATED' && (
              <span style={meta}>
                <Icon name="check-circle-2" size={14} color="var(--ok)" />
                Validada por {count.validatedByName ?? '—'} em {fmtDateTime(count.validatedAt)}
              </span>
            )}
            {count.status === 'VALIDATED' && count.journalEntryNumber && (
              <span style={meta}>
                <Icon name="book-open" size={14} color="var(--text3)" />
                Lançamento <span className="font-mono">{count.journalEntryNumber}</span>
              </span>
            )}
          </div>
          {count.notes && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text2)' }}>Observações: {count.notes}</div>}
        </div>
        {isDraft && (
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', flex: 'none' }}>
            <Link
              href={`/inventario?contagem=${count.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600 }}
            >
              <Icon name="pencil" size={15} />
              Editar
            </Link>
            <DiscardCountDialog
              count={count}
              trigger={
                <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: '1px solid var(--bad)', background: 'var(--card)', color: 'var(--bad)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <Icon name="trash-2" size={15} />
                  Descartar
                </button>
              }
            />
            {canAdjust && (
              <ValidateCountDialog
                count={count}
                totals={totals}
                trigger={
                  <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    <Icon name="check-circle-2" size={15} />
                    Validar contagem
                  </button>
                }
              />
            )}
          </div>
        )}
      </div>

      {isDraft && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, border: '1px solid var(--bd-soft)', background: 'var(--card2)', color: 'var(--text2)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.45 }}>
          <Icon name="info" size={16} />
          <span>
            Rascunho <b>sem qualquer efeito</b> em stock, custo médio ou contabilidade. Na validação, cada linha aplica a{' '}
            <b>diferença contada</b> (contado − sistema no momento da contagem) sobre o stock actual.
          </span>
        </div>
      )}

      {isDraft && totals.staleLines > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '10px 14px', borderRadius: 10, lineHeight: 1.45 }}>
          <Icon name="alert-triangle" size={16} />
          <span>
            O stock mudou desde a contagem em <b>{totals.staleLines} linha(s)</b> (vendas/recepções entretanto). A validação aplica a diferença
            contada sobre o stock actual; se algum produto ficasse negativo, a validação é bloqueada.
          </span>
        </div>
      )}

      {count.status === 'DISCARDED' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '10px 14px', borderRadius: 10, lineHeight: 1.45 }}>
          <Icon name="trash-2" size={16} />
          <span>
            Descartada por <b>{count.discardedByName ?? '—'}</b> em {fmtDateTime(count.discardedAt)} — motivo: {count.discardReason ?? '—'}. A
            contagem nunca teve efeitos em stock ou contabilidade.
          </span>
        </div>
      )}

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="scan-line" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Linhas da contagem</div>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {count.lines.length} linha(s) · {totals.divergent} com diferença
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Produto</th>
                <th style={{ ...th, textAlign: 'right' }}>Sistema (contagem)</th>
                <th style={{ ...th, textAlign: 'right' }}>Contado</th>
                <th style={{ ...th, textAlign: 'right' }}>Diferença</th>
                {isDraft && <th style={{ ...th, textAlign: 'right' }}>Stock actual</th>}
                <th style={{ ...th, textAlign: 'right' }}>{isDraft ? 'Custo médio' : 'Custo aplicado'}</th>
                <th style={{ ...th, textAlign: 'right' }}>{isDraft ? 'Valor estimado' : 'Valor aplicado'}</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {count.lines.map((l) => {
                const diff = isDraft ? l.countedQty - l.systemQty : l.appliedDiff ?? 0;
                const unit = isDraft ? l.avgCost : l.appliedUnitCost ?? 0;
                const value = isDraft ? diff * unit : l.appliedValue ?? 0;
                const diffColor = diff === 0 ? 'var(--text3)' : diff > 0 ? 'var(--ok)' : 'var(--bad)';
                const stale = isDraft && l.currentQty !== l.systemQty;
                return (
                  <tr key={l.productId} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {l.productName}
                      <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{l.productSku}</div>
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>{l.systemQty}</td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.countedQty}</td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: diffColor }}>
                      {diff > 0 ? '+' : ''}
                      {diff}
                    </td>
                    {isDraft && (
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: stale ? 'var(--warn)' : 'var(--text2)', fontWeight: stale ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {l.currentQty}
                        {stale && (
                          <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '2px 7px', borderRadius: 20 }}>mudou</span>
                        )}
                      </td>
                    )}
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmt(unit)}</td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: diffColor, whiteSpace: 'nowrap' }}>
                      {diff === 0 ? '—' : `${value > 0 ? '+ ' : '− '}${fmt(Math.abs(value))}`}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: diff === 0 ? 'var(--ok)' : 'var(--warn)', background: diff === 0 ? 'var(--ok-bg)' : 'var(--warn-bg)', padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: diff === 0 ? 'var(--ok)' : 'var(--warn)' }} />
                        {diff === 0 ? 'Conforme' : diff > 0 ? 'Excedente' : 'Déficit'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={isDraft ? 6 : 5} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                  {isDraft ? 'Impacto estimado (ao custo médio actual)' : 'Impacto aplicado na validação'}
                </td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--ok)' }}>+ {fmt(totals.surplus)}</span>
                  <span style={{ color: 'var(--text3)', margin: '0 6px' }}>/</span>
                  <span style={{ color: 'var(--bad)' }}>− {fmt(totals.shortage)}</span>
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

function ValidateCountDialog({
  count,
  totals,
  trigger,
}: {
  count: CountView;
  totals: { surplus: number; shortage: number; divergent: number; staleLines: number };
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setError(null);
      setIdempotencyKey(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);
    }
  }, [open]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await validateStockCountAction({ stockCountId: count.id, idempotencyKey });
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent style={{ maxWidth: 520 }}>
        <DialogHeader>
          <DialogTitle>Validar contagem</DialogTitle>
          <DialogDescription>
            Contagem {count.number} — {count.warehouseLabel}
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--bd-soft)', background: 'var(--card2)', color: 'var(--text2)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
            <Icon name="info" size={16} />
            <span>
              Só agora o stock é ajustado: {totals.divergent} linha(s) com diferença geram movimentos de stock e um lançamento no Diário de
              Ajustamentos — excedente estimado <b>+ {fmt(totals.surplus)}</b>, déficit estimado <b>− {fmt(totals.shortage)}</b> (ao custo médio
              actual). Esta operação não pode ser desfeita.
            </span>
          </div>

          {totals.staleLines > 0 && (
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '10px 12px', borderRadius: 8, lineHeight: 1.45 }}>
              <Icon name="alert-triangle" size={16} />
              <span>
                O stock mudou desde a contagem em {totals.staleLines} linha(s) — a diferença contada será aplicada sobre o stock actual. Se algum
                produto ficasse negativo, a validação falha e nada é aplicado.
              </span>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 8, lineHeight: 1.45 }}>
              <Icon name="alert-triangle" size={15} />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Fechar
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? 'A validar…' : 'Validar e ajustar stock'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiscardCountDialog({ count, trigger }: { count: CountView; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = () => {
    setError(null);
    if (reason.trim().length < 10) return setError('Indique um motivo com pelo menos 10 caracteres.');
    startTransition(async () => {
      const res = await discardStockCountAction({ stockCountId: count.id, reason });
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent style={{ maxWidth: 500 }}>
        <DialogHeader>
          <DialogTitle>Descartar contagem</DialogTitle>
          <DialogDescription>Contagem {count.number} — {count.warehouseLabel}</DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--bd-soft)', background: 'var(--card2)', color: 'var(--text2)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
            <Icon name="info" size={16} />
            <span>A contagem nunca gerou stock nem contabilidade — não há estorno a fazer. Fica registada como descartada, com utilizador, data, hora e motivo.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor={`count-discard-reason-${count.id}`}>Motivo</Label>
            <textarea
              id={`count-discard-reason-${count.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={4}
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '10px 11px', fontSize: 14, resize: 'vertical', outline: 'none' }}
            />
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 8 }}>
              <Icon name="alert-triangle" size={15} />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Fechar
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? 'A descartar…' : 'Descartar contagem'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
