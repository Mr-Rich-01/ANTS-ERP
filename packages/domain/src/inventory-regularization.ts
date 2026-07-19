/**
 * Regularização retroactiva de existências (S10c) — operação GENÉRICA e reutilizável.
 *
 * Compara, NO MOMENTO DA EXECUÇÃO, o stock físico valorizado ao custo médio
 * corrente de cada produto com o saldo contabilístico da conta de existências
 * (mapping `INVENTORY`, lançamentos POSTED + REVERSED) e lança a diferença num
 * único lançamento no Diário de Abertura (`DAB`, tipo OPENING) contra a conta de
 * capital próprio de abertura (mapping `OPENING_BALANCE_EQUITY`, padrão S8):
 *
 *   divergência > 0 (físico > saldo): D Existências / C Regularização de abertura
 *   divergência < 0 (saldo > físico): D Regularização de abertura / C Existências
 *
 * O valor NUNCA é fornecido pelo cliente: a pré-visualização apresenta o detalhe
 * por produto para revisão e a execução recompõe o cálculo dentro da transacção;
 * se o valor recomputado divergir do pré-visualizado/confirmado, a operação falha
 * por inteiro sem alterar nada. Gate `accounting.post`; idempotente com scope
 * próprio `INVENTORY_REGULARIZATION`; evento `INVENTORY_REGULARIZED` por operação;
 * auditoria explícita. Sem conta de fallback: mapping em falta → falha total.
 */
import { z } from 'zod';
import type { PrismaClient, Prisma } from '@ants/database';
import { formatMZN, round2 } from '@ants/shared';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';
import { formatAccountingDate, getMappedAccountTx, parseAccountingDate } from './accounting';
import { postAccountingEventTx } from './accounting-events';
import {
  FINGERPRINT_VERSION,
  canonicalRequestFingerprint,
  fpAmount,
  runIdempotentOperation,
} from './operation-idempotency';

// ─────────────────────────── Tipos ───────────────────────────

export interface InventoryRegularizationItem {
  productId: string;
  sku: string;
  name: string;
  /** Quantidade física total (todos os armazéns). */
  quantity: number;
  /** Custo médio corrente do produto (2 casas). */
  avgCost: number;
  /** Valor físico = Σ por nível de stock de `round2(qtd × avgCost)` — fórmula do teste-âncora S10a. */
  value: number;
}

export interface InventoryRegularizationPreview {
  /** Detalhe por produto com stock físico diferente de zero. */
  items: InventoryRegularizationItem[];
  /** Stock físico total valorizado ao avgCost corrente. */
  physicalValue: number;
  /** Saldo da conta de existências (débitos − créditos, POSTED + REVERSED). */
  inventoryBalance: number;
  /** `physicalValue − inventoryBalance` (2 casas). 0 = nada a regularizar. */
  divergence: number;
  inventoryAccount: { code: string; name: string };
  equityAccount: { code: string; name: string };
  /** Momento do cálculo (os valores são válidos apenas para este instante). */
  computedAt: Date;
}

export interface InventoryRegularizationResult {
  entryId: string;
  entryNumber: string;
  /** Divergência efectivamente lançada (com sinal: >0 debitou existências). */
  divergence: number;
}

// ─────────────────────────── Cálculo (partilhado preview/execução) ───────────────────────────

interface ComputedState {
  items: InventoryRegularizationItem[];
  physicalValue: number;
  inventoryBalance: number;
  divergence: number;
  inventoryAccountId: string;
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Calcula o estado corrente: físico por produto (fórmula ÚNICA do teste-âncora
 * S10a: Σ por nível `round2(qtd × round2(avgCost))`) e saldo da conta mapeada.
 */
async function computeStateTx(db: Db, companyId: string, inventoryAccountId: string): Promise<ComputedState> {
  const levels = await db.stockLevel.findMany({
    where: { companyId },
    include: { product: { select: { id: true, sku: true, name: true, avgCost: true } } },
    orderBy: { product: { sku: 'asc' } },
  });
  const byProduct = new Map<string, InventoryRegularizationItem>();
  for (const level of levels) {
    const avgCost = round2(Number(level.product.avgCost));
    const existing = byProduct.get(level.productId);
    const levelValue = round2(level.quantity * avgCost);
    if (existing) {
      existing.quantity += level.quantity;
      existing.value = round2(existing.value + levelValue);
    } else {
      byProduct.set(level.productId, {
        productId: level.productId,
        sku: level.product.sku,
        name: level.product.name,
        quantity: level.quantity,
        avgCost,
        value: levelValue,
      });
    }
  }
  const items = [...byProduct.values()].filter((i) => i.quantity !== 0 || i.value !== 0);
  const physicalValue = round2(items.reduce((sum, i) => sum + i.value, 0));

  const lines = await db.journalEntryLine.findMany({
    where: { companyId, ledgerAccountId: inventoryAccountId, journalEntry: { status: { in: ['POSTED', 'REVERSED'] } } },
    select: { debit: true, credit: true },
  });
  const inventoryBalance = round2(lines.reduce((sum, l) => sum + Number(l.debit) - Number(l.credit), 0));

  return { items, physicalValue, inventoryBalance, divergence: round2(physicalValue - inventoryBalance), inventoryAccountId };
}

/** Resolve as duas contas mapeadas (sem fallback — mensagem clara se faltar). */
async function resolveAccountsTx(db: Db, companyId: string): Promise<{
  inventory: { id: string; code: string; name: string };
  equity: { id: string; code: string; name: string };
}> {
  const inventory = await getMappedAccountTx(db as Prisma.TransactionClient, companyId, 'INVENTORY');
  const equity = await getMappedAccountTx(db as Prisma.TransactionClient, companyId, 'OPENING_BALANCE_EQUITY');
  const rows = await db.ledgerAccount.findMany({ where: { companyId, id: { in: [inventory.id, equity.id] } }, select: { id: true, code: true, name: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const inv = byId.get(inventory.id);
  const eq = byId.get(equity.id);
  if (!inv || !eq) throw new NotFoundError('Conta mapeada não encontrada nesta empresa.');
  return { inventory: inv, equity: eq };
}

// ─────────────────────────── Pré-visualização ───────────────────────────

/**
 * Calcula a divergência corrente com detalhe por produto, SEM efeitos.
 * Gate `accounting.post` — é o ecrã da operação, não um relatório.
 */
export async function getInventoryRegularizationPreview(db: PrismaClient, ctx: RequestContext): Promise<InventoryRegularizationPreview> {
  requirePermission(ctx, 'accounting.post');
  const companyId = requireCompany(ctx);
  const accounts = await resolveAccountsTx(db, companyId);
  const state = await computeStateTx(db, companyId, accounts.inventory.id);
  return {
    items: state.items,
    physicalValue: state.physicalValue,
    inventoryBalance: state.inventoryBalance,
    divergence: state.divergence,
    inventoryAccount: { code: accounts.inventory.code, name: accounts.inventory.name },
    equityAccount: { code: accounts.equity.code, name: accounts.equity.name },
    computedAt: new Date(),
  };
}

// ─────────────────────────── Execução ───────────────────────────

const executeInput = z.object({
  /** Divergência confirmada pelo utilizador na pré-visualização (com sinal). */
  expectedDivergence: z.coerce.number(),
  notes: z.string().trim().max(240).optional(),
});
export type ExecuteInventoryRegularizationInput = z.input<typeof executeInput>;

/**
 * Executa a regularização: recomputa a divergência DENTRO da transacção, exige
 * que coincida com o valor confirmado na pré-visualização (falha total se os
 * valores entretanto mudaram) e lança o acerto no diário de Abertura.
 */
export async function executeInventoryRegularization(
  db: PrismaClient,
  ctx: RequestContext,
  input: ExecuteInventoryRegularizationInput,
  options: { idempotencyKey: string },
): Promise<InventoryRegularizationResult> {
  requirePermission(ctx, 'accounting.post');
  const companyId = requireCompany(ctx);
  const parsed = executeInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const expected = round2(parsed.data.expectedDivergence);
  const notes = parsed.data.notes || null;

  const requestFingerprint = canonicalRequestFingerprint(FINGERPRINT_VERSION, {
    operation: 'INVENTORY_REGULARIZATION',
    expectedDivergence: fpAmount(expected),
    notes,
  });

  return db.$transaction(async (tx) => {
    // Replay: fingerprint igual garante o mesmo pedido, logo a mesma divergência confirmada.
    const loadExisting = async (resourceId: string): Promise<InventoryRegularizationResult | null> => {
      const entry = await tx.journalEntry.findFirst({
        where: { companyId, id: resourceId, sourceType: 'INVENTORY_REGULARIZATION' },
        select: { id: true, entryNumber: true },
      });
      if (!entry) return null;
      return { entryId: entry.id, entryNumber: entry.entryNumber, divergence: expected };
    };

    const run = async (): Promise<{ resourceType: string; resourceId: string; result: InventoryRegularizationResult }> => {
      const accounts = await resolveAccountsTx(tx, companyId);
      const state = await computeStateTx(tx, companyId, accounts.inventory.id);

      if (state.divergence === 0) {
        throw new ValidationError('Não existe divergência entre o stock físico e a conta de existências — nada a regularizar.');
      }
      if (state.divergence !== expected) {
        throw new ConflictError(
          `Os valores mudaram desde a pré-visualização (confirmado ${expected.toFixed(2)}, actual ${state.divergence.toFixed(2)}). ` +
            'Reveja a pré-visualização e confirme de novo. Nada foi alterado.',
        );
      }

      const amount = round2(Math.abs(state.divergence));
      const isShortfall = state.divergence > 0; // físico > saldo → reforçar existências (D 131).
      const today = parseAccountingDate(formatAccountingDate(new Date()));
      const description = `Regularização de existências — stock físico ao custo médio vs. conta ${accounts.inventory.code}${notes ? ` — ${notes}` : ''}`;
      const detail = isShortfall
        ? { debitId: accounts.inventory.id, creditId: accounts.equity.id }
        : { debitId: accounts.equity.id, creditId: accounts.inventory.id };

      const entry = await postAccountingEventTx(tx, ctx, {
        journalType: 'OPENING',
        entryDate: today,
        dateLabel: 'A data da regularização',
        description,
        reference: `Físico ${formatMZN(state.physicalValue)} / Saldo ${formatMZN(state.inventoryBalance)}`,
        origin: { sourceType: 'INVENTORY_REGULARIZATION', sourceId: options.idempotencyKey, accountingEvent: 'INVENTORY_REGULARIZED' },
        lines: [
          { ledgerAccountId: detail.debitId, debit: amount, description },
          { ledgerAccountId: detail.creditId, credit: amount, description },
        ],
      });

      await writeAudit(tx, ctx, {
        action: 'accounting.inventory_regularization',
        entity: 'JournalEntry',
        entityId: entry.id,
        newValues: {
          entryNumber: entry.entryNumber,
          divergence: state.divergence,
          physicalValue: state.physicalValue,
          inventoryBalance: state.inventoryBalance,
          products: state.items.length,
          direction: isShortfall ? 'DEBIT_INVENTORY' : 'CREDIT_INVENTORY',
          notes,
        },
      });

      return {
        resourceType: 'JournalEntry',
        resourceId: entry.id,
        result: { entryId: entry.id, entryNumber: entry.entryNumber, divergence: state.divergence },
      };
    };

    const op = await runIdempotentOperation<InventoryRegularizationResult>(tx, ctx, {
      scope: 'INVENTORY_REGULARIZATION',
      idempotencyKey: options.idempotencyKey,
      requestFingerprint,
      expectedResourceType: 'JournalEntry',
      loadExisting,
      run,
    });
    return op.result;
  });
}
