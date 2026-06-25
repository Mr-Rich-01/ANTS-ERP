# API_DOCUMENTATION — ANTS ERP

_Última actualização: 2026-06-24_

API REST construída em **NestJS**. Documentação interactiva via **Swagger/OpenAPI**.

## Acesso

- Base URL (dev): `http://localhost:4000/api`
- Swagger UI: `http://localhost:4000/api/docs`
- Prefixo global: `/api`

## Convenções

- Autenticação por Bearer (access token) — introduzida na Fase 1.
- `companyId` nunca é aceite do cliente; é derivado da sessão.
- Validação de payloads com `ValidationPipe` (whitelist + transform).
- Respostas de erro seguem o formato de exceção do Nest (`statusCode`, `message`, `error`).

## Endpoints actuais (Fase 0)

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| GET | `/api/health` | Estado do serviço | Não |

Exemplo de resposta:

```json
{ "status": "ok", "service": "ants-erp-api", "timestamp": "2026-06-24T10:00:00.000Z" }
```

## Endpoints planeados (Fase 1+)

`/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/companies`,
`/api/branches`, `/api/users`, `/api/roles`, `/api/permissions`, `/api/sessions`,
`/api/audit` … e por módulo nas fases seguintes. Cada endpoint será documentado aqui
e no Swagger à medida que é implementado.
