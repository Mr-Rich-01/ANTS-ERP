// Registo de ecrãs e navegação — portado EXACTAMENTE do design (titles/groups/icons/navDef).

/** Cor da marca (fixa, como `this.props.accent` no design). Distinta de --accent-fg (que muda no tema escuro). */
export const ACCENT = '#13343b';

export type ScreenId =
  | 'dashboard'
  | 'pos'
  | 'invoices'
  | 'invoiceNew'
  | 'invoiceDoc'
  | 'clients'
  | 'suppliers'
  | 'receiving'
  | 'poDetail'
  | 'purchases'
  | 'products'
  | 'productDetail'
  | 'inventory'
  | 'production'
  | 'cash'
  | 'dailyClose'
  | 'accounting'
  | 'contracts'
  | 'hr'
  | 'reports'
  | 'admin'
  | 'entityProfile';

export interface ScreenMeta {
  id: ScreenId;
  route: string;
  title: string;
  group: string;
  icon: string;
}

export const SCREENS: Record<ScreenId, ScreenMeta> = {
  dashboard: { id: 'dashboard', route: '/', title: 'Visão Geral', group: 'Principal', icon: 'layout-dashboard' },
  pos: { id: 'pos', route: '/pos', title: 'Ponto de Venda', group: 'Principal', icon: 'scan-barcode' },
  invoices: { id: 'invoices', route: '/facturas', title: 'Facturas', group: 'Vendas & Facturação', icon: 'receipt-text' },
  invoiceNew: { id: 'invoiceNew', route: '/facturas/nova', title: 'Nova factura', group: 'Vendas & Facturação', icon: 'receipt-text' },
  invoiceDoc: { id: 'invoiceDoc', route: '/facturas/documento', title: 'Factura FT 2026/0337', group: 'Vendas & Facturação', icon: 'receipt-text' },
  clients: { id: 'clients', route: '/clientes', title: 'Clientes', group: 'Vendas & Facturação', icon: 'user-round' },
  suppliers: { id: 'suppliers', route: '/fornecedores', title: 'Fornecedores', group: 'Compras', icon: 'building' },
  receiving: { id: 'receiving', route: '/recepcao', title: 'Recepção de mercadorias', group: 'Compras', icon: 'package-check' },
  poDetail: { id: 'poDetail', route: '/compras/ordem', title: 'OC 2026/0148', group: 'Compras', icon: 'truck' },
  purchases: { id: 'purchases', route: '/compras', title: 'Compras', group: 'Operações', icon: 'truck' },
  products: { id: 'products', route: '/produtos', title: 'Produtos & Stock', group: 'Operações', icon: 'package' },
  productDetail: { id: 'productDetail', route: '/produtos/ficha', title: 'Ficha de produto', group: 'Operações', icon: 'package' },
  inventory: { id: 'inventory', route: '/inventario', title: 'Inventário', group: 'Operações', icon: 'clipboard-list' },
  production: { id: 'production', route: '/producao', title: 'Produção', group: 'Operações', icon: 'factory' },
  cash: { id: 'cash', route: '/tesouraria', title: 'Tesouraria', group: 'Finanças', icon: 'wallet' },
  dailyClose: { id: 'dailyClose', route: '/tesouraria/fecho', title: 'Relatório diário de caixa', group: 'Finanças', icon: 'wallet' },
  accounting: { id: 'accounting', route: '/contabilidade', title: 'Contabilidade', group: 'Finanças', icon: 'book-open' },
  contracts: { id: 'contracts', route: '/contratos', title: 'Contratos', group: 'Finanças', icon: 'file-signature' },
  hr: { id: 'hr', route: '/rh', title: 'Recursos Humanos', group: 'Gestão', icon: 'users' },
  reports: { id: 'reports', route: '/relatorios', title: 'Relatórios', group: 'Gestão', icon: 'bar-chart-3' },
  admin: { id: 'admin', route: '/admin', title: 'Administração', group: 'Gestão', icon: 'settings' },
  entityProfile: { id: 'entityProfile', route: '/contas/perfil', title: 'Perfil de conta', group: 'Gestão de contas', icon: 'user-round' },
};

export interface NavItem {
  id: ScreenId;
  label: string;
  icon: string;
  route: string;
  badge?: string;
  /** Permissão necessária para ver o item (validada também no servidor). Vazio = sempre visível. */
  permission?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Permissão por ecrã (subconjunto — itens não listados ficam sempre visíveis).
const NAV_PERMISSION: Partial<Record<ScreenId, string>> = {
  pos: 'sales.create',
  invoices: 'sales.view',
  clients: 'clients.view',
  purchases: 'purchases.create',
  products: 'stock.view',
  accounting: 'accounting.post',
  reports: 'reports.export',
  admin: 'users.manage',
};

// navDef exacto do design.
export const NAV_GROUPS: NavGroup[] = [
  { label: 'PRINCIPAL', items: ['dashboard', 'pos'].map(toNav) },
  {
    label: 'OPERAÇÕES',
    items: [
      { ...toNav('invoices'), badge: '12' },
      toNav('clients'),
      toNav('purchases'),
      toNav('suppliers'),
      toNav('products'),
      toNav('production'),
    ],
  },
  { label: 'FINANÇAS', items: ['cash', 'accounting', 'contracts'].map(toNav) },
  { label: 'GESTÃO', items: ['hr', 'reports', 'admin'].map(toNav) },
];

function toNav(id: string): NavItem {
  const s = SCREENS[id as ScreenId];
  return { id: s.id, label: s.title, icon: s.icon, route: s.route, permission: NAV_PERMISSION[s.id] };
}

/** Filtra grupos/itens pelas permissões do utilizador (Super Admin vê tudo). */
export function visibleNav(permissions: ReadonlySet<string>, isPlatformAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter((it) => !it.permission || isPlatformAdmin || permissions.has(it.permission)),
  })).filter((g) => g.items.length > 0);
}

/** Resolve qual item da sidebar fica activo a partir do ecrã actual (lógica do design). */
export function activeNavId(screen: ScreenId): ScreenId {
  if (screen === 'invoiceNew' || screen === 'invoiceDoc') return 'invoices';
  if (screen === 'receiving' || screen === 'poDetail') return 'purchases';
  if (screen === 'inventory' || screen === 'productDetail') return 'products';
  if (screen === 'dailyClose') return 'cash';
  return screen;
}

/** Mapa rota → ecrã (para resolver o ecrã activo a partir do pathname). */
export const ROUTE_TO_SCREEN: Record<string, ScreenId> = Object.fromEntries(
  Object.values(SCREENS).map((s) => [s.route, s.id]),
) as Record<string, ScreenId>;
