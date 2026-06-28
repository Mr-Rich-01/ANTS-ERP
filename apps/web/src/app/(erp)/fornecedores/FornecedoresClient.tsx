'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { KpiCard, KpiGrid, type KpiCardData } from '@/components/ui/KpiCard';
import { ACCENT } from '@/lib/erp-nav';
import { SupplierFormDialog } from '@/components/fornecedores/SupplierFormDialog';

export interface SupplierRow {
  id: string;
  name: string;
  ini: string;
  nuit: string;
  phone: string;
  balStr: string;
  balColor: string;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
}

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

export function FornecedoresClient({ kpis, rows, canCreate }: { kpis: KpiCardData[]; rows: SupplierRow[]; canCreate: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(term) || r.nuit.toLowerCase().includes(term) || r.phone.toLowerCase().includes(term));
  }, [q, rows]);

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KpiGrid>
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiGrid>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--field)',
              border: '1px solid var(--field-bd)',
              borderRadius: 9,
              padding: '0 11px',
              height: 36,
              width: 260,
              maxWidth: '38vw',
            }}
          >
            <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
              <Icon name="search" size={16} />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar fornecedor, NUIT…"
              style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }}
            />
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {filtered.length} {filtered.length === 1 ? 'fornecedor' : 'fornecedores'}
          </span>
          {canCreate && (
            <SupplierFormDialog
              mode="create"
              trigger={
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    height: 36,
                    padding: '0 13px',
                    borderRadius: 9,
                    border: 'none',
                    background: ACCENT,
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="plus" size={15} />
                  Novo fornecedor
                </button>
              }
            />
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Fornecedor</th>
                <th style={th}>NUIT</th>
                <th style={th}>Contacto</th>
                <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    {rows.length === 0 ? 'Ainda não há fornecedores. Crie o primeiro.' : 'Nenhum fornecedor corresponde à pesquisa.'}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/contas/perfil?type=supplier&id=${r.id}`)}
                    className="ants-row"
                    style={{ borderBottom: '1px solid var(--bd-soft2)', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <span
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            background: 'linear-gradient(135deg,#1b4651,#0e2a30)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            flex: 'none',
                          }}
                        >
                          {r.ini}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.name}</span>
                      </div>
                    </td>
                    <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {r.nuit}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{r.phone}</td>
                    <td className="tnum" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: r.balColor, whiteSpace: 'nowrap' }}>
                      {r.balStr}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: r.statusColor,
                          background: r.statusBg,
                          padding: '3px 9px',
                          borderRadius: 20,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.statusColor }} />
                        {r.statusLabel}
                      </span>
                    </td>
                    <td style={{ padding: '11px 10px', textAlign: 'center' }}>
                      <span style={{ color: 'var(--text4)', display: 'inline-flex' }}>
                        <Icon name="chevron-right" size={17} />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
