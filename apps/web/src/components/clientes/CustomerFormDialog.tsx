'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
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
import {
  createCustomerAction,
  updateCustomerAction,
  type CustomerFormState,
} from '@/app/(erp)/clientes/actions';

export interface CustomerFormValues {
  id?: string;
  name?: string;
  type?: 'INDIVIDUAL' | 'COMPANY';
  nuit?: string | null;
  email?: string | null;
  phone?: string | null;
  segment?: string | null;
  province?: string | null;
  district?: string | null;
  address?: string | null;
  creditLimit?: number;
  paymentTermDays?: number;
  notes?: string | null;
}

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

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'A guardar…' : label}
    </Button>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>;
}

interface Props {
  mode: 'create' | 'edit';
  trigger: React.ReactNode;
  initial?: CustomerFormValues;
}

export function CustomerFormDialog({ mode, trigger, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const action = mode === 'create' ? createCustomerAction : updateCustomerAction;
  const [state, formAction] = useFormState<CustomerFormState, FormData>(action, {});

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  const v = initial ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent style={{ maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Novo cliente' : 'Editar cliente'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Registe um novo cliente da empresa activa.'
              : 'Actualize os dados do cliente.'}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {mode === 'edit' && <input type="hidden" name="id" value={v.id ?? ''} />}

          <Field>
            <Label htmlFor="cf-name">Nome</Label>
            <Input id="cf-name" name="name" placeholder="Nome ou designação social" required defaultValue={v.name ?? ''} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="cf-type">Tipo</Label>
              <select id="cf-type" name="type" style={selectStyle} defaultValue={v.type ?? 'COMPANY'}>
                <option value="COMPANY">Empresa</option>
                <option value="INDIVIDUAL">Particular</option>
              </select>
            </Field>
            <Field>
              <Label htmlFor="cf-nuit">NUIT</Label>
              <Input id="cf-nuit" name="nuit" placeholder="9 dígitos" defaultValue={v.nuit ?? ''} className="font-mono" />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="cf-phone">Telefone</Label>
              <Input id="cf-phone" name="phone" placeholder="+258 …" defaultValue={v.phone ?? ''} />
            </Field>
            <Field>
              <Label htmlFor="cf-email">Email</Label>
              <Input id="cf-email" name="email" type="email" placeholder="nome@empresa.co.mz" defaultValue={v.email ?? ''} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="cf-segment">Segmento</Label>
              <Input id="cf-segment" name="segment" placeholder="ex.: Grossista" defaultValue={v.segment ?? ''} />
            </Field>
            <Field>
              <Label htmlFor="cf-province">Província</Label>
              <Input id="cf-province" name="province" placeholder="ex.: Maputo Cidade" defaultValue={v.province ?? ''} />
            </Field>
          </div>

          <Field>
            <Label htmlFor="cf-address">Endereço</Label>
            <Input id="cf-address" name="address" placeholder="Av., nº, bairro" defaultValue={v.address ?? ''} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="cf-credit">Limite de crédito (MT)</Label>
              <Input id="cf-credit" name="creditLimit" type="number" min={0} step="0.01" className="tnum" defaultValue={v.creditLimit ?? 0} />
            </Field>
            <Field>
              <Label htmlFor="cf-term">Prazo de pagamento (dias)</Label>
              <Input id="cf-term" name="paymentTermDays" type="number" min={0} step={1} className="tnum" defaultValue={v.paymentTermDays ?? 0} />
            </Field>
          </div>

          {state.error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10 }}>
              <Icon name="alert-triangle" size={15} />
              {state.error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Submit label={mode === 'create' ? 'Criar cliente' : 'Guardar'} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
