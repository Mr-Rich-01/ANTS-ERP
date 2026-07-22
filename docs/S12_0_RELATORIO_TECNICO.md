# S12.0 — Levantamento técnico e desenho documental (Módulo de Produção)

_Preparado em 2026-07-19 · Ronda documental: **zero alterações** a schema, migrations,
seeds, domínio, APIs, UI, permissões, testes ou dependências._

Este relatório substitui, quando aprovado, a secção PROPOSTA_UNIDADES_DECIMAIS e as
perguntas de unidades de `docs/REQUISITOS_KOKO.md` (o ficheiro original não foi
editado nesta ronda). As respostas formais da KOKO ainda não chegaram: **nada aqui
assume o processo produtivo do cliente**; todos os exemplos de materiais (cartão,
papel, fita, cola, rolos, kg, litros, metros…) são **hipotéticos e por confirmar**.
O mock de produção do design (`apps/web/src/lib/data/production.ts`) é referência
visual portada do Claude Design — **não** é evidência da operação real da KOKO.

---

## A. RESUMO_EXECUTIVO

1. **Todas as quantidades de stock e de linhas de documento são `Int`** — 14 colunas
   em 10 tabelas (§B.1). Nenhuma participa em índices ou constraints além de FKs, o
   que torna uma eventual mudança de tipo estruturalmente simples.
2. **Todos os custos e valores são `Decimal(14,2)`** — incluindo `Product.avgCost`,
   os snapshots `unitCost` (facturas, NC, contagens) e os valores contabilísticos
   (§B.2). Não existe nenhuma coluna de custo com mais de 2 casas.
3. **`round2` é o único helper de arredondamento** (2 casas fixas,
   `packages/shared/src/money.ts:5`) com **243 ocorrências em 11 ficheiros de
   domínio** — não existe arredondamento genérico a N casas no sistema.
4. O argumento anterior sobre gramas/ml estava impreciso. **Corrigido (§C.0):** o
   erro não é automático com unidade pequena, nem evitado por ela — ocorre sempre que
   o custo por unidade-base tem mais casas significativas do que a coluna comporta
   (0,04 MT/g cabe; 0,065 MT/g não cabe → ±7,69%). Como isso depende de cada preço de
   cada material, **não se pode garantir ausência de erro sem controlar a precisão da
   coluna de custo**.
5. A forma exacta do risco é: **erro absoluto por movimento ≈ ε × quantidade**, com
   ε ≤ 0,005 (2 casas). Converter kg→g multiplica a quantidade por 1000 e mantém o ε
   — o erro potencial amplifica ×1000 (§C.0).
6. As validações `.int()` de quantidade existem em **9 pontos de 5 ficheiros de
   domínio** (§B.3.5) — é o Zod, não o tipo TypeScript, que hoje impede fracções na
   entrada.
7. `computeLine`/`computeDocumentTotals` (`money.ts`) já aceitam quantidades
   fraccionárias sem alteração — o tipo é `number` e o arredondamento é ao dinheiro.
8. **Maior risco global:** as fórmulas-âncora documentadas como EXACTAS
   (`131 = Σ round2(qtd × round2(avgCost))`, S10a/S10c) contêm `round2` sobre o
   próprio custo. Qualquer opção que aumente a precisão dos custos (D) **reescreve
   estas fórmulas 🔒**; a opção que muda as quantidades (A) **mantém-nas intactas**.
9. Quatro opções avaliadas (§C): A — quantidades Decimal(14,3); B — unidades-base
   inteiras com custos a 2 casas; C — Decimal só na produção com conversão; D —
   unidades-base inteiras com custos de alta precisão (Decimal(18,6)).
10. **B e C ficam rejeitadas tecnicamente** (§F recomendação): B tem perda de
    precisão silenciosa e inevitável com custos a 2 casas; C desloca o mesmo problema
    para uma fronteira de conversão permanente com duas representações da mesma
    quantidade.
11. **Opção tecnicamente preferida, SE a KOKO precisar de fracções: A** — raio maior
    mas mecânico e visível (typecheck + testes); custeio e fórmulas-âncora intactos.
    **D é a alternativa viável** apenas se mudar colunas de quantidade for vetado —
    ao custo de reescrever as fórmulas 🔒 e de uma camada de conversão eterna.
12. **Se a KOKO trabalhar só com unidades/embalagens inteiras: nenhuma migração** —
    o melhor desfecho, e é a razão de a pergunta n.º 1 continuar destacada.
13. RBAC confirmado no código (§F.3): gates de servidor lêem permissões frescas da BD
    a cada pedido (`session.ts:32` → `auth.ts:122`), mas a **sidebar lê do JWT**
    (`layout.tsx:36`) — após o seed, o Gestor já passaria nos gates novos, mas só vê
    a entrada «Produção» após re-login. O ecrã `production` existe em `SCREENS` mas
    está fora de `NAV_GROUPS` desde o fix pré-demo.
14. Proposta de rotulagem (§F.2): enquanto o custo capturado for só materiais, a UI e
    relatórios devem dizer **«custo de materiais»** — nunca «custo de produção» ou
    «custo total» — para a KOKO não formar preços sobre um custo sem mão-de-obra e
    energia. O KPI do mock («Custo de produção») terá de ser renomeado ao portar.
15. **Decisões bloqueadas:** tudo o que depende da KOKO (§G) — à cabeça a n.º 1
    (unidades). **Próximo passo recomendado (§H): enviar o questionário revisto e NÃO
    iniciar S12-pre/S12a antes das respostas do Bloco A.**

### Separação de estatutos

- **(1) Factos confirmados no código:** §B inteiro, §F.3 (RBAC/sessão/sidebar), e os
  pontos 1–3, 6, 7, 13 acima — tudo com referência a ficheiro/linha.
- **(2) Decisões internas já aprovadas** (rondas anteriores; ver também §F.1):
  single-step por defeito; sem WIP contabilístico na V1; perdas/recuperáveis e etapas
  apenas preparados no modelo, sem contabilização nem etapas inventadas; contas
  131/132/133; diário DPR; vínculo opcional ordem↔venda sem comportamento; núcleo
  estruturado + atributos flexíveis; divisão S12a/b/c; RBAC `production.*`.
- **(3) Recomendações técnicas** (desta ronda, a aprovar): preferência condicionada
  A > D e rejeição de B/C (§C, §F recomendação); rotulagem «custo de materiais»
  (§F.2); provas exigidas antes de qualquer migração (§F.4); gate `production.view`
  na sidebar.
- **(4) Decisões dependentes da KOKO:** unidades (n.º 1), perdas, etapas,
  co-produtos, produção parcial, custos adicionais, comportamento do vínculo às
  vendas, armazéns, especificação, volume (§E e §G).

---

## B. RELATORIO_IMPACTO_UNIDADES

### B.1 Colunas de quantidade (todas; schema.prisma)

| Modelo / coluna | Linha | Tipo | Nulável | Uso principal | Participa em cálculos | Índices/constraints | Risco de alteração |
|---|---|---|---|---|---|---|---|
| `Product.minStock` | 412 | `Int @default(0)` | não | alerta de reposição | só comparações | nenhum | Baixo |
| `StockLevel.quantity` | 472 | `Int @default(0)` | não | stock disponível por armazém | somas, validação de suficiência, decremento/incremento | `@@unique(productId, warehouseId)` **não inclui** quantity | Alto (coração do stock) |
| `StockMovement.quantity` | 504 | `Int` (delta com sinal) | não | histórico auditável | somas (âncoras, reconstruções P0-03d) | nenhum sobre quantity | Alto |
| `StockMovement.balanceAfter` | 506 | `Int` | não | saldo após movimento | derivado | nenhum | Alto |
| `StockCountLine.systemQty` | 577 | `Int` | não | snapshot da contagem S9 | delta contado−snapshot | `@@unique(count, product)` sem qty | Médio |
| `StockCountLine.countedQty` | 578 | `Int` | não | contado | delta | — | Médio |
| `StockCountLine.appliedDiff` | 580 | `Int?` | **sim** | verdade histórica do ajuste | valorização × avgCost | — | Médio |
| `InvoiceLine.quantity` | 659 | `Int` | não | venda | `computeLine`, baixa de stock, CMV `qtd×unitCost` | — | Alto |
| `QuotationLine.quantity` | 767 | `Int` | não | cotação (pré-transaccional) | totais | — | Baixo |
| `CreditNoteLine.quantity` | 842 | `Int` | não | NC; tecto por linha | devolução de stock, par CMV | — | Alto |
| `DebitNoteLine.quantity` | 903 | `Int` | não | ND (sem stock) | totais | — | Baixo |
| `PurchaseOrderLine.quantity` | 976 | `Int` | não | encomenda | totais, pendências | — | Médio |
| `PurchaseOrderLine.receivedQty` | 977 | `Int @default(0)` | não | acumulado recepcionado | recalculado por recepções ACTIVE | — | Médio |
| `PurchaseReceiptItem.quantity` | 1034 | `Int` | não | recepção | **recalcula avgCost**, stock IN | — | Alto |

Factos adicionais: **não existe** fluxo/tabela de transferência de stock entre
armazéns (a permissão `stock.transfer` está semeada mas nunca usada em código); a
«produção» actual é só mock de UI sem tabelas; `TreasuryMovement.balanceAfter`
(linha 1122) é `Decimal(14,2)` mas é dinheiro, não quantidade.

### B.2 Colunas de custo e valor (todas `Decimal(14,2)` salvo indicação)

| Coluna(s) | Linha | Natureza | Preenchida em | Arredondada | Somada/comparada |
|---|---|---|---|---|---|
| `Product.avgCost` | 408 | **custo actual** (médio ponderado) | recepção de compra (`purchases.ts:715-719`, `round2` no recálculo); stock inicial S8 (`products.ts`); reconstrução no estorno de recepção (`purchases.ts:1006-1017`) | `round2` a cada recálculo | lida como snapshot na emissão/NC/contagens/regularização |
| `Product.salePrice` / `taxRate` | 406/410 | preço/taxa (taxRate `Decimal(5,2)`) | catálogo | — | `computeLine` |
| `InvoiceLine.unitPrice`, `discountPercent(5,2)`, `taxRate(5,2)`, `total` | 658-666 | preço/valor da linha | emissão | `computeLine` (`money.ts:27-34`: round2 em bruto/desconto/líquido/IVA/total — **arredondamento intermédio por linha**) | `computeDocumentTotals` (round2 acumulado) |
| `InvoiceLine.unitCost` | 664 | **custo histórico** (snapshot S10a; `NULL` = pré-S10a/rascunho/sem produto) | emissão (lê avgCost) | não (cópia) | CMV `inventoryCostTotal` |
| `CreditNoteLine.unitCost` | 846 | custo histórico (snapshot S5) | emissão da NC | não | par CMV da devolução |
| `QuotationLine.*`, `DebitNoteLine.*` | 766-771 / 902-906 | preços/totais | emissão | computeLine | totais |
| `PurchaseOrderLine.unitCost`, `total` | 975/979 | preço de compra unitário | criação da OC | computeLine | recepção (custo recebido) |
| `PurchaseReceiptItem.unitCost`, `netAmount`, `taxAmount`, `totalAmount` | 1035-1039 | custo histórico da recepção | recepção | round2 | recálculo do avgCost; lançamento `PURCHASE_RECEIVED` |
| `StockCountLine.appliedUnitCost`, `appliedValue` | 581-582 | custo histórico (avgCost na validação S9) | validação | `round2(avgCost)` e `round2(diff×custo)` | lançamento `AJ` |
| Totais de documentos (`Invoice`, `Quotation`, `CreditNote`, `DebitNote`, `PurchaseOrder`, `PurchaseReceipt`, `SupplierPayment.amount`, `Payment.amount`) | várias | valores monetários | emissão | computeDocumentTotals | extractos/saldos |
| `Customer.balance`, `Supplier.balance`, `creditLimit` | 323-369 | saldos correntes | incrementos/decrementos atómicos | round2 | extractos |
| `JournalEntry.totalDebit/totalCredit`; `JournalEntryLine.debit/credit` | 1419-1420 / 1453-1454 | valores contabilísticos | `postAccountingEventTx` (`recalcTotals`) | `normalizeEventLine` (round2 por linha) | validação débito=crédito (comparação **estrita** `!==` em `accounting-events.ts:204`) |
| `TreasuryAccount.balance`, `TreasuryMovement.amount/balanceAfter` | 1088-1122 | tesouraria | movimentos | round2 | fecho de caixa |

**Fórmulas com arredondamento intermédio (as sensíveis):**

- `inventoryCostTotal = round2(Σ round2(qtd × unitCost))` — única fonte do CMV
  (`accounting-events.ts:284-286`);
- recálculo do avgCost: `round2((oldQty×oldAvg + qty×unitCost)/newQty)`
  (`purchases.ts:718`);
- âncora física: `Σ por nível de stock de round2(qtd × round2(avgCost))` — fórmula
  declarada EXACTA na regularização S10c (`inventory-regularization.ts`) e nos
  testes-âncora S10a/S11;
- valorização S9: `round2(avgCost)` por linha de contagem.

É a **combinação** unidade-base pequena × custo a 2 casas × estes arredondamentos
intermédios × CMV que gera o risco — não a quantidade inteira em si (§C.0).

### B.3 Código afectado (funções e referências)

**B.3.1 Somam/validam/movem quantidades**
- `packages/domain/src/invoices.ts` — `createInvoice` (valida stock por armazém, baixa `StockLevel`, cria `StockMovement OUT`, snapshot `unitCost`, CMV), `createPosSale`, `issueInvoiceDraft` (lock `FOR UPDATE` linha 1749+), `cancelInvoice` (reposição por `reversesId`, estorno CMV);
- `packages/domain/src/purchases.ts` — `receivePurchaseOrder` (recalcula avgCost 712-719; locks OC→produtos→níveis 982-987), `reversePurchaseReceipt` (reconstrução do avgCost 1006-1017; bloqueio se stock usado), `purchaseStatusFromLines` (pendências por quantidades);
- `packages/domain/src/commercial-documents.ts` — `createCreditNote` (tecto por linha facturado−creditado sob `FOR UPDATE`; devolução IN opcional), `cancelCreditNote` (OUT compensatórios; falha se mercadoria saiu), `createDebitNote`;
- `packages/domain/src/stock-counts.ts` — `validateStockCount` (delta vs. snapshot sob lock 428-440; **bloqueio de stock negativo**; valorização ao avgCost);
- `packages/domain/src/products.ts` — `createProduct` com stock inicial (avgCost = custo informado), `listProductsPage` (totais de stock);
- `packages/domain/src/inventory-regularization.ts` — fórmula física exacta;
- `packages/domain/src/stock.ts` — leituras (`listProductMovements`, `listInventory`);
- `packages/domain/src/reports.ts` — relatório de movimentos de stock, CSV.

**B.3.2 Recalculam custo / CMV**
- `purchases.ts:715-719` (entrada), `purchases.ts:1006-1017` (reconstrução no estorno);
- `accounting-events.ts:284-338` (`inventoryCostTotal`, `postInventoryCostEventTx`);
- `stock-counts.ts` (valorização), `inventory-regularization.ts` (âncora).

**B.3.3 Conversões Decimal→number**
Padrão corrente `Number(x)` sobre colunas Decimal (ex.: `Number(product.avgCost)` em
`purchases.ts:716`, `Number(l.debit)` em `accounting-events.ts:187`). As quantidades,
por serem `Int`, chegam hoje como `number` **sem** conversão — qualquer opção que as
torne Decimal obriga a `Number()` em cada leitura; o typecheck denuncia os pontos
(`Decimal` não é atribuível a `number`).

**B.3.4 Arredondamento**
Único helper: `round2` (`packages/shared/src/money.ts:5`,
`Math.round((v+EPSILON)*100)/100` — **2 casas fixas**). 243 ocorrências em 11
ficheiros de domínio + `computeLine`/`computeDocumentTotals`. `toFixed(2)` aparece na
assinatura de idempotência das linhas contabilísticas (`accounting-events.ts:95`) e
na formatação (`formatMZN`). Não existe helper `roundN`.

**B.3.5 Assunções de inteiro (validação de entrada)**
Zod `.int()` sobre quantidades: `invoices.ts:376, 781, 1727` (factura, POS, rascunho),
`commercial-documents.ts:253, 493, 1137` (cotação, NC, ND), `purchases.ts:405` (OC),
`stock-counts.ts:46` (contagem — mensagem própria), `products.ts:286` (stock inicial)
e `products.ts:271` (`minStock`). É esta camada — não o tipo da coluna — que rejeita
fracções hoje.

**B.3.6 UI/formulários/APIs com quantidades (20 ficheiros em `apps/web/src`)**
Formulários: `facturas/nova/NovaFacturaClient.tsx`, `pos/PosClient.tsx`,
`compras/ordem/nova/NovaOrdemClient.tsx`, `recepcao/RecepcaoClient.tsx`,
`facturas/nota-credito/nova/…`, `facturas/nota-debito/nova/…`, `cotacoes/nova/…`,
`inventario/InventarioClient.tsx`, `components/produtos/ProductFormDialog.tsx` (stock
inicial), + actions (`produtos/actions.ts`, `compras/actions.ts`). Exibição sem casas
decimais: documentos imprimíveis (`facturas/documento`, `compras/ordem/documento`,
`components/print/DocumentParts.tsx`), `produtos/ficha`, listas e CSVs de relatórios.
As rotas `/api/search/*` não transportam quantidades.

### B.4 Testes afectados (fundamentado nos ficheiros existentes)

Legenda: F = só fixtures; E = expectativas alteradas; N = novos casos de
arredondamento necessários; ⚓ = teste-âncora.

| Suite (ficheiro em `packages/domain/src`) | Testes | Porquê afectada | Opção A | Opção D |
|---|---|---|---|---|
| `accounting.cogs.integration` | 14 | ⚓ coerência `131 = Σ qtd×avgCost = 301,00`; snapshots | F/E mecânicas + N | **E: fórmula reescrita** + N |
| `accounting.inventory-regularization.integration` | 11 | ⚓ fórmula EXACTA por nível | F/E mecânicas | **E: fórmula reescrita** |
| `accounting.statements.integration` | 14 | ⚓ três pontas; 131 = físico | F | E (valores à mão recalculados) |
| `stock-counts.integration` | 14 | deltas, valorização `round2(avgCost)`, negativo bloqueado | F/E + N | **E: valorização muda** |
| `products.initial-stock.integration` | 10 | testa explicitamente a regra `.int()` («inteiros validados») | **E: regra de validação muda** | F (regra mantém-se) |
| `commercial-documents.integration` | 14 | tectos por quantidade, devoluções | F/E | F/E |
| `accounting.credit-note-cancellation.integration` | 12 | OUT compensatórios, «devolvido 5, disponível 2» | F/E | F |
| `invoices.drafts.integration` | 13 | stock validado na emissão | F | F |
| `pos.integration` | 12 | baixa de stock, CMV | F | F |
| `accounting.invoice-cancellation.integration` | 9 | reposição por quantidades | F | F |
| `accounting.purchase-receipt-reversal.integration` | 8 | reconstrução do avgCost | F/E + N | **E: recálculo a 6 casas** + N |
| restantes reversals (foundation/customer-payment/supplier-payment/treasury/uat) | ~36 | quantidades só em fixtures | F | F |
| `accounting.c1/c2a/c2/c3.integration` | 30/18/34/17 | montagem de cenários com stock; c3 = recepção | F (c3: F/E) | c3: E |
| `reports.integration` | 24 | CSV de stock com quantidades | E (formato com casas) | E (unidades-base na exibição) |
| `purchases.approval.integration` | 9 | quantidades só em fixtures | F | F |
| unitários (`money.test.ts`, `purchase-ui`, `invoice-ui`, tenant-scope…) | 99 | `computeLine` já é fraction-agnostic | + N (linhas fraccionárias) | **+ N (roundN novo + precisão)** |
| não afectadas | — | auth 7, security 16, company-profile 8, cash-closing 11, accounting.reports 14 | — | — |

Estimativa fundamentada: **Opção A** exige edição em ~12 suites (dominantemente
fixtures e leituras `Number()`, mais a reescrita dos testes de validação `.int()` do
initial-stock) e casos novos de fracção; **Opção D** edita menos suites mas reescreve
precisamente as âncoras 🔒 (cogs, regularização, statements, contagens, reversão de
recepção) — os testes mais sensíveis do sistema. Em ambas, o critério de saída é o
agregado completo verde (accounting 254 + todas as restantes + build).

---

## C. PROPOSTA_UNIDADES_DECIMAIS_REVISTA

### C.0 O argumento exacto sobre precisão (correcção da ronda anterior)

O erro de arredondamento **não é automático** por usar gramas/ml — mas **também não é
evitado** por usar gramas/ml. Depende da combinação entre a pequenez da unidade-base
e a precisão da coluna de custo (`Decimal(14,2)` hoje, sem excepções — §B.2):

- 40 MT/kg = **0,04 MT/g** → representável em 2 casas, **sem erro**;
- 65 MT/kg = **0,065 MT/g** → não representável → 0,06 (−7,69%) ou 0,07 (+7,69%);
- Regra geral: **há erro sempre que o custo por unidade-base tem mais casas
  significativas do que a coluna comporta** — o que é imprevisível, porque depende de
  cada preço de cada material (e o custo médio ponderado raramente cai em valores
  "redondos" depois do primeiro recálculo). Não se pode garantir ausência de erro sem
  controlar a precisão da coluna de custo.

Forma quantitativa: o erro absoluto por movimento é ≈ `ε × quantidade`, onde
`ε ≤ 0,005` MT (meia unidade da 2.ª casa). Em unidades naturais (kg), quantidades são
pequenas e o erro fica em cêntimos; converter para g multiplica a quantidade por 1000
**sem reduzir ε** — o mesmo movimento passa a poder errar por MT inteiros (ex.:
120 000 g × 0,005 = 600 MT de desvio potencial). O risco real é a cadeia
`unidade pequena × custo a 2 casas × arredondamentos intermédios (B.2) × CMV`.

### C.OPÇÃO A — Migrar quantidades de stock para Decimal

Precisão proposta: **`Decimal(14,3)`** — 3 casas cobrem g a partir de kg e ml a
partir de L, mantendo margem de 11 dígitos inteiros; mais casas não têm caso de uso
identificado e alargariam ruído de exibição. (Justificável subir a (16,4) se a KOKO
indicar fracções mais finas — decisão na resposta.)

- **Tabelas:** as 10 de §B.1 (14 colunas; `minStock` incluído por coerência).
  Migração `ALTER COLUMN … TYPE DECIMAL(14,3)` — **sem perda** (Int→Decimal é
  exacto), aditiva, dados existentes intactos.
- **Domínio:** todas as leituras de quantidade passam a `Prisma.Decimal` → `Number()`
  em cada ponto (padrão já usado para custos); o typecheck lista exaustivamente os
  pontos. Zod: remover `.int()` onde a fracção passa a ser legal — idealmente
  controlado por produto (flag/unidade que declara se aceita fracções), para o POS
  continuar a vender unidades inteiras de pão sem regressão de UX.
- **Fórmulas de custeio: intactas.** `inventoryCostTotal`, recálculo do avgCost,
  âncoras e valorizações não mudam — quantidade fraccionária entra nas mesmas
  expressões; `avgCost` continua a 2 casas **em unidades naturais**, onde ε×qtd fica
  em cêntimos.
- **UI/APIs:** inputs de quantidade aceitam decimais (por produto); exibição com até
  3 casas; CSVs idem (~20 ficheiros de §B.3.6).
- **Rollback:** trivial **antes** de existirem dados fraccionários (voltar a Int é
  exacto); **destrutivo depois** (trunca fracções) — janela de rollback honesta: até
  ao primeiro movimento fraccionário real.
- **Testes:** §B.4 coluna A; casos novos de fracção nos pontos de arredondamento.
- **Dívida técnica:** nenhuma nova; remove a limitação estrutural de forma
  definitiva. **Benefício de longo prazo:** uma única representação, receitas em
  unidades naturais, sem conversões.

### C.OPÇÃO B — Unidades-base inteiras mantendo custos a 2 casas

Exemplos hipotéticos: kg→g, L→ml, metro→cm/mm, pacote/rolo como unidade.

- **Erros de arredondamento:** inevitáveis e **silenciosos** sempre que o custo por
  unidade-base não caiba em 2 casas (§C.0) — e o recálculo do avgCost degrada-o a
  cada recepção (`round2` sobre um valor minúsculo). O CMV, as âncoras e a
  contabilidade herdam o custo degradado: o erro fica **dentro dos números
  publicados**, não em teste nenhum.
- **Relatórios/UX:** todos os ecrãs e CSVs mostram 120 000 em vez de 120,5 kg, salvo
  camada de conversão de exibição transversal (raio de UI grande e permanente).
- **Mudar a unidade-base depois** exige converter histórico de movimentos, custos e
  documentos emitidos — na prática, irreversível.
- Não é recomendável **apesar de exigir menos alterações**: é a única opção cujo
  risco não aparece em nenhum teste existente.

### C.OPÇÃO C — Decimal apenas na produção, conversão para inteiro no StockMovement

- **Duas representações** da mesma quantidade (receita/ordem em Decimal; stock em
  Int) com regra de conversão por produto, para sempre.
- **Arredondamento na passagem:** o consumo real fraccionário tem de cair num inteiro
  de stock — ou a unidade de stock é fina (reintroduz a Opção B com o seu problema de
  custo a 2 casas), ou arredonda-se o consumo (o custo lançado diverge do consumo
  real da receita).
- **Planeado vs. real vs. movimento:** três números potencialmente diferentes por
  linha; reconciliação e auditoria têm de explicar as diferenças; estornos têm de
  reverter o inteiro movimentado, não o decimal consumido — divergência
  produção↔stock estrutural, exactamente a classe de incoerência que o projecto
  eliminou nas S9/S10.
- **Conclusão honesta: desloca o problema** (da coluna de quantidade para uma
  fronteira de conversão permanente) em vez de o resolver, e acrescenta manutenção
  eterna. Parece a mais barata; é a mais cara a prazo.

### C.OPÇÃO D — Quantidades inteiras em unidade-base + custos de alta precisão

`StockLevel.quantity`/`StockMovement.quantity` continuam `Int`; cada produto declara
uma unidade-base; a UI aceita unidades de apresentação (kg/L/m/pacote/rolo →
conversão para a base); `avgCost` sobe para `Decimal(18,6)`; snapshots `unitCost` na
mesma precisão; valores monetários finais continuam a 2 casas; unidade-base imutável
após o primeiro movimento; factor de conversão só alterável por processo controlado.

- **Aumentar só `avgCost` e `unitCost` NÃO é suficiente.** Verificado contra o
  schema: também precisam de 6 casas `PurchaseOrderLine.unitCost` e
  `PurchaseReceiptItem.unitCost` (comprar um saco hipotético de 25 000 g por
  1 625 MT dá 0,065 MT/g — o preço de compra por unidade-base sofre o mesmo problema)
  e `StockCountLine.appliedUnitCost` (valorização S9). Os **valores** de linha,
  totais de documentos e montantes contabilísticos podem ficar a 2 casas, desde que a
  multiplicação `qtd × custo` seja feita em precisão total e arredondada **uma vez**
  no fim — o que obriga a rever cada fórmula de §B.2: o recálculo do avgCost perde o
  `round2` (passa a round6/sem arredondamento), a âncora `Σ round2(qtd ×
  round2(avgCost))` perde o `round2` interno, a valorização S9 idem. **São
  exactamente as fórmulas declaradas EXACTAS e protegidas 🔒 desde a S10a/S10c.**
  Resíduo: mesmo a 6 casas, ε ≤ 5×10⁻⁷ × qtd — com qtd 120 000 dá ~0,06 MT por
  movimento; tolerável, mas tem de ser declarado e testado.
- **Impacto transversal:** compras e recepções passam a operar em unidade-base
  (UI de OC/recepção converte); contagens contam em unidade-base; vendas de produtos
  fraccionários idem; relatórios/exportações e todos os ecrãs de §B.3.6 precisam da
  conversão de exibição; novo helper `roundN`; novos campos de produto (unidade-base,
  factor, unidade de apresentação) com regras de imutabilidade.
- **Testes:** §B.4 coluna D — reescreve as âncoras e exige casos novos de precisão.
- **Dívida técnica:** camada de conversão permanente + duas convenções de precisão
  monetária (6 casas em custos, 2 em valores) a manter para sempre.

---

## D. MATRIZ_DE_DECISAO

Classificação: **B**aixo · **M**édio · **A**lto · **MA** Muito alto.

| Critério | A — Qtd Decimal | B — Base inteira, custo 2c | C — Decimal só produção | D — Base inteira, custo 6c |
|---|---|---|---|---|
| Raio de alteração | **A** — 10 tabelas + domínio + UI, mas mecânico | **B** — zero schema | **M** — módulo novo + camada conversão | **A** — 6 colunas de custo + fórmulas + conversão UI |
| Tabelas afectadas | 10 (14 colunas) | 0 | 0 existentes (+ novas de produção) | 5-6 (custos) + campos novos em `products` |
| Ficheiros (aprox.) | ~10 domínio + ~20 web | ~0 código; UI de exibição se convertida | ~5 novos + conversão | ~8 domínio (fórmulas) + ~20 web (exibição) |
| Suites com edição | ~12 (F/E mecânicas) | ~0 (risco invisível) | ~0 existentes + novas | ~8, incluindo **todas as âncoras** |
| Compatibilidade com dados existentes | **B** — Int→Decimal exacto | **MA** — re-basear produtos existentes = converter histórico | **B** — não toca existentes | **M** — custos re-escalados; unidade-base retrofitada |
| Risco de migração | **M** — grande mas determinística | **B** (não há) / **MA** se re-basear depois | **B** | **M** — menos colunas, mas semântica muda |
| Risco de arredondamento | **B** — custos ficam em unidades naturais | **MA** — silencioso e não testado | **A** — na fronteira de conversão | **M** — resíduo 6c declarável, mas fórmulas reescritas |
| Risco para CMV | **M** — fórmulas intactas, dados novos | **MA** — CMV herda custo degradado | **A** — custo lançado ≠ consumo real | **A** — reescreve a fonte do CMV |
| Risco para contabilidade | **M** — âncoras intactas, revalidadas | **MA** — âncoras "verdes" sobre números errados | **A** — divergência produção↔stock | **A** — âncoras reescritas 🔒 |
| Complexidade UI | **M** — inputs/exibição com casas | **MA** — tudo em unidades-base ou conversão total | **M** — só produção | **A** — conversão de exibição transversal |
| Complexidade API/domínio | **M** — `Number()` + Zod por produto | **B** | **M** — dupla representação | **A** — roundN + duas convenções de precisão |
| Relatórios/CSV | **M** — formato com casas | **A** — números ilegíveis sem conversão | **M** | **A** — conversão em todos |
| Rollback | **M** — trivial até ao 1.º dado fraccionário; destrutivo depois | **B** / **MA** depois de re-basear | **B** | **M** — reverter precisão trunca custos novos |
| Dívida técnica | **B** — remove a limitação | **MA** — permanente e escondida | **MA** — duas representações para sempre | **A** — conversão + precisão dupla para sempre |
| Escalabilidade | **A**(boa) — serve qualquer módulo futuro | má | má | média |
| Adequação ao MVP | **M** — custa uma sub-sessão dedicada | aparente **B**, real **MA** | aparente **B**, real **A** | **M** |
| Adequação a longo prazo | **A**(melhor) | péssima | má | média |

Justificações-síntese: A concentra o custo **agora, de forma visível** (typecheck +
testes denunciam cada ponto) e deixa o custeio intacto; B esconde o custo **nos
números publicados**; C paga para sempre a fronteira de conversão e quebra a
igualdade consumo=movimento=lançamento que as S9/S10 estabeleceram; D evita mexer nas
quantidades ao preço de reescrever exactamente as fórmulas que o projecto declarou
invioláveis e de uma UX de conversão permanente.

---

## E. PERGUNTAS_KOKO_REVISTAS

### ⭐ Pergunta n.º 1 — continua a mais importante

Não perguntamos «usam decimais?» — pedimos o retrato por material. **Por cada
matéria-prima/material e por cada produto fabricado**, respondam:

1. **Como é comprado?** (ex. hipotéticos: à unidade, à folha/placa, ao rolo, ao
   pacote/resma, ao kg, ao litro, ao metro)
2. **Como é armazenado?** (na unidade de compra? aberto/desfeito?)
3. **Como é medido quando entra na produção?** (contam unidades? pesam? medem
   comprimento? "olhómetro"?)
4. **Em que unidade está escrito na vossa ficha técnica/receita?**
5. **Qual é a menor quantidade que precisam de registar?** (ex.: 1 folha? 0,5 m?
   50 g? 10 ml? nunca menos de 1 pacote?)
6. **Compram numa unidade e consomem noutra?** (ex. hipotético: compram rolo de 50 m
   e consomem 1,2 m por peça; compram saco de 25 kg e consomem 300 g por lote)
7. **Precisam de controlar sobras?** (o que volta ao armazém depois de um fabrico
   conta para o stock?)
8. **Precisam de controlar perdas?** (querem saber quanto se perdeu por fabrico?)
9. **Um pacote/rolo/placa pode ser parcialmente consumido?**
10. **Se sim, precisam de saber o saldo físico exacto do que ficou aberto** (ex.:
    restam 37,5 m do rolo), ou basta saber que há «1 rolo aberto»?

**Tabela para o cliente preencher** (uma linha por material/produto; exemplos
hipotéticos apenas ilustrativos — não assumimos que pertencem à KOKO):

| Material/produto | Unidade de compra | Unidade de consumo | Menor fracção necessária | Permite consumo parcial? |
|---|---|---|---|---|
| _ex.: cartão em placas_ | _placa 100×70_ | _placa ou meia placa_ | _0,5 placa_ | _sim_ |
| _ex.: cola_ | _bidão 5 L_ | _ml_ | _50 ml_ | _sim_ |
| _ex.: fita_ | _rolo 50 m_ | _metros_ | _0,1 m_ | _sim_ |
| _ex.: embalagem_ | _caixa de 100 un_ | _unidade_ | _1 un_ | _não_ |
| … | | | | |

A leitura técnica desta tabela decide entre: **nenhuma migração** (tudo inteiro /
embalagens completas), **Opção A** (fracções reais) ou discussão adicional (casos
mistos) — ver §F recomendação e §H.

As restantes perguntas de negócio (perdas A4/B1, etapas A5/C4, co-produtos A6,
especificação A7, vínculo às vendas A8/C1, custos adicionais B2, WIP B3, parciais B4,
armazéns B5, volume B6, papéis C2, relatórios C3) mantêm-se como em
`docs/REQUISITOS_KOKO.md`, sem alteração de conteúdo.

---

## F. CONFIRMACAO_DESENHO_APROVADO

### F.1 Produção (confirmado, sem implementar)

Single-step por defeito; **sem WIP contabilístico na V1**; consumo das matérias e
entrada do acabado na conclusão, numa única transacção; quantidade planeada e
produzida podem diferir; **perdas e recuperáveis preparados no modelo**
(`plannedQuantity`/`producedQuantity`/`lossQuantity`/`recoveredQuantity`) **sem
contabilização automática** até haver decisão; **etapas como conceito opcional**
(estrutura pronta, vazia — sem inventar as etapas da KOKO); **vínculo opcional
ordem↔documento de venda** sem reserva/consumo/cumprimento automático; **sem
conclusões parciais** até confirmação; **sem co-produtos** até confirmação; **sem
custos adicionais incorporados** até haver regra aprovada.

### F.2 Contabilidade (confirmado + proposta de rotulagem)

Contas 131 Mercadorias / **132 Matérias-primas** / **133 Produtos acabados**; diário
**DPR** (tipo novo `PRODUCTION`); evento de produção **apenas desenhado** — nenhuma
conta, mapping, enum ou código criado nesta ronda.

**Rotulagem do custo na V1 (proposta a aprovar):** enquanto o sistema capturar apenas
a soma dos materiais consumidos, a UI, os documentos imprimíveis, os relatórios e os
CSVs devem chamar-lhe **«Custo de materiais»** (ou «Custo directo de materiais») —
**nunca «Custo de produção» nem «Custo total»** — para não induzir a KOKO a formar
preços sobre um custo que exclui mão-de-obra e energia. Pontos concretos onde a regra
se aplica ao portar o design: o KPI do mock «Custo de produção» (`production.ts:41`)
é renomeado; a Ficha Técnica mostra «custo de materiais estimado (receita)»; a ordem
e o seu documento imprimível mostram «custo de materiais»; o `unitCost` da ordem
rotula-se «custo unitário de materiais». Quando os custos adicionais entrarem (regra
aprovada), o rótulo evolui para «Custo de produção (materiais + transformação)».

### F.3 RBAC (confirmado no código; proposta documentada)

Proposta mantida: **Administrador** — tudo por construção; **Gestor** —
`production.view`/`manage`/`complete`; **Contabilista** — `production.view`;
**Caixa** e **Vendedor** — nada.

Factos verificados no código (não assumidos):

- **Como os perfis canónicos recebem permissões:** o seed atribui ao perfil
  Administrador **todas** as permissões (`seed.ts:180-184`, `allPermissions`); os
  perfis Gestor/Contabilista/Caixa/Vendedor têm listas explícitas em `roleDefs`
  (`seed.ts:207-216`).
- **O re-seed substitui as permissões dos canónicos:** sim —
  `rolePermission.deleteMany` + `createMany` por perfil (`seed.ts:226-230`); basta
  acrescentar as chaves novas a `roleDefs` para o Gestor/Contabilista as herdarem em
  qualquer re-seed.
- **Perfis personalizados são preservados:** sim — o seed só faz upsert dos perfis
  pelo **nome** na empresa demo; qualquer outro perfil (ou empresa) não é tocado.
  Empresas de produção recebem permissões por provisionamento explícito (regra
  P0-01).
- **Impacto nos utilizadores existentes das empresas de teste** — com a nuance
  importante que o código revela: os **gates de servidor não precisam de re-login**
  — `getContext()` reconstrói as permissões **da BD a cada pedido**
  (`apps/web/src/lib/session.ts:32-42` → `validateSessionCompany` →
  `loadPermissions`, `packages/domain/src/auth.ts:101-125`). Mas a **sidebar lê as
  permissões do JWT** (`apps/web/src/app/(erp)/layout.tsx:36` passa
  `user.permissions` da sessão para `visibleNav`) — pelo que, após o seed, o Gestor
  já **passaria** nos gates `production.*` no servidor, mas **só vê a entrada
  «Produção» depois de terminar e reiniciar sessão**. O lembrete permanente do
  MODULE_STATUS aplica-se, com esta precisão de superfície.
- **Sidebar quando `production.view` existir:** o ecrã já está definido
  (`erp-nav.ts:71` — `production`, rota `/producao`, grupo Operações, ícone factory)
  mas **fora** de `NAV_GROUPS` (`erp-nav.ts:113-128`, remoção do fix pré-demo
  2026-07-07) e sem entrada em `NAV_PERMISSION` (`erp-nav.ts:99-110`). A reactivação
  na S12 é: adicionar `production` a `NAV_GROUPS` + `NAV_PERMISSION.production =
  'production.view'` — quem não tem a permissão continua sem ver o item
  (`visibleNav`, `erp-nav.ts:136-141`), e a página valida sempre no servidor
  (`requirePermission`), porque o frontend nunca é a fonte de verdade.
- lucia@ (Gestor, INACTIVE no seed — `seed.ts:238`) herdaria as chaves se
  reactivada; maria@/joao@/carlos@ (Caixa/Vendedor) não são afectados; ana@
  (Contabilista) ganharia `production.view`.

---

## G. DECISOES_PENDENTES

**Bloqueiam a S12-pre** (só existe se houver fracções):
- Resposta à pergunta n.º 1 (tabela por material) — decide se a S12-pre existe;
- Se existir: aprovação interna **Opção A vs. Opção D** (recomendação técnica: A —
  §F.4/§H) e da precisão (`Decimal(14,3)` vs. alternativa justificada);
- Regra de fracção por produto (que produtos aceitam quantidade decimal na entrada).

**Bloqueiam a S12a** (schema/fundações):
- Bloco A do questionário: catálogo real (A2), receita por lote vs. unidade (A3),
  campos de perdas a registar (A4), existência/forma das etapas (A5), co-produtos
  (A6), campos-núcleo da especificação (A7), alvo do vínculo às vendas (A8);
- Aprovações internas de implementação: SQL da migração (regra 🔒), enum
  `PRODUCTION` + diário DPR, contas 132/133 + mappings no seed, RBAC final
  `production.*`, registo em `COMPANY_SCOPED`.

**Bloqueiam a S12b** (custeio/conclusão):
- Perda no custo do acabado (B1 — por confirmar; contabilização alternativa por
  desenhar se o cliente a exigir); custos adicionais (B2); consumo antecipado/WIP
  (B3); conclusões parciais (B4); armazéns (B5); volume (B6);
- Aprovação da rotulagem «custo de materiais» (§F.2) e do mapa D/C final do evento
  `PRODUCTION_COMPLETED`.

**Bloqueiam a S12c** (fluxo KOKO):
- Comportamento do vínculo ordem↔venda (C1); papéis/aprovação (C2);
  relatórios/KPIs (C3); etapas reais e o que acontece em cada uma (C4);
- Desenho da anulação de produção concluída (padrão P0-03d/S10b) a apresentar antes
  de código.

---

## H. PROXIMO_PASSO_RECOMENDADO

**Não avançar já para S12-pre nem S12a.** O próximo passo é **enviar as
PERGUNTAS_KOKO_REVISTAS (§E, com a tabela por material) e aguardar pelo menos o
Bloco A** — a pergunta n.º 1 decide a existência e o conteúdo da S12-pre, e as A2–A8
moldam o schema da S12a; começar antes é desenhar às cegas.

Árvore de decisão condicionada (não decidimos pela KOKO):

- **Só unidades/embalagens completas** → **nenhuma migração**; S12a arranca
  directamente com quantidades `Int` (a opção mais segura para o MVP e sem custo).
- **Fracções expressáveis numa unidade-base prática** → tecnicamente preferimos a
  **Opção A** como S12-pre (fórmulas 🔒 intactas, risco visível); a **Opção D** só
  se mudar colunas de quantidade for vetado — aceitando reescrever as âncoras e a
  camada de conversão permanente.
- **Fracções não convertíveis de forma estável** (medidas contínuas, precisão
  variável) → **Opção A é a única** tecnicamente defensável.
- **Várias unidades de compra vs. consumo para o mesmo produto** → independentemente
  do armazenamento, acrescenta-se conversão **ao nível do documento/UI** (comprar
  «rolo de 50 m», stock em metros) — funcionalidade sobre a Opção A, não alternativa
  a ela.
- **Rejeitadas em qualquer cenário:** B (perda de precisão silenciosa e não testada
  com custos a 2 casas) e C (duas representações + divergência estrutural
  produção↔stock).

**Provas exigidas antes de qualquer migração (se a Opção A for aprovada):**
branch descartável de medição (o typecheck enumera o raio real de `Number()`);
replay integral das âncoras (cogs, regularização, statements) sem alteração de
fórmula; casos novos: linha fraccionária no `computeLine`, recepção fraccionária no
recálculo do avgCost, venda fraccionária no CMV, contagem fraccionária na S9;
verificação de exibição/CSV/impressão com 3 casas; ensaio de migração + rollback em
staging com backup prévio (regra P0-07). Critério de saída: agregado accounting
completo + todas as suites + build verdes.

---

_Fim do relatório S12.0. Parado para aprovação — nenhuma implementação foi iniciada._
