# IMPLEMENTATION_PLAN — ANTS ERP

_Última actualização: 2026-06-24_

Desenvolvimento por fases. Cada fase: analisar → DB+migração → backend → frontend
(porte do design) → validação → permissões → auditoria → testes → lint/typecheck/build →
actualizar MODULE_STATUS.md → reportar pendências. Uma fase só fecha quando cumpre a
"Definição de concluído" (ver fim deste documento).

## Fase 0 — Fundação ✅ (em curso/concluída)

- [x] Monorepo (pnpm + Turborepo), tsconfig/eslint/prettier partilhados
- [x] Docker dev (Postgres + Redis), docker-compose.production (esqueleto)
- [x] Prisma — esquema de fundação (multiempresa + auth)
- [x] API NestJS — health + Swagger + PrismaModule
- [x] Worker BullMQ — esqueleto + filas nomeadas
- [x] Web Next.js — tokens do design + shell + navegação
- [x] packages shared/ui/config
- [x] Documentação (9 ficheiros) + `.env.example`
- [ ] Validações: pnpm install + db:generate + lint/typecheck/build (ver MODULE_STATUS)

## Fase 1 — Autenticação e multiempresa

Login, refresh token, sessões, empresas, filiais, utilizadores, perfis, permissões,
auditoria, guard de isolamento multiempresa, área Super Admin (impersonação auditada).

## Fase 2 — Configurações e dados mestres
Config empresa, clientes (visão 360 + extracto), fornecedores, produtos, categorias,
unidades, armazéns, contas bancárias.

## Fase 3 — Stock e compras
Movimentos, transferências, inventário, requisição→OC→recepção, factura fornecedor, CAP.

## Fase 4 — Vendas e POS
Cotações, encomendas, guias, facturas, recibos, NC/ND, devoluções, POS, descontos+aprovação.

## Fase 5 — Caixa e tesouraria
Sessões de caixa, fecho diário, bancos/contas, fluxo de caixa, conciliação.

## Fase 6 — Contabilidade
Plano de contas, diários, lançamentos (partidas dobradas), integração automática, relatórios.

## Fase 7 — Recursos humanos
Trabalhadores, departamentos, cargos, contratos, férias, presenças, ausências.

## Fase 8 — Salários
Componentes configuráveis, processamento→aprovação→pagamento→contabilização, recibos.

## Fase 9 — Contratos e subscrições
Contratos, renovações, alertas, facturação recorrente (jobs idempotentes).

## Fase 10 — Produção
BOM, ordens, consumos, custo previsto vs real, qualidade.

## Fase 11 — Relatórios e dashboards
Dashboards com dados reais, exportações PDF/Excel/CSV, agendamentos, relatório de operações.

## Fase 12 — PWA, offline e produção
PWA, POS offline idempotente, hardening, E2E, backups, **deploy VPS** (ver DEPLOYMENT.md).

---

## Definição de concluído

DB + migração + backend + frontend + permissões + isolamento multiempresa + validações +
tratamento de erros + auditoria + testes a passar + lint + typecheck + build + docs
actualizadas + sem dados mockados + sem botões decorativos.
