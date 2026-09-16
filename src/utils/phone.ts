/**
 * Formatage automatique des numéros de téléphone à la saisie.
 *
 * Convention malgache : 3 chiffres, puis 2, puis 3, puis 2
 *   0383409261  ->  038 34 092 61
 *
 * Les numéros plus longs sont découpés par blocs de 2 à la fin.
 */

export function formatPhoneDigits(digits: string): string {
  const d = digits.replace(/\D/g, '');
  const parts: string[] = [];

  // 3 premiers chiffres (ex. : 038)
  if (d.length <= 3) return d;
  parts.push(d.slice(0, 3));

  // 2 chiffres suivants (ex. : 34)
  if (d.length <= 5) {
    parts.push(d.slice(3));
    return parts.join(' ');
  }
  parts.push(d.slice(3, 5));

  // 3 chiffres suivants (ex. : 092)
  if (d.length <= 8) {
    parts.push(d.slice(5));
    return parts.join(' ');
  }
  parts.push(d.slice(5, 8));

  // Le reste, par blocs de 2 (ex. : 61, 01 23, ...)
  let rest = d.slice(8);
  while (rest.length > 0) {
    parts.push(rest.slice(0, 2));
    rest = rest.slice(2);
  }

  return parts.join(' ');
}

/**
 * Convertit une valeur de saisie brute en valeur formatée.
 * Supprime tout caractère non numérique avant formatage.
 */
export function formatPhoneValue(raw: string): string {
  return formatPhoneDigits(raw);
}

/**
 * Nombre de CHIFFRES situés avant une position donnée (les espaces de formatage
 * ne comptent pas). Sert à mémoriser la position du curseur pendant la frappe.
 */
export function chiffresAvant(value: string, caret: number): number {
  const debut = Math.max(0, Math.min(caret ?? 0, (value || '').length));
  return ((value || '').slice(0, debut).match(/\d/g) || []).length;
}

/**
 * Position du curseur dans la valeur FORMATÉE : juste après le n-ième chiffre.
 * Les espaces insérés par le formatage sont sautés, ce qui évite que le curseur
 * recule et que les chiffres suivants soient insérés au milieu du numéro
 * (ex. « 383 40 892 61 0 » au lieu de « 038 34 092 61 »).
 */
export function caretApresFormatage(n: number, formatted: string): number {
  const valeur = formatted || '';
  if (n <= 0) return 0;
  let vus = 0;
  for (let i = 0; i < valeur.length; i++) {
    if (/\d/.test(valeur[i])) {
      vus++;
      if (vus === n) return i + 1;
    }
  }
  // Moins de chiffres que prévu (suppression, collage partiel) : fin de la valeur.
  return valeur.length;
}
