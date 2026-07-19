-- S10c — Regularização retroactiva de existências.
-- Alteração ÚNICA e aditiva: scope de idempotência operacional para a operação
-- genérica de regularização (stock físico ao avgCost vs. saldo da conta de
-- existências). Sem tabelas novas, sem backfill.
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'INVENTORY_REGULARIZATION';
