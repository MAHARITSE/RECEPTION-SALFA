import { useId } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Suggestions proposées pendant la frappe (jamais imposées : saisie libre). */
  suggestions?: string[];
  onBlur?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  id?: string;
  maxSuggestions?: number;
}

/**
 * Champ de **saisie libre avec suggestions** (pas une liste fermée) :
 * l'opérateur continue de taper normalement, l'historique de la base lui est
 * simplement proposé en dessous du champ.
 */
export function SuggestionInput({
  value, onChange, suggestions = [], onBlur, placeholder, ariaLabel, className, id, maxSuggestions = 200,
}: Props) {
  const genere = useId();
  const champId = id || `sugg-${genere}`;
  const listeId = `${champId}-list`;
  return (
    <>
      <input
        id={champId}
        type="text"
        list={listeId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        className={className}
      />
      <datalist id={listeId}>
        {suggestions.slice(0, maxSuggestions).map((suggestion, index) => (
          <option key={`${suggestion}-${index}`} value={suggestion} />
        ))}
      </datalist>
    </>
  );
}
