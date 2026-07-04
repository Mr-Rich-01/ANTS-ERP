# UAT comercial e prontidao de piloto - ANTS ERP

_Ultima actualizacao: 2026-07-05_

Este documento define a UAT comercial da primeira versao comercial controlada do
ANTS ERP. A UAT usa apenas dados ficticios e acontece antes de qualquer piloto
com cliente real, deploy real ou uso de dados reais.

## 1. Objectivo da UAT

Validar, com utilizadores comerciais e tecnicos, que os fluxos P0 do ERP estao
compreensiveis, consistentes e prontos para uma decisao de piloto controlado.
A UAT confirma o comportamento funcional, operacional e de seguranca ja
implementado; nao cria funcionalidades novas nem altera regras de negocio.

## 2. Escopo da UAT

### Dentro do escopo

- Login e logout.
- Seleccao explicita de empresa activa.
- Dashboard e navegacao principal.
- Gestao basica de clientes.
- Gestao basica de fornecedores.
- Produtos, armazens, stock e inventario.
- Vendas e facturacao.
- Recebimentos de clientes.
- Compras, ordens de compra e recepcoes.
- Pagamentos a fornecedores.
- Tesouraria, contas, movimentos e transferencias.
- Reversoes P0-03: anular recebimento, cancelar factura, estornar pagamento a
  fornecedor, estornar recepcao de compra e estornar transferencia.
- Backup/restore operacional P0-07.
- Health e staging Docker P0-06.
- Hardening de producao P0-08.

### Fora do escopo

- Funcionalidades ainda nao implementadas ou marcadas como futuras.
- Deploy real em VPS, Cloudflare ou CI/CD.
- Dados reais de cliente, fornecedor, colaborador ou banco.
- RLS transversal na base de dados.
- Backup remoto automatico, retencao e encriptacao operacional.
- Observabilidade avancada.
- UAT com cliente real.
- Novas migrations, schema, dependencias ou regras financeiras.

## 3. Criterios de entrada

A UAT so pode comecar se:

- `main` estiver limpa e o commit de referencia estiver identificado.
- O ambiente de staging subir sem erros relevantes.
- As migrations manuais passarem pelo servico `migrate`.
- `/api/health` responder HTTP 200.
- `/login` responder HTTP 200.
- `/seleccionar-empresa` redireccionar ou responder correctamente sem sessao.
- Os testes principais estiverem verdes.
- Um backup tiver sido criado antes da sessao.
- Restore tiver sido validado anteriormente em staging/local.
- Nenhuma credencial real, segredo, dump ou `.env` estiver em docs ou commits.
- Os dados ficticios da sessao estiverem preparados e identificados como tal.

## 4. Criterios de saida

A UAT e considerada aprovada se:

- Todos os fluxos P0 acordados forem executados.
- Erros bloqueantes forem zero.
- Dados financeiros se mantiverem consistentes apos criacao, pagamento,
  transferencia e reversao.
- Reversoes auditadas passarem a partir do documento operacional de origem.
- Permissoes basicas forem respeitadas no servidor.
- Nenhum dado vazar entre empresas.
- Existir backup pre-UAT identificado.
- A lista de pendencias estiver classificada por severidade.
- O responsavel assinar aceite, aceite com restricoes, rejeicao ou nova UAT.

## 5. Severidade de defeitos

| Severidade | Definicao | Decisao esperada |
|---|---|---|
| Bloqueante | Impede concluir um fluxo P0, quebra consistencia financeira, isolamento, permissao ou seguranca critica. | Nao pronto para piloto. |
| Alta | Afecta fluxo essencial, mas existe mitigacao manual segura e documentada para UAT interno. | Corrigir antes de piloto ou aceitar formalmente com restricao. |
| Media | Afecta usabilidade, mensagem, validacao ou evidencia, sem corromper dados nem permissao. | Pode entrar no backlog antes/depois do piloto controlado. |
| Baixa | Ajuste visual, texto, alinhamento ou melhoria operacional sem impacto no aceite. | Backlog normal. |
| Melhoria futura | Pedido fora do escopo P0/V1. | Registar no backlog P1/futuro; nao vender como pronto. |

## 6. Decisao final

A decisao final deve ser uma destas:

- Aprovado para piloto controlado.
- Aprovado com pendencias nao bloqueantes.
- Reprovado para piloto.
- Precisa de nova UAT.

Qualquer decisao de piloto exige checklist de prontidao assinado, backup
pre-UAT identificado e confirmacao explicita de que nao serao usados dados reais
sem autorizacao propria.
