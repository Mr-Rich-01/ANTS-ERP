'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@ants/ui';
import { Icon } from '@/components/Icon';
import { createPaymentAction } from '@/app/(erp)/facturas/actions';

const selectStyle: React.CSSProperties = {
  height: 40,
  width: '100%',
  borderRadius: 8,
  border: '1px solid var(--field-bd)',
  background: 'var(--field)',
  padding: '0 10px',
  fontSize: 14,
  color: 'var(--text)',
  outline: 'none',
};

export function PaymentDialog({ invoiceId, outstanding, trigger }: { invoiceId: string; outstanding: number; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState<'CASH' | 'MPESA' | 'EMOLA' | 'CARD' | 'TRANSFER'>('CASH');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(String(outstanding));
      setError(null);
    }
  }, [open, outstanding]);

  const submit = () => {
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError('Indique um valor positivo.');
    startTransition(async () => {
      const res = await createPaymentAction({ invoiceId, amount: value, method });
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
      <DialogContent style={{ maxWidth: 440 }}>
        <DialogHeader>
          <DialogTitle>Registar recibo</DialogTitle>
          <DialogDescription>Recebimento sobre a factura. Em dívida: {outstanding.toFixed(2)} MT.</DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="pay-amount">Valor (MT)</Label>
            <Input id="pay-amount" type="number" min={0} step="0.01" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="pay-method">Forma de pagamento</Label>
            <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} style={selectStyle}>
              <option value="CASH">Dinheiro</option>
              <option value="MPESA">M-Pesa</option>
              <option value="EMOLA">e-Mola</option>
              <option value="CARD">Cartão</option>
              <option value="TRANSFER">Transferência</option>
            </select>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10 }}>
              <Icon name="alert-triangle" size={15} />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? 'A registar…' : 'Registar recibo'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
