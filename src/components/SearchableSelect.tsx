import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, TriangleAlert } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  hint?: string;
  /** Option à signaler en rouge (ex. société en liste noire). */
  danger?: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  className?: string;
  inputClassName?: string;
  onBlur?: () => void;
  disabled?: boolean;
  /** Message affiché sous le champ quand la valeur retenue est signalée. */
  warning?: string;
  /**
   * `false` : la valeur doit correspondre à une option (liste fermée).
   * `true` (défaut) : le texte tapé est conservé comme valeur libre.
   */
  allowFreeText?: boolean;
}

const normalise = (value: string) => (value || '')
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();

/**
 * Liste déroulante **saisissable** : l'opérateur peut taper pour filtrer puis
 * choisir au clavier ou à la souris, tout en gardant la saisie libre.
 *
 * Les options marquées `danger` (société en liste noire, suspension…) restent
 * affichées mais en rouge : l'opérateur voit immédiatement le problème.
 */
export function SearchableSelect({
  value, onChange, options, placeholder, ariaLabel, id, className = '', inputClassName = '',
  onBlur, disabled, warning, allowFreeText = true,
}: Props) {
  const [texte, setTexte] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const boite = useRef<HTMLDivElement>(null);
  const selection = useMemo(() => options.find(o => o.value === value), [options, value]);
  // Hors saisie, le champ affiche le libellé de l'option retenue, jamais son identifiant.
  const affiche = ouvert ? texte : (selection?.label ?? value ?? '');

  useEffect(() => { setTexte(''); }, [value]);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (event: MouseEvent) => {
      if (boite.current && !boite.current.contains(event.target as Node)) { setOuvert(false); setTexte(''); onBlur?.(); }
    };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, [ouvert, value, onBlur]);

  const filtrees = useMemo(() => {
    const terme = normalise(texte);
    if (!terme) return options.slice(0, 200);
    const mots = terme.split(' ').filter(Boolean);
    return options
      .filter(o => {
        const champs = [o.value, o.label, o.hint].map(v => normalise(v || '')).filter(Boolean);
        return mots.every(mot => champs.some(champ => champ.includes(mot)));
      })
      .slice(0, 200);
  }, [options, texte]);

  const selectionDangereuse = useMemo(
    () => options.find(o => o.value === value && o.danger),
    [options, value],
  );

  const choisir = (option: SearchableOption) => {
    setTexte('');
    onChange(option.value);
    setOuvert(false);
    onBlur?.();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOuvert(true);
      setActif(prev => Math.min(prev + 1, filtrees.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActif(prev => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter' && ouvert && filtrees[actif]) {
      event.preventDefault();
      choisir(filtrees[actif]);
    } else if (event.key === 'Escape') {
      setOuvert(false);
      setTexte('');
    }
  };

  return (
    <div className={`relative ${className}`} ref={boite}>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={ouvert}
          aria-label={ariaLabel}
          autoComplete="off"
          disabled={disabled}
          value={affiche}
          placeholder={ouvert ? (selection?.label || placeholder) : placeholder}
          onChange={(e) => { setTexte(e.target.value); setActif(0); setOuvert(true); }}
          onFocus={() => { setTexte(''); setOuvert(true); setActif(0); }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            const saisie = texte.trim();
            if (saisie) {
              // Une option peut être choisie en tapant son libellé exact.
              const exacte = options.find(o => o.label.trim().toUpperCase() === saisie.toUpperCase())
                || options.find(o => o.value.trim().toUpperCase() === saisie.toUpperCase());
              if (exacte) onChange(exacte.value);
              else if (allowFreeText) onChange(saisie);
            }
            setTexte('');
            setOuvert(false);
            onBlur?.();
          }}
          className={`w-full pr-7 ${inputClassName || 'h-9 bg-surface border border-line-control rounded px-2 focus:outline-none focus:border-accent'} ${
            selectionDangereuse ? 'text-red-700 dark:text-red-400 font-semibold' : ''
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Afficher les suggestions"
          onClick={() => { setOuvert(o => !o); setActif(0); }}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-ink-faint hover:text-ink cursor-pointer"
        >
          <ChevronDown size={14} className={`transition-transform ${ouvert ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {ouvert && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg text-xs"
        >
          {filtrees.length === 0 && (
            <li className="p-2.5 text-ink-muted">Aucune suggestion — la saisie libre reste enregistrée.</li>
          )}
          {filtrees.map((option, index) => (
            <li key={`${option.value}-${index}`} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choisir(option)}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left cursor-pointer ${
                  index === actif ? 'bg-accent-soft' : 'hover:bg-surface-hover'
                } ${option.danger ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-ink'}`}
              >
                <span className="truncate">{option.danger ? `🚫 ${option.label}` : option.label}</span>
                {option.hint && <span className="shrink-0 text-[10px] text-ink-faint">{option.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(warning || selectionDangereuse) && (
        <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
          <TriangleAlert size={11} />
          {warning || (selectionDangereuse?.hint ? `${selectionDangereuse.label} — ${selectionDangereuse.hint}` : 'Société en liste noire')}
        </p>
      )}
    </div>
  );
}

/** Construit une liste d'options unique à partir de valeurs brutes (triées, vide exclu). */
export function optionsFromValues(values: (string | undefined | null)[]): SearchableOption[] {
  const uniques = new Map<string, string>();
  for (const brute of values) {
    const valeur = (brute || '').trim();
    if (!valeur) continue;
    const cle = valeur.toUpperCase();
    if (!uniques.has(cle)) uniques.set(cle, valeur);
  }
  return [...uniques.values()].sort((a, b) => a.localeCompare(b, 'fr')).map(v => ({ value: v, label: v }));
}
