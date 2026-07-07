import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';

interface FutureModuleNoticeProps {
  title: string;
  description: string;
  items: string[];
}

export function FutureModuleNotice({ title, description, items }: FutureModuleNoticeProps) {
  return (
    <div style={{ padding: '14px 26px 30px' }}>
      <section
        style={{
          maxWidth: 760,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '28px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'var(--warn-bg)',
              color: 'var(--warn)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Icon name="clock-3" size={21} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '.7px' }}>
              Futuro
            </span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 750, color: 'var(--text)', letterSpacing: 0 }}>{title}</h1>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text2)' }}>{description}</p>

        <div style={{ display: 'grid', gap: 9 }}>
          {items.map((item) => (
            <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: 'var(--text2)', fontSize: 13.5 }}>
              <span style={{ color: 'var(--warn)', display: 'inline-flex', marginTop: 2, flex: 'none' }}>
                <Icon name="circle-dot" size={14} />
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        <Link
          href="/"
          style={{
            alignSelf: 'flex-start',
            height: 38,
            padding: '0 14px',
            borderRadius: 9,
            background: ACCENT,
            color: '#fff',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <Icon name="arrow-left" size={16} />
          Voltar a modulos V1
        </Link>
      </section>
    </div>
  );
}
