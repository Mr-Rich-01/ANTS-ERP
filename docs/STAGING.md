# Staging Docker - ANTS ERP

_Ultima actualizacao: 2026-07-04_

Este runbook valida uma release em Docker sem executar deploy real, UAT comercial,
seed demo automatico, CI/CD, Cloudflare ou VPS. O ambiente usa imagens de producao
em `NODE_ENV=production`, com Postgres e Redis internos ao Compose.

## Pre-requisitos

- Git com a branch de release pretendida limpa.
- Node.js `>=20.0.0` e pnpm `9.12.0` via Corepack para comandos do monorepo.
- Docker Desktop ou Docker Engine com Docker Compose.
- Porta local definida em `STAGING_WEB_PORT` livre; por omissao, `3001`.
- Nenhum segredo real ou dado real de cliente sem autorizacao explicita.

## Ficheiros

- `docker-compose.staging.yml`: web, worker, postgres, redis e migrator.
- `.env.staging.example`: template seguro para criar `.env.staging`.
- `apps/web/src/app/api/health/route.ts`: health endpoint minimo.

## Preparar env

```bash
cp .env.staging.example .env.staging
```

Editar `.env.staging` com valores exclusivos de staging:

- `APP_URL` e `AUTH_URL`, por exemplo `http://localhost:3001`;
- `AUTH_SECRET` forte;
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`;
- `DATABASE_URL` usando host Docker `postgres`;
- `REDIS_URL=redis://redis:6379`;
- `STAGING_WEB_PORT`, por exemplo `3001`.

Nao usar `.env` de desenvolvimento, credenciais demo em ambiente real, secrets
reais em ficheiros versionados ou seed automatico.

`.env.staging` e local, deve ficar ignorado pelo Git e nunca deve ser commitado.
`.env.staging.example` e o unico ficheiro versionado para este ambiente.

## Build

```bash
pnpm docker:staging:build
```

Equivalente:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml build
```

Confirmar imagens criadas:

```bash
docker image ls "ants-erp-staging-*"
```

Confirmar que `.env` e `.env.staging` nao entraram na imagem:

```bash
docker run --rm ants-erp-staging-web sh -lc "find /app -name '.env*' -print"
docker run --rm ants-erp-staging-worker sh -lc "find /app -name '.env*' -print"
```

O resultado esperado e vazio.

## Migrations

As migrations sao manuais e explicitas. Web e worker nao executam migrations no
arranque.

```bash
pnpm docker:staging:migrate
```

Equivalente:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile migration run --rm migrate
```

O seed demo nao e executado por nenhum comando de staging.

## Subir servicos

```bash
pnpm docker:staging:up
pnpm docker:staging:ps
```

O Compose sobe `postgres`, `redis`, `web` e `worker`. A web publica a porta local
definida por `STAGING_WEB_PORT` e usa `PORT=3000` dentro do container.

## Health e smoke basico

Verificar o health endpoint:

```bash
curl http://localhost:3001/api/health
```

Resposta esperada:

```json
{"status":"ok","service":"ants-erp-web"}
```

`/api/health` e um endpoint de liveness: confirma que o processo web esta vivo e
consegue responder HTTP 200. Nesta fase ele nao verifica DB nem Redis e nao deve
ser interpretado como readiness completa. Readiness significa confirmar tambem
que as dependencias estao saudaveis (`postgres`, `redis`) e que a app consegue
servir rotas reais como `/login` e `/seleccionar-empresa`.

Smoke minimo de infra:

- `pnpm docker:staging:ps` mostra `postgres` e `redis` saudaveis;
- `web` fica saudavel pelo healthcheck do Compose;
- `worker` esta em execucao; nesta fase e validado por status/logs, sem healthcheck falso;
- `/api/health` retorna HTTP 200;
- `/login` responde sem erro 5xx;
- `/seleccionar-empresa` responde sem erro 5xx;
- logs de `web` e `worker` nao mostram erro de migration pendente, Prisma engine ou Redis.

Smoke Auth P0-05:

- `/login` responde HTTP 200;
- `/seleccionar-empresa` responde sem erro 5xx;
- nao aceitar `companyId` de URL, formulario, localStorage, header ou payload como fonte de verdade;
- validar que a escolha de empresa continua server-side e ligada a sessao/membership activa antes de UAT.

Smoke Financeiro P0-03:

- nao executar seed demo automatico em staging;
- confirmar que `pnpm test:integration:accounting:reversal:all` passou antes de release;
- confirmar que `pnpm test:integration:accounting` passou antes de release;
- em smoke manual com dados autorizados, usar apenas fluxos operacionais de origem para estornos;
- nao editar lancamentos `POSTED` nem aplicar correccoes financeiras directas na base.

## Logs e operacao

```bash
pnpm docker:staging:logs
```

Para comandos directos:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml logs -f --tail=100 web worker
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
```

## Parar e limpar

Parar sem apagar volumes:

```bash
pnpm docker:staging:down
```

Apagar volumes de staging apenas quando a base de staging puder ser descartada:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down -v
```

## Rollback simples

Rollback completo de imagem fica fora da P0-06. Para uma validacao local falhada:

```bash
pnpm docker:staging:down
pnpm docker:staging:build
pnpm docker:staging:migrate
pnpm docker:staging:up
```

Se a base de staging puder ser descartada, recriar volumes com:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down -v
```

Nao usar este procedimento em dados reais sem plano aprovado de backup/restore.

## Seguranca

- Nao usar dados reais sem autorizacao explicita.
- Nao commitar `.env`, `.env.local`, `.env.staging` ou connection strings privadas.
- Nao imprimir secrets em logs, documentacao, screenshots ou commits.
- Postgres e Redis de staging nao publicam portas no Compose.
- Migrations sao explicitas; web/worker nao migram no arranque.
- Seed demo nao corre automaticamente.
- O worker e validado por processo/logs nesta fase, nao por healthcheck artificial.

## Checklist de validacao de release

- Branch de release validada e working tree limpa antes da execucao.
- `.env.staging` criado a partir de `.env.staging.example`, sem secrets versionados.
- `pnpm typecheck` verde.
- `pnpm lint` verde.
- `pnpm test` verde.
- `pnpm test:integration:accounting:reversal:all` verde quando a fase toca release contabilistica.
- `pnpm test:integration:auth:company-selection` verde quando a fase toca autenticacao/contexto.
- `pnpm build` verde.
- `pnpm docker:staging:build` verde.
- `docker image ls "ants-erp-staging-*"` mostra imagens web/worker/migrate quando aplicavel.
- `docker run --rm ants-erp-staging-web sh -lc "find /app -name '.env*' -print"` nao encontra envs.
- `pnpm docker:staging:migrate` executado manualmente e sem erros.
- `pnpm docker:staging:up` sobe web/worker/db/redis.
- `curl http://localhost:3001/api/health` retorna HTTP 200.
- `curl http://localhost:3001/login` retorna HTTP 200.
- `curl http://localhost:3001/seleccionar-empresa` nao retorna erro 5xx.
- `pnpm docker:staging:ps` nao mostra containers em restart loop.
- `pnpm docker:staging:logs` sem erros de arranque relevantes.

## Fora do escopo P0-06

Backup/restore automatizado, rollback completo de imagem, hardening completo de
headers/CORS/rate limit, RLS transversal, provisionamento de cliente real, UAT
comercial, deploy em VPS, Cloudflare e CI/CD ficam fora desta fase.

P0-07 fica reservado para definir e autorizar Backup/Restore/Rollback antes de
qualquer uso operacional com dados que precisem de preservacao.
