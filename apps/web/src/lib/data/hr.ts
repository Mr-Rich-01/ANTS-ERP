// Recursos Humanos — portado de design/ANTS-ERP-FONTE-COMPLETA.js. Placeholder de UI.
// TODO: ligar a RH/Salários (Fases 7-8).
import { fmt } from '@/lib/format';
import type { KpiCardData } from '@/components/ui/KpiCard';

const hrStatus: Record<string, [string, string, string]> = {
  activo: ['Activo', 'var(--ok)', 'var(--ok-bg)'],
  ferias: ['Férias', 'var(--info)', 'var(--info-bg)'],
  suspenso: ['Suspenso', 'var(--warn)', 'var(--warn-bg)'],
};

const hrRaw: Array<[string, string, string, string, string, number, string]> = [
  ['Hélder Munguambe', 'HM', 'Director Geral', 'Direcção', 'Efectivo', 95000, 'activo'],
  ['Maria Tembe', 'MT', 'Operadora de Caixa', 'Vendas', 'Efectivo', 22000, 'activo'],
  ['João Macuácua', 'JM', 'Vendedor', 'Vendas', 'Efectivo', 18500, 'activo'],
  ['Ana Cossa', 'AC', 'Contabilista', 'Financeira', 'Efectivo', 38000, 'ferias'],
  ['Carlos Sitoe', 'CS', 'Vendedor', 'Vendas', 'Termo certo', 16000, 'activo'],
  ['Lúcia Mondlane', 'LM', 'Resp. de Stock', 'Armazém', 'Efectivo', 27000, 'activo'],
  ['Paulo Nhaca', 'PN', 'Motorista', 'Logística', 'Termo certo', 14500, 'suspenso'],
  ['Fátima Bila', 'FB', 'RH & Administração', 'Administração', 'Efectivo', 32000, 'activo'],
];

export const EMPLOYEES = hrRaw.map(([name, ini, role, dept, contract, sal, st]) => ({
  name,
  ini,
  role,
  dept,
  contract,
  salStr: fmt(sal),
  statusLabel: hrStatus[st]![0],
  statusColor: hrStatus[st]![1],
  statusBg: hrStatus[st]![2],
}));

export const HR_KPIS: KpiCardData[] = (
  [
    ['Colaboradores', '42', 'petroleum', 'users', '7 departamentos'],
    ['Massa salarial', fmt(1285400), 'blue', 'banknote', 'bruto mensal'],
    ['Presenças hoje', '38 / 42', 'green', 'user-check', '90% presença'],
    ['Em férias', '3', 'amber', 'palmtree', 'este mês'],
  ] as const
).map(([label, valueStr, tone, icon, sub]) => ({ label, valueStr, tone, icon, sub }));

export const PAYROLL = {
  brutoStr: fmt(1285400),
  subsStr: `+ ${fmt(142000)}`,
  inssStr: `− ${fmt(38562)}`,
  irpsStr: `− ${fmt(168200)}`,
  liquidoStr: fmt(1220638),
};
