// Administração — portado de design/ANTS-ERP-FONTE-COMPLETA.js. Placeholder de UI.
// TODO: ligar a Utilizadores/Sessões/Auditoria (Fase 1).

const roleColor: Record<string, [string, string]> = {
  Administrador: ['var(--accent-fg)', 'var(--accent-bg)'],
  Contabilista: ['var(--info)', 'var(--info-bg)'],
  'Resp. Stock': ['var(--warn)', 'var(--warn-bg)'],
};

const usersRaw: Array<[string, string, string, string, string, string, string]> = [
  ['Hélder Munguambe', 'helder@antscomercial.co.mz', 'HM', 'Administrador', 'Todas as filiais', 'há 4 min', 'activo'],
  ['Maria Tembe', 'maria@antscomercial.co.mz', 'MT', 'Caixa', 'Maputo · Caixa 01', 'há 12 min', 'activo'],
  ['Ana Cossa', 'ana@antscomercial.co.mz', 'AC', 'Contabilista', 'Sede', 'há 1 h', 'activo'],
  ['João Macuácua', 'joao@antscomercial.co.mz', 'JM', 'Vendedor', 'Matola', 'há 2 h', 'activo'],
  ['Carlos Sitoe', 'carlos@antscomercial.co.mz', 'CS', 'Vendedor', 'Maputo', 'ontem', 'activo'],
  ['Lúcia Mondlane', 'lucia@antscomercial.co.mz', 'LM', 'Resp. Stock', 'Armazém Central', 'há 3 dias', 'inactivo'],
];

export const ADMIN_USERS = usersRaw.map(([name, email, ini, role, scope, seen, st]) => {
  const rc = roleColor[role] ?? ['var(--text2)', 'var(--bd-soft)'];
  return {
    name,
    email,
    ini,
    role,
    scope,
    seen,
    roleColor: rc[0],
    roleBg: rc[1],
    statusLabel: st === 'activo' ? 'Activo' : 'Inactivo',
    statusColor: st === 'activo' ? 'var(--ok)' : 'var(--text3)',
    statusBg: st === 'activo' ? 'var(--ok-bg)' : 'var(--bd-soft)',
  };
});

export const ADMIN_ROLES = (
  [
    ['Superadministrador', '1'],
    ['Administrador', '2'],
    ['Gestor', '3'],
    ['Contabilista', '2'],
    ['Tesoureiro', '1'],
    ['Caixa', '4'],
    ['Vendedor', '6'],
    ['Resp. de Stock', '2'],
    ['Auditor', '1'],
  ] as const
).map(([label, count]) => ({ label, count }));

const sessState: Record<string, [string, string, string]> = {
  actual: ['Esta sessão', 'var(--ok)', 'var(--ok-bg)'],
  activa: ['Activa', 'var(--info)', 'var(--info-bg)'],
  expirada: ['Expirada', 'var(--text3)', 'var(--bd-soft)'],
};

const sessRaw: Array<[string, string, string, string, string, string, string, string]> = [
  ['Hélder Munguambe', 'HM', 'MacBook Pro · Chrome', '196.28.10.4', 'Maputo, MZ', '08:12', 'Agora', 'actual'],
  ['Maria Tembe', 'MT', 'Android · App ANTS', '196.28.10.55', 'Maputo, MZ', '07:45', 'há 3 min', 'activa'],
  ['Ana Cossa', 'AC', 'Windows · Edge', '41.220.3.18', 'Matola, MZ', '09:02', 'há 25 min', 'activa'],
  ['João Macuácua', 'JM', 'iPhone · Safari', '197.218.7.9', 'Matola, MZ', 'ontem 17:30', 'ontem 18:10', 'expirada'],
];

export const ADMIN_SESSIONS = sessRaw.map(([name, ini, device, ip, loc, , last, st]) => ({
  name,
  ini,
  device,
  ip,
  loc,
  last,
  statusLabel: sessState[st]![0],
  statusColor: sessState[st]![1],
  statusBg: sessState[st]![2],
  isCurrent: st === 'actual',
  canEnd: st !== 'actual',
}));

export const ADMIN_AUDIT = (
  [
    ['Ana Cossa', 'AC', '23/06 14:10', 'Alterou preço', 'Produto ANTS-OIL-1', '150,00 MT', '165,00 MT', '196.28.10.4'],
    ['Hélder M.', 'HM', '23/06 11:32', 'Anulou factura', 'FT 2026/0331', 'Activa', 'Cancelada', '196.28.10.4'],
    ['Maria Tembe', 'MT', '23/06 09:15', 'Registou venda', 'VND-2041', '—', '12 500,00 MT', '196.28.10.55'],
    ['Carlos Sitoe', 'CS', '22/06 16:48', 'Aplicou desconto', 'VND-2038', '0%', '10%', '197.218.7.9'],
    ['Sistema', 'SY', '22/06 00:05', 'Cobrança recorrente', 'CT 2026/0021', '—', '18 000,00 MT', '—'],
  ] as const
).map(([user, ini, when, op, record, oldV, newV, ip]) => ({ user, ini, when, op, record, oldV, newV, ip }));

export const ADMIN_TABS = [
  { id: 'users', label: 'Utilizadores', icon: 'users' },
  { id: 'sessions', label: 'Sessões', icon: 'monitor-smartphone' },
  { id: 'audit', label: 'Auditoria', icon: 'history' },
  { id: 'company', label: 'Empresa', icon: 'building-2' },
] as const;
export type AdminTabId = (typeof ADMIN_TABS)[number]['id'];
