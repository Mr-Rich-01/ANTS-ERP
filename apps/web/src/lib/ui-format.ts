/** Iniciais de um nome (até 2). */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

/** Tempo relativo em pt (ex.: "há 5 min", "ontem"). */
export function relativeTime(date: Date | string | null): string {
  if (!date) return 'nunca';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return d.toLocaleDateString('pt-PT');
}

/** Data/hora curta (ex.: "26/06 14:10"). */
export function shortDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

/** Representação compacta de um valor de auditoria (JSON → texto). */
export function auditValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') {
    const vals = Object.values(v as Record<string, unknown>);
    if (vals.length === 1) return String(vals[0]);
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${String(val)}`)
      .join(', ');
  }
  return String(v);
}

/** Tom (cores) de um perfil para o badge. */
export function roleTone(roleName: string): { color: string; bg: string } {
  const map: Record<string, { color: string; bg: string }> = {
    'Administrador da Empresa': { color: 'var(--accent-fg)', bg: 'var(--accent-bg)' },
    Gestor: { color: 'var(--accent-fg)', bg: 'var(--accent-bg)' },
    Contabilista: { color: 'var(--info)', bg: 'var(--info-bg)' },
    Caixa: { color: 'var(--ok)', bg: 'var(--ok-bg)' },
    Vendedor: { color: 'var(--warn)', bg: 'var(--warn-bg)' },
  };
  return map[roleName] ?? { color: 'var(--text2)', bg: 'var(--bd-soft)' };
}
