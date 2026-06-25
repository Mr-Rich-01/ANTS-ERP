// Tesouraria & Fecho diário — portado de design/ANTS-ERP-FONTE-COMPLETA.js. Placeholder de UI.
// TODO: ligar a Caixa/Tesouraria (Fase 5).
import { fmt } from '@/lib/format';
import { TONE } from '@/lib/tone';
import type { KpiCardData } from '@/components/ui/KpiCard';

// ---------- Tesouraria ----------
export const CASH_KPIS: KpiCardData[] = (
  [
    ['Caixa disponível', 146250, 'petroleum', 'wallet', '3 caixas abertas', 'var(--text)'],
    ['Total em bancos', 502300, 'blue', 'landmark', '4 contas', 'var(--text)'],
    ['Entradas hoje', 92400, 'green', 'arrow-down-left', '38 movimentos', 'var(--ok)'],
    ['Saídas hoje', 38750, 'red', 'arrow-up-right', '19 movimentos', 'var(--bad)'],
  ] as const
).map(([label, v, tone, icon, sub, valueColor]) => ({ label, valueStr: fmt(v), tone, icon, sub, valueColor }));

export const BANKS = (
  [
    ['Caixa Principal', 'Dinheiro', '— numerário —', 84300, 'wallet', 'petroleum'],
    ['BCI', 'Conta corrente', 'IBAN ···· 1234567', 192400, 'landmark', 'blue'],
    ['Millennium BIM', 'Conta corrente', 'IBAN ···· 7654321', 244950, 'landmark', 'blue'],
    ['M-Pesa', 'Carteira móvel', '84 555 1234', 46200, 'smartphone', 'green'],
    ['e-Mola', 'Carteira móvel', '86 222 9090', 18750, 'smartphone', 'amber'],
  ] as const
).map(([name, type, number, v, icon, key]) => ({
  name,
  type,
  number,
  balanceStr: fmt(v),
  icon,
  color: TONE[key][0],
  bg: TONE[key][1],
}));

export const MOVEMENTS = (
  [
    ['14:32', 'VND-2041', 'Venda a dinheiro', 'Dinheiro', 'in', 12500, 'Maria Tembe'],
    ['13:58', 'REC-088', 'Recebimento — Distribuidora Maputo', 'M-Pesa', 'in', 3200, 'João Macuácua'],
    ['12:10', 'PAG-0145', 'Pagamento a fornecedor — Dangote', 'Transferência', 'out', 21600, 'Ana Cossa'],
    ['11:25', 'VND-2038', 'Venda a dinheiro', 'Dinheiro', 'in', 8450, 'Maria Tembe'],
    ['10:40', 'DESP-0033', 'Despesa — combustível', 'Dinheiro', 'out', 2400, 'Hélder M.'],
    ['09:15', 'VND-2031', 'Venda — e-Mola', 'e-Mola', 'in', 5600, 'Carlos Sitoe'],
  ] as const
).map(([time, doc, desc, method, type, amount, user]) => ({
  time,
  doc,
  desc,
  method,
  user,
  amountStr: `${type === 'in' ? '+ ' : '− '}${fmt(amount)}`,
  amountColor: type === 'in' ? 'var(--ok)' : 'var(--bad)',
}));

export const CASH_CLOSE = {
  abertura: fmt(25000),
  entradas: `+ ${fmt(92400)}`,
  saidas: `− ${fmt(38750)}`,
  esperado: fmt(78650),
  contado: fmt(78650),
  diferenca: fmt(0),
  operator: 'Maria Tembe — Caixa 01',
};

// ---------- Fecho / relatório diário ----------
const dcByMethod: Array<[string, string, string, number, number]> = [
  ['Dinheiro', 'banknote', 'var(--accent-fg)', 38400, 2400],
  ['M-Pesa', 'smartphone', 'var(--ok)', 24600, 0],
  ['e-Mola', 'smartphone', 'var(--warn)', 9800, 0],
  ['Transferência', 'landmark', 'var(--info)', 12600, 21600],
  ['Cartão', 'credit-card', 'var(--text2)', 7000, 0],
];

export const DC_METHODS = dcByMethod.map(([label, icon, color, inv, outv]) => ({
  label,
  icon,
  color,
  inStr: fmt(inv),
  outStr: outv ? `− ${fmt(outv)}` : '—',
  netStr: fmt(inv - outv),
}));

const dcInTotal = dcByMethod.reduce((a, r) => a + r[3], 0);
const dcOutTotal = dcByMethod.reduce((a, r) => a + r[4], 0);
const dcCashNet = dcByMethod[0]![3] - dcByMethod[0]![4];
const dcOpening = 25000;
const dcExpected = dcOpening + dcCashNet;

const denoms: Array<[number, number]> = [
  [1000, 40],
  [500, 30],
  [200, 20],
  [100, 15],
  [50, 8],
  [20, 5],
];
export const DC_DENOMS = denoms.map(([v, q]) => ({
  noteStr: fmt(v).replace(',00 MT', ' MT'),
  qty: q,
  subtotalStr: fmt(v * q),
}));
const dcCounted = denoms.reduce((a, d) => a + d[0] * d[1], 0);

export const DAILY_CLOSE = {
  inTotalStr: fmt(dcInTotal),
  outTotalStr: `− ${fmt(dcOutTotal)}`,
  netTotalStr: fmt(dcInTotal - dcOutTotal),
  countedStr: fmt(dcCounted),
  openingStr: fmt(dcOpening),
  cashInStr: fmt(dcByMethod[0]![3]),
  cashOutStr: `− ${fmt(dcByMethod[0]![4])}`,
  expectedStr: fmt(dcExpected),
  diffStr: fmt(dcCounted - dcExpected),
  diffColor: dcCounted - dcExpected === 0 ? 'var(--ok)' : 'var(--bad)',
};
