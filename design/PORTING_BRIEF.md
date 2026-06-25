# BRIEFING DE PORTAGEM — ANTS ERP Design → React/Next.js

> **Para o Claude Code.** Este documento corrige a Fase 0. O shell criado anteriormente
> NÃO reproduz o design real. A fonte completa do design está agora disponível e deve ser
> portada fielmente, ecrã a ecrã.

## Contexto do problema

Na Fase 0, o design foi guardado apenas parcialmente (`design/ANTS-ERP.design.html`, ~296 KB)
e o shell web foi construído "de raiz" com tokens de cor aproximados. O resultado não tem
paridade visual com o design original (faltam cards, gráficos, badges, tabelas, tipografia).

A **fonte completa e correcta** do design está em:
- `design/ANTS-ERP-FONTE-COMPLETA.js` — lógica de renderização de TODOS os 22 ecrãs
- `design/design-styles.css` — CSS global e tokens do design

## O que é a fonte

`ANTS-ERP-FONTE-COMPLETA.js` é uma classe `Component extends DCLogic` (framework do Claude
Design) que renderiza 22 ecrãs através de `state.activeScreen`. Cada secção do código constrói
o markup HTML de um ecrã com dados de exemplo realistas (pt-MZ, MZN/MT).

**NÃO portar o framework DCLogic.** Portar o LAYOUT, ESTRUTURA, CLASSES CSS, DADOS DE EXEMPLO
e ESTILOS de cada ecrã para componentes React + Tailwind, preservando 100% da identidade visual.

## Tokens de design (usar EXACTAMENTE estes — tema claro)

```css
--bg: #eef2f2;          /* fundo da app */
--card: #ffffff;        /* cards */
--card2: #f8fafa;
--card3: #fbfdfd;
--border: #e6eaea;
--bd-soft: #eef2f2;
--bd-soft2: #f0f3f3;
--field: #f3f6f6;       /* inputs */
--field-bd: #e7eded;
--hover: #f3f6f6;
--text: #16282c;        /* texto principal */
--text2: #5f7378;       /* texto secundário */
--text3: #8aa0a3;       /* texto terciário */
--text4: #a2afaf;
--sidebar: #0e2a30;     /* sidebar petróleo escuro */
--header: #ffffff;
--ok: #1f8a5b;          --ok-bg: #e7f4ed;    /* verde/sucesso */
--bad: #c2453d;         --bad-bg: #fbeae9;   /* vermelho */
--warn: #b9791a;        --warn-bg: #f7eed9;  /* âmbar */
--info: #2a6f97;        --info-bg: #e6eef4;  /* azul */
--accent-fg: #13343b;   --accent-bg: #eaf0f0; /* petróleo (cor da marca) */
--shadow: 0 14px 34px rgba(16,40,45,.16);
```

> Há também tema escuro no design (`[data-theme="dark"]` em `design-styles.css`). Portar ambos.

## Tipografia

- **Interface:** `Hanken Grotesk` (Google Fonts) — pesos 400–800
- **Números/mono:** `IBM Plex Mono` (valores monetários, SKUs, códigos)
- **Ícones:** Lucide (já está no stack via `lucide-react`)

## Formatação de números (já implementada no design)

Separador de milhares = espaço fino (`\u00a0`), decimal = vírgula, sufixo `MT`.
Exemplo: `84 300,00 MT`. Reusar a função `formatMZN` já criada em `packages/shared`.

## Os 22 ecrãs a portar (com grupo de sidebar e título)

| # | id (rota) | Título | Grupo sidebar |
|---|-----------|--------|---------------|
| 1 | `dashboard` | Visão Geral | Principal |
| 2 | `pos` | Ponto de Venda | Principal |
| 3 | `invoices` | Facturas | Vendas & Facturação |
| 4 | `invoiceNew` | Nova factura | Vendas & Facturação |
| 5 | `invoiceDoc` | Factura (detalhe) | Vendas & Facturação |
| 6 | `clients` | Clientes | Vendas & Facturação |
| 7 | `suppliers` | Fornecedores | Compras |
| 8 | `receiving` | Recepção de mercadorias | Compras |
| 9 | `poDetail` | Ordem de Compra (detalhe) | Compras |
| 10 | `purchases` | Compras | Operações |
| 11 | `products` | Produtos & Stock | Operações |
| 12 | `productDetail` | Ficha de produto | Operações |
| 13 | `inventory` | Inventário | Operações |
| 14 | `production` | Produção | Operações |
| 15 | `cash` | Tesouraria | Finanças |
| 16 | `dailyClose` | Relatório diário de caixa | Finanças |
| 17 | `accounting` | Contabilidade | Finanças |
| 18 | `contracts` | Contratos | Finanças |
| 19 | `hr` | Recursos Humanos | Gestão |
| 20 | `reports` | Relatórios | Gestão |
| 21 | `admin` | Administração | Gestão |
| 22 | `entityProfile` | Perfil de conta | Gestão de contas |

## Elementos transversais (shell)

- **Sidebar** petróleo escuro (`--sidebar: #0e2a30`), colapsável, com grupos e marcador
  activo (barra de 3px à esquerda em accent). Logótipo "A" + "ANTS ERP SYSTEM".
- **Topbar:** botão colapsar, barra de pesquisa global (⌘K), selector de mês, selector de
  empresa/filial ("ANTS Comercial, Lda — Maputo · Sede"), botão "+ Novo", notificações,
  perfil de utilizador ("Hélder Munguambe — Administrador").
- **Toggle de tema** claro/escuro.
- **Breadcrumbs** + título de ecrã + acções (Filtros, Exportar, "Actualizado há X min").

## Detalhes ricos a NÃO perder (exemplos do dashboard)

- 8 KPI cards com valor, ícone colorido, sub-label e badge de tendência (▲/▼ %, cores
  ok/bad/warn/info).
- Gráfico de barras "Vendas por período" (12 meses, gradiente petróleo).
- Donut "Formas de pagamento" (Dinheiro 38%, M-Pesa 27%, e-Mola 14%, Transferência 12%,
  Cartão 9%) com legenda e percentagens.
- Dados de exemplo realistas de Moçambique (produtos: Arroz Tio 5kg, Óleo Fula 1L, Açúcar
  Xinavane 2kg, Coca-Cola 2L; métodos: M-Pesa, e-Mola).

## Método de portagem (ordem sugerida)

1. **Ler a fonte:** `design/ANTS-ERP-FONTE-COMPLETA.js` + `design/design-styles.css` por completo.
2. **Tokens primeiro:** garantir que `apps/web` e o preset Tailwind usam EXACTAMENTE os 27
   tokens acima (claro + escuro). Carregar fontes Hanken Grotesk + IBM Plex Mono.
3. **Shell:** portar sidebar (com grupos e estado activo/colapsado), topbar e toggle de tema.
   Mapear cada `id` da tabela acima para uma rota do App Router.
4. **Ecrã a ecrã:** começar pelo `dashboard` (mais visível), depois `pos`, `invoices`,
   `clients`, etc. Para cada ecrã: replicar o markup, classes, dados de exemplo e gráficos.
   Usar Recharts para os gráficos (barras + donut).
5. **Componentes reutilizáveis:** extrair para `packages/ui` — `KpiCard`, `Badge`, `DataTable`,
   `BarChart`, `DonutChart`, `SidebarGroup`, `Topbar`, etc.
6. **Dados de exemplo:** manter como mock VISUAL apenas nesta fase (placeholders de UI), com
   comentário `// TODO: ligar à API na fase respectiva`. Não inventar lógica de negócio.
7. **Validar paridade:** comparar cada ecrã portado lado-a-lado com o design original
   (abrir o `.html` standalone original no browser) e ajustar até bater certo.
8. **Validações:** `lint`, `typecheck`, `build`, testes — e actualizar `MODULE_STATUS.md`.

## Critério de conclusão desta correcção

- Os 22 ecrãs existem como rotas e reproduzem fielmente o design original.
- Sidebar, topbar, tema claro/escuro idênticos ao design.
- Tokens, tipografia e formatação de números exactos.
- Gráficos (barras + donut) renderizados.
- Sem dados fictícios apresentados como reais — mocks marcados como placeholders de UI.
- `lint` + `typecheck` + `build` + testes verdes.

> **Importante:** isto é PORTAR (recriar fielmente em React), não "melhorar" ou "redesenhar".
> A identidade visual do design original é a especificação. Não desviar.
