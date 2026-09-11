import { useId, useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Valeurs existantes de la base, utilisées pour compléter la saisie (jamais imposées). */
  suggestions?: string[];
  onBlur?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  id?: string;
}

/** Texte normalisé pour la comparaison : minuscules et sans accents. */
const norm = (s: string) => (s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

/**
 * Champ de **saisie assistée en ligne** — aucune liste déroulante :
 *  - l'opérateur tape normalement ; dès que ce qui est tapé correspond au début
 *    d'une valeur déjà connue de la base (classement par appariement/fréquence),
 *    la suite du mot est complétée DANS le champ, en sélection ;
 *  - la frappe suivante remplace cette sélection et la complétion se recalcule ;
 *  - Entrée / Tab / → acceptent la proposition ; Échap, un clic dans le champ
 *    ou la sortie du champ l'abandonnent : seul le texte réellement tapé est conservé ;
 *  - la saisie reste 100 % libre : une valeur inédite est toujours acceptée.
 */
export function SuggestionInput({
  value, onChange, suggestions = [], onBlur, placeholder, ariaLabel, className, id,
}: Props) {
  const genere = useId();
  const champId = id || `sugg-${genere}`;
  const inputRef = useRef<HTMLInputElement>(null);
  // Valeur pour laquelle la complétion a été explicitement abandonnée
  // (Échap, clic dans le champ, sortie) : elle ne revient pas tant que
  // la saisie n'a pas changé.
  const [annule, setAnnule] = useState<string | null>(null);

  // Proposition de la base : première valeur (déjà classée par l'appelant)
  // qui commence par ce qui est tapé, insensible à la casse et aux accents.
  const completion = useMemo(() => {
    const saisie = norm(value);
    if (!saisie || annule === value) return null;
    const exact = saisie.toUpperCase();
    for (const brute of suggestions) {
      const candidat = (brute || '').trim();
      if (!candidat || candidat.toUpperCase() === exact) continue;
      if (norm(candidat).startsWith(saisie)) return candidat;
    }
    return null;
  }, [value, suggestions, annule]);

  const affiche = completion ?? value;

  // La partie complétée est sélectionnée : la frappe suivante la remplace naturellement.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || !completion) return;
    if (document.activeElement === el) el.setSelectionRange(value.length, completion.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completion, affiche]);

  const accepter = (deplacerFocus: boolean) => {
    setAnnule(null);
    onChange(completion as string);
    const el = inputRef.current;
    if (el) {
      const fin = (completion as string).length;
      requestAnimationFrame(() => {
        el.setSelectionRange(fin, fin);
        if (!deplacerFocus && document.activeElement === el) el.focus();
      });
    }
  };

  return (
    <input
      ref={inputRef}
      id={champId}
      type="text"
      value={affiche}
      onChange={(e) => {
        // Avec une sélection de complétion en place, la frappe/removal ne touche
        // que la partie tapée : la valeur reçue est déjà propre.
        setAnnule(null);
        onChange(e.target.value);
      }}
      onSelect={() => {
        // Clic ou déplacement du curseur : la complétion affichée est abandonnée,
        // seul le texte réellement tapé reste.
        const el = inputRef.current;
        if (!el || !completion) return;
        const enPlace = el.selectionStart === value.length && el.selectionEnd === el.value.length;
        if (!enPlace) {
          setAnnule(value);
          el.value = value;
        }
      }}
      onKeyDown={(e) => {
        if (!completion) return;
        const el = inputRef.current;
        const enPlace = !!el && el.selectionStart === value.length && el.selectionEnd === el.value.length;
        if (!enPlace) return;
        if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'End') {
          e.preventDefault();
          accepter(false);
        } else if (e.key === 'Tab') {
          // Accepte la proposition ET laisse le focus passer au champ suivant.
          accepter(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setAnnule(value);
          if (el) { el.value = value; el.setSelectionRange(value.length, value.length); }
        }
      }}
      onBlur={() => {
        // Une complétion non acceptée n'est jamais enregistrée.
        if (completion) { setAnnule(value); if (inputRef.current) inputRef.current.value = value; }
        onBlur?.();
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-autocomplete="inline"
      autoComplete="off"
      className={className}
    />
  );
}

/** Liste de suggestions nettoyée : vides exclus, doublons ignorés (casse ignorée). */
export function suggestionsFrom(values: (string | undefined | null)[]): string[] {
  const vus = new Map<string, string>();
  for (const brute of values) {
    const valeur = (brute || '').trim();
    if (!valeur) continue;
    const cle = valeur.toUpperCase();
    if (!vus.has(cle)) vus.set(cle, valeur);
  }
  return [...vus.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

/**
 * Classe les valeurs de la base pour l'assistance à la saisie :
 *  - doublons fusionnés (casse ignorée) avec leur fréquence ;
 *  - si `apparie` est fourni, les valeurs « appariées » passent en tête
 *    (ex : prénoms déjà portés par le nom saisi) ;
 *  - puis fréquence décroissante, puis ordre alphabétique.
 */
export function classerSuggestions(
  values: (string | undefined | null)[],
  apparie?: (valeur: string) => boolean,
): string[] {
  const vus = new Map<string, { valeur: string; n: number }>();
  for (const brute of values) {
    const valeur = (brute || '').trim();
    if (!valeur) continue;
    const cle = valeur.toUpperCase();
    const entree = vus.get(cle);
    if (entree) entree.n += 1;
    else vus.set(cle, { valeur, n: 1 });
  }
  return [...vus.values()]
    .sort((a, b) => {
      if (apparie) {
        const ma = apparie(a.valeur) ? 0 : 1;
        const mb = apparie(b.valeur) ? 0 : 1;
        if (ma !== mb) return ma - mb;
      }
      if (b.n !== a.n) return b.n - a.n;
      return a.valeur.localeCompare(b.valeur, 'fr');
    })
    .map((e) => e.valeur);
}
