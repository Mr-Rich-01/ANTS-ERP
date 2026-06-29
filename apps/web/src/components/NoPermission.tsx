import { Icon } from '@/components/Icon';

/**
 * Vista de "sem permissão" — substitui o redirect('/') silencioso (que causava o
 * salto inesperado para o dashboard após router.refresh quando a sessão não tinha
 * a permissão). Mostra uma mensagem clara e mantém o utilizador no ecrã pedido.
 */
export function NoPermission({ message = 'Não tem permissão para ver este módulo.' }: { message?: string }) {
  return (
    <div style={{ padding: '60px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
      <span style={{ color: 'var(--text3)', background: 'var(--bd-soft)', padding: 14, borderRadius: 14, display: 'inline-flex' }}>
        <Icon name="lock" size={22} />
      </span>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Acesso restrito</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 420 }}>{message}</div>
    </div>
  );
}
