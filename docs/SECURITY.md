# SECURITY - ANTS ERP

_Ultima actualizacao: 2026-07-04_

Este documento regista o hardening operacional ate a P0-08. Nao colocar
segredos reais, connection strings privadas, tokens ou conteudo de `.env` neste
ficheiro.

## 1. Autenticacao e sessao

- Auth.js v5 com provider Credentials e sessoes JWT de 8 horas.
- Passwords guardadas com Argon2 (`@node-rs/argon2`).
- Login bloqueia contas por tentativas falhadas no dominio
  (`failedLoginCount` + `lockedUntil`).
- P0-05: quando o email tem varias empresas activas, a empresa operacional e
  escolhida explicitamente e validada no servidor contra sessao, membership e
  empresa activa.
- P0-08: cookies seguros sao activados em `NODE_ENV=production`
  (`useSecureCookies`), e a configuracao de runtime valida `AUTH_URL`,
  `APP_URL` e `AUTH_SECRET` antes de servir a app.
- Logout usa `signOut`; o JWT anterior deixa de preservar a empresa activa.
- Limitacao: revogacao completa de sessoes antigas ainda nao foi implementada,
  porque exige desenho/modelo proprio. O `RequestContext` continua a revalidar a
  empresa activa antes de executar operacoes protegidas.

## 2. Variaveis de ambiente e segredos

Em producao real, a app recusa:

- `AUTH_SECRET` ausente, curto, obvio ou com placeholders;
- `APP_URL`/`AUTH_URL` ausentes, mal formatados, `localhost` ou sem HTTPS;
- `DATABASE_URL` ausente ou sem formato PostgreSQL;
- `REDIS_URL` ausente ou sem formato Redis;
- valores com placeholders como `change_me`, `replace_with`, `example` ou
  credenciais demo.

Staging local corre com `NODE_ENV=production` para reproduzir runtime, mas pode
usar `http://localhost` apenas quando `ALLOW_LOCALHOST_RUNTIME_URLS=1` estiver
definido explicitamente.

Nunca commitar `.env`, `.env.local`, `.env.staging`, dumps, backups, passwords
reais, tokens ou connection strings privadas. `.env.example` e
`.env.staging.example` podem conter apenas placeholders seguros.

## 3. Headers HTTP

A P0-08 adiciona headers globais no middleware do Next, validos tambem em
staging local:

- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `X-Frame-Options: SAMEORIGIN`;
- `Permissions-Policy` restritiva.

`Strict-Transport-Security` e emitido apenas em runtime de producao quando o
pedido chega por HTTPS, `x-forwarded-proto=https`, ou `APP_URL` usa `https://`.

CSP completa fica pendente para uma fase futura, para nao quebrar scripts,
styles e Auth.js sem uma revisao dedicada.

## 4. CORS e origem

Nao ha CORS amplo na app. Os endpoints operam same-origin nesta fase. Nao usar
`Access-Control-Allow-Origin: *` em endpoints autenticados. Se CORS for
necessario no futuro, deve ser restrito por lista de origins configurada em env
e testado explicitamente.

## 5. Rate limit

A P0-08 adiciona rate limit em memoria, por processo:

- login: 10 tentativas por email normalizado em 15 minutos;
- seleccao/troca de empresa: 20 tentativas por utilizador em 5 minutos.

As chaves sao derivadas por hash e nao guardam email em claro. Este controlo e
real para o runtime single-container actual, mas nao substitui rate limit
centralizado em Redis ou na borda quando houver multiplas instancias.

## 6. Logs

- Auditoria e logs nunca devem guardar passwords, tokens, cookies ou segredos.
- O worker redige chaves sensiveis (`password`, `secret`, `token`, `cookie`,
  `authorization`, `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`) antes de imprimir
  payloads de jobs.
- Scripts operacionais nao devem imprimir connection strings nem passwords.

## 7. Health endpoint

`/api/health` e liveness simples:

```json
{"status":"ok","service":"ants-erp-web"}
```

Nao retorna envs, secrets, dados de empresa, versoes internas, DB, Redis ou
detalhes sensiveis. Readiness continua a exigir checks operacionais separados:
Compose `ps`, Postgres/Redis saudaveis, `/login`, `/seleccionar-empresa` e
logs sem erros.

## 8. Docker e operacao

- Web e worker correm como utilizador nao-root nas imagens.
- `.dockerignore` exclui `.env`, `.env.*`, backups, dumps, caches, logs e
  uploads locais.
- Web e worker nao executam migrations no arranque.
- Migrations correm apenas pelo servico `migrate`.
- Seed demo e proibido em `production`.
- Postgres e Redis nao publicam portas no Compose de producao/staging.

## 9. Checklist pre-piloto

- `.env` de producao criado fora do Git, sem placeholders.
- `APP_URL` e `AUTH_URL` publicos em HTTPS.
- `AUTH_SECRET` forte e unico por ambiente.
- `DATABASE_URL` e `REDIS_URL` apontam para servicos internos correctos.
- `pnpm test:integration:security:production-hardening` verde.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build` verdes.
- `/api/health` sem secrets.
- `curl -I /login` mostra headers esperados.
- Sem CORS wildcard em endpoints autenticados.
- Logs de web/worker sem secrets.
- Backup criado antes de migrations em ambiente real.

## 10. Pendentes aceites apos P0-08

- CSP completa.
- Rate limit centralizado em Redis/borda para multiplas instancias.
- Revogacao completa de sessoes persistidas.
- RLS transversal em toda a base de dados.
- Observabilidade/dashboard operacional.
