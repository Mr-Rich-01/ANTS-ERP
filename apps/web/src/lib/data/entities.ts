// Clientes & Fornecedores — portado de design/ANTS-ERP-FONTE-COMPLETA.js. Placeholder de UI.
// TODO: ligar a CRM / Fornecedores (Fase 2).
import { fmt } from '@/lib/format';
import type { KpiCardData } from '@/components/ui/KpiCard';

export interface EntityRow {
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

const cliState: Record<string, [string, string, string]> = {
  devedor: ['Com dívida', 'var(--bad)', 'var(--bad-bg)'],
  regular: ['Regularizado', 'var(--ok)', 'var(--ok-bg)'],
  credor: ['Saldo a favor', 'var(--info)', 'var(--info-bg)'],
};

const clientsRaw: Array<[string, string, string, string, number, string]> = [
  ['Distribuidora Maputo, Lda', 'DM', '400 785 214', '+258 84 321 0099', 48900, 'devedor'],
  ['Farmácia Sigma', 'FS', '400 112 908', '+258 82 110 2030', 0, 'regular'],
  ['Restaurante Costa do Sol', 'CS', '400 556 711', '+258 84 700 1212', 15200, 'devedor'],
  ['Hotel Polana Lodge', 'HP', '400 778 540', '+258 21 491 001', 62400, 'devedor'],
  ['Mercearia Bom Preço', 'BP', '400 334 122', '+258 86 555 0099', 0, 'regular'],
  ['Auto Peças Matola', 'AM', '400 220 665', '+258 84 909 8800', -3400, 'credor'],
];

export const CLIENTS: EntityRow[] = clientsRaw.map(([name, ini, nuit, phone, bal, st]) => ({
  name,
  ini,
  nuit,
  phone,
  balStr: fmt(bal),
  balColor: bal > 0 ? 'var(--bad)' : bal < 0 ? 'var(--info)' : 'var(--text3)',
  statusLabel: cliState[st]![0],
  statusColor: cliState[st]![1],
  statusBg: cliState[st]![2],
}));

export const CLIENT_KPIS: KpiCardData[] = (
  [
    ['Total de clientes', '156', 'petroleum', 'users', '12 novos no mês'],
    ['Contas a receber', fmt(728400), 'amber', 'arrow-down-left', '23 facturas'],
    ['Clientes com dívida', '23', 'red', 'alert-triangle', '187 200 MT vencido'],
    ['Novos no mês', '12', 'green', 'user-plus', '+8% vs Maio'],
  ] as const
).map(([label, valueStr, tone, icon, sub]) => ({ label, valueStr, tone, icon, sub }));

const supState: Record<string, [string, string, string]> = {
  pagar: ['A pagar', 'var(--bad)', 'var(--bad-bg)'],
  regular: ['Regularizado', 'var(--ok)', 'var(--ok-bg)'],
};

const suppliersRaw: Array<[string, string, string, string, number, string]> = [
  ['Dangote Cimento, SA', 'DC', '400 990 112', '+258 21 720 400', 186300, 'pagar'],
  ['Distribuidora Fula', 'DF', '400 221 884', '+258 84 330 1188', 0, 'regular'],
  ['Coca-Cola Sabco', 'CC', '400 778 221', '+258 21 460 700', 84000, 'pagar'],
  ['Xinavane Açúcar, SA', 'XA', '400 112 667', '+258 23 110 050', 57000, 'pagar'],
  ['Águas de Moçambique', 'AG', '400 556 003', '+258 21 350 900', 0, 'regular'],
  ['Lux Higiene, Lda', 'LH', '400 334 909', '+258 84 221 6677', 12000, 'pagar'],
];

export const SUPPLIERS: EntityRow[] = suppliersRaw.map(([name, ini, nuit, phone, bal, st]) => ({
  name,
  ini,
  nuit,
  phone,
  balStr: fmt(bal),
  balColor: bal > 0 ? 'var(--bad)' : 'var(--text3)',
  statusLabel: supState[st]![0],
  statusColor: supState[st]![1],
  statusBg: supState[st]![2],
}));

export const SUPPLIER_KPIS: KpiCardData[] = (
  [
    ['Total de fornecedores', '38', 'petroleum', 'building', '7 categorias'],
    ['Contas a pagar', fmt(415900), 'red', 'arrow-up-right', '14 facturas'],
    ['Em atraso', '4', 'amber', 'clock', 'requer pagamento'],
    ['Activos', '31', 'green', 'check-circle-2', 'com movimento'],
  ] as const
).map(([label, valueStr, tone, icon, sub]) => ({ label, valueStr, tone, icon, sub }));

export const CLIENT_COUNT = clientsRaw.length;
export const SUPPLIER_COUNT = suppliersRaw.length;
