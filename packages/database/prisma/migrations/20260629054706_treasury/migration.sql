-- CreateEnum
CREATE TYPE "TreasuryAccountType" AS ENUM ('CASH', 'BANK', 'MOBILE', 'OTHER');

-- CreateEnum
CREATE TYPE "TreasuryFlow" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "treasury_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TreasuryAccountType" NOT NULL DEFAULT 'BANK',
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasury_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "flow" "TreasuryFlow" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "document" TEXT,
    "counterpartAccountId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdBy" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treasury_accounts_companyId_idx" ON "treasury_accounts"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_accounts_companyId_name_key" ON "treasury_accounts"("companyId", "name");

-- CreateIndex
CREATE INDEX "treasury_movements_companyId_accountId_occurredAt_idx" ON "treasury_movements"("companyId", "accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "treasury_movements_companyId_occurredAt_idx" ON "treasury_movements"("companyId", "occurredAt");

-- AddForeignKey
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_movements" ADD CONSTRAINT "treasury_movements_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "treasury_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
