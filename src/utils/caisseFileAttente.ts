/**
 * FILE D'ATTENTE DE LA CAISSE — chaque ligne est UNE PIÈCE (une prescription)
 * du dossier d'un patient. La caisse les facture et les retire INDÉPENDAMMENT :
 * ce module porte l'écriture commune du retrait d'une seule ligne, sans jamais
 * toucher aux autres lignes ni au dossier médical.
 *
 * Module autonome (aucune dépendance à `store.ts`, qui embarque la base de
 * démonstration) : il est ainsi testable tel quel — voir
 * `tests/caisse-file-individuelle.spec.ts`.
 */
import type { AppState } from '../store';

/**
 * Une ligne de la file d'attente de la caisse = UNE PIÈCE (une prescription).
 *  - `facture`      : facture en attente déjà émise (analyses, échographies,
 *                     consultation, anciennes factures pharmacie) — identifiée
 *                     par son `invoiceId` ;
 *  - `medicaments`  : ordonnance d'UNE consultation pas encore facturée, donc
 *                     sans facture — identifiée par sa `consultationId`.
 * La caisse traite chaque pièce INDÉPENDAMMENT : facturer l'une ne solde pas
 * les autres, retirer l'une ne retire pas le reste du dossier.
 */
export type PieceFileCaisse =
  | { kind: 'facture'; invoiceId: string }
  | { kind: 'medicaments'; consultationId: string }
  | { kind: 'consultation'; consultationId: string; invoiceIds?: string[] };

/** Résultat d'un retrait de pièce : sert au journal d'audit et au message opérateur. */
export interface RetraitPieceResultat {
  /** La pièce a-t-elle été retirée ? (une pièce déjà soldée ne l'est jamais) */
  ok: boolean;
  raison?: string;
  libelle: string;
  montant: number;
}

/**
 * Retire UNE SEULE pièce de la file d'attente de la caisse, sans toucher aux
 * autres prescriptions du même patient ni au dossier médical.
 *  - pièce « médicaments » : marque la consultation comme retirée de la
 *    facturation (l'ordonnance reste au dossier médical et à la pharmacie) ;
 *  - pièce « facture » : supprime la facture ENCORE EN ATTENTE (une facture
 *    payée est un document comptable : elle ne se supprime pas d'ici) et, avec
 *    elle, les demandes d'examens de cette facture qui n'ont jamais été
 *    réalisées (statut `pending`) — sinon elles resteraient suspendues sans
 *    pièce à facturer. Un numéro déjà porté est versé au registre : un numéro
 *    attribué n'est jamais réattribué.
 * Mutation directe de `state` (même convention que `purgePatientFromQueue`).
 */
export function purgePieceFromQueue(
  state: AppState,
  patientId: string,
  piece: PieceFileCaisse,
  auteur?: { id?: string; name?: string },
): RetraitPieceResultat {
  const round = (n: number) => Math.round((n || 0) * 100) / 100;
  if (piece.kind === 'consultation') {
    const c = state.consultations.find(x => x.id === piece.consultationId && x.patientId === patientId);
    let montant = 0;
    const dateStr = c?.date || new Date().toISOString();
    const libelle = `Prescription du ${new Date(dateStr).toLocaleDateString('fr-FR')}`;

    if (c) {
      if (!c.facturationRetiree) {
        montant += round((c.prescriptions || []).reduce((s, p) => s + (p.unitPrice || 0) * (p.quantity || 0), 0));
        state.consultations = state.consultations.map(x => x.id === c.id
          ? { ...x, facturationRetiree: { at: new Date().toISOString(), by: auteur?.id, byName: auteur?.name } }
          : x);
      }
    }

    const targetInvoiceIds = new Set(piece.invoiceIds || []);
    const invs = state.invoices.filter(i =>
      i.patientId === patientId &&
      i.status === 'pending' &&
      (targetInvoiceIds.has(i.id) || (piece.consultationId && i.consultationId === piece.consultationId))
    );

    for (const inv of invs) {
      montant += round(inv.totalAmount || inv.items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
      const numero = (inv.numeroFacture || '').trim();
      if (numero) {
        const registre = new Set([...(state.issuedFactureNumbers || []), numero]);
        state.issuedFactureNumbers = [...registre];
      }
    }
    const invIdsToRemove = new Set(invs.map(i => i.id));
    state.invoices = state.invoices.filter(i => !invIdsToRemove.has(i.id));

    const luiAppartient = (r: { id: string; invoiceId?: string; consultationId?: string; status?: string }) =>
      r.status === 'pending' && ((r.invoiceId && invIdsToRemove.has(r.invoiceId)) || (!!piece.consultationId && r.consultationId === piece.consultationId));

    state.labRequests = state.labRequests.filter(r => !luiAppartient(r));
    state.consultations = state.consultations.map(cons => {
      if (cons.id !== piece.consultationId) return cons;
      return {
        ...cons,
        labRequests: (cons.labRequests || []).filter(r => !luiAppartient(r)),
        echoRequests: (cons.echoRequests || []).filter(e => !luiAppartient(e)),
      };
    });

    return { ok: true, libelle, montant: round(montant) };
  }

  if (piece.kind === 'medicaments') {
    const c = state.consultations.find(x => x.id === piece.consultationId && x.patientId === patientId);
    if (!c) return { ok: false, raison: 'Ordonnance introuvable dans le dossier.', libelle: '', montant: 0 };
    if (c.facturationRetiree) {
      return { ok: false, raison: 'Cette ordonnance est déjà retirée de la file caisse.', libelle: '', montant: 0 };
    }
    const montant = round((c.prescriptions || []).reduce((s, p) => s + (p.unitPrice || 0) * (p.quantity || 0), 0));
    const libelle = `Ordonnance du ${new Date(c.date).toLocaleDateString('fr-FR')}`;
    state.consultations = state.consultations.map(x => x.id === c.id
      ? { ...x, facturationRetiree: { at: new Date().toISOString(), by: auteur?.id, byName: auteur?.name } }
      : x);
    return { ok: true, libelle, montant };
  }

  const inv = state.invoices.find(i => i.id === piece.invoiceId);
  if (!inv) return { ok: false, raison: 'Facture introuvable.', libelle: '', montant: 0 };
  if (inv.patientId && inv.patientId !== patientId) {
    return { ok: false, raison: "Cette facture n'appartient pas au dossier sélectionné.", libelle: '', montant: 0 };
  }
  if (inv.status === 'paid') {
    return { ok: false, raison: 'Facture déjà encaissée : elle ne peut pas être retirée de la file.', libelle: '', montant: 0 };
  }
  const libelle = `Prescription du ${new Date(inv.createdAt).toLocaleDateString('fr-FR')}${inv.numeroFacture ? ` — n° ${inv.numeroFacture}` : ''}`;
  const montant = round(inv.totalAmount || inv.items.reduce((s, it) => s + (Number(it.amount) || 0), 0));

  // Un numéro porté sur une pièce en attente (donnée ancienne) n'est jamais réutilisé.
  const numero = (inv.numeroFacture || '').trim();
  if (numero) {
    const registre = new Set([...(state.issuedFactureNumbers || []), numero]);
    state.issuedFactureNumbers = [...registre];
  }
  state.invoices = state.invoices.filter(i => i.id !== inv.id);

  // Demandes d'examens de CETTE facture jamais réalisées : retirées avec elle
  // (copie globale et copie rattachée à la consultation).
  const aLab = inv.items.some(it => it.category === 'lab');
  const aEcho = inv.items.some(it => it.category === 'echo');
  const luiAppartient = (r: { id: string; invoiceId?: string; consultationId?: string; status?: string }) =>
    r.status === 'pending' && (r.invoiceId
      ? r.invoiceId === inv.id
      : (!!inv.consultationId && r.consultationId === inv.consultationId));
  if (aLab) {
    state.labRequests = state.labRequests.filter(r => !luiAppartient(r));
    state.consultations = state.consultations.map(c => (c.labRequests || []).length === 0 ? c : {
      ...c,
      labRequests: (c.labRequests || []).filter(r => !luiAppartient(r)),
    });
  }
  if (aEcho) {
    state.consultations = state.consultations.map(c => (c.echoRequests || []).length === 0 ? c : {
      ...c,
      echoRequests: (c.echoRequests || []).filter(e => !luiAppartient(e)),
    });
  }
  return { ok: true, libelle, montant };
}

/**
 * LOT À ENCAISSER selon la sélection du guichet. La caisse facturer chaque
 * prescription INDÉPENDAMMENT : `cles` vaut
 *  - `null`  → TOUTES les pièces en attente du dossier (encaissement groupé,
 *    une facture et un numéro par pièce — jamais de fusion) ;
 *  - un tableau → UNIQUEMENT les pièces dont la clé est listée, les autres
 *    restant dans la file ; `[]` = rien de sélectionné (validation refusée).
 * Les clés qui ne correspondent plus à une pièce (ligne retirée ou déjà réglée
 * pendant la saisie) sont simplement ignorées.
 */
export function piecesSelectionnees<T extends { key: string }>(pieces: T[], cles: string[] | null | undefined): T[] {
  if (!cles) return pieces;
  const choisies = new Set(cles);
  return pieces.filter(p => choisies.has(p.key));
}

/**
 * Prochaine sélection quand on coche/décoche une prescription de la liste.
 * Revenir à « toutes les cases cochées » normalise en `null` : le lot suit
 * alors les pièces réellement en attente (une pièce retirée pendant la saisie
 * ne laisse pas une sélection fantôme).
 */
export function prochaineSelection(toutes: string[], actuelles: string[] | null, clef: string): string[] | null {
  const set = new Set(actuelles ?? toutes);
  if (set.has(clef)) set.delete(clef);
  else set.add(clef);
  const suivantes = [...set];
  return suivantes.length === toutes.length ? null : suivantes;
}

/**
 * Clé de comparaison d'un libellé d'article : casse, accents et espaces
 * multiples ignorés. La ligne de facture reprend le nom exact de l'article
 * prescrit, on peut donc reconnaître un médicament d'une pièce à l'autre.
 */
export const clefArticle = (libelle?: string): string =>
  (libelle || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Facture vue par la file : seuls ces champs servent à reconnaître ses lignes. */
export interface FacturePourPieces {
  patientId?: string;
  consultationId?: string;
  status: string;
  items?: { category?: string; description?: string }[];
}

/**
 * MÉDICAMENTS DÉJÀ PORTÉS SUR UNE FACTURE DE LA MÊME CONSULTATION.
 * Une prescription ne doit jamais être présentée deux fois au guichet :
 *  - facture EN ATTENTE de la consultation : ses lignes pharmacie seront
 *    encaissées AVEC cette facture — le « Facturer » de cette ligne les couvre
 *    déjà, ce n'est donc pas une pièce séparée ;
 *  - facture PAYÉE de la consultation : lignes déjà réglées, à ne plus
 *    redemander.
 * Sans cette règle, un dossier dont la facture globale porte déjà
 * « Oméprazole 20mg » afficherait EN OUTRE une seconde ligne « Oméprazole 20mg » :
 * les deux lignes ne seraient plus indépendantes (encaisser la grosse faisait
 * disparaître la petite) et le patient risquerait de payer deux fois le même
 * article. Ici, une prescription = une ligne, la plus complète.
 */
export function medicamentsDejaSurFacture(
  factures: FacturePourPieces[],
  consultation: { id: string; patientId?: string },
): Set<string> {
  const deja = new Set<string>();
  for (const inv of factures || []) {
    if (!inv || !consultation.patientId || inv.patientId !== consultation.patientId) continue;
    if (inv.consultationId !== consultation.id) continue;
    if (inv.status !== 'pending' && inv.status !== 'paid') continue;
    for (const item of inv.items || []) {
      if (!item || item.category !== 'pharmacy') continue;
      const cle = clefArticle(item.description);
      if (cle) deja.add(cle);
    }
  }
  return deja;
}

/** Ligne de pièce (facture ou ordonnance) vue par le découpage. */
export interface LignePieceCaisse {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  category?: string;
}

/**
 * Identité FINE d'une ligne : libellé + quantité + prix unitaire + montant.
 * Une facture « globale » ne couvre l'ordonnance de sa consultation que si elle
 * la porte À L'IDENTIQUE — sinon on ne déplace rien (les deux pièces resteraient
 * fausses), on absorbe.
 */
export const clefLignePiece = (l: LignePieceCaisse): string => {
  const r = (n: number | undefined) => String(Math.round((Number(n) || 0) * 100) / 100);
  return `${clefArticle(l.description)}|${r(l.quantity || 1)}|${r(l.unitPrice)}|${r(l.amount)}`;
};

/**
 * DÉCOUPAGE D'UNE FACTURE « GLOBALE » (legacy) — consultation + médicaments +
 * analyses sur une seule facture — pour que CHAQUE PRESCRIPTION reste une ligne
 * INDÉPENDANTE de la file caisse :
 *  - les lignes pharmacie identiques à une ligne de l'ordonnance de la
 *    consultation sont SORTIES de la facture : elles seront encaissées (ou
 *    retirées) sur leur propre ligne, avec leur propre numéro ;
 *  - jamais de facture vidée : si la facture ne porte QUE ces médicaments, elle
 *    reste intacte et les médicaments ne sont pas représentés deux fois ;
 *  - `absorbees` = libellés pharmacie restés sur la facture : l'ordonnance ne
 *    doit plus les redemander (ils sont déjà portés par cette ligne).
 */
export function separerOrdonnanceDeLaFacture<T extends LignePieceCaisse>(
  lignesFacture: T[],
  lignesOrdonnance: T[],
): { lignes: T[]; absorbees: Set<string>; scindee: boolean } {
  const cles = new Set((lignesOrdonnance || []).map(clefLignePiece));
  const deplacees = new Set<T>();
  for (const l of lignesFacture || []) {
    if (l && l.category === 'pharmacy' && cles.has(clefLignePiece(l))) deplacees.add(l);
  }
  let lignes = (lignesFacture || []).filter((l) => !deplacees.has(l));
  if (lignes.length === 0) {
    // Facture entièrement constituée des médicaments : pas de découpe.
    lignes = [...(lignesFacture || [])];
    deplacees.clear();
  }
  const absorbees = new Set<string>();
  for (const l of lignes) {
    if (l && l.category === 'pharmacy') {
      const cle = clefArticle(l.description);
      if (cle) absorbees.add(cle);
    }
  }
  return { lignes, absorbees, scindee: lignes.length !== (lignesFacture || []).length };
}
