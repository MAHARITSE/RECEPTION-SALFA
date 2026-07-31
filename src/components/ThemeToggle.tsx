import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export function toggleDarkMode(force?: boolean) {
  const isDark = force !== undefined ? force : !document.documentElement.classList.contains('dark');
  if (isDark) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('salfa_theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('salfa_theme', 'light');
  }
  window.dispatchEvent(new Event('salfa-theme-change'));
  return isDark;
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark') || localStorage.getItem('salfa_theme') === 'dark';
  });

  useEffect(() => {
    const handleSync = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    window.addEventListener('salfa-theme-change', handleSync);
    
    // Observer for class changes on <html>
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('salfa-theme-change', handleSync);
      observer.disconnect();
    };
  }, []);

  const toggle = () => {
    toggleDarkMode();
  };

  return { isDark, toggle };
}

export default function FloatingThemeToggle() {
  const { isDark, toggle } = useDarkMode();

  return (
    <button
      type="button"
      onClick={toggle}
      className="fixed bottom-5 right-5 z-50 p-3 bg-slate-900 dark:bg-slate-100 text-amber-300 dark:text-slate-900 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all cursor-pointer border-2 border-amber-400/50 dark:border-slate-700 flex items-center justify-center gap-2 group"
      title={isDark ? 'Passer au mode clair' : 'Passer au mode sombre'}
      aria-label="Basculer le mode sombre/clair"
    >
      {isDark ? (
        <>
          <Sun className="w-5 h-5 text-amber-400 group-hover:rotate-45 transition-transform" />
          <span className="hidden group-hover:inline text-xs font-bold text-slate-100 dark:text-slate-900 pr-1">Mode Clair</span>
        </>
      ) : (
        <>
          <Moon className="w-5 h-5 text-indigo-400 dark:text-indigo-600 group-hover:-rotate-12 transition-transform" />
          <span className="hidden group-hover:inline text-xs font-bold text-slate-800 dark:text-slate-200 pr-1">Mode Sombre</span>
        </>
      )}
    </button>
  );
}
