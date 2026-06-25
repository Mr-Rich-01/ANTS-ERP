import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { PO_APPROVALS, PO_GRAND_STR, PO_LINES, PO_SUB_STR, PO_TAX_STR } from '@/lib/data/purchases';

const th: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'right',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.5px',
  color: 'var(--text3)',
  textTransform: 'uppercase',
};
const outBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  height: 36,
  padding: '0 13px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text2)',
  fontSize: 12.5,
  fontWeight: 600,
};

export default function OcDetalhePage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/compras" style={{ ...outBtn, height: 34, padding: '0 13px' }}>
          <Icon name="arrow-left" size={16} />
          Voltar às ordens de compra
        </Link>
        <div style={{ flex: 1 }} />
        <button style={outBtn}>
          <Icon name="printer" size={15} />
          Imprimir
        </button>
        <Link
          href="/recepcao"
          style={{ ...outBtn, border: 'none', background: ACCENT, color: '#fff' }}
        >
          <Icon name="package-check" size={15} />
          Receber mercadoria
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: 14, alignItems: 'start' }}>
        {/* Documento */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--bd-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 21, color: '#fff', flex: 'none' }}>
                A
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>ANTS Comercial, Lda</div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>NUIT 400 123 456 · Av. 25 de Setembro, Maputo</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '1px', color: 'var(--accent-fg)' }}>ORDEM DE COMPRA</div>
              <div className="font-mono" style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 5 }}>
                OC 2026/0148
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '3px 10px', borderRadius: 20, marginTop: 7 }}>
                Recepção parcial
              </div>
            </div>
          </div>

          <div style={{ padding: '18px 26px', display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', borderBottom: '1px solid var(--bd-soft)' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.6px', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 7 }}>Fornecedor</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Dangote Cimento, SA</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginTop: 3 }}>
                NUIT 400 990 112
                <br />
                Av. das Indústrias · Matola
                <br />
                +258 21 720 400
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {[
                ['Data de emissão', '12/06/2026'],
                ['Entrega prevista', '20/06/2026'],
                ['Armazém destino', 'Central · Matola'],
              ].map(([l, v], i) => (
                <div key={l} style={{ display: 'flex', gap: 30, justifyContent: 'flex-end', marginBottom: i < 2 ? 9 : 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{l}</span>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', minWidth: 90 }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={{ ...th, textAlign: 'left', padding: '10px 26px' }}>Produto</th>
                  <th style={th}>Qtd.</th>
                  <th style={th}>Preço unit.</th>
                  <th style={{ ...th, padding: '10px 26px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {PO_LINES.map((l) => (
                  <tr key={l.name} style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '12px 26px', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      {l.name}
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}> · {l.unit}</span>
                    </td>
                    <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>
                      {l.qty}
                    </td>
                    <td className="tnum" style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {l.priceStr}
                    </td>
                    <td className="tnum" style={{ padding: '12px 26px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {l.totalStr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 26px 22px' }}>
            <div style={{ width: 280 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Subtotal</span>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>
                  {PO_SUB_STR}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--bd-soft)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>IVA (16%)</span>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>
                  {PO_TAX_STR}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '11px 0' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Total</span>
                <span className="tnum" style={{ fontSize: 19, fontWeight: 700, color: 'var(--accent-fg)' }}>
                  {PO_GRAND_STR}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Aprovações + condições */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 15 }}>Histórico de aprovações</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {PO_APPROVALS.map((a, i) => (
                <div key={a.text} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
                    <span style={{ color: a.color, background: a.bg, padding: 7, borderRadius: 9, display: 'inline-flex' }}>
                      <Icon name={a.icon} size={14} />
                    </span>
                    {i < PO_APPROVALS.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--bd-soft)', margin: '3px 0' }} />}
                  </div>
                  <div style={{ paddingBottom: 15 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>{a.text}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{a.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 11 }}>Condições</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                ['Pagamento', '30 dias'],
                ['Moeda', 'Metical (MT)'],
                ['Transporte', 'Por conta do fornecedor'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{l}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
