-- CreateEnum
CREATE TYPE "TreasuryMovementStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- AlterTable
ALTER TABLE "treasury_accounts" ADD COLUMN     "allowNegative" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "treasury_movements" ADD COLUMN     "movementPurpose" TEXT,
ADD COLUMN     "reversesId" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT,
ADD COLUMN     "status" "TreasuryMovementStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "transferId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "treasury_movements_reversesId_key" ON "treasury_movements"("reversesId");

-- CreateIndex
CREATE INDEX "treasury_movements_transferId_idx" ON "treasury_movements"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_movements_companyId_sourceType_sourceId_movementPu_key" ON "treasury_movements"("companyId", "sourceType", "sourceId", "movementPurpose");

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "treasury_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

