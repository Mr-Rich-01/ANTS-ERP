-- S15 — Documentos de Venda (aditiva)
-- 1) Tipo de documento de venda: FACTURA (série FT) vs VD (Venda a Dinheiro, POS/Cliente Geral).
-- 2) Contador de vias adicionais emitidas por factura (0 = só o original).
-- 3) Backfill: o cliente operacional do POS passa de «Cliente final» a «Cliente Geral».
--    (UPDATE simples sobre dados demo/operacionais; nenhuma linha é apagada.)

-- CreateEnum
CREATE TYPE "InvoiceDocumentType" AS ENUM ('FACTURA', 'VD');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "documentType" "InvoiceDocumentType" NOT NULL DEFAULT 'FACTURA',
ADD COLUMN     "viaCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: renomear o cliente operacional do POS (criado just-in-time pela venda POS).
UPDATE "customers" SET "name" = 'Cliente Geral' WHERE "name" = 'Cliente final';
