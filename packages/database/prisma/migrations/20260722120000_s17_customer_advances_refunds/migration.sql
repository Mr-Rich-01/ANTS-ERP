-- CreateEnum
CREATE TYPE "CustomerRefundOrigin" AS ENUM ('ADVANCE', 'CREDIT_NOTE', 'RECEIPT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'CUSTOMER_ADVANCE_CREATE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'CUSTOMER_ADVANCE_APPLY';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'CUSTOMER_REFUND_CREATE';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'ADVANCE';

-- CreateTable
CREATE TABLE "customer_advances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerNuit" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(14,2) NOT NULL,
    "appliedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "treasuryAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_advance_applications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_advance_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_refunds" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerNuit" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "treasuryAccountId" TEXT NOT NULL,
    "origin" "CustomerRefundOrigin" NOT NULL,
    "advanceId" TEXT,
    "creditNoteId" TEXT,
    "paymentId" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_advances_companyId_customerId_idx" ON "customer_advances"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "customer_advances_companyId_issueDate_idx" ON "customer_advances"("companyId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "customer_advances_companyId_number_key" ON "customer_advances"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_advances_companyId_id_key" ON "customer_advances"("companyId", "id");

-- CreateIndex
CREATE INDEX "customer_advance_applications_companyId_advanceId_idx" ON "customer_advance_applications"("companyId", "advanceId");

-- CreateIndex
CREATE INDEX "customer_advance_applications_companyId_invoiceId_idx" ON "customer_advance_applications"("companyId", "invoiceId");

-- CreateIndex
CREATE INDEX "customer_advance_applications_companyId_paymentId_idx" ON "customer_advance_applications"("companyId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_advance_applications_companyId_id_key" ON "customer_advance_applications"("companyId", "id");

-- CreateIndex
CREATE INDEX "customer_refunds_companyId_customerId_idx" ON "customer_refunds"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "customer_refunds_companyId_origin_idx" ON "customer_refunds"("companyId", "origin");

-- CreateIndex
CREATE INDEX "customer_refunds_companyId_issueDate_idx" ON "customer_refunds"("companyId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "customer_refunds_companyId_number_key" ON "customer_refunds"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_refunds_companyId_id_key" ON "customer_refunds"("companyId", "id");

-- AddForeignKey
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_companyId_treasuryAccountId_fkey" FOREIGN KEY ("companyId", "treasuryAccountId") REFERENCES "treasury_accounts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_advance_applications" ADD CONSTRAINT "customer_advance_applications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_advance_applications" ADD CONSTRAINT "customer_advance_applications_companyId_advanceId_fkey" FOREIGN KEY ("companyId", "advanceId") REFERENCES "customer_advances"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_advance_applications" ADD CONSTRAINT "customer_advance_applications_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_advance_applications" ADD CONSTRAINT "customer_advance_applications_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_companyId_treasuryAccountId_fkey" FOREIGN KEY ("companyId", "treasuryAccountId") REFERENCES "treasury_accounts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_companyId_advanceId_fkey" FOREIGN KEY ("companyId", "advanceId") REFERENCES "customer_advances"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_companyId_creditNoteId_fkey" FOREIGN KEY ("companyId", "creditNoteId") REFERENCES "credit_notes"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refunds" ADD CONSTRAINT "customer_refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

