export const DEMO_SEED_PRODUCTION_ERROR =
  'O seed de demonstração não pode ser executado em ambiente de produção. Utilize o fluxo oficial de provisionamento de empresas.';

export function assertDemoSeedAllowed(environment = process.env.NODE_ENV): void {
  if (environment === 'production') {
    throw new Error(DEMO_SEED_PRODUCTION_ERROR);
  }
}
