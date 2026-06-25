# ERP_ARCHITECTURE — ANTS ERP

_Última actualização: 2026-06-24_

## 1. Visão geral

Sistema ERP modular, multiempresa, multifilial, multiutilizador, auditável e
preparado para SaaS. Monorepo gerido com **pnpm + Turborepo**.

```
ANTS ERP/
├── apps/
│   ├── web/      Next.js (App Router) — frontend
│   ├── api/      NestJS — REST API + OpenAPI/Swagger
│   └── worker/   BullMQ — jobs assíncronos
├── packages/
│   ├── database/ Prisma (schema, migrações, seed)
│   ├── shared/   tipos, constantes pt-MZ, regras puras (cálculo, fiscal)
│   ├── ui/       componentes React portados do design
│   └── config/   eslint / tailwind preset / tsconfig partilhados
├── docs/         documentação
├── design/       referência do design (markup decodificado)
└── infra/        Caddyfile (reverse proxy de produção)
```

## 2. Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind (preset com tokens do design),
  TanStack Query/Table (fases seguintes), React Hook Form + Zod, Recharts, Lucide.
- **Backend:** NestJS 10, REST, OpenAPI/Swagger, ValidationPipe, arquitectura modular.
- **Base de dados:** PostgreSQL 16 + Prisma 5.
- **Cache/filas:** Redis 7 + BullMQ.
- **Auth:** access token curto + refresh token (cookie httpOnly), Argon2, RBAC granular.

## 3. Multiempresa (isolamento — não-negociável)

- `companyId` **sempre** derivado da sessão autenticada, nunca do frontend.
- Aplicação por: guard NestJS (injecta contexto da empresa) + extensão Prisma que filtra
  por `companyId` em todas as queries dos modelos empresariais.
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
Web (Next.js)  →  API REST (NestJS: Controller → Service → Prisma)  →  PostgreSQL
                          │
                          └→ Fila (Redis/BullMQ) → Worker
```

Regras de negócio puras (cálculo de linhas, totais, fiscal) vivem em `packages/shared`
e são reutilizadas por web e api.
