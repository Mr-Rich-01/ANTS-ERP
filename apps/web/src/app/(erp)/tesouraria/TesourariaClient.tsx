'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label } from '@ants/ui';
import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid, type KpiCardData } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import { createAccountAction, recordMovementAction, transferAction, reverseMovementAction, setAccountStatusAction } from '@/app/(erp)/tesouraria/actions';

export interface AccountView {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  reference: string;
  balanceStr: string;
  status: 'ACTIVE' | 'INACTIVE';
}
export interface MovementView {
  id: string;
  when: string;
  accountName: string;
  category: string;
  description: string;
  document: string;
  amountStr: string;
  amountColor: string;
  status: 'ACTIVE' | 'REVERSED';
  reversal: boolean;
  reversible: boolean;
}
export interface TreasuryPerms {
  createMovement: boolean;
  transfer: boolean;
  manageAccounts: boolean;
  reverse: boolean;
  viewReports: boolean;
}

const th: React.CSSProperties = { padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd-soft)' };
const selectStyle: React.CSSProperties = { height: 40, width: '100%', borderRadius: 8, border: '1px solid var(--field-bd)', background: 'var(--field)', padding: '0 10px', fontSize: 14, color: 'var(--text)', outline: 'none' };
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const toolBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' };
const accIcon: Record<string, string> = { CASH: 'wallet', BANK: 'landmark', MOBILE: 'smartphone', OTHER: 'circle-dollar-sign' };

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10 }}>
      <Icon name="alert-triangle" size={15} />
      {msg}
    </div>
  );
}

function MovementDialog({ accounts, trigger }: { accounts: AccountView[]; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [flow, setFlow] = useState<'IN' | 'OUT'>('OUT');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Despesa');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await recordMovementAction({ accountId, flow, amount: Number(amount), category, description: description || undefined });
      if (res.error) setError(res.error);
      else { setOpen(false); setAmount(''); setDescription(''); router.refresh(); }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent style={{ maxWidth: 460 }}>
        <DialogHeader>
          <DialogTitle>Novo movimento</DialogTitle>
          <DialogDescription>Entrada ou saída manual numa conta.</DialogDescription>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={field}>
            <Label htmlFor="mv-acc">Conta</Label>
            <select id="mv-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={selectStyle}>
              {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={field}>
              <Label htmlFor="mv-flow">Tipo</Label>
              <select id="mv-flow" value={flow} onChange={(e) => setFlow(e.target.value as 'IN' | 'OUT')} style={selectStyle}>
                <option value="OUT">Saída</option>
                <option value="IN">Entrada</option>
              </select>
            </div>
            <div style={field}>
              <Label htmlFor="mv-amount">Valor (MT)</Label>
              <Input id="mv-amount" type="number" min={0} step="0.01" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div style={field}>
            <Label htmlFor="mv-cat">Categoria</Label>
            <Input id="mv-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="ex.: Despesa, Receita, Depósito" />
          </div>
          <div style={field}>
            <Label htmlFor="mv-desc">Descrição</Label>
            <Input id="mv-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
          </div>
          {error && <ErrorBox msg={error} />}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={submit} disabled={pending}>{pending ? 'A registar…' : 'Registar'}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ accounts, trigger }: { accounts: AccountView[]; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [fromAccountId, setFrom] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setTo] = useState(accounts[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await transferAction({ fromAccountId, toAccountId, amount: Number(amount) });
      if (res.error) setError(res.error);
      else { setOpen(false); setAmount(''); router.refresh(); }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent style={{ maxWidth: 460 }}>
        <DialogHeader>
          <DialogTitle>Transferência entre contas</DialogTitle>
          <DialogDescription>Move dinheiro de uma conta para outra (não é receita nem despesa).</DialogDescription>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={field}>
            <Label htmlFor="tr-from">De</Label>
            <select id="tr-from" value={fromAccountId} onChange={(e) => setFrom(e.target.value)} style={selectStyle}>
              {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name} · {a.balanceStr}</option>))}
            </select>
          </div>
          <div style={field}>
            <Label htmlFor="tr-to">Para</Label>
            <select id="tr-to" value={toAccountId} onChange={(e) => setTo(e.target.value)} style={selectStyle}>
              {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </div>
          <div style={field}>
            <Label htmlFor="tr-amount">Valor (MT)</Label>
            <Input id="tr-amount" type="number" min={0} step="0.01" className="tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {error && <ErrorBox msg={error} />}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={submit} disabled={pending}>{pending ? 'A transferir…' : 'Transferir'}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [type, setType] = useState<'CASH' | 'BANK' | 'MOBILE' | 'OTHER'>('BANK');
  const [reference, setReference] = useState('');
  const [openingBalance, setOpening] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await createAccountAction({ name, type, reference: reference || undefined, openingBalance: Number(openingBalance) });
      if (res.error) setError(res.error);
      else { setOpen(false); setName(''); setReference(''); setOpening('0'); router.refresh(); }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent style={{ maxWidth: 460 }}>
        <DialogHeader>
          <DialogTitle>Nova conta</DialogTitle>
          <DialogDescription>Banco, caixa ou carteira móvel.</DialogDescription>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={field}>
            <Label htmlFor="ac-name">Nome</Label>
            <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Caixa 02, Standard Bank" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={field}>
              <Label htmlFor="ac-type">Tipo</Label>
              <select id="ac-type" value={type} onChange={(e) => setType(e.target.value as typeof type)} style={selectStyle}>
                <option value="BANK">Conta bancária</option>
                <option value="CASH">Caixa</option>
                <option value="MOBILE">Carteira móvel</option>
                <option value="OTHER">Outra</option>
              </select>
            </div>
            <div style={field}>
              <Label htmlFor="ac-open">Saldo inicial (MT)</Label>
              <Input id="ac-open" type="number" step="0.01" className="tnum" value={openingBalance} onChange={(e) => setOpening(e.target.value)} />
            </div>
          </div>
          <div style={field}>
            <Label htmlFor="ac-ref">Referência</Label>
            <Input id="ac-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="IBAN / nº conta / nº telemóvel" />
          </div>
          {error && <ErrorBox msg={error} />}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={submit} disabled={pending}>{pending ? 'A criar…' : 'Criar conta'}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountToggle({ account }: { account: AccountView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = account.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  return (
    <button
      onClick={() => start(async () => { await setAccountStatusAction(account.id, next); router.refresh(); })}
      disabled={pending}
      title={account.status === 'ACTIVE' ? 'Desactivar conta' : 'Activar conta'}
      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      <Icon name={account.status === 'ACTIVE' ? 'toggle-right' : 'toggle-left'} size={15} />
      {account.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
    </button>
  );
}

function ReverseButton({ movementId }: { movementId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await reverseMovementAction(movementId); router.refresh(); })}
      disabled={pending}
      title="Estornar movimento"
      style={{ border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--bad)', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 7, display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      <Icon name="undo-2" size={13} />
      {pending ? '…' : 'Estornar'}
    </button>
  );
}

export function TesourariaClient({ kpis, accounts, movements, perms }: { kpis: KpiCardData[]; accounts: AccountView[]; movements: MovementView[]; perms: TreasuryPerms }) {
  const activeAccounts = accounts.filter((a) => a.status === 'ACTIVE');
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KpiGrid>
        {kpis.map((k) => (<KpiCard key={k.label} {...k} />))}
      </KpiGrid>

      {/* Contas */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Contas</div>
          <div style={{ flex: 1 }} />
          {perms.viewReports && (
            <Link href="/tesouraria/fecho" style={{ ...toolBtn, color: 'var(--accent-fg)' }}>
              <Icon name="file-text" size={15} />
              Relatório diário
            </Link>
          )}
          {perms.createMovement && <MovementDialog accounts={activeAccounts} trigger={<button style={toolBtn}><Icon name="plus-circle" size={15} />Movimento</button>} />}
          {perms.transfer && <TransferDialog accounts={activeAccounts} trigger={<button style={toolBtn}><Icon name="arrow-left-right" size={15} />Transferência</button>} />}
          {perms.manageAccounts && <AccountDialog trigger={<button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}><Icon name="plus" size={15} />Nova conta</button>} />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>
          {accounts.map((a) => {
            const inactive = a.status === 'INACTIVE';
            return (
              <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 13, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, opacity: inactive ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 8, borderRadius: 9, display: 'inline-flex' }}>
                    <Icon name={accIcon[a.type] ?? 'circle-dollar-sign'} size={16} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {a.name}
                      {inactive && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', background: 'var(--bd-soft)', padding: '1px 6px', borderRadius: 20 }}>Inactiva</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{a.typeLabel}{a.reference ? ` · ${a.reference}` : ''}</div>
                  </div>
                </div>
                <div className="tnum" style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{a.balanceStr}</div>
                {perms.manageAccounts && <AccountToggle account={a} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Movimentos */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="history" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Movimentos recentes</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Data</th>
                <th style={th}>Conta</th>
                <th style={th}>Categoria</th>
                <th style={th}>Descrição</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                <th style={{ ...th, width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Ainda não há movimentos.</td>
                </tr>
              ) : (
                movements.map((m) => {
                  const reversed = m.status === 'REVERSED';
                  return (
                    <tr key={m.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)', opacity: reversed ? 0.55 : 1 }}>
                      <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{m.when}</td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>{m.accountName}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>
                        {m.category}
                        {reversed && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', background: 'var(--bd-soft)', padding: '1px 6px', borderRadius: 20, marginLeft: 6 }}>Estornado</span>}
                        {m.reversal && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--info)', background: 'var(--info-bg)', padding: '1px 6px', borderRadius: 20, marginLeft: 6 }}>Estorno</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>
                        {m.description}
                        {m.document ? <span className="font-mono" style={{ color: 'var(--text3)' }}> · {m.document}</span> : null}
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: m.amountColor, whiteSpace: 'nowrap', textDecoration: reversed ? 'line-through' : undefined }}>{m.amountStr}</td>
                      <td style={{ padding: '11px 10px', textAlign: 'right' }}>
                        {perms.reverse && m.reversible && <ReverseButton movementId={m.id} />}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
