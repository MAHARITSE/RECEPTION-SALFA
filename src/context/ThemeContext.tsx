import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'salfa_theme';
// Thème par défaut à l'ouverture : clair.
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
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // Le thème reste utilisable lorsque le stockage du navigateur est bloqué.
  }
  // Même valeur que le script d'initialisation dans index.html et le projet Email.
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
