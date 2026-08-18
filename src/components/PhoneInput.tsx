import { useLayoutEffect, useRef } from 'react';
import { formatPhoneValue } from '../utils/phone';

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
 * Le curseur est repositionné correctement pendant la frappe et la
 * suppression, même lorsque des espaces sont insérés ou retirés.
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
  const previousValueRef = useRef<string>(value ?? '');
  const previousCaretRef = useRef<number | null>(null);

  const formatted = formatPhoneValue(value ?? '');

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const prev = previousValueRef.current;
    const prevCaret = previousCaretRef.current;
    const isUserEdit = prevCaret !== null;

    // Repositionner le curseur uniquement après une saisie utilisateur
    // (pas quand la valeur change pour une autre raison : reset, édition
    // d'une fiche existante, etc.).
    if (isUserEdit && document.activeElement === el) {
      // Compter les chiffres présents avant le curseur dans l'ancienne valeur
      const digitsBeforeCaret = (prev.slice(0, prevCaret!).match(/\d/g) || [])
        .length;

      // Dans la nouvelle valeur, positionner le curseur juste après le
      // Nième chiffre (en insérant les espaces prévus avant lui).
      let digitsSeen = 0;
      let newCaret = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
          digitsSeen++;
          if (digitsSeen > digitsBeforeCaret) {
            newCaret = i;
            break;
          }
          newCaret = i + 1;
        }
      }

      el.setSelectionRange(newCaret, newCaret);
    }

    previousValueRef.current = formatted;
    previousCaretRef.current = null;
  }, [formatted]);

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
        const el = inputRef.current;
        if (el) previousCaretRef.current = el.selectionStart;
        onKeyDown?.(e);
      }}
      onChange={(e) => {
        const el = inputRef.current;
        if (el) previousCaretRef.current = el.selectionStart;
        onChange(formatPhoneValue(e.target.value));
      }}
    />
  );
}
