'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import {
  ADMIN_AUDIT,
  ADMIN_ROLES,
  ADMIN_SESSIONS,
  ADMIN_TABS,
  ADMIN_USERS,
  type AdminTabId,
} from '@/lib/data/admin';

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
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' };

function ConfigRow({ label, value, mono, last }: { label: string; value: React.ReactNode; mono?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: last ? undefined : '1px solid var(--bd-soft2)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{label}</span>
      <span className={mono ? 'font-mono' : undefined} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
        {value}
      </span>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTabId>('users');

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 5, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 5, width: 'max-content', maxWidth: '100%', overflowX: 'auto' }}>
        {ADMIN_TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{ height: 36, padding: '0 16px', borderRadius: 9, border: 'none', background: active ? ACCENT : 'transparent', color: active ? '#fff' : 'var(--text2)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7 }}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Utilizadores & permissões */}
      {tab === 'users' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Utilizadores</div>
              <div style={{ flex: 1 }} />
              <button style={{ display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
                <Icon name="user-plus" size={15} />
                Convidar utilizador
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
                <thead>
                  <tr style={{ background: 'var(--card2)' }}>
                    <th style={th}>Utilizador</th>
                    <th style={th}>Perfil</th>
                    <th style={th}>Âmbito</th>
                    <th style={th}>Último acesso</th>
                    <th style={th}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ADMIN_USERS.map((u) => (
                    <tr key={u.email} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#1b4651,#0e2a30)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>
                            {u.ini}
                          </span>
                          <div style={{ lineHeight: 1.25, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{u.name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: u.roleColor, background: u.roleBg, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{u.role}</span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{u.scope}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{u.seen}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: u.statusColor, background: u.statusBg, padding: '3px 9px', borderRadius: 20 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.statusColor }} />
                          {u.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
              <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
                <Icon name="shield-check" size={17} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Perfis &amp; permissões</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 15 }}>Por módulo, página, operação, filial e valor máximo</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {ADMIN_ROLES.map((r) => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid var(--bd-soft2)' }}>
                  <span style={{ color: 'var(--text2)', flex: 'none', display: 'inline-flex' }}>
                    <Icon name="users" size={15} />
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{r.label}</span>
                  <span className="tnum" style={{ fontSize: 11.5, color: 'var(--text2)' }}>
                    {r.count} utiliz.
                  </span>
                  <span style={{ color: 'var(--text4)', display: 'inline-flex' }}>
                    <Icon name="chevron-right" size={15} />
                  </span>
                </div>
              ))}
            </div>
            <button style={{ width: '100%', height: 40, marginTop: 14, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <Icon name="plus" size={16} />
              Criar perfil
            </button>
          </div>
        </div>
      )}

      {/* Sessões */}
      {tab === 'sessions' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Sessões activas</div>
            <div style={{ flex: 1 }} />
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12.5, fontWeight: 500, color: 'var(--bad)' }}>
              <Icon name="log-out" size={15} />
              Terminar todas
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Utilizador</th>
                  <th style={th}>Equipamento</th>
                  <th style={th}>Endereço IP</th>
                  <th style={th}>Localização</th>
                  <th style={th}>Última actividade</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th }} />
                </tr>
              </thead>
              <tbody>
                {ADMIN_SESSIONS.map((s) => (
                  <tr key={s.name} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#1b4651,#0e2a30)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>
                          {s.ini}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{s.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{s.device}</td>
                    <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{s.ip}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{s.loc}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{s.last}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: s.statusColor, background: s.statusBg, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.statusColor }} />
                        {s.statusLabel}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      {s.canEnd ? (
                        <button style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--bad)', fontSize: 11.5, fontWeight: 600 }}>Terminar</button>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text4)', whiteSpace: 'nowrap' }}>— actual —</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Auditoria */}
      {tab === 'audit' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Registo de auditoria</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--field)', border: '1px solid var(--field-bd)', borderRadius: 9, padding: '0 11px', height: 36, width: 230, maxWidth: '32vw', marginLeft: 6 }}>
              <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
                <Icon name="search" size={16} />
              </span>
              <input placeholder="Pesquisar operação, utilizador…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: 12.5, width: '100%', color: 'var(--text)' }} />
            </div>
            <div style={{ flex: 1 }} />
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
              <Icon name="download" size={15} />
              Exportar
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Utilizador</th>
                  <th style={th}>Data / Hora</th>
                  <th style={th}>Operação</th>
                  <th style={th}>Registo</th>
                  <th style={th}>Valor anterior</th>
                  <th style={th}>Novo valor</th>
                  <th style={th}>IP</th>
                </tr>
              </thead>
              <tbody>
                {ADMIN_AUDIT.map((a, i) => (
                  <tr key={i} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bd-soft)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, flex: 'none' }}>
                          {a.ini}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{a.user}</span>
                      </div>
                    </td>
                    <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{a.when}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{a.op}</td>
                    <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{a.record}</td>
                    <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{a.oldV}</td>
                    <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{a.newV}</td>
                    <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empresa / configurações */}
      {tab === 'company' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
                  <Icon name="building-2" size={17} />
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Identidade da empresa</span>
              </div>
              <button style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-fg)', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="pencil" size={14} />
                Editar
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 12, border: '1px solid var(--bd-soft)', borderRadius: 12, marginBottom: 14 }}>
              <span style={{ width: 48, height: 48, borderRadius: 13, background: '#0e2a30', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>A</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>ANTS Comercial, Lda</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Logótipo &amp; nome comercial</div>
              </div>
            </div>
            <ConfigRow label="NUIT" value="400 123 456" mono />
            <ConfigRow label="Endereço" value="Av. 25 de Setembro, 1402" />
            <ConfigRow label="Telefone" value="+258 21 300 400" />
            <ConfigRow label="Email" value="geral@antscomercial.co.mz" last />
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
                  <Icon name="landmark" size={17} />
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Contas bancárias</span>
              </div>
              <button style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-fg)', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="plus" size={14} />
                Adicionar
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(
                [
                  ['landmark', 'var(--info)', 'var(--info-bg)', 'BCI', 'Conta 1234567890'],
                  ['landmark', 'var(--info)', 'var(--info-bg)', 'Millennium BIM', 'Conta 7654321098'],
                  ['smartphone', 'var(--ok)', 'var(--ok-bg)', 'M-Pesa · e-Mola', '84 555 1234 · 86 222 9090'],
                ] as const
              ).map(([icon, color, bg, name, num]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 11, border: '1px solid var(--bd-soft)', borderRadius: 11 }}>
                  <span style={{ color, background: bg, padding: 8, borderRadius: 9, flex: 'none', display: 'inline-flex' }}>
                    <Icon name={icon} size={16} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{name}</div>
                    <div className="font-mono" style={{ fontSize: 11.5, color: 'var(--text3)' }}>{num}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}>
              <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
                <Icon name="percent" size={17} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Fiscal &amp; documentos</span>
            </div>
            <ConfigRow label="Regime de IVA" value="Normal · 16%" />
            <ConfigRow label="Moeda padrão" value="Metical (MT)" />
            <ConfigRow label="Numeração de facturas" value="FT 2026/####" mono />
            <ConfigRow label="Formato de data" value="dia/mês/ano" last />
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}>
              <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
                <Icon name="palette" size={17} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Personalização</span>
            </div>
            <ConfigRow
              label="Cor da marca"
              value={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 6, background: '#13343b', border: '1px solid var(--border)' }} />
                  <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>#13343B</span>
                </span>
              }
            />
            <ConfigRow label="Tema padrão" value="Claro / Escuro" />
            <ConfigRow label="Idioma" value="Português (MZ)" />
            <ConfigRow label="Rodapé de documentos" value="Personalizado" last />
          </div>
        </div>
      )}
    </div>
  );
}
