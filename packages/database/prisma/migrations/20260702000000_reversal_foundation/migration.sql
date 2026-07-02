-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- CreateEnum
CREATE TYPE "SupplierPaymentStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- CreateEnum
CREATE TYPE "PurchaseReceiptStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'INVOICE_CANCEL';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'CUSTOMER_PAYMENT_REVERSE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'SUPPLIER_PAYMENT_REVERSE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'PURCHASE_RECEIPT_REVERSE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'TREASURY_TRANSFER_REVERSE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'MANUAL_TREASURY_REVERSE';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" TEXT,
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "purchase_receipts" ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" TEXT,
ADD COLUMN     "status" "PurchaseReceiptStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "reversesId" TEXT;

-- AlterTable
ALTER TABLE "supplier_payments" ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" TEXT,
ADD COLUMN     "status" "SupplierPaymentStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "treasury_movements" ADD COLUMN     "reversalReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_companyId_id_key" ON "invoices"("companyId", "id");

-- CreateIndex
CREATE INDEX "payments_companyId_status_idx" ON "payments"("companyId", "status");

-- CreateIndex
CREATE INDEX "purchase_receipts_companyId_status_idx" ON "purchase_receipts"("companyId", "status");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_invoiceId_idx" ON "stock_movements"("companyId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_companyId_id_key" ON "stock_movements"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_companyId_reversesId_key" ON "stock_movements"("companyId", "reversesId");

-- CreateIndex
CREATE INDEX "supplier_payments_companyId_status_idx" ON "supplier_payments"("companyId", "status");

-- CreateIndex
CREATE INDEX "treasury_movements_companyId_status_idx" ON "treasury_movements"("companyId", "status");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_reversesId_fkey" FOREIGN KEY ("companyId", "reversesId") REFERENCES "stock_movements"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
