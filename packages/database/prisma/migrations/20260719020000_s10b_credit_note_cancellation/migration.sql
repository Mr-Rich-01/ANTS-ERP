-- S10b — Anulação de Nota de Crédito (aditiva, parte 1/2).
-- 1) Metadados de anulação na NC (padrão Invoice/P0-03a: quem, quando, porquê);
-- 2) Rastreabilidade Invoice→StockMovement estendida às NCs: FK composta
--    (companyId, creditNoteId) + índice, padrão P0-03.0/S9;
-- 3) Scope de idempotência operacional da anulação.

ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'CREDIT_NOTE_CANCEL';

ALTER TABLE "credit_notes"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancellationReason" TEXT;

ALTER TABLE "stock_movements" ADD COLUMN "creditNoteId" TEXT;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_companyId_creditNoteId_fkey"
  FOREIGN KEY ("companyId", "creditNoteId")
  REFERENCES "credit_notes"("companyId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "stock_movements_companyId_creditNoteId_idx"
  ON "stock_movements"("companyId", "creditNoteId");
