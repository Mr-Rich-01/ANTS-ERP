import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors';
import { LOGO_MAX_BYTES, sanitizeLogoFileName, sniffImageMime, validateLogoUpload } from './company-profile';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

describe('sanitizeLogoFileName', () => {
  it('remove paths e caracteres fora de [a-z0-9._-]', () => {
    expect(sanitizeLogoFileName('..\\..\\etc\\Logo Empresa (1).PNG')).toBe('logo-empresa-1-.png');
    expect(sanitizeLogoFileName('/tmp/../segredo/logótipo.png')).toBe('log-tipo.png');
  });
  it('não devolve nome vazio nem pontos/hífenes nas pontas', () => {
    expect(sanitizeLogoFileName('///')).toBe('logo');
    expect(sanitizeLogoFileName('...')).toBe('logo');
    expect(sanitizeLogoFileName('-x-')).toBe('x');
  });
  it('limita o comprimento a 80 caracteres', () => {
    expect(sanitizeLogoFileName(`${'a'.repeat(200)}.png`).length).toBeLessThanOrEqual(80);
  });
});

describe('sniffImageMime', () => {
  it('reconhece PNG, JPEG e WebP pela assinatura', () => {
    expect(sniffImageMime(PNG)).toBe('image/png');
    expect(sniffImageMime(JPEG)).toBe('image/jpeg');
    expect(sniffImageMime(WEBP)).toBe('image/webp');
  });
  it('devolve null para conteúdo que não é imagem suportada', () => {
    expect(sniffImageMime(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]))).toBeNull();
    expect(sniffImageMime(new TextEncoder().encode('<svg xmlns="…"></svg>'))).toBeNull();
    expect(sniffImageMime(new Uint8Array())).toBeNull();
  });
});

describe('validateLogoUpload', () => {
  it('aceita PNG/JPEG/WebP válidos', () => {
    expect(validateLogoUpload({ mimeType: 'image/png', bytes: PNG })).toBe('image/png');
    expect(validateLogoUpload({ mimeType: 'image/jpeg', bytes: JPEG })).toBe('image/jpeg');
    expect(validateLogoUpload({ mimeType: 'image/webp', bytes: WEBP })).toBe('image/webp');
  });
  it('rejeita MIME não suportado (incluindo SVG)', () => {
    expect(() => validateLogoUpload({ mimeType: 'image/svg+xml', bytes: PNG })).toThrow(ValidationError);
    expect(() => validateLogoUpload({ mimeType: 'application/pdf', bytes: PNG })).toThrow(ValidationError);
  });
  it('rejeita ficheiro vazio e acima de 1 MB', () => {
    expect(() => validateLogoUpload({ mimeType: 'image/png', bytes: new Uint8Array() })).toThrow(ValidationError);
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(PNG);
    expect(() => validateLogoUpload({ mimeType: 'image/png', bytes: big })).toThrow(ValidationError);
  });
  it('rejeita conteúdo que não corresponde ao MIME declarado', () => {
    expect(() => validateLogoUpload({ mimeType: 'image/png', bytes: JPEG })).toThrow(ValidationError);
    expect(() => validateLogoUpload({ mimeType: 'image/webp', bytes: new TextEncoder().encode('nada') })).toThrow(
      ValidationError,
    );
  });
});
