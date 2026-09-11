import React, { useState, useRef, useMemo } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  Building2, 
  Receipt,
  Search,
  Check,
  Download,
  Info,
  Layers,
  ArrowRight,
  Plus,
  Link as LinkIcon,
  Link2,
  Unlink,
  ChevronRight,
  ArrowLeft,
  FileSpreadsheet,
  ScanLine,
  Calendar,
  CalendarCheck,
  Tag,
  Filter,
  ShieldCheck,
  ShieldAlert,
  Ban,
  User,
  Edit3,
  Files,
  Clock,
  FastForward
} from 'lucide-react';
import { 
  Paiement, 
  LignePaiement, 
  Prestation, 
  LignePrestation, 
  Societe, 
  Personne, 
  Famille, 
  ParsedFactureAssurance,
  FactureLigneParsed 
} from '../types';
import { formatMoney, formatDate, generateId, getCurrentTimestamp, normalizeDateISO } from '../utils/formatters';
import { maskNom } from '../utils/inputMasks';
import { downloadDecomptesExcelTemplate } from '../utils/excelTemplates';
import { findBestMatchingSociete } from '../utils/societyMatcher';
import {
  computeMontantConfrontation,
  formatEcartMontant,
  montantProximiteScore,
  MONTANT_IMPORT_LABEL,
  MONTANT_ACTE_LABEL,
  MONTANT_TOLERANCE,
  MONTANT_PROXIMITE_RATIO,
  MONTANT_COMPARISON_HINT,
  ACT_SORT_OPTIONS,
  actSortLabel,
  type ActSortMode,
  type MontantConfrontation,
} from '../utils/montantConfrontation';
import * as XLSX from 'xlsx';
import { Select } from '../../../components/Select';

interface DecompteImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  societes: Societe[];
  personnes: Personne[];
  prestations: Prestation[];
  familles: Famille[];
  paiements?: Paiement[];
  onSavePaiement: (newPaiement: Paiement, updatedPrestations: Prestation[], newSocietes?: Societe[], newPersonnes?: Personne[]) => void;
}

export interface MatchCandidate {
  prestationId: string;
  prestationNum: string;
  prestationDate: string;
  lignePrestationId: string;
  codeActe: string;
  libelleActe: string;
  societeId?: string;
  societeNom?: string;
  sousSociete?: string;
  personneId: string;
  personneNom: string;
  matricule: string;
  montantInitial: number;
  ticketModerateur: number;
  montantARembourser: number;
  dejaPaye: number;
  resteAPayer: number;
}

export interface SettlementRowItem {
  rowId: string;
  originalIndex: number;
  dateSoins: string;
  matricule: string;
  nomPrenom: string;
  sousSociete: string;
  actCode: string;
  actLibelle: string;
  montantBrut: number;
  montantExclu: number;
  participation: number;
  netAPayer: number;
  observations: string;
  articlesCount?: number;
  mergedArticles?: string[];
  // Matching status
  matchedCandidate: MatchCandidate | null;
  createNewPrestation: boolean;
  selected: boolean;
}

export function normalizeActFamilyCode(rawCode: string): string {
  const c = (rawCode || '').toUpperCase().trim();
  if (c.includes('PHAR') || c.includes('MEDIC') || c.includes('MED') || c === 'PH' || c.includes('PHARMACIE') || c.includes('ARTICLE') || c.includes('DROGUERIE')) return 'MEDIC';
  if (c.includes('CONS') || c.includes('CG') || c.includes('VISITE') || c.includes('GENERALISTE') || c.includes('MEDECIN') || c === 'CS') return 'CONS';
  if (c.includes('LABO') || c.includes('EB') || c.includes('ANALYSE') || c.includes('BIOLOGIE') || c.includes('TDR') || c.includes('EXAMEN') || c.includes('BIO')) return 'LABO';
  if (c.includes('DENT') || c === 'DC' || c === 'DK' || c.includes('DENTAIRE') || c.includes('ODONTO') || c.includes('EXTRACTION')) return 'DENT';
  if (c.includes('ECHO') || c.includes('RADI') || c.includes('RADIO') || c.includes('IMAG') || c.includes('ENDOSCOPIE') || c.includes('SCANNER')) return 'ECHO';
  if (c.includes('SOIN') || c === 'SI' || c.includes('PANSEMENT') || c.includes('INJECTION') || c.includes('PERFUSION') || c === 'AMI') return 'SOINS';
  if (c.includes('HOSP') || c.includes('CHIR') || c.includes('SEJOUR') || c.includes('ACCOUCHEMENT') || c.includes('MATERNITE') || c.includes('BLOC')) return 'HOSP';
  if (c.includes('STOCK')) return 'STOCK';
  return c || 'ACTE';
}

export function isRealMatricule(mat?: string | null): boolean {
  if (!mat) return false;
  const clean = mat.trim().toUpperCase();
  if (
    !clean ||
    clean === '-' ||
    clean === '--' ||
    clean === 'N/A' ||
    clean === 'NA' ||
    clean === 'NON RENSEIGNÉ' ||
    clean === 'NON RENSEIGNE' ||
    clean === 'AUCUN' ||
    clean === 'NULL' ||
    clean === 'UNDEFINED' ||
    clean === '.' ||
    clean === '0'
  ) {
    return false;
  }
  return clean.length >= 1;
}

export type ConfrontationType = 'PERFECT' | 'SAME_DATE' | 'SAME_AMOUNT' | 'VERIFY' | 'UNLINKED';

/**
 * Normalise un nom pour la comparaison sans modifier le nom affiché à l'écran.
 * Les espaces, accents et différences de casse ne doivent pas déclencher une
 * fausse alerte sur l'identité de l'assuré.
 */
export function normalizePersonName(name?: string | null): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extrait le nom du titulaire de l'adhésion depuis une cellule de relevé groupé
 * (format « ... N°Règlement ADHESION: TITULAIRE CODE_ACTE Client: ... »).
 */
export function extractAdhesionHolder(raw?: string | null): string {
  const v = (raw || '');
  if (!/ADH[EÈÉE]SION\s*:/i.test(v)) return '';
  const m = v.match(/ADH[EÈÉE]SION\s*:\s*(.+?)(?:\s(?:CONS|CG|CGPR|PH|SI|EB|MEDIC|MED|LABO|ECHO|RADIO|HOSP|CHIR|DENT|SOINS|STOCK|ACTE|AMI|CS|DC|DK)\b|\s+Client\s*:|\s+\d{2}\/\d{2}\/\d{4}|\n|$)/i);
  return m && m[1] ? m[1].replace(/\s+/g, ' ').trim() : '';
}

/**
 * Nettoie le nom d'une personne importée depuis les relevés « groupés » où la
 * cellule du nom contient aussi le détail de tous les règlements, ex. :
 * « FRASIE DELFIA MARCELLINE 1089322-22 ADHESION: RAVELOMANJAKA AIME JACQUIS PH
 *   Client: SIPEM (...) 22/04/2026 ... 80 000,00 ... AIME JACQUIS ».
 * Sans ce nettoyage, toute la ligne s'affiche à la place du nom (colonne
 * « Adhérent & Matricule ») et fausse le rapprochement des actes.
 */
export function sanitizeImportedPersonName(raw?: string | null, fallback?: string): string {
  let v = (raw || '').replace(/\r/g, '').trim();
  if (!v) return (fallback || '').trim();

  // Cellule multi-lignes (relevé groupé) : le nom du patient est sur la première ligne significative
  if (v.includes('\n')) {
    const firstLine = v.split('\n').map(s => s.trim()).find(s => /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(s));
    if (firstLine) v = firstLine;
  }

  // Retire un éventuel n° de règlement en tête de cellule (« 1089322-22 FRASIE ... »)
  v = v.replace(/^\s*\d{3,}\s*[-/]\s*\d+\s+/, '').trim();

  // Coupe tout ce qui suit le nom : section ADHESION, n° de règlement « 1089322-22 »,
  // « Client: ... », date de soin ou montant « 80 000,00 ».
  const cutAt = (re: RegExp) => {
    const m = v.match(re);
    if (m && m.index !== undefined && m.index > 0) v = v.slice(0, m.index);
  };
  cutAt(/\s+ADH[EÈÉE]SION\s*:/i);
  cutAt(/\s+\d{3,}\s*[-/]\s*\d+(?=\s|$)/);
  cutAt(/\s+Client\s*:/i);
  cutAt(/\s+\d{2}\/\d{2}\/\d{4}/);
  cutAt(/\s+\d{1,3}(?:[\s .]\d{3})+,\d{2}(?=\s|$)/);
  v = v.replace(/\s+/g, ' ').trim();

  // Cellule qui commence directement par « ADHESION: ... » (pas de nom de patient avant) :
  // on garde uniquement le titulaire de l'adhésion, sans le préfixe.
  if (/^ADH[EÈÉE]SION\s*:/i.test(v)) {
    v = extractAdhesionHolder(v) || extractAdhesionHolder(raw) || (fallback || '').trim();
  }

  // Si la cellule commençait directement par le n° de règlement (pas de nom de patient),
  // on retombe sur le titulaire de l'adhésion.
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(v)) {
    v = extractAdhesionHolder(raw) || (fallback || '').trim();
  }
  return v || (fallback || '').trim();
}

export interface PersonNameComparison {
  source: string;
  candidate: string;
  isSame: boolean;
  isPartial: boolean;
  isDifferent: boolean;
}

/**
 * Une correspondance partielle est utile pour les fichiers qui ne contiennent
 * qu'un seul élément du nom complet (ex. « HASINTSOA » contre
 * « HASINTSOA TSARAVINTANA »), ou qui inversent l'ordre des éléments.
 */
export function comparePersonNames(sourceName?: string | null, candidateName?: string | null): PersonNameComparison {
  const source = normalizePersonName(sourceName);
  const candidate = normalizePersonName(candidateName);

  if (!source || !candidate) {
    return { source, candidate, isSame: false, isPartial: false, isDifferent: false };
  }

  if (source === candidate) {
    return { source, candidate, isSame: true, isPartial: false, isDifferent: false };
  }

  const sourceTokens = source.split(' ').filter(token => token.length > 1);
  const candidateTokens = candidate.split(' ').filter(token => token.length > 1);
  const sharesToken = sourceTokens.some(token => candidateTokens.includes(token));
  const isPartial = source.includes(candidate) || candidate.includes(source) || sharesToken;

  return {
    source,
    candidate,
    isSame: false,
    isPartial,
    isDifferent: !isPartial,
  };
}

export interface ConfrontationDetails {
  type: ConfrontationType;
  isSameDate: boolean;
  isSameMontantBrut: boolean;
  isSameMontantNet: boolean;
  isSameMontant: boolean;
  isSameName: boolean;
  isPartialName: boolean;
  isDifferentName: boolean;
  diffMontantBrut: number;
  /** Comparaison « Montant_Reclame_Brut de l'importation ↔ montant sans TM de l'acte prescrit ». */
  montant: MontantConfrontation;
  /** Le montant sans TM de l'acte égale le Montant_Reclame_Brut de l'importation. */
  isSameMontantSansTM: boolean;
  /** Score de proximité de montant (100 = conforme) utilisé pour classer les candidats. */
  montantRank: number;
  label: string;
  badgeClass: string;
  cardBorderClass: string;
  rowBorderClass: string;
  tagColor: string;
}

export function getConfrontationDetails(
  dateSoins: string,
  montantBrut: number,
  netAPayer: number,
  candidate: MatchCandidate | null,
  participation: number = 0,
  sourceName: string = ''
): ConfrontationDetails {
  // RÈGLE DE COMPARISON : le montant à confronter est le « montant sans TM » de
  // l'acte prescrit (total de l'acte − ticket modérateur) contre le
  // « Montant_Reclame_Brut » lu sur l'importation du règlement.
  const brut = Number(montantBrut || netAPayer || 0);
  const montant = computeMontantConfrontation(brut, candidate);
  const montantRank = montantProximiteScore(montant);

  const cleanDateSoins = (dateSoins || '').trim().substring(0, 10);
  const cleanCandDate = (candidate?.prestationDate || '').trim().substring(0, 10);
  const isSameDate = Boolean(candidate && cleanDateSoins && cleanCandDate && cleanDateSoins === cleanCandDate);

  const tm = Number(participation || 0);
  const netDecompte = netAPayer || Math.max(0, brut - tm);
  const candRemb = Number(candidate?.montantARembourser || 0);
  const candReste = Number(candidate?.resteAPayer || 0);

  // 1) CRITÈRE PRINCIPAL : montant sans TM de l'acte == Montant_Reclame_Brut importé.
  const isSameMontantSansTM = Boolean(candidate) && montant.isConforme;
  // isSameMontantBrut garde le même nom pour les affichages existants : il désigne
  // désormais la conformité sur la base « sans TM », celle attendue par le métier.
  const isSameMontantBrut = isSameMontantSansTM;
  // 2) FILET DE SECOURS : décomptes qui n'indiquent que le net effectivement réglé.
  const isSameMontantNet = Boolean(candidate) && !isSameMontantSansTM
    && (Math.abs(netDecompte - candRemb) < MONTANT_TOLERANCE || Math.abs(netDecompte - candReste) < MONTANT_TOLERANCE);

  const isSameMontant = isSameMontantBrut || isSameMontantNet;
  const diffMontantBrut = montant.ecart;

  const comparedNames = comparePersonNames(sourceName, candidate?.personneNom);
  const isSameName = comparedNames.isSame;
  const isPartialName = comparedNames.isPartial;
  const isDifferentName = comparedNames.isDifferent;

  const build = (
    status: Pick<ConfrontationDetails, 'type' | 'label' | 'badgeClass' | 'cardBorderClass' | 'rowBorderClass' | 'tagColor'>
  ): ConfrontationDetails => ({
    isSameDate,
    isSameMontantBrut,
    isSameMontantNet,
    isSameMontant,
    isSameName,
    isPartialName,
    isDifferentName,
    diffMontantBrut,
    montant,
    isSameMontantSansTM,
    montantRank,
    ...status,
  });

  if (!candidate) {
    return build({
      type: 'UNLINKED',
      label: 'Non rattaché (Créer)',
      badgeClass: 'bg-surface-hover text-ink border-line-strong',
      cardBorderClass: 'border-line bg-surface-muted/60',
      rowBorderClass: 'border-l-4 border-l-slate-300',
      tagColor: 'slate'
    });
  }

  // Date identique + nom partiellement similaire : ne PAS classer en « À vérifier »
  // (rapprochement décompte / import règlement). Un nom vraiment différent reste à vérifier.
  const mustVerifyName = isDifferentName || (isPartialName && !isSameDate);
  if (mustVerifyName) {
    return build({
      type: 'VERIFY',
      label: isPartialName ? 'À vérifier (Nom partiellement similaire)' : 'À vérifier (Nom différent)',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
      cardBorderClass: 'border-amber-300 bg-amber-50/60',
      rowBorderClass: 'border-l-4 border-l-amber-500 bg-amber-50/20',
      tagColor: 'amber'
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
        : 'Même Net Réglé (Date différente)',
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
      : 'À vérifier (Dates & Montants diffèrent)',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-medium',
    cardBorderClass: 'border-amber-300 bg-amber-50/60',
    rowBorderClass: 'border-l-4 border-l-amber-500 bg-amber-50/20',
    tagColor: 'amber'
  });
}

export const DecompteImportModal: React.FC<DecompteImportModalProps> = ({
  isOpen,
  onClose,
  societes,
  personnes,
  prestations,
  familles,
  paiements = [],
  onSavePaiement,
}) => {
  const [selectedInsurance, setSelectedInsurance] = useState<string>('');
  const [parsedDoc, setParsedDoc] = useState<ParsedFactureAssurance | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  const [rows, setRows] = useState<SettlementRowItem[]>([]);
  const [confrontFilter, setConfrontFilter] = useState<'ALL' | 'PERFECT' | 'SAME_DATE' | 'SAME_AMOUNT' | 'VERIFY' | 'UNLINKED'>('ALL');
  const [groupOnImport, setGroupOnImport] = useState<boolean>(true);
  const [missingSocPrompt, setMissingSocPrompt] = useState<{ socName: string } | null>(null);
  const [selectedOverrideSocId, setSelectedOverrideSocId] = useState<string>('');
  const [showUnlinkedConfirmModal, setShowUnlinkedConfirmModal] = useState<boolean>(false);
  
  // Multi-File Queue Processing state
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [batchHistory, setBatchHistory] = useState<Array<{ fileName: string; count: number; status: 'SUCCESS' | 'SKIPPED' }>>([]);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  // Search / Change Link modal state
  const [searchingRowId, setSearchingRowId] = useState<string | null>(null);
  const [actSearchQuery, setActSearchQuery] = useState<string>('');
  // Filtre par pertinence appliqué aux résultats de la sous-fenêtre « Lier »
  // (même date + même montant, même date, même montant, à vérifier)
  const [actResultFilter, setActResultFilter] = useState<'ALL' | 'PERFECT' | 'SAME_DATE' | 'SAME_AMOUNT' | 'VERIFY'>('ALL');
  // Tri des résultats de la sous-fenêtre « Lier » — date croissante par défaut
  const [actSortMode, setActSortMode] = useState<ActSortMode>('DATE_ASC');

  // Main Table search & sorting state
  const [tableSearchQuery, setTableSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'DEFAULT' | 'STATUS' | 'DATE' | 'PATIENT' | 'AMOUNT'>('DEFAULT');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

  const excelInputRef = useRef<HTMLInputElement>(null);

  const activeSocietesList = useMemo(() => {
    return societes.filter(s => s.id !== 'soc-salfa' && !s.code?.toLowerCase().includes('salfa') && !s.nom?.toLowerCase().includes('hopitaly loterana'));
  }, [societes]);

  const getEffectiveInsurance = () => {
    if (!selectedInsurance) return '';
    const matched = activeSocietesList.find(s => s.id === selectedInsurance || s.nom === selectedInsurance);
    return matched ? matched.nom : selectedInsurance;
  };

  const handleResetAndBack = () => {
    setParsedDoc(null);
    setRows([]);
    setErrorMessage(null);
    setLastUploadedFile(null);
    setSearchingRowId(null);
    setActResultFilter('ALL');
    setIsProcessing(false);
    setConfrontFilter('ALL');
    setTableSearchQuery('');
    setSortBy('DEFAULT');
    setSortOrder('ASC');
    setFileQueue([]);
    setCurrentFileIndex(0);
    setBatchNotice(null);
    if (excelInputRef.current) {
      excelInputRef.current.value = '';
    }
  };

  const handleSkipCurrentFile = () => {
    if (fileQueue.length > 1 && currentFileIndex + 1 < fileQueue.length) {
      const skippedFileName = fileQueue[currentFileIndex]?.name || 'Fichier';
      setBatchHistory(prev => [...prev, { fileName: skippedFileName, count: 0, status: 'SKIPPED' }]);
      const nextIdx = currentFileIndex + 1;
      setCurrentFileIndex(nextIdx);
      const nextFile = fileQueue[nextIdx];
      setBatchNotice(`Fichier « ${skippedFileName} » ignoré. Chargement du fichier ${nextIdx + 1} / ${fileQueue.length}...`);
      processFile(nextFile);
    } else {
      handleClose();
    }
  };

  const handleFilesSelected = (selectedFiles: FileList | File[]) => {
    const list = Array.from(selectedFiles).filter(f => {
      const ext = f.name.toLowerCase();
      return ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv');
    });

    if (list.length === 0) {
      setErrorMessage("Veuillez sélectionner au moins un fichier Excel (.xlsx, .xls, .csv).");
      return;
    }

    setFileQueue(list);
    setCurrentFileIndex(0);
    setBatchHistory([]);
    setBatchNotice(list.length > 1 ? `${list.length} fichiers ajoutés à la file d'attente. Traitement du fichier 1 / ${list.length}...` : null);
    processFile(list[0]);
  };

  const handleClose = () => {
    handleResetAndBack();
    onClose();
  };

  // Compute ALL eligible unpaid / partially paid acts across database
  // Compute ALL eligible unpaid / partially paid acts across database
  // EXCLUDING all acts where resteAPayer <= 0 or prestation is already fully paid!
  const allEligibleActs: MatchCandidate[] = useMemo(() => {
    const list: MatchCandidate[] = [];

    prestations.forEach(prest => {
      // Exclude fully paid or rejected prestations
      if (prest.statut === 'Payé' || prest.statut === 'Rejeté') return;

      const pers = personnes.find(p => p.id === prest.personneId);
      const persNom = prest.nomAgent || pers?.nomPrenom || 'Patient';
      const persMat = prest.matricule || pers?.matricule || '-';
      const socNom = prest.societeNom || societes.find(s => s.id === prest.societeId)?.nom || '';
      const sousSoc = prest.sousSociete || '';

      if (prest.lignes && prest.lignes.length > 0) {
        prest.lignes.forEach((ligne, lIdx) => {
          const brut = ligne.totalPrestation || 0;
          const part = ligne.ticketModerateur ?? Math.round((prest.ticketModerateur || 0) / (prest.lignes.length || 1));
          const remb = ligne.montantARembourser ?? Math.max(0, brut - part);
          const dejaPaye = ligne.totalPaye || 0;
          const reste = Math.max(0, remb - dejaPaye);

          // Exclude acts that are already fully settled!
          if (reste > 0) {
            const fam = familles.find(f => f.code.toUpperCase() === (ligne.code || '').toUpperCase());
            list.push({
              prestationId: prest.id,
              prestationNum: prest.numeroFacture,
              prestationDate: prest.date,
              lignePrestationId: ligne.id || `${prest.id}-lig-${lIdx}`,
              codeActe: ligne.code || 'CONS',
              libelleActe: ligne.libelle || fam?.libelle || ligne.code || 'Acte de soins',
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
        // Fallback for prestation without split sub-lines
        const tot = prest.montantTotal ?? prest.totalPrestation ?? 0;
        const mod = prest.ticketModerateur ?? prest.participation ?? 0;
        const remb = prest.montantARembourser ?? Math.max(0, tot - mod);
        const dejaPaye = prest.totalPaye || 0;
        const reste = Math.max(0, remb - dejaPaye);

        if (reste > 0) {
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
  }, [prestations, personnes, societes, familles]);

  // Intelligent Automatic Matcher for a settlement line
  // Confronts date of care against prescription act date, gross amount without ticket moderator against prescription act gross amount, and society
  // STRICT RULE: Automatic linking is strictly restricted to the same month & year (YYYY-MM).
  const autoMatchSettlementLine = (
    matricule: string, 
    nomPrenom: string, 
    actCode: string,
    dateSoins: string,
    montantBrut: number,
    netMontant: number,
    targetSocId?: string
  ): MatchCandidate | null => {
    if (allEligibleActs.length === 0) return null;

    const cleanMatricule = (matricule || '').replace(/\s+/g, '').toLowerCase();
    const cleanCode = normalizeActFamilyCode(actCode);
    const cleanDateSoins = (dateSoins || '').trim().substring(0, 10);
    const isoDateSoins = normalizeDateISO(dateSoins);
    const monthSoins = isoDateSoins ? isoDateSoins.substring(0, 7) : '';
    const brutMontant = Number(montantBrut || netMontant || 0);

    let bestCandidate: MatchCandidate | null = null;
    let highestScore = -1;

    allEligibleActs.forEach(cand => {
      let score = 0;
      const candMatricule = (cand.matricule || '').replace(/\s+/g, '').toLowerCase();
      const candDate = (cand.prestationDate || '').trim().substring(0, 10);
      const isoCandDate = normalizeDateISO(cand.prestationDate);
      const monthCand = isoCandDate ? isoCandDate.substring(0, 7) : '';

      // 1. REGLE STRICTE DE LIAISON AUTOMATIQUE : Même mois & année uniquement (YYYY-MM)
      if (!monthSoins || !monthCand || monthSoins !== monthCand) {
        return; // Ne pas lier automatiquement si pas dans le même mois
      }

      const candCode = normalizeActFamilyCode(cand.codeActe);
      const candBrut = Number(cand.montantInitial || 0);
      const candRemb = Number(cand.montantARembourser || 0);
      const candReste = Number(cand.resteAPayer || 0);

      // 2. Patient matching
      const exactMat = cleanMatricule && candMatricule && cleanMatricule !== '-' && cleanMatricule === candMatricule;
      const partialMat = cleanMatricule && candMatricule && cleanMatricule !== '-' && (cleanMatricule.includes(candMatricule) || candMatricule.includes(cleanMatricule));
      const nameMatch = comparePersonNames(nomPrenom, cand.personneNom);
      const hasNameMatch = nameMatch.isSame || nameMatch.isPartial;

      if (exactMat) score += 100;
      else if (partialMat) score += 80;
      else if (hasNameMatch) score += nameMatch.isSame ? 75 : 70;
      else {
        // Skip candidate if no patient relation
        return;
      }

      // 3. STRICT INTER-SOCIETY RULE: Disallow inter-company/inter-society matching
      if (targetSocId) {
        const targetSoc = societes.find(s => s.id === targetSocId || s.nom.toLowerCase() === targetSocId.toLowerCase());
        const expectedSocId = targetSoc?.id || targetSocId;
        const candSocId = cand.societeId;
        
        if (candSocId && candSocId !== expectedSocId) {
          // Reject candidate if it belongs to a different society/garant
          return;
        }
        score += 80;
      }

      // 4. Date de soins vs Date de l'acte dans la prescription
      const isSameDate = Boolean(cleanDateSoins && candDate && cleanDateSoins === candDate);
      if (isSameDate) {
        score += 70;
      }

      // 5. Montants : « Montant_Reclame_Brut » de l'importation contre le montant
      //    SANS ticket modérateur de l'acte prescrit — même règle que la fenêtre
      //    « Rattacher un acte prescrit à cette ligne de règlement ». Les
      //    comparaisons brut/brut et net/net ne restent que des signaux secondaires.
      const montantCand = computeMontantConfrontation(brutMontant, cand);
      const isSameGrossAmount = montantCand.isConforme;
      const isSameNetAmount = !isSameGrossAmount
        && (Math.abs(netMontant - candRemb) < MONTANT_TOLERANCE || Math.abs(netMontant - candReste) < MONTANT_TOLERANCE);
      const isSameRawBrut = !isSameGrossAmount && candBrut > 0 && Math.abs(brutMontant - candBrut) < MONTANT_TOLERANCE;

      if (isSameGrossAmount) {
        score += 70;
      } else if (isSameNetAmount) {
        score += 45;
      } else if (isSameRawBrut) {
        score += 40;
      } else if (montantCand.montantSansTM > 0 && montantCand.ecartAbsolu / montantCand.montantSansTM <= MONTANT_PROXIMITE_RATIO) {
        score += 20;
      }

      // 6. Code / Famille Acte matching
      const exactCode = cleanCode && candCode && (cleanCode === candCode);
      if (exactCode) {
        score += 45;
      }

      // Bonus for total perfect match (Same Patient + Same Date + Same Gross Amount)
      if (isSameDate && isSameGrossAmount) {
        score += 60;
      }

      if (score > highestScore && score >= 100) {
        highestScore = score;
        bestCandidate = cand;
      }
    });

    return bestCandidate;
  };

  const processLoadedDocument = (
    doc: ParsedFactureAssurance, 
    groupEnabled: boolean = groupOnImport,
    overrideSocId?: string
  ) => {
    setParsedDoc(doc);
    const targetSocId = overrideSocId || selectedInsurance || (activeSocietesList.find(s => s.nom.toLowerCase() === (doc.clientDoit || '').toLowerCase())?.id);

    // 1. Expand raw settlement lines
    const rawItems: Array<{
      originalIndex: number;
      matricule: string;
      nomPrenom: string;
      sousSociete: string;
      dateSoins: string;
      actCode: string;
      actLibelle: string;
      montantBrut: number;
      montantExclu: number;
      participation: number;
      netAPayer: number;
      observations: string;
      articlesCount: number;
    }> = [];

    doc.lignes.forEach((l, idx) => {
      // For BSA and healthcare statements: the true patient is the person aligned with the date of care
      // (filet de sécurité : nettoie aussi les noms issus de cellules « groupées » des relevés)
      const effectiveNom = (l.ayantDroit && l.ayantDroit.trim())
        ? sanitizeImportedPersonName(l.ayantDroit.trim(), l.nomPrenom)
        : sanitizeImportedPersonName(l.nomPrenom);

      // If line has multiple acts
      if (l.actes && l.actes.length > 0) {
        l.actes.forEach((act) => {
          const actMontant = act.montant || Math.round(l.montantBrut / (l.actes?.length || 1));
          const partRatio = l.montantBrut > 0 ? actMontant / l.montantBrut : 1 / (l.actes?.length || 1);
          const actPart = Math.round((l.participation || 0) * partRatio);
          const actExclu = Math.round((l.montantExclu || 0) * partRatio);
          const actNet = (l.actes?.length === 1 && l.netAPayer !== undefined)
            ? l.netAPayer
            : Math.max(0, actMontant - actPart - actExclu);

          rawItems.push({
            originalIndex: idx,
            matricule: l.matricule,
            nomPrenom: effectiveNom,
            sousSociete: l.sousSociete || '',
            dateSoins: l.dateSoins,
            actCode: act.code || 'CONS',
            actLibelle: act.libelle || act.code || 'Acte de soins',
            montantBrut: actMontant,
            montantExclu: actExclu,
            participation: actPart,
            netAPayer: actNet,
            observations: l.observations || '',
            articlesCount: 1,
          });
        });
      } else {
        const actCode = (l.actesTexte || 'CONS').substring(0, 6).toUpperCase();
        rawItems.push({
          originalIndex: idx,
          matricule: l.matricule,
          nomPrenom: effectiveNom,
          sousSociete: l.sousSociete || '',
          dateSoins: l.dateSoins,
          actCode: actCode,
          actLibelle: l.actesTexte || 'Prestation médicale',
          montantBrut: l.montantBrut,
          montantExclu: l.montantExclu || 0,
          participation: l.participation || 0,
          netAPayer: l.netAPayer,
          observations: l.observations || '',
          articlesCount: 1,
        });
      }
    });

    // 2. Optional: Group by Person + Date + Normalized Act family (to aggregate individual articles into single acts)
    let finalItems: Array<{
      originalIndex: number;
      matricule: string;
      nomPrenom: string;
      sousSociete: string;
      dateSoins: string;
      actCode: string;
      actLibelle: string;
      montantBrut: number;
      montantExclu: number;
      participation: number;
      netAPayer: number;
      observations: string;
      articlesCount: number;
      mergedArticles?: string[];
    }> = rawItems;

    if (groupEnabled) {
      const groupedMap = new Map<string, typeof rawItems[0] & { mergedArticles: string[] }>();

      rawItems.forEach(item => {
        const normNom = (item.nomPrenom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
        const normDate = (item.dateSoins || '').trim().substring(0, 10);
        const normFamily = normalizeActFamilyCode(item.actCode);
        const key = `${normNom}|${normDate}|${normFamily}`;

        if (groupedMap.has(key)) {
          const existing = groupedMap.get(key)!;
          existing.montantBrut += item.montantBrut;
          existing.montantExclu += item.montantExclu;
          existing.participation += item.participation;
          existing.netAPayer += item.netAPayer;
          existing.articlesCount += 1;
          if (item.actLibelle && !existing.mergedArticles.includes(item.actLibelle)) {
            existing.mergedArticles.push(item.actLibelle);
          }
          if (item.observations && !existing.observations.includes(item.observations)) {
            existing.observations = existing.observations ? `${existing.observations} • ${item.observations}` : item.observations;
          }
        } else {
          groupedMap.set(key, {
            ...item,
            actCode: normFamily,
            mergedArticles: item.actLibelle ? [item.actLibelle] : []
          });
        }
      });

      finalItems = Array.from(groupedMap.values()).map(g => {
        let displayLibelle = g.actLibelle;
        if (g.articlesCount > 1) {
          const preview = g.mergedArticles.slice(0, 3).join(', ') + (g.mergedArticles.length > 3 ? ` (+${g.mergedArticles.length - 3})` : '');
          displayLibelle = `${g.actCode} (${g.articlesCount} articles regroupés : ${preview})`;
        }
        return {
          ...g,
          actLibelle: displayLibelle
        };
      });
    }

    // 3. Auto-match confrontation with eligible DB prescription acts
    const builtRows: SettlementRowItem[] = finalItems.map((item, rowIdx) => {
      const matched = autoMatchSettlementLine(
        item.matricule,
        item.nomPrenom,
        item.actCode,
        item.dateSoins,
        item.montantBrut,
        item.netAPayer,
        targetSocId
      );

      return {
        rowId: `row-${rowIdx}`,
        originalIndex: item.originalIndex,
        dateSoins: item.dateSoins,
        matricule: item.matricule,
        nomPrenom: item.nomPrenom,
        sousSociete: item.sousSociete || '',
        actCode: item.actCode,
        actLibelle: item.actLibelle,
        montantBrut: item.montantBrut,
        montantExclu: item.montantExclu,
        participation: item.participation,
        netAPayer: item.netAPayer,
        observations: item.observations,
        articlesCount: item.articlesCount,
        mergedArticles: item.mergedArticles,
        matchedCandidate: matched,
        createNewPrestation: !matched,
        selected: true
      };
    });

    setRows(builtRows);
    setIsProcessing(false);
  };

  const handleToggleGrouping = (newVal: boolean) => {
    setGroupOnImport(newVal);
    if (parsedDoc) {
      setIsProcessing(true);
      setTimeout(() => {
        processLoadedDocument(parsedDoc, newVal);
      }, 100);
    }
  };

  const handleSocietyChange = (newSocId: string) => {
    setSelectedInsurance(newSocId);
    const matched = activeSocietesList.find(s => s.id === newSocId);
    const socName = matched ? matched.nom : newSocId;
    if (parsedDoc) {
      const updatedDoc: ParsedFactureAssurance = {
        ...parsedDoc,
        clientDoit: socName,
        garant: socName,
        lignes: parsedDoc.lignes.map(l => ({
          ...l,
          societeAffiliee: socName
        }))
      };
      setParsedDoc(updatedDoc);
      setIsProcessing(true);
      setTimeout(() => {
        processLoadedDocument(updatedDoc, groupOnImport, newSocId);
      }, 50);
    }
  };

  const processFile = async (file: File) => {
    const chosenOrg = getEffectiveInsurance();

    setIsProcessing(true);
    setErrorMessage(null);
    setLastUploadedFile(file);

    try {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const firstSheet = workbook.Sheets[sheetName];
            const jsonRows: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

            if (jsonRows.length === 0) throw new Error('Le fichier Excel est vide ou ne contient aucune ligne de données.');

            // Detect company from file name, sheet names, and raw contents
            const fileNameLower = file.name.toLowerCase();
            const sheetNamesLower = workbook.SheetNames.join(' ').toLowerCase();
            const sampleText = JSON.stringify(jsonRows.slice(0, 10)).toLowerCase();
            const fullContextText = `${fileNameLower} ${sheetNamesLower} ${sampleText}`;

            let detectedCompanyKey = '';
            if (fullContextText.includes('bsa') || fullContextText.includes('gras savoye') || fullContextText.includes('ask gs') || fullContextText.includes('grassavoye') || fullContextText.includes('releve de remboursements des frais de sante')) {
              detectedCompanyKey = 'BSA';
            } else if (fullContextText.includes('ascoma') || fullContextText.includes('joubert') || fullContextText.includes('dispensaire lutherien')) {
              detectedCompanyKey = 'ASCOMA';
            } else if (fullContextText.includes('mci') || fullContextText.includes('mcicare') || fullContextText.includes('conservation international')) {
              detectedCompanyKey = 'MCI CARE';
            } else if (fullContextText.includes('havana') || fullContextText.includes('ny havana')) {
              detectedCompanyKey = 'NY HAVANA';
            } else if (fullContextText.includes('sanlam') || fullContextText.includes('allianz')) {
              detectedCompanyKey = 'SANLAM';
            }

            const matchedDetectedSoc = detectedCompanyKey ? findBestMatchingSociete(detectedCompanyKey, societes, selectedInsurance) : null;
            if (matchedDetectedSoc && !selectedInsurance) {
              setSelectedInsurance(matchedDetectedSoc.id);
            }

            let inferredBordereau = '';
            let inferredOrganisme = chosenOrg || matchedDetectedSoc?.nom || detectedCompanyKey || '';
            let inferredDateReglement = new Date().toISOString().split('T')[0];

            const lignes: FactureLigneParsed[] = jsonRows.map((row, idx) => {
              const getVal = (keys: string[]) => {
                for (const k of keys) {
                  const cleanK = k.toLowerCase().replace(/[\s_\-\.\/]/g, '');
                  const foundKey = Object.keys(row).find(rk => {
                    const cleanRk = rk.toLowerCase().replace(/[\s_\-\.\/]/g, '');
                    return cleanRk === cleanK;
                  });
                  if (foundKey && row[foundKey] !== undefined && row[foundKey] !== '') return row[foundKey];
                }
                return '';
              };

              const rawBord = String(getVal(['Ref_Bordereau', 'RefBordereau', 'Bordereau', 'N° Bordereau', 'Numero_Reglement', 'Ref_Paiement', 'Ref_Decompte']) || '').trim();
              if (rawBord && !inferredBordereau) inferredBordereau = rawBord;

              const rawOrg = String(getVal(['Organisme', 'Assurance', 'Societe', 'Société', 'Client', 'Garant', 'Assureur', 'Payeur', 'Organisme_Payeur']) || '').trim() || chosenOrg;
              let lineSoc = chosenOrg || inferredOrganisme || '';
              if (rawOrg && rawOrg !== 'Organisme') {
                const matched = findBestMatchingSociete(rawOrg, societes, chosenOrg || inferredOrganisme);
                lineSoc = matched ? matched.nom : rawOrg;
                if (!inferredOrganisme) inferredOrganisme = lineSoc;
              }

              const rawDateReg = String(getVal(['Date_Reglement', 'Date_Paiement', 'Date_Reglement_Paiement', 'Date Reglement', 'Date Paiement']) || '').trim();
              if (rawDateReg) inferredDateReglement = normalizeDateISO(rawDateReg);

              // 1. Chercher d'abord le nom de la personne soignée / patient aligné à la date du soin
              const nomPatientSoin = String(getVal([
                'Patient', 'Nom_Patient', 'Nom Patient', 'Nom du Patient', 'Nom_du_Patient',
                'Beneficiaire', 'Bénéficiaire', 'Nom_Beneficiaire', 'Nom_Bénéficiaire', 'Nom Bénéficiaire', 'Nom Beneficiaire',
                'Ayant_Droit', 'Ayant Droit', 'AyantDroit', 'Nom_Ayant_Droit', 'Nom Ayant Droit', 'Nom_AyantDroit',
                'Personne_Soignee', 'Personne Soignée', 'Nom_Soigne', 'Nom Soigné', 'Soigné', 'Soigne',
                'Nom_Soin', 'Nom Soin', 'Nom_Soins', 'Nom Soins', 'Nom_Date_Soin', 'Nom Date Soin', 'Nom_Date_Soins', 'Nom Date des Soins',
                'Malade', 'Nom_Malade', 'Nom Malade'
              ]) || '').trim();

              // 2. Chercher le nom de l'adhérent / titulaire de l'adhésion
              const nomAdherent = String(getVal([
                'Adherent', 'Adhérent', 'Nom_Adherent', 'Nom_Adhérent', 'Nom Adhérent', 'Nom Adherent', 'Adherent_Nom',
                'Adhesion', 'Adhésion', 'Titulaire', 'Nom_Titulaire', 'Nom Titulaire'
              ]) || '').trim();

              // 3. Chercher les autres colonnes de nom général
              const nomGeneral = String(getVal([
                'Nom_Agent', 'Nom Agent', 'Nom et Prénom', 'Nom et Prenom', 'Nom_Prenom', 'Nom', 'Assuré', 'Assure', 'Nom Assuré', 'Nom Assure', 'Nom_Assure'
              ]) || '').trim();

              // Règle BSA : Pour BSA et relevés de soins, le vrai nom de la personne à importer est TOUJOURS celui aligné à la date du soin (Patient / Ayant-droit / Soigné) et non celui de l'adhésion
              let rawNom = nomPatientSoin || (nomAdherent && !nomGeneral ? nomAdherent : nomGeneral) || nomAdherent || `Patient ${idx + 1}`;
              // Les relevés « groupés » mettent parfois tout le détail des règlements dans la cellule du nom
              // (ex. « FRASIE DELFIA MARCELLINE 1089322-22 ADHESION: RAVELOMANJAKA AIME JACQUIS PH Client: SIPEM ... ») :
              // on ne garde que le nom de la personne pour l'affichage, le regroupement et le rapprochement.
              const adhesionDansNom = extractAdhesionHolder(rawNom);
              const nomAdherentEffectif = nomAdherent || adhesionDansNom;
              rawNom = sanitizeImportedPersonName(rawNom, adhesionDansNom || nomAdherent);
              let sousSoc = String(getVal(['Sous_Societe', 'Sous-Société', 'Sous Societe', 'Département', 'Section', 'Service']) || '').trim();

              const parenMatch = rawNom.match(/^([^(]+)\s*\(([^)]+)\)$/);
              if (parenMatch) {
                rawNom = parenMatch[1].trim();
                if (!sousSoc) {
                  sousSoc = parenMatch[2].trim();
                }
              }

              const matricule = String(getVal([
                'Matricule', 'N° Matricule', 'N°_Matricule', 'Num_Matricule', 'Num Matricule',
                'Immatriculation', 'Immat', 'N° Immatriculation', 'Num Immatriculation', 'N°_Immatriculation',
                'Code', 'Code_Assure', 'Code Assuré', 'Code_Adherent', 'Code Adhérent',
                'N° Assuré', 'N°_Assuré', 'Numéro Assuré', 'No Assure', 'No_Assure',
                'Police', 'N° Police', 'N°_Police',
                'N° Adhérent', 'N°_Adhérent', 'Numéro Adhérent', 'Numéro_Adhérent', 'No Adherent',
                'Numéro Adhesion', 'N° Adhésion', 'N°_Adhésion', 'Adhesion', 'Identifiant'
              ]) || '').trim();
              const rawDateSoins = String(getVal(['Date_Soins', 'Date', 'Date Soins', 'Date des Soins', 'Date Prestation']) || inferredDateReglement).trim();
              const dateSoins = normalizeDateISO(rawDateSoins);
              const montantBrut = Number(getVal([
                'FR_REELS', 'FR.REELS', 'FRAIS_REELS', 'FRAIS REELS', 'FR REELS', 'FRAIS REEL',
                'Montant_Reclame_Brut', 'Montant_Brut', 'Montant Total Brut', 'Montant Facture', 'Total Prestation', 'Montant Reclame'
              ])) || 0;
              const participation = Number(getVal([
                'TPG', 'TPG*', 'T.P.G', 'Ticket_Moderateur', 'Ticket Moderateur', 'Ticket Modérateur', 'Part Assuré', 'Participation'
              ])) || 0;
              const netAPayer = Number(getVal([
                'REMB', 'REMB.', 'REMBOURSEMENT', 'Montant_Paye_Regle', 'Somme_Payee_Net', 'Net A Payer', 'Montant Regle', 'Montant Réglé', 'Net Payé', 'Montant Remboursé', 'Somme Payée'
              ])) || 0;
              const montantExclu = Number(getVal([
                'NON_REMB', 'NON REMB', 'NON_REMB.', 'Montant_Exclu', 'Montant_Exclu_Rejet', 'Montant Exclu', 'Exclu', 'Rejet'
              ])) || 0;

              const finalBrut = montantBrut || (netAPayer > 0 ? (netAPayer + participation + montantExclu) : netAPayer);
              const finalNet = netAPayer || (finalBrut > 0 ? Math.max(0, finalBrut - participation - montantExclu) : 0);
              
              const actCode = String(getVal(['Code_Acte', 'Code Acte', 'Acte', 'Code']) || 'CONS').trim().toUpperCase();
              const actLibelle = String(getVal(['Libelle_Acte', 'Libellé Acte', 'Acte médicale/Prix', 'Actes Médicaux', 'Prestation', 'Libellé']) || actCode).trim();
              let observations = String(getVal(['Observations', 'Remarques', 'Commentaires', 'Motif', 'Motif_Observation']) || 'Import Excel').trim();
              if (nomAdherentEffectif && nomAdherentEffectif.toLowerCase() !== rawNom.toLowerCase() && !observations.toLowerCase().includes(nomAdherentEffectif.toLowerCase())) {
                observations = observations && observations !== 'Import Excel' ? `${observations} (Adhérent: ${nomAdherentEffectif})` : `Adhérent: ${nomAdherentEffectif}`;
              }

              return {
                numeroLigne: idx + 1,
                dateSoins,
                matricule,
                nomPrenom: rawNom,
                societeAffiliee: inferredOrganisme,
                sousSociete: sousSoc,
                actes: [{ code: actCode.substring(0, 8), libelle: actLibelle, montant: finalBrut }],
                actesTexte: actLibelle,
                montantBrut: finalBrut,
                montantExclu,
                baseReglement: finalBrut,
                participation,
                netAPayer: finalNet,
                observations
              };
            });

            const totalNet = lignes.reduce((s, l) => s + l.netAPayer, 0);
            const totalPart = lignes.reduce((s, l) => s + l.participation, 0);
            const totalBrut = lignes.reduce((s, l) => s + l.montantBrut, 0);

            const doc: ParsedFactureAssurance = {
              documentType: 'decompte',
              etablissement: 'CENTRE DE SANTÉ',
              numeroFacture: inferredBordereau || `BORD-${Date.now().toString().substring(6)}`,
              numeroBordereau: inferredBordereau || `BORD-${Date.now().toString().substring(6)}`,
              moisPriseEnCharge: new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
              clientDoit: inferredOrganisme,
              dateEmission: inferredDateReglement,
              totalMontantBrut: totalBrut,
              totalParticipation: totalPart,
              totalNetAPayer: totalNet,
              lignes
            };

            processLoadedDocument(doc, groupOnImport, matchedDetectedSoc?.id);
          } catch (err: any) {
            setErrorMessage(err.message || 'Erreur lors de la lecture du fichier Excel.');
            setIsProcessing(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        throw new Error("Seuls les fichiers Excel (.xlsx, .xls, .csv) sont pris en charge pour l'importation de décompte.");
      }
    } catch (err: any) {
      console.warn('Decompte extraction error:', err);
      setErrorMessage(err.message || 'Erreur lors de la lecture du fichier Excel.');
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const filesArray = Array.from(e.target.files);
    e.target.value = '';
    if (filesArray.length === 1) {
      setFileQueue([filesArray[0]]);
      setCurrentFileIndex(0);
      setBatchHistory([]);
      processFile(filesArray[0]);
    } else {
      handleFilesSelected(filesArray);
    }
  };

  const handleRetryLastFile = () => {
    if (lastUploadedFile) {
      processFile(lastUploadedFile);
    } else {
      excelInputRef.current?.click();
    }
  };

  // Toggle selection
  const handleToggleSelectRow = (rowId: string) => {
    setRows(prev => prev.map(r => r.rowId === rowId ? { ...r, selected: !r.selected } : r));
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setRows(prev => prev.map(r => ({ ...r, selected: checked })));
  };

  // Link selected candidate to active row
  const handleAssignCandidate = (rowId: string, candidate: MatchCandidate | null) => {
    setRows(prev => prev.map(r => {
      if (r.rowId === rowId) {
        return {
          ...r,
          matchedCandidate: candidate,
          createNewPrestation: candidate === null
        };
      }
      return r;
    }));
    setSearchingRowId(null);
    setActSearchQuery('');
    setActResultFilter('ALL');
  };

  /**
   * Délie l'acte prescrit déjà rattaché à une ligne de règlement, sans créer de
   * nouvelle prestation au vol et sans fermer la fenêtre de rattachement : la
   * ligne redevient « Non rattaché » et l'utilisateur peut choisir un autre acte.
   */
  const handleUnlinkRow = (rowId: string, keepSearchOpen = false) => {
    setRows(prev => prev.map(r => (r.rowId === rowId ? { ...r, matchedCandidate: null, createNewPrestation: false } : r)));
    if (!keepSearchOpen) {
      setSearchingRowId(null);
      setActSearchQuery('');
      setActResultFilter('ALL');
    }
  };

  /** Délie, en une seule action, tous les actes déjà rattachés du décompte courant. */
  const handleUnlinkAllRows = () => {
    const alreadyLinked = rows.filter(r => r.matchedCandidate).length;
    if (alreadyLinked === 0) return;
    if (!window.confirm(`Délier les ${alreadyLinked} ligne(s) déjà rattachée(s) à un acte prescrit ?\n\nLes lignes redeviennent « Non rattaché » (aucune prestation n'est créée à l'enregistrement).`)) {
      return;
    }
    setRows(prev => prev.map(r => (r.matchedCandidate ? { ...r, matchedCandidate: null, createNewPrestation: false } : r)));
  };

  const activeSearchingRow = rows.find(r => r.rowId === searchingRowId);

  // Filtered search list inside manual match modal, scored by match quality
  const filteredSearchCandidates = useMemo(() => {
    let list = allEligibleActs;
    if (actSearchQuery.trim()) {
      const q = actSearchQuery.toLowerCase().trim();
      list = allEligibleActs.filter(cand =>
        cand.personneNom.toLowerCase().includes(q) ||
        cand.matricule.toLowerCase().includes(q) ||
        cand.prestationNum.toLowerCase().includes(q) ||
        cand.codeActe.toLowerCase().includes(q) ||
        cand.libelleActe.toLowerCase().includes(q) ||
        (cand.sousSociete && cand.sousSociete.toLowerCase().includes(q)) ||
        (cand.societeNom && cand.societeNom.toLowerCase().includes(q))
      );
    }

    const typeRank: Record<string, number> = { PERFECT: 0, SAME_DATE: 1, SAME_AMOUNT: 2, VERIFY: 3, UNLINKED: 4 };
    const detailsOf = (cand: MatchCandidate) =>
      activeSearchingRow
        ? getConfrontationDetails(
            activeSearchingRow.dateSoins,
            activeSearchingRow.montantBrut,
            activeSearchingRow.netAPayer,
            cand,
            activeSearchingRow.participation,
            activeSearchingRow.nomPrenom
          )
        : null;
    const isoOf = (iso?: string): string => normalizeDateISO(iso || '') || (iso || '').trim().substring(0, 10);

    // Tri par écart de montant : utilise directement le résultat de la comparaison
    // « Montant_Reclame_Brut (importation) ↔ montant sans TM (acte prescrit) » :
    // les actes dont le montant hors TM tombe exactement sur le montant réclamé
    // arrivent en tête, puis les écarts croissants.
    if (!activeSearchingRow) return list;

    if (actSortMode === 'MONTANT_ASC' || actSortMode === 'MONTANT_DESC') {
      const dir = actSortMode === 'MONTANT_ASC' ? 1 : -1;
      return [...list].sort((a, b) => {
        const detA = detailsOf(a);
        const detB = detailsOf(b);
        const ecartA = detA ? detA.montant.ecartAbsolu : Number.POSITIVE_INFINITY;
        const ecartB = detB ? detB.montant.ecartAbsolu : Number.POSITIVE_INFINITY;
        if (ecartA !== ecartB) return dir * (ecartA - ecartB);

        // Ex æquo sur l'écart : catégorie de pertinence, puis date, puis nom
        const typeDiff = (detA ? (typeRank[detA.type] ?? 4) : 4) - (detB ? (typeRank[detB.type] ?? 4) : 4);
        if (typeDiff !== 0) return typeDiff;

        const dateCmp = isoOf(a.prestationDate).localeCompare(isoOf(b.prestationDate));
        if (dateCmp !== 0) return dateCmp;
        const nameCmp = (a.personneNom || '').localeCompare(b.personneNom || '', 'fr', { sensitivity: 'base' });
        if (nameCmp !== 0) return nameCmp;
        return (a.prestationNum || '').localeCompare(b.prestationNum || '');
      });
    }

    // Tri par date de soins croissante / décroissante (date croissante par défaut) :
    // la date de l'acte prescrit est le critère principal, la pertinence départage les ex æquo.
    if (actSortMode === 'DATE_ASC' || actSortMode === 'DATE_DESC') {
      const dir = actSortMode === 'DATE_ASC' ? 1 : -1;
      return [...list].sort((a, b) => {
        const dA = isoOf(a.prestationDate);
        const dB = isoOf(b.prestationDate);
        if (!dA && dB) return 1;
        if (dA && !dB) return -1;
        if (dA && dB && dA !== dB) return dir * dA.localeCompare(dB);

        // Ex æquo sur la date : pertinence, écart de montant, puis ordre alphabétique
        const detA = detailsOf(a);
        const detB = detailsOf(b);
        const typeDiff = (detA ? (typeRank[detA.type] ?? 4) : 4) - (detB ? (typeRank[detB.type] ?? 4) : 4);
        if (typeDiff !== 0) return typeDiff;

        const ecartDiff = (detA?.montant.ecartAbsolu ?? Number.POSITIVE_INFINITY) - (detB?.montant.ecartAbsolu ?? Number.POSITIVE_INFINITY);
        if (ecartDiff !== 0) return ecartDiff;

        const nameCmp = (a.personneNom || '').localeCompare(b.personneNom || '', 'fr', { sensitivity: 'base' });
        if (nameCmp !== 0) return nameCmp;
        return (a.prestationNum || '').localeCompare(b.prestationNum || '');
      });
    }

    // Liste triée par pertinence — ordre de priorité explicite :
    //   1. même date de soins ET même montant (montant sans TM de l'acte == Montant_Reclame_Brut),
    //   2. même date de soins,
    //   3. même montant,
    //   4. écart de montant croissant (résultat de la comparaison sans TM),
    //   5. similarité de nom (nom identique > partiellement similaire),
    //   6. proximité de la date de soins,
    //   7. ordre alphabétique (nom, puis date, puis n° facture).
    const dayOf = (iso?: string): number => {
      const t = Date.parse(normalizeDateISO(iso || '') || '');
      return Number.isFinite(t) ? Math.round(t / 86_400_000) : Number.POSITIVE_INFINITY;
    };
    const targetDay = dayOf(activeSearchingRow.dateSoins);

    return [...list].sort((a, b) => {
      const detA = detailsOf(a)!;
      const detB = detailsOf(b)!;

      // 1-3. Même date + même montant, puis même date, puis même montant
      const typeDiff = (typeRank[detA.type] ?? 4) - (typeRank[detB.type] ?? 4);
      if (typeDiff !== 0) return typeDiff;

      // 4. Écart de montant (Montant_Reclame_Brut vs montant sans TM) le plus faible d'abord
      if (detA.montant.ecartAbsolu !== detB.montant.ecartAbsolu) {
        return detA.montant.ecartAbsolu - detB.montant.ecartAbsolu;
      }

      // 5. Similarité de nom : identique > partiellement similaire > différent
      const nameScore = (d: ConfrontationDetails) => (d.isSameName ? 2 : d.isPartialName ? 1 : 0);
      const nameDiff = nameScore(detB) - nameScore(detA);
      if (nameDiff !== 0) return nameDiff;

      // 6. Proximité de la date de soins (la plus proche d'abord)
      const distA = Math.abs(dayOf(a.prestationDate) - targetDay);
      const distB = Math.abs(dayOf(b.prestationDate) - targetDay);
      if (distA !== distB) return distA - distB;

      // 7. Ordre alphabétique, puis date et n° facture (ordre déterministe)
      const nameCmp = (a.personneNom || '').localeCompare(b.personneNom || '', 'fr', { sensitivity: 'base' });
      if (nameCmp !== 0) return nameCmp;
      const dateCmp = (a.prestationDate || '').localeCompare(b.prestationDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.prestationNum || '').localeCompare(b.prestationNum || '');
    });
  }, [allEligibleActs, actSearchQuery, activeSearchingRow, actSortMode]);

  // Sous-fenêtre « Lier » : liste réellement affichée selon le filtre de pertinence choisi
  const resultFilterCandidates = useMemo(() => {
    if (actResultFilter === 'ALL' || !activeSearchingRow) return filteredSearchCandidates;
    const targetType = actResultFilter;
    return filteredSearchCandidates.filter(cand =>
      getConfrontationDetails(
        activeSearchingRow.dateSoins,
        activeSearchingRow.montantBrut,
        activeSearchingRow.netAPayer,
        cand,
        activeSearchingRow.participation,
        activeSearchingRow.nomPrenom
      ).type === targetType
    );
  }, [filteredSearchCandidates, actResultFilter, activeSearchingRow]);

  // Nombre de résultats par catégorie de pertinence (pour les pastilles du filtre)
  const resultFilterCounts = useMemo(() => {
    const counts: Record<'ALL' | 'PERFECT' | 'SAME_DATE' | 'SAME_AMOUNT' | 'VERIFY', number> = {
      ALL: filteredSearchCandidates.length,
      PERFECT: 0,
      SAME_DATE: 0,
      SAME_AMOUNT: 0,
      VERIFY: 0,
    };
    if (activeSearchingRow) {
      filteredSearchCandidates.forEach(cand => {
        const type = getConfrontationDetails(
          activeSearchingRow.dateSoins,
          activeSearchingRow.montantBrut,
          activeSearchingRow.netAPayer,
          cand,
          activeSearchingRow.participation,
          activeSearchingRow.nomPrenom
        ).type;
        if (type !== 'UNLINKED') counts[type]++;
      });
    }
    return counts;
  }, [filteredSearchCandidates, activeSearchingRow]);

  /**
   * Résultat de la comparaison demandé par le métier : nombre d'actes candidats
   * dont le « montant sans TM » égale le Montant_Reclame_Brut de la ligne importée.
   */
  const montantConformesCount = useMemo(() => {
    if (!activeSearchingRow) return 0;
    const brutImport = Number(activeSearchingRow.montantBrut || activeSearchingRow.netAPayer || 0);
    return filteredSearchCandidates.filter(
      cand => computeMontantConfrontation(brutImport, cand).isConforme
    ).length;
  }, [filteredSearchCandidates, activeSearchingRow]);

  // Helper to find top candidate suggestions for a settlement row (strictly in the same month & year)
  const getRowSuggestions = (row: SettlementRowItem): MatchCandidate[] => {
    const cleanMat = (row.matricule || '').replace(/\s+/g, '').toLowerCase();

    if (!cleanMat || cleanMat === '-') {
      const normalizedRowName = normalizePersonName(row.nomPrenom);
      if (!normalizedRowName) return [];
    }

    const isoDateSoins = normalizeDateISO(row.dateSoins);
    const monthSoins = isoDateSoins ? isoDateSoins.substring(0, 7) : '';

    return allEligibleActs.filter(cand => {
      // Avoid candidates already assigned to another row in this settlement
      const isAlreadyAssigned = rows.some(r => r.rowId !== row.rowId && r.matchedCandidate?.lignePrestationId === cand.lignePrestationId);
      if (isAlreadyAssigned) return false;

      // Restreindre les suggestions automatiques au même mois (YYYY-MM)
      const isoCandDate = normalizeDateISO(cand.prestationDate);
      const monthCand = isoCandDate ? isoCandDate.substring(0, 7) : '';
      if (!monthSoins || !monthCand || monthSoins !== monthCand) {
        return false;
      }

      const candMat = (cand.matricule || '').replace(/\s+/g, '').toLowerCase();

      const matMatch = Boolean(cleanMat && cleanMat !== '-' && candMat && candMat !== '-' && (cleanMat === candMat || candMat.includes(cleanMat) || cleanMat.includes(candMat)));
      const nameComparison = comparePersonNames(row.nomPrenom, cand.personneNom);
      const nameMatch = nameComparison.isSame || nameComparison.isPartial;

      return matMatch || nameMatch;
    }).slice(0, 3);
  };

  // Automatically link all unlinked rows that have high-confidence suggestions
  const handleAutoLinkAllSuggestions = () => {
    let linkedCount = 0;
    setRows(prev => prev.map(r => {
      if (r.matchedCandidate) return r; // Already matched

      const suggestions = getRowSuggestions(r);
      if (suggestions.length > 0) {
        linkedCount++;
        return {
          ...r,
          matchedCandidate: suggestions[0],
          createNewPrestation: false,
        };
      }
      return r;
    }));
  };

  // Select rows by specific status category
  const handleSelectByStatus = (statusType: 'PERFECT' | 'LINKED' | 'UNLINKED' | 'VERIFY' | 'ALL') => {
    setRows(prev => prev.map(r => {
      const details = getConfrontationDetails(r.dateSoins, r.montantBrut, r.netAPayer, r.matchedCandidate, r.participation, r.nomPrenom);
      let selectIt = false;
      if (statusType === 'ALL') selectIt = true;
      else if (statusType === 'PERFECT') selectIt = details.type === 'PERFECT';
      else if (statusType === 'LINKED') selectIt = Boolean(r.matchedCandidate);
      else if (statusType === 'UNLINKED') selectIt = !r.matchedCandidate;
      else if (statusType === 'VERIFY') selectIt = details.type === 'VERIFY';
      return { ...r, selected: selectIt };
    }));
  };

  // Statistics for confrontation categories
  const confrontStats = useMemo(() => {
    let perfect = 0;
    let sameDate = 0;
    let sameAmount = 0;
    let verify = 0;
    let unlinked = 0;

    rows.forEach(r => {
      const details = getConfrontationDetails(r.dateSoins, r.montantBrut, r.netAPayer, r.matchedCandidate, r.participation, r.nomPrenom);
      if (details.type === 'PERFECT') perfect++;
      else if (details.type === 'SAME_DATE') sameDate++;
      else if (details.type === 'SAME_AMOUNT') sameAmount++;
      else if (details.type === 'VERIFY') verify++;
      else if (details.type === 'UNLINKED') unlinked++;
    });

    const linkedCount = perfect + sameDate + sameAmount + verify;
    const matchPercentage = rows.length > 0 ? Math.round((linkedCount / rows.length) * 100) : 0;

    return { perfect, sameDate, sameAmount, verify, unlinked, total: rows.length, linkedCount, matchPercentage };
  }, [rows]);

  // Statistics for insured matricule updates
  const matriculeSyncStats = useMemo(() => {
    let withMatricule = 0;
    let willUpdateExisting = 0;
    let willCreateNew = 0;

    rows.forEach(r => {
      if (isRealMatricule(r.matricule)) {
        withMatricule++;
        const normNom = (r.nomPrenom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const candPerId = r.matchedCandidate?.personneId;
        const existing = personnes.find(p => (candPerId && p.id === candPerId) || (p.matricule && p.matricule.toLowerCase() === r.matricule.toLowerCase()) || p.nomPrenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() === normNom);

        if (existing) {
          if (existing.matricule.trim().toLowerCase() !== r.matricule.trim().toLowerCase()) {
            willUpdateExisting++;
          }
        } else {
          willCreateNew++;
        }
      }
    });

    return { withMatricule, willUpdateExisting, willCreateNew };
  }, [rows, personnes]);

  // Filtered and sorted rows for display in table
  const displayedRows = useMemo(() => {
    let list = rows;

    // 1. Filter by confrontation category chip
    if (confrontFilter !== 'ALL') {
      list = list.filter(r => {
        const details = getConfrontationDetails(r.dateSoins, r.montantBrut, r.netAPayer, r.matchedCandidate, r.participation, r.nomPrenom);
        return details.type === confrontFilter;
      });
    }

    // 2. Filter by search query
    if (tableSearchQuery.trim()) {
      const q = tableSearchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      list = list.filter(r => {
        const normNom = (r.nomPrenom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const mat = (r.matricule || '').toLowerCase();
        const code = (r.actCode || '').toLowerCase();
        const lib = (r.actLibelle || '').toLowerCase();
        const candNom = (r.matchedCandidate?.personneNom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const candCode = (r.matchedCandidate?.codeActe || '').toLowerCase();
        const candNum = (r.matchedCandidate?.prestationNum || '').toLowerCase();
        const dateStr = formatDate(r.dateSoins).toLowerCase();
        const netStr = r.netAPayer.toString();
        const brutStr = r.montantBrut.toString();

        return normNom.includes(q) || mat.includes(q) || code.includes(q) || lib.includes(q) ||
          candNom.includes(q) || candCode.includes(q) || candNum.includes(q) || dateStr.includes(q) ||
          netStr.includes(q) || brutStr.includes(q);
      });
    }

    // 3. Grouper les « À vérifier » à nom partiellement similaire, puis tri optionnel
    list = [...list].sort((a, b) => {
      const detA = getConfrontationDetails(a.dateSoins, a.montantBrut, a.netAPayer, a.matchedCandidate, a.participation, a.nomPrenom);
      const detB = getConfrontationDetails(b.dateSoins, b.montantBrut, b.netAPayer, b.matchedCandidate, b.participation, b.nomPrenom);
      const partialA = detA.type === 'VERIFY' && detA.isPartialName ? 0 : 1;
      const partialB = detB.type === 'VERIFY' && detB.isPartialName ? 0 : 1;
      if (partialA !== partialB) return partialA - partialB;
      if (partialA === 0) {
        const nA = normalizePersonName(a.nomPrenom);
        const nB = normalizePersonName(b.nomPrenom);
        if (nA !== nB) return nA.localeCompare(nB, 'fr');
      }
      return 0;
    });

    if (sortBy !== 'DEFAULT') {
      list = [...list].sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        if (sortBy === 'DATE') {
          valA = a.dateSoins || '';
          valB = b.dateSoins || '';
        } else if (sortBy === 'PATIENT') {
          valA = (a.nomPrenom || '').toLowerCase();
          valB = (b.nomPrenom || '').toLowerCase();
        } else if (sortBy === 'AMOUNT') {
          valA = a.netAPayer;
          valB = b.netAPayer;
        } else if (sortBy === 'STATUS') {
          const scoreMap: Record<ConfrontationType, number> = {
            UNLINKED: 1,
            VERIFY: 2,
            SAME_AMOUNT: 3,
            SAME_DATE: 4,
            PERFECT: 5,
          };
          const detA = getConfrontationDetails(a.dateSoins, a.montantBrut, a.netAPayer, a.matchedCandidate, a.participation, a.nomPrenom);
          const detB = getConfrontationDetails(b.dateSoins, b.montantBrut, b.netAPayer, b.matchedCandidate, b.participation, b.nomPrenom);
          valA = scoreMap[detA.type] || 0;
          valB = scoreMap[detB.type] || 0;
        }

        if (valA < valB) return sortOrder === 'ASC' ? -1 : 1;
        if (valA > valB) return sortOrder === 'ASC' ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [rows, confrontFilter, tableSearchQuery, sortBy, sortOrder]);

  // Final Validation
  const executeValidateAndSave = (overrideExistingSocId?: string) => {
    if (!parsedDoc) return;
    const selectedRows = rows.filter(r => r.selected);
    if (selectedRows.length === 0) {
      alert('Veuillez sélectionner au moins une ligne de décompte à régler.');
      return;
    }

    const effectiveSocId = overrideExistingSocId || selectedInsurance || (activeSocietesList.find(s => s.nom.toLowerCase() === (parsedDoc.clientDoit || '').toLowerCase())?.id);
    const socName = (parsedDoc.clientDoit || parsedDoc.garant || getEffectiveInsurance() || 'BSA / ASK GS').trim();
    let matchedSoc = (effectiveSocId ? societes.find(s => s.id === effectiveSocId) : null) || findBestMatchingSociete(socName, societes, getEffectiveInsurance());

    const createdSocietes: Societe[] = [];
    const finalPersonnesMap = new Map<string, Personne>();
    personnes.forEach(p => finalPersonnesMap.set(p.id, { ...p }));

    if (!matchedSoc) {
      setMissingSocPrompt({ socName });
      return;
    }

    const paymentId = generateId('pai');
    const newLignesPaiement: LignePaiement[] = [];
    const updatedPrestations = [...prestations];

    selectedRows.forEach((row, idx) => {
      let targetPrestationId = '';
      let targetLigneId = '';
      const rowMatricule = (row.matricule || '').trim();
      const hasRealMatricule = isRealMatricule(rowMatricule);
      const normRowNom = (row.nomPrenom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

      if (row.matchedCandidate) {
        targetPrestationId = row.matchedCandidate.prestationId;
        targetLigneId = row.matchedCandidate.lignePrestationId;

        // Update the existing prestation in database
        const pIndex = updatedPrestations.findIndex(p => p.id === targetPrestationId);
        if (pIndex >= 0) {
          const prest = updatedPrestations[pIndex];

          // Locate the insured member's record in dossier
          let targetPersonne = finalPersonnesMap.get(row.matchedCandidate.personneId) ||
            finalPersonnesMap.get(prest.personneId) ||
            Array.from(finalPersonnesMap.values()).find(p => 
              (hasRealMatricule && p.matricule.toLowerCase() === rowMatricule.toLowerCase()) ||
              p.nomPrenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() === normRowNom ||
              (prest.nomAgent && p.nomPrenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() === prest.nomAgent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim())
            );

          if (targetPersonne) {
            // Ne JAMAIS mettre à jour le nom de la personne dans la base lors de l'import règlement.
            if (hasRealMatricule && targetPersonne.matricule.trim() !== rowMatricule) {
              targetPersonne = {
                ...targetPersonne,
                nomPrenom: targetPersonne.nomPrenom,
                matricule: rowMatricule,
                sousSociete: row.sousSociete || targetPersonne.sousSociete
              };
              finalPersonnesMap.set(targetPersonne.id, targetPersonne);
            }
            if (hasRealMatricule) {
              prest.matricule = rowMatricule;
            }
            prest.personneId = targetPersonne.id;
          } else {
            // Create the insured person record if missing
            const newPer: Personne = {
              id: generateId(`per-cand-${idx}`),
              matricule: hasRealMatricule ? rowMatricule : (prest.matricule || `MAT-${1000 + idx}`),
              nomPrenom: prest.nomAgent || 'Assuré',
              societeId: matchedSoc?.id || prest.societeId || 'soc-1',
              sousSociete: row.sousSociete || prest.sousSociete || undefined,
              qualite: 'Adhérent Principal'
            };
            finalPersonnesMap.set(newPer.id, newPer);
            prest.personneId = newPer.id;
            if (hasRealMatricule) {
              prest.matricule = rowMatricule;
            }
          }

          const updatedLignes = prest.lignes.map(l => {
            if (l.id === targetLigneId) {
              const newTotalPaye = (l.totalPaye || 0) + row.netAPayer;
              const lARemb = l.montantARembourser ?? (l.totalPrestation - (l.ticketModerateur || 0));
              const isLigneRejetee = (row.montantExclu || 0) >= lARemb && newTotalPaye === 0;
              const isLigneFullyCovered = (newTotalPaye + (row.montantExclu || 0)) >= lARemb || newTotalPaye >= lARemb;
              return {
                ...l,
                totalPaye: newTotalPaye,
                statut: isLigneRejetee ? ('Rejeté' as const) : isLigneFullyCovered ? ('Payé' as const) : newTotalPaye > 0 ? ('Partiellement payé' as const) : l.statut
              };
            }
            return l;
          });

          const totalPrestationVal = prest.montantTotal ?? prest.totalPrestation;
          const partVal = prest.ticketModerateur ?? prest.participation ?? 0;
          const rembVal = prest.montantARembourser ?? Math.max(0, totalPrestationVal - partVal);
          const totalPaidAll = updatedLignes.reduce((sum, l) => sum + (l.totalPaye || 0), 0);
          const newReste = Math.max(0, rembVal - totalPaidAll - (row.montantExclu || 0));
          const isAllRejected = updatedLignes.every(l => l.statut === 'Rejeté');
          const isFullyPaid = totalPaidAll >= rembVal || newReste <= 0;

          updatedPrestations[pIndex] = {
            ...prest,
            totalPaye: totalPaidAll,
            resteAPayer: newReste,
            lignes: updatedLignes,
            statut: isAllRejected ? 'Rejeté' : isFullyPaid ? 'Payé' : totalPaidAll > 0 ? 'Partiellement payé' : prest.statut
          };
        }
      } else {
        // Unlinked settlement line: do NOT create a fake Prestation in the medical invoices database.
        // It is safely registered as a LignePaiement in the Paiement object,
        // ready to be linked anytime from the Paiements view.
        targetPrestationId = '';
        targetLigneId = '';

        // Find or create patient and update their dossier if immatriculation is found
        let targetPersonne = Array.from(finalPersonnesMap.values()).find(p => 
          (hasRealMatricule && p.matricule.toLowerCase() === rowMatricule.toLowerCase()) ||
          p.nomPrenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() === normRowNom
        );

        if (targetPersonne) {
          if (hasRealMatricule && targetPersonne.matricule.trim() !== rowMatricule) {
            targetPersonne = {
              ...targetPersonne,
              matricule: rowMatricule,
              sousSociete: row.sousSociete || targetPersonne.sousSociete
            };
            finalPersonnesMap.set(targetPersonne.id, targetPersonne);
          }
        } else if (hasRealMatricule || row.nomPrenom) {
          targetPersonne = {
            id: generateId(`per-new-${idx}`),
            matricule: hasRealMatricule ? rowMatricule : `MAT-${idx + 100}`,
            nomPrenom: row.nomPrenom,
            societeId: matchedSoc?.id || 'soc-1',
            sousSociete: row.sousSociete || undefined,
            qualite: 'Adhérent Principal'
          };
          finalPersonnesMap.set(targetPersonne.id, targetPersonne);
        }
      }

      newLignesPaiement.push({
        id: generateId(`lp-${idx}`),
        paiementId: paymentId,
        lignePrestationId: targetLigneId || '',
        prestationId: targetPrestationId || '',
        prestationNumero: row.matchedCandidate?.prestationNum || '-',
        dateSoins: row.dateSoins,
        immatriculation: rowMatricule || '-',
        nomBaseAssurance: row.nomPrenom,
        nomAgent: row.nomPrenom,
        totalPaye: row.netAPayer,
        montantPaye: row.netAPayer,
        ticketModerateur: row.participation,
        montantExclu: row.montantExclu,
        montantReclame: row.montantBrut,
        actesPayes: [{ code: row.actCode, libelle: row.actLibelle, montant: row.netAPayer }],
        commentaire: `Règlement ${parsedDoc.numeroBordereau || ''} - Acte ${row.actCode}`
      });
    });

    const totalReclame = selectedRows.reduce((s, r) => s + r.montantBrut, 0);
    const totalPaye = selectedRows.reduce((s, r) => s + r.netAPayer, 0);
    const totalModerateur = selectedRows.reduce((s, r) => s + r.participation, 0);
    const totalExclu = selectedRows.reduce((s, r) => s + r.montantExclu, 0);

    const nouveauPaiement: Paiement = {
      id: paymentId,
      numeroBordereau: parsedDoc.numeroBordereau || parsedDoc.numeroFacture || `BORD-${Date.now().toString().substring(6)}`,
      datePaiement: parsedDoc.dateEmission || new Date().toISOString().split('T')[0],
      dateSaisie: getCurrentTimestamp(),
      societeId: matchedSoc?.id || 'soc-1',
      modePaiement: 'Virement bancaire',
      referencePaiement: `VIR-${parsedDoc.numeroBordereau || Date.now().toString().substring(6)}`,
      totalReclame,
      totalPaye: totalPaye - (parsedDoc.remise || 0),
      totalModerateur,
      totalExclu,
      remise: parsedDoc.remise || 0,
      statut: 'Validé',
      notes: `Importation Décompte ${matchedSoc?.nom || parsedDoc.clientDoit} - ${selectedRows.length} actes rattachés`,
      lignes: newLignesPaiement
    };

    const originalById = new Map(personnes.map(p => [p.id, p]));
    const finalPersonnesList = Array.from(finalPersonnesMap.values())
      .filter(p => {
        const orig = originalById.get(p.id);
        if (!orig) return true;
        return orig.matricule !== p.matricule || orig.sousSociete !== p.sousSociete;
      })
      .map(p => {
        const orig = originalById.get(p.id);
        return orig ? { ...p, nomPrenom: orig.nomPrenom } : p;
      });
    onSavePaiement(nouveauPaiement, updatedPrestations, createdSocietes, finalPersonnesList);

    // Sequential Queue check: proceed to next file if present
    const currentFileName = fileQueue[currentFileIndex]?.name || parsedDoc.numeroBordereau || 'Fichier';
    const nextBatchHistory = [...batchHistory, { fileName: currentFileName, count: selectedRows.length, status: 'SUCCESS' as const }];
    setBatchHistory(nextBatchHistory);

    if (fileQueue.length > 1 && currentFileIndex + 1 < fileQueue.length) {
      const nextIdx = currentFileIndex + 1;
      setCurrentFileIndex(nextIdx);
      const nextFile = fileQueue[nextIdx];
      setParsedDoc(null);
      setRows([]);
      setErrorMessage(null);
      setSearchingRowId(null);
      setBatchNotice(`Fichier ${currentFileIndex + 1} « ${currentFileName} » importé avec succès (${selectedRows.length} actes). Traitement du fichier suivant ${nextIdx + 1} / ${fileQueue.length} (${nextFile.name})...`);
      processFile(nextFile);
    } else {
      const totalImportedCount = nextBatchHistory.reduce((acc, h) => acc + h.count, 0);
      if (fileQueue.length > 1) {
        alert(`Traitement par lot terminé avec succès !\n${fileQueue.length} fichier(s) traité(s), ${totalImportedCount} actes de règlement enregistrés.`);
      }
      handleResetAndBack();
      onClose();
    }
  };

  const handleValidateAndSave = () => {
    if (parsedDoc && isExactDuplicate) {
      alert(`Attention : Le bordereau de règlement N° "${bordereauRefDoc}" existe déjà avec un montant identique (${formatMoney(exactAmountDuplicates[0]?.totalPaye || 0)}). La validation est bloquée pour éviter un double encaissement.`);
      return;
    }
    
    // Check if there are unlinked rows selected
    const unlinkedCount = selectedRows.filter(r => !r.matchedCandidate).length;
    if (unlinkedCount > 0) {
      setShowUnlinkedConfirmModal(true);
      return;
    }

    executeValidateAndSave();
  };

  const cleanNum = (n?: string) => (n || '').replace(/[\s\-\_\.\/]/g, '').toUpperCase();
  const bordereauRefDoc = parsedDoc?.numeroBordereau || parsedDoc?.numeroFacture || '';
  const bordereauClean = cleanNum(bordereauRefDoc);
  
  const selectedRows = rows.filter(r => r.selected);
  const totalSelectedPaye = selectedRows.reduce((s, r) => s + r.netAPayer, 0);
  const docNetTotal = parsedDoc ? (parsedDoc.totalNetAPayer || totalSelectedPaye) : totalSelectedPaye;

  // Check if bordereau reference already exists in paiements
  const matchingRefPaiements = bordereauClean
    ? paiements.filter(p => cleanNum(p.numeroBordereau) === bordereauClean || cleanNum(p.referencePaiement) === bordereauClean)
    : [];

  // Exact duplicate: SAME reference AND SAME payment date AND SAME total amount (tolerance < 2 Ar)
  const exactAmountDuplicates = matchingRefPaiements.filter(p => {
    const pTotal = Number(p.totalPaye || 0);
    const pDate = p.datePaiement ? p.datePaiement.split('T')[0] : '';
    const docDate = parsedDoc?.dateEmission ? parsedDoc.dateEmission.split('T')[0] : '';
    const isSameDate = Boolean(pDate && docDate && pDate === docDate);
    const isSameAmount = Math.abs(pTotal - docNetTotal) < 2 || Math.abs(pTotal - totalSelectedPaye) < 2;
    return isSameDate && isSameAmount;
  });

  // Reference match with a different amount (e.g. tranche, installment, partial payment)
  const differentAmountPaiements = matchingRefPaiements.filter(p => 
    !exactAmountDuplicates.some(ed => ed.id === p.id)
  );

  // ONLY strictly block if both reference AND amount are identical
  const isExactDuplicate = exactAmountDuplicates.length > 0;
  const isDuplicateBordereau = isExactDuplicate;
  const hasRefMatchWithDifferentAmount = differentAmountPaiements.length > 0 && !isExactDuplicate;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-6xl rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[94vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            {parsedDoc && (
              <button
                onClick={handleResetAndBack}
                title="Retour au choix de document"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line bg-surface text-ink hover:bg-surface-hover text-xs font-semibold shadow-xs transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Retour</span>
              </button>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink-strong">
                {parsedDoc ? `Rapprochement Décompte : ${parsedDoc.numeroBordereau || parsedDoc.clientDoit}` : 'Importation Décompte Règlement (ASCOMA, MCI CARE, BSA)'}
              </h3>
              <p className="text-xs text-ink-muted">
                {parsedDoc 
                  ? `Confrontation intelligente par Date de Soins et Montant Brut sans ticket modérateur (${selectedRows.length} actes).`
                  : 'Rapprochement automatique des règlements avec les actes prescrits ouverts par comparaison de date et montant initial.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-hover hover:text-ink-secondary transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Multi-File Sequential Processing Header */}
        {fileQueue.length > 1 && (
          <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-sky-50/70 to-indigo-50/90 px-6 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-black text-xs shadow-xs">
                  <Files className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-indigo-900">
                      File d'attente Décomptes : Fichier {currentFileIndex + 1} / {fileQueue.length}
                    </span>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-full">
                      Traitement séquentiel
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-secondary font-medium truncate max-w-md">
                    Fichier en cours : <strong className="text-ink-strong font-bold">{fileQueue[currentFileIndex]?.name}</strong>
                  </p>
                </div>
              </div>

              {/* Progress Steps / Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSkipCurrentFile}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-line-strong text-ink hover:bg-surface-muted text-[11px] font-semibold transition shadow-2xs cursor-pointer"
                  title="Ignorer ce décompte et passer au fichier suivant dans la file"
                >
                  <FastForward className="w-3.5 h-3.5 text-ink-muted" />
                  <span>Ignorer ce fichier</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetAndBack}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-semibold transition cursor-pointer"
                  title="Arrêter l'importation de toute la liste de fichiers"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Arrêter la file</span>
                </button>
              </div>
            </div>

            {/* Queue Files Horizontal Stepper */}
            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
              {fileQueue.map((file, idx) => {
                const isCurrent = idx === currentFileIndex;
                const isPassed = idx < currentFileIndex;
                const historyItem = batchHistory.find(h => h.fileName === file.name);
                const isSkipped = historyItem?.status === 'SKIPPED';

                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap shrink-0 border transition ${
                      isCurrent
                        ? 'bg-indigo-600 text-white font-bold border-indigo-700 shadow-xs'
                        : isPassed
                        ? isSkipped
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-surface/80 text-ink-muted border-line'
                    }`}
                  >
                    {isCurrent && <RefreshCw className="w-3 h-3 animate-spin shrink-0" />}
                    {isPassed && !isSkipped && <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />}
                    {isPassed && isSkipped && <FastForward className="w-3 h-3 text-amber-600 shrink-0" />}
                    {!isCurrent && !isPassed && <Clock className="w-3 h-3 text-ink-faint shrink-0" />}
                    <span className="truncate max-w-[140px]">{idx + 1}. {file.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {batchNotice && (
            <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 font-semibold shadow-2xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{batchNotice}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-950">Échec du traitement</div>
                  <div className="mt-0.5">{errorMessage}</div>
                  {lastUploadedFile && (
                    <div className="text-[11px] text-rose-700/80 font-mono mt-1">
                      Fichier : {lastUploadedFile.name} ({(lastUploadedFile.size / 1024).toFixed(1)} Ko)
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-rose-200">
                <button
                  type="button"
                  onClick={handleRetryLastFile}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{isProcessing ? 'Nouvelle tentative...' : 'Réessayer'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    excelInputRef.current?.click();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-rose-300 text-rose-800 hover:bg-rose-100 font-medium transition cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choisir un autre fichier</span>
                </button>
                {fileQueue.length > 1 && currentFileIndex + 1 < fileQueue.length && (
                  <button
                    type="button"
                    onClick={handleSkipCurrentFile}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 hover:bg-amber-200 font-semibold transition cursor-pointer"
                  >
                    <FastForward className="h-3.5 w-3.5" />
                    <span>Passer au fichier suivant ({currentFileIndex + 2}/{fileQueue.length})</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {!parsedDoc && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-950">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>
                    Importez vos bordereaux de règlement au format Excel. L'organisme et la société payeuse sont automatiquement détectés depuis les colonnes du fichier.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={downloadDecomptesExcelTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-emerald-300 text-emerald-800 font-bold hover:bg-emerald-100 text-xs shrink-0 shadow-2xs transition cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Télécharger Modèle Excel</span>
                </button>
              </div>

              {/* Excel Upload Area */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const files = e.dataTransfer.files;
                  if (files && files.length > 0) {
                    handleFilesSelected(files);
                  }
                }}
                onClick={() => {
                  if (!isProcessing) {
                    excelInputRef.current?.click();
                  }
                }}
                className="flex min-h-52 flex-col items-center justify-center space-y-3 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/30 p-8 text-center transition hover:border-emerald-500 hover:bg-emerald-50/50 cursor-pointer"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface shadow-xs text-emerald-600 border border-emerald-100">
                  {isProcessing ? <RefreshCw className="h-6 w-6 animate-spin" /> : <FileSpreadsheet className="h-6 w-6" />}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-ink-strong">
                    {isProcessing ? 'Confrontation des actes en cours...' : 'Déposez un ou plusieurs fichiers Excel (.xlsx, .xls, .csv)'}
                  </h4>
                  <p className="text-xs text-ink-muted mt-1 max-w-md">
                    Cliquez ou glissez-déposez vos décomptes/bordereaux. Vous pouvez en sélectionner <strong>plusieurs à la fois</strong>.
                  </p>
                </div>
                <input
                  id="excel-decompte-file-input"
                  type="file"
                  ref={excelInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx,.xls,.csv"
                  multiple
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    excelInputRef.current?.click();
                  }}
                  disabled={isProcessing}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 shadow-xs cursor-pointer flex items-center gap-2"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Parcourir des fichiers Excel (Mono ou Multi-fichiers)</span>
                </button>
              </div>
            </div>
          )}

          {parsedDoc && (
            <div className="space-y-4">
              {/* DUPLICATE BLOCKING BANNER IF BORDEREAU ALREADY EXISTS WITH IDENTICAL AMOUNT */}
              {isExactDuplicate && (
                <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 shadow-sm text-rose-900 animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white font-bold shadow-xs">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-rose-800 bg-rose-200 px-2 py-0.5 rounded-md">
                          Doublon Strict Détecté (Même Référence & Même Montant)
                        </span>
                        <span className="text-xs font-bold text-rose-700">
                          {exactAmountDuplicates.length} paiement(s) déjà enregistré(s) avec cette référence et ce même montant ({formatMoney(exactAmountDuplicates[0]?.totalPaye || 0)})
                        </span>
                      </div>
                      <p className="text-xs text-rose-800 mt-1 font-medium leading-relaxed">
                        Le numéro de bordereau / référence <strong>« {bordereauRefDoc} »</strong> existe déjà dans la base des règlements avec un montant identique de <strong>{formatMoney(exactAmountDuplicates[0]?.totalPaye || 0)}</strong> (enregistré le {formatDate(exactAmountDuplicates[0]?.datePaiement)}). 
                        Pour éviter les doubles encaissements et les erreurs comptables, la validation de ce bordereau est <strong>bloquée</strong>. Si ce décompte constitue un nouveau paiement distinct, vous pouvez modifier sa référence ci-dessous ou supprimer l'ancien paiement.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* INFORMATIVE BANNER IF BORDEREAU EXISTS WITH DIFFERENT AMOUNT (NON-BLOCKING) */}
              {hasRefMatchWithDifferentAmount && (
                <div className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-4 shadow-sm text-sky-950 animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white font-bold shadow-xs">
                      <Info className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-sky-800 bg-sky-200 px-2 py-0.5 rounded-md">
                          Information Référence (Montants Différents)
                        </span>
                        <span className="text-xs font-semibold text-sky-800">
                          {differentAmountPaiements.length} paiement(s) antérieur(s) trouvé(s)
                        </span>
                      </div>
                      <p className="text-xs text-sky-800 mt-1 font-medium leading-relaxed">
                        La référence <strong>« {bordereauRefDoc} »</strong> a déjà été enregistrée pour un montant de <strong>{differentAmountPaiements.map(p => formatMoney(p.totalPaye)).join(', ')}</strong>, alors que ce bordereau totalise <strong>{formatMoney(totalSelectedPaye)}</strong>. 
                        Les montants étant différents (ex: tranche, acompte, complément), <strong>l'enregistrement est autorisé</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Document Overview Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl border border-line bg-surface-muted p-4 text-xs">
                <div>
                  <span className="text-ink-muted block mb-1">Organisme / Garant</span>
                  <Select
                    value={
                      activeSocietesList.find(s => s.nom.toLowerCase() === (parsedDoc.clientDoit || '').toLowerCase())?.id || 
                      selectedInsurance || ''
                    }
                    onChange={(e) => {
                      const newSocId = e.target.value;
                      setSelectedInsurance(newSocId);
                      const targetSoc = societes.find(s => s.id === newSocId);
                      if (targetSoc && parsedDoc) {
                        const updatedDoc = { ...parsedDoc, clientDoit: targetSoc.nom };
                        processLoadedDocument(updatedDoc, groupOnImport, newSocId);
                      }
                    }}
                    className="w-full bg-surface text-xs font-bold text-ink-strong rounded-lg p-1.5 border border-line-strong focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {activeSocietesList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom} ({s.code})
                      </option>
                    ))}
                    {!activeSocietesList.some(s => s.nom.toLowerCase() === (parsedDoc.clientDoit || '').toLowerCase()) && (
                      <option value="">{parsedDoc.clientDoit || 'Autre Organisme'}</option>
                    )}
                  </Select>
                </div>
                <div>
                  <span className="text-ink-muted block">Réf Bordereau</span>
                  <div className="flex items-center gap-1 mt-1">
                    <strong className="text-sm font-bold text-emerald-800 font-mono bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs">
                      {parsedDoc.numeroBordereau || parsedDoc.numeroFacture || 'BORDEREAU'}
                    </strong>
                  </div>
                </div>
                <div>
                  <span className="text-ink-muted block">Lignes à Régler</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-bold text-emerald-700">{confrontStats.linkedCount} rattachées</span>
                    <span className="text-ink-faint">•</span>
                    <span className="font-semibold text-amber-700">{confrontStats.unlinked} non rattachées</span>
                  </div>
                </div>
                <div>
                  <span className="text-ink-muted block">Net Réglé par l'Assurance</span>
                  <strong className="text-emerald-700 font-bold text-sm">{formatMoney(parsedDoc.totalNetAPayer)}</strong>
                </div>

                {/* Progress bar for reconciliation score */}
                <div className="col-span-2 sm:col-span-4 rounded-xl border border-line bg-surface p-3 space-y-1.5 mt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-ink flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Taux de Rapprochement Automatique des Actes :
                    </span>
                    <span className="font-extrabold text-emerald-800 font-mono text-xs">
                      {confrontStats.matchPercentage}% ({confrontStats.linkedCount} / {confrontStats.total} actes rattachés)
                    </span>
                  </div>
                  <div className="w-full bg-surface-hover rounded-full h-2.5 overflow-hidden flex shadow-inner">
                    <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${(confrontStats.perfect / (confrontStats.total || 1)) * 100}%` }} title="Même Date & Même Montant" />
                    <div className="bg-sky-500 h-full transition-all duration-300" style={{ width: `${(confrontStats.sameDate / (confrontStats.total || 1)) * 100}%` }} title="Même Date" />
                    <div className="bg-purple-500 h-full transition-all duration-300" style={{ width: `${(confrontStats.sameAmount / (confrontStats.total || 1)) * 100}%` }} title="Même Montant" />
                    <div className="bg-amber-400 h-full transition-all duration-300" style={{ width: `${(confrontStats.verify / (confrontStats.total || 1)) * 100}%` }} title="À vérifier" />
                  </div>
                </div>
              </div>

              {/* Matricule synchronization informational banner */}
              {matriculeSyncStats.withMatricule > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/90 px-4 py-2.5 text-xs text-emerald-950 shadow-2xs">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0 shadow-2xs">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-emerald-950">
                      Mise à jour automatique du dossier des assurés :
                    </div>
                    <div className="text-[11px] text-emerald-800">
                      <strong>{matriculeSyncStats.withMatricule}</strong> immatriculation(s) détectée(s) dans le fichier.
                      {matriculeSyncStats.willUpdateExisting > 0 && ` ${matriculeSyncStats.willUpdateExisting} dossier(s) d'assuré(s) existant(s) seront automatiquement actualisé(s) avec leur nouvelle immatriculation.`}
                      {matriculeSyncStats.willCreateNew > 0 && ` ${matriculeSyncStats.willCreateNew} nouvelle(s) fiche(s) assuré(s) seront créée(s) avec leur immatriculation.`}
                    </div>
                  </div>
                </div>
              )}

              {/* Grouping Toggle Banner (Same Person + Same Date + Same Act) */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-600 text-white font-bold text-[11px]">
                    ACTES
                  </span>
                  <div>
                    <div className="font-bold text-indigo-950">
                      Regroupement automatique des articles par acte (même personne, même date, même acte)
                    </div>
                    <div className="text-[11px] text-indigo-700">
                      Fusionne les articles de pharmacie/soins multiples en une seule ligne globale d'acte pour correspondre à votre base de soins.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold text-ink">
                    {groupOnImport ? 'Regroupement Actif' : 'Lignes Détaillées'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleGrouping(!groupOnImport)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      groupOnImport ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow-sm ring-0 transition duration-200 ease-in-out ${
                        groupOnImport ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Toolbar: Search Table, Sorting & Fast Match Shortcuts */}
              <div className="rounded-xl border border-line bg-surface-muted/80 p-3 space-y-3 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Table Search Input */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-faint" />
                    <input
                      type="text"
                      value={tableSearchQuery}
                      onChange={(e) => setTableSearchQuery(maskNom(e.target.value))}
                      placeholder="Rechercher par patient, matricule, code acte, montant ou date dans le tableau..."
                      className="w-full rounded-xl border border-line bg-surface pl-9 pr-8 py-2 text-xs text-ink-strong focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-2xs uppercase"
                    />
                    {tableSearchQuery && (
                      <button
                        onClick={() => setTableSearchQuery('')}
                        className="absolute right-2.5 top-2.5 text-ink-faint hover:text-ink-secondary cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Sorting & Batch Actions */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {/* Sort Selector */}
                    <div className="flex items-center gap-1.5 bg-surface border border-line rounded-xl px-2.5 py-1.5 shadow-2xs">
                      <span className="text-ink-muted text-[11px] font-medium">Trier par :</span>
                      <Select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-transparent text-xs font-semibold text-ink focus:outline-none cursor-pointer"
                      >
                        <option value="DEFAULT">Ordre du fichier</option>
                        <option value="STATUS">Statut (Non rattachés d'abord)</option>
                        <option value="DATE">Date Soins</option>
                        <option value="PATIENT">Nom Patient</option>
                        <option value="AMOUNT">Montant Net</option>
                      </Select>
                      {sortBy !== 'DEFAULT' && (
                        <button
                          onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
                          className="text-xs font-bold text-indigo-700 hover:bg-indigo-50 px-1 py-0.5 rounded cursor-pointer"
                          title="Changer le sens du tri"
                        >
                          {sortOrder === 'ASC' ? '↑ ASC' : '↓ DESC'}
                        </button>
                      )}
                    </div>

                    {/* Auto-link batch action */}
                    <button
                      type="button"
                      onClick={handleAutoLinkAllSuggestions}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-2xs transition cursor-pointer"
                      title="Rattacher automatiquement toutes les lignes non rattachées disposant d'une suggestion de candidat"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Rattacher les suggestions</span>
                    </button>
                  </div>
                </div>

                {/* Legend & Filter Chips with counts & selection shortcuts */}
                <div className="border-t border-line/80 pt-2 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-ink text-xs">
                      <Tag className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Filtres par statut de comparaison :</span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-ink-faint font-medium">Cocher rapides :</span>
                      <button
                        onClick={() => handleSelectByStatus('ALL')}
                        className="text-indigo-700 font-semibold hover:underline cursor-pointer"
                      >
                        Tous
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        onClick={() => handleSelectByStatus('LINKED')}
                        className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                      >
                        Rattachés
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        onClick={() => handleSelectByStatus('UNLINKED')}
                        className="text-amber-700 font-semibold hover:underline cursor-pointer"
                      >
                        Non rattachés
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        onClick={() => handleToggleSelectAll(false)}
                        className="text-ink-muted hover:underline cursor-pointer"
                      >
                        Aucun
                      </button>
                    </div>
                  </div>

                  {/* Filter Chips */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setConfrontFilter('ALL')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        confrontFilter === 'ALL'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-surface text-ink border-line hover:bg-surface-hover'
                      }`}
                    >
                      <span>Tous</span>
                      <span className="bg-surface/20 px-1.5 py-0.2 rounded-full text-[10px]">{confrontStats.total}</span>
                    </button>

                    <button
                      onClick={() => setConfrontFilter('PERFECT')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        confrontFilter === 'PERFECT'
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Même Date & Même Montant</span>
                      <span className="bg-emerald-200/70 text-emerald-900 px-1.5 py-0.2 rounded-full text-[10px] font-bold">{confrontStats.perfect}</span>
                    </button>

                    <button
                      onClick={() => setConfrontFilter('SAME_DATE')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        confrontFilter === 'SAME_DATE'
                          ? 'bg-sky-700 text-white border-sky-700 shadow-2xs'
                          : 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                      <span>Même Date (Montant diff.)</span>
                      <span className="bg-sky-200/70 text-sky-900 px-1.5 py-0.2 rounded-full text-[10px] font-bold">{confrontStats.sameDate}</span>
                    </button>

                    <button
                      onClick={() => setConfrontFilter('SAME_AMOUNT')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        confrontFilter === 'SAME_AMOUNT'
                          ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                          : 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                      <span>Même Montant (Date diff.)</span>
                      <span className="bg-purple-200/70 text-purple-900 px-1.5 py-0.2 rounded-full text-[10px] font-bold">{confrontStats.sameAmount}</span>
                    </button>

                    <button
                      onClick={() => setConfrontFilter('VERIFY')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        confrontFilter === 'VERIFY'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                          : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>À Vérifier (Écarts)</span>
                      <span className="bg-amber-200/70 text-amber-900 px-1.5 py-0.2 rounded-full text-[10px] font-bold">{confrontStats.verify}</span>
                    </button>

                    <button
                      onClick={() => setConfrontFilter('UNLINKED')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        confrontFilter === 'UNLINKED'
                          ? 'bg-slate-700 text-white border-slate-700 shadow-2xs'
                          : 'bg-surface-hover text-ink border-line-strong hover:bg-surface-active'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      <span>Non Rattachés (Créer)</span>
                      <span className="bg-surface-active text-ink px-1.5 py-0.2 rounded-full text-[10px] font-bold">{confrontStats.unlinked}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Table of settlement lines with live act attachment & color-coding */}
              <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-muted text-[11px] font-semibold text-ink-secondary border-b border-line">
                    <tr>
                      <th className="py-2 px-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedRows.length === rows.length}
                          onChange={(e) => handleToggleSelectAll(e.target.checked)}
                          className="rounded text-indigo-600"
                        />
                      </th>
                      <th className="py-2 px-3">Date Soins</th>
                      <th className="py-2 px-3">Adhérent & Matricule</th>
                      <th className="py-2 px-3" title={`Montant_Reclame_Brut lu dans l'importation : c'est la base de comparaison avec le montant sans TM de l'acte prescrit`}>
                        Acte Règlement (Montant_Reclame_Brut)
                      </th>
                      <th className="py-2 px-3 min-w-[320px]" title={`Confrontation : ${MONTANT_ACTE_LABEL} (total de l'acte − ticket modérateur) contre ${MONTANT_IMPORT_LABEL}`}>
                        Acte Prescrit Rattaché (Confrontation sans TM)
                      </th>
                      <th className="py-2 px-3 text-right">Net Réglé</th>
                      <th className="py-2 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300 border-t border-line-strong">
                    {displayedRows.map((row) => {
                      const matched = row.matchedCandidate;
                      const confront = getConfrontationDetails(row.dateSoins, row.montantBrut, row.netAPayer, matched, row.participation, row.nomPrenom);
                      const nameNeedsReview = confront.isPartialName || confront.isDifferentName;
                      const baseNameClass = confront.isSameName
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : confront.isPartialName
                        ? 'bg-amber-200 text-amber-950 border-amber-400 ring-2 ring-amber-100'
                        : 'bg-rose-100 text-rose-900 border-rose-300';

                      return (
                        <tr
                          key={row.rowId}
                          className={`hover:bg-surface-muted/80 transition ${confront.rowBorderClass} ${
                            row.selected ? '' : 'opacity-60 bg-surface-muted/50'
                          }`}
                        >
                          <td className="py-2 px-3">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() => handleToggleSelectRow(row.rowId)}
                              className="rounded text-indigo-600"
                            />
                          </td>
                          
                          {/* Date Soins */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="font-mono text-xs font-bold text-ink">
                              {formatDate(row.dateSoins)}
                            </div>
                          </td>

                          {/* Adherent / Patient */}
                          <td className="py-2 px-3">
                            <div className="font-bold text-ink-strong text-xs">{row.nomPrenom}</div>
                            <div className="text-[11px] text-ink-secondary font-mono flex items-center gap-1.5 flex-wrap mt-0.5">
                              {isRealMatricule(row.matricule) ? (
                                (() => {
                                  const normNom = (row.nomPrenom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                                  const candPerId = matched?.personneId;
                                  const existing = personnes.find(p => (candPerId && p.id === candPerId) || (p.matricule && p.matricule.toLowerCase() === row.matricule.toLowerCase()) || p.nomPrenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() === normNom);
                                  
                                  if (existing && existing.matricule.trim().toLowerCase() !== row.matricule.trim().toLowerCase()) {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300" title={`Ancien matricule: ${existing.matricule || 'aucun'} ➔ Mise à jour vers: ${row.matricule}`}>
                                        <span>🔄 Maj Immat :</span>
                                        <span className="font-mono">{row.matricule}</span>
                                      </span>
                                    );
                                  } else if (existing) {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        <span>✓ Immat :</span>
                                        <span className="font-mono">{row.matricule}</span>
                                      </span>
                                    );
                                  } else {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                        <span>✨ Nouveau :</span>
                                        <span className="font-mono">{row.matricule}</span>
                                      </span>
                                    );
                                  }
                                })()
                              ) : (
                                <span className="text-ink-faint text-[10px]">Mat: -</span>
                              )}
                              {row.sousSociete ? <span className="text-ink-muted font-sans">({row.sousSociete})</span> : ''}
                            </div>
                            {row.articlesCount && row.articlesCount > 1 ? (
                              <div className="mt-1">
                                <span 
                                  className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200"
                                  title={row.mergedArticles?.join(' • ') || row.actLibelle}
                                >
                                  📦 {row.articlesCount} articles regroupés
                                </span>
                              </div>
                            ) : null}
                          </td>

                          {/* Acte Decompte (Gross amount without ticket moderator) */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-surface-hover text-ink border border-line">
                              <span>{row.actCode}</span>
                              <span className="text-[10px] text-indigo-700 font-semibold" title={`${MONTANT_IMPORT_LABEL} \u2014 la valeur comparée au ${MONTANT_ACTE_LABEL} de l'acte rattaché`}>Réclamé brut: {formatMoney(row.montantBrut)}</span>
                            </div>
                            <div className="text-[10px] text-ink-muted mt-0.5 truncate max-w-[170px]" title={row.actLibelle}>
                              {row.articlesCount && row.articlesCount > 1 ? `Total: ${row.articlesCount} articles` : row.actLibelle}
                            </div>
                            {row.participation > 0 && (
                              <div className="text-[10px] text-amber-700 font-medium">
                                TM: {formatMoney(row.participation)}
                              </div>
                            )}
                          </td>

                          {/* Matched Prescription Act with Live Comparison & Color Coding */}
                          <td className="py-2 px-3 min-w-[340px]">
                            {matched ? (
                              <div className={`rounded-lg border p-1.5 text-[10.5px] leading-[1.35] space-y-1 shadow-2xs ${confront.cardBorderClass}`}>
                                {/* 1. En-tête compact : Référence Facture & Badge de Statut */}
                                <div className="flex items-center justify-between gap-2 border-b border-line/70 pb-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <FileText className="w-3 h-3 text-indigo-600 shrink-0" />
                                    <span className="font-mono font-bold text-ink-strong truncate" title={`Référence Facture : ${matched.prestationNum}`}>
                                      {matched.prestationNum ? `Facture N° ${matched.prestationNum}` : 'Facture en Base'}
                                    </span>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border shrink-0 ${confront.badgeClass}`}>
                                    {confront.type === 'PERFECT' && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700" />}
                                    {confront.type === 'SAME_DATE' && <CalendarCheck className="w-2.5 h-2.5 text-sky-700" />}
                                    {confront.type === 'SAME_AMOUNT' && <Tag className="w-2.5 h-2.5 text-purple-700" />}
                                    {confront.type === 'VERIFY' && <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />}
                                    <span className="whitespace-nowrap">{confront.label}</span>
                                  </span>
                                </div>

                                {/* 2. Acte + nom base + alerte nom + entreprise : une seule ligne */}
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0" title={matched.libelleActe}>
                                    {matched.codeActe}
                                  </span>
                                  <span className="font-semibold text-ink truncate max-w-[150px]" title={matched.libelleActe}>
                                    {matched.libelleActe}
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold ${baseNameClass}`}
                                    title={`Nom dans la facture en base : ${matched.personneNom} — Nom du décompte : ${row.nomPrenom}`}
                                  >
                                    <User className="w-2.5 h-2.5" />
                                    <span className="truncate max-w-[130px]">{matched.personneNom}</span>
                                  </span>
                                  {nameNeedsReview && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 border border-amber-400 text-[9px] font-bold shrink-0" title={`Nom du décompte : ${row.nomPrenom}`}>
                                      <AlertTriangle className="w-2.5 h-2.5" />
                                      {confront.isPartialName ? 'Nom partiel. similaire' : 'Nom différent'}
                                    </span>
                                  )}
                                  {matched.sousSociete && (
                                    <span className="text-[9px] text-ink-muted font-medium truncate max-w-[130px]" title={`Entreprise : ${matched.sousSociete}`}>
                                      • {matched.sousSociete}
                                    </span>
                                  )}
                                </div>

                                {/* 3. Comparatif compact 2 colonnes (une ligne chacune) */}
                                <div className="grid grid-cols-2 gap-1.5 rounded border border-line/80 bg-surface/95 px-1.5 py-1 text-[9.5px]">
                                  <div className="min-w-0">
                                    <span className="text-[8px] uppercase tracking-wider text-ink-faint font-bold block leading-none">Décompte Excel</span>
                                    <div className="text-ink truncate" title={`Décompte Excel — ${formatDate(row.dateSoins)} — Brut ${formatMoney(row.montantBrut)}${row.participation > 0 ? ` — TM ${formatMoney(row.participation)}` : ''}`}>
                                      {formatDate(row.dateSoins)} • <strong>Brut {formatMoney(row.montantBrut)}</strong>
                                      {row.participation > 0 && <span className="text-amber-700"> • TM -{formatMoney(row.participation)}</span>}
                                    </div>
                                  </div>
                                  <div className="border-l border-line pl-2 min-w-0">
                                    <span className="text-[8px] uppercase tracking-wider text-ink-faint font-bold block leading-none">Facture en Base</span>
                                    <div
                                      className="text-ink truncate"
                                      title={`Facture en Base — ${formatDate(matched.prestationDate)} — Brut ${formatMoney(matched.montantInitial)} − TM ${formatMoney(matched.ticketModerateur)} = ${MONTANT_ACTE_LABEL} ${formatMoney(confront.montant.montantSansTM)} (à comparer au ${MONTANT_IMPORT_LABEL} ${formatMoney(confront.montant.brutImport)}) — Reste ${formatMoney(matched.resteAPayer)}`}
                                    >
                                      {formatDate(matched.prestationDate)} • <strong>Sans TM {formatMoney(confront.montant.montantSansTM)}</strong> • <span className="text-emerald-700 font-semibold">Reste {formatMoney(matched.resteAPayer)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* 4. Résultat de la comparaison des montants (Montant_Reclame_Brut ↔ montant sans TM) */}
                                {(() => {
                                  const mnt = confront.montant;
                                  const okMontant = mnt.isConforme;
                                  const netOk = !okMontant && confront.isSameMontantNet;
                                  const toneClass = okMontant
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : netOk
                                    ? 'bg-sky-50 text-sky-900 border border-sky-200'
                                    : confront.isSameDate
                                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                    : 'bg-amber-50 text-amber-900 border border-amber-200';
                                  const toneTitle = okMontant
                                    ? `${MONTANT_IMPORT_LABEL} (${formatMoney(mnt.brutImport)}) = ${MONTANT_ACTE_LABEL} (${formatMoney(mnt.montantSansTM)} = Brut ${formatMoney(mnt.brutActe)} − TM ${formatMoney(mnt.tmActe)}).${confront.isSameDate ? ' Dates identiques.' : ` Dates différentes : Décompte ${formatDate(row.dateSoins)} ≠ Facture ${formatDate(matched.prestationDate)}.`}`
                                    : netOk
                                    ? `Le net réglé du décompte (${formatMoney(row.netAPayer)}) correspond au reste à payer de l'acte (${formatMoney(matched.montantARembourser)} / ${formatMoney(matched.resteAPayer)}) — filet de secours, montants hors TM non identiques.`
                                    : confront.isSameDate
                                    ? `Mêmes dates mais ${MONTANT_IMPORT_LABEL} (${formatMoney(mnt.brutImport)}) ≠ ${MONTANT_ACTE_LABEL} (${formatMoney(mnt.montantSansTM)}) → écart ${formatEcartMontant(mnt.ecart)}.`
                                    : `Date Décompte (${formatDate(row.dateSoins)}) ≠ Date Facture (${formatDate(matched.prestationDate)}) et écart de montant ${formatEcartMontant(mnt.ecart)}.`;
                                  return (
                                    <div
                                      className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold truncate ${okMontant || netOk ? '' : 'cursor-help '}${toneClass}`}
                                      title={toneTitle}
                                    >
                                      {okMontant ? (
                                        <>
                                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                          <span>
                                            Montant sans TM conforme : {formatMoney(mnt.brutImport)} = {formatMoney(mnt.montantSansTM)}{confront.isSameDate ? ' • mêmes dates' : ''}.
                                          </span>
                                        </>
                                      ) : netOk ? (
                                        <>
                                          <CheckCircle2 className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                                          <span>Net réglé conforme (secours) — écart hors TM {formatEcartMontant(mnt.ecart)}.</span>
                                        </>
                                      ) : (
                                        <>
                                          <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                          <span>
                                            Écart montant sans TM : import {formatMoney(mnt.brutImport)} ≠ acte {formatMoney(mnt.montantSansTM)} ({formatEcartMontant(mnt.ecart)}).
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : (
                              (() => {
                                const suggestions = getRowSuggestions(row);
                                return (
                                  <div className="space-y-2">
                                    <div className="rounded-xl bg-surface-muted border border-line p-2.5 text-xs flex items-center justify-between shadow-2xs">
                                      <div className="flex items-center gap-1.5 text-ink font-medium">
                                        <AlertCircle className="h-4 w-4 text-ink-faint shrink-0" />
                                        <span>Aucun acte non réglé rattaché</span>
                                      </div>
                                      <span className="text-[10px] font-semibold text-ink bg-surface-active px-2 py-0.5 rounded border border-line-strong">
                                        Nouvelle Prestation
                                      </span>
                                    </div>

                                    {suggestions.length > 0 && (
                                      <div className="rounded-xl bg-indigo-50/90 border border-indigo-200 p-2.5 text-xs space-y-2 shadow-2xs">
                                        <div className="flex items-center justify-between text-[11px] text-indigo-950 font-bold">
                                          <span className="flex items-center gap-1">
                                            <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                                            Suggestion(s) trouvée(s) :
                                          </span>
                                          <span className="text-[10px] text-indigo-700 font-medium">{suggestions.length} acte(s) disponible(s)</span>
                                        </div>
                                        <div className="space-y-1.5">
                                          {suggestions.map((sug) => (
                                            <div key={sug.lignePrestationId} className="flex items-center justify-between gap-2 bg-surface p-2 rounded-lg border border-indigo-100 shadow-2xs text-[11px]">
                                              <div className="min-w-0 flex-1">
                                                <div className="font-extrabold text-ink-strong truncate uppercase tracking-tight">{sug.personneNom}</div>
                                                <div className="text-[10px] text-ink-muted font-medium flex items-center gap-1.5 flex-wrap">
                                                  <span className="font-mono bg-surface-hover px-1 py-0.2 rounded text-ink">{sug.codeActe}</span>
                                                  <span>• Sans TM: {formatMoney(computeMontantConfrontation(row.montantBrut || row.netAPayer, sug).montantSansTM)}</span>
                                                  {(() => {
                                                    const sugMnt = computeMontantConfrontation(row.montantBrut || row.netAPayer, sug);
                                                    return (
                                                      <span
                                                        className={`font-bold ${sugMnt.isConforme ? 'text-emerald-700' : 'text-amber-700'}`}
                                                        title={`Comparaison ${MONTANT_IMPORT_LABEL} vs ${MONTANT_ACTE_LABEL}`}
                                                      >
                                                        • {sugMnt.isConforme ? 'montant conforme' : `écart ${formatEcartMontant(sugMnt.ecart)}`}
                                                      </span>
                                                    );
                                                  })()}
                                                  <span>• {formatDate(sug.prestationDate)}</span>
                                                </div>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => handleAssignCandidate(row.rowId, sug)}
                                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] shrink-0 transition shadow-2xs cursor-pointer flex items-center gap-1"
                                                title="Lier cet acte en 1 clic"
                                              >
                                                <Link2 className="w-3 h-3" />
                                                Lier 1-Clic
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()
                            )}
                          </td>

                          {/* Net Regle */}
                          <td className="py-2 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                            {formatMoney(row.netAPayer)}
                          </td>

                          {/* Action : rechercher / changer, et délier un acte déjà rattaché */}
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                              <button
                                onClick={() => {
                                  setActResultFilter('ALL');
                                  // Depuis une ligne déjà rattachée, on ouvre directement sur le classement par écart de montant
                                  setActSortMode(matched ? 'MONTANT_ASC' : 'DATE_ASC');
                                  setSearchingRowId(row.rowId);
                                  const firstWord = (row.nomPrenom || '').trim().split(/\s+/)[0] || '';
                                  setActSearchQuery(firstWord || row.matricule || '');
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition shadow-2xs cursor-pointer"
                                title={matched ? "Changer l'acte rattaché (trié par écart de montant sans TM)" : 'Rechercher un acte à rattacher'}
                              >
                                <Search className="h-3 w-3" />
                                <span>{matched ? 'Changer' : 'Lier'}</span>
                              </button>
                              {matched && (
                                <button
                                  onClick={() => handleUnlinkRow(row.rowId)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition shadow-2xs cursor-pointer"
                                  title={`Délier l'acte prescrit déjà rattaché à cette ligne (la ligne redevient « Non rattaché »)`}
                                >
                                  <Unlink className="h-3 w-3" />
                                  <span>Délier</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Actions de pied de tableau : déliement global des actes déjà rattachés */}
              <div className="flex justify-between items-center gap-2 text-xs text-ink-muted pt-2 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span>
                    Affichage de <strong className="text-ink">{displayedRows.length}</strong> sur <strong>{rows.length}</strong> lignes
                  </span>
                  {confrontStats.linkedCount > 0 && (
                    <button
                      onClick={handleUnlinkAllRows}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition cursor-pointer"
                      title={`Retirer le rattachement des ${confrontStats.linkedCount} ligne(s) déjà liée(s) à un acte prescrit`}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      <span>Délier les {confrontStats.linkedCount} acte(s) déjà rattaché(s)</span>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setParsedDoc(null);
                    setRows([]);
                  }}
                  className="text-xs text-ink-muted hover:text-ink hover:underline cursor-pointer"
                >
                  Charger un autre décompte
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-line px-6 py-4 bg-surface-muted/70 rounded-b-2xl">
          <div>
            {parsedDoc && (
              <div className="text-xs text-ink-secondary">
                <strong className="text-ink-strong font-bold">{selectedRows.length}</strong> lignes à régler •{' '}
                Total règlement net : <strong className="text-emerald-700 font-bold">{formatMoney(totalSelectedPaye)}</strong>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {parsedDoc && (
              <button
                onClick={handleResetAndBack}
                className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-surface-muted transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Retour</span>
              </button>
            )}
            <button
              onClick={handleClose}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-surface-muted transition cursor-pointer"
            >
              Annuler
            </button>
            {parsedDoc && (
              <button
                onClick={handleValidateAndSave}
                disabled={selectedRows.length === 0 || isExactDuplicate}
                className={`rounded-xl px-5 py-2 text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer ${
                  isExactDuplicate
                    ? 'bg-rose-600 text-white hover:bg-rose-500 opacity-60 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50'
                }`}
                title={isExactDuplicate ? `Doublon strict détecté (Même référence, même date et même montant de ${formatMoney(exactAmountDuplicates[0]?.totalPaye || 0)})` : undefined}
              >
                {isExactDuplicate ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                <span>
                  {isExactDuplicate 
                    ? 'Doublon Strict (Même Réf., Date & Montant)' 
                    : fileQueue.length > 1 
                    ? `Valider et Enregistrer (${currentFileIndex + 1}/${fileQueue.length})` 
                    : 'Valider et Enregistrer le Règlement'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Manual Search & Act Matching Sub-Modal */}
      {searchingRowId && activeSearchingRow && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs font-sans antialiased">
          <div className="relative w-full max-w-5xl rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-line animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-surface shrink-0">
              <div className="min-w-0">
                <h4 className="text-base font-bold text-ink-strong flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-indigo-600 shrink-0" />
                  <span>Rattacher un acte prescrit à cette ligne de règlement</span>
                </h4>
                <p className="text-sm text-ink-muted mt-1">
                  Pour : <strong className="text-ink">{activeSearchingRow.nomPrenom}</strong> (Mat: {activeSearchingRow.matricule || '-'}) • Date Soins : <strong>{formatDate(activeSearchingRow.dateSoins)}</strong> • {MONTANT_IMPORT_LABEL} : <strong className="text-ink-strong">{formatMoney(activeSearchingRow.montantBrut)}</strong>
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
                onClick={() => setSearchingRowId(null)}
                className="rounded-lg p-1 text-ink-faint hover:bg-surface-hover hover:text-ink-secondary transition cursor-pointer shrink-0 ml-4"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

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
                      title={`Actes dont le montant sans TM (total de l'acte − ticket modérateur) égale le ${MONTANT_IMPORT_LABEL} de cette ligne (${formatMoney(activeSearchingRow.montantBrut || activeSearchingRow.netAPayer)})`}
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

                {/* Quick filter chips */}
                <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
                  <span className="text-ink-muted font-semibold">Filtres rapides :</span>
                  {(() => {
                    const nameParts = (activeSearchingRow.nomPrenom || '').trim().split(/\s+/).filter(Boolean);
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
                        ? `Aucun acte ne correspond au filtre « ${
                            { PERFECT: 'Même date & montant sans TM', SAME_DATE: 'Même date', SAME_AMOUNT: 'Même montant sans TM', VERIFY: 'À vérifier' }[actResultFilter]
                          } » parmi les ${filteredSearchCandidates.length} résultat(s) de la recherche.`
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
                    const compDetails = getConfrontationDetails(activeSearchingRow.dateSoins, activeSearchingRow.montantBrut, activeSearchingRow.netAPayer, cand, activeSearchingRow.participation, activeSearchingRow.nomPrenom);
                    // Résultat de la comparaison « Montant_Reclame_Brut (import) ↔ montant sans TM (acte) »
                    const mnt = compDetails.montant;
                    const isCurrentlyLinked = activeSearchingRow.matchedCandidate?.lignePrestationId === cand.lignePrestationId;
                    const isLinkedToOtherRow = !isCurrentlyLinked && rows.some(
                      r => r.rowId !== activeSearchingRow.rowId && r.matchedCandidate?.lignePrestationId === cand.lignePrestationId
                    );

                    return (
                      <div
                        key={cand.lignePrestationId}
                        className={`p-4 sm:p-5 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-sm ${
                          isCurrentlyLinked
                            ? 'bg-emerald-50/70 hover:bg-emerald-50 ring-1 ring-emerald-300 border-l-4 border-l-emerald-600'
                            : compDetails.type === 'PERFECT'
                            ? 'bg-emerald-50/40 hover:bg-emerald-50/70 border-l-4 border-l-emerald-500'
                            : compDetails.type === 'SAME_DATE'
                            ? 'bg-sky-50/30 hover:bg-sky-50/60 border-l-4 border-l-sky-500'
                            : compDetails.type === 'SAME_AMOUNT'
                            ? 'bg-purple-50/30 hover:bg-purple-50/60 border-l-4 border-l-purple-500'
                            : 'hover:bg-indigo-50/40'
                        }`}
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
                                <Link2 className="w-3 h-3" /> Acte déjà rattaché à cette ligne
                              </span>
                            )}
                            {isLinkedToOtherRow && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface-hover px-2 py-0.5 text-[11px] font-semibold text-ink" title="Cet acte est déjà rattaché à une autre ligne du décompte">
                                Déjà rattaché à une autre ligne
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

                          {/* 3. RÉSULTAT DE LA COMPARAISON DES MONTANTS (base du tri par pertinence) */}
                          <div className="rounded-lg border border-line/80 bg-surface-muted p-2.5 space-y-1.5">
                            <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 text-xs">
                              <span title={`Colonne « Montant_Reclame_Brut » lue dans le fichier importé`}>
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
                              <span>À Rembourser: <strong className="text-indigo-700 font-mono">{formatMoney(cand.montantARembourser)}</strong></span>
                              <span>Déjà Réglé: <strong className="text-emerald-700 font-mono">{formatMoney(cand.dejaPaye)}</strong></span>
                              <span title="Score de proximité utilisé par le tri (100 = montant sans TM conforme)">
                                Pertinence montant : <strong className={`font-mono ${mnt.ecartTextClass}`}>{compDetails.montantRank}/100</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right column: Reste a payer & Action (rattacher / délier) */}
                        <div className="flex lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-2.5 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-line-soft lg:pl-4 lg:border-l lg:min-w-[210px]">
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
                                  onClick={() => handleUnlinkRow(activeSearchingRow.rowId, true)}
                                  className="rounded-xl border border-rose-300 bg-surface px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                                  title="Délier cet acte prescrit de la ligne de règlement (la ligne redevient « Non rattaché »)"
                                >
                                  <Unlink className="w-4 h-4" />
                                  <span>Délier cet acte</span>
                                </button>
                                <button
                                  onClick={() => setSearchingRowId(null)}
                                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Garder ce rattachement</span>
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleAssignCandidate(activeSearchingRow.rowId, cand)}
                                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 transition shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                              >
                                <Link2 className="w-4 h-4" />
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

              {/* Délier l'acte déjà rattaché / créer une nouvelle prestation */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-line-soft flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {activeSearchingRow.matchedCandidate && (
                    <button
                      onClick={() => handleUnlinkRow(activeSearchingRow.rowId)}
                      className="inline-flex items-center gap-1.5 text-sm text-rose-700 hover:text-rose-800 font-semibold px-4 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 transition cursor-pointer"
                      title={`Délier « ${activeSearchingRow.matchedCandidate.personneNom} • ${activeSearchingRow.matchedCandidate.codeActe} » sans créer de nouvelle prestation`}
                    >
                      <Unlink className="h-4 w-4" />
                      <span>Délier l'acte déjà rattaché</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleAssignCandidate(activeSearchingRow.rowId, null)}
                    className="inline-flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-800 font-semibold px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition cursor-pointer"
                  >
                    <Unlink className="h-4 w-4" />
                    <span>Ne pas rattacher (Créer une nouvelle prestation au vol)</span>
                  </button>
                </div>
                <button
                  onClick={() => setSearchingRowId(null)}
                  className="rounded-xl border border-line-strong bg-surface px-5 py-2.5 text-sm font-bold text-ink hover:bg-surface-hover transition cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Confirmation Modal for Missing Society */}
      {/* Modal d'Alerte : Société Inexistante dans la Base */}
      {missingSocPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl border border-line space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-strong">Société non répertoriée</h3>
                <p className="text-xs font-semibold text-rose-600">Création automatique interdite</p>
              </div>
            </div>

            <div className="rounded-xl bg-rose-50/80 p-4 border border-rose-200 text-xs sm:text-sm text-ink leading-relaxed space-y-2">
              <p>
                La société ou l'organisme payeur <strong className="font-bold text-rose-950">« {missingSocPrompt.socName} »</strong> figurant sur ce décompte n'existe pas dans la base de données.
              </p>
              <p className="text-xs text-ink-secondary">
                <strong>Information :</strong> Aucune nouvelle société ne peut être créée automatiquement lors d'une importation. Veuillez d'abord enregistrer cette société dans le paramétrage de l'application, ou sélectionner ci-dessous une société existante à laquelle rattacher ce décompte.
              </p>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-bold text-ink">Rattacher à une société existante (optionnel) :</label>
              <Select
                value={selectedOverrideSocId}
                onChange={(e) => setSelectedOverrideSocId(e.target.value)}
                className="w-full bg-surface text-xs font-semibold rounded-xl p-2.5 border border-line-strong focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">-- Choisir une société existante --</option>
                {societes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom} ({s.code})
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {selectedOverrideSocId && (
                <button
                  type="button"
                  onClick={() => {
                    const socId = selectedOverrideSocId;
                    setMissingSocPrompt(null);
                    setSelectedOverrideSocId('');
                    executeValidateAndSave(socId);
                  }}
                  className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition focus:outline-none cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Rattacher et enregistrer le décompte
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMissingSocPrompt(null);
                  setSelectedOverrideSocId('');
                }}
                className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-surface-hover px-4 py-2.5 text-xs font-semibold text-ink hover:bg-surface-active transition focus:outline-none cursor-pointer"
              >
                <X className="h-4 w-4" />
                Fermer / Annuler l'importation
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirmation Modal for Unlinked Acts */}
      {showUnlinkedConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl border border-line space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-strong">Actes non rattachés détectés</h3>
                <p className="text-xs text-ink-muted">Avertissement avant validation du règlement</p>
              </div>
            </div>

            <div className="rounded-xl bg-amber-50/70 p-4 border border-amber-200/80 text-xs sm:text-sm text-ink leading-relaxed space-y-2">
              <p>
                Il y a <strong className="font-bold text-amber-900">{selectedRows.filter(r => !r.matchedCandidate).length} acte(s) non relié(s)</strong> à une prescription ou facture existante dans votre sélection (sur un total de {selectedRows.length} actes sélectionnés).
              </p>
              <p className="text-xs text-ink-secondary">
                Si vous continuez, ces lignes seront enregistrées dans le règlement en tant qu'actes autonomes (créant des prestations enregistrées au vol), et vous pourrez toujours les consulter et les filtrer sous <em>« Non reliés »</em> dans la vue des Règlements.
              </p>
              <p className="text-xs font-semibold text-ink">
                Souhaitez-vous quand même valider et continuer l'importation ?
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowUnlinkedConfirmModal(false);
                  executeValidateAndSave();
                }}
                className="flex-1 inline-flex justify-center items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition focus:outline-none cursor-pointer"
              >
                <Check className="h-4 w-4" />
                Continuer et enregistrer
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnlinkedConfirmModal(false);
                  setConfrontFilter('UNLINKED');
                }}
                className="inline-flex justify-center items-center gap-2 rounded-xl bg-amber-100 px-4 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-200 transition focus:outline-none cursor-pointer"
                title="Afficher uniquement les actes non reliés pour les vérifier et les lier"
              >
                <Unlink className="h-4 w-4" />
                Vérifier les non reliés
              </button>
              <button
                type="button"
                onClick={() => setShowUnlinkedConfirmModal(false)}
                className="inline-flex justify-center items-center gap-2 rounded-xl bg-surface-hover px-4 py-2.5 text-xs font-semibold text-ink hover:bg-surface-active transition focus:outline-none cursor-pointer"
              >
                <X className="h-4 w-4" />
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
