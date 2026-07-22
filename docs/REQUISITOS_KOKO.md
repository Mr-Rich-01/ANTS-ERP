# REQUISITOS_KOKO — Levantamento para a Sessão S12 (Módulo de Produção)

_Estado: **aguarda confirmação do cliente** · Preparado em 2026-07-19 (ronda de desenho da S12, pré-implementação)_

Este documento reúne todas as perguntas em aberto sobre o processo produtivo da KOKO,
organizadas pelo momento em que **bloqueiam** a implementação (S12a — schema/fundações;
S12b — custeio/conclusão da ordem; S12c — fluxo específico). Cada pergunta traz o
contexto de negócio (porque importa) e a **recomendação por defeito** — o que será
implementado se a resposta for «façam como acharem melhor». Basta ao cliente confirmar
ou corrigir cada defeito.

Convenções do desenho aprovado que este documento assume (não são perguntas):
produção single-step por defeito (efeitos só na conclusão); o modelo **regista**
quantidades de perda/recuperável e **prepara** etapas como conceito opcional, mas a
contabilização da perda e as etapas reais da KOKO **não estão definidas** — dependem
das respostas abaixo; o vínculo ordem↔documento de venda existe no schema como ligação
opcional, mas o seu comportamento (reserva/consumo/cumprimento) é pergunta de cliente.

---

## ⭐ Decisão n.º 1 — Unidades e quantidades decimais (A1)

**É a pergunta mais estruturante de todo o módulo: a resposta decide se o schema de
stock existente muda ou não.** Hoje, todo o stock do sistema é inteiro
(`StockLevel.quantity` e `StockMovement.quantity` são `Int`). Uma produção alimentar
tipicamente consome fracções (120,5 kg de farinha; 10 L de óleo), mas também é comum
consumir-se em embalagens inteiras (2 sacos de 25 kg, 3 garrafões de 5 L).

**Pergunta ao cliente:**
> Como medem os consumos de matérias-primas no dia-a-dia? Em peso/volume com casas
> decimais (ex.: 120,5 kg), ou em embalagens/unidades inteiras (ex.: 5 sacos de
> farinha, 2 garrafões de óleo)? E a produção — o produto acabado conta-se sempre em
> unidades inteiras?

**Recomendação por defeito:** se o consumo real for por embalagens/unidades inteiras,
**não se altera nada** — stock continua inteiro e as receitas definem quantidades
inteiras. Se precisarem mesmo de fracções, aplicar a **Opção A** da secção
[PROPOSTA_UNIDADES_DECIMAIS](#proposta_unidades_decimais) (migrar quantidades para
Decimal em sub-sessão preparatória própria) — fundamentação e alternativas nessa secção.

---

## Bloco A — perguntas que bloqueiam a S12a (schema e fundações)

### A1. Unidades e decimais
Ver [Decisão n.º 1](#-decisão-n-1--unidades-e-quantidades-decimais-a1) acima.

### A2. Catálogo de produtos e matérias-primas
**Contexto de negócio:** o módulo classifica cada produto como Mercadoria (revenda),
Matéria-prima ou Produto acabado — a classificação decide a conta contabilística das
existências (131/132/133) e o que pode entrar numa ficha técnica. Precisamos da lista
real para semear a demo da KOKO e validar que o modelo cobre o catálogo todo.
**Pergunta:** que produtos fabricam (o design de referência mostra padaria/pastelaria:
pão de forma, bolos, sumos, iogurte, bolachas — corresponde?) e que matérias-primas
usam? As matérias-primas são compradas a fornecedores pelo circuito normal de
compras (OC → recepção)?
**Recomendação por defeito:** matérias-primas entram pelo módulo de Compras existente
(recepção define o custo médio ponderado — nenhum circuito novo de entrada); consumíveis
como embalagens podem ser Mercadorias e entrar na ficha técnica na mesma.

### A3. Receita por lote ou por unidade
**Contexto de negócio:** a ficha técnica pode definir-se «por unidade produzida»
(0,15 kg de farinha por pão) ou «por lote-base» (120 kg de farinha → 800 pães). A forma
por lote evita fracções minúsculas e é como as padarias trabalham; mas obriga a decidir
o que acontece quando a ordem não é múltiplo do lote.
**Pergunta:** as vossas receitas estão escritas para um lote-padrão (ex.: uma fornada)?
As ordens de produção são sempre múltiplos desse lote, ou produzem quantidades
arbitrárias (ex.: 950 pães) com a receita escalada proporcionalmente?
**Recomendação por defeito:** receita definida por lote-base (`outputQuantity`), ordem
com quantidade livre e consumos planeados = receita × (quantidade da ordem ÷ lote-base),
arredondados e **editáveis na ordem antes da conclusão** (o que se consome de verdade é
o que a ordem regista, não o teórico da receita).

### A4. Perdas — o que registar (modelo preparado; contabilização NÃO definida)
**Contexto de negócio:** entre o planeado e o produzido há perdas (massa perdida,
fornada queimada, quebras). O modelo da S12 **regista** as quantidades — produzido
real vs. planeado, quantidade perdida e, se existir, quantidade recuperável
(reaproveitável noutro fabrico) — mas o tratamento contabilístico da perda **fica por
decidir com estas respostas** (não foi desenhado deliberadamente).
**Pergunta:** (a) registam perdas por fabrico? (b) distinguem perda definitiva de
sobra reaproveitável? (c) há níveis de perda «normais» conhecidos por produto (ex.:
2–3% da massa) vs. perdas excepcionais que gostariam de ver destacadas?
**Recomendação por defeito:** o modelo guarda `plannedQuantity`, `producedQuantity`,
`lossQuantity` e `recoveredQuantity` (opcionais, informativos). Sem resposta, a V1
apenas os apresenta — nenhum lançamento contabilístico específico de perda (ver B1
para o efeito no custo).

### A5. Etapas do processo (conceito opcional; sem inventar as etapas da KOKO)
**Contexto de negócio:** o design de referência mostra ordens com progresso (%) e
estados «Em curso»/«Pausada», o que sugere acompanhamento do fabrico. O modelo prepara
o conceito de etapas **opcionais e informativas** (nome + ordem + concluída/por
concluir), mas a produção é single-step por defeito: os efeitos de stock e
contabilidade acontecem todos na conclusão, com ou sem etapas. **Não vamos inventar as
etapas da KOKO** — ou nos dizem quais são, ou o campo fica sem uso.
**Pergunta:** querem acompanhar etapas dentro de uma ordem (ex.: amassar → levedar →
forno → embalar)? Se sim, quais são, por tipo de produto? Servem só para acompanhamento
visual ou há acções/registos em cada etapa?
**Recomendação por defeito:** sem resposta, as ordens têm apenas os estados globais
(Planeada → Em curso → Concluída / Descartada) e um progresso informativo; a tabela de
etapas fica no schema, vazia, pronta a usar sem migração nova.

### A6. Subprodutos / co-produtos
**Contexto de negócio:** se um fabrico gera mais de um produto vendável (ex.: a mesma
massa dá pão de forma e pãezinhos; o soro do iogurte é vendido), o custo dos consumos
tem de ser repartido entre as saídas — isso muda o modelo (várias linhas de saída por
ordem) e o custeio (regra de repartição).
**Pergunta:** algum fabrico vosso produz mais de um produto em simultâneo? Se sim,
quais, e como repartiriam o custo (proporção fixa? peso? valor de venda?)?
**Recomendação por defeito:** V1 com **uma saída por ordem** (o caso a produzir dois
produtos faz duas ordens). Só se a resposta confirmar co-produtos reais é que o modelo
de múltiplas saídas é desenhado — antes de código, como sempre.

### A7. Especificação do produto/ordem — núcleo estruturado + atributos flexíveis
**Contexto de negócio:** produtos fabricados costumam ter especificações (peso unitário,
validade, lote de fabrico, alergénios, temperatura de conservação…). Guardar cada
atributo como coluna obrigaria a uma migração por atributo novo; guardar tudo em texto
livre impede filtros e validação. O desenho aprovado usa um **núcleo mínimo de campos
estruturados + um campo de atributos flexível** (chave→valor) para os restantes.
**Pergunta:** que informação têm de registar obrigatoriamente por produto fabricado
e/ou por ordem/lote? Em particular: usam **n.º de lote** e **validade**? Precisam de
imprimi-los em algum documento/etiqueta?
**Recomendação por defeito:** núcleo estruturado = lote de fabrico (texto, opcional) e
validade (data, opcional) na ordem; tudo o resto vai ao campo flexível de atributos
(sem migração por atributo novo). Se lote/validade não forem usados, ficam vazios sem
custo.

### A8. Vínculo ordem de produção ↔ documento de venda (só a ligação; comportamento é C1)
**Contexto de negócio:** produzir por encomenda (cliente encomenda 500 pães para
sábado) pede uma ligação entre a ordem de produção e o documento de venda (cotação ou
factura). O schema da S12a cria essa **ligação opcional** — mas o que ela _faz_
(reservar stock? consumir directo? marcar cumprimento?) não está decidido e é a
pergunta C1.
**Pergunta (para o schema):** trabalham por encomenda, por stock, ou misto? A ligação
deve apontar para a cotação, para a factura, ou ambas?
**Recomendação por defeito:** ligação opcional à cotação e/ou factura, puramente
informativa na V1 (rastreabilidade nos dois sentidos), comportamento zero até à
resposta C1.

---

## Bloco B — perguntas que bloqueiam a S12b (custeio e conclusão da ordem)

### B1. Perda dentro do custo do acabado — confirmar a regra por defeito
**Contexto de negócio:** se se consomem matérias para 800 pães e saem 780, o custo
total consumido tem de ir a algum lado. A regra mais simples e mais comum em produção
alimentar é a perda normal ficar **dentro do custo unitário do acabado** (o custo
total divide-se pelos 780 produzidos — o pão fica ligeiramente mais caro). A
alternativa (lançar a perda numa conta própria de perdas) exige a decisão contabilística
que ficou deliberadamente por definir (ver A4).
**Pergunta:** aceitam que a perda normal encareça o custo unitário do produzido (sem
lançamento separado)? Há algum caso em que queiram ver a perda como custo destacado
(ex.: fornada inteira perdida)?
**Recomendação por defeito:** perda normal dentro do custo do acabado; nenhuma conta
de perdas de produção na V1. Perdas excepcionais tratam-se, por agora, pela contagem
de inventário existente (S9), que já lança Déficits na 551.

### B2. Custos adicionais de transformação
**Contexto de negócio:** mão-de-obra, energia, gás e embalagem podem entrar no custo
do acabado (custeio por absorção) ou ficar como gastos gerais do mês (o acabado custa
só as matérias). Incluí-los exige medi-los por ordem e uma conta de contrapartida nova
— mais rigor, mais trabalho administrativo por ordem.
**Pergunta:** querem que o custo do produto inclua mais do que as matérias consumidas?
Se sim, o quê, e como o mediriam por ordem (valor fixo por lote? tabela por produto?)?
**Recomendação por defeito:** V1 com custo = soma dos consumos, sem custos adicionais
(o campo existe no modelo, a zero). Se a resposta for sim, o mapa D/C da absorção é
desenhado e aprovado antes de código, como o resto do custeio.

### B3. Consumo antecipado (produção em curso contabilística)
**Contexto de negócio:** por defeito, o consumo das matérias e a entrada do acabado
acontecem juntos, na conclusão da ordem (single-step — nunca há produção «a meio» na
contabilidade). Se o fabrico atravessar dias e precisarem que o stock das matérias
baixe logo no início (para o armazém bater certo durante o fabrico), é preciso a conta
de produção em curso (WIP) e dois momentos contabilísticos.
**Pergunta:** entre tirar as matérias do armazém e ter produto acabado passa quanto
tempo? Precisam que o stock das matérias desça no momento em que saem do armazém, ou
basta descer quando a ordem se conclui (normalmente no próprio dia)?
**Recomendação por defeito:** single-step (tudo na conclusão). WIP só se a resposta
o exigir — e nesse caso o mapa D/C do WIP é apresentado para aprovação antes.

### B4. Conclusões parciais
**Contexto de negócio:** concluir 300 de 800 e continuar a ordem obriga a repartir
consumos por conclusão e complica a idempotência e o custeio (várias entradas de
acabado por ordem).
**Pergunta:** precisam de dar entrada de produto acabado aos poucos dentro da mesma
ordem, ou cada ordem conclui-se de uma vez (e produções seguintes são ordens novas)?
**Recomendação por defeito:** conclusão única por ordem na V1; para produzir mais,
cria-se nova ordem (30 segundos com a receita já feita).

### B5. Armazéns
**Contexto de negócio:** a ordem tem armazém de consumo (de onde saem as matérias) e
armazém de entrada (onde entra o acabado). Podem coincidir; o que importa é saber se a
KOKO separa fisicamente matérias de produto final.
**Pergunta:** têm um único armazém, ou separam matérias-primas / produto acabado /
loja? A produção consome sempre do mesmo sítio?
**Recomendação por defeito:** os dois campos existem e podem coincidir; a UI predefine
o mesmo armazém nos dois.

### B6. Volume e cadência
**Contexto de negócio:** o desenho serializa a conclusão da ordem com locks nos
produtos envolvidos (mais forte do que a venda POS, que deliberadamente não bloqueia).
Isso é seguro e simples se houver dezenas de conclusões por dia; seria repensado se
houvesse centenas por hora.
**Pergunta:** quantas ordens de produção esperam concluir por dia, tipicamente?
**Recomendação por defeito:** assume-se baixo volume (≤ dezenas/dia) e mantém-se a
serialização por locks — o padrão mais seguro do sistema.

---

## Bloco C — perguntas que bloqueiam a S12c (fluxo específico KOKO)

### C1. Comportamento do vínculo ordem↔venda (a decisão adiada de A8)
**Contexto de negócio:** com a ligação criada na S12a, há três comportamentos
possíveis, por ordem crescente de complexidade: (1) **informativo** — só
rastreabilidade; (2) **reserva** — o acabado produzido fica reservado para a encomenda
(exige conceito de stock reservado, que hoje não existe no sistema); (3)
**cumprimento** — concluir a produção alimenta o estado da encomenda («pronta a
entregar/facturar»). Reserva de stock é uma funcionalidade transversal nova (afectaria
vendas e POS) — não se decide de passagem.
**Pergunta:** quando produzem por encomenda, o que precisa de acontecer? Basta ver
«esta ordem é para a encomenda X», ou precisam que o stock produzido fique bloqueado
para esse cliente? Como sabem hoje que uma encomenda está pronta?
**Recomendação por defeito:** (1) informativo na V1 — a ligação mostra-se nos dois
documentos; sem reserva nem automatismos. (2)/(3) só com resposta explícita e desenho
próprio.

### C2. Papéis e aprovação
**Contexto de negócio:** o RBAC aprovado (secção abaixo) separa quem cria/edita ordens
de quem as conclui. Falta saber se a realidade da KOKO precisa de um passo de
aprovação formal (como as ordens de compra da S7) ou se criar+concluir pelo mesmo
utilizador é aceitável.
**Pergunta:** quem cria as ordens e quem confirma a produção feita? São pessoas
diferentes? Precisam de uma aprovação antes de se poder produzir?
**Recomendação por defeito:** sem passo de aprovação na V1 (a separação faz-se pelas
permissões `production.manage` vs. `production.complete`); aprovação formal tipo S7
só se pedida.

### C3. Relatórios e indicadores
**Contexto de negócio:** o design de referência mostra KPIs (ordens em curso,
produzido hoje, custo de produção do mês, matérias em falta). Convém confirmar o que
a KOKO consulta de facto para não polir indicadores que ninguém vê.
**Pergunta:** que números de produção precisam de ver todos os dias? E ao fim do mês?
Precisam de exportar (CSV/impressão) algum mapa de produção?
**Recomendação por defeito:** os 4 KPIs do design + lista de ordens com custo, e o
documento imprimível da ordem (padrão S4/S5); CSV pelo padrão dos relatórios
existentes.

### C4. Etapas reais (se A5 = sim)
Se confirmarem que usam etapas, precisamos da lista por tipo de produto e do que
acontece em cada uma (só marcar como feita? registar quem/quando? registar
quantidades?). Sem esta resposta, as etapas ficam disponíveis mas não configuradas.

---

<a id="proposta_unidades_decimais"></a>
## PROPOSTA_UNIDADES_DECIMAIS (correcção 4 — para discussão interna antes de ir à KOKO)

Contexto técnico: `StockLevel.quantity`, `StockMovement.quantity`/`balanceAfter` e
todas as linhas de documentos (factura, cotação, NC, OC, recepção, contagem) são
`Int`. O custo médio (`Product.avgCost`) é `Decimal(14,2)` — **duas casas** — e toda a
cadeia de custeio (weighted-average das compras, snapshot na emissão, CMV S10a,
contagens S9, regularização S10c, teste-âncora `Σ qtd × round2(avgCost)`) assume
quantidades inteiras a multiplicar custos com 2 casas.

### Opção A — migrar as quantidades de stock para Decimal (ex.: `Decimal(14,3)`)

O modelo «correcto»: uma única representação, quantidades fraccionárias em unidades
naturais (kg, L), custos continuam em MT por unidade natural.

- **Raio de alteração:** ~10 tabelas (níveis, movimentos, linhas de factura/cotação/
  NC/OC/recepção/contagem, `minStock`) e todo o domínio que faz aritmética de
  quantidades (`products`, `stock`, `invoices`, `pos`, `purchases`,
  `commercial-documents`, `stock-counts`, `inventory-regularization`, `reports`,
  âncoras de `accounting`). O Prisma passa a devolver `Decimal` em vez de `number`
  nessas colunas — cada leitura precisa de `Number()`; o typecheck apanha a esmagadora
  maioria dos pontos (é o mesmo tratamento já dado ao `avgCost`). Migração SQL
  `ALTER COLUMN ... TYPE DECIMAL` — aditiva, valores preservados sem perda.
- **Risco no custeio existente:** médio e **visível**. As fórmulas não mudam
  matematicamente (o `round2` continua a aplicar-se ao dinheiro), mas quantidade
  fraccionária × custo cria casos de arredondamento novos; os testes-âncora
  (131=físico, três pontas da S11) são exactamente a rede que os apanha. O ponto
  decisivo: **o `avgCost` fica em unidades naturais (MT/kg), onde as 2 casas decimais
  chegam perfeitamente** — o coração do custeio não precisa de mudar de precisão.
- **Testes afectados (estimativa honesta):** ~8–12 suites de integração com asserções
  de quantidades a rever mecanicamente — na ordem de **80–150 asserções** entre cogs
  (14 testes), nc-cancel (12), regularization (11), statements (14), documents (14),
  drafts (13), POS (12), stock counts (14), initial-stock (10), subconjuntos de
  reversal (44) e reports (24) — mais o agregado accounting 254 e o build como
  obrigação de verde total. Custo realista: **uma sub-sessão inteira dedicada
  (S12-pre)**, sem misturar com funcionalidade nova.

### Opção B — unidades-base inteiras em todo o sistema (g, ml, un)

Farinha guarda-se em gramas; 120,5 kg = 120 500. Zero mudança de schema.

- **Raio de alteração:** schema 0; mas a UX degrada em **todos** os ecrãs que mostram
  quantidades (produtos, inventário, relatórios, documentos impressos mostram
  «120 500 g»), a menos que se construa conversão de apresentação transversal — que é
  um raio de UI grande e permanente.
- **Risco no custeio existente:** **alto e escondido — é o defeito fatal.** O
  `avgCost` tem 2 casas: farinha a 40 MT/kg vira 0,04 MT/g, e o arredondamento a 2
  casas num custo dessa ordem produz erros relativos de dois dígitos percentuais
  (0,044 → 0,04 = −9%). Consertar exigiria aumentar a precisão do `avgCost` e rever as
  convenções de `round2` — ou seja, mexer no coração 🔒 do custeio na mesma, mas de
  forma mais invasiva conceptualmente do que a Opção A.
- **Testes afectados:** ~0 directamente — e é isso que a torna traiçoeira: o risco não
  aparece em teste nenhum existente, fica escondido no arredondamento. Seriam
  precisos testes novos de precisão por unidade minúscula.

### Opção C — Decimal contido no módulo de produção, conversão no movimento

Receitas e ordens guardam Decimal em unidades naturais; cada produto ganha um factor
de conversão para a unidade de stock; ao gerar o movimento, converte-se para inteiro.

- **Raio de alteração:** o menor no imediato — só as tabelas novas de produção + uma
  camada de conversão; zero toques no código existente.
- **Risco no custeio existente:** o mesmo da Opção B, disfarçado: a conversão só cai
  em inteiros se a unidade de stock for suficientemente fina (gramas), o que
  reintroduz o problema do `avgCost` a 2 casas por unidade minúscula para todos os
  produtos fraccionários. Acresce o risco permanente de **duas representações** da
  mesma quantidade (receita em kg, stock em g) — a classe de bug de conversão que
  nunca mais se extingue.
- **Testes afectados:** 0 existentes; novos testes de conversão. Parece a mais
  barata; é a mais cara a prazo.

### Recomendação fundamentada

1. **Primeiro, a pergunta n.º 1 à KOKO** — se consomem em embalagens/unidades
   inteiras (cenário plausível numa padaria que consome por saco/pacote), **não se
   muda nada**: `Int` fica, receitas inteiras, custo por embalagem em MT com 2 casas
   perfeitamente adequado. É o melhor desfecho possível e é grátis.
2. **Se as fracções forem mesmo necessárias: Opção A**, executada como sub-sessão
   preparatória própria (S12-pre) antes da S12a, com o agregado completo de regressões
   como critério de saída. Fundamento: é a única opção que mantém o `avgCost` em
   unidades naturais onde as 2 casas chegam — B e C não eliminam o risco, empurram-no
   para dentro da parte mais sensível e protegida do sistema (o custeio 🔒 máximo) e a
   C ainda paga duas representações para sempre. O momento actual (pré-produção, dados
   demo, 254+ testes de contabilidade verdes) é o mais barato que alguma vez haverá
   para uma alteração mecânica mas transversal; adiá-la para depois de haver dados
   reais de produção multiplicaria o custo.

---

## RBAC — permissões `production.*` (aprovado; registo escrito do desenho)

Três permissões novas, semeadas pela definição canónica (padrão das restantes):

| Chave | Dá acesso a | Perfis do seed que a recebem |
|---|---|---|
| `production.view` | Ver ordens, receitas, custos de produção; entrada «Produção» na sidebar | Administrador¹, **Gestor**, **Contabilista** (consulta de custos — sem poder operar) |
| `production.manage` | Criar/editar/descartar ordens em rascunho; criar/editar fichas técnicas; classificar produtos (role de inventário) | Administrador¹, **Gestor** |
| `production.complete` | Concluir ordens (o único passo com efeitos em stock e contabilidade) | Administrador¹, **Gestor** |

¹ O perfil Administrador recebe **todas** as permissões por construção
(`allPermissions` no seed) — nada a fazer.

**Caixa** (maria@) e **Vendedor** (joao@, carlos@) não recebem nenhuma — não vêem a
entrada Produção. **Contabilista** (ana@) recebe só `production.view`.

**Impacto nos utilizadores existentes das empresas de teste:**

- O re-seed é idempotente e **reescreve** as listas de permissões dos 5 perfis
  canónicos (`deleteMany` + `createMany` por perfil) — os perfis Gestor/Contabilista
  passam a incluir as chaves novas automaticamente; perfis personalizados criados à
  mão noutras empresas **não são tocados** (recebem as permissões por atribuição
  manual ou provisionamento explícito, regra P0-01).
- **Sessões JWT antigas não têm as chaves novas** — como sempre após seed com
  permissões novas, é preciso terminar e reiniciar sessão para os gates passarem
  (lembrete permanente do MODULE_STATUS).
- lucia@ (Gestor, INACTIVE no seed) herdaria as três chaves se fosse reactivada —
  comportamento esperado.
- A entrada «Produção» volta à sidebar (foi removida no fix pré-demo de 2026-07-07)
  filtrada por `production.view`, pelo que quem não tem a permissão continua a não
  ver nada.

---

_Próximo passo: confirmar este documento com a KOKO (no mínimo o Bloco A, com a
Decisão n.º 1 à cabeça) antes de iniciar a S12a. Nenhum código ou migração foi criado
nesta ronda._
