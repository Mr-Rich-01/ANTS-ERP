-- S18 — Anulação simétrica de adiantamentos (aprovada em 2026-07-22).
-- Migração PURAMENTE aditiva de enum: dois scopes novos de idempotência operacional.
-- Zero tabelas, zero colunas, zero dados alterados.
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'CUSTOMER_ADVANCE_APPLY_REVERSE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'CUSTOMER_ADVANCE_CANCEL';
