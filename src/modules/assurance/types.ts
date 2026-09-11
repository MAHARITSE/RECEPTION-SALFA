/**
 * Grande famille d'organisme payeur :
 *  - 'global'  : PAYEUR GLOBAL — règle la totalité de la facture en une seule
 *                fois, sans distinction de personne ni d'acte.
 *  - 'partiel' : PAIEMENT PARTIEL (ASSURANCE) — règle partiellement, assuré par
 *                assuré et/ou acte par acte, selon le taux contractuel.
 */
export type SocieteModePaiement = 'global' | 'partiel';

export interface SocieteModeOption {
  value: SocieteModePaiement;
  label: string;
  description: string;
}

export const SOCIETE_MODES_PAIEMENT: SocieteModeOption[] = [
  {
    value: 'global',
    label: 'Payeur global',
    description: 'Paie la totalité de la facture en une fois, sans distinction de personne.',
  },
  {
    value: 'partiel',
    label: 'Paiement partiel (assurance)',
    description: 'Paie partiellement, par assuré ou par acte, selon le taux contractuel.',
  },
];

/**
 * Exclusion contractuelle d'une société : un assuré ('personne') ou une famille
 * d'articles ('famille' — ex. ÉCHOGRAPHIE, LABORATOIRE) n'est pas pris en charge.
 * Le montant correspondant est alors à la charge du patient (client comptoir).
 */
export interface ExclusionSociete {
  id: string;
  type: 'personne' | 'famille';
  /** Référence de l'assuré exclu (référentiel commun Réception). */
  personneId?: string;
  nomPrenom?: string;
  matricule?: string;
  /** Code famille du catalogue (ex: ECHO, LABO) ou libellé libre saisi. */
  familleCode?: string;
  familleLibelle?: string;
  /** Mots-clés additionnels reconnus dans le libellé de l'acte. */
  motsCles?: string[];
  /** Taux résiduel encore pris en charge par la société (0 = exclusion totale). */
  tauxPriseEnCharge?: number;
  motif?: string;
  actif?: boolean;
  dateAjout?: string;
}

export interface Societe {
  sharedCompany?: boolean;
  id: string;
  nom: string;
  code: string;
  contact?: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  tauxCouvertureDefaut: number; // e.g. 80%
  sousSocietes?: string[];
  /** Payeur global ou paiement partiel (assurance). */
  modePaiement?: SocieteModePaiement;
  /** Personnes / familles d'articles non pris en charge par cette société. */
  exclusions?: ExclusionSociete[];
  /** Liste noire : plus aucune consultation / prise en charge aux frais de la société. */
  blacklisted?: boolean;
  blacklistReason?: string;
  blacklistDate?: string;
  /** Fin de la suspension temporaire (vide = durée indéterminée). */
  blacklistUntil?: string;
}

export interface Personne {
  /** Patient du référentiel Réception (identité non modifiable ici). */
  sharedPatient?: boolean;
  dossier?: string;
  id: string;
  nomPrenom: string;
  matricule: string;
  societeId: string;
  sousSociete?: string;
  qualite?: 'Adhérent Principal' | 'Conjoint' | 'Enfant' | 'Ayant droit' | string;
  familleCode?: string;
  dateNaissance?: string;
  telephone?: string;
  email?: string;
  tauxCouverture?: number;
  statut?: 'Actif' | 'Inactif' | string;
}

export interface Famille {
  id: string;
  code: string;
  libelle: string;
  plafondAnnuel?: number;
  tauxStandard?: number;
  tarifConventionne?: number;
  ticketModerateurDefaut?: number;
  description?: string;
  aliases: string[]; // Codes alternatifs, synonymes et descriptions reconnus (ex: ['PH', 'PHSB', 'PHARMACIE', 'MEDIC'])
}

export interface LignePrestation {
  id: string;
  prestationId: string;
  code: string; // Famille code, e.g. CONS, PHAR, LABO, DENT, HOSP
  libelle?: string;
  totalPrestation: number; // Montant brut de l'acte
  montant?: number; // Alias pour montant de l'acte
  ticketModerateur?: number; // Part modérateur assuré sur cet acte
  montantARembourser?: number; // Net à rembourser sur cet acte
  totalPaye: number; // Montant cumulé payé à travers tous les règlements
  montantExclu?: number; // Montant exclu / rejeté
  motifExclusion?: string; // Motif de l'exclusion
  /** Acte bloqué par une exclusion de la société (assuré ou famille d'articles). */
  excluParSociete?: boolean;
  statut?: 'En attente' | 'Partiellement payé' | 'Payé' | 'Rejeté';
  /** Ligne Caisse (originale, lecture seule) ou ajout du facturier
   * (« omission » / « ordonnance externe remboursée par l'hôpital »). */
  origine?: 'caisse' | 'omission' | 'ordonnance_externe';
  /** Saisie façon Sage (ajouts du facturier) : quantité, remise, P.U., date d'acte. */
  quantity?: number;
  remisePct?: number;
  prixUnitaire?: number;
  dateActe?: string;
}

export interface Prestation {
  /** Référence directe à la facture de Caisse ; pas de copie financière. */
  sourceInvoiceId?: string;
  id: string;
  numeroFacture: string;
  date: string;
  societeId: string;
  societeNom?: string;
  sousSociete: string;
  personneId: string;
  nomAgent?: string; // Nom de l'agent / assuré / bénéficiaire
  matricule?: string; // Matricule de l'agent
  totalPrestation: number; // Montant total brut
  montantTotal?: number; // Alias montant total
  participation: number; // Ticket modérateur assuré
  ticketModerateur?: number; // Alias ticket modérateur
  montantARembourser?: number; // Montant à rembourser (total - ticket modérateur)
  totalPaye?: number; // Somme cumulée payée (règlements multiples)
  montantExclu?: number; // Montant exclu / rejeté
  motifExclusion?: string; // Motif d'exclusion / rejet
  resteAPayer?: number; // Reste à recouvrer
  statut: 'En attente' | 'Partiellement payé' | 'Payé' | 'Rejeté';
  lignes: LignePrestation[];
  /** Lignes saisies par le facturier (omissions / ordonnances externes) pour
   * une prescription liée à une facture Caisse : superposées à la facture,
   * sans jamais modifier ses lignes originales. */
  ajouts?: LignePrestation[];
  dateCreation: string;
  datePaiement?: string;
  numeroBordereau?: string;
  commentaires?: string;
}

export interface LignePaiement {
  id: string;
  paiementId: string;
  lignePrestationId: string;
  prestationId: string;
  immatriculation: string;
  nomBaseAssurance: string;
  nomAgent?: string; // Nom de l'agent rattaché
  // rattachement à la prescription (base 1)
  prestationNumero?: string;
  dateSoins?: string; // date des soins de la prestation d'origine
  // montants
  totalPaye: number; // Montant payé sur cette ligne
  montantPaye?: number;
  ticketModerateur: number;
  montantExclu: number;
  montantReclame?: number; // montant initial de l'acte
  codeActe?: string;
  libelleActe?: string;
  // regroupement des actes payés dans cette ligne
  actesPayes?: { code: string; libelle: string; montant: number }[];
  commentaire?: string;
}

export interface Paiement {
  sourceReadonly?: boolean;
  id: string;
  numeroBordereau: string;
  datePaiement: string;
  dateSoins?: string; // Date des soins
  /** Horodatage technique, immuable, de l'importation ou de la saisie du règlement. */
  dateSaisie: string;
  societeId: string;
  societeNom?: string;
  sousSociete?: string;
  nomAgent?: string; // Nom de l'agent rattaché
  matricule?: string;
  prestationId?: string; // Prescription rattachée principale si mono-adhérent
  prestationNumero?: string;
  modePaiement: 'Virement bancaire' | 'Chèque' | 'Espèces' | 'Mobile Money' | 'Autre';
  referencePaiement: string;
  totalReclame: number; // Montant brut à payer
  montantAPayer?: number;
  totalPaye: number; // Somme payée nette
  sommePayee?: number;
  totalModerateur: number;
  ticketModerateur?: number;
  totalExclu: number;
  montantExclu?: number;
  remise: number;
  statut: 'Brouillon' | 'Validé' | 'Comptabilisé';
  lignes: LignePaiement[];
  notes?: string;
}

export interface ActeMedicalDetail {
  code: string;
  libelle: string;
  montant: number;
  mappedFamilleCode?: string; // Famille dans la base reliée (ex: PHAR, CONS, LABO, etc.)
  isUnknown?: boolean;
}

export interface FactureLigneParsed {
  numeroLigne: number;
  dateSoins: string;
  matricule: string;
  nomPrenom: string;
  societeAffiliee?: string; // Société principale ou garant (ex: BSA, MCI, ASCOMA, AXIAN, BRED)
  sousSociete?: string; // Sous-société extraite des parenthèses (ex: BFV EMPLOYES, BFV RETRAITES, TELMA, etc.)
  ayantDroit?: string; // Ayant droit si différent de l'adhérent
  prestataireNom?: string; // Nom du médecin/service
  numeroFactureOrigine?: string; // Réf facture d'origine dans les décomptes MCI
  actes: ActeMedicalDetail[];
  actesTexte: string;
  montantBrut: number;
  montantExclu?: number; // Montant exclu ou rejeté
  baseReglement?: number; // Base décomptée
  participation: number; // Quote-part / Ticket modérateur
  netAPayer: number; // Prise en charge / Montant réglé
  observations?: string;
  hasUnmappedActs?: boolean; // Indique si un acte nécessite un choix de liaison
  matchedPersonneId?: string;
  matchedSocieteId?: string;
  matchedPrestationId?: string;
  isNewPersonne?: boolean;
  isNewSociete?: boolean;
}

export interface ParsedFactureAssurance {
  documentType?: 'facture' | 'decompte';
  etablissement: string;
  numeroFacture: string;
  numeroBordereau?: string;
  moisPriseEnCharge: string;
  clientDoit: string; // Organisme / Société (ex: MCI CARE, ASCOMA, BSA)
  garant?: string; // ex: GROUPE AXIAN, BSA / ASK GS
  dateEmission: string;
  dateComptable?: string;
  codeCentre?: string;
  periodeReglement?: string;
  banqueReglement?: string;
  rib?: string;
  totalMontantBrut: number;
  totalExclu?: number;
  totalBaseReglement?: number;
  totalParticipation: number;
  totalNetAPayer: number;
  remise?: number;
  sommeLettres?: string;
  lignes: FactureLigneParsed[];
}

export type ActiveTab = 
  | 'dashboard'
  | 'prestations'
  | 'paiements'
  | 'rejets'
  | 'historique'
  | 'societes'
  | 'personnes'
  | 'familles'
  | 'etats'
  | 'entete';

export interface EnteteConfig {
  etablissement: string;
  sousTitre: string;
  departement: string;
  adresse: string;
  telephone: string;
  email: string;
  nifStat: string;
  villePays: string;
  logoUrl?: string;
  fontFamily: 'helvetica' | 'times' | 'courier';
  titreTaille: number;
  sousTitreTaille: number;
  corpsTaille: number;
  formePolice: 'bold' | 'normal' | 'italic' | 'bolditalic';
  majusculesTitre: boolean;
  alignement: 'left' | 'center' | 'between';
  themeCouleur: 'slate' | 'rouge' | 'emeraude' | 'indigo' | 'sombre' | 'custom';
  couleurPrimaire: string;
  couleurAccent: string;
  styleSeparateur: 'bandeau' | 'ligne_simple' | 'double_ligne' | 'aucun';
  textePiedDePage: string;
  afficherDateGeneration: boolean;
}

export const defaultEnteteConfig: EnteteConfig = {
  etablissement: 'ÉTABLISSEMENT MÉDICAL SALFA',
  sousTitre: 'Service de Facturation & Recouvrement Tiers-Payant',
  departement: 'Pôle Gestion Assurances & Créances Santé',
  adresse: 'Lot IVK 45, Ambohibao - Antananarivo 101',
  telephone: '+261 20 22 200 00 / +261 34 00 000 00',
  email: 'contact@salfa.mg / facturation@salfa.mg',
  nifStat: 'NIF: 3000123456 • STAT: 86101 11 2005 0 00123',
  villePays: 'Antananarivo, Madagascar',
  fontFamily: 'helvetica',
  titreTaille: 15,
  sousTitreTaille: 9,
  corpsTaille: 8,
  formePolice: 'bold',
  majusculesTitre: true,
  alignement: 'between',
  themeCouleur: 'slate',
  couleurPrimaire: '#1e293b',
  couleurAccent: '#b91c1c',
  styleSeparateur: 'bandeau',
  textePiedDePage: 'Document Confidentiel de Recouvrement et Suivi des Assurances • SALFA',
  afficherDateGeneration: true,
};

