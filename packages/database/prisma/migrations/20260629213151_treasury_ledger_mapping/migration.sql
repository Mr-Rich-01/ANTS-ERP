-- AlterTable
ALTER TABLE "treasury_accounts" ADD COLUMN     "ledgerAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "treasury_accounts_companyId_ledgerAccountId_key" ON "treasury_accounts"("companyId", "ledgerAccountId");

-- AddForeignKey
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_companyId_ledgerAccountId_fkey" FOREIGN KEY ("companyId", "ledgerAccountId") REFERENCES "ledger_accounts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

