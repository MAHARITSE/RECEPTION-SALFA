/** Recherche insensible à la casse, aux accents et aux espaces superflus. */
export function normaliserRecherche(valeur: string): string {
  return (valeur || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DocumentRecherchable {
  number: string;
  client: string;
  dossier?: string;
  matricule?: string;
}

/**
 * Correspondance d'une pièce de facturation avec la recherche de l'utilisateur :
 * nom du client, numéro de facture, dossier ou matricule (contient la requête).
 */
export function documentCorrespondRecherche(doc: DocumentRecherchable, requete: string): boolean {
  const q = normaliserRecherche(requete);
  if (!q) return true;
  return [doc.number, doc.client, doc.dossier, doc.matricule]
    .some(champ => normaliserRecherche(champ || '').includes(q));
}

/** Nom générique (« Client Externe », « Clients Comptoir »…) : la pièce n'a pas de nom propre. */
export function nomClientGenerique(client?: string): boolean {
  const valeur = (client || '').trim();
  if (!valeur) return true;
  return /^clients?\s+(externes?|comptoir)$/i.test(valeur);
}
