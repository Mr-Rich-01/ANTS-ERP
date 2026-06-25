# DEPLOYMENT — ANTS ERP

_Última actualização: 2026-06-24_

Alvo: **VPS Hostinger · Ubuntu Server · Docker Compose · Cloudflare**.
O deploy real é executado na Fase 12; este documento descreve a arquitectura desenhada agora.

## 1. Desenvolvimento local

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env            # ajustar valores
pnpm docker:dev                 # sobe Postgres + Redis
pnpm db:generate                # gera cliente Prisma
pnpm db:migrate                 # cria/aplica migrações (Fase 1+)
pnpm db:seed                    # dados de demonstração (só dev)
pnpm dev                        # web + api + worker
```

- Web: http://localhost:3000 · API: http://localhost:4000/api · Swagger: /api/docs

## 2. Produção (Docker Compose)

Serviços em `docker-compose.production.yml`: `reverse-proxy` (Caddy), `web`, `api`,
`worker`, `postgres`, `redis`.

- **Caddy** termina TLS e encaminha: `/api/*` → api:4000, restante → web:3000 (`infra/Caddyfile`).
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
- Gerar `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` fortes: `openssl rand -base64 48`.
- Password de Postgres forte e exclusiva.

## 5. Dados e backups

- Volumes nomeados: `ants_pgdata`, `ants_redisdata`, `caddy_data`.
- Backup Postgres: `pg_dump` agendado (job/cron) → ficheiro **encriptado** → armazenamento externo.
- Restauro: `pg_restore`/`psql` a partir do dump (procedimento testado periodicamente).

## 6. Operação

- Health checks por serviço (Postgres/Redis healthcheck; `/api/health`).
- Migrações: `prisma migrate deploy` controlado no arranque do serviço `api`.
- Logs estruturados + rotação. Seed **nunca** em produção.

## 7. Build de imagens (a criar na Fase 12)

Dockerfiles multi-stage: `apps/web/Dockerfile` (Next.js standalone),
`apps/api/Dockerfile` e `apps/worker/Dockerfile` (NestJS/Node slim).
