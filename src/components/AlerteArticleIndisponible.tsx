import { useEffect, useRef } from 'react';
import { Ban, PackageX, X, AlertTriangle } from 'lucide-react';

/**
 * Notification bloquante, centrée à l'écran et en rouge, affichée dès qu'un article
 * choisi est :
 *   - « bloqué à la vente » par la pharmacie (réservation / régularisation) ;
 *   - ou en rupture de stock pharmacie (stock ≤ 0).
 *
 * Elle remplace les anciens `alert()` natifs (coin haut de l'écran, style navigateur)
 * pour le médecin (ordonnance) comme pour la caisse (ventes externes).
 */
export interface ArticleAlertInfo {
  /** Nature du problème : blocage pharmacie ou rupture de stock */
  kind: 'blocked' | 'out_of_stock';
  /** Titre personnalisé (sinon déduit de `kind`) */
  title?: string;
  /** Message principal — généralement le nom de l'article concerné */
  message: string;
  /** Liste d'articles concernés (contrôle global à l'encaissement) */
  items?: string[];
  /** Motif de blocage saisi par la pharmacie */
  reason?: string;
  /** Consigne / conduite à tenir */
  hint?: string;
  /** Action secondaire optionnelle (ex. « Prescrire quand même » côté médecin) */
  onForce?: () => void;
  /** Libellé de l'action secondaire */
  forceLabel?: string;
}

interface Props {
  alert: ArticleAlertInfo | null;
  onClose: () => void;
}

export default function AlerteArticleIndisponible({ alert, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!alert) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alert, onClose]);

  if (!alert) return null;

  const isBlocked = alert.kind === 'blocked';
  const title = alert.title || (isBlocked ? '⛔ Article bloqué à la vente' : '🚨 Rupture de stock');
  const defaultHint = isBlocked
    ? "Article bloqué par la pharmacie — demandez son déblocage avant toute vente."
    : "Stock pharmacie épuisé — un réapprovisionnement est nécessaire avant la vente.";

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-red-950/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-surface rounded-2xl shadow-2xl border-2 border-red-500 overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Bandeau rouge */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 p-4 flex items-center gap-3">
          <div className="p-2.5 bg-white/20 backdrop-blur rounded-xl shrink-0 animate-pulse">
            {isBlocked ? <Ban className="w-7 h-7 text-white" /> : <PackageX className="w-7 h-7 text-white" />}
          </div>
          <div className="flex-1 pr-6">
            <h3 className="text-base font-extrabold tracking-tight text-white leading-tight">{title}</h3>
            <p className="text-[11px] text-white/85 font-semibold mt-0.5">Vente impossible en l'état</p>
          </div>
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 p-1 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition cursor-pointer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="p-5 space-y-3 text-center">
          <p className="text-[15px] font-bold text-red-700 dark:text-red-400 leading-snug break-words">{alert.message}</p>

          {alert.items && alert.items.length > 0 && (
            <ul className="text-left text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/8 border border-red-200 dark:border-red-500/25 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
              {alert.items.map((it, i) => (
                <li key={i} className="font-semibold">• {it}</li>
              ))}
            </ul>
          )}

          {alert.reason && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/8 border border-red-200 dark:border-red-500/25 rounded-xl px-3 py-2">
              Motif : {alert.reason}
            </p>
          )}

          <p className="text-xs text-ink-secondary flex items-start gap-2 justify-center text-left">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-px" />
            <span>{alert.hint || defaultHint}</span>
          </p>
        </div>

        {/* Actions */}
        <div className="p-4 bg-surface-muted border-t border-line-soft flex items-center justify-center gap-3">
          {alert.onForce && (
            <button
              type="button"
              onClick={() => { alert.onForce?.(); onClose(); }}
              className="px-4 py-2.5 bg-surface border border-line-strong hover:bg-surface-hover text-ink font-semibold text-sm rounded-xl transition cursor-pointer shadow-sm active:scale-95"
            >
              {alert.forceLabel || 'Continuer quand même'}
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition cursor-pointer shadow-lg shadow-red-600/30 active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            J'ai compris
          </button>
        </div>
      </div>
    </div>
  );
}
