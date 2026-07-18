'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useShell } from './ThemeProvider';
import { ACCENT, activeNavId, ROUTE_TO_SCREEN, visibleNav, type ScreenId } from '@/lib/erp-nav';

interface SidebarProps {
  permissions: string[];
  isPlatformAdmin: boolean;
  /** URL do logótipo da empresa activa (S4); null = monograma por omissão. */
  companyLogoUrl?: string | null;
  companyName?: string | null;
}

export function Sidebar({ permissions, isPlatformAdmin, companyLogoUrl, companyName }: SidebarProps) {
  const pathname = usePathname();
  const { collapsed } = useShell();
  const showLabels = !collapsed;

  const groups = visibleNav(new Set(permissions), isPlatformAdmin);
  const currentScreen: ScreenId = ROUTE_TO_SCREEN[pathname] ?? 'dashboard';
  const activeId = activeNavId(currentScreen);
  const navWidth = collapsed ? 74 : 248;
  const navJustify = collapsed ? 'center' : 'flex-start';

  return (
    <aside
      className="ants-noprint ants-tz"
      style={{
        width: navWidth,
        flex: 'none',
        background: 'var(--sidebar)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width .18s ease',
        overflow: 'hidden',
      }}
    >
      {/* Logótipo */}
      <div
        style={{
          height: 62,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '0 16px',
          borderBottom: '1px solid rgba(255,255,255,.07)',
        }}
      >
        {companyLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={companyLogoUrl}
            alt=""
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              objectFit: 'contain',
              flex: 'none',
              background: '#fff',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)',
            }}
          />
        ) : (
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: ACCENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
              fontWeight: 700,
              fontSize: 17,
              color: '#fff',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)',
            }}
          >
            {(companyName ?? 'A').charAt(0).toUpperCase()}
          </div>
        )}
        {showLabels && (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05, minWidth: 0 }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '.3px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {companyName ?? 'ANTS'}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: 'rgba(255,255,255,.45)',
                letterSpacing: '2.5px',
              }}
            >
              ERP SYSTEM
            </span>
          </div>
        )}
      </div>

      {/* Navegação */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px 10px 18px' }}>
        {groups.map((group) => (
          <div key={group.label} style={{ marginBottom: 16 }}>
            {showLabels && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '1.4px',
                  color: 'rgba(255,255,255,.32)',
                  padding: '0 10px 7px',
                }}
              >
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = item.id === activeId;
              return (
                <Link
                  key={item.id}
                  href={item.route}
                  title={item.label}
                  className="ants-navlink"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    justifyContent: navJustify,
                    padding: '9px 11px',
                    marginBottom: 2,
                    borderRadius: 9,
                    textDecoration: 'none',
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: active ? '#ffffff' : 'rgba(255,255,255,.62)',
                    background: active ? 'rgba(255,255,255,.11)' : 'transparent',
                    boxShadow: active ? `inset 3px 0 0 ${ACCENT}` : 'none',
                    transition: 'background .12s',
                  }}
                >
                  <span style={{ display: 'inline-flex', flex: 'none', color: 'inherit' }}>
                    <Icon name={item.icon} size={18} strokeWidth={1.7} />
                  </span>
                  {showLabels && (
                    <span
                      style={{
                        flex: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.label}
                    </span>
                  )}
                  {item.badge && showLabels && (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        background: ACCENT,
                        color: '#fff',
                        borderRadius: 20,
                        padding: '1px 7px',
                        flex: 'none',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Suporte */}
      <div style={{ flex: 'none', padding: 12, borderTop: '1px solid rgba(255,255,255,.07)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 8,
            borderRadius: 10,
            background: 'rgba(255,255,255,.05)',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,.6)', flex: 'none', display: 'inline-flex' }}>
            <Icon name="life-buoy" size={17} />
          </span>
          {showLabels && (
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Suporte ANTS</span>
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.45)' }}>Ajuda &amp; contacto</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
