'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@ants/ui';
import type { InventoryRegularizationPreview } from '@ants/domain';
import { Icon } from '@/components/Icon';
import { fmt, fmtNoSymbol } from '@/lib/format';
import { executeInventoryRegularizationAction } from './actions';

const panel: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' };
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', background: 'var(--card2)', borderBottom: '1px solid var(--bd-soft)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: 'var(--text2)', borderTop: '1px solid var(--bd-soft2)', verticalAlign: 'top' };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '0 10px', fontSize: 12.5, outline: 'none', minWidth: 0, width: '100%' };

function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function signedMoney(value: number): string {
  return `${value < 0 ? '−' : ''}${fmt(Math.abs(value))}`;
}

export function RegularizacaoClient({ preview }: { preview: InventoryRegularizationPreview }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(createIdempotencyKey());
      setConfirmed(false);
      setError(null);
    }
  }, [open]);

  const hasDivergence = preview.divergence !== 0;
  const debitInventory = preview.divergence > 0;
  const entryLabel = debitInventory
    ? `D ${preview.inventoryAccount.code} ${preview.inventoryAccount.name} / C ${preview.equityAccount.code} ${preview.equityAccount.name}`
    : `D ${preview.equityAccount.code} ${preview.equityAccount.name} / C ${preview.inventoryAccount.code} ${preview.inventoryAccount.name}`;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await executeInventoryRegularizationAction({
        expectedDivergence: preview.divergence,
        notes: notes || undefined,
        idempotencyKey,
      });
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        setSuccess(`Regularização lançada: ${res.entryNumber} (${signedMoney(res.divergence ?? preview.divergence)}).`);
        router.refresh();
      }
    });
  };

  const summary = [
    { label: 'Stock físico ao custo médio', value: fmt(preview.physicalValue) },
    { label: `Saldo da conta ${preview.inventoryAccount.code}`, value: fmt(preview.inventoryBalance) },
    { label: 'Divergência', value: signedMoney(preview.divergence) },
  ];

  return (
    <>
      {success ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '10px 12px', borderRadius: 10 }}>
          <Icon name="check-circle-2" size={15} />
          {success}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        {summary.map((item) => (
          <div key={item.label} style={{ ...panel, padding: '14px 16px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{item.label}</div>
            <div className="tnum" style={{ fontSize: 20, fontWeight: 800, color: item.label === 'Divergência' ? (hasDivergence ? 'var(--bad)' : 'var(--ok)') : 'var(--text)', marginTop: 6 }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {hasDivergence ? (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              Lançamento a criar no Diário de Abertura: <strong style={{ color: 'var(--text)' }}>{entryLabel}</strong> no valor de{' '}
              <strong className="tnum" style={{ color: 'var(--text)' }}>{fmt(Math.abs(preview.divergence))}</strong>.
              {debitInventory
                ? ' O stock físico vale mais do que o saldo contabilístico — a conta de existências é reforçada.'
                : ' O saldo contabilístico excede o stock físico — a conta de existências é reduzida.'}
            </div>
            <div>
              <Button type="button" onClick={() => setOpen(true)}>
                <Icon name="scale" size={15} />
                Rever e regularizar…
              </Button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ok)' }}>
            <Icon name="check-circle-2" size={15} />
            Sem divergência: a conta {preview.inventoryAccount.code} reconcilia com o stock físico valorizado ao custo médio. Nada a regularizar.
          </div>
        )}
      </div>

      <div style={panel}>
        <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
          <strong style={{ fontSize: 14, color: 'var(--text)' }}>Detalhe por produto ({preview.items.length})</strong>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Stock físico de todos os armazéns valorizado ao custo médio corrente de cada produto.</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['SKU', 'Produto', 'Quantidade', 'Custo médio', 'Valor'].map((h) => (
                  <th key={h} style={{ ...th, textAlign: h === 'SKU' || h === 'Produto' ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.items.length === 0 ? (
                <tr><td colSpan={5} style={{ ...td, padding: '24px 12px', textAlign: 'center', color: 'var(--text3)' }}>Sem stock físico registado.</td></tr>
              ) : preview.items.map((item) => (
                <tr key={item.productId} className="ants-row">
                  <td className="font-mono" style={{ ...td, color: 'var(--accent-fg)', fontWeight: 700 }}>{item.sku}</td>
                  <td style={td}>{item.name}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{item.quantity}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right' }}>{fmtNoSymbol(item.avgCost)}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNoSymbol(item.value)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} style={{ ...td, fontWeight: 800, color: 'var(--text)' }}>Total físico</td>
                <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{fmtNoSymbol(preview.physicalValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ maxWidth: 560 }}>
          <DialogHeader>
            <DialogTitle>Confirmar regularização de existências</DialogTitle>
            <DialogDescription>Operação contabilística única — o lançamento fica imutável (correcções só por estorno).</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                ['Stock físico', fmt(preview.physicalValue)],
                [`Saldo ${preview.inventoryAccount.code}`, fmt(preview.inventoryBalance)],
                ['Divergência a lançar', signedMoney(preview.divergence)],
                ['Produtos abrangidos', String(preview.items.length)],
              ].map(([label, value]) => (
                <div key={label} style={{ border: '1px solid var(--bd-soft)', borderRadius: 8, padding: '9px 10px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
                  <div className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              Lançamento: <strong style={{ color: 'var(--text)' }}>{entryLabel}</strong>, Diário de Abertura, data de hoje.
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' }}>
              Nota (opcional, fica na descrição e na auditoria)
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: corte retroactivo — stock do arranque sem abertura" style={field} maxLength={240} />
            </label>

            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--warn)', background: 'var(--warn-bg)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
              <Icon name="alert-triangle" size={16} color="var(--warn)" />
              <span>O valor é recalculado no momento da execução; se o stock ou a contabilidade mudarem entretanto, a operação falha por inteiro sem alterar nada e a pré-visualização deve ser revista.</span>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45, cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span>Revi o detalhe por produto e confirmo a regularização de <strong className="tnum" style={{ color: 'var(--text)' }}>{signedMoney(preview.divergence)}</strong>.</span>
            </label>

            {error ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 8, lineHeight: 1.45 }}>
                <Icon name="alert-triangle" size={15} />
                <span>{error}</span>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Fechar</Button>
              <Button type="button" onClick={submit} disabled={pending || !confirmed}>
                {pending ? 'A regularizar…' : 'Regularizar existências'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
