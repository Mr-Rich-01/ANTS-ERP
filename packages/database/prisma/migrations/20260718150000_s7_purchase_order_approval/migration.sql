-- S7 — Fluxo de Ordem de Compra (aditiva, parte 1/2)
-- Novos estados do fluxo de aprovação + campos de aprovação/rejeição.
-- Os valores novos do enum NÃO podem ser usados nesta mesma transacção (regra do
-- PostgreSQL); o backfill e o novo DEFAULT ficam na migração seguinte.

ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "purchase_orders"
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedByName" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedById" TEXT,
  ADD COLUMN "rejectedByName" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;
