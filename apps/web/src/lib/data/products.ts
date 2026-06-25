// Catálogo de produtos — portado de design/ANTS-ERP-FONTE-COMPLETA.js (raw).
// Placeholder de UI. TODO: ligar ao módulo de Stock (Fase 3).
import { fmt } from '@/lib/format';
import type { KpiCardData } from '@/components/ui/KpiCard';

export type StockStatus = 'ok' | 'low' | 'out';

export interface RawProduct {
  sku: string;
  name: string;
  cat: string;
  brand: string;
  price: number;
  stock: number;
  min: number;
  status: StockStatus;
}

const rows: Array<[string, string, string, string, number, number, number, StockStatus]> = [
  ['ANTS-RICE-5', 'Arroz Tio 5kg', 'Mercearia', 'Tio', 580, 420, 80, 'ok'],
  ['ANTS-OIL-1', 'Óleo Fula 1L', 'Mercearia', 'Fula', 165, 38, 60, 'low'],
  ['ANTS-SUG-2', 'Açúcar Xinavane 2kg', 'Mercearia', 'Xinavane', 190, 260, 50, 'ok'],
  ['ANTS-WAT-5', 'Água Vumba 5L', 'Bebidas', 'Vumba', 95, 0, 40, 'out'],
  ['ANTS-COL-2', 'Coca-Cola 2L', 'Bebidas', 'Coca-Cola', 140, 312, 60, 'ok'],
  ['ANTS-CEM-50', 'Cimento Dangote 50kg', 'Construção', 'Dangote', 720, 84, 30, 'ok'],
  ['ANTS-PAR-500', 'Paracetamol 500mg', 'Farmácia', 'Genérico', 45, 22, 40, 'low'],
  ['ANTS-SOAP-1', 'Sabão Azul 400g', 'Higiene', 'Lux', 60, 540, 100, 'ok'],
  ['ANTS-RICE-25', 'Arroz Tio 25kg', 'Mercearia', 'Tio', 2650, 12, 15, 'low'],
];

export const RAW_PRODUCTS: RawProduct[] = rows.map(([sku, name, cat, brand, price, stock, min, status]) => ({
  sku,
  name,
  cat,
  brand,
  price,
  stock,
  min,
  status,
}));

export const CATEGORIES = ['Todos', 'Mercearia', 'Bebidas', 'Construção', 'Farmácia', 'Higiene'];

/** Iniciais para a "imagem" do produto no POS (replica o cálculo do design). */
export function productInitials(name: string): string {
  return name
    .replace(/[^A-Za-zÀ-ú0-9 ]/g, '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

export const STOCK_STATUS: Record<StockStatus, { label: string; color: string; bg: string }> = {
  ok: { label: 'Em stock', color: 'var(--ok)', bg: 'var(--ok-bg)' },
  low: { label: 'Stock baixo', color: 'var(--warn)', bg: 'var(--warn-bg)' },
  out: { label: 'Esgotado', color: 'var(--bad)', bg: 'var(--bad-bg)' },
};

// ---------- Lista Produtos & Stock ----------
export const PRODUCT_ROWS = RAW_PRODUCTS.map((p) => ({
  sku: p.sku,
  name: p.name,
  cat: p.cat,
  brand: p.brand,
  priceStr: fmt(p.price),
  stock: p.stock,
  min: p.min,
  stockColor: p.status === 'out' ? 'var(--bad)' : p.status === 'low' ? 'var(--warn)' : 'var(--text)',
  statusLabel: STOCK_STATUS[p.status].label,
  statusColor: STOCK_STATUS[p.status].color,
  statusBg: STOCK_STATUS[p.status].bg,
}));
export const PRODUCT_COUNT = RAW_PRODUCTS.length;
export const STOCK_VALUE_STR = fmt(RAW_PRODUCTS.reduce((a, p) => a + p.price * p.stock, 0));

// ---------- Ficha de produto (default: Arroz Tio 5kg) ----------
const ps = { sku: 'ANTS-RICE-5', name: 'Arroz Tio 5kg', cat: 'Mercearia', brand: 'Tio', price: 580, stock: 418, min: 80, status: 'ok' as StockStatus };
const pdCost = Math.round(ps.price * 0.72);
const pdMargin = Math.round(((ps.price - pdCost) / ps.price) * 100);

export const PRODUCT_DETAIL = {
  name: ps.name,
  sku: ps.sku,
  cat: ps.cat,
  brand: ps.brand,
  statusLabel: STOCK_STATUS[ps.status].label,
  statusColor: STOCK_STATUS[ps.status].color,
  statusBg: STOCK_STATUS[ps.status].bg,
  kpis: (
    [
      ['Stock actual', `${ps.stock} un.`, 'petroleum', 'package', `mín. ${ps.min} un.`],
      ['Preço de venda', fmt(ps.price), 'green', 'tag', 'com IVA incl.'],
      ['Custo médio', fmt(pdCost), 'blue', 'shopping-cart', 'última compra'],
      ['Margem', `${pdMargin}%`, 'amber', 'trending-up', 'por unidade'],
    ] as const
  ).map(([label, valueStr, tone, icon, sub]) => ({ label, valueStr, tone, icon, sub })) as KpiCardData[],
  moves: (
    [
      ['24/06/2026', 'Venda', 'FT 2026/0337', 'out', 12, ps.stock],
      ['23/06/2026', 'Recepção', 'GR 2026/0091', 'in', 200, ps.stock + 12],
      ['21/06/2026', 'Venda', 'FT 2026/0331', 'out', 40, ps.stock - 188],
      ['19/06/2026', 'Inventário', 'INV 2026/06', 'adj', -3, ps.stock - 148],
      ['17/06/2026', 'Venda', 'FT 2026/0318', 'out', 25, ps.stock - 145],
    ] as const
  ).map(([date, type, doc, dir, qty, bal]) => ({
    date,
    type,
    doc,
    qtyStr: `${dir === 'in' ? '+ ' : dir === 'adj' ? (qty < 0 ? '− ' : '+ ') : '− '}${Math.abs(qty)}`,
    qtyColor: dir === 'in' ? 'var(--ok)' : dir === 'adj' ? 'var(--warn)' : 'var(--bad)',
    balanceStr: String(bal),
    typeColor: dir === 'in' ? 'var(--ok)' : dir === 'adj' ? 'var(--warn)' : 'var(--info)',
    typeBg: dir === 'in' ? 'var(--ok-bg)' : dir === 'adj' ? 'var(--warn-bg)' : 'var(--info-bg)',
  })),
};

// ---------- Inventário (contagem física) ----------
const invntRaw: Array<[string, string, string, number, number, number]> = [
  ['ANTS-RICE-5', 'Arroz Tio 5kg', 'Mercearia', 420, 418, 580],
  ['ANTS-OIL-1', 'Óleo Fula 1L', 'Mercearia', 38, 40, 165],
  ['ANTS-SUG-2', 'Açúcar Xinavane 2kg', 'Mercearia', 260, 255, 190],
  ['ANTS-COL-2', 'Coca-Cola 2L', 'Bebidas', 312, 312, 140],
  ['ANTS-CEM-50', 'Cimento Dangote 50kg', 'Construção', 84, 80, 720],
  ['ANTS-SOAP-1', 'Sabão Azul 400g', 'Higiene', 540, 548, 60],
];

export const INVENTORY_ITEMS = invntRaw.map(([sku, name, cat, sys, counted, cost]) => {
  const diff = counted - sys;
  return {
    sku,
    name,
    cat,
    sys,
    counted,
    diffStr: `${diff > 0 ? '+' : ''}${diff}`,
    diffColor: diff === 0 ? 'var(--text3)' : diff > 0 ? 'var(--ok)' : 'var(--bad)',
    valDiffStr: `${diff > 0 ? '+ ' : diff < 0 ? '− ' : ''}${fmt(Math.abs(diff * cost))}`,
    valDiffColor: diff === 0 ? 'var(--text3)' : diff > 0 ? 'var(--ok)' : 'var(--bad)',
    statusLabel: diff === 0 ? 'Conforme' : 'Divergência',
    statusColor: diff === 0 ? 'var(--ok)' : 'var(--warn)',
    statusBg: diff === 0 ? 'var(--ok-bg)' : 'var(--warn-bg)',
  };
});

const invDiffValue = invntRaw.reduce((a, r) => a + (r[4] - r[3]) * r[5], 0);
const invMatch = invntRaw.filter((r) => r[4] === r[3]).length;
export const INVENTORY_DIFF_STR = `${invDiffValue >= 0 ? '+ ' : '− '}${fmt(Math.abs(invDiffValue))}`;
export const INVENTORY_DIFF_COLOR = invDiffValue >= 0 ? 'var(--ok)' : 'var(--bad)';
export const INVENTORY_KPIS = (
  [
    ['Itens contados', `${invntRaw.length} / ${invntRaw.length}`, 'petroleum', 'clipboard-check', '100% concluído'],
    ['Conformes', String(invMatch), 'green', 'check-circle-2', 'sem divergência'],
    ['Divergências', String(invntRaw.length - invMatch), 'amber', 'alert-triangle', 'requer ajuste'],
    ['Impacto no valor', INVENTORY_DIFF_STR, 'red', 'scale', invDiffValue >= 0 ? 'ganho de stock' : 'perda de stock'],
  ] as const
).map(([label, valueStr, tone, icon, sub]) => ({ label, valueStr, tone, icon, sub })) as KpiCardData[];
