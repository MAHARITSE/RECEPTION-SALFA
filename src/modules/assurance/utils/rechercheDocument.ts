import { correspondRechercheMultiMots, normaliserRecherche } from '../../../utils/recherche';

export { normaliserRecherche };

export interface DocumentRecherchable {
  number: string;
  client: string;
  dossier?: string;
  matricule?: string;
}

/**
 * Correspondance d'une pièce de facturation avec la recherche de l'utilisateur :
 * nom du client, numéro de facture, dossier ou matricule. Chaque mot saisi doit
 * se retrouver (champs confondus) : « RAVELO N » retrouve « RAVELO NAINA ».
 */
export function documentCorrespondRecherche(doc: DocumentRecherchable, requete: string): boolean {
  const cible = [doc.number, doc.client, doc.dossier, doc.matricule].filter(Boolean).join(' ');
  return correspondRechercheMultiMots(cible, requete);
}

/** Nom générique (« Client Externe », « Clients Comptoir »…) : la pièce n'a pas de nom propre. */
export function nomClientGenerique(client?: string): boolean {
  const valeur = (client || '').trim();
  if (!valeur) return true;
  return /^(clients?\s+)?(externes?|comptoir)$/i.test(valeur);
}
