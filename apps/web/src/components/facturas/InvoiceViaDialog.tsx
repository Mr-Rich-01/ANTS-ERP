'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label } from '@ants/ui';
import { Icon } from '@/components/Icon';
import { emitInvoiceViaAction } from '@/app/(erp)/facturas/actions';

export interface InvoiceViaDialogInvoice {
  id: string;
  number: string;
  customerName: string;
  /** Vias adicionais já emitidas (0 = só o original). */
  viaCount: number;
  isVd: boolean;
}

const ORDINAL: Record<number, string> = { 2: 'segunda', 3: 'terceira', 4: 'quarta', 5: 'quinta' };

/**
 * Emissão de via adicional do documento (S15). A via não cria documento novo, não muda
 * numeração, valores, datas nem estado — apenas regista quem/quando/porquê e abre a
 * impressão com o banner de via em destaque.
 */
export function InvoiceViaDialog({ invoice, trigger }: { invoice: InvoiceViaDialogInvoice; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const nextVia = invoice.viaCount + 2; // original = 1.ª via
  const nextViaLabel = ORDINAL[nextVia] ? `${ORDINAL[nextVia]} via` : `${nextVia}.ª via`;

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await emitInvoiceViaAction({ invoiceId: invoice.id, reason: reason.trim() || undefined });
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        router.push(`/facturas/documento?id=${invoice.id}&via=${res.via}`);
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent style={{ maxWidth: 500 }}>
        <DialogHeader>
          <DialogTitle>Emitir {nextViaLabel}</DialogTitle>
          <DialogDescription>
            {invoice.isVd ? 'VD' : 'Factura'} {invoice.number} - {invoice.customerName}
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--bd-soft)', background: 'var(--card2)', color: 'var(--text2)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
            <Icon name="info" size={16} />
            <span>
              A via é uma reimpressão identificada do documento original: não cria documento novo, não altera numeração,
              valores, data de emissão, produtos nem estado. A emissão fica no histórico com o número da via, data/hora e utilizador.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor={`invoice-via-reason-${invoice.id}`}>Motivo (opcional)</Label>
            <textarea
              id={`invoice-via-reason-${invoice.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ex.: extravio do original pelo cliente"
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
              {pending ? 'A emitir...' : `Emitir ${nextViaLabel}`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
