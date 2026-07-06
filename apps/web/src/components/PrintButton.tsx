'use client';

import { Icon } from '@/components/Icon';
import { ACCENT } from '@/lib/erp-nav';

export function PrintButton({ label = 'Imprimir', title }: { label?: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title={title ?? label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        height: 38,
        padding: '0 16px',
        borderRadius: 10,
        border: 'none',
        background: ACCENT,
        color: '#fff',
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      <Icon name="printer" size={16} />
      {label}
    </button>
  );
}
