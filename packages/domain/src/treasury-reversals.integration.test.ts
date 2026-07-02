/**
 * Hardening P0-02: estornos de Tesouraria derivados de documentos operacionais.
 * Correr com: `pnpm test:integration:accounting` (exige DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ConflictError, NotFoundError } from './errors';
import { getTreasuryMovementReversalBlockReason, listMovements, recordMovement, reverseMovement, transfer } from './treasury';

const CA = 'smoke-treasury-reversal';
const CB = 'smoke-treasury-reversal-b';

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const movementCtx = ctx(CA, ['treasury.createMovement']);
const reverseCtx = ctx(CA, ['treasury.reverseMovement']);
const transferCtx = ctx(CA, ['treasury.transfer']);
const viewCtx = ctx(CA, ['treasury.view']);

let cashA!: string;
let bankA!: string;
let cashB!: string;

async function teardown(companyId: string) {
  await prisma.treasuryMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.treasuryAccount.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Treasury Reversal' } });
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Treasury Reversal B' } });
  const a = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Caixa', type: 'CASH', openingBalance: 100, balance: 100 } });
  const b = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Banco', type: 'BANK', openingBalance: 50, balance: 50, allowNegative: true } });
  const other = await prisma.treasuryAccount.create({ data: { companyId: CB, name: 'Caixa B', type: 'CASH', openingBalance: 75, balance: 75 } });
  cashA = a.id;
  bankA = b.id;
  cashB = other.id;
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.$disconnect();
});

describe('Tesouraria P0-02 - bloqueio de estornos operacionais', () => {
  it('movimento manual continua reversivel, actualiza saldo uma vez e nao duplica estorno', async () => {
    const before = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: cashA } });
    await recordMovement(prisma, movementCtx, { accountId: cashA, flow: 'OUT', amount: 10, category: 'Despesa', description: 'Manual seguro' });
    const original = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, accountId: cashA, source: 'MANUAL', category: 'Despesa' }, orderBy: { createdAt: 'desc' } });

    const first = await reverseMovement(prisma, reverseCtx, original.id);
    await expect(reverseMovement(prisma, reverseCtx, original.id)).rejects.toBeInstanceOf(ConflictError);

    const [accountAfter, originalAfter, reversal, auditCount] = await Promise.all([
      prisma.treasuryAccount.findUniqueOrThrow({ where: { id: cashA } }),
      prisma.treasuryMovement.findUniqueOrThrow({ where: { id: original.id } }),
      prisma.treasuryMovement.findUniqueOrThrow({ where: { id: first.reversalId } }),
      prisma.auditLog.count({ where: { companyId: CA, action: 'treasury.reverse', entityId: original.id } }),
    ]);
    expect(Number(accountAfter.balance)).toBe(Number(before.balance));
    expect(originalAfter.status).toBe('REVERSED');
    expect(reversal.reversesId).toBe(original.id);
    expect(reversal.source).toBe('REVERSAL');
    expect(auditCount).toBe(1);
  });

  it('transferencia nao pode ser estornada de apenas um lado', async () => {
    const before = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: cashA } });
    const t = await transfer(prisma, transferCtx, { fromAccountId: cashA, toAccountId: bankA, amount: 5 });
    const movement = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, transferId: t.transferId, accountId: cashA } });
    const accountAfterTransfer = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: cashA } });

    await expect(reverseMovement(prisma, reverseCtx, movement.id)).rejects.toThrow('transfer');

    const [accountAfter, originalAfter] = await Promise.all([
      prisma.treasuryAccount.findUniqueOrThrow({ where: { id: cashA } }),
      prisma.treasuryMovement.findUniqueOrThrow({ where: { id: movement.id } }),
    ]);
    expect(Number(accountAfter.balance)).toBe(Number(accountAfterTransfer.balance));
    expect(Number(accountAfter.balance)).toBe(Number(before.balance) - 5);
    expect(originalAfter.status).toBe('ACTIVE');
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, reversesId: movement.id } })).toBe(0);
  });

  it('origem legada ambigua com finalidade operacional e bloqueada', async () => {
    const accountBefore = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: cashA } });
    const movement = await prisma.treasuryMovement.create({
      data: {
        companyId: CA,
        accountId: cashA,
        flow: 'IN',
        amount: 7,
        balanceAfter: Number(accountBefore.balance) + 7,
        category: 'Recibo legado',
        source: 'MANUAL',
        movementPurpose: 'RECEIPT_IN',
        createdBy: reverseCtx.userId,
      },
    });

    await expect(reverseMovement(prisma, reverseCtx, movement.id)).rejects.toThrow('recebimento de cliente');
    expect((await prisma.treasuryMovement.findUniqueOrThrow({ where: { id: movement.id } })).status).toBe('ACTIVE');
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, reversesId: movement.id } })).toBe(0);
  });

  it('isolamento por empresa impede consultar ou estornar movimento de outra empresa', async () => {
    const movementB = await prisma.treasuryMovement.create({
      data: {
        companyId: CB,
        accountId: cashB,
        flow: 'IN',
        amount: 12,
        balanceAfter: 87,
        category: 'Movimento B',
        source: 'MANUAL',
        createdBy: `${CB}-user`,
      },
    });
    await expect(reverseMovement(prisma, reverseCtx, movementB.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: cashB } })).balance.toString()).toBe('75');
  });

  it('classificacao usada pela UI distingue operacional, transferencia e manual', async () => {
    expect(getTreasuryMovementReversalBlockReason({ source: 'RECEIPT', sourceType: 'RECEIPT', sourceId: 'p1', movementPurpose: 'RECEIPT_IN', transferId: null })).toContain('recebimento de cliente');
    expect(getTreasuryMovementReversalBlockReason({ source: 'SUPPLIER_PAYMENT', sourceType: 'SUPPLIER_PAYMENT', sourceId: 'sp1', movementPurpose: 'SUPPLIER_PAYMENT_OUT', transferId: null })).toContain('pagamento a fornecedor');
    expect(getTreasuryMovementReversalBlockReason({ source: 'TRANSFER', sourceType: null, sourceId: null, movementPurpose: null, transferId: 'trf1' })).toContain('transfer');
    expect(getTreasuryMovementReversalBlockReason({ source: 'MANUAL', sourceType: null, sourceId: null, movementPurpose: null, transferId: null })).toBeNull();

    const views = await listMovements(prisma, viewCtx, { limit: 20 });
    expect(views.some((m) => m.source === 'TRANSFER' && m.reversalBlockedReason?.includes('transfer'))).toBe(true);
    expect(views.some((m) => m.source === 'MANUAL' && !m.reversalBlockedReason)).toBe(true);
  });
});
