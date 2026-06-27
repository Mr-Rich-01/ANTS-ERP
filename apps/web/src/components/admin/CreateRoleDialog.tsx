'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
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
import { createRoleAction, type RoleState } from '@/app/(erp)/admin/actions';

interface Perm {
  key: string;
  module: string;
  description: string | null;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'A criar…' : 'Criar perfil'}
    </Button>
  );
}

export function CreateRoleDialog({ permissions }: { permissions: Perm[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<RoleState, FormData>(createRoleAction, {});

  const byModule = useMemo(() => {
    const m = new Map<string, Perm[]>();
    for (const p of permissions) {
      const arr = m.get(p.module) ?? [];
      arr.push(p);
      m.set(p.module, arr);
    }
    return [...m.entries()];
  }, [permissions]);

  // Fecha ao concluir com sucesso.
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="w-full">
          <Icon name="plus" size={15} />
          Criar perfil
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar perfil</DialogTitle>
          <DialogDescription>Defina o nome e as permissões. As permissões são validadas no servidor.</DialogDescription>
        </DialogHeader>

        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label htmlFor="cr-name">Nome</Label>
              <Input id="cr-name" name="name" placeholder="Ex.: Tesoureiro" required style={{ marginTop: 6 }} />
            </div>
            <div>
              <Label htmlFor="cr-desc">Descrição</Label>
              <Input id="cr-desc" name="description" placeholder="Opcional" style={{ marginTop: 6 }} />
            </div>
          </div>

          <div>
            <Label>Permissões</Label>
            <div style={{ marginTop: 8, maxHeight: 280, overflowY: 'auto', border: '1px solid var(--bd-soft)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {byModule.map(([module, perms]) => (
                <div key={module}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 7 }}>{module}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
                    {perms.map((p) => (
                      <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
                        <input type="checkbox" name="permissions" value={p.key} style={{ accentColor: '#13343b' }} />
                        <span className="font-mono" style={{ fontSize: 11.5, color: 'var(--text2)' }}>
                          {p.key}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
            <Submit />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
