export type RuntimeService = 'web' | 'worker' | 'migrate';

export interface RuntimeEnvValidationOptions {
  service: RuntimeService;
  allowLocalhostUrls?: boolean;
}

export interface RuntimeEnvValidationResult {
  ok: boolean;
  errors: string[];
}

const PLACEHOLDER_PATTERNS = [
  /change[_-]?me/i,
  /changeme/i,
  /replace[_-]?with/i,
  /example/i,
  /exemplo/i,
  /<[^>]+>/,
  /\bUSER\b/,
  /\bPASSWORD\b/,
  /\bHOST\b/,
  /ants_dev_password/i,
];

const REQUIRED_BY_SERVICE: Record<RuntimeService, string[]> = {
  web: ['APP_URL', 'AUTH_URL', 'AUTH_SECRET', 'DATABASE_URL', 'REDIS_URL'],
  worker: ['DATABASE_URL', 'REDIS_URL'],
  migrate: ['DATABASE_URL'],
};

function clean(value: string | undefined): string {
  return value?.trim() ?? '';
}

function hasPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalhostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function validateUrl(name: string, value: string, errors: string[], opts: RuntimeEnvValidationOptions): void {
  if (!isHttpUrl(value)) {
    errors.push(`${name} must be a valid http(s) URL.`);
    return;
  }

  const url = new URL(value);
  if (url.protocol !== 'https:' && !opts.allowLocalhostUrls) {
    errors.push(`${name} must use HTTPS in production.`);
  }
  if (isLocalhostUrl(value) && !opts.allowLocalhostUrls) {
    errors.push(`${name} must not point to localhost in production.`);
  }
}

export function validateProductionRuntimeEnv(
  env: Record<string, string | undefined>,
  opts: RuntimeEnvValidationOptions,
): RuntimeEnvValidationResult {
  if (env.NODE_ENV !== 'production') {
    return { ok: true, errors: [] };
  }

  const errors: string[] = [];
  const required = REQUIRED_BY_SERVICE[opts.service];

  for (const name of required) {
    const value = clean(env[name]);
    if (!value) {
      errors.push(`${name} is required in production.`);
      continue;
    }
    if (hasPlaceholder(value)) {
      errors.push(`${name} contains a placeholder and must be replaced.`);
    }
  }

  for (const name of ['APP_URL', 'AUTH_URL'] as const) {
    if (required.includes(name)) {
      const value = clean(env[name]);
      if (value) validateUrl(name, value, errors, opts);
    }
  }

  const databaseUrl = clean(env.DATABASE_URL);
  if (required.includes('DATABASE_URL') && databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
        errors.push('DATABASE_URL must be a PostgreSQL URL.');
      }
      if (isLocalhostUrl(databaseUrl) && !opts.allowLocalhostUrls) {
        errors.push('DATABASE_URL must not point to localhost in production.');
      }
    } catch {
      errors.push('DATABASE_URL must be a valid URL.');
    }
  }

  const redisUrl = clean(env.REDIS_URL);
  if (required.includes('REDIS_URL') && redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
        errors.push('REDIS_URL must be a Redis URL.');
      }
      if (isLocalhostUrl(redisUrl) && !opts.allowLocalhostUrls) {
        errors.push('REDIS_URL must not point to localhost in production.');
      }
    } catch {
      errors.push('REDIS_URL must be a valid URL.');
    }
  }

  const secret = clean(env.AUTH_SECRET);
  if (required.includes('AUTH_SECRET') && secret) {
    if (secret.length < 32) {
      errors.push('AUTH_SECRET must be at least 32 characters long in production.');
    }
    if (/secret|password|admin|demo/i.test(secret)) {
      errors.push('AUTH_SECRET must not contain obvious demo words.');
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertProductionRuntimeEnv(env: Record<string, string | undefined>, opts: RuntimeEnvValidationOptions): void {
  const result = validateProductionRuntimeEnv(env, opts);
  if (!result.ok) {
    throw new Error(`Invalid ${opts.service} production environment:\n- ${result.errors.join('\n- ')}`);
  }
}
