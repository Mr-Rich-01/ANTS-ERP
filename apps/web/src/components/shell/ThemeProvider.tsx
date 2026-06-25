'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ShellState {
  theme: Theme;
  toggleTheme: () => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
}

const ShellContext = createContext<ShellState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [collapsed, setCollapsed] = useState(false);

  // Restaura preferências do utilizador.
  useEffect(() => {
    const storedTheme = localStorage.getItem('ants-theme') as Theme | null;
    if (storedTheme === 'dark' || storedTheme === 'light') setTheme(storedTheme);
    const storedCollapsed = localStorage.getItem('ants-collapsed');
    if (storedCollapsed === '1') setCollapsed(true);
  }, []);

  // Aplica o tema no <html> (o design usa html[data-theme="..."]).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ants-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('ants-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);

  return (
    <ShellContext.Provider value={{ theme, toggleTheme, collapsed, toggleCollapsed }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell deve ser usado dentro de ThemeProvider');
  return ctx;
}
