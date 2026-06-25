import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import {
  INVENTORY_DIFF_COLOR,
  INVENTORY_DIFF_STR,
  INVENTORY_ITEMS,
  INVENTORY_KPIS,
} from '@/lib/data/products';

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

export default function InventarioPage() {
  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Link
        href="/produtos"
        style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' }}
      >
        <Icon name="arrow-left" size={16} />
        Voltar a Produtos &amp; Stock
      </Link>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 11, borderRadius: 13, flex: 'none', display: 'inline-flex' }}>
          <Icon name="clipboard-list" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Inventário INV 2026/06</h2>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--info)', background: 'var(--info-bg)', padding: '3px 10px', borderRadius: 20 }}>Em contagem</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 22, rowGap: 6, marginTop: 9 }}>
            <span style={meta}>
              <Icon name="warehouse" size={14} color="var(--text3)" />
              Armazém Central · Matola
            </span>
            <span style={meta}>
              <Icon name="calendar-days" size={14} color="var(--text3)" />
              Iniciado 24/06/2026
            </span>
            <span style={meta}>
              <Icon name="user" size={14} color="var(--text3)" />
              Responsável: Carlos Sitoe
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9, flex: 'none' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600 }}>
            <Icon name="download" size={15} />
            Exportar
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
            <Icon name="check-circle-2" size={15} />
            Validar ajustes
          </button>
        </div>
      </div>

      <KpiGrid>
        {INVENTORY_KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
            <Icon name="scan-line" size={17} />
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Folha de contagem</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--field)', border: '1px solid var(--field-bd)', borderRadius: 9, padding: '0 11px', height: 34, width: 220, maxWidth: '32vw', marginLeft: 6 }}>
            <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
              <Icon name="search" size={15} />
            </span>
            <input placeholder="Pesquisar ou ler código…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 840 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Produto</th>
                <th style={th}>Categoria</th>
                <th style={{ ...th, textAlign: 'right' }}>Sistema</th>
                <th style={{ ...th, textAlign: 'center' }}>Contado</th>
                <th style={{ ...th, textAlign: 'right' }}>Diferença</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {INVENTORY_ITEMS.map((i) => (
                <tr key={i.sku} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {i.name}
                    <div className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {i.sku}
                    </div>
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{i.cat}</td>
                  <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>
                    {i.sys}
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--field-bd)', background: 'var(--field)', borderRadius: 9, padding: '4px 8px' }}>
                      <Icon name="minus" size={13} color="var(--text3)" />
                      <span className="tnum" style={{ minWidth: 34, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {i.counted}
                      </span>
                      <Icon name="plus" size={13} color="var(--text3)" />
                    </div>
                  </td>
                  <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: i.diffColor }}>
                    {i.diffStr}
                  </td>
                  <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: i.valDiffColor, whiteSpace: 'nowrap' }}>
                    {i.valDiffStr}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: i.statusColor, background: i.statusBg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: i.statusColor }} />
                      {i.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--card2)' }}>
                <td colSpan={4} style={{ padding: '13px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                  Impacto total no valor do stock
                </td>
                <td colSpan={2} className="tnum" style={{ padding: '13px 14px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: INVENTORY_DIFF_COLOR, whiteSpace: 'nowrap' }}>
                  {INVENTORY_DIFF_STR}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
