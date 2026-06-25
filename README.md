# ANTS ERP

Sistema ERP modular, multiempresa e multifilial para Moçambique (pt-MZ, MZN/MT,
Africa/Maputo). Monorepo pnpm + Turborepo.

## Estrutura

- `apps/web` — Next.js (frontend)
- `apps/api` — NestJS (REST API + Swagger)
- `apps/worker` — BullMQ (jobs assíncronos)
- `packages/database` — Prisma (schema, migrações, seed)
- `packages/shared` — tipos, constantes pt-MZ, regras puras
- `packages/ui` — componentes React (portados do design)
- `packages/config` — eslint / tailwind preset / tsconfig partilhados
- `docs/` — documentação · `design/` — referência do design · `infra/` — reverse proxy

## Arranque rápido

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env
pnpm docker:dev        # Postgres + Redis
pnpm db:generate
pnpm dev               # web :3000 · api :4000/api
```

Ver [`docs/`](docs/) para arquitectura, base de dados, segurança, deploy e estado dos módulos.
O estado por módulo está em [`docs/MODULE_STATUS.md`](docs/MODULE_STATUS.md).
