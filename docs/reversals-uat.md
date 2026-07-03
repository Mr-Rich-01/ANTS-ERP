# Estornos operacionais - regressao, UAT e limites V1

_Ultima actualizacao: 2026-07-03_

## Visao geral

Os estornos do P0-03 sao fluxos operacionais iniciados no documento de origem,
auditados, transaccionais e idempotentes. Documentos historicos permanecem
consultaveis; correccoes financeiras sao feitas por movimentos compensatorios e
lancamentos inversos, nunca por edicao ou remocao de registos `POSTED`.

Cada operacao segue o fluxo: sessao autenticada, `RequestContext`,
`requirePermission`, funcao de dominio, transaccao Prisma, auditoria e UI.

## Tabela de fluxos

| Fluxo | Onde inicia na UI | Permissao | Entidade | Efeitos | Bloqueios | Contabilidade | Stock | Auditoria |
|---|---|---|---|---|---|---|---|---|
| Anulacao de recebimento de cliente | Documento da factura, recibo activo | `payments.cancel` | `Payment` | Marca recibo `REVERSED`, recalcula `Invoice.amountPaid`, restaura saldo do cliente, cria movimento inverso de Tesouraria | recibo ja anulado, factura cancelada, inconsistencias de Tesouraria/Contabilidade, periodo/exercicio fechado | inverte `RECEIPT_POSTED` | nao | `customer.payment.reverse` |
| Cancelamento de factura | Documento da factura | `invoices.cancel` | `Invoice` | Marca factura `CANCELLED`, restaura saldo do cliente e stock, preserva linhas historicas | pagamentos `ACTIVE`, `amountPaid` inconsistente, stock sem rastreabilidade, periodo/exercicio fechado | inverte `SALE_ISSUED` | sim | `invoice.cancel` |
| Estorno de pagamento a fornecedor | Ordem de compra/perfil do fornecedor | `supplierPayments.reverse` | `SupplierPayment` | Marca pagamento `REVERSED`, restaura saldo do fornecedor e `PurchaseOrder.amountPaid`, cria movimento inverso de Tesouraria | pagamento ja estornado, inconsistencias de ordem/fornecedor/Tesouraria/Contabilidade, periodo/exercicio fechado | inverte `SUPPLIER_PAYMENT_POSTED` | nao | `supplier.payment.reverse` |
| Estorno de recepcao de compra | Ordem de compra, recepcao activa | `purchaseReceipts.reverse` | `PurchaseReceipt` | Marca recepcao `REVERSED`, recalcula ordem/linhas, restaura fornecedor, retira stock e reverte custo medio quando seguro | pagamento fornecedor `ACTIVE`, stock insuficiente, movimentos posteriores, custo medio inseguro, periodo/exercicio fechado | inverte `PURCHASE_RECEIVED` | sim | `purchase.receipt.reverse` |
| Estorno de transferencia entre contas | Tesouraria, transferencia activa | `treasury.reverseTransfer` | `TreasuryTransfer` logica por `transferId` | Marca as duas pernas `REVERSED`, cria dois compensatorios, restaura origem e reduz destino | estorno isolado, pernas inconsistentes, contas inactivas, saldo insuficiente no destino, periodo/exercicio fechado | nao | nao | `treasury.transfer.reverse` |

## Ordem operacional recomendada

### Vendas

1. Se a factura tiver recebimento activo, anular primeiro o recebimento.
2. Depois cancelar a factura.

### Compras

1. Se a recepcao tiver pagamento activo relacionado, estornar primeiro o pagamento ao fornecedor.
2. Depois estornar a recepcao.

### Tesouraria

1. Nunca estornar apenas uma perna de uma transferencia.
2. Usar sempre o fluxo atomico de estorno de transferencia.

## Permissoes

| Permissao | Uso |
|---|---|
| `payments.cancel` | Anular recebimentos de clientes |
| `invoices.cancel` | Cancelar facturas sem recebimentos activos |
| `supplierPayments.reverse` | Estornar pagamentos a fornecedores |
| `purchaseReceipts.reverse` | Estornar recepcoes de compra |
| `treasury.reverseTransfer` | Estornar transferencias entre contas |
| `treasury.reverseMovement` | Estornar apenas movimentos manuais elegiveis; movimentos operacionais sao bloqueados |

## Limitacoes V1

- Sem estorno parcial.
- Sem nota de credito ou nota de debito nesta fase.
- Sem devolucao comercial ao fornecedor.
- Factura com recebimento activo bloqueia o cancelamento.
- Recepcao com pagamento activo bloqueia o estorno da recepcao.
- Recepcao com stock utilizado bloqueia o estorno.
- Movimentos posteriores de stock podem bloquear o estorno.
- Transferencias nao criam `JournalEntry`, porque o fluxo actual de transferencia nao integra razao.
- `Invoice cancellation` nao reconstrui COGS porque o modelo actual de vendas nao lanca COGS/INVENTORY.
- `Product.avgCost` so e revertido quando a reconstrucao e segura.

## UAT manual

### Caixa

- Pre-condicao: factura emitida com recibo activo em conta de caixa.
- Passos: abrir a factura, anular o recibo com motivo valido e confirmar.
- Resultado esperado: recibo `ANULADO`, saldo da factura volta a aberto, saldo do cliente e da conta financeira sao restaurados, ha lancamento inverso.
- Evidencia: screenshot do recibo anulado, extracto da conta e auditoria.

### Gestor

- Pre-condicao: factura sem recebimentos activos.
- Passos: abrir a factura, cancelar com motivo valido e confirmar.
- Resultado esperado: factura `CANCELADA`, stock reposto, saldo do cliente reduzido, lancamento inverso criado.
- Evidencia: documento da factura, ficha de stock e auditoria.

### Compras

- Pre-condicao: ordem recebida com recepcao activa.
- Passos: se houver pagamento activo, estornar o pagamento; depois estornar a recepcao.
- Resultado esperado: pagamento `ESTORNADO`, recepcao `ESTORNADA`, ordem com `receivedValue` e `receivedQty` recalculados, stock retirado.
- Evidencia: ordem de compra, recepcao, pagamento e movimentos de stock.

### Tesouraria

- Pre-condicao: transferencia entre duas contas activa.
- Passos: tentar verificar que a UI nao permite estornar uma perna isolada; usar o estorno de transferencia.
- Resultado esperado: duas pernas originais `ESTORNADA`, dois compensatorios criados, origem e destino restaurados sem `JournalEntry`.
- Evidencia: extracto das duas contas e auditoria `treasury.transfer.reverse`.

### Administrador

- Pre-condicao: utilizador sem uma das permissoes de reversao.
- Passos: tentar executar o fluxo sem permissao e repetir com perfil autorizado.
- Resultado esperado: sem permissao, operacao bloqueada no servidor; com permissao, operacao conclui e audita.
- Evidencia: mensagem de bloqueio, perfil/permissoes e registo de auditoria.

## Suporte e rollback

- Nao editar a base de dados manualmente para "corrigir" estornos.
- Usar sempre os fluxos de estorno do documento operacional de origem.
- Em erro operacional grave, preservar logs, auditoria e documentos historicos.
- Backups e restore ficam para fase posterior de preparacao de producao.
- Estorno concluido nao deve ser apagado.

## Suites automaticas

```bash
pnpm test:integration:accounting:reversal:customer-payment
pnpm test:integration:accounting:reversal:invoice
pnpm test:integration:accounting:reversal:supplier-payment
pnpm test:integration:accounting:reversal:purchase-receipt
pnpm test:integration:accounting:reversal:treasury-transfer
pnpm test:integration:accounting:reversal:uat
pnpm test:integration:accounting:reversal:all
```
