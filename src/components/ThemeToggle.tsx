import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function FloatingThemeToggle() {
  const { theme, isDark, toggleTheme } = useTheme();
  const label = isDark ? 'Passer en mode clair' : 'Passer en mode sombre';

  return (
    <div
      id="theme-toggle-floating-container"
      className="fixed bottom-5 right-5 z-50 flex items-center select-none"
    >
      <button
        id="theme-toggle-btn"
        type="button"
        onClick={toggleTheme}
        data-theme={theme}
        aria-label={label}
        title={label}
        className="theme-toggle"
      >
        {isDark ? (
          <Sun className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Moon className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
