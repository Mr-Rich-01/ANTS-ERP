# UAT Interna - ANTS ERP V1

## Versao testada

- Commit: `aa244fd` (`feat(print): add professional document printing`)
- Data: 2026-07-06 11:50:28 +02:00
- Branch de evidencia: `test/internal-uat-demo`
- Ambiente: Windows local, Next.js dev server em `http://localhost:3000`, PostgreSQL local `ants_erp` em `localhost:5432`
- Utilizador demo: `admin@ants.co.mz` (Administrador da Empresa)
- Empresa demo: ANTS Demo, Lda. / ANTS Comercial (`demo-company`)
- Base de dados: dados ficticios de seed/demo; nenhum dado real de cliente foi usado
- Estado inicial Git: `main`, HEAD `aa244fd`, working tree limpa, stash vazia, apenas branch local `main`
- Limitacoes conhecidas: PDF via dialogo do navegador, sem PDF fiscal oficial, sem assinatura digital/fiscal, sem envio automatico por email, sem impressao termica avancada, sem restaurante/bar completo, sem offline, sem scanner real, sem salarios/producao avancados.

## Resumo executivo

- Pronto para demo externa: Sim, com ressalvas.
- Principais pontos validados: schema Prisma, migrations, Prisma Client, typecheck, lint, testes unitarios, relatorios V1, POS V1, contabilidade integrada, hardening de producao, seleccao de empresa e build.
- Bloqueadores: nenhum encontrado.
- Riscos: logout deve ser revalidado manualmente antes da demo externa; o shell ainda contem um titulo visual fixo de factura em `apps/web/src/lib/erp-nav.ts`.
- Recomendacao: fazer pequenos ajustes UX/verificacao de logout antes da demo externa.

## Validacoes tecnicas

| Comando | Resultado | Evidencia |
|---|---:|---|
| `pnpm --filter @ants/database exec prisma validate --schema prisma/schema.prisma` | OK | Schema valido |
| `pnpm --filter @ants/database exec prisma migrate status --schema prisma/schema.prisma` | OK | 13 migrations; base actualizada |
| `pnpm db:generate` | OK | Prisma Client gerado |
| `pnpm typecheck` | OK | 6/6 tarefas |
| `pnpm lint` | OK | 6/6 tarefas |
| `pnpm test` | OK | 89/89 testes |
| `pnpm test:integration:reports` | OK | 10/10 testes |
| `pnpm test:integration:pos` | OK | 12/12 testes |
| `pnpm test:integration:accounting` | OK | 189/189 testes |
| `pnpm test:integration:security:production-hardening` | OK | 16/16 testes |
| `pnpm test:integration:auth:company-selection` | OK | 7/7 testes |
| `pnpm build` | OK | web/worker build; 31 paginas estaticas + rotas dinamicas |

## Ambiente demo

| Item | Resultado | Evidencia |
|---|---|---|
| App local | OK | `/login` respondeu HTTP 200; dev server pronto em `localhost:3000` |
| Empresa demo | OK | ANTS Demo, Lda. / ANTS Comercial |
| Utilizadores demo | OK | Admin, Caixa, Vendedor e Contabilista activos; `lucia@ants.co.mz` inactiva |
| Produtos demo | OK | 9 produtos |
| Stock demo | OK | 8 niveis de stock com quantidade positiva |
| Clientes demo | OK | 8 clientes |
| Fornecedores demo | OK | 6 fornecedores |
| Armazens | OK | Armazem Maputo e Armazem Matola activos |
| Tesouraria POS | OK | Caixa Principal, M-Pesa, e-Mola e contas bancarias activas |

## Checklist funcional

| Area | Caso de teste | Resultado | Evidencia | Severidade | Observacoes |
|---|---|---|---|---|---|
| Login | Abrir `/login` | OK | HTTP 200 e formulario Server Action renderizado | - | Browser integrado tinha sessao previa autenticada |
| Login | Login demo | Parcial | Suite `auth company-selection` 7/7; sessao browser existente autenticada como admin | Alto | Revalidar manualmente em browser limpo antes da demo |
| Login | Logout | Parcial | Botao `Terminar sessao` visivel; clique gerou `POST / 303`, mas a sessao visual permaneceu autenticada | Alto | Revalidar manualmente; nao corrigido nesta tarefa |
| Empresa | Empresa activa | OK | Shell mostrou `ANTS Comercial` como empresa activa | - | Sem evidencia de fuga cross-company; suites cobrem isolamento |
| Dashboard | Navegacao principal | OK | Menu com Visao Geral, POS, Facturas, Clientes, Compras, Fornecedores, Stock, Tesouraria, Contabilidade, Relatorios, Admin | - | Modulos futuros usam placeholder |
| POS | Checkout simples | OK | `pnpm test:integration:pos` 12/12 | - | UI confirma Cliente final, metodos compactos e ausencia de selector de conta de tesouraria no POS |
| POS | Stock insuficiente/idempotencia | OK | Suite POS cobre bloqueio por stock e replay idempotente | - | Nao foi criada venda via UI por limitacao do browser integrado |
| Facturacao | Listagem/documentos | OK | Build inclui `/facturas`, `/facturas/documento` e `/facturas/nova` | - | Conteudo validado por suites de dominio/build |
| Recibo | Recibo associado | OK | Build inclui `/facturas/recibo`; testes reports cobrem recibo imprimivel | - | PDF via navegador |
| Impressao | Factura/recibo/fecho/relatorios | OK | Build e `reports` 10/10 | - | `PrintButton` presente; PDF fiscal oficial fora do escopo |
| Relatorios | Relatorios V1 reais | OK | `pnpm test:integration:reports` 10/10 | - | Vendas, clientes, compras, fornecedores, stock, caixa e auditoria |
| CSV | Exportacao CSV | OK | Rota `/relatorios/exportar` usa `exportOperationalReportCsv`, `getContext` e `forCompany` | - | Testes reports cobrem CSV |
| Stock | Produtos e movimentos | OK | POS 12/12 e contabilidade 189/189 | - | 8 stocks positivos em demo |
| Tesouraria | Recebimento/POS/fluxo de caixa | OK | POS 12/12 e reports 10/10 | - | Contas demo activas confirmadas |
| Compras | Compras/fornecedores | OK | Contabilidade 189/189; dados demo com 6 fornecedores e 2 compras | - | Sem criacao forcada em demo |
| Fornecedores | Extracto/saldos | OK | Reports 10/10 e contabilidade 189/189 | - | Dados ficticios |
| Auditoria | Operacoes recentes | OK | 136 audit logs em demo; reports 10/10 | - | Dados ficticios |
| Permissoes | Permissoes basicas | OK | POS, reports, auth e accounting cobrem permissoes relevantes | - | Perfil Caixa existe e esta activo |

## Problemas encontrados

| ID | Area | Descricao | Severidade | Estado | Recomendacao |
|---|---|---|---|---|---|
| UAT-001 | Login/Logout | No browser integrado, o botao `Terminar sessao` apareceu e o servidor registou `POST / 303`, mas a UI continuou autenticada. A segunda tentativa foi bloqueada pela politica do browser integrado, por isso nao houve confirmacao manual limpa. | Alto | Aberto para verificacao | Revalidar logout num browser limpo antes da demo externa; corrigir se reproduzir. |
| UAT-002 | Facturacao/Shell | `apps/web/src/lib/erp-nav.ts` ainda contem titulo fixo `Factura FT 2026/0337` para `/facturas/documento`. Afecta o titulo visual/shell, nao a regra financeira nem o conteudo do documento. | Medio | Confirmado | Corrigir antes da demo externa para evitar confusao visual. |
| UAT-003 | Demo tooling | O browser integrado ficou preso numa pagina interna de erro apos tentativa de submissao programatica e bloqueou navegacao local subsequente. | Baixo | Limitacao de ferramenta | Usar browser externo/limpo para smoke manual final, sem alterar o produto. |

## Ajustes pre-demo - 2026-07-07

- UAT-001: fluxo de logout revisto sem alteracao funcional; a tentativa de revalidacao visual em
  aba nova chegou a `POST /login 303`, mas o browser integrado bloqueou a continuacao da navegacao.
  Repetir smoke em browser externo/limpo antes da demo externa.
- UAT-002: corrigido. O shell da rota `/facturas/documento` deixou de usar o titulo fixo
  `Factura FT 2026/0337` e passou a usar titulo generico.
- UAT-003: mitigado para a demo. Modulos futuros foram removidos da navegacao principal ou marcados
  claramente como "Futuro", sem botoes operacionais nem dados simulados como prontos.
- Esta actualizacao nao marca producao pronta, nao autoriza piloto real e nao inicia P1-04.

## Actualizacao P1-04 - 2026-07-07

- P1-04 foi iniciada por decisao explicita posterior a esta UAT interna.
- Contabilidade V1 passou a ter diario, razao/extracto por conta, balancete,
  CSV e impressao/guardar PDF via browser ligados a dados reais.
- Ajuste pre-integracao: balancete filtrado por conta deixa de aparecer como
  erro global, saldos acumulados aparecem em MT, labels tecnicos visiveis foram
  traduzidos e lancamento manual contabilistico permanece futuro.
- A validacao especifica da fase usa `pnpm test:integration:accounting:reports`.
- Esta actualizacao nao altera a decisao historica da UAT de 2026-07-06, nao
  marca producao pronta, nao autoriza piloto real e nao inicia P1-05.

## Actualizacao P1-05 - 2026-07-08

- P1-05 foi iniciada por decisao explicita posterior a P1-04.
- `/tesouraria/fecho` passou de relatorio diario simples para Fecho de Caixa V1
  operacional: data, conta, caixa/utilizador, saldo inicial, entradas, saidas,
  vendas POS, recebimentos, pagamentos, transferencias, saldo esperado, valor
  contado, diferenca, status `Sem diferenca`/`Sobra`/`Falta`, observacoes,
  CSV e impressao/guardar PDF pelo navegador.
- Nao foi criado schema, migration ou modelo de sessao/fecho. O valor contado e
  as observacoes nao sao persistidos; aparecem apenas no relatorio preparado e
  imprimivel.
- A validacao especifica da fase usa `pnpm test:integration:treasury:cash-closing`
  (11/11).
- Esta actualizacao nao altera a decisao historica da UAT de 2026-07-06, nao
  marca producao pronta, nao autoriza piloto real e nao inicia P1-06.

## Limitacoes aceites para demo

- PDF via navegador.
- Sem PDF fiscal oficial.
- Sem assinatura digital.
- Sem email automatico.
- Sem impressao termica.
- Sem restaurante/bar completo.
- Sem offline.
- Sem scanner real.
- Sem salarios/producao avancados.
- Sem abertura formal de turno, aprovacao obrigatoria, bloqueio apos fecho,
  gaveta fisica, impressao termica ou fecho de caixa persistido formal.

## Decisao

Aprovado com ressalvas.

Nao ha bloqueadores tecnicos nas suites nem no build. Antes da demo externa, repetir o smoke de logout num browser externo/limpo por causa da limitacao do browser integrado. Esta UAT nao autoriza piloto real, producao real nem inicio automatico da proxima fase.
