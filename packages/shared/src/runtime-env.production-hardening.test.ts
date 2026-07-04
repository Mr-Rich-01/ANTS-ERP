import { describe, expect, it } from 'vitest';
import { validateProductionRuntimeEnv } from './runtime-env';

const strongSecret = '0123456789abcdefghijklmnopqrstuvwxyzABCDEF';

function validWebEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    APP_URL: 'https://erp.ants.co.mz',
    AUTH_URL: 'https://erp.ants.co.mz',
    AUTH_SECRET: strongSecret,
    DATABASE_URL: 'postgresql://ants:strong_password@postgres:5432/ants_erp?schema=public',
    REDIS_URL: 'redis://redis:6379',
    ...overrides,
  };
}

describe('production runtime env validation', () => {
  it('aceita env web de producao com URLs publicas e segredo forte', () => {
    const result = validateProductionRuntimeEnv(validWebEnv(), { service: 'web' });

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejeita AUTH_SECRET fraco em producao sem expor o valor', () => {
    const result = validateProductionRuntimeEnv(validWebEnv({ AUTH_SECRET: 'secret' }), { service: 'web' });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('AUTH_SECRET');
    expect(result.errors.join('\n')).not.toContain('secret\n');
  });

  it('rejeita placeholders em producao', () => {
    const result = validateProductionRuntimeEnv(validWebEnv({ AUTH_SECRET: 'replace_with_strong_secret_value_123' }), { service: 'web' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('AUTH_SECRET contains a placeholder and must be replaced.');
  });

  it('exige URLs obrigatorias para a web em producao', () => {
    const result = validateProductionRuntimeEnv(validWebEnv({ APP_URL: undefined, AUTH_URL: 'notaurl' }), { service: 'web' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('APP_URL is required in production.');
    expect(result.errors).toContain('AUTH_URL must be a valid http(s) URL.');
  });

  it('bloqueia localhost em producao real', () => {
    const result = validateProductionRuntimeEnv(validWebEnv({ APP_URL: 'http://localhost:3001', AUTH_URL: 'http://localhost:3001' }), { service: 'web' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('APP_URL must use HTTPS in production.');
    expect(result.errors).toContain('APP_URL must not point to localhost in production.');
  });

  it('bloqueia DATABASE_URL e REDIS_URL localhost em producao real', () => {
    const result = validateProductionRuntimeEnv(
      validWebEnv({ DATABASE_URL: 'postgresql://ants:pass@localhost:5432/ants_erp', REDIS_URL: 'redis://127.0.0.1:6379' }),
      { service: 'web' },
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('DATABASE_URL must not point to localhost in production.');
    expect(result.errors).toContain('REDIS_URL must not point to localhost in production.');
  });

  it('permite localhost apenas quando staging local autoriza explicitamente', () => {
    const result = validateProductionRuntimeEnv(
      validWebEnv({ APP_URL: 'http://localhost:3001', AUTH_URL: 'http://localhost:3001' }),
      { service: 'web', allowLocalhostUrls: true },
    );

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('exige REDIS_URL para worker em producao', () => {
    const result = validateProductionRuntimeEnv({ NODE_ENV: 'production', DATABASE_URL: validWebEnv().DATABASE_URL }, { service: 'worker' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('REDIS_URL is required in production.');
  });

  it('nao exige envs de producao em development', () => {
    const result = validateProductionRuntimeEnv({ NODE_ENV: 'development' }, { service: 'web' });

    expect(result).toEqual({ ok: true, errors: [] });
  });
});
