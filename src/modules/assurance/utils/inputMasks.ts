/**
 * Masques de saisie utilisés partout dans le projet.
 *
 * `maskNom` : masque de saisie des NOMS (assurés / patients, personnes de
 * contact, sociétés / organismes, sous-sociétés / services, établissement...).
 * Il convertit automatiquement la saisie en MAJUSCULES afin que les noms
 * saisis soient toujours en majuscules, comme les données existantes.
 * Les accents et caractères spéciaux sont conservés (é → É, ï → Ï, ç → Ç,
 * apostrophes, tirets, espaces, chiffres...).
 */
export const maskNom = (value: string): string =>
  (value ?? '').toUpperCase();
