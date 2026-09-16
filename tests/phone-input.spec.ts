import { expect, test } from '@playwright/test';
import { caretApresFormatage, chiffresAvant, formatPhoneDigits, formatPhoneValue } from '../src/utils/phone';

/**
 * Simule la frappe dans le champ Téléphone : à chaque touche, la valeur est
 * formatée puis le curseur est replacé d'après le NOMBRE DE CHIFFRES saisis
 * (comportement de `PhoneInput`).
 */
function frappe(sequence: string, initiale = '') {
  let value = formatPhoneValue(initiale);
  let caret = value.length;
  for (const touche of sequence) {
    const brut = value.slice(0, caret) + touche + value.slice(caret);
    const chiffres = chiffresAvant(brut, caret + touche.length);
    value = formatPhoneValue(brut);
    caret = caretApresFormatage(chiffres, value);
  }
  return { value, caret };
}

/** Backspace : supprime le caractère avant le curseur, ou le chiffre précédent
 * quand le curseur est placé juste après un espace de formatage. */
function backspace(value: string, caret: number) {
  const formate = formatPhoneValue(value);
  if (caret > 0 && !/\d/.test(formate.charAt(caret - 1))) {
    const avant = formate.slice(0, caret);
    const idx = avant.search(/\d\s*$/);
    if (idx >= 0) {
      const suivant = formatPhoneValue(avant.slice(0, idx) + formate.slice(caret));
      return { value: suivant, caret: caretApresFormatage(chiffresAvant(avant, idx), suivant) };
    }
  }
  const suivant = formatPhoneValue(formate.slice(0, caret - 1) + formate.slice(caret));
  return { value: suivant, caret: caretApresFormatage(chiffresAvant(formate, caret - 1), suivant) };
}

/** Ancien repère : position BRUTE du curseur projetée sur l'ancienne valeur
 * formatée — c'est lui qui décalait les chiffres à chaque espace inséré. */
function frappeAncienneRepere(sequence: string) {
  let value = '';
  let caret = 0;
  for (const touche of sequence) {
    const precedente = value;
    const brut = value.slice(0, caret) + touche + value.slice(caret);
    const caretBrut = caret + touche.length;
    value = formatPhoneValue(brut);
    // Chiffres comptés dans l'ANCIENNE valeur avec la NOUVELLE position : décalage.
    const chiffres = chiffresAvant(precedente, caretBrut);
    caret = caretApresFormatage(chiffres, value);
  }
  return value;
}

test('le format malgache est appliqué : 3 chiffres, 2, 3 puis 2', () => {
  expect(formatPhoneDigits('0383409261')).toBe('038 34 092 61');
  expect(formatPhoneValue('038 34 092 61')).toBe('038 34 092 61');
  expect(formatPhoneValue('+261 38 34 092 61')).toBe('261 38 340 92 61');
  // Numéros plus longs : blocs de 2 à la fin.
  expect(formatPhoneDigits('03834092610')).toBe('038 34 092 61 0');
  expect(formatPhoneDigits('038')).toBe('038');
  expect(formatPhoneDigits('03834')).toBe('038 34');
  expect(formatPhoneDigits('')).toBe('');
});

test('la frappe chiffre par chiffre reste dans l’ordre (038 34 092 61)', () => {
  const { value, caret } = frappe('0383409261');
  expect(value).toBe('038 34 092 61');
  // Le curseur reste collé au dernier chiffre saisi, pas avant un espace.
  expect(caret).toBe(value.length);
  expect(value.replace(/\D/g, '')).toBe('0383409261');
});

test('chaque espace inséré ne décale plus le curseur (régression 383 40 892 61 0)', () => {
  // Les paliers où le formatage ajoute un espace : 3, 5, 8 chiffres.
  for (const [frappe_, attendue] of [
    ['038', '038'],
    ['0383', '038 3'],
    ['03834', '038 34'],
    ['038340', '038 34 0'],
    ['0383409', '038 34 09'],
    ['03834092', '038 34 092'],
    ['038340926', '038 34 092 6'],
    ['0383409261', '038 34 092 61'],
  ] as const) {
    const { value, caret } = frappe(frappe_);
    expect(value).toBe(attendue);
    expect(caret).toBe(value.length);
    // Aucun chiffre perdu ni réordonné.
    expect(value.replace(/\D/g, '')).toBe(frappe_);
  }

  // L'ancien repère mélangeait les chiffres : plus jamais.
  const ancienne = frappeAncienneRepere('0383409261');
  expect(ancienne.replace(/\D/g, '')).not.toBe('0383409261');
  expect(frappe('0383409261').value.replace(/\D/g, '')).toBe('0383409261');
});

test('collage d’un numéro complet et saisie au milieu du numéro', () => {
  // Collage (champ vide) : le numéro est formaté d'un coup.
  expect(formatPhoneValue('0341234567')).toBe('034 12 345 67');
  // Frappe à la suite d'une valeur existante : les chiffres s'ajoutent dans l'ordre.
  expect(frappe('0383409261', '0341234567').value).toBe('034 12 345 67 03 83 40 92 61');
  // Insertion au milieu : les chiffres suivants ne sont pas écrasés.
  let { value, caret } = frappe('0383409261');
  const brut = value.slice(0, 3) + '9' + value.slice(3);
  value = formatPhoneValue(brut);
  caret = caretApresFormatage(chiffresAvant(brut, 4), value);
  expect(value).toBe('038 93 409 26 1');
  // Le curseur reste juste après le chiffre inséré (« 038 9|3 … »).
  expect(caret).toBe(5);
});

test('backspace supprime le chiffre précédent, y compris après un espace', () => {
  let etat = frappe('0383409261');
  expect(etat.value).toBe('038 34 092 61');

  // Suppression du dernier chiffre.
  etat = backspace(etat.value, etat.caret);
  expect(etat.value).toBe('038 34 092 6');

  // Curseur juste après un espace : c'est le chiffre précédent qui saute,
  // l'espace est rétabli par le formatage (la touche n'est pas « perdue »).
  const apresEspace = backspace('038 34 092 61', 4);
  expect(apresEspace.value).toBe('033 40 926 1');
  expect(apresEspace.caret).toBe(2);

  // Effacement complet.
  let vide = { value: '038 34 092 61', caret: 13 };
  for (let i = 0; i < 15 && vide.value.length > 0; i++) vide = backspace(vide.value, vide.caret);
  expect(vide.value).toBe('');
});
