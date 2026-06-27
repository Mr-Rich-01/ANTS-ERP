# ANTS ERP

Sistema ERP modular, multiempresa e multifilial para Moçambique (pt-MZ, MZN/MT,
Africa/Maputo). Monorepo pnpm + Turborepo.

Arquitectura: **monólito Next.js** (UI + Route Handlers + Server Actions + Auth.js).

## Estrutura

- `apps/web` — Next.js (UI + API interna + Auth.js)
- `apps/worker` — BullMQ (jobs assíncronos)
- `packages/database` — Prisma (schema, migrações, seed)
- `packages/domain` — lógica de negócio (serviços, contexto, permissões, auditoria)
- `packages/shared` — tipos, constantes pt-MZ, regras puras
- `packages/ui` — componentes React (shadcn/ui + portados do design)
- `packages/config` — eslint / tailwind preset / tsconfig partilhados
- `docs/` — documentação · `design/` — referência do design · `infra/` — reverse proxy

## Arranque rápido

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env
pnpm docker:dev        # Postgres + Redis
pnpm db:generate
pnpm dev               # web :3000 (UI + /api) · worker
```

Ver [`docs/`](docs/) para arquitectura, base de dados, segurança, deploy e estado dos módulos.
O estado por módulo está em [`docs/MODULE_STATUS.md`](docs/MODULE_STATUS.md).
