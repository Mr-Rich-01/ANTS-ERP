-- S7 — Fluxo de Ordem de Compra (aditiva, parte 2/2)
-- Mapeamento aprovado (Opção A): OCs legadas SENT passam a APPROVED com
-- "approvedById" NULL = aprovação legada/implícita (continuam recepcionáveis).
-- Nenhuma linha é apagada; PARTIAL/RECEIVED/CANCELLED/DRAFT ficam intactos.

UPDATE "purchase_orders" SET "status" = 'APPROVED' WHERE "status" = 'SENT';

-- Novas OCs nascem a aguardar aprovação.
ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';
