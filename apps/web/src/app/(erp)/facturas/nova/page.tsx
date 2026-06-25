'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';
import { INVOICE_NEW_CATALOG, INVOICE_NEW_LINES, type InvoiceLine } from '@/lib/data/invoices';

const PAY: Array<[string, string]> = [
  ['Dinheiro', 'banknote'],
  ['M-Pesa', 'smartphone'],
  ['e-Mola', 'smartphone'],
  ['Cartão', 'credit-card'],
];

const cardBox: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '18px 20px',
};
const stepNum: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 7,
  background: 'var(--accent-bg)',
  color: 'var(--accent-fg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
};
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 };
const input: React.CSSProperties = {
  width: '100%',
  height: 42,
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '0 12px',
  fontSize: 13.5,
  background: 'var(--card)',
  color: 'var(--text)',
};
const qtyBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text2)',
};
const thL: React.CSSProperties = {
  padding: '9px 14px',
  textAlign: 'left',
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '.5px',
  color: 'var(--text3)',
  textTransform: 'uppercase',
};

export default function NovaFacturaPage() {
  const router = useRouter();
  const [lines, setLines] = useState<InvoiceLine[]>(INVOICE_NEW_LINES);
  const [pay, setPay] = useState('Transferência');

  const setQty = (i: number, d: number) =>
    setLines((L) => L.map((l, j) => (j === i ? { ...l, qty: Math.max(1, l.qty + d) } : l)));
  const remove = (i: number) => setLines((L) => L.filter((_, j) => j !== i));
  const addLine = () =>
    setLines((L) => {
      const next = INVOICE_NEW_CATALOG[L.length % INVOICE_NEW_CATALOG.length]!;
      return [...L, { id: `${next[0]}-${L.length}`, name: next[1], sku: next[0], price: next[2], qty: 1, disc: 0 }];
    });

  const sub = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const disc = lines.reduce((a, l) => a + l.qty * l.price * (l.disc / 100), 0);
  const base = sub - disc;
  const tax = base * 0.16;
  const total = base + tax;
  const emit = () => router.push('/facturas/documento');

  return (
    <div
      style={{
        padding: '14px 26px 96px',
        display: 'grid',
        gridTemplateColumns: '1fr 340px',
        gap: 16,
        alignItems: 'start',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 1. Cliente */}
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15 }}>
            <span style={stepNum}>1</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Dados do cliente</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label}>Cliente</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  height: 42,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '0 12px',
                  background: 'var(--card)',
                }}
              >
                <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
                  <Icon name="building-2" size={16} />
                </span>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>Distribuidora Maputo, Lda</span>
                <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
                  <Icon name="chevron-down" size={16} />
                </span>
              </div>
            </div>
            <div>
              <label style={label}>NUIT</label>
              <input className="font-mono" defaultValue="400785214" style={input} />
            </div>
            <div>
              <label style={label}>Contacto</label>
              <input defaultValue="+258 84 321 0099" style={input} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={label}>Endereço</label>
              <input defaultValue="Av. 24 de Julho, nº 1290, Maputo" style={input} />
            </div>
          </div>
        </div>

        {/* 2. Datas */}
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15 }}>
            <span style={stepNum}>2</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Datas &amp; condições</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 13 }}>
            <div>
              <label style={label}>Data de emissão</label>
              <div style={{ ...input, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
                  <Icon name="calendar" size={15} />
                </span>
                <span className="tnum" style={{ fontSize: 13.5, color: 'var(--text)' }}>
                  23/06/2026
                </span>
              </div>
            </div>
            <div>
              <label style={label}>Vencimento</label>
              <div style={{ ...input, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
                  <Icon name="calendar-clock" size={15} />
                </span>
                <span className="tnum" style={{ fontSize: 13.5, color: 'var(--text)' }}>
                  23/07/2026
                </span>
              </div>
            </div>
            <div>
              <label style={label}>Moeda</label>
              <div style={{ ...input, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13.5, color: 'var(--text)' }}>Metical (MT)</span>
                <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
                  <Icon name="chevron-down" size={16} />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Produtos */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={stepNum}>3</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Produtos &amp; serviços</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{lines.length} linhas</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={thL}>Descrição</th>
                  <th style={{ ...thL, textAlign: 'center', width: 110 }}>Qtd</th>
                  <th style={{ ...thL, textAlign: 'right', width: 110 }}>Preço</th>
                  <th style={{ ...thL, textAlign: 'right', width: 70 }}>Desc.</th>
                  <th style={{ ...thL, textAlign: 'right', width: 120 }}>Total</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{l.name}</div>
                      <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {l.sku}
                      </div>
                    </td>
                    <td style={{ padding: '11px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <button onClick={() => setQty(i, -1)} style={qtyBtn}>
                          <Icon name="minus" size={12} />
                        </button>
                        <span className="tnum" style={{ minWidth: 22, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                          {l.qty}
                        </span>
                        <button onClick={() => setQty(i, 1)} style={qtyBtn}>
                          <Icon name="plus" size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {fmt(l.price)}
                    </td>
                    <td className="tnum" style={{ padding: '11px 10px', textAlign: 'right', fontSize: 12.5, color: 'var(--text2)' }}>
                      {l.disc > 0 ? `${l.disc}%` : '—'}
                    </td>
                    <td
                      className="tnum"
                      style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}
                    >
                      {fmt(l.qty * l.price * (1 - l.disc / 100))}
                    </td>
                    <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                      <button
                        onClick={() => remove(i)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          border: 'none',
                          background: 'none',
                          color: 'var(--text3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="trash-2" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={addLine}
            className="ants-hover"
            style={{
              width: '100%',
              height: 44,
              border: 'none',
              borderTop: '1px solid var(--bd-soft)',
              background: 'none',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--accent-fg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Icon name="plus" size={16} />
            Adicionar linha
          </button>
        </div>

        {/* 4. Pagamento */}
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
            <span style={stepNum}>4</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Pagamento &amp; observações</span>
          </div>
          <label style={{ ...label, marginBottom: 7 }}>Forma de pagamento</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 15 }}>
            {PAY.map(([l, icon]) => {
              const active = pay === l;
              return (
                <button
                  key={l}
                  onClick={() => setPay(l)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    height: 38,
                    padding: '0 14px',
                    borderRadius: 10,
                    border: `1px solid ${active ? ACCENT : 'var(--border)'}`,
                    background: active ? ACCENT : 'var(--card)',
                    color: active ? '#fff' : 'var(--text2)',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  <Icon name={icon} size={16} />
                  {l}
                </button>
              );
            })}
          </div>
          <label style={{ ...label, marginBottom: 7 }}>Observações</label>
          <textarea
            placeholder="Notas, condições ou referência bancária para o cliente…"
            style={{
              width: '100%',
              minHeight: 74,
              resize: 'vertical',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '11px 12px',
              fontSize: 13,
              background: 'var(--card)',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Resumo */}
      <div style={{ position: 'sticky', top: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Resumo</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '3px 10px', borderRadius: 20 }}>
              Rascunho
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              ['Subtotal', fmt(sub), 'var(--text)', false],
              ['Desconto', `− ${fmt(disc)}`, 'var(--bad)', false],
              ['Incidência', fmt(base), 'var(--text)', true],
              ['IVA (16%)', fmt(tax), 'var(--text)', true],
            ].map(([l, v, color, border]) => (
              <div
                key={l as string}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: border ? '1px solid var(--bd-soft2)' : undefined,
                }}
              >
                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{l}</span>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: color as string }}>
                  {v}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 4px' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Total</span>
              <span className="tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-fg)' }}>
                {fmt(total)}
              </span>
            </div>
          </div>
          <button
            onClick={emit}
            style={{
              width: '100%',
              height: 46,
              marginTop: 14,
              borderRadius: 11,
              border: 'none',
              background: ACCENT,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Icon name="file-check-2" size={17} />
            Emitir factura
          </button>
          <button
            onClick={emit}
            style={{
              width: '100%',
              height: 42,
              marginTop: 8,
              borderRadius: 11,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text2)',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Icon name="eye" size={16} />
            Pré-visualizar
          </button>
        </div>
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '13px 15px', borderRadius: 13, background: 'var(--info-bg)' }}>
          <span style={{ color: 'var(--info)', flex: 'none', marginTop: 1, display: 'inline-flex' }}>
            <Icon name="save" size={16} />
          </span>
          <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            Rascunho guardado automaticamente às 14:36. As alterações são guardadas à medida que edita.
          </span>
        </div>
      </div>

      {/* Barra fixa */}
      <div
        className="ants-noprint"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--card)',
          borderTop: '1px solid var(--border)',
          padding: '12px 26px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          zIndex: 20,
        }}
      >
        <button
          onClick={() => router.push('/facturas')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            height: 42,
            padding: '0 16px',
            borderRadius: 11,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text2)',
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          <Icon name="x" size={17} />
          Cancelar
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>
            Total:{' '}
            <strong className="tnum" style={{ color: 'var(--text)', fontSize: 15 }}>
              {fmt(total)}
            </strong>
          </span>
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 42,
              padding: '0 18px',
              borderRadius: 11,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 13.5,
              fontWeight: 600,
            }}
          >
            <Icon name="save" size={17} />
            Guardar rascunho
          </button>
          <button
            onClick={emit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 42,
              padding: '0 20px',
              borderRadius: 11,
              border: 'none',
              background: ACCENT,
              color: '#fff',
              fontSize: 13.5,
              fontWeight: 700,
            }}
          >
            <Icon name="file-check-2" size={17} />
            Emitir factura
          </button>
        </div>
      </div>
    </div>
  );
}
