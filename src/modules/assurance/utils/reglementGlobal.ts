import type { BillingDocument } from '../monthlyBilling';
import type { LignePaiement, Paiement, Prestation, Societe } from '../types';

/** Solde restant à recouvrer sur une pièce (part société, après règlements et rejets). */
export function soldeDocument(d: Pick<BillingDocument, 'payable' | 'paid' | 'rejected'>): number {
  return Math.max(0, Math.round((d.payable - d.paid - d.rejected) * 100) / 100);
}

export interface ImputationGlobale {
  doc: BillingDocument;
  /** La pièce correspond à une prescription du suivi assurance (imputable au bordereau). */
  imputable: boolean;
  solde: number;
  /** Portion du règlement imputée à cette pièce. */
  montant: number;
}

export interface RepartitionGlobale {
  imputations: ImputationGlobale[];
  /** Solde total des pièces du mois. */
  totalSolde: number;
  /** Solde imputable : uniquement les pièces rattachées à une prescription. */
  soldeImputable: number;
  /** Partie du montant qui dépasse le solde imputable (doit rester nulle). */
  reste: number;
}

/**
 * Répartition du règlement d'un « payeur global » : la facture la plus ancienne
 * est soldée en premier (FIFO), chaque pièce étant plafonnée à son solde.
 * Les pièces sans prescription associée (ventes directes Caisse) ne peuvent pas
 * être imputées automatiquement : elles sont listées à montant nul.
 */
export function repartitionReglementGlobal(
  documents: BillingDocument[],
  montant: number,
  estPrestation: (doc: BillingDocument) => boolean,
): RepartitionGlobale {
  const triees = [...documents].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number) || a.id.localeCompare(b.id));
  let restant = Math.round((Number.isFinite(montant) ? montant : 0) * 100) / 100;
  const imputations = triees.map(doc => {
    const solde = soldeDocument(doc);
    const imputable = estPrestation(doc);
    const alloue = imputable && restant > 0 ? Math.round(Math.min(solde, restant) * 100) / 100 : 0;
    if (alloue > 0) restant = Math.round((restant - alloue) * 100) / 100;
    return { doc, imputable, solde, montant: alloue };
  });
  const totalSolde = Math.round(imputations.reduce((s, i) => s + i.solde, 0) * 100) / 100;
  const soldeImputable = Math.round(imputations.reduce((s, i) => s + (i.imputable ? i.solde : 0), 0) * 100) / 100;
  return { imputations, totalSolde, soldeImputable, reste: restant };
}

const cleanRef = (r: string) => (r || '').replace(/[\s\-\_\.\/]/g, '').toUpperCase();

/**
 * Propose un numéro de bordereau unique pour un règlement global :
 * `REG-<CODE SOCIÉTÉ>-<AAAAMM>-<001>`, incrémenté si la référence existe déjà.
 */
export function numeroBordereauPropose(codeSociete: string, month: string, numerosExistants: string[]): string {
  const pris = new Set(numerosExistants.filter(Boolean).map(cleanRef));
  const code = (codeSociete || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'SOC';
  const base = `REG-${code}-${(month || '').replace(/\D/g, '').slice(0, 6)}`;
  for (let seq = 1; seq < 1000; seq++) {
    const candidat = `${base}-${String(seq).padStart(3, '0')}`;
    if (!pris.has(cleanRef(candidat))) return candidat;
  }
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

/** Crée le bordereau de règlement « payeur global » à partir de la répartition FIFO. */
export function creerPaiementGlobal(params: {
  societe: Societe;
  month: string;
  numeroFactureMensuelle?: string;
  montant: number;
  datePaiement: string;
  modePaiement: Paiement['modePaiement'];
  numeroBordereau: string;
  notes?: string;
  repartition: RepartitionGlobale;
  prestations: Prestation[];
  generateId: (prefix: string) => string;
  horodatage: string;
}): Paiement {
  const { societe, month, numeroFactureMensuelle, montant, datePaiement, modePaiement, numeroBordereau, notes, repartition, prestations, generateId, horodatage } = params;
  const paiementId = generateId('pai');
  const commentaire = numeroFactureMensuelle
    ? `Règlement payeur global — facture mensuelle ${numeroFactureMensuelle} (${month})`
    : `Règlement payeur global — facturation ${month}`;
  const lignes: LignePaiement[] = repartition.imputations.filter(i => i.montant > 0).map(i => {
    const prestation = prestations.find(p => p.id === i.doc.id);
    return {
      id: generateId('lp'),
      paiementId,
      // Paiement au niveau de la facture : sans acte précis, la réconciliation
      // met à jour la prescription entière (montants et statut).
      lignePrestationId: '',
      prestationId: i.doc.id,
      prestationNumero: i.doc.number,
      dateSoins: prestation?.date,
      immatriculation: i.doc.matricule || '',
      nomBaseAssurance: i.doc.client,
      nomAgent: i.doc.client,
      totalPaye: i.montant,
      montantPaye: i.montant,
      ticketModerateur: 0,
      montantExclu: 0,
      montantReclame: i.doc.payable,
      codeActe: 'GLOBAL',
      libelleActe: `Règlement global ${month}`,
      actesPayes: [{ code: 'GLOBAL', libelle: `Facture ${i.doc.number} — ${commentaire}`, montant: i.montant }],
      commentaire,
    };
  });
  const totalReclame = Math.round(lignes.reduce((s, l) => s + (l.montantReclame || 0), 0) * 100) / 100;
  return {
    id: paiementId,
    numeroBordereau,
    datePaiement,
    dateSaisie: horodatage,
    societeId: societe.id,
    societeNom: societe.nom,
    matricule: '',
    modePaiement,
    referencePaiement: numeroBordereau,
    totalReclame,
    totalPaye: montant,
    totalModerateur: 0,
    totalExclu: 0,
    remise: 0,
    statut: 'Validé',
    notes,
    lignes,
  };
}
