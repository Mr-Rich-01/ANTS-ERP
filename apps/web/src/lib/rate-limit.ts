import { createHash } from 'node:crypto';
import { FixedWindowRateLimiter, type RateLimitDecision } from '@ants/shared';

const loginLimiter = new FixedWindowRateLimiter(10, 15 * 60 * 1000);
const companySelectionLimiter = new FixedWindowRateLimiter(20, 5 * 60 * 1000);

function hashKey(scope: string, value: string): string {
  return createHash('sha256').update(`${scope}:${value}`).digest('hex');
}

export function checkLoginRateLimit(email: string): RateLimitDecision {
  loginLimiter.prune();
  return loginLimiter.check(hashKey('login', email.trim().toLowerCase()));
}

export function checkCompanySelectionRateLimit(userId: string): RateLimitDecision {
  companySelectionLimiter.prune();
  return companySelectionLimiter.check(hashKey('company-selection', userId));
}
