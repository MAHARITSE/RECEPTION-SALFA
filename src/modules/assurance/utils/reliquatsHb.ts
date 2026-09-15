import type { AppState } from '../../../store';
import type { HbRecord } from '../../../types';
import { correspondRechercheMultiMots } from '../../../utils/recherche';
import {
  hbDernierPaiement, hbJoursDepuisSortie, hbReste, hbTotalFacture, hbTotalPaye, hbTypeLabel,
} from '../../../utils/hbDossier';

/**
 * Reliquats de sortie — bloc opératoire et hospitalisation.
 *
 * Un patient peut sortir sur simple autorisation (motif + donneur d'ordre
 * enregistrés à la Caisse) alors qu'il reste de l'argent au centre. Tant que la
 * caisse est ouverte, ces dossiers sont visibles dans ses onglets ; une fois
 * sortis, ils disparaissent de la Caisse et PERSONNE ne les relançait : c'est le
 * trou dans lequel tombe la recette. Cette vue les remet sous les yeux du
 * facturier, avec le reste dû, l'ancienneté et qui a autorisé la sortie.
 *
 * Tout est calculé depuis `state.hbRecords` (source unique : la Caisse et la
 * Pharmacie de garde y écrivent les encaissements) — aucune copie, aucun
 * double de saisie.
 */

export type FiltreTypeHb = 'tous' | 'hospit' | 'bloc';
export type TriReliquat = 'urgence' | 'sortie' | 'montant' | 'patient' | 'societe';

export interface ReliquatHb {
  id: string;
  patientId?: string;
  patientName: string;
  dossier: string;
  numeroFacture: string;
  type: HbRecord['type'];
  typeLabel: string;
  clientType: HbRecord['clientType'];
  societeId: string;
  societeNom: string;
  sousSociete: string;
  ouvertLe?: string;
  sortiLe: string;
  autorisePar: string;
  motif: string;
  donneurOrdre: string;
  totalFacture: number;
  totalPaye: number;
  reste: number;
  joursDepuisSortie: number;
  /** 'impaye' | 'partiel' | 'solde' | 'trop-percu' */
  statut: 'impaye' | 'partiel' | 'solde' | 'trop-percu';
  nbLignes: number;
  nbPaiements: number;
  dernierPaiement: { date: string; amount: number; recuPar: string } | null;
}

export interface FiltreReliquats {
  type: FiltreTypeHb;
  /** Société (id), 'ALL' pour toutes, '' pour les clients sans société. */
  societeId: string;
  recherche: string;
  /** Bornes sur la date de sortie (AAAA-MM-JJ, incluses). */
  sortieDu: string;
  sortieAu: string;
  /** false → ne montrer que l'argent encore dû (réglage par défaut). */
  inclureSoldes: boolean;
  tri: TriReliquat;
}

export const FILTRES_RELICATS_PAR_DEFAUT: FiltreReliquats = {
  type: 'tous',
  societeId: 'ALL',
  recherche: '',
  sortieDu: '',
  sortieAu: '',
  inclureSoldes: false,
  tri: 'urgence',
};

const jour = (valeur?: string): string => (valeur ? String(valeur).slice(0, 10) : '');

/** Une ligne par dossier hospit/bloc, sortie ou non, avant filtrage. */
export function decomposerReliquat(
  record: HbRecord,
  state: Pick<AppState, 'patients' | 'companies'>,
  reference: Date = new Date(),
): ReliquatHb {
  const societe = state.companies?.find(c => c.id === record.company);
  const patient = record.patientId ? state.patients?.find(p => p.id === record.patientId) : undefined;
  const totalFacture = hbTotalFacture(record);
  const totalPaye = hbTotalPaye(record);
  const reste = hbReste(record);
  const statut: ReliquatHb['statut'] = reste > 0
    ? (totalPaye > 0 ? 'partiel' : 'impaye')
    : (reste < 0 ? 'trop-percu' : 'solde');
  return {
    id: record.id,
    patientId: record.patientId,
    patientName: record.patientName || (patient ? `${patient.lastName} ${patient.firstName}`.trim() : 'Patient sans nom'),
    dossier: patient?.dossier || '',
    numeroFacture: record.numeroFacture || '',
    type: record.type,
    typeLabel: hbTypeLabel(record.type),
    clientType: record.clientType,
    societeId: record.company || '',
    societeNom: societe?.name || record.company || '',
    sousSociete: record.subCompany || '',
    ouvertLe: record.openedAt,
    sortiLe: record.dischargedAt || '',
    autorisePar: record.dischargedBy || '',
    motif: record.dischargeMotif || '',
    donneurOrdre: record.dischargeDonneurOrdre || '',
    totalFacture,
    totalPaye,
    reste,
    joursDepuisSortie: hbJoursDepuisSortie(record, reference),
    statut,
    nbLignes: (record.lines || []).length,
    nbPaiements: (record.payments || []).length,
    dernierPaiement: hbDernierPaiement(record),
  };
}

/** Dossiers sortis sur autorisation avec un solde ouvert (ou tous, selon le filtre). */
export function listerReliquatsHb(
  state: Pick<AppState, 'hbRecords' | 'patients' | 'companies'>,
  filtres: Partial<FiltreReliquats> = {},
  reference: Date = new Date(),
): ReliquatHb[] {
  const f = { ...FILTRES_RELICATS_PAR_DEFAUT, ...filtres };
  const lignes = (state.hbRecords || [])
    .filter(record => !!record.dischargedAt) // uniquement les dossiers ayant reçu une autorisation de sortie
    .map(record => decomposerReliquat(record, state, reference))
    .filter(ligne => {
      if (f.type !== 'tous' && ligne.type !== f.type) return false;
      if (f.societeId !== 'ALL') {
        if (f.societeId === '') { if (ligne.societeId) return false; }
        else if (ligne.societeId !== f.societeId) return false;
      }
      const du = jour(f.sortieDu);
      const au = jour(f.sortieAu);
      if (du && (!ligne.sortiLe || ligne.sortiLe.slice(0, 10) < du)) return false;
      if (au && (!ligne.sortiLe || ligne.sortiLe.slice(0, 10) > au)) return false;
      if (!f.inclureSoldes && ligne.reste <= 0) return false;
      if (f.recherche.trim()) {
        const cible = [
          ligne.patientName, ligne.dossier, ligne.numeroFacture, ligne.societeNom, ligne.sousSociete,
          ligne.motif, ligne.donneurOrdre, ligne.autorisePar, ligne.typeLabel, ligne.statut,
        ].filter(Boolean).join(' ');
        if (!correspondRechercheMultiMots(cible, f.recherche)) return false;
      }
      return true;
    });

  const comparateur = (a: ReliquatHb, b: ReliquatHb): number => {
    switch (f.tri) {
      case 'montant': return b.reste - a.reste || a.sortiLe.localeCompare(b.sortiLe);
      case 'sortie': return b.sortiLe.localeCompare(a.sortiLe);
      case 'patient': return a.patientName.localeCompare(b.patientName, 'fr');
      case 'societe': return (a.societeNom || '\u00e9\u00e9').localeCompare(b.societeNom || '\u00e9\u00e9', 'fr') || b.reste - a.reste;
      case 'urgence':
      default:
        // Le plus urgent = la plus grosse somme due, puis le plus ancien.
        return b.reste - a.reste || a.sortiLe.localeCompare(b.sortiLe);
    }
  };
  return lignes.sort(comparateur);
}

export interface SynthetiqueReliquats {
  nbDossiers: number;
  totalFacture: number;
  totalPaye: number;
  totalReste: number;
  nbImpayes: number;
  nbPartiels: number;
  nbPlus30Jours: number;
  montantPlus30Jours: number;
  nbHospit: number;
  nbBloc: number;
  parSociete: { societeId: string; societeNom: string; nb: number; reste: number }[];
  plusAncienJours: number;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Totaux de la sélection (affichés en haut de l'onglet et dans l'impression). */
export function synthetiserReliquats(lignes: ReliquatHb[]): SynthetiqueReliquats {
  const parSociete = new Map<string, { societeId: string; societeNom: string; nb: number; reste: number }>();
  let totalFacture = 0, totalPaye = 0, nbImpayes = 0, nbPartiels = 0, nbPlus30 = 0, montantPlus30 = 0, nbHospit = 0, nbBloc = 0, plusAncien = 0;
  for (const ligne of lignes) {
    totalFacture += ligne.totalFacture;
    totalPaye += ligne.totalPaye;
    if (ligne.statut === 'impaye') nbImpayes += 1;
    if (ligne.statut === 'partiel') nbPartiels += 1;
    if (ligne.joursDepuisSortie > 30) { nbPlus30 += 1; montantPlus30 += ligne.reste; }
    if (ligne.type === 'hospit') nbHospit += 1; else nbBloc += 1;
    if (ligne.joursDepuisSortie > plusAncien) plusAncien = ligne.joursDepuisSortie;
    const cle = ligne.societeId || ligne.societeNom || '';
    const entree = parSociete.get(cle) || { societeId: cle, societeNom: ligne.societeNom || 'Clients sans société', nb: 0, reste: 0 };
    entree.nb += 1;
    entree.reste += ligne.reste;
    parSociete.set(cle, entree);
  }
  return {
    nbDossiers: lignes.length,
    totalFacture: arrondi(totalFacture),
    totalPaye: arrondi(totalPaye),
    totalReste: arrondi(lignes.reduce((s, l) => s + l.reste, 0)),
    nbImpayes,
    nbPartiels,
    nbPlus30Jours: nbPlus30,
    montantPlus30Jours: arrondi(montantPlus30),
    nbHospit,
    nbBloc,
    parSociete: [...parSociete.values()].map(e => ({ ...e, reste: arrondi(e.reste) })).sort((a, b) => b.reste - a.reste),
    plusAncienJours: plusAncien,
  };
}

/** Lignes prêtes pour `telechargerClasseur` (en-têtes = colonnes du fichier). */
export function lignesExcelReliquats(lignes: ReliquatHb[], devise = 'Ar'): Record<string, unknown>[] {
  const montant = (n: number) => n;
  return lignes.map(l => ({
    'Sorti le': l.sortiLe.slice(0, 10),
    'Jours depuis sortie': l.joursDepuisSortie,
    'Patient': l.patientName,
    'Dossier': l.dossier,
    'N° facture': l.numeroFacture,
    'Service': l.typeLabel,
    'Société': l.societeNom,
    'Service / sous-société': l.sousSociete,
    [`Facturé (${devise})`]: montant(l.totalFacture),
    [`Réglé (${devise})`]: montant(l.totalPaye),
    [`Reste dû (${devise})`]: montant(l.reste),
    'Statut': l.statut,
    'Autorisation donnée par': l.autorisePar,
    'Motif de sortie': l.motif,
    "Donneur d'ordre": l.donneurOrdre,
    'Nb lignes': l.nbLignes,
    'Nb paiements': l.nbPaiements,
    'Dernier règlement': l.dernierPaiement ? `${l.dernierPaiement.date.slice(0, 10)} — ${l.dernierPaiement.amount}` : '',
  }));
}
