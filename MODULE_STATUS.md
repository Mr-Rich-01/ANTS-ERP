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

## 🔨 Próximo — Fase 2: Clientes (CRM) ponta-a-ponta

> Construir o **primeiro módulo de negócio** real, exercitando o padrão completo
> (domínio isolado + auditoria automática via `forContext`).

**Sub-passos accionáveis (por ordem):**

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
3. 🔜 **Domínio** `packages/domain/customers.ts` _(próximo passo)_ (sempre via cliente isolado `forContext(ctx)`):
   - `listCustomers(ctx)` e `getCustomer(ctx, id)` — `requirePermission('clients.view')`.
   - `customerKpis(ctx)` (total, a receber, com dívida, novos no mês).
   - `createCustomer(ctx, input)` — `clients.create`, validação (Zod) + NUIT único + auditoria.
   - `updateCustomer(ctx, id, input)` — `clients.update` + auditoria.
   - Estado de conta derivado do `balance`: >0 = com dívida · <0 = saldo a favor · 0 = regular.
4. **Server Actions** (`apps/web/src/app/(erp)/clientes/actions.ts`): `createCustomerAction`,
   `updateCustomerAction` (getContext → `forContext` → domínio → `revalidatePath` + erros de domínio).
5. **Ligar ecrãs a dados reais**
   - `/clientes` (lista): Server Component → KPIs + tabela reais (substituir o `EntityList` mock);
     diálogo **Novo cliente** (shadcn Dialog/Input/Select).
   - `/contas/perfil?type=client&id=…`: dados reais do cliente + KPIs (saldo/limite/…);
     **extracto vazio com nota** (os movimentos chegam na Fase 4 — Vendas).
   - Linhas da lista passam a navegar com o `id` do cliente.
6. **Validar & commitar**: typecheck/lint/test/build verdes + verificação e2e (criar cliente
   isolado por empresa, auditoria escrita) → **commit**.

---

## ⏳ Pendente — Fase 1 (adiado)

- Recuperação de password (fluxo de reposição).
- Sessões persistidas na BD (consultar/terminar/revogar sessões).
- Editar/eliminar perfis e ajustar permissões de perfis existentes.
- Área **Super Admin da plataforma** (multi-empresa): cadastrar/suspender empresas, planos,
  impersonação segura e auditada.

---

## 🗺️ Fases futuras (esboço)

- **Fornecedores** — cadastro, extracto, contas a pagar.
- **Produtos & Stock** — produtos, armazéns, movimentos, inventário.
- **Vendas / Facturação** — cotações, POS, facturas, recibos, NC/ND.
- **Tesouraria & Bancos** — contas, movimentos, fluxo de caixa, conciliação, fecho de caixa.
- **Contabilidade** — plano de contas, lançamentos (partidas dobradas), relatórios.
- **RH & Salários** — colaboradores, contratos, processamento salarial.
- _(mais tarde: Produção, Contratos/Subscrições, Relatórios/Dashboards, Notificações/Workflows,
  PWA/Offline, Deploy VPS+Cloudflare.)_
