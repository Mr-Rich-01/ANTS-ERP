'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label } from '@ants/ui';
import { Icon } from '@/components/Icon';
import { discardInvoiceDraftAction } from '@/app/(erp)/facturas/actions';
import { fmt } from '@/lib/format';

export interface DraftDiscardDialogDraft {
  id: string;
  number: string;
  customerName: string;
  total: number;
}

export function DraftDiscardDialog({ draft, trigger }: { draft: DraftDiscardDialogDraft; trigger: React.ReactNode }) {
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
      const res = await discardInvoiceDraftAction({ draftId: draft.id, reason });
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
          <DialogTitle>Descartar rascunho</DialogTitle>
          <DialogDescription>
            Rascunho {draft.number} - {draft.customerName} - {fmt(draft.total)}
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--bd-soft)', background: 'var(--card2)', color: 'var(--text2)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
            <Icon name="info" size={16} />
            <span>O rascunho nunca gerou stock, saldos nem contabilidade — não há estorno a fazer. Fica registado no histórico como descartado, com utilizador, data, hora e motivo.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor={`draft-discard-reason-${draft.id}`}>Motivo</Label>
            <textarea
              id={`draft-discard-reason-${draft.id}`}
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
              {pending ? 'A descartar...' : 'Descartar rascunho'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
