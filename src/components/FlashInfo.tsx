import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Info de validation brève (~2 s) avec reprise de saisie :
 * remplace les `alert()` / modales bloquantes pour les champs obligatoires —
 * le message s'affiche ~2 secondes en haut de l'écran puis disparaît tout
 * seul, et le curseur retourne dans le champ à compléter (ex : « Diagnostic * »).
 */
export function useFlashInfo(timeoutMs = 2000) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRef = useRef<HTMLElement | null>(null);
  const flash = useCallback((msg: string, focusEl?: HTMLElement | null) => {
    if (timer.current) clearTimeout(timer.current);
    focusRef.current = focusEl || null;
    setMessage(msg);
    if (focusEl) focusEl.focus({ preventScroll: true });
    timer.current = setTimeout(() => {
      setMessage(null);
      focusRef.current?.focus({ preventScroll: true });
    }, timeoutMs);
  }, [timeoutMs]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { message, flash };
}

/** Bannière flottante (haut de l'écran) — auto-fermée par le hook. */
export function FlashInfoBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold shadow-2xl border border-amber-400 max-w-md text-center"
    >
      ⚠ {message}
    </div>
  );
}
