// Facturas — portado de design/ANTS-ERP-FONTE-COMPLETA.js. Placeholder de UI.
// TODO: ligar ao módulo de Vendas/Facturação (Fase 4).
import { fmt } from '@/lib/format';

export type InvoiceStatus = 'pago' | 'parcial' | 'pendente' | 'vencido' | 'cancelado';

export const INVOICE_STATUS: Record<InvoiceStatus, [string, string, string]> = {
  pago: ['Pago', 'var(--ok)', 'var(--ok-bg)'],
  parcial: ['Parcial', 'var(--info)', 'var(--info-bg)'],
  pendente: ['Pendente', 'var(--warn)', 'var(--warn-bg)'],
  vencido: ['Vencido', 'var(--bad)', 'var(--bad-bg)'],
  cancelado: ['Cancelado', 'var(--text3)', 'var(--bd-soft)'],
};

export interface Invoice {
  number: string;
  client: string;
  nuit: string;
  date: string;
  due: string;
  total: number;
  status: InvoiceStatus;
}

const invRaw: Array<[string, string, string, string, string, number, InvoiceStatus]> = [
  ['FT 2026/0337', 'Distribuidora Maputo, Lda', '400 785 214', '23/06/2026', '23/07/2026', 48900, 'pendente'],
  ['FT 2026/0336', 'Farmácia Sigma', '400 112 908', '22/06/2026', '22/07/2026', 23450, 'pago'],
  ['FT 2026/0335', 'Restaurante Costa do Sol', '400 556 711', '21/06/2026', '06/07/2026', 15200, 'parcial'],
  ['FT 2026/0334', 'Construções Zambeze, SA', '400 901 233', '18/06/2026', '18/06/2026', 186300, 'vencido'],
  ['FT 2026/0333', 'Mercearia Bom Preço', '400 334 122', '17/06/2026', '17/07/2026', 8750, 'pago'],
  ['FT 2026/0332', 'Hotel Polana Lodge', '400 778 540', '15/06/2026', '30/06/2026', 62400, 'pendente'],
  ['FT 2026/0331', 'Auto Peças Matola', '400 220 665', '12/06/2026', '12/06/2026', 34100, 'cancelado'],
  ['FT 2026/0330', 'Padaria Central', '400 661 209', '10/06/2026', '10/07/2026', 12980, 'pago'],
];

export const INVOICES: Invoice[] = invRaw.map(([number, client, nuit, date, due, total, status]) => ({
  number,
  client,
  nuit,
  date,
  due,
  total,
  status,
}));

export const INVOICE_TOTAL = invRaw.reduce((a, r) => a + r[5], 0);
export const INVOICE_COUNT = invRaw.length;

export const INVOICE_STATS = (
  [
    ['Total facturado', INVOICE_TOTAL, 'var(--text)', '8 documentos · Junho'],
    ['Recebido', 45180, 'var(--ok)', '3 facturas pagas'],
    ['Pendente', 111300, 'var(--warn)', '2 por receber'],
    ['Vencido', 186300, 'var(--bad)', '1 em atraso'],
  ] as const
).map(([label, value, color, sub]) => ({ label, value: fmt(value), color, sub }));

export const INVOICE_FILTERS = ['Todas', 'Pendentes', 'Pagas', 'Vencidas'];

/** Linhas de exemplo da Nova Factura (estado editável no design). */
export interface InvoiceLine {
  id: string;
  name: string;
  sku: string;
  price: number;
  qty: number;
  disc: number;
}

export const INVOICE_NEW_LINES: InvoiceLine[] = [
  { id: 'ANTS-RICE-5', name: 'Arroz Tio 5kg', sku: 'ANTS-RICE-5', price: 580, qty: 20, disc: 5 },
  { id: 'ANTS-OIL-1', name: 'Óleo Fula 1L', sku: 'ANTS-OIL-1', price: 165, qty: 30, disc: 0 },
  { id: 'ANTS-SUG-2', name: 'Açúcar Xinavane 2kg', sku: 'ANTS-SUG-2', price: 190, qty: 15, disc: 10 },
];

export const INVOICE_NEW_CATALOG: Array<[string, string, number]> = [
  ['ANTS-WAT-5', 'Água Vumba 5L', 95],
  ['ANTS-CEM-50', 'Cimento Dangote 50kg', 720],
  ['ANTS-SOAP-1', 'Sabão Azul 400g', 60],
  ['ANTS-PAR-500', 'Paracetamol 500mg', 45],
  ['ANTS-COL-2', 'Coca-Cola 2L', 140],
];
