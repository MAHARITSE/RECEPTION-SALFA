import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import { PRINT_ERROR_EVENT } from '../utils/printDocument';

/** Reste visible même si le navigateur bloque aussi les boîtes window.alert(). */
export default function PrintFeedback() {
  const [documents, setDocuments] = useState<string[]>([]);

  useEffect(() => {
    const onError = (event: Event) => {
      const title = (event as CustomEvent<{ title: string }>).detail.title;
      setDocuments((previous) => previous.includes(title) ? previous : [...previous, title]);
    };
    window.addEventListener(PRINT_ERROR_EVENT, onError);
    return () => window.removeEventListener(PRINT_ERROR_EVENT, onError);
  }, []);

  if (!documents.length) return null;

  return (
    <aside role="alert" aria-label="Erreur d’impression" className="print:hidden fixed top-4 left-1/2 -translate-x-1/2 z-[10001] w-[calc(100%-2rem)] max-w-lg rounded-xl border border-red-300 dark:border-red-500/40 bg-surface p-4 shadow-2xl text-ink">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink-strong">L’impression n’a pas pu démarrer</h2>
          <p className="text-sm mt-1">Documents à réimprimer : {documents.join(', ')}.</p>
          <p className="text-xs text-ink-muted mt-2">Autorisez l’impression dans votre navigateur. Depuis un aperçu intégré, essayez d’ouvrir l’application dans un nouvel onglet.</p>
          <p className="text-xs font-semibold mt-2">Pour un reçu déjà payé, utilisez la réimpression de la caisse, sans encaisser à nouveau.</p>
          <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-accent-strong hover:underline">
            <ExternalLink className="w-3.5 h-3.5" /> Ouvrir dans un nouvel onglet
          </a>
        </div>
        <button type="button" onClick={() => setDocuments([])} aria-label="Fermer l’avertissement d’impression" className="p-1 rounded text-ink-muted hover:bg-surface-hover cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
