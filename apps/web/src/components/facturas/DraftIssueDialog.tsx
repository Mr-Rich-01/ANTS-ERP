'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label } from '@ants/ui';
import { Icon } from '@/components/Icon';
import { issueInvoiceDraftAction } from '@/app/(erp)/facturas/actions';
import { fmt } from '@/lib/format';

function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function displayDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export interface DraftIssueDialogDraft {
  id: string;
  number: string;
  customerName: string;
  total: number;
  itemCount: number;
}

export function DraftIssueDialog({ draft, issueDate, trigger }: { draft: DraftIssueDialogDraft; issueDate: string; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(createIdempotencyKey());
      setError(null);
    }
  }, [open]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await issueInvoiceDraftAction({ draftId: draft.id, idempotencyKey, issueDate });
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
          <DialogTitle>Emitir factura</DialogTitle>
          <DialogDescription>
            Rascunho {draft.number} - {fmt(draft.total)}
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['Cliente', draft.customerName],
              ['Total', fmt(draft.total)],
              ['Itens', String(draft.itemCount)],
              ['Data de emissão', displayDate(issueDate)],
            ].map(([label, value]) => (
              <div key={label} style={{ border: '1px solid var(--bd-soft)', borderRadius: 8, padding: '9px 10px', minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor={`draft-issue-date-${draft.id}`}>Data de emissão</Label>
            <Input id={`draft-issue-date-${draft.id}`} type="date" value={issueDate} readOnly />
          </div>

          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--warn)', background: 'var(--warn-bg)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
            <Icon name="alert-triangle" size={16} color="var(--warn)" />
            <span>A emissão atribui o próximo número da série FT, valida e baixa o stock, actualiza o saldo do cliente e cria o lançamento contabilístico. Depois de emitida, a factura só pode ser corrigida por cancelamento/NC/ND.</span>
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
              {pending ? 'A emitir...' : 'Emitir factura'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
