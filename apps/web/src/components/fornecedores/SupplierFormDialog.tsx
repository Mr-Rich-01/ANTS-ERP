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
  createSupplierAction,
  updateSupplierAction,
  type SupplierFormState,
} from '@/app/(erp)/fornecedores/actions';

export interface SupplierFormValues {
  id?: string;
  name?: string;
  type?: 'INDIVIDUAL' | 'COMPANY';
  nuit?: string | null;
  email?: string | null;
  phone?: string | null;
  category?: string | null;
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
  initial?: SupplierFormValues;
}

export function SupplierFormDialog({ mode, trigger, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const action = mode === 'create' ? createSupplierAction : updateSupplierAction;
  const [state, formAction] = useFormState<SupplierFormState, FormData>(action, {});

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
          <DialogTitle>{mode === 'create' ? 'Novo fornecedor' : 'Editar fornecedor'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Registe um novo fornecedor da empresa activa.'
              : 'Actualize os dados do fornecedor.'}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {mode === 'edit' && <input type="hidden" name="id" value={v.id ?? ''} />}

          <Field>
            <Label htmlFor="sf-name">Nome</Label>
            <Input id="sf-name" name="name" placeholder="Nome ou designação social" required defaultValue={v.name ?? ''} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="sf-type">Tipo</Label>
              <select id="sf-type" name="type" style={selectStyle} defaultValue={v.type ?? 'COMPANY'}>
                <option value="COMPANY">Empresa</option>
                <option value="INDIVIDUAL">Particular</option>
              </select>
            </Field>
            <Field>
              <Label htmlFor="sf-nuit">NUIT</Label>
              <Input id="sf-nuit" name="nuit" placeholder="9 dígitos" defaultValue={v.nuit ?? ''} className="font-mono" />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="sf-phone">Telefone</Label>
              <Input id="sf-phone" name="phone" placeholder="+258 …" defaultValue={v.phone ?? ''} />
            </Field>
            <Field>
              <Label htmlFor="sf-email">Email</Label>
              <Input id="sf-email" name="email" type="email" placeholder="nome@empresa.co.mz" defaultValue={v.email ?? ''} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="sf-category">Categoria</Label>
              <Input id="sf-category" name="category" placeholder="ex.: Construção" defaultValue={v.category ?? ''} />
            </Field>
            <Field>
              <Label htmlFor="sf-province">Província</Label>
              <Input id="sf-province" name="province" placeholder="ex.: Maputo Cidade" defaultValue={v.province ?? ''} />
            </Field>
          </div>

          <Field>
            <Label htmlFor="sf-address">Endereço</Label>
            <Input id="sf-address" name="address" placeholder="Av., nº, bairro" defaultValue={v.address ?? ''} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="sf-credit">Crédito concedido (MT)</Label>
              <Input id="sf-credit" name="creditLimit" type="number" min={0} step="0.01" className="tnum" defaultValue={v.creditLimit ?? 0} />
            </Field>
            <Field>
              <Label htmlFor="sf-term">Prazo de pagamento (dias)</Label>
              <Input id="sf-term" name="paymentTermDays" type="number" min={0} step={1} className="tnum" defaultValue={v.paymentTermDays ?? 0} />
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
            <Submit label={mode === 'create' ? 'Criar fornecedor' : 'Guardar'} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
