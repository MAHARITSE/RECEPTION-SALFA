import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Search,
  Link2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  User,
  Unlink,
  Filter,
  Calendar
} from 'lucide-react';
import { Paiement, LignePaiement, Prestation } from '../../types';
import { formatMoney, formatDate } from '../../utils/formatters';
import { maskNom } from '../../utils/inputMasks';
import {
  computeMontantConfrontation,
  formatEcartMontant,
  montantProximiteScore,
  MONTANT_IMPORT_LABEL,
  MONTANT_ACTE_LABEL,
  MONTANT_TOLERANCE,
  MONTANT_COMPARISON_HINT,
  ACT_SORT_OPTIONS,
  actSortLabel,
  type ActSortMode,
  type MontantConfrontation,
} from '../../utils/montantConfrontation';

interface RelierPaiementModalProps {
  isOpen: boolean;
  onClose: () => void;
  paiement: Paiement | null;
  lignePaiement: LignePaiement | null;
  prestations: Prestation[];
  onSavePaiement: (paiement: Paiement, updatedPrestations: Prestation[]) => void;
}

interface MatchCandidate {
  prestationId: string;
  prestationNum: string;
  prestationDate: string;
  lignePrestationId: string;
  codeActe: string;
  libelleActe: string;
  societeId?: string;
  societeNom?: string;
  sousSociete?: string;
  personneId?: string;
  personneNom: string;
  matricule: string;
  montantInitial: number;
  ticketModerateur: number;
  montantARembourser: number;
  dejaPaye: number;
  resteAPayer: number;
}

interface ConfrontationDetails {
  type: 'PERFECT' | 'SAME_DATE' | 'SAME_AMOUNT' | 'VERIFY' | 'UNLINKED';
  isSameDate: boolean;
  isSameMontantBrut: boolean;
  isSameMontantNet: boolean;
  isSameMontant: boolean;
  diffMontantBrut: number;
  /** Comparaison « Montant_Reclame_Brut du règlement ↔ montant sans TM de l'acte prescrit ». */
  montant: MontantConfrontation;
  /** Le montant sans TM de l'acte égale le Montant_Reclame_Brut du règlement. */
  isSameMontantSansTM: boolean;
  /** Score de proximité de montant (100 = conforme) utilisé pour le tri des candidats. */
  montantRank: number;
  label: string;
  badgeClass: string;
  cardBorderClass: string;
  rowBorderClass: string;
  tagColor: string;
}

/**
 * Confrontation ligne de règlement ↔ acte prescrit.
 * RÈGLE : le montant comparé est le « montant sans TM » de l'acte prescrit
 * (total de l'acte − ticket modérateur) contre le « Montant_Reclame_Brut » de
 * l'importation / de la ligne de règlement. L'écart obtenu alimente le tri et
 * est affiché sur chaque résultat.
 */
function getConfrontationDetails(
  dateSoins?: string,
  montantBrutSettlement?: number,
  netAPayerSettlement?: number,
  candidate?: MatchCandidate
): ConfrontationDetails {
  const brut = Number(montantBrutSettlement || netAPayerSettlement || 0);
  const montant = computeMontantConfrontation(brut, candidate);
  const montantRank = montantProximiteScore(montant);

  const cleanDateSoins = (dateSoins || '').trim().substring(0, 10);
  const candDate = (candidate?.prestationDate || '').trim().substring(0, 10);
  const isSameDate = Boolean(candidate && cleanDateSoins && candDate && cleanDateSoins === candDate);

  const net = Number(netAPayerSettlement || 0);
  const candRemb = Number(candidate?.montantARembourser || 0);
  const candReste = Number(candidate?.resteAPayer || 0);

  // 1) CRITÈRE PRINCIPAL : montant sans TM de l'acte == Montant_Reclame_Brut du règlement
  const isSameMontantSansTM = Boolean(candidate) && montant.isConforme;
  const isSameMontantBrut = isSameMontantSansTM;
  // 2) FILET DE SECOURS : ligne de règlement exprimée en net payé
  const isSameMontantNet = Boolean(candidate) && !isSameMontantSansTM && net > 0
    && (Math.abs(net - candRemb) < MONTANT_TOLERANCE || Math.abs(net - candReste) < MONTANT_TOLERANCE);
  const isSameMontant = isSameMontantBrut || isSameMontantNet;
  const diffMontantBrut = montant.ecart;

  const build = (
    status: Pick<ConfrontationDetails, 'type' | 'label' | 'badgeClass' | 'cardBorderClass' | 'rowBorderClass' | 'tagColor'>
  ): ConfrontationDetails => ({
    isSameDate,
    isSameMontantBrut,
    isSameMontantNet,
    isSameMontant,
    diffMontantBrut,
    montant,
    isSameMontantSansTM,
    montantRank,
    ...status,
  });

  if (!candidate) {
    return build({
      type: 'UNLINKED',
      label: 'Non relié',
      badgeClass: 'bg-surface-hover text-ink border-line-strong font-medium',
      cardBorderClass: 'border-line bg-surface-muted',
      rowBorderClass: 'hover:bg-indigo-50/40',
      tagColor: 'slate'
    });
  }

  if (isSameDate && isSameMontant) {
    return build({
      type: 'PERFECT',
      label: isSameMontantBrut
        ? 'Même Date & Montant sans TM Conforme'
        : 'Même Date & Net Conforme',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
      cardBorderClass: 'border-emerald-300 bg-emerald-50/70',
      rowBorderClass: 'border-l-4 border-l-emerald-500 bg-emerald-50/30',
      tagColor: 'emerald'
    });
  }

  if (isSameDate && !isSameMontant) {
    return build({
      type: 'SAME_DATE',
      label: `Même Date (Écart ${formatEcartMontant(montant.ecart)})`,
      badgeClass: 'bg-sky-100 text-sky-900 border-sky-300 font-semibold',
      cardBorderClass: 'border-sky-300 bg-sky-50/60',
      rowBorderClass: 'border-l-4 border-l-sky-500 bg-sky-50/20',
      tagColor: 'sky'
    });
  }

  if (!isSameDate && isSameMontant) {
    return build({
      type: 'SAME_AMOUNT',
      label: isSameMontantBrut
        ? 'Même Montant sans TM (Date différente)'
        : 'Même Net Payé (Date différente)',
      badgeClass: 'bg-purple-100 text-purple-900 border-purple-300 font-semibold',
      cardBorderClass: 'border-purple-300 bg-purple-50/60',
      rowBorderClass: 'border-l-4 border-l-purple-500 bg-purple-50/20',
      tagColor: 'purple'
    });
  }

  return build({
    type: 'VERIFY',
    label: montant.isComparable
      ? `À vérifier (Date & Écart ${formatEcartMontant(montant.ecart)})`
      : 'À vérifier (Date & Montant diffèrent)',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-medium',
    cardBorderClass: 'border-amber-300 bg-amber-50/60',
    rowBorderClass: 'border-l-4 border-l-amber-500 bg-amber-50/20',
    tagColor: 'amber'
  });
}

export const RelierPaiementModal: React.FC<RelierPaiementModalProps> = ({
  isOpen,
  onClose,
  paiement,
  lignePaiement,
  prestations,
  onSavePaiement,
}) => {
  const [actSearchQuery, setActSearchQuery] = useState('');
  // Filtre par pertinence appliqué aux résultats de la sous-fenêtre « Lier »
  // (même date + même montant, même date, même montant, à vérifier) — identique à l'importation
  const [actResultFilter, setActResultFilter] = useState<'ALL' | 'PERFECT' | 'SAME_DATE' | 'SAME_AMOUNT' | 'VERIFY'>('ALL');
  // Tri des résultats — date croissante par défaut ; « écart de montant » disponible
  const [actSortMode, setActSortMode] = useState<ActSortMode>('DATE_ASC');

  // Extract patient info & settlement line values
  const activeNom = lignePaiement?.nomAgent || lignePaiement?.nomBaseAssurance || '';
  const activeMat = lignePaiement?.immatriculation || '';
  const activeDate = lignePaiement?.dateSoins || '';
  const activeBrut = lignePaiement?.montantReclame || 
    ((lignePaiement?.totalPaye || 0) + (lignePaiement?.ticketModerateur || 0) + (lignePaiement?.montantExclu || 0));
  const activeNet = lignePaiement?.totalPaye || lignePaiement?.montantPaye || 0;

  // Initialize search query with the FIRST name token (premier nom) or matricule on open
  // — identique à la sous-fenêtre « Lier » de l'import décompte : on cherche
  // d'abord sur le premier mot du nom pour élargir les résultats.
  useEffect(() => {
    if (lignePaiement) {
      const firstName = (activeNom || '').trim().split(/\s+/)[0] || '';
      setActSearchQuery(firstName || activeMat || '');
      setActResultFilter('ALL');
    }
  }, [lignePaiement, activeNom, activeMat]);

  // Compute ALL eligible unpaid / partially paid acts across database
  const allEligibleActs: MatchCandidate[] = useMemo(() => {
    const list: MatchCandidate[] = [];

    (prestations || []).forEach(prest => {
      // Exclude fully paid or rejected prestations unless it's currently linked
      if (prest.statut === 'Payé' || prest.statut === 'Rejeté') {
        if (prest.id !== lignePaiement?.prestationId) return;
      }

      const persNom = prest.nomAgent || 'Patient';
      const persMat = prest.matricule || '-';
      const socNom = prest.societeNom || '';
      const sousSoc = prest.sousSociete || '';

      if (prest.lignes && prest.lignes.length > 0) {
        prest.lignes.forEach((ligne, lIdx) => {
          const brut = ligne.totalPrestation || 0;
          const part = ligne.ticketModerateur ?? Math.round((prest.ticketModerateur || 0) / (prest.lignes.length || 1));
          const remb = ligne.montantARembourser ?? Math.max(0, brut - part);
          const dejaPaye = ligne.totalPaye || 0;
          const reste = Math.max(0, remb - dejaPaye);

          if (reste > 0 || prest.id === lignePaiement?.prestationId) {
            list.push({
              prestationId: prest.id,
              prestationNum: prest.numeroFacture,
              prestationDate: prest.date,
              lignePrestationId: ligne.id || `${prest.id}-lig-${lIdx}`,
              codeActe: ligne.code || 'CONS',
              libelleActe: ligne.libelle || ligne.code || 'Acte de soins',
              societeId: prest.societeId,
              societeNom: socNom,
              sousSociete: sousSoc,
              personneId: prest.personneId,
              personneNom: persNom,
              matricule: persMat,
              montantInitial: brut,
              ticketModerateur: part,
              montantARembourser: remb,
              dejaPaye: dejaPaye,
              resteAPayer: reste
            });
          }
        });
      } else {
        const tot = prest.montantTotal ?? prest.totalPrestation ?? 0;
        const mod = prest.ticketModerateur ?? prest.participation ?? 0;
        const remb = prest.montantARembourser ?? Math.max(0, tot - mod);
        const dejaPaye = prest.totalPaye || 0;
        const reste = Math.max(0, remb - dejaPaye);

        if (reste > 0 || prest.id === lignePaiement?.prestationId) {
          list.push({
            prestationId: prest.id,
            prestationNum: prest.numeroFacture,
            prestationDate: prest.date,
            lignePrestationId: `${prest.id}-main`,
            codeActe: 'ACTE',
            libelleActe: prest.commentaires || 'Prestation globale',
            societeId: prest.societeId,
            societeNom: socNom,
            sousSociete: sousSoc,
            personneId: prest.personneId,
            personneNom: persNom,
            matricule: persMat,
            montantInitial: tot,
            ticketModerateur: mod,
            montantARembourser: remb,
            dejaPaye: dejaPaye,
            resteAPayer: reste
          });
        }
      }
    });

    return list;
  }, [prestations, lignePaiement?.prestationId]);

  // Filter & rank search candidates
  const filteredSearchCandidates = useMemo(() => {
    const q = actSearchQuery.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const targetSocId = paiement?.societeId;
    const targetSocNom = (paiement?.societeNom || '').toLowerCase().trim();

    const candidates = allEligibleActs.filter(cand => {
      // STRICT INTER-SOCIETY RULE: Disallow linking payment to prestations of a different society/garant
      if (targetSocId && cand.societeId && cand.societeId !== targetSocId) {
        return false;
      }
      if (targetSocNom && cand.societeNom && cand.societeNom.toLowerCase().trim() !== targetSocNom && cand.societeId !== targetSocId) {
        return false;
      }

      if (!q) return true;
      const cNom = (cand.personneNom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cMat = (cand.matricule || '').toLowerCase();
      const cNum = (cand.prestationNum || '').toLowerCase();
      const cCode = (cand.codeActe || '').toLowerCase();
      const cLib = (cand.libelleActe || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cSoc = (cand.sousSociete || cand.societeNom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cDate = (cand.prestationDate || '');

      return cNom.includes(q) || cMat.includes(q) || cNum.includes(q) || cCode.includes(q) || cLib.includes(q) || cSoc.includes(q) || cDate.includes(q);
    });

    const cleanNom = activeNom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const cleanMat = activeMat.replace(/\s+/g, '').toLowerCase();

    const typeRank: Record<string, number> = { PERFECT: 0, SAME_DATE: 1, SAME_AMOUNT: 2, VERIFY: 3, UNLINKED: 4 };
    const dayOf = (iso?: string): number => {
      const t = Date.parse(iso || '');
      return Number.isFinite(t) ? Math.round(t / 86_400_000) : Number.POSITIVE_INFINITY;
    };
    const targetDay = dayOf(activeDate);
    const isoOf = (iso?: string): string => (iso || '').trim().substring(0, 10);

    // Tri par écart de montant : classement direct du résultat de la comparaison
    // « Montant_Reclame_Brut (règlement) ↔ montant sans TM (acte prescrit) ».
    if (actSortMode === 'MONTANT_ASC' || actSortMode === 'MONTANT_DESC') {
      const dir = actSortMode === 'MONTANT_ASC' ? 1 : -1;
      return [...candidates].sort((a, b) => {
        const detA = getConfrontationDetails(activeDate, activeBrut, activeNet, a);
        const detB = getConfrontationDetails(activeDate, activeBrut, activeNet, b);
        if (detA.montant.ecartAbsolu !== detB.montant.ecartAbsolu) {
          return dir * (detA.montant.ecartAbsolu - detB.montant.ecartAbsolu);
        }
        // Ex æquo (écarts identiques) : catégorie de pertinence, puis date, puis nom
        const typeDiff = (typeRank[detA.type] ?? 4) - (typeRank[detB.type] ?? 4);
        if (typeDiff !== 0) return typeDiff;
        const dateCmp = isoOf(a.prestationDate).localeCompare(isoOf(b.prestationDate));
        if (dateCmp !== 0) return dateCmp;
        const nameCmp = (a.personneNom || '').localeCompare(b.personneNom || '', 'fr', { sensitivity: 'base' });
        if (nameCmp !== 0) return nameCmp;
        return (a.prestationNum || '').localeCompare(b.prestationNum || '');
      });
    }

    // Tri par date de soins croissante / décroissante (date croissante par défaut) :
    // la date de l'acte prescrit est le critère principal, la pertinence et l'écart
    // de montant départagent les ex æquo.
    if (actSortMode === 'DATE_ASC' || actSortMode === 'DATE_DESC') {
      const dir = actSortMode === 'DATE_ASC' ? 1 : -1;
      return candidates.sort((a, b) => {
        const dA = isoOf(a.prestationDate);
        const dB = isoOf(b.prestationDate);
        if (!dA && dB) return 1;
        if (dA && !dB) return -1;
        if (dA && dB && dA !== dB) return dir * dA.localeCompare(dB);

        // Ex æquo sur la date : pertinence, écart de montant, puis ordre alphabétique
        const detA = getConfrontationDetails(activeDate, activeBrut, activeNet, a);
        const detB = getConfrontationDetails(activeDate, activeBrut, activeNet, b);
        const typeDiff = (typeRank[detA.type] ?? 4) - (typeRank[detB.type] ?? 4);
        if (typeDiff !== 0) return typeDiff;

        if (detA.montant.ecartAbsolu !== detB.montant.ecartAbsolu) {
          return detA.montant.ecartAbsolu - detB.montant.ecartAbsolu;
        }

        const nameCmp = (a.personneNom || '').localeCompare(b.personneNom || '', 'fr', { sensitivity: 'base' });
        if (nameCmp !== 0) return nameCmp;
        return (a.prestationNum || '').localeCompare(b.prestationNum || '');
      });
    }

    // Liste triée par pertinence — ordre de priorité explicite :
    //   1. même date ET montant sans TM conforme, 2. même date de soins,
    //   3. montant sans TM conforme,              4. écart de montant croissant,
    //   5. similarité de nom,                     6. proximité de la date de soins,
    //   7. ordre alphabétique.
    return candidates.sort((a, b) => {
      const detA = getConfrontationDetails(activeDate, activeBrut, activeNet, a);
      const detB = getConfrontationDetails(activeDate, activeBrut, activeNet, b);

      // 1-3. Même date + même montant, puis même date, puis même montant
      const typeDiff = (typeRank[detA.type] ?? 4) - (typeRank[detB.type] ?? 4);
      if (typeDiff !== 0) return typeDiff;

      // 4. Écart de montant (résultat de la comparaison sans TM) le plus faible d'abord
      if (detA.montant.ecartAbsolu !== detB.montant.ecartAbsolu) {
        return detA.montant.ecartAbsolu - detB.montant.ecartAbsolu;
      }

      // 5. Similarité de nom : identique > partiellement similaire > matricule identique > autre
      const nameSim = (cand: MatchCandidate): number => {
        const cNom = (cand.personneNom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (cleanNom && cNom && cleanNom === cNom) return 3;
        if (cleanNom && cNom && (cNom.includes(cleanNom) || cleanNom.includes(cNom) || cleanNom.split(' ').some(t => t.length > 1 && cNom.split(' ').includes(t)))) return 2;
        const cMat = (cand.matricule || '').replace(/\s+/g, '').toLowerCase();
        if (cleanMat && cMat && cMat !== '-' && cleanMat === cMat) return 1;
        return 0;
      };
      const simDiff = nameSim(b) - nameSim(a);
      if (simDiff !== 0) return simDiff;

      // 6. Proximité de la date de soins (la plus proche d'abord)
      const distA = Math.abs(dayOf(a.prestationDate) - targetDay);
      const distB = Math.abs(dayOf(b.prestationDate) - targetDay);
      if (distA !== distB) return distA - distB;

      // 7. Ordre alphabétique, puis date (ordre déterministe)
      const nameCmp = (a.personneNom || '').localeCompare(b.personneNom || '', 'fr', { sensitivity: 'base' });
      if (nameCmp !== 0) return nameCmp;
      return (a.prestationDate || '').localeCompare(b.prestationDate || '');
    });
  }, [allEligibleActs, actSearchQuery, activeNom, activeMat, activeDate, activeBrut, activeNet, actSortMode]);

  // Sous-fenêtre « Lier » : liste réellement affichée selon le filtre de pertinence choisi
  const resultFilterCandidates = useMemo(() => {
    if (actResultFilter === 'ALL') return filteredSearchCandidates;
    const targetType = actResultFilter;
    return filteredSearchCandidates.filter(cand =>
      getConfrontationDetails(activeDate, activeBrut, activeNet, cand).type === targetType
    );
  }, [filteredSearchCandidates, actResultFilter, activeDate, activeBrut, activeNet]);

  // Nombre de résultats par catégorie de pertinence (pour les pastilles du filtre)
  const resultFilterCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: filteredSearchCandidates.length,
      PERFECT: 0,
      SAME_DATE: 0,
      SAME_AMOUNT: 0,
      VERIFY: 0,
    };
    filteredSearchCandidates.forEach(cand => {
      const type = getConfrontationDetails(activeDate, activeBrut, activeNet, cand).type;
      if (type !== 'UNLINKED' && counts[type] !== undefined) counts[type]++;
    });
    return counts;
  }, [filteredSearchCandidates, activeDate, activeBrut, activeNet]);

  /**
   * Résultat de la comparaison : nombre d'actes candidats dont le « montant sans TM »
   * égale le Montant_Reclame_Brut de cette ligne de règlement.
   */
  const montantConformesCount = useMemo(
    () => filteredSearchCandidates.filter(
      cand => computeMontantConfrontation(activeBrut || activeNet, cand).isConforme
    ).length,
    [filteredSearchCandidates, activeBrut, activeNet]
  );

  if (!isOpen || !paiement || !lignePaiement) return null;

  const handleAssignCandidate = (cand: MatchCandidate | null) => {
    if (!cand) {
      handleUnlink();
      return;
    }

    const targetPrestation = prestations.find(p => p.id === cand.prestationId);
    if (!targetPrestation) return;

    const updatedLignes = (paiement.lignes || []).map(l => {
      if (l.id === lignePaiement.id) {
        return {
          ...l,
          prestationId: targetPrestation.id,
          prestationNumero: targetPrestation.numeroFacture,
          lignePrestationId: cand.lignePrestationId,
          nomAgent: cand.personneNom || l.nomAgent,
          immatriculation: cand.matricule !== '-' ? cand.matricule : l.immatriculation,
          dateSoins: l.dateSoins || targetPrestation.date,
          codeActe: cand.codeActe !== 'ACTE' ? cand.codeActe : l.codeActe,
          libelleActe: cand.libelleActe || l.libelleActe,
        };
      }
      return l;
    });

    const updatedPaiement: Paiement = {
      ...paiement,
      lignes: updatedLignes,
    };

    onSavePaiement(updatedPaiement, [targetPrestation]);
    onClose();
  };

  const handleUnlink = () => {
    const updatedLignes = (paiement.lignes || []).map(l => {
      if (l.id === lignePaiement.id) {
        return {
          ...l,
          prestationId: '',
          prestationNumero: '',
          lignePrestationId: '',
        };
      }
      return l;
    });

    const updatedPaiement: Paiement = {
      ...paiement,
      lignes: updatedLignes,
    };

    onSavePaiement(updatedPaiement, []);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs font-sans antialiased">
      <div className="relative w-full max-w-5xl rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-line animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-surface shrink-0">
          <div className="min-w-0">
            <h4 className="text-base font-bold text-ink-strong flex items-center gap-2">
              <Link2 className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>Rattacher un acte prescrit à cette ligne de règlement</span>
            </h4>
            <p className="text-sm text-ink-muted mt-1">
              Pour : <strong className="text-ink">{activeNom || 'Patient'}</strong> (Mat: {activeMat || '-'}) • Date Soins : <strong>{activeDate ? formatDate(activeDate) : 'Non renseignée'}</strong> • {MONTANT_IMPORT_LABEL} : <strong className="text-ink-strong">{formatMoney(activeBrut)}</strong>
            </p>
            {/* Rappel de la règle de comparaison appliquée au tri et aux badges */}
            <p
              className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2 py-1 text-[11px] font-medium text-indigo-900"
              title={MONTANT_COMPARISON_HINT}
            >
              <Filter className="w-3.5 h-3.5 shrink-0 mt-0.5 text-indigo-600" />
              <span>
                Comparaison &amp; tri : <strong>{MONTANT_IMPORT_LABEL}</strong> contre <strong>{MONTANT_ACTE_LABEL}</strong> — l'écart obtenu est affiché sur chaque acte et commande le tri par pertinence.
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-ink-faint hover:bg-surface-hover hover:text-ink-secondary transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
          
          {/* Search input with Quick Filters */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 h-5 w-5 text-ink-faint" />
              <input
                type="text"
                value={actSearchQuery}
                onChange={(e) => setActSearchQuery(maskNom(e.target.value))}
                placeholder="Rechercher par nom de patient, matricule, n° facture, code acte (ex: CONS, MEDIC)..."
                className="w-full rounded-xl border border-line bg-surface-muted pl-11 pr-10 py-2.5 text-sm text-ink-strong focus:bg-surface focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 uppercase"
                autoFocus
              />
              {actSearchQuery && (
                <button
                  onClick={() => setActSearchQuery('')}
                  className="absolute right-3 top-3 text-ink-faint hover:text-ink-secondary cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5 flex-wrap">
                <span>
                  {resultFilterCandidates.length} acte(s) disponible(s) au rattachement (triés par {actSortLabel(actSortMode)})
                  {actResultFilter !== 'ALL' && resultFilterCandidates.length !== filteredSearchCandidates.length && (
                    <> sur {filteredSearchCandidates.length} résultat(s) de recherche</>
                  )}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-800"
                  title={`Actes dont le montant sans TM (total de l'acte − ticket modérateur) égale le ${MONTANT_IMPORT_LABEL} de cette ligne (${formatMoney(activeBrut || activeNet)})`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {montantConformesCount} montant(s) conforme(s)
                </span>
              </span>
              {actSearchQuery && (
                <button
                  onClick={() => setActSearchQuery('')}
                  className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                >
                  Afficher tous les actes ouverts ({allEligibleActs.length})
                </button>
              )}
            </div>

            {/* Tri des résultats : date croissante par défaut, écart de montant disponible */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-ink-muted font-semibold inline-flex items-center gap-1.5 shrink-0">
                <Calendar className="w-4 h-4" />
                Trier les résultats par :
              </span>
              {ACT_SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setActSortMode(opt.key)}
                  title={opt.title}
                  className={`px-2.5 py-1 rounded-lg border transition font-semibold cursor-pointer ${
                    actSortMode === opt.key
                      ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-2xs'
                      : opt.key.startsWith('MONTANT')
                      ? 'bg-surface text-ink border-line hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200'
                      : 'bg-surface text-ink border-line hover:bg-surface-hover'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Quick filter chips by name token (identique à l'importation) */}
            <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
              <span className="text-ink-muted font-semibold">Filtres rapides :</span>
              {(() => {
                const nameParts = (activeNom || '').trim().split(/\s+/).filter(Boolean);
                return (
                  <>
                    {nameParts.map((part, idx) => (
                      <button
                        key={`${part}-${idx}`}
                        type="button"
                        onClick={() => setActSearchQuery(part)}
                        className={`px-2.5 py-1 rounded-lg border transition font-medium cursor-pointer ${
                          actSearchQuery.trim().toLowerCase() === part.toLowerCase()
                            ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-2xs'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                        }`}
                      >
                        {part}
                      </button>
                    ))}
                  </>
                );
              })()}
            </div>

            {/* Pertinence filter chips on the results of the name search */}
            <div className="flex items-center gap-2 flex-wrap text-xs pt-2 mt-0.5 border-t border-line-soft">
              <span
                className="text-ink-muted font-semibold inline-flex items-center gap-1.5 shrink-0"
                title="Filtre de pertinence basé sur la comparaison « Montant_Reclame_Brut (importation) ↔ montant sans TM de l'acte prescrit » : 1) même date + montant sans TM conforme, 2) même date, 3) montant sans TM conforme, 4) à vérifier"
              >
                <Filter className="w-4 h-4" />
                Filtrer les résultats :
              </span>
              {([
                { key: 'ALL' as const, label: 'Tous', active: 'bg-slate-900 text-white border-slate-900 shadow-2xs', idle: 'bg-surface text-ink border-line hover:bg-surface-hover' },
                { key: 'PERFECT' as const, label: 'Même date & montant sans TM', active: 'bg-emerald-700 text-white border-emerald-700 shadow-2xs', idle: 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' },
                { key: 'SAME_DATE' as const, label: 'Même date', active: 'bg-sky-700 text-white border-sky-700 shadow-2xs', idle: 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100' },
                { key: 'SAME_AMOUNT' as const, label: 'Même montant sans TM', active: 'bg-purple-700 text-white border-purple-700 shadow-2xs', idle: 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100' },
                { key: 'VERIFY' as const, label: 'À vérifier', active: 'bg-amber-600 text-white border-amber-600 shadow-2xs', idle: 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100' },
              ]).map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setActResultFilter(chip.key)}
                  title={`Afficher uniquement les actes « ${chip.label} » parmi les résultats`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition font-semibold cursor-pointer ${
                    actResultFilter === chip.key ? chip.active : chip.idle
                  }`}
                >
                  {chip.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${actResultFilter === chip.key ? 'bg-surface/25' : 'bg-surface-hover text-ink-secondary'}`}>
                    {resultFilterCounts[chip.key]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Act candidate list with live comparison badges */}
          <div className="flex-1 min-h-[320px] max-h-[58vh] overflow-y-auto divide-y divide-slate-100 rounded-xl border border-line bg-surface">
            {resultFilterCandidates.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-sm text-ink-secondary font-medium max-w-xl mx-auto">
                  {actResultFilter !== 'ALL' && filteredSearchCandidates.length > 0
                    ? `Aucun acte ne correspond au filtre « ${{ PERFECT: 'Même date & montant sans TM', SAME_DATE: 'Même date', SAME_AMOUNT: 'Même montant sans TM', VERIFY: 'À vérifier' }[actResultFilter]} » parmi les ${filteredSearchCandidates.length} résultat(s) de la recherche.`
                    : 'Aucun acte en attente ou partiellement payé correspondant trouvé.'}
                </div>
                {actResultFilter !== 'ALL' && filteredSearchCandidates.length > 0 ? (
                  <button
                    onClick={() => setActResultFilter('ALL')}
                    className="text-sm text-indigo-600 hover:underline font-bold cursor-pointer"
                  >
                    Afficher les {filteredSearchCandidates.length} actes trouvés (lever le filtre)
                  </button>
                ) : allEligibleActs.length > 0 ? (
                  <button
                    onClick={() => setActSearchQuery('')}
                    className="text-sm text-indigo-600 hover:underline font-bold cursor-pointer"
                  >
                    Voir tous les {allEligibleActs.length} actes disponibles
                  </button>
                ) : null}
              </div>
            ) : (
              resultFilterCandidates.map((cand) => {
                const compDetails = getConfrontationDetails(activeDate, activeBrut, activeNet, cand);
                const isCurrentlyLinked = lignePaiement.prestationId === cand.prestationId && 
                  (lignePaiement.lignePrestationId === cand.lignePrestationId || (!lignePaiement.lignePrestationId && cand.lignePrestationId.endsWith('-main')));

                return (
                  <div
                    key={cand.lignePrestationId}
                    className={`p-4 sm:p-5 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-sm ${compDetails.rowBorderClass}`}
                  >
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* 1. Nom du Patient en évidence (Priorité N°1) */}
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-extrabold text-ink-strong text-base flex items-center gap-1.5">
                          <User className="w-4 h-4 text-indigo-600 shrink-0" />
                          {cand.personneNom}
                        </span>
                        {cand.matricule && cand.matricule !== '-' && (
                          <span className="text-xs font-mono text-ink-secondary bg-surface-hover px-2 py-0.5 rounded border border-line">
                            Mat: {cand.matricule}
                          </span>
                        )}
                        {cand.sousSociete && (
                          <span className="text-indigo-700 font-semibold text-xs bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            ({cand.sousSociete})
                          </span>
                        )}
                        {cand.prestationNum && (
                          <span className="text-xs text-ink-muted font-mono">
                            (Facture N° {cand.prestationNum} • {formatDate(cand.prestationDate)})
                          </span>
                        )}
                        {isCurrentlyLinked && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-surface px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                            <Link2 className="w-3 h-3" /> Acte déjà relié à cette ligne
                          </span>
                        )}
                      </div>

                      {/* 2. Act header & Libelle + Live confrontation badge */}
                      <div className="flex items-center flex-wrap gap-2 pt-0.5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          {cand.codeActe}
                        </span>
                        <span className="font-semibold text-ink text-sm">
                          {cand.libelleActe}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs border ${compDetails.badgeClass}`}>
                          <span>{compDetails.label}</span>
                        </span>
                      </div>

                      {/* RÉSULTAT DE LA COMPARAISON DES MONTANTS (base du tri par pertinence) */}
                      {(() => {
                        const mnt = compDetails.montant;
                        return (
                          <div className="rounded-lg border border-line/80 bg-surface-muted p-2.5 space-y-1.5">
                            <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 text-xs">
                              <span title="Montant réclamé de cette ligne de règlement (Montant_Reclame_Brut de l'importation)">
                                {MONTANT_IMPORT_LABEL} : <strong className="text-ink-strong font-mono">{formatMoney(mnt.brutImport)}</strong>
                              </span>
                              <span title={`Total de l'acte (${formatMoney(mnt.brutActe)}) − ticket modérateur (${formatMoney(mnt.tmActe)})`}>
                                {MONTANT_ACTE_LABEL} : <strong className="text-indigo-700 font-mono">{formatMoney(mnt.montantSansTM)}</strong>
                                <span className="ml-1 text-[10.5px] text-ink-muted">
                                  (Brut {formatMoney(mnt.brutActe)} − TM {formatMoney(mnt.tmActe)})
                                </span>
                              </span>
                              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${mnt.badgeClass}`}>
                                {mnt.isConforme ? (
                                  <><CheckCircle2 className="w-3 h-3" /> Montants identiques</>
                                ) : !mnt.isComparable ? (
                                  <>Montant non comparable</>
                                ) : (
                                  <><AlertTriangle className="w-3 h-3" /> Écart {formatEcartMontant(mnt.ecart)}</>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
                              <span>Ticket Mod.: <strong className="text-amber-700 font-mono">{formatMoney(cand.ticketModerateur)}</strong></span>
                              <span>À Rembourser: <strong className="text-indigo-700 font-mono">{formatMoney(cand.montantARembourser)}</strong></span>
                              <span>Déjà Réglé: <strong className="text-emerald-700 font-mono">{formatMoney(cand.dejaPaye)}</strong></span>
                              <span title="Score de proximité utilisé par le tri (100 = montant sans TM conforme)">
                                Pertinence montant : <strong className={`font-mono ${mnt.ecartTextClass}`}>{compDetails.montantRank}/100</strong>
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Right column: Reste a payer & Action */}
                    <div className="flex lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-2.5 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-line-soft lg:pl-4 lg:border-l lg:min-w-[190px]">
                      <div className="text-left lg:text-right">
                        <span className="text-xs text-ink-muted uppercase tracking-wider block font-semibold">Reste à régler</span>
                        <strong className="text-base font-extrabold text-emerald-800 font-mono">
                          {formatMoney(cand.resteAPayer)}
                        </strong>
                      </div>
                      <div className="flex flex-col items-stretch gap-1.5">
                        {isCurrentlyLinked ? (
                          <>
                            <button
                              onClick={handleUnlink}
                              className="rounded-xl border border-rose-300 bg-surface px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                              title="Délier cet acte prescrit de la ligne de règlement"
                            >
                              <Unlink className="w-4 w-4" />
                              <span>Délier cet acte</span>
                            </button>
                            <button
                              onClick={onClose}
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Garder ce rattachement</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleAssignCandidate(cand)}
                            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 transition shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <Link2 className="w-4 w-4" />
                            <span>Rattacher cet Acte</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Unlink / Footer Action */}
          <div className="flex items-center justify-between pt-3 border-t border-line-soft">
            {lignePaiement.prestationId ? (
              <button
                onClick={handleUnlink}
                className="inline-flex items-center gap-1.5 text-sm text-rose-700 hover:text-rose-800 font-semibold px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 transition cursor-pointer"
              >
                <Unlink className="h-4 w-4" />
                <span>Ne pas rattacher (Délier la prestation)</span>
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={onClose}
              className="rounded-xl border border-line-strong bg-surface px-5 py-2.5 text-sm font-bold text-ink hover:bg-surface-hover transition cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
