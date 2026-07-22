'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { civilDateInTimeZone, computeDocumentTotals } from '@ants/shared';
import { Icon } from '@/components/Icon';
import { SearchCombobox, type ComboOption } from '@/components/ui/SearchCombobox';
import { ACCENT } from '@/lib/erp-nav';
import { fmt } from '@/lib/format';
import { createPosSaleAction } from './actions';

const FINAL_CUSTOMER_ID = '__POS_FINAL_CUSTOMER__';

export interface PosCustomerOpt {
  id: string;
  name: string;
  nuit: string;
  phone: string;
}

export interface PosWarehouseOpt {
  id: string;
  label: string;
}

export interface PosProductOpt {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  taxRate: number;
  stockByWarehouse: Array<{ warehouseId: string; quantity: number }>;
}

interface CartItem {
  productId: string;
  sku: string;
  name: string;
  price: number;
  taxRate: number;
  stock: number;
  qty: number;
}

type PaymentMethod = 'CASH' | 'MPESA' | 'EMOLA' | 'CARD';

function newIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function stockFor(product: PosProductOpt, warehouseId: string): number {
  return product.stockByWarehouse.find((s) => s.warehouseId === warehouseId)?.quantity ?? 0;
}

const payOptions: Array<{ label: string; value: PaymentMethod; icon: string }> = [
  { label: 'Dinheiro', value: 'CASH', icon: 'banknote' },
  { label: 'M-Pesa', value: 'MPESA', icon: 'smartphone' },
  { label: 'e-Mola', value: 'EMOLA', icon: 'smartphone' },
  { label: 'Cartão', value: 'CARD', icon: 'credit-card' },
];

export function PosClient({ customers, warehouses, products, canSelectCustomer }: { customers: PosCustomerOpt[]; warehouses: PosWarehouseOpt[]; products: PosProductOpt[]; canSelectCustomer: boolean }) {
  const [pending, startTransition] = useTransition();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [customerId, setCustomerId] = useState(FINAL_CUSTOMER_ID);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [keys, setKeys] = useState(() => ({ invoice: newIdempotencyKey(), payment: newIdempotencyKey() }));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ invoiceId: string; invoiceNumber: string; paymentNumber: string } | null>(null);

  const categories = useMemo(() => ['Todos', ...Array.from(new Set(products.map((p) => p.category))).sort()], [products]);
  const warehouseOptions = useMemo<ComboOption[]>(() => warehouses.map((w) => ({ value: w.id, label: w.label })), [warehouses]);
  const customerDefaults = useMemo<ComboOption[]>(
    () => customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.nuit ? `NUIT ${c.nuit}` : undefined })),
    [customers],
  );
  const finalCustomerOption = useMemo<ComboOption[]>(() => [{ value: FINAL_CUSTOMER_ID, label: 'Cliente Geral' }], []);
  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => category === 'Todos' || p.category === category)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [category, products, query]);

  const totals = useMemo(
    () => computeDocumentTotals(cart.map((item) => ({ quantity: item.qty, unitPrice: item.price, taxPercent: item.taxRate }))),
    [cart],
  );
  const overStock = cart.filter((item) => item.qty > item.stock);

  const addProduct = (product: PosProductOpt) => {
    setError(null);
    setSuccess(null);
    const stock = stockFor(product, warehouseId);
    if (stock <= 0) {
      setError(`Sem stock disponível para ${product.name} no armazém seleccionado.`);
      return;
    }
    setCart((items) => {
      const existing = items.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.qty >= existing.stock) return items;
        return items.map((item) => (item.productId === product.id ? { ...item, qty: item.qty + 1 } : item));
      }
      return [...items, { productId: product.id, sku: product.sku, name: product.name, price: product.price, taxRate: product.taxRate, stock, qty: 1 }];
    });
  };

  const changeQty = (productId: string, delta: number) => {
    setSuccess(null);
    setCart((items) =>
      items
        .map((item) => (item.productId === productId ? { ...item, qty: Math.min(item.stock, Math.max(0, item.qty + delta)) } : item))
        .filter((item) => item.qty > 0),
    );
  };

  const clearCart = () => {
    setCart([]);
    setSuccess(null);
    setError(null);
    setKeys({ invoice: newIdempotencyKey(), payment: newIdempotencyKey() });
  };

  const finishSale = () => {
    setError(null);
    setSuccess(null);
    if (!warehouseId) return setError('Seleccione o armazém de saída.');
    if (!customerId) return setError('Seleccione um cliente.');
    if (cart.length === 0) return setError('Carrinho vazio. Adicione pelo menos um produto.');
    if (overStock.length > 0) return setError(`Stock insuficiente: ${overStock.map((item) => item.name).join(', ')}.`);

    startTransition(async () => {
      const res = await createPosSaleAction({
        invoiceIdempotencyKey: keys.invoice,
        paymentIdempotencyKey: keys.payment,
        issueDate: civilDateInTimeZone(),
        customerId,
        warehouseId,
        paymentMethod: method,
        notes: 'Venda POS',
        lines: cart.map((item) => ({ productId: item.productId, quantity: item.qty, discountPercent: 0 })),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.ok && res.invoiceId && res.invoiceNumber && res.paymentNumber) {
        setSuccess({ invoiceId: res.invoiceId, invoiceNumber: res.invoiceNumber, paymentNumber: res.paymentNumber });
        setCart([]);
        setKeys({ invoice: newIdempotencyKey(), payment: newIdempotencyKey() });
      }
    });
  };

  return (
    <div style={{ padding: '14px 26px 26px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 390px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 13px', height: 42 }}>
            <Icon name="search" size={17} color="var(--text3)" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar produto ou código" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, width: '100%', color: 'var(--text)' }} />
          </div>
          <SearchCombobox
            options={warehouseOptions}
            value={warehouseId}
            onChange={(v) => { setWarehouseId(v); setCart([]); setSuccess(null); }}
            placeholder={warehouses.length === 0 ? 'Sem armazéns activos' : '— Seleccione o armazém —'}
            searchPlaceholder="Pesquisar armazém…"
            emptyText="Sem armazéns para a pesquisa."
            triggerStyle={{ height: 38, borderRadius: 10, padding: '0 11px', fontSize: 12.5 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {categories.map((label) => {
            const active = category === label;
            return (
              <button key={label} onClick={() => setCategory(label)} style={{ height: 32, padding: '0 13px', borderRadius: 8, border: `1px solid ${active ? ACCENT : 'var(--border)'}`, background: active ? ACCENT : 'var(--card)', color: active ? '#fff' : 'var(--text2)', fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap' }}>
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
          {visibleProducts.map((product) => {
            const stock = stockFor(product, warehouseId);
            const disabled = stock <= 0 || pending;
            return (
              <button key={product.id} onClick={() => addProduct(product)} disabled={disabled} className="ants-pcard" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 11, minHeight: 148, display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                <div style={{ height: 46, borderRadius: 7, background: 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 14, fontWeight: 800 }}>
                  {initials(product.name)}
                </div>
                <div style={{ minHeight: 34, fontSize: 12.5, fontWeight: 650, lineHeight: 1.25, color: 'var(--text)' }}>{product.name}</div>
                <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>{product.sku}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-fg)' }}>{fmt(product.price)}</span>
                  <span className="tnum" style={{ fontSize: 11.5, fontWeight: 650, color: stock <= 0 ? 'var(--bad)' : 'var(--text2)' }}>stock {stock}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <aside style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', position: 'sticky', top: 8, maxHeight: 'calc(100vh - 132px)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Icon name="shopping-cart" size={18} color="var(--accent-fg)" />
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Venda POS</span>
          </div>
          <button onClick={clearCart} disabled={cart.length === 0 || pending} style={{ border: 'none', background: 'none', color: 'var(--text3)', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 650, cursor: cart.length === 0 || pending ? 'default' : 'pointer' }}>
            <Icon name="trash-2" size={14} />
            Limpar
          </button>
        </div>

        <div style={{ padding: 14, borderBottom: '1px solid var(--bd-soft)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text3)', marginBottom: 5 }}>Cliente</label>
            <SearchCombobox
              searchEndpoint={canSelectCustomer ? '/api/search/customers?active=1' : undefined}
              defaultOptions={canSelectCustomer ? customerDefaults : []}
              pinnedOptions={finalCustomerOption}
              value={customerId}
              onChange={(v) => setCustomerId(v || FINAL_CUSTOMER_ID)}
              placeholder="Cliente Geral"
              searchPlaceholder="Pesquisar por nome ou NUIT…"
              emptyText="Sem clientes para a pesquisa."
              triggerStyle={{ height: 38, borderRadius: 10, padding: '0 11px', fontSize: 12.5 }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px' }}>
          {cart.length === 0 ? (
            <div style={{ minHeight: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', color: 'var(--text3)', fontSize: 12.5 }}>
              <Icon name="shopping-basket" size={32} color="var(--text4)" />
              Carrinho vazio.
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 84px 82px', gap: 9, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--bd-soft2)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                  <div className="font-mono" style={{ fontSize: 10.5, color: item.qty > item.stock ? 'var(--bad)' : 'var(--text3)' }}>{item.sku} · stock {item.stock}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <button onClick={() => changeQty(item.productId, -1)} disabled={pending} style={qtyBtn}><Icon name="minus" size={12} /></button>
                  <span className="tnum" style={{ minWidth: 22, textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{item.qty}</span>
                  <button onClick={() => changeQty(item.productId, 1)} disabled={pending || item.qty >= item.stock} style={qtyBtn}><Icon name="plus" size={12} /></button>
                </div>
                <div className="tnum" style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(item.price * item.qty)}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '13px 16px 15px', borderTop: '1px solid var(--bd-soft)', background: 'var(--card3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 6, marginBottom: 10 }}>
            {payOptions.map((option) => {
              const active = method === option.value;
              return (
                <button key={option.value} onClick={() => setMethod(option.value)} disabled={pending} aria-pressed={active} title={option.label} style={{ minWidth: 0, height: 36, borderRadius: 8, border: `1px solid ${active ? ACCENT : 'var(--border)'}`, background: active ? ACCENT : 'var(--card)', color: active ? '#fff' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', padding: '0 6px', cursor: pending ? 'default' : 'pointer' }}>
                  <Icon name={option.icon} size={14} />
                  {option.label}
                </button>
              );
            })}
          </div>

          <SummaryRow label="Subtotal" value={fmt(totals.subtotal)} />
          <SummaryRow label="Incidência" value={fmt(totals.taxable)} />
          <SummaryRow label="IVA" value={fmt(totals.tax)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 9, marginTop: 7, borderTop: '1px dashed var(--border)' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Total</span>
            <span className="tnum" style={{ fontSize: 21, fontWeight: 850, color: 'var(--accent-fg)' }}>{fmt(totals.total)}</span>
          </div>

          {error && <Message tone="bad" icon="alert-triangle" text={error} />}
          {success && (
            <div style={{ marginTop: 11, border: '1px solid var(--ok)', background: 'var(--ok-bg)', color: 'var(--ok)', borderRadius: 8, padding: 10, fontSize: 12.5, display: 'grid', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800 }}>
                <Icon name="check-circle-2" size={15} />
                {success.invoiceNumber.startsWith('VD') ? `${success.invoiceNumber} emitida` : `${success.invoiceNumber} criada`} · recibo {success.paymentNumber}
              </div>
              <Link href={`/facturas/documento?id=${success.invoiceId}`} style={{ color: 'var(--ok)', fontWeight: 800, textDecoration: 'underline' }}>
                {success.invoiceNumber.startsWith('VD') ? 'Abrir VD' : 'Abrir factura'}
              </Link>
            </div>
          )}

          <button onClick={finishSale} disabled={pending || cart.length === 0} style={{ width: '100%', height: 46, marginTop: 12, borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 850, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pending || cart.length === 0 ? 0.62 : 1, cursor: pending || cart.length === 0 ? 'default' : 'pointer' }}>
            <Icon name="check-circle-2" size={18} />
            {pending ? 'A finalizar...' : `Finalizar venda · ${fmt(totals.total)}`}
          </button>
        </div>
      </aside>
    </div>
  );
}

const qtyBtn: React.CSSProperties = { width: 25, height: 25, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', cursor: 'pointer' };

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text2)', marginTop: 5 }}>
      <span>{label}</span>
      <span className="tnum" style={{ fontWeight: 700, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

function Message({ tone, icon, text }: { tone: 'bad'; icon: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: `var(--${tone})`, background: `var(--${tone}-bg)`, padding: '9px 10px', borderRadius: 8, marginTop: 11 }}>
      <Icon name={icon} size={15} />
      <span>{text}</span>
    </div>
  );
}
