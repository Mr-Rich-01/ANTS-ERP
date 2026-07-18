'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Label } from '@ants/ui';
import { Icon } from '@/components/Icon';
import { approvePurchaseOrderAction, rejectPurchaseOrderAction } from '@/app/(erp)/compras/actions';

export interface PurchaseApprovalOrder {
  id: string;
  number: string;
  supplierName: string;
  totalStr: string;
}

export function PurchaseApprovalDialog({ order, mode, trigger }: { order: PurchaseApprovalOrder; mode: 'approve' | 'reject'; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isApprove = mode === 'approve';

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = () => {
    setError(null);
    if (!isApprove && reason.trim().length < 10) return setError('Indique o motivo da rejeição (mínimo 10 caracteres).');
    startTransition(async () => {
      const res = isApprove ? await approvePurchaseOrderAction(order.id) : await rejectPurchaseOrderAction(order.id, reason);
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
          <DialogTitle>{isApprove ? 'Aprovar ordem de compra' : 'Rejeitar ordem de compra'}</DialogTitle>
          <DialogDescription>
            {order.number} · {order.supplierName} · {order.totalStr}
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {isApprove ? (
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--bd-soft)', background: 'var(--card2)', color: 'var(--text2)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
              <Icon name="check-circle-2" size={16} color="var(--ok)" />
              <span>
                A aprovação regista o seu nome e a data e devolve a ordem ao solicitante, pronta para a recepção de mercadorias.
                Não gera lançamentos contabilísticos, movimentos de stock nem de tesouraria.
              </span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Label htmlFor={`po-reject-reason-${order.id}`}>Motivo da rejeição (obrigatório, mínimo 10 caracteres)</Label>
                <textarea
                  id={`po-reject-reason-${order.id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={4}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '10px 11px', fontSize: 14, resize: 'vertical', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--warn)', background: 'var(--warn-bg)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
                <Icon name="alert-triangle" size={16} color="var(--warn)" />
                <span>A rejeição é definitiva: a ordem fica no histórico como Rejeitada, com o seu nome, a data e o motivo, e não poderá ser aprovada nem recepcionada. Se necessário, crie uma nova ordem.</span>
              </div>
            </>
          )}

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
              {pending ? (isApprove ? 'A aprovar…' : 'A rejeitar…') : isApprove ? 'Aprovar ordem' : 'Rejeitar ordem'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
