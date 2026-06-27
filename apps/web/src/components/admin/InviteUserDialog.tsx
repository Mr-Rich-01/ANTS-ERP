'use client';

import { useState } from 'react';
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
import { inviteUserAction, type InviteState } from '@/app/(erp)/admin/actions';

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

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'A criar…' : 'Convidar'}
    </Button>
  );
}

export function InviteUserDialog({ roles }: { roles: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<InviteState, FormData>(inviteUserAction, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Icon name="user-plus" size={15} />
          Convidar utilizador
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar utilizador</DialogTitle>
          <DialogDescription>O utilizador entra com uma palavra-passe temporária e troca-a no 1.º acesso.</DialogDescription>
        </DialogHeader>

        {state.ok ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '10px 12px', borderRadius: 10 }}>
              <Icon name="check-circle-2" size={16} />
              {state.userName} foi criado.
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
              Palavra-passe temporária:{' '}
              <strong className="font-mono" style={{ color: 'var(--text)' }}>
                {state.tempPassword}
              </strong>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Concluir
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div>
              <Label htmlFor="iu-name">Nome</Label>
              <Input id="iu-name" name="name" placeholder="Nome completo" required style={{ marginTop: 6 }} />
            </div>
            <div>
              <Label htmlFor="iu-email">Email</Label>
              <Input id="iu-email" name="email" type="email" placeholder="nome@empresa.co.mz" required style={{ marginTop: 6 }} />
            </div>
            <div>
              <Label htmlFor="iu-role">Perfil</Label>
              <select id="iu-role" name="roleId" style={{ ...selectStyle, marginTop: 6 }} defaultValue="">
                <option value="">— Sem perfil —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
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
        )}
      </DialogContent>
    </Dialog>
  );
}
