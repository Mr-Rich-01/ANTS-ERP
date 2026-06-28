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
  createProductAction,
  updateProductAction,
  type ProductFormState,
} from '@/app/(erp)/produtos/actions';

export interface ProductFormValues {
  id?: string;
  sku?: string;
  name?: string;
  category?: string | null;
  brand?: string | null;
  unit?: string;
  salePrice?: number;
  avgCost?: number;
  taxRate?: number;
  minStock?: number;
  barcode?: string | null;
}

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
  initial?: ProductFormValues;
}

export function ProductFormDialog({ mode, trigger, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const action = mode === 'create' ? createProductAction : updateProductAction;
  const [state, formAction] = useFormState<ProductFormState, FormData>(action, {});

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
          <DialogTitle>{mode === 'create' ? 'Novo produto' : 'Editar produto'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Registe um novo produto no catálogo. O stock entra via recepção ou inventário.'
              : 'Actualize os dados do produto.'}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {mode === 'edit' && <input type="hidden" name="id" value={v.id ?? ''} />}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="pf-sku">SKU</Label>
              <Input id="pf-sku" name="sku" placeholder="ANTS-…" required defaultValue={v.sku ?? ''} className="font-mono" />
            </Field>
            <Field>
              <Label htmlFor="pf-unit">Unidade</Label>
              <Input id="pf-unit" name="unit" placeholder="un" defaultValue={v.unit ?? 'un'} />
            </Field>
          </div>

          <Field>
            <Label htmlFor="pf-name">Nome</Label>
            <Input id="pf-name" name="name" placeholder="Designação do produto" required defaultValue={v.name ?? ''} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="pf-category">Categoria</Label>
              <Input id="pf-category" name="category" placeholder="ex.: Mercearia" defaultValue={v.category ?? ''} />
            </Field>
            <Field>
              <Label htmlFor="pf-brand">Marca</Label>
              <Input id="pf-brand" name="brand" placeholder="ex.: Tio" defaultValue={v.brand ?? ''} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field>
              <Label htmlFor="pf-price">Preço (MT)</Label>
              <Input id="pf-price" name="salePrice" type="number" min={0} step="0.01" className="tnum" defaultValue={v.salePrice ?? 0} />
            </Field>
            <Field>
              <Label htmlFor="pf-cost">Custo (MT)</Label>
              <Input id="pf-cost" name="avgCost" type="number" min={0} step="0.01" className="tnum" defaultValue={v.avgCost ?? 0} />
            </Field>
            <Field>
              <Label htmlFor="pf-min">Stock mín.</Label>
              <Input id="pf-min" name="minStock" type="number" min={0} step={1} className="tnum" defaultValue={v.minStock ?? 0} />
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
            <Submit label={mode === 'create' ? 'Criar produto' : 'Guardar'} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
