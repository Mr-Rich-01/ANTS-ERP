import type { ReactNode } from 'react';
import { fmt } from '@/lib/format';

export interface PrintableCompany {
  legalName: string;
  tradeName: string | null;
  nuit: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website?: string | null;
  /** Versão do logótipo (S4) — presente = a empresa tem logótipo em /api/company/logo. */
  logoVersion?: string | null;
  bankAccounts?: Array<{ name: string; type: string; reference: string | null }>;
  mobileWallets?: Array<{ provider: string; number: string }>;
}

const sheetStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 820,
  background: '#ffffff',
  color: '#16282c',
  border: '1px solid #e6eaea',
  borderRadius: 6,
  boxShadow: '0 10px 40px rgba(16,40,45,.12)',
  padding: '42px 46px',
  fontSize: 13,
};

export function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ants-docwrap" style={{ padding: '18px 26px 40px', display: 'flex', justifyContent: 'center' }}>
      <div className="ants-sheet" style={sheetStyle}>
        {children}
      </div>
    </div>
  );
}

export function CompanyHeader({
  company,
  title,
  documentNumber,
  status,
  meta,
}: {
  company: PrintableCompany | null;
  title: string;
  documentNumber?: string;
  status?: ReactNode;
  meta?: ReactNode;
}) {
  const initial = (company?.tradeName ?? company?.legalName ?? 'A').charAt(0).toUpperCase();
  const accounts = company?.bankAccounts?.filter((a) => a.reference) ?? [];
  const wallets = company?.mobileWallets ?? [];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, paddingBottom: 22, borderBottom: '2px solid #13343b' }}>
      <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
        {company?.logoVersion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="ants-print-logo"
            src={`/api/company/logo?v=${company.logoVersion}`}
            alt=""
            style={{ width: 54, height: 54, borderRadius: 12, objectFit: 'contain', flex: 'none', background: '#fff' }}
          />
        ) : (
          <div className="ants-print-logo" style={{ width: 54, height: 54, borderRadius: 12, background: '#0e2a30', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 26, flex: 'none' }}>
            {initial}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0e2a30' }}>{company?.tradeName ?? company?.legalName ?? 'Empresa'}</div>
          <div style={{ fontSize: 11.5, color: '#5f7378', lineHeight: 1.65, marginTop: 4 }}>
            {company?.legalName}
            {company?.address ? (
              <>
                <br />
                {company.address}
              </>
            ) : null}
            <br />
            {company?.phone ? `Tel: ${company.phone}` : ''}
            {company?.phone && company?.email ? ' · ' : ''}
            {company?.email ?? ''}
            <br />
            <strong style={{ color: '#16282c' }}>NUIT:</strong> {company?.nuit ?? '-'}
          </div>
          {accounts.length || wallets.length ? (
            <div style={{ marginTop: 8, fontSize: 10.8, color: '#5f7378', lineHeight: 1.5 }}>
              {accounts.map((a) => (
                <div key={`${a.name}-${a.reference}`}>
                  <strong style={{ color: '#16282c' }}>{a.name}:</strong> {a.reference}
                </div>
              ))}
              {wallets.map((w) => (
                <div key={`${w.provider}-${w.number}`}>
                  <strong style={{ color: '#16282c' }}>{w.provider}:</strong> {w.number}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ textAlign: 'right', flex: 'none' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '1px', color: '#13343b', textTransform: 'uppercase' }}>{title}</div>
        {documentNumber ? <div className="font-mono" style={{ fontSize: 12.5, color: '#5f7378', marginTop: 6 }}>{documentNumber}</div> : null}
        {status ? <div style={{ marginTop: 8 }}>{status}</div> : null}
        {meta ? <div style={{ marginTop: 10 }}>{meta}</div> : null}
      </div>
    </div>
  );
}

export function DocumentFooter({ company }: { company: PrintableCompany | null }) {
  return (
    <div style={{ marginTop: 40, paddingTop: 14, borderTop: '1px solid #eef2f2', textAlign: 'center', fontSize: 10.5, color: '#9aa7a9', lineHeight: 1.6 }}>
      Documento processado por sistema ANTS ERP. Guardar PDF disponível pelo diálogo de impressão do navegador.
      <br />
      {company?.legalName ?? 'Empresa'} · NUIT {company?.nuit ?? '-'}
    </div>
  );
}

export function MoneyCell({ value, color = '#16282c' }: { value: number; color?: string }) {
  return (
    <span className="tnum" style={{ fontWeight: 600, color, whiteSpace: 'nowrap' }}>
      {fmt(value)}
    </span>
  );
}

export function SignatureBlock({ leftLabel, rightLabel }: { leftLabel: string; rightLabel: string }) {
  return (
    <div className="ants-signatures" style={{ display: 'flex', justifyContent: 'space-between', gap: 44, marginTop: 46 }}>
      {[leftLabel, rightLabel].map((label) => (
        <div key={label} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #cfd8da', paddingTop: 8, fontSize: 11.5, color: '#5f7378' }}>{label}</div>
        </div>
      ))}
    </div>
  );
}
