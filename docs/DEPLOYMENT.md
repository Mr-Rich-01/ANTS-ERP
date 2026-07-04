# DEPLOYMENT - ANTS ERP

_Ultima actualizacao: 2026-07-04_

Alvo futuro: **VPS Hostinger, Ubuntu Server, Docker Compose e Cloudflare**.
Arquitectura: **monolito Next.js** + worker. A P0-06 cobre apenas staging Docker local;
deploy real em servidor permanece fora do escopo actual.

## 1. Desenvolvimento local

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp .env.example .env            # ajustar valores (AUTH_SECRET, DATABASE_URL, ...)
pnpm docker:dev                 # sobe Postgres + Redis
pnpm db:generate                # gera cliente Prisma
pnpm db:migrate                 # cria/aplica migrations em desenvolvimento
pnpm db:seed                    # dados de demonstracao (so dev)
pnpm dev                        # web (Next) + worker
```

- Web (UI + API interna): http://localhost:3000. Route Handlers sob `/api/*`.

## 2. Staging Docker (P0-06)

Runbook: [`docs/STAGING.md`](STAGING.md).

```bash
cp .env.staging.example .env.staging
pnpm docker:staging:build
pnpm docker:staging:migrate
pnpm docker:staging:up
pnpm docker:staging:ps
curl http://localhost:3001/api/health
```

O Compose de staging usa `docker-compose.staging.yml`, publica apenas a web na
porta local definida por `STAGING_WEB_PORT`, mantem Postgres/Redis internos e
executa migrations apenas pelo profile explicito `migration`. Nao executa seed
demo automaticamente.

## 3. Producao (Docker Compose)

Servicos em `docker-compose.production.yml`: `reverse-proxy` (Caddy), `web`
(Next.js monolito), `worker`, `postgres`, `redis` e `migrate`.

- **Caddy** termina TLS e encaminha tudo para `web:3000` (o Next trata `/api` internamente).
- **Cloudflare** a frente: DNS proxied, SSL **Full (Strict)**, WAF, rate limiting de borda.
- **Postgres e Redis sem `ports:`**: acessiveis apenas na rede interna `ants_net`.
- Apenas o reverse-proxy publica **80/443**.

## 4. Hardening do host (Ubuntu)

- UFW: permitir 22, 80, 443; negar o resto.
- SSH so por chave; desactivar login root e password.
- `fail2ban` activo. Utilizador nao-root para a aplicacao.
- Docker e Compose plugin instalados; actualizacoes de seguranca automaticas.

## 5. Segredos

- `.env` fora do git (apenas `.env.example` versionado).
- Gerar `AUTH_SECRET` forte: `npx auth secret` ou `openssl rand -base64 33`.
- Password de Postgres forte e exclusiva.
- Antes de subir, executar a validacao de seguranca:

```bash
pnpm test:integration:security:production-hardening
```

- Nunca usar placeholders como `change_me`, `replace_with`, `example`, valores
  localhost ou secrets fracos em producao real. O runtime P0-08 falha cedo sem
  imprimir o valor secreto.

## 6. Dados e backups

- Volumes nomeados: `ants_pgdata`, `ants_redisdata`, `caddy_data`.
- Backup Postgres: `pg_dump` agendado para ficheiro encriptado e armazenamento externo.
- Restauro: `pg_restore`/`psql` a partir do dump, com procedimento testado periodicamente.

## 7. Operacao

- Health checks por servico: Postgres/Redis no Compose e Route Handler `/api/health` na web.
  `/api/health` e liveness da web; readiness exige tambem dependencias saudaveis e smoke de rotas
  reais como `/login` e `/seleccionar-empresa`.
- Migrations: `prisma migrate deploy` executado antes de subir a nova versao da `web`.
- Logs estruturados + rotacao. Seed **nunca** em producao.

## 8. Imagens Docker de producao

A P0-04 cria imagens multi-stage para os servicos executaveis reais:

- `apps/web/Dockerfile`: Next.js 14 em `output: "standalone"`, activado no build por
  `BUILD_STANDALONE=1`, runtime com `node apps/web/server.js`.
- `apps/worker/Dockerfile`: worker BullMQ compilado por `tsc`, runtime com `node dist/main.js`.
- `apps/web/Dockerfile` tambem expoe o target `migrator`, usado apenas para o comando explicito
  `prisma migrate deploy`.

Build local das imagens:

```bash
pnpm docker:build:web
pnpm docker:build:worker
pnpm docker:build
```

Build via Compose de producao:

```bash
pnpm docker:production:build
```

As imagens usam Node 20 Debian slim com OpenSSL instalado, pnpm 9.12.0 via
Corepack, lockfile congelado, Prisma Client gerado no build e utilizador nao-root
no runtime. `.env`, `.env.*`, `.git`, `node_modules`, caches, testes, logs,
uploads locais e backups sao excluidos pelo `.dockerignore`.

## 9. Variaveis de ambiente obrigatorias

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

`APP_URL` e `AUTH_URL` devem ser HTTPS e publicos em producao real. `localhost`
so e permitido em staging/local quando `ALLOW_LOCALHOST_RUNTIME_URLS=1` estiver
definido explicitamente.

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

Nunca usar credenciais demo, `.env` local, seed de demonstracao ou connection
strings privadas em documentacao, commits ou imagem.

## 10. Migrations e arranque

As migrations nao correm automaticamente no arranque de `web` ou `worker`.
Executar de forma explicita antes de subir a nova versao:

```bash
docker compose -f docker-compose.production.yml --profile migration run --rm migrate
```

O seed de demonstracao nunca deve ser executado em producao.

Antes de migrations em ambiente real, fazer backup da base de dados e verificar
que o ficheiro existe fora do Git. Rollback de imagem nao reverte a base de
dados; se uma migration aplicada deixar a app incompatível, decidir
explicitamente entre corrigir a app ou restaurar o backup. Restore e destrutivo
e exige aprovacao operacional.

Runbook de backup, restore, rollback de imagem e rollback pos-migration:
[`docs/BACKUP_RESTORE.md`](BACKUP_RESTORE.md).

## 11. Publicacao (deploy futuro)

```bash
git pull
pnpm docker:production:build
docker compose -f docker-compose.production.yml --profile migration run --rm migrate
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
```

Checklist de seguranca antes de piloto:

```bash
pnpm test:integration:security:production-hardening
curl -I https://erp.exemplo.co.mz/login
curl -i https://erp.exemplo.co.mz/api/health
```

Confirmar headers HTTP, health sem secrets, logs sem tokens/passwords, sem CORS
wildcard, migrations executadas apenas pelo servico `migrate` e backup criado
antes de qualquer migration real.
