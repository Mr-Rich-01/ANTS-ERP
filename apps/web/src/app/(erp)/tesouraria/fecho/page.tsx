import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { DAILY_CLOSE, DC_DENOMS, DC_METHODS } from '@/lib/data/treasury';

const th: React.CSSProperties = {
  padding: '8px 8px',
  textAlign: 'left',
  fontSize: 10.5,
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

export default function FechoDiarioPage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/tesouraria" style={{ ...outBtn, height: 34 }}>
          <Icon name="arrow-left" size={16} />
          Voltar à Tesouraria
        </Link>
        <div style={{ flex: 1 }} />
        <button style={outBtn}>
          <Icon name="printer" size={15} />
          Imprimir
        </button>
        <button style={outBtn}>
          <Icon name="download" size={15} />
          PDF
        </button>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {/* Cabeçalho */}
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
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Relatório diário de caixa</div>
            <div className="tnum" style={{ fontSize: 12, color: 'var(--text3)' }}>
              RDC 2026/0174 · 24/06/2026
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Caixa 01 · Maputo · Sede</div>
          </div>
        </div>

        <div style={{ padding: '20px 26px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* Resumo por método + numerário */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 11 }}>Movimento por forma de pagamento</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--bd-soft)' }}>
                  <th style={th}>Método</th>
                  <th style={{ ...th, textAlign: 'right' }}>Entradas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Saídas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Líquido</th>
                </tr>
              </thead>
              <tbody>
                {DC_METHODS.map((m) => (
                  <tr key={m.label} style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--text)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: m.color, display: 'inline-flex' }}>
                          <Icon name={m.icon} size={15} />
                        </span>
                        {m.label}
                      </span>
                    </td>
                    <td className="tnum" style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12.5, color: 'var(--ok)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {m.inStr}
                    </td>
                    <td className="tnum" style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12.5, color: 'var(--bad)', whiteSpace: 'nowrap' }}>
                      {m.outStr}
                    </td>
                    <td className="tnum" style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12.5, color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {m.netStr}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ padding: '11px 8px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Total</td>
                  <td className="tnum" style={{ padding: '11px 8px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--ok)', whiteSpace: 'nowrap' }}>
                    {DAILY_CLOSE.inTotalStr}
                  </td>
                  <td className="tnum" style={{ padding: '11px 8px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--bad)', whiteSpace: 'nowrap' }}>
                    {DAILY_CLOSE.outTotalStr}
                  </td>
                  <td className="tnum" style={{ padding: '11px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--accent-fg)', whiteSpace: 'nowrap' }}>
                    {DAILY_CLOSE.netTotalStr}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '22px 0 11px' }}>Contagem de numerário</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--bd-soft)' }}>
                  <th style={th}>Nota / moeda</th>
                  <th style={{ ...th, textAlign: 'right' }}>Quantidade</th>
                  <th style={{ ...th, textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {DC_DENOMS.map((d) => (
                  <tr key={d.noteStr} style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td className="tnum" style={{ padding: '9px 8px', fontSize: 12.5, color: 'var(--text)' }}>
                      {d.noteStr}
                    </td>
                    <td className="tnum" style={{ padding: '9px 8px', textAlign: 'right', fontSize: 12.5, color: 'var(--text2)' }}>
                      × {d.qty}
                    </td>
                    <td className="tnum" style={{ padding: '9px 8px', textAlign: 'right', fontSize: 12.5, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {d.subtotalStr}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td colSpan={2} style={{ padding: '11px 8px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                    Total contado
                  </td>
                  <td className="tnum" style={{ padding: '11px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {DAILY_CLOSE.countedStr}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Reconciliação + operador */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ border: '1px solid var(--bd-soft)', borderRadius: 13, padding: '16px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Reconciliação do caixa</div>
              {[
                ['Saldo de abertura', DAILY_CLOSE.openingStr, 'var(--text)'],
                ['Entradas em dinheiro', DAILY_CLOSE.cashInStr, 'var(--ok)'],
                ['Saídas em dinheiro', DAILY_CLOSE.cashOutStr, 'var(--bad)'],
              ].map(([l, v, color]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bd-soft2)' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{l}</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color }}>
                    {v}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--bd-soft2)' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Esperado em caixa</span>
                <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-fg)' }}>
                  {DAILY_CLOSE.expectedStr}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Contado</span>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>
                  {DAILY_CLOSE.countedStr}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 9, background: 'var(--ok-bg)', marginTop: 5 }}>
                <span style={{ fontSize: 12.5, color: DAILY_CLOSE.diffColor, fontWeight: 600 }}>Diferença</span>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: DAILY_CLOSE.diffColor }}>
                  {DAILY_CLOSE.diffStr}
                </span>
              </div>
            </div>

            <div style={{ border: '1px solid var(--bd-soft)', borderRadius: 13, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 9 }}>Operador responsável</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, background: '#0e2a30', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>MT</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Maria Tembe</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Operadora de caixa · turno 08h–17h</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                {['Assinatura do operador', 'Conferido por (tesouraria)'].map((l) => (
                  <div key={l}>
                    <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 6 }}>{l}</div>
                    <div style={{ height: 56, border: '1.5px dashed var(--field-bd)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text4)' }}>
                      <Icon name="pen-line" size={15} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button style={{ width: '100%', height: 46, borderRadius: 12, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="lock" size={18} />
              Fechar caixa do dia
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
