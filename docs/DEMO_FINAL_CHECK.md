# Demo Final Check - ANTS ERP V1

## Versao

- Commit: `5d78aa6` (`fix(accounting): polish V1 ledger presentation`)
- Data: 2026-07-08
- Ambiente: local Windows, PostgreSQL/Redis Docker dev, Next.js dev server
- Porta usada: `3000`
- URL usada: `http://localhost:3000`
- Processo parado: `next dev` anterior deste projecto em `3210` (`PID 8728`) para libertar o Prisma Client durante `pnpm db:generate`
- Utilizador demo: `admin@ants.co.mz`
- Empresa demo: `ANTS Demo, Lda.` (`demo-company`), nome comercial no shell `ANTS Comercial`

## Resultado

Pronto com ressalvas menores.

## Validacoes tecnicas

| Comando | Resultado | Observacao |
|---|---:|---|
| `pnpm --filter @ants/database exec prisma validate --schema prisma/schema.prisma` | OK | Schema valido |
| `pnpm --filter @ants/database exec prisma migrate status --schema prisma/schema.prisma` | OK | 13 migrations, base actualizada |
| `pnpm db:generate` | OK | Primeira tentativa bloqueada por `next dev` antigo em `3210`; repetido com sucesso apos parar o processo do projecto |
| `pnpm typecheck` | OK | 6/6 tarefas |
| `pnpm lint` | OK | 6/6 tarefas, sem warnings |
| `pnpm test` | OK | 89/89 |
| `pnpm test:integration:accounting:reports` | OK | 14/14 |
| `pnpm test:integration:accounting` | OK | 203/203 |
| `pnpm test:integration:reports` | OK | 24/24 |
| `pnpm test:integration:pos` | OK | 12/12 |
| `pnpm test:integration:auth:company-selection` | OK | 7/7 |
| `pnpm test:integration:security:production-hardening` | OK | 16/16 |
| `pnpm build` | OK | 2/2 tarefas, web compilada, 31 paginas geradas |

## Checklist

| Area | Caso | Resultado | Observacao |
|---|---|---|---|
| Login/logout | Login com utilizador demo | Parcial | `POST /login` devolveu `303` e sessao HTTP autenticada foi criada; browser integrado bloqueou a leitura visual depois do redirect |
| Login/logout | `/pos` sem sessao | OK | Pedido limpo devolveu `307` para `/login` |
| POS | Abrir `/pos` | OK | Pagina autenticada respondeu `200` |
| POS | Cliente final | OK | Texto `Cliente final` presente |
| POS | Metodo Dinheiro | OK | Metodo `Dinheiro` presente |
| POS | Finalizar venda | Parcial | UI mostra `Finalizar venda`; checkout ponta a ponta coberto por `pnpm test:integration:pos` 12/12, mas nao clicado no browser por bloqueio do browser integrado |
| POS | Selector de conta de tesouraria | OK | Texto de selector de conta de tesouraria nao apareceu no POS |
| Factura | Documento imprimivel | OK | `Documento de factura` presente em factura real `FT 2026/0019`; numero fixo antigo `FT 2026/0337` ausente |
| Recibo | Documento imprimivel | OK | Recibo real `REC 2026/0012` abriu com sucesso |
| Impressao | Botao `Imprimir / Guardar PDF` | OK | Presente em factura, recibo, relatorios e contabilidade |
| Impressao | Cabecalho da empresa | OK | Cabecalho da empresa presente nos documentos imprimiveis |
| Relatorios | Relatorio de vendas | OK | Presente e marcado como V1 real |
| Relatorios | Extracto de clientes | OK | Presente |
| Relatorios | Fluxo de caixa | OK | Presente |
| CSV | Exportacao real | OK | Links/accoes CSV presentes em relatorios e contabilidade; suites de integracao validaram conteudo |
| Relatorios | PDF/Excel avancados | OK | `PDF futuro` e `Excel futuro` permanecem desactivados/futuros |
| Relatorios | Mock visivel | OK | Nenhuma ocorrencia visivel de `mock` nas paginas autenticadas verificadas |
| Contabilidade | Plano de contas | OK | Presente |
| Contabilidade | Diario | OK | Presente |
| Contabilidade | Razao/extracto | OK | Presente |
| Contabilidade | Balancete | OK | Presente |
| Contabilidade | Filtro Tipo em portugues | OK | Campo `Tipo` presente |
| Contabilidade | Saldo acumulado em MT | OK | Valores em `MT` presentes |
| Contabilidade | Balancete filtrado sem erro global | OK | Suite `accounting:reports` 14/14 cobre o comportamento |
| Contabilidade | Novo lancamento activo | OK | Nao foi encontrado `Novo lancamento` activo/visivel |
| Tesouraria | Abrir `/tesouraria` | OK | Pagina autenticada respondeu `200`, saldos e movimentos reais visiveis |
| Stock | Abrir `/inventario` | OK | Pagina autenticada respondeu `200`, armazens e contagem visiveis |
| Navegacao | Modulos futuros fora da navegacao principal | OK | Produccao, Contratos e RH nao aparecem como prontos no menu principal |
| Modulos futuros | Paginas directas | OK | `/producao`, `/contratos` e `/rh` respondem `200` com aviso `Futuro` |

## Ressalvas

- A validacao visual interactiva em browser externo/limpo nao foi concluida por limitacao da automacao: o browser integrado bloqueou a leitura apos o redirect do login. Foi usada sessao HTTP autenticada para confirmar paginas e textos principais, e as suites de integracao cobriram os fluxos ponta a ponta.
- Recomenda-se uma repeticao manual curta, em browser externo/limpo, apenas para confirmar logout visual e clique final do checkout POS antes da demo externa.

## Limites comunicaveis ao cliente

- PDF via navegador;
- sem PDF fiscal oficial;
- sem assinatura digital;
- sem impressao termica;
- sem offline;
- sem restaurante/bar completo;
- sem lancamento manual contabilistico;
- sem fecho anual;
- sem DRE/balanco oficial;
- sem fiscal/AT.

## Decisao

A demo externa pode avancar como UAT/demo com dados ficticios, sem marcar producao pronta e sem autorizar piloto real. Antes de apresentar ao cliente, repetir manualmente em browser externo/limpo os dois pontos visuais restantes: logout e finalizacao POS.
