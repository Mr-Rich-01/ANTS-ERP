# Build investigation - 2026-06-30

Investigacao isolada para estabilizar ou classificar formalmente o build de
producao do ANTS ERP. Esta tarefa nao altera codigo funcional, regras
contabilisticas, migrations, seeds ou a fase 8c.2b.

## Resultado

O build de producao esta verde no estado actual do repositorio.

O erro historico `useContext null` durante prerender nao foi reproduzido nesta
investigacao, nem no Windows nativo nem em Linux/Docker. Nao foi aplicada
correcao de codigo React/Next, alias de React, hoisting, `force-dynamic` global
ou qualquer workaround para esconder erro.

Classificacao honesta: o problema historico fica como nao reproduzido no HEAD
`89f2219` em 2026-06-30. A causa-raiz antiga permanece inconclusiva porque a
falha ja nao ocorre com instalacao limpa e build real.

## Estado inicial

| Item | Resultado |
| --- | --- |
| Branch inicial | `main` |
| Branch de trabalho | `fix/production-build` |
| HEAD inicial | `89f2219` |
| Commit base funcional | `acef72b` presente no historico |
| Commit documental posterior | `89f2219 docs: prepare project handoff to Codex` |
| Arvore inicial | limpa |
| Stash | nenhuma |
| Fase 8c.2b | nao iniciada |

## Leituras obrigatorias

Foram lidos integralmente:

- `AGENTS.md`
- `CLAUDE.md`
- `MODULE_STATUS.md`
- `SETUP.md`

Confirmacoes:

- A fase funcional actual continua a ser 8c.2a, idempotencia operacional.
- A proxima fase continua a ser 8c.2b, integracao contabilistica de factura e
  recibo.
- Esta investigacao nao altera regras contabilisticas.
- Qualquer commit desta tarefa deve ser isolado.
- O problema historico de build era documentado como anterior as fases recentes.

Foi encontrada uma divergencia documental: `CLAUDE.md` pede commits em
portugues com footer `Co-Authored-By: Claude Opus 4.8`; a tarefa isolada pede
mensagens exactas `fix(build): restore production build` ou
`docs(build): classify production build failure`.

## Ambientes testados

| Ambiente | Node | pnpm | Next | Instalacao | Build |
| --- | ---: | ---: | ---: | --- | --- |
| Windows nativo | 22.18.0 | 9.12.0 | 14.2.35 | frozen lockfile | passou |
| Docker Linux, Node slim sem OpenSSL | 20.20.2 | 9.12.0 | 14.2.35 | frozen lockfile | passou com erros Prisma/libssl durante page data |
| Docker Linux, Node slim + OpenSSL | 20.20.2 | 9.12.0 | 14.2.35 | frozen lockfile | passou |
| WSL2 Ubuntu | indisponivel | indisponivel | n/a | nao testado | nao testado |

WSL2 existe, mas a distribuicao Ubuntu nao tem Node nem pnpm instalados. Nada
foi instalado no WSL.

## Comandos e resultados principais

Windows nativo:

- `node --version`: `v22.18.0`
- `pnpm --version`: `9.12.0`
- `pnpm --filter @ants/web exec next info`: Windows 10 Pro, Next `14.2.35`,
  React `18.3.1`, React DOM `18.3.1`, TypeScript `5.9.3`
- `pnpm --filter @ants/web list next react react-dom next-auth --depth 2`:
  React e React DOM alinhados em `18.3.1`; NextAuth `5.0.0-beta.31`; Next
  `14.2.35`
- `pnpm build`: passou
- Instalacao limpa controlada:
  - removidos `node_modules` e `apps/web/.next`
  - `pnpm install --frozen-lockfile`: passou
  - `pnpm db:generate`: passou
  - `pnpm --filter @ants/web build`: passou sem cache do Turbo, 28/28 paginas
    estaticas geradas

Docker/Linux:

- Primeiro teste com `node:20-bookworm-slim`:
  - `pnpm install --frozen-lockfile`: passou
  - `pnpm db:generate`: passou com aviso de OpenSSL/libssl
  - `pnpm build`: exit code 0, mas a recolha de dados registou erros
    `PrismaClientInitializationError` por falta de `libssl.so.1.1`
- Segundo teste com `node:20-bookworm-slim` + `openssl` + `ca-certificates`:
  - `node --version`: `v20.20.2`
  - `pnpm --version`: `9.12.0`
  - `openssl version`: `OpenSSL 3.0.20`
  - `pnpm install --frozen-lockfile`: passou
  - `pnpm db:generate`: passou sem erro de libssl
  - `pnpm build`: passou com cache miss real
  - `pnpm --filter @ants/web start`: arrancou
  - `GET /login`: 200
  - `GET /_not-found`: 404
  - `GET /admin`: 307
  - `GET /api/auth/session`: 200

## Sintoma historico

Sintoma documentado antes desta tarefa:

- `next build` falhava durante prerender com `useContext null`.
- Era referido como ocorrendo inclusive em `/_not-found`.
- Era referido como anterior as fases recentes.

Sintoma observado nesta tarefa:

- Nenhuma excepcao `useContext null`.
- `/_not-found` foi prerenderizado com sucesso no build.
- A fase de geracao estatica concluiu 28/28 paginas.

## Configuracao verificada

- Next efectivo: `14.2.35`
- React efectivo: `18.3.1`
- React DOM efectivo: `18.3.1`
- React e React DOM estao alinhados.
- `transpilePackages`: `@ants/ui`, `@ants/shared`, `@ants/domain`,
  `@ants/database`
- Prisma e Argon2 estao externalizados no servidor via `next.config.mjs`.
- Ha funcao Webpack personalizada apenas para externalizar `@node-rs/argon2`.
- Nao ha `resolve.alias`.
- Nao ha configuracao Babel.
- `.npmrc` contem `shamefully-hoist=false`.
- Nao ha `public-hoist-pattern`.
- `force-dynamic` existe em varias paginas ERP, mas nao foi introduzido nesta
  tarefa e nao foi usado como workaround global.
- `packages/ui` e o unico pacote interno com peer/dev dependency de React.
- `packages/domain`, `packages/database` e `packages/shared` nao dependem de
  React.

## Hipoteses descartadas nesta investigacao

- Falha actual reproduzivel do build no Windows nativo: descartada.
- Falha actual reproduzivel do build em Linux/Docker com OpenSSL: descartada.
- React/React DOM desalinhados: descartada.
- Alias global de React activo: descartada.
- `public-hoist-pattern` activo: descartada.
- `shamefully-hoist=true` activo: descartada.
- Babel config a interferir no build: descartada.
- Workaround activo de `resolve.alias`: descartado.

## Hipoteses ainda abertas

- Causa exacta do antigo `useContext null`: inconclusiva, porque a falha nao foi
  reproduzida no estado actual apos instalacao limpa.
- Se a falha historica dependia de cache, estado parcial de `node_modules`,
  versao exacta de Node, ou outro estado da maquina: inconclusivo.
- Imagem final de producao da fase 12: ainda nao existe Dockerfile oficial de
  app no repositorio.

## Ambiente suportado de build

Ambiente oficialmente recomendado para build reproduzivel ate a fase de deploy:

- Linux/Docker com imagem oficial Node 20 Debian.
- `pnpm 9.12.0` via Corepack.
- `pnpm install --frozen-lockfile`.
- OpenSSL instalado antes de `pnpm install` e `pnpm db:generate`.
- `pnpm db:generate`.
- `pnpm build`.

Nota: `node:20-bookworm-slim` sem OpenSSL nao deve ser usado como base final
sem instalar `openssl`/`libssl`, porque o Prisma pode registar erros de engine
durante recolha de dados ou runtime.

## Validacoes executadas

- `pnpm --filter @ants/database exec prisma format --check`: passou
- `pnpm --filter @ants/database exec prisma validate`: passou
- `pnpm db:generate`: passou
- `pnpm typecheck`: passou, 6/6
- `pnpm lint`: passou, 6/6
- `pnpm test`: passou, 45/45 unitarios
- `pnpm test:integration:accounting`: passou, 80/80
- `pnpm test:integration:accounting:c1`: passou, 30/30
- `pnpm test:integration:accounting:c2a`: passou, 18/18
- `pnpm --filter @ants/web build`: passou sem cache do Turbo
- `pnpm build`: passou
- Docker Linux com OpenSSL: build passou e `next start` respondeu nos endpoints
  testados

## Workarounds proibidos

Continuam proibidos como solucao final:

- Alias global de `react` ou `react-dom`.
- `force-dynamic` aplicado indiscriminadamente para esconder prerender.
- `shamefully-hoist=true` sem prova.
- Ignorar erros no script de build.
- Alterar scripts para devolver exit code 0 artificialmente.
- Desactivar typecheck, lint, paginas, Auth.js ou funcionalidades.
- Trocar todas as paginas para client components.
- Downgrade de Next ou upgrade major fora de fase propria.

## Proximos passos

- Nao ha bloqueio de build para avancar tecnicamente.
- Antes da fase 12/deploy real, criar Dockerfiles oficiais para `apps/web` e
  `apps/worker` incluindo OpenSSL, Corepack/pnpm `9.12.0`, install frozen,
  Prisma generate e build.
- Se o erro `useContext null` reaparecer, trata-lo como regressao nova e anexar
  o log completo do primeiro erro real.
