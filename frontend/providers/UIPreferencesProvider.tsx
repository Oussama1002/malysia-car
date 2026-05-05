import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfort' | 'executive';

interface UIPrefs {
  theme: Theme;
  density: Density;
  sidebarCollapsed: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  toggleSidebar: () => void;
}

const STORAGE = 'df_ui_prefs_v1';

const Ctx = createContext<UIPrefs | null>(null);

function load(): { theme: Theme; density: Density; sidebarCollapsed: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        theme: p.theme === 'dark' ? 'dark' : 'light',
        density: ['compact', 'comfort', 'executive'].includes(p.density) ? p.density : 'comfort',
        sidebarCollapsed: !!p.sidebarCollapsed,
      };
    }
  } catch {
    /* ignore */
  }
  const mql = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)');
  return { theme: mql && mql.matches ? 'dark' : 'light', density: 'comfort', sidebarCollapsed: false };
}

function applyDom(theme: Theme, density: Density) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-density', density);
  // Bridge to Tailwind's darkMode: 'class'
  root.classList.toggle('dark', theme === 'dark');
}

export const UIPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState(load);

  useEffect(() => {
    applyDom(state.theme, state.density);
    localStorage.setItem(STORAGE, JSON.stringify(state));
  }, [state]);

  const value = useMemo<UIPrefs>(
    () => ({
      theme: state.theme,
      density: state.density,
      sidebarCollapsed: state.sidebarCollapsed,
      toggleTheme: () => setState((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (t) => setState((s) => ({ ...s, theme: t })),
      setDensity: (d) => setState((s) => ({ ...s, density: d })),
      toggleSidebar: () => setState((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    [state],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useUIPrefs(): UIPrefs {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUIPrefs must be used inside <UIPreferencesProvider>');
  return v;
}
