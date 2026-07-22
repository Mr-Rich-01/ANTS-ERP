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
import { SearchCombobox, type ComboOption } from '@/components/ui/SearchCombobox';
import { applyAdvanceToInvoiceAction, createPaymentAction } from '@/app/(erp)/facturas/actions';

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

/** RA aberto do cliente da factura (S17) — alimenta o método «Adiantamento». */
export interface AdvanceOption {
  id: string;
  number: string;
  remaining: number;
}

/** Alinha o botão do combobox com os campos deste diálogo. */
const comboTriggerStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 8,
  border: '1px solid var(--field-bd)',
  background: 'var(--field)',
  padding: '0 10px',
  fontSize: 14,
};

function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function PaymentDialog({ invoiceId, outstanding, accounts, advances = [], trigger }: { invoiceId: string; outstanding: number; accounts: AccountOption[]; advances?: AdvanceOption[]; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState<'CASH' | 'MPESA' | 'EMOLA' | 'CARD' | 'TRANSFER' | 'ADVANCE'>('CASH');
  const [accountId, setAccountId] = useState('');
  const [advanceId, setAdvanceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const accountOptions: ComboOption[] = accounts.map((a) => ({ value: a.id, label: a.label }));
  const advanceOptions: ComboOption[] = advances.map((a) => ({ value: a.id, label: `${a.number} · saldo ${a.remaining.toFixed(2)} MT` }));
  const isAdvance = method === 'ADVANCE';
  const selectedAdvance = advances.find((a) => a.id === advanceId);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(createIdempotencyKey());
      setAmount(String(outstanding));
      setMethod('CASH');
      setAccountId('');
      setAdvanceId('');
      setError(null);
    }
  }, [open, outstanding]);

  const submit = () => {
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError('Indique um valor positivo.');
    if (isAdvance) {
      if (!advanceId) return setError('Seleccione o recibo de adiantamento a aplicar.');
      startTransition(async () => {
        const res = await applyAdvanceToInvoiceAction({ idempotencyKey, advanceId, invoiceId, amount: value });
        if (res.error) setError(res.error);
        else {
          setOpen(false);
          setIdempotencyKey('');
          router.refresh();
        }
      });
      return;
    }
    if (!accountId) return setError('Seleccione a conta de caixa, banco ou carteira móvel para concluir o pagamento.');
    startTransition(async () => {
      const res = await createPaymentAction({ idempotencyKey, invoiceId, amount: value, method, accountId });
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
              {advances.length > 0 && <option value="ADVANCE">Adiantamento</option>}
            </select>
          </div>
          {isAdvance ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label htmlFor="pay-advance">Recibo de adiantamento</Label>
              <SearchCombobox
                id="pay-advance"
                modal
                options={advanceOptions}
                value={advanceId}
                onChange={(v) => setAdvanceId(v)}
                placeholder="— Seleccione o adiantamento —"
                searchPlaceholder="Pesquisar RA…"
                emptyText="Sem adiantamentos abertos deste cliente."
                triggerStyle={comboTriggerStyle}
              />
              {selectedAdvance ? (
                <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                  Saldo remanescente do {selectedAdvance.number}: {selectedAdvance.remaining.toFixed(2)} MT — sem novo movimento de tesouraria.
                </span>
              ) : null}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label htmlFor="pay-account">Conta de tesouraria</Label>
              <SearchCombobox
                id="pay-account"
                modal
                options={accountOptions}
                value={accountId}
                onChange={(v) => setAccountId(v)}
                placeholder="— Seleccione a conta —"
                searchPlaceholder="Pesquisar conta…"
                emptyText="Sem contas para a pesquisa."
                triggerStyle={comboTriggerStyle}
              />
            </div>
          )}

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
