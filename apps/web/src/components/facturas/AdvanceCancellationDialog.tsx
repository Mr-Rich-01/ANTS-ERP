'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label } from '@ants/ui';
import { Icon } from '@/components/Icon';
import { cancelCustomerAdvanceAction } from '@/app/(erp)/facturas/actions';
import { fmt } from '@/lib/format';

function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function displayDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export interface AdvanceCancellationDialogAdvance {
  id: string;
  number: string;
  amount: number;
  customerName: string;
  treasuryAccountName: string;
}

/** Cancelamento de RA intacto (S18) — só elegível sem aplicações activas nem devoluções. */
export function AdvanceCancellationDialog({ advance, cancellationDate, trigger }: { advance: AdvanceCancellationDialogAdvance; cancellationDate: string; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(createIdempotencyKey());
      setReason('');
      setConfirmed(false);
      setError(null);
    }
  }, [open]);

  const submit = () => {
    setError(null);
    if (reason.trim().length < 10) return setError('Indique um motivo com pelo menos 10 caracteres.');
    if (!confirmed) return setError('Confirme o cancelamento do recibo de adiantamento.');
    startTransition(async () => {
      const res = await cancelCustomerAdvanceAction({
        advanceId: advance.id,
        idempotencyKey,
        cancellationReason: reason,
        cancellationDate,
      });
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        setIdempotencyKey('');
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent style={{ maxWidth: 540 }}>
        <DialogHeader>
          <DialogTitle>Cancelar recibo de adiantamento</DialogTitle>
          <DialogDescription>{advance.number} - {fmt(advance.amount)}</DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['Cliente', advance.customerName],
              ['Conta financeira', advance.treasuryAccountName],
              ['Valor a devolver da conta', fmt(advance.amount)],
              ['Data do cancelamento', displayDate(cancellationDate)],
            ].map(([label, value]) => (
              <div key={label} style={{ border: '1px solid var(--bd-soft)', borderRadius: 8, padding: '9px 10px', minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor={`advance-cancel-date-${advance.id}`}>Data do cancelamento</Label>
            <Input id={`advance-cancel-date-${advance.id}`} type="date" value={cancellationDate} readOnly />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor={`advance-cancel-reason-${advance.id}`}>Motivo</Label>
            <textarea
              id={`advance-cancel-reason-${advance.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={4}
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '10px 11px', fontSize: 14, resize: 'vertical', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--warn)', background: 'var(--warn-bg)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
            <Icon name="alert-triangle" size={16} color="var(--warn)" />
            <span>Esta operação cancelará o recibo de adiantamento, criará um movimento inverso de Tesouraria (saída do valor recebido) e um lançamento contabilístico inverso. Só é possível com o adiantamento intacto — sem aplicações activas em facturas nem devoluções. O documento original permanecerá no histórico.</span>
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--text2)' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            Confirmo o cancelamento integral deste recibo de adiantamento.
          </label>

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
              {pending ? 'A cancelar...' : 'Cancelar adiantamento'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
