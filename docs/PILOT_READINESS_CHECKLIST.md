# Checklist de prontidao de piloto - ANTS ERP

_Ultima actualizacao: 2026-07-06_

Usar esta checklist antes de qualquer piloto controlado. Um item em aberto deve
ser classificado como bloqueante, restricao aceite ou backlog futuro.

## 1. Codigo

- [ ] `main` limpa.
- [ ] Commit de referencia identificado.
- [ ] `pnpm typecheck` verde.
- [ ] `pnpm lint` verde.
- [ ] `pnpm test` verde.
- [ ] Testes de integracao relevantes verdes.
- [ ] `pnpm test:integration:pos` verde quando POS entrar no escopo do piloto.
- [ ] `pnpm test:integration:reports` verde quando relatorios entrarem no escopo do piloto.
- [ ] Impressao/PDF comercial validado para factura, recibo, fecho de caixa e
      relatorio de vendas quando P1-03 entrar no escopo do piloto.
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
- [ ] Produtos ficticios com stock suficiente para POS, quando aplicavel.
- [ ] Contas de tesouraria ficticias.
- [ ] Conta de tesouraria activa e mapeada para recebimentos POS.
- [ ] Nenhum dado real de cliente.
- [ ] Nenhum dado real bancario.
- [ ] Nenhuma referencia bancaria real em documentos/PDFs de UAT sem aprovacao
      explicita.
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
- [ ] Limites do POS V1 aceites: sem mesas, cozinha, offline, devolucao POS,
      turnos/fecho de caixa, scanner real e impressao termica avancada.
- [ ] Limites dos relatorios V1 aceites: CSV simples e impressao/guardar PDF
      pelo navegador prontos; PDF fiscal/automatico, Excel avancado, salarios,
      producao, BI avancado e relatorios personalizados ficam futuros.
- [ ] Limites da impressao P1-03 aceites: sem assinatura digital/fiscal, sem
      integracao fiscal, sem envio automatico por email, sem impressao termica
      avancada e sem layouts personalizaveis.

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
