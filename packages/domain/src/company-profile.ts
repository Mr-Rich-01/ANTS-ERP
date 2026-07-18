import { z } from 'zod';
import type { Prisma, PrismaClient } from '@ants/database';
import type { RequestContext } from './context';
import { requireCompany } from './context';
import { requirePermission } from './permissions';
import { NotFoundError, ValidationError } from './errors';
import { writeAudit } from './audit';

// ─────────────────────────── Tipos ───────────────────────────

export interface CompanyBankAccountItem {
  id: string;
  bankName: string;
  accountHolder: string | null;
  accountNumber: string | null;
  nib: string | null;
  iban: string | null;
  swift: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface CompanyMobileWalletItem {
  id: string;
  provider: string;
  walletNumber: string;
  accountHolder: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface CompanyProfile {
  legalName: string;
  tradeName: string | null;
  nuit: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  logoUpdatedAt: Date | null;
  bankAccounts: CompanyBankAccountItem[];
  mobileWallets: CompanyMobileWalletItem[];
}

// ─────────────────────────── Validação (Zod) ───────────────────────────

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null);

const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1, 'O banco é obrigatório.').max(120),
  accountHolder: optionalTrimmed(160),
  accountNumber: optionalTrimmed(40),
  nib: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ''))
    .refine((v) => v === '' || /^\d{21}$/.test(v), 'O NIB deve ter 21 dígitos.')
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null),
  iban: optionalTrimmed(40),
  swift: optionalTrimmed(16),
  isActive: z.boolean().default(true),
});

const mobileWalletSchema = z.object({
  provider: z.string().trim().min(1, 'A operadora é obrigatória.').max(60),
  walletNumber: z.string().trim().min(1, 'O número é obrigatório.').max(40),
  accountHolder: optionalTrimmed(160),
  isActive: z.boolean().default(true),
});

const profileSchema = z.object({
  legalName: z.string().trim().min(1, 'O nome legal é obrigatório.').max(200),
  tradeName: optionalTrimmed(200),
  nuit: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{9}$/.test(v), 'O NUIT deve ter 9 dígitos.')
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email inválido.')
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null),
  phone: optionalTrimmed(40),
  address: optionalTrimmed(300),
  website: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'O website deve começar por http:// ou https://.')
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null),
  bankAccounts: z.array(bankAccountSchema).max(20).default([]),
  mobileWallets: z.array(mobileWalletSchema).max(20).default([]),
});

export type CompanyProfileInput = z.input<typeof profileSchema>;

// ─────────────────────────── Leitura ───────────────────────────

/** Perfil completo da empresa activa para o ecrã de configuração (gate `settings.manage`). */
export async function getCompanyProfile(db: PrismaClient, ctx: RequestContext): Promise<CompanyProfile> {
  requirePermission(ctx, 'settings.manage');
  const companyId = requireCompany(ctx);
  const [c, bankAccounts, mobileWallets] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.companyBankAccount.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    db.companyMobileWallet.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  if (!c) throw new NotFoundError('Empresa não encontrada.');
  return {
    legalName: c.legalName,
    tradeName: c.tradeName,
    nuit: c.nuit,
    email: c.email,
    phone: c.phone,
    address: c.address,
    website: c.website,
    logoUpdatedAt: c.logoUpdatedAt,
    bankAccounts: bankAccounts.map((a) => ({
      id: a.id,
      bankName: a.bankName,
      accountHolder: a.accountHolder,
      accountNumber: a.accountNumber,
      nib: a.nib,
      iban: a.iban,
      swift: a.swift,
      isActive: a.isActive,
      sortOrder: a.sortOrder,
    })),
    mobileWallets: mobileWallets.map((w) => ({
      id: w.id,
      provider: w.provider,
      walletNumber: w.walletNumber,
      accountHolder: w.accountHolder,
      isActive: w.isActive,
      sortOrder: w.sortOrder,
    })),
  };
}

// ─────────────────────────── Mutações ───────────────────────────

/**
 * Actualiza os dados da empresa activa e substitui as listas de contas bancárias
 * e carteiras móveis (a ordem do array define o sortOrder — é a ordem dos
 * documentos da S5). Tudo numa transacção, com auditoria explícita.
 */
export async function updateCompanyProfile(
  db: PrismaClient,
  ctx: RequestContext,
  input: CompanyProfileInput,
): Promise<void> {
  requirePermission(ctx, 'settings.manage');
  const companyId = requireCompany(ctx);

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors[0]?.message ?? 'Dados da empresa inválidos.');
  }
  const p = parsed.data;

  const current = await db.company.findUnique({ where: { id: companyId } });
  if (!current) throw new NotFoundError('Empresa não encontrada.');

  await db.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: companyId },
      data: {
        legalName: p.legalName,
        tradeName: p.tradeName,
        nuit: p.nuit,
        email: p.email,
        phone: p.phone,
        address: p.address,
        website: p.website,
      },
    });
    await tx.companyBankAccount.deleteMany({});
    for (const [i, a] of p.bankAccounts.entries()) {
      // O cliente isolado injecta o companyId (2.ª barreira).
      const data = { ...a, sortOrder: i } satisfies Omit<Prisma.CompanyBankAccountUncheckedCreateInput, 'companyId'>;
      await tx.companyBankAccount.create({ data: data as Prisma.CompanyBankAccountUncheckedCreateInput });
    }
    await tx.companyMobileWallet.deleteMany({});
    for (const [i, w] of p.mobileWallets.entries()) {
      const data = { ...w, sortOrder: i } satisfies Omit<Prisma.CompanyMobileWalletUncheckedCreateInput, 'companyId'>;
      await tx.companyMobileWallet.create({ data: data as Prisma.CompanyMobileWalletUncheckedCreateInput });
    }
    await writeAudit(tx as PrismaClient, ctx, {
      action: 'company.profile.update',
      entity: 'Company',
      entityId: companyId,
      oldValues: {
        legalName: current.legalName,
        tradeName: current.tradeName,
        nuit: current.nuit,
        email: current.email,
        phone: current.phone,
        address: current.address,
        website: current.website,
      },
      newValues: {
        legalName: p.legalName,
        tradeName: p.tradeName,
        nuit: p.nuit,
        email: p.email,
        phone: p.phone,
        address: p.address,
        website: p.website,
        bankAccounts: p.bankAccounts.map((a) => ({ bankName: a.bankName, accountNumber: a.accountNumber })),
        mobileWallets: p.mobileWallets.map((w) => ({ provider: w.provider, walletNumber: w.walletNumber })),
      },
    });
  });
}

// ─────────────────────────── Logótipo ───────────────────────────

export const LOGO_MAX_BYTES = 1024 * 1024; // 1 MB
export const LOGO_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type LogoMime = (typeof LOGO_ALLOWED_MIME)[number];

/** Sanitiza o nome do ficheiro: só [a-z0-9._-], sem paths, tamanho limitado. */
export function sanitizeLogoFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'logo';
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80);
  return clean || 'logo';
}

/** Verifica a assinatura real dos bytes contra o MIME declarado (png/jpeg/webp). */
export function sniffImageMime(bytes: Uint8Array): LogoMime | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Valida o upload do logótipo (tipo declarado, assinatura real e tamanho). Lança ValidationError. */
export function validateLogoUpload(input: { mimeType: string; bytes: Uint8Array }): LogoMime {
  if (!(LOGO_ALLOWED_MIME as readonly string[]).includes(input.mimeType)) {
    throw new ValidationError('Formato não suportado. Use PNG, JPG ou WebP.');
  }
  if (input.bytes.length === 0) throw new ValidationError('O ficheiro está vazio.');
  if (input.bytes.length > LOGO_MAX_BYTES) {
    throw new ValidationError('O logótipo excede o tamanho máximo de 1 MB.');
  }
  const sniffed = sniffImageMime(input.bytes);
  if (!sniffed || sniffed !== input.mimeType) {
    throw new ValidationError('O conteúdo do ficheiro não corresponde a uma imagem PNG, JPG ou WebP válida.');
  }
  return sniffed;
}

/** Grava/substitui o logótipo da empresa activa (gate `settings.manage`, auditoria sem bytes). */
export async function setCompanyLogo(
  db: PrismaClient,
  ctx: RequestContext,
  input: { fileName: string; mimeType: string; bytes: Uint8Array },
): Promise<void> {
  requirePermission(ctx, 'settings.manage');
  const companyId = requireCompany(ctx);
  const mimeType = validateLogoUpload(input);
  const fileName = sanitizeLogoFileName(input.fileName);
  const data = Buffer.from(input.bytes);
  // O mesmo instante nos dois campos: a versão do URL (Company.logoUpdatedAt) e o
  // ETag da rota (CompanyLogo.updatedAt) têm de coincidir para a cache imutável.
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.companyLogo.upsert({
      where: { companyId },
      update: { data, mimeType, fileName, sizeBytes: data.length, updatedAt: now },
      create: { companyId, data, mimeType, fileName, sizeBytes: data.length, updatedAt: now },
    });
    await tx.company.update({ where: { id: companyId }, data: { logoUpdatedAt: now } });
    await writeAudit(tx as PrismaClient, ctx, {
      action: 'company.logo.update',
      entity: 'CompanyLogo',
      entityId: companyId,
      newValues: { fileName, mimeType, sizeBytes: data.length },
    });
  });
}

/** Remove o logótipo da empresa activa. */
export async function removeCompanyLogo(db: PrismaClient, ctx: RequestContext): Promise<void> {
  requirePermission(ctx, 'settings.manage');
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    await tx.companyLogo.deleteMany({});
    await tx.company.update({ where: { id: companyId }, data: { logoUpdatedAt: null } });
    await writeAudit(tx as PrismaClient, ctx, {
      action: 'company.logo.remove',
      entity: 'CompanyLogo',
      entityId: companyId,
    });
  });
}

export interface CompanyLogoFile {
  data: Uint8Array;
  mimeType: string;
  updatedAt: Date;
}

/**
 * Lê o logótipo da empresa da sessão. Sem permissão específica: qualquer sessão
 * autenticada da empresa pode ver o próprio logótipo (sidebar/documentos).
 * O isolamento vem do cliente `forCompany` — nunca de parâmetros do request.
 */
export async function getCompanyLogo(db: PrismaClient, ctx: RequestContext): Promise<CompanyLogoFile | null> {
  requireCompany(ctx);
  const logo = await db.companyLogo.findFirst({});
  if (!logo) return null;
  return { data: logo.data, mimeType: logo.mimeType, updatedAt: logo.updatedAt };
}
