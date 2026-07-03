import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import { civilDateInTimeZone } from '@ants/shared';
import type { RequestContext } from './context';
import { reverseMovement, reverseTreasuryTransfer, transfer } from './treasury';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

const CA = 'smoke-treasury-transfer-reversal';
const CB = 'smoke-treasury-transfer-reversal-b';
const CURRENT_DATE = civilDateInTimeZone();
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return { companyId, userId: `${companyId}-user`, permissions: new Set(permissions), isPlatformAdmin: false };
}

const op = ctx(CA, ['treasury.transfer', 'treasury.reverseTransfer']);
const noReverse = ctx(CA, ['treasury.transfer']);
const movementReverse = ctx(CA, ['treasury.reverseMovement']);

let ids!: {
  fy: string;
  period: string;
  source: string;
  destination: string;
  destinationStrict: string;
  sourceB: string;
  destinationB: string;
};

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.treasuryMovement.updateMany({ where: { companyId }, data: { reversesId: null } });
  await prisma.treasuryMovement.deleteMany({ where: { companyId } });
  await prisma.treasuryAccount.updateMany({ where: { companyId }, data: { ledgerAccountId: null } });
  await prisma.treasuryAccount.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.fiscalYear.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function provision() {
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke Treasury Transfer Reversal' } });
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke Treasury Transfer Reversal B' } });
  const year = CURRENT_DATE.slice(0, 4);
  const fy = await prisma.fiscalYear.create({ data: { companyId: CA, name: year, startDate: D(`${year}-01-01`), endDate: D(`${year}-12-31`), status: 'OPEN', isCurrent: true } });
  const period = await prisma.accountingPeriod.create({ data: { companyId: CA, fiscalYearId: fy.id, periodNumber: 1, code: year, name: year, startDate: D(`${year}-01-01`), endDate: D(`${year}-12-31`), status: 'OPEN' } });
  const source = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Origem', type: 'CASH', openingBalance: 1000, balance: 1000, allowNegative: false } });
  const destination = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Destino', type: 'BANK', openingBalance: 200, balance: 200, allowNegative: true } });
  const destinationStrict = await prisma.treasuryAccount.create({ data: { companyId: CA, name: 'Destino Estrito', type: 'CASH', openingBalance: 0, balance: 0, allowNegative: false } });
  const sourceB = await prisma.treasuryAccount.create({ data: { companyId: CB, name: 'Origem B', type: 'CASH', openingBalance: 100, balance: 100, allowNegative: false } });
  const destinationB = await prisma.treasuryAccount.create({ data: { companyId: CB, name: 'Destino B', type: 'BANK', openingBalance: 0, balance: 0, allowNegative: true } });
  ids = { fy: fy.id, period: period.id, source: source.id, destination: destination.id, destinationStrict: destinationStrict.id, sourceB: sourceB.id, destinationB: destinationB.id };
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await provision();
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.$disconnect();
});

async function makeTransfer(overrides: { toAccountId?: string; amount?: number } = {}) {
  return transfer(prisma, op, {
    fromAccountId: ids.source,
    toAccountId: overrides.toAccountId ?? ids.destination,
    amount: overrides.amount ?? 50,
    description: 'Transferencia para teste',
  });
}

async function reverse(transferId: string, overrides: Partial<{ idempotencyKey: string; reversalReason: string; reversalDate: string }> = {}) {
  return reverseTreasuryTransfer(prisma, op, {
    transferId,
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    reversalReason: overrides.reversalReason ?? 'Motivo valido para estorno',
    reversalDate: overrides.reversalDate ?? CURRENT_DATE,
  });
}

describe('P0-03e - estorno atomico de transferencia de tesouraria', () => {
  it('estorna as duas pernas, cria dois compensatorios, restaura saldos e audita uma vez', async () => {
    const sourceBefore = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.source } });
    const destinationBefore = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.destination } });
    const created = await makeTransfer({ amount: 75 });
    const [out, inn] = await Promise.all([
      prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, transferId: created.transferId, flow: 'OUT', source: 'TRANSFER' } }),
      prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, transferId: created.transferId, flow: 'IN', source: 'TRANSFER' } }),
    ]);

    const result = await reverse(created.transferId, { reversalReason: '  Motivo valido para estorno integral  ' });
    const [sourceAfter, destinationAfter, outAfter, inAfter, reversalIn, reversalOut, audit, entries] = await Promise.all([
      prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.source } }),
      prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.destination } }),
      prisma.treasuryMovement.findUniqueOrThrow({ where: { id: out.id } }),
      prisma.treasuryMovement.findUniqueOrThrow({ where: { id: inn.id } }),
      prisma.treasuryMovement.findUniqueOrThrow({ where: { id: result.reversalInMovementId } }),
      prisma.treasuryMovement.findUniqueOrThrow({ where: { id: result.reversalOutMovementId } }),
      prisma.auditLog.findFirstOrThrow({ where: { companyId: CA, action: 'treasury.transfer.reverse', entityId: created.transferId } }),
      prisma.journalEntry.count({ where: { companyId: CA, sourceType: 'TREASURY_TRANSFER', sourceId: created.transferId } }),
    ]);

    expect(Number(sourceAfter.balance)).toBe(Number(sourceBefore.balance));
    expect(Number(destinationAfter.balance)).toBe(Number(destinationBefore.balance));
    expect(outAfter.status).toBe('REVERSED');
    expect(inAfter.status).toBe('REVERSED');
    expect(outAfter.reversalReason).toBe('Motivo valido para estorno integral');
    expect(inAfter.reversalReason).toBe('Motivo valido para estorno integral');
    expect(reversalIn.flow).toBe('IN');
    expect(reversalIn.accountId).toBe(ids.source);
    expect(reversalIn.reversesId).toBe(out.id);
    expect(reversalIn.transferId).toBe(created.transferId);
    expect(reversalOut.flow).toBe('OUT');
    expect(reversalOut.accountId).toBe(ids.destination);
    expect(reversalOut.reversesId).toBe(inn.id);
    expect(reversalOut.transferId).toBe(created.transferId);
    expect((audit.newValues as { sourceBalanceBefore?: number; destinationBalanceAfter?: number } | null)?.sourceBalanceBefore).toBe(Number(sourceBefore.balance) - 75);
    expect(entries).toBe(0);
  });

  it('replay idempotente, conflito de fingerprint e concorrencia nao duplicam efeitos', async () => {
    const created = await makeTransfer({ amount: 20 });
    const key = randomUUID();
    const input = { transferId: created.transferId, idempotencyKey: key, reversalReason: 'Motivo valido concorrente', reversalDate: CURRENT_DATE };
    const [a, b] = await Promise.all([reverseTreasuryTransfer(prisma, op, input), reverseTreasuryTransfer(prisma, op, input)]);
    expect(a.reversalInMovementId).toBe(b.reversalInMovementId);
    expect(a.reversalOutMovementId).toBe(b.reversalOutMovementId);
    const originals = await prisma.treasuryMovement.findMany({ where: { companyId: CA, transferId: created.transferId, source: 'TRANSFER' } });
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, reversesId: { in: originals.map((m) => m.id) } } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'treasury.transfer.reverse', entityId: created.transferId } })).toBe(1);
    await expect(reverseTreasuryTransfer(prisma, op, { ...input, reversalReason: 'Motivo valido diferente' })).rejects.toBeInstanceOf(ConflictError);
    await expect(reverse(created.transferId)).rejects.toThrow('Esta transferência já foi estornada.');
  });

  it('bloqueia pernas inconsistentes e preserva rollback', async () => {
    const missing = await makeTransfer({ amount: 15 });
    const missingLeg = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, transferId: missing.transferId, flow: 'IN' } });
    await prisma.treasuryMovement.delete({ where: { id: missingLeg.id } });
    await expect(reverse(missing.transferId)).rejects.toThrow('duas pernas originais');

    const three = await makeTransfer({ amount: 15 });
    await prisma.treasuryMovement.create({
      data: { companyId: CA, accountId: ids.destination, flow: 'IN', amount: 15, balanceAfter: 0, category: 'Transferência', source: 'TRANSFER', counterpartAccountId: ids.source, transferId: three.transferId, createdBy: op.userId },
    });
    await expect(reverse(three.transferId)).rejects.toThrow('duas pernas originais');

    const mismatch = await makeTransfer({ amount: 15 });
    const inLeg = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, transferId: mismatch.transferId, flow: 'IN' } });
    await prisma.treasuryMovement.update({ where: { id: inLeg.id }, data: { amount: 16 } });
    await expect(reverse(mismatch.transferId)).rejects.toThrow('duas pernas originais');
    expect(await prisma.auditLog.count({ where: { companyId: CA, action: 'treasury.transfer.reverse', entityId: mismatch.transferId } })).toBe(0);
  });

  it('bloqueia saldo insuficiente no destino e permite allowNegative=true', async () => {
    const strict = await transfer(prisma, op, { fromAccountId: ids.source, toAccountId: ids.destinationStrict, amount: 40 });
    await prisma.treasuryAccount.update({ where: { id: ids.destinationStrict }, data: { balance: 10 } });
    const sourceBefore = await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.source } });
    await expect(reverse(strict.transferId)).rejects.toThrow('Saldo insuficiente');
    expect(Number((await prisma.treasuryAccount.findUniqueOrThrow({ where: { id: ids.source } })).balance)).toBe(Number(sourceBefore.balance));
    expect(await prisma.treasuryMovement.count({ where: { companyId: CA, transferId: strict.transferId, source: 'REVERSAL' } })).toBe(0);

    const flexible = await makeTransfer({ amount: 30 });
    await prisma.treasuryAccount.update({ where: { id: ids.destination }, data: { balance: 0 } });
    await expect(reverse(flexible.transferId)).resolves.toBeTruthy();
  });

  it('valida permissao, motivo, data, periodo, exercicio e isolamento multiempresa', async () => {
    const created = await makeTransfer({ amount: 10 });
    await expect(reverseTreasuryTransfer(prisma, noReverse, { transferId: created.transferId, idempotencyKey: randomUUID(), reversalReason: 'Motivo valido', reversalDate: CURRENT_DATE })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reverse(created.transferId, { reversalReason: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverse(created.transferId, { reversalReason: 'curto' })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverse(created.transferId, { reversalReason: 'x'.repeat(501) })).rejects.toBeInstanceOf(ValidationError);
    await expect(reverse(created.transferId, { reversalDate: '2026-02-30' })).rejects.toBeInstanceOf(ValidationError);
    const otherDate = CURRENT_DATE === '2026-01-01' ? '2026-01-02' : '2026-01-01';
    await expect(reverse(created.transferId, { reversalDate: otherDate })).rejects.toThrow('Africa/Maputo');

    const b = await transfer(prisma, ctx(CB, ['treasury.transfer']), { fromAccountId: ids.sourceB, toAccountId: ids.destinationB, amount: 1 });
    await expect(reverse(b.transferId)).rejects.toBeInstanceOf(NotFoundError);

    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'CLOSED' } });
    await expect(reverse(created.transferId)).rejects.toBeInstanceOf(ConflictError);
    expect((await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, transferId: created.transferId, flow: 'OUT' } })).status).toBe('ACTIVE');
    await prisma.accountingPeriod.update({ where: { id: ids.period }, data: { status: 'OPEN' } });

    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'CLOSED' } });
    await expect(reverse(created.transferId)).rejects.toBeInstanceOf(ConflictError);
    await prisma.fiscalYear.update({ where: { id: ids.fy }, data: { status: 'OPEN' } });
  });

  it('mantem criacao normal de transferencia e bloqueio P0-02 de estorno isolado', async () => {
    const created = await makeTransfer({ amount: 12 });
    const movement = await prisma.treasuryMovement.findFirstOrThrow({ where: { companyId: CA, transferId: created.transferId, flow: 'OUT' } });
    await expect(reverseMovement(prisma, movementReverse, movement.id, 'tentativa directa')).rejects.toThrow('transferência entre contas');
    expect((await prisma.treasuryMovement.findUniqueOrThrow({ where: { id: movement.id } })).status).toBe('ACTIVE');
  });
});
