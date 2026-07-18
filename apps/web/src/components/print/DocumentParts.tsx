/**
 * Blocos partilhados do corpo dos documentos comerciais (S5): tabela de linhas
 * e totais, com o mesmo padrão visual do documento de factura (P1-03/S4).
 */
import { fmt } from '@/lib/format';

export interface PrintableDocLine {
  id: string;
  sku?: string | null;
  description: string;
  unitPrice: number;
  quantity: number;
  discountPercent?: number;
  taxRate?: number;
  total: number;
}

const docTh: React.CSSProperties = { padding: '10px 12px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase' };

export function DocumentPartyBlock({ title, name, nuit, extra }: { title: string; name: string; nuit: string | null; extra?: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.6px', color: '#8aa0a3', textTransform: 'uppercase', marginBottom: 7 }}>{title}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#16282c' }}>{name}</div>
      <div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.6, marginTop: 3 }}>
        <strong style={{ color: '#16282c' }}>NUIT:</strong> {nuit ?? '—'}
      </div>
      {extra}
    </div>
  );
}

export function DocumentMetaRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div style={{ width: 230, flex: 'none' }}>
      {rows.map(([l, v], i) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < rows.length - 1 ? '1px solid #f0f3f3' : undefined }}>
          <span style={{ fontSize: 11.5, color: '#5f7378' }}>{l}</span>
          <span className="tnum" style={{ fontSize: 12, fontWeight: 600 }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DocumentLinesTable({ lines, showDiscount = false }: { lines: PrintableDocLine[]; showDiscount?: boolean }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 22 }}>
      <thead>
        <tr style={{ background: '#13343b', color: '#fff' }}>
          <th style={{ ...docTh, textAlign: 'left', borderRadius: '6px 0 0 6px' }}>Descrição</th>
          <th style={{ ...docTh, textAlign: 'center', width: 56 }}>Qtd</th>
          <th style={{ ...docTh, textAlign: 'right', width: 110 }}>Preço unit.</th>
          {showDiscount ? <th style={{ ...docTh, textAlign: 'right', width: 60 }}>Desc.</th> : null}
          <th style={{ ...docTh, textAlign: 'right', width: 70 }}>IVA</th>
          <th style={{ ...docTh, textAlign: 'right', width: 120, borderRadius: '0 6px 6px 0' }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} style={{ borderBottom: '1px solid #eef2f2' }}>
            <td style={{ padding: '11px 12px', fontSize: 12.5, color: '#16282c' }}>
              <div style={{ fontWeight: 500 }}>{l.description}</div>
              {l.sku ? (
                <div className="font-mono" style={{ fontSize: 10.5, color: '#9aa7a9' }}>
                  {l.sku}
                </div>
              ) : null}
            </td>
            <td className="tnum" style={{ padding: '11px 12px', textAlign: 'center', fontSize: 12.5 }}>
              {l.quantity}
            </td>
            <td className="tnum" style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12.5, whiteSpace: 'nowrap' }}>
              {fmt(l.unitPrice)}
            </td>
            {showDiscount ? (
              <td className="tnum" style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12.5, color: '#5f7378' }}>
                {(l.discountPercent ?? 0) > 0 ? `${l.discountPercent}%` : '—'}
              </td>
            ) : null}
            <td className="tnum" style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12.5, color: '#5f7378' }}>
              {l.taxRate != null ? `${l.taxRate}%` : '—'}
            </td>
            <td className="tnum" style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {fmt(l.total)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DocumentTotalsBlock({
  subtotal,
  discountTotal,
  taxableBase,
  taxTotal,
  total,
  totalLabel,
  left,
}: {
  subtotal: number;
  discountTotal?: number | null;
  taxableBase: number;
  taxTotal: number;
  total: number;
  totalLabel: string;
  left?: React.ReactNode;
}) {
  const rows: Array<[string, string, string, boolean]> = [
    ['Subtotal', fmt(subtotal), '#16282c', false],
    ...(discountTotal != null ? [['Desconto', discountTotal > 0 ? `− ${fmt(discountTotal)}` : '—', '#c2453d', false] as [string, string, string, boolean]] : []),
    ['Incidência IVA', fmt(taxableBase), '#16282c', true],
    ['IVA', fmt(taxTotal), '#16282c', true],
  ];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 22 }}>
      <div style={{ flex: 1, maxWidth: 330 }}>{left}</div>
      <div style={{ width: 280, flex: 'none' }}>
        {rows.map(([l, v, color, border]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: border ? '1px solid #eef2f2' : undefined }}>
            <span style={{ fontSize: 12.5, color: '#5f7378' }}>{l}</span>
            <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color }}>
              {v}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', marginTop: 8, background: '#13343b', color: '#fff', borderRadius: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{totalLabel}</span>
          <span className="tnum" style={{ fontSize: 18, fontWeight: 700 }}>
            {fmt(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function DocumentStatusPill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color, background: bg, padding: '3px 10px', borderRadius: 20 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </div>
  );
}

export function DocumentNoteBox({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warn' }) {
  return (
    <div style={{ marginTop: 18, padding: '11px 13px', borderRadius: 8, background: tone === 'warn' ? '#fff5f3' : '#f8fbfb', color: tone === 'warn' ? '#8b3a32' : '#5f7378', fontSize: 12, lineHeight: 1.55 }}>
      {children}
    </div>
  );
}
