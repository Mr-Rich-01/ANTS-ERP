-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "AccountingJournalType" AS ENUM ('GENERAL', 'SALES', 'PURCHASES', 'CASH', 'BANK', 'PAYROLL', 'ADJUSTMENT', 'OPENING');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "isAdjustment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" "LedgerAccountType" NOT NULL,
    "normalBalance" "NormalBalance" NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "isPosting" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "provisioningKey" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_journals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "journalType" "AccountingJournalType" NOT NULL,
    "sequencePrefix" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "accountingPeriodId" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "postingDate" DATE,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "accountingEvent" TEXT,
    "reversalOfId" TEXT,
    "totalDebit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_lines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "description" TEXT,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineNumber" INTEGER NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "treasuryAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_mappings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "systemKey" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_years_companyId_idx" ON "fiscal_years"("companyId");

-- CreateIndex
CREATE INDEX "fiscal_years_companyId_status_idx" ON "fiscal_years"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_companyId_name_key" ON "fiscal_years"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_companyId_id_key" ON "fiscal_years"("companyId", "id");

-- CreateIndex
CREATE INDEX "accounting_periods_companyId_fiscalYearId_idx" ON "accounting_periods"("companyId", "fiscalYearId");

-- CreateIndex
CREATE INDEX "accounting_periods_companyId_status_idx" ON "accounting_periods"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_companyId_code_key" ON "accounting_periods"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_companyId_fiscalYearId_periodNumber_key" ON "accounting_periods"("companyId", "fiscalYearId", "periodNumber");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_companyId_id_key" ON "accounting_periods"("companyId", "id");

-- CreateIndex
CREATE INDEX "ledger_accounts_companyId_idx" ON "ledger_accounts"("companyId");

-- CreateIndex
CREATE INDEX "ledger_accounts_companyId_accountType_idx" ON "ledger_accounts"("companyId", "accountType");

-- CreateIndex
CREATE INDEX "ledger_accounts_companyId_parentId_idx" ON "ledger_accounts"("companyId", "parentId");

-- CreateIndex
CREATE INDEX "ledger_accounts_companyId_isActive_idx" ON "ledger_accounts"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_companyId_code_key" ON "ledger_accounts"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_companyId_provisioningKey_key" ON "ledger_accounts"("companyId", "provisioningKey");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_companyId_id_key" ON "ledger_accounts"("companyId", "id");

-- CreateIndex
CREATE INDEX "accounting_journals_companyId_idx" ON "accounting_journals"("companyId");

-- CreateIndex
CREATE INDEX "accounting_journals_companyId_journalType_idx" ON "accounting_journals"("companyId", "journalType");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_journals_companyId_code_key" ON "accounting_journals"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_journals_companyId_id_key" ON "accounting_journals"("companyId", "id");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_status_idx" ON "journal_entries"("companyId", "status");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_entryDate_idx" ON "journal_entries"("companyId", "entryDate");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_postingDate_idx" ON "journal_entries"("companyId", "postingDate");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_journalId_idx" ON "journal_entries"("companyId", "journalId");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_accountingPeriodId_idx" ON "journal_entries"("companyId", "accountingPeriodId");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_fiscalYearId_idx" ON "journal_entries"("companyId", "fiscalYearId");

-- CreateIndex
CREATE INDEX "journal_entries_companyId_sourceType_sourceId_idx" ON "journal_entries"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_companyId_fiscalYearId_journalId_entryNumbe_key" ON "journal_entries"("companyId", "fiscalYearId", "journalId", "entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_companyId_id_key" ON "journal_entries"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_companyId_reversalOfId_key" ON "journal_entries"("companyId", "reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_companyId_sourceType_sourceId_accountingEve_key" ON "journal_entries"("companyId", "sourceType", "sourceId", "accountingEvent");

-- CreateIndex
CREATE INDEX "journal_entry_lines_companyId_idx" ON "journal_entry_lines"("companyId");

-- CreateIndex
CREATE INDEX "journal_entry_lines_companyId_journalEntryId_idx" ON "journal_entry_lines"("companyId", "journalEntryId");

-- CreateIndex
CREATE INDEX "journal_entry_lines_companyId_ledgerAccountId_createdAt_idx" ON "journal_entry_lines"("companyId", "ledgerAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entry_lines_companyId_journalEntryId_lineNumber_key" ON "journal_entry_lines"("companyId", "journalEntryId", "lineNumber");

-- CreateIndex
CREATE INDEX "accounting_mappings_companyId_idx" ON "accounting_mappings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_mappings_companyId_systemKey_key" ON "accounting_mappings"("companyId", "systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "customers_companyId_id_key" ON "customers"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_companyId_id_key" ON "suppliers"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_accounts_companyId_id_key" ON "treasury_accounts"("companyId", "id");

-- AddForeignKey
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_companyId_fiscalYearId_fkey" FOREIGN KEY ("companyId", "fiscalYearId") REFERENCES "fiscal_years"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_companyId_parentId_fkey" FOREIGN KEY ("companyId", "parentId") REFERENCES "ledger_accounts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_journals" ADD CONSTRAINT "accounting_journals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_fiscalYearId_fkey" FOREIGN KEY ("companyId", "fiscalYearId") REFERENCES "fiscal_years"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_accountingPeriodId_fkey" FOREIGN KEY ("companyId", "accountingPeriodId") REFERENCES "accounting_periods"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_journalId_fkey" FOREIGN KEY ("companyId", "journalId") REFERENCES "accounting_journals"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_reversalOfId_fkey" FOREIGN KEY ("companyId", "reversalOfId") REFERENCES "journal_entries"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_companyId_journalEntryId_fkey" FOREIGN KEY ("companyId", "journalEntryId") REFERENCES "journal_entries"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_companyId_ledgerAccountId_fkey" FOREIGN KEY ("companyId", "ledgerAccountId") REFERENCES "ledger_accounts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "suppliers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_companyId_treasuryAccountId_fkey" FOREIGN KEY ("companyId", "treasuryAccountId") REFERENCES "treasury_accounts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_mappings" ADD CONSTRAINT "accounting_mappings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_mappings" ADD CONSTRAINT "accounting_mappings_companyId_ledgerAccountId_fkey" FOREIGN KEY ("companyId", "ledgerAccountId") REFERENCES "ledger_accounts"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Reforços de integridade (Fase 8a) — não geráveis pelo Prisma
-- ─────────────────────────────────────────────────────────────

-- Extensão necessária para as exclusion constraints (sobreposição de datas).
-- Pré-requisito de ambiente (dev/teste/produção): documentado no projecto.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Exercícios fiscais: datas coerentes + sem sobreposição por empresa.
ALTER TABLE "fiscal_years"
  ADD CONSTRAINT "fy_dates_order" CHECK ("startDate" <= "endDate"),
  ADD CONSTRAINT "fy_no_overlap" EXCLUDE USING gist (
    "companyId" WITH =,
    daterange("startDate", "endDate", '[]') WITH &&
  );

-- Apenas um exercício corrente por empresa.
CREATE UNIQUE INDEX "fy_one_current" ON "fiscal_years" ("companyId") WHERE "isCurrent" = true;

-- Períodos: datas coerentes + sem sobreposição (períodos normais; ajustamento excluído).
ALTER TABLE "accounting_periods"
  ADD CONSTRAINT "ap_dates_order" CHECK ("startDate" <= "endDate"),
  ADD CONSTRAINT "ap_no_overlap" EXCLUDE USING gist (
    "companyId" WITH =,
    "fiscalYearId" WITH =,
    daterange("startDate", "endDate", '[]') WITH &&
  ) WHERE ("isAdjustment" = false);

-- Plano de contas: nível mínimo.
ALTER TABLE "ledger_accounts"
  ADD CONSTRAINT "la_level_min" CHECK ("level" >= 1);

-- Lançamentos: totais não-negativos + origem all-null-or-all-set (manual vs. automático).
ALTER TABLE "journal_entries"
  ADD CONSTRAINT "je_totals_nonneg" CHECK ("totalDebit" >= 0 AND "totalCredit" >= 0),
  ADD CONSTRAINT "je_source_all_or_none" CHECK (
    ("sourceType" IS NULL AND "sourceId" IS NULL AND "accountingEvent" IS NULL)
    OR
    ("sourceType" IS NOT NULL AND "sourceId" IS NOT NULL AND "accountingEvent" IS NOT NULL)
  );

-- Linhas: valores não-negativos, débito XOR crédito (>0), número de linha positivo.
ALTER TABLE "journal_entry_lines"
  ADD CONSTRAINT "jel_amounts_nonneg" CHECK ("debit" >= 0 AND "credit" >= 0),
  ADD CONSTRAINT "jel_debit_xor_credit" CHECK (
    ("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)
  ),
  ADD CONSTRAINT "jel_line_positive" CHECK ("lineNumber" > 0);
