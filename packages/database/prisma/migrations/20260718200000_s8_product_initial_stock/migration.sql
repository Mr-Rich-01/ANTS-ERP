-- S8 — Produtos: criação com stock inicial.
-- Aditiva: novo scope de idempotência operacional para a criação de produto
-- (com ou sem stock inicial). Nenhuma tabela/coluna alterada; a conta 312 e o
-- mapping OPENING_BALANCE_EQUITY são dados (seed/provisionamento), não schema.
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'PRODUCT_CREATE';
