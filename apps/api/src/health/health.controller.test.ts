import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('devolve estado ok', () => {
    const result = new HealthController().check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('ants-erp-api');
  });
});
