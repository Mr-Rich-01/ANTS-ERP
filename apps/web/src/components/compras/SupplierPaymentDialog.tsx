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
import { createSupplierPaymentAction } from '@/app/(erp)/compras/actions';
import { canSubmitSupplierPayment, supplierPaymentInitialAccountId } from '@ants/shared';

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

export interface AccountOption {
  id: string;
  label: string;
}

function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function SupplierPaymentDialog({ supplierId, purchaseOrderId, suggested, accounts = [], trigger }: { supplierId: string; purchaseOrderId?: string; suggested: number; accounts?: AccountOption[]; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [amount, setAmount] = useState(String(suggested));
  const [method, setMethod] = useState<'CASH' | 'MPESA' | 'EMOLA' | 'CARD' | 'TRANSFER'>('TRANSFER');
  const [accountId, setAccountId] = useState(() => supplierPaymentInitialAccountId());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(createIdempotencyKey());
      setAmount(String(suggested));
      setAccountId(supplierPaymentInitialAccountId());
      setError(null);
    }
  }, [open, suggested]);

  const canSubmit = canSubmitSupplierPayment({ amount, accountId, idempotencyKey, pending });

  const submit = () => {
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError('Indique um valor positivo.');
    if (!accountId) return setError('Seleccione a conta financeira para concluir o pagamento.');
    startTransition(async () => {
      const res = await createSupplierPaymentAction({ idempotencyKey, supplierId, purchaseOrderId, amount: value, method, accountId });
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
      <DialogContent style={{ maxWidth: 440 }}>
        <DialogHeader>
          <DialogTitle>Registar pagamento</DialogTitle>
          <DialogDescription>Pagamento ao fornecedor. Saldo a pagar: {suggested.toFixed(2)} MT.</DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="sp-amount">Valor (MT)</Label>
            <Input id="sp-amount" type="number" min={0} step="0.01" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="sp-method">Forma de pagamento</Label>
            <select id="sp-method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} style={selectStyle}>
              <option value="TRANSFER">Transferência</option>
              <option value="CASH">Dinheiro</option>
              <option value="MPESA">M-Pesa</option>
              <option value="EMOLA">e-Mola</option>
              <option value="CARD">Cartão</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="sp-account">Conta de tesouraria</Label>
            <select id="sp-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={selectStyle}>
              <option value="">— Seleccione a conta —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
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
            <Button type="button" onClick={submit} disabled={!canSubmit}>
              {pending ? 'A registar…' : 'Registar pagamento'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
