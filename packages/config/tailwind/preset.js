// Preset Tailwind partilhado — ANTS ERP
// Tokens extraídos EXACTAMENTE do design (design/design-styles.css), mapeados a CSS
// variables definidas em apps/web/src/styles/tokens.css (tema claro + html[data-theme="dark"]).
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        card: 'var(--card)',
        card2: 'var(--card2)',
        card3: 'var(--card3)',
        border: 'var(--border)',
        'bd-soft': 'var(--bd-soft)',
        'bd-soft2': 'var(--bd-soft2)',
        field: 'var(--field)',
        'field-bd': 'var(--field-bd)',
        hover: 'var(--hover)',
        sidebar: 'var(--sidebar)',
        header: 'var(--header)',
        text: {
          DEFAULT: 'var(--text)',
          2: 'var(--text2)',
          3: 'var(--text3)',
          4: 'var(--text4)',
        },
        ok: { DEFAULT: 'var(--ok)', bg: 'var(--ok-bg)' },
        bad: { DEFAULT: 'var(--bad)', bg: 'var(--bad-bg)' },
        warn: { DEFAULT: 'var(--warn)', bg: 'var(--warn-bg)' },
        info: { DEFAULT: 'var(--info)', bg: 'var(--info-bg)' },
        // shadcn/ui — nomes semânticos mapeados aos tokens do ANTS (via tokens.css)
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        input: 'var(--input)',
        ring: 'var(--ring)',
        // 'accent' do shadcn (hover) + os campos do ANTS (fg/bg). DEFAULT = hover.
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)', fg: 'var(--accent-fg)', bg: 'var(--accent-bg)' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        ants: 'var(--shadow)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Hanken Grotesk', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
