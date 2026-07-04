# Roteiro comercial de testes UAT - ANTS ERP

_Ultima actualizacao: 2026-07-05_

Executar este roteiro com dados ficticios e ambiente identificado. Registar o
resultado de cada passo como `Aprovado`, `Reprovado`, `Bloqueado` ou `Nao
executado`.

## 1. Pre-UAT tecnico

1. Confirmar branch, commit e working tree limpa.
2. Subir staging.
3. Executar migrations manuais pelo servico `migrate`.
4. Verificar `pnpm docker:staging:ps`.
5. Verificar `curl -i http://localhost:3001/api/health`.
6. Verificar `curl -i http://localhost:3001/login`.
7. Verificar `curl -i http://localhost:3001/seleccionar-empresa`.
8. Criar backup pre-UAT com `pnpm ops:staging:backup`.
9. Confirmar que logs de web/worker nao mostram secrets, tokens ou connection
   strings.
10. Confirmar que `.env`, `.env.staging`, dumps e backups nao estao no Git.

## 2. Fluxo Auth/Multiempresa

1. Aceder a rota protegida sem sessao e confirmar redireccionamento para login.
2. Fazer login com utilizador sem empresa activa e confirmar bloqueio
   operacional claro.
3. Fazer login com utilizador com uma empresa activa e confirmar entrada directa.
4. Fazer login com utilizador com varias empresas activas e confirmar
   redireccionamento para `/seleccionar-empresa`.
5. Seleccionar empresa autorizada e confirmar entrada no ERP.
6. Trocar de empresa quando aplicavel.
7. Tentar activar empresa nao autorizada por URL/formulario/payload manipulado.
8. Confirmar que o servidor rejeita a tentativa e que `RequestContext` continua
   derivado da sessao.

## 3. Fluxo financeiro basico

Dados ficticios sugeridos:

- Cliente: `Cliente UAT Maputo, Lda.`
- Produto: `Produto UAT 01`
- Conta: `Caixa UAT`

Passos:

1. Criar ou seleccionar cliente ficticio.
2. Confirmar saldo inicial do cliente.
3. Criar factura simples com produto em stock.
4. Confirmar numero, linhas, totais, estado e baixa de stock.
5. Registar recebimento em conta de tesouraria.
6. Confirmar impacto em saldo do cliente e estado da factura.
7. Confirmar movimento de tesouraria.
8. Confirmar lancamento contabilistico se aplicavel ao ecran/evidencia
   disponivel.
9. Anular recebimento com motivo e data em periodo aberto.
10. Confirmar recibo `ANULADO`, saldo restaurado e movimento compensatorio.
11. Cancelar factura quando permitido.
12. Confirmar factura `CANCELADA`, stock reposto, saldo ajustado, auditoria e
    lancamento inverso.

## 4. Fluxo compras/fornecedores

Dados ficticios sugeridos:

- Fornecedor: `Fornecedor UAT Beira, Lda.`
- Produto: `Materia-prima UAT 01`
- Conta: `Banco UAT`

Passos:

1. Criar ou seleccionar fornecedor ficticio.
2. Criar ordem de compra com linhas e custo.
3. Receber mercadoria parcial ou total, se disponivel.
4. Confirmar entrada de stock e custo medio quando aplicavel.
5. Registar pagamento a fornecedor em conta de tesouraria.
6. Confirmar impacto no fornecedor e na ordem.
7. Confirmar movimento de tesouraria.
8. Estornar pagamento com motivo e data em periodo aberto.
9. Confirmar pagamento `ESTORNADO`, saldo restaurado e movimento compensatorio.
10. Estornar recepcao quando permitido.
11. Confirmar recepcao `ESTORNADA`, stock retirado, ordem recalculada e
    auditoria.

## 5. Fluxo tesouraria

1. Ver contas de tesouraria.
2. Criar conta ficticia se o perfil tiver permissao.
3. Registar movimento manual elegivel.
4. Criar transferencia entre duas contas.
5. Confirmar duas pernas com o mesmo `transferId`.
6. Confirmar saldos de origem e destino.
7. Reverter transferencia pelo fluxo atomico.
8. Confirmar duas pernas originais `ESTORNADA`.
9. Confirmar dois movimentos compensatorios.
10. Confirmar que nao foi permitido estornar uma perna isolada.

## 6. Fluxo backup/restore

1. Confirmar backup antes da UAT.
2. Registar nome do ficheiro, timestamp e tamanho plausivel.
3. Nao executar restore durante sessao comercial sem autorizacao explicita.
4. Explicar ao participante que restore e destrutivo.
5. Confirmar que `docs/BACKUP_RESTORE.md` existe e cobre restore/rollback.
6. Confirmar que restore foi ensaiado anteriormente em staging/local.

## 7. Fluxo seguranca

1. Confirmar `/api/health` sem secrets, envs, dados de empresa ou detalhes
   internos.
2. Confirmar headers basicos em `/login`.
3. Confirmar rate limit em login/seleccao quando aplicavel ao ensaio.
4. Confirmar logs sem passwords, tokens, cookies ou connection strings.
5. Confirmar que staging validado nao usa placeholders inseguros em runtime.
6. Confirmar ausencia de CORS wildcard em endpoints autenticados.
7. Confirmar que dados reais nao foram introduzidos.

## 8. Evidencias a recolher

- Data e hora da sessao.
- Ambiente e URL.
- Branch e commit.
- Participantes e papeis.
- Empresa ficticia usada.
- Resultado por cenario.
- Defeitos encontrados e severidade.
- Screenshots opcionais sem segredos nem dados reais.
- Nome/timestamp do backup pre-UAT.
- Decisao final e assinatura.
