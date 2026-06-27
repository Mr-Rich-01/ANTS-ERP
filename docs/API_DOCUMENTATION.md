# API_DOCUMENTATION — ANTS ERP

_Última actualização: 2026-06-26_

Arquitectura **monólito Next.js**: não há API REST separada. A lógica é exposta por:

- **Server Actions** — para mutações chamadas directamente dos componentes/formulários
  (criar venda, emitir factura, etc.). Type-safe, sem fetch manual.
- **Route Handlers** (`apps/web/src/app/api/**`) — para endpoints HTTP quando preciso:
  webhooks, integrações, exportações, health check.

Ambos derivam o `RequestContext` (companyId/userId/permissões) da **sessão Auth.js** e
invocam os serviços de `packages/domain`, que impõem isolamento multiempresa + permissões.

## Convenções

- Autenticação por sessão Auth.js (cookie). `companyId` **nunca** vem do cliente.
- Validação de entrada com **Zod** (mesma schema partilhável entre form e servidor).
- Erros de domínio (`DomainError` → status 403/404/409/422) mapeados para respostas/UI.
- Toda a mutação relevante escreve `AuditLog` na mesma transacção.

## Endpoints HTTP actuais

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| GET | `/api/health` | Estado do serviço (a criar na Fase 1) | Não |

## A introduzir (Fase 1+)

- Auth.js handlers em `/api/auth/*` (login, sessão, logout).
- Server Actions por módulo: empresas, filiais, utilizadores, perfis, clientes, vendas, …
- Route Handlers para exportações (PDF/CSV) e webhooks.

Cada Action/Handler é documentado aqui à medida que é implementado, com a permissão exigida.
