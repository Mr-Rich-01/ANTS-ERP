# DEPLOYMENT — ANTS ERP

_Última actualização: 2026-07-04_

Alvo: **VPS Hostinger · Ubuntu Server · Docker Compose · Cloudflare**.
Arquitectura: **monólito Next.js** + worker. O deploy real é executado na Fase 12.

## 1. Desenvolvimento local

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env            # ajustar valores (AUTH_SECRET, DATABASE_URL, …)
pnpm docker:dev                 # sobe Postgres + Redis
pnpm db:generate                # gera cliente Prisma
pnpm db:migrate                 # cria/aplica migrações (Fase 1+)
pnpm db:seed                    # dados de demonstração (só dev)
pnpm dev                        # web (Next) + worker
```

- Web (UI + API interna): http://localhost:3000 · Route Handlers sob `/api/*`.

## 2. Produção (Docker Compose)

Serviços em `docker-compose.production.yml`: `reverse-proxy` (Caddy), `web` (Next.js
monólito), `worker`, `postgres`, `redis`.

- **Caddy** termina TLS e encaminha tudo → `web:3000` (o Next trata `/api` internamente).
- **Cloudflare** à frente: DNS proxied, SSL **Full (Strict)**, WAF, rate limiting de borda.
- **Postgres e Redis sem `ports:`** — acessíveis apenas na rede interna `ants_net`.
- Apenas o reverse-proxy publica **80/443**.

## 3. Hardening do host (Ubuntu)

- UFW: permitir 22, 80, 443; negar o resto.
- SSH só por chave; desactivar login root e password.
- `fail2ban` activo. Utilizador não-root para a aplicação.
- Docker e Compose plugin instalados; actualizações de segurança automáticas.

## 4. Segredos

- `.env` fora do git (apenas `.env.example` versionado).
- Gerar `AUTH_SECRET` forte: `npx auth secret` (ou `openssl rand -base64 33`).
- Password de Postgres forte e exclusiva.

## 5. Dados e backups

- Volumes nomeados: `ants_pgdata`, `ants_redisdata`, `caddy_data`.
- Backup Postgres: `pg_dump` agendado (job/cron) → ficheiro **encriptado** → armazenamento externo.
- Restauro: `pg_restore`/`psql` a partir do dump (procedimento testado periodicamente).

## 6. Operação

- Health checks por serviço (Postgres/Redis healthcheck; Route Handler `/api/health` na web).
- Migrações: `prisma migrate deploy` executado antes de subir a nova versão da `web`.
- Logs estruturados + rotação. Seed **nunca** em produção.

## 7. Imagens Docker de produção

A P0-04 cria imagens multi-stage para os serviços executáveis reais:

- `apps/web/Dockerfile`: Next.js 14 em `output: "standalone"`, activado no build por
  `BUILD_STANDALONE=1`, runtime com `node apps/web/server.js`.
- `apps/worker/Dockerfile`: worker BullMQ compilado por `tsc`, runtime com `node dist/main.js`.
- `apps/web/Dockerfile` também expõe o target `migrator`, usado apenas para o comando explícito
  `prisma migrate deploy`.

Build local das imagens:

```bash
pnpm docker:build:web
pnpm docker:build:worker
pnpm docker:build
```

Build via Compose de produção:

```bash
pnpm docker:production:build
```

As imagens usam Node 20 Debian slim com OpenSSL instalado, pnpm 9.12.0 via Corepack,
lockfile congelado, Prisma Client gerado no build e utilizador não-root no runtime.
`.env`, `.env.*`, `.git`, `node_modules`, caches, testes, logs, uploads locais e backups são
excluídos pelo `.dockerignore`.

## 8. Variáveis de ambiente obrigatórias

Para `web`:

```env
NODE_ENV=production
APP_URL=https://erp.exemplo.co.mz
AUTH_URL=https://erp.exemplo.co.mz
AUTH_SECRET=<segredo forte>
DATABASE_URL=postgresql://USER:PASSWORD@postgres:5432/DATABASE?schema=public
REDIS_URL=redis://redis:6379
PORT=3000
```

Para `worker`:

```env
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@postgres:5432/DATABASE?schema=public
REDIS_URL=redis://redis:6379
```

Para infraestrutura Compose:

```env
DOMAIN=erp.exemplo.co.mz
POSTGRES_USER=<utilizador>
POSTGRES_PASSWORD=<password forte>
POSTGRES_DB=<base_de_dados>
```

Nunca usar credenciais demo, `.env` local, seed de demonstração ou connection strings privadas
em documentação, commits ou imagem.

## 9. Migrations e arranque

As migrations não correm automaticamente no arranque de `web` ou `worker`. Executar de forma
explícita antes de subir a nova versão:

```bash
docker compose -f docker-compose.production.yml --profile migration run --rm migrate
```

O seed de demonstração nunca deve ser executado em produção.

## 10. Publicação (deploy)

```bash
git pull
pnpm docker:production:build
docker compose -f docker-compose.production.yml --profile migration run --rm migrate
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
```
