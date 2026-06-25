'use client';

import { usePathname } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ROUTE_TO_SCREEN, SCREENS } from '@/lib/erp-nav';

const actionBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  height: 36,
  padding: '0 13px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--text2)',
};

export function ScreenHeader() {
  const pathname = usePathname();
  const screen = SCREENS[ROUTE_TO_SCREEN[pathname] ?? 'dashboard'];

  return (
    <div
      className="ants-noprint"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        padding: '22px 26px 4px',
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            color: 'var(--text3)',
            marginBottom: 5,
          }}
        >
          <Icon name="home" size={13} />
          <span>{screen.group}</span>
          <Icon name="chevron-right" size={13} />
          <span style={{ color: 'var(--text2)', fontWeight: 500 }}>{screen.title}</span>
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-.4px',
            color: 'var(--text)',
          }}
        >
          {screen.title}
        </h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            fontSize: 11.5,
            color: 'var(--text3)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Icon name="refresh-cw" size={13} />
          Actualizado há 4 min
        </span>
        <button style={actionBtn}>
          <Icon name="sliders-horizontal" size={15} />
          Filtros
        </button>
        <button style={actionBtn}>
          <Icon name="download" size={15} />
          Exportar
        </button>
      </div>
    </div>
  );
}
