# Checklist de prontidao de piloto - ANTS ERP

_Ultima actualizacao: 2026-07-05_

Usar esta checklist antes de qualquer piloto controlado. Um item em aberto deve
ser classificado como bloqueante, restricao aceite ou backlog futuro.

## 1. Codigo

- [ ] `main` limpa.
- [ ] Commit de referencia identificado.
- [ ] `pnpm typecheck` verde.
- [ ] `pnpm lint` verde.
- [ ] `pnpm test` verde.
- [ ] Testes de integracao relevantes verdes.
- [ ] `pnpm build` verde.
- [ ] Sem migrations pendentes.
- [ ] Sem branches locais soltas para a fase.
- [ ] Sem TODO critico em fluxo P0 vendido como pronto.

## 2. Ambiente

- [ ] Staging sobe sem erros relevantes.
- [ ] `web` healthy.
- [ ] `worker` running.
- [ ] `postgres` healthy.
- [ ] `redis` healthy.
- [ ] Migrations executadas manualmente pelo servico `migrate`.
- [ ] `.env` real nao versionado.
- [ ] `.env.staging` real nao versionado.
- [ ] `/api/health` responde HTTP 200.
- [ ] `/login` responde HTTP 200.
- [ ] `/seleccionar-empresa` responde sem erro 5xx.

## 3. Seguranca

- [ ] Validacao de env activa.
- [ ] Secrets fortes por ambiente.
- [ ] Sem placeholders em runtime.
- [ ] Cookies seguros em producao.
- [ ] Headers basicos activos.
- [ ] CORS seguro/same-origin.
- [ ] Logs redigidos.
- [ ] Health sem secrets.
- [ ] Backup criado antes de migration em ambiente real.
- [ ] Seed demo bloqueado em producao.
- [ ] Screenshots/evidencias sem segredos.

## 4. Dados

- [ ] Usar apenas dados ficticios.
- [ ] Empresa ficticia.
- [ ] Clientes ficticios.
- [ ] Fornecedores ficticios.
- [ ] Produtos ficticios.
- [ ] Contas de tesouraria ficticias.
- [ ] Nenhum dado real de cliente.
- [ ] Nenhum dado real bancario.
- [ ] Nenhuma password real em evidencias.

## 5. Operacao

- [ ] Backup pre-UAT feito.
- [ ] Restore testado anteriormente em staging/local.
- [ ] Rollback documentado.
- [ ] Responsavel tecnico definido.
- [ ] Responsavel comercial definido.
- [ ] Canal de suporte definido.
- [ ] Janela de teste definida.
- [ ] Criterios de entrada aceites.
- [ ] Criterios de saida aceites.
- [ ] Template de sign-off preparado.

## 6. Decisao

- [ ] Pronto para piloto.
- [ ] Pronto com restricoes.
- [ ] Nao pronto.

Notas da decisao:

```text
Data:
Commit:
Responsavel tecnico:
Responsavel comercial:
Restricoes:
Proximo passo:
```
