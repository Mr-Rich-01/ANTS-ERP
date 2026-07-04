# SETUP.md — Preparar o ANTS ERP

Guia independente do agente para preparar o projecto do zero em ambiente local.
Não coloque segredos reais neste ficheiro.

## Pré-requisitos

- Git.
- Node.js `>=20.0.0`; recomenda-se Node 20 LTS ou superior compatível.
- pnpm `9.12.0` via Corepack.
- Docker Desktop ou Docker Engine com Docker Compose.
- PostgreSQL e Redis são executados através do Docker Compose do projecto.

## Configuração

Clonar e entrar no repositório:

```bash
git clone <URL_DO_REPOSITORIO>
cd <PASTA_DO_REPOSITORIO>
```

Preparar pnpm e instalar dependências:

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
```

Criar `.env` na raiz a partir do exemplo versionado:

```bash
cp .env.example .env
```

O projecto também usa `apps/web/.env.local` para o runtime do Next.js. Criar o
ficheiro com os mesmos nomes necessários para a app web, sem valores secretos
reais.

Variáveis confirmadas em `.env.example` e no código:

```env
NODE_ENV=development
APP_URL=http://localhost:3000
AUTH_URL=http://localhost:3000
AUTH_SECRET=CHANGE_ME
POSTGRES_USER=USER
POSTGRES_PASSWORD=PASSWORD
POSTGRES_DB=DATABASE
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
REDIS_URL=redis://HOST:PORT
DEFAULT_LOCALE=pt-MZ
DEFAULT_CURRENCY=MZN
DEFAULT_TIMEZONE=Africa/Maputo
DOMAIN=erp.example.test
BUILD_STANDALONE=
PORT=3000
```

Há nomes reservados para fases futuras ou deploy (`STORAGE_*`, `SMTP_*`).
Preencher apenas quando a funcionalidade ou o ambiente exigir.

## Base de Dados

Subir PostgreSQL e Redis:

```bash
pnpm docker:dev
```

Verificar containers:

```bash
docker compose ps
```

Gerar Prisma Client:

```bash
pnpm db:generate
```

Aplicar migrations em desenvolvimento:

```bash
pnpm db:migrate
```

### Desenvolvimento

Executar o seed de demonstração apenas em ambiente local/de desenvolvimento:

```bash
pnpm db:seed
```

Este seed cria dados fictícios: `demo-company`, filiais Maputo/Matola,
perfis, utilizadores demo, clientes, fornecedores, produtos, stock, tesouraria
e base contabilística.

Credenciais locais versionadas para desenvolvimento:

| Utilizador | Password | Papel |
|------------|----------|-------|
| `admin@ants.co.mz` | `Admin@123` | Administrador da empresa demo |
| `superadmin@ants.co.mz` | `Admin@123` | Super Admin da plataforma |
| `maria@ants.co.mz`, `joao@ants.co.mz`, `ana@ants.co.mz`, `carlos@ants.co.mz`, `lucia@ants.co.mz` | `Demo@123` | Utilizadores demo |

Estas credenciais são exclusivamente locais e nunca devem ser usadas com
clientes reais.

Confirmar estado das migrations:

```bash
pnpm --filter @ants/database exec prisma migrate status
```

Depois de executar um seed que introduza novas permissões, terminar a sessão e
voltar a entrar para que a sessão obtenha as permissões actualizadas.

### Login multiempresa

O login não escolhe uma empresa de forma implícita quando o mesmo email tem
acesso activo a mais de uma empresa. O comportamento esperado é:

- uma empresa activa: entrada directa no ERP;
- várias empresas activas: redireccionamento para `/seleccionar-empresa`;
- nenhuma empresa activa: bloqueio do ERP operacional com mensagem para
  contactar o administrador.

A empresa activa é guardada apenas na sessão validada pelo servidor. URLs,
formulários, localStorage ou payloads manipulados não são fonte de verdade para
`companyId`; qualquer escolha é revalidada contra a conta autenticada e a empresa
activa antes de actualizar o contexto.

### Produção

Em produção, o seed de demonstração é proibido:

```bash
pnpm db:seed
```

O comando aborta antes de criar o Prisma Client ou escrever dados. Não deve
criar `demo-company`, utilizadores demo, produtos demo, fornecedores demo, stock
demo ou dados financeiros demo.

Para clientes reais, usar apenas um fluxo oficial de provisionamento separado,
explícito e auditável, que receba a empresa real como entrada, respeite
`companyId`, não use passwords fixas conhecidas e crie os catálogos/mappings
obrigatórios de forma idempotente. No estado actual deste repositório, ainda não
há um comando CLI completo de provisionamento de produção; essa lacuna deve ser
fechada antes de onboarding real.

Nunca copiar `.env` de desenvolvimento para produção e nunca usar utilizadores
demo em produção.

## Arranque

Iniciar em modo de desenvolvimento:

```bash
pnpm dev
```

A app web corre em `http://localhost:3000`. O script da web é
`next dev -p 3000`; se a porta 3000 estiver ocupada, parar o processo que a usa
ou ajustar temporariamente o comando da app web para outra porta durante a
sessão local.

Parar o servidor de desenvolvimento com `Ctrl+C` no terminal onde `pnpm dev`
está a correr.

## Testes e Validação

Typecheck:

```bash
pnpm typecheck
```

Lint:

```bash
pnpm lint
```

Testes unitários:

```bash
pnpm test
```

Testes contabilísticos agregados:

```bash
pnpm test:integration:accounting
```

Este comando executa as suites contabilísticas de integração existentes,
incluindo as suites 8b, 8c.1, 8c.2a, 8c.2b, 8c.3 e reversões P0-03.

Testes contabilísticos da 8c.1:

```bash
pnpm test:integration:accounting:c1
```

Testes contabilísticos da 8c.2a:

```bash
pnpm test:integration:accounting:c2a
```

Testes contabilísticos da 8c.2b:

```bash
pnpm test:integration:accounting:c2
```

Testes contabilísticos da 8c.3:

```bash
pnpm test:integration:accounting:c3
```

Testes da anulação ponta a ponta de recebimento de cliente (P0-03b):

```bash
pnpm test:integration:accounting:reversal:customer-payment
```

Testes do cancelamento ponta a ponta de factura (P0-03a):

```bash
pnpm test:integration:accounting:reversal:invoice
```

Testes do estorno ponta a ponta de pagamento a fornecedor (P0-03c):

```bash
pnpm test:integration:accounting:reversal:supplier-payment
```

Testes do estorno ponta a ponta de recepção de compra (P0-03d):

```bash
pnpm test:integration:accounting:reversal:purchase-receipt
```

Testes do estorno atómico de transferência entre contas (P0-03e):

```bash
pnpm test:integration:accounting:reversal:treasury-transfer
```

Testes integrados UAT dos estornos (P0-03f):

```bash
pnpm test:integration:accounting:reversal:uat
```

Agregado de todas as suites de reversões:

```bash
pnpm test:integration:accounting:reversal:all
```

Teste dedicado de login/contexto multiempresa:

```bash
pnpm test:integration:auth:company-selection
```

Build:

```bash
pnpm build
```

## Build de Produção

O build foi classificado em 2026-06-30 e passou no Windows nativo após
instalação limpa, e em Docker Linux com Node 20, pnpm 9.12.0 e OpenSSL
instalado. Ver [`docs/BUILD_INVESTIGATION.md`](docs/BUILD_INVESTIGATION.md).

Para um ambiente Linux/Docker reproduzível, garantir:

- imagem oficial Node 20 baseada em Debian;
- Corepack com `pnpm@9.12.0`;
- OpenSSL/libssl instalado antes de instalar dependências e gerar Prisma;
- `pnpm install --frozen-lockfile`;
- `pnpm db:generate`;
- `pnpm build`.

`node:20-bookworm-slim` sem OpenSSL não deve ser usado como base final: o build
pode terminar com exit code 0, mas o Prisma regista erros de engine/libssl
durante a recolha de dados ou em runtime.

### Imagens Docker de produção

A P0-04 fornece Dockerfiles multi-stage para web e worker:

```bash
pnpm docker:build:web
pnpm docker:build:worker
pnpm docker:build
pnpm docker:production:build
```

As imagens não copiam `.env`, não executam seed e não aplicam migrations no arranque.
Para produção, executar migrations explicitamente:

```bash
docker compose -f docker-compose.production.yml --profile migration run --rm migrate
```

## Staging Docker

A P0-06 adiciona um ambiente de staging local e reproduzivel, sem deploy real e
sem seed demo automatico:

```bash
cp .env.staging.example .env.staging
pnpm docker:staging:build
pnpm docker:staging:migrate
pnpm docker:staging:up
pnpm docker:staging:ps
```

Health/smoke basico:

```bash
curl http://localhost:3001/api/health
```

`/api/health` e liveness da web. Para readiness, confirmar tambem `pnpm docker:staging:ps`,
`/login`, `/seleccionar-empresa` e logs de web/worker.

Runbook completo: [`docs/STAGING.md`](docs/STAGING.md).

### Backup/restore staging

Criar backup manual da base de staging:

```bash
pnpm ops:staging:backup
```

Restaurar backup em staging/local e destrutivo e exige confirmacao explicita:

```bash
CONFIRM_RESTORE=I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA pnpm ops:staging:restore -- backups/staging/ants-erp-staging-YYYYMMDD-HHMMSS.dump
```

PowerShell:

```powershell
$env:CONFIRM_RESTORE="I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA"
pnpm ops:staging:restore -- backups/staging/ants-erp-staging-YYYYMMDD-HHMMSS.dump
Remove-Item Env:\CONFIRM_RESTORE
```

Runbook completo: [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md).
