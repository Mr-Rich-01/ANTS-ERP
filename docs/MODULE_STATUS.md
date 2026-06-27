# MODULE_STATUS — ANTS ERP

_Última actualização: 2026-06-24_

Estados: Não iniciado · Em desenvolvimento · Parcial · Em testes · Concluído · Bloqueado

| Módulo | Funcionalidades previstas | Estado | % | Testes | Pendências | Dependências | Actualizado |
|--------|---------------------------|--------|---|--------|------------|--------------|-------------|
| Fundação (Fase 0) | Monorepo, Docker, Prisma base, Web (monólito Next) + Worker + Domain, docs | Concluído | 100 | typecheck 6/6, lint 6/6, build 2/2, test 8 ✓ | Migração inicial corre na Fase 1 (precisa Postgres a correr) | — | 2026-06-26 |
| Porte do design (UI) | Shell + **22/22 ecrãs** portados fielmente (todos os do design) | Concluído | 100 | build 25 págs ✓, typecheck/lint ✓, screenshots (dashboard, POS, facturas, RH, admin…) + HTTP de todos ✓ | Ligar cada ecrã a API real nas fases de negócio (dados são placeholders de UI) | Fundação | 2026-06-26 |
| Autenticação | Login, refresh, sessões, recuperação, troca de password | Não iniciado | 0 | — | — | Fundação | 2026-06-24 |
| Multiempresa / RBAC | Empresas, filiais, perfis, permissões, isolamento, auditoria | Não iniciado | 0 | — | — | Autenticação | 2026-06-24 |
| Plataforma (Super Admin) | Cadastro empresas, planos, impersonação auditada | Não iniciado | 0 | — | — | Multiempresa | 2026-06-24 |
| Configurações da empresa | Dados legais, fiscais, séries, branding | Não iniciado | 0 | — | — | Multiempresa | 2026-06-24 |
| Clientes / CRM | Cadastro, visão 360, extracto | Não iniciado | 0 | — | — | Config | 2026-06-24 |
| Fornecedores | Cadastro, extracto | Não iniciado | 0 | — | — | Config | 2026-06-24 |
| Produtos / Stock | Produtos, movimentos, armazéns, inventário | Não iniciado | 0 | — | — | Config | 2026-06-24 |
| Compras | Requisição→OC→recepção→factura | Não iniciado | 0 | — | — | Stock | 2026-06-24 |
| Contas a pagar | Títulos, pagamentos, mapas | Não iniciado | 0 | — | — | Compras | 2026-06-24 |
| Vendas / POS | Cotações, facturas, recibos, NC/ND, POS | Não iniciado | 0 | — | — | Stock, Clientes | 2026-06-24 |
| Contas a receber | Títulos, recebimentos, antiguidade de saldos | Não iniciado | 0 | — | — | Vendas | 2026-06-24 |
| Caixa | Abertura/fecho, sessões, relatório diário | Não iniciado | 0 | — | — | Vendas | 2026-06-24 |
| Tesouraria / Bancos | Contas, movimentos, fluxo de caixa, conciliação | Não iniciado | 0 | — | — | Caixa | 2026-06-24 |
| Contabilidade | Plano de contas, lançamentos, relatórios | Não iniciado | 0 | — | — | Vendas, Compras | 2026-06-24 |
| Recursos Humanos | Trabalhadores, contratos, férias, presenças | Não iniciado | 0 | — | — | Multiempresa | 2026-06-24 |
| Salários | Componentes, processamento, recibos, contabilização | Não iniciado | 0 | — | — | RH, Contabilidade | 2026-06-24 |
| Contratos / Subscrições | Contratos, renovações, facturação recorrente | Não iniciado | 0 | — | — | Vendas | 2026-06-24 |
| Produção | BOM, ordens, consumos, custos | Não iniciado | 0 | — | — | Stock | 2026-06-24 |
| Relatórios / Dashboards | Dashboards reais, exportações, agendamentos | Não iniciado | 0 | — | — | Vários | 2026-06-24 |
| Notificações / Workflows | Notificações internas, aprovações multinível | Não iniciado | 0 | — | — | Multiempresa | 2026-06-24 |
| PWA / Offline / Deploy | PWA, POS offline, deploy VPS+Cloudflare | Não iniciado | 0 | — | — | Todos | 2026-06-24 |
