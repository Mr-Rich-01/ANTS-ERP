# CLAUDE.md — ANTS ERP

Conhecimento permanente do projecto para o Claude Code. (O estado actual e o próximo
passo vivem em [`MODULE_STATUS.md`](MODULE_STATUS.md), não aqui.)

## O que é

**ANTS ERP** — sistema ERP modular, multiempresa, multifilial e auditável, para
Moçambique. Localização padrão: **pt-MZ**, moeda **MZN** (símbolo **MT**), fuso
**Africa/Maputo**, data **DD/MM/YYYY**. A interface foi desenhada no Claude Design e
portada fielmente (22 ecrãs) para React/Next.js — a referência visual está em `design/`.

## Arquitectura — monólito Next.js

UI + Route Handlers (`/api`) + Server Actions vivem na **mesma app Next.js** (sem API
separada). A lógica de negócio está numa **camada de domínio** reutilizável.

```
ANTS ERP/  (monorepo pnpm + Turborepo)
├── apps/
│   ├── web/      Next.js (App Router): UI + Route Handlers + Server Actions + Auth.js
│   └── worker/   BullMQ (jobs assíncronos)
├── packages/
│   ├── database/ Prisma (schema, migrações, seed) + isolamento multiempresa (tenant.ts)
│   ├── domain/   lógica de negócio: serviços, RequestContext, permissões, auditoria, erros
│   ├── shared/   tipos, constantes pt-MZ, cálculo puro (money.ts) — sem I/O
│   ├── ui/       shadcn/ui (Button, Dialog, Input, Label) + helper Icon (Lucide)
│   └── config/   eslint / tailwind preset (tokens do design) / tsconfig partilhados
├── docs/         documentação · design/ referência · infra/ Caddyfile (reverse proxy)
```

### Fluxo de um pedido (obrigatório)

```
Browser/PWA → (Cloudflare → Caddy) → Next.js
  Auth.js (sessão)
    → getContext()  →  RequestContext { companyId, userId, permissions, isPlatformAdmin }
       → requirePermission(ctx, 'modulo.accao')
          → serviço em packages/domain
             → cliente Prisma ISOLADO (forCompany/forContext) → PostgreSQL
                → UI
```

- `RequestContext` é **sempre** derivado da sessão autenticada — **nunca** do cliente.
- `getContext()`/`requireSession()` estão em `apps/web/src/lib/session.ts`.
- `forCompany(companyId)` e `forContext(ctx)` estão em `@ants/database`
  (`packages/database/src/tenant.ts`): injectam `companyId` em todas as queries dos
  modelos empresariais (lista em `tenant-scope.ts` → `COMPANY_SCOPED`).

## Stack

- **App:** Next.js **14** (App Router, Server Components/Actions), React 18, TypeScript.
- **Auth:** **Auth.js v5** (Credentials), sessão JWT; hash **Argon2** (`@node-rs/argon2`).
- **UI:** Tailwind + **shadcn/ui** (Radix), tokens exactos do design via CSS variables
  (`apps/web/src/styles/tokens.css` + preset em `packages/config/tailwind`). Fontes
  **Hanken Grotesk** (interface) + **IBM Plex Mono** (valores/SKUs). Ícones **Lucide**.
  Gráficos: Recharts. Validação: **Zod**. Formatação monetária: `fmt`/`formatMZN`.
- **Dados:** PostgreSQL 16 + **Prisma 5**. **Redis 7 + BullMQ** (worker).
- **Infra:** Docker Compose; reverse-proxy **Caddy**; **Cloudflare** à frente
  (Full/Strict). Postgres e Redis nunca expostos publicamente.

## Comandos de desenvolvimento

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env                 # raiz: DATABASE_URL, AUTH_SECRET, REDIS_URL…
pnpm docker:dev                      # sobe Postgres + Redis
pnpm db:generate                     # gera o cliente Prisma
pnpm db:migrate                      # aplica migrações (precisa do Postgres a correr)
pnpm db:seed                         # dados de demonstração (só dev)
pnpm dev                             # web :3000 (UI + /api) · worker

pnpm typecheck && pnpm lint && pnpm test && pnpm build   # validação completa
```

- O **Next.js** lê env de `apps/web/.env.local` (runtime). A **CLI Prisma** lê de
  `process.env`/raiz `.env` — ao correr migrações/seed manualmente, exportar `DATABASE_URL`.
- Se o Postgres ficar inacessível após um restart do Docker:
  `docker compose up -d --force-recreate postgres` (o volume/dados persistem).

## Credenciais de teste (seed)

| Utilizador | Password | Papel |
|------------|----------|-------|
| `admin@ants.co.mz` | `Admin@123` | Administrador da empresa demo (todas as permissões) |
| `superadmin@ants.co.mz` | `Admin@123` | Super Admin da plataforma (pede troca de password no 1.º acesso) |
| `maria@ / joao@ / ana@ / carlos@ / lucia@ ants.co.mz` | `Demo@123` | Utilizadores demo (Caixa/Vendedor/Contabilista/…) |

Empresa demo: **ANTS Demo, Lda.** (`demo-company`), filiais Maputo e Matola.

## Regras invioláveis de engenharia

1. **Camada de domínio limpa.** A lógica de negócio vive em `packages/domain` (e cálculo
   puro em `packages/shared`). As páginas/Server Actions só orquestram: obtêm o contexto,
   chamam o domínio e tratam o resultado. **Nunca** lógica de negócio espalhada na UI.
2. **Isolamento por `companyId` em TODAS as queries.** Aceder à BD a partir do domínio
   usa sempre um cliente isolado — `forCompany(ctx.companyId)` (leituras/escritas) ou
   `forContext(ctx)` (idem + auditoria). Nunca confiar no `companyId` vindo do cliente.
   Ao adicionar um modelo com `companyId`, registá-lo em `COMPANY_SCOPED`.
3. **Permissões no servidor.** Toda a operação sensível chama `requirePermission(ctx, key)`.
   O frontend apenas oculta o que o utilizador não pode ver — nunca é a fonte de verdade.
4. **Auditoria.** Mutações importantes registam `AuditLog` (via `forContext` automático ou
   `writeAudit` explícito na transacção). Documentos emitidos / lançamentos publicados /
   movimentos confirmados **não se apagam** — corrigem-se por cancelamento/estorno/NC/ND.
   Nunca registar passwords, tokens ou segredos.
5. **Validar antes de cada commit:** `typecheck`, `lint`, `test` e `build` verdes. Não
   declarar nada concluído sem estas validações. Não deixar botões decorativos sem acção.
6. **Next.js fica em 14** (estável). Avaliar versões superiores só deliberadamente, com
   verificação de compatibilidade.
7. **Dinheiro** sempre pelas funções de `packages/shared` (`fmt`/`formatMZN`,
   arredondamento a 2 casas). Datas no formato pt-MZ.
8. **Segredos fora do git.** `.env`/`.env.local` nunca commitados; só `.env.example`.

## Convenções

- Commits em português; terminar com a linha `Co-Authored-By: Claude Opus 4.8`.
- Ao portar/editar ecrãs, preservar a identidade visual do design (tokens, tipografia,
  espaçamento). Marcar dados ainda não ligados com `// TODO: ligar à API` e não
  apresentá-los como reais.
