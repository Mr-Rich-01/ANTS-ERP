import { describe, expect, it } from 'vitest';
import { redactLogValue } from './logging';

describe('redactLogValue', () => {
  it('remove secrets de payloads antes de logging', () => {
    const redacted = redactLogValue({
      type: 'notification',
      authSecret: 'value',
      nested: {
        databaseUrl: 'postgresql://user:pass@host/db',
        token: 'abc',
        visible: 'ok',
      },
    });

    expect(redacted).toEqual({
      type: 'notification',
      authSecret: '[REDACTED]',
      nested: {
        databaseUrl: '[REDACTED]',
        token: '[REDACTED]',
        visible: 'ok',
      },
    });
  });
});
