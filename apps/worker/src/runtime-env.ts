function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Invalid worker production environment: ${name} is required in production.`);
  if (/change[_-]?me|replace[_-]?with|example|exemplo|ants_dev_password/i.test(value)) {
    throw new Error(`Invalid worker production environment: ${name} contains a placeholder and must be replaced.`);
  }
  return value;
}

function assertUrl(name: string, value: string, protocols: string[]): void {
  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) {
      throw new Error();
    }
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)) {
      throw new Error(`Invalid worker production environment: ${name} must not point to localhost in production.`);
    }
  } catch {
    if (value.includes('localhost') || value.includes('127.0.0.1') || value.includes('0.0.0.0') || value.includes('::1')) {
      throw new Error(`Invalid worker production environment: ${name} must not point to localhost in production.`);
    }
    throw new Error(`Invalid worker production environment: ${name} has an invalid URL format.`);
  }
}

export function assertWorkerRuntimeEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const databaseUrl = required('DATABASE_URL');
  const redisUrl = required('REDIS_URL');
  assertUrl('DATABASE_URL', databaseUrl, ['postgresql:', 'postgres:']);
  assertUrl('REDIS_URL', redisUrl, ['redis:', 'rediss:']);
}
