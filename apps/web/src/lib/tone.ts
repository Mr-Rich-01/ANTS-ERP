// Mapa de tons (T) — portado do design. Cada tom → [cor de texto, cor de fundo].
export type Tone = 'petroleum' | 'green' | 'red' | 'amber' | 'blue' | 'gray';

export const TONE: Record<Tone, [string, string]> = {
  petroleum: ['var(--accent-fg)', 'var(--accent-bg)'],
  green: ['var(--ok)', 'var(--ok-bg)'],
  red: ['var(--bad)', 'var(--bad-bg)'],
  amber: ['var(--warn)', 'var(--warn-bg)'],
  blue: ['var(--info)', 'var(--info-bg)'],
  gray: ['var(--text2)', 'var(--bd-soft)'],
};
