// Contabilidade & Contratos — portado de design/ANTS-ERP-FONTE-COMPLETA.js. Placeholder de UI.
// TODO: ligar a Contabilidade (Fase 6) / Contratos (Fase 9).
import { fmt, fmtNoSymbol } from '@/lib/format';
import type { KpiCardData } from '@/components/ui/KpiCard';

// ---------- Contabilidade ----------
export const ACC_KPIS: KpiCardData[] = (
  [
    ['Resultado do exercício', 312150, 'green', 'trending-up', 'margem 25%'],
    ['IVA a entregar', 84200, 'amber', 'percent', 'Junho 2026'],
    ['Total débitos (período)', 85050, 'petroleum', 'arrow-down-left', '4 lançamentos'],
    ['Total créditos (período)', 85050, 'petroleum', 'arrow-up-right', '4 lançamentos'],
  ] as const
).map(([label, v, tone, icon, sub]) => ({ label, valueStr: fmt(v), tone, icon, sub }));

interface JournalLineRaw {
  acc: string;
  name: string;
  d: string;
  deb: number;
  cred: number;
}

const journalRaw: Array<{ doc: string; date: string; desc: string; user: string; lines: Array<[string, string, string, number, number]> }> = [
  { doc: 'LANC 2026/0610', date: '08/06/2026', desc: 'Transferência de caixa para banco', user: 'Maria Tembe', lines: [['11.1', 'Caixa Principal', 'Saída de numerário', 0, 20000], ['12.1', 'Banco BCI', 'Depósito bancário', 20000, 0]] },
  { doc: 'LANC 2026/0611', date: '09/06/2026', desc: 'Pagamento a fornecedor — Dangote', user: 'Ana Cossa', lines: [['22.1', 'Fornecedores c/c', 'Liquidação OC 2026/0148', 30000, 0], ['12.2', 'Banco BIM', 'Transferência bancária', 0, 30000]] },
  { doc: 'LANC 2026/0612', date: '10/06/2026', desc: 'Venda a dinheiro com IVA', user: 'Carlos Sitoe', lines: [['11.1', 'Caixa Principal', 'Recebimento da venda', 11600, 0], ['71.1', 'Vendas de mercadorias', 'Venda de mercadoria', 0, 10000], ['34.3', 'IVA Liquidado', 'IVA à taxa de 16%', 0, 1600]] },
  { doc: 'LANC 2026/0613', date: '12/06/2026', desc: 'Recebimento de cliente — Farmácia Sigma', user: 'João Macuácua', lines: [['12.1', 'Banco BCI', 'Recebimento FT 2026/0336', 23450, 0], ['21.1', 'Clientes c/c', 'Liquidação de factura', 0, 23450]] },
];

export const JOURNAL = journalRaw.map((j) => ({
  ...j,
  lines: j.lines.map(([acc, name, d, deb, cred]): JournalLineRaw & { debStr: string; credStr: string; debCol: string; credCol: string } => ({
    acc,
    name,
    d,
    deb,
    cred,
    debStr: deb ? fmtNoSymbol(deb) : '—',
    credStr: cred ? fmtNoSymbol(cred) : '—',
    debCol: deb ? 'var(--text)' : 'var(--text4)',
    credCol: cred ? 'var(--text)' : 'var(--text4)',
  })),
}));

export const ACC_DEB_TOTAL = fmt(85050);
export const ACC_CRED_TOTAL = fmt(85050);

// ---------- Contratos ----------
const ctStatus: Record<string, [string, string, string]> = {
  activo: ['Activo', 'var(--ok)', 'var(--ok-bg)'],
  renovar: ['A renovar', 'var(--warn)', 'var(--warn-bg)'],
  suspenso: ['Suspenso', 'var(--info)', 'var(--info-bg)'],
  expirado: ['Expirado', 'var(--bad)', 'var(--bad-bg)'],
  cancelado: ['Cancelado', 'var(--text3)', 'var(--bd-soft)'],
};

const ctRaw: Array<[string, string, string, string, string, number, string]> = [
  ['CT 2026/0024', 'Farmácia Sigma', 'Manutenção de software', '01/01/2026', '31/12/2026', 4500, 'activo'],
  ['CT 2026/0023', 'Hotel Polana Lodge', 'Licença ERP Premium', '15/06/2025', '14/06/2026', 12000, 'renovar'],
  ['CT 2026/0022', 'Restaurante Costa do Sol', 'Suporte técnico', '01/03/2026', '28/02/2027', 3200, 'activo'],
  ['CT 2026/0021', 'Construções Zambeze, SA', 'Consultoria mensal', '01/04/2026', '31/03/2027', 18000, 'activo'],
  ['CT 2026/0020', 'Mercearia Bom Preço', 'Licença POS', '10/06/2025', '09/06/2026', 1800, 'expirado'],
  ['CT 2026/0019', 'Auto Peças Matola', 'Hospedagem cloud', '01/02/2026', '31/01/2027', 2400, 'suspenso'],
];

export const CONTRACTS = ctRaw.map(([number, client, service, start, end, val, st]) => ({
  number,
  client,
  service,
  start,
  end,
  valStr: fmt(val),
  statusLabel: ctStatus[st]![0],
  statusColor: ctStatus[st]![1],
  statusBg: ctStatus[st]![2],
}));

export const CONTRACT_KPIS: KpiCardData[] = (
  [
    ['Contratos activos', '14', 'petroleum', 'file-signature', '4 serviços'],
    ['Receita recorrente', fmt(37700), 'green', 'repeat', 'MRR · mensal'],
    ['Renovações no mês', '3', 'blue', 'calendar-check', '+2 automáticas'],
    ['A vencer (30 dias)', '2', 'amber', 'calendar-clock', 'requer atenção'],
  ] as const
).map(([label, valueStr, tone, icon, sub]) => ({ label, valueStr, tone, icon, sub }));

export const RENEWALS = (
  [
    ['Hotel Polana Lodge', 'Vence em 4 dias', 'var(--warn)', 12000, true],
    ['Mercearia Bom Preço', 'Expirado há 14 dias', 'var(--bad)', 1800, true],
    ['Auto Peças Matola', 'Suspenso · pagamento', 'var(--info)', 2400, false],
  ] as const
).map(([name, note, noteColor, val, canRenew]) => ({ name, note, noteColor, valStr: fmt(val), canRenew }));

export const CT_HISTORY = (
  [
    ['repeat', 'var(--ok)', 'var(--ok-bg)', 'Renovou o contrato CT 2026/0022 por +12 meses', 'Ana Cossa · 22/06 14:10'],
    ['pause', 'var(--warn)', 'var(--warn-bg)', 'Suspendeu CT 2026/0019 por falta de pagamento', 'Hélder M. · 18/06 09:32'],
    ['banknote', 'var(--info)', 'var(--info-bg)', 'Pagamento recorrente cobrado — CT 2026/0021', 'Sistema · 12/06 00:05'],
    ['file-plus', 'var(--accent-fg)', 'var(--accent-bg)', 'Criou o contrato CT 2026/0024 — Farmácia Sigma', 'Maria Tembe · 05/06 11:48'],
  ] as const
).map(([icon, color, bg, text, meta]) => ({ icon, color, bg, text, meta }));

export const CONTRACT_COUNT = ctRaw.length;
