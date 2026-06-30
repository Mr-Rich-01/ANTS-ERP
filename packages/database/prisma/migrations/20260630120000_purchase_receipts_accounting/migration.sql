-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'PURCHASE_RECEIPT_CREATE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'SUPPLIER_PAYMENT_CREATE';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "purchaseReceiptId" TEXT;

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "receiptDate" DATE NOT NULL,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_receipts_companyId_purchaseOrderId_idx" ON "purchase_receipts"("companyId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_receipts_companyId_supplierId_idx" ON "purchase_receipts"("companyId", "supplierId");

-- CreateIndex
CREATE INDEX "purchase_receipts_companyId_receiptDate_idx" ON "purchase_receipts"("companyId", "receiptDate");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_companyId_receiptNumber_key" ON "purchase_receipts"("companyId", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_companyId_id_key" ON "purchase_receipts"("companyId", "id");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_companyId_purchaseOrderLineId_idx" ON "purchase_receipt_items"("companyId", "purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_companyId_productId_idx" ON "purchase_receipt_items"("companyId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipt_items_companyId_purchaseReceiptId_purchase_key" ON "purchase_receipt_items"("companyId", "purchaseReceiptId", "purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "products_companyId_id_key" ON "products"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_companyId_id_key" ON "purchase_order_lines"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_companyId_id_key" ON "purchase_orders"("companyId", "id");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_purchaseReceiptId_idx" ON "stock_movements"("companyId", "purchaseReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_companyId_id_key" ON "warehouses"("companyId", "id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_purchaseReceiptId_fkey" FOREIGN KEY ("companyId", "purchaseReceiptId") REFERENCES "purchase_receipts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_companyId_purchaseOrderId_fkey" FOREIGN KEY ("companyId", "purchaseOrderId") REFERENCES "purchase_orders"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "suppliers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "warehouses"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_companyId_purchaseReceiptId_fkey" FOREIGN KEY ("companyId", "purchaseReceiptId") REFERENCES "purchase_receipts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_companyId_purchaseOrderLineId_fkey" FOREIGN KEY ("companyId", "purchaseOrderLineId") REFERENCES "purchase_order_lines"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "products"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
