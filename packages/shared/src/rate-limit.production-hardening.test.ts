import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from './rate-limit';

describe('FixedWindowRateLimiter', () => {
  it('bloqueia tentativas acima do limite ate a janela expirar', () => {
    const limiter = new FixedWindowRateLimiter(2, 1000);

    expect(limiter.check('key', 0).allowed).toBe(true);
    expect(limiter.check('key', 10).allowed).toBe(true);
    const blocked = limiter.check('key', 20);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(limiter.check('key', 1001).allowed).toBe(true);
  });
});
