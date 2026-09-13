/** Recherche insensible à la casse, aux accents et aux espaces superflus. */
export function normaliserRecherche(valeur: string): string {
  return (valeur || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Correspondance multi-mots : chaque mot de la requête doit se retrouver dans la
 * cible normalisée — « RAVELO N » retrouve « RAVELO NAINA » (nom + prénom,
 * champs concaténés), l'ordre des mots est libre.
 */
export function correspondRechercheMultiMots(cible: string, requete: string): boolean {
  const q = normaliserRecherche(requete);
  if (!q) return true;
  const c = normaliserRecherche(cible);
  return q.split(' ').every(mot => c.includes(mot));
}
