import Link from 'next/link';
import { forCompany } from '@ants/database';
import { getInventoryRegularizationPreview, hasPermission, DomainError } from '@ants/domain';
import { Icon } from '@/components/Icon';
import { NoPermission } from '@/components/NoPermission';
import { getContext } from '@/lib/session';
import { RegularizacaoClient } from './RegularizacaoClient';

export const dynamic = 'force-dynamic';

/**
 * Regularização retroactiva de existências (S10c). A pré-visualização é calculada
 * no servidor a cada carregamento — os valores NUNCA são constantes; a execução
 * recomputa dentro da transacção e falha se entretanto mudaram.
 */
export default async function RegularizacaoPage() {
  const ctx = await getContext();
  if (!ctx.companyId || !hasPermission(ctx, 'accounting.post')) {
    return <NoPermission message="A regularização de existências exige a permissão de confirmar lançamentos (accounting.post)." />;
  }

  const db = forCompany(ctx.companyId);
  let preview = null;
  let configError: string | null = null;
  try {
    preview = await getInventoryRegularizationPreview(db, ctx);
  } catch (e) {
    if (e instanceof DomainError) configError = e.message;
    else throw e;
  }

  return (
    <div style={{ padding: '14px 26px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 9, borderRadius: 10, display: 'inline-flex' }}>
          <Icon name="scale" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Regularização de existências</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 4 }}>
            Compara o stock físico valorizado ao custo médio corrente com o saldo contabilístico da conta de existências e lança a diferença no Diário de Abertura. O valor é calculado agora — reveja o detalhe por produto antes de confirmar.
          </div>
        </div>
        <Link href="/contabilidade/lancamentos" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
          <Icon name="pen-line" size={14} />
          Lançamentos manuais
        </Link>
      </div>

      {configError ? (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', border: '1px solid var(--bad)', background: 'var(--bad-bg)', color: 'var(--text)', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, lineHeight: 1.5 }}>
          <Icon name="alert-triangle" size={16} color="var(--bad)" />
          <span>{configError}</span>
        </div>
      ) : preview ? (
        <RegularizacaoClient preview={preview} />
      ) : null}
    </div>
  );
}
