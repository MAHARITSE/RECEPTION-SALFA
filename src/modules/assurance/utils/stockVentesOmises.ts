import type { LignePrestation, Prestation } from '../types';

/**
 * Réglage du STOCK PHARMACIE pour les VENTES OMISES du facturier.
 *
 * Règle métier :
 *  - VENTE OMISE (origine 'omission') reliée à un article du catalogue :
 *    les produits sont réellement sortis de la pharmacie sans être saisis —
 *    le stock pharmacie est décrémenté à l'enregistrement, et restauré si la
 *    ligne est supprimée ou sa quantité corrigée ;
 *  - ORDONNANCE EXTERNE (origine 'ordonnance_externe') : AUCUN impact stock
 *    (les médicaments proviennent d'une autre pharmacie et sont remboursés
 *    par l'hôpital) ;
 *  - lignes Caisse d'origine : jamais recalculées ici (elles ont déjà été
 *    décomptées à la vente / à la délivrance).
 *
 * Retourne la liste des mouvements à appliquer : `qte` POSITIF = sortie de
 * stock (décrément), `qte` NÉGATIF = retour en stock (restauration).
 */
export interface MouvementVenteOmise {
  articleId: string;
  libelle: string;
  /** Quantité signée : > 0 sortie de stock, < 0 restauration. */
  qte: number;
}

const lignesOmisesLiees = (p: Prestation | undefined): Map<string, LignePrestation> => {
  const map = new Map<string, LignePrestation>();
  for (const l of p?.lignes || []) {
    if (l.origine === 'omission' && l.articleId) map.set(l.id, l);
  }
  return map;
};

export function deltaStockVentesOmises(
  ancienne: Prestation | undefined,
  prochaine: Prestation,
): MouvementVenteOmise[] {
  const avant = lignesOmisesLiees(ancienne);
  const apres = lignesOmisesLiees(prochaine);
  const mouvements: MouvementVenteOmise[] = [];

  // Lignes présentes après : nouvelles (sortie complète) ou modifiées (delta).
  for (const [id, ligne] of apres) {
    const qteApres = ligne.quantity ?? 1;
    const prec = avant.get(id);
    const delta = qteApres - (prec ? (prec.quantity ?? 1) : 0);
    if (delta !== 0 && ligne.articleId) {
      mouvements.push({ articleId: ligne.articleId, libelle: ligne.libelle || '', qte: delta });
    }
  }

  // Lignes présentes avant et retirées : restauration du stock.
  for (const [id, ligne] of avant) {
    if (!apres.has(id) && ligne.articleId) {
      mouvements.push({ articleId: ligne.articleId, libelle: ligne.libelle || '', qte: -(ligne.quantity ?? 1) });
    }
  }

  return mouvements;
}
