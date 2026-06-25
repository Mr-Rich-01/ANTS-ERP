// Dados do Dashboard — portados de design/ANTS-ERP-FONTE-COMPLETA.js (renderVals).
// Placeholders de UI. TODO: ligar à API (derivar de dados reais) na Fase 11.
import { fmt } from '@/lib/format';
import { ACCENT } from '@/lib/erp-nav';

const T: Record<string, [string, string]> = {
  petroleum: ['var(--accent-fg)', 'var(--accent-bg)'],
  green: ['var(--ok)', 'var(--ok-bg)'],
  red: ['var(--bad)', 'var(--bad-bg)'],
  amber: ['var(--warn)', 'var(--warn-bg)'],
  blue: ['var(--info)', 'var(--info-bg)'],
  gray: ['var(--text2)', 'var(--bd-soft)'],
};

const tmap: Record<string, [string, string, string]> = {
  up: ['var(--ok)', 'var(--ok-bg)', 'arrow-up-right'],
  down: ['var(--bad)', 'var(--bad-bg)', 'arrow-down-right'],
  warn: ['var(--warn)', 'var(--warn-bg)', 'clock'],
  flat: ['var(--text2)', 'var(--bd-soft)', 'minus'],
};

export interface Kpi {
  label: string;
  valueStr: string;
  sub: string;
  trend: string;
  trendColor: string;
  trendBg: string;
  trendIcon: string;
  iconColor: string;
  iconBg: string;
  icon: string;
}

const kdef: Array<[string, number, string, string, string, string, string]> = [
  ['Vendas de hoje', 84300, 'vs ontem', '+12,4%', 'up', 'green', 'trending-up'],
  ['Vendas do mês', 1248600, 'meta 78%', '+8,1%', 'up', 'petroleum', 'calendar-days'],
  ['Lucro estimado', 312150, 'margem 25%', '+4,6%', 'up', 'green', 'percent'],
  ['Caixa disponível', 146250, '3 caixas abertas', 'estável', 'flat', 'petroleum', 'wallet'],
  ['Saldo bancário', 502300, '4 contas', '+2,1%', 'up', 'blue', 'landmark'],
  ['Contas a receber', 728400, '23 facturas', 'a receber', 'warn', 'amber', 'arrow-down-left'],
  ['Contas a pagar', 415900, '14 facturas', 'a pagar', 'down', 'red', 'arrow-up-right'],
  ['Facturas vencidas', 187200, '9 em atraso', '−2 vs sem.', 'down', 'red', 'alert-triangle'],
];

export const kpis: Kpi[] = kdef.map(([label, v, sub, trend, dir, key, icon]) => ({
  label,
  valueStr: fmt(v),
  sub,
  trend,
  trendColor: tmap[dir]![0],
  trendBg: tmap[dir]![1],
  trendIcon: tmap[dir]![2],
  iconColor: T[key]![0],
  iconBg: T[key]![1],
  icon,
}));

const months = ['Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
const heights = [52, 60, 48, 70, 82, 75, 88, 80, 92, 85, 96, 100];
export const barData = months.map((m, i) => ({ m, h: heights[i]! }));
export const barFill = `linear-gradient(180deg,#2a5560,${ACCENT})`;

const pay: Array<[string, number, string]> = [
  ['Dinheiro', 38, 'var(--accent-fg)'],
  ['M-Pesa', 27, 'var(--ok)'],
  ['e-Mola', 14, 'var(--warn)'],
  ['Transferência', 12, 'var(--info)'],
  ['Cartão', 9, 'var(--text3)'],
];
let acc = 0;
const segs = pay.map(([, p, c]) => {
  const a = acc;
  acc += p;
  return `${c} ${(a * 3.6).toFixed(1)}deg ${(acc * 3.6).toFixed(1)}deg`;
});
export const donutStyle = `conic-gradient(${segs.join(',')})`;
export const payLegend = pay.map(([label, p, color]) => ({ label, pct: `${p}%`, color }));

const rev = [120, 135, 128, 150, 162, 158, 175, 168, 182, 190, 205, 212];
const exp = [95, 102, 99, 110, 118, 112, 121, 119, 128, 132, 140, 143];
const X = (i: number) => (i * (660 / 11)).toFixed(1);
const Y = (v: number) => (220 - (v / 230) * 200).toFixed(1);
export const revPts = rev.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
export const expPts = exp.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
export const areaRev = `0,220 ${revPts} 660,220`;

export const topProducts = [
  { name: 'Arroz Tio 5kg', qty: '1 240', w: 92 },
  { name: 'Óleo Fula 1L', qty: '980', w: 73 },
  { name: 'Açúcar Xinavane 2kg', qty: '760', w: 57 },
  { name: 'Água Vumba 5L', qty: '610', w: 45 },
  { name: 'Coca-Cola 2L', qty: '430', w: 32 },
];

export const alerts = (
  [
    ['alert-triangle', 'var(--warn)', 'var(--warn-bg)', 'Stock baixo', '14 produtos abaixo do mínimo'],
    ['calendar-clock', 'var(--warn)', 'var(--warn-bg)', 'Produtos a expirar', '6 lotes vencem nos próximos 30 dias'],
    ['file-clock', 'var(--bad)', 'var(--bad-bg)', 'Facturas vencidas', '9 facturas · 187 200,00 MT em atraso'],
    ['file-signature', 'var(--warn)', 'var(--warn-bg)', 'Contratos a renovar', '3 contratos vencem esta semana'],
    ['banknote', 'var(--info)', 'var(--info-bg)', 'Salários por processar', 'Processamento de Junho pendente'],
    ['lock-open', 'var(--warn)', 'var(--warn-bg)', 'Caixas abertas', '2 caixas ainda não foram fechadas'],
  ] as const
).map(([icon, color, bg, title, desc]) => ({ icon, color, bg, title, desc }));

export const activities = (
  [
    ['shopping-cart', 'var(--ok)', 'var(--ok-bg)', 'Maria Tembe registou a venda #VND-2041', '12 500,00 MT', 'há 5 min'],
    ['smartphone', 'var(--info)', 'var(--info-bg)', 'João Macuácua recebeu pagamento M-Pesa', '3 200,00 MT', 'há 22 min'],
    ['package-plus', 'var(--accent-fg)', 'var(--accent-bg)', 'Entrada de stock · 200 un. Arroz Tio 5kg', 'Armazém Central', 'há 1 h'],
    ['receipt-text', 'var(--accent-fg)', 'var(--accent-bg)', 'Ana Cossa criou a factura #FT-0337', '48 900,00 MT', 'há 2 h'],
    ['lock', 'var(--warn)', 'var(--warn-bg)', 'Fecho de caixa · Caixa 02', 'sem diferenças', 'há 3 h'],
  ] as const
).map(([icon, color, bg, title, meta, time]) => ({ icon, color, bg, title, meta, time }));
