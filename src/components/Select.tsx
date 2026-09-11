import React, { useMemo } from 'react';
import { SearchableSelect, type SearchableOption } from './SearchableSelect';

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'children'> & {
  /** Valeur courante (identifiant d'option le plus souvent). */
  value?: string | number | readonly string[];
  onChange?: (event: { target: { value: string; name?: string; id?: string } }) => void;
  children?: React.ReactNode;
};

/** Concatène le texte lisible d'un nœud React (libellé d'une <option>). */
function texteDe(noeud: React.ReactNode): string {
  if (noeud === null || noeud === undefined || typeof noeud === 'boolean') return '';
  if (typeof noeud === 'string' || typeof noeud === 'number') return String(noeud);
  if (Array.isArray(noeud)) return noeud.map(texteDe).join(' ');
  if (React.isValidElement(noeud)) return texteDe((noeud.props as { children?: React.ReactNode }).children);
  return '';
}

/** Aplatit les <option> (y compris dans les <optgroup>, fragments et .map()). */
function optionsDe(children: React.ReactNode): SearchableOption[] {
  const options: SearchableOption[] = [];
  const vus = new Set<string>();

  const parcourir = (noeud: React.ReactNode) => {
    React.Children.forEach(noeud, (enfant) => {
      if (!React.isValidElement(enfant)) return;
      const element = enfant as React.ReactElement<{ value?: unknown; children?: React.ReactNode; label?: string }>;
      if (element.type === React.Fragment || element.type === 'optgroup') { parcourir(element.props.children); return; }
      if (element.type !== 'option') {
        if (element.props?.children) parcourir(element.props.children);
        return;
      }
      const brut = element.props?.value;
      if (brut === undefined || brut === null) return;
      const valeur = String(brut);
      const libelle = (texteDe(element.props.children) || valeur).trim();
      if (!libelle) return;
      if (vus.has(valeur)) return;
      vus.add(valeur);
      options.push({ value: valeur, label: libelle });
    });
  };

  parcourir(children);
  return options;
}

/**
 * Remplacement **déposable** d'un `<select>` natif : mêmes props, mêmes enfants
 * `<option>`, mais l'opérateur peut taper pour filtrer la liste.
 *
 * La valeur reste celle de l'option choisie (son identifiant) ; le champ
 * affiche son libellé. Les listes de **type client** ne doivent pas l'utiliser.
 */
export function Select({ children, className, value, onChange, ...rest }: Props) {
  const options = useMemo(() => optionsDe(children), [children]);
  const courant = value === undefined || value === null ? '' : String(value);

  return (
    <SearchableSelect
      id={rest.id}
      value={courant}
      onChange={(valeur) => onChange?.({ target: { value: valeur, name: rest.name, id: rest.id } })}
      options={options}
      allowFreeText={false}
      disabled={rest.disabled}
      ariaLabel={rest['aria-label'] || rest.title}
      placeholder={rest.title || '— Choisir —'}
      className=""
      inputClassName={className || ''}
    />
  );
}
