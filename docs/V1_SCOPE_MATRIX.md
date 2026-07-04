# Matriz de funcionalidades V1 - ANTS ERP

_Ultima actualizacao: 2026-07-05_

Estados usados:

- `pronto para UAT`: implementado e coberto por validacao/documentacao suficiente para UAT interna.
- `parcial`: existe base tecnica ou UI, mas nao deve ser vendido como completo.
- `fora da V1`: nao faz parte do piloto controlado inicial.
- `bloqueado`: exige decisao ou trabalho previo antes de UAT/piloto.
- `futuro`: backlog pos-P0/V1.

| Modulo | Funcionalidade | Estado | Evidencia | Risco | Decisao V1 |
|---|---|---|---|---|---|
| Autenticacao | Login Credentials, logout, troca obrigatoria de password quando aplicavel | pronto para UAT | `packages/domain/src/auth.ts`, `/login`, `/trocar-password`, `pnpm test:integration:auth:company-selection` | Revogacao completa de sessoes ainda futura | Incluir |
| Multiempresa | Seleccao explicita de empresa activa e revalidacao server-side | pronto para UAT | `/seleccionar-empresa`, `apps/web/src/lib/session.ts`, P0-05 7/7 | Sessao antiga depende de revalidacao em RequestContext | Incluir |
| Clientes | Listar, criar, editar e consultar saldos/extracto | pronto para UAT | `customers.ts`, `/clientes`, `/contas/perfil` | Sem CRM avancado | Incluir |
| Fornecedores | Listar, criar, editar e consultar saldos/extracto | pronto para UAT | `suppliers.ts`, `/fornecedores`, `/contas/perfil` | Sem portal fornecedor | Incluir |
| Produtos/Stock | Catalogo, armazens, inventario, movimentos e custo medio em compras | pronto para UAT | `products.ts`, `stock.ts`, `/produtos`, `/inventario` | Sem rastreios avancados/lotes | Incluir |
| Vendas/Facturacao | Factura simples com stock, cliente, totais e recibos | pronto para UAT | `invoices.ts`, `/facturas`, `/facturas/nova`, `/facturas/documento` | Sem POS fiscal, NC/ND e COGS de venda | Incluir com limites |
| Recebimentos | Receber factura em conta de tesouraria com contabilidade | pronto para UAT | `createPayment`, `RECEIPT_POSTED`, testes 8c.2b/P0-03 | Exige conta de tesouraria mapeada | Incluir |
| Compras | Ordem de compra e recepcao de mercadoria | pronto para UAT | `purchases.ts`, `/compras`, `/recepcao`, testes 8c.3 | Sem devolucao comercial ao fornecedor | Incluir |
| Pagamentos | Pagamento a fornecedor com tesouraria e contabilidade | pronto para UAT | `createSupplierPayment`, `SUPPLIER_PAYMENT_POSTED`, testes 8c.3/P0-03 | Exige conta de tesouraria mapeada | Incluir |
| Tesouraria | Contas, movimentos, transferencias e relatorio diario | pronto para UAT | `treasury.ts`, `/tesouraria`, `/tesouraria/fecho` | Conciliacao bancaria ainda futura | Incluir |
| Contabilidade | Plano, periodos, mappings, lancamentos, razao e balancete no dominio | parcial | `accounting.ts`, suites 8b/8c, pagina `/contabilidade` | Ecras contabilisticos finais 8d ainda pendentes | Incluir como integracao/backoffice limitado |
| Reversoes | P0-03 ponta a ponta para recebimentos, facturas, pagamentos, recepcoes e transferencias | pronto para UAT | `docs/reversals-uat.md`, `pnpm test:integration:accounting:reversal:all` | Sem estorno parcial/NC/ND | Incluir com limites V1 |
| Relatorios | Biblioteca visual de relatorios/exportacoes | parcial | `/relatorios`, `apps/web/src/lib/data/reports.ts` | Dados mockados; nao operacional | Nao vender como pronto |
| Backup/Restore | Backup manual, restore destrutivo e rollback documentado | pronto para UAT | `docs/BACKUP_RESTORE.md`, scripts `ops:staging:*` | Sem storage remoto/encriptacao automatica | Incluir como runbook manual |
| Staging/Deploy | Staging Docker, imagens web/worker/migrate, health | pronto para UAT | `docs/STAGING.md`, `docker-compose.staging.yml`, P0-06/P0-08 | Deploy real VPS fora do escopo | Incluir staging; excluir deploy real |
| Seguranca | Env validation, placeholders bloqueados, headers, CORS same-origin, rate limit, logs redigidos, health minimo | pronto para UAT | `docs/SECURITY.md`, testes production-hardening 16/16 | CSP, rate limit centralizado, RLS e observabilidade futuras | Incluir com riscos aceites |
| RH | Colaboradores e salarios | futuro | `/rh`, `apps/web/src/lib/data/hr.ts` | UI/dados mockados | Fora da V1 |
| Salarios | Processamento salarial | futuro | `/rh` | Sem dominio, schema ou integracao | Fora da V1 |
| Contratos/Subscricoes | Contratos e renovacoes | futuro | `/contratos`, `apps/web/src/lib/data/finance.ts` | UI/dados mockados | Fora da V1 |
| Producao | Ordens, ficha tecnica e custo de producao | futuro | `/producao`, `apps/web/src/lib/data/production.ts` | UI/dados mockados | Fora da V1 |
| Restaurante/Bar | POS/restaurante/bar | futuro | `/pos` usa catalogo local/mockado | Sem dominio fiscal/stock real de POS | Fora da V1 |
