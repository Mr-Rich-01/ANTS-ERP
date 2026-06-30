-- CreateEnum
CREATE TYPE "OperationIdempotencyScope" AS ENUM ('INVOICE_CREATE', 'CUSTOMER_PAYMENT_CREATE');

-- CreateTable
CREATE TABLE "operation_idempotency" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scope" "OperationIdempotencyScope" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "operation_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operation_idempotency_companyId_resourceType_resourceId_idx" ON "operation_idempotency"("companyId", "resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "operation_idempotency_companyId_scope_idempotencyKey_key" ON "operation_idempotency"("companyId", "scope", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "operation_idempotency" ADD CONSTRAINT "operation_idempotency_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

