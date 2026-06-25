import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import {
  REC_LINES,
  REC_PROGRESS,
  REC_TOTAL_ORDERED,
  REC_TOTAL_RECEIVED,
} from '@/lib/data/purchases';

const th: React.CSSProperties = {
  padding: '11px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.5px',
  color: 'var(--text3)',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--bd-soft)',
};
const meta: React.CSSProperties = { fontSize: 12.5, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 };

export default function RecepcaoPage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link
        href="/compras"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          height: 34,
          padding: '0 13px',
          borderRadius: 9,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--text2)',
          fontSize: 12.5,
          fontWeight: 600,
          width: 'max-content',
        }}
      >
        <Icon name="arrow-left" size={16} />
        Voltar às ordens de compra
      </Link>

      {/* Cabeçalho */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 11, borderRadius: 13, flex: 'none', display: 'inline-flex' }}>
          <Icon name="package-check" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Recepção · OC 2026/0148</h2>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '3px 10px', borderRadius: 20 }}>
              Recepção parcial
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 22, rowGap: 6, marginTop: 10 }}>
            <span style={meta}>
              <Icon name="building" size={14} color="var(--text3)" />
              Dangote Cimento, SA
            </span>
            <span style={meta}>
              <Icon name="calendar-days" size={14} color="var(--text3)" />
              Recebido em 24/06/2026
            </span>
            <span style={meta}>
              <Icon name="warehouse" size={14} color="var(--text3)" />
              Armazém Central · Matola
            </span>
            <span style={meta}>
              <Icon name="user" size={14} color="var(--text3)" />
              Recebido por Hélder Munguambe
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 3 }}>Progresso da recepção</div>
          <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-fg)' }}>
            {REC_PROGRESS}
          </div>
          <div className="tnum" style={{ fontSize: 11.5, color: 'var(--text3)' }}>
            {REC_TOTAL_RECEIVED} / {REC_TOTAL_ORDERED} unidades
          </div>
        </div>
      </div>

      {/* Linhas a receber */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="clipboard-check" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Linhas a receber</div>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>· confira quantidade, lote e validade</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Produto</th>
                <th style={{ ...th, textAlign: 'right' }}>Pedido</th>
                <th style={{ ...th, textAlign: 'center' }}>Recebido</th>
                <th style={th}>Lote</th>
                <th style={th}>Validade</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {REC_LINES.map((r) => (
                <tr key={r.sku} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {r.name}
                    <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {r.sku} · {r.unit}
                    </div>
                  </td>
                  <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>
                    {r.ordered}
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--field-bd)', background: 'var(--field)', borderRadius: 9, padding: '4px 8px' }}>
                      <Icon name="minus" size={13} color="var(--text3)" />
                      <span className="tnum" style={{ minWidth: 34, textAlign: 'center', fontSize: 13, fontWeight: 700, color: r.recCol }}>
                        {r.received}
                      </span>
                      <Icon name="plus" size={13} color="var(--text3)" />
                    </div>
                  </td>
                  <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>
                    {r.lot}
                  </td>
                  <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>
                    {r.exp}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: r.statusColor, background: r.statusBg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.statusColor }} />
                      {r.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Total</td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {REC_TOTAL_ORDERED}
                </td>
                <td className="tnum" style={{ padding: '13px 14px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--accent-fg)' }}>
                  {REC_TOTAL_RECEIVED}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Observações + resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
            <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
              <Icon name="message-square-text" size={17} />
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Observações da recepção</span>
          </div>
          <textarea
            defaultValue="2 sacos de Cimento 25kg com embalagem danificada — aceites com reserva. Restantes 40 sacos pendentes para segunda entrega."
            placeholder="Registe diferenças, danos, embalagens em falta ou notas para o fornecedor…"
            style={{ width: '100%', minHeight: 96, resize: 'vertical', border: '1px solid var(--field-bd)', background: 'var(--field)', borderRadius: 11, padding: '12px 13px', fontSize: 13, color: 'var(--text)', outline: 'none', lineHeight: 1.5 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13, padding: 12, border: '1.5px dashed var(--field-bd)', borderRadius: 11, color: 'var(--text3)' }}>
            <Icon name="paperclip" size={16} />
            <span style={{ fontSize: 12.5 }}>Anexar guia de remessa ou fotografias</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent-fg)' }}>Carregar ficheiro</span>
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Resumo</div>
          {[
            ['Linhas conformes', '2 de 4', 'var(--ok)'],
            ['Recepção parcial', '1 linha', 'var(--warn)'],
            ['Por receber', '1 linha', 'var(--text2)'],
          ].map(([l, v, color]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: 'var(--text2)' }}>{l}</span>
              <span style={{ fontWeight: 600, color }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 10, background: 'var(--warn-bg)', marginTop: 4 }}>
            <span style={{ color: 'var(--warn)', flex: 'none', display: 'inline-flex' }}>
              <Icon name="info" size={16} />
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.4 }}>
              A ordem ficará em <strong>recepção parcial</strong> até receber as unidades restantes.
            </span>
          </div>
          <button
            style={{
              width: '100%',
              height: 44,
              marginTop: 6,
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
            <Icon name="check-circle-2" size={18} />
            Confirmar recepção
          </button>
          <button
            style={{
              width: '100%',
              height: 40,
              borderRadius: 11,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text2)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Guardar como rascunho
          </button>
        </div>
      </div>
    </div>
  );
}
