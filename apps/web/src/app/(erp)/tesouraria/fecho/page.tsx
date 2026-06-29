import Link from 'next/link';
import { redirect } from 'next/navigation';
import { forCompany } from '@ants/database';
import { dailyReport, hasPermission, listAccounts } from '@ants/domain';
import { getContext } from '@/lib/session';
import { Icon } from '@/components/Icon';
import { PrintButton } from '@/components/PrintButton';
import { fmt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--text3)', textTransform: 'uppercase', borderBottom: '1px solid var(--bd-soft)' };
const backBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, width: 'max-content' };
const selectStyle: React.CSSProperties = { height: 36, borderRadius: 9, border: '1px solid var(--field-bd)', background: 'var(--field)', padding: '0 10px', fontSize: 12.5, color: 'var(--text)', outline: 'none' };

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default async function FechoPage({ searchParams }: { searchParams: { account?: string; date?: string } }) {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'treasury.view')) redirect('/tesouraria');

  const db = forCompany(ctx.companyId);
  const accounts = await listAccounts(db, ctx);
  if (accounts.length === 0) {
    return (
      <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Link href="/tesouraria" style={backBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar à tesouraria
        </Link>
        <div style={{ padding: '50px 26px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>Ainda não há contas configuradas.</div>
      </div>
    );
  }

  const accountId = accounts.find((a) => a.id === searchParams.account)?.id ?? accounts[0]!.id;
  const date = searchParams.date || todayISO();
  const report = await dailyReport(db, ctx, accountId, date);

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ants-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/tesouraria" style={backBtn}>
          <Icon name="arrow-left" size={16} />
          Voltar à tesouraria
        </Link>
        <form method="get" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select name="account" defaultValue={accountId} style={selectStyle}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input type="date" name="date" defaultValue={date} style={selectStyle} />
          <button type="submit" style={{ ...backBtn, height: 36 }}>
            <Icon name="search" size={15} />
            Ver
          </button>
          <PrintButton />
        </form>
      </div>

      <div className="ants-docwrap" style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="ants-sheet" style={{ width: '100%', maxWidth: 760, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', borderBottom: '1px solid var(--bd-soft)', paddingBottom: 16 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Relatório diário de caixa</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 4 }}>
                {report.accountName} · {report.date}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--text2)' }}>
              Operador
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{report.operator}</div>
            </div>
          </div>

          {/* Resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, margin: '18px 0' }}>
            {[
              ['Saldo inicial', fmt(report.openingBalance), 'var(--text)'],
              ['Entradas', `+ ${fmt(report.totalIn)}`, 'var(--ok)'],
              ['Saídas', `− ${fmt(report.totalOut)}`, 'var(--bad)'],
              ['Saldo final', fmt(report.closingBalance), 'var(--accent-fg)'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ border: '1px solid var(--border)', borderRadius: 11, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{l}</div>
                <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Movimentos do dia */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--card2)' }}>
                  <th style={th}>Hora</th>
                  <th style={th}>Categoria</th>
                  <th style={th}>Descrição</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                  <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {report.movements.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Sem movimentos neste dia.</td>
                  </tr>
                ) : (
                  report.movements.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--bd-soft2)' }}>
                      <td className="tnum" style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{fmtTime(m.occurredAt)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text2)' }}>{m.category}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text)' }}>
                        {m.description ?? '—'}
                        {m.document ? <span className="font-mono" style={{ color: 'var(--text3)' }}> · {m.document}</span> : null}
                      </td>
                      <td className="tnum" style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: m.flow === 'IN' ? 'var(--ok)' : 'var(--bad)' }}>
                        {m.flow === 'IN' ? '+ ' : '− '}
                        {fmt(m.amount)}
                      </td>
                      <td className="tnum" style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>{fmt(m.balanceAfter)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Assinaturas */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 40, marginTop: 44 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid var(--bd-soft)', paddingTop: 7, fontSize: 11.5, color: 'var(--text3)' }}>O Operador ({report.operator})</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid var(--bd-soft)', paddingTop: 7, fontSize: 11.5, color: 'var(--text3)' }}>Conferido por</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
