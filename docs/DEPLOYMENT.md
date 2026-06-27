# DEPLOYMENT — ANTS ERP

_Última actualização: 2026-06-26_

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

## 7. Publicação (deploy)

```bash
git pull
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml run --rm web pnpm db:migrate:deploy
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
```

## 8. Build de imagens (a criar na Fase 12)

Dockerfiles multi-stage: `apps/web/Dockerfile` (Next.js standalone) e
`apps/worker/Dockerfile` (Node slim).
