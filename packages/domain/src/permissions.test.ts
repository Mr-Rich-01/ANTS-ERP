import { describe, expect, it } from 'vitest';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { hasPermission, requirePermission } from './permissions';
import { ForbiddenError } from './errors';

function ctx(partial: Partial<RequestContext> = {}): RequestContext {
  return {
    companyId: 'c1',
    userId: 'u1',
    permissions: new Set(['sales.view']),
    isPlatformAdmin: false,
    ...partial,
  };
}

describe('requirePermission', () => {
  it('permite quando a permissão existe', () => {
    expect(() => requirePermission(ctx(), 'sales.view')).not.toThrow();
  });

  it('rejeita quando falta a permissão', () => {
    expect(() => requirePermission(ctx(), 'sales.create')).toThrow(ForbiddenError);
  });

  it('Super Admin da plataforma passa sempre', () => {
    expect(() => requirePermission(ctx({ isPlatformAdmin: true, permissions: new Set() }), 'accounting.post')).not.toThrow();
  });
});

describe('hasPermission', () => {
  it('reflecte o conjunto de permissões', () => {
    expect(hasPermission(ctx(), 'sales.view')).toBe(true);
    expect(hasPermission(ctx(), 'sales.delete')).toBe(false);
  });
});

describe('requireCompany', () => {
  it('devolve o companyId quando existe', () => {
    expect(requireCompany(ctx())).toBe('c1');
  });

  it('rejeita sem empresa activa', () => {
    expect(() => requireCompany(ctx({ companyId: null }))).toThrow();
  });
});
