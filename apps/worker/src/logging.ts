const SECRET_KEY_PATTERN = /password|secret|token|cookie|authorization|database[_-]?url|redis[_-]?url|auth[_-]?secret/i;

export function redactLogValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactLogValue(item, depth + 1);
  }
  return output;
}
