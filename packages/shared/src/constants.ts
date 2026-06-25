// Constantes de localização padrão — ANTS ERP (Moçambique)
export const DEFAULT_LOCALE = 'pt-MZ';
export const DEFAULT_CURRENCY = 'MZN';
export const DEFAULT_CURRENCY_SYMBOL = 'MT';
export const DEFAULT_TIMEZONE = 'Africa/Maputo';
export const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY';

// Métodos de pagamento suportados (configuráveis por empresa no futuro)
export const PAYMENT_METHODS = [
  'CASH',
  'MPESA',
  'EMOLA',
  'POS_BANK',
  'BANK_TRANSFER',
  'CHEQUE',
  'CURRENT_ACCOUNT',
  'CREDIT',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Catálogo de permissões (espelha o seed da base de dados)
export const PERMISSION_KEYS = [
  'clients.view',
  'clients.create',
  'clients.update',
  'clients.delete',
  'sales.view',
  'sales.create',
  'sales.cancel',
  'sales.approve_discount',
  'invoices.issue',
  'invoices.cancel',
  'payments.receive',
  'payments.cancel',
  'stock.view',
  'stock.adjust',
  'stock.transfer',
  'purchases.create',
  'purchases.approve',
  'accounting.post',
  'accounting.reverse',
  'payroll.process',
  'payroll.approve',
  'reports.export',
  'users.manage',
  'settings.manage',
  'audit.view',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
