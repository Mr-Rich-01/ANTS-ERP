// Compras — portado de design/ANTS-ERP-FONTE-COMPLETA.js. Placeholder de UI.
// TODO: ligar ao módulo de Compras (Fase 3).
import { fmt } from '@/lib/format';

// ---------- Ordem de compra (detalhe) ----------
const poLinesRaw: Array<[string, string, number, number]> = [
  ['Cimento Dangote 50kg', 'saco', 200, 720],
  ['Cimento Dangote 25kg', 'saco', 120, 390],
  ['Reboco fino 40kg', 'saco', 60, 560],
  ['Cal hidratada 20kg', 'saco', 40, 310],
];

export const PO_LINES = poLinesRaw.map(([name, unit, qty, price]) => ({
  name,
  unit,
  qty,
  priceStr: fmt(price),
  totalStr: fmt(qty * price),
}));

const poSub = poLinesRaw.reduce((a, r) => a + r[2] * r[3], 0);
export const PO_SUB_STR = fmt(poSub);
export const PO_TAX_STR = fmt(poSub * 0.16);
export const PO_GRAND_STR = fmt(poSub * 1.16);

export const PO_APPROVALS = (
  [
    ['check', 'var(--ok)', 'var(--ok-bg)', 'Criada por Ana Cossa', 'Compras · 12/06/2026 09:14'],
    ['check', 'var(--ok)', 'var(--ok-bg)', 'Aprovada por Hélder Munguambe', 'Administração · 12/06/2026 11:40'],
    ['truck', 'var(--info)', 'var(--info-bg)', 'Enviada ao fornecedor', '12/06/2026 14:02'],
    ['package-check', 'var(--warn)', 'var(--warn-bg)', 'Recepção parcial em curso', '24/06/2026'],
  ] as const
).map(([icon, color, bg, text, meta]) => ({ icon, color, bg, text, meta }));

// ---------- Recepção de mercadorias ----------
const recLineStatus: Record<string, [string, string, string]> = {
  ok: ['Conforme', 'var(--ok)', 'var(--ok-bg)'],
  partial: ['Parcial', 'var(--warn)', 'var(--warn-bg)'],
  pending: ['Por receber', 'var(--text3)', 'var(--bd-soft)'],
};

const recRaw: Array<[string, string, string, number, number, string, string, string]> = [
  ['ANTS-CEM-50', 'Cimento Dangote 50kg', 'saco', 200, 200, 'L-DG2606', '—', 'ok'],
  ['ANTS-CEM-25', 'Cimento Dangote 25kg', 'saco', 120, 80, 'L-DG2607', '—', 'partial'],
  ['ANTS-REB-40', 'Reboco fino 40kg', 'saco', 60, 0, '—', '—', 'pending'],
  ['ANTS-CAL-20', 'Cal hidratada 20kg', 'saco', 40, 40, 'L-CL114', '—', 'ok'],
];

export const REC_LINES = recRaw.map(([sku, name, unit, ordered, received, lot, exp, st]) => ({
  sku,
  name,
  unit,
  ordered,
  received,
  lot,
  exp,
  recCol: received === 0 ? 'var(--text3)' : received < ordered ? 'var(--warn)' : 'var(--text)',
  statusLabel: recLineStatus[st]![0],
  statusColor: recLineStatus[st]![1],
  statusBg: recLineStatus[st]![2],
}));

export const REC_TOTAL_ORDERED = recRaw.reduce((a, r) => a + r[3], 0);
export const REC_TOTAL_RECEIVED = recRaw.reduce((a, r) => a + r[4], 0);
export const REC_PROGRESS = `${Math.round((REC_TOTAL_RECEIVED / REC_TOTAL_ORDERED) * 100)}%`;

// ---------- Compras (lista) ----------
const poStatus: Record<string, [string, string, string]> = {
  rascunho: ['Rascunho', 'var(--text3)', 'var(--bd-soft)'],
  enviada: ['Enviada', 'var(--info)', 'var(--info-bg)'],
  parcial: ['Recepção parcial', 'var(--warn)', 'var(--warn-bg)'],
  recebida: ['Recebida', 'var(--ok)', 'var(--ok-bg)'],
  faturada: ['Facturada', 'var(--accent-fg)', 'var(--accent-bg)'],
};

const poRaw: Array<[string, string, string, string, string, number, string]> = [
  ['OC 2026/0148', 'Dangote Cimento, SA', '400 990 112', '12/06/2026', '20/06/2026', 216000, 'parcial'],
  ['OC 2026/0147', 'Distribuidora Fula', '400 221 884', '11/06/2026', '16/06/2026', 49500, 'recebida'],
  ['OC 2026/0146', 'Águas de Moçambique', '400 556 003', '10/06/2026', '14/06/2026', 28500, 'faturada'],
  ['OC 2026/0145', 'Coca-Cola Sabco', '400 778 221', '08/06/2026', '12/06/2026', 84000, 'recebida'],
  ['OC 2026/0144', 'Xinavane Açúcar, SA', '400 112 667', '06/06/2026', '11/06/2026', 57000, 'enviada'],
  ['OC 2026/0143', 'Lux Higiene, Lda', '400 334 909', '05/06/2026', '—', 12000, 'rascunho'],
];

export const PURCHASE_ORDERS = poRaw.map(([number, supplier, nuit, date, eta, tot, st]) => ({
  number,
  supplier,
  nuit,
  date,
  eta,
  totalStr: fmt(tot),
  canReceive: st === 'enviada' || st === 'parcial',
  statusLabel: poStatus[st]![0],
  statusColor: poStatus[st]![1],
  statusBg: poStatus[st]![2],
}));

export const PURCHASE_TOTAL_STR = fmt(poRaw.reduce((a, r) => a + r[5], 0));
export const PURCHASE_COUNT = poRaw.length;

export const PURCHASE_KPIS = (
  [
    ['Contas a pagar', fmt(415900), 'red', 'arrow-up-right', '14 facturas'],
    ['Ordens pendentes', '5', 'amber', 'clock', 'aguardam recepção'],
    ['Recepções p/ conferir', '3', 'blue', 'package-check', 'esta semana'],
    ['Fornecedores activos', '38', 'petroleum', 'building-2', 'com saldo em aberto'],
  ] as const
).map(([label, valueStr, tone, icon, sub]) => ({ label, valueStr, tone, icon, sub }));
