# MODULE_STATUS — ANTS ERP

_Última actualização: 2026-07-18_

Estado vivo do projecto. O conhecimento permanente (arquitectura, regras, comandos) está
em [`CLAUDE.md`](CLAUDE.md).

**Último commit funcional:** pendente na branch `s9-inventario` (Sessão S9 do ROADMAP)
**Fase concluída:** `S9 — Inventário em duas etapas` (ROADMAP; fase anterior: `S8 — Produtos: criação com stock inicial`)
**UAT interna/demo:** V1 candidata a demo externa apos UAT interna, aprovada com ressalvas em 2026-07-06; P1-04 acrescenta Contabilidade V1 pronta para UAT/demo com limites; P1-05 acrescenta Fecho de Caixa V1 operacional sem persistencia formal; demo final check registado em `docs/DEMO_FINAL_CHECK.md` em 2026-07-08 como pronto com ressalvas menores
**Próximo passo:** `Sessão S10 — Contabilidade: lançamentos` (ROADMAP) — não iniciar sem instrução explícita (tem ponto 🔒: mapa débito/crédito de cada tipo de lançamento aprovado ANTES de qualquer código; inclui CMV na venda + par da devolução das NCs, conta «Outros proveitos» das ND, anulação de NC; o teste de coerência 131 vs. stock físico deve incluir `PRODUCT_OPENING_STOCK` (S8) e `STOCK_COUNT_VALIDATED` (S9)); mantém-se pendente o smoke manual final em browser externo/limpo (logout, clique final POS, Fecho de Caixa V1) antes da demo externa

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
| **8c.3** | **Contabilidade — fornecedores/compras** (`PurchaseReceipt`, `PurchaseReceiptItem`, recepção `PURCHASE_RECEIVED`, pagamento `SUPPLIER_PAYMENT_POSTED`) | ✅ |
| **P0-03.0** | **Fundação técnica de cancelamentos/anulações/estornos** (estados/metadados, rastreabilidade `Invoice`→`StockMovement`, scopes de idempotência e helper contabilístico reforçado) | ✅ |
| **P0-03b** | **Anulação de recebimento de cliente** (`Payment`→`Invoice`/`Customer`/Tesouraria/Contabilidade/Auditoria, recibo original `ANULADO`) | ✅ |
| **P0-03a** | **Cancelamento integral de factura** (`Invoice`→`Customer`/Stock/Contabilidade/Auditoria, factura original `CANCELADA`) | ✅ |
| **P0-03c** | **Estorno integral de pagamento a fornecedor** (`SupplierPayment`→`Supplier`/`PurchaseOrder`/Tesouraria/Contabilidade/Auditoria, pagamento original `ESTORNADO`) | ✅ |
| **P0-03d** | **Estorno integral de recepção de compra** (`PurchaseReceipt`→`PurchaseOrder`/`Supplier`/Stock/Custo médio/Contabilidade/Auditoria, recepção original `ESTORNADA`) | ✅ |
| **P0-03e** | **Estorno atómico de transferência entre contas** (`TreasuryMovement` OUT/IN→dois compensatórios, duas contas, idempotência e auditoria lógica única) | ✅ |
| **P0-03f** | **Regressão integrada, UAT e documentação final dos estornos** (suite UAT, agregado de reversões, documentação operacional, limitações V1) | ✅ |
| **P0-04** | **Dockerfiles e preparação da imagem de produção** | ✅ |
| **P0-05** | **Resolver ambiguidade de login multiempresa** | ✅ |
| **P0-06** | **Ambiente de staging Docker e validação de release** | ✅ |
| **P0-07** | **Backup, Restore e Rollback operacional** | ✅ |
| **P0-08** | **Hardening de producao** (env validation, defaults inseguros, Auth/cookies, headers, CORS, rate limit, logs, health e docs operacionais) | ✅ |
| **P0-09** | **UAT comercial e prontidao de piloto** (roteiro UAT, checklist, matriz V1, sign-off e criterios de decisao) | ✅ |
| **P1-01** | **POS V1 funcional limitado** (checkout simples: produtos reais, Cliente final, factura + recibo, stock, tesouraria, contabilidade e auditoria) | ✅ |
| **P1-02** | **Relatorios V1 operacionais** (vendas, clientes, antiguidade, compras, fornecedores, stock, fluxo de caixa e auditoria com filtros basicos + CSV) | ✅ |
| **P1-03** | **Impressao/PDF profissional** (factura, recibo, fecho diario de caixa e relatorios V1 com HTML/CSS print e guardar PDF pelo navegador) | ✅ |
| **P1-04** | **Contabilidade V1 finalizada** (plano de contas, diario, razao/extracto por conta, balancete, filtros, CSV e impressao/guardar PDF pelo navegador) | ✅ |
| **P1-05** | **Fecho de Caixa V1** (movimentos do dia, entradas/saidas, saldo esperado, valor contado, diferenca, sem diferenca/sobra/falta, CSV e impressao/PDF via browser, sem persistencia formal) | ✅ |
| **S1** | **Nomenclatura e Relatórios** (Excedente/Déficit no fecho de caixa, «Diário» → «Extrato Diário» na Contabilidade, «Status» → «Estado»; apenas strings de UI/CSV) | ✅ |
| **S2** | **Dropdowns pesquisáveis** (`SearchCombobox` único shadcn/cmdk; Produtos/Clientes com pesquisa server-side + debounce via `/api/search/*`; Fornecedores/Contas/Armazéns client-side; aplicado em formulários e filtros) | ✅ |
| **S3** | **Lista de Produtos** (selector Top 10/50/100/Todos, «Todos» com paginação server-side de 50, pesquisa server-side nome/SKU/categoria/marca, estado na URL `vista`/`pagina`/`q`) | ✅ |
| **S4** | **Dados da Empresa** (endereço/website/logótipo por empresa, contas bancárias e carteiras móveis em tabelas próprias, ecrã `/admin/empresa` com gate `settings.manage`, upload PNG/JPG/WebP ≤ 1 MB na BD, `/api/company/logo` isolado por sessão com ETag/cache, `CompanyHeader` pronto para a S5, logótipo na sidebar/topbar) | ✅ |
| **S5** | **Documentos Comerciais** (Cotação/NC/ND novos + OC imprimível; migração aditiva `s5_commercial_documents` — 6 tabelas + 3 enums; numeração atómica `COT`/`NC`/`ND` no `DocumentCounter`; NC contra factura com tecto por linha, devolução opcional com snapshot `unitCost` e lançamento espelho 411/221/121; ND com factura opcional D 121/C 411+221; extracto do cliente com NC/ND; suite `test:integration:documents` 12/12) | ✅ |
| **S6** | **Melhorias na Fatura** (rascunhos série `RASC` sem efeitos + emissão que consome o FT só nesse instante, edição de rascunho, histórico de alterações no documento via `AuditLog`, descarte com motivo obrigatório, cancelamento com nome do responsável e hora; migração aditiva `s6_invoice_drafts`; filtro central `ACTIVE_INVOICE_STATUSES`; suite `test:integration:invoices:drafts` 13/13) | ✅ |
| **S7** | **Fluxo de Ordem de Compra** (estados `PENDING_APPROVAL`→`APPROVED`/`REJECTED` antes da recepção; aprovação/rejeição com gate `purchases.approve` existente — zero alterações de RBAC; rejeição terminal com motivo ≥ 10 chars; recepção só de OCs aprovadas; observações da recepção na UI; indicação ao solicitante por chips/destaque; migrações aditivas `s7_purchase_order_approval` + backfill `SENT`→`APPROVED`; suite `test:integration:purchases:approval` 9/9) | ✅ |
| **S8** | **Produtos: criação com stock inicial** (secção opcional «Stock inicial» no dialog de criação — quantidade + custo unitário + armazém; `StockMovement IN` normal que inicializa o avgCost = custo informado; lançamento de abertura D 131 / C 312 nova via mapping `OPENING_BALANCE_EQUITY` no diário `DAB`; scope de idempotência `PRODUCT_CREATE`; migração aditiva `s8_product_initial_stock`; suite `test:integration:products:initial-stock` 10/10) | ✅ |
| **S9** | **Inventário em duas etapas** (contagem série `CI` em RASCUNHO com snapshot `systemQty` e zero efeitos → validação `stock.adjust` aplica o delta contado sobre o stock corrente sob `FOR UPDATE`; `StockMovement ADJUST` com `stockCountId` + lançamento único `AJ` no `DAJ`: Excedente D 131/C 421, Déficit D 551/C 131 ao avgCost corrente com avgCost intacto; edição com refresh de snapshots e descarte com motivo padrão S6; ajuste directo legado removido; migração aditiva `s9_stock_counts`; suite `test:integration:stock:counts` 14/14) | ✅ |
| 9 | RH & Salários | 🗺️ futuro |
| X | RLS forçado em toda a BD (fase transversal, pré-produção) | 🗺️ futuro |

**Validações actuais:** typecheck 6/6 · lint 6/6 · **testes unitários 89** · **security hardening 16/16** · **auth company-selection 7/7** · **reversal all 44/44** · **integração de
contabilidade 203/203** (8b 32 + 8c.1 30 + 8c.2a 18 + 8c.2b 34 + 8c.3 17 + P1-04 14 + P0-02 5 + P0-03.0 9 + P0-03b 10 + P0-03a 9 + P0-03c 7 + P0-03d 8 + P0-03e 6 + P0-03f 4;
`pnpm test:integration:accounting`, sub: `…:c1`, `…:c2a`, `…:c2`, `…:c3`, `…:reports`, `…:reversal:customer-payment`, `…:reversal:invoice`, `…:reversal:supplier-payment`, `…:reversal:purchase-receipt`, `…:reversal:treasury-transfer`, `…:reversal:uat`, `…:reversal:all`) · **POS 7/7** (`pnpm test:integration:pos`) · `prisma validate` OK · `prisma migrate status` OK · `pnpm build` OK
em Windows nativo (30/30 páginas estaticas + `/api/health` dinamico) e Docker Linux com Node 20 + OpenSSL · imagens Docker de produção
`web`, `worker` e target `migrate` OK · seed idempotente (2×) · login/contexto
multiempresa 7/7 · **POS 12/12** (`pnpm test:integration:pos`) · **relatorios 24/24** (`pnpm test:integration:reports`) · **Fecho de Caixa V1 11/11** (`pnpm test:integration:treasury:cash-closing`) · `pnpm build` OK em Windows nativo (31/31 páginas, incluindo `/api/health`, `/relatorios/exportar`, `/contabilidade/exportar` e `/tesouraria/fecho/exportar`) ·
staging Docker P0-08/P0-09 OK (`docker:staging:build`, migrations explicitas, web/worker/postgres/redis,
health `/api/health`, smoke `/login`, `/seleccionar-empresa` e headers).

P0-07 acrescenta backup manual de staging, restore destrutivo com confirmacao explicita,
runbook de rollback de imagem e rollback pos-migration, proteccao Git para dumps locais e
ensaio operacional de backup/restore em staging/local. Backup antes de migration real passa a ser
regra operacional. Restore nunca deve apontar para producao nesta fase.

**P0-04 (2026-07-04):** criada a preparação de imagem de produção sem alterações funcionais:
Dockerfile multi-stage da web em `apps/web/Dockerfile` com Next standalone activado por
`BUILD_STANDALONE=1`, OpenSSL, Prisma Client gerado no build, runtime `node apps/web/server.js` e
utilizador não-root; Dockerfile do worker em `apps/worker/Dockerfile` com build `tsc`, `pnpm deploy
--prod` e runtime `node dist/main.js`; `.dockerignore` bloqueia `.env`, `.env.*`, `.git`,
`node_modules`, caches, builds, testes/artefactos, uploads e backups locais. `docker-compose.production.yml`
ganhou o serviço explícito `migrate` em profile `migration`; migrations não correm automaticamente no
arranque e o seed demo continua proibido em produção. Documentação e scripts de build Docker foram
actualizados em `docs/DEPLOYMENT.md`, `SETUP.md`, `.env.example` e `package.json`.

**P0-05 (2026-07-04):** resolvida a ambiguidade de login multiempresa sem migration. O login
autentica credenciais contra as contas activas do email; quando existe exactamente uma empresa
activa validada, a sessão entra directamente nessa empresa; quando existem várias, a sessão fica
sem `companyId` operacional e redirecciona para `/seleccionar-empresa`; quando não existe empresa
activa, o ERP operacional fica bloqueado com mensagem clara. A escolha de empresa é validada no
servidor contra sessão, conta activa e empresa activa antes de actualizar o JWT, e `RequestContext`
revalida empresa/utilizador/permissões na base de dados para bloquear sessões antigas com empresa
removida ou inactiva. Criado o comando `pnpm test:integration:auth:company-selection` (7/7).

**P0-06 (2026-07-04):** criado ambiente de staging Docker reproduzivel sem deploy real e sem seed
demo automatico. `docker-compose.staging.yml` sobe `web`, `worker`, `postgres`, `redis` e `migrate`
com migrations manuais pelo profile `migration`; `.env.staging.example` documenta placeholders
seguros e URLs internas Docker; `/api/health` retorna JSON minimo sem autenticacao nem secrets; o
runbook `docs/STAGING.md` cobre build, migrate, up, ps, logs, smoke, down/cleanup e checklist de
release. O smoke encontrou e corrigiu uma falha real do standalone Docker: a web precisava de
`@node-rs/argon2` como dependencia directa e do binario nativo Linux copiado para o runner. O
adendo complementar clarificou liveness/readiness, smoke Auth P0-05, smoke Financeiro P0-03,
confirmacao de ausencia de `.env` nas imagens e P0-07 reservado para Backup/Restore/Rollback. Validado
com `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration:accounting`,
`pnpm test:integration:accounting:reversal:all`, `pnpm test:integration:auth:company-selection`,
`pnpm build`, `pnpm docker:staging:build`, `pnpm docker:staging:migrate`, `pnpm docker:staging:up`,
`pnpm docker:staging:ps`, `/api/health`, `/seleccionar-empresa` e `/login`.

**P0-07 (2026-07-04):** criada a base operacional de backup/restore/rollback sem deploy real,
sem novas dependencias, sem schema e sem migrations. Foram adicionados scripts manuais para
`pnpm ops:staging:backup` e restore destrutivo com `CONFIRM_RESTORE`, dumps locais ignorados pelo
Git, runbook `docs/BACKUP_RESTORE.md`, referencias em staging/deployment/setup e regras para backup
antes de migrations reais. Rollback de imagem fica separado de rollback de dados; se migration
aplicada deixar a app incompativel, a decisao entre corrigir em frente ou restaurar backup exige
aprovacao explicita.

**P0-08 (2026-07-04):** concluido o hardening de producao sem schema, migrations ou dependencias
novas. Criada validacao central de env para web e worker, com bloqueio de placeholders,
`AUTH_SECRET` fraco, URLs localhost/HTTP em producao real, `DATABASE_URL`/`REDIS_URL` invalidas e
mensagens sem valores secretos. Staging local em `NODE_ENV=production` exige
`ALLOW_LOCALHOST_RUNTIME_URLS=1` para localhost. Auth.js passou a usar cookies seguros em producao;
headers globais de baixo risco foram adicionados via middleware Next; a app permanece same-origin,
sem CORS wildcard; login e seleccao de empresa ganharam rate limit em memoria com chaves hashed; o
worker redige payloads sensiveis antes de logging; `/api/health` ficou dinamico, sem secrets e com
`Cache-Control: no-store`. Documentacao operacional actualizada em `docs/SECURITY.md`,
`docs/DEPLOYMENT.md`, `docs/STAGING.md` e `SETUP.md`. Riscos residuais: CSP completa, rate limit
centralizado em Redis/borda para multiplas instancias, revogacao completa de sessoes persistidas,
RLS transversal e observabilidade avancada. Proximo passo: `P0-09 — UAT comercial e prontidao de
piloto` (nao iniciado).

**P0-09 (2026-07-05):** concluido o pacote documental de UAT comercial e prontidao de piloto sem
alteracoes funcionais, schema, migrations ou dependencias. Criados `docs/UAT_PILOT.md`,
`docs/UAT_TEST_SCRIPT.md`, `docs/PILOT_READINESS_CHECKLIST.md`,
`docs/UAT_SIGNOFF_TEMPLATE.md` e `docs/V1_SCOPE_MATRIX.md`. A matriz V1 separa explicitamente o
que esta pronto para UAT, parcial, fora da V1 ou futuro, incluindo RH, salarios, POS,
contratos/subscricoes, producao e restaurante/bar como futuro/fora da V1. `SETUP.md`,
`docs/DEPLOYMENT.md` e `docs/SECURITY.md` passaram a apontar para o pacote UAT, exigindo dados
ficticios, checklist assinada, backup pre-UAT/piloto e sign-off antes de qualquer piloto. Validado
com `prisma validate`, `prisma migrate status`, `pnpm db:generate`, `pnpm typecheck`,
`pnpm lint`, `pnpm test` (89/89), `pnpm test:integration:security:production-hardening` (16/16),
`pnpm test:integration:auth:company-selection` (7/7),
`pnpm test:integration:accounting:reversal:all` (44/44),
`pnpm test:integration:accounting` (189/189), `pnpm build` e smoke staging com overrides temporarios
seguros sem imprimir secrets (`docker:staging:migrate`, `docker:staging:up`, `docker:staging:ps`,
`/api/health` 200, `/login` 200, `/seleccionar-empresa` 307 para `/login`, `docker:staging:down`).
Proximo passo: decisao comercial explicita entre piloto controlado e abertura de backlog P1. Nao
iniciar P1 automaticamente.

**P1-01 (2026-07-05):** implementado POS V1 funcional limitado sem schema, migrations ou
dependencias novas. `/pos` deixou de usar `RAW_PRODUCTS` mockados e passou a carregar produtos
reais da empresa activa, stock por armazem, Cliente final, clientes existentes quando o perfil
pode ve-los, contas de tesouraria activas e metodos visuais dinheiro/M-Pesa/e-Mola/cartao. A
finalizacao chama `createPosSaleAction`, que deriva `RequestContext` da sessao e chama
`createPosSale` no dominio. O dominio cria factura + recebimento numa unica transaccao, valida
stock, cliente, armazem, conta de tesouraria e permissoes `sales.create`/`payments.receive`,
baixa stock, cria `StockMovement OUT`, actualiza cliente, cria recibo, movimento de tesouraria,
lancamentos `SALE_ISSUED`/`RECEIPT_POSTED`, auditoria e idempotencia com os scopes existentes
`INVOICE_CREATE` e `CUSTOMER_PAYMENT_CREATE`. Criado `pnpm test:integration:pos` (7/7) cobrindo
sucesso ponta a ponta, Cliente final, carrinho vazio, stock insuficiente, permissoes, isolamento
multiempresa e replay idempotente. O perfil seed `Caixa` recebeu `stock.view` para poder usar POS.
Limites V1: sem mesas, cozinha, comandas, garcons, turnos/fecho de caixa, offline, devolucao POS,
scanner real/codigo de barras operacional, impressao termica avancada ou restaurante/bar completo.
Proximo passo cumprido por decisao explicita: P1-02 Relatorios V1 operacionais.

**P1-02 (2026-07-05):** implementados Relatorios V1 operacionais sem schema, migrations ou
dependencias novas. `/relatorios` deixou de usar dados mockados de
`apps/web/src/lib/data/reports.ts` e passou a chamar `packages/domain/src/reports.ts` com
`RequestContext`, `requirePermission`, `forCompany` e filtros basicos por periodo, cliente,
fornecedor, produto, conta de tesouraria, tipo de movimento e utilizador quando aplicavel. Foram
entregues relatorio de vendas, extracto de clientes, antiguidade de saldos, relatorio de compras,
extracto de fornecedores, movimentos de stock, fluxo de caixa e todas as operacoes/auditoria, todos
com exportacao CSV via `/relatorios/exportar`. PDF e Excel avancados ficam desactivados/futuros; a
biblioteca marca salarios, producao, BI, reconciliacao bancaria, margens robustas e relatorio
personalizado como futuro para nao vender mock como pronto. Criado `pnpm test:integration:reports`
(7/7) cobrindo isolamento `companyId`, saldos de clientes/fornecedores, fluxo de caixa, stock, CSV
e bloqueio por permissao.
Proximo passo: decisao explicita sobre P1-03.

**P1-03 (2026-07-06):** implementada impressao/PDF profissional por HTML/CSS print, sem schema,
migrations ou dependencias novas. `/facturas/documento` ganhou cabecalho/rodape de impressao com
identidade da empresa, endereco de filial quando disponivel e referencias bancarias/carteiras sem
saldos; `/facturas/recibo` foi criado como recibo autonomo imprimivel com cliente, factura
relacionada, metodo, conta de tesouraria, valor, emissor e estado/anulacao; `/tesouraria/fecho`
passou a imprimir relatorio diario de caixa com empresa, conta/data, operador, entradas, saidas,
recebimentos, pagamentos, transferencias, saldo inicial/final, total do dia e assinaturas; `/relatorios`
passou a oferecer `Imprimir / Guardar PDF` para relatorios V1 gerados, mantendo PDF automatico/fiscal
e Excel avancado como futuro/desactivado. Foram criados componentes simples de apresentacao
`PrintLayout`, `CompanyHeader`, `DocumentFooter`, `MoneyCell` e `SignatureBlock`, e o CSS print foi
reforcado para A4, modo claro, tabelas e quebras de pagina. A suite `pnpm test:integration:reports`
foi expandida para cobrir factura/recibo imprimiveis, relatorio diario de caixa, perfil imprimivel da
empresa, bloqueio por permissao e isolamento `companyId`. Limites: guardar PDF pelo dialogo do
navegador; PDF fiscal oficial, assinatura digital/fiscal, envio por email, impressao termica avancada
e layouts personalizaveis ficam futuros. Proximo passo: decisao explicita sobre P1-04; nao iniciar
P1-04 automaticamente.

**UAT interna/demo candidate (2026-07-06):** executada validacao interna da V1 actual em
`test/internal-uat-demo`, com relatorio em `docs/UAT_INTERNAL_DEMO_REPORT.md`. Resultado:
aprovado com ressalvas para demo externa, sem bloqueadores e sem alteracoes funcionais. Validacoes
verdes: `prisma validate`, `prisma migrate status`, `pnpm db:generate`, `pnpm typecheck`,
`pnpm lint`, `pnpm test` (89/89), `pnpm test:integration:reports` (10/10),
`pnpm test:integration:pos` (12/12), `pnpm test:integration:accounting` (189/189),
`pnpm test:integration:security:production-hardening` (16/16),
`pnpm test:integration:auth:company-selection` (7/7) e `pnpm build`. Ressalvas antes da demo
externa: revalidar logout em browser limpo e corrigir titulo visual fixo
`Factura FT 2026/0337` em `apps/web/src/lib/erp-nav.ts`. Esta UAT nao marca producao pronta,
nao autoriza piloto real e nao inicia P1-04.

**Fix pre-demo UX (2026-07-07):** em `fix/demo-ux-before-client-demo`, removido o titulo visual
fixo `Factura FT 2026/0337` do shell da factura, retirados Producao/Contratos/RH da navegacao
principal e substituidas as respectivas paginas por avisos "Futuro" sem botoes operacionais ou
dados que parecam prontos. Dashboard deixou de anunciar Contratos/Salarios como pendencias reais
e os atalhos rapidos visiveis passaram a navegar para areas V1. Logout foi revisto sem alteracao
funcional; o browser integrado bloqueou a revalidacao visual apos o `POST /login 303`, por isso o
smoke final de logout deve ser repetido em browser externo/limpo antes da demo externa. Nao marca
producao pronta, nao autoriza piloto real e nao inicia P1-04.

**P1-04 (2026-07-07):** finalizada a Contabilidade V1 sem schema, migrations ou dependencias novas.
`/contabilidade` deixou de usar dados mockados de `apps/web/src/lib/data/finance.ts` e passou a
chamar `packages/domain/src/accounting.ts` com `RequestContext`, `forCompany`, `accounting.view` e
`reports.export` para CSV. Foram entregues plano de contas consultavel, diario de lancamentos reais,
razao/extracto por conta com saldo inicial e saldo acumulado em MT, balancete com validacao global
debito=credito apenas quando nao ha filtro de conta, filtros por periodo, conta, diario, origem,
tipo, estado e pesquisa, CSV para diario/razao/balancete via `/contabilidade/exportar` e
impressao/guardar PDF pelo navegador. O polimento pre-integracao neutralizou o estado de erro em
balancete filtrado por conta, traduziu labels tecnicos visiveis/CSV e confirmou ausencia de botao
activo de lancamento manual. Criado `pnpm test:integration:accounting:reports` (14/14) e incluido
no agregado `pnpm test:integration:accounting`. Limites V1: sem lancamentos manuais, fecho anual,
DRE oficial, balanco oficial, fiscal/AT, assinatura digital, reconciliacao bancaria avancada,
centros de custo avancados, importacao SAF-T ou P1-06.

**P1-05 (2026-07-08):** implementado Fecho de Caixa V1 sem schema, migrations ou
dependencias novas. `/tesouraria/fecho` passou a preparar um relatorio operacional
com filtro por data e conta, movimentos reais do dia, origem/metodo/utilizador,
entradas, saidas, vendas POS, recebimentos, pagamentos, transferencias, saldo
inicial, saldo esperado, valores contados por dinheiro/M-Pesa/e-Mola/cartao-banco,
diferenca e status `Sem diferenca`/`Sobra`/`Falta`, observacoes, CSV em
`/tesouraria/fecho/exportar` e impressao/guardar PDF pelo navegador com assinaturas
do caixa e supervisor. Como nao existe modelo de sessao/fecho, a fase e operacional:
valor contado e observacoes nao sao persistidos e nao ha botao definitivo `Fechar
caixa`. O fecho formal persistido, abertura/turnos, aprovacao obrigatoria,
bloqueio apos fecho, ajuste automatico, gaveta fisica, impressao termica,
reconciliacao bancaria avancada e P1-06 ficam futuros. Criado
`pnpm test:integration:treasury:cash-closing` (11/11), cobrindo isolamento
companyId, somas, metodos, diferenca zero/sobra/falta, permissao, CSV, periodo sem
movimentos, ausencia de mutacao dos movimentos originais e observacoes no relatorio.

**S1 — Nomenclatura e Relatórios (2026-07-18):** primeira sessão do ROADMAP, na branch
`s1-nomenclatura`, apenas com strings de UI/CSV — sem schema, migrations, dependências,
auth/RBAC ou lógica contabilística. No Fecho de Caixa, as labels de diferença passaram de
`Sobra`/`Falta` para `Excedente`/`Déficit` (`classifyCashClosingDifference` em
`packages/domain/src/treasury.ts`; enums `SURPLUS`/`SHORTAGE` intactos) e o cartão `Status`
passou a `Estado`. A vista de Contabilidade `Diário (de lançamentos)` foi renomeada para
`Extrato Diário` (tab, títulos, KPIs, título do CSV e nome do ficheiro
`contabilidade-extrato-diario-…`; query param interno `view=journal` mantido). Decisões: o
filtro «Diário» e a coluna «Diário» do CSV referem-se aos livros contabilísticos (Diário
Geral, de Vendas, …) e mantêm o nome, tal como o «Relatório diário de caixa» da Tesouraria.
Grep confirma zero ocorrências dos termos antigos na UI. Validado: typecheck 6/6, lint 6/6,
testes unitários 89/89, `test:integration:accounting:reports` 14/14,
`test:integration:treasury:cash-closing` 11/11, build 31/31 páginas.

**S2 — Dropdowns pesquisáveis (2026-07-18):** segunda sessão do ROADMAP, na branch
`s2-dropdowns` — sem schema, migrations, auth/RBAC ou lógica contabilística. Dependências
novas aprovadas explicitamente: `cmdk` + `@radix-ui/react-popover` em `packages/ui`
(primitives `Popover`/`Command` shadcn). Criado o componente único
`apps/web/src/components/ui/SearchCombobox.tsx` com dois modos: estático (pesquisa
client-side — Fornecedores, Contas de tesouraria, Armazéns, plano de contas) e assíncrono
(pesquisa server-side com debounce 300 ms — Produtos e Clientes, sem carregar a lista inteira
para o cliente; as páginas passam só as primeiras 20 opções). Pesquisa server-side:
`searchCustomerOptions`/`searchProductOptions` no domínio (`requirePermission` +
cliente isolado) expostas por `GET /api/search/customers` e `GET /api/search/products` —
`companyId` sempre da sessão, 401 sem sessão, 403 sem empresa/permissão. Aplicado em:
Nova Factura (cliente, produto, armazém), Nova Ordem (fornecedor, produto, armazém), POS
(cliente com «Cliente final» fixo, armazém), PaymentDialog e SupplierPaymentDialog (conta),
Tesouraria (conta do movimento, origem/destino da transferência), Inventário (armazém) e
filtros GET de Relatórios (cliente, fornecedor, produto, conta), Fecho de Caixa (conta) e
Contabilidade (conta do plano) — nos filtros GET o combobox submete por input hidden com o
mesmo `name`, preservando os filtros existentes. Selects de enums pequenos (tipo, método,
fluxo, estado, perfil) mantêm-se nativos. Validado: typecheck 6/6, lint 6/6, testes
unitários 89/89, build OK.

**S3 — Lista de Produtos (2026-07-18):** terceira sessão do ROADMAP, na branch
`s3-lista-produtos` — sem schema, migrations, dependências, auth/RBAC ou lógica
contabilística. A listagem `/produtos` deixou de carregar a tabela inteira: nova função de
domínio `listProductsPage` (`packages/domain/src/products.ts`) com `requirePermission
('stock.view')` + cliente isolado `forCompany`, `take` limitado a 100, `skip` nunca
negativo, pesquisa `contains insensitive` em nome/SKU/categoria/marca e `{ items, total }`
via `findMany` + `count`. O Server Component lê `searchParams` (`vista=10|50|100|todos`,
`pagina`, `q`, saneados no servidor) e o estado vive na URL — sobrevive a refresh e é
partilhável; página fora do intervalo recua para a última. `ProdutosClient` ganhou selector
segmentado Top 10 (default) / Top 50 / Top 100 / Todos, pesquisa server-side com debounce
300 ms via `router.replace` (repõe `pagina=1`) e paginação Anterior/Seguinte («Página X de
Y», 50 por página) visível só em «Todos» com mais de uma página. Decisão: «Top» é
alfabético (`orderBy name asc`, critério já existente — não há métrica de relevância);
`listProducts` e `searchProductOptions` ficam intactos. Regressão verificada em browser:
ordenação, clique de linha → ficha, Inventário/Novo produto, contador e rodapé com valor de
stock. Validado: typecheck 6/6, lint 6/6, testes unitários 89/89, build OK (31/31 páginas).

**S4 — Dados da Empresa (2026-07-18):** quarta sessão do ROADMAP, na branch `s4-dados-empresa`,
com migration aditiva aprovada `20260718023352_s4_company_profile`: `Company` ganhou `address`,
`website` e `logoUpdatedAt` (todos opcionais) e foram criadas `company_bank_accounts` (bankName,
accountHolder, accountNumber, nib 21 dígitos, iban, swift, isActive, sortOrder),
`company_mobile_wallets` (provider texto livre, walletNumber, accountHolder, isActive, sortOrder)
e `company_logos` (BYTEA 1:1 com mimeType/fileName/sizeBytes; decisão aprovada: logótipo na BD —
backups pg_dump já o cobrem e não exige volumes Docker novos). Os 3 modelos entraram em
`COMPANY_SCOPED`; `CompanyLogo` foi excluído da auditoria automática (bytes nunca vão ao
`AuditLog`; o upload regista `company.logo.update` explícito sem bytes). Novo domínio
`packages/domain/src/company-profile.ts`: `getCompanyProfile`/`updateCompanyProfile` (gate
`settings.manage` existente — sem permissões novas, Zod com NUIT 9 dígitos, NIB 21 dígitos,
website http(s), listas substituídas em transacção única com sortOrder pela ordem do formulário,
que é a ordem dos documentos da S5) e `setCompanyLogo`/`removeCompanyLogo`/`getCompanyLogo`
(PNG/JPG/WebP ≤ 1 MB, SVG rejeitado por decisão, assinatura de bytes verificada, nome sanitizado).
Ecrã novo `/admin/empresa` (Server Component + client, ligado ao cartão Identidade do `/admin`);
rota `GET /api/company/logo` serve apenas o logótipo da empresa da sessão (sem ids/caminhos no
request), com ETag = `updatedAt` partilhado, 304 condicional e `Cache-Control` imutável no URL
versionado `?v=` (o BYTEA não é lido em cada página). `getCompanyPrintProfile` passou a preferir
o endereço/contas/carteiras próprios da empresa com fallback ao comportamento anterior
(filial + referências de Tesouraria); `CompanyHeader` mostra logótipo real e carteiras móveis
(pronto para a S5); sidebar/topbar mostram logótipo e nome da empresa activa com fallback ao
monograma. `next.config` ganhou `serverActions.bodySizeLimit: '2mb'` para o upload. Verificado ao
vivo em browser: edição persistida + auditoria, upload, logótipo em sidebar/topbar/documento,
cache imutável com ETag coincidente, e isolamento — sessão de outra empresa recebe 404 no logo,
vê o próprio monograma e é bloqueada em `/admin/empresa` sem `settings.manage`. Validado:
typecheck 6/6, lint 6/6, testes unitários 98/98 (+9 de validação de upload/sanitização), nova
suite `pnpm test:integration:company-profile` 8/8 (isolamento A/B, permissões, upload inválido,
auditoria sem bytes), relatórios 24/24, Fecho de Caixa 11/11, build OK com as rotas novas
`/admin/empresa` e `/api/company/logo` incluídas.

**S5 — Documentos Comerciais (2026-07-18):** quinta sessão do ROADMAP, na branch
`s5-documentos-comerciais`, com migração aditiva aprovada `20260718075421_s5_commercial_documents`:
6 tabelas novas (`quotations`/`quotation_lines`, `credit_notes`/`credit_note_lines`,
`debit_notes`/`debit_note_lines`), 3 enums de estado (todos já com `DRAFT` para a S6 não exigir
migration nova), 3 scopes novos de idempotência e um único toque em tabela existente (índice único
aditivo `invoice_lines(companyId, id)` para a FK composta das linhas da NC). PG 16.14 confirmado
antes dos `ALTER TYPE ADD VALUE`. Levantamento prévio: Factura e Recibo já emitiam e imprimiam com
o layout S4 (nada a fazer); a OC ganhou apenas página imprimível `/compras/ordem/documento`;
Cotação, NC e ND são fluxos 100% novos. Numeração aprovada: séries `COT`/`NC`/`ND` no
`DocumentCounter` existente (por empresa/ano, upsert+increment atómico na transacção da emissão,
formato `NC 2026/0001`; teste de concorrência sem duplicados). Domínio novo
`packages/domain/src/commercial-documents.ts`: Cotação pré-transaccional (sem stock/saldo/
contabilidade, validade obrigatória); NC sempre contra factura emitida (`invoiceId NOT NULL`),
linhas derivadas das linhas da factura com tecto por linha (facturado − já creditado) e tecto
global ≤ total da factura, motivo obrigatório, devolução de stock opcional (`returnStock`:
`StockMovement IN` no armazém da factura ao custo médio corrente, snapshot em
`CreditNoteLine.unitCost`, custo médio do produto intacto), decremento de `Customer.balance` e
lançamento aprovado espelho da venda (D 411 Vendas base, D 221 IVA / C 121 Clientes, evento
`CREDIT_NOTE_ISSUED`, diário SALES); ND contra cliente com factura opcional, linhas livres,
incremento de `Customer.balance` e lançamento D 121 / C 411 (+C 221), evento `DEBIT_NOTE_ISSUED`.
Decisão aprovada: o par 131/CMV da devolução fica para a S10 (checkbox adicionada ao ROADMAP S10
com o snapshot `unitCost` como base), porque a venda V1 ainda não lança CMV — evita dupla contagem
da 131. Limitação V1 declarada: ND credita 411 (sem conta mapeada de «Outros proveitos»). Extracto
do cliente (`getCustomerStatement`) passou a incluir NC (crédito) e ND (débito). UI: `/cotacoes`
(lista+nova+documento, entrada na sidebar), `/facturas/notas` (listas NC+ND),
`/facturas/nota-credito[/nova]` e `/facturas/nota-debito[/nova]` (emissão a partir do documento da
factura), `/compras/ordem/documento` — todos os documentos com `PrintLayout`/`CompanyHeader` da S4
e blocos partilhados novos em `components/print/DocumentParts.tsx`. Verificado ao vivo em browser:
FT 2026/0025, REC 2026/0018, NC 2026/0001 (com devolução e entrada em armazém), ND 2026/0001,
COT 2026/0001 e OC 2026/0006 emitidos/impressos com o mesmo padrão visual; lançamentos NC/ND
visíveis no Extrato Diário. Sem permissões novas (gates `sales.view`/`sales.create`/
`purchases.create` existentes). Validado: `prisma validate` + `migrate status` + diff BD↔schema
vazio, typecheck 6/6, lint 6/6, testes unitários verdes (tenant-scope +1), nova suite
`pnpm test:integration:documents` 14/14 (cotação sem efeitos, idempotência, concorrência da
numeração, NC com/sem devolução, tectos, factura cancelada, permissões, isolamento A/B, ND com/sem
IVA, extracto reconciliado, tecto sob NCs simultâneas, bloqueio do cancelamento com NC), build OK
41/41 páginas (8 rotas novas). Endurecimento pós-revisão (2026-07-18): o tecto da NC ficou
serializado por `SELECT … FOR UPDATE` na linha da factura (o mesmo lock do cancelamento P0-03a —
duas NCs simultâneas contra a mesma factura já não podem ambas passar o tecto, e NC exclui-se
mutuamente com cancelamento em curso); e `cancelInvoice` ganhou bloqueio conservador simétrico ao
dos recibos: factura com NC emitida não pode ser cancelada integralmente (a NC já reverteu
saldo/stock parcialmente — cancelar duplicaria a reversão; regressão P0-03a 9/9 verde).

**S6 — Melhorias na Fatura (2026-07-18):** sexta sessão do ROADMAP, na branch
`s6-melhorias-fatura`, com migração aditiva aprovada `20260718120000_s6_invoice_drafts`:
`DRAFT` acrescentado ao enum `InvoiceStatus` (a nota da S5 sobre `DRAFT` cobria só os enums de
Cotação/NC/ND), coluna opcional `invoices.draftNumber` e scopes `INVOICE_DRAFT_CREATE`/
`INVOICE_DRAFT_ISSUE`. Decisões aprovadas: (1) numeração — série própria `RASC` no
`DocumentCounter` (`RASC 2026/0001`); o número FT só é consumido na transacção da emissão,
pelo que a série FT nunca ganha buracos (rascunhos descartados só gastam números RASC, sem
valor fiscal) e o RASC de origem fica preservado em `draftNumber` e visível no documento
(«Origem»); (2) histórico — sem tabela nova: o `AuditLog` existente é a fonte
(`invoice.draft.create`/`.update` com diff, `invoice.issue`, `invoice.draft.discard`,
`invoice.cancel`), lido por `getInvoiceHistory` e apresentado num cartão «Histórico de
alterações» no documento (noprint); (3) cancelamento — matriz aprovada reutiliza o
`cancelInvoice` da P0-03a **sem tocar na lógica do estorno** (estorno simétrico do
`SALE_ISSUED` no período corrente, reposição de stock por `reversesId`, decremento do saldo,
idempotente; bloqueios por recibo activo e por NC emitida mantidos); a S6 acrescenta o nome
do responsável + hora no documento e o **descarte de rascunho** como operação própria
(`discardInvoiceDraft`, gate `sales.create`): sem estorno porque nunca houve efeitos, mas com
motivo ≥ 10 chars, utilizador e data/hora obrigatórios; rascunho nunca se apaga da BD. Domínio
novo em `invoices.ts`: `saveInvoiceDraft` (sem stock/saldo/contabilidade; stock não
bloqueante), `updateInvoiceDraft` (linhas substituídas, preços refrescados dos produtos,
auditoria com diff), `issueInvoiceDraft` (lock `FOR UPDATE`, valida stock à data, consome FT,
baixa stock, incrementa saldo, lança `SALE_ISSUED`, idempotente — falha de stock não consome
número), `getInvoiceDraftForEdit` e `getInvoiceHistory`. Levantamento aprovado de TODAS as
queries sobre `invoices`: rascunhos visíveis apenas na lista de facturas (chip/filtro
«Rascunhos») e no detalhe (banner «RASCUNHO — SEM VALIDADE FISCAL»); invisíveis em
`invoiceKpis`, `getCustomerStatement`, relatórios de vendas/extracto/antiguidade via
constante central `ACTIVE_INVOICE_STATUSES = ['ISSUED','PARTIAL','PAID']`; guards novos
bloqueiam recibo, NC, ND e cancelamento sobre rascunhos (o POS continua a criar só `ISSUED`;
contabilidade/tesouraria/stock não precisam de filtro — rascunho nunca lança nem movimenta).
UI: botão «Gravar como Rascunho» na Nova Factura, edição em `/facturas/nova?rascunho=<id>`
(mesmo formulário), documento com Editar/Emitir/Descartar (`DraftIssueDialog`/
`DraftDiscardDialog`), sem permissões novas. Verificado ao vivo em browser: RASC 2026/0001
criado (BD confirma zero movimentos/lançamentos/saldo e contador FT parado) → editado (total
2 018,40 → 2 180,80 no histórico) → emitido como FT 2026/0026 (contígua à 0025; stock −3/−1,
saldo +2 180,80, `LV 2026/0029` no Extrato Diário) → cancelado com motivo (estorno
`LV 2026/0030` simétrico no Extrato Diário, stock e saldo repostos exactamente, responsável
com nome e data/hora no documento). Validado: `prisma validate`/`migrate status` OK,
typecheck 6/6, lint 6/6, testes unitários verdes, nova suite
`pnpm test:integration:invoices:drafts` 13/13 (rascunho sem efeitos, replay idempotente da
gravação e da emissão, emissão sem buracos na série, stock validado só na emissão, descarte
com motivo, bloqueios recibo/NC/cancelamento sobre rascunho, KPIs/extracto sem rascunhos,
cancelamento com recibo bloqueado, estorno idempotente, histórico completo, isolamento A/B e
permissões), regressões invoice-cancellation 9/9 + documents 14/14 + POS 12/12 +
relatórios 24/24 + reversal all 44/44, build OK.

**S7 — Fluxo de Ordem de Compra (2026-07-18):** sétima sessão do ROADMAP, na branch
`s7-ordem-compra`, com duas migrações aditivas aprovadas: `20260718150000_s7_purchase_order_approval`
(enum `PurchaseStatus` + `PENDING_APPROVAL`/`APPROVED`/`REJECTED`; 7 colunas opcionais em
`purchase_orders`: `approvedById/Name/At`, `rejectedById/Name/At`, `rejectionReason`) e
`20260718150001_…_backfill` (separada porque o PG proíbe usar valores de enum novos na transacção
do `ADD VALUE`): mapeamento aprovado Opção A — OCs legadas `SENT` → `APPROVED` com `approvedById`
NULL = aprovação legada/implícita (continuam recepcionáveis; nenhuma linha apagada), e default da
coluna passa a `PENDING_APPROVAL`. **RBAC: zero alterações** (🔒 cumprido por levantamento): a
aprovação usa a permissão existente `purchases.approve` (constants + seed desde a Fase 1, nunca
usada em código), já atribuída a Administrador e Gestor; «Gestor Financeiro» não existe no seed e
fica como papel futuro a quem se dá esta permissão. Fluxo: `createPurchaseOrder` cria em
`PENDING_APPROVAL` (a criação é a transição «Criada → Aguardando Aprovação», sem passo manual);
`approvePurchaseOrder` (lock `FOR UPDATE`, só de `PENDING_APPROVAL`, snapshot nome+data do
aprovador, `AuditLog purchase.approve`, **pré-transaccional: zero lançamentos/stock/tesouraria**);
`rejectPurchaseOrder` aprovado como estado **terminal** com motivo obrigatório ≥ 10 chars
(`AuditLog purchase.reject` com reason; OC nunca se apaga); a recepção passa a exigir
`APPROVED`/`PARTIAL` (constante `RECEIVABLE_PURCHASE_STATUSES`) e `purchaseStatusFromLines` devolve
`APPROVED` (não `SENT`) quando um estorno repõe tudo — estornar a única recepção devolve a OC a
Aprovada. Observações da recepção: `purchase_receipts.notes` já existia no domínio (fingerprint de
idempotência incluído) — a S7 acrescentou o textarea na UI da recepção e a exibição no histórico de
recepções do detalhe da OC. Indicação ao solicitante sem sistema de notificações: chips na lista
(«N ordens suas foram aprovadas — prontas a recepcionar» para o criador; «N aguardam a sua
aprovação» para quem tem `purchases.approve`), destaque das linhas aprovadas do próprio, KPI
«Aguardam aprovação», bloco «Aprovada por _nome_ em _data_»/motivo de rejeição no detalhe e no
documento imprimível; labels novos também no relatório de compras (coluna «Estado» traduzida).
Verificado ao vivo em browser: OC 2026/0007 criada (Aguardando Aprovação; sem botão de recepção;
`/recepcao` directo bloqueia com aviso) → aprovada pelo admin (dialog; «Aprovada por Administrador
Demo em 18/07/2026») → recepcionada com observações (GR 2026/0009, obs. visíveis no histórico,
stock/conta a pagar só neste passo) → sessão da Maria (Caixa, sem permissões de compras) bloqueada
em `/compras`; OCs legadas apareceram correctamente como Aprovadas pós-backfill. Validado:
`prisma validate`/`migrate status` OK + diff BD↔schema vazio, typecheck 6/6, lint 6/6, testes
unitários verdes, nova suite `pnpm test:integration:purchases:approval` 9/9 (sem efeitos na
criação, aprovar sem permissão falha, aprovação com snapshot+auditoria e sem efeitos, replay
limpo, recepcionar não-aprovada/rejeitada falha, motivo obrigatório, rejeição terminal, observações
persistidas, isolamento A/B), regressões c3 17/17 + reversal all 44/44 + relatórios 24/24, build
OK. Nota de ambiente resolvida: o agregado `test:integration:accounting` chegou a registar 202/203
por uma falha pré-existente do `c1 #16` (uma 6.ª conta de tesouraria «ABSA» criada manualmente na
demo num teste ao vivo de 2026-07-08); com autorização explícita, a conta foi removida numa
transacção com verificação prévia (0 movimentos de tesouraria, 0 linhas de lançamento, sem razão
ligada) e o agregado voltou a **203/203**.

**S8 — Produtos: criação com stock inicial (2026-07-18):** oitava sessão do ROADMAP, na branch
`s8-produtos-stock-inicial`, com migração aditiva aprovada `20260718200000_s8_product_initial_stock`
(um único toque de schema: `PRODUCT_CREATE` no enum `OperationIdempotencyScope`). **Desenho
contabilístico aprovado (🔒) antes de código:** o stock inicial de um produto novo é entrada de
existências SEM fornecedor (a 131 até aqui só era debitada no `PURCHASE_RECEIVED` contra a 211),
pelo que a contrapartida aprovada é capital próprio de abertura — **D 131 Mercadorias
(`INVENTORY`) / C 312 «Regularização de abertura de existências»** (conta EQUITY nova, filha de
31 Capital, mapping novo `OPENING_BALANCE_EQUITY`), sem IVA (nada é dedutível sem documento de
fornecedor), no **diário de Abertura `DAB`** (tipo `OPENING`, prefixo `AB`, seeded desde a 8a e
usado pela primeira vez). Evento `sourceType 'PRODUCT'` / `accountingEvent 'PRODUCT_OPENING_STOCK'`
— naturalmente único por produto. A conta 312 + mapping entram pela definição canónica do seed
(idempotente, não destrutivo — re-seed acrescenta às empresas dev/demo existentes; empresas novas
de produção herdam-nos pelo provisionamento explícito que já é a regra desde P0-01); **sem conta
de fallback**: mapping em falta faz a operação falhar por inteiro com a mensagem clara do
`getMappedAccountTx` (coberto por teste). Domínio: `createProduct` ganhou `options.initialStock`
`{quantity>0 int, unitCost>0, warehouseId}` (os três obrigatórios em conjunto; custo 0 rejeitado
para o weighted-average não nascer errado/a zero) — na MESMA transacção: `StockLevel` +
`StockMovement IN` («Stock inicial», nunca escrita directa da quantidade), avgCost = custo
unitário informado (primeira entrada define o custo médio; substitui o custo de catálogo do
formulário) e lançamento com o mesmo cálculo `round2(qtd × custo)`, auditoria explícita
`product.initial_stock` e idempotência com scope próprio `PRODUCT_CREATE` (fingerprint v1 do
payload completo; replay devolve o mesmo produto sem duplicar efeitos). Produto existente NÃO
ganha fluxo de stock inicial (ajuste de inventário é âmbito da S9); sem stock inicial o
comportamento é exactamente o de antes (zero efeitos). UI: secção «Stock inicial (opcional)» no
dialog Novo produto (quantidade, custo unitário, armazém activo; chave de idempotência por
abertura do dialog); labels do Extrato Diário ganharam `PRODUCT` → «Stock inicial de produto».
Decisão registada no ROADMAP (S10): o teste de coerência 131 vs. stock físico deve incluir os
movimentos `PRODUCT_OPENING_STOCK`, não só compras. Verificado ao vivo em browser:
`S8-DEMO-001` criado com 8 × 120,50 MT no Armazém Maputo → StockLevel 8, movimento IN «Stock
inicial», avgCost 120,50 (custo de catálogo 10 substituído), lançamento `AB 2026/0001` no Extrato
Diário (D 131 / C 312 = 964,00, Publicado), auditoria e registo de idempotência; ficha do produto
mostra o movimento como os restantes; `S8-DEMO-002` sem stock inicial → zero efeitos;
quantidade sem custo → erro claro no dialog e nada criado. Testes dos seeds 8b `#25`/c1 `#17`
actualizados (40 contas / 16 mappings da demo — a 312 e o `OPENING_BALANCE_EQUITY` são agora
esperados). Validado: `prisma migrate status` OK, typecheck 6/6, lint 6/6, testes unitários
verdes, nova suite `pnpm test:integration:products:initial-stock` 10/10 (sem stock inicial zero
efeitos, custo obrigatório com quantidade > 0, armazém/inteiros validados, D131/C312 balanceado
no `AB`, arredondamento a 2 casas com cálculo único, idempotência + conflito de fingerprint,
weighted-average com recepção posterior (10@10 + 10@20 → 15), permissões, mapping em falta com
rollback total, isolamento A/B), regressões accounting 203/203 + reversal all 44/44 + POS 12/12 +
purchases approval 9/9 + relatórios 24/24, build OK.

**S9 — Inventário em duas etapas (2026-07-18):** nona sessão do ROADMAP, na branch
`s9-inventario`, com migração aditiva aprovada `20260718230000_s9_stock_counts`: enum
`StockCountStatus` (`DRAFT`/`VALIDATED`/`DISCARDED`), tabelas `stock_counts` (número série
`CI`, snapshots de quem contou/validou/descartou, `journalEntryId`, motivo de descarte) e
`stock_count_lines` (snapshot `systemQty` + `countedQty` + verdade histórica `appliedDiff`/
`appliedUnitCost`/`appliedValue`; único por contagem+produto), coluna de rastreabilidade
`stock_movements.stockCountId` (FK composta, padrão P0-03) e scopes `STOCK_COUNT_CREATE`/
`STOCK_COUNT_VALIDATE`. **Plano completo aprovado (🔒) antes de código**, com quatro decisões
explícitas: (1) permissões sem RBAC novo — contar/editar/descartar com `stock.view` (o Caixa
pode contar; rascunho auditado e sem efeitos) e validar com `stock.adjust` (Gestor/Admin);
(2) concorrência contagem→validação — **delta vs. snapshot**: `diff = contado −
systemQty(snapshot da gravação/edição)` aplicado sobre o stock corrente sob `FOR UPDATE`
(contagem + produtos + níveis em ordem determinística); se algum produto ficasse negativo
(vendido abaixo do contado), a validação falha por inteiro com os produtos listados e
resolve-se editando (refresca snapshots) ou recontando; UI avisa «mudou» por linha e no
dialog; (3) mapa D/C — contas novas do seed canónico (padrão S8, sem fallback): Excedente
**D 131 / C 421 «Excedentes de inventário»** (`INVENTORY_SURPLUS`, grupo novo 42 «Outros
proveitos» que fica preparado para as ND na S10) e Déficit **D 551 «Déficits de inventário»
(`INVENTORY_SHORTAGE`, grupo novo 55) / C 131** — nunca a 511 CMV (reservada à S10; sem
dupla contagem futura porque as unidades em falta nunca terão CMV de venda), num único
lançamento por contagem no **Diário de Ajustamentos `DAJ`/`AJ`** (primeira utilização),
evento `sourceType 'STOCK_COUNT'`/`STOCK_COUNT_VALIDATED` naturalmente único; (4)
valorização ao avgCost corrente da validação com **avgCost intacto** nos dois sentidos
(entrada ao próprio custo médio não o altera; saídas nunca recalculam — o inventário corrige
quantidades, não custos). Nomenclatura S1 aplicada (Excedente/Déficit) nas contas e na UI.
Domínio novo `packages/domain/src/stock-counts.ts` (`createStockCount`/`updateStockCount`
com refresh de snapshots/`discardStockCount` motivo ≥ 10 chars/`validateStockCount`/
`getStockCount`/`listStockCounts`); contagem sem diferenças valida sem efeitos e valor 0
(ex.: avgCost 0) gera movimento sem lançamento. **Ajuste directo legado removido** após
levantamento aprovado dos chamadores (`adjustInventory` + `adjustInventoryAction` +
`InventarioClient` — nenhum fluxo automático dependia): `/inventario` passou a folha de
contagem que grava rascunho (só linhas tocadas entram), lista de contagens com estados, e
página nova `/inventario/contagem` com Editar/Validar/Descartar (dialogs padrão S6) e aviso
de divergência. Labels do Extrato Diário: `STOCK_COUNT` → «Contagem de inventário».
Verificado ao vivo em browser: `CI 2026/0001` gravada (BD confirma zero efeitos: stock
8/247 intacto, 104 movimentos e 61 lançamentos inalterados, `appliedDiff` NULL) → editada
(SUG-2 244→245, auditoria `stock.count.update`) → venda POS real `FT 2026/0027` de 2 ×
RICE-25 entre contagem e validação (stock 8→6; banner «mudou» na linha) → validada:
delta +2 sobre 6 → **8** (físico: 10 contados − 2 vendidos ✓), SUG-2 247→245, movimentos
`ADJUST` com `stockCountId`, lançamento `AJ 2026/0001` Publicado e balanceado (D 131
3 816,00 / C 421 3 816,00 + D 551 274,00 / C 131 274,00 = 4 090,00), avgCost 1 908,00/137,00
intactos, visível no Extrato Diário como «Contagem de inventário»; `CI 2026/0002` descartada
com motivo, responsável e hora, zero efeitos. Testes de seed 8b `#25`/c1 `#17` actualizados
(44 contas / 18 mappings) e tenant-scope com asserções `StockCount`/`StockCountLine`.
Validado: `prisma validate`/`migrate status` OK, typecheck 6/6, lint 6/6, testes unitários
99 verdes, nova suite `pnpm test:integration:stock:counts` 14/14 (rascunho zero efeitos,
permissões contar/validar, edição com refresh, validação completa com lançamento balanceado,
idempotência do replay + revalidação bloqueada, delta sobre stock corrente, negativo bloqueado
com rollback e recuperação por edição, sem diferenças, custo 0, descarte, mapping em falta
com rollback, isolamento A/B, numeração CI, idempotência da criação), regressões accounting
203/203 + products initial-stock 10/10 + POS 12/12 + reversal all 44/44 + relatórios 24/24 +
purchases approval 9/9, build OK (rotas novas `/inventario/contagem`).

**Hardening pré-produção P0-01 (2026-07-02):** seed demo bloqueado em `production`
antes de criar o Prisma Client; credenciais demo removidas da interface de
produção/login; convites de utilizador deixam de usar password temporária fixa;
`pnpm db:seed` permanece apenas para desenvolvimento/teste e produção deve usar
provisionamento explícito.

**Hardening pré-produção P0-02 (2026-07-02):** estorno directo de movimentos de
Tesouraria derivados de documentos operacionais bloqueado no domínio e reflectido
na interface. Recebimentos de clientes (`RECEIPT_IN`) e pagamentos a fornecedores
(`SUPPLIER_PAYMENT_OUT`) ficam protegidos; reversões ponta a ponta continuam
pendentes para o P0-03.

**Fundação pré-produção P0-03.0 (2026-07-02):** criada a base transversal para
cancelamentos/anulações/estornos sem implementar nenhum fluxo funcional completo
nem UI: `Invoice` mantém `CANCELLED` e recebeu metadados de cancelamento; `Payment`,
`SupplierPayment` e `PurchaseReceipt` receberam `ACTIVE/REVERSED` e metadados de
reversão; `StockMovement` passou a ligar novas vendas por `invoiceId` e a suportar
movimentos compensatórios por `reversesId`; `TreasuryMovement` recebeu
`reversalReason`; foram adicionados scopes operacionais de idempotência para as
subfases P0-03; o helper `reverseAccountingEventTx` foi reforçado com motivo,
data explícita validada em período/exercício aberto, actor/auditoria e protecção
concorrente. Não há backfill heurístico nem documentos revertidos pela migration.
Subfase seguinte implementada: `P0-03b — anulação de recebimento de cliente`.

**P0-03b (2026-07-02):** implementada a anulação ponta a ponta de recebimento de
cliente a partir do `Payment`, com permissão `payments.cancel`, motivo/data
validados, idempotência `CUSTOMER_PAYMENT_REVERSE`, recálculo de `Invoice.amountPaid`
por pagamentos `ACTIVE`, restauração de `Customer.balance`, movimento compensatório
de Tesouraria ligado por `reversesId`, estorno contabilístico por verdade histórica
via `reverseAccountingEventTx` e auditoria `customer.payment.reverse` na mesma
transacção. O recibo original permanece no histórico como `ANULADO` e continua
visível/imprimível. Esta subfase antecedeu `P0-03a — cancelamento de factura`.

**P0-03a (2026-07-03):** implementado o cancelamento integral de factura sem
recebimentos activos, iniciado na `Invoice`, com permissão `invoices.cancel`,
motivo/data validados, idempotência `INVOICE_CANCEL`, decremento atómico de
`Customer.balance`, reposição de stock por `StockMovement` compensatório ligado por
`reversesId`, estorno contabilístico histórico de `SALE_ISSUED` via
`reverseAccountingEventTx` e auditoria `invoice.cancel` na mesma transacção. A
factura original permanece consultável/imprimível como `CANCELADA`, com número,
linhas, datas e valores preservados. `Payment ACTIVE` bloqueia; `Payment REVERSED`
permanece histórico e não bloqueia. Facturas legadas sem rastreabilidade de stock
necessária são rejeitadas para revisão administrativa. Esta subfase antecedeu `P0-03c — estorno de pagamento a fornecedor`.

**P0-03c (2026-07-03):** implementado o estorno ponta a ponta de pagamento a
fornecedor iniciado no `SupplierPayment`, com permissão `supplierPayments.reverse`,
motivo/data validados, idempotência `SUPPLIER_PAYMENT_REVERSE`, restauração de
`Supplier.balance`, recálculo de `PurchaseOrder.amountPaid` por pagamentos `ACTIVE`
quando existe ordem associada, movimento compensatório de Tesouraria ligado por
`reversesId`, estorno contabilístico histórico de `SUPPLIER_PAYMENT_POSTED` via
`reverseAccountingEventTx` e auditoria `supplier.payment.reverse` na mesma
transacção. O pagamento original permanece histórico como `ESTORNADO`; pagamentos
directos sem `PurchaseOrder` também são suportados sem criar ligações artificiais.
Esta subfase antecedeu `P0-03d — estorno integral de recepção de compra`.

**P0-03d (2026-07-03):** implementado o estorno integral de recepção de compra
iniciado na `PurchaseReceipt`, com permissão `purchaseReceipts.reverse`, motivo/data
validados, idempotência `PURCHASE_RECEIPT_REVERSE`, bloqueio conservador de
`SupplierPayment ACTIVE` ligado à ordem, validação de stock disponível no mesmo
armazém, bloqueio de movimentos posteriores incompatíveis, movimentos de stock
compensatórios `OUT` ligados por `reversesId`, recálculo de
`PurchaseOrderLine.receivedQty` e `PurchaseOrder.receivedValue` por recepções
`ACTIVE`, reversão de `Supplier.balance`, reconstrução segura de `Product.avgCost`
quando não há uso posterior, estorno contabilístico histórico de `PURCHASE_RECEIVED`
via `reverseAccountingEventTx` e auditoria `purchase.receipt.reverse` na mesma
transacção. A recepção original permanece consultável como `ESTORNADA`. Próxima
subfase: `P0-03e`.

**P0-03e (2026-07-03):** implementado o estorno atómico de transferência entre
contas de Tesouraria iniciado no `transferId`, com permissão
`treasury.reverseTransfer`, motivo/data validados, idempotência
`TREASURY_TRANSFER_REVERSE`, locks determinísticos das duas pernas e das duas
contas, criação de dois movimentos compensatórios ligados por `reversesId`,
restauração da conta de origem, redução da conta de destino, validação de saldo
negativo conforme `allowNegative`, marcação das duas pernas originais como
`REVERSED` e auditoria lógica única `treasury.transfer.reverse` na mesma
transacção. Os movimentos originais permanecem no histórico como `ESTORNADA` e
as pernas compensatórias preservam o `transferId`. Transferências internas ainda
não geram `JournalEntry`, por isso a reversão permanece limitada à Tesouraria.
Subfase seguinte implementada: `P0-03f`.

**P0-03f (2026-07-03):** fechada a regressão integrada dos estornos sem novos
fluxos financeiros. Criada a suite `accounting.reversals-uat.integration.test.ts`
com cenários UAT de venda/recebimento/cancelamento, compra/recepção/pagamento,
transferência entre contas e segurança transversal (permissões, isolamento
multiempresa, período/exercício fechado, idempotência e teardown). Criados os
comandos `pnpm test:integration:accounting:reversal:uat` e
`pnpm test:integration:accounting:reversal:all` (44/44). Documentação operacional
final em `docs/reversals-uat.md`, incluindo ordem recomendada, tabela de
permissões, limitações V1, checklist UAT manual e suporte/rollback. P0-03 fica
concluído. Próxima fase: `P0-04 — Dockerfiles e preparação da imagem de produção`
(não iniciar sem validação limpa e autorização explícita).

**P0-04 (2026-07-04):** concluída a preparação Docker de produção sem deploy: imagens web/worker
multi-stage, target explícito de migrations, `.dockerignore`, scripts e documentação de variáveis,
build e operação. Validações executadas: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
`pnpm docker:build:web`, `pnpm docker:build:worker`, `pnpm docker:production:build`, build do
serviço `migrate` com profile `migration`, verificação de runtime não-root e ausência de `.env` nas
imagens.

**P0-05 (2026-07-04):** concluída a correcção de segurança do login multiempresa. `authenticate`
deixou de usar a primeira conta encontrada por email como empresa implícita; contas com uma única
empresa activa entram directamente, contas com várias empresas activas exigem escolha explícita em
`/seleccionar-empresa`, e contas sem empresa activa ficam fora do ERP operacional. A escolha é
guardada no JWT apenas por update server-side validado contra os `companyIds` autenticados no login,
e o `RequestContext` revalida empresa/utilizador/permissões na base antes de executar domínio.
Suite dedicada: `pnpm test:integration:auth:company-selection` (7/7).

**Commit da 8c.3:** este commit exclusivo, `feat(accounting): integrate purchase receipts and supplier payments`.

> ⚠️ **Lembrete:** após cada `db:seed` que adicione **novas permissões**, as sessões antigas (JWT)
> não as têm — é preciso **terminar e reiniciar sessão** para o gate passar a reconhecê-las.

## Problemas conhecidos

### Data de emissão e limite de período da factura

Em 2026-06-30, foi adicionada a data de emissão visível em Nova factura e
passada explicitamente ao domínio como data civil `YYYY-MM-DD`. Em 2026-07-01,
a regra foi fechada: a data é preenchida automaticamente com o dia actual em
`Africa/Maputo`, fica visível para confirmação e permanece bloqueada enquanto
não existir permissão específica para edição retroactiva.

Foi corrigida a validação de pertença ao período para comparar datas civis, de
modo que o último dia do período continua aceite mesmo quando o valor contém hora
posterior a 00:00. Foram adicionados testes unitários para parsing/comparação de
datas e testes `8c.2b` para persistência, auditoria, idempotência, rejeição de
datas diferentes da data actual e garantia de que `SALE_ISSUED.entryDate` usa
exactamente `Invoice.issueDate`. A edição retroactiva da data de emissão fica
registada como melhoria futura, dependente de uma permissão própria. A Fase 8c.3
permanece concluída, sem avanço funcional.

### Runtime UI de estados vazios de compras

Em 2026-06-30, foi corrigido um bug isolado de UI nos estados vazios de
compras/recepção/perfil de fornecedor: o pagamento a fornecedor já não deriva
`accountId` da primeira conta disponível e a recepção sem linhas pendentes fica
desactivada. Foram adicionados testes puros para compras sem ordens, recepção
sem linhas e pagamento sem conta seleccionada. A Fase 8c.3 permanece concluída,
sem avanço funcional.

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
  - **8c.3 — Fornecedores/compras** _(✅ concluída)_: `receivePurchaseOrder()` continua a API pública,
    cria internamente `PurchaseReceipt` e `PurchaseReceiptItem`, gera `receiptNumber` por
    `DocumentCounter`, liga `StockMovement.purchaseReceiptId` e publica `PURCHASE_RECEIVED` no diário
    `PURCHASES` respeitando período/exercício aberto pela `receiptDate`. `SupplierPayment` exige
    `idempotencyKey` + `accountId`, usa `SUPPLIER_PAYMENT_CREATE`, gera `TreasuryMovement` e publica
    `SUPPLIER_PAYMENT_POSTED` em `CASH`/`BANK` por tipo de conta (`MOBILE` → `BANK`, `OTHER` rejeitado).
    Sem novas permissões; a fase mantém `purchases.create`. Testes: 16 cenários
    (`pnpm test:integration:accounting:c3`).
  - **P0-03.0 — Fundação técnica de reversões** _(✅ concluída)_: estados/metadados de cancelamento
    e reversão, rastreabilidade `Invoice`→`StockMovement`, self-reference `StockMovement.reversesId`,
    novos scopes de idempotência, permissões de reversão para pagamentos/recepções/transferências e
    reforço de `reverseAccountingEventTx`. Sem UI, sem cancelamento/anulação funcional e sem backfill.
  - **P0-03b / 8c.4** _(✅ concluída)_: anulação integral de recebimento de cliente iniciada no
    `Payment`, atómica sobre `Invoice`, `Customer`, `TreasuryMovement`, `TreasuryAccount`,
    `JournalEntry`, `AuditLog` e `OperationIdempotency`; recibo original preservado como
    `ANULADO`. Suite dedicada: `pnpm test:integration:accounting:reversal:customer-payment`.
  - **P0-03a / 8c.4** _(✅ concluída)_: cancelamento integral de factura iniciada na `Invoice`,
    atómica sobre `Customer`, `StockMovement`/`StockLevel`, `JournalEntry`, `AuditLog` e
    `OperationIdempotency`; factura original preservada como `CANCELADA`. Suite dedicada:
    `pnpm test:integration:accounting:reversal:invoice`.
  - **P0-03c / 8c.4** _(✅ concluída)_: estorno integral de pagamento a fornecedor iniciado no
    `SupplierPayment`, atómico sobre `Supplier`, `PurchaseOrder` quando aplicável,
    `TreasuryMovement`/`TreasuryAccount`, `JournalEntry`, `AuditLog` e `OperationIdempotency`;
    pagamento original preservado como `ESTORNADO`. Suite dedicada:
    `pnpm test:integration:accounting:reversal:supplier-payment`.
  - **P0-03d / 8c.4** _(✅ concluída)_: estorno integral de recepção de compra iniciado na
    `PurchaseReceipt`, atómico sobre `PurchaseOrder`, `PurchaseOrderLine`, `Supplier`,
    `StockLevel`/`StockMovement`, `Product.avgCost`, `JournalEntry`, `AuditLog` e
    `OperationIdempotency`; recepção original preservada como `ESTORNADA`. Suite dedicada:
    `pnpm test:integration:accounting:reversal:purchase-receipt`.
  - **P0-03e / 8c.4** _(✅ concluída)_: estorno atómico de transferência entre contas iniciado no
    `transferId`, atómico sobre as duas pernas `TreasuryMovement`, duas `TreasuryAccount`,
    dois compensatórios, `AuditLog` e `OperationIdempotency`; movimentos originais preservados
    como `ESTORNADA`. Suite dedicada:
    `pnpm test:integration:accounting:reversal:treasury-transfer`.
  - **P0-03f / 8c.4** _(✅ concluída)_: regressão integrada, UAT e documentação final dos
    estornos, com suite `pnpm test:integration:accounting:reversal:uat`, agregado
    `pnpm test:integration:accounting:reversal:all` e documentação
    `docs/reversals-uat.md`.
    Diferidos: COGS, backfill (dry-run) e ecrãs contabilísticos finais.
  - **P0-04** _(✅ concluída)_: Dockerfiles e preparação da imagem de produção.
  - **P0-05** _(✅ concluída)_: login multiempresa exige empresa activa validada; múltiplas
    empresas activas vão para selector explícito, sem aceitar `companyId` do cliente como verdade.
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
- **P0-09 — UAT comercial e prontidao de piloto** _(✅ concluída)_ — pacote documental e criterios
  de decisao para validar operacionalmente a V1 com dados ficticios antes de qualquer piloto real.
- **Fase 9 — RH & Salários** — colaboradores, contratos, processamento salarial (liga à
  contabilidade via `systemKeys` `SALARIES_EXPENSE`/`SALARIES_PAYABLE` e à tesouraria).
- **Extensões da Facturação/POS** — cotações, NC/ND, devolução POS, recibo/impressão avançada,
  scanner/código de barras operacional e restaurante/bar completo com mesas.
- **Extensões da Tesouraria** — conciliação bancária, fecho de caixa com contagem de denominações.
- **Contabilidade (avançado)** — Balanço, Demonstração de Resultados, Fluxo de Caixa, mapa de
  antiguidade de saldos.
- _(mais tarde: Produção, Contratos/Subscrições, Relatórios/Dashboards, Notificações/Workflows,
  PWA/Offline, Deploy VPS+Cloudflare.)_
