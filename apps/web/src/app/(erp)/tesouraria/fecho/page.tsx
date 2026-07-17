import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { cashClosingReport, getCompanyPrintProfile, hasPermission, listAccounts, type CashClosingCountInput, type CashClosingDifferenceStatus } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { CompanyHeader, DocumentFooter, PrintLayout, SignatureBlock } from '@/components/print/PrintLayout';
import { fmt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd-soft)' };
const backBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' };
const field: React.CSSProperties = { height: 36, borderRadius: 8, border: '1px solid var(--field-bd)', background: 'var(--field)', padding: '0 10px', fontSize: 12.5, color: 'var(--text)', outline: 'none', width: '100%' };
const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text2)' };
const cardStyle: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', background: 'var(--card)' };

type SearchParams = {
  account?: string;
  date?: string;
  cashCount?: string;
  mpesaCount?: string;
  emolaCount?: string;
  cardBankCount?: string;
  observations?: string;
};

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cleanNumber(value: string | undefined): number | undefined {
  const v = value?.trim();
  return v ? Number(v.replace(',', '.')) : undefined;
}

function countedFromSearch(searchParams: SearchParams): CashClosingCountInput {
  return {
    cash: cleanNumber(searchParams.cashCount),
    mpesa: cleanNumber(searchParams.mpesaCount),
    emola: cleanNumber(searchParams.emolaCount),
    cardBank: cleanNumber(searchParams.cardBankCount),
    observations: searchParams.observations?.trim() || undefined,
  };
}

function statusColor(status: CashClosingDifferenceStatus): string {
  if (status === 'NONE') return 'var(--ok)';
  if (status === 'SURPLUS') return 'var(--warn)';
  if (status === 'SHORTAGE') return 'var(--bad)';
  return 'var(--text2)';
}

function exportHref(accountId: string, date: string): string {
  const qs = new URLSearchParams({ account: accountId, date });
  return `/tesouraria/fecho/exportar?${qs.toString()}`;
}

export default async function FechoPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'treasury.viewReports')) redirect('/tesouraria');

  const db = forCompany(ctx.companyId);
  const accounts = await listAccounts(db, ctx);
  if (accounts.length === 0) {
    return (
      <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Link href="/tesouraria" style={backBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar a tesouraria
        </Link>
        <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>Ainda nao ha contas configuradas.</div>
      </div>
    );
  }

  const accountId = accounts.find((a) => a.id === searchParams.account)?.id ?? accounts[0]!.id;
  const date = searchParams.date || todayISO();
  const [report, company] = await Promise.all([
    cashClosingReport(db, ctx, { accountId, dateISO: date, counted: countedFromSearch(searchParams) }),
    getCompanyPrintProfile(db, ctx),
  ]);
  const canExport = hasPermission(ctx, 'reports.export');
  const dayNet = report.daily.totalIn - report.daily.totalOut;

  const summaryCards: Array<[string, string, string]> = [
    ['Saldo inicial', fmt(report.daily.openingBalance), 'var(--text)'],
    ['Entradas', `+ ${fmt(report.daily.totalIn)}`, 'var(--ok)'],
    ['Saidas', `- ${fmt(report.daily.totalOut)}`, 'var(--bad)'],
    ['Saldo esperado', fmt(report.expectedTotal), 'var(--accent-fg)'],
    ['Valor contado', report.counted.provided ? fmt(report.counted.total) : 'Por informar', report.counted.provided ? 'var(--text)' : 'var(--text2)'],
    ['Diferenca', report.counted.provided ? fmt(report.difference) : 'Por calcular', statusColor(report.differenceStatus)],
    ['Estado', report.differenceStatusLabel, statusColor(report.differenceStatus)],
    ['Total do dia', fmt(dayNet), dayNet >= 0 ? 'var(--ok)' : 'var(--bad)'],
  ];

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/tesouraria" style={backBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar a tesouraria
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {canExport ? (
            <Link href={exportHref(accountId, date)} style={backBtn}>
              <Icon name="download" size={15} />
              CSV
            </Link>
          ) : null}
          <PrintButton label="Imprimir / Guardar PDF" />
        </div>
      </div>

      <form method="get" className="ants-noprint" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, alignItems: 'end', ...cardStyle }}>
        <label style={labelStyle}>
          Conta de tesouraria
          <select name="account" defaultValue={accountId} style={field}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Data
          <input type="date" name="date" defaultValue={date} style={field} />
        </label>
        <label style={labelStyle}>
          Dinheiro contado
          <input type="number" min="0" step="0.01" name="cashCount" defaultValue={searchParams.cashCount ?? ''} style={field} />
        </label>
        <label style={labelStyle}>
          M-Pesa contado
          <input type="number" min="0" step="0.01" name="mpesaCount" defaultValue={searchParams.mpesaCount ?? ''} style={field} />
        </label>
        <label style={labelStyle}>
          e-Mola contado
          <input type="number" min="0" step="0.01" name="emolaCount" defaultValue={searchParams.emolaCount ?? ''} style={field} />
        </label>
        <label style={labelStyle}>
          Cartao/Banco contado
          <input type="number" min="0" step="0.01" name="cardBankCount" defaultValue={searchParams.cardBankCount ?? ''} style={field} />
        </label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
          Observacoes
          <textarea name="observations" defaultValue={searchParams.observations ?? ''} rows={3} style={{ ...field, height: 'auto', paddingTop: 9, resize: 'vertical' }} />
        </label>
        <button type="submit" style={{ ...backBtn, height: 38, justifyContent: 'center', color: 'var(--accent-fg)' }}>
          <Icon name="calculator" size={15} />
          Preparar relatorio de fecho
        </button>
      </form>

      <PrintLayout>
        <CompanyHeader
          company={company}
          title="Fecho de caixa V1"
          documentNumber={report.daily.date}
          meta={
            <div style={{ fontSize: 12.5, color: '#5f7378', lineHeight: 1.5 }}>
              {report.daily.accountName}
              <br />
              Caixa: {report.daily.operator}
            </div>
          }
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', borderBottom: '1px solid var(--bd-soft)', paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Preparacao de fecho de caixa</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 4 }}>
              {report.daily.accountName} · {report.daily.date}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--text2)' }}>
            Operador
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{report.daily.operator}</div>
          </div>
        </div>

        <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid var(--bd-soft)', borderRadius: 8, color: 'var(--text2)', fontSize: 12.5 }}>
          Este relatorio e operacional e nao grava um fecho formal. Turnos, aprovacao, bloqueio apos fecho e persistencia oficial ficam para fase futura.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, margin: '16px 0' }}>
          {summaryCards.map(([label, value, color]) => (
            <div key={label} style={cardStyle}>
              <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{label}</div>
              <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
          {[
            ['Vendas POS', fmt(report.posSalesTotal), 'var(--ok)'],
            ['Recebimentos', fmt(report.receiptTotal), 'var(--ok)'],
            ['Pagamentos', fmt(report.supplierPaymentTotal), 'var(--bad)'],
            ['Transferencias', fmt(report.transferTotal), 'var(--text2)'],
          ].map(([label, value, color]) => (
            <div key={label} style={cardStyle}>
              <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{label}</div>
              <div className="tnum" style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Metodo</th>
                <th style={{ ...th, textAlign: 'right' }}>Entradas</th>
                <th style={{ ...th, textAlign: 'right' }}>Saidas</th>
                <th style={{ ...th, textAlign: 'right' }}>Contado</th>
              </tr>
            </thead>
            <tbody>
              {report.methodTotals.map((method) => (
                <tr key={method.method} style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                  <td style={{ padding: '9px 12px', fontSize: 12.5, color: 'var(--text)' }}>{method.label}</td>
                  <td className="tnum" style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--ok)' }}>{fmt(method.expectedIn)}</td>
                  <td className="tnum" style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--bad)' }}>{fmt(method.expectedOut)}</td>
                  <td className="tnum" style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text2)' }}>{report.counted.provided ? fmt(method.counted) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--card2)' }}>
                <th style={th}>Hora</th>
                <th style={th}>Origem</th>
                <th style={th}>Metodo</th>
                <th style={th}>Descricao</th>
                <th style={{ ...th, textAlign: 'right' }}>Entrada</th>
                <th style={{ ...th, textAlign: 'right' }}>Saida</th>
                <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {report.movements.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Sem movimentos neste dia.</td>
                </tr>
              ) : (
                report.movements.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                    <td className="tnum" style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text2)' }}>{fmtTime(m.occurredAt)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text2)' }}>{m.originLabel}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text2)' }}>{m.methodLabel}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text)' }}>
                      {m.description ?? '-'}
                      <span className="font-mono" style={{ color: 'var(--text3)' }}> · {m.reference}</span>
                    </td>
                    <td className="tnum" style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--ok)' }}>{m.entry ? fmt(m.entry) : '-'}</td>
                    <td className="tnum" style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--bad)' }}>{m.exit ? fmt(m.exit) : '-'}</td>
                    <td className="tnum" style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>{fmt(m.balanceAfter)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, border: '1px solid var(--bd-soft)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase' }}>Observacoes</div>
          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 5 }}>{report.counted.observations ?? 'Sem observacoes.'}</div>
        </div>

        <SignatureBlock leftLabel={`O Caixa (${report.daily.operator})`} rightLabel="Supervisor" />
        <DocumentFooter company={company} />
      </PrintLayout>
    </div>
  );
}
