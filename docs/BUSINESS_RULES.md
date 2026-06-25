# BUSINESS_RULES — ANTS ERP

_Última actualização: 2026-06-24_

## 1. Localização (Moçambique)

- Idioma: pt-MZ · Moeda: MZN (símbolo MT) · Fuso: Africa/Maputo · Data: DD/MM/YYYY.
- Taxas, impostos e regras fiscais **configuráveis por empresa** (não hardcoded).
- Constantes base em `packages/shared/src/constants.ts`; cálculo em `money.ts`.

## 2. Documentos

- Numeração por empresa/filial/tipo/ano (ex.: `FT-MAP-2026-000001`), transaccional, sem duplicados.
- Estados: Rascunho · Pendente · Aprovado · Emitido · Parcialmente pago · Pago · Vencido ·
  Cancelado · Devolvido.
- Documentos emitidos **não se apagam**: usar cancelamento (com motivo), nota de crédito/débito.
- Desconto acima do limite exige aprovação (`sales.approve_discount`).
- Venda confirmada actualiza **stock + contabilidade** de forma transaccional.
- Sem stock negativo quando a empresa não autoriza.

## 3. Métodos de pagamento

Dinheiro, M-Pesa, e-Mola, POS bancário, Transferência, Cheque, Conta corrente, Crédito
(e personalizado). Cada movimento bancário é associado à **conta bancária específica**
(nunca agregar bancos numa única conta).

## 4. Caixa

- Abertura com saldo inicial; entradas, saídas, sangrias, reforços, vendas, recebimentos.
- Fecho com valor esperado vs contado → diferença; aprovação do fecho.
- Um utilizador não abre duas sessões no mesmo caixa (excepto permissão administrativa).

## 5. Contabilidade

- Partidas dobradas: cada lançamento exige `total débitos == total créditos` (rejeitar desequilíbrio).
- Períodos fechados não aceitam novos lançamentos; reabertura exige permissão + auditoria.
- Correcção por **estorno**, não por edição/eliminação.
- Integração automática: vendas, compras, stock, tesouraria, salários.

## 6. Stock

- Movimentos confirmados não se eliminam. Ajustes exigem motivo.
- Transferências têm origem, destino, expedição e recepção.
- Compras recebidas geram entradas; vendas confirmadas geram saídas; devoluções geram inversos.
- Custo médio e último custo; valorização de stock.

## 7. Salários

- Fórmulas fiscais/laborais MZ (IRPS, INSS, IVA quando aplicável) **configuráveis**, não codificadas.
- Fluxo: Preparação → Validação → Processamento → Aprovação → Pagamento → Contabilização.
- Folhas aprovadas não se editam directamente (reprocessamento/ajuste); dados salariais com
  permissões restritas e auditados.
- **Pendente de confirmação com o cliente:** tabelas/escalões IRPS, taxas INSS, regras de subsídios.

## 8. Idempotência

Jobs que geram documentos (facturação recorrente, sincronização offline do POS) usam
identificador idempotente para nunca duplicar.
