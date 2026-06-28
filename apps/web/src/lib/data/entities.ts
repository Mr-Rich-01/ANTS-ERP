// Fornecedores — portado de design/ANTS-ERP-FONTE-COMPLETA.js. Placeholder de UI.
// Os clientes já estão ligados ao CRM real (Fase 2); fornecedores ligam na sua fase.
// TODO: ligar a Fornecedores.
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

export const SUPPLIER_COUNT = suppliersRaw.length;
