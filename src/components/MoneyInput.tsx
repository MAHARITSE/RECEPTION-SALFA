import React, { useEffect, useState } from 'react';

/**
 * Champ de saisie numérique avec séparateur de milliers — comme dans Hospit. / Bloc.
 *
 * Saisir 49450 affiche « 49 450 » (49450,5 → « 49 450.5 »). `value` / `onChange`
 * manipulent toujours des nombres bruts : le reste de l'application ne voit jamais
 * le séparateur, et les calculs/totaux restent identiques.
 *
 * - `decimals` : nombre de décimales acceptées (0 = nombre entier, 2 pour les prix).
 * - Le champ peut être vidé (→ 0) puis ressaisi.
 * - Une valeur imposée de l'extérieur (sélection d'une ligne, plafonnement…) est
 *   reprise à l'écran automatiquement.
 */
interface MoneyInputProps {
  value: number;
  onChange: (n: number) => void;
  /** Nombre de décimales acceptées (0 par défaut). */
  decimals?: 0 | 1 | 2;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  title?: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

/** Nettoie la saisie : chiffres + un seul séparateur décimal, décimales limitées. */
function stripRaw(v: string, decimals: number): string {
  let s = v.replace(/[^\d.,]/g, '').replace(/,/g, '.');
  const i = s.indexOf('.');
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  const parts = s.split('.');
  if (parts.length > 1) s = `${parts[0]}.${parts.slice(1).join('').slice(0, decimals)}`;
  if (decimals === 0) s = s.split('.')[0];
  const [iPart, dPart] = s.split('.');
  const ci = (iPart || '').replace(/^0+(?=\d)/, '');
  return dPart !== undefined ? `${ci}.${dPart}` : ci;
}

/** Affiche la valeur brute avec séparateur de milliers (49450 → « 49 450 »). */
export function groupThousands(n: number): string {
  return Math.trunc(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function toDisplay(raw: string): string {
  if (!raw) return '';
  const [iPart, dPart] = raw.split('.');
  const gi = (iPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dPart !== undefined ? `${gi}.${dPart}` : gi;
}

/** Représentation brute d'un nombre (0 → champ vide, prêt à ressaisir). */
function rawFromValue(n: number, decimals: number): string {
  if (!Number.isFinite(n) || n === 0) return '';
  const s = n.toFixed(decimals).replace(/\.?0+$/, '');
  return s === '0' ? '' : s;
}

export default function MoneyInput({
  value, onChange, decimals = 0, className, placeholder, ariaLabel, id, title, autoFocus, inputRef, onKeyDown, onBlur,
}: MoneyInputProps) {
  const [raw, setRaw] = useState<string>(() => rawFromValue(value, decimals));

  // Valeur imposée de l'extérieur (sélection d'une ligne, plafonnement du montant…)
  // → reprise à l'écran ; aucune boucle si la valeur vient de notre propre saisie.
  useEffect(() => {
    const parsed = raw === '' ? 0 : (parseFloat(raw) || 0);
    if (Math.abs((value || 0) - parsed) > 1e-9) setRaw(rawFromValue(value || 0, decimals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = stripRaw(e.target.value, decimals);
    setRaw(next);
    onChange(next === '' ? 0 : (parseFloat(next) || 0));
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={toDisplay(raw)}
      onChange={handleInput}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      aria-label={ariaLabel}
      title={title}
      autoFocus={autoFocus}
      className={className}
    />
  );
}
