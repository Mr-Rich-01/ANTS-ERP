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
Tesouraria, Contabilidade 8a, 8b, 8c.1 e 8c.2a.

Estado actual da Contabilidade: Fase 8c.2a concluída com o modelo
`OperationIdempotency`, fingerprint canónico `v1:` e helper transaccional de
idempotência operacional. A próxima fase é 8c.2b, integração contabilística de
factura e recibo. Não iniciar a fase seguinte automaticamente.

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
- Não aplicar fallbacks contabilísticos silenciosos.
- Usar mappings configurados para contas, diários e eventos contabilísticos.
- Não quebrar idempotência operacional nem contabilística.
- Inspeccionar migrations antes de aplicar.
- O seed deve ser idempotente e não destrutivo.
- Validar `typecheck`, `lint`, testes relevantes e `build` antes de cada commit.
  O build foi classificado em 2026-06-30; se voltar a falhar, tratar como
  regressão nova e registar o primeiro erro real conforme `MODULE_STATUS.md`.
- Executar testes de integração relevantes à fase tocada.
- Cada fase deve ter commit isolado.
- Não misturar alterações de Next/React com fases funcionais.
- Não avançar automaticamente para a fase seguinte.
- Nunca incluir segredos, passwords reais, tokens, connection strings privadas
  ou conteúdo sensível de `.env` em documentação ou commits.

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
pnpm build
```

Testes de integração contabilísticos:

- 8b: `pnpm test:integration:accounting`
- 8c.1: `pnpm test:integration:accounting:c1`
- 8c.2a: `pnpm test:integration:accounting:c2a`

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

- Fase 8c.2a concluída.
- Commit base funcional: `acef72b`.
- Próxima fase: 8c.2b — Integração contabilística de factura e recibo.
- `MODULE_STATUS.md` é a fonte principal para progresso e próximos passos.
- `CLAUDE.md` deve ser preservado.
- Quando `AGENTS.md` e `CLAUDE.md` divergirem, apresentar a divergência antes
  de actuar.
