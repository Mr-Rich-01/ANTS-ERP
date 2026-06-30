# MODULE_STATUS — ANTS ERP

_Última actualização: 2026-06-30_

Estado vivo do projecto. O conhecimento permanente (arquitectura, regras, comandos) está
em [`CLAUDE.md`](CLAUDE.md).

**Último commit funcional:** este commit (`feat(accounting): integrate invoices and customer receipts`)
**Fase concluída:** `8c.2b — Integração contabilística de factura e recibo`
**Próximo passo:** `8c.3 — Fornecedores e compras`

---

## 🧭 Estado num relance

| Fase | Módulo | Estado |
|------|--------|--------|
| 1 | Auth, RBAC, isolamento Prisma (`forCompany`/`forContext`), auditoria, Admin CRUD | ✅ |
| 2 | Clientes ponta-a-ponta | ✅ |
| 3 | Fornecedores ponta-a-ponta | ✅ |
| 4 | Produtos & Stock multi-armazém (catálogo, inventário, custo médio ponderado) | ✅ |
| 5 | Vendas / Facturação (Invoice + Payment, bloqueio de stock, extracto do cliente) | ✅ |
| 6 | Compras (PurchaseOrder + recepção + SupplierPayment, extracto do fornecedor) | ✅ |
| 7 | Tesouraria & Bancos (contas, movimentos, transferências, integração recibos/pagamentos, relatório diário) | ✅ |
| 7.1 | Hardening da Tesouraria (imutabilidade, idempotência, estorno, saldo atómico, permissões split, fix de navegação) | ✅ |
| **8a** | **Contabilidade — schema & seed** (7 modelos, migração, FKs compostas, constraints, permissões, seed do plano-base) | ✅ |
| **8b** | **Contabilidade — domínio** (plano, exercícios/períodos, mappings, lançamentos, partidas dobradas, estorno) | ✅ |
| **8c.1** | **Contabilidade — fundação das integrações** (mapping tesouraria↔razão, helpers de evento idempotentes/atómicos) | ✅ |
| **8c.2a** | **Idempotência operacional** (modelo `OperationIdempotency`, fingerprint canónico `v1`, helper transaccional) | ✅ |
| **8c.2b** | **Contabilidade — integração factura/recibo** (factura `SALE_ISSUED`, recibo `RECEIPT_POSTED`, idempotência operacional nos formulários/actions) | ✅ |
| 8c.3–8e | Contabilidade — fornecedores/compras, tesouraria, ecrãs, testes finais | 🔨 **8c.3 a seguir** |
| 9 | RH & Salários | 🗺️ futuro |
| X | RLS forçado em toda a BD (fase transversal, pré-produção) | 🗺️ futuro |

**Validações actuais:** typecheck 6/6 · lint 6/6 · **testes unitários 45** · **integração de
contabilidade 108/108** (8b 32 + 8c.1 30 + 8c.2a 18 + 8c.2b 28; `pnpm test:integration:accounting`,
sub: `…:c1`, `…:c2a`, `…:c2`) · `prisma format` OK · `prisma validate` OK · `pnpm build` OK
em Windows nativo (28/28 páginas) e Docker Linux com Node 20 + OpenSSL · seed idempotente (2×).

**Commit da 8c.2b:** este commit exclusivo, `feat(accounting): integrate invoices and customer receipts`.

> ⚠️ **Lembrete:** após cada `db:seed` que adicione **novas permissões**, as sessões antigas (JWT)
> não as têm — é preciso **terminar e reiniciar sessão** para o gate passar a reconhecê-las.

## Problemas conhecidos

### Build de produção do Next.js

Em 2026-06-30, a investigação isolada do build não reproduziu o erro histórico
`useContext null`. O build passou no Windows nativo após instalação limpa e
também em Docker Linux com Node 20, pnpm 9.12.0 e OpenSSL instalado.

Relatório: [`docs/BUILD_INVESTIGATION.md`](docs/BUILD_INVESTIGATION.md).

A causa exacta da falha histórica permanece inconclusiva, porque o erro já não
ocorre no estado actual do repositório. Se reaparecer, deve ser tratado como
regressão nova, com log completo do primeiro erro real. O ambiente Linux/Docker
suportado para build deve incluir OpenSSL antes de `pnpm install`, `pnpm
db:generate` e `pnpm build`.

---

## ✅ Concluído

### Fundação & Interface
- Monorepo **pnpm + Turborepo** (monólito Next.js + worker + packages database/domain/shared/ui/config).
- Docker dev (Postgres + Redis), Prisma, `.env.example`, documentação.
- Tokens e fontes exactos do design (Hanken Grotesk + IBM Plex Mono), tema claro/escuro.
- Shell (sidebar/topbar/breadcrumb) + **22/22 ecrãs portados fielmente** do Claude Design.

### Fase 1 — Autenticação & Multiempresa
- **Auth.js v5** (Credentials + **Argon2**): login, sessão JWT, logout.
- **Bloqueio por tentativas** (5 falhas → 15 min) e `lastLoginAt`.
- **Troca obrigatória da password inicial** (`mustChangePassword` → `/trocar-password`).
- **Proteção de rotas**: layout `(erp)` exige sessão (redirect para `/login`).
- **`RequestContext`** (companyId/userId/permissions/isPlatformAdmin) derivado da sessão —
  `getContext()`/`requireSession()`.
- **Menu da sidebar filtrado por permissões** (Super Admin vê tudo).
- **Isolamento Prisma automático** (2.ª barreira): `forCompany`/`forContext` + `scopeArgs`
  (**8 testes**), verificado **e2e na BD** (Empresa A não vê dados da B; `create` herda companyId).
- **Auditoria**: automática (`forContext`) e explícita (`writeAudit`).
- **Administração com dados reais**: utilizadores, perfis, auditoria, identidade da empresa.
- **Administração — CRUD**: convidar utilizador (password temporária + troca obrigatória),
  activar/desactivar, criar perfil com permissões — com auditoria e **gate de permissão**
  (`requirePermission`), tudo verificado e2e na BD.
- **shadcn/ui**: Button, Dialog (Radix), Input, Label.
- **Seed**: empresa demo + 2 filiais + 25 permissões + 5 perfis + 7 utilizadores + auditoria.
- **Validações**: typecheck 6/6 · lint 6/6 · testes 21 · build 27 páginas — verdes.

---

## ✅ Fase 2 — Clientes (CRM) ponta-a-ponta _(concluída)_

> **Primeiro módulo de negócio** real, exercitando o padrão completo
> (domínio isolado + auditoria automática via `forContext`). Verificado ao vivo no browser:
> lista real (6 clientes, KPIs corretos), criar cliente, perfil real com extracto vazio
> (nota da Fase 4) e editar — auditoria escrita automaticamente.

**Sub-passos (todos concluídos):**

1. ✅ **Modelo + migração** _(concluído — commit `1affe9a`)_
   - `model Customer` (companyId, tipo, NUIT, contactos, endereço, `creditLimit`, `balance`,
     `paymentTermDays`, segmento, estado, auditoria) + enum `CustomerType` + relação em `Company`.
   - Migração **`20260628102312_customers`** aplicada; cliente Prisma regenerado.
   - Validado: typecheck 6/6 · lint 6/6 · testes 21.

2. ✅ **Seed de clientes demo** _(concluído)_ — os 6 do design (Distribuidora Maputo,
   Farmácia Sigma, Restaurante Costa do Sol, Hotel Polana Lodge, Mercearia Bom Preço,
   Auto Peças Matola) com NUIT, telefone, `balance`, segmento, limite e `createdBy`.
   Idempotente via `@@unique([companyId, nuit])` (`prisma/seed.ts`). Verificado na BD
   (6 clientes, sem duplicados após 2.ª execução). typecheck 6/6 · lint 6/6 · testes 21.
3. ✅ **Domínio** `packages/domain/customers.ts` _(concluído)_ (via cliente isolado `forContext(ctx)`):
   - `listCustomers` e `getCustomer(id)` — `requirePermission('clients.view')`.
   - `customerKpis` (total, a receber, com dívida, novos no mês).
   - `createCustomer(input)` — `clients.create`, validação (Zod) + NUIT único + auditoria automática.
   - `updateCustomer(id, input)` — `clients.update` + auditoria automática.
   - `accountStateOf(balance)`: >0 = devedor · <0 = credor · 0 = regular.
   - **`Customer` registado em `COMPANY_SCOPED`** (faltava — 2.ª barreira de isolamento) + teste.
   - Verificado e2e na BD (smoke): KPIs corretos, auditoria escrita, NUIT duplicado → conflito,
     isolamento (Empresa B vê 0; getCustomer cross-company → NotFound). typecheck/lint · testes 22.
4. ✅ **Server Actions** (`apps/web/src/app/(erp)/clientes/actions.ts`) _(concluído)_: `createCustomerAction`
   e `updateCustomerAction` (getContext → `forContext(ctx)` → domínio → `revalidatePath` + `DomainError`).
   FormData → input (números coeridos; vazios caem no default do Zod). typecheck/lint verdes.
5. ✅ **Ligar ecrãs a dados reais** _(concluído)_
   - `/clientes` (lista): Server Component (`forCompany`) → KPIs + tabela reais; `ClientesClient`
     com pesquisa client-side e diálogo **Novo cliente** (`CustomerFormDialog`, shadcn Dialog).
     Removido o mock `CLIENTS`/`CLIENT_KPIS` de `entities.ts` (fornecedores mantêm-se em mock).
   - `/contas/perfil?type=client&id=…`: dados reais do cliente + mini-KPIs (saldo/limite/disponível/
     prazo); **extracto vazio com nota** (movimentos na Fase 4 — Vendas); botão **Editar** ligado
     ao `updateCustomerAction`; "Nova factura" desativado (Fase 4).
   - Linhas da lista navegam com o `id` do cliente; gate por `clients.create`/`clients.view`.
6. ✅ **Validado & commitado**: typecheck 6/6 · lint 6/6 · testes 22 · build OK + verificação
   ao vivo no browser (criar/editar com auditoria automática; dados limpos após teste).

---

## ✅ Fase 3 — Fornecedores ponta-a-ponta _(concluída)_

> Mesmo padrão dos clientes (domínio isolado + auditoria automática via `forContext`).
> Verificado ao vivo no browser: lista real (6 fornecedores, KPIs), criar, perfil real
> (saldo a pagar/crédito) e editar — auditoria escrita automaticamente.

- **Modelo + migração**: `model Supplier` (espelho do `Customer`, com `category`) + enum
  `SupplierType`; migração **`20260628125551_suppliers`**; `Supplier` em `COMPANY_SCOPED` + teste.
- **Permissões** `suppliers.view/create/update/delete` no seed (admin tem todas; Gestor view/create;
  Contabilista view).
- **Seed** dos 6 fornecedores do design (Dangote, Distribuidora Fula, Coca-Cola Sabco, Xinavane,
  Águas de Moçambique, Lux Higiene) — idempotente via `@@unique([companyId, nuit])`.
- **Domínio** `packages/domain/suppliers.ts`: `listSuppliers`, `getSupplier`, `supplierKpis`,
  `createSupplier`, `updateSupplier`; `payableStateOf` (>0 a pagar · <0 adiantamento · 0 regular).
- **Server Actions** `createSupplierAction`/`updateSupplierAction` (`forContext` + `DomainError`).
- **Ecrãs reais**: `/fornecedores` (Server Component + `FornecedoresClient` com pesquisa e diálogo
  **Novo fornecedor**); `/contas/perfil?type=supplier&id=…` (dados reais, extracto vazio com nota,
  **Editar** ligado, "Novo pagamento" desativado). Gates `suppliers.view`/`suppliers.create`.
- **Limpeza**: removidos `EntityList` e o mock `entities.ts` (já não usados).
- **Validado**: typecheck 6/6 · lint 6/6 · testes 23 · build OK + smoke e2e (auditoria, isolamento,
  NUIT único) + verificação ao vivo no browser.

> ⚠️ Após o seed adicionar novas permissões, as sessões antigas (JWT) não as têm — é preciso
> **terminar e reiniciar sessão** para o gate passar a reconhecê-las.

---

## ✅ Fase 4 — Produtos & Stock (multi-armazém) _(concluída)_

> Catálogo + stock por armazém + movimentos imutáveis + inventário com ajuste auditado.
> Verificado ao vivo no browser: lista real, criar/editar produto, ficha com movimentos e
> stock por armazém, contagem de inventário (KPIs ao vivo) → ajuste que gera movimento +
> auditoria explícita `stock.adjust`.

- **Modelos + migração `20260628141239_products_stock`**: `Product` (sku, preço, custo médio,
  IVA, stock mínimo), `Warehouse` (1 por filial), `StockLevel` (stock por produto/armazém),
  `StockMovement` (IN/OUT/ADJUST, delta com sinal + saldo, imutável). Os 4 em `COMPANY_SCOPED`
  + teste. `StockLevel`/`StockMovement` excluídos da auditoria automática (o movimento é o trilho).
- **Permissões**: novas `products.view/create/update`; ver = `stock.view` (menu), CRUD catálogo =
  `products.*`, ajuste = `stock.adjust`. Atribuídas ao admin (todas) e ao Gestor.
- **Seed**: 2 armazéns (ARM-MAP/ARM-MAT), 9 produtos do design, stock inicial em Maputo + movimento
  `IN` "Stock inicial" por produto. Idempotente.
- **Domínio** `products.ts` (`listProducts`, `getProduct`, `productKpis`, `createProduct`,
  `updateProduct`; `stockStatusOf`) e `stock.ts` (`listProductMovements`, `listWarehouses`,
  `listInventory`, `adjustInventory` — transaccional, gera movimento ADJUST + auditoria).
- **Server Actions** `createProductAction`/`updateProductAction`/`adjustInventoryAction`.
- **Ecrãs reais**: `/produtos` (lista + pesquisa + **Novo produto** + ir para Inventário),
  `/produtos/ficha?id=…` (KPIs, stock por armazém, movimentos, **Editar**), `/inventario`
  (folha de contagem por armazém, KPIs ao vivo, **Validar ajustes** → `adjustInventory`).
  Recepção (`/recepcao`) fica para a fase de **Compras**.
- **Validado**: typecheck 6/6 · lint 6/6 · testes 24 · build OK + smoke e2e (KPIs, ajuste com
  movimento + auditoria, isolamento) + verificação ao vivo no browser.

---

## ✅ Fase 5 — Vendas / Facturação _(concluída)_

> Emitir factura → baixa stock (OUT) + incrementa saldo do cliente + extracto; registar recibo →
> baixa saldo + marca factura paga/parcial. Verificado ao vivo no browser ponta-a-ponta.

- **Modelos + migração `20260628182229_sales_invoicing`**: `Invoice` (número por série, snapshot do
  cliente, totais, estado), `InvoiceLine` (snapshot de preço/IVA/desconto), `Payment` (recibo),
  `DocumentCounter` (numeração FT/REC por empresa/ano). Os 4 em `COMPANY_SCOPED` + teste; excluídos
  da auditoria automática (emissão/recebimento registam auditoria explícita).
- **Domínio** `invoices.ts`: `listInvoices`, `getInvoice`, `invoiceKpis`, `createInvoice`
  (transaccional — **bloqueia se stock insuficiente**, gera movimentos OUT, incrementa saldo,
  auditoria `invoice.issue`), `createPayment` (recibo → baixa saldo, estado PARTIAL/PAID,
  auditoria `payment.receive`), `getCustomerStatement` (extracto: saldo inicial + facturas/recibos).
  Estado "vencido" derivado da data; descontos exigem `sales.approve_discount`.
- **Permissões** já existentes (`sales.*`, `invoices.*`, `payments.*`); admin tem todas.
- **Server Actions** `createInvoiceAction`/`createPaymentAction`.
- **Ecrãs reais**: `/facturas` (lista + KPIs + filtros), `/facturas/nova` (cliente + linhas de
  produtos reais + totais ao vivo + armazém de saída → emitir), `/facturas/documento?id=…`
  (documento real com identidade da empresa + **Registar recibo**), e o **extracto do cliente**
  em `/contas/perfil?type=client` agora mostra facturas/recibos reais (saldo inicial reconcilia).
- **Limpeza**: removido o mock `data/invoices.ts`.
- **Validado**: typecheck 6/6 · lint 6/6 · testes 25 · build OK + smoke e2e (factura→stock/saldo,
  recibo, extracto, bloqueio de stock, isolamento) + verificação ao vivo no browser.

---

## ✅ Fase 6 — Compras (ordens + recepção + pagamentos) _(concluída)_

> Ordem de compra → recepção (parcial/total) que dá entrada de stock (IN), recalcula o custo médio
> ponderado e gera conta a pagar; pagamento ao fornecedor baixa o saldo. Verificado ao vivo no browser.

- **Modelos + migração `20260628190432_purchases`**: `PurchaseOrder` (série OC, snapshot do
  fornecedor, totais, estado, valor recebido/pago), `PurchaseOrderLine` (custo, qtd encomendada/
  recebida), `SupplierPayment` (série PG). Reutiliza `DocumentCounter` (OC/GR/PG). Os 3 em
  `COMPANY_SCOPED` + teste; fora da auditoria automática (acções registam auditoria explícita).
- **Domínio** `purchases.ts`: `listPurchaseOrders`, `getPurchaseOrder`, `purchaseKpis`,
  `createPurchaseOrder` (estado SENT), `receivePurchaseOrder` (transaccional — movimentos IN,
  **custo médio ponderado**, conta a pagar, estado PARTIAL/RECEIVED, **bloqueia excesso**,
  auditoria `purchase.receive`), `createSupplierPayment` (baixa saldo, auditoria `purchase.pay`),
  `getSupplierStatement` (extracto do fornecedor).
- **Permissões**: usa `purchases.create` (admin/Gestor já têm) — sem novas permissões.
- **Server Actions** `createPurchaseOrderAction`/`receivePurchaseOrderAction`/`createSupplierPaymentAction`.
- **Ecrãs reais**: `/compras` (lista + KPIs + pesquisa + **Nova ordem** + botão Receber),
  `/compras/ordem/nova` (fornecedor + linhas com custo + armazém), `/compras/ordem?id=…` (detalhe +
  **Receber mercadoria** + **Registar pagamento**), `/recepcao?order=…` (folha de recepção por linha
  → entrada de stock). O **extracto do fornecedor** em `/contas/perfil?type=supplier` mostra
  recepções/pagamentos reais; "Novo pagamento" ligado. Remove o mock `data/purchases.ts`.
- **Validado**: typecheck 6/6 · lint 6/6 · testes 26 · build OK + smoke e2e (OC→recepção parcial/
  total com custo médio, conta a pagar, pagamento, extracto, bloqueio) + verificação ao vivo no browser.

---

## ✅ Fase 7 — Tesouraria & Bancos _(concluída)_

> Contas (caixa/banco/carteira) com saldo e extracto; movimentos manuais e transferências;
> integração automática dos recibos de clientes e pagamentos a fornecedores; relatório diário por
> conta. Verificado ao vivo no browser.

- **Modelos + migração `20260629054706_treasury`**: `TreasuryAccount` (tipo CASH/BANK/MOBILE/OTHER,
  saldo de abertura/actual) e `TreasuryMovement` (fluxo IN/OUT, saldo após, categoria, documento,
  contrapartida, origem). Os 2 em `COMPANY_SCOPED` + teste; fora da auditoria automática.
- **Permissões** novas `treasury.view`/`treasury.manage` (admin/Gestor/Caixa; Contabilista vê);
  menu "Tesouraria" passa a exigir `treasury.view`. Seed de 5 contas (Caixa Principal, BCI,
  Millennium BIM, M-Pesa, e-Mola). `RequestContext` ganhou `userName` (operador do relatório).
- **Domínio** `treasury.ts`: `listAccounts`, `treasuryKpis`, `listMovements`, `dailyReport`,
  `createAccount`, `recordMovement` (entrada/saída, valida saldo), `transfer` (dois movimentos
  ligados) e `postTreasuryMovementTx` (helper transaccional reutilizado).
- **Integração**: `createPayment` (recibo) e `createSupplierPayment` aceitam `accountId` e lançam
  automaticamente um movimento de tesouraria (IN/OUT) na conta escolhida; selector de conta
  adicionado aos diálogos de recibo e de pagamento a fornecedor.
- **Server Actions** `createAccountAction`/`recordMovementAction`/`transferAction`.
- **Ecrãs reais**: `/tesouraria` (KPIs + cartões de contas + movimentos + diálogos Movimento/
  Transferência/Nova conta) e `/tesouraria/fecho` (relatório diário por conta/data: saldo inicial,
  entradas, saídas, saldo final, operador e espaço para assinatura — sem contagem de notas).
  Remove o mock `data/treasury.ts`.
- **Validado**: typecheck 6/6 · lint 6/6 · testes 27 · build OK + smoke e2e (movimento, transferência,
  integração recibo→conta, relatório) + verificação ao vivo no browser.

---

## ✅ Fase 7.1 — Hardening da Tesouraria _(concluída)_

> Robustez financeira: imutabilidade, idempotência, concorrência, regras de saldo, estados e auditoria.

- **Auditoria financeira**: contas/movimentos têm `companyId`, `createdBy`, `occurredAt`, `source`.
  Excluídos da auditoria automática **de propósito** (o movimento é o trilho imutável); cada acção
  (criar conta, estado, movimento, transferência, estorno) escreve `AuditLog` explícito e semântico.
- **Imutabilidade**: movimentos não se editam/eliminam — só **estorno** (`reverseMovement`), que cria
  contra-movimento ligado por `reversesId`, marca o original `REVERSED` e mantém ambos no extracto.
- **Idempotência**: `@@unique([companyId, sourceType, sourceId, movementPurpose])` + pré-verificação
  (no-op) em `postTreasuryMovementTx` — um recibo/pagamento nunca gera 2 movimentos.
- **Concorrência/atomicidade**: tudo em `$transaction`; saldo actualizado por **increment/decrement
  atómico** (bloqueia a linha → sem lost updates); transferência cria os 2 movimentos ou falha tudo.
- **Regras de saldo**: `allowNegative` por conta (Caixa/Carteiras `false`, Banco/Outras `true`).
- **Estado das contas**: activar/desactivar (`setAccountStatus`), sem eliminação; inactivas saem dos
  selectores de pagamento mas ficam nos extractos.
- **Transferências**: `transferId` liga os dois movimentos; KPIs consolidados ignoram transferências
  e estornados.
- **Permissões split**: `treasury.view/createMovement/transfer/manageAccounts/viewReports/reverseMovement`.
- **Bug de navegação**: `redirect('/')` por permissão → vista `NoPermission` (sem salto para o dashboard).
- **Testes**: unitários de permissões por função (vitest) + smoke e2e dos 9 cenários (duplo recibo/
  pagamento, saldo insuficiente, concorrência, transferência falhada, estorno, conta inactiva,
  isolamento). typecheck 6/6 · lint 6/6 · testes 34 · build OK.

---

## 🔨 Próximo — Fase 8: Contabilidade _(plano apresentado e aprovado)_

> Plano de contas + períodos + diários/lançamentos (partidas dobradas) + integração automática a
> partir dos documentos (vendas/compras/tesouraria) + relatórios (razão, balancete, extracto diário).
> `accounting.*`, `systemKeys` (sem códigos fixos), numeração por exercício, Decimal, idempotente.

**Sub-passos (incremental, validar cada etapa antes de avançar):**

- **8a — Schema & seed** _(✅ concluída)_: modelos `FiscalYear`, `AccountingPeriod`, `LedgerAccount`,
  `AccountingJournal`, `JournalEntry`, `JournalEntryLine`, `AccountingMapping` + 6 enums + migração
  `accounting` + 7 modelos em `COMPANY_SCOPED` + permissões `accounting.*` (view/post/reverse/
  manageAccounts/managePeriods/manageSettings) + seed idempotente (37 contas, 8 diários, 15 mappings,
  exercício de calendário + 12 períodos). **FKs compostas `[companyId, id]` anti cross-company**,
  exclusion constraints (sobreposição de exercícios/períodos via `btree_gist`), índice parcial
  (um exercício corrente), CHECKs de débito/crédito/origem. **Sem lançamentos nem integrações.**
  Decisões: isolamento por `COMPANY_SCOPED` (RLS real → fase transversal X); `provisioningKey` só
  para provisionamento (fonte funcional = `AccountingMapping.systemKey`); `onDelete: Restrict` em
  toda a contabilidade (histórico financeiro preservado). ⚠️ Build vermelho **pré-existente** (ver topo).
- **8b — Domínio** _(✅ concluída)_: `packages/domain/src/accounting.ts`. Plano de contas (árvore,
  criar/editar/activar, anti-ciclo, agrupadora≠movimento), exercícios/períodos (OPEN/CLOSED/LOCKED;
  reabrir LOCKED exige `accounting.unlockPeriods`), mappings (fonte funcional `systemKey` + resolver
  interno para 8c), lançamentos: draft (desequilíbrio permitido, equilíbrio só no post), update/delete
  de draft (snapshot na auditoria), **confirmação por partidas dobradas** (débito=crédito, ≥2 linhas,
  total>0, exercício+período OPEN, `SELECT … FOR UPDATE`), **estorno** (mesmo diário ou ajustamentos
  se inactivo; original→REVERSED). Numeração definitiva só no post (`AC:fy:journal`, placeholder
  `RASCUNHO-{id}` no draft). Datas estritas `YYYY-MM-DD` (UTC, sem fuso). Origem automática só por
  helper interno (`createJournalEntryDraftTx`, all-or-none, idempotente). Novas permissões
  `accounting.prepare` e `accounting.unlockPeriods`. **Sem integrações nem ecrãs.** Validado:
  typecheck/lint/44 unit + **32/32 integração** (`pnpm test:integration:accounting`).
- **8c — Integração automática** (por subfases): recibo/pagamento/factura/transferência → `JournalEntry`
  na mesma transacção do documento, **idempotente** (`companyId + sourceType + sourceId + accountingEvent`).
  - **8c.1 — Fundação** _(✅ concluída)_: migração `treasury_ledger_mapping` (relação 1:1
    `TreasuryAccount.ledgerAccountId`, FK composta anti cross-company, `@@unique`); seed não destrutivo
    (Caixa→111, BCI→112, M-Pesa→113, Millennium→**114**, e-Mola→**115**, com `provisioningKey`);
    `setTreasuryLedgerAccount`/`listTreasuryLedgerMappings` (gate `accounting.manageSettings`); módulo
    **interno** `accounting-events.ts` (`postAccountingEventTx`/`reverseAccountingEventTx`/
    `resolveTreasuryLedgerTx`/`resolveJournalByTypeTx`) — sem gates contabilísticos de utilizador,
    atómico, idempotente com **advisory lock** + comparação de payload completo, estorno por verdade
    histórica. 30 testes (`pnpm test:integration:accounting:c1`). **Sem ligar a fluxos operacionais ainda.**
  - **8c.2a — Idempotência operacional** _(✅ concluída)_: modelo `OperationIdempotency`
    (`@@unique([companyId, scope, idempotencyKey])`, FK `Restrict`) + migração `operation_idempotency`
    + `COMPANY_SCOPED`; módulo interno `operation-idempotency.ts` (`runIdempotentOperation` com advisory
    lock + replay/conflito por `requestFingerprint`; fingerprint canónico **`v1:`** sha256, arrays como
    multiset). 18 testes (`pnpm test:integration:accounting:c2a`). **Sem alterar createInvoice/createPayment.**
  - **8c.2b — Integração factura/recibo** _(✅ concluída)_: `createInvoice` exige `idempotencyKey`,
    usa `OperationIdempotency` (`INVOICE_CREATE`) e publica `SALE_ISSUED` no diário `SALES` dentro da
    mesma transacção da factura, linhas, stock, saldo do cliente e auditoria. `createPayment` exige
    `idempotencyKey` + `accountId`, usa `CUSTOMER_PAYMENT_CREATE`, gera `TreasuryMovement` e publica
    `RECEIPT_POSTED` no diário `CASH`/`BANK` por tipo de conta (`MOBILE` → `BANK`, `OTHER` rejeitado).
    Formulário de nova factura e diálogo de recibo geram chaves UUID estáveis por tentativa; `accountId`
    é obrigatório para novos recibos. Testes: 28 cenários (`pnpm test:integration:accounting:c2`).
    Sem COGS, fornecedores, compras, cancelamentos ou transferências nesta fase.
  - **8c.3** fornecedores (recepção valorizada — requer entidade `PurchaseReceipt`). **8c.4** tesouraria
    manual (contrapartida) + transferências. **8c.5** backfill (dry-run) + validação.
    Diferidos: COGS, cancelamentos operacionais.
- **8d — Ecrãs**: plano de contas, diários, novo lançamento, detalhe, razão geral, balancete,
  extracto diário (linha a linha) + configuração contabilística (mapping de `systemKeys`).
- **8e — Testes & validação final**: unidade + integração + isolamento multiempresa.

---

## ⏳ Pendente — Fase 1 (adiado)

- Recuperação de password (fluxo de reposição).
- Sessões persistidas na BD (consultar/terminar/revogar sessões).
- Editar/eliminar perfis e ajustar permissões de perfis existentes.
- Área **Super Admin da plataforma** (multi-empresa): cadastrar/suspender empresas, planos,
  impersonação segura e auditada.

---

## 🗺️ Fases futuras (esboço)

- **Fase X (transversal) — RLS forçado em toda a BD** _(pré-requisito de produção)_ — roles
  separadas de runtime (`gc_app`) e migração (`gc_migrator`), `SET LOCAL app.current_company_id`
  por transacção, `ENABLE`/`FORCE ROW LEVEL SECURITY` + policies por empresa em **todas** as
  tabelas (não só Contabilidade), e testes de isolamento através da role real de runtime. O schema
  actual já está RLS-ready (`companyId` + FKs compostas em todas as tabelas).
- **Fase 9 — RH & Salários** — colaboradores, contratos, processamento salarial (liga à
  contabilidade via `systemKeys` `SALARIES_EXPENSE`/`SALARIES_PAYABLE` e à tesouraria).
- **Extensões da Facturação** — POS, cotações, NC/ND.
- **Extensões da Tesouraria** — conciliação bancária, fecho de caixa com contagem de denominações.
- **Contabilidade (avançado)** — Balanço, Demonstração de Resultados, Fluxo de Caixa, mapa de
  antiguidade de saldos.
- _(mais tarde: Produção, Contratos/Subscrições, Relatórios/Dashboards, Notificações/Workflows,
  PWA/Offline, Deploy VPS+Cloudflare.)_
