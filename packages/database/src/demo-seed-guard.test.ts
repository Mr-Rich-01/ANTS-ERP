import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertDemoSeedAllowed, DEMO_SEED_PRODUCTION_ERROR } from './demo-seed-guard';

const legacyFixedTempPassword = ['Ants', '@123'].join('');
const demoAdminEmail = ['admin', 'ants.co.mz'].join('@');
const demoAdminPassword = ['Admin', '123'].join('@');
const demoUserPassword = ['Demo', '123'].join('@');
const packageRoot = resolve(__dirname, '..');
const repoRoot = resolve(__dirname, '..', '..', '..');

const seedSource = () => readFileSync(resolve(packageRoot, 'prisma', 'seed.ts'), 'utf8');
const loginFormSource = () => readFileSync(resolve(repoRoot, 'apps', 'web', 'src', 'components', 'auth', 'LoginForm.tsx'), 'utf8');
const authSource = () => readFileSync(resolve(repoRoot, 'apps', 'web', 'src', 'auth.ts'), 'utf8');
const adminDomainSource = () => readFileSync(resolve(repoRoot, 'packages', 'domain', 'src', 'admin.ts'), 'utf8');

describe('demo seed production guard', () => {
  it('permite o seed demo em development', () => {
    expect(() => assertDemoSeedAllowed('development')).not.toThrow();
  });

  it('permite o seed demo em test', () => {
    expect(() => assertDemoSeedAllowed('test')).not.toThrow();
  });

  it('não trata NODE_ENV undefined como production', () => {
    expect(() => assertDemoSeedAllowed(undefined)).not.toThrow();
  });

  it('rejeita production por comparação exacta', () => {
    expect(() => assertDemoSeedAllowed('production')).toThrow(DEMO_SEED_PRODUCTION_ERROR);
    expect(() => assertDemoSeedAllowed('Production')).not.toThrow();
  });

  it('explica que deve ser usado o provisionamento oficial', () => {
    expect(DEMO_SEED_PRODUCTION_ERROR).toContain('fluxo oficial de provisionamento de empresas');
  });

  it('chama a guarda antes de criar PrismaClient no entrypoint real', () => {
    const source = seedSource();
    const guardIndex = source.indexOf('assertDemoSeedAllowed();');
    const clientIndex = source.indexOf('new PrismaClient');

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(clientIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(clientIndex);
  });

  it('não adiciona bypass genérico para seed em production', () => {
    expect(seedSource()).not.toMatch(/ALLOW_.*PRODUCTION.*SEED|PRODUCTION.*SEED.*ALLOW/);
  });
});

describe('login production hardening', () => {
  it('não expõe o email demo no formulário de login', () => {
    expect(loginFormSource()).not.toContain(demoAdminEmail);
  });

  it('não expõe passwords demo no formulário de login', () => {
    const source = loginFormSource();

    expect(source).not.toContain(demoAdminPassword);
    expect(source).not.toContain(demoUserPassword);
    expect(source).not.toContain(legacyFixedTempPassword);
  });

  it('remove a indicação demo da interface de login', () => {
    expect(loginFormSource()).not.toContain('Demo:');
  });

  it('mantém o formulário normal ligado à action de login', () => {
    const source = loginFormSource();

    expect(source).toContain('loginAction');
    expect(source).toContain('name="email"');
    expect(source).toContain('name="password"');
    expect(source).toContain('type="submit"');
  });

  it('mantém a autenticação normal ligada ao provider Credentials', () => {
    const source = authSource();

    expect(source).toContain('Credentials');
    expect(source).toContain('authenticate(prisma');
  });

  it('não mantém password temporária fixa no domínio de utilizadores', () => {
    expect(adminDomainSource()).not.toContain(legacyFixedTempPassword);
  });
});
