# Roteiro comercial de testes UAT - ANTS ERP

_Ultima actualizacao: 2026-07-07_

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
4.1. Clicar `Imprimir / Guardar PDF` na factura e confirmar cabecalho da empresa,
     NUIT, linhas, subtotal, IVA, total e rodape.
5. Registar recebimento em conta de tesouraria.
6. Confirmar impacto em saldo do cliente e estado da factura.
6.1. Abrir o recibo pela factura, clicar `Imprimir / Guardar PDF` e confirmar
     cliente, factura relacionada, metodo, conta de tesouraria e valor pago.
7. Confirmar movimento de tesouraria.
8. Confirmar lancamento contabilistico se aplicavel ao ecran/evidencia
   disponivel.
9. Anular recebimento com motivo e data em periodo aberto.
10. Confirmar recibo `ANULADO`, saldo restaurado e movimento compensatorio.
11. Cancelar factura quando permitido.
12. Confirmar factura `CANCELADA`, stock reposto, saldo ajustado, auditoria e
    lancamento inverso.

## 3A. Fluxo POS V1 limitado

Dados ficticios sugeridos:

- Cliente: `Cliente final` ou `Cliente UAT Maputo, Lda.`
- Produto: `Produto UAT POS 01`
- Conta: `Caixa UAT`
- Armazem: `Loja UAT`

Passos:

1. Abrir `/pos`.
2. Confirmar que produtos reais aparecem com nome, codigo, preco e stock.
3. Pesquisar produto por nome ou codigo.
4. Seleccionar armazem e confirmar que o carrinho inicia vazio.
5. Adicionar produto ao carrinho.
6. Aumentar e diminuir quantidade.
7. Confirmar subtotal, incidencia, IVA e total.
8. Seleccionar `Cliente final` ou cliente ficticio existente.
9. Seleccionar metodo de pagamento e conta de tesouraria.
10. Finalizar venda.
11. Confirmar mensagem de sucesso com numero de factura e recibo.
12. Abrir a factura pelo link apresentado.
13. Confirmar factura `PAGA`, recibo activo, baixa de stock, movimento de
    tesouraria, lancamentos contabilisticos e auditoria.
14. Actualizar a pagina e confirmar que nao houve duplicacao da venda.
15. Tentar vender quantidade superior ao stock e confirmar erro claro.

Limites aceites neste fluxo: sem mesas, cozinha, comandas, garcons, turnos,
fecho de caixa, offline, devolucao POS, scanner real ou impressao termica
avancada.

## 3B. Fluxo relatorios V1

Dados ficticios sugeridos:

- Periodo: mes corrente da UAT.
- Cliente com pelo menos uma factura e um recebimento.
- Fornecedor com pelo menos uma compra/recepcao e um pagamento.
- Produto com movimentos de venda/compra/ajuste.
- Conta de tesouraria com entradas e saidas.

Passos:

1. Abrir `/relatorios`.
2. Confirmar que o relatorio de vendas apresenta totais reais do periodo.
3. Filtrar por data inicial/final e confirmar que os totais mudam conforme os dados.
4. Gerar `Relatorio de vendas` e exportar CSV.
5. Gerar `Extracto de clientes` e exportar CSV.
6. Gerar `Antiguidade de saldos` e confirmar buckets 0-30, 31-60, 61-90 e +90 dias.
7. Gerar `Relatorio de compras` e `Extracto de fornecedores`.
8. Gerar `Movimentos de stock` e confirmar entradas/saidas/ajustes.
9. Gerar `Fluxo de caixa` e confirmar entradas, saidas e saldo por conta.
10. Gerar `Todas as operacoes` e confirmar auditoria por data/utilizador/entidade.
11. Confirmar que PDF e Excel avancados aparecem como futuros/desactivados.
12. Clicar `Imprimir / Guardar PDF` e confirmar que apenas o relatorio gerado
    aparece no layout de impressao.
13. Confirmar que salarios, producao e relatorio personalizado nao aparecem como prontos.

Limites aceites neste fluxo: CSV simples pronto; impressao/guardar PDF via
navegador pronto; PDF fiscal/automatico, Excel avancado, salarios, producao,
BI avancado, reconciliacao bancaria e relatorios personalizados ficam para
fases futuras.

## 3D. Fluxo Contabilidade V1

Dados ficticios sugeridos:

- Periodo com facturas, recibos, compras e pagamentos.
- Conta `Caixa`, `Banco`, `Clientes c/c` ou `Fornecedores c/c`.

Passos:

1. Abrir `/contabilidade`.
2. Confirmar que os KPIs usam debitos/creditos reais do periodo.
3. Abrir `Diario` e confirmar lancamentos reais com data, numero, origem,
   estado, conta, debito, credito e utilizador quando disponivel.
4. Filtrar por periodo.
5. Filtrar por conta.
6. Filtrar por origem, por exemplo factura ou recibo.
7. Pesquisar por referencia ou descricao.
8. Exportar CSV do diario e confirmar que respeita os filtros.
9. Abrir `Razao / Extracto`, escolher uma conta e confirmar saldo inicial,
   movimentos, debitos, creditos e saldo acumulado.
10. Exportar CSV do razao.
11. Abrir `Balancete` e confirmar total debito = total credito.
12. Confirmar estado vazio claro para periodo sem movimentos.
13. Exportar CSV do balancete.
14. Clicar `Imprimir / Guardar PDF` e confirmar layout limpo.
15. Confirmar que nao ha mock, placeholder vendido como pronto ou botoes mortos.

Limites aceites neste fluxo: sem fecho anual, DRE oficial, balanco oficial,
fiscal/AT, assinatura digital, reconciliacao bancaria avancada, centros de
custo avancados ou importacao SAF-T.

## 3C. Impressao/PDF comercial P1-03

Dados ficticios obrigatorios. Nao usar dados reais em documentos, screenshots
ou PDFs guardados durante UAT.

Passos:

1. Abrir uma factura existente em `/facturas/documento`.
2. Confirmar cabecalho da empresa, NUIT, telefone/email, endereco se existir e
   referencias bancarias/carteiras se existirem.
3. Confirmar cliente, NUIT do cliente se existir, itens, quantidades, preco
   unitario, subtotal, IVA, total, estado e recibos.
4. Clicar `Imprimir / Guardar PDF` e confirmar layout A4 limpo.
5. Abrir um recibo em `/facturas/recibo`.
6. Confirmar numero, data, cliente, factura relacionada, metodo, conta de
   tesouraria, valor pago, caixa/emissor e observacoes/anulacao se existirem.
7. Clicar `Imprimir / Guardar PDF` e confirmar layout limpo.
8. Abrir `/tesouraria/fecho`, seleccionar conta e data ficticias e imprimir.
9. Confirmar saldo inicial, entradas, saidas, recebimentos, pagamentos,
   transferencias, saldo final, total do dia e assinaturas.
10. Abrir `/relatorios`, gerar `Relatorio de vendas` e imprimir/guardar PDF.
11. Confirmar periodo, filtros aplicados, totais, tabelas e data/hora de
    geracao.
12. Confirmar que nao existe promessa de PDF fiscal oficial, assinatura digital,
    envio automatico por email, layout personalizavel ou impressao termica
    avancada.

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
