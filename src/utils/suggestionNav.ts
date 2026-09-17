import type { KeyboardEvent } from 'react';

/**
 * Navigation clavier commune aux « zones de suggestion » (listes déroulantes
 * de recherche) : les boutons de direction ↑ / ↓ se déplacent dans les
 * résultats, Entrée valide la suggestion active, Échap ferme la liste.
 * Même comportement que la recherche de patient du module Médecin.
 */
export function suggestionNavKeyDown(args: {
  /** Vrai quand la liste de suggestions est visible. */
  open: boolean;
  /** Nombre de suggestions affichées. */
  count: number;
  /** Index couramment surligné. */
  index: number;
  /** Déplace le surlignage (nouvele valeur fournie par le composant). */
  onIndex: (next: number) => void;
  /** Valide la suggestion au index `index`. */
  onPick: (index: number) => void;
  /** Comportement sur Échap (fermer / vider la recherche). */
  onEscape?: () => void;
}): (e: KeyboardEvent<HTMLInputElement>) => void {
  const { open, count, index, onIndex, onPick, onEscape } = args;
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (onEscape) { e.preventDefault(); onEscape(); }
      return;
    }
    if (!open || count === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onIndex(Math.min(index + 1, count - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onIndex(Math.max(index - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onPick(index);
    }
  };
}
