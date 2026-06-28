# MODULE_STATUS — ANTS ERP

_Última actualização: 2026-06-28_

Estado vivo do projecto. O conhecimento permanente (arquitectura, regras, comandos) está
em [`CLAUDE.md`](CLAUDE.md).

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

## 🔨 Próximo (sugerido)

> **Compras** (encomendas a fornecedores + recepção `/recepcao` gerando movimentos `IN` e contas a
> pagar) para fechar o ciclo de stock/fornecedores; ou **Tesouraria & Bancos** (contas, fluxo de
> caixa, fecho de caixa) que recebe os recibos. **POS** e **NC/ND** também ficam disponíveis como
> extensões da facturação.

---

## ⏳ Pendente — Fase 1 (adiado)

- Recuperação de password (fluxo de reposição).
- Sessões persistidas na BD (consultar/terminar/revogar sessões).
- Editar/eliminar perfis e ajustar permissões de perfis existentes.
- Área **Super Admin da plataforma** (multi-empresa): cadastrar/suspender empresas, planos,
  impersonação segura e auditada.

---

## 🗺️ Fases futuras (esboço)

- **Vendas / Facturação** — cotações, POS, facturas, recibos, NC/ND.
- **Tesouraria & Bancos** — contas, movimentos, fluxo de caixa, conciliação, fecho de caixa.
- **Contabilidade** — plano de contas, lançamentos (partidas dobradas), relatórios.
- **RH & Salários** — colaboradores, contratos, processamento salarial.
- _(mais tarde: Produção, Contratos/Subscrições, Relatórios/Dashboards, Notificações/Workflows,
  PWA/Offline, Deploy VPS+Cloudflare.)_
