// Relatórios — portado de design/ANTS-ERP-FONTE-COMPLETA.js. Placeholder de UI.
// TODO: ligar a Relatórios (Fase 11).
import { fmt } from '@/lib/format';

export const REPORT_STATS = (
  [
    ['Total de vendas', fmt(1248600), 'var(--text)'],
    ['Transacções', '1 842', 'var(--text)'],
    ['Ticket médio', fmt(678), 'var(--text)'],
    ['Margem bruta', '25,4%', 'var(--ok)'],
  ] as const
).map(([label, value, color]) => ({ label, value, color }));

export const SALES_BY_BRANCH = (
  [
    ['Maputo · Sede', '1 020', 712400, '26%'],
    ['Matola', '540', 358900, '24%'],
    ['Beira', '282', 177300, '22%'],
  ] as const
).map(([branch, count, total, margin]) => ({ branch, count, totalStr: fmt(total), margin }));

export const REPORT_GROUPS = (
  [
    {
      label: 'Vendas & Clientes',
      items: [
        ['trending-up', 'Relatório de vendas', 'Por período, produto, vendedor ou filial'],
        ['percent', 'Margens de lucro', 'Margem bruta por produto e categoria'],
        ['user-round', 'Extracto de clientes', 'Movimentos e saldos por cliente'],
        ['layers', 'Antiguidade de saldos', 'Mapa de dívidas a receber por idade'],
      ],
    },
    {
      label: 'Compras & Stock',
      items: [
        ['truck', 'Relatório de compras', 'Ordens, recepções e facturas de fornecedor'],
        ['building', 'Extracto de fornecedores', 'Movimentos e saldos por fornecedor'],
        ['package', 'Movimentos de stock', 'Entradas, saídas, transferências e ajustes'],
        ['boxes', 'Valorização de stock', 'Valor do inventário por armazém'],
      ],
    },
    {
      label: 'Finanças',
      items: [
        ['wallet', 'Fluxo de caixa', 'Entradas e saídas por período'],
        ['landmark', 'Relatório bancário', 'Movimentos e reconciliação por conta'],
        ['file-clock', 'Relatório de dívidas', 'Contas a receber e a pagar'],
        ['book-open', 'Demonstração de resultados', 'Receitas, custos e resultado líquido'],
      ],
    },
    {
      label: 'Gestão & RH',
      items: [
        ['banknote', 'Relatório de salários', 'Folha de pagamento e encargos sociais'],
        ['factory', 'Relatório de produção', 'Ordens, consumos e custos de produção'],
        ['list', 'Todas as operações', 'Registo completo de actividades do sistema'],
        ['sliders-horizontal', 'Relatório personalizado', 'Construa o seu relatório à medida'],
      ],
    },
  ] as const
).map((g) => ({ label: g.label, items: g.items.map(([icon, name, desc]) => ({ icon, name, desc })) }));
