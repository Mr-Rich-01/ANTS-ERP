# API_DOCUMENTATION - ANTS ERP

_Ultima actualizacao: 2026-07-04_

Arquitectura **monolito Next.js**: nao ha API REST separada. A logica e exposta por:

- **Server Actions**: para mutacoes chamadas directamente dos componentes/formularios
  (criar venda, emitir factura, etc.). Type-safe, sem fetch manual.
- **Route Handlers** (`apps/web/src/app/api/**`): para endpoints HTTP quando preciso:
  webhooks, integracoes, exportacoes, health check.

Ambos derivam o `RequestContext` (companyId/userId/permissoes) da **sessao Auth.js** e
invocam os servicos de `packages/domain`, que impoem isolamento multiempresa + permissoes.

## Convencoes

- Autenticacao por sessao Auth.js (cookie). `companyId` **nunca** vem do cliente.
- Validacao de entrada com **Zod** (mesma schema partilhavel entre form e servidor).
- Erros de dominio (`DomainError` -> status 403/404/409/422) mapeados para respostas/UI.
- Toda a mutacao relevante escreve `AuditLog` na mesma transaccao.

## Endpoints HTTP actuais

| Metodo | Rota | Descricao | Auth |
|--------|------|-----------|------|
| GET | `/api/health` | Estado minimo do servico web | Nao |
| GET/POST | `/api/auth/*` | Handlers Auth.js | Varia por fluxo |

## A introduzir

- Route Handlers para exportacoes (PDF/CSV) e webhooks quando existirem.
- Documentacao por Action/Handler a medida que novos endpoints forem implementados.
