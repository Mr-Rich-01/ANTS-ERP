import { describe, expect, it } from 'vitest';
import { scopeArgs } from './tenant-scope';

const C = 'company-a';

describe('scopeArgs — isolamento multiempresa', () => {
  it('injecta companyId no where de findMany (modelo empresarial)', () => {
    const out = scopeArgs('User', 'findMany', { where: { status: 'ACTIVE' } }, C);
    expect(out).toEqual({ where: { status: 'ACTIVE', companyId: C } });
  });

  it('injecta companyId mesmo sem where', () => {
    const out = scopeArgs('Role', 'findMany', undefined, C);
    expect(out).toEqual({ where: { companyId: C } });
  });

  it('injecta companyId no where de findUnique/update/delete', () => {
    expect(scopeArgs('User', 'findUnique', { where: { id: '1' } }, C)).toEqual({ where: { id: '1', companyId: C } });
    expect(scopeArgs('User', 'update', { where: { id: '1' }, data: { name: 'x' } }, C)).toEqual({
      where: { id: '1', companyId: C },
      data: { name: 'x' },
    });
    expect(scopeArgs('User', 'delete', { where: { id: '1' } }, C)).toEqual({ where: { id: '1', companyId: C } });
  });

  it('atribui companyId no data de create', () => {
    const out = scopeArgs('User', 'create', { data: { email: 'a@b.c' } }, C);
    expect(out).toEqual({ data: { email: 'a@b.c', companyId: C } });
  });

  it('atribui companyId a cada linha de createMany', () => {
    const out = scopeArgs('Branch', 'createMany', { data: [{ code: 'MAP' }, { code: 'MAT' }] }, C);
    expect(out).toEqual({ data: [{ code: 'MAP', companyId: C }, { code: 'MAT', companyId: C }] });
  });

  it('upsert: filtra where e atribui no create', () => {
    const out = scopeArgs('Role', 'upsert', { where: { id: '1' }, create: { name: 'Gestor' }, update: {} }, C);
    expect(out).toEqual({ where: { id: '1', companyId: C }, create: { name: 'Gestor', companyId: C }, update: {} });
  });

  it('Customer está no âmbito: injecta companyId no where e no data', () => {
    expect(scopeArgs('Customer', 'findMany', { where: { status: 'ACTIVE' } }, C)).toEqual({
      where: { status: 'ACTIVE', companyId: C },
    });
    expect(scopeArgs('Customer', 'create', { data: { name: 'Cliente X' } }, C)).toEqual({
      data: { name: 'Cliente X', companyId: C },
    });
  });

  it('NÃO altera modelos fora do âmbito (ex.: Permission)', () => {
    const args = { where: { key: 'sales.view' } };
    expect(scopeArgs('Permission', 'findMany', args, C)).toBe(args);
  });

  it('não deixa uma empresa filtrar pela outra (where da empresa prevalece)', () => {
    // Mesmo que o chamador tente forçar outra empresa, o scope reescreve para a activa.
    const out = scopeArgs('User', 'findMany', { where: { companyId: 'company-b' } }, C);
    expect((out as { where: { companyId: string } }).where.companyId).toBe(C);
  });
});
