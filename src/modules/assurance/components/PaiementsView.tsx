import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Receipt, 
  Eye, 
  Trash2, 
  CheckCircle2, 
  Download, 
  X, 
  Check, 
  Building, 
  Calendar,
  AlertCircle,
  AlertTriangle,
  CalendarCheck,
  Tag,
  Sparkles,
  Link2,
  Unlink,
  FileCheck2,
  Printer,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  RotateCcw,
  Filter,
  Layers,
  Users,
  Boxes,
  FileText
} from 'lucide-react';
import { Paiement, LignePaiement, Prestation, Societe, Personne, Famille } from '../types';
import { formatMoney, formatDate, formatDateTime, generateId, getCurrentTimestamp } from '../utils/formatters';
import { maskNom } from '../utils/inputMasks';
import { calculateRecouvrementData, generateRecouvrementPdf } from '../utils/recouvrementPdf';
import { repartirActe } from '../utils/societeExclusions';
import { DecompteImportModal } from './DecompteImportModal';
import { RelierPaiementModal } from './paiements/RelierPaiementModal';
import { SaisieReglementModal } from './paiements/SaisieReglementModal';
import * as XLSX from 'xlsx';
import { Select } from '../../../components/Select';

type PaiementSortField = 'datePaiement' | 'dateSaisie' | 'numeroBordereau' | 'societe' | 'modePaiement' | 'totalReclame' | 'totalPaye' | 'totalModerateur' | 'totalExclu' | 'statut';
type GroupSortField = 'dateSoins' | 'nomAgent' | 'codeActe' | 'societe' | 'totalReclame' | 'totalPaye' | 'ticketModerateur' | 'totalExclu' | 'nombreLignes';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'bordereaux' | 'groupes_actes';

export interface GroupedPaymentAct {
  groupKey: string;
  nomAgent: string;
  immatriculation: string;
  dateSoins: string;
  codeActe: string;
  libelleActe: string;
  societeNom: string;
  societeId: string;
  bordereaux: Array<{
    paiementId: string;
    numeroBordereau: string;
    datePaiement: string;
    dateSaisie: string;
    modePaiement: string;
    referencePaiement: string;
  }>;
  prestationsNumeros: string[];
  totalReclame: number;
  totalPaye: number;
  ticketModerateur: number;
  totalExclu: number;
  nombreLignes: number;
  lignes: Array<{
    ligneId: string;
    paiementId: string;
    numeroBordereau: string;
    datePaiement: string;
    dateSaisie: string;
    dateSoins?: string;
    prestationNumero?: string;
    montantReclame?: number;
    ticketModerateur?: number;
    totalPaye: number;
    montantExclu: number;
    codeActe?: string;
    libelleActe?: string;
    actesPayes?: Array<{ code: string; libelle: string; montant: number }>;
    commentaire?: string;
  }>;
}

interface PaiementsViewProps {
  paiements: Paiement[];
  prestations: Prestation[];
  societes: Societe[];
  personnes: Personne[];
  familles: Famille[];
  selectedSocieteId: string;
  onSavePaiement: (paiement: Paiement, updatedPrestations: Prestation[]) => void;
  onDeletePaiement: (id: string) => void;
  onImportPaiements?: (newPaiement: Paiement, updatedPrestations: Prestation[], newSocietes?: Societe[], newPersonnes?: Personne[]) => void;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
}

export const PaiementsView: React.FC<PaiementsViewProps> = ({
  paiements,
  prestations,
  societes,
  personnes,
  familles,
  selectedSocieteId,
  onSavePaiement,
  onDeletePaiement,
  onImportPaiements,
  isCreateModalOpen,
  setIsCreateModalOpen,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('bordereaux');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedGroupRows, setExpandedGroupRows] = useState<Record<string, boolean>>({});
  const [groupLinesInBordereau, setGroupLinesInBordereau] = useState<boolean>(true);
  const [viewingPaiement, setViewingPaiement] = useState<Paiement | null>(null);
  const [paiementToDelete, setPaiementToDelete] = useState<Paiement | null>(null);
  const [isDecompteModalOpen, setIsDecompteModalOpen] = useState<boolean>(false);

  // Sorting state for bordereaux
  const [sortField, setSortField] = useState<PaiementSortField>('datePaiement');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Sorting state for grouped view (Patient + Date + Actes)
  const [groupSortField, setGroupSortField] = useState<GroupSortField>('dateSoins');
  const [groupSortDirection, setGroupSortDirection] = useState<SortDirection>('desc');

  // Multi-criteria filters state
  const [filterSocieteId, setFilterSocieteId] = useState<string>('ALL');
  const [filterMode, setFilterMode] = useState<string>('ALL');
  const [filterStatut, setFilterStatut] = useState<string>('ALL');
  const [filterExclusion, setFilterExclusion] = useState<'ALL' | 'AVEC_EXCLUSION' | 'SANS_EXCLUSION'>('ALL');
  const [filterLiaison, setFilterLiaison] = useState<'ALL' | 'NON_RELIE' | 'RELIE'>('ALL');
  const [dateDebut, setDateDebut] = useState<string>('');
  const [dateFin, setDateFin] = useState<string>('');
  const [dateFilterField, setDateFilterField] = useState<'datePaiement' | 'dateSaisie'>('datePaiement');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  // Modal context for linking unlinked payment lines
  const [relierModalContext, setRelierModalContext] = useState<{ paiement: Paiement; lignePaiement: LignePaiement } | null>(null);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleGroupRow = (key: string) => {
    setExpandedGroupRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getSocieteNom = (id: string) => societes.find(s => s.id === id)?.nom || 'Société';

  /**
   * Délie une ligne de règlement déjà rattachée à une facture de soins :
   * les références de la prescription sont effacées de la ligne (le paiement et
   * les totaux sont conservés), puis la base est recalculée par onSavePaiement.
   */
  const handleUnlinkLigne = (paiement: Paiement, ligne: LignePaiement) => {
    if (!paiement || !ligne) return;
    const libelle = `${ligne.nomAgent || ligne.nomBaseAssurance || 'cette ligne'} • ${ligne.prestationNumero || 'facture rattachée'}`;
    if (!window.confirm(`Délier le rattachement de ${libelle} ?\n\nLe règlement reste enregistré, seul le lien vers la facture de soins est retiré.`)) {
      return;
    }

    const updatedLignes = (paiement.lignes || []).map(l => (l.id === ligne.id
      ? { ...l, prestationId: '', prestationNumero: '', lignePrestationId: '' }
      : l));

    onSavePaiement({ ...paiement, lignes: updatedLignes }, []);
  };

  // Memoized Lookup of all medical acts and prescriptions for confrontation / manual reconciliation
  const prestationActsLookup = useMemo(() => {
    const list: Array<{
      prestationId: string;
      numeroFacture: string;
      date: string;
      nomAgent?: string;
      matricule?: string;
      societeId?: string;
      montantBrut: number;
      montantARembourser: number;
      codeActe?: string;
      libelleActe?: string;
    }> = [];

    (prestations || []).forEach(p => {
      const pTot = p.montantTotal ?? p.totalPrestation ?? 0;
      const pRemb = p.montantARembourser ?? Math.max(0, pTot - (p.ticketModerateur ?? p.participation ?? 0));
      const pDate = p.date ? p.date.split('T')[0] : '';
      list.push({
        prestationId: p.id,
        numeroFacture: p.numeroFacture,
        date: pDate,
        nomAgent: p.nomAgent,
        matricule: p.matricule,
        societeId: p.societeId,
        montantBrut: pTot,
        montantARembourser: pRemb,
      });

      (p.lignes || []).forEach(l => {
        const lBrut = l.totalPrestation || 0;
        const lRemb = l.montantARembourser ?? Math.max(0, lBrut - (l.ticketModerateur || 0));
        list.push({
          prestationId: p.id,
          numeroFacture: p.numeroFacture,
          date: pDate,
          nomAgent: p.nomAgent,
          matricule: p.matricule,
          societeId: p.societeId,
          montantBrut: lBrut,
          montantARembourser: lRemb,
          codeActe: l.code,
          libelleActe: l.libelle,
        });
      });
    });

    return list;
  }, [prestations]);

  // Helper to get normalized signature of lines in a payment
  const getPaiementLinesSignature = (lines: LignePaiement[] | undefined) => {
    if (!lines || lines.length === 0) return [];
    return lines.map(l => {
      const nom = (l.nomAgent || l.nomBaseAssurance || '').trim().toLowerCase();
      const matricule = (l.immatriculation || '').trim().toLowerCase();
      const dateSoins = (l.dateSoins || '').split('T')[0];
      const paye = Math.round(Number(l.totalPaye || l.montantPaye || 0));
      const code = (l.codeActe || (l.actesPayes && l.actesPayes[0]?.code) || '').trim().toLowerCase();
      const numFact = (l.prestationNumero || '').trim().toLowerCase();
      return `${nom}|${matricule}|${dateSoins}|${code}|${paye}|${numFact}`;
    }).sort();
  };

  // Reconciliation and detailed duplicate analysis for a payment
  const getPaiementReconciliationInfo = (p: Paiement) => {
    const pDate = p.datePaiement ? p.datePaiement.split('T')[0] : '';
    const pPaye = p.totalPaye || 0;
    const pReclame = p.totalReclame || 0;
    const pLines = p.lignes || [];

    // Check if any payment line or total matches a prestation on date, agent name or amount
    const matchingPrestations = prestationActsLookup.filter(pa => {
      const matchDate = (pa.date && pa.date === pDate) || (pLines.some(l => l.dateSoins && l.dateSoins.split('T')[0] === pa.date));
      const matchAgent = pa.nomAgent && pLines.some(l => {
        const nomL = (l.nomAgent || l.nomBaseAssurance || '').trim().toLowerCase();
        return nomL && pa.nomAgent!.toLowerCase().includes(nomL);
      });
      const matchAmount = Math.abs(pa.montantBrut - pReclame) < 1 || 
                          Math.abs(pa.montantARembourser - pPaye) < 1 || 
                          Math.abs(pa.montantBrut - pPaye) < 1 ||
                          (pLines.some(l => Math.abs(pa.montantBrut - (l.montantReclame || l.totalPaye)) < 1 || Math.abs(pa.montantARembourser - l.totalPaye) < 1));
      return (matchDate || matchAgent) && matchAmount;
    });

    // Check duplicate payments:
    // STRICT RULE: Duplicate detection MUST compare BOTH the exact payment date AND the payment amount.
    // Two payments can ONLY be duplicates if they share the exact same payment date AND identical amounts (or line amounts).
    const currentLinesSig = getPaiementLinesSignature(pLines);

    const duplicatePayments = paiements.filter(other => {
      if (other.id === p.id) return false;
      
      const oDate = other.datePaiement ? other.datePaiement.split('T')[0] : '';
      const oLines = other.lignes || [];

      // 1. Mandatory Date Check: Both must have dates and they must be identical
      if (!pDate || !oDate || pDate !== oDate) {
        return false;
      }

      // 2. Mandatory Society Check
      const sameSociete = !p.societeId || !other.societeId || p.societeId === other.societeId;
      if (!sameSociete) return false;

      // 3. Mandatory Amount Check
      const sameTotalAmount = Math.abs((other.totalPaye || 0) - pPaye) < 1;

      const cleanBord = (s?: string) => (s || '').replace(/[\s\-_.\/]/g, '').toLowerCase();
      const sameBordereauNum = Boolean(
        cleanBord(p.numeroBordereau) && 
        cleanBord(other.numeroBordereau) && 
        cleanBord(p.numeroBordereau) === cleanBord(other.numeroBordereau)
      );

      const sameRef = Boolean(
        cleanBord(p.referencePaiement) && 
        cleanBord(other.referencePaiement) && 
        cleanBord(p.referencePaiement) === cleanBord(other.referencePaiement)
      );

      // 4. Check detailed line matching:
      if (pLines.length > 0 && oLines.length > 0) {
        const otherLinesSig = getPaiementLinesSignature(oLines);
        
        // Exact signature match
        const isExactLinesMatch = currentLinesSig.length === otherLinesSig.length && 
          currentLinesSig.every((sig, idx) => sig === otherLinesSig[idx]);

        // Check overlapping lines with same patient + dateSoins + code + amount
        const matchingLinesCount = pLines.filter(l1 => {
          const nom1 = (l1.nomAgent || l1.nomBaseAssurance || '').trim().toLowerCase();
          const d1 = (l1.dateSoins || '').split('T')[0];
          const pay1 = Math.round(Number(l1.totalPaye || l1.montantPaye || 0));
          const code1 = (l1.codeActe || (l1.actesPayes && l1.actesPayes[0]?.code) || '').trim().toLowerCase();

          return oLines.some(l2 => {
            const nom2 = (l2.nomAgent || l2.nomBaseAssurance || '').trim().toLowerCase();
            const d2 = (l2.dateSoins || '').split('T')[0];
            const pay2 = Math.round(Number(l2.totalPaye || l2.montantPaye || 0));
            const code2 = (l2.codeActe || (l2.actesPayes && l2.actesPayes[0]?.code) || '').trim().toLowerCase();

            const matchNom = nom1 && nom2 && (nom1 === nom2 || nom1.includes(nom2) || nom2.includes(nom1));
            const matchDateSoins = !d1 || !d2 || d1 === d2;
            const matchMontant = Math.abs(pay1 - pay2) < 1;
            const matchCode = !code1 || !code2 || code1 === code2;

            return matchNom && matchDateSoins && matchMontant && matchCode;
          });
        }).length;

        const hasHighOverlap = matchingLinesCount >= Math.min(pLines.length, oLines.length) && matchingLinesCount > 0;

        return (isExactLinesMatch && sameTotalAmount) || 
               (hasHighOverlap && sameTotalAmount) ||
               (sameBordereauNum && sameTotalAmount) ||
               (sameRef && sameTotalAmount);
      }

      // If one of the payments has no lines, require exact same date + same total amount + (same bordereau OR same reference)
      return sameTotalAmount && (sameBordereauNum || sameRef);
    });

    const hasMatch = matchingPrestations.length > 0;
    const hasDuplicate = duplicatePayments.length > 0;

    return {
      hasMatch,
      matchingPrestations,
      hasDuplicate,
      duplicatePayments,
      isReconciled: hasMatch || hasDuplicate,
    };
  };

  const getLignePaiementMatchInfo = (l: LignePaiement, p: Paiement) => {
    const lDate = l.dateSoins ? l.dateSoins.split('T')[0] : (p.datePaiement ? p.datePaiement.split('T')[0] : '');
    const lReclame = l.montantReclame || l.totalPaye + (l.ticketModerateur || 0);
    const lPaye = l.montantPaye || l.totalPaye;

    const matchedPrescription = prestationActsLookup.find(pa => {
      const matchDate = pa.date === lDate;
      const matchAmount = Math.abs(pa.montantBrut - lReclame) < 1 || Math.abs(pa.montantARembourser - lPaye) < 1 || Math.abs(pa.montantBrut - lPaye) < 1;
      return matchDate && matchAmount;
    });

    return {
      hasMatch: !!matchedPrescription,
      matchedPrescription,
    };
  };

  const handleSort = (field: PaiementSortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field.startsWith('total') ? 'desc' : 'asc');
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterSocieteId('ALL');
    setFilterMode('ALL');
    setFilterStatut('ALL');
    setFilterExclusion('ALL');
    setFilterLiaison('ALL');
    setDateDebut('');
    setDateFin('');
    setDateFilterField('datePaiement');
  };

  const setDatePreset = (preset: 'this_month' | 'last_month' | 'this_year' | 'all') => {
    const now = new Date();
    if (preset === 'all') {
      setDateDebut('');
      setDateFin('');
      return;
    }
    if (preset === 'this_month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      setDateDebut(first);
      setDateFin(last);
    } else if (preset === 'last_month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const last = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setDateDebut(first);
      setDateFin(last);
    } else if (preset === 'this_year') {
      const first = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      const last = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
      setDateDebut(first);
      setDateFin(last);
    }
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterSocieteId !== 'ALL') count++;
    if (filterMode !== 'ALL') count++;
    if (filterStatut !== 'ALL') count++;
    if (filterExclusion !== 'ALL') count++;
    if (dateDebut || dateFin) count++;
    return count;
  }, [filterSocieteId, filterMode, filterStatut, filterExclusion, dateDebut, dateFin]);

  // Filtered and Sorted list
  const filteredAndSortedPaiements = useMemo(() => {
    return paiements
      .filter(p => {
        // Global toolbar society filter
        if (selectedSocieteId && selectedSocieteId !== 'ALL' && p.societeId !== selectedSocieteId) {
          return false;
        }

        // Advanced filter society
        if (filterSocieteId && filterSocieteId !== 'ALL' && p.societeId !== filterSocieteId) {
          return false;
        }

        // Mode filter
        if (filterMode !== 'ALL' && p.modePaiement !== filterMode) {
          return false;
        }

        // Statut filter
        if (filterStatut !== 'ALL' && p.statut !== filterStatut) {
          return false;
        }

        // Exclure les rejets purs de la liste des règlements par défaut (les rejets sont gérés dans l'onglet Rejets)
        const isPureRejet = (p.totalPaye === 0 || !p.totalPaye) && ((p.totalExclu || 0) > 0 || p.numeroBordereau?.startsWith('REJET-') || p.referencePaiement?.startsWith('REJET-'));
        if (isPureRejet && filterExclusion !== 'AVEC_EXCLUSION' && !searchTerm.trim()) {
          return false;
        }

        // Exclusion filter
        if (filterExclusion === 'AVEC_EXCLUSION' && (p.totalExclu || 0) <= 0) {
          return false;
        }
        if (filterExclusion === 'SANS_EXCLUSION' && (p.totalExclu || 0) > 0) {
          return false;
        }

        // Liaison filter
        if (filterLiaison === 'NON_RELIE') {
          const hasUnlinkedLine = (p.lignes || []).some(l => {
            const hasPrest = Boolean(l.prestationId && l.prestationId.trim() !== '');
            const hasNum = Boolean(l.prestationNumero && l.prestationNumero.trim() !== '' && l.prestationNumero !== '-');
            return !hasPrest && !hasNum;
          });
          const isBordereauUnlinked = !p.prestationId && (!p.lignes || p.lignes.length === 0);
          if (!hasUnlinkedLine && !isBordereauUnlinked) {
            return false;
          }
        }
        if (filterLiaison === 'RELIE') {
          const hasLinkedLine = (p.lignes || []).some(l => {
            const hasPrest = Boolean(l.prestationId && l.prestationId.trim() !== '');
            const hasNum = Boolean(l.prestationNumero && l.prestationNumero.trim() !== '' && l.prestationNumero !== '-');
            return hasPrest || hasNum;
          });
          const isBordereauLinked = Boolean(p.prestationId);
          if (!hasLinkedLine && !isBordereauLinked) {
            return false;
          }
        }

        // Plage de dates : au choix date métier du règlement ou référence
        // technique d'importation / saisie.
        const dateToFilter = ((dateFilterField === 'dateSaisie' ? p.dateSaisie : p.datePaiement) || '').slice(0, 10);
        if (dateDebut && (!dateToFilter || dateToFilter < dateDebut)) {
          return false;
        }
        if (dateFin && (!dateToFilter || dateToFilter > dateFin)) {
          return false;
        }

        // Search query
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const socNom = getSocieteNom(p.societeId).toLowerCase();
          const matchHeader = 
            (p.numeroBordereau || '').toLowerCase().includes(q) ||
            (p.referencePaiement || '').toLowerCase().includes(q) ||
            (p.notes || '').toLowerCase().includes(q) ||
            (p.modePaiement || '').toLowerCase().includes(q) ||
            socNom.includes(q);

          const matchLines = p.lignes?.some(l => 
            (l.nomAgent || '').toLowerCase().includes(q) ||
            (l.nomBaseAssurance || '').toLowerCase().includes(q) ||
            (l.immatriculation || '').toLowerCase().includes(q) ||
            (l.prestationNumero || '').toLowerCase().includes(q) ||
            (l.commentaire || '').toLowerCase().includes(q)
          );

          if (!matchHeader && !matchLines) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        switch (sortField) {
          case 'datePaiement':
            valA = a.datePaiement || '';
            valB = b.datePaiement || '';
            break;
          case 'dateSaisie':
            valA = a.dateSaisie || '';
            valB = b.dateSaisie || '';
            break;
          case 'numeroBordereau':
            valA = a.numeroBordereau || '';
            valB = b.numeroBordereau || '';
            break;
          case 'societe':
            valA = getSocieteNom(a.societeId).toLowerCase();
            valB = getSocieteNom(b.societeId).toLowerCase();
            break;
          case 'modePaiement':
            valA = a.modePaiement || '';
            valB = b.modePaiement || '';
            break;
          case 'totalReclame':
            valA = a.totalReclame || 0;
            valB = b.totalReclame || 0;
            break;
          case 'totalPaye':
            valA = a.totalPaye || 0;
            valB = b.totalPaye || 0;
            break;
          case 'totalModerateur':
            valA = a.totalModerateur || 0;
            valB = b.totalModerateur || 0;
            break;
          case 'totalExclu':
            valA = a.totalExclu || 0;
            valB = b.totalExclu || 0;
            break;
          case 'statut':
            valA = a.statut || '';
            valB = b.statut || '';
            break;
          default:
            valA = a.datePaiement || '';
            valB = b.datePaiement || '';
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        const comp = String(valA).localeCompare(String(valB));
        return sortDirection === 'asc' ? comp : -comp;
      });
  }, [
    paiements,
    selectedSocieteId,
    filterSocieteId,
    filterMode,
    filterStatut,
    filterExclusion,
    filterLiaison,
    dateDebut,
    dateFin,
    dateFilterField,
    searchTerm,
    sortField,
    sortDirection,
    societes,
  ]);

  // Grouped Aggregation across all filtered payments: Group by Personne (Patient) + Date des Soins + Mêmes Actes
  const groupedPaymentActs = useMemo(() => {
    const groupsMap = new Map<string, GroupedPaymentAct>();

    filteredAndSortedPaiements.forEach(p => {
      const socNom = getSocieteNom(p.societeId);

      (p.lignes || []).forEach(l => {
        // Filtre de liaison appliqué au niveau de la LIGNE de règlement (et non du bordereau) :
        // dans la vue détaillée groupée, un bordereau mixte contient à la fois des lignes
        // reliées et des lignes non reliées — le filtre doit donc porter sur chaque ligne.
        const lineIsLinked = Boolean(
          (l.prestationId && l.prestationId.trim() !== '') ||
          (l.prestationNumero && l.prestationNumero.trim() !== '' && l.prestationNumero !== '-')
        );
        if (filterLiaison === 'NON_RELIE' && lineIsLinked) return;
        if (filterLiaison === 'RELIE' && !lineIsLinked) return;

        const rawNom = (l.nomAgent || l.nomBaseAssurance || 'Assuré inconnu').trim();
        const rawDate = (l.dateSoins || p.datePaiement || '').split('T')[0];
        
        // Determine act code & label
        let actCode = (l.codeActe || (l.actesPayes && l.actesPayes[0]?.code) || 'CONS').toUpperCase().trim();
        let actLibelle = l.libelleActe || (l.actesPayes && l.actesPayes[0]?.libelle) || actCode;
        
        const groupKey = `${rawNom.toLowerCase()}|${rawDate}|${actCode.toLowerCase()}`;

        const reclame = Number(l.montantReclame || ((l.totalPaye || 0) + (l.ticketModerateur || 0)) || 0);
        const paye = Number(l.totalPaye || l.montantPaye || 0);
        const mod = Number(l.ticketModerateur || 0);
        const exclu = Number(l.montantExclu || 0);

        if (!groupsMap.has(groupKey)) {
          groupsMap.set(groupKey, {
            groupKey,
            nomAgent: rawNom,
            immatriculation: l.immatriculation || '-',
            dateSoins: rawDate,
            codeActe: actCode,
            libelleActe: actLibelle,
            societeNom: socNom,
            societeId: p.societeId,
            bordereaux: [
              {
                paiementId: p.id,
                numeroBordereau: p.numeroBordereau,
                datePaiement: p.datePaiement,
                dateSaisie: p.dateSaisie,
                modePaiement: p.modePaiement,
                referencePaiement: p.referencePaiement,
              }
            ],
            prestationsNumeros: l.prestationNumero ? [l.prestationNumero] : [],
            totalReclame: reclame,
            totalPaye: paye,
            ticketModerateur: mod,
            totalExclu: exclu,
            nombreLignes: 1,
            lignes: [
              {
                ligneId: l.id,
                paiementId: p.id,
                numeroBordereau: p.numeroBordereau,
                datePaiement: p.datePaiement,
                dateSaisie: p.dateSaisie,
                dateSoins: l.dateSoins,
                prestationNumero: l.prestationNumero,
                montantReclame: reclame,
                ticketModerateur: mod,
                totalPaye: paye,
                montantExclu: exclu,
                codeActe: actCode,
                libelleActe: actLibelle,
                actesPayes: l.actesPayes,
                commentaire: l.commentaire,
              }
            ]
          });
        } else {
          const grp = groupsMap.get(groupKey)!;
          grp.totalReclame += reclame;
          grp.totalPaye += paye;
          grp.ticketModerateur += mod;
          grp.totalExclu += exclu;
          grp.nombreLignes += 1;

          if (!grp.bordereaux.some(b => b.paiementId === p.id)) {
            grp.bordereaux.push({
              paiementId: p.id,
              numeroBordereau: p.numeroBordereau,
              datePaiement: p.datePaiement,
              dateSaisie: p.dateSaisie,
              modePaiement: p.modePaiement,
              referencePaiement: p.referencePaiement,
            });
          }

          if (l.prestationNumero && !grp.prestationsNumeros.includes(l.prestationNumero)) {
            grp.prestationsNumeros.push(l.prestationNumero);
          }

          grp.lignes.push({
            ligneId: l.id,
            paiementId: p.id,
            numeroBordereau: p.numeroBordereau,
            datePaiement: p.datePaiement,
            dateSaisie: p.dateSaisie,
            dateSoins: l.dateSoins,
            prestationNumero: l.prestationNumero,
            montantReclame: reclame,
            ticketModerateur: mod,
            totalPaye: paye,
            montantExclu: exclu,
            codeActe: actCode,
            libelleActe: actLibelle,
            actesPayes: l.actesPayes,
            commentaire: l.commentaire,
          });
        }
      });
    });

    return Array.from(groupsMap.values()).sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      switch (groupSortField) {
        case 'dateSoins':
          valA = a.dateSoins || '';
          valB = b.dateSoins || '';
          break;
        case 'nomAgent':
          valA = (a.nomAgent || '').toLowerCase();
          valB = (b.nomAgent || '').toLowerCase();
          break;
        case 'codeActe':
          valA = (a.codeActe || '').toLowerCase();
          valB = (b.codeActe || '').toLowerCase();
          break;
        case 'societe':
          valA = (a.societeNom || '').toLowerCase();
          valB = (b.societeNom || '').toLowerCase();
          break;
        case 'totalReclame':
          valA = a.totalReclame || 0;
          valB = b.totalReclame || 0;
          break;
        case 'totalPaye':
          valA = a.totalPaye || 0;
          valB = b.totalPaye || 0;
          break;
        case 'ticketModerateur':
          valA = a.ticketModerateur || 0;
          valB = b.ticketModerateur || 0;
          break;
        case 'totalExclu':
          valA = a.totalExclu || 0;
          valB = b.totalExclu || 0;
          break;
        case 'nombreLignes':
          valA = a.nombreLignes || 0;
          valB = b.nombreLignes || 0;
          break;
        default:
          valA = a.dateSoins || '';
          valB = b.dateSoins || '';
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return groupSortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const comp = String(valA).localeCompare(String(valB));
      return groupSortDirection === 'asc' ? comp : -comp;
    });
  }, [filteredAndSortedPaiements, groupSortField, groupSortDirection, societes, filterLiaison]);

  const handleGroupSort = (field: GroupSortField) => {
    if (groupSortField === field) {
      setGroupSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setGroupSortField(field);
      setGroupSortDirection(field.startsWith('total') || field === 'nombreLignes' ? 'desc' : 'asc');
    }
  };

  // Helper to group lines of a single payment by person + date + act
  const groupLinesForSinglePayment = (lines: LignePaiement[], paymentDate: string) => {
    const map = new Map<string, {
      groupKey: string;
      nomAgent: string;
      immatriculation: string;
      dateSoins: string;
      codeActe: string;
      libelleActe: string;
      prestationNumero: string;
      totalReclame: number;
      ticketModerateur: number;
      totalPaye: number;
      montantExclu: number;
      nombreActes: number;
      subLines: LignePaiement[];
    }>();

    (lines || []).forEach(l => {
      const rawNom = (l.nomAgent || l.nomBaseAssurance || 'Assuré').trim();
      const rawDate = (l.dateSoins || paymentDate || '').split('T')[0];
      const actCode = (l.codeActe || (l.actesPayes && l.actesPayes[0]?.code) || 'CONS').toUpperCase().trim();
      const actLib = l.libelleActe || (l.actesPayes && l.actesPayes[0]?.libelle) || actCode;
      const key = `${rawNom.toLowerCase()}|${rawDate}|${actCode.toLowerCase()}`;

      const rec = Number(l.montantReclame || ((l.totalPaye || 0) + (l.ticketModerateur || 0)) || 0);
      const pay = Number(l.montantPaye || l.totalPaye || 0);
      const mod = Number(l.ticketModerateur || 0);
      const exc = Number(l.montantExclu || 0);

      if (!map.has(key)) {
        map.set(key, {
          groupKey: key,
          nomAgent: rawNom,
          immatriculation: l.immatriculation || '-',
          dateSoins: rawDate,
          codeActe: actCode,
          libelleActe: actLib,
          prestationNumero: l.prestationNumero || '-',
          totalReclame: rec,
          ticketModerateur: mod,
          totalPaye: pay,
          montantExclu: exc,
          nombreActes: 1,
          subLines: [l]
        });
      } else {
        const item = map.get(key)!;
        item.totalReclame += rec;
        item.ticketModerateur += mod;
        item.totalPaye += pay;
        item.montantExclu += exc;
        item.nombreActes += 1;
        item.subLines.push(l);
      }
    });

    return Array.from(map.values());
  };

  // Aggregate statistics for the filtered dataset
  const stats = useMemo(() => {
    const totalReclame = filteredAndSortedPaiements.reduce((sum, p) => sum + (p.totalReclame || 0), 0);
    const totalPaye = filteredAndSortedPaiements.reduce((sum, p) => sum + (p.totalPaye || 0), 0);
    const totalModerateur = filteredAndSortedPaiements.reduce((sum, p) => sum + (p.totalModerateur || 0), 0);
    const totalExclu = filteredAndSortedPaiements.reduce((sum, p) => sum + (p.totalExclu || 0), 0);
    const count = filteredAndSortedPaiements.length;
    const tauxCouverture = totalReclame > 0 ? Math.round((totalPaye / totalReclame) * 100) : 100;

    return {
      count,
      totalReclame,
      totalPaye,
      totalModerateur,
      totalExclu,
      tauxCouverture,
    };
  }, [filteredAndSortedPaiements]);

  // Form State for Saisie de Paiement
  const [targetSocieteId, setTargetSocieteId] = useState<string>(
    selectedSocieteId !== 'ALL' ? selectedSocieteId : societes[0]?.id || ''
  );
  const [bordereauRef, setBordereauRef] = useState<string>('');
  const [datePaiementInput, setDatePaiementInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [modePaiement, setModePaiement] = useState<'Virement bancaire' | 'Chèque' | 'Espèces' | 'Mobile Money'>('Virement bancaire');
  const [referenceTransaction, setReferenceTransaction] = useState<string>('');
  const [remiseAmount, setRemiseAmount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // Selected unsettled lines to pay in this bordereau
  interface StagedPaymentLine {
    prestationId: string;
    lignePrestationId: string;
    personneNom: string;
    matricule: string;
    factureNum: string;
    codeActe: string;
    libelleActe: string;
    montantFacture: number;
    dejaPaye: number;
    resteAPayer: number;
    // User editable inputs for this settlement line
    selected: boolean;
    totalPaye: number;
    ticketModerateur: number;
    montantExclu: number;
    commentaire: string;
  }

  const [stagedLines, setStagedLines] = useState<StagedPaymentLine[]>([]);

  const handleOpenCreateModal = () => {
    const socId = selectedSocieteId !== 'ALL' ? selectedSocieteId : societes[0]?.id || '';
    setTargetSocieteId(socId);
    setBordereauRef(`BORD-${new Date().getFullYear()}-${String(paiements.length + 1).padStart(3, '0')}`);
    setDatePaiementInput(new Date().toISOString().split('T')[0]);
    setModePaiement('Virement bancaire');
    setReferenceTransaction(`VIR-${Date.now().toString().substring(6)}`);
    setRemiseAmount(0);
    setNotes('');

    // Load available unpaid/partially paid lines for this society
    loadLinesForSociete(socId);
    setIsCreateModalOpen(true);
  };

  const loadLinesForSociete = (socId: string) => {
    const lines: StagedPaymentLine[] = [];
    const targetPrestations = prestations.filter(p => p.societeId === socId && p.statut !== 'Payé' && p.statut !== 'Rejeté');
    const soc = societes.find(s => s.id === socId);

    targetPrestations.forEach(p => {
      const personne = personnes.find(pers => pers.id === p.personneId);
      (p.lignes || []).forEach(l => {
        const reste = Math.max(0, l.totalPrestation - (l.totalPaye || 0));
        if (reste > 0) {
          // Exclusions de la société : assuré exclu ou famille d'articles non
          // prise en charge → rien n'est réclamé à la société (client comptoir).
          const repartition = repartirActe(soc, { totalPrestation: reste, code: l.code, libelle: l.libelle }, personne);
          const defaultPaye = repartition.montantARembourser;
          const defaultCopay = repartition.ticketModerateur;
          lines.push({
            prestationId: p.id,
            lignePrestationId: l.id,
            personneNom: personne?.nomPrenom || 'Inconnu',
            matricule: personne?.matricule || '-',
            factureNum: p.numeroFacture,
            codeActe: l.code,
            libelleActe: l.libelle || 'Acte médical',
            montantFacture: l.totalPrestation,
            dejaPaye: l.totalPaye || 0,
            resteAPayer: reste,
            selected: !repartition.excluParSociete,
            totalPaye: defaultPaye,
            ticketModerateur: defaultCopay,
            montantExclu: repartition.montantExclu,
            commentaire: repartition.motifExclusion || 'Pris en charge au barème standard',
          });
        }
      });
    });

    setStagedLines(lines);
  };

  const handleToggleSelectLine = (index: number) => {
    setStagedLines(prev => {
      const updated = [...prev];
      updated[index].selected = !updated[index].selected;
      return updated;
    });
  };

  const handleUpdateStagedLine = (index: number, field: keyof StagedPaymentLine, value: any) => {
    setStagedLines(prev => {
      const updated = [...prev];
      const target = { ...updated[index] };
      let finalValue = value;

      if (field === 'montantExclu') {
        const inputNum = Number(value) || 0;
        const totalActe = Number(target.montantFacture || target.resteAPayer || 0);
        // Si le montant à exclure dépasse le montant total de l'acte, mettre automatiquement le montant total de l'acte
        if (totalActe > 0 && inputNum > totalActe) {
          finalValue = totalActe;
        } else if (inputNum < 0) {
          finalValue = 0;
        } else {
          finalValue = inputNum;
        }
      }

      updated[index] = {
        ...target,
        [field]: finalValue,
      };
      return updated;
    });
  };

  // Computations for active settlement form
  const selectedStaged = stagedLines.filter(l => l.selected);
  const calculatedTotalReclame = selectedStaged.reduce((s, l) => s + l.resteAPayer, 0);
  const calculatedTotalPaye = selectedStaged.reduce((s, l) => s + Number(l.totalPaye || 0), 0);
  const calculatedTotalModerateur = selectedStaged.reduce((s, l) => s + Number(l.ticketModerateur || 0), 0);
  const calculatedTotalExclu = selectedStaged.reduce((s, l) => s + Number(l.montantExclu || 0), 0);

  const handleSubmitPaiement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bordereauRef) {
      alert('Veuillez spécifier une référence de bordereau.');
      return;
    }
    
    // Check if duplicate bordereau already exists in database
    const cleanRef = (r: string) => (r || '').replace(/[\s\-\_\.\/]/g, '').toUpperCase();
    const isDupBordereau = paiements.some(p => cleanRef(p.numeroBordereau) === cleanRef(bordereauRef));
    if (isDupBordereau) {
      alert(`Attention : Le bordereau de paiement N° "${bordereauRef}" existe déjà dans la base de données. Veuillez utiliser une référence unique pour éviter les doublons.`);
      return;
    }

    if (selectedStaged.length === 0) {
      alert('Veuillez cocher au moins une ligne de prestation à régler.');
      return;
    }

    const newPaiementId = generateId('pai');
    const newLignesPaiement: LignePaiement[] = selectedStaged.map(s => {
      const prest = prestations.find(p => p.id === s.prestationId);
      const paidVal = Number(s.totalPaye || 0);
      const modVal = Number(s.ticketModerateur || 0);
      const exclVal = Number(s.montantExclu || 0);
      const reclameVal = s.resteAPayer + s.dejaPaye || s.montantFacture;
      return {
        id: generateId('lp'),
        paiementId: newPaiementId,
        lignePrestationId: s.lignePrestationId,
        prestationId: s.prestationId,
        prestationNumero: s.factureNum,
        dateSoins: prest?.date,
        immatriculation: s.matricule,
        nomBaseAssurance: s.personneNom,
        nomAgent: s.personneNom || prest?.nomAgent,
        totalPaye: paidVal,
        montantPaye: paidVal,
        ticketModerateur: modVal,
        montantExclu: exclVal,
        montantReclame: reclameVal,
        actesPayes: [{ code: s.codeActe, libelle: s.libelleActe, montant: paidVal }],
        commentaire: s.commentaire,
      };
    });

    const nouveauPaiement: Paiement = {
      id: newPaiementId,
      numeroBordereau: bordereauRef,
      datePaiement: datePaiementInput,
      dateSaisie: getCurrentTimestamp(),
      societeId: targetSocieteId,
      modePaiement: modePaiement,
      referencePaiement: referenceTransaction,
      totalReclame: calculatedTotalReclame,
      totalPaye: calculatedTotalPaye - remiseAmount,
      totalModerateur: calculatedTotalModerateur,
      totalExclu: calculatedTotalExclu,
      remise: remiseAmount,
      statut: 'Validé',
      notes: notes,
      lignes: newLignesPaiement,
    };

    // Update prestation lines and calculate new statuses (support multi-règlements sur une même prescription)
    const updatedPrestations = prestations.map(p => {
      const relatedPaidLines = newLignesPaiement.filter(lp => lp.prestationId === p.id);
      if (relatedPaidLines.length === 0) return p;

      const updatedLignes = (p.lignes || []).map(l => {
        const foundPaid = relatedPaidLines.find(lp => lp.lignePrestationId === l.id);
        if (foundPaid) {
          const newActTotalPaye = (l.totalPaye || 0) + foundPaid.totalPaye;
          const actTarget = l.montantARembourser ?? (l.totalPrestation - (l.ticketModerateur || 0));
          return {
            ...l,
            totalPaye: newActTotalPaye,
            statut: newActTotalPaye >= actTarget ? ('Payé' as const) : newActTotalPaye > 0 ? ('Partiellement payé' as const) : ('En attente' as const),
          };
        }
        return l;
      });

      const totalPrestationVal = p.montantTotal ?? p.totalPrestation;
      const partVal = p.ticketModerateur ?? p.participation;
      const netTarget = p.montantARembourser ?? (totalPrestationVal - partVal);
      const totalPaidAll = updatedLignes.reduce((sum, l) => sum + (l.totalPaye || 0), 0);
      const isFullyPaid = totalPaidAll >= netTarget;
      const isPartiallyPaid = totalPaidAll > 0 && !isFullyPaid;

      return {
        ...p,
        totalPaye: totalPaidAll,
        resteAPayer: Math.max(0, netTarget - totalPaidAll),
        lignes: updatedLignes,
        statut: isFullyPaid ? ('Payé' as const) : isPartiallyPaid ? ('Partiellement payé' as const) : ('En attente' as const),
      };
    });

    onSavePaiement(nouveauPaiement, updatedPrestations);
    setIsCreateModalOpen(false);
  };

  const handleExportExcel = () => {
    if (viewMode === 'groupes_actes') {
      const rows = groupedPaymentActs.map(g => ({
        'Patient / Assuré': g.nomAgent,
        'Matricule': g.immatriculation,
        'Date Soins': g.dateSoins,
        'Code Acte': g.codeActe,
        'Libellé Acte': g.libelleActe,
        'Société Assureur': g.societeNom,
        'N° Bordereaux Associés': g.bordereaux.map(b => b.numeroBordereau).join(', '),
        'Dates Importation / Saisie': g.bordereaux.map(b => b.dateSaisie).filter(Boolean).join(', '),
        'Réf Prescriptions': g.prestationsNumeros.join(', '),
        'Nb Lignes / Règlements': g.nombreLignes,
        'Total Réclamé (Brut)': g.totalReclame,
        'Total Réglé (Payé Net)': g.totalPaye,
        'Ticket Modérateur': g.ticketModerateur,
        'Total Exclusions': g.totalExclu,
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Paiements_Groupes_Actes');
      XLSX.writeFile(workbook, `Paiements_Groupes_Patient_Date_Actes_${new Date().toISOString().split('T')[0]}.xlsx`);
      return;
    }

    const rows = filteredAndSortedPaiements.map(p => {
      const soc = societes.find(s => s.id === p.societeId);
      return {
        'N° Bordereau': p.numeroBordereau,
        'Date Règlement': p.datePaiement,
        'Date Importation / Saisie': p.dateSaisie,
        'Société': soc?.nom || '',
        'Mode Paiement': p.modePaiement,
        'Référence Transaction': p.referencePaiement,
        'Total Réclamé': p.totalReclame,
        'Total Réglé (Payé)': p.totalPaye,
        'Ticket Modérateur': p.totalModerateur,
        'Total Exclu': p.totalExclu,
        'Remise': p.remise,
        'Statut': p.statut,
        'Notes': p.notes || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Règlements');
    XLSX.writeFile(workbook, `Reglements_Assurance_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const renderSortIcon = (field: PaiementSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 font-bold ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 font-bold ml-1" />
    );
  };

  const renderGroupSortIcon = (field: GroupSortField) => {
    if (groupSortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />;
    }
    return groupSortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 font-bold ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 font-bold ml-1" />
    );
  };

  return (
    <div className="space-y-4 pb-6 w-full">
      {/* View Header with View Mode Switcher & Streamlined Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-ink-strong">Saisie & Règlements d'Assurance</h2>
            
            {/* View Mode Switcher */}
            <div className="inline-flex p-1 bg-surface-hover rounded-xl border border-line text-xs">
              <button
                id="tab-view-bordereaux"
                type="button"
                onClick={() => setViewMode('bordereaux')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'bordereaux'
                    ? 'bg-surface text-emerald-700 shadow-2xs'
                    : 'text-ink-secondary hover:text-ink-strong'
                }`}
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                <span>Vue par Bordereau</span>
                <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  {filteredAndSortedPaiements.length}
                </span>
              </button>

              <button
                id="tab-view-groupes"
                type="button"
                onClick={() => setViewMode('groupes_actes')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'groupes_actes'
                    ? 'bg-surface text-emerald-700 shadow-2xs'
                    : 'text-ink-secondary hover:text-ink-strong'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                <span>Vue Détaillée (Dossiers)</span>
                <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  {groupedPaymentActs.length}
                </span>
              </button>
            </div>
          </div>
          <p className="text-xs text-ink-muted mt-1">
            Bordereaux de paiements, lettrage des prescriptions et regroupement des soins par assuré, date et mêmes actes
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            id="btn-import-decompte"
            onClick={() => setIsDecompteModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 shadow-2xs transition cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Importer Décompte</span>
          </button>

          {/* Consolidated Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(prev => !prev)}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-surface border border-line text-ink hover:bg-surface-muted shadow-2xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-ink-muted" />
              <span>Exports & Rapports</span>
              <ChevronDown className="w-3 h-3 text-ink-faint" />
            </button>

            {showExportMenu && (
              <>
                <div 
                  className="fixed inset-0 z-20" 
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute right-0 mt-1.5 w-64 bg-surface rounded-xl shadow-xl border border-line py-1.5 z-30 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => { setShowExportMenu(false); handleExportExcel(); }}
                    className="w-full text-left px-3.5 py-2 hover:bg-surface-muted text-ink flex items-center space-x-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="font-semibold">Exporter Excel (.xlsx)</div>
                      <div className="text-[10px] text-ink-faint">
                        {viewMode === 'groupes_actes' ? 'Actes groupés par assuré et date' : 'Bordereaux de règlements complets'}
                      </div>
                    </div>
                  </button>

                </div>
              </>
            )}
          </div>

          {/* Bouton Saisie Manuelle Règlement (Placé en dernier) */}
          <button
            id="btn-saisie-manuelle-reglement"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition cursor-pointer"
            title="Saisie manuelle d'un bordereau de règlement avec recherche d'actes par nom ou immatriculation"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Saisie Manuelle Règlement</span>
          </button>
        </div>
      </div>

      {/* Main Multi-criteria Filter Bar */}
      <div className="bg-surface p-3.5 rounded-xl border border-line shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink-faint" />
            <input
              type="text"
              placeholder="Recherche par n° bordereau, référence paiement, assuré, acte, matricule..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(maskNom(e.target.value))}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-line focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-surface-muted focus:bg-surface transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-ink-faint hover:text-ink-secondary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Mode Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-ink-faint font-medium mr-1 hidden sm:inline">Liaison :</span>
            <button
              onClick={() => setFilterLiaison('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                filterLiaison === 'ALL' ? 'bg-slate-900 text-white shadow-2xs' : 'bg-surface-hover text-ink-secondary hover:bg-surface-active'
              }`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilterLiaison('NON_RELIE')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                filterLiaison === 'NON_RELIE' ? 'bg-amber-600 text-white shadow-2xs' : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Non reliés</span>
            </button>
            <button
              onClick={() => setFilterLiaison('RELIE')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                filterLiaison === 'RELIE' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
              }`}
            >
              Reliés
            </button>

            <span className="text-slate-300 mx-1">|</span>

            <span className="text-[11px] text-ink-faint font-medium mr-1 hidden sm:inline">Mode :</span>
            {[
              { key: 'ALL', label: 'Tous' },
              { key: 'Virement bancaire', label: 'Virement' },
              { key: 'Chèque', label: 'Chèque' },
              { key: 'Mobile Money', label: 'Mobile' },
              { key: 'Espèces', label: 'Espèces' }
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setFilterMode(m.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  filterMode === m.key
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-surface-hover text-ink-secondary hover:bg-surface-active'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Filter Controls Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdvancedFilters(prev => !prev)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                showAdvancedFilters || activeFiltersCount > 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold'
                  : 'bg-surface border-line text-ink-secondary hover:bg-surface-muted'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
              <span>Filtres avancés</span>
              {activeFiltersCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-600 text-white font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-muted hover:text-rose-600 hover:bg-rose-50 border border-line transition cursor-pointer"
                title="Réinitialiser tous les filtres"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Effacer</span>
              </button>
            )}
          </div>
        </div>

        {/* Expandable Multi-criteria Filter Panel */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-line-soft grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-surface-muted/60 p-3 rounded-lg">
            {/* Société Assureur */}
            <div>
              <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                Société / Garant
              </label>
              <Select
                value={filterSocieteId}
                onChange={(e) => setFilterSocieteId(e.target.value)}
                className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Toutes les sociétés</option>
                {societes.map(s => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </Select>
            </div>

            {/* Statut Bordereau */}
            <div>
              <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                Statut du bordereau
              </label>
              <Select
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value)}
                className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="Validé">Validé</option>
                <option value="En attente">En attente</option>
                <option value="Partiel">Partiel</option>
                <option value="Rejeté">Rejeté</option>
              </Select>
            </div>

            {/* Exclusion Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                Exclusions & Rejets
              </label>
              <Select
                value={filterExclusion}
                onChange={(e) => setFilterExclusion(e.target.value as any)}
                className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Tous les bordereaux</option>
                <option value="AVEC_EXCLUSION">Avec exclusions (&gt; 0)</option>
                <option value="SANS_EXCLUSION">Sans exclusion (100% admis)</option>
              </Select>
            </div>

            {/* Date Range & Presets */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[11px] font-semibold text-ink-secondary">
                  Période de référence
                </label>
                <Select
                  value={dateFilterField}
                  onChange={(e) => setDateFilterField(e.target.value as 'datePaiement' | 'dateSaisie')}
                  className="text-[10px] py-0.5 px-1.5 rounded border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  title="Choisir la date utilisée par le filtre"
                >
                  <option value="datePaiement">Date règlement</option>
                  <option value="dateSaisie">Date import / saisie</option>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="w-1/2 text-xs py-1 px-1.5 rounded-md border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  title="Date début"
                />
                <span className="text-ink-faint text-xs">-</span>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="w-1/2 text-xs py-1 px-1.5 rounded-md border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  title="Date fin"
                />
              </div>
              {/* Quick presets */}
              <div className="flex items-center gap-1 mt-1.5">
                <button
                  type="button"
                  onClick={() => setDatePreset('this_month')}
                  className="text-[10px] text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  Ce mois
                </button>
                <span className="text-slate-300 text-[10px]">|</span>
                <button
                  type="button"
                  onClick={() => setDatePreset('last_month')}
                  className="text-[10px] text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  Mois dernier
                </button>
                <span className="text-slate-300 text-[10px]">|</span>
                <button
                  type="button"
                  onClick={() => setDatePreset('this_year')}
                  className="text-[10px] text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  Année
                </button>
                <span className="text-slate-300 text-[10px]">|</span>
                <button
                  type="button"
                  onClick={() => setDatePreset('all')}
                  className="text-[10px] text-ink-muted hover:text-ink hover:underline cursor-pointer"
                >
                  Tout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Paiements Table / Grouped Table based on viewMode */}
      {viewMode === 'bordereaux' ? (
        <div className="bg-surface rounded-xl border border-line shadow-xs overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-surface-muted text-ink uppercase text-[11px] font-semibold border-b border-line select-none shadow-2xs">
                <tr>
                  <th className="py-3 px-2 w-8"></th>
                  
                  {/* Date Règlement */}
                  <th 
                    onClick={() => handleSort('datePaiement')}
                    className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${sortField === 'datePaiement' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center">
                      <span>Date Règlement</span>
                      {renderSortIcon('datePaiement')}
                    </div>
                  </th>

                  {/* Référence automatique d'importation / saisie */}
                  <th
                    onClick={() => handleSort('dateSaisie')}
                    className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${sortField === 'dateSaisie' ? 'bg-indigo-50/70 text-indigo-900 font-bold' : ''}`}
                    title="Horodatage automatique de l'importation ou de la saisie"
                  >
                    <div className="flex items-center">
                      <span>Date Import / Saisie</span>
                      {renderSortIcon('dateSaisie')}
                    </div>
                  </th>

                  {/* N° Bordereau */}
                  <th 
                    onClick={() => handleSort('numeroBordereau')}
                    className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${sortField === 'numeroBordereau' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center">
                      <span>N° Bordereau</span>
                      {renderSortIcon('numeroBordereau')}
                    </div>
                  </th>

                  {/* Société Assureur */}
                  <th 
                    onClick={() => handleSort('societe')}
                    className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${sortField === 'societe' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center">
                      <span>Société Assureur</span>
                      {renderSortIcon('societe')}
                    </div>
                  </th>

                  {/* Mode & Référence */}
                  <th 
                    onClick={() => handleSort('modePaiement')}
                    className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${sortField === 'modePaiement' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center">
                      <span>Mode & Référence</span>
                      {renderSortIcon('modePaiement')}
                    </div>
                  </th>

                  {/* Total Réclamé */}
                  <th 
                    onClick={() => handleSort('totalReclame')}
                    className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${sortField === 'totalReclame' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-end">
                      <span>Total Réclamé</span>
                      {renderSortIcon('totalReclame')}
                    </div>
                  </th>

                  {/* Somme Payée */}
                  <th 
                    onClick={() => handleSort('totalPaye')}
                    className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${sortField === 'totalPaye' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-end">
                      <span>Somme Payée</span>
                      {renderSortIcon('totalPaye')}
                    </div>
                  </th>

                  {/* Ticket Modérateur */}
                  <th 
                    onClick={() => handleSort('totalModerateur')}
                    className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${sortField === 'totalModerateur' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-end">
                      <span>Ticket Mod.</span>
                      {renderSortIcon('totalModerateur')}
                    </div>
                  </th>

                  {/* Exclu / Rejet */}
                  <th 
                    onClick={() => handleSort('totalExclu')}
                    className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${sortField === 'totalExclu' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-end">
                      <span>Exclu / Rejet</span>
                      {renderSortIcon('totalExclu')}
                    </div>
                  </th>

                  {/* Statut */}
                  <th 
                    onClick={() => handleSort('statut')}
                    className={`py-3 px-3 text-center cursor-pointer group hover:bg-surface-hover/80 transition ${sortField === 'statut' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-center">
                      <span>Statut</span>
                      {renderSortIcon('statut')}
                    </div>
                  </th>

                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedPaiements.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-10 text-center text-ink-faint space-y-2">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                      <div>Aucun bordereau de règlement ne correspond aux critères sélectionnés.</div>
                      {activeFiltersCount > 0 && (
                        <button
                          onClick={handleResetFilters}
                          className="text-xs text-emerald-600 hover:underline font-medium"
                        >
                          Réinitialiser tous les filtres
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedPaiements.map(p => {
                    const isExpanded = !!expandedRows[p.id];
                    const recInfo = getPaiementReconciliationInfo(p);
                    const groupedPaymentLines = groupLinesForSinglePayment(p.lignes, p.datePaiement);

                    // Tooltip text for reconciliation
                    const matchTooltip = recInfo.hasMatch
                      ? `Concordance avec prestation(s) (${recInfo.matchingPrestations.map(m => `Facture ${m.numeroFacture} : ${formatMoney(m.montantBrut)}`).join(', ')})`
                      : undefined;
                    const duplicateTooltip = recInfo.hasDuplicate
                      ? `Doublon potentiel détecté sur les lignes ou le bordereau avec : ${recInfo.duplicatePayments.map(d => `${d.numeroBordereau} (${formatDate(d.datePaiement)} - ${formatMoney(d.totalPaye)})`).join(', ')}`
                      : undefined;

                    return (
                      <React.Fragment key={p.id}>
                        <tr className={`transition hover:bg-surface-muted/80 ${
                          recInfo.hasMatch ? 'bg-emerald-50/20' : recInfo.hasDuplicate ? 'bg-amber-50/20' : ''
                        }`}>
                          <td className="py-3 px-2 text-center">
                            <button
                              onClick={() => toggleRow(p.id)}
                              className="p-1 text-ink-faint hover:text-emerald-600 transition cursor-pointer"
                              title="Afficher les lignes et actes réglés"
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-emerald-600 font-bold" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-ink-secondary font-medium whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <span className={
                                recInfo.hasMatch 
                                  ? 'border-b-2 border-dashed border-emerald-500 text-emerald-900 font-bold' 
                                  : recInfo.hasDuplicate 
                                  ? 'border-b-2 border-dashed border-amber-500 text-amber-900 font-semibold' 
                                  : ''
                              } title={matchTooltip || duplicateTooltip}>
                                {formatDate(p.datePaiement)}
                              </span>
                              {recInfo.hasMatch && (
                                <span title={matchTooltip} className="inline-flex items-center text-emerald-600">
                                  <Sparkles className="w-3.5 h-3.5" />
                                </span>
                              )}
                              {recInfo.hasDuplicate && (
                                <span title={duplicateTooltip} className="inline-flex items-center text-amber-500">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-indigo-700 font-medium whitespace-nowrap">
                            <div className="flex items-center gap-1" title="Référence automatique de l'enregistrement">
                              <CalendarCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span>{formatDateTime(p.dateSaisie)}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-bold text-emerald-700 whitespace-nowrap">{p.numeroBordereau}</td>
                          <td className="py-3 px-3 font-medium text-ink-strong">{getSocieteNom(p.societeId)}</td>
                          <td className="py-3 px-3">
                            <div className="text-ink font-medium">{p.modePaiement}</div>
                            <div className="text-[10px] text-ink-faint font-mono">{p.referencePaiement}</div>
                          </td>
                          <td className="py-3 px-3 text-right text-ink-secondary whitespace-nowrap">{formatMoney(p.totalReclame)}</td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <span className={
                                recInfo.hasMatch 
                                  ? 'border-b-2 border-dashed border-emerald-500 text-emerald-900' 
                                  : recInfo.hasDuplicate 
                                  ? 'border-b-2 border-dashed border-amber-500 text-amber-900' 
                                  : ''
                              } title={matchTooltip || duplicateTooltip}>
                                {formatMoney(p.totalPaye)}
                              </span>
                              {recInfo.hasMatch && (
                                <span title={matchTooltip} className="text-[10px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold">
                                  Match
                                </span>
                              )}
                              {recInfo.hasDuplicate && (
                                <span title={duplicateTooltip} className="text-[10px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-semibold">
                                  Doublon
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right text-amber-700 font-medium whitespace-nowrap">{formatMoney(p.totalModerateur)}</td>
                          <td className="py-3 px-3 text-right text-rose-600 font-medium whitespace-nowrap">{formatMoney(p.totalExclu)}</td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {p.statut}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => setViewingPaiement(p)}
                                title="Visualiser le bordereau"
                                className="p-1.5 text-ink-faint hover:text-ink hover:bg-surface-hover rounded-lg cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setPaiementToDelete(p)}
                                title="Supprimer le bordereau de règlement"
                                className="p-1.5 text-ink-faint hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Nested Expandable Sub-Table of Payment Lines */}
                        {isExpanded && (
                          <tr className="bg-surface-muted/90 border-y border-line/80">
                            <td colSpan={12} className="p-4 pl-10">
                              <div className="bg-surface rounded-lg border border-line p-3 shadow-xs space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                                      <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Lignes Règlement du Bordereau ({p?.lignes?.length || 0} soins)</span>
                                    </span>
                                    <span className="text-xs text-ink-faint font-mono">| {formatDate(p.datePaiement)}</span>
                                  </div>

                                  {/* Sub-table grouping toggle */}
                                  <div className="flex items-center gap-1.5 bg-surface-hover px-2 py-1 rounded-md text-[11px]">
                                    <Layers className="w-3 h-3 text-emerald-600" />
                                    <label className="text-ink font-medium flex items-center gap-1 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={groupLinesInBordereau}
                                        onChange={(e) => setGroupLinesInBordereau(e.target.checked)}
                                        className="rounded border-line-strong text-emerald-600 focus:ring-emerald-500 w-3 h-3 cursor-pointer"
                                      />
                                      <span>Regrouper (même personne, date et même acte)</span>
                                    </label>
                                  </div>
                                </div>

                                {groupLinesInBordereau ? (
                                  /* Grouped sub-lines */
                                  <table className="w-full text-xs">
                                    <thead className="text-[10px] text-ink-muted uppercase bg-surface-muted border-b border-line">
                                      <tr>
                                        <th className="py-2 px-2 text-center">Date Soins</th>
                                        <th className="py-2 px-2 text-left">Patient / Assuré</th>
                                        <th className="py-2 px-2 text-left">Matricule</th>
                                        <th className="py-2 px-2 text-left">Acte Regroupé</th>
                                        <th className="py-2 px-2 text-left">Réf Prescription / Liaison</th>
                                        <th className="py-2 px-2 text-center">Nb Actes</th>
                                        <th className="py-2 px-2 text-right">Total Réclamé</th>
                                        <th className="py-2 px-2 text-right">Ticket Modérateur</th>
                                        <th className="py-2 px-2 text-right">Somme Payée (Net)</th>
                                        <th className="py-2 px-2 text-right">Exclusions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {groupedPaymentLines.map((grp) => (
                                        <tr key={grp.groupKey} className="hover:bg-surface-muted">
                                          <td className="py-2 px-2 text-ink-secondary font-medium text-center">
                                            {formatDate(grp.dateSoins)}
                                          </td>
                                          <td className="py-2 px-2 font-semibold text-ink-strong">
                                            {grp.nomAgent}
                                          </td>
                                          <td className="py-2 px-2 font-mono text-[11px] text-ink-secondary">
                                            {grp.immatriculation}
                                          </td>
                                          <td className="py-2 px-2">
                                            <div className="flex items-center gap-1.5">
                                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                                                {grp.codeActe}
                                              </span>
                                              <span className="text-ink font-medium">{grp.libelleActe}</span>
                                            </div>
                                          </td>
                                          <td className="py-2 px-2">
                                            <div className="flex items-center gap-1.5">
                                              {grp.prestationNumero && grp.prestationNumero !== '-' ? (
                                                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-xs inline-flex items-center gap-1">
                                                  <FileText className="w-3 h-3 text-indigo-600" />
                                                  <span>{grp.prestationNumero}</span>
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold shrink-0">
                                                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                  <span>Non relié</span>
                                                </span>
                                              )}
                                              {grp.subLines && grp.subLines.length > 0 && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    const targetLigne = grp.subLines[0];
                                                    if (targetLigne) {
                                                      setRelierModalContext({ paiement: p, lignePaiement: targetLigne });
                                                    }
                                                  }}
                                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 transition-colors cursor-pointer shrink-0"
                                                  title={grp.prestationNumero && grp.prestationNumero !== '-' ? "Changer la prestation reliée" : "Relier à une prestation"}
                                                >
                                                  <Link2 className="w-3 h-3 text-indigo-600" />
                                                  <span>{grp.prestationNumero && grp.prestationNumero !== '-' ? "Changer" : "Relier"}</span>
                                                </button>
                                              )}
                                              {grp.prestationNumero && grp.prestationNumero !== '-' && grp.subLines && grp.subLines.length > 0 && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    const targetLigne = grp.subLines[0];
                                                    if (targetLigne) {
                                                      handleUnlinkLigne(p, targetLigne);
                                                    }
                                                  }}
                                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold border border-rose-200 transition-colors cursor-pointer shrink-0"
                                                  title="Délier la facture de soins rattachée à cette ligne de règlement"
                                                >
                                                  <Unlink className="w-3 h-3" />
                                                  <span>Délier</span>
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                          <td className="py-2 px-2 text-center">
                                            <span className="px-1.5 py-0.2 rounded-full bg-surface-hover text-ink font-bold text-[10px]">
                                              {grp.nombreActes}
                                            </span>
                                          </td>
                                          <td className="py-2 px-2 text-right font-medium text-ink-strong">
                                            {formatMoney(grp.totalReclame)}
                                          </td>
                                          <td className="py-2 px-2 text-right text-amber-700 font-medium">
                                            {formatMoney(grp.ticketModerateur)}
                                          </td>
                                          <td className="py-2 px-2 text-right font-bold text-emerald-700">
                                            {formatMoney(grp.totalPaye)}
                                          </td>
                                          <td className="py-2 px-2 text-right text-rose-600 font-medium">
                                            {formatMoney(grp.montantExclu)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  /* Raw individual lines */
                                  <table className="w-full text-xs">
                                    <thead className="text-[10px] text-ink-muted uppercase bg-surface-muted border-b border-line">
                                      <tr>
                                        <th className="py-2 px-2 text-center">Date Soins</th>
                                        <th className="py-2 px-2 text-left">Nom de l'Agent (Prescription)</th>
                                        <th className="py-2 px-2 text-left">Matricule</th>
                                        <th className="py-2 px-2 text-left">Réf Prescription</th>
                                        <th className="py-2 px-2 text-left min-w-[180px]">Actes Payés & Montants</th>
                                        <th className="py-2 px-2 text-right">Montant à Payer</th>
                                        <th className="py-2 px-2 text-right">Ticket Modérateur</th>
                                        <th className="py-2 px-2 text-right">Somme Payée</th>
                                        <th className="py-2 px-2 text-right">Exclusions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {(p.lignes || []).map((l) => {
                                        const lMatch = getLignePaiementMatchInfo(l, p);
                                        const lMatchTooltip = lMatch.hasMatch 
                                          ? `Concordance Prescription : Facture ${lMatch.matchedPrescription?.numeroFacture} (Date: ${formatDate(lMatch.matchedPrescription?.date || '')}, Montant: ${formatMoney(lMatch.matchedPrescription?.montantBrut || 0)})`
                                          : undefined;

                                        return (
                                          <tr key={l.id} className={`hover:bg-surface-muted ${lMatch.hasMatch ? 'bg-emerald-50/30' : ''}`}>
                                            <td className="py-2 px-2 text-ink-secondary font-medium text-center">
                                              <div className="flex items-center justify-center gap-1">
                                                <span className={lMatch.hasMatch ? 'border-b-2 border-dashed border-emerald-500 text-emerald-900 font-bold' : ''} title={lMatchTooltip}>
                                                  {l.dateSoins ? formatDate(l.dateSoins) : '-'}
                                                </span>
                                                {lMatch.hasMatch && (
                                                  <span title={lMatchTooltip} className="inline-flex items-center text-emerald-600">
                                                    <Sparkles className="w-3 h-3" />
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-2 px-2 font-semibold text-ink-strong">
                                              {l.nomAgent || l.nomBaseAssurance}
                                            </td>
                                            <td className="py-2 px-2 font-mono text-[11px] text-ink-secondary">
                                              {l.immatriculation || '-'}
                                            </td>
                                            <td className="py-2 px-2">
                                              <div className="flex items-center gap-1.5">
                                                {l.prestationNumero && l.prestationNumero !== '-' ? (
                                                  <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-xs inline-flex items-center gap-1">
                                                    <FileText className="w-3 h-3 text-indigo-600" />
                                                    <span>{l.prestationNumero}</span>
                                                  </span>
                                                ) : (
                                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold shrink-0">
                                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                    <span>Non relié</span>
                                                  </span>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setRelierModalContext({ paiement: p, lignePaiement: l });
                                                  }}
                                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 transition-colors shadow-2xs cursor-pointer shrink-0"
                                                  title={l.prestationNumero ? "Changer la prestation reliée" : "Relier ce règlement à une facture de soins"}
                                                >
                                                  <Link2 className="w-3 h-3 text-indigo-600" />
                                                  <span>{l.prestationNumero && l.prestationNumero !== '-' ? "Changer" : "Relier"}</span>
                                                </button>
                                                {l.prestationNumero && l.prestationNumero !== '-' && (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleUnlinkLigne(p, l);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold border border-rose-200 transition-colors shadow-2xs cursor-pointer shrink-0"
                                                    title="Délier la facture de soins rattachée à cette ligne de règlement"
                                                  >
                                                    <Unlink className="w-3 h-3" />
                                                    <span>Délier</span>
                                                  </button>
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-2 px-2">
                                              {l.actesPayes && l.actesPayes.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                  {l.actesPayes.map((a, actIdx) => (
                                                    <span key={actIdx} className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-medium">
                                                      <span className="font-bold">{a.code}</span>
                                                      <span>: {formatMoney(a.montant)}</span>
                                                    </span>
                                                  ))}
                                                </div>
                                              ) : (
                                                <span className="text-ink-muted text-[11px]">{l.commentaire || 'Soins réglés'}</span>
                                              )}
                                            </td>
                                            <td className="py-2 px-2 text-right font-medium text-ink-strong">
                                              <span className={lMatch.hasMatch ? 'border-b-2 border-dashed border-emerald-500 text-emerald-900 font-bold' : ''} title={lMatchTooltip}>
                                                {formatMoney(l.montantReclame || l.totalPaye + (l.ticketModerateur || 0))}
                                              </span>
                                            </td>
                                            <td className="py-2 px-2 text-right text-amber-700 font-medium">
                                              {formatMoney(l.ticketModerateur || 0)}
                                            </td>
                                            <td className="py-2 px-2 text-right font-bold text-emerald-700">
                                              {formatMoney(l.montantPaye || l.totalPaye)}
                                            </td>
                                            <td className="py-2 px-2 text-right text-rose-600 font-medium">
                                              {formatMoney(l.montantExclu || 0)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bar de Totaux Généraux toujours visible en bas de la page */}
          <div className="sticky bottom-0 z-20 shrink-0 bg-slate-900 text-white border-t border-slate-800 px-4 py-3 shadow-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 font-bold uppercase text-slate-300 tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Total Général ({stats.count} règlements)</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono font-bold">
              <div className="text-right">
                <span className="text-[10px] uppercase font-sans text-ink-faint block font-normal">Total Réclamé</span>
                <span className="text-slate-100">{formatMoney(stats.totalReclame)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-sans text-amber-400 block font-normal">Ticket Mod.</span>
                <span className="text-amber-300">{formatMoney(stats.totalModerateur)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-sans text-indigo-300 block font-normal">Net Assureur</span>
                <span className="text-indigo-200">{formatMoney(Math.max(0, stats.totalReclame - stats.totalModerateur))}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-sans text-emerald-400 block font-normal">Total Réglé</span>
                <span className="text-emerald-400">{formatMoney(stats.totalPaye)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-sans text-rose-400 block font-normal">Reste Dû</span>
                <span className={Math.max(0, (stats.totalReclame - stats.totalModerateur) - stats.totalPaye) > 0 ? 'text-rose-400 font-extrabold' : 'text-ink-faint'}>
                  {formatMoney(Math.max(0, (stats.totalReclame - stats.totalModerateur) - stats.totalPaye))}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-sans text-rose-400 block font-normal">Total Exclu</span>
                <span className="text-rose-400">{formatMoney(stats.totalExclu)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Grouped View: Regroupé par Personne + Date + Mêmes Actes */
        <div className="bg-surface rounded-xl border border-line shadow-xs overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
          <div className="bg-emerald-50/50 px-4 py-2.5 border-b border-line flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <Layers className="w-4 h-4 text-emerald-700" />
              <span className="font-bold text-ink-strong">Synthèse Groupée par Patient, Date de Soin et Mêmes Actes</span>
              <span className="text-ink-faint">({groupedPaymentActs.length} groupes cumulés)</span>
            </div>
            <span className="text-[11px] text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full font-medium">
              Agrégation multi-bordereaux automatique
            </span>
          </div>

          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-surface-muted text-ink uppercase text-[11px] font-semibold border-b border-line select-none shadow-2xs">
                <tr>
                  <th className="py-3 px-2 w-8"></th>

                  {/* Date Soins */}
                  <th
                    onClick={() => handleGroupSort('dateSoins')}
                    className={`py-3 px-3 text-center cursor-pointer group hover:bg-surface-hover/80 transition ${groupSortField === 'dateSoins' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-center">
                      <span>Date Soins</span>
                      {renderGroupSortIcon('dateSoins')}
                    </div>
                  </th>

                  {/* Patient / Assuré */}
                  <th
                    onClick={() => handleGroupSort('nomAgent')}
                    className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${groupSortField === 'nomAgent' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center">
                      <span>Patient / Assuré</span>
                      {renderGroupSortIcon('nomAgent')}
                    </div>
                  </th>

                  {/* Acte / Prestation */}
                  <th
                    onClick={() => handleGroupSort('codeActe')}
                    className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${groupSortField === 'codeActe' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center">
                      <span>Acte Médical</span>
                      {renderGroupSortIcon('codeActe')}
                    </div>
                  </th>

                  {/* Société */}
                  <th
                    onClick={() => handleGroupSort('societe')}
                    className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${groupSortField === 'societe' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center">
                      <span>Assureur</span>
                      {renderGroupSortIcon('societe')}
                    </div>
                  </th>

                  {/* Bordereau(x) */}
                  <th className="py-3 px-3">Bordereau(x)</th>

                  {/* Nb Règlements */}
                  <th
                    onClick={() => handleGroupSort('nombreLignes')}
                    className={`py-3 px-2 text-center cursor-pointer group hover:bg-surface-hover/80 transition ${groupSortField === 'nombreLignes' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-center">
                      <span>Nb Règl.</span>
                      {renderGroupSortIcon('nombreLignes')}
                    </div>
                  </th>

                  {/* Total Réclamé */}
                  <th
                    onClick={() => handleGroupSort('totalReclame')}
                    className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${groupSortField === 'totalReclame' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-end">
                      <span>Total Réclamé</span>
                      {renderGroupSortIcon('totalReclame')}
                    </div>
                  </th>

                  {/* Ticket Modérateur */}
                  <th
                    onClick={() => handleGroupSort('ticketModerateur')}
                    className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${groupSortField === 'ticketModerateur' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-end">
                      <span>Ticket Mod.</span>
                      {renderGroupSortIcon('ticketModerateur')}
                    </div>
                  </th>

                  {/* Somme Payée (Net) */}
                  <th
                    onClick={() => handleGroupSort('totalPaye')}
                    className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${groupSortField === 'totalPaye' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-end">
                      <span>Somme Payée</span>
                      {renderGroupSortIcon('totalPaye')}
                    </div>
                  </th>

                  {/* Total Exclu */}
                  <th
                    onClick={() => handleGroupSort('totalExclu')}
                    className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${groupSortField === 'totalExclu' ? 'bg-emerald-50/60 text-emerald-900 font-bold' : ''}`}
                  >
                    <div className="flex items-center justify-end">
                      <span>Exclusions</span>
                      {renderGroupSortIcon('totalExclu')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedPaymentActs.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-ink-faint space-y-2">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                      <div>Aucun acte regroupé ne correspond aux critères sélectionnés.</div>
                      {activeFiltersCount > 0 && (
                        <button
                          onClick={handleResetFilters}
                          className="text-xs text-emerald-600 hover:underline font-medium"
                        >
                          Réinitialiser tous les filtres
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  groupedPaymentActs.map((grp) => {
                    const isGroupExpanded = !!expandedGroupRows[grp.groupKey];

                    return (
                      <React.Fragment key={grp.groupKey}>
                        <tr className={`transition hover:bg-surface-muted/80 ${isGroupExpanded ? 'bg-emerald-50/20 font-medium' : ''}`}>
                          <td className="py-3 px-2 text-center">
                            <button
                              onClick={() => toggleGroupRow(grp.groupKey)}
                              className="p-1 text-ink-faint hover:text-emerald-600 transition cursor-pointer"
                              title="Afficher les règlements rattachés à ce groupe"
                            >
                              {isGroupExpanded ? <ChevronDown className="w-4 h-4 text-emerald-600 font-bold" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-ink font-semibold whitespace-nowrap text-center">
                            {formatDate(grp.dateSoins)}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-ink-strong">{grp.nomAgent}</div>
                            {grp.immatriculation && grp.immatriculation !== '-' && (
                              <div className="text-[10px] text-ink-faint font-mono">{grp.immatriculation}</div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold">
                                {grp.codeActe}
                              </span>
                              <span className="font-semibold text-ink">{grp.libelleActe}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-ink font-medium">{grp.societeNom}</td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1">
                              {grp.bordereaux.map((b) => (
                                <span
                                  key={b.paiementId}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-hover text-ink border border-line text-[10px] font-mono font-medium"
                                  title={`Règlement du ${formatDate(b.datePaiement)} • Import / saisie : ${formatDateTime(b.dateSaisie)} • ${b.modePaiement}`}
                                >
                                  {b.numeroBordereau}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              {grp.nombreLignes}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-ink-secondary font-medium whitespace-nowrap">
                            {formatMoney(grp.totalReclame)}
                          </td>
                          <td className="py-3 px-3 text-right text-amber-700 font-medium whitespace-nowrap">
                            {formatMoney(grp.ticketModerateur)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                            {formatMoney(grp.totalPaye)}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-600 font-medium whitespace-nowrap">
                            {formatMoney(grp.totalExclu)}
                          </td>
                        </tr>

                        {/* Nested Sub-Table for Grouped Row */}
                        {isGroupExpanded && (
                          <tr className="bg-surface-muted/90 border-y border-line/80">
                            <td colSpan={11} className="p-4 pl-10">
                              <div className="bg-surface rounded-lg border border-line p-3 shadow-xs space-y-2">
                                <div className="text-[11px] font-bold text-ink uppercase tracking-wider flex items-center justify-between border-b border-line-soft pb-2">
                                  <span className="flex items-center gap-1.5 text-emerald-700">
                                    <Boxes className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Détail des {grp?.lignes?.length || 0} règlements cumulés pour {grp.nomAgent} - Acte {grp.codeActe}</span>
                                  </span>
                                  <span className="text-ink-faint font-mono text-[11px]">Soins du {formatDate(grp.dateSoins)}</span>
                                </div>

                                <table className="w-full text-xs">
                                  <thead className="text-[10px] text-ink-muted uppercase bg-surface-muted border-b border-line">
                                    <tr>
                                      <th className="py-2 px-2 text-left">N° Bordereau</th>
                                      <th className="py-2 px-2 text-left">Date Règlement</th>
                                      <th className="py-2 px-2 text-left">Date Import / Saisie</th>
                                      <th className="py-2 px-2 text-left">Réf Prescription</th>
                                      <th className="py-2 px-2 text-left">Détail Acte / Commentaire</th>
                                      <th className="py-2 px-2 text-right">Montant Réclamé</th>
                                      <th className="py-2 px-2 text-right">Ticket Mod.</th>
                                      <th className="py-2 px-2 text-right">Somme Payée</th>
                                      <th className="py-2 px-2 text-right">Exclusion</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {(grp.lignes || []).map((sub, sIdx) => (
                                      <tr key={`${sub.ligneId}_${sIdx}`} className="hover:bg-surface-muted">
                                        <td className="py-2 px-2 font-bold font-mono text-emerald-700">
                                          {sub.numeroBordereau}
                                        </td>
                                        <td className="py-2 px-2 text-ink-secondary">
                                          {formatDate(sub.datePaiement)}
                                        </td>
                                        <td className="py-2 px-2 text-indigo-700 whitespace-nowrap">
                                          {formatDateTime(sub.dateSaisie)}
                                        </td>
                                        <td className="py-2 px-2 font-mono font-bold text-indigo-700">
                                          <div className="flex items-center gap-1.5">
                                            {sub.prestationNumero && sub.prestationNumero !== '-' ? (
                                              <span className="bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200 text-xs font-mono font-bold">
                                                {sub.prestationNumero}
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                <span>Non relié</span>
                                              </span>
                                            )}
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const parentPaiement = paiements.find(p => p.id === sub.paiementId);
                                                const parentLigne = parentPaiement?.lignes?.find(l => l.id === sub.ligneId);
                                                if (parentPaiement && parentLigne) {
                                                  setRelierModalContext({ paiement: parentPaiement, lignePaiement: parentLigne });
                                                }
                                              }}
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold border border-indigo-200 transition-colors cursor-pointer"
                                              title={sub.prestationNumero && sub.prestationNumero !== '-' ? "Changer la prestation reliée" : "Relier à une prestation"}
                                            >
                                              <Link2 className="w-3 h-3 text-indigo-600" />
                                              <span>{sub.prestationNumero && sub.prestationNumero !== '-' ? "Changer" : "Relier"}</span>
                                            </button>
                                            {sub.prestationNumero && sub.prestationNumero !== '-' && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const parentPaiement = paiements.find(pp => pp.id === sub.paiementId);
                                                  const parentLigne = parentPaiement?.lignes?.find(ll => ll.id === sub.ligneId);
                                                  if (parentPaiement && parentLigne) {
                                                    handleUnlinkLigne(parentPaiement, parentLigne);
                                                  }
                                                }}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200 transition-colors cursor-pointer"
                                                title="Délier la facture de soins rattachée à ce règlement"
                                              >
                                                <Unlink className="w-3 h-3" />
                                                <span>Délier</span>
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-2 px-2 text-ink-secondary">
                                          {sub.commentaire || `${sub.libelleActe || sub.codeActe}`}
                                        </td>
                                        <td className="py-2 px-2 text-right text-ink font-medium">
                                          {formatMoney(sub.montantReclame)}
                                        </td>
                                        <td className="py-2 px-2 text-right text-amber-700 font-medium">
                                          {formatMoney(sub.ticketModerateur)}
                                        </td>
                                        <td className="py-2 px-2 text-right font-bold text-emerald-700">
                                          {formatMoney(sub.totalPaye)}
                                        </td>
                                        <td className="py-2 px-2 text-right text-rose-600 font-medium">
                                          {formatMoney(sub.montantExclu)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bar de Totaux Généraux toujours visible en bas de la page */}
          {(() => {
            const totReclame = groupedPaymentActs.reduce((s, g) => s + g.totalReclame, 0);
            const totMod = groupedPaymentActs.reduce((s, g) => s + g.ticketModerateur, 0);
            const totRemb = Math.max(0, totReclame - totMod);
            const totPaye = groupedPaymentActs.reduce((s, g) => s + g.totalPaye, 0);
            const totReste = Math.max(0, totRemb - totPaye);
            const totExclu = groupedPaymentActs.reduce((s, g) => s + g.totalExclu, 0);

            return (
              <div className="sticky bottom-0 z-20 shrink-0 bg-slate-900 text-white border-t border-slate-800 px-4 py-3 shadow-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 font-bold uppercase text-slate-300 tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Total Synthèse ({groupedPaymentActs.length} groupes)</span>
                </div>

                <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono font-bold">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-sans text-ink-faint block font-normal">Total Réclamé</span>
                    <span className="text-slate-100">{formatMoney(totReclame)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-sans text-amber-400 block font-normal">Ticket Mod.</span>
                    <span className="text-amber-300">{formatMoney(totMod)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-sans text-indigo-300 block font-normal">Net Assureur</span>
                    <span className="text-indigo-200">{formatMoney(totRemb)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-sans text-emerald-400 block font-normal">Total Réglé</span>
                    <span className="text-emerald-400">{formatMoney(totPaye)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-sans text-rose-400 block font-normal">Reste Dû</span>
                    <span className={totReste > 0 ? 'text-rose-400 font-extrabold' : 'text-ink-faint'}>
                      {formatMoney(totReste)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-sans text-rose-400 block font-normal">Total Exclu</span>
                    <span className="text-rose-400">{formatMoney(totExclu)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Modal: View Bordereau Details */}
      {viewingPaiement && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-3xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line-soft pb-3">
              <div className="flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-ink-strong">Bordereau de Règlement {viewingPaiement.numeroBordereau}</h3>
              </div>
              <button
                onClick={() => setViewingPaiement(null)}
                className="p-1 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-hover"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs bg-surface-muted p-4 rounded-xl">
              <div>
                <span className="text-ink-faint block text-[10px]">Date Règlement</span>
                <span className="font-semibold text-ink-strong">{formatDate(viewingPaiement.datePaiement)}</span>
              </div>
              <div>
                <span className="text-indigo-500 block text-[10px]">Date Import / Saisie</span>
                <span className="font-semibold text-indigo-800">{formatDateTime(viewingPaiement.dateSaisie)}</span>
              </div>
              <div>
                <span className="text-ink-faint block text-[10px]">Société d'Assurance</span>
                <span className="font-semibold text-ink-strong">{getSocieteNom(viewingPaiement.societeId)}</span>
              </div>
              <div>
                <span className="text-ink-faint block text-[10px]">Mode de Règlement</span>
                <span className="font-semibold text-ink-strong">{viewingPaiement.modePaiement}</span>
              </div>
              <div>
                <span className="text-ink-faint block text-[10px]">Référence Transaction</span>
                <span className="font-semibold font-mono text-ink-strong">{viewingPaiement.referencePaiement}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-ink text-xs uppercase tracking-wider">Lignes & Prestations Réglées ({viewingPaiement?.lignes?.length || 0} actes)</h4>
                <div className="flex items-center gap-1.5 bg-surface-hover px-2 py-0.5 rounded text-[11px]">
                  <Layers className="w-3 h-3 text-emerald-600" />
                  <label className="text-ink font-medium flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupLinesInBordereau}
                      onChange={(e) => setGroupLinesInBordereau(e.target.checked)}
                      className="rounded border-line-strong text-emerald-600 focus:ring-emerald-500 w-3 h-3 cursor-pointer"
                    />
                    <span>Regrouper (même personne, date et acte)</span>
                  </label>
                </div>
              </div>

              <div className="overflow-x-auto border border-line rounded-lg">
                {groupLinesInBordereau ? (
                  <table className="w-full text-xs">
                    <thead className="bg-surface-hover text-ink-secondary">
                      <tr>
                        <th className="p-2 text-center">Date Soins</th>
                        <th className="p-2 text-left">Patient / Assuré</th>
                        <th className="p-2 text-left">Matricule</th>
                        <th className="p-2 text-left">Acte Regroupé</th>
                        <th className="p-2 text-left">Réf Prescription / Liaison</th>
                        <th className="p-2 text-center">Nb Actes</th>
                        <th className="p-2 text-right">Total Réclamé</th>
                        <th className="p-2 text-right">Ticket Modérateur</th>
                        <th className="p-2 text-right">Montant Réglé (Net)</th>
                        <th className="p-2 text-right">Montant Exclu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {groupLinesForSinglePayment(viewingPaiement.lignes, viewingPaiement.datePaiement).map(grp => (
                        <tr key={grp.groupKey}>
                          <td className="p-2 text-ink-secondary font-medium text-center">{formatDate(grp.dateSoins)}</td>
                          <td className="p-2 font-semibold text-ink-strong">{grp.nomAgent}</td>
                          <td className="p-2 font-mono text-[11px] text-ink-secondary">{grp.immatriculation}</td>
                          <td className="p-2">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold text-[10px] mr-1">
                              {grp.codeActe}
                            </span>
                            <span className="text-ink">{grp.libelleActe}</span>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              {grp.prestationNumero && grp.prestationNumero !== '-' ? (
                                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-xs inline-flex items-center gap-1">
                                  <FileText className="w-3 h-3 text-indigo-600" />
                                  <span>{grp.prestationNumero}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold shrink-0">
                                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                                  <span>Non relié</span>
                                </span>
                              )}
                              {grp.subLines && grp.subLines.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRelierModalContext({ paiement: viewingPaiement, lignePaiement: grp.subLines[0] });
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 transition-colors cursor-pointer shrink-0"
                                  title={grp.prestationNumero && grp.prestationNumero !== '-' ? "Changer la prestation reliée" : "Relier ce règlement à une facture de soins"}
                                >
                                  <Link2 className="w-3 h-3 text-indigo-600" />
                                  <span>{grp.prestationNumero && grp.prestationNumero !== '-' ? "Changer" : "Relier"}</span>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-center font-bold text-ink">{grp.nombreActes}</td>
                          <td className="p-2 text-right text-ink font-medium">{formatMoney(grp.totalReclame)}</td>
                          <td className="p-2 text-right text-amber-700 font-medium">{formatMoney(grp.ticketModerateur)}</td>
                          <td className="p-2 text-right font-bold text-emerald-700">{formatMoney(grp.totalPaye)}</td>
                          <td className="p-2 text-right text-rose-600 font-medium">{formatMoney(grp.montantExclu)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-surface-hover text-ink-secondary">
                      <tr>
                        <th className="p-2 text-center">Date Soins</th>
                        <th className="p-2 text-left">Matricule</th>
                        <th className="p-2 text-left">Assuré</th>
                        <th className="p-2 text-left">Réf Prescription / Liaison</th>
                        <th className="p-2 text-left">Acte / Commentaire</th>
                        <th className="p-2 text-right">Montant Réglé</th>
                        <th className="p-2 text-right">Ticket Modérateur</th>
                        <th className="p-2 text-right">Montant Exclu</th>
                        <th className="p-2 text-left">Observations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(viewingPaiement.lignes || []).map(l => (
                        <tr key={l.id}>
                          <td className="p-2 text-ink-secondary font-medium text-center">{l.dateSoins ? formatDate(l.dateSoins) : '-'}</td>
                          <td className="p-2 font-mono font-medium text-indigo-700">{l.immatriculation || '-'}</td>
                          <td className="p-2 font-semibold text-ink">{l.nomAgent || l.nomBaseAssurance}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              {l.prestationNumero && l.prestationNumero !== '-' ? (
                                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-xs inline-flex items-center gap-1">
                                  <FileText className="w-3 h-3 text-indigo-600" />
                                  <span>{l.prestationNumero}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold shrink-0">
                                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                                  <span>Non relié</span>
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRelierModalContext({ paiement: viewingPaiement, lignePaiement: l });
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 transition-colors cursor-pointer shrink-0"
                                title={l.prestationNumero && l.prestationNumero !== '-' ? "Changer la prestation reliée" : "Relier ce règlement à une facture de soins"}
                              >
                                <Link2 className="w-3 h-3 text-indigo-600" />
                                <span>{l.prestationNumero && l.prestationNumero !== '-' ? "Changer" : "Relier"}</span>
                              </button>
                            </div>
                          </td>
                          <td className="p-2">
                            {l.codeActe ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold text-[10px] mr-1">
                                {l.codeActe}
                              </span>
                            ) : null}
                            <span className="text-ink-secondary text-[11px]">{l.libelleActe || l.commentaire || '-'}</span>
                          </td>
                          <td className="p-2 text-right font-bold text-emerald-700">{formatMoney(l.totalPaye)}</td>
                          <td className="p-2 text-right text-amber-700 font-medium">{formatMoney(l.ticketModerateur)}</td>
                          <td className="p-2 text-right text-rose-600 font-medium">{formatMoney(l.montantExclu)}</td>
                          <td className="p-2 text-ink-muted text-[11px]">{l.commentaire || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 pt-3 border-t border-line-soft text-center text-xs">
              <div className="bg-surface-hover p-2 rounded-lg">
                <span className="text-[10px] text-ink-muted block">Total Réclamé</span>
                <span className="font-bold text-ink">{formatMoney(viewingPaiement.totalReclame)}</span>
              </div>
              <div className="bg-emerald-50 p-2 rounded-lg">
                <span className="text-[10px] text-emerald-700 block">Total Réglé (Net)</span>
                <span className="font-bold text-emerald-800">{formatMoney(viewingPaiement.totalPaye)}</span>
              </div>
              <div className="bg-amber-50 p-2 rounded-lg">
                <span className="text-[10px] text-amber-700 block">Ticket Modérateur</span>
                <span className="font-bold text-amber-800">{formatMoney(viewingPaiement.totalModerateur)}</span>
              </div>
              <div className="bg-rose-50 p-2 rounded-lg">
                <span className="text-[10px] text-rose-700 block">Exclusions / Rejets</span>
                <span className="font-bold text-rose-800">{formatMoney(viewingPaiement.totalExclu)}</span>
              </div>
            </div>

            {viewingPaiement.notes && (
              <div className="text-xs text-ink-secondary bg-surface-muted p-3 rounded-lg border border-line">
                <span className="font-semibold block text-ink">Notes du bordereau :</span>
                {viewingPaiement.notes}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  const toDel = viewingPaiement;
                  setViewingPaiement(null);
                  setPaiementToDelete(toDel);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer ce règlement</span>
              </button>

              <button
                onClick={() => setViewingPaiement(null)}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Saisie Manuelle de Règlement (FEN_Saisie_Paiement avec multi-personnes & recherche d'actes) */}
      <SaisieReglementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        societes={societes}
        personnes={personnes}
        prestations={prestations}
        familles={familles}
        selectedSocieteId={selectedSocieteId}
        onSavePaiement={(newPaiement, updatedPrestations) => {
          onSavePaiement(newPaiement, updatedPrestations);
          setIsCreateModalOpen(false);
        }}
      />

      {/* Decompte Import Modal */}
      <DecompteImportModal
        isOpen={isDecompteModalOpen}
        onClose={() => setIsDecompteModalOpen(false)}
        societes={societes}
        personnes={personnes}
        prestations={prestations}
        familles={familles}
        paiements={paiements}
        onSavePaiement={(newPaiement, updatedPrestations, newSocietes, newPersonnes) => {
          if (onImportPaiements) {
            onImportPaiements(newPaiement, updatedPrestations, newSocietes, newPersonnes);
          } else {
            onSavePaiement(newPaiement, updatedPrestations);
          }
        }}
      />

      {/* Confirmation Modal: Delete Entire Payment / Bordereau */}
      {paiementToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-rose-100 flex flex-col">
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 text-rose-900">
                <div className="p-2 bg-rose-100 rounded-xl text-rose-700">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Supprimer le Règlement ?</h3>
                  <p className="text-xs text-rose-700 font-medium">Bordereau comptable N° {paiementToDelete.numeroBordereau}</p>
                </div>
              </div>
              <button
                onClick={() => setPaiementToDelete(null)}
                className="p-1.5 text-rose-400 hover:text-rose-700 hover:bg-rose-100 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-ink">
              <p className="text-sm">
                Êtes-vous sûr de vouloir supprimer définitivement ce bordereau de règlement ?
              </p>

              <div className="bg-surface-muted border border-line rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-center py-1 border-b border-line-soft">
                  <span className="text-ink-muted font-medium">N° Bordereau :</span>
                  <span className="font-mono font-bold text-ink-strong">{paiementToDelete.numeroBordereau}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-line-soft">
                  <span className="text-ink-muted font-medium">Société / Garant :</span>
                  <span className="font-semibold text-ink-strong">
                    {societes.find(s => s.id === paiementToDelete.societeId)?.nom || 'Société'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-line-soft">
                  <span className="text-ink-muted font-medium">Date de règlement :</span>
                  <span className="font-semibold text-ink-strong">{formatDate(paiementToDelete.datePaiement)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-line-soft">
                  <span className="text-indigo-600 font-medium">Date import / saisie :</span>
                  <span className="font-semibold text-indigo-800">{formatDateTime(paiementToDelete.dateSaisie)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-line-soft">
                  <span className="text-ink-muted font-medium">Mode & Réf :</span>
                  <span className="font-semibold text-ink-strong">
                    {paiementToDelete.modePaiement} {paiementToDelete.referencePaiement ? `(${paiementToDelete.referencePaiement})` : ''}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-line-soft">
                  <span className="text-ink-muted font-medium">Lignes / Actes réglés :</span>
                  <span className="font-semibold text-ink-strong">{paiementToDelete?.lignes?.length || 0} acte(s)</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-line-soft">
                  <span className="text-ink-muted font-medium">Total Réclamé :</span>
                  <span className="font-semibold text-ink">{formatMoney(paiementToDelete.totalReclame)}</span>
                </div>
                <div className="flex justify-between items-center py-1 bg-emerald-50/70 -mx-1 px-2 rounded-lg">
                  <span className="text-emerald-900 font-bold">Montant Total Réglé (Net) :</span>
                  <span className="font-bold text-emerald-700 text-sm">{formatMoney(paiementToDelete.totalPaye)}</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Conséquence de la suppression :</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Les montants réglés seront déduits de toutes les factures et actes associés. Leurs statuts repasseront automatiquement en <strong>« En attente » / non soldé</strong>.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-surface-muted border-t border-line-soft flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPaiementToDelete(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-line text-ink bg-surface hover:bg-surface-hover transition cursor-pointer"
              >
                Non, Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  if (paiementToDelete) {
                    onDeletePaiement(paiementToDelete.id);
                    setPaiementToDelete(null);
                  }
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Oui, Supprimer définitivement ce règlement</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Relier Règlement à Prestation */}
      {relierModalContext && (
        <RelierPaiementModal
          isOpen={Boolean(relierModalContext)}
          onClose={() => setRelierModalContext(null)}
          paiement={relierModalContext.paiement}
          lignePaiement={relierModalContext.lignePaiement}
          prestations={prestations || []}
          onSavePaiement={(updatedPaiement, updatedPrestations) => {
            onSavePaiement(updatedPaiement, updatedPrestations);
            if (viewingPaiement && viewingPaiement.id === updatedPaiement.id) {
              setViewingPaiement(updatedPaiement);
            }
          }}
        />
      )}
    </div>
  );
};
