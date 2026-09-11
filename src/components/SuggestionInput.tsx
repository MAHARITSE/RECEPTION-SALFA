import { useId, useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Valeurs existantes de la base, utilisées pour compléter la saisie (jamais imposées). */
  suggestions?: string[];
  /**
   * 'suite' (défaut) : complétion en ligne mot à mot (noms, prénoms, dossiers).
   * 'contient' : assistance par recherche — la liste des valeurs de la base qui
   * CONTIENNENT le texte tapé s'affiche sous le champ (FRITO → COPEFRITO) ;
   * la saisie reste libre et une valeur hors liste est acceptée telle quelle.
   */
  mode?: 'suite' | 'contient';
  onBlur?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  id?: string;
  /** Nombre maximum de suggestions affichées sous le champ (mode 'contient'). */
  maxSuggestions?: number;
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
 * Champ de **saisie assistée** — pas une combobox fermée :
 *  - mode 'suite' : chaque mot en cours de frappe est complété DANS le champ
 *    (en sélection) par le premier mot connu de la base qui commence comme lui ;
 *    Entrée / Tab / → valident (Tab fait aussi passer au champ suivant quand
 *    aucune proposition n'est en cours) ; Échap / clic abandonnent ;
 *  - mode 'contient' : les valeurs de la base qui contiennent le texte tapé
 *    sont proposées sous le champ (clic ou ↑↓ + Entrée/Tab) ; la saisie reste
 *  - dans tous les cas **100 % libre** : une valeur inédite est acceptée telle quelle.
 */
export function SuggestionInput({
  value, onChange, suggestions = [], mode = 'suite', onBlur, placeholder, ariaLabel, className, id, maxSuggestions = 8,
}: Props) {
  const genere = useId();
  const champId = id || `sugg-${genere}`;
  const listeId = `${champId}-assistance`;
  const inputRef = useRef<HTMLInputElement>(null);
  // Valeur pour laquelle la complétion a été explicitement abandonnée
  // (Échap, clic dans le champ, sortie) ou déjà validée : elle ne revient
  // pas tant que la saisie n'a pas changé.
  const [annule, setAnnule] = useState<string | null>(null);
  // Mode 'contient' : visibilité de la liste d'assistance + index survolé.
  const [listeOuverte, setListeOuverte] = useState(false);
  const [indexActif, setIndexActif] = useState(-1);

  /* ===== Mode 'suite' : complétion en ligne du mot en cours ===== */
  const completion = useMemo(() => {
    if (mode !== 'suite') return null;
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
  }, [mode, value, suggestions, annule]);

  const affiche = completion ?? value;

  // La partie complétée est sélectionnée : la frappe suivante la remplace naturellement.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || !completion) return;
    if (document.activeElement === el) el.setSelectionRange(value.length, completion.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completion, affiche]);

  /* ===== Mode 'contient' : liste des valeurs qui contiennent la saisie ===== */
  const filtres = useMemo(() => {
    if (mode !== 'contient') return [];
    const saisie = norm(value);
    if (!saisie) return [];
    const exact = saisie.toUpperCase();
    const out: string[] = [];
    for (const brute of suggestions) {
      const candidat = (brute || '').trim();
      if (!candidat || candidat.toUpperCase() === exact) continue;
      if (norm(candidat).includes(saisie)) {
        out.push(candidat);
        if (out.length >= maxSuggestions) break;
      }
    }
    return out;
  }, [mode, value, suggestions, maxSuggestions]);

  const listeVisible = mode === 'contient' && listeOuverte && filtres.length > 0;

  const choisirListe = (v: string) => {
    onChange(v);
    setListeOuverte(false);
    setIndexActif(-1);
    const el = inputRef.current;
    if (el) requestAnimationFrame(() => { el.setSelectionRange(v.length, v.length); if (document.activeElement === el) el.focus(); });
  };

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
    <div className="relative">
      <input
        ref={inputRef}
        id={champId}
        type="text"
        value={affiche}
        onChange={(e) => {
          // Avec la sélection de complétion en place, la frappe ne touche que la
          // partie tapée : la valeur reçue est déjà propre.
          setAnnule(null);
          if (mode === 'contient') { setListeOuverte(true); setIndexActif(-1); }
          onChange(e.target.value);
        }}
        onFocus={() => { if (mode === 'contient') setListeOuverte(true); }}
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
          if (mode === 'contient') {
            if (!listeVisible) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndexActif((i) => (i + 1) % filtres.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIndexActif((i) => (i - 1 + filtres.length) % filtres.length); }
            else if (e.key === 'Enter' && indexActif >= 0 && indexActif < filtres.length) { e.preventDefault(); choisirListe(filtres[indexActif]); }
            else if (e.key === 'Tab' && indexActif >= 0 && indexActif < filtres.length) { e.preventDefault(); choisirListe(filtres[indexActif]); }
            else if (e.key === 'Escape') { setListeOuverte(false); setIndexActif(-1); }
            return;
          }
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
          setListeOuverte(false);
          setIndexActif(-1);
          onBlur?.();
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete={mode === 'contient' ? 'list' : 'inline'}
        aria-expanded={listeVisible}
        aria-controls={listeVisible ? listeId : undefined}
        autoComplete="off"
        className={className}
      />
      {listeVisible && (
        <ul
          id={listeId}
          role="listbox"
          aria-label={ariaLabel ? `Suggestions — ${ariaLabel}` : 'Suggestions de la base'}
          className="absolute left-0 right-0 top-full z-30 mt-0.5 max-h-56 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {filtres.map((s, i) => (
            <li
              key={`${s}-${i}`}
              role="option"
              aria-selected={i === indexActif}
              // mousedown + preventDefault : choisit la suggestion sans perdre le focus du champ.
              onMouseDown={(e) => { e.preventDefault(); choisirListe(s); }}
              onMouseEnter={() => setIndexActif(i)}
              className={`cursor-pointer px-3 py-1.5 text-xs ${i === indexActif ? 'bg-accent-soft font-semibold text-ink-strong' : 'text-ink'}`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
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
