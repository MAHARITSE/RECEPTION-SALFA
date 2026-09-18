import { printDocument } from '../../../utils/printDocument';
import React, { useState, useMemo } from 'react';
import {
  Printer,
  FileSpreadsheet,
  Building,
  Users,
  Layers,
  Receipt,
  CheckCircle2,
  Search,
  FileText,
  Clock,
  Percent,
  Eye,
  X,
  ArrowUpRight,
  ShieldAlert,
  Info,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { Prestation, Paiement, Societe, Personne, Famille } from '../types';
import { formatMoney, formatDate } from '../utils/formatters';
import { maskNom } from '../utils/inputMasks';
import { getStoredEnteteConfig } from '../utils/enteteStorage';
import { societeNatureRemise, natureRemiseEffective } from '../utils/natureRemise';
import { natureRemiseLabel, natureRemiseLabelCourt, natureRemiseBadge } from '../../../utils/natureRemise';
import * as XLSX from 'xlsx';
import { telechargerClasseur } from '../../../utils/exportFichier';
import { Select } from '../../../components/Select';

interface EtatsViewProps {
  prestations: Prestation[];
  paiements: Paiement[];
  societes: Societe[];
  personnes: Personne[];
  familles: Famille[];
  selectedSocieteId: string;
}

type ReportType = 'recap_societes' | 'rapprochement' | 'familles_actes' | 'assures';

export const EtatsView: React.FC<EtatsViewProps> = ({
  prestations,
  paiements,
  societes,
  personnes,
  familles,
  selectedSocieteId,
}) => {
  const [activeReport, setActiveReport] = useState<ReportType>('recap_societes');
  const [filterSocId, setFilterSocId] = useState<string>(selectedSocieteId && selectedSocieteId !== 'ALL' ? selectedSocieteId : 'ALL');
  const [filterRegime, setFilterRegime] = useState<'ALL' | 'ticket_moderateur' | 'remise'>('ALL');
  const [dateDebut, setDateDebut] = useState<string>('');
  const [dateFin, setDateFin] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSocieteAnalyse, setSelectedSocieteAnalyse] = useState<Societe | null>(null);

  // Sync with prop when selectedSocieteId changes
  React.useEffect(() => {
    setFilterSocId(selectedSocieteId && selectedSocieteId !== 'ALL' ? selectedSocieteId : 'ALL');
  }, [selectedSocieteId]);

  const getSociete = (id: string) => societes.find(s => s.id === id);
  const getPersonne = (id: string) => personnes.find(p => p.id === id);

  // Filtered datasets based on active filters
  const filteredPrestations = useMemo(() => {
    return prestations.filter(p => {
      const soc = getSociete(p.societeId);
      const pers = getPersonne(p.personneId);
      const matchSoc = !filterSocId || filterSocId === 'ALL' || p.societeId === filterSocId;
      
      const nature = natureRemiseEffective(soc, pers);
      const matchRegime = filterRegime === 'ALL' || nature === filterRegime;

      const matchDebut = !dateDebut || p.date >= dateDebut;
      const matchFin = !dateFin || p.date <= dateFin;
      const searchLow = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        p.numeroFacture.toLowerCase().includes(searchLow) ||
        (pers && pers.nomPrenom.toLowerCase().includes(searchLow)) ||
        (pers && pers.matricule.toLowerCase().includes(searchLow)) ||
        (p.commentaires && p.commentaires.toLowerCase().includes(searchLow)) ||
        (soc && soc.nom.toLowerCase().includes(searchLow));

      return matchSoc && matchRegime && matchDebut && matchFin && matchSearch;
    });
  }, [prestations, filterSocId, filterRegime, dateDebut, dateFin, searchTerm, personnes, societes]);

  const filteredPaiements = useMemo(() => {
    return paiements.filter(p => {
      const soc = getSociete(p.societeId);
      const matchSoc = !filterSocId || filterSocId === 'ALL' || p.societeId === filterSocId;
      const matchRegime = filterRegime === 'ALL' || (soc && societeNatureRemise(soc) === filterRegime);
      const matchDebut = !dateDebut || p.datePaiement >= dateDebut;
      const matchFin = !dateFin || p.datePaiement <= dateFin;
      const searchLow = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        p.numeroBordereau.toLowerCase().includes(searchLow) ||
        p.referencePaiement.toLowerCase().includes(searchLow) ||
        (p.notes && p.notes.toLowerCase().includes(searchLow));

      return matchSoc && matchRegime && matchDebut && matchFin && matchSearch;
    });
  }, [paiements, filterSocId, filterRegime, dateDebut, dateFin, searchTerm, societes]);

  // Key Financial KPIs - Dynamically separating Ticket Modérateur vs Remise Commerciale
  const financialTotals = useMemo(() => {
    let totalBrut = 0;
    let totalTicketMod = 0;
    let totalRemiseCom = 0;
    let totalNetSociete = 0;

    filteredPrestations.forEach(p => {
      const brut = p.totalPrestation || p.montantTotal || 0;
      const reduction = p.participation || p.ticketModerateur || 0;
      const soc = getSociete(p.societeId);
      const pers = getPersonne(p.personneId);
      const nature = natureRemiseEffective(soc, pers);

      totalBrut += brut;
      if (nature === 'ticket_moderateur') {
        totalTicketMod += reduction;
      } else {
        totalRemiseCom += reduction;
      }
      totalNetSociete += p.montantARembourser ?? (brut - reduction);
    });

    const totalPaye = filteredPaiements.reduce((sum, p) => sum + p.totalPaye, 0);
    const totalExclu = filteredPaiements.reduce((sum, p) => sum + p.totalExclu, 0);
    const resteARecouvrer = Math.max(0, totalNetSociete - totalPaye - totalExclu);
    const tauxRecouvrement = totalNetSociete > 0 ? Math.round((totalPaye / totalNetSociete) * 100) : 0;

    return {
      totalBrut,
      totalTicketMod,
      totalRemiseCom,
      totalNetSociete,
      totalPaye,
      totalExclu,
      resteARecouvrer,
      tauxRecouvrement,
    };
  }, [filteredPrestations, filteredPaiements, societes, personnes]);

  // 1. Report: Synthèse & Analyse par Société
  const syntheseSocietes = useMemo(() => {
    return societes
      .filter(s => {
        if (filterSocId !== 'ALL' && s.id !== filterSocId) return false;
        if (filterRegime !== 'ALL' && societeNatureRemise(s) !== filterRegime) return false;
        return true;
      })
      .map(soc => {
        const socPrestations = filteredPrestations.filter(p => p.societeId === soc.id);
        const socPaiements = filteredPaiements.filter(p => p.societeId === soc.id);

        let brut = 0;
        let ticketMod = 0;
        let remiseCom = 0;
        let netSociete = 0;

        socPrestations.forEach(p => {
          const b = p.totalPrestation || p.montantTotal || 0;
          const red = p.participation || p.ticketModerateur || 0;
          const pers = getPersonne(p.personneId);
          const nature = natureRemiseEffective(soc, pers);

          brut += b;
          if (nature === 'ticket_moderateur') {
            ticketMod += red;
          } else {
            remiseCom += red;
          }
          netSociete += p.montantARembourser ?? (b - red);
        });

        const paye = socPaiements.reduce((sum, p) => sum + p.totalPaye, 0);
        const exclu = socPaiements.reduce((sum, p) => sum + p.totalExclu, 0);
        const solde = Math.max(0, netSociete - paye - exclu);
        const txRecouv = netSociete > 0 ? Math.round((paye / netSociete) * 100) : 0;
        const natureSoc = societeNatureRemise(soc);

        return {
          societe: soc,
          natureSoc,
          countPrestations: socPrestations.length,
          countPaiements: socPaiements.length,
          totalBrut: brut,
          totalTicketMod: ticketMod,
          totalRemiseCom: remiseCom,
          netFactureSociete: netSociete,
          totalPaye: paye,
          totalExclu: exclu,
          soldeRestant: solde,
          tauxRecouvrement: txRecouv,
        };
      })
      .filter(item => item.countPrestations > 0 || item.countPaiements > 0 || filterSocId !== 'ALL');
  }, [societes, filteredPrestations, filteredPaiements, filterSocId, filterRegime, personnes]);

  // 2. Report: Rapprochement Factures vs Règlements
  const rapprochementFactures = useMemo(() => {
    return filteredPrestations.map(prest => {
      const soc = getSociete(prest.societeId);
      const pers = getPersonne(prest.personneId);
      const nature = natureRemiseEffective(soc, pers);
      const pNom = (prest.nomAgent || pers?.nomPrenom || '').toLowerCase().trim();
      const pMat = (prest.matricule || pers?.matricule || '').replace(/\s+/g, '').toLowerCase();

      const isLineForPrestation = (l: any) => {
        if (l.prestationId && l.prestationId === prest.id) return true;
        if (l.lignePrestationId && prest.lignes?.some(pl => pl.id === l.lignePrestationId)) return true;
        
        if (l.prestationNumero === prest.numeroFacture) {
          const lNom = (l.nomAgent || l.nomBaseAssurance || '').toLowerCase().trim();
          const lMat = (l.immatriculation || '').replace(/\s+/g, '').toLowerCase();
          const matchName = lNom && pNom && (lNom.includes(pNom) || pNom.includes(lNom));
          const matchMat = lMat && pMat && lMat !== '-' && (lMat === pMat);
          return matchName || matchMat;
        }
        return false;
      };

      const matchedPaiements = paiements.filter(pai =>
        pai.lignes?.some(l => isLineForPrestation(l))
      );

      const montantEncaisse = matchedPaiements.reduce((sum, pai) => {
        const lignes = pai.lignes?.filter(l => isLineForPrestation(l)) || [];
        return sum + lignes.reduce((lSum, l) => lSum + l.totalPaye, 0);
      }, 0);

      const moderateurAssocie = matchedPaiements.reduce((sum, pai) => {
        const lignes = pai.lignes?.filter(l => isLineForPrestation(l)) || [];
        return sum + lignes.reduce((lSum, l) => lSum + (l.ticketModerateur || 0), 0);
      }, 0);

      const excluAssocie = matchedPaiements.reduce((sum, pai) => {
        const lignes = pai.lignes?.filter(l => isLineForPrestation(l)) || [];
        return sum + lignes.reduce((lSum, l) => lSum + (l.montantExclu || 0), 0);
      }, 0);

      const reduction = prest.participation || prest.ticketModerateur || 0;
      const netSociete = prest.montantARembourser ?? (prest.totalPrestation - reduction);
      const soldeFacture = Math.max(0, netSociete - montantEncaisse - excluAssocie);
      const estSolde = soldeFacture === 0 && (montantEncaisse > 0 || prest.statut === 'Payé');

      return {
        prestation: prest,
        societe: soc,
        personne: pers,
        nature,
        montantBrut: prest.totalPrestation,
        reduction,
        ticketModerateur: nature === 'ticket_moderateur' ? reduction : 0,
        remiseCommerciale: nature === 'remise' ? reduction : 0,
        netSociete,
        montantEncaisse,
        moderateurAssocie,
        excluAssocie,
        soldeFacture,
        statutReglement: estSolde ? 'Soldé' : montantEncaisse > 0 ? 'Partiel' : 'En attente',
        paiementsAssocies: matchedPaiements,
      };
    });
  }, [filteredPrestations, paiements, societes, personnes]);

  // 3. Report: Consommation par Famille d'Actes
  const actesStats = useMemo(() => {
    const actMap = new Map<string, { code: string; libelle: string; count: number; totalMontant: number; totalPaye: number }>();

    filteredPrestations.forEach(prest => {
      if (prest.lignes && prest.lignes.length > 0) {
        prest.lignes.forEach(lig => {
          const rawCode = (lig.code || 'CONS').toUpperCase().trim();
          const fam = familles.find(f => 
            f.code.toUpperCase() === rawCode || 
            (f.aliases && f.aliases.some(a => a.toUpperCase() === rawCode))
          );
          const resolvedCode = fam ? fam.code : rawCode;
          const resolvedLibelle = fam?.libelle || (resolvedCode === 'CONS' ? 'Consultations & Visites Médicales' : (lig.libelle && lig.libelle.trim().toUpperCase() !== rawCode ? lig.libelle : rawCode));

          const current = actMap.get(resolvedCode) || {
            code: resolvedCode,
            libelle: resolvedLibelle,
            count: 0,
            totalMontant: 0,
            totalPaye: 0,
          };
          current.count += 1;
          current.totalMontant += lig.totalPrestation || 0;
          current.totalPaye += lig.totalPaye || 0;
          actMap.set(resolvedCode, current);
        });
      } else {
        const fam = familles.find(f => f.code.toUpperCase() === 'CONS');
        const resolvedCode = 'CONS';
        const resolvedLibelle = fam?.libelle || 'Consultations & Visites Médicales';
        const current = actMap.get(resolvedCode) || {
          code: resolvedCode,
          libelle: resolvedLibelle,
          count: 0,
          totalMontant: 0,
          totalPaye: 0,
        };
        current.count += 1;
        current.totalMontant += prest.totalPrestation;
        current.totalPaye += prest.statut === 'Payé' ? prest.totalPrestation : 0;
        actMap.set(resolvedCode, current);
      }
    });

    const sumAll = Array.from(actMap.values()).reduce((sum, a) => sum + a.totalMontant, 0);

    return Array.from(actMap.values())
      .map(item => ({
        ...item,
        partPourcentage: sumAll > 0 ? Math.round((item.totalMontant / sumAll) * 100) : 0,
        coutMoyen: item.count > 0 ? Math.round(item.totalMontant / item.count) : 0,
      }))
      .sort((a, b) => b.totalMontant - a.totalMontant);
  }, [filteredPrestations, familles]);

  // 4. Report: Relevé Nominatif par Assuré
  const assuresStats = useMemo(() => {
    const perMap = new Map<string, {
      personne: Personne;
      societe?: Societe;
      nature: string;
      countPrestations: number;
      totalMontant: number;
      totalModerateur: number;
      totalRemise: number;
      netSociete: number;
      actesList: string[];
    }>();

    filteredPrestations.forEach(prest => {
      const pers = getPersonne(prest.personneId);
      if (!pers) return;
      const soc = getSociete(pers.societeId || prest.societeId);
      const nature = natureRemiseEffective(soc, pers);

      const current = perMap.get(pers.id) || {
        personne: pers,
        societe: soc,
        nature,
        countPrestations: 0,
        totalMontant: 0,
        totalModerateur: 0,
        totalRemise: 0,
        netSociete: 0,
        actesList: [],
      };

      const red = prest.participation || prest.ticketModerateur || 0;
      current.countPrestations += 1;
      current.totalMontant += prest.totalPrestation;
      if (nature === 'ticket_moderateur') {
        current.totalModerateur += red;
      } else {
        current.totalRemise += red;
      }
      current.netSociete += prest.montantARembourser ?? (prest.totalPrestation - red);

      if (prest.lignes) {
        prest.lignes.forEach(l => {
          if (!current.actesList.includes(l.code)) {
            current.actesList.push(l.code);
          }
        });
      }

      perMap.set(pers.id, current);
    });

    return Array.from(perMap.values()).sort((a, b) => b.totalMontant - a.totalMontant);
  }, [filteredPrestations, personnes, societes]);

  // Print Report Handler
  const handlePrint = () => {
    const report = document.getElementById('etats-view');
    if (!report) return;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(node => node.outerHTML).join('');
    printDocument(`<!doctype html><html lang="fr" class="light"><head><meta charset="utf-8">${styles}</head><body>${report.outerHTML}</body></html>`, 'Rapport suivi assurance');
  };

  // Export to Excel Handler
  const handleExportExcel = () => {
    let wsData: any[] = [];
    let reportTitle = '';

    if (activeReport === 'recap_societes') {
      reportTitle = 'Synthese_Organismes_Assurance';
      wsData = syntheseSocietes.map(row => ({
        'Code Organisme': row.societe.code,
        'Nom Société / Organisme': row.societe.nom,
        'Régime de Réduction': row.natureSoc === 'ticket_moderateur' ? 'Ticket Modérateur (Part Patient)' : 'Remise Commerciale',
        'Taux Couverture (%)': `${row.societe.tauxCouvertureDefaut || 80}%`,
        'Nombre Prestations': row.countPrestations,
        'Nombre Règlements': row.countPaiements,
        'Total Brut Réclamé (Ar)': row.totalBrut,
        'Part Patient / Ticket Modérateur (Ar)': row.totalTicketMod,
        'Remise Commerciale (Ar)': row.totalRemiseCom,
        'Net Facturé Société (Ar)': row.netFactureSociete,
        'Total Réglé Société (Ar)': row.totalPaye,
        'Montant Rejeté / Exclu (Ar)': row.totalExclu,
        'Solde Restant Dû Société (Ar)': row.soldeRestant,
        'Taux Recouvrement (%)': `${row.tauxRecouvrement}%`,
      }));
    } else if (activeReport === 'rapprochement') {
      reportTitle = 'Rapprochement_Factures_Reglements';
      wsData = rapprochementFactures.map(row => ({
        'N° Facture': row.prestation.numeroFacture,
        'Date Soins': row.prestation.date,
        'Société': row.societe?.nom || '',
        'Régime': row.nature === 'ticket_moderateur' ? 'Ticket Modérateur' : 'Remise Commerciale',
        'Assuré': row.personne?.nomPrenom || '',
        'Matricule': row.personne?.matricule || '',
        'Total Brut (Ar)': row.montantBrut,
        'Part Patient / Ticket Mod. (Ar)': row.ticketModerateur,
        'Remise Commerciale (Ar)': row.remiseCommerciale,
        'Net Facturé Société (Ar)': row.netSociete,
        'Montant Encaissé (Ar)': row.montantEncaisse,
        'Rejet / Exclu (Ar)': row.excluAssocie,
        'Solde Restant (Ar)': row.soldeFacture,
        'Statut': row.statutReglement,
      }));
    } else if (activeReport === 'familles_actes') {
      reportTitle = 'Ventilation_Actes_Medicaux';
      wsData = actesStats.map(row => ({
        'Code Acte': row.code,
        'Libellé Famille': row.libelle,
        'Nombre d\'actes': row.count,
        'Montant Total (Ar)': row.totalMontant,
        'Part dans le Total (%)': `${row.partPourcentage}%`,
        'Coût Moyen par Acte (Ar)': row.coutMoyen,
      }));
    } else {
      reportTitle = 'Releve_Nominatif_Assures';
      wsData = assuresStats.map(row => ({
        'Matricule': row.personne.matricule,
        'Nom & Prénom Assuré': row.personne.nomPrenom,
        'Qualité': row.personne.qualite || 'Adhérent',
        'Société / Organisme': row.societe?.nom || '',
        'Régime': row.nature === 'ticket_moderateur' ? 'Ticket Modérateur' : 'Remise Commerciale',
        'Sous-Société': row.personne.sousSociete || '',
        'Nombre Dossiers': row.countPrestations,
        'Montant Total Brut (Ar)': row.totalMontant,
        'Part Patient (Ar)': row.totalModerateur,
        'Remise Commerciale (Ar)': row.totalRemise,
        'Net Pris en Charge Société (Ar)': row.netSociete,
        'Actes Réalisés': row.actesList.join(', '),
      }));
    }

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rapport');
    telechargerClasseur(wb, `${reportTitle}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Detailed Analysis Data for Selected Company Modal
  const analyseData = useMemo(() => {
    if (!selectedSocieteAnalyse) return null;
    const soc = selectedSocieteAnalyse;
    const socPrestations = prestations.filter(p => p.societeId === soc.id);
    const socPaiements = paiements.filter(p => p.societeId === soc.id);

    let totalBrut = 0;
    let totalTicketMod = 0;
    let totalRemiseCom = 0;
    let netSociete = 0;

    const actesMap = new Map<string, { code: string; libelle: string; count: number; total: number }>();

    socPrestations.forEach(p => {
      const b = p.totalPrestation || p.montantTotal || 0;
      const red = p.participation || p.ticketModerateur || 0;
      const pers = getPersonne(p.personneId);
      const nature = natureRemiseEffective(soc, pers);

      totalBrut += b;
      if (nature === 'ticket_moderateur') {
        totalTicketMod += red;
      } else {
        totalRemiseCom += red;
      }
      netSociete += p.montantARembourser ?? (b - red);

      if (p.lignes) {
        p.lignes.forEach(l => {
          const c = (l.code || 'CONS').toUpperCase();
          const curr = actesMap.get(c) || { code: c, libelle: l.libelle || c, count: 0, total: 0 };
          curr.count += l.quantity || 1;
          curr.total += l.totalPrestation || 0;
          actesMap.set(c, curr);
        });
      }
    });

    const totalPaye = socPaiements.reduce((sum, p) => sum + p.totalPaye, 0);
    const totalExclu = socPaiements.reduce((sum, p) => sum + p.totalExclu, 0);
    const solde = Math.max(0, netSociete - totalPaye - totalExclu);
    const txRecouv = netSociete > 0 ? Math.round((totalPaye / netSociete) * 100) : 0;
    const nature = societeNatureRemise(soc);

    return {
      societe: soc,
      nature,
      totalBrut,
      totalTicketMod,
      totalRemiseCom,
      netSociete,
      totalPaye,
      totalExclu,
      solde,
      txRecouv,
      prestations: socPrestations,
      paiements: socPaiements,
      actes: Array.from(actesMap.values()).sort((a, b) => b.total - a.total),
    };
  }, [selectedSocieteAnalyse, prestations, paiements, personnes, societes]);

  return (
    <div id="etats-view" className="space-y-6">
      {/* Header with Title and Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-ink-strong">Rapports &amp; Analyse Financière Assurance</h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              Analyse Tiers-Payant
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            Gestion du comportement de la remise (Ticket modérateur à la charge du patient vs Remise commerciale), états financiers et recouvrement
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-print-report"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink shadow-xs transition hover:bg-surface-muted cursor-pointer"
          >
            <Printer className="h-4 w-4 text-ink-muted" />
            <span>Imprimer le relevé</span>
          </button>

          <button
            id="btn-export-excel-report"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            <span>Exporter en Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Financial Summary KPI Cards (Printable) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Chiffre d'Affaires Brut */}
        <div className="bg-surface p-4 rounded-xl border border-line shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Chiffre d'Affaires Brut</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-ink-strong">{formatMoney(financialTotals.totalBrut)}</div>
          <div className="text-xs text-ink-muted">{filteredPrestations.length} dossiers facturés</div>
        </div>

        {/* KPI 2: Ticket Modérateur vs Remise Commerciale */}
        <div className="bg-surface p-4 rounded-xl border border-line shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Réductions &amp; Quote-part</span>
            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-ink-muted">Part Patient (Ticket mod.) :</span>
              <span className="font-bold text-amber-700 dark:text-amber-300">{formatMoney(financialTotals.totalTicketMod)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-ink-muted">Remises Commerciales :</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300">{formatMoney(financialTotals.totalRemiseCom)}</span>
            </div>
          </div>
          <div className="text-[10px] text-ink-faint pt-1 border-t border-line-soft">
            Net Société : <strong className="text-ink-strong">{formatMoney(financialTotals.totalNetSociete)}</strong>
          </div>
        </div>

        {/* KPI 3: Règlements Encaissés */}
        <div className="bg-surface p-4 rounded-xl border border-line shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Règlements Sociétés (Net)</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{formatMoney(financialTotals.totalPaye)}</div>
          <div className="text-xs text-ink-muted">{filteredPaiements.length} bordereaux validés</div>
        </div>

        {/* KPI 4: Reste à Recouvrer Société */}
        <div className="bg-surface p-4 rounded-xl border border-line shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Solde Restant Dû Société</span>
            <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600">{formatMoney(financialTotals.resteARecouvrer)}</div>
          <div className="flex items-center justify-between text-[11px] text-ink-muted">
            <span>Taux de recouvrement :</span>
            <span className="font-bold text-indigo-600">{financialTotals.tauxRecouvrement}%</span>
          </div>
        </div>
      </div>

      {/* Filter and Report Selection Card */}
      <div className="bg-surface rounded-xl border border-line p-4 space-y-4 shadow-xs print:hidden">
        {/* Report Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-line-soft pb-3">
          <button
            onClick={() => setActiveReport('recap_societes')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
              activeReport === 'recap_societes'
                ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Building className="h-4 w-4" />
            <span>Synthèse &amp; Analyse par Société</span>
          </button>

          <button
            onClick={() => setActiveReport('rapprochement')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
              activeReport === 'rapprochement'
                ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Receipt className="h-4 w-4" />
            <span>Rapprochement Factures &amp; Règlements</span>
          </button>

          <button
            onClick={() => setActiveReport('familles_actes')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
              activeReport === 'familles_actes'
                ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Ventilation par Famille d'Actes</span>
          </button>

          <button
            onClick={() => setActiveReport('assures')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
              activeReport === 'assures'
                ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Relevé Nominatif des Assurés</span>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block text-ink-muted font-medium mb-1">Organisme / Assurance</label>
            <Select
              value={filterSocId}
              onChange={(e) => setFilterSocId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line bg-surface font-medium text-ink focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">Toutes les assurances</option>
              {societes.map(s => (
                <option key={s.id} value={s.id}>{s.nom} ({s.code})</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-ink-muted font-medium mb-1">Régime de Réduction</label>
            <Select
              value={filterRegime}
              onChange={(e) => setFilterRegime(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-line bg-surface font-medium text-ink focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">Tous les régimes</option>
              <option value="ticket_moderateur">Ticket modérateur (Part Patient)</option>
              <option value="remise">Remise commerciale (0 Ar Patient)</option>
            </Select>
          </div>

          <div>
            <label className="block text-ink-muted font-medium mb-1">Date début (Période)</label>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-ink-muted font-medium mb-1">Date fin</label>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line bg-surface text-ink focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-ink-muted font-medium mb-1">Recherche mot-clé</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-ink-faint" />
              <input
                type="text"
                placeholder="N° facture, adhérent, matricule..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(maskNom(e.target.value))}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-line bg-surface text-ink focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Printable Official Header (Shown during print) */}
      <div className="hidden print:block mb-6 border-b-2 border-slate-900 pb-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-4">
            {getStoredEnteteConfig().logoUrl && (
              <img
                src={getStoredEnteteConfig().logoUrl}
                alt="Logo SALFA"
                className="w-14 h-14 object-contain shrink-0"
              />
            )}
            <div>
              <h1 className="text-xl font-bold text-ink-strong uppercase tracking-tight">
                {getStoredEnteteConfig().etablissement || 'FIANGONANA LOTERANA MALAGASY - SALFA'}
              </h1>
              <p className="text-sm font-semibold text-ink">
                {getStoredEnteteConfig().sousTitre || 'HÔPITALY LOTERANA TOLIARY TANAMBAO'}
              </p>
              <p className="text-xs text-ink-secondary">
                {getStoredEnteteConfig().departement || 'Département de Santé · Suivi & Comptabilité Tiers-Payant Assurance'}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-ink-secondary">
            <p>Date d'édition : <strong>{formatDate(new Date().toISOString())}</strong></p>
            <p>Périmètre : <strong>{filterSocId === 'ALL' ? 'Toutes les assurances' : (getSociete(filterSocId)?.nom || 'Organisme')}</strong></p>
            <p>Régime : <strong>{filterRegime === 'ALL' ? 'Tous' : filterRegime === 'ticket_moderateur' ? 'Ticket modérateur' : 'Remise commerciale'}</strong></p>
          </div>
        </div>
      </div>

      {/* REPORT CONTENT TABLES */}

      {/* 1. Synthèse par Société */}
      {activeReport === 'recap_societes' && (
        <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-xs">
          <div className="p-4 border-b border-line-soft flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink-strong">
                État Récapitulatif &amp; Analyse Financière par Société / Organisme
              </h3>
              <p className="text-[11px] text-ink-muted">
                Distinction entre Ticket Modérateur (part payée par le patient) et Remise Commerciale (réduction accordée à la société)
              </p>
            </div>
            <span className="text-xs text-ink-muted">
              {syntheseSocietes.length} organisme(s) actif(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted text-ink-secondary uppercase font-semibold border-b border-line">
                <tr>
                  <th className="px-4 py-3">Société / Assurance</th>
                  <th className="px-3 py-3 text-center">Régime</th>
                  <th className="px-3 py-3 text-center">Dossiers</th>
                  <th className="px-3 py-3 text-right">C.A. Brut</th>
                  <th className="px-3 py-3 text-right">Ticket Mod. (Patient)</th>
                  <th className="px-3 py-3 text-right">Remise Com.</th>
                  <th className="px-3 py-3 text-right">Net Facturé Société</th>
                  <th className="px-3 py-3 text-right">Règlements Reçus</th>
                  <th className="px-3 py-3 text-right">Rejets</th>
                  <th className="px-3 py-3 text-right">Solde Dû Société</th>
                  <th className="px-3 py-3 text-center">Recouvrement</th>
                  <th className="px-3 py-3 text-center print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-ink">
                {syntheseSocietes.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-ink-faint">
                      Aucune donnée enregistrée pour les critères sélectionnés.
                    </td>
                  </tr>
                ) : (
                  syntheseSocietes.map(row => (
                    <tr key={row.societe.id} className="hover:bg-surface-muted/80 transition-colors group">
                      <td className="px-4 py-3 font-semibold text-ink-strong">
                        <div className="flex items-center gap-1.5">
                          <span>{row.societe.nom}</span>
                        </div>
                        <div className="text-[11px] font-mono text-ink-muted font-normal flex items-center gap-2">
                          <span>Code: {row.societe.code}</span>
                          <span>·</span>
                          <span>Taux: {row.societe.tauxCouvertureDefaut || 80}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${natureRemiseBadge(row.natureSoc)}`}>
                          {row.natureSoc === 'ticket_moderateur' ? 'Ticket Mod.' : 'Remise'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-medium">{row.countPrestations}</td>
                      <td className="px-3 py-3 text-right font-bold text-ink-strong">{formatMoney(row.totalBrut)}</td>
                      <td className="px-3 py-3 text-right text-amber-700 dark:text-amber-300 font-medium">
                        {row.totalTicketMod > 0 ? formatMoney(row.totalTicketMod) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-700 dark:text-emerald-300 font-medium">
                        {row.totalRemiseCom > 0 ? formatMoney(row.totalRemiseCom) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-indigo-700 dark:text-indigo-300">{formatMoney(row.netFactureSociete)}</td>
                      <td className="px-3 py-3 text-right font-bold text-emerald-600">{formatMoney(row.totalPaye)}</td>
                      <td className="px-3 py-3 text-right text-rose-600">{row.totalExclu > 0 ? formatMoney(row.totalExclu) : '—'}</td>
                      <td className="px-3 py-3 text-right font-bold text-amber-600">{formatMoney(row.soldeRestant)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          row.tauxRecouvrement >= 90
                            ? 'bg-emerald-100 text-emerald-800'
                            : row.tauxRecouvrement >= 50
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-surface-hover text-ink'
                        }`}>
                          {row.tauxRecouvrement}%
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center print:hidden">
                        <button
                          type="button"
                          onClick={() => setSelectedSocieteAnalyse(row.societe)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] transition cursor-pointer border border-indigo-200"
                          title="Ouvrir le dossier d'analyse approfondie de cette société"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Analyser</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {syntheseSocietes.length > 0 && (
                <tfoot className="bg-surface-muted font-bold text-ink-strong border-t-2 border-line">
                  <tr>
                    <td className="px-4 py-3 uppercase">Total Général</td>
                    <td className="px-3 py-3 text-center">—</td>
                    <td className="px-3 py-3 text-center">{filteredPrestations.length}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(financialTotals.totalBrut)}</td>
                    <td className="px-3 py-3 text-right text-amber-700 dark:text-amber-300">{formatMoney(financialTotals.totalTicketMod)}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 dark:text-emerald-300">{formatMoney(financialTotals.totalRemiseCom)}</td>
                    <td className="px-3 py-3 text-right text-indigo-700 dark:text-indigo-300">{formatMoney(financialTotals.totalNetSociete)}</td>
                    <td className="px-3 py-3 text-right text-emerald-600">{formatMoney(financialTotals.totalPaye)}</td>
                    <td className="px-3 py-3 text-right text-rose-600">{formatMoney(financialTotals.totalExclu)}</td>
                    <td className="px-3 py-3 text-right text-amber-600">{formatMoney(financialTotals.resteARecouvrer)}</td>
                    <td className="px-3 py-3 text-center">{financialTotals.tauxRecouvrement}%</td>
                    <td className="px-3 py-3 print:hidden"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* 2. Rapprochement Factures vs Règlements */}
      {activeReport === 'rapprochement' && (
        <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-xs">
          <div className="p-4 border-b border-line-soft flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink-strong">
                Rapprochement Détaillé Factures &amp; Règlements Reçus
              </h3>
              <p className="text-[11px] text-ink-muted">
                Ventilation par facture des quotes-parts patient et net facturé société
              </p>
            </div>
            <span className="text-xs text-ink-muted">
              {rapprochementFactures.length} facture(s) analysée(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted text-ink-secondary uppercase font-semibold border-b border-line">
                <tr>
                  <th className="px-4 py-3">N° Facture</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Assuré / Matricule</th>
                  <th className="px-4 py-3">Société</th>
                  <th className="px-4 py-3 text-center">Régime</th>
                  <th className="px-4 py-3 text-right">Brut</th>
                  <th className="px-4 py-3 text-right">Ticket Mod. / Remise</th>
                  <th className="px-4 py-3 text-right">Net Société</th>
                  <th className="px-4 py-3 text-right">Encaissé</th>
                  <th className="px-4 py-3 text-right">Solde Dû</th>
                  <th className="px-4 py-3 text-center">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-ink">
                {rapprochementFactures.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-ink-faint">
                      Aucune prestation trouvée.
                    </td>
                  </tr>
                ) : (
                  rapprochementFactures.map((row, idx) => (
                    <tr key={row.prestation.id || idx} className="hover:bg-surface-muted/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-ink-strong">
                        {row.prestation.numeroFacture}
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{formatDate(row.prestation.date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink-strong">{row.personne?.nomPrenom || 'Assuré'}</div>
                        <div className="text-[11px] font-mono text-ink-muted">{row.personne?.matricule || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-ink font-medium">
                        {row.societe?.nom || 'Société'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${natureRemiseBadge(row.nature)}`}>
                          {row.nature === 'ticket_moderateur' ? 'Ticket' : 'Remise'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-ink-strong">
                        {formatMoney(row.montantBrut)}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-secondary">
                        {formatMoney(row.reduction)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-700">
                        {formatMoney(row.netSociete)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        {formatMoney(row.montantEncaisse)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600">
                        {formatMoney(row.soldeFacture)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          row.statutReglement === 'Soldé'
                            ? 'bg-emerald-100 text-emerald-800'
                            : row.statutReglement === 'Partiel'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-surface-hover text-ink'
                        }`}>
                          {row.statutReglement}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Ventilation par Famille d'Actes */}
      {activeReport === 'familles_actes' && (
        <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-xs">
          <div className="p-4 border-b border-line-soft flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-strong">
              Ventilation de la Consommation par Famille d'Actes Médicaux
            </h3>
            <span className="text-xs text-ink-muted">
              {actesStats.length} famille(s) d'actes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted text-ink-secondary uppercase font-semibold border-b border-line">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Famille d'actes / Prestations</th>
                  <th className="px-4 py-3 text-center">Nombre d'actes</th>
                  <th className="px-4 py-3 text-right">Montant Total</th>
                  <th className="px-4 py-3 text-center">Part dans le Total</th>
                  <th className="px-4 py-3 text-right">Coût Moyen / Acte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-ink">
                {actesStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-ink-faint">
                      Aucune prestation trouvée.
                    </td>
                  </tr>
                ) : (
                  actesStats.map(row => (
                    <tr key={row.code} className="hover:bg-surface-muted/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600">
                        {row.code}
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink-strong">
                        {row.libelle}
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {row.count}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-ink-strong">
                        {formatMoney(row.totalMontant)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-16 bg-surface-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-1.5 rounded-full"
                              style={{ width: `${row.partPourcentage}%` }}
                            />
                          </div>
                          <span>{row.partPourcentage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-secondary">
                        {formatMoney(row.coutMoyen)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Relevé Nominatif des Assurés */}
      {activeReport === 'assures' && (
        <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-xs">
          <div className="p-4 border-b border-line-soft flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-strong">
              Relevé Nominatif des Prises en Charge par Assuré
            </h3>
            <span className="text-xs text-ink-muted">
              {assuresStats.length} assuré(s) répertorié(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted text-ink-secondary uppercase font-semibold border-b border-line">
                <tr>
                  <th className="px-4 py-3">Matricule</th>
                  <th className="px-4 py-3">Nom &amp; Prénom</th>
                  <th className="px-4 py-3">Qualité</th>
                  <th className="px-4 py-3">Société / Affiliation</th>
                  <th className="px-4 py-3 text-center">Régime</th>
                  <th className="px-4 py-3 text-center">Dossiers</th>
                  <th className="px-4 py-3 text-right">Total Brut</th>
                  <th className="px-4 py-3 text-right">Part Patient</th>
                  <th className="px-4 py-3 text-right">Remise Com.</th>
                  <th className="px-4 py-3 text-right">Net Société</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-ink">
                {assuresStats.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-ink-faint">
                      Aucun assuré trouvé.
                    </td>
                  </tr>
                ) : (
                  assuresStats.map(row => (
                    <tr key={row.personne.id} className="hover:bg-surface-muted/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-ink">
                        {row.personne.matricule}
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink-strong">
                        {row.personne.nomPrenom}
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">
                        {row.personne.qualite || 'Adhérent'}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        <div>{row.societe?.nom || 'Société'}</div>
                        {row.personne.sousSociete && (
                          <div className="text-[11px] text-ink-muted">[{row.personne.sousSociete}]</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${natureRemiseBadge(row.nature)}`}>
                          {row.nature === 'ticket_moderateur' ? 'Ticket' : 'Remise'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {row.countPrestations}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-ink-strong">
                        {formatMoney(row.totalMontant)}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-300 font-medium">
                        {row.totalModerateur > 0 ? formatMoney(row.totalModerateur) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-700 dark:text-emerald-300 font-medium">
                        {row.totalRemise > 0 ? formatMoney(row.totalRemise) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-700 dark:text-indigo-300">
                        {formatMoney(row.netSociete)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL D'ANALYSE APPROFONDIE D'UNE SOCIÉTÉ */}
      {selectedSocieteAnalyse && analyseData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 animate-in fade-in duration-150" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedSocieteAnalyse(null); }}>
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-2xl border border-line-strong p-6 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md">
                    {analyseData.societe.code}
                  </span>
                  <h3 className="text-lg font-bold text-ink-strong">
                    Dossier d'Analyse Financière &amp; Tiers-Payant — {analyseData.societe.nom}
                  </h3>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${natureRemiseBadge(analyseData.nature)}`}>
                    {analyseData.nature === 'ticket_moderateur' ? 'Assujettie Ticket Modérateur' : 'Régime Remise Commerciale'}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">
                  Taux contractuel : <strong>{analyseData.societe.tauxCouvertureDefaut || 80}%</strong> · Mode : <strong>{analyseData.societe.modePaiement === 'global' ? 'Payeur Global' : 'Paiement Partiel'}</strong>
                  {analyseData.societe.contact ? ` · Contact : ${analyseData.societe.contact}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const wsData = analyseData.prestations.map(p => {
                      const pers = getPersonne(p.personneId);
                      const nat = natureRemiseEffective(analyseData.societe, pers);
                      const red = p.participation || p.ticketModerateur || 0;
                      return {
                        'N° Facture': p.numeroFacture,
                        'Date': p.date,
                        'Assuré': pers?.nomPrenom || p.nomAgent || '',
                        'Matricule': pers?.matricule || p.matricule || '',
                        'Régime': nat === 'ticket_moderateur' ? 'Ticket Modérateur' : 'Remise Commerciale',
                        'Total Brut (Ar)': p.totalPrestation,
                        'Part Patient (Ticket) (Ar)': nat === 'ticket_moderateur' ? red : 0,
                        'Remise Commerciale (Ar)': nat === 'remise' ? red : 0,
                        'Net Société (Ar)': p.montantARembourser ?? (p.totalPrestation - red),
                        'Statut Facture': p.statut || 'En attente',
                      };
                    });
                    const ws = XLSX.utils.json_to_sheet(wsData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Analyse_Societe');
                    telechargerClasseur(wb, `Analyse_${analyseData.societe.code}_${new Date().toISOString().split('T')[0]}.xlsx`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface-muted text-xs font-semibold text-ink cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedSocieteAnalyse(null)}
                  className="p-1.5 rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Behaviour Explanation Card */}
            <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
              analyseData.nature === 'ticket_moderateur'
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 text-amber-900 dark:text-amber-200'
                : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-900 dark:text-emerald-200'
            }`}>
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold block mb-0.5">
                    {analyseData.nature === 'ticket_moderateur'
                      ? 'Société assujettie au Ticket Modérateur (Part Patient)'
                      : 'Société avec Remise Commerciale (0 Ar Patient)'}
                  </strong>
                  {analyseData.nature === 'ticket_moderateur' ? (
                    <p>
                      La quote-part non couverte par la société ({Math.max(0, 100 - (analyseData.societe.tauxCouvertureDefaut || 80))}%) se transforme en <strong>ticket modérateur</strong> et constitue la <strong>part à payer par le patient</strong>. L'hôpital encaisse cette part directement auprès du patient, et ne facture à la société que sa part nette ({analyseData.societe.tauxCouvertureDefaut || 80}%).
                    </p>
                  ) : (
                    <p>
                      La réduction ({Math.max(0, 100 - (analyseData.societe.tauxCouvertureDefaut || 80))}%) est une <strong>remise commerciale accordée à la société</strong>. L'assuré ne paie rien (<strong>0 Ar à la charge du patient</strong>), et la société est redevable de la somme nette convenue.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Financial KPIs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-surface-muted rounded-xl border border-line">
                <span className="text-[10px] text-ink-muted uppercase font-bold">Total Brut Facturé</span>
                <div className="text-lg font-bold text-ink-strong">{formatMoney(analyseData.totalBrut)}</div>
                <span className="text-[10px] text-ink-faint">{analyseData.prestations.length} dossiers</span>
              </div>
              <div className="p-3 bg-surface-muted rounded-xl border border-line">
                <span className="text-[10px] text-ink-muted uppercase font-bold">
                  {analyseData.nature === 'ticket_moderateur' ? 'Part Patient (Ticket)' : 'Remise Commerciale'}
                </span>
                <div className={`text-lg font-bold ${analyseData.nature === 'ticket_moderateur' ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {formatMoney(analyseData.nature === 'ticket_moderateur' ? analyseData.totalTicketMod : analyseData.totalRemiseCom)}
                </div>
                <span className="text-[10px] text-ink-faint">{100 - (analyseData.societe.tauxCouvertureDefaut || 80)}% du brut</span>
              </div>
              <div className="p-3 bg-surface-muted rounded-xl border border-line">
                <span className="text-[10px] text-ink-muted uppercase font-bold">Net Facturé Société</span>
                <div className="text-lg font-bold text-indigo-700">{formatMoney(analyseData.netSociete)}</div>
                <span className="text-[10px] text-ink-faint">{analyseData.societe.tauxCouvertureDefaut || 80}% pris en charge</span>
              </div>
              <div className="p-3 bg-surface-muted rounded-xl border border-line">
                <span className="text-[10px] text-ink-muted uppercase font-bold">Solde Restant Dû</span>
                <div className="text-lg font-bold text-rose-600">{formatMoney(analyseData.solde)}</div>
                <span className="text-[10px] text-emerald-600 font-bold">Réglé: {formatMoney(analyseData.totalPaye)} ({analyseData.txRecouv}%)</span>
              </div>
            </div>

            {/* Act Families Breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-ink-strong uppercase tracking-wider">
                Consommation par Famille d'Actes pour cette société
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {analyseData.actes.slice(0, 8).map(a => (
                  <div key={a.code} className="p-2.5 rounded-lg border border-line bg-surface text-xs flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-indigo-600">[{a.code}]</span>
                      <div className="text-[11px] text-ink-muted truncate max-w-[130px]">{a.libelle}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-ink">{formatMoney(a.total)}</div>
                      <div className="text-[10px] text-ink-faint">{a.count} acte(s)</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Prestations Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-ink-strong uppercase tracking-wider">
                Liste des Factures / Dossiers Réalisés ({analyseData.prestations.length})
              </h4>
              <div className="border border-line rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-muted text-ink-secondary uppercase font-semibold border-b border-line sticky top-0">
                    <tr>
                      <th className="px-3 py-2">N° Facture</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Assuré / Matricule</th>
                      <th className="px-3 py-2 text-right">Brut</th>
                      <th className="px-3 py-2 text-right">{analyseData.nature === 'ticket_moderateur' ? 'Part Patient' : 'Remise'}</th>
                      <th className="px-3 py-2 text-right">Net Société</th>
                      <th className="px-3 py-2 text-center">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-ink">
                    {analyseData.prestations.map(p => {
                      const pers = getPersonne(p.personneId);
                      const red = p.participation || p.ticketModerateur || 0;
                      return (
                        <tr key={p.id} className="hover:bg-surface-muted">
                          <td className="px-3 py-2 font-mono font-bold">{p.numeroFacture}</td>
                          <td className="px-3 py-2 text-ink-muted">{formatDate(p.date)}</td>
                          <td className="px-3 py-2">
                            <span className="font-semibold">{pers?.nomPrenom || p.nomAgent || 'Assuré'}</span>
                            <span className="font-mono text-[10px] text-ink-muted ml-1">({pers?.matricule || p.matricule || '-'})</span>
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{formatMoney(p.totalPrestation)}</td>
                          <td className="px-3 py-2 text-right text-amber-700">{formatMoney(red)}</td>
                          <td className="px-3 py-2 text-right font-bold text-indigo-700">{formatMoney(p.montantARembourser ?? (p.totalPrestation - red))}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-muted text-ink">
                              {p.statut || 'En attente'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setSelectedSocieteAnalyse(null)}
                className="px-4 py-2 rounded-xl bg-surface hover:bg-surface-muted border border-line text-xs font-semibold text-ink cursor-pointer"
              >
                Fermer l'analyse
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
