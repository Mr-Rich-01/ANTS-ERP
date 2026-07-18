import { forCompany } from '@ants/database';
import { getCompanyProfile, hasPermission } from '@ants/domain';
import { NoPermission } from '@/components/NoPermission';
import { getContext } from '@/lib/session';
import { CompanyProfileClient } from './CompanyProfileClient';

export const dynamic = 'force-dynamic';

export default async function CompanyProfilePage() {
  const ctx = await getContext();

  if (!ctx.companyId) {
    return (
      <div style={{ padding: '60px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
        Selecione uma empresa para gerir os dados da empresa.
      </div>
    );
  }
  if (!hasPermission(ctx, 'settings.manage')) {
    return <NoPermission message="Não tem permissão para gerir os dados da empresa." />;
  }

  const profile = await getCompanyProfile(forCompany(ctx.companyId), ctx);

  return (
    <CompanyProfileClient
      profile={{
        legalName: profile.legalName,
        tradeName: profile.tradeName,
        nuit: profile.nuit,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        website: profile.website,
        logoVersion: profile.logoUpdatedAt ? String(profile.logoUpdatedAt.getTime()) : null,
        bankAccounts: profile.bankAccounts.map((a) => ({
          bankName: a.bankName,
          accountHolder: a.accountHolder ?? '',
          accountNumber: a.accountNumber ?? '',
          nib: a.nib ?? '',
          iban: a.iban ?? '',
          swift: a.swift ?? '',
          isActive: a.isActive,
        })),
        mobileWallets: profile.mobileWallets.map((w) => ({
          provider: w.provider,
          walletNumber: w.walletNumber,
          accountHolder: w.accountHolder ?? '',
          isActive: w.isActive,
        })),
      }}
    />
  );
}
