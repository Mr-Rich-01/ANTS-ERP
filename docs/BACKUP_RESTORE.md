# Backup, Restore e Rollback - ANTS ERP

_Ultima actualizacao: 2026-07-04_

Este runbook define a base operacional da P0-07 para backup manual, restore em
staging/local e rollback operacional. Esta fase nao executa deploy real, nao
configura storage remoto e nao cria backup automatico.

## 1. Visao geral

Backup protege dados. Rollback de imagem Docker volta a versao da aplicacao,
mas nao volta automaticamente a base de dados. Restore substitui dados do
destino e deve ser tratado como operacao destrutiva.

Use staging/local para ensaiar restore antes de qualquer ambiente com dados que
precisem de preservacao. Producao real ainda exige politica de retencao,
encriptacao, storage seguro, controlo de acesso e testes periodicos numa fase
posterior.

## 2. Pre-requisitos

- Docker e Docker Compose.
- `.env.staging` criado a partir de `.env.staging.example`.
- Staging com `postgres` saudavel.
- Acesso ao servico Postgres dentro do Compose.
- Permissoes operacionais para executar `docker compose`, `pg_dump` e
  `pg_restore`.
- Nenhum dado real sem autorizacao explicita.

## 3. Backup staging

Comando:

```bash
pnpm ops:staging:backup
```

Equivalente:

```bash
node scripts/ops/staging-backup-db.mjs
```

Em ambientes Docker/Linux com `sh` disponivel, tambem existe:

```bash
sh scripts/ops/staging-backup-db.sh
```

Os scripts usam:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T postgres pg_dump
```

O ficheiro e criado em:

```text
backups/staging/ants-erp-staging-YYYYMMDD-HHMMSS.dump
```

O nome do ficheiro contem apenas ambiente e timestamp, sem credenciais. Para
listar backups:

```bash
ls -lh backups/staging
```

Para verificar tamanho de um backup especifico:

```bash
ls -lh backups/staging/ants-erp-staging-YYYYMMDD-HHMMSS.dump
```

`backups/`, `*.dump`, `*.backup` e `*.sql.gz` estao ignorados pelo Git. Nunca
commitar dumps, mesmo quando forem apenas de staging.

## 4. Restore staging

Restore e destrutivo: substitui a base de dados de destino. Antes de restaurar,
crie um backup do destino sempre que os dados actuais possam ser relevantes.

Comando:

```bash
CONFIRM_RESTORE=I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA pnpm ops:staging:restore -- backups/staging/ants-erp-staging-YYYYMMDD-HHMMSS.dump
```

PowerShell:

```powershell
$env:CONFIRM_RESTORE="I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA"
pnpm ops:staging:restore -- backups/staging/ants-erp-staging-YYYYMMDD-HHMMSS.dump
Remove-Item Env:\CONFIRM_RESTORE
```

Equivalente com Node:

```bash
CONFIRM_RESTORE=I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA node scripts/ops/staging-restore-db.mjs backups/staging/ants-erp-staging-YYYYMMDD-HHMMSS.dump
```

Em ambientes Docker/Linux com `sh` disponivel, tambem existe:

```bash
CONFIRM_RESTORE=I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA sh scripts/ops/staging-restore-db.sh backups/staging/ants-erp-staging-YYYYMMDD-HHMMSS.dump
```

O script:

- aceita apenas `RESTORE_TARGET_ENV=staging` ou `RESTORE_TARGET_ENV=local`;
- recusa `RESTORE_TARGET_ENV=production`;
- exige `CONFIRM_RESTORE`;
- sobe `postgres` se necessario;
- para `web` e `worker` para evitar ligacoes activas;
- recria a base definida por `POSTGRES_DB`;
- executa `pg_restore` no formato custom do `pg_dump`.

Depois do restore, se houver migrations pendentes, executar:

```bash
pnpm docker:staging:migrate
```

Subir e validar:

```bash
pnpm docker:staging:up
pnpm docker:staging:ps
curl -i http://localhost:3001/api/health
curl -i http://localhost:3001/login
curl -i http://localhost:3001/seleccionar-empresa
```

## 5. Ensaio de restore

Checklist minimo:

1. Subir staging com `pnpm docker:staging:up`.
2. Executar migrations explicitas com `pnpm docker:staging:migrate` quando aplicavel.
3. Criar backup com `pnpm ops:staging:backup`.
4. Parar `web`/`worker` se o restore for manual.
5. Restaurar o backup num destino staging/local controlado.
6. Subir `web`/`worker`.
7. Verificar `/api/health`.
8. Verificar `/login`.
9. Verificar `/seleccionar-empresa`.
10. Executar smoke financeiro minimo com dados ficticios/autorizados.
11. Guardar evidencia: comandos, timestamps, resultado e hash/nome do ficheiro.

## 6. Rollback de imagem

Rollback de imagem e usado quando a aplicacao nova falha e a base de dados
continua compativel com a versao anterior.

Procedimento:

1. Identificar a imagem actual:

```bash
docker compose -f docker-compose.production.yml images
```

2. Identificar a tag anterior aprovada no registry ou no host.
3. Alterar o Compose/env de deploy para apontar a tag anterior.
4. Parar os servicos da aplicacao:

```bash
docker compose -f docker-compose.production.yml stop web worker
```

5. Subir a imagem anterior:

```bash
docker compose -f docker-compose.production.yml up -d web worker
```

6. Validar health, login, selector de empresa e logs:

```bash
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=100 web worker
```

Rollback de imagem nao reverte dados. Se houve migration incompatível ou dados
alterados pela versao nova, seguir o runbook de restore com aprovacao explicita.

## 7. Rollback pos-migration

Antes de qualquer migration em ambiente real:

1. Criar backup.
2. Confirmar que o backup existe, tem tamanho plausivel e esta fora do Git.
3. Executar migrations apenas pelo servico `migrate`.
4. Validar health, login, selector de empresa e smoke relevante.

Se a migration falhar antes de aplicar, parar, corrigir e repetir o procedimento.
Se a migration aplicar e a app falhar, decidir explicitamente entre corrigir a app
em frente ou restaurar o backup. Restore so deve acontecer com aprovacao clara,
porque substitui dados do destino.

Nunca editar tabelas manualmente sem plano aprovado, evidencia e rollback
definido.

## 8. Seguranca

- Backups podem conter dados sensiveis.
- Nao enviar backups por WhatsApp, email ou canais sem encriptacao.
- Nao commitar backups.
- Nao guardar backups em pasta publica.
- Restringir acesso aos ficheiros.
- Apagar backups temporarios quando ja nao forem necessarios.
- Nao imprimir connection strings, passwords ou tokens em logs.
- Producao real precisa de retencao, storage seguro, encriptacao e testes
  periodicos numa fase posterior.

## 9. Limitacoes P0-07

- Sem backup automatico.
- Sem storage remoto.
- Sem encriptacao automatica.
- Sem rotacao automatica.
- Sem restore de producao real.
- Sem CI/CD.
- Sem observabilidade avancada.
- Sem alteracao de schema, migrations, regras financeiras, reversoes ou auth.
