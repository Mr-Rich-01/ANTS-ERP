-- Sessão S9 — Inventário em duas etapas (aditiva)
-- Contagem de inventário: RASCUNHO sem efeitos → VALIDADA (ajusta stock + contabilidade)
-- ou DESCARTADA (motivo obrigatório). Rastreabilidade: stock_movements.stockCountId.

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'VALIDATED', 'DISCARDED');

-- AlterEnum
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'STOCK_COUNT_CREATE';
ALTER TYPE "OperationIdempotencyScope" ADD VALUE 'STOCK_COUNT_VALIDATE';

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "countedById" TEXT,
    "countedByName" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL,
    "validatedById" TEXT,
    "validatedByName" TEXT,
    "validatedAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "discardedById" TEXT,
    "discardedByName" TEXT,
    "discardedAt" TIMESTAMP(3),
    "discardReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL,
    "appliedDiff" INTEGER,
    "appliedUnitCost" DECIMAL(14,2),
    "appliedValue" DECIMAL(14,2),

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "stockCountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_companyId_number_key" ON "stock_counts"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_companyId_id_key" ON "stock_counts"("companyId", "id");

-- CreateIndex
CREATE INDEX "stock_counts_companyId_status_idx" ON "stock_counts"("companyId", "status");

-- CreateIndex
CREATE INDEX "stock_counts_companyId_warehouseId_idx" ON "stock_counts"("companyId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_stockCountId_productId_key" ON "stock_count_lines"("stockCountId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_companyId_id_key" ON "stock_count_lines"("companyId", "id");

-- CreateIndex
CREATE INDEX "stock_count_lines_companyId_idx" ON "stock_count_lines"("companyId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_stockCountId_idx" ON "stock_movements"("companyId", "stockCountId");

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_companyId_stockCountId_fkey" FOREIGN KEY ("companyId", "stockCountId") REFERENCES "stock_counts"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_stockCountId_fkey" FOREIGN KEY ("companyId", "stockCountId") REFERENCES "stock_counts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
