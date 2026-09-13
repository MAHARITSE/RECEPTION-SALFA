import { expect, test } from '@playwright/test';
import { correspondRechercheMultiMots, normaliserRecherche } from '../src/utils/recherche';
import { documentCorrespondRecherche } from '../src/modules/assurance/utils/rechercheDocument';

const piece = {
  number: '26FA0909001', client: 'RAVELO NAINA', dossier: 'DOS-0042', matricule: 'MAT-7',
};

test('reception : « RAVELO N » retrouve « RAVELO NAINA » (nom + prénom confondus)', () => {
  const identite = 'NAINA RAVELO DOS-0123 MAT-99'; // prénom + nom + dossier + matricule
  expect(correspondRechercheMultiMots(identite, 'RAVELO N')).toBe(true);
  expect(correspondRechercheMultiMots(identite, 'ravelo n')).toBe(true);       // casse
  expect(correspondRechercheMultiMots(identite, 'N RAVELO')).toBe(true);       // ordre libre
  expect(correspondRechercheMultiMots(identite, 'râvelo')).toBe(true);         // accents
  expect(correspondRechercheMultiMots(identite, 'DOS-0123')).toBe(true);       // dossier seul
  expect(correspondRechercheMultiMots(identite, 'RAVELO XYZ')).toBe(false);    // mot absent
  expect(correspondRechercheMultiMots(identite, '')).toBe(true);
});

test('comptoir & externe : chaque mot doit se retrouver dans les champs confondus', () => {
  expect(documentCorrespondRecherche(piece, 'RAVELO N')).toBe(true);   // « N » → NAINA
  expect(documentCorrespondRecherche(piece, 'NAINA ravelo')).toBe(true);
  expect(documentCorrespondRecherche(piece, '26fa09 ravelo')).toBe(true); // numéro + nom (champs confondus)
  expect(documentCorrespondRecherche(piece, 'RAVELO NAINAX')).toBe(false);
  expect(documentCorrespondRecherche(piece, 'JIRAMA')).toBe(false);
  expect(documentCorrespondRecherche(piece, '')).toBe(true);
  expect(documentCorrespondRecherche(piece, '   ')).toBe(true);
});

test('normalisation : casse, accents et espaces superflus', () => {
  expect(normaliserRecherche(' RâVéLo   Naïna ')).toBe('ravelo naina');
  expect(normaliserRecherche(undefined as unknown as string)).toBe('');
});
