'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export interface TrialBalanceColumnOption {
  key: string;
  label: string;
}

/**
 * Selector de colunas do Balancete (S11). O estado vive no URL (`cols=a,b,c`),
 * pelo que comanda o ecrã, a impressão e o link de exportação CSV de uma vez.
 * Client component: as colunas chegam por props do Server Component — nunca
 * importar aqui o barrel `@ants/domain` (arrasta módulos server-only).
 */
export function TrialBalanceColumnSelector({ options, selected, defaultKeys }: { options: TrialBalanceColumnOption[]; selected: string[]; defaultKeys: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const apply = (next: string[]) => {
    const qs = new URLSearchParams(searchParams.toString());
    // A ordem canónica é a de `options`; lista vazia é explícita («só Conta/Nome»).
    qs.set('cols', options.filter((o) => next.includes(o.key)).map((o) => o.key).join(',') || 'none');
    router.replace(`/contabilidade?${qs.toString()}`, { scroll: false });
  };

  const toggle = (key: string) => {
    apply(selected.includes(key) ? selected.filter((c) => c !== key) : [...selected, key]);
  };

  const isDefault = selected.length === defaultKeys.length && defaultKeys.every((c) => selected.includes(c));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Colunas</span>
      {options.map((option) => (
        <label key={option.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={selected.includes(option.key)} onChange={() => toggle(option.key)} style={{ accentColor: 'var(--accent-fg)' }} />
          {option.label}
        </label>
      ))}
      {!isDefault ? (
        <button
          type="button"
          onClick={() => apply(defaultKeys)}
          style={{ border: 'none', background: 'none', color: 'var(--accent-fg)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          Repor padrão
        </button>
      ) : null}
    </div>
  );
}
