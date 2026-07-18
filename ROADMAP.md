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

`S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10 → S11 → S12 → S13 → S14`

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

- [ ] Finalizar lançamentos manuais (validação: balanceados, período aberto, contas válidas).
- [ ] Lançamentos automáticos a partir de: Vendas, Compras, Recebimento de mercadorias, Pagamentos, Recebimentos, Produção, Inventário, Ajustes de stock.
- [ ] Introduzir CMV na venda (D CMV / C Existências) **e** o par da devolução nas NCs com devolução de stock (D Existências / C CMV ao `unitCost` snapshot das linhas) — os dois lados na mesma sessão, com teste de coerência da conta 131 contra o stock físico. *(Decisão da S5: a NC lança só o espelho da venda 411/221/121 até esta sessão. Decisão da S8: o teste de coerência 131 vs. stock físico deve incluir também os movimentos de abertura de stock inicial — lançamentos `PRODUCT_OPENING_STOCK` do diário `DAB` —, não só as compras. Decisão da S9: idem para os ajustes de inventário — lançamentos `STOCK_COUNT_VALIDATED` do diário `DAJ` (excedentes debitam e déficits creditam a 131).)*
- [ ] Mapear conta de **Outros proveitos** para as ND (juros, portes) em vez de 411 Vendas — migrar ou reclassificar as ND já emitidas se necessário. *(Limitação declarada da S5: sem conta mapeada, a ND credita 411.)*
- [ ] **Fluxo de anulação de Nota de Crédito** (estorno simétrico do `CREDIT_NOTE_ISSUED` + reversão da devolução de stock) — desbloqueia o cancelamento de faturas com NC, hoje impedido por guard conservador (`invoices.ts:1331`).
- [ ] Cada fonte: idempotente (chave de origem única — reprocessar não duplica).
- [ ] Testes unitários por tipo de lançamento: débito = crédito, contas correctas, valores correctos.

**Sugestão de divisão se a sessão crescer demasiado:** S10a manuais + vendas/compras; S10b pagamentos/recebimentos/receção; S10c produção/inventário/ajustes.

---

## Sessão S11 — Contabilidade: relatórios 🔴

*(Prioridade 1, parte B)*

- [ ] Balancete:
  - remover **Saldo Inicial** da visualização padrão (mantém-se disponível como coluna opcional);
  - selector de colunas para impressão/exportação.
- [ ] Demonstração de Resultados.
- [ ] Demonstração do Fluxo de Caixa.
- [ ] Balanço Patrimonial.
- [ ] Validação cruzada: Balanço fecha (Activo = Passivo + Capital); Resultado do exercício consistente entre DR e Balanço.

---

## Sessão S12 — Módulo de Produção 🔴

*(Prioridade 2)*

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
