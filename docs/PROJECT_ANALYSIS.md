# PROJECT_ANALYSIS — ANTS ERP

_Última actualização: 2026-06-24_

## 1. Ponto de partida

O repositório começou praticamente vazio: apenas o prompt de especificação
(`Backups de prompts do chatgbt/Prompt do chatgbt para o claude.txt`). A interface
foi desenhada no **Claude Design** (projecto "ANTS ERP - Design sistema",
ficheiro `ANTS ERP.dc.html`) e exportada como HTML standalone.

**Conclusão-chave:** não existia código React a "ligar"; o trabalho real é
**portar** o design para o stack (Next.js) + construir todo o backend. Isto é mais
esforço do que a premissa do prompt assume.

## 2. Natureza do design

O `ANTS ERP (standalone).html` (~692 KB) é um **mockup SPA auto-contido**:

- Motor de templating próprio `<x-dc>` (estilo mustache: `{{ pageTitle }}`, loops).
- Bundle JS (~409 KB) com **dados fictícios** que alimentam as vistas.
- Assets (fontes WOFF2) e CSS embebidos e comprimidos (gzip + base64).
- Markup decodificado preservado em `design/ANTS-ERP.design.html` (referência de porte).

### Tokens de design extraídos

- Cor de marca (accent): `#13343b` (teal escuro). Verde de sucesso: `#1f8a5b`.
- Paleta completa (claro/escuro) em `apps/web/src/styles/tokens.css`.
- Empresa exemplo no design: "ANTS Comercial, Lda".

## 3. Ecrãs/módulos identificados no design

Dashboard · POS · Caixa (abertura/fecho, esperado/contado/diferença) · Vendas/Facturas
(emitir factura, recibos, NC/ND) · Stock/Inventário (INV 2026/06) · Compras
(ordens, recepção parcial — OC 2026/0148) · Clientes · Fornecedores · Tesouraria/Bancos
(Millennium BIM, BCI) · Contabilidade (débito/crédito, KPIs) · Contratos/Subscrições ·
RH/Colaboradores · Administração (utilizadores, perfis, sessões, auditoria).

Localização confirmada: **NUIT, MZN/MT, Matola, bancos locais** — pt-MZ.

## 4. Estado actual (após Fase 0)

| Área | Estado |
|------|--------|
| Stack / monorepo | Implementado (pnpm + Turborepo) |
| Infra dev (Postgres + Redis) | Implementado (docker-compose) |
| Base de dados (fundação multiempresa + auth) | Esquema Prisma inicial |
| Backend (monólito Next + domínio) | Server Actions/Route Handlers + `packages/domain` (Fase 1) |
| Worker (BullMQ) | Esqueleto |
| Web (Next.js) | Shell + tokens + navegação (sem módulos ligados) |
| Módulos de negócio | Não iniciados (Fases 1–12) |

## 5. Dados fictícios / o que é apenas visual

Todo o design é mockado. A app web da Fase 0 **não** usa valores fictícios nos
indicadores — mostra-os vazios ("—") até existir API real, conforme as regras do prompt.

## 6. Lacunas e riscos

- Porte ecrã-a-ecrã do `<x-dc>` para React é trabalho significativo (Fases 2–11).
- Fórmulas fiscais MZ (IRPS, INSS, IVA) devem ser configuráveis (ver BUSINESS_RULES).
- Decisões em aberto: Caddy vs Nginx, Recharts vs ECharts, Postgres RLS como 2.ª barreira.
