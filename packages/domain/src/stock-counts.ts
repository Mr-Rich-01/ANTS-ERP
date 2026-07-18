/**
 * Inventário em duas etapas (Sessão S9).
 *
 * CONTAGEM (rascunho): captura de quantidades contadas com snapshot do stock de
 * sistema — ZERO efeitos em stock, custo médio ou contabilidade. Gate `stock.view`
 * (o Caixa pode contar; o rascunho é auditado e não movimenta nada).
 *
 * VALIDAÇÃO: gate `stock.adjust`. Regra aprovada de concorrência — o ajuste é o
 * DELTA (contado − snapshot) aplicado sobre o stock corrente sob `FOR UPDATE`;
 * se o resultado ficasse negativo (produto vendido abaixo do contado), a validação
 * falha por inteiro com os produtos listados. Gera `StockMovement ADJUST` por linha
 * com diferença e UM lançamento no Diário de Ajustamentos (`DAJ`/`AJ`):
 *   Excedente: D 131 `INVENTORY` / C 421 `INVENTORY_SURPLUS`
 *   Déficit:   D 551 `INVENTORY_SHORTAGE` / C 131 `INVENTORY`
 * valorizado ao custo médio corrente da validação (avgCost fica intacto — o
 * inventário corrige quantidades, não custos). Sem conta de fallback: mapping em
 * falta faz a operação falhar por inteiro.
 *
 * DESCARTE: motivo obrigatório (≥ 10 caracteres); a contagem nunca se apaga.
 */
import { z } from 'zod';
import type { PrismaClient, Prisma } from '@ants/database';
import { round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';
import { getMappedAccountTx } from './accounting';
import { postAccountingEventTx } from './accounting-events';
import {
  FINGERPRINT_VERSION,
  canonicalRequestFingerprint,
  fpInt,
  runIdempotentOperation,
} from './operation-idempotency';

export type StockCountStatus = 'DRAFT' | 'VALIDATED' | 'DISCARDED';

// ─────────────────────────── Inputs (Zod) ───────────────────────────

const lineInput = z.object({
  productId: z.string().min(1, 'Linha de contagem sem produto.'),
  countedQty: z.coerce
    .number({ invalid_type_error: 'Quantidade contada inválida.' })
    .int('A quantidade contada tem de ser um número inteiro.')
    .min(0, 'A quantidade contada não pode ser negativa.')
    .max(1_000_000_000, 'Quantidade contada demasiado grande.'),
});

const createInput = z.object({
  warehouseId: z.string().min(1, 'Seleccione o armazém da contagem.'),
  notes: z.string().trim().max(1000, 'Observações demasiado longas.').optional(),
  lines: z.array(lineInput).min(1, 'A contagem precisa de pelo menos uma linha.').max(2000, 'Contagem com demasiadas linhas.'),
});

const updateInput = z.object({
  stockCountId: z.string().min(1, 'Contagem inválida.'),
  notes: z.string().trim().max(1000, 'Observações demasiado longas.').optional(),
  lines: z.array(lineInput).min(1, 'A contagem precisa de pelo menos uma linha.').max(2000, 'Contagem com demasiadas linhas.'),
});

const discardInput = z.object({
  stockCountId: z.string().min(1, 'Contagem inválida.'),
  reason: z.string().trim().min(10, 'O motivo do descarte tem de ter pelo menos 10 caracteres.').max(500, 'Motivo demasiado longo.'),
});

export type StockCountLineInput = z.input<typeof lineInput>;
export type CreateStockCountInput = z.input<typeof createInput>;
export type UpdateStockCountInput = z.input<typeof updateInput>;
export type DiscardStockCountInput = z.input<typeof discardInput>;

// ─────────────────────────── Vistas ───────────────────────────

export interface StockCountListItem {
  id: string;
  number: string;
  status: StockCountStatus;
  warehouseCode: string;
  warehouseName: string;
  countedByName: string;
  countedAt: Date;
  validatedByName: string | null;
  validatedAt: Date | null;
  discardedAt: Date | null;
  lineCount: number;
}

export interface StockCountLineView {
  productId: string;
  productSku: string;
  productName: string;
  /** Snapshot no momento da gravação/última edição do rascunho. */
  systemQty: number;
  countedQty: number;
  /** Stock de sistema NESTE momento (para detectar divergência antes de validar). */
  currentQty: number;
  /** Custo médio corrente (estimativa do valor do ajuste na validação). */
  avgCost: number;
  appliedDiff: number | null;
  appliedUnitCost: number | null;
  appliedValue: number | null;
}

export interface StockCountDetail {
  id: string;
  number: string;
  status: StockCountStatus;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  notes: string | null;
  countedByName: string;
  countedAt: Date;
  validatedByName: string | null;
  validatedAt: Date | null;
  discardedByName: string | null;
  discardedAt: Date | null;
  discardReason: string | null;
  journalEntryId: string | null;
  journalEntryNumber: string | null;
  lines: StockCountLineView[];
}

export interface ValidateStockCountResult {
  id: string;
  number: string;
  /** Linhas com diferença efectivamente ajustadas. */
  adjusted: number;
  surplusValue: number;
  shortageValue: number;
  entryId: string | null;
  entryNumber: string | null;
}

// ─────────────────────────── Helpers ───────────────────────────

async function nextCountNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const year = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()));
  const key = `CI-${year}`;
  const counter = await tx.documentCounter.upsert({
    where: { companyId_key: { companyId, key } },
    update: { value: { increment: 1 } },
    create: { companyId, key, value: 1 },
  });
  return `CI ${year}/${String(counter.value).padStart(4, '0')}`;
}

/** Nome do actor resolvido na BD (padrão S7: name || email), com fallback à sessão. */
async function actorNameTx(tx: Prisma.TransactionClient, ctx: RequestContext): Promise<string> {
  const user = await tx.user.findFirst({ where: { id: ctx.userId }, select: { name: true, email: true } });
  return (user ? user.name || user.email : null) ?? ctx.userName ?? '—';
}

/** Valida unicidade de produtos e devolve as linhas normalizadas. */
function normalizeLines(lines: Array<z.output<typeof lineInput>>): Array<z.output<typeof lineInput>> {
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.productId)) throw new ValidationError('A contagem tem o mesmo produto em mais de uma linha.');
    seen.add(l.productId);
  }
  return lines;
}

/** Snapshot systemQty por produto no armazém + validação de existência/empresa. */
async function snapshotLines(
  tx: Prisma.TransactionClient,
  companyId: string,
  warehouseId: string,
  lines: Array<z.output<typeof lineInput>>,
): Promise<Array<{ productId: string; productSku: string; productName: string; systemQty: number; countedQty: number }>> {
  const productIds = lines.map((l) => l.productId);
  const products = await tx.product.findMany({
    where: { companyId, id: { in: productIds } },
    select: { id: true, sku: true, name: true, status: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const levels = await tx.stockLevel.findMany({
    where: { companyId, warehouseId, productId: { in: productIds } },
    select: { productId: true, quantity: true },
  });
  const qtyById = new Map(levels.map((l) => [l.productId, l.quantity]));
  return lines.map((l) => {
    const p = byId.get(l.productId);
    if (!p) throw new NotFoundError('Produto da contagem não encontrado nesta empresa.');
    if (p.status !== 'ACTIVE') throw new ValidationError(`O produto «${p.sku}» está inactivo e não pode ser contado.`);
    return {
      productId: l.productId,
      productSku: p.sku,
      productName: p.name,
      systemQty: qtyById.get(l.productId) ?? 0,
      countedQty: l.countedQty,
    };
  });
}

function createFingerprint(companyId: string, data: z.output<typeof createInput>): string {
  return canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    operation: 'STOCK_COUNT_CREATE',
    warehouseId: data.warehouseId,
    notes: data.notes ?? null,
    lines: data.lines.map((l) => ({ productId: l.productId, countedQty: fpInt(l.countedQty) })),
  });
}

// ─────────────────────────── Contagem (rascunho) ───────────────────────────

/**
 * Grava uma contagem como RASCUNHO — sem qualquer efeito em stock, custo médio
 * ou contabilidade. Snapshot do stock de sistema por linha no momento da gravação.
 */
export async function createStockCount(
  db: PrismaClient,
  ctx: RequestContext,
  input: CreateStockCountInput,
  options: { idempotencyKey?: string } = {},
): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'stock.view');
  const companyId = requireCompany(ctx);
  const parsed = createInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Contagem inválida.');
  const data = parsed.data;
  normalizeLines(data.lines);
  const requestFingerprint = createFingerprint(companyId, data);

  return db.$transaction(async (tx) => {
    const runCreate = async (): Promise<{ resourceType: string; resourceId: string; result: { id: string; number: string } }> => {
      const warehouse = await tx.warehouse.findFirst({ where: { id: data.warehouseId, companyId, status: 'ACTIVE' } });
      if (!warehouse) throw new NotFoundError('Armazém da contagem não encontrado ou inactivo.');

      const snapshot = await snapshotLines(tx, companyId, warehouse.id, data.lines);
      const number = await nextCountNumber(tx, companyId);
      const now = new Date();
      const count = await tx.stockCount.create({
        data: {
          companyId,
          warehouseId: warehouse.id,
          number,
          status: 'DRAFT',
          notes: data.notes || null,
          countedById: ctx.userId,
          countedByName: await actorNameTx(tx, ctx),
          countedAt: now,
        } as Prisma.StockCountUncheckedCreateInput,
      });
      await tx.stockCountLine.createMany({
        data: snapshot.map((s) => ({
          companyId,
          stockCountId: count.id,
          productId: s.productId,
          productSku: s.productSku,
          productName: s.productName,
          systemQty: s.systemQty,
          countedQty: s.countedQty,
        })) as Prisma.StockCountLineCreateManyInput[],
      });
      await writeAudit(tx, ctx, {
        action: 'stock.count.create',
        entity: 'StockCount',
        entityId: count.id,
        newValues: {
          number,
          warehouseId: warehouse.id,
          lineCount: snapshot.length,
          divergentLines: snapshot.filter((s) => s.countedQty !== s.systemQty).length,
          idempotencyKey: options.idempotencyKey ?? null,
        },
      });
      return { resourceType: 'StockCount', resourceId: count.id, result: { id: count.id, number } };
    };

    if (!options.idempotencyKey) return (await runCreate()).result;

    const op = await runIdempotentOperation<{ id: string; number: string }>(tx, ctx, {
      scope: 'STOCK_COUNT_CREATE',
      idempotencyKey: options.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'StockCount',
      loadExisting: async (resourceId) => {
        const existing = await tx.stockCount.findFirst({ where: { companyId, id: resourceId }, select: { id: true, number: true } });
        return existing ? { id: existing.id, number: existing.number } : null;
      },
      run: runCreate,
    });
    return op.result;
  });
}

/**
 * Edita um RASCUNHO: substitui as linhas e REFRESCA os snapshots de stock de
 * sistema (a edição é uma nova contagem sobre o stock actual). Sem efeitos.
 */
export async function updateStockCount(db: PrismaClient, ctx: RequestContext, input: UpdateStockCountInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'stock.view');
  const companyId = requireCompany(ctx);
  const parsed = updateInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Contagem inválida.');
  const data = parsed.data;
  normalizeLines(data.lines);

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stock_counts WHERE id = ${data.stockCountId} AND "companyId" = ${companyId} FOR UPDATE`;
    const count = await tx.stockCount.findFirst({ where: { id: data.stockCountId, companyId }, include: { lines: true } });
    if (!count) throw new NotFoundError('Contagem não encontrada.');
    if (count.status !== 'DRAFT') throw new ConflictError('Só contagens em rascunho podem ser editadas.');

    const snapshot = await snapshotLines(tx, companyId, count.warehouseId, data.lines);
    const now = new Date();
    await tx.stockCountLine.deleteMany({ where: { companyId, stockCountId: count.id } });
    await tx.stockCountLine.createMany({
      data: snapshot.map((s) => ({
        companyId,
        stockCountId: count.id,
        productId: s.productId,
        productSku: s.productSku,
        productName: s.productName,
        systemQty: s.systemQty,
        countedQty: s.countedQty,
      })) as Prisma.StockCountLineCreateManyInput[],
    });
    await tx.stockCount.update({
      where: { id: count.id },
      data: { notes: data.notes || null, countedById: ctx.userId, countedByName: await actorNameTx(tx, ctx), countedAt: now },
    });
    await writeAudit(tx, ctx, {
      action: 'stock.count.update',
      entity: 'StockCount',
      entityId: count.id,
      oldValues: {
        lineCount: count.lines.length,
        lines: count.lines.map((l) => ({ productSku: l.productSku, systemQty: l.systemQty, countedQty: l.countedQty })),
      },
      newValues: {
        lineCount: snapshot.length,
        lines: snapshot.map((s) => ({ productSku: s.productSku, systemQty: s.systemQty, countedQty: s.countedQty })),
      },
    });
    return { id: count.id, number: count.number };
  });
}

/** Descarta um RASCUNHO com motivo obrigatório (terminal; nunca se apaga). */
export async function discardStockCount(db: PrismaClient, ctx: RequestContext, input: DiscardStockCountInput): Promise<{ id: string; number: string }> {
  requirePermission(ctx, 'stock.view');
  const companyId = requireCompany(ctx);
  const parsed = discardInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Descarte inválido.');
  const data = parsed.data;

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stock_counts WHERE id = ${data.stockCountId} AND "companyId" = ${companyId} FOR UPDATE`;
    const count = await tx.stockCount.findFirst({ where: { id: data.stockCountId, companyId } });
    if (!count) throw new NotFoundError('Contagem não encontrada.');
    if (count.status !== 'DRAFT') throw new ConflictError('Só contagens em rascunho podem ser descartadas.');

    const now = new Date();
    await tx.stockCount.update({
      where: { id: count.id },
      data: {
        status: 'DISCARDED',
        discardedById: ctx.userId,
        discardedByName: await actorNameTx(tx, ctx),
        discardedAt: now,
        discardReason: data.reason,
      },
    });
    await writeAudit(tx, ctx, {
      action: 'stock.count.discard',
      entity: 'StockCount',
      entityId: count.id,
      oldValues: { status: 'DRAFT' },
      newValues: { status: 'DISCARDED', reason: data.reason, number: count.number },
    });
    return { id: count.id, number: count.number };
  });
}

// ─────────────────────────── Validação ───────────────────────────

/**
 * Valida uma contagem: aplica os deltas (contado − snapshot) sobre o stock
 * corrente sob `FOR UPDATE`, cria `StockMovement ADJUST` por linha com diferença
 * e lança o ajuste no Diário de Ajustamentos. Idempotente: replay com a mesma
 * chave devolve o mesmo resultado; contagem já validada falha com erro claro.
 */
export async function validateStockCount(
  db: PrismaClient,
  ctx: RequestContext,
  input: { stockCountId: string },
  options: { idempotencyKey?: string } = {},
): Promise<ValidateStockCountResult> {
  requirePermission(ctx, 'stock.adjust');
  const companyId = requireCompany(ctx);
  const stockCountId = (input.stockCountId ?? '').trim();
  if (!stockCountId) throw new ValidationError('Contagem inválida.');
  const requestFingerprint = canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    companyId,
    operation: 'STOCK_COUNT_VALIDATE',
    stockCountId,
  });

  return db.$transaction(async (tx) => {
    const loadResult = async (id: string): Promise<ValidateStockCountResult | null> => {
      const count = await tx.stockCount.findFirst({
        where: { companyId, id, status: 'VALIDATED' },
        include: { lines: true },
      });
      if (!count) return null;
      let surplusValue = 0;
      let shortageValue = 0;
      let adjusted = 0;
      for (const l of count.lines) {
        const value = Number(l.appliedValue ?? 0);
        if ((l.appliedDiff ?? 0) !== 0) adjusted += 1;
        if (value > 0) surplusValue = round2(surplusValue + value);
        else if (value < 0) shortageValue = round2(shortageValue + Math.abs(value));
      }
      let entryNumber: string | null = null;
      if (count.journalEntryId) {
        const entry = await tx.journalEntry.findFirst({ where: { companyId, id: count.journalEntryId }, select: { entryNumber: true } });
        entryNumber = entry?.entryNumber ?? null;
      }
      return { id: count.id, number: count.number, adjusted, surplusValue, shortageValue, entryId: count.journalEntryId, entryNumber };
    };

    const runValidate = async (): Promise<{ resourceType: string; resourceId: string; result: ValidateStockCountResult }> => {
      await tx.$queryRaw`SELECT id FROM stock_counts WHERE id = ${stockCountId} AND "companyId" = ${companyId} FOR UPDATE`;
      const count = await tx.stockCount.findFirst({ where: { id: stockCountId, companyId }, include: { lines: true, warehouse: true } });
      if (!count) throw new NotFoundError('Contagem não encontrada.');
      if (count.status === 'VALIDATED') throw new ConflictError(`A contagem ${count.number} já foi validada.`);
      if (count.status === 'DISCARDED') throw new ConflictError(`A contagem ${count.number} foi descartada e não pode ser validada.`);
      if (count.lines.length === 0) throw new ValidationError('A contagem não tem linhas.');

      // Serializa contra vendas/receções concorrentes dos mesmos produtos
      // (ordem determinística de locks para evitar deadlocks).
      const lines = [...count.lines].sort((a, b) => (a.productId < b.productId ? -1 : 1));
      for (const line of lines) {
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${line.productId} AND "companyId" = ${companyId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM stock_levels WHERE "companyId" = ${companyId} AND "productId" = ${line.productId} AND "warehouseId" = ${count.warehouseId} FOR UPDATE`;
      }

      const products = await tx.product.findMany({
        where: { companyId, id: { in: lines.map((l) => l.productId) } },
        select: { id: true, sku: true, avgCost: true },
      });
      const productById = new Map(products.map((p) => [p.id, p]));
      const levels = await tx.stockLevel.findMany({
        where: { companyId, warehouseId: count.warehouseId, productId: { in: lines.map((l) => l.productId) } },
        select: { productId: true, quantity: true },
      });
      const currentById = new Map(levels.map((l) => [l.productId, l.quantity]));

      // 1.ª passagem: calcular deltas e bloquear resultados negativos (tudo-ou-nada).
      const plans: Array<{ line: (typeof lines)[number]; diff: number; newQty: number; unitCost: number; value: number }> = [];
      const negatives: string[] = [];
      for (const line of lines) {
        const product = productById.get(line.productId);
        if (!product) throw new NotFoundError(`Produto da linha «${line.productSku}» não encontrado.`);
        const current = currentById.get(line.productId) ?? 0;
        const diff = line.countedQty - line.systemQty;
        const newQty = current + diff;
        if (newQty < 0) {
          negatives.push(`${line.productSku} (stock actual ${current}, ajuste ${diff > 0 ? '+' : ''}${diff})`);
          continue;
        }
        const unitCost = round2(Number(product.avgCost));
        plans.push({ line, diff, newQty, unitCost, value: round2(diff * unitCost) });
      }
      if (negatives.length > 0) {
        throw new ConflictError(
          `O stock mudou desde a contagem e o ajuste deixaria produtos negativos: ${negatives.join('; ')}. ` +
            'Edite a contagem (os valores de sistema são actualizados) ou reconte os produtos afectados.',
        );
      }

      // 2.ª passagem: aplicar movimentos e snapshots da validação.
      let adjusted = 0;
      let surplusValue = 0;
      let shortageValue = 0;
      const now = new Date();
      for (const plan of plans) {
        if (plan.diff !== 0) {
          adjusted += 1;
          if (plan.value > 0) surplusValue = round2(surplusValue + plan.value);
          else if (plan.value < 0) shortageValue = round2(shortageValue + Math.abs(plan.value));
          await tx.stockLevel.upsert({
            where: { productId_warehouseId: { productId: plan.line.productId, warehouseId: count.warehouseId } },
            update: { quantity: plan.newQty },
            create: { companyId, productId: plan.line.productId, warehouseId: count.warehouseId, quantity: plan.newQty },
          });
          await tx.stockMovement.create({
            data: {
              companyId,
              productId: plan.line.productId,
              warehouseId: count.warehouseId,
              stockCountId: count.id,
              type: 'ADJUST',
              quantity: plan.diff,
              balanceAfter: plan.newQty,
              document: count.number,
              reason: plan.diff > 0 ? 'Excedente de contagem de inventário' : 'Déficit de contagem de inventário',
              createdBy: ctx.userId,
            } as Prisma.StockMovementUncheckedCreateInput,
          });
        }
        await tx.stockCountLine.update({
          where: { id: plan.line.id },
          data: { appliedDiff: plan.diff, appliedUnitCost: plan.unitCost, appliedValue: plan.value },
        });
      }

      // Lançamento único no Diário de Ajustamentos (apenas se houver valor > 0).
      let entryId: string | null = null;
      let entryNumber: string | null = null;
      if (surplusValue > 0 || shortageValue > 0) {
        const inventory = await getMappedAccountTx(tx, companyId, 'INVENTORY');
        const eventLines: Array<{ ledgerAccountId: string; debit?: number; credit?: number; description?: string }> = [];
        if (surplusValue > 0) {
          const surplus = await getMappedAccountTx(tx, companyId, 'INVENTORY_SURPLUS');
          eventLines.push(
            { ledgerAccountId: inventory.id, debit: surplusValue, description: `Excedentes da contagem ${count.number}` },
            { ledgerAccountId: surplus.id, credit: surplusValue, description: `Excedentes da contagem ${count.number}` },
          );
        }
        if (shortageValue > 0) {
          const shortage = await getMappedAccountTx(tx, companyId, 'INVENTORY_SHORTAGE');
          eventLines.push(
            { ledgerAccountId: shortage.id, debit: shortageValue, description: `Déficits da contagem ${count.number}` },
            { ledgerAccountId: inventory.id, credit: shortageValue, description: `Déficits da contagem ${count.number}` },
          );
        }
        const entry = await postAccountingEventTx(tx, ctx, {
          journalType: 'ADJUSTMENT',
          entryDate: now,
          dateLabel: 'A data da validação',
          description: `Ajustes da contagem de inventário ${count.number} — ${count.warehouse.name}`,
          reference: count.number,
          origin: { sourceType: 'STOCK_COUNT', sourceId: count.id, accountingEvent: 'STOCK_COUNT_VALIDATED' },
          lines: eventLines,
        });
        entryId = entry.id;
        entryNumber = entry.entryNumber;
      }

      await tx.stockCount.update({
        where: { id: count.id },
        data: {
          status: 'VALIDATED',
          validatedById: ctx.userId,
          validatedByName: await actorNameTx(tx, ctx),
          validatedAt: now,
          journalEntryId: entryId,
        },
      });
      await writeAudit(tx, ctx, {
        action: 'stock.count.validate',
        entity: 'StockCount',
        entityId: count.id,
        oldValues: { status: 'DRAFT' },
        newValues: {
          status: 'VALIDATED',
          number: count.number,
          adjusted,
          surplusValue,
          shortageValue,
          journalEntryId: entryId,
          entryNumber,
          idempotencyKey: options.idempotencyKey ?? null,
        },
      });

      return {
        resourceType: 'StockCount',
        resourceId: count.id,
        result: { id: count.id, number: count.number, adjusted, surplusValue, shortageValue, entryId, entryNumber },
      };
    };

    if (!options.idempotencyKey) return (await runValidate()).result;

    const op = await runIdempotentOperation<ValidateStockCountResult>(tx, ctx, {
      scope: 'STOCK_COUNT_VALIDATE',
      idempotencyKey: options.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'StockCount',
      loadExisting: loadResult,
      run: runValidate,
    });
    return op.result;
  });
}

// ─────────────────────────── Consultas ───────────────────────────

/** Contagens da empresa (mais recentes primeiro). */
export async function listStockCounts(db: PrismaClient, ctx: RequestContext, limit = 50): Promise<StockCountListItem[]> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const rows = await db.stockCount.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(1, limit), 200),
    include: { warehouse: { select: { code: true, name: true } }, _count: { select: { lines: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    number: c.number,
    status: c.status as StockCountStatus,
    warehouseCode: c.warehouse.code,
    warehouseName: c.warehouse.name,
    countedByName: c.countedByName,
    countedAt: c.countedAt,
    validatedByName: c.validatedByName,
    validatedAt: c.validatedAt,
    discardedAt: c.discardedAt,
    lineCount: c._count.lines,
  }));
}

/** Detalhe de uma contagem, com stock corrente por linha (divergências pré-validação). */
export async function getStockCount(db: PrismaClient, ctx: RequestContext, id: string): Promise<StockCountDetail> {
  requirePermission(ctx, 'stock.view');
  requireCompany(ctx);
  const count = await db.stockCount.findFirst({
    where: { id },
    include: { warehouse: { select: { code: true, name: true } }, lines: { orderBy: { productName: 'asc' } } },
  });
  if (!count) throw new NotFoundError('Contagem não encontrada.');

  const productIds = count.lines.map((l) => l.productId);
  const [levels, products, entry] = await Promise.all([
    db.stockLevel.findMany({ where: { warehouseId: count.warehouseId, productId: { in: productIds } }, select: { productId: true, quantity: true } }),
    db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, avgCost: true } }),
    count.journalEntryId
      ? db.journalEntry.findFirst({ where: { id: count.journalEntryId }, select: { entryNumber: true } })
      : Promise.resolve(null),
  ]);
  const qtyById = new Map(levels.map((l) => [l.productId, l.quantity]));
  const costById = new Map(products.map((p) => [p.id, round2(Number(p.avgCost))]));

  return {
    id: count.id,
    number: count.number,
    status: count.status as StockCountStatus,
    warehouseId: count.warehouseId,
    warehouseCode: count.warehouse.code,
    warehouseName: count.warehouse.name,
    notes: count.notes,
    countedByName: count.countedByName,
    countedAt: count.countedAt,
    validatedByName: count.validatedByName,
    validatedAt: count.validatedAt,
    discardedByName: count.discardedByName,
    discardedAt: count.discardedAt,
    discardReason: count.discardReason,
    journalEntryId: count.journalEntryId,
    journalEntryNumber: entry?.entryNumber ?? null,
    lines: count.lines.map((l) => ({
      productId: l.productId,
      productSku: l.productSku,
      productName: l.productName,
      systemQty: l.systemQty,
      countedQty: l.countedQty,
      currentQty: qtyById.get(l.productId) ?? 0,
      avgCost: costById.get(l.productId) ?? 0,
      appliedDiff: l.appliedDiff,
      appliedUnitCost: l.appliedUnitCost === null ? null : Number(l.appliedUnitCost),
      appliedValue: l.appliedValue === null ? null : Number(l.appliedValue),
    })),
  };
}
