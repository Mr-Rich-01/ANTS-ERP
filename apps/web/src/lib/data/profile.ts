// Perfil de conta (cliente/fornecedor) — portado de design/ANTS-ERP-FONTE-COMPLETA.js.
// Placeholder de UI. TODO: ligar a CRM / Fornecedores (Fase 2).
import { fmt, fmtNoSymbol } from '@/lib/format';

export type ProfileType = 'client' | 'supplier';

type ExtractRow = [string, string, string, number | '—', number | '—', number];

interface ProfileRaw {
  name: string;
  ini: string;
  typeLabel: string;
  typeColor: string;
  typeBg: string;
  nuit: string;
  address: string;
  phone: string;
  email: string;
  actionLabel: string;
  actionIcon: string;
  mini: Array<[string, string, string]>;
  extract: ExtractRow[];
}

const profiles: Record<ProfileType, ProfileRaw> = {
  client: {
    name: 'Distribuidora Maputo, Lda',
    ini: 'DM',
    typeLabel: 'Cliente',
    typeColor: 'var(--accent-fg)',
    typeBg: 'var(--accent-bg)',
    nuit: '400 785 214',
    address: 'Av. 24 de Julho, nº 1290 · Maputo',
    phone: '+258 84 321 0099',
    email: 'compras@distmaputo.co.mz',
    actionLabel: 'Nova factura',
    actionIcon: 'receipt-text',
    mini: [
      ['Saldo actual', fmt(48900), 'var(--bad)'],
      ['Limite de crédito', fmt(100000), 'var(--text)'],
      ['Facturado (ano)', fmt(412300), 'var(--text)'],
      ['Antiguidade média', '18 dias', 'var(--text)'],
    ],
    extract: [
      ['01/06/2026', '—', 'Saldo inicial', '—', '—', 22150],
      ['05/06/2026', 'FT 2026/0301', 'Factura de venda', 18900, 0, 41050],
      ['12/06/2026', 'REC-072', 'Recibo de pagamento', 0, 12000, 29050],
      ['18/06/2026', 'FT 2026/0319', 'Factura de venda', 24850, 0, 53900],
      ['23/06/2026', 'REC-088', 'Recibo de pagamento', 0, 5000, 48900],
    ],
  },
  supplier: {
    name: 'Dangote Cimento, SA',
    ini: 'DC',
    typeLabel: 'Fornecedor',
    typeColor: 'var(--info)',
    typeBg: 'var(--info-bg)',
    nuit: '400 990 112',
    address: 'Av. das Indústrias · Matola',
    phone: '+258 21 720 400',
    email: 'vendas@dangote.co.mz',
    actionLabel: 'Novo pagamento',
    actionIcon: 'banknote',
    mini: [
      ['Saldo a pagar', fmt(186300), 'var(--bad)'],
      ['Crédito concedido', fmt(250000), 'var(--text)'],
      ['Comprado (ano)', fmt(1240000), 'var(--text)'],
      ['Prazo médio', '30 dias', 'var(--text)'],
    ],
    extract: [
      ['01/06/2026', '—', 'Saldo transportado', '—', '—', 60300],
      ['08/06/2026', 'FF 2026/0148', 'Factura de compra', 0, 216000, 276300],
      ['12/06/2026', 'PAG-0145', 'Pagamento parcial', 90000, 0, 186300],
    ],
  },
};

export function getProfile(type: ProfileType) {
  const pf = profiles[type] ?? profiles.client;
  return {
    ...pf,
    mini: pf.mini.map(([label, value, color]) => ({ label, value, color })),
    extract: pf.extract.map(([date, doc, desc, deb, cred, saldo]) => ({
      date,
      doc,
      desc,
      debStr: deb === '—' ? '—' : deb ? fmtNoSymbol(deb) : '—',
      credStr: cred === '—' ? '—' : cred ? fmtNoSymbol(cred) : '—',
      debCol: deb && deb !== '—' ? 'var(--text)' : 'var(--text4)',
      credCol: cred && cred !== '—' ? 'var(--text)' : 'var(--text4)',
      saldoStr: fmt(saldo),
    })),
    saldoFinalStr: fmt(pf.extract[pf.extract.length - 1]![5]),
  };
}
