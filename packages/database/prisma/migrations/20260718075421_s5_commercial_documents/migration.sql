-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DebitNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'QUOTATION_CREATE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'CREDIT_NOTE_CREATE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'DEBIT_NOTE_CREATE';

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerNuit" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL,
    "taxableBase" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 16,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerNuit" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "returnStock" BOOLEAN NOT NULL DEFAULT false,
    "warehouseId" TEXT,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxableBase" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 16,
    "unitCost" DECIMAL(14,2),
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerNuit" TEXT,
    "invoiceId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "status" "DebitNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxableBase" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_note_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "debitNoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 16,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "debit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotations_companyId_status_idx" ON "quotations"("companyId", "status");

-- CreateIndex
CREATE INDEX "quotations_companyId_customerId_idx" ON "quotations"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "quotations_companyId_issueDate_idx" ON "quotations"("companyId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_companyId_number_key" ON "quotations"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_companyId_id_key" ON "quotations"("companyId", "id");

-- CreateIndex
CREATE INDEX "quotation_lines_companyId_idx" ON "quotation_lines"("companyId");

-- CreateIndex
CREATE INDEX "quotation_lines_quotationId_idx" ON "quotation_lines"("quotationId");

-- CreateIndex
CREATE INDEX "credit_notes_companyId_invoiceId_idx" ON "credit_notes"("companyId", "invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_companyId_customerId_idx" ON "credit_notes"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "credit_notes_companyId_status_idx" ON "credit_notes"("companyId", "status");

-- CreateIndex
CREATE INDEX "credit_notes_companyId_issueDate_idx" ON "credit_notes"("companyId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_companyId_number_key" ON "credit_notes"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_companyId_id_key" ON "credit_notes"("companyId", "id");

-- CreateIndex
CREATE INDEX "credit_note_lines_companyId_invoiceLineId_idx" ON "credit_note_lines"("companyId", "invoiceLineId");

-- CreateIndex
CREATE INDEX "credit_note_lines_creditNoteId_idx" ON "credit_note_lines"("creditNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_note_lines_companyId_creditNoteId_invoiceLineId_key" ON "credit_note_lines"("companyId", "creditNoteId", "invoiceLineId");

-- CreateIndex
CREATE INDEX "debit_notes_companyId_customerId_idx" ON "debit_notes"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "debit_notes_companyId_invoiceId_idx" ON "debit_notes"("companyId", "invoiceId");

-- CreateIndex
CREATE INDEX "debit_notes_companyId_status_idx" ON "debit_notes"("companyId", "status");

-- CreateIndex
CREATE INDEX "debit_notes_companyId_issueDate_idx" ON "debit_notes"("companyId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_companyId_number_key" ON "debit_notes"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_companyId_id_key" ON "debit_notes"("companyId", "id");

-- CreateIndex
CREATE INDEX "debit_note_lines_companyId_idx" ON "debit_note_lines"("companyId");

-- CreateIndex
CREATE INDEX "debit_note_lines_debitNoteId_idx" ON "debit_note_lines"("debitNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_companyId_id_key" ON "invoice_lines"("companyId", "id");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_companyId_quotationId_fkey" FOREIGN KEY ("companyId", "quotationId") REFERENCES "quotations"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "warehouses"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_companyId_creditNoteId_fkey" FOREIGN KEY ("companyId", "creditNoteId") REFERENCES "credit_notes"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_companyId_invoiceLineId_fkey" FOREIGN KEY ("companyId", "invoiceLineId") REFERENCES "invoice_lines"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_companyId_debitNoteId_fkey" FOREIGN KEY ("companyId", "debitNoteId") REFERENCES "debit_notes"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

