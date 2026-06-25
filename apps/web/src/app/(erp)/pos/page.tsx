'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';
import { CATEGORIES, productInitials, RAW_PRODUCTS } from '@/lib/data/products';

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

const PAY_OPTIONS: Array<[string, string]> = [
  ['Dinheiro', 'banknote'],
  ['M-Pesa', 'smartphone'],
  ['e-Mola', 'smartphone'],
  ['Cartão', 'credit-card'],
];

export default function PosPage() {
  const [activeCat, setActiveCat] = useState('Todos');
  const [payMethod, setPayMethod] = useState('Dinheiro');
  const [cart, setCart] = useState<CartItem[]>([
    { id: 'ANTS-RICE-5', name: 'Arroz Tio 5kg', price: 580, qty: 2 },
    { id: 'ANTS-COL-2', name: 'Coca-Cola 2L', price: 140, qty: 3 },
  ]);

  const products = useMemo(
    () =>
      RAW_PRODUCTS.filter((p) => activeCat === 'Todos' || p.cat === activeCat).map((p) => ({
        id: p.sku,
        name: p.name,
        priceStr: fmt(p.price),
        price: p.price,
        initials: productInitials(p.name),
      })),
    [activeCat],
  );

  const addToCart = (p: { id: string; name: string; price: number }) =>
    setCart((c) => {
      const i = c.findIndex((x) => x.id === p.id);
      if (i >= 0) return c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { id: p.id, name: p.name, price: p.price, qty: 1 }];
    });
  const changeQty = (id: string, d: number) =>
    setCart((c) => c.map((x) => (x.id === id ? { ...x, qty: x.qty + d } : x)).filter((x) => x.qty > 0));

  const sub = cart.reduce((a, c) => a + c.price * c.qty, 0);
  const tax = sub * 0.16;
  const total = sub + tax;

  return (
    <div
      style={{
        padding: '14px 26px 26px',
        display: 'grid',
        gridTemplateColumns: '1fr 372px',
        gap: 16,
        alignItems: 'start',
      }}
    >
      {/* Catálogo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 11,
              padding: '0 13px',
              height: 44,
            }}
          >
            <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
              <Icon name="search" size={18} />
            </span>
            <input
              placeholder="Pesquisar produto ou ler código de barras…"
              style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13.5, width: '100%', color: 'var(--text)' }}
            />
            <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
              <Icon name="scan-barcode" size={18} />
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map((label) => {
            const active = activeCat === label;
            return (
              <button
                key={label}
                onClick={() => setActiveCat(label)}
                style={{
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 20,
                  border: `1px solid ${active ? ACCENT : 'var(--border)'}`,
                  background: active ? ACCENT : 'var(--card)',
                  color: active ? '#fff' : 'var(--text2)',
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(138px,1fr))', gap: 12 }}>
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="ants-pcard"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
                textAlign: 'left',
                transition: '.12s',
              }}
            >
              <div
                style={{
                  height: 62,
                  borderRadius: 9,
                  background:
                    'repeating-linear-gradient(135deg,var(--card2),var(--card2) 6px,var(--bd-soft) 6px,var(--bd-soft) 12px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text4)',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                {p.initials}
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.25, color: 'var(--text)', minHeight: 31 }}>
                {p.name}
              </span>
              <span className="tnum" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-fg)' }}>
                {p.priceStr}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Carrinho */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 8,
          maxHeight: 'calc(100vh - 150px)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            borderBottom: '1px solid var(--bd-soft)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
              <Icon name="shopping-cart" size={18} />
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Venda actual</span>
          </div>
          <button
            onClick={() => setCart([])}
            style={{ fontSize: 11.5, color: 'var(--text4)', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Icon name="trash-2" size={14} />
            Limpar
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '11px 18px',
            borderBottom: '1px solid var(--bd-soft)',
            background: 'var(--card2)',
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'var(--ok-bg)',
              color: 'var(--ok)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Icon name="user" size={16} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, flex: 1 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Cliente final</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Venda a dinheiro · sem conta</span>
          </div>
          <span style={{ color: 'var(--text4)', display: 'inline-flex' }}>
            <Icon name="chevron-right" size={16} />
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 18px' }}>
          {cart.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '42px 10px',
                textAlign: 'center',
              }}
            >
              <span style={{ color: 'var(--text4)', display: 'inline-flex' }}>
                <Icon name="shopping-basket" size={34} />
              </span>
              <span style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 180 }}>
                Carrinho vazio. Toque num produto para adicionar à venda.
              </span>
            </div>
          ) : (
            cart.map((c) => (
              <div
                key={c.id}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--bd-soft2)' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'var(--text)',
                    }}
                  >
                    {c.name}
                  </div>
                  <div className="tnum" style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                    {fmt(c.price)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 'none' }}>
                  <button
                    onClick={() => changeQty(c.id, -1)}
                    style={{
                      width: 25,
                      height: 25,
                      borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text2)',
                    }}
                  >
                    <Icon name="minus" size={13} />
                  </button>
                  <span className="tnum" style={{ minWidth: 18, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {c.qty}
                  </span>
                  <button
                    onClick={() => changeQty(c.id, 1)}
                    style={{
                      width: 25,
                      height: 25,
                      borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text2)',
                    }}
                  >
                    <Icon name="plus" size={13} />
                  </button>
                </div>
                <div className="tnum" style={{ width: 78, textAlign: 'right', fontSize: 13, fontWeight: 700, flex: 'none', color: 'var(--text)' }}>
                  {fmt(c.price * c.qty)}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ flex: 'none', padding: '14px 18px 16px', borderTop: '1px solid var(--bd-soft)', background: 'var(--card3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text2)', marginBottom: 5 }}>
            <span>Subtotal</span>
            <span className="tnum">{fmt(sub)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text2)', marginBottom: 9 }}>
            <span>IVA (16%)</span>
            <span className="tnum">{fmt(tax)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingTop: 9,
              borderTop: '1px dashed var(--border)',
              marginBottom: 13,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Total</span>
            <span className="tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-fg)' }}>
              {fmt(total)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
            {PAY_OPTIONS.map(([label, icon]) => {
              const active = payMethod === label;
              return (
                <button
                  key={label}
                  onClick={() => setPayMethod(label)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '9px 4px',
                    borderRadius: 10,
                    border: `1px solid ${active ? ACCENT : 'var(--border)'}`,
                    background: active ? ACCENT : 'var(--card)',
                    color: active ? '#fff' : 'var(--text2)',
                    fontSize: 10.5,
                    fontWeight: 600,
                  }}
                >
                  <Icon name={icon} size={17} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          <button
            style={{
              width: '100%',
              height: 48,
              borderRadius: 12,
              border: 'none',
              background: ACCENT,
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
            }}
          >
            <Icon name="check-circle-2" size={19} />
            Finalizar venda · {fmt(total)}
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
            <button
              style={{
                flex: 1,
                height: 38,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Icon name="pause" size={14} />
              Suspender
            </button>
            <button
              style={{
                flex: 1,
                height: 38,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Icon name="printer" size={14} />
              Recibo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
