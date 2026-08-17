// Environnement jsdom : polyfills minimaux pour l'application.
import { vi, beforeEach } from 'vitest';

if (!window.matchMedia) {
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

(window as any).confirm = () => true;
(window as any).alert = () => {};

// Impression : printTicket.ts écrit le ticket dans un iframe caché puis appelle print().
// On compte les appels à print() pour vérifier qu'un ticket est émis.
export const printSpy = vi.fn();
(window as any).print = printSpy;

/** Récupère le HTML de tous les iframes de ticket encore présents dans le document. */
export function collectPrintedHtml(): string[] {
  const out: string[] = [];
  document.querySelectorAll('iframe').forEach((f) => {
    try {
      const doc = f.contentDocument;
      if (doc && doc.documentElement) out.push(doc.documentElement.outerHTML);
    } catch {
      /* ignore */
    }
  });
  return out;
}

beforeEach(() => {
  printSpy.mockClear();
  localStorage.clear();
});
