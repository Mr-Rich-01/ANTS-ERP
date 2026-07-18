-- S10a — CMV na venda: snapshot do custo médio na linha da factura.
-- Aditiva: coluna opcional; NULL = linha sem produto, rascunho não emitido ou factura pré-S10
-- (facturas históricas ficam sem CMV por decisão aprovada — data de corte).
ALTER TABLE "invoice_lines" ADD COLUMN "unitCost" DECIMAL(14,2);
