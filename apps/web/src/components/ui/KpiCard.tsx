import { Icon } from '@/components/Icon';
import { TONE, type Tone } from '@/lib/tone';

export interface KpiCardData {
  label: string;
  valueStr: string;
  sub: string;
  tone: Tone;
  icon: string;
  /** Cor do valor (opcional). Por omissão usa --text. */
  valueColor?: string;
}

/** Cartão KPI reutilizável (padrão do design: label + chip de ícone, valor mono, sub). */
export function KpiCard({ label, valueStr, sub, tone, icon, valueColor }: KpiCardData) {
  const [color, bg] = TONE[tone];
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text2)', fontWeight: 500 }}>{label}</span>
        <span style={{ color, background: bg, padding: 7, borderRadius: 9, display: 'inline-flex' }}>
          <Icon name={icon} size={17} />
        </span>
      </div>
      <div className="tnum" style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.6px', color: valueColor ?? 'var(--text)' }}>
        {valueStr}
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{sub}</span>
    </div>
  );
}

/** Grelha responsiva de KPIs (minmax 220). */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
      {children}
    </div>
  );
}
