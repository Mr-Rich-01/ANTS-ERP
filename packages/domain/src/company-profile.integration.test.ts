/**
 * Suite de integração dos Dados da Empresa (S4).
 * Correr com: `pnpm test:integration:company-profile` (exige DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { forCompany, prisma } from '@ants/database';
import type { RequestContext } from './context';
import { ForbiddenError, ValidationError } from './errors';
import {
  getCompanyLogo,
  getCompanyProfile,
  removeCompanyLogo,
  setCompanyLogo,
  updateCompanyProfile,
} from './company-profile';
import { getCompanyPrintProfile } from './admin';

const CA = 'company-profile-s4-a';
const CB = 'company-profile-s4-b';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

function ctx(companyId: string, permissions: string[]): RequestContext {
  return {
    companyId,
    userId: `${companyId}-user`,
    userName: 'Operador Teste',
    permissions: new Set(permissions),
    isPlatformAdmin: false,
  };
}

async function teardown(companyId: string) {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.companyLogo.deleteMany({ where: { companyId } });
  await prisma.companyBankAccount.deleteMany({ where: { companyId } });
  await prisma.companyMobileWallet.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

beforeAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.company.create({ data: { id: CA, legalName: 'Empresa A, Lda.', nuit: '400111333' } });
  await prisma.company.create({ data: { id: CB, legalName: 'Empresa B, Lda.', nuit: '400222444' } });
  await prisma.user.create({ data: { companyId: CA, email: 'a@s4.test', passwordHash: 'x', name: 'User A', mustChangePassword: false } });
  await prisma.user.create({ data: { companyId: CB, email: 'b@s4.test', passwordHash: 'x', name: 'User B', mustChangePassword: false } });
});

afterAll(async () => {
  await teardown(CA);
  await teardown(CB);
  await prisma.$disconnect();
});

describe('updateCompanyProfile', () => {
  it('exige settings.manage', async () => {
    await expect(
      updateCompanyProfile(forCompany(CA), ctx(CA, []), { legalName: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('actualiza dados + listas e regista auditoria, sem tocar na empresa B', async () => {
    await updateCompanyProfile(forCompany(CA), ctx(CA, ['settings.manage']), {
      legalName: 'Empresa A Actualizada, Lda.',
      tradeName: 'Empresa A',
      nuit: '400111333',
      email: 'geral@empresa-a.test',
      phone: '+258 84 000 0001',
      address: 'Av. Teste, 1, Maputo',
      website: 'https://empresa-a.test',
      bankAccounts: [
        { bankName: 'BCI', accountHolder: 'Empresa A', accountNumber: '111', nib: '000800001234567890123', iban: 'MZ59000800001234567890123', swift: 'CGDIMZMA' },
        { bankName: 'BIM', accountNumber: '222' },
      ],
      mobileWallets: [{ provider: 'M-Pesa', walletNumber: '84 000 0001' }],
    });

    const profileA = await getCompanyProfile(forCompany(CA), ctx(CA, ['settings.manage']));
    expect(profileA.legalName).toBe('Empresa A Actualizada, Lda.');
    expect(profileA.address).toBe('Av. Teste, 1, Maputo');
    expect(profileA.website).toBe('https://empresa-a.test');
    expect(profileA.bankAccounts.map((a) => a.bankName)).toEqual(['BCI', 'BIM']);
    expect(profileA.bankAccounts[0]?.sortOrder).toBe(0);
    expect(profileA.mobileWallets).toHaveLength(1);
    expect(profileA.mobileWallets[0]?.provider).toBe('M-Pesa');

    // Empresa B permanece intacta e sem listas.
    const profileB = await getCompanyProfile(forCompany(CB), ctx(CB, ['settings.manage']));
    expect(profileB.legalName).toBe('Empresa B, Lda.');
    expect(profileB.bankAccounts).toHaveLength(0);
    expect(profileB.mobileWallets).toHaveLength(0);

    const audit = await prisma.auditLog.findFirst({ where: { companyId: CA, action: 'company.profile.update' } });
    expect(audit).not.toBeNull();
  });

  it('rejeita NIB que não tenha 21 dígitos e website sem http(s)', async () => {
    await expect(
      updateCompanyProfile(forCompany(CA), ctx(CA, ['settings.manage']), {
        legalName: 'Empresa A, Lda.',
        bankAccounts: [{ bankName: 'BCI', nib: '123' }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      updateCompanyProfile(forCompany(CA), ctx(CA, ['settings.manage']), {
        legalName: 'Empresa A, Lda.',
        website: 'ftp://x',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('logótipo', () => {
  it('exige settings.manage para gravar', async () => {
    await expect(
      setCompanyLogo(forCompany(CA), ctx(CA, []), { fileName: 'logo.png', mimeType: 'image/png', bytes: PNG }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejeita upload inválido (MIME/conteúdo)', async () => {
    await expect(
      setCompanyLogo(forCompany(CA), ctx(CA, ['settings.manage']), {
        fileName: 'logo.svg',
        mimeType: 'image/svg+xml',
        bytes: PNG,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      setCompanyLogo(forCompany(CA), ctx(CA, ['settings.manage']), {
        fileName: 'x.png',
        mimeType: 'image/png',
        bytes: new TextEncoder().encode('não é imagem'),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('grava o logótipo da empresa A; a empresa B não o vê nem acede', async () => {
    await setCompanyLogo(forCompany(CA), ctx(CA, ['settings.manage']), {
      fileName: 'Logo Empresa A.PNG',
      mimeType: 'image/png',
      bytes: PNG,
    });

    const logoA = await getCompanyLogo(forCompany(CA), ctx(CA, []));
    expect(logoA).not.toBeNull();
    expect(logoA?.mimeType).toBe('image/png');
    expect(Buffer.from(logoA!.data).equals(Buffer.from(PNG))).toBe(true);

    // Isolamento: com a sessão da empresa B, o logótipo de A é invisível.
    const logoB = await getCompanyLogo(forCompany(CB), ctx(CB, []));
    expect(logoB).toBeNull();

    // logoUpdatedAt actualizado e nome sanitizado; auditoria sem bytes.
    const companyA = await prisma.company.findUnique({ where: { id: CA } });
    expect(companyA?.logoUpdatedAt).not.toBeNull();
    const stored = await prisma.companyLogo.findUnique({ where: { companyId: CA } });
    expect(stored?.fileName).toBe('logo-empresa-a.png');
    const audit = await prisma.auditLog.findFirst({ where: { companyId: CA, action: 'company.logo.update' } });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.newValues)).not.toContain('data');
  });

  it('o perfil imprimível expõe a versão do logótipo e as carteiras', async () => {
    const print = await getCompanyPrintProfile(forCompany(CA), ctx(CA, []));
    expect(print?.logoVersion).toBeTruthy();
    expect(print?.mobileWallets).toEqual([{ provider: 'M-Pesa', number: '84 000 0001' }]);
    expect(print?.bankAccounts[0]?.name).toBe('BCI');
    expect(print?.bankAccounts[0]?.reference).toBe('MZ59000800001234567890123');

    const printB = await getCompanyPrintProfile(forCompany(CB), ctx(CB, []));
    expect(printB?.logoVersion).toBeNull();
  });

  it('remove o logótipo e limpa a versão', async () => {
    await removeCompanyLogo(forCompany(CA), ctx(CA, ['settings.manage']));
    expect(await getCompanyLogo(forCompany(CA), ctx(CA, []))).toBeNull();
    const companyA = await prisma.company.findUnique({ where: { id: CA } });
    expect(companyA?.logoUpdatedAt).toBeNull();
  });
});
