# Matriz de funcionalidades V1 - ANTS ERP

_Ultima actualizacao: 2026-07-08_

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
| Vendas/Facturacao | Factura simples com stock, cliente, totais, recibos e POS basico | pronto para UAT | `invoices.ts`, `/facturas`, `/facturas/nova`, `/facturas/documento`, `/pos`, `pnpm test:integration:pos` | Sem POS fiscal, NC/ND, devolucao POS e COGS de venda | Incluir com limites |
| Impressao/PDF comercial | Factura, recibo, fecho de caixa V1 e relatorios V1 com impressao/guardar PDF pelo navegador | pronto para UAT | `/facturas/documento`, `/facturas/recibo`, `/tesouraria/fecho`, `/relatorios`, `PrintButton`, CSS print, `pnpm test:integration:reports`, `pnpm test:integration:treasury:cash-closing` | PDF fiscal oficial, assinatura digital/fiscal, envio por email, impressao termica avancada e layout personalizavel ficam futuros | Incluir com limites |
| POS | Venda rapida com produtos reais, Cliente final, factura + recibo, stock, tesouraria, contabilidade e auditoria | parcial/pronto para UAT limitado | `createPosSale`, `/pos`, `pnpm test:integration:pos` | Sem mesas, cozinha, offline, turnos, fecho persistido, scanner real e impressao termica avancada | Incluir apenas como checkout simples |
| Recebimentos | Receber factura em conta de tesouraria com contabilidade | pronto para UAT | `createPayment`, `RECEIPT_POSTED`, testes 8c.2b/P0-03 | Exige conta de tesouraria mapeada | Incluir |
| Compras | Ordem de compra e recepcao de mercadoria | pronto para UAT | `purchases.ts`, `/compras`, `/recepcao`, testes 8c.3 | Sem devolucao comercial ao fornecedor | Incluir |
| Pagamentos | Pagamento a fornecedor com tesouraria e contabilidade | pronto para UAT | `createSupplierPayment`, `SUPPLIER_PAYMENT_POSTED`, testes 8c.3/P0-03 | Exige conta de tesouraria mapeada | Incluir |
| Tesouraria | Contas, movimentos, transferencias, relatorio diario e Fecho de Caixa V1 operacional | pronto para UAT | `treasury.ts`, `/tesouraria`, `/tesouraria/fecho`, `/tesouraria/fecho/exportar`, `pnpm test:integration:treasury:cash-closing` | Sem abertura formal de turno, aprovacao obrigatoria, bloqueio apos fecho, persistencia formal do fecho, gaveta fisica, impressao termica e conciliacao bancaria avancada | Incluir com limites |
| Fecho de Caixa V1 | Consulta movimentos do dia, entradas/saidas, saldo esperado, valor contado, diferenca, status sem diferenca/sobra/falta, CSV e impressao/guardar PDF | pronto para UAT limitado | `cashClosingReport`, `exportCashClosingCsv`, `/tesouraria/fecho`, `pnpm test:integration:treasury:cash-closing` 11/11 | Calculo operacional sem gravar fecho; observacoes e valor contado ficam apenas no relatorio imprimivel; fecho persistido formal fica futuro | Incluir com limites claros |
| Contabilidade | Plano de contas, diario de lancamentos, razao/extracto por conta, balancete, filtros, CSV e impressao/guardar PDF pelo navegador | pronto para UAT | `accounting.ts`, `/contabilidade`, `/contabilidade/exportar`, `pnpm test:integration:accounting:reports` | Sem lancamentos manuais, fecho anual, DRE oficial, balanco oficial, fiscal/AT, assinatura digital, reconciliacao bancaria avancada e centros de custo avancados | Incluir com limites V1 |
| Reversoes | P0-03 ponta a ponta para recebimentos, facturas, pagamentos, recepcoes e transferencias | pronto para UAT | `docs/reversals-uat.md`, `pnpm test:integration:accounting:reversal:all` | Sem estorno parcial/NC/ND | Incluir com limites V1 |
| Relatorios | Relatorios V1 operacionais com filtros basicos, CSV e impressao/guardar PDF pelo navegador | pronto para UAT | `packages/domain/src/reports.ts`, `/relatorios`, `/relatorios/exportar`, `pnpm test:integration:reports` | PDF automatico/fiscal, Excel avancado, salarios, producao, BI e relatorio personalizado ficam futuros | Incluir com limites |
| Backup/Restore | Backup manual, restore destrutivo e rollback documentado | pronto para UAT | `docs/BACKUP_RESTORE.md`, scripts `ops:staging:*` | Sem storage remoto/encriptacao automatica | Incluir como runbook manual |
| Staging/Deploy | Staging Docker, imagens web/worker/migrate, health | pronto para UAT | `docs/STAGING.md`, `docker-compose.staging.yml`, P0-06/P0-08 | Deploy real VPS fora do escopo | Incluir staging; excluir deploy real |
| Seguranca | Env validation, placeholders bloqueados, headers, CORS same-origin, rate limit, logs redigidos, health minimo | pronto para UAT | `docs/SECURITY.md`, testes production-hardening 16/16 | CSP, rate limit centralizado, RLS e observabilidade futuras | Incluir com riscos aceites |
| RH | Colaboradores e salarios | futuro | `/rh`, `apps/web/src/lib/data/hr.ts` | UI/dados mockados | Fora da V1 |
| Salarios | Processamento salarial | futuro | `/rh` | Sem dominio, schema ou integracao | Fora da V1 |
| Contratos/Subscricoes | Contratos e renovacoes | futuro | `/contratos`, `apps/web/src/lib/data/finance.ts` | UI/dados mockados | Fora da V1 |
| Producao | Ordens, ficha tecnica e custo de producao | futuro | `/producao`, `apps/web/src/lib/data/production.ts` | UI/dados mockados | Fora da V1 |
| Restaurante/Bar | Mesas, comandas, cozinha, garcons e fluxo bar/restaurante completo | futuro | Nao implementado | POS V1 cobre apenas checkout simples | Fora da V1 |
