import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@ants/database';
import type { RequestContext } from './context';
import {
  listAccounts,
  treasuryKpis,
  listMovements,
  dailyReport,
  createAccount,
  setAccountStatus,
  recordMovement,
  transfer,
  reverseMovement,
} from './treasury';
import { ForbiddenError } from './errors';

// O `db` nunca é tocado: requirePermission lança antes de qualquer acesso à BD.
const db = {} as PrismaClient;

function ctx(permissions: string[]): RequestContext {
  return { companyId: 'company-a', userId: 'u1', permissions: new Set(permissions), isPlatformAdmin: false };
}

describe('Tesouraria — permissões por função (gate no servidor)', () => {
  it('leituras exigem treasury.view', async () => {
    await expect(listAccounts(db, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(treasuryKpis(db, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listMovements(db, ctx([]))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('relatório diário exige treasury.viewReports', async () => {
    await expect(dailyReport(db, ctx(['treasury.view']), 'acc1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('movimento manual exige treasury.createMovement', async () => {
    await expect(recordMovement(db, ctx(['treasury.view']), { accountId: 'a', flow: 'OUT', amount: 10 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('transferência exige treasury.transfer', async () => {
    await expect(transfer(db, ctx(['treasury.createMovement']), { fromAccountId: 'a', toAccountId: 'b', amount: 10 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('gestão de contas exige treasury.manageAccounts', async () => {
    await expect(createAccount(db, ctx(['treasury.view']), { name: 'X', type: 'BANK' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setAccountStatus(db, ctx(['treasury.view']), 'acc1', 'INACTIVE')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('estorno exige treasury.reverseMovement', async () => {
    await expect(reverseMovement(db, ctx(['treasury.createMovement']), 'mov1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('quem tem a permissão passa o gate (falha depois, já a tocar a BD)', async () => {
    // Com a permissão certa, o erro deixa de ser ForbiddenError (passa o gate).
    await expect(listAccounts(db, ctx(['treasury.view']))).rejects.not.toBeInstanceOf(ForbiddenError);
  });
});
