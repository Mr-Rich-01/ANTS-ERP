// Produção — portado de design/ANTS-ERP-FONTE-COMPLETA.js. Placeholder de UI.
// TODO: ligar a Produção (Fase 10).
import { fmt } from '@/lib/format';
import type { KpiCardData } from '@/components/ui/KpiCard';

const opStatus: Record<string, [string, string, string]> = {
  planeada: ['Planeada', 'var(--info)', 'var(--info-bg)'],
  curso: ['Em curso', 'var(--accent-fg)', 'var(--accent-bg)'],
  pausada: ['Pausada', 'var(--warn)', 'var(--warn-bg)'],
  concluida: ['Concluída', 'var(--ok)', 'var(--ok-bg)'],
  cancelada: ['Cancelada', 'var(--text3)', 'var(--bd-soft)'],
};

const opRaw: Array<[string, string, string, number, number, string, string]> = [
  ['OP 2026/0061', 'Pão de forma 500g', '800 un', 65, 18400, '23/06/2026', 'curso'],
  ['OP 2026/0060', 'Bolo de cenoura', '120 un', 40, 9600, '23/06/2026', 'curso'],
  ['OP 2026/0059', 'Sumo natural 1L', '500 un', 0, 14250, '24/06/2026', 'planeada'],
  ['OP 2026/0058', 'Pão integral 400g', '1 000 un', 100, 22000, '22/06/2026', 'concluida'],
  ['OP 2026/0057', 'Iogurte natural 150g', '600 un', 30, 7800, '22/06/2026', 'pausada'],
  ['OP 2026/0056', 'Bolachas caseiras', '300 un', 100, 5400, '21/06/2026', 'concluida'],
];

export const PROD_ORDERS = opRaw.map(([number, product, qty, prog, cost, date, st]) => ({
  number,
  product,
  qty,
  prog,
  progStr: `${prog}%`,
  costStr: fmt(cost),
  date,
  statusLabel: opStatus[st]![0],
  statusColor: opStatus[st]![1],
  statusBg: opStatus[st]![2],
  barColor: st === 'concluida' ? 'var(--ok)' : st === 'pausada' ? 'var(--warn)' : 'linear-gradient(90deg,#1b4651,#2a8d9c)',
}));

export const PRODUCTION_KPIS: KpiCardData[] = (
  [
    ['Ordens em curso', '2', 'amber', 'loader', '+1 planeada'],
    ['Produzido hoje', '1 320 un', 'green', 'package-check', '3 produtos acabados'],
    ['Custo de produção', fmt(287400), 'petroleum', 'coins', 'mês · acumulado'],
    ['Matérias-primas em falta', '3', 'red', 'alert-triangle', 'repor stock'],
  ] as const
).map(([label, valueStr, tone, icon, sub]) => ({ label, valueStr, tone, icon, sub }));

export const FICHA_TECNICA = (
  [
    ['Farinha de trigo', '120 kg', 4800],
    ['Fermento de padeiro', '4 kg', 1200],
    ['Óleo vegetal', '10 L', 1650],
    ['Açúcar branco', '18 kg', 720],
    ['Sal refinado', '6 kg', 180],
    ['Embalagem 500g', '800 un', 2400],
  ] as const
).map(([name, qty, cost]) => ({ name, qty, costStr: fmt(cost) }));

export const FICHA_TOTAL = fmt(10950);
export const FICHA_UNIT = fmt(10950 / 800);

export const PROD_BREAKDOWN = (
  [
    ['Em curso', '2', 'var(--accent-fg)'],
    ['Planeadas', '1', 'var(--info)'],
    ['Concluídas', '2', 'var(--ok)'],
    ['Pausadas', '1', 'var(--warn)'],
  ] as const
).map(([label, count, color]) => ({ label, count, color }));
