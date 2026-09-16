import { useLayoutEffect, useRef } from 'react';
import { caretApresFormatage, chiffresAvant, formatPhoneValue } from '../utils/phone';

type PhoneInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Champ de saisie téléphone qui ajoute automatiquement les espaces
 * selon le format malgache (038 34 092 61).
 *
 * Le curseur est suivi en NOMBRE DE CHIFFRES (jamais en position brute) : après
 * chaque frappe, il est replacé juste après le dernier chiffre saisi, même quand
 * le formatage vient d'insérer un espace avant lui. Sans cela le curseur recule
 * d'un cran à chaque espace ajouté et les chiffres suivants sont insérés au
 * milieu du numéro (038 34 092 61 devenait 383 40 892 61 0).
 *
 * Backspace sur un espace : c'est le chiffre précédent qui est supprimé (l'espace
 * est immédiatement rétabli par le formatage, la touche semblait sinon inactive).
 */
export function PhoneInput({
  value,
  onChange,
  className,
  placeholder,
  onKeyDown,
  ...rest
}: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** Chiffres situés avant le curseur lors de la dernière saisie utilisateur
   * (null = valeur modifiée par le programme : reset, ouverture d'une fiche…). */
  const chiffresAvantCaretRef = useRef<number | null>(null);

  const formatted = formatPhoneValue(value ?? '');

  // Exécuté à CHAQUE rendu (et non sur la seule valeur formatée) : une touche qui
  // ne change rien au numéro — lettre, espace déjà présent — doit elle aussi
  // replacer le curseur, dès lors qu'une saisie utilisateur vient d'avoir lieu.
  useLayoutEffect(() => {
    const el = inputRef.current;
    const chiffres = chiffresAvantCaretRef.current;
    chiffresAvantCaretRef.current = null;
    if (!el || chiffres === null || document.activeElement !== el) return;
    const caret = caretApresFormatage(chiffres, formatted);
    if (el.selectionStart !== caret || el.selectionEnd !== caret) {
      el.setSelectionRange(caret, caret);
    }
  });

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="tel"
      autoComplete="tel"
      value={formatted}
      className={className}
      placeholder={placeholder ?? '038 34 092 61'}
      onKeyDown={(e) => {
        // Le parent voit toujours la touche en premier (navigation Entrée/Échap…).
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        const el = inputRef.current;
        if (el && e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const debut = el.selectionStart ?? 0;
          const fin = el.selectionEnd ?? 0;
          // Curseur effacé (pas de sélection) placé juste après un espace :
          // on supprime le chiffre précédent au lieu de l'espace.
          if (debut === fin && debut > 0 && !/\d/.test(formatted.charAt(debut - 1))) {
            const avant = formatted.slice(0, debut);
            const idx = avant.search(/\d\s*$/);
            if (idx >= 0) {
              e.preventDefault();
              chiffresAvantCaretRef.current = chiffresAvant(avant, idx);
              onChange(formatPhoneValue(avant.slice(0, idx) + formatted.slice(debut)));
              return;
            }
          }
        }
      }}
      onChange={(e) => {
        const el = e.currentTarget;
        // Position du curseur dans la valeur BRUTE (avant formatage), comptée en
        // nombre de chiffres : c'est ce repère qui est rejoué après formatage.
        chiffresAvantCaretRef.current = chiffresAvant(el.value, el.selectionStart ?? el.value.length);
        onChange(formatPhoneValue(el.value));
      }}
    />
  );
}
