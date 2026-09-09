import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'salfa_theme';
// L'application démarre toujours en thème CLAIR (voir index.html). Le choix
// fait en cours de session via la bascule n'est pas conservé au redémarrage.
export const DEFAULT_THEME: Theme = 'light';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

function readSavedTheme(): Theme {
  // Démarrage toujours en clair : on ignore toute préférence stockée.
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readSavedTheme);

  useEffect(() => {
    for (const element of [document.documentElement, document.body]) {
      element.classList.toggle('dark', theme === 'dark');
      element.classList.toggle('light', theme === 'light');
      element.dataset.theme = theme;
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', theme === 'dark' ? '#05070a' : '#f8fafc',
    );

    try {
      // Préférence d'affichage uniquement : aucune donnée métier ni session.
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ne pas empêcher la bascule en navigation privée / stockage indisponible.
    }
  }, [theme]);

  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setTheme(isTheme(event.newValue) ? event.newValue : DEFAULT_THEME);
      }
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((previous) => previous === 'dark' ? 'light' : 'dark');
  }, []);

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    toggleTheme,
    setTheme,
  }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme doit être utilisé dans un ThemeProvider.');
  return context;
}
