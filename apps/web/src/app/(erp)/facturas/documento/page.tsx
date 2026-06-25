import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { fmt } from '@/lib/format';
import { INVOICE_NEW_LINES, INVOICE_STATUS, INVOICES } from '@/lib/data/invoices';

interface DocLine {
  name: string;
  sku: string;
  qty: number;
  priceStr: string;
  discStr: string;
  lineStr: string;
}

const topBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  height: 38,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text2)',
  fontSize: 13,
  fontWeight: 600,
};

export default function DocumentoPage({ searchParams }: { searchParams: { n?: string } }) {
  const sel = INVOICES.find((i) => i.number === searchParams.n);

  // Deriva os valores do documento (idêntico ao design: factura existente vs. nova).
  let docNumber: string,
    docClient: string,
    docClientAddr: string,
    docClientNuit: string,
    docDate: string,
    docDue: string;
  let status: keyof typeof INVOICE_STATUS;
  let lines: DocLine[];
  let subStr: string, discStr: string, baseStr: string, taxStr: string, totalStr: string;

  if (sel) {
    const base = Math.round(sel.total / 1.16);
    const tax = sel.total - base;
    docNumber = sel.number;
    docClient = sel.client;
    docClientAddr = 'Maputo · Moçambique';
    docClientNuit = sel.nuit;
    docDate = sel.date;
    docDue = sel.due;
    status = sel.status;
    lines = [
      { name: 'Mercadorias e serviços facturados', sku: sel.number, qty: 1, priceStr: fmt(base), discStr: '—', lineStr: fmt(base) },
    ];
    subStr = fmt(base);
    discStr = '—';
    baseStr = fmt(base);
    taxStr = fmt(tax);
    totalStr = fmt(sel.total);
  } else {
    const sub = INVOICE_NEW_LINES.reduce((a, l) => a + l.qty * l.price, 0);
    const disc = INVOICE_NEW_LINES.reduce((a, l) => a + l.qty * l.price * (l.disc / 100), 0);
    const base = sub - disc;
    const tax = base * 0.16;
    docNumber = 'FT 2026/0337';
    docClient = 'Distribuidora Maputo, Lda';
    docClientAddr = 'Av. 24 de Julho, nº 1290 · Maputo';
    docClientNuit = '400 785 214';
    docDate = '23/06/2026';
    docDue = '23/07/2026';
    status = 'pendente';
    lines = INVOICE_NEW_LINES.map((l) => ({
      name: l.name,
      sku: l.sku,
      qty: l.qty,
      priceStr: fmt(l.price),
      discStr: l.disc > 0 ? `${l.disc}%` : '—',
      lineStr: fmt(l.qty * l.price * (1 - l.disc / 100)),
    }));
    subStr = fmt(sub);
    discStr = `− ${fmt(disc)}`;
    baseStr = fmt(base);
    taxStr = fmt(tax);
    totalStr = fmt(base + tax);
  }

  const [statusLabel, statusColor, statusBg] = INVOICE_STATUS[status];
  const docTh: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '.5px',
    textTransform: 'uppercase',
  };

  return (
    <div data-screen-label="Factura (documento)">
      <div
        className="ants-noprint"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 26px 0' }}
      >
        <Link href="/facturas" style={topBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar às facturas
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <button style={topBtn}>
            <Icon name="send" size={16} />
            Enviar
          </button>
          <button style={topBtn}>
            <Icon name="download" size={16} />
            PDF
          </button>
          <PrintButton />
        </div>
      </div>

      <div className="ants-docwrap" style={{ padding: '18px 26px 40px', display: 'flex', justifyContent: 'center' }}>
        <div
          className="ants-sheet"
          style={{
            width: '100%',
            maxWidth: 800,
            background: '#ffffff',
            color: '#16282c',
            border: '1px solid #e6eaea',
            borderRadius: 6,
            boxShadow: '0 10px 40px rgba(16,40,45,.12)',
            padding: '46px 48px',
            fontSize: 13,
          }}
        >
          {/* Cabeçalho */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, paddingBottom: 22, borderBottom: '2px solid #13343b' }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ width: 54, height: 54, borderRadius: 12, background: '#0e2a30', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 26, flex: 'none' }}>
                A
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0e2a30', letterSpacing: '-.2px' }}>ANTS Comercial, Lda</div>
                <div style={{ fontSize: 11.5, color: '#5f7378', lineHeight: 1.65, marginTop: 4 }}>
                  Av. 25 de Setembro, nº 1402 · Maputo
                  <br />
                  Tel: +258 21 300 400 · geral@antscomercial.co.mz
                  <br />
                  <strong style={{ color: '#16282c' }}>NUIT:</strong> 400 123 456
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '1px', color: '#13343b' }}>FACTURA</div>
              <div className="font-mono" style={{ fontSize: 12.5, color: '#5f7378', marginTop: 6 }}>
                {docNumber}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: statusColor, background: statusBg, padding: '3px 10px', borderRadius: 20, marginTop: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                {statusLabel}
              </div>
            </div>
          </div>

          {/* Facturar a + datas */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 22 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.6px', color: '#8aa0a3', textTransform: 'uppercase', marginBottom: 7 }}>Facturar a</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#16282c' }}>{docClient}</div>
              <div style={{ fontSize: 12, color: '#5f7378', lineHeight: 1.6, marginTop: 3 }}>
                {docClientAddr}
                <br />
                <strong style={{ color: '#16282c' }}>NUIT:</strong> {docClientNuit}
              </div>
            </div>
            <div style={{ width: 230, flex: 'none' }}>
              {[
                ['Data de emissão', docDate, true],
                ['Vencimento', docDue, true],
                ['Pagamento', 'Transferência', false],
              ].map(([l, v, border]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: border ? '1px solid #f0f3f3' : undefined }}>
                  <span style={{ fontSize: 11.5, color: '#5f7378' }}>{l}</span>
                  <span className="tnum" style={{ fontSize: 12, fontWeight: 600 }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Linhas */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 22 }}>
            <thead>
              <tr style={{ background: '#13343b', color: '#fff' }}>
                <th style={{ ...docTh, textAlign: 'left', borderRadius: '6px 0 0 6px' }}>Descrição</th>
                <th style={{ ...docTh, textAlign: 'center', width: 56 }}>Qtd</th>
                <th style={{ ...docTh, textAlign: 'right', width: 110 }}>Preço unit.</th>
                <th style={{ ...docTh, textAlign: 'right', width: 60 }}>Desc.</th>
                <th style={{ ...docTh, textAlign: 'right', width: 120, borderRadius: '0 6px 6px 0' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eef2f2' }}>
                  <td style={{ padding: '11px 12px', fontSize: 12.5, color: '#16282c' }}>
                    <div style={{ fontWeight: 500 }}>{l.name}</div>
                    <div className="font-mono" style={{ fontSize: 10.5, color: '#9aa7a9' }}>
                      {l.sku}
                    </div>
                  </td>
                  <td className="tnum" style={{ padding: '11px 12px', textAlign: 'center', fontSize: 12.5 }}>
                    {l.qty}
                  </td>
                  <td className="tnum" style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {l.priceStr}
                  </td>
                  <td className="tnum" style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12.5, color: '#5f7378' }}>
                    {l.discStr}
                  </td>
                  <td className="tnum" style={{ padding: '11px 12px', textAlign: 'right', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {l.lineStr}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagamento + totais */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 22 }}>
            <div style={{ flex: 1, maxWidth: 330 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.6px', color: '#8aa0a3', textTransform: 'uppercase', marginBottom: 7 }}>Pagamento</div>
              <div style={{ fontSize: 11.5, color: '#5f7378', lineHeight: 1.7 }}>
                Transferência bancária para:
                <br />
                <strong style={{ color: '#16282c' }}>BCI</strong> — Conta 1234567890 · IBAN MZ59 0001 0000 1234 5678 9101 2
                <br />
                <strong style={{ color: '#16282c' }}>Millennium BIM</strong> — Conta 7654321098
                <br />
                Referência: {docNumber}
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 64, height: 64, borderRadius: 8, background: 'repeating-linear-gradient(45deg,#16282c,#16282c 3px,#fff 3px,#fff 6px)', flex: 'none' }} />
                <span style={{ fontSize: 10.5, color: '#9aa7a9', lineHeight: 1.5 }}>Leia o código para validar a factura no Portal da Autoridade Tributária.</span>
              </div>
            </div>
            <div style={{ width: 280, flex: 'none' }}>
              {[
                ['Subtotal', subStr, '#16282c', false],
                ['Desconto', discStr, '#c2453d', false],
                ['Incidência IVA', baseStr, '#16282c', true],
                ['IVA (16%)', taxStr, '#16282c', true],
              ].map(([l, v, color, border]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: border ? '1px solid #eef2f2' : undefined }}>
                  <span style={{ fontSize: 12.5, color: '#5f7378' }}>{l}</span>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: color as string }}>
                    {v}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', marginTop: 8, background: '#13343b', color: '#fff', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>TOTAL A PAGAR</span>
                <span className="tnum" style={{ fontSize: 18, fontWeight: 700 }}>
                  {totalStr}
                </span>
              </div>
            </div>
          </div>

          {/* Assinaturas */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 40, marginTop: 46, paddingTop: 14 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #b0bcbc', paddingTop: 7, fontSize: 11.5, color: '#5f7378' }}>O Cliente</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #b0bcbc', paddingTop: 7, fontSize: 11.5, color: '#5f7378' }}>Pela ANTS Comercial, Lda</div>
            </div>
          </div>

          <div style={{ marginTop: 30, paddingTop: 14, borderTop: '1px solid #eef2f2', textAlign: 'center', fontSize: 10.5, color: '#9aa7a9', lineHeight: 1.6 }}>
            Obrigado pela sua preferência. Esta factura foi processada por programa certificado nº 0042/AT/2026.
            <br />
            ANTS Comercial, Lda · NUIT 400 123 456 · Capital social 500 000,00 MT · Conservatória de Maputo
          </div>
        </div>
      </div>
    </div>
  );
}
