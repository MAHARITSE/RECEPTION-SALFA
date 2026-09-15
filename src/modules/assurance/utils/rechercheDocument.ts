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

export interface FactureRecherchable extends DocumentRecherchable {
  date?: string;
  total?: number;
  items?: { description: string; amount: number }[];
}

/**
 * Correspondance d'une facture avec la recherche du dossier client : numéro,
 * nom, dossier, matricule, date (AAAA-MM-JJ ou JJ/MM/AAAA), libellés des
 * articles et montants. Chaque mot saisi doit se retrouver (champs confondus).
 */
export function factureCorrespondRecherche(doc: FactureRecherchable, requete: string): boolean {
  const dateFr = (doc.date || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
  const cible = [
    doc.number, doc.client, doc.dossier, doc.matricule, doc.date, dateFr,
    doc.total != null ? String(doc.total) : '',
    ...(doc.items || []).flatMap(i => [i.description, String(i.amount)]),
  ].filter(Boolean).join(' ');
  return correspondRechercheMultiMots(cible, requete);
}
