# ERP_ARCHITECTURE — ANTS ERP

_Última actualização: 2026-06-26_

## 1. Visão geral

Sistema ERP modular, multiempresa, multifilial, multiutilizador, auditável e
preparado para SaaS. **Arquitectura: monólito Next.js** (UI + Route Handlers `/api`
+ Server Actions na mesma app) sobre um monorepo **pnpm + Turborepo**. A lógica de
negócio vive numa camada de domínio (`packages/domain`) reutilizável pela web e pelo worker.

```
ANTS ERP/
├── apps/
│   ├── web/      Next.js (App Router) — UI + Route Handlers + Server Actions + Auth.js
│   └── worker/   BullMQ — jobs assíncronos
├── packages/
│   ├── database/ Prisma (schema, migrações, seed)
│   ├── domain/   lógica de negócio (serviços, contexto, permissões, auditoria)
│   ├── shared/   tipos, constantes pt-MZ, regras puras (cálculo, fiscal)
│   ├── ui/       componentes React (shadcn/ui + portados do design)
│   └── config/   eslint / tailwind preset / tsconfig partilhados
├── docs/         documentação
├── design/       referência do design (markup decodificado)
└── infra/        Caddyfile (reverse proxy de produção)
```

> **Porquê monólito:** para uma equipa pequena numa VPS, reduz peças, dá type-safety
> ponta-a-ponta (Server Actions partilham tipos com o domínio, sem limite HTTP) e um
> único deployável. A camada `packages/domain` mantém a opção de extrair uma API
> dedicada no futuro sem reescrever a lógica.

## 2. Stack

- **App:** Next.js 14 (App Router, Server Components/Actions, Route Handlers), React 18,
  TypeScript, Tailwind, **shadcn/ui**, React Hook Form + Zod, TanStack Table, Recharts, Lucide.
- **Autenticação:** **Auth.js** (sessões, RBAC granular).
- **Domínio:** `packages/domain` — serviços com `RequestContext` (companyId/userId/permissões).
- **Base de dados:** PostgreSQL 16 + Prisma 5.
- **Cache/filas:** Redis 7 + BullMQ (`apps/worker`).

## 3. Multiempresa (isolamento — não-negociável)

- `companyId` **sempre** derivado da sessão autenticada (`RequestContext`), nunca do cliente.
- Aplicação por: `RequestContext` passado a cada serviço de domínio + extensão Prisma que
  filtra por `companyId` em todas as queries dos modelos empresariais.
- 2.ª barreira opcional: Postgres Row-Level Security em tabelas sensíveis.
- Campos base em registos empresariais: `companyId, branchId, createdBy, updatedBy,
  createdAt, updatedAt`.
- Testes de isolamento obrigatórios em cada fase (Empresa A nunca vê Empresa B).

## 4. Auditoria e imutabilidade

- `AuditLog` regista acção, entidade, valores antes/depois, IP, user-agent, motivo, resultado.
- Documentos emitidos / lançamentos publicados / movimentos confirmados **não se apagam** —
  correcção por cancelamento, estorno, nota de crédito/débito.
- Numeração documental transaccional e resistente a concorrência (sem duplicados).

## 5. Filas (BullMQ)

Notificações, relatórios pesados, processamento de salários, geração de documentos,
importação/exportação, backups, tarefas agendadas. Jobs **idempotentes** (ex.: facturação
recorrente não duplica).

## 6. Camadas

```
Browser/PWA
   │  HTTPS (Cloudflare → Caddy)
   ▼
Next.js (apps/web)
   ├─ UI (Server/Client Components, shadcn/ui)
   ├─ Server Actions / Route Handlers (/api)  ──┐
   └─ Auth.js (sessão → RequestContext)         │
                                                ▼
                               packages/domain (serviços)
                                  ├─ requirePermission(ctx, key)
                                  ├─ writeAudit(...)
                                  └─ regras de negócio
                                                │ Prisma
                                                ▼
                                          PostgreSQL
   apps/web/worker  ──►  Fila (Redis/BullMQ)  ──►  packages/domain  ──►  PostgreSQL
```

- Cálculo puro (linhas, totais, fiscal) → `packages/shared`.
- Lógica com I/O (persistência, transacções, auditoria) → `packages/domain`, invocada por
  Server Actions/Route Handlers (web) e por jobs (worker). Nada de lógica de negócio espalhada
  nas páginas.
