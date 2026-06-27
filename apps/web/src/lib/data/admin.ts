// Tabs da Administração. Os dados (utilizadores/perfis/auditoria/empresa) vêm agora
// da base de dados via packages/domain — ver app/(erp)/admin/page.tsx.
export const ADMIN_TABS = [
  { id: 'users', label: 'Utilizadores', icon: 'users' },
  { id: 'sessions', label: 'Sessões', icon: 'monitor-smartphone' },
  { id: 'audit', label: 'Auditoria', icon: 'history' },
  { id: 'company', label: 'Empresa', icon: 'building-2' },
] as const;
export type AdminTabId = (typeof ADMIN_TABS)[number]['id'];
