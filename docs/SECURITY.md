# SECURITY — ANTS ERP

_Última actualização: 2026-06-24_

## 1. Autenticação

- Access token de curta duração + refresh token seguro.
- Refresh token em **cookie httpOnly**, `Secure` + `SameSite` em produção.
- Hash de passwords com **Argon2** (`@node-rs/argon2`).
- Política de password, troca obrigatória da password inicial (`mustChangePassword`).
- Bloqueio após tentativas falhadas (`failedLoginCount` + `lockedUntil`).
- Gestão e revogação de sessões; logs de autenticação.

## 2. Autorização (RBAC)

- Permissões granulares (ex.: `sales.create`, `accounting.post`) — não dependem do nome do perfil.
- Validação **sempre no backend**; o frontend apenas oculta o que o utilizador não pode ver.
- Restrição por filial (`UserBranch`); limites de desconto/aprovação por workflow.

## 3. Isolamento multiempresa

- `companyId` derivado da sessão, **nunca** do cliente.
- Filtro automático por empresa em queries (extensão Prisma) + guard de contexto.
- Testes de isolamento obrigatórios.

## 4. Protecções da aplicação

- Validação no frontend e backend (Zod / class-validator).
- ORM parametrizado (Prisma) → mitiga SQL Injection.
- Escape/saneamento → mitiga XSS; CSRF tratado em fluxos com cookies.
- CORS restrito por `CORS_ORIGINS`. Rate limiting (Fase 1+).
- Headers de segurança (HSTS, X-Content-Type-Options, etc.) no reverse proxy.
- Uploads validados (extensão + MIME + limite de tamanho).

## 5. Segredos e dados

- Segredos fora do código (`.env`, nunca commitado). `.env.example` sem valores reais.
- Rotação de tokens. Princípio do menor privilégio.
- Backups encriptados. **Nunca** registar passwords, tokens completos ou segredos nos logs.

## 6. Auditoria

- `AuditLog` imutável para operações importantes (valores antes/depois, IP, user-agent, motivo).
- Área de sessões para o gestor: terminar/revogar sessões, detectar sessões suspeitas.
