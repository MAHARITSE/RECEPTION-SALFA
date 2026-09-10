import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Search,
  Download,
  Filter,
  FileText,
  Building,
  Building2,
  XCircle,
  HelpCircle,
  Eye,
  Printer,
  DollarSign,
  UserCheck,
  Receipt,
  RotateCcw,
  EyeOff,
  Trash2
} from 'lucide-react';
import { Prestation, Paiement, Societe, Personne, Famille } from '../types';
import { formatMoney, formatDate } from '../utils/formatters';
import { maskNom } from '../utils/inputMasks';
import { FacturesRejetsGroupedTable, GroupedRejetFacture, RejetFactureSortField } from './FacturesRejetsGroupedTable';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type RejetViewMode = 'bordereau' | 'detaillee';

export interface RejetDetail {
  id: string;
  type: 'prestation_complete' | 'acte_isole' | 'exclusion_decompte';
  prestationId: string;
  numeroFacture: string;
  dateSoins: string;
  societeId: string;
  societeNom: string;
  sousSociete?: string;
  nomAgent: string;
  matricule: string;
  codeActe: string;
  libelleActe: string;
  montantInitial: number;
  montantExcluRejete: number;
  motif: string;
  bordereauPaiement?: string;
  datePaiement?: string;
  /** Sources techniques du rejet : lignes de règlement portant le montant exclu.
   *  Utilisées pour la suppression réelle (remise à zéro des exclusions). */
  sources?: { paiementId: string; lignePaiementId: string }[];
}

interface RejetsViewProps {
  prestations: Prestation[];
  paiements: Paiement[];
  societes: Societe[];
  personnes: Personne[];
  familles: Famille[];
  selectedSocieteId: string;
  onSavePrestation?: (prestation: Prestation) => void;
  /** Suppression réelle d'un rejet : remet à zéro les exclusions dans les
   *  règlements et/ou le statut de la prestation, puis recalcule tout. */
  onDeleteRejet?: (rejet: RejetDetail) => void;
}

export const RejetsView: React.FC<RejetsViewProps> = ({
  prestations,
  paiements,
  societes,
  personnes,
  familles,
  selectedSocieteId,
  onSavePrestation,
  onDeleteRejet,
}) => {
  // Mode de vue : 'bordereau' (Vue par Facture / Bordereau) ou 'detaillee' (Vue Détaillée Dossiers)
  const [viewMode, setViewMode] = useState<RejetViewMode>('bordereau');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterSociete, setFilterSociete] = useState<string>('ALL');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  // Sorting for grouped facture view
  const [factureSortField, setFactureSortField] = useState<RejetFactureSortField>('numeroFacture');
  const [factureSortDirection, setFactureSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedFactureRows, setExpandedFactureRows] = useState<Record<string, boolean>>({});

  const toggleFactureRow = (num: string) => {
    setExpandedFactureRows(prev => ({
      ...prev,
      [num]: !prev[num]
    }));
  };

  const handleFactureSort = (field: RejetFactureSortField) => {
    if (factureSortField === field) {
      setFactureSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setFactureSortField(field);
      setFactureSortDirection('asc');
    }
  };

  // Dismissed/hidden rejets set
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('suivi_rejets_dismissed_ids');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [showDismissed, setShowDismissed] = useState<boolean>(false);

  const handleDismissRejet = (id: string, numFacture: string) => {
    setDismissedIds(prev => {
      const updated = Array.from(new Set([...prev, id, numFacture]));
      try {
        localStorage.setItem('suivi_rejets_dismissed_ids', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleRestoreRejet = (id: string, numFacture: string) => {
    setDismissedIds(prev => {
      const updated = prev.filter(item => item !== id && item !== numFacture);
      try {
        localStorage.setItem('suivi_rejets_dismissed_ids', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Suppression réelle d'un rejet (avec confirmation)
  const [rejetToDelete, setRejetToDelete] = useState<RejetDetail | null>(null);

  const confirmDeleteRejet = () => {
    if (!rejetToDelete) return;
    // Nettoyage de la liste des rejets masqués si ce rejet y figurait
    setDismissedIds(prev => {
      const updated = prev.filter(item => item !== rejetToDelete.id);
      try {
        localStorage.setItem('suivi_rejets_dismissed_ids', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    onDeleteRejet?.(rejetToDelete);
    setRejetToDelete(null);
  };

  // 1. Extraction et compilation dynamique de TOUS les rejets SANS DOUBLONS
  const allRejets = useMemo<RejetDetail[]>(() => {
    const rejetsMap = new Map<string, RejetDetail>();
    const entityToCanonicalKey = new Map<string, string>();

    const getCanonicalKeyFor = (aliases: string[]): string | null => {
      for (const a of aliases) {
        if (a && entityToCanonicalKey.has(a)) {
          return entityToCanonicalKey.get(a)!;
        }
      }
      return null;
    };

    const registerAliases = (canonicalKey: string, aliases: string[]) => {
      aliases.forEach(a => {
        if (a) entityToCanonicalKey.set(a, canonicalKey);
      });
    };

    // A. D'abord les exclusions / rejets issus des décomptes et règlements (Paiements)
    paiements.forEach((paie) => {
      const soc = societes.find((s) => s.id === paie.societeId);
      const socName = paie.societeNom || soc?.nom || 'Assurance';

      paie.lignes?.forEach((l) => {
        if (l.montantExclu > 0) {
          const prest = prestations.find((p) => p.id === l.prestationId) ||
            prestations.find((p) => p.numeroFacture === l.prestationNumero && (p.matricule === l.immatriculation || p.nomAgent === l.nomAgent));
          const pers = personnes.find((pe) => pe.id === prest?.personneId);
          const patientName = l.nomAgent || paie.nomAgent || prest?.nomAgent || pers?.nomPrenom || 'Agent';
          const mat = l.immatriculation || paie.matricule || prest?.matricule || pers?.matricule || '-';
          const numFacture = l.prestationNumero || prest?.numeroFacture || 'S/N';
          const codeActe = l.codeActe || 'EXCLU';
          const dateSoins = l.dateSoins || paie.dateSoins || prest?.date || paie.datePaiement;

          const aliases = [
            l.lignePrestationId ? `line_${l.lignePrestationId}` : '',
            l.prestationId && codeActe ? `prest_acte_${l.prestationId}_${codeActe}` : '',
            l.prestationId ? `prest_${l.prestationId}` : '',
            numFacture && mat && codeActe ? `sig_${numFacture}_${mat}_${codeActe}` : '',
            numFacture && patientName && codeActe ? `sig_${numFacture}_${patientName}_${codeActe}` : '',
            `paie_ligne_${paie.id}_${l.id}`,
          ].filter(Boolean);

          const existingKey = getCanonicalKeyFor(aliases);

          if (existingKey && rejetsMap.has(existingKey)) {
            const existing = rejetsMap.get(existingKey)!;
            existing.montantExcluRejete += l.montantExclu;
            if (l.commentaire && !existing.motif.includes(l.commentaire)) {
              existing.motif += ` | ${l.commentaire}`;
            }
            if (paie.numeroBordereau && !existing.bordereauPaiement?.includes(paie.numeroBordereau)) {
              existing.bordereauPaiement = existing.bordereauPaiement 
                ? `${existing.bordereauPaiement}, ${paie.numeroBordereau}` 
                : paie.numeroBordereau;
            }
            existing.sources = [
              ...(existing.sources || []),
              { paiementId: paie.id, lignePaiementId: l.id },
            ];
            registerAliases(existingKey, aliases);
          } else {
            const canonicalKey = aliases[0] || `rejet_${paie.id}_${l.id}`;

            const item: RejetDetail = {
              id: canonicalKey,
              type: 'exclusion_decompte',
              prestationId: l.prestationId || prest?.id || '',
              numeroFacture: numFacture,
              dateSoins: dateSoins,
              societeId: paie.societeId || prest?.societeId || '',
              societeNom: socName,
              sousSociete: paie.sousSociete || prest?.sousSociete,
              nomAgent: patientName,
              matricule: mat,
              codeActe: codeActe,
              libelleActe: l.libelleActe || 'Exclusion sur règlement',
              montantInitial: l.montantReclame || (l.totalPaye + l.montantExclu + l.ticketModerateur) || prest?.totalPrestation || l.montantExclu,
              montantExcluRejete: l.montantExclu,
              motif: l.commentaire || paie.notes || 'Exclusion ou rejet notifié sur bordereau de règlement',
              bordereauPaiement: paie.numeroBordereau,
              datePaiement: paie.datePaiement,
              sources: [{ paiementId: paie.id, lignePaiementId: l.id }],
            };

            rejetsMap.set(canonicalKey, item);
            registerAliases(canonicalKey, aliases);
          }
        }
      });
    });

    // B. Ensuite les Prestations rejetées ou actes isolés rejetés non encore couverts par un règlement
    prestations.forEach((p) => {
      const pers = personnes.find((pe) => pe.id === p.personneId);
      const soc = societes.find((s) => s.id === p.societeId);
      const socName = p.societeNom || soc?.nom || 'Assurance Inconnue';
      const patientName = p.nomAgent || pers?.nomPrenom || 'Agent non identifié';
      const mat = p.matricule || pers?.matricule || '-';

      if (p.lignes && p.lignes.length > 0) {
        p.lignes.forEach((l) => {
          if (l.statut === 'Rejeté' || p.statut === 'Rejeté') {
            const aliases = [
              `line_${l.id}`,
              `prest_acte_${p.id}_${l.code}`,
              `sig_${p.numeroFacture}_${mat}_${l.code}`,
              `sig_${p.numeroFacture}_${patientName}_${l.code}`,
              `prest_${p.id}`,
            ];

            const existingKey = getCanonicalKeyFor(aliases);
            if (existingKey && rejetsMap.has(existingKey)) {
              return;
            }

            const canonicalKey = `line_${l.id}`;
            const mntRejet = l.montantARembourser || (l.totalPrestation - (l.ticketModerateur || 0)) || l.totalPrestation || 0;

            const item: RejetDetail = {
              id: canonicalKey,
              type: p.statut === 'Rejeté' && p.lignes?.every(x => x.statut === 'Rejeté') ? 'prestation_complete' : 'acte_isole',
              prestationId: p.id,
              numeroFacture: p.numeroFacture,
              dateSoins: p.date,
              societeId: p.societeId,
              societeNom: socName,
              sousSociete: p.sousSociete,
              nomAgent: patientName,
              matricule: mat,
              codeActe: l.code || 'ACTE',
              libelleActe: l.libelle || 'Acte médical',
              montantInitial: l.totalPrestation || 0,
              montantExcluRejete: mntRejet,
              motif: p.commentaires || 'Acte ou prestation rejeté par le tiers-payeur',
            };

            rejetsMap.set(canonicalKey, item);
            registerAliases(canonicalKey, aliases);
          }
        });
      } else if (p.statut === 'Rejeté') {
        const aliases = [
          `prest_${p.id}`,
          `sig_${p.numeroFacture}_${mat}_GLOBAL`,
          `sig_${p.numeroFacture}_${patientName}_GLOBAL`,
        ];

        const existingKey = getCanonicalKeyFor(aliases);
        if (existingKey && rejetsMap.has(existingKey)) {
          return;
        }

        const canonicalKey = `prest_${p.id}`;
        const montantCharge = Number(p.montantARembourser ?? Math.max(0, p.totalPrestation - p.participation));

        const item: RejetDetail = {
          id: canonicalKey,
          type: 'prestation_complete',
          prestationId: p.id,
          numeroFacture: p.numeroFacture,
          dateSoins: p.date,
          societeId: p.societeId,
          societeNom: socName,
          sousSociete: p.sousSociete,
          nomAgent: patientName,
          matricule: mat,
          codeActe: 'GLOBAL',
          libelleActe: 'Prestation médicale complète',
          montantInitial: p.totalPrestation,
          montantExcluRejete: montantCharge,
          motif: p.commentaires || 'Rejet intégral de la facture',
        };

        rejetsMap.set(canonicalKey, item);
        registerAliases(canonicalKey, aliases);
      }
    });

    return Array.from(rejetsMap.values());
  }, [prestations, paiements, societes, personnes]);

  // 2. Filtrage des rejets
  const filteredRejets = useMemo(() => {
    return allRejets.filter((item) => {
      const isDismissed = dismissedIds.includes(item.id) || dismissedIds.includes(item.numeroFacture);
      if (!showDismissed && isDismissed) {
        return false;
      }
      if (showDismissed && !isDismissed) {
        return false;
      }

      const effectiveSocFilter = (selectedSocieteId && selectedSocieteId !== 'ALL') ? selectedSocieteId : filterSociete;
      const matchesSoc = !effectiveSocFilter || effectiveSocFilter === 'ALL' || item.societeId === effectiveSocFilter;

      const matchesType = filterType === 'ALL' || item.type === filterType;

      const matchesDateStart = !dateStart || item.dateSoins >= dateStart;
      const matchesDateEnd = !dateEnd || item.dateSoins <= dateEnd;

      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.numeroFacture.toLowerCase().includes(q) ||
        item.nomAgent.toLowerCase().includes(q) ||
        item.matricule.toLowerCase().includes(q) ||
        item.societeNom.toLowerCase().includes(q) ||
        item.codeActe.toLowerCase().includes(q) ||
        item.libelleActe.toLowerCase().includes(q) ||
        item.motif.toLowerCase().includes(q) ||
        (item.bordereauPaiement && item.bordereauPaiement.toLowerCase().includes(q));

      return matchesSoc && matchesType && matchesDateStart && matchesDateEnd && matchesSearch;
    });
  }, [allRejets, selectedSocieteId, filterSociete, filterType, dateStart, dateEnd, searchTerm]);

  // 3. Indicateurs Synthétiques (KPIs)
  const totalMontantRejete = useMemo(() => {
    return filteredRejets.reduce((sum, r) => sum + r.montantExcluRejete, 0);
  }, [filteredRejets]);

  const totalBrutConcerne = useMemo(() => {
    return filteredRejets.reduce((sum, r) => sum + r.montantInitial, 0);
  }, [filteredRejets]);

  // 3.B. Regroupement par Facture / Bordereau
  const groupedFactures = useMemo<GroupedRejetFacture[]>(() => {
    const groups: Record<string, {
      numeroFacture: string;
      societeId: string;
      societeNom: string;
      sousSocietes: Set<string>;
      dates: string[];
      rejets: RejetDetail[];
      assuresSet: Set<string>;
      totalMontantBrut: number;
      totalMontantRejete: number;
      hasDismissed: boolean;
    }> = {};

    filteredRejets.forEach(r => {
      const numFacture = r.numeroFacture || 'SANS_FACTURE';
      if (!groups[numFacture]) {
        groups[numFacture] = {
          numeroFacture: numFacture,
          societeId: r.societeId,
          societeNom: r.societeNom,
          sousSocietes: new Set<string>(),
          dates: [],
          rejets: [],
          assuresSet: new Set<string>(),
          totalMontantBrut: 0,
          totalMontantRejete: 0,
          hasDismissed: false
        };
      }

      const g = groups[numFacture];
      if (r.sousSociete) g.sousSocietes.add(r.sousSociete);
      if (r.dateSoins) g.dates.push(r.dateSoins);
      g.rejets.push(r);
      if (r.nomAgent || r.matricule) {
        g.assuresSet.add(`${r.nomAgent}_${r.matricule}`);
      }
      g.totalMontantBrut += r.montantInitial;
      g.totalMontantRejete += r.montantExcluRejete;
    });

    const result: GroupedRejetFacture[] = Object.values(groups).map(g => {
      const sortedDates = [...g.dates].sort();
      const dateMin = sortedDates[0] || '';
      const dateMax = sortedDates[sortedDates.length - 1] || '';

      const taux = g.totalMontantBrut > 0 
        ? Math.min(100, (g.totalMontantRejete / g.totalMontantBrut) * 100)
        : (g.totalMontantRejete > 0 ? 100 : 0);

      return {
        numeroFacture: g.numeroFacture,
        societeId: g.societeId,
        societeNom: g.societeNom,
        sousSocietes: Array.from(g.sousSocietes),
        dateMin,
        dateMax,
        rejets: g.rejets,
        nombreAssures: g.assuresSet.size || 1,
        nombreLignesRejet: g.rejets.length,
        totalMontantBrut: g.totalMontantBrut,
        totalMontantRejete: g.totalMontantRejete,
        tauxRejet: taux,
      };
    });

    // Sort grouped factures
    return result.sort((a, b) => {
      let comparison = 0;
      switch (factureSortField) {
        case 'numeroFacture':
          comparison = a.numeroFacture.localeCompare(b.numeroFacture, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'date':
          comparison = (a.dateMin || '').localeCompare(b.dateMin || '');
          break;
        case 'societe':
          comparison = a.societeNom.localeCompare(b.societeNom);
          break;
        case 'nombreAssures':
          comparison = a.nombreAssures - b.nombreAssures;
          break;
        case 'nombreLignesRejet':
          comparison = a.nombreLignesRejet - b.nombreLignesRejet;
          break;
        case 'totalMontantBrut':
          comparison = a.totalMontantBrut - b.totalMontantBrut;
          break;
        case 'totalMontantRejete':
          comparison = a.totalMontantRejete - b.totalMontantRejete;
          break;
        case 'tauxRejet':
          comparison = a.tauxRejet - b.tauxRejet;
          break;
        default:
          comparison = 0;
      }
      return factureSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRejets, factureSortField, factureSortDirection]);

  // Exporter la liste en Excel
  const handleExportExcel = () => {
    const rows = filteredRejets.map((r) => ({
      'Type Rejet':
        r.type === 'prestation_complete'
          ? 'Facture Intégrale Rejetée'
          : r.type === 'acte_isole'
          ? 'Acte Médical Rejeté'
          : 'Exclusion sur Décompte',
      'N° Facture': r.numeroFacture,
      'Date Soins': formatDate(r.dateSoins),
      Organisme: r.societeNom + (r.sousSociete ? ` (${r.sousSociete})` : ''),
      'Nom Assuré / Patient': r.nomAgent,
      Matricule: r.matricule,
      'Code Acte': r.codeActe,
      'Libellé Acte': r.libelleActe,
      'Montant Initial (Ar)': r.montantInitial,
      'Montant Rejeté / Exclu (Ar)': r.montantExcluRejete,
      'Motif du Rejet': r.motif,
      'Bordereau Règlement': r.bordereauPaiement || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rejets_Exclusions');
    XLSX.writeFile(wb, `Etat_Rejets_Assurance_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Génération PDF : Bordereau des Rejets
  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const dateGen = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('SALFA - ÉTABLISSEMENT MÉDICAL & SOINS', 14, 12);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Édité le : ${dateGen}`, 283, 12, { align: 'right' });

    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28);
    doc.text('BORDEREAU DÉTAILLÉ DES REJETS & EXCLUSIONS', 14, 24);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const socObj = societes.find((s) => s.id === (selectedSocieteId !== 'ALL' ? selectedSocieteId : filterSociete));
    doc.text(
      `Tiers-Payeur : ${socObj ? socObj.nom : 'Tous les organismes'} | ${filteredRejets.length} dossier(s) rejeté(s) / exclu(s)`,
      14,
      30
    );

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(254, 242, 242);
    doc.roundedRect(14, 34, 269, 12, 1.5, 1.5, 'FD');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28);
    doc.text(`TOTAL REJETS & EXCLUSIONS : ${formatMoney(totalMontantRejete)}`, 20, 41.5);

    doc.setTextColor(51, 65, 85);
    doc.text(`Montant Initial Concerné : ${formatMoney(totalBrutConcerne)}`, 130, 41.5);
    doc.text(`Nombre de Dossiers : ${filteredRejets.length}`, 210, 41.5);

    const headers = [
      'N° Facture',
      'Date',
      'Organisme / Tiers-Payeur',
      'Patient / Assuré',
      'Matricule',
      'Acte / Code',
      'Montant Brut',
      'Montant Rejeté',
      'Motif du Rejet',
    ];

    const tableRows = filteredRejets.map((r) => [
      r.numeroFacture,
      formatDate(r.dateSoins),
      r.societeNom + (r.sousSociete ? ` (${r.sousSociete})` : ''),
      r.nomAgent,
      r.matricule,
      `${r.codeActe} - ${r.libelleActe}`,
      formatMoney(r.montantInitial),
      formatMoney(r.montantExcluRejete),
      r.motif,
    ]);

    tableRows.push([
      `TOTAL GÉNÉRAL (${filteredRejets.length} rejets)`,
      '',
      '',
      '',
      '',
      '',
      formatMoney(totalBrutConcerne),
      formatMoney(totalMontantRejete),
      '',
    ]);

    autoTable(doc, {
      startY: 50,
      head: [headers],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [185, 28, 28],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: [30, 41, 59],
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 28, textColor: [67, 56, 202] },
        1: { cellWidth: 22 },
        2: { cellWidth: 42 },
        3: { fontStyle: 'bold', cellWidth: 42 },
        4: { cellWidth: 22 },
        5: { cellWidth: 38 },
        6: { halign: 'right', cellWidth: 26 },
        7: { halign: 'right', fontStyle: 'bold', cellWidth: 26, textColor: [185, 28, 28] },
        8: { cellWidth: 23 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [254, 242, 242];
        }
      },
    });

    doc.save(`Bordereau_Rejets_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div id="rejets-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-6 h-6 text-rose-600" />
            <h2 className="text-xl font-bold text-ink-strong">Tableau de Bord des Rejets & Exclusions</h2>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">
            Suivi centralisé des factures rejetées, actes exclus et contestations auprès des compagnies d'assurance
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Bouton pour basculer les rejets masqués */}
          <button
            onClick={() => setShowDismissed(prev => !prev)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              showDismissed
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-surface border-line text-ink-secondary hover:bg-surface-muted'
            }`}
            title={showDismissed ? 'Afficher les rejets actifs' : 'Afficher les rejets archivés/masqués'}
          >
            {showDismissed ? <Eye className="w-3.5 h-3.5 text-amber-700" /> : <EyeOff className="w-3.5 h-3.5 text-ink-faint" />}
            <span>{showDismissed ? 'Rejets Masqués (' + dismissedIds.length + ')' : 'Masqués (' + dismissedIds.length + ')'}</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface border border-line text-ink hover:bg-surface-muted shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel</span>
          </button>

          <button
            onClick={handleExportPdf}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimer Bordereau (PDF)</span>
          </button>
        </div>
      </div>

      {/* View Mode Switcher Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
        <div className="inline-flex p-1 bg-surface-hover rounded-xl border border-line text-xs">
          <button
            type="button"
            onClick={() => setViewMode('bordereau')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'bordereau'
                ? 'bg-surface text-rose-700 shadow-2xs'
                : 'text-ink-secondary hover:text-ink-strong'
            }`}
          >
            <Receipt className="w-3.5 h-3.5 text-rose-600" />
            <span>Vue par Bordereau / Facture</span>
            <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-rose-100 text-rose-800 font-bold">
              {groupedFactures.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('detaillee')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'detaillee'
                ? 'bg-surface text-rose-700 shadow-2xs'
                : 'text-ink-secondary hover:text-ink-strong'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-ink-secondary" />
            <span>Vue Détaillée (Dossiers)</span>
            <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-surface-active text-ink font-bold">
              {filteredRejets.length}
            </span>
          </button>
        </div>

        <div className="text-xs text-ink-muted font-medium">
          {viewMode === 'bordereau' 
            ? `${groupedFactures.length} facture(s) avec des rejets ou exclusions identifiés`
            : `${filteredRejets.length} dossier(s) / acte(s) médical(aux) rejeté(s)`
          }
        </div>
      </div>

      {/* Cartouches d'indicateurs (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface p-4 rounded-xl border border-rose-200 shadow-xs bg-gradient-to-br from-rose-50/40 to-white">
          <div className="flex items-center justify-between text-rose-700 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Montant Total Rejeté</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700">{formatMoney(totalMontantRejete)}</div>
          <div className="text-[11px] text-ink-muted mt-1">
            Sur {formatMoney(totalBrutConcerne)} de soins facturés
          </div>
        </div>

        <div className="bg-surface p-4 rounded-xl border border-line shadow-xs">
          <div className="flex items-center justify-between text-ink-secondary mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Dossiers / Actes Rejetés</span>
            <FileText className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-ink-strong">{filteredRejets.length}</div>
          <div className="text-[11px] text-ink-muted mt-1">
            Nombre de lignes d'impayés non pris en charge
          </div>
        </div>
      </div>

      {/* Barre de Filtres */}
      <div className="bg-surface p-4 rounded-xl border border-line shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {/* Recherche */}
        <div className="md:col-span-1">
          <label className="block text-ink-muted font-medium mb-1">Recherche rapide</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-ink-faint" />
            <input
              type="text"
              placeholder="Facture, patient, acte, motif..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(maskNom(e.target.value))}
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-line focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Organisme / Assurance */}
        <div>
          <label className="block text-ink-muted font-medium mb-1">Tiers-Payeur / Société</label>
          <select
            value={selectedSocieteId !== 'ALL' ? selectedSocieteId : filterSociete}
            onChange={(e) => setFilterSociete(e.target.value)}
            disabled={selectedSocieteId !== 'ALL'}
            className="w-full p-1.5 rounded-lg border border-line focus:ring-2 focus:ring-rose-500 focus:outline-none disabled:bg-surface-hover disabled:text-ink-muted"
          >
            <option value="ALL">Toutes les assurances</option>
            {societes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </div>

        {/* Type de Rejet */}
        <div>
          <label className="block text-ink-muted font-medium mb-1">Type de Rejet</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full p-1.5 rounded-lg border border-line focus:ring-2 focus:ring-rose-500 focus:outline-none"
          >
            <option value="ALL">Tous les types</option>
            <option value="prestation_complete">Facture intégrale rejetée</option>
            <option value="acte_isole">Acte spécifique rejeté</option>
            <option value="exclusion_decompte">Exclusion sur décompte</option>
          </select>
        </div>

        {/* Dates */}
        <div>
          <label className="block text-ink-muted font-medium mb-1">Période (Du / Au)</label>
          <div className="flex items-center space-x-1">
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-1/2 p-1.5 rounded-lg border border-line text-[11px] focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-1/2 p-1.5 rounded-lg border border-line text-[11px] focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Tableau des Rejets selon le mode de vue sélectionné */}
      {viewMode === 'bordereau' ? (
        <FacturesRejetsGroupedTable
          groupedFactures={groupedFactures}
          expandedRows={expandedFactureRows}
          toggleRow={toggleFactureRow}
          sortField={factureSortField}
          sortDirection={factureSortDirection}
          onSort={handleFactureSort}
          onDismissRejet={handleDismissRejet}
          onRestoreRejet={handleRestoreRejet}
          onDeleteRejet={onDeleteRejet ? (r) => setRejetToDelete(r) : undefined}
          showDismissed={showDismissed}
        />
      ) : (
        <div className="bg-surface rounded-xl border border-line shadow-xs overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-surface-muted text-ink-secondary uppercase text-[11px] font-semibold border-b border-line select-none shadow-2xs">
                <tr>
                  <th className="py-3 px-3.5">Type & Facture</th>
                  <th className="py-3 px-3">Date Soins</th>
                  <th className="py-3 px-3">Tiers-Payeur / Assuré</th>
                  <th className="py-3 px-3">Acte Médical Concerné</th>
                  <th className="py-3 px-3 text-right">Montant Brut</th>
                  <th className="py-3 px-3 text-right">Montant Rejeté</th>
                  <th className="py-3 px-3">Motif du Rejet / Observation</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRejets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-ink-faint">
                      <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold">Aucun rejet ni exclusion trouvé pour ces critères.</p>
                      <p className="text-[11px] text-ink-faint mt-0.5">
                        Modifiez les filtres de recherche ou sélectionnez un autre organisme.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredRejets.map((item) => {
                    return (
                      <tr key={item.id} className="hover:bg-rose-50/30 transition-colors">
                        {/* Type & Facture */}
                        <td className="py-3 px-3.5">
                          <div className="font-bold text-indigo-700 flex items-center space-x-1.5 font-mono">
                            <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{item.numeroFacture}</span>
                          </div>
                          <div className="text-[10px] mt-0.5">
                            {item.type === 'prestation_complete' && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold">
                                Facture intégrale
                              </span>
                            )}
                            {item.type === 'acte_isole' && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                                Acte isolé
                              </span>
                            )}
                            {item.type === 'exclusion_decompte' && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-surface-hover text-ink font-semibold">
                                Exclusion décompte
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Date */}
                        <td className="py-3 px-3 text-ink-secondary font-medium whitespace-nowrap">
                          {formatDate(item.dateSoins)}
                        </td>

                        {/* Tiers-Payeur / Assuré */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-ink">
                            {item.societeNom}
                            {item.sousSociete && (
                              <span className="text-[10px] text-ink-muted font-normal ml-1">
                                ({item.sousSociete})
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-secondary flex items-center space-x-1 mt-0.5">
                            <span>{item.nomAgent}</span>
                            <span className="text-ink-faint font-mono text-[10px]">({item.matricule})</span>
                          </div>
                        </td>

                        {/* Acte */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-ink">
                            <span className="text-indigo-600 font-bold font-mono mr-1">{item.codeActe}</span>
                            {item.libelleActe}
                          </div>
                        </td>

                        {/* Montant Brut */}
                        <td className="py-3 px-3 text-right text-ink-secondary font-medium whitespace-nowrap">
                          {formatMoney(item.montantInitial)}
                        </td>

                        {/* Montant Rejeté */}
                        <td className="py-3 px-3 text-right font-black text-rose-700 bg-rose-50/50 whitespace-nowrap font-mono text-sm">
                          {formatMoney(item.montantExcluRejete)}
                        </td>

                        {/* Motif */}
                        <td className="py-3 px-3 max-w-[220px]">
                          <p className="text-[11px] text-ink truncate" title={item.motif}>
                            {item.motif}
                          </p>
                          {item.bordereauPaiement && (
                            <div className="text-[10px] text-ink-muted mt-0.5">
                              Bordereau : <span className="font-mono font-bold text-ink">{item.bordereauPaiement}</span>
                            </div>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-3 px-3 text-center space-x-1.5 whitespace-nowrap">
                          {showDismissed ? (
                            <button
                              onClick={() => handleRestoreRejet(item.id, item.numeroFacture)}
                              className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-semibold text-[11px] transition-colors cursor-pointer shadow-2xs"
                              title="Restaurer ce rejet dans la liste active"
                            >
                              Restaurer
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDismissRejet(item.id, item.numeroFacture)}
                              className="px-2 py-1 rounded-lg bg-surface-muted border border-line text-ink-muted hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 font-semibold text-[11px] transition-colors cursor-pointer shadow-2xs"
                              title="Masquer ce rejet de la liste"
                            >
                              Masquer
                            </button>
                          )}
                          {onDeleteRejet && (
                            <button
                              onClick={() => setRejetToDelete(item)}
                              className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-semibold text-[11px] transition-colors cursor-pointer shadow-2xs"
                              title="Supprimer définitivement ce rejet : remet à zéro les montants exclus du règlement et recalcule la prestation"
                            >
                              Supprimer
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bar de Totaux Généraux en Vue Détaillée */}
          <div className="sticky bottom-0 z-20 shrink-0 bg-slate-900 text-white border-t border-slate-800 px-4 py-3 shadow-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 font-bold uppercase text-slate-300 tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
              <span>Total Rejets Détaillés ({filteredRejets.length} dossiers)</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono font-bold">
              <div className="text-right">
                <span className="text-[10px] uppercase font-sans text-ink-faint block font-normal">Total Facturé</span>
                <span className="text-slate-100">{formatMoney(totalBrutConcerne)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-sans text-rose-400 block font-normal">Total Rejeté</span>
                <span className="text-rose-400 font-extrabold text-sm">{formatMoney(totalMontantRejete)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-sans text-ink-faint block font-normal">Impact Global</span>
                <span className="text-amber-300">
                  {totalBrutConcerne > 0 ? ((totalMontantRejete / totalBrutConcerne) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal : Suppression réelle d'un rejet */}
      {rejetToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* En-tête */}
            <div className="bg-rose-50 border-b border-rose-200 px-5 py-4 flex items-start justify-between rounded-t-2xl">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-bold text-rose-900">Supprimer définitivement ce rejet ?</h3>
              </div>
              <button
                onClick={() => setRejetToDelete(null)}
                className="text-rose-400 hover:text-rose-600 transition cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Corps */}
            <div className="p-5 space-y-3">
              <p className="text-xs text-ink-secondary bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Cette action annule le rejet dans les données réelles : les montants exclus seront remis à
                zéro sur le(s) règlement(s) concerné(s) et/ou le statut de la prestation sera réinitialisé,
                puis les prestations seront recalculées (montants payés, reste à recouvrer, statut).
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-surface-muted rounded-lg px-3 py-2">
                  <span className="text-ink-faint block text-[10px] uppercase font-semibold">N° Facture</span>
                  <span className="font-mono font-bold text-indigo-700">{rejetToDelete.numeroFacture}</span>
                </div>
                <div className="bg-surface-muted rounded-lg px-3 py-2">
                  <span className="text-ink-faint block text-[10px] uppercase font-semibold">Type de rejet</span>
                  <span className="font-semibold text-ink">
                    {rejetToDelete.type === 'prestation_complete'
                      ? 'Facture intégrale rejetée'
                      : rejetToDelete.type === 'acte_isole'
                      ? 'Acte isolé rejeté'
                      : 'Exclusion sur décompte'}
                  </span>
                </div>
                <div className="bg-surface-muted rounded-lg px-3 py-2">
                  <span className="text-ink-faint block text-[10px] uppercase font-semibold">Assuré / Patient</span>
                  <span className="font-semibold text-ink">{rejetToDelete.nomAgent}</span>
                  <span className="text-ink-faint font-mono text-[10px] block">({rejetToDelete.matricule})</span>
                </div>
                <div className="bg-surface-muted rounded-lg px-3 py-2">
                  <span className="text-ink-faint block text-[10px] uppercase font-semibold">Acte concerné</span>
                  <span className="font-semibold text-ink">
                    <span className="font-mono text-indigo-600">{rejetToDelete.codeActe}</span> — {rejetToDelete.libelleActe}
                  </span>
                </div>
                <div className="bg-rose-50 rounded-lg px-3 py-2 border border-rose-200">
                  <span className="text-rose-500 block text-[10px] uppercase font-semibold">Montant rejeté</span>
                  <span className="font-black text-rose-700 text-sm">{formatMoney(rejetToDelete.montantExcluRejete)}</span>
                </div>
                <div className="bg-surface-muted rounded-lg px-3 py-2">
                  <span className="text-ink-faint block text-[10px] uppercase font-semibold">Bordereau règlement</span>
                  <span className="font-mono font-semibold text-ink">{rejetToDelete.bordereauPaiement || '-'}</span>
                </div>
              </div>

              <div className="bg-surface-muted rounded-lg px-3 py-2 text-xs">
                <span className="text-ink-faint block text-[10px] uppercase font-semibold mb-0.5">Motif du rejet</span>
                <span className="text-ink">{rejetToDelete.motif}</span>
              </div>
            </div>

            {/* Pied : actions */}
            <div className="px-5 pb-5 flex justify-end space-x-2">
              <button
                onClick={() => setRejetToDelete(null)}
                className="px-4 py-2 rounded-xl bg-surface border border-line text-ink-secondary hover:bg-surface-muted text-xs font-semibold transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={confirmDeleteRejet}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Oui, supprimer ce rejet</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
