# ROADMAP — Próximas Atividades do ERP

> **Instruções para o Claude Code — LER PRIMEIRO**
>
> 1. Lê `CLAUDE.md` (decisões arquitecturais) e `MODULE_STATUS.md` (estado actual) antes de qualquer alteração.
> 2. Implementa **apenas a sessão indicada no prompt**. Nunca avances para a sessão seguinte sem instrução explícita.
> 3. Respeita os **pontos de aprovação obrigatória (🔒)** listados em cada sessão: apresenta o plano e pára até receber aprovação.
> 4. Toda a query Prisma passa por `forCompany(companyId)` / `forContext(ctx)`. Sem excepções.
> 5. No fim da sessão, actualiza `MODULE_STATUS.md`: o que foi feito, decisões tomadas, próximos passos.
> 6. Nunca corras migrations destrutivas, não adiciones dependências novas nem alteres auth/RBAC sem aprovação explícita.

## Regras globais de aprovação (🔒)

Parar e pedir aprovação antes de:

- Alterações de schema Prisma / migrations;
- Qualquer alteração à lógica de lançamentos contabilísticos (journal entries) ou de custeio (weighted-average);
- Operações destrutivas na BD;
- Novas dependências ou major version bumps;
- Alterações a auth/RBAC/permissões.

## Níveis de risco

| Nível | Significado | Supervisão |
|---|---|---|
| 🔴 ALTO | Dinheiro, contabilidade, stock | Plano aprovado antes de código; diff revisto; testes obrigatórios |
| 🟡 MÉDIO | Schema, workflows, documentos | Plano apresentado; revisão do diff |
| 🟢 BAIXO | UI, nomenclatura, listagens | Pode correr com pouca supervisão |

---

## Ordem de execução das sessões

Quick wins primeiro (validar o fluxo de trabalho), depois fundações (dados da empresa, documentos), por fim os módulos críticos (contabilidade, produção).

`S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10 → S11` concluídas.

**Ordem actual (2026-07-22):** `S15 ✅ → S16 ✅ → S17 ✅ → S18` (backlog do cliente,
prioridades 1–4) → depois `S12 ⏸ (quando a KOKO responder) → S13 → S14`.

---

## Sessão S1 — Nomenclatura e Relatórios 🟢

*(Prioridade 12 + renomeação da Prioridade 1)*

- [x] No Relatório Diário: substituir **Sobra** → **Excedente** e **Falta** → **Déficit**.
- [x] Renomear **Diário** → **Extrato Diário** (UI, rotas, labels — não renomear tabelas/colunas da BD).
- [x] Rever nomenclatura em todo o sistema para consistência (apenas strings de UI; produzir lista de alterações no fim).

**Critério de conclusão:** grep sem ocorrências dos termos antigos na UI; nenhuma alteração de schema.

---

## Sessão S2 — Dropdowns pesquisáveis 🟢

*(Prioridade 10)*

- [x] Criar/normalizar um componente único de dropdown com pesquisa (combobox shadcn/ui).
- [x] Aplicar em: Produtos, Clientes, Fornecedores, Contas, Armazéns.
- [x] Para listas grandes, pesquisa server-side com debounce (não carregar tudo para o cliente).

**Critério de conclusão:** todos os cinco dropdowns pesquisáveis; sem regressão nos formulários existentes.

---

## Sessão S3 — Lista de Produtos 🟢

*(Prioridade 11)*

- [x] Selector de visualização: Top 10 / Top 50 / Top 100 / Todos.
- [x] "Todos" com paginação server-side (nunca carregar a tabela inteira).
- [x] Pesquisa rápida na listagem.

---

## Sessão S4 — Dados da Empresa 🟡

*(Prioridade 6)*

🔒 **Aprovação:** alterações de schema (campos novos na entidade Company).

- [x] Campos por empresa: logótipo, nome, NUIT, endereço, telefone, email, website (opcional), contas bancárias (lista), carteiras móveis (M-Pesa, e-Mola, etc.).
- [x] Upload e armazenamento do logótipo.
- [x] Ecrã de configuração da empresa.
- [x] Estes dados devem alimentar automaticamente o cabeçalho de todos os documentos (preparar um `CompanyHeader` reutilizável para a S5).
- [x] Logótipo na interface (sidebar/topbar) respeitando o tenant activo.

**Nota multi-tenant:** dados e logótipo são por empresa; verificar isolamento no upload e na leitura.

---

## Sessão S5 — Documentos Comerciais 🟡

*(Prioridade 4)*

- [x] Layout base único de documento (usa o `CompanyHeader` da S4).
- [x] Emissão de: Fatura, Recibo, Nota de Crédito, Nota de Débito, Cotação, Ordem de Compra.
- [x] Mesmo padrão visual em todos; impressão/PDF consistente.

🔒 **Aprovação:** se Nota de Crédito/Débito gerarem lançamentos contabilísticos, o desenho desses lançamentos é aprovado antes de código (regras da S10 aplicam-se). *(Cumprido: mapa D/C das NC/ND aprovado em 2026-07-18 — NC: D 411/D 221/C 121; ND: D 121/C 411/C 221; par 131/CMV da devolução adiado para a S10 por decisão aprovada.)*

---

## Sessão S6 — Melhorias na Fatura 🟡

*(Prioridade 5)*

🔒 **Aprovação:** schema (estado de rascunho, tabela de histórico/auditoria) e regras de cancelamento. *(Cumprido: matriz de cancelamento, migration `s6_invoice_drafts` e numeração RASC aprovadas em 2026-07-18.)*

- [x] Botão **Gravar como Rascunho**; rascunho editável posteriormente (`/facturas/nova?rascunho=<id>`).
- [x] Rascunho **não** gera lançamentos contabilísticos nem movimenta stock — só na emissão. *(Também não altera saldo do cliente nem consome número FT; invisível em KPIs/extractos/relatórios via `ACTIVE_INVOICE_STATUSES`.)*
- [x] Histórico de alterações (audit log da fatura). *(Sem tabela nova: `AuditLog` existente + cartão «Histórico» no documento — criação/edição/emissão/descartar/cancelamento.)*
- [x] Cancelamento com registo obrigatório de: utilizador, data, hora, motivo. *(Já existia da P0-03a; S6 acrescenta nome do responsável + hora no documento e o descarte de rascunho com o mesmo registo.)*
- [x] Cancelamento de fatura emitida → estorno contabilístico (reversal), nunca delete. 🔒 Desenho do estorno aprovado antes de implementar. *(Reutilizado o `cancelInvoice` da P0-03a sem alterações à lógica do estorno; matriz aprovada.)*
- [x] Numeração: definir se rascunhos consomem número de série ou só na emissão (decisão a aprovar). *(Aprovado: série própria `RASC` no `DocumentCounter`; o número FT só é consumido na emissão — sem buracos na série FT; `draftNumber` preserva a origem.)*

---

## Sessão S7 — Fluxo de Ordem de Compra 🟡

*(Prioridade 7)*

- [x] Estados: Criada → **Aguardando Aprovação** → Aprovada (por Gestor ou Gestor Financeiro) → devolvida ao solicitante → Receção de Mercadorias. *(Enum `PurchaseStatus` + `PENDING_APPROVAL`/`APPROVED`/`REJECTED`; a recepção exige `APPROVED`/`PARTIAL`; rejeição aprovada como estado terminal com motivo ≥ 10 chars; OCs legadas `SENT` → `APPROVED` por backfill aprovado.)*
- [x] 🔒 Verificação de papel (RBAC) na aprovação — qualquer alteração a permissões é aprovada antes. *(Cumprido sem alterações de RBAC: usa a permissão existente `purchases.approve`, já atribuída a Administrador e Gestor no seed; «Gestor Financeiro» fica como papel futuro com esta permissão.)*
- [x] Campo **Observações** na Receção de Mercadorias. *(`purchase_receipts.notes` já existia no domínio; adicionado o campo na UI da recepção e a exibição no histórico de recepções da OC.)*
- [x] Notificação/indicação visual ao solicitante quando aprovada. *(Sem sistema novo: chip-contador «N ordens suas foram aprovadas — prontas a recepcionar» + destaque das linhas na lista; chip simétrico «N aguardam a sua aprovação» para quem tem `purchases.approve`; KPI «Aguardam aprovação».)*

---

## Sessão S8 — Produtos: criação com stock inicial 🟡

*(Prioridade 9)*

🔒 **Aprovação:** o stock inicial gera movimento de stock e lançamento contabilístico de abertura — desenho aprovado antes de código. *(Cumprido: mapa D/C aprovado em 2026-07-18 — D 131 Mercadorias / C 312 «Regularização de abertura de existências», conta EQUITY nova com mapping `OPENING_BALANCE_EQUITY`, diário de Abertura `DAB`/`AB`, sem IVA porque não há fornecedor; sem conta de fallback — mapping em falta faz a operação falhar por inteiro com mensagem clara.)*

- [x] Ao criar produto: definir quantidade inicial e armazém. *(Secção «Stock inicial (opcional)» no dialog de criação — quantidade, custo unitário e armazém, os três obrigatórios em conjunto; sem os campos o produto é criado como antes, com zero efeitos; produto existente não ganha o fluxo — ajustes são âmbito da S9.)*
- [x] Quantidade inicial entra como movimento de stock normal (com custo unitário para o weighted-average), não como valor "mágico" no campo de quantidade. *(`StockMovement IN` «Stock inicial» + `StockLevel`; avgCost = custo unitário informado — primeira entrada define o custo médio e o valor do lançamento é o mesmo cálculo `quantidade × custo` na mesma transacção; idempotência com scope próprio `PRODUCT_CREATE`; evento `PRODUCT_OPENING_STOCK` idempotente por produto.)*

---

## Sessão S9 — Inventário em duas etapas 🔴

*(Prioridade 8)*

🔒 **Aprovação:** plano completo antes de código (schema + lógica de ajuste). *(Cumprido: plano completo aprovado em 2026-07-18 — modelo `StockCount`/`StockCountLine`, permissões contar=`stock.view`/validar=`stock.adjust` sem RBAC novo, regra de concorrência, mapa D/C e valorização.)*

- [x] Estado **Rascunho**: contagem gravada sem efeito no stock. *(Série própria `CI` no `DocumentCounter`; snapshot `systemQty` por linha; zero efeitos em stock/custo médio/contabilidade; editável com refresh de snapshots; descartável com motivo ≥ 10 chars — padrão S6; nunca se apaga.)*
- [x] Estado **Validado**: só aqui o stock é ajustado. *(Gate `stock.adjust`; lock `FOR UPDATE` na contagem + produtos + níveis de stock; terminal.)*
- [x] Ajustes na validação geram movimentos de stock e lançamentos contabilísticos (ligação à S10). *(`StockMovement ADJUST` com `stockCountId` por linha com diferença; lançamento único no Diário de Ajustamentos `DAJ`/`AJ`: Excedente D 131/C 421 `INVENTORY_SURPLUS`, Déficit D 551 `INVENTORY_SHORTAGE`/C 131 — nunca a 511 CMV, reservada à S10; valorização ao avgCost corrente da validação; avgCost fica intacto nos dois sentidos; sem fallback de mapping.)*
- [x] Concorrência: se o stock mudou entre a contagem e a validação, definir regra (recontagem vs. ajuste pela diferença) — decisão a aprovar. *(Aprovada: **delta vs. snapshot** — `diff = contado − systemQty(snapshot)` aplicado sobre o stock corrente sob lock; se ficasse negativo (produto vendido abaixo do contado), a validação falha por inteiro com os produtos listados — editar/recontar refresca o snapshot; UI avisa divergências antes de validar.)*
- [x] Testes: validação idempotente (validar duas vezes não duplica ajustes). *(Scope próprio `STOCK_COUNT_VALIDATE` + evento `STOCK_COUNT_VALIDATED` naturalmente único; suite `test:integration:stock:counts` 14/14.)*

---

## Sessão S10 — Contabilidade: lançamentos 🔴

*(Prioridade 1, parte A — a mais crítica de todo o roadmap)*

🔒 **Aprovação:** mapa débito/crédito de cada tipo de lançamento aprovado ANTES de qualquer código. Nenhuma alteração à lógica existente de journal entries sem aprovação explícita.

- [x] Finalizar lançamentos manuais (validação: balanceados, período aberto, contas válidas). *(Concluído na **S10c** (2026-07-19): UI completa em `/contabilidade/lancamentos` sobre o domínio 8b sem alterações — formulário de rascunho (diário, data, linhas D/C com combobox de contas da S2, descrição, referência), lista de rascunhos com Editar/Confirmar/Eliminar, lista de confirmados com Estornar; gates existentes `accounting.prepare`/`post`/`reverse`; mensagens do domínio expostas tal-qual (desbalanceado, período fechado, conta inactiva).)*
- [x] Lançamentos automáticos a partir de: Vendas, Compras, Recebimento de mercadorias, Pagamentos, Recebimentos, Produção, Inventário, Ajustes de stock. *(Todas as fontes existentes lançam desde 8c/S8/S9/S10a-b; Produção não existe ainda — liga-se na S12 pelo mesmo mecanismo idempotente.)*
- [x] Introduzir CMV na venda (D CMV / C Existências) **e** o par da devolução nas NCs com devolução de stock (D Existências / C CMV ao `unitCost` snapshot das linhas) — os dois lados na mesma sessão, com teste de coerência da conta 131 contra o stock físico. *(Concluído na **S10a** (2026-07-18): evento separado `COGS_POSTED` D 511/C 131 ao snapshot `invoice_lines.unitCost` capturado na emissão (Nova Factura, POS e emissão de rascunho — `SALE_ISSUED` intacto byte-a-byte); par `CREDIT_NOTE_COGS_REVERSED` D 131/C 511 ao `unitCost` snapshot das linhas da NC; `cancelInvoice` estorna também o `COGS_POSTED` quando existe (facturas pré-S10a sem CMV cancelam sem erro); teste-âncora de coerência 131 = stock físico cruza `PRODUCT_OPENING_STOCK` (S8) + compras + CMV + par da NC + cancelamento + `STOCK_COUNT_VALIDATED` (S9) — suite `test:integration:accounting:cogs` 14/14. Retroactivo aprovado: data de corte — facturas antigas ficam sem CMV; regularização única genérica fica para a S10c.)*
- [x] Mapear conta de **Outros proveitos** para as ND (juros, portes) em vez de 411 Vendas — migrar ou reclassificar as ND já emitidas se necessário. *(Concluído na **S10b** (2026-07-19): conta 422 «Outros proveitos operacionais» + mapping `OTHER_INCOME` no seed canónico (45 contas/19 mappings); `createDebitNote` credita 422 sem fallback. Decisão aprovada: a ND histórica em 411 — ND 2026/0001, base 150,00 MT — fica como verdade histórica documentada, sem reclassificação.)*
- [x] **Fluxo de anulação de Nota de Crédito** (estorno simétrico do `CREDIT_NOTE_ISSUED` + reversão da devolução de stock) — desbloqueia o cancelamento de faturas com NC, hoje impedido por guard conservador (`invoices.ts:1331`). *(Concluído na **S10b** (2026-07-19): `cancelCreditNote` com gate `invoices.cancel`, idempotência `CREDIT_NOTE_CANCEL`, OUT compensatórios `reversesId`→IN da devolução com falha total se a mercadoria entretanto saiu, estorno dos DOIS eventos da NC (espelho + par do CMV quando existe), avgCost intacto; factura com NC anulada volta a ser cancelável — o guard filtra `ISSUED` e a mensagem indica os números das NCs; migrações `s10b_credit_note_cancellation` + backfill; suite `test:integration:accounting:nc-cancel` 12/12.)*
- [x] Cada fonte: idempotente (chave de origem única — reprocessar não duplica). *(Idempotência contabilística por `(sourceType, sourceId, accountingEvent)` + idempotência operacional `OperationIdempotency`; a S10c fecha a última fonte com o scope novo `INVENTORY_REGULARIZATION` e o evento `INVENTORY_REGULARIZED`.)*
- [x] Testes unitários por tipo de lançamento: débito = crédito, contas correctas, valores correctos. *(Agregado `test:integration:accounting` 240/240 cobre todos os tipos de lançamento — equilíbrio, contas mapeadas sem fallback, valores e estornos.)*

**Divisão aprovada (2026-07-18)** — três sub-sessões em branches próprias, cada uma só com instrução explícita:

- **S10a — CMV ponta-a-ponta** ✅ *(concluída em 2026-07-18; ver checkbox do CMV acima.)*
- **S10b — Anulação de NC + ND→Outros proveitos** ✅ *(concluída em 2026-07-19; ver as duas checkboxes acima. Ordem dos locks do `cancelCreditNote` documentada no MODULE_STATUS — compatível com `cancelInvoice`: ambos serializam primeiro na linha da factura.)*
- **S10c — Lançamentos manuais + retroactivo** ✅ *(concluída em 2026-07-19: UI dos lançamentos manuais sobre o domínio 8b intacto; operação genérica `getInventoryRegularizationPreview`/`executeInventoryRegularization` — gate `accounting.post`, scope `INVENTORY_REGULARIZATION`, evento `INVENTORY_REGULARIZED`, D 131/C 312 (ou o inverso) no `DAB`, valor SEMPRE recalculado na execução com falha total se divergir do confirmado; executada ao vivo na demo: divergência 311 411,00 MT lançada como `AB 2026/0002` e divergência final = 0 — a coerência 131 = stock físico passa a reconciliar também na empresa demo. **S10 COMPLETA.**)*

*(Sugestão original: S10a manuais + vendas/compras; S10b pagamentos/recebimentos/receção; S10c produção/inventário/ajustes — substituída porque o levantamento mostrou que pagamentos/recebimentos/receção já lançam desde a 8c e produção é âmbito da S12.)*

---

## Sessão S11 — Contabilidade: relatórios 🔴

*(Prioridade 1, parte B)*

- [x] Balancete:
  - remover **Saldo Inicial** da visualização padrão (mantém-se disponível como coluna opcional);
  - selector de colunas para impressão/exportação. *(Colunas no URL `cols=…` — comandam ecrã, impressão e CSV de uma vez; Conta/Nome sempre presentes; `parseTrialBalanceColumns` com ordem canónica.)*
- [x] Demonstração de Resultados. *(Por naturezas, grupos de nível 2 do plano via `parentId` — 41 líquida de NC, 42 = 421 Excedentes + 422 Outros proveitos, 51 CMV líquido da devolução, 53/54/55; Excedente/Déficit da S1.)*
- [x] Demonstração do Fluxo de Caixa. *(Método **directo sobre o razão** — decisão aprovada 2026-07-19: os movimentos manuais de Tesouraria não lançam na contabilidade, pelo que só o razão fecha com o Balanço; rubricas por `accountingEvent`, estornos na rubrica do original via `reversalOf`, manuais pela contrapartida (EQUITY → financiamento), transferências caixa↔caixa excluídas; nota de reconciliação com a Tesouraria no rodapé.)*
- [x] Balanço Patrimonial. *(Posição «à data de»; secções por `accountType` + grupos por `parentId`; 312 no grupo 31 Capital; resultado por apurar em DUAS linhas calculadas — exercícios anteriores vs. exercício corrente, corte no início do exercício que contém a data — por `groupBy` próprio das classes 4/5, nunca copiado da DR.)*
- [x] Validação cruzada: Balanço fecha (Activo = Passivo + Capital); Resultado do exercício consistente entre DR e Balanço. *(Teste-âncora a TRÊS pontas na suite `test:integration:accounting:statements` 14/14: valor calculado à mão a partir do cenário == DR == linha do Capital do Balanço, com secções também verificadas contra valores à mão e DFC com caixa final = grupo 11; badges de validação ao vivo na página.)*

---

## Sessão S12 — Módulo de Produção 🔴 ⏸ EM ESPERA

*(Prioridade 2 — **em espera desde 2026-07-22**: aguarda as respostas do cliente KOKO ao
questionário `docs/REQUISITOS_KOKO.md`; desenho aprovado registado em
`docs/S12_0_RELATORIO_TECNICO.md`; trabalho em curso parqueado na branch `s12-producao`
— catálogo demo KOKO + filtro ACTIVE no catálogo. Não retomar sem instrução explícita.)*

🔒 **Aprovação:** modelo de custeio da produção (consumo a custo médio ponderado → custo do produto acabado) e respectivos lançamentos contabilísticos aprovados antes de código.

- [ ] Ordem de produção: consumo de matérias-primas (baixa de stock ao custo médio).
- [ ] Entrada de produto acabado com custo = soma dos consumos (+ custos adicionais, se definidos).
- [ ] Movimentação automática de stock (atenção a race conditions — decremento atómico).
- [ ] Integração automática com a contabilidade (via mecanismo da S10, idempotente).
- [ ] Fluxo específico do cliente **KOKO**: levantar requisitos em detalhe no início da sessão e confirmar antes de implementar.
- [ ] Testes: custo do acabado bate com consumos; stock nunca negativo; lançamentos balanceados.

---

## Sessão S13 — Recursos Humanos 🟡

*(Prioridade 3 — módulo novo)*

🔒 **Aprovação:** schema completo do módulo antes de código.

- [ ] Cadastro de funcionários, cargos, departamentos.
- [ ] Salários e histórico salarial.
- [ ] Processamento salarial (primeira versão: cálculo simples + registo; integração contabilística do processamento é 🔒 e pode ficar para iteração seguinte).
- [ ] Multi-tenant: funcionários isolados por empresa como qualquer outra entidade.

---

## Sessão S14 — Melhorias Gerais 🟢/🟡

*(Prioridade 13 — fazer por último, com o sistema funcional)*

- [ ] Logótipo da empresa em toda a aplicação (completar o iniciado na S4).
- [ ] Consistência de layouts, formulários, navegação.
- [ ] Rever validações (client + server).
- [ ] 🔒 Rever permissões — qualquer alteração a RBAC é aprovada antes.
- [ ] Desempenho: identificar queries lentas primeiro (medir antes de optimizar), depois propor correcções.
- [ ] 🔒 **Integração tesouraria↔razão dos movimentos manuais** (pendência registada na S11): depósitos, levantamentos, despesas/receitas manuais e transferências de Tesouraria não geram lançamentos contabilísticos, pelo que a reconciliação da DFC mostra divergência (na demo: 6 280,64 MT em 2026-07-19). Ligar estes movimentos ao razão pelo mecanismo idempotente da 8c (mapa D/C aprovado antes de código — mesma regra da S10); quando fechar, a nota de reconciliação da DFC deve passar a 0 nos períodos novos.

---

# Backlog do cliente (2026-07-22) — Sessões S15–S18

Requisitos entregues pelo cliente em 2026-07-22, organizados nas 4 prioridades
recomendadas por ele. Estas sessões passam à frente de S12 (em espera), S13 e S14.

## Sessão S15 — Documentos de Venda 🔴

*(Backlog Prioridade 1 — em curso na branch `s15-documentos-venda`)*

🔒 **Aprovação (dada em 2026-07-22, com o plano da sessão):** a VD é uma `Invoice` com
`documentType = 'VD'` e série própria `VD`; contabilidade idêntica à factura (mesmos
eventos idempotentes `SALE_ISSUED` + `COGS_POSTED` + `RECEIPT_POSTED`); migração aditiva
única (`documentType`, `viaCount`, backfill «Cliente final» → «Cliente Geral»); zero RBAC.

- [ ] POS: venda ao **Cliente Geral** emite **VD — Venda a Dinheiro** (série e numeração
      próprias); venda a cliente identificado no POS continua a emitir FT (decisão 2026-07-22).
- [ ] Renomear o cliente padrão do POS: «Cliente final» → «Cliente Geral».
- [ ] Dados bancários da empresa **apenas na factura**, no fundo do documento (depois de
      linhas, totais, IVA e líquido); removidos do cabeçalho de todos os outros documentos
      (recibo, VD, NC, ND, cotação, OC).
- [ ] Separação factura/recibo: a impressão da factura mostra os recibos apenas como
      referências (número, data, valor); cada recibo é documento independente; **lista de
      recibos** nova com filtros (nº, cliente, data, factura, método, estado).
- [ ] Segunda/terceira/demais vias da factura: banner «SEGUNDA VIA»/«TERCEIRA VIA»/… no
      topo, sem nova numeração/valores/datas/estado; registo no histórico (via, data/hora,
      utilizador, motivo quando informado).
- [ ] Lista de facturas: filtros Activas / Pagas / Parciais / Pendentes / Canceladas /
      Todas; canceladas com identificação visual e fora dos totais (KPIs já as excluem).
- [ ] Testes: série VD independente da FT; contabilidade da VD balanceada e igual à FT;
      vias sem efeitos no documento; lista de recibos com isolamento e permissões.

## Sessão S16 — Relatório de Vendas + Exportação Excel 🟡

*(Backlog Prioridade 2 — ✅ concluída em 2026-07-22 na branch `s16-relatorio-vendas`;
fica em aberto apenas a adopção incremental do XLSX nas restantes tabelas, ver última
checkbox)*

🔒 **Aprovação (dada em 2026-07-22, com o plano da sessão):** dependência nova **exceljs**,
instalada apenas no workspace server (`@ants/domain`); geração XLSX server-side; IVA dos
valores reais por documento (não `total ÷ 1,16`); zero migrações, zero RBAC novo.

- [x] Relatório de vendas conforme o modelo «Relatório de Venda.xlsx»: colunas Data /
      Descrição (ex.: «VD 2026/0001», «Factura 2026/0098») / Total / IVA / Valor Líquido;
      Grupo 1 VD + Sub-Total, Grupo 2 Facturas + Sub-Total, TOTAL GERAL; cancelados fora
      dos totais por omissão, com opção de os mostrar identificados. *(Página nova
      `/relatorios/vendas` — domínio `getSalesReport` gate `sales.view`; IVA/líquido dos
      valores REAIS por documento (`taxTotal`/`taxableBase` das linhas na emissão), nunca
      `total ÷ 1,16`; invariante `total = IVA + líquido` verificado em teste por linha e
      agregados; rascunhos nunca aparecem; cancelados rasurados + badge, fora de todos os
      subtotais e do total geral; ordenação clicável Data/Descrição/Total asc/desc.)*
- [x] Filtros: período, tipo de documento, nº, cliente, vendedor/utilizador, estado.
      *(Default mês corrente; tipo Todos/VD/Facturas; pesquisa por nº case-insensitive;
      cliente via `SearchCombobox`; vendedor = `Invoice.createdBy`; estado Activos
      default/Cancelados/Todos. Loja/filial fica pendente: `Invoice.branchId` existe mas
      só é preenchido quando a sessão tem filial activa — decidir semântica antes de
      expor o filtro, sem inventar schema.)*
- [x] Exportação para Excel do relatório de vendas no formato do modelo. *(Route handler
      GET `/relatorios/vendas/exportar` com os mesmos query params da página → mesma
      fonte de dados, zero divergência sistema/Excel; gate `reports.export`;
      `Content-Disposition` `relatorio-vendas-{de}-{até}.xlsx`.)*
- [ ] «Exportar para Excel» em todas as tabelas de relatórios (respeita filtros, período,
      ordenação e empresa; título/empresa/período/data/utilizador no cabeçalho; valores
      monetários como números). *(Infra-estrutura CONCLUÍDA na S16: helper genérico
      `exportTableToXlsx` em `@ants/domain` — colunas tipadas text/money/number/date,
      money como NÚMERO com `numFmt '#,##0.00'`, datas como célula de data, cabeçalho
      título/empresa/período/utilizador/data, grupos com sub-totais e total geral
      destacados, testado isoladamente com reabertura exceljs. A adopção nas restantes
      tabelas é incremental — a S18 já a reutiliza para as listagens de stock e
      contabilidade.)*

## Sessão S17 — Notas, Adiantamentos e Devoluções 🔴

*(Backlog Prioridade 3 — ✅ concluída em 2026-07-22 na branch `s17-notas-devolucoes`)*

🔒 **Aprovação:** mapa D/C contabilístico do adiantamento e da devolução antes de código.
*(Cumprido: mapa D/C aprovado com o plano da sessão em 2026-07-22 — `ADVANCE_RECEIVED`
D Caixa/Banco / C 241 «Adiantamentos de clientes» (conta nova aprovada: grupo 24 «Outros
credores» + 241, mapping `CUSTOMER_ADVANCES`); `ADVANCE_APPLIED` D 241 / C 121;
`REFUND_ISSUED` D 241 ou D 121 (conforme a origem) / C Caixa/Banco. Sem IVA no RA —
o IVA nasce todo na factura.)*

- [x] Verificar NC (item já coberto pela S5: linhas da factura em tabela com tectos por
      linha) e estender a NC sobre VD; descrição composta a partir dos produtos.
      *(Verificado sem alterações: a VD é uma `Invoice` e `createCreditNote` não
      discrimina o tipo — a NC sobre VD já funciona; a tabela de produtos com tectos por
      linha e descrições herdadas das linhas da factura existem desde a S5.)*
- [x] **Recibo de Adiantamento**: pagamento sem factura, registado e utilizável depois
      para liquidar facturas total/parcialmente. *(Modelo próprio `CustomerAdvance`
      série `RA` — decisão: documento próprio em vez de `Payment` sem factura, para
      acumulados aplicado/devolvido e estado derivado ABERTO/PARCIAL/CONSUMIDO/DEVOLVIDO;
      aplicação a factura gera REC normal com método novo «Adiantamento» (enum `ADVANCE`)
      SEM novo movimento de tesouraria, via `CustomerAdvanceApplication` (N aplicações
      por RA) sob `FOR UPDATE`; extracto do cliente com secção própria de adiantamentos
      separada do saldo devedor; documento imprimível sem dados bancários — regra S15.)*
- [x] **Devolução ao Cliente**: documento próprio que justifica a devolução de dinheiro —
      movimento de tesouraria, conta corrente, contabilidade e stock quando houver
      devolução física; distinguir devolução de produtos/dinheiro, parcial/total.
      *(Modelo `CustomerRefund` série `DEV`, origens ADVANCE/CREDIT_NOTE/RECEIPT;
      regra aprovada: a NC é a ÚNICA fonte de reversão de venda e stock — a Devolução
      trata só do dinheiro e lista os produtos da NC a título informativo; saldo credor
      validado sob `FOR UPDATE` com tecto por documento de origem; parcial/total é só o
      valor face ao crédito disponível.)*
- [x] **Pendência registada:** validar o tratamento de IVA em adiantamentos com o
      contabilista do cliente (hoje o RA não liquida IVA — o imposto nasce todo na
      factura, no `SALE_ISSUED`; se a legislação exigir IVA na recepção do adiantamento,
      desenhar o mecanismo em sessão própria com mapa D/C aprovado).

## Sessão S18 — Stock e Contabilidade (backlog) 🟡

*(Backlog Prioridade 4)*

- [ ] Lista de produtos sem stock, imprimível como folha de contagem física: Código /
      Produto / Categoria / Armazém / Stock no Sistema / Quantidade Contada (vazia no
      impresso) / Diferença / Observações; filtros por armazém, categoria, produto, sem
      stock, negativos, inactivos, todos.
- [ ] Balancete: filtro por classe contabilística; opção contas com/sem movimento (já tem
      Saldo Inicial/Débito/Crédito/Saldo Final e selector de colunas da S11).
- [ ] Razão Geral: variante «todas as contas» (hoje só uma conta de cada vez; saldo
      inicial/acumulado/totais já existem).
- [ ] Impressão + exportação Excel destas listagens (reutiliza a infra-estrutura da S16).

---

## Prompt-modelo por sessão

```
Lê CLAUDE.md, MODULE_STATUS.md e ROADMAP.md.

Implementa APENAS a Sessão S<N> do ROADMAP.md.

Antes de escrever código:
1. Apresenta o plano de implementação;
2. Lista alterações de schema/migrations (se houver) e espera aprovação;
3. Respeita todos os pontos 🔒 da sessão.

No fim:
- Corre os testes;
- Actualiza MODULE_STATUS.md com o que foi feito e os próximos passos;
- Lista os ficheiros alterados e qualquer decisão tomada.
```

## Objetivo final

Com todas as sessões concluídas, o ERP fica pronto para demonstrações comerciais, uso em ambiente real e evolução dos restantes módulos.
