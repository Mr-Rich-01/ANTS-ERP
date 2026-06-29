'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';
import { createPurchaseOrderAction } from '@/app/(erp)/compras/actions';

export interface SupplierOpt {
  id: string;
  name: string;
  nuit: string;
  phone: string;
}
export interface ProductOpt {
  id: string;
  sku: string;
  name: string;
  cost: number;
}
export interface WarehouseOpt {
  id: string;
  label: string;
}

interface Line {
  productId: string;
  name: string;
  sku: string;
  cost: number;
  qty: number;
}

const TAX = 0.16;
const cardBox: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' };
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 };
const selectStyle: React.CSSProperties = { width: '100%', height: 42, border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', fontSize: 13.5, background: 'var(--card)', color: 'var(--text)', outline: 'none' };
const qtyBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', cursor: 'pointer' };
const thL: React.CSSProperties = { padding: '9px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase' };

export function NovaOrdemClient({ suppliers, products, warehouses }: { suppliers: SupplierOpt[]; products: ProductOpt[]; warehouses: WarehouseOpt[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [picker, setPicker] = useState('');
  const [error, setError] = useState<string | null>(null);

  const supplier = suppliers.find((s) => s.id === supplierId);

  const addProduct = (productId: string) => {
    setPicker('');
    if (!productId) return;
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((L) => {
      const existing = L.find((l) => l.productId === productId);
      if (existing) return L.map((l) => (l.productId === productId ? { ...l, qty: l.qty + 1 } : l));
      return [...L, { productId: p.id, name: p.name, sku: p.sku, cost: p.cost, qty: 1 }];
    });
  };
  const setQty = (id: string, d: number) => setLines((L) => L.map((l) => (l.productId === id ? { ...l, qty: Math.max(1, l.qty + d) } : l)));
  const setCost = (id: string, v: number) => setLines((L) => L.map((l) => (l.productId === id ? { ...l, cost: Math.max(0, v) } : l)));
  const remove = (id: string) => setLines((L) => L.filter((l) => l.productId !== id));

  const totals = useMemo(() => {
    const sub = lines.reduce((a, l) => a + l.qty * l.cost, 0);
    const tax = sub * TAX;
    return { sub, tax, total: sub + tax };
  }, [lines]);

  const create = () => {
    setError(null);
    if (!supplierId) return setError('Seleccione um fornecedor.');
    if (lines.length === 0) return setError('Adicione pelo menos uma linha.');
    startTransition(async () => {
      const res = await createPurchaseOrderAction({
        supplierId,
        warehouseId: warehouseId || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.qty, unitCost: l.cost })),
      });
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/compras/ordem?id=${res.id}`);
    });
  };

  return (
    <div style={{ padding: '14px 26px 30px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 15 }}>Fornecedor</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label}>Fornecedor</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={selectStyle}>
                {suppliers.length === 0 && <option value="">— Sem fornecedores —</option>}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>NUIT</label>
              <div className="font-mono" style={{ ...selectStyle, display: 'flex', alignItems: 'center', color: 'var(--text2)' }}>{supplier?.nuit || '—'}</div>
            </div>
            <div>
              <label style={label}>Armazém de destino</label>
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

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 13px', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Linhas da encomenda</span>
            <select value={picker} onChange={(e) => addProduct(e.target.value)} style={{ ...selectStyle, width: 260, maxWidth: '50vw', height: 38 }}>
              <option value="">+ Adicionar produto…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — custo {fmt(p.cost)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={thL}>Produto</th>
                  <th style={{ ...thL, textAlign: 'center', width: 120 }}>Qtd</th>
                  <th style={{ ...thL, textAlign: 'right', width: 130 }}>Custo unit.</th>
                  <th style={{ ...thL, textAlign: 'right', width: 120 }}>Total</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '26px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                      Adicione produtos à encomenda.
                    </td>
                  </tr>
                ) : (
                  lines.map((l) => (
                    <tr key={l.productId} style={{ borderTop: '1px solid var(--bd-soft2)' }}>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{l.name}</div>
                        <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {l.sku}
                        </div>
                      </td>
                      <td style={{ padding: '11px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                          <button onClick={() => setQty(l.productId, -1)} style={qtyBtn}>
                            <Icon name="minus" size={12} />
                          </button>
                          <span className="tnum" style={{ minWidth: 26, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                            {l.qty}
                          </span>
                          <button onClick={() => setQty(l.productId, 1)} style={qtyBtn}>
                            <Icon name="plus" size={12} />
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.cost}
                          onChange={(e) => setCost(l.productId, Number(e.target.value))}
                          className="tnum"
                          style={{ width: 96, height: 32, textAlign: 'right', border: '1px solid var(--field-bd)', borderRadius: 7, background: 'var(--field)', color: 'var(--text)', fontSize: 12.5, outline: 'none', padding: '0 8px' }}
                        />
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {fmt(l.qty * l.cost)}
                      </td>
                      <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                        <button onClick={() => remove(l.productId)} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="trash-2" size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardBox}>
          <label style={{ ...label, marginBottom: 7 }}>Observações</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condições de entrega, referência…" style={{ width: '100%', minHeight: 70, resize: 'vertical', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 12px', fontSize: 13, background: 'var(--card)', color: 'var(--text)', outline: 'none' }} />
        </div>
      </div>

      <div style={{ position: 'sticky', top: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Resumo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {([['Subtotal', fmt(totals.sub), true], ['IVA (16%)', fmt(totals.tax), true]] as const).map(([l, v, border]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: border ? '1px solid var(--bd-soft2)' : undefined }}>
                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{l}</span>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
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

          <button onClick={create} disabled={pending} style={{ width: '100%', height: 46, marginTop: 14, borderRadius: 11, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pending ? 0.6 : 1, cursor: pending ? 'default' : 'pointer' }}>
            <Icon name="file-check-2" size={17} />
            {pending ? 'A criar…' : 'Criar ordem'}
          </button>
          <button onClick={() => router.push('/compras')} style={{ width: '100%', height: 42, marginTop: 8, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Icon name="x" size={16} />
            Cancelar
          </button>
        </div>
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '13px 15px', borderRadius: 13, background: 'var(--info-bg)' }}>
          <span style={{ color: 'var(--info)', flex: 'none', marginTop: 1, display: 'inline-flex' }}>
            <Icon name="info" size={16} />
          </span>
          <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            A ordem é criada como <strong>Enviada</strong>. O stock e a conta a pagar só são gerados na recepção.
          </span>
        </div>
      </div>
    </div>
  );
}
