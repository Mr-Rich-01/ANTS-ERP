# DATABASE_DESIGN — ANTS ERP

_Última actualização: 2026-06-24_

ORM: **Prisma** sobre **PostgreSQL**. Esquema em
`packages/database/prisma/schema.prisma`. Migrações versionadas; seed só para dev.

## 1. Entidades da fundação (Fase 0/1 — já no esquema)

- **Company** — empresa (legalName, tradeName, NUIT, moeda/símbolo, fuso, locale, status).
- **CompanySettings** — config por empresa (fiscal, séries documentais, branding) em JSON.
- **Branch** — filial (code único por empresa, name, status).
- **User** — utilizador (companyId nullable = Super Admin da plataforma, passwordHash Argon2,
  mustChangePassword, bloqueio por tentativas).
- **Role / Permission / RolePermission / UserRole** — RBAC granular.
- **UserBranch** — associação utilizador↔filial (restrição por filial).
- **Session** — refresh token (hash), IP, user-agent, expiração, revogação, última actividade.
- **AuditLog** — auditoria imutável (oldValues/newValues, IP, motivo, resultado).

### Enums
`CompanyStatus` (ACTIVE/SUSPENDED/CANCELLED), `RecordStatus` (ACTIVE/INACTIVE).

## 2. Entidades por fase seguinte (planeadas)

Conforme secção 27 do prompt — adicionadas incrementalmente:

- **Mestres (Fase 2):** Customer, CustomerContact, Supplier, Product, ProductCategory,
  Unit, Warehouse, WarehouseLocation, BankAccount, Bank.
- **Stock/Compras (Fase 3):** StockBalance, StockMovement, StockLot, StockSerial,
  PurchaseRequisition, RequestForQuotation, PurchaseOrder, GoodsReceipt, SupplierInvoice.
- **Vendas (Fase 4):** Quotation, SalesOrder, DeliveryNote, Invoice, InvoiceItem,
  CreditNote, DebitNote, Receipt, Payment, PaymentAllocation.
- **Caixa/Tesouraria (Fase 5):** CashRegister, CashSession, CashMovement, BankTransaction,
  BankReconciliation.
- **Contabilidade (Fase 6):** Account, Journal, JournalEntry, JournalEntryLine,
  FiscalPeriod, CostCenter, Project.
- **RH/Salários (Fases 7–8):** Employee, Department, Position, EmploymentContract,
  Attendance, LeaveRequest, PayrollPeriod, Payroll, PayrollItem, SalaryComponent.
- **Outros (Fases 9–11):** Contract, Subscription, ProductionOrder, BillOfMaterials,
  ProductionConsumption, Notification, ApprovalWorkflow, ApprovalRequest, Attachment.

## 3. Índices

`companyId, branchId, status, documentNumber, createdAt, customerId, supplierId,
productId, warehouseId, accountId` — adicionados por modelo à medida que entram.

## 4. Integridade

- Constraints `@@unique` (ex.: `companyId+code` em Branch, `companyId+email` em User).
- Transacções para operações compostas (venda → stock + contabilidade).
- Sem stock negativo quando a empresa não autoriza.
- Lançamento contabilístico só persiste se `débitos == créditos`.
