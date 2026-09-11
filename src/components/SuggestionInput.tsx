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

/** Découpe une identité en mots (RAVELO NAINA → [RAVELO, NAINA]). */
export function motsIdentite(s: string | undefined | null): string[] {
  return (s || '')
    .normalize('NFKC')
    .toUpperCase()
    .split(/[\s'’\-]+/)
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Champ de **saisie assistée mot par mot** — aucune liste déroulante :
 *  - l'opérateur tape mot après mot ; chaque mot en cours de frappe est complété
 *    DANS le champ (en sélection) par le premier mot connu de la base qui commence
 *    comme lui — la liste reçue est déjà classée par l'appelant (appariement,
 *    fréquence, alphabétique) ;
 *  - la frappe suivante remplace la sélection et la complétion se recalcule ;
 *  - Entrée / Tab / → valident le mot proposé (Tab passe aussi au champ suivant) ;
 *    Échap, un clic dans le champ ou la sortie abandonnent la proposition :
 *    seul le texte réellement tapé est conservé ;
 *  - la saisie reste 100 % libre (RAVELO NAINA à partir de RAVELO AINA et
 *    RAZAFY NAINA fonctionne : chaque mot est repris de la base).
 */
export function SuggestionInput({
  value, onChange, suggestions = [], onBlur, placeholder, ariaLabel, className, id,
}: Props) {
  const genere = useId();
  const champId = id || `sugg-${genere}`;
  const inputRef = useRef<HTMLInputElement>(null);
  // Valeur pour laquelle la complétion a été explicitement abandonnée
  // (Échap, clic dans le champ, sortie) ou déjà validée : elle ne revient
  // pas tant que la saisie n'a pas changé.
  const [annule, setAnnule] = useState<string | null>(null);

  // Complétion du mot en cours : préfixe déjà tapé (mots antérieurs + espace)
  // + premier mot connu de la base qui commence comme le mot tapé.
  const completion = useMemo(() => {
    if (!value || annule === value) return null;
    const coupe = value.lastIndexOf(' ');
    const avant = value.slice(0, coupe + 1);
    const mot = norm(value.slice(coupe + 1));
    if (!mot) return null;
    const exact = mot.toUpperCase();
    for (const brute of suggestions) {
      const candidat = (brute || '').trim();
      if (!candidat || candidat.toUpperCase() === exact) continue;
      if (norm(candidat).startsWith(mot)) return avant + candidat;
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

  const accepter = (laisserPasser: boolean) => {
    const complet = completion as string;
    setAnnule(complet);
    onChange(complet);
    const el = inputRef.current;
    if (el) {
      const fin = complet.length;
      requestAnimationFrame(() => {
        el.setSelectionRange(fin, fin);
        if (!laisserPasser && document.activeElement === el) el.focus();
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
        // Avec la sélection de complétion en place, la frappe ne touche que la
        // partie tapée : la valeur reçue est déjà propre.
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
          // Valide le mot proposé et RESTE dans le champ
          // (un second Tab, sans proposition, repassera au champ suivant).
          e.preventDefault();
          accepter(false);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setAnnule(value);
          if (el) { el.value = value; el.setSelectionRange(value.length, value.length); }
        }
      }}
      onBlur={() => {
        // Une complétion non validée n'est jamais enregistrée.
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
 *    (ex : mots déjà portés avec l'identité en cours de saisie) ;
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
