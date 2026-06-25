'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ACCENT, ROUTE_TO_SCREEN, SCREENS } from '@/lib/erp-nav';

/**
 * Placeholder de módulo — replica o ecrã `isPlaceholder` do design.
 * Usado nas rotas ainda não portadas (porte ecrã-a-ecrã em curso).
 */
export function ScreenPlaceholder() {
  const pathname = usePathname();
  const screen = SCREENS[ROUTE_TO_SCREEN[pathname] ?? 'dashboard'];

  return (
    <div style={{ padding: '60px 26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          maxWidth: 430,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <span style={{ color: 'var(--accent-fg)', background: 'var(--accent-bg)', padding: 18, borderRadius: 18 }}>
          <Icon name={screen.icon} size={34} />
        </span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Módulo {screen.title}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5 }}>
            Este módulo faz parte do ANTS ERP e está em portagem para a interface final. Segue o mesmo
            padrão visual do sistema.
          </div>
        </div>
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 42,
            padding: '0 18px',
            borderRadius: 11,
            border: 'none',
            background: ACCENT,
            color: '#fff',
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <Icon name="layout-dashboard" size={17} />
          Voltar à Visão Geral
        </Link>
      </div>
    </div>
  );
}
