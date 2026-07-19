'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { civilDateInTimeZone, round2 } from '@ants/shared';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@ants/ui';
import type { JournalEntryItem } from '@ants/domain';
import { Icon } from '@/components/Icon';
import { SearchCombobox } from '@/components/ui/SearchCombobox';
import { fmt, fmtNoSymbol } from '@/lib/format';
import {
  createJournalEntryDraftAction,
  updateJournalEntryDraftAction,
  deleteJournalEntryDraftAction,
  postJournalEntryAction,
  reverseJournalEntryAction,
} from './actions';

interface AccountOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface JournalOption {
  id: string;
  code: string;
  name: string;
}

interface FormLine {
  key: number;
  ledgerAccountId: string;
  description: string;
  debit: string;
  credit: string;
}

const panel: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' };
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', background: 'var(--card2)', borderBottom: '1px solid var(--bd-soft)', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: 'var(--text2)', borderTop: '1px solid var(--bd-soft2)', verticalAlign: 'top' };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: '1px solid var(--field-bd)', background: 'var(--field)', color: 'var(--text)', padding: '0 10px', fontSize: 12.5, outline: 'none', minWidth: 0, width: '100%' };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text3)' };
const smallBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };

function datePt(value: string | null | undefined): string {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

let lineKeySeq = 1;
function emptyLine(): FormLine {
  return { key: lineKeySeq++, ledgerAccountId: '', description: '', debit: '', credit: '' };
}

function parseAmount(v: string): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 8, lineHeight: 1.45 }}>
      <Icon name="alert-triangle" size={15} />
      <span>{message}</span>
    </div>
  );
}

function statusChip(status: JournalEntryItem['status']) {
  const map = {
    DRAFT: { label: 'Rascunho', color: 'var(--info)', bg: 'var(--info-bg)' },
    POSTED: { label: 'Confirmado', color: 'var(--ok)', bg: 'var(--ok-bg)' },
    REVERSED: { label: 'Estornado', color: 'var(--warn)', bg: 'var(--warn-bg)' },
  } as const;
  const s = map[status];
  return <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: 7, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

export function LancamentosClient({
  accounts,
  journals,
  drafts,
  posted,
  canPrepare,
  canPost,
  canReverse,
}: {
  accounts: AccountOption[];
  journals: JournalOption[];
  drafts: JournalEntryItem[];
  posted: JournalEntryItem[];
  canPrepare: boolean;
  canPost: boolean;
  canReverse: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ── Formulário de rascunho (criar/editar) ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [journalId, setJournalId] = useState(journals[0]?.id ?? '');
  const [entryDate, setEntryDate] = useState(() => civilDateInTimeZone());
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<FormLine[]>(() => [emptyLine(), emptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}${a.isActive ? '' : ' (inactiva)'}` })),
    [accounts],
  );

  const totalDebit = round2(lines.reduce((s, l) => s + parseAmount(l.debit), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + parseAmount(l.credit), 0));
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  const resetForm = () => {
    setEditingId(null);
    setDescription('');
    setReference('');
    setEntryDate(civilDateInTimeZone());
    setLines([emptyLine(), emptyLine()]);
    setFormError(null);
  };

  const loadDraftIntoForm = (draft: JournalEntryItem) => {
    setEditingId(draft.id);
    setJournalId(draft.journalId);
    setEntryDate(draft.entryDate);
    setDescription(draft.description);
    setReference(draft.reference ?? '');
    setLines(
      (draft.lines ?? []).map((l) => ({
        key: lineKeySeq++,
        ledgerAccountId: l.ledgerAccountId,
        description: l.description ?? '',
        debit: l.debit ? String(l.debit) : '',
        credit: l.credit ? String(l.credit) : '',
      })),
    );
    setFormError(null);
    setFormOk(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setLine = (key: number, patch: Partial<FormLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const submitDraft = () => {
    setFormError(null);
    setFormOk(null);
    const input = {
      journalId,
      entryDate,
      description,
      reference: reference || undefined,
      lines: lines.map((l) => ({
        ledgerAccountId: l.ledgerAccountId,
        description: l.description || undefined,
        debit: parseAmount(l.debit),
        credit: parseAmount(l.credit),
      })),
    };
    startTransition(async () => {
      const res = editingId ? await updateJournalEntryDraftAction(editingId, input) : await createJournalEntryDraftAction(input);
      if (res.error) setFormError(res.error);
      else {
        setFormOk(editingId ? 'Rascunho actualizado.' : 'Rascunho gravado. Confirme-o para o tornar definitivo.');
        resetForm();
        router.refresh();
      }
    });
  };

  // ── Dialogs de operação ──
  const [confirmTarget, setConfirmTarget] = useState<JournalEntryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JournalEntryItem | null>(null);
  const [reverseTarget, setReverseTarget] = useState<JournalEntryItem | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [listOk, setListOk] = useState<string | null>(null);

  const runConfirm = (entry: JournalEntryItem) => {
    setDialogError(null);
    startTransition(async () => {
      const res = await postJournalEntryAction(entry.id);
      if (res.error) setDialogError(res.error);
      else {
        setConfirmTarget(null);
        setListOk(`Lançamento confirmado como ${res.entryNumber}.`);
        router.refresh();
      }
    });
  };

  const runDelete = (entry: JournalEntryItem) => {
    setDialogError(null);
    startTransition(async () => {
      const res = await deleteJournalEntryDraftAction(entry.id);
      if (res.error) setDialogError(res.error);
      else {
        setDeleteTarget(null);
        if (editingId === entry.id) resetForm();
        setListOk('Rascunho eliminado (snapshot registado na auditoria).');
        router.refresh();
      }
    });
  };

  const runReverse = (entry: JournalEntryItem) => {
    setDialogError(null);
    startTransition(async () => {
      const res = await reverseJournalEntryAction(entry.id, { reason: reverseReason || undefined });
      if (res.error) setDialogError(res.error);
      else {
        setReverseTarget(null);
        setReverseReason('');
        setListOk(`Estorno criado: ${res.entryNumber}.`);
        router.refresh();
      }
    });
  };

  const draftLabel = (n: string) => (n.startsWith('RASCUNHO-') ? 'Rascunho' : n);

  return (
    <>
      {canPrepare ? (
        <div style={{ ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14, color: 'var(--text)' }}>{editingId ? 'Editar rascunho' : 'Novo lançamento (rascunho)'}</strong>
            <span style={{ fontSize: 11, fontWeight: 700, color: balanced ? 'var(--ok)' : 'var(--warn)', background: balanced ? 'var(--ok-bg)' : 'var(--warn-bg)', padding: '3px 8px', borderRadius: 7 }}>
              {balanced ? 'Balanceado' : `Débito ${fmtNoSymbol(totalDebit)} · Crédito ${fmtNoSymbol(totalCredit)}`}
            </span>
            {editingId ? (
              <button type="button" style={smallBtn} onClick={resetForm}>
                <Icon name="x" size={13} />
                Cancelar edição
              </button>
            ) : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            <label style={labelStyle}>
              Diário
              <select value={journalId} onChange={(e) => setJournalId(e.target.value)} style={field}>
                {journals.map((j) => (
                  <option key={j.id} value={j.id}>{j.code} — {j.name}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Data do lançamento
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={field} />
            </label>
            <label style={labelStyle}>
              Referência (opcional)
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Documento de suporte" style={field} maxLength={120} />
            </label>
          </div>
          <label style={labelStyle}>
            Descrição
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição do lançamento" style={field} maxLength={240} />
          </label>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '38%' }}>Conta</th>
                  <th style={th}>Descrição da linha</th>
                  <th style={{ ...th, textAlign: 'right', width: 130 }}>Débito</th>
                  <th style={{ ...th, textAlign: 'right', width: 130 }}>Crédito</th>
                  <th style={{ ...th, width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key}>
                    <td style={{ ...td, paddingLeft: 0 }}>
                      <SearchCombobox
                        options={accountOptions}
                        value={line.ledgerAccountId}
                        onChange={(value) => setLine(line.key, { ledgerAccountId: value })}
                        placeholder="Seleccionar conta…"
                        searchPlaceholder="Pesquisar por código ou nome…"
                        emptyText="Sem contas para a pesquisa."
                        triggerStyle={{ ...field, height: 36 }}
                      />
                    </td>
                    <td style={td}>
                      <input value={line.description} onChange={(e) => setLine(line.key, { description: e.target.value })} placeholder="(opcional)" style={field} maxLength={240} />
                    </td>
                    <td style={td}>
                      <input value={line.debit} onChange={(e) => setLine(line.key, { debit: e.target.value })} inputMode="decimal" placeholder="0,00" style={{ ...field, textAlign: 'right' }} />
                    </td>
                    <td style={td}>
                      <input value={line.credit} onChange={(e) => setLine(line.key, { credit: e.target.value })} inputMode="decimal" placeholder="0,00" style={{ ...field, textAlign: 'right' }} />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button
                        type="button"
                        title="Remover linha"
                        style={{ ...smallBtn, padding: '0 7px', opacity: lines.length <= 2 ? 0.45 : 1 }}
                        disabled={lines.length <= 2}
                        onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                      >
                        <Icon name="trash-2" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, paddingLeft: 0 }}>
                    <button type="button" style={smallBtn} onClick={() => setLines((prev) => [...prev, emptyLine()])}>
                      <Icon name="plus" size={13} />
                      Adicionar linha
                    </button>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>Totais</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{fmtNoSymbol(totalDebit)}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{fmtNoSymbol(totalCredit)}</td>
                  <td style={td} />
                </tr>
              </tbody>
            </table>
          </div>

          {formError ? <ErrorBox message={formError} /> : null}
          {formOk ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '9px 12px', borderRadius: 8 }}>
              <Icon name="check-circle-2" size={15} />
              {formOk}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <Button type="button" onClick={submitDraft} disabled={pending}>
              {pending ? 'A gravar…' : editingId ? 'Guardar alterações' : 'Gravar rascunho'}
            </Button>
          </div>
        </div>
      ) : null}

      {listOk ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '9px 12px', borderRadius: 8 }}>
          <Icon name="check-circle-2" size={15} />
          {listOk}
        </div>
      ) : null}

      <div style={panel}>
        <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
          <strong style={{ fontSize: 14, color: 'var(--text)' }}>Rascunhos ({drafts.length})</strong>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Sem efeitos nos saldos até serem confirmados. A confirmação valida partidas dobradas, período aberto e contas activas.</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Data', 'Diário', 'Descrição', 'Débito', 'Crédito', 'Equilíbrio', 'Acções'].map((h) => (
                  <th key={h} style={{ ...th, textAlign: h === 'Débito' || h === 'Crédito' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drafts.length === 0 ? (
                <tr><td colSpan={7} style={{ ...td, padding: '24px 12px', textAlign: 'center', color: 'var(--text3)' }}>Sem rascunhos pendentes.</td></tr>
              ) : drafts.map((draft) => (
                <tr key={draft.id} className="ants-row">
                  <td style={td}>{datePt(draft.entryDate)}</td>
                  <td style={td}>{journals.find((j) => j.id === draft.journalId)?.code ?? '-'}</td>
                  <td style={td}>{draft.description}{draft.reference ? <><br /><span style={{ color: 'var(--text3)' }}>{draft.reference}</span></> : null}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNoSymbol(draft.totalDebit)}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNoSymbol(draft.totalCredit)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: draft.isBalanced ? 'var(--ok)' : 'var(--warn)', background: draft.isBalanced ? 'var(--ok-bg)' : 'var(--warn-bg)', padding: '3px 8px', borderRadius: 7, whiteSpace: 'nowrap' }}>
                      {draft.isBalanced ? 'Balanceado' : 'Desbalanceado'}
                    </span>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {canPrepare ? (
                        <button type="button" style={smallBtn} onClick={() => loadDraftIntoForm(draft)}>
                          <Icon name="pencil" size={13} />
                          Editar
                        </button>
                      ) : null}
                      {canPost ? (
                        <button type="button" style={{ ...smallBtn, borderColor: 'var(--ok)', color: 'var(--ok)' }} onClick={() => { setDialogError(null); setConfirmTarget(draft); }}>
                          <Icon name="check" size={13} />
                          Confirmar
                        </button>
                      ) : null}
                      {canPrepare ? (
                        <button type="button" style={{ ...smallBtn, borderColor: 'var(--bad)', color: 'var(--bad)' }} onClick={() => { setDialogError(null); setDeleteTarget(draft); }}>
                          <Icon name="trash-2" size={13} />
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={panel}>
        <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
          <strong style={{ fontSize: 14, color: 'var(--text)' }}>Lançamentos manuais confirmados</strong>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Confirmados e estornados aparecem também no Extrato Diário. Correcções fazem-se por estorno — nunca por eliminação.</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Data', 'Número', 'Descrição', 'Débito', 'Crédito', 'Estado', 'Acções'].map((h) => (
                  <th key={h} style={{ ...th, textAlign: h === 'Débito' || h === 'Crédito' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posted.length === 0 ? (
                <tr><td colSpan={7} style={{ ...td, padding: '24px 12px', textAlign: 'center', color: 'var(--text3)' }}>Ainda não existem lançamentos manuais confirmados.</td></tr>
              ) : posted.map((entry) => (
                <tr key={entry.id} className="ants-row">
                  <td style={td}>{datePt(entry.postingDate ?? entry.entryDate)}</td>
                  <td className="font-mono" style={{ ...td, color: 'var(--accent-fg)', fontWeight: 700 }}>{draftLabel(entry.entryNumber)}</td>
                  <td style={td}>{entry.description}{entry.reference ? <><br /><span style={{ color: 'var(--text3)' }}>{entry.reference}</span></> : null}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNoSymbol(entry.totalDebit)}</td>
                  <td className="tnum" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNoSymbol(entry.totalCredit)}</td>
                  <td style={td}>{statusChip(entry.status)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {canReverse && entry.status === 'POSTED' ? (
                      <button type="button" style={{ ...smallBtn, borderColor: 'var(--warn)', color: 'var(--warn)' }} onClick={() => { setDialogError(null); setReverseReason(''); setReverseTarget(entry); }}>
                        <Icon name="undo-2" size={13} />
                        Estornar
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text4)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Dialog: confirmar rascunho ── */}
      <Dialog open={!!confirmTarget} onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle>Confirmar lançamento</DialogTitle>
            <DialogDescription>{confirmTarget?.description}</DialogDescription>
          </DialogHeader>
          {confirmTarget ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['Data', datePt(confirmTarget.entryDate)],
                  ['Linhas', String(confirmTarget.lines?.length ?? '-')],
                  ['Débito', fmt(confirmTarget.totalDebit)],
                  ['Crédito', fmt(confirmTarget.totalCredit)],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: '1px solid var(--bd-soft)', borderRadius: 8, padding: '9px 10px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--warn)', background: 'var(--warn-bg)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
                <Icon name="alert-triangle" size={16} color="var(--warn)" />
                <span>A confirmação valida partidas dobradas e período aberto, atribui o número definitivo da série do diário e torna o lançamento imutável — correcções posteriores só por estorno.</span>
              </div>
              {dialogError ? <ErrorBox message={dialogError} /> : null}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setConfirmTarget(null)}>Fechar</Button>
                <Button type="button" onClick={() => runConfirm(confirmTarget)} disabled={pending}>
                  {pending ? 'A confirmar…' : 'Confirmar lançamento'}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: eliminar rascunho ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent style={{ maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle>Eliminar rascunho</DialogTitle>
            <DialogDescription>{deleteTarget?.description}</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              O rascunho nunca teve efeitos nos saldos. Um snapshot completo (linhas incluídas) fica registado na auditoria antes da eliminação.
            </div>
            {dialogError ? <ErrorBox message={dialogError} /> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>Fechar</Button>
              <Button type="button" variant="destructive" onClick={() => deleteTarget && runDelete(deleteTarget)} disabled={pending}>
                {pending ? 'A eliminar…' : 'Eliminar rascunho'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: estornar lançamento ── */}
      <Dialog open={!!reverseTarget} onOpenChange={(open) => { if (!open) setReverseTarget(null); }}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle>Estornar lançamento</DialogTitle>
            <DialogDescription>{reverseTarget ? `${reverseTarget.entryNumber} — ${fmt(reverseTarget.totalDebit)}` : ''}</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <label style={labelStyle}>
              Motivo (opcional, fica na descrição do estorno)
              <input value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Motivo do estorno" style={field} maxLength={240} />
            </label>
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--warn)', background: 'var(--warn-bg)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
              <Icon name="alert-triangle" size={16} color="var(--warn)" />
              <span>É criado um lançamento simétrico com a data de hoje (débito↔crédito trocados) e o original passa a «Estornado». Nada é apagado.</span>
            </div>
            {dialogError ? <ErrorBox message={dialogError} /> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setReverseTarget(null)}>Fechar</Button>
              <Button type="button" onClick={() => reverseTarget && runReverse(reverseTarget)} disabled={pending}>
                {pending ? 'A estornar…' : 'Estornar'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
