import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '..', '..', '..');

function source(...parts: string[]): string {
  return readFileSync(resolve(repoRoot, ...parts), 'utf8');
}

describe('production hardening source checks', () => {
  it('aplica headers HTTP seguros via middleware Next', () => {
    const middleware = source('apps', 'web', 'src', 'middleware.ts');

    expect(middleware).toContain('X-Content-Type-Options');
    expect(middleware).toContain('nosniff');
    expect(middleware).toContain('Referrer-Policy');
    expect(middleware).toContain('X-Frame-Options');
    expect(middleware).toContain('Permissions-Policy');
    expect(middleware).toContain('Strict-Transport-Security');
  });

  it('nao adiciona CORS wildcard na app', () => {
    const webSources = [
      source('apps', 'web', 'src', 'middleware.ts'),
      source('apps', 'web', 'src', 'app', 'api', 'health', 'route.ts'),
      source('apps', 'web', 'src', 'app', 'api', 'auth', '[...nextauth]', 'route.ts'),
    ].join('\n');

    expect(webSources).not.toContain('Access-Control-Allow-Origin');
    expect(webSources).not.toMatch(/Access-Control-Allow-Origin['"]?\s*,\s*['"]\*/);
  });

  it('mantem health endpoint sem envs, secrets ou dados internos', () => {
    const health = source('apps', 'web', 'src', 'app', 'api', 'health', 'route.ts');

    expect(health).toContain("service: 'ants-erp-web'");
    expect(health).toContain("status: 'ok'");
    expect(health).toContain('Cache-Control');
    expect(health).not.toContain('DATABASE_URL');
    expect(health).not.toContain('AUTH_SECRET');
    expect(health).not.toContain('process.env');
  });

  it('usa rate limit no login e na seleccao de empresa', () => {
    expect(source('apps', 'web', 'src', 'app', '(auth)', 'login', 'actions.ts')).toContain('checkLoginRateLimit');
    expect(source('apps', 'web', 'src', 'app', 'seleccionar-empresa', 'actions.ts')).toContain('checkCompanySelectionRateLimit');
  });

  it('nao deixa REDIS_URL cair para localhost em producao sem validar env', () => {
    const queues = source('apps', 'worker', 'src', 'queues.ts');

    expect(queues).toContain('assertWorkerRuntimeEnv');
    expect(queues.indexOf('assertWorkerRuntimeEnv')).toBeLessThan(queues.indexOf("process.env.REDIS_URL ?? 'redis://localhost:6379'"));
  });
});
