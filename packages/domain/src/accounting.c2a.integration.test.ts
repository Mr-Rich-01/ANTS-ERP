/**
 * Suite de INTEGRAÇÃO da Fase 8c.2a — fundação de idempotência operacional.
 * Correr com: `pnpm test:integration:accounting:c2a` (exige DATABASE_URL).
 * Usa um recurso sintético (`Customer`) para exercitar o helper genérico, sem
 * tocar em facturas/recibos (que ficam para a 8c.2b). Isolada com teardown.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ConflictError, ValidationError } from './errors';
import { runIdempotentOperation, canonicalRequestFingerprint, fpAmount, fpDate, FINGERPRINT_VERSION, type OperationScope } from './operation-idempotency';

const CA = 'smoke-c2a';
const CB = 'smoke-c2a-b';
const ctx = (companyId: string): RequestContext => ({ companyId, userId: 'smoke-user', permissions: new Set(), isPlatformAdmin: false });
const fp = (payload: unknown) => canonicalRequestFingerprint(FINGERPRINT_VERSION, payload);

async function teardown(companyId: string) {
  await prisma.operationIdempotency.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

beforeAll(async () => {
  await teardown(CA); await teardown(CB);
  await prisma.company.create({ data: { id: CA, legalName: 'Smoke C2a' } });
  await prisma.company.create({ data: { id: CB, legalName: 'Smoke C2a B' } });
});
afterAll(async () => { await teardown(CA); await teardown(CB); await prisma.$disconnect(); });

/** Operação sintética: cria um Customer como "recurso". */
function runCreateCustomer(companyId: string, key: string, fingerprint: string, opts: { scope?: OperationScope; name?: string; failAfterCreate?: boolean; failBeforeCreate?: boolean } = {}) {
  return prisma.$transaction((tx) =>
    runIdempotentOperation<{ id: string; name: string }>(tx, ctx(companyId), {
      scope: opts.scope ?? 'INVOICE_CREATE',
      idempotencyKey: key,
      requestFingerprint: fingerprint,
      loadExisting: async (rid) => {
        const c = await tx.customer.findFirst({ where: { companyId, id: rid }, select: { id: true, name: true } });
        return c;
      },
      run: async () => {
        if (opts.failBeforeCreate) throw new Error('falha antes da criação');
        const c = await tx.customer.create({ data: { companyId, name: opts.name ?? 'Recurso' } });
        if (opts.failAfterCreate) throw new Error('falha depois da criação');
        return { resourceType: 'Customer', resourceId: c.id, result: { id: c.id, name: c.name } };
      },
    }),
  );
}

describe('Fase 8c.2a — idempotência operacional (integração)', () => {
  it('#1 criação de registo concluído', async () => {
    const key = randomUUID();
    const r = await runCreateCustomer(CA, key, fp({ a: 1 }), { name: 'C1' });
    expect(r.idempotent).toBe(false);
    const rec = await prisma.operationIdempotency.findFirst({ where: { companyId: CA, scope: 'INVOICE_CREATE', idempotencyKey: key } });
    expect(rec?.resourceId).toBe(r.result.id);
    expect(rec?.completedAt).toBeTruthy();
  });

  it('#2 mesma chave + mesmo fingerprint → mesmo recurso (replay)', async () => {
    const key = randomUUID();
    const f = fp({ a: 2 });
    const r1 = await runCreateCustomer(CA, key, f, { name: 'C2' });
    const r2 = await runCreateCustomer(CA, key, f, { name: 'OUTRO' });
    expect(r1.idempotent).toBe(false);
    expect(r2.idempotent).toBe(true);
    expect(r2.result.id).toBe(r1.result.id);
    expect(await prisma.customer.count({ where: { companyId: CA, id: r1.result.id } })).toBe(1);
  });

  it('#3 mesma chave + payload diferente → conflito', async () => {
    const key = randomUUID();
    await runCreateCustomer(CA, key, fp({ a: 3 }));
    await expect(runCreateCustomer(CA, key, fp({ a: 999 }))).rejects.toBeInstanceOf(ConflictError);
  });

  it('#4 scopes diferentes podem usar a mesma chave', async () => {
    const key = randomUUID();
    const f = fp({ a: 4 });
    const r1 = await runCreateCustomer(CA, key, f, { scope: 'INVOICE_CREATE' });
    const r2 = await runCreateCustomer(CA, key, f, { scope: 'CUSTOMER_PAYMENT_CREATE' });
    expect(r1.result.id).not.toBe(r2.result.id);
    expect(await prisma.operationIdempotency.count({ where: { companyId: CA, idempotencyKey: key } })).toBe(2);
  });

  it('#5 empresas diferentes podem usar a mesma chave', async () => {
    const key = randomUUID();
    const f = fp({ a: 5 });
    const ra = await runCreateCustomer(CA, key, f);
    const rb = await runCreateCustomer(CB, key, f);
    expect(ra.idempotent).toBe(false);
    expect(rb.idempotent).toBe(false);
    expect(ra.result.id).not.toBe(rb.result.id);
  });

  it('#6 duas chamadas concorrentes criam uma única operação', async () => {
    const key = randomUUID();
    const f = fp({ a: 6 });
    const [r1, r2] = await Promise.all([runCreateCustomer(CA, key, f), runCreateCustomer(CA, key, f)]);
    expect([r1.idempotent, r2.idempotent].filter(Boolean).length).toBe(1);
    expect(r1.result.id).toBe(r2.result.id);
    expect(await prisma.operationIdempotency.count({ where: { companyId: CA, scope: 'INVOICE_CREATE', idempotencyKey: key } })).toBe(1);
    expect(await prisma.customer.count({ where: { companyId: CA, id: r1.result.id } })).toBe(1);
  });

  it('#7 falha dentro de run() não deixa registo de idempotência', async () => {
    const key = randomUUID();
    await expect(runCreateCustomer(CA, key, fp({ a: 7 }), { failBeforeCreate: true })).rejects.toThrow();
    expect(await prisma.operationIdempotency.count({ where: { companyId: CA, idempotencyKey: key } })).toBe(0);
  });

  it('#8 falha depois da criação do recurso faz rollback do recurso', async () => {
    const key = randomUUID();
    await expect(runCreateCustomer(CA, key, fp({ a: 8 }), { name: 'ROLLBACK', failAfterCreate: true })).rejects.toThrow();
    expect(await prisma.customer.count({ where: { companyId: CA, name: 'ROLLBACK' } })).toBe(0);
    expect(await prisma.operationIdempotency.count({ where: { companyId: CA, idempotencyKey: key } })).toBe(0);
  });

  it('#9 registo que aponta para recurso inexistente → erro de integridade', async () => {
    const key = randomUUID();
    const f = fp({ a: 9 });
    await prisma.operationIdempotency.create({ data: { companyId: CA, scope: 'INVOICE_CREATE', idempotencyKey: key, requestFingerprint: f, resourceType: 'Customer', resourceId: 'ghost-inexistente', completedAt: new Date() } });
    await expect(runCreateCustomer(CA, key, f)).rejects.toBeInstanceOf(ConflictError);
  });

  it('#10 recurso de outra empresa é rejeitado', async () => {
    const key = randomUUID();
    const f = fp({ a: 10 });
    const custB = await prisma.customer.create({ data: { companyId: CB, name: 'Cliente B' } });
    await prisma.operationIdempotency.create({ data: { companyId: CA, scope: 'INVOICE_CREATE', idempotencyKey: key, requestFingerprint: f, resourceType: 'Customer', resourceId: custB.id, completedAt: new Date() } });
    await expect(runCreateCustomer(CA, key, f)).rejects.toBeInstanceOf(ConflictError);
  });

  it('#11 linhas em ordem diferente produzem o mesmo fingerprint', () => {
    const a = { lines: [{ p: 'x', q: 1 }, { p: 'y', q: 2 }] };
    const b = { lines: [{ p: 'y', q: 2 }, { p: 'x', q: 1 }] };
    expect(fp(a)).toBe(fp(b));
  });

  it('#12 linha economicamente diferente produz fingerprint diferente', () => {
    const a = { lines: [{ p: 'x', q: 1, disc: 0 }, { p: 'x', q: 1, disc: 10 }] };
    const b = { lines: [{ p: 'x', q: 1, disc: 0 }, { p: 'x', q: 1, disc: 20 }] };
    expect(fp(a)).not.toBe(fp(b));
  });

  it('#13 normalização de decimais é determinística', () => {
    expect(fpAmount(100)).toBe('100.00');
    expect(fpAmount(99.999)).toBe('100.00');
    expect(fpAmount(0.1 + 0.2)).toBe('0.30');
  });

  it('#14 normalização de datas é determinística (YYYY-MM-DD, UTC)', () => {
    expect(fpDate('2026-03-10')).toBe('2026-03-10');
    expect(fpDate(new Date('2026-03-10T23:30:00.000Z'))).toBe('2026-03-10');
    expect(fpDate(null)).toBeNull();
  });

  it('#15 chave inválida (não-UUID) é rejeitada', async () => {
    await expect(runCreateCustomer(CA, 'chave-invalida', fp({ a: 15 }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('#16 fingerprint tem prefixo v1:', () => {
    expect(fp({ a: 16 }).startsWith('v1:')).toBe(true);
  });

  it('#17 scoping impede leitura cross-company', async () => {
    const key = randomUUID();
    await runCreateCustomer(CA, key, fp({ a: 17 }));
    expect(await prisma.operationIdempotency.findFirst({ where: { companyId: CB, idempotencyKey: key } })).toBeNull();
    expect(await prisma.operationIdempotency.findFirst({ where: { companyId: CA, idempotencyKey: key } })).toBeTruthy();
  });

  it('#18 teardown deixa zero registos e recursos residuais', async () => {
    await teardown(CA);
    expect(await prisma.operationIdempotency.count({ where: { companyId: CA } })).toBe(0);
    expect(await prisma.customer.count({ where: { companyId: CA } })).toBe(0);
    // repõe a empresa para o afterAll global não falhar
    await prisma.company.create({ data: { id: CA, legalName: 'Smoke C2a' } });
  });
});
