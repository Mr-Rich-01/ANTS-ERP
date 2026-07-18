-- S6 — Melhorias na Fatura: rascunhos de factura (aditiva, aprovada em 2026-07-18).
-- DRAFT no enum existente + coluna opcional draftNumber + scopes de idempotência novos.

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'DRAFT';

-- AlterEnum
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'INVOICE_DRAFT_CREATE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'INVOICE_DRAFT_ISSUE';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "draftNumber" TEXT;
