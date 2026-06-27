'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';
import { ADMIN_TABS, type AdminTabId } from '@/lib/data/admin';
import { auditValue, initials, relativeTime, roleTone, shortDateTime } from '@/lib/ui-format';

interface UserRow {
  id: string;
  name: string;
  email: string;
  roleNames: string[];
  status: 'ACTIVE' | 'INACTIVE';
  lastLoginAt: string | null;
  branchNames: string[];
}
interface RoleRow {
  id: string;
  name: string;
  userCount: number;
}
interface AuditRow {
  id: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  createdAt: string;
}
interface CompanyInfo {
  legalName: string;
  tradeName: string | null;
  nuit: string | null;
  email: string | null;
  phone: string | null;
  currencySymbol: string;
  locale: string;
}

interface Props {
  users: UserRow[];
  roles: RoleRow[];
  audit: AuditRow[];
  company: CompanyInfo | null;
  canViewAudit: boolean;
}

const ACTION_LABEL: Record<string, string> = {
  'product.price_update': 'Alterou preço',
  'invoice.cancel': 'Anulou factura',
  'sale.create': 'Registou venda',
};

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

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '46px 20px', textAlign: 'center' }}>
      <span style={{ color: 'var(--text4)', background: 'var(--bd-soft)', padding: 12, borderRadius: 14, display: 'inline-flex' }}>
        <Icon name={icon} size={24} />
      </span>
      <span style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 360, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

export function AdminClient({ users, roles, audit, company, canViewAudit }: Props) {
  const [tab, setTab] = useState<AdminTabId>('users');

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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

      {/* Utilizadores & perfis */}
      {tab === 'users' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Utilizadores</div>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>· {users.length}</span>
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
                  {users.map((u) => {
                    const role = u.roleNames[0] ?? '—';
                    const tone = roleTone(role);
                    const active = u.status === 'ACTIVE';
                    return (
                      <tr key={u.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                            <span style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#1b4651,#0e2a30)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>
                              {initials(u.name)}
                            </span>
                            <div style={{ lineHeight: 1.25, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{u.name}</div>
                              <div style={{ fontSize: 11.5, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: tone.color, background: tone.bg, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{role}</span>
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                          {u.branchNames.length ? u.branchNames.join(', ') : 'Empresa'}
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{relativeTime(u.lastLoginAt)}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: active ? 'var(--ok)' : 'var(--text3)', background: active ? 'var(--ok-bg)' : 'var(--bd-soft)', padding: '3px 9px', borderRadius: 20 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--ok)' : 'var(--text3)' }} />
                            {active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
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
              {roles.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid var(--bd-soft2)' }}>
                  <span style={{ color: 'var(--text2)', flex: 'none', display: 'inline-flex' }}>
                    <Icon name="users" size={15} />
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{r.name}</span>
                  <span className="tnum" style={{ fontSize: 11.5, color: 'var(--text2)' }}>
                    {r.userCount} utiliz.
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

      {/* Sessões — JWT, não persistidas em BD */}
      {tab === 'sessions' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Sessões activas</div>
          </div>
          <EmptyState
            icon="monitor-smartphone"
            text="As sessões são geridas por token (Auth.js) e não são registadas na base de dados nesta fase. O registo e a revogação de sessões serão activados quando passarmos a sessões persistidas."
          />
        </div>
      )}

      {/* Auditoria */}
      {tab === 'audit' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--bd-soft)', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Registo de auditoria</div>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>· {audit.length}</span>
            <div style={{ flex: 1 }} />
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
              <Icon name="download" size={15} />
              Exportar
            </button>
          </div>
          {!canViewAudit ? (
            <EmptyState icon="lock" text="Não tem permissão para ver o registo de auditoria (audit.view)." />
          ) : audit.length === 0 ? (
            <EmptyState icon="history" text="Ainda não há registos de auditoria para esta empresa." />
          ) : (
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
                  {audit.map((a) => (
                    <tr key={a.id} className="ants-row" style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bd-soft)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, flex: 'none' }}>
                            {initials(a.userName)}
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{a.userName}</span>
                        </div>
                      </td>
                      <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{shortDateTime(a.createdAt)}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{ACTION_LABEL[a.action] ?? a.action}</td>
                      <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{a.entityId ?? a.entity}</td>
                      <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{auditValue(a.oldValues)}</td>
                      <td className="tnum" style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{auditValue(a.newValues)}</td>
                      <td className="font-mono" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{a.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empresa */}
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
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{company?.legalName ?? '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{company?.tradeName ?? 'Nome comercial'}</div>
              </div>
            </div>
            <ConfigRow label="NUIT" value={company?.nuit ?? '—'} mono />
            <ConfigRow label="Telefone" value={company?.phone ?? '—'} />
            <ConfigRow label="Email" value={company?.email ?? '—'} last />
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}>
              <span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}>
                <Icon name="percent" size={17} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Fiscal &amp; localização</span>
            </div>
            <ConfigRow label="Regime de IVA" value="Normal · 16%" />
            <ConfigRow label="Moeda padrão" value={`${company?.currencySymbol ?? 'MT'}`} />
            <ConfigRow label="Idioma" value={company?.locale === 'pt-MZ' ? 'Português (MZ)' : (company?.locale ?? 'pt-MZ')} />
            <ConfigRow label="Formato de data" value="dia/mês/ano" last />
          </div>

          <div style={{ ...card, gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <span style={{ color: 'var(--info)', display: 'inline-flex' }}>
                <Icon name="info" size={16} />
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Contas bancárias, séries documentais e personalização</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.5 }}>
              Estas configurações são geridas na <strong>Fase 2 (configurações &amp; dados mestres)</strong>. A
              identidade, moeda e idioma acima já vêm da base de dados.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
