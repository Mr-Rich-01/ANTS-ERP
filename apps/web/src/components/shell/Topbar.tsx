'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useShell } from './ThemeProvider';
import { ACCENT } from '@/lib/erp-nav';
import { logoutAction } from '@/app/(erp)/actions';

interface TopbarProps {
  userName: string;
  userEmail: string;
  userInitials: string;
  companyName: string;
  /** URL do logótipo da empresa activa (S4); null = iniciais. */
  companyLogoUrl?: string | null;
}

// Dados de UI (placeholders). TODO: ligar a sessão/notificações reais nas fases respectivas.
const QUICK_ITEMS: Array<{ icon: string; label: string; href?: string }> = [
  { icon: 'shopping-cart', label: 'Nova venda', href: '/pos' },
  { icon: 'receipt-text', label: 'Nova factura', href: '/facturas/nova' },
  { icon: 'banknote', label: 'Novo pagamento', href: '/tesouraria' },
  { icon: 'user-plus', label: 'Novo cliente', href: '/clientes' },
  { icon: 'building-2', label: 'Novo fornecedor', href: '/fornecedores' },
  { icon: 'package-plus', label: 'Novo produto', href: '/produtos' },
];

const NOTIFICATIONS: Array<{ icon: string; color: string; bg: string; title: string; time: string }> = [
  { icon: 'alert-triangle', color: 'var(--warn)', bg: 'var(--warn-bg)', title: 'Stock baixo: Óleo Fula 1L (38 un.)', time: 'há 8 min' },
  { icon: 'check-circle-2', color: 'var(--ok)', bg: 'var(--ok-bg)', title: 'Pagamento M-Pesa recebido — 3 200,00 MT', time: 'há 22 min' },
  { icon: 'file-clock', color: 'var(--bad)', bg: 'var(--bad-bg)', title: 'Factura #FT-0291 venceu hoje', time: 'há 1 h' },
  { icon: 'user-plus', color: 'var(--info)', bg: 'var(--info-bg)', title: 'Novo cliente registado: Farmácia Sigma', time: 'há 3 h' },
];

const iconBtn: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text2)',
  flex: 'none',
};

function companyInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

export function Topbar({ userName, userEmail, userInitials, companyName, companyLogoUrl }: TopbarProps) {
  const { theme, toggleTheme, toggleCollapsed } = useShell();
  const router = useRouter();
  const [quickOpen, setQuickOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header
      className="ants-noprint ants-tz"
      style={{
        height: 62,
        flex: 'none',
        background: 'var(--header)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        position: 'relative',
        zIndex: 30,
      }}
    >
      <button
        onClick={toggleCollapsed}
        title="Recolher menu"
        style={{ ...iconBtn, width: 36, height: 36, borderRadius: 9 }}
      >
        <Icon name="panel-left" size={18} />
      </button>

      {/* Pesquisa global */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: 'var(--field)',
          border: '1px solid var(--field-bd)',
          borderRadius: 10,
          padding: '0 12px',
          height: 38,
          width: 330,
          maxWidth: '32vw',
        }}
      >
        <span style={{ color: 'var(--text3)', flex: 'none', display: 'inline-flex' }}>
          <Icon name="search" size={17} />
        </span>
        <input
          placeholder="Pesquisar clientes, produtos, facturas…"
          style={{
            border: 'none',
            background: 'none',
            outline: 'none',
            fontSize: 13,
            width: '100%',
            color: 'var(--text)',
          }}
        />
        <span
          style={{
            fontSize: 10.5,
            color: 'var(--text4)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '1px 5px',
            flex: 'none',
          }}
        >
          ⌘K
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <button onClick={toggleTheme} title="Alternar tema" style={iconBtn}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      </button>

      {/* Período */}
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 38,
          padding: '0 12px',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--text)',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <span style={{ color: 'var(--text2)', display: 'inline-flex' }}>
          <Icon name="calendar-days" size={16} />
        </span>
        <span>Junho 2026</span>
        <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
          <Icon name="chevron-down" size={15} />
        </span>
      </button>

      {/* Empresa / filial */}
      <button
        onClick={() => router.push('/seleccionar-empresa')}
        title="Seleccionar empresa"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          height: 38,
          padding: '0 11px 0 8px',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--card)',
        }}
      >
        {companyLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={companyLogoUrl}
            alt=""
            style={{ width: 26, height: 26, borderRadius: 7, objectFit: 'contain', flex: 'none', background: '#fff' }}
          />
        ) : (
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: ACCENT,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flex: 'none',
            }}
          >
            {companyInitials(companyName) || 'E'}
          </span>
        )}
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, textAlign: 'left' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{companyName}</span>
          <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>Empresa activa</span>
        </span>
        <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
          <Icon name="chevrons-up-down" size={15} />
        </span>
      </button>

      {/* + Novo */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => {
            setQuickOpen((v) => !v);
            setNotifOpen(false);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            height: 38,
            padding: '0 14px',
            borderRadius: 10,
            border: 'none',
            background: ACCENT,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <Icon name="plus" size={17} />
          <span>Novo</span>
        </button>
        {quickOpen && (
          <div
            style={{
              position: 'absolute',
              top: 46,
              right: 0,
              width: 236,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 13,
              boxShadow: 'var(--shadow)',
              padding: 6,
              zIndex: 60,
              animation: 'antfade .14s ease both',
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '.8px',
                color: 'var(--text3)',
                padding: '6px 9px 5px',
              }}
            >
              CRIAR RÁPIDO
            </div>
            {QUICK_ITEMS.map((q) => (
              <button
                key={q.label}
                onClick={() => {
                  setQuickOpen(false);
                  if (q.href) router.push(q.href);
                }}
                className="ants-hover"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 10px',
                  border: 'none',
                  background: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  color: 'var(--text)',
                  textAlign: 'left',
                }}
              >
                <span style={{ color: 'var(--accent-fg)', flex: 'none', display: 'inline-flex' }}>
                  <Icon name={q.icon} size={16} />
                </span>
                <span>{q.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notificações */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => {
            setNotifOpen((v) => !v);
            setQuickOpen(false);
          }}
          title="Notificações"
          style={{ ...iconBtn, position: 'relative' }}
        >
          <Icon name="bell" size={18} />
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 9,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--bad)',
              boxShadow: '0 0 0 2px var(--card)',
            }}
          />
        </button>
        {notifOpen && (
          <div
            style={{
              position: 'absolute',
              top: 46,
              right: 0,
              width: 320,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 13,
              boxShadow: 'var(--shadow)',
              padding: 8,
              zIndex: 60,
              animation: 'antfade .14s ease both',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px 10px',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Notificações</span>
              <span style={{ fontSize: 11, color: 'var(--accent-fg)', fontWeight: 600 }}>4 novas</span>
            </div>
            {NOTIFICATIONS.map((n) => (
              <div
                key={n.title}
                className="ants-hover"
                style={{ display: 'flex', gap: 11, padding: '9px 8px', borderRadius: 9 }}
              >
                <span
                  style={{
                    color: n.color,
                    background: n.bg,
                    padding: 7,
                    borderRadius: 9,
                    flex: 'none',
                    alignSelf: 'flex-start',
                    display: 'inline-flex',
                  }}
                >
                  <Icon name={n.icon} size={16} />
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.3 }}>{n.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{n.time}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Perfil */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => {
            setProfileOpen((v) => !v);
            setQuickOpen(false);
            setNotifOpen(false);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            height: 38,
            padding: '0 9px 0 4px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--card)',
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'linear-gradient(135deg,#1b4651,#0e2a30)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              flex: 'none',
            }}
          >
            {userInitials}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, textAlign: 'left' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{userName}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{userEmail}</span>
          </span>
          <span style={{ color: 'var(--text3)', display: 'inline-flex' }}>
            <Icon name="chevron-down" size={15} />
          </span>
        </button>
        {profileOpen && (
          <div
            style={{
              position: 'absolute',
              top: 46,
              right: 0,
              width: 200,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 13,
              boxShadow: 'var(--shadow)',
              padding: 6,
              zIndex: 60,
              animation: 'antfade .14s ease both',
            }}
          >
            <form action={logoutAction}>
              <button
                type="submit"
                className="ants-hover"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 10px',
                  border: 'none',
                  background: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  color: 'var(--bad)',
                  textAlign: 'left',
                }}
              >
                <Icon name="log-out" size={16} />
                Terminar sessão
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
