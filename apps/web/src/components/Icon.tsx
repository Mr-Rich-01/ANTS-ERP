import { icons, type LucideProps } from 'lucide-react';

/** Converte um nome kebab-case do Lucide ('layout-dashboard') em PascalCase ('LayoutDashboard'). */
function toPascal(name: string): string {
  return name
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

interface IconProps extends Omit<LucideProps, 'ref'> {
  /** Nome Lucide em kebab-case, tal como no design (data-ic). */
  name: string;
  size?: number;
}

/**
 * Ícone Lucide por nome (replica o `data-ic` do design original).
 * Stroke-width 1.9 por omissão, igual ao design.
 */
export function Icon({ name, size = 18, strokeWidth = 1.9, ...rest }: IconProps) {
  const Cmp = icons[toPascal(name) as keyof typeof icons];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={strokeWidth} {...rest} />;
}
