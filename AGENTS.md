# AGENTS.md — ANTS ERP

Instruções permanentes para o OpenAI Codex neste repositório. O estado vivo do
projecto continua em [`MODULE_STATUS.md`](MODULE_STATUS.md). Preservar
[`CLAUDE.md`](CLAUDE.md); se `AGENTS.md` e `CLAUDE.md` divergirem, não decidir
silenciosamente: apresentar a divergência ao utilizador.

## Projecto

**ANTS ERP** é um ERP modular, multiempresa, multifilial e auditável para
Moçambique. A localização padrão é `pt-MZ`, moeda `MZN`, fuso
`Africa/Maputo` e datas em formato `DD/MM/YYYY`.

A arquitectura actual é um monólito modular em Next.js dentro de um monorepo
pnpm + Turborepo:

- `apps/web`: Next.js App Router com UI, Route Handlers, Server Actions e
  Auth.js/NextAuth.
- `apps/worker`: worker BullMQ para jobs assíncronos.
- `packages/database`: Prisma, schema, migrações, seed e isolamento
  multiempresa.
- `packages/domain`: lógica de negócio, RequestContext, permissões, auditoria
  e erros de domínio.
- `packages/shared`: tipos, constantes pt-MZ e cálculo puro sem I/O.
- `packages/ui`: componentes shadcn/ui partilhados e helpers de UI.
- `packages/config`: presets partilhados de ESLint, Tailwind e TypeScript.

Módulos já implementados: Auth/RBAC/Admin, Clientes, Fornecedores, Produtos &
Stock, Vendas/Facturação, Compras, Tesouraria & Bancos, Hardening da
Tesouraria, Contabilidade 8a, 8b, 8c.1, 8c.2a, 8c.2b, 8c.3,
P0-03 completo (P0-03.0, P0-03a, P0-03b, P0-03c, P0-03d, P0-03e e P0-03f),
P0-04, P0-05, P0-06, P0-07, P0-08, P0-09, P1-01 POS V1 limitado,
P1-02 Relatórios V1 operacionais, P1-03 Impressão/PDF profissional e P1-04
Contabilidade V1 finalizada.

Estado actual da Contabilidade: P0-03 completo. A base de
reversões está activa; recebimentos de clientes podem ser anulados, facturas sem
recebimentos activos podem ser canceladas e pagamentos a fornecedores podem ser
estornados ponta a ponta com reversão atómica de `Supplier`, `PurchaseOrder`,
Tesouraria, contabilidade e auditoria. Recepções de compra podem ser estornadas
ponta a ponta com reversão atómica de `PurchaseOrder`, `Supplier`, Stock, custo
médio, contabilidade e auditoria. Transferências entre contas de Tesouraria podem
ser estornadas atomicamente, revertendo as duas pernas e as duas contas em
conjunto. A regressão integrada/UAT e a documentação final dos estornos foram
criadas na P0-03f. A P0-04 preparou as imagens Docker de produção. A P0-05
resolveu a ambiguidade de login multiempresa com selecção explícita e validada
de empresa activa. A P0-06 criou o ambiente de staging Docker e a validação de
release. A P0-07 criou a base operacional de Backup/Restore/Rollback. A P0-08
reforcou o hardening de producao com validacao de env, bloqueio de placeholders,
cookies seguros, headers, CORS same-origin, rate limit, logs sem secrets e health
sem exposicao sensivel. A P0-09 criou o pacote de UAT comercial e prontidao de
piloto com roteiro, checklist, matriz V1, template de sign-off, criterios de
entrada/saida e regras para nao vender funcionalidades futuras. A P1-01 ligou
`/pos` a produtos reais, Cliente final, factura + recibo, stock, tesouraria,
contabilidade e auditoria como checkout simples pronto para UAT limitado. A
P1-02 ligou `/relatorios` a dados reais do domínio/base de dados para vendas,
clientes, antiguidade de saldos, compras, fornecedores, stock, fluxo de caixa e
auditoria, com filtros básicos e exportação CSV simples, mantendo PDF/Excel
avançados, salários, produção, BI e relatórios personalizados como futuro. A
P1-03 implementou impressão/guardar PDF pelo navegador para factura, recibo,
relatório diário de caixa e relatórios V1 com HTML/CSS print, mantendo PDF
fiscal oficial, assinatura digital/fiscal, envio por email, impressão térmica
avançada e layouts personalizáveis como futuro. A P1-04 finalizou a
Contabilidade V1 com plano de contas, diário, razão/extracto por conta,
balancete, filtros, CSV e impressão/guardar PDF pelo navegador. O polimento
pré-integração da P1-04 mantém balancete filtrado por conta como leitura neutra,
não como validação global, mostra saldos acumulados em MT e labels humanos em
português. Mantém lançamento manual, fecho anual, DRE oficial, balanço oficial,
fiscal/AT, assinatura digital, reconciliação bancária avançada e centros de custo
avançados como futuro. O
proximo passo deve ser decidido explicitamente dentro do backlog P1; nao iniciar
P1-05 automaticamente.

## Arquitectura Obrigatória

Fluxo obrigatório de qualquer operação sensível:

```text
Sessão
→ RequestContext
→ requirePermission
→ função de domínio
→ Prisma/transacção
→ auditoria
→ UI
```

Responsabilidades:

- `apps/web`: obter sessão, construir `RequestContext`, chamar o domínio,
  renderizar UI, executar Server Actions e Route Handlers. Não contém regras
  contabilísticas.
- `packages/domain`: fonte das regras de negócio, validações funcionais,
  permissões, transacções, idempotência, auditoria explícita e erros de
  domínio.
- `packages/database`: Prisma Client, schema, migrações, seed e helpers
  `forCompany`/`forContext` para isolamento por empresa.
- `packages/shared`: constantes, formatação e cálculo puro reutilizável, sem
  acesso a rede, base de dados ou sessão.
- `packages/ui`: componentes visuais partilhados, sem regras de negócio.

`RequestContext` é sempre derivado da sessão autenticada, nunca do cliente.
Todas as queries de modelos com `companyId` devem passar por cliente isolado e
novos modelos empresariais devem ser registados em `COMPANY_SCOPED`.
Nunca aceitar `companyId` de URL, formulário, localStorage, header ou payload
como fonte de verdade; qualquer escolha enviada pela UI deve ser revalidada no
servidor contra sessão, conta/membership activa e empresa activa.

## Stack Declarada

- Node.js `>=20.0.0`.
- pnpm `9.12.0`.
- Next.js `^14.2.13`.
- React/React DOM `^18.3.1`.
- TypeScript `^5.6.2`.
- Prisma/`@prisma/client` `^5.20.0`.
- PostgreSQL `16-alpine` via Docker Compose.
- Redis `7-alpine` via Docker Compose.
- Auth.js/NextAuth `^5.0.0-beta.22`.
- BullMQ `^5.13.2`.
- Zod `^3.23.8`.
- Vitest `^2.1.1`.
- Tailwind CSS `^3.4.13`, Radix Dialog, shadcn/ui primitives, Lucide icons e
  Recharts.
- Docker Compose para infraestrutura local.

Não alterar a major do Next.js; manter Next 14 até existir uma fase própria de
upgrade.

## Regras Invioláveis

- A lógica de negócio permanece em `packages/domain`; cálculo puro pode viver em
  `packages/shared`.
- UI e Server Actions não executam regras contabilísticas directamente.
- Todas as operações respeitam `companyId`.
- Prevenir relações cross-company com isolamento, FKs compostas e validações de
  domínio.
- Usar permissões explícitas com `requirePermission`.
- Operações financeiras são transaccionais.
- Auditoria participa na mesma transacção da mutação financeira.
- Lançamentos `POSTED` são imutáveis; correcções acontecem por estorno.
- Lançamentos `POSTED` nunca são apagados nem editados.
- A reversão começa sempre no documento operacional de origem.
- Linhas históricas são preservadas e invertidas; não recalcular mappings em
  estornos.
- Movimentos financeiros compensatórios mantêm relação explícita com o
  movimento/documento original.
- Motivo e data em período/exercício aberto são obrigatórios para reversões.
- Movimentos de Tesouraria derivados de documentos operacionais não podem ser
  estornados directamente; a reversão começa no documento de origem.
- Não aplicar fallbacks contabilísticos silenciosos.
- Usar mappings configurados para contas, diários e eventos contabilísticos.
- Não quebrar idempotência operacional nem contabilística.
- Inspeccionar migrations antes de aplicar.
- O seed deve ser idempotente e não destrutivo.
- Seeds de demonstração nunca podem executar em `production`; produção usa
  provisionamento explícito.
- Em staging Docker, migrations são sempre manuais e explícitas pelo serviço
  `migrate`; `web` e `worker` não executam migrations automaticamente.
- Fazer backup antes de qualquer migration em ambiente real.
- Nunca commitar backups, dumps, restores temporários ou artefactos com dados.
- Restore é destrutivo e exige confirmação explícita; scripts de staging/local
  não podem apontar para produção por defeito.
- `.env.staging` nunca pode ser commitado; apenas `.env.staging.example` pode
  ser versionado com placeholders seguros.
- Em producao real, nunca aceitar secrets fracos, placeholders ou URLs localhost
  para `APP_URL`/`AUTH_URL`.
- `/api/health` nao pode expor secrets, envs completos, dados de empresa ou
  detalhes internos sensiveis.
- Nao adicionar CORS amplo ou `Access-Control-Allow-Origin: *` em endpoints
  autenticados.
- Validar `typecheck`, `lint`, testes relevantes e `build` antes de cada commit.
  O build foi classificado em 2026-06-30; se voltar a falhar, tratar como
  regressão nova e registar o primeiro erro real conforme `MODULE_STATUS.md`.
- Executar testes de integração relevantes à fase tocada.
- Cada fase deve ter commit isolado.
- Não misturar alterações de Next/React com fases funcionais.
- Não avançar automaticamente para a fase seguinte.
- Nunca incluir segredos, passwords reais, tokens, connection strings privadas
  ou conteúdo sensível de `.env` em documentação ou commits.
- Não usar dados reais em UAT, piloto, screenshots, logs ou documentação sem
  aprovação explícita.
- Não vender, demonstrar como pronto ou prometer funcionalidades marcadas como
  futuras, parciais ou fora da V1 na matriz de escopo.
- Qualquer piloto exige staging validado, backup pré-piloto e checklist/sign-off
  assinado.

## Comandos

Usar apenas scripts existentes nos manifests quando se referir a scripts do
projecto.

Instalação:

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
```

Docker:

```bash
pnpm docker:dev
docker compose ps
```

Operação staging:

```bash
pnpm ops:staging:backup
CONFIRM_RESTORE=I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA pnpm ops:staging:restore -- backups/staging/<ficheiro>.dump
```

Prisma:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Desenvolvimento:

```bash
pnpm dev
```

Validação:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration:accounting
pnpm test:integration:accounting:c1
pnpm test:integration:accounting:c2a
pnpm test:integration:accounting:c2
pnpm test:integration:accounting:c3
pnpm test:integration:accounting:reports
pnpm test:integration:accounting:reversal:customer-payment
pnpm test:integration:accounting:reversal:invoice
pnpm test:integration:accounting:reversal:supplier-payment
pnpm test:integration:accounting:reversal:purchase-receipt
pnpm test:integration:accounting:reversal:treasury-transfer
pnpm test:integration:accounting:reversal:uat
pnpm test:integration:accounting:reversal:all
pnpm test:integration:auth:company-selection
pnpm test:integration:security:production-hardening
pnpm test:integration:pos
pnpm test:integration:reports
pnpm build
```

Testes de integração contabilísticos:

- 8b: `pnpm test:integration:accounting`
- 8c.1: `pnpm test:integration:accounting:c1`
- 8c.2a: `pnpm test:integration:accounting:c2a`
- 8c.2b: `pnpm test:integration:accounting:c2`
- 8c.3: `pnpm test:integration:accounting:c3`
- P1-04: `pnpm test:integration:accounting:reports`
- P0-03b: `pnpm test:integration:accounting:reversal:customer-payment`
- P0-03a: `pnpm test:integration:accounting:reversal:invoice`
- P0-03c: `pnpm test:integration:accounting:reversal:supplier-payment`
- P0-03d: `pnpm test:integration:accounting:reversal:purchase-receipt`
- P0-03e: `pnpm test:integration:accounting:reversal:treasury-transfer`
- P0-03f: `pnpm test:integration:accounting:reversal:uat`
- P0-03 agregado: `pnpm test:integration:accounting:reversal:all`
- P0-05: `pnpm test:integration:auth:company-selection`
- P1-01 POS: `pnpm test:integration:pos`

## Credenciais de Teste Versionadas

As credenciais abaixo são dados de demonstração intencionalmente versionados no
projecto para ambiente local:

| Utilizador | Password | Papel |
|------------|----------|-------|
| `admin@ants.co.mz` | `Admin@123` | Administrador da empresa demo |
| `superadmin@ants.co.mz` | `Admin@123` | Super Admin da plataforma |
| `maria@ants.co.mz`, `joao@ants.co.mz`, `ana@ants.co.mz`, `carlos@ants.co.mz`, `lucia@ants.co.mz` | `Demo@123` | Utilizadores demo |

Empresa demo: **ANTS Demo, Lda.** (`demo-company`), filiais Maputo e Matola.

Não copiar valores reais de `.env`, tokens, connection strings privadas ou
passwords não demonstrativas.

## Estado Actual

- P0-03.0 concluída.
- P0-03b concluída.
- P0-03a concluída.
- P0-03c concluída.
- P0-03d concluída.
- P0-03e concluída.
- P0-03f concluída.
- P0-03 completo.
- P0-04 concluída.
- P0-05 concluída.
- P0-06 concluída.
- P0-07 concluída.
- P0-08 concluída.
- P0-09 concluída.
- P1-01 POS V1 funcional limitado concluida.
- P1-02 Relatórios V1 operacionais concluida.
- P1-03 Impressão/PDF profissional concluida.
- P1-04 Contabilidade V1 finalizada concluida.
- Ajuste P1-04 pre-integracao concluido: balancete filtrado por conta nao e
  erro global, saldos em MT, labels tecnicos traduzidos e lancamento manual
  permanece futuro.
- V1 candidata a demo externa apos UAT interna em 2026-07-06, aprovada com
  ressalvas e registada em `docs/UAT_INTERNAL_DEMO_REPORT.md`; P1-04 acrescenta
  Contabilidade V1 pronta para UAT/demo com limites; nao marca producao pronta,
  nao autoriza piloto real e nao inicia P1-05.
- Ajustes UX pre-demo registados: titulo fixo da factura removido, modulos futuros
  neutralizados como futuro e logout a repetir em browser externo/limpo porque o
  browser integrado bloqueou a revalidacao visual limpa.
- Commit base funcional antes da P0-03.0: `a1d608b`.
- Proximo passo: smoke manual final em browser externo/limpo antes da demo externa.
- Nao iniciar P1-05 nem piloto real sem decisao explicita, backup, staging
  validado e checklist assinada.
- `MODULE_STATUS.md` é a fonte principal para progresso e próximos passos.
- `CLAUDE.md` deve ser preservado.
- Quando `AGENTS.md` e `CLAUDE.md` divergirem, apresentar a divergência antes
  de actuar.
