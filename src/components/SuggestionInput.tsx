import { useId, useMemo, useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Valeurs existantes de la base, proposées en assistance pendant la frappe (jamais imposées). */
  suggestions?: string[];
  onBlur?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  id?: string;
  /** Nombre maximum de suggestions affichées sous le champ. */
  maxSuggestions?: number;
}

/** Texte normalisé pour la comparaison : minuscules et sans accents. */
const norm = (s: string) => (s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

/**
 * Champ de **saisie libre avec assistance des données de la base** — ce n'est pas une combobox :
 *  - le champ reste une saisie texte ordinaire (pas de flèche déroulante, aucune valeur imposée) ;
 *  - dès l'arrivée dans le champ, les valeurs les plus fréquentes de la base sont proposées ;
 *  - pendant la frappe, les valeurs connues qui contiennent le texte tapé
 *    sont proposées juste en dessous (clic, ou flèches ↑↓ + Entrée) ;
 *  - l'opérateur peut toujours terminer avec une valeur inédite.
 */
export function SuggestionInput({
  value, onChange, suggestions = [], onBlur, placeholder, ariaLabel, className, id, maxSuggestions = 8,
}: Props) {
  const genere = useId();
  const champId = id || `sugg-${genere}`;
  const listeId = `${champId}-assistance`;
  const [ouverte, setOuverte] = useState(false);
  const [indexActif, setIndexActif] = useState(-1);

  // Suggestions de la base : sans saisie, les valeurs les plus fréquentes
  // (déjà classées par l'appelant) sont proposées dès l'arrivée dans le champ ;
  // pendant la frappe, celles qui contiennent le texte tapé (insensible à la
  // casse et aux accents) — la valeur déjà saisie à l'identique est écartée.
  const filtres = useMemo(() => {
    const saisie = norm(value);
    if (!saisie) return suggestions.slice(0, maxSuggestions);
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
  }, [value, suggestions, maxSuggestions]);

  const visible = ouverte && filtres.length > 0;

  const choisir = (v: string) => {
    onChange(v);
    setOuverte(false);
    setIndexActif(-1);
  };

  return (
    <div className="relative">
      <input
        id={champId}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOuverte(true); setIndexActif(-1); }}
        onFocus={() => setOuverte(true)}
        onBlur={() => { setOuverte(false); setIndexActif(-1); onBlur?.(); }}
        onKeyDown={(e) => {
          if (!visible) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndexActif((i) => (i + 1) % filtres.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIndexActif((i) => (i - 1 + filtres.length) % filtres.length); }
          else if (e.key === 'Enter') {
            if (indexActif >= 0 && indexActif < filtres.length) { e.preventDefault(); choisir(filtres[indexActif]); }
          }
          else if (e.key === 'Escape') { setOuverte(false); setIndexActif(-1); }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listeId}
        autoComplete="off"
        className={className}
      />
      {visible && (
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
              onMouseDown={(e) => { e.preventDefault(); choisir(s); }}
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
