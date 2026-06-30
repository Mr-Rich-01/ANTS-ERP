'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { canSubmitInvoiceForm, civilDateInTimeZone } from '@ants/shared';
import { Icon } from '@/components/Icon';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';
import { createInvoiceAction } from '@/app/(erp)/facturas/actions';

export interface CustomerOpt {
  id: string;
  name: string;
  nuit: string;
  phone: string;
}
export interface ProductOpt {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
}
export interface WarehouseOpt {
  id: string;
  label: string;
}

interface Line {
  productId: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  qty: number;
  disc: number;
}

const TAX = 0.16;

const cardBox: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' };
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 };
const selectStyle: React.CSSProperties = { width: '100%', height: 42, border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', fontSize: 13.5, background: 'var(--card)', color: 'var(--text)', outline: 'none' };
const qtyBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', cursor: 'pointer' };
const thL: React.CSSProperties = { padding: '9px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase' };

function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function NovaFacturaClient({ customers, products, warehouses, canDiscount, canEditIssueDate }: { customers: CustomerOpt[]; products: ProductOpt[]; warehouses: WarehouseOpt[]; canDiscount: boolean; canEditIssueDate: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => createIdempotencyKey());
  const [issueDate, setIssueDate] = useState(() => civilDateInTimeZone());
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [pay, setPay] = useState<'CASH' | 'MPESA' | 'EMOLA' | 'CARD' | 'TRANSFER'>('TRANSFER');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [picker, setPicker] = useState('');
  const [error, setError] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === customerId);

  const addProduct = (productId: string) => {
    setPicker('');
    if (!productId) return;
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((L) => {
      const existing = L.find((l) => l.productId === productId);
      if (existing) return L.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l));
      return [...L, { productId: p.id, name: p.name, sku: p.sku, price: p.price, stock: p.stock, qty: 1, disc: 0 }];
    });
  };
  const setQty = (id: string, d: number) => setLines((L) => L.map((l) => (l.productId === id ? { ...l, qty: Math.max(1, l.qty + d) } : l)));
  const setDisc = (id: string, v: number) => setLines((L) => L.map((l) => (l.productId === id ? { ...l, disc: Math.min(100, Math.max(0, v)) } : l)));
  const remove = (id: string) => setLines((L) => L.filter((l) => l.productId !== id));

  const totals = useMemo(() => {
    const sub = lines.reduce((a, l) => a + l.qty * l.price, 0);
    const disc = lines.reduce((a, l) => a + l.qty * l.price * (l.disc / 100), 0);
    const base = sub - disc;
    const tax = base * TAX;
    return { sub, disc, base, tax, total: base + tax };
  }, [lines]);

  const overStock = lines.filter((l) => l.qty > l.stock);
  const canSubmit = canSubmitInvoiceForm({ issueDate, customerId, lineCount: lines.length, overStockCount: overStock.length, pending });

  const emit = () => {
    setError(null);
    if (!issueDate) return setError('Seleccione a data de emissão.');
    if (!customerId) return setError('Seleccione um cliente.');
    if (lines.length === 0) return setError('Adicione pelo menos uma linha.');
    if (overStock.length > 0) return setError(`Stock insuficiente: ${overStock.map((l) => l.name).join(', ')}.`);
    startTransition(async () => {
      const res = await createInvoiceAction({
        idempotencyKey,
        issueDate,
        customerId,
        warehouseId: warehouseId || undefined,
        paymentMethod: pay,
        notes: notes || undefined,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.qty, discountPercent: l.disc })),
      });
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/facturas/documento?id=${res.id}`);
    });
  };

  return (
    <div style={{ padding: '14px 26px 30px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Cliente */}
        <div style={cardBox}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 15 }}>Dados do cliente</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label}>Cliente</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={selectStyle}>
                {customers.length === 0 && <option value="">— Sem clientes —</option>}
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>Data de emissão</label>
              <input
                type="date"
                required
                disabled={!canEditIssueDate}
                value={issueDate}
                onChange={(e) => {
                  if (canEditIssueDate) setIssueDate(e.target.value);
                }}
                style={{ ...selectStyle, background: canEditIssueDate ? 'var(--card)' : 'var(--card2)', cursor: canEditIssueDate ? 'text' : 'default' }}
              />
            </div>
            <div>
              <label style={label}>NUIT</label>
              <div className="font-mono" style={{ ...selectStyle, display: 'flex', alignItems: 'center', color: 'var(--text2)' }}>{customer?.nuit || '—'}</div>
            </div>
            <div>
              <label style={label}>Contacto</label>
              <div style={{ ...selectStyle, display: 'flex', alignItems: 'center', color: 'var(--text2)' }}>{customer?.phone || '—'}</div>
            </div>
            <div>
              <label style={label}>Armazém (saída de stock)</label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={selectStyle}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Produtos */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 13px', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Produtos &amp; serviços</span>
            <select value={picker} onChange={(e) => addProduct(e.target.value)} style={{ ...selectStyle, width: 260, maxWidth: '50vw', height: 38 }}>
              <option value="">+ Adicionar produto…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {fmt(p.price)} (stock {p.stock})
                </option>
              ))}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={thL}>Descrição</th>
                  <th style={{ ...thL, textAlign: 'center', width: 120 }}>Qtd</th>
                  <th style={{ ...thL, textAlign: 'right', width: 110 }}>Preço</th>
                  <th style={{ ...thL, textAlign: 'center', width: 90 }}>Desc.%</th>
                  <th style={{ ...thL, textAlign: 'right', width: 120 }}>Total</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '26px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                      Adicione produtos à factura.
                    </td>
                  </tr>
                ) : (
                  lines.map((l) => {
                    const lineTotal = l.qty * l.price * (1 - l.disc / 100);
                    const over = l.qty > l.stock;
                    return (
                      <tr key={l.productId} style={{ borderTop: '1px solid var(--bd-soft2)' }}>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{l.name}</div>
                          <div className="font-mono" style={{ fontSize: 11, color: over ? 'var(--bad)' : 'var(--text3)' }}>
                            {l.sku} · stock {l.stock}
                            {over ? ' · excede!' : ''}
                          </div>
                        </td>
                        <td style={{ padding: '11px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                            <button onClick={() => setQty(l.productId, -1)} style={qtyBtn}>
                              <Icon name="minus" size={12} />
                            </button>
                            <span className="tnum" style={{ minWidth: 26, textAlign: 'center', fontSize: 13, fontWeight: 600, color: over ? 'var(--bad)' : 'var(--text)' }}>
                              {l.qty}
                            </span>
                            <button onClick={() => setQty(l.productId, 1)} style={qtyBtn}>
                              <Icon name="plus" size={12} />
                            </button>
                          </div>
                        </td>
                        <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {fmt(l.price)}
                        </td>
                        <td style={{ padding: '11px 10px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={l.disc}
                            disabled={!canDiscount}
                            onChange={(e) => setDisc(l.productId, Number(e.target.value))}
                            className="tnum"
                            style={{ width: 56, height: 30, textAlign: 'center', border: '1px solid var(--field-bd)', borderRadius: 7, background: canDiscount ? 'var(--field)' : 'var(--card2)', color: 'var(--text)', fontSize: 12.5, outline: 'none' }}
                          />
                        </td>
                        <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {fmt(lineTotal)}
                        </td>
                        <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                          <button onClick={() => remove(l.productId)} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="trash-2" size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagamento */}
        <div style={cardBox}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 13 }}>Pagamento &amp; observações</div>
          <label style={{ ...label, marginBottom: 7 }}>Forma de pagamento</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 15 }}>
            {([['Dinheiro', 'CASH', 'banknote'], ['M-Pesa', 'MPESA', 'smartphone'], ['e-Mola', 'EMOLA', 'smartphone'], ['Cartão', 'CARD', 'credit-card'], ['Transferência', 'TRANSFER', 'arrow-left-right']] as const).map(([lab, val, icon]) => {
              const active = pay === val;
              return (
                <button key={val} onClick={() => setPay(val)} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${active ? ACCENT : 'var(--border)'}`, background: active ? ACCENT : 'var(--card)', color: active ? '#fff' : 'var(--text2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  <Icon name={icon} size={16} />
                  {lab}
                </button>
              );
            })}
          </div>
          <label style={{ ...label, marginBottom: 7 }}>Observações</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas ou condições para o cliente…" style={{ width: '100%', minHeight: 74, resize: 'vertical', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 12px', fontSize: 13, background: 'var(--card)', color: 'var(--text)', outline: 'none' }} />
        </div>
      </div>

      {/* Resumo */}
      <div style={{ position: 'sticky', top: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Resumo</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '3px 10px', borderRadius: 20 }}>Rascunho</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {([['Subtotal', fmt(totals.sub), 'var(--text)', false], ['Desconto', `− ${fmt(totals.disc)}`, 'var(--bad)', false], ['Incidência', fmt(totals.base), 'var(--text)', true], ['IVA (16%)', fmt(totals.tax), 'var(--text)', true]] as const).map(([l, v, color, border]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: border ? '1px solid var(--bd-soft2)' : undefined }}>
                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{l}</span>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color }}>
                  {v}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 4px' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Total</span>
              <span className="tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-fg)' }}>
                {fmt(totals.total)}
              </span>
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--bad)', background: 'var(--bad-bg)', padding: '9px 12px', borderRadius: 10, marginTop: 12 }}>
              <Icon name="alert-triangle" size={15} />
              {error}
            </div>
          )}

          <button onClick={emit} disabled={!canSubmit} style={{ width: '100%', height: 46, marginTop: 14, borderRadius: 11, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: canSubmit ? 1 : 0.6, cursor: canSubmit ? 'pointer' : 'default' }}>
            <Icon name="file-check-2" size={17} />
            {pending ? 'A emitir…' : 'Emitir factura'}
          </button>
          <button onClick={() => router.push('/facturas')} style={{ width: '100%', height: 42, marginTop: 8, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Icon name="x" size={16} />
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
