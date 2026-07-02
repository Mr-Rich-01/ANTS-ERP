import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword } from './admin';

const legacyFixedPassword = ['Ants', '@123'].join('');

describe('generateTemporaryPassword', () => {
  it('gera uma palavra-passe temporária sem valor fixo conhecido', () => {
    const password = generateTemporaryPassword();

    expect(password).not.toBe(legacyFixedPassword);
    expect(password).toMatch(/^[A-Za-z0-9-]{20}$/);
  });

  it('usa aleatoriedade para convites de utilizador', () => {
    const passwords = new Set(Array.from({ length: 5 }, () => generateTemporaryPassword()));

    expect(passwords.size).toBeGreaterThan(1);
  });
});
