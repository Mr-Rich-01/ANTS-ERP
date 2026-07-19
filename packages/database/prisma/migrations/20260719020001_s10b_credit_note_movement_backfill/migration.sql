-- S10b — backfill (parte 2/2): liga os movimentos IN das devoluções das NCs
-- já existentes ao novo creditNoteId. Critério conservador: mesmo companyId,
-- document = número da NC, tipo IN e sem NENHUMA outra origem (invoiceId,
-- purchaseReceiptId, stockCountId e reversesId nulos).
-- COUNT prévio em dev (2026-07-18, regra S7): 2 movimentos (NC 2026/0001 e
-- NC 2026/0002, 1 movimento cada). Nenhuma linha apagada; nenhum outro
-- movimento tocado.

UPDATE "stock_movements" AS m
SET "creditNoteId" = n."id"
FROM "credit_notes" AS n
WHERE m."companyId" = n."companyId"
  AND m."document"  = n."number"
  AND m."type"      = 'IN'
  AND m."creditNoteId"      IS NULL
  AND m."invoiceId"         IS NULL
  AND m."purchaseReceiptId" IS NULL
  AND m."stockCountId"      IS NULL
  AND m."reversesId"        IS NULL;
