import { printDocument } from '../../../utils/printDocument';
import React, { useState, useMemo } from 'react';
import {
  Printer,
  FileSpreadsheet,
  Download,
  Filter,
  Calendar,
  Building,
  Users,
  Layers,
  Receipt,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Search,
  FileText,
  Clock,
  PieChart,
  BarChart3,
  Percent
} from 'lucide-react';
import { Prestation, Paiement, Societe, Personne, Famille } from '../types';
import { formatMoney, formatDate } from '../utils/formatters';
import { maskNom } from '../utils/inputMasks';
import { getStoredEnteteConfig } from '../utils/enteteStorage';
import * as XLSX from 'xlsx';
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
  const [dateDebut, setDateDebut] = useState<string>('');
  const [dateFin, setDateFin] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Sync with prop when selectedSocieteId changes
  React.useEffect(() => {
    setFilterSocId(selectedSocieteId && selectedSocieteId !== 'ALL' ? selectedSocieteId : 'ALL');
  }, [selectedSocieteId]);

  // Filtered datasets based on active filters
  const filteredPrestations = useMemo(() => {
    return prestations.filter(p => {
      const matchSoc = !filterSocId || filterSocId === 'ALL' || p.societeId === filterSocId;
      const matchDebut = !dateDebut || p.date >= dateDebut;
      const matchFin = !dateFin || p.date <= dateFin;
      const pers = personnes.find(pe => pe.id === p.personneId);
      const searchLow = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        p.numeroFacture.toLowerCase().includes(searchLow) ||
        (pers && pers.nomPrenom.toLowerCase().includes(searchLow)) ||
        (pers && pers.matricule.toLowerCase().includes(searchLow)) ||
        (p.commentaires && p.commentaires.toLowerCase().includes(searchLow));

      return matchSoc && matchDebut && matchFin && matchSearch;
    });
  }, [prestations, filterSocId, dateDebut, dateFin, searchTerm, personnes]);

  const filteredPaiements = useMemo(() => {
    return paiements.filter(p => {
      const matchSoc = !filterSocId || filterSocId === 'ALL' || p.societeId === filterSocId;
      const matchDebut = !dateDebut || p.datePaiement >= dateDebut;
      const matchFin = !dateFin || p.datePaiement <= dateFin;
      const searchLow = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        p.numeroBordereau.toLowerCase().includes(searchLow) ||
        p.referencePaiement.toLowerCase().includes(searchLow) ||
        (p.notes && p.notes.toLowerCase().includes(searchLow));

      return matchSoc && matchDebut && matchFin && matchSearch;
    });
  }, [paiements, filterSocId, dateDebut, dateFin, searchTerm]);

  // Key Financial KPIs
  const totalReclame = filteredPrestations.reduce((sum, p) => sum + p.totalPrestation, 0);
  const totalPaye = filteredPaiements.reduce((sum, p) => sum + p.totalPaye, 0);
  const totalModerateur = filteredPaiements.reduce((sum, p) => sum + p.totalModerateur, 0);
  const totalExclu = filteredPaiements.reduce((sum, p) => sum + p.totalExclu, 0);
  const resteARecouvrer = Math.max(0, totalReclame - totalPaye - totalModerateur - totalExclu);
  const tauxRecouvrement = totalReclame > 0 ? Math.round((totalPaye / totalReclame) * 100) : 0;

  const getSociete = (id: string) => societes.find(s => s.id === id);
  const getPersonne = (id: string) => personnes.find(p => p.id === id);

  // 1. Report: Synthèse par Société
  const syntheseSocietes = useMemo(() => {
    return societes
      .filter(s => filterSocId === 'ALL' || s.id === filterSocId)
      .map(soc => {
        const socPrestations = filteredPrestations.filter(p => p.societeId === soc.id);
        const socPaiements = filteredPaiements.filter(p => p.societeId === soc.id);

        const reclame = socPrestations.reduce((sum, p) => sum + p.totalPrestation, 0);
        const paye = socPaiements.reduce((sum, p) => sum + p.totalPaye, 0);
        const moderateur = socPaiements.reduce((sum, p) => sum + p.totalModerateur, 0);
        const exclu = socPaiements.reduce((sum, p) => sum + p.totalExclu, 0);
        const solde = Math.max(0, reclame - paye - moderateur - exclu);
        const txRecouv = reclame > 0 ? Math.round((paye / reclame) * 100) : 0;

        return {
          societe: soc,
          countPrestations: socPrestations.length,
          countPaiements: socPaiements.length,
          totalReclame: reclame,
          totalPaye: paye,
          totalModerateur: moderateur,
          totalExclu: exclu,
          soldeRestant: solde,
          tauxRecouvrement: txRecouv,
        };
      })
      .filter(item => item.countPrestations > 0 || item.countPaiements > 0 || filterSocId !== 'ALL');
  }, [societes, filteredPrestations, filteredPaiements, filterSocId]);

  // 2. Report: Rapprochement Factures vs Règlements
  const rapprochementFactures = useMemo(() => {
    return filteredPrestations.map(prest => {
      const pNom = (prest.nomAgent || getPersonne(prest.personneId)?.nomPrenom || '').toLowerCase().trim();
      const pMat = (prest.matricule || getPersonne(prest.personneId)?.matricule || '').replace(/\s+/g, '').toLowerCase();

      const isLineForPrestation = (l: any) => {
        if (l.prestationId && l.prestationId === prest.id) return true;
        if (l.lignePrestationId && prest.lignes?.some(pl => pl.id === l.lignePrestationId)) return true;
        
        // If matched only via invoice number, require patient verification to avoid attributing the whole invoice to every patient
        if (l.prestationNumero === prest.numeroFacture) {
          const lNom = (l.nomAgent || l.nomBaseAssurance || '').toLowerCase().trim();
          const lMat = (l.immatriculation || '').replace(/\s+/g, '').toLowerCase();
          const matchName = lNom && pNom && (lNom.includes(pNom) || pNom.includes(lNom));
          const matchMat = lMat && pMat && lMat !== '-' && (lMat === pMat);
          return matchName || matchMat;
        }
        return false;
      };

      // Find payments that have lines for this specific prestation
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

      const soldeFacture = Math.max(0, prest.totalPrestation - montantEncaisse - moderateurAssocie - excluAssocie);
      const estSolde = soldeFacture === 0 && (montantEncaisse > 0 || prest.statut === 'Payé');

      return {
        prestation: prest,
        societe: getSociete(prest.societeId),
        personne: getPersonne(prest.personneId),
        montantReclame: prest.totalPrestation,
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
          // Find matching famille by exact code or aliases
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
      countPrestations: number;
      totalMontant: number;
      totalModerateur: number;
      actesList: string[];
    }>();

    filteredPrestations.forEach(prest => {
      const pers = getPersonne(prest.personneId);
      if (!pers) return;

      const current = perMap.get(pers.id) || {
        personne: pers,
        societe: getSociete(pers.societeId || prest.societeId),
        countPrestations: 0,
        totalMontant: 0,
        totalModerateur: 0,
        actesList: [],
      };

      current.countPrestations += 1;
      current.totalMontant += prest.totalPrestation;
      current.totalModerateur += prest.participation || 0;

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
        'Nombre Prestations': row.countPrestations,
        'Nombre Règlements': row.countPaiements,
        'Total Réclamé (Ar)': row.totalReclame,
        'Total Payé (Ar)': row.totalPaye,
        'Ticket Modérateur (Ar)': row.totalModerateur,
        'Montant Exclu (Ar)': row.totalExclu,
        'Solde Restant Dû (Ar)': row.soldeRestant,
        'Taux Recouvrement (%)': `${row.tauxRecouvrement}%`,
      }));
    } else if (activeReport === 'rapprochement') {
      reportTitle = 'Rapprochement_Factures_Reglements';
      wsData = rapprochementFactures.map(row => ({
        'N° Facture': row.prestation.numeroFacture,
        'Date Soins': row.prestation.date,
        'Société': row.societe?.nom || '',
        'Assuré': row.personne?.nomPrenom || '',
        'Matricule': row.personne?.matricule || '',
        'Montant Réclamé (Ar)': row.montantReclame,
        'Montant Encaissé (Ar)': row.montantEncaisse,
        'Ticket Modérateur (Ar)': row.moderateurAssocie,
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
        'Sous-Société': row.personne.sousSociete || '',
        'Nombre Dossiers': row.countPrestations,
        'Montant Total Consommé (Ar)': row.totalMontant,
        'Ticket Modérateur (Ar)': row.totalModerateur,
        'Actes Réalisés': row.actesList.join(', '),
      }));
    }

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rapport');
    XLSX.writeFile(wb, `${reportTitle}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div id="etats-view" className="space-y-6">
      {/* Header with Title and Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-ink-strong">Rapports & États Comptables Assurance</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Édition des états financiers, rapprochement factures-règlements et ventilations médicales
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-print-report"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink shadow-xs transition hover:bg-surface-muted"
          >
            <Printer className="h-4 w-4 text-ink-muted" />
            <span>Imprimer le relevé</span>
          </button>

          <button
            id="btn-export-excel-report"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            <span>Exporter en Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Financial Summary KPI Cards (Printable) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface p-5 rounded-xl border border-line shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total Réclamé</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-ink-strong">{formatMoney(totalReclame)}</div>
          <div className="text-xs text-ink-muted">{filteredPrestations.length} dossiers facturés</div>
        </div>

        <div className="bg-surface p-5 rounded-xl border border-line shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total Encaissé (Net)</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{formatMoney(totalPaye)}</div>
          <div className="text-xs text-ink-muted">{filteredPaiements.length} bordereaux validés</div>
        </div>

        <div className="bg-surface p-5 rounded-xl border border-line shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Reste à Recouvrer</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600">{formatMoney(resteARecouvrer)}</div>
          <div className="text-xs text-ink-muted">Créances en cours de règlement</div>
        </div>

        <div className="bg-surface p-5 rounded-xl border border-line shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Taux de Recouvrement</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-700">{tauxRecouvrement}%</div>
          <div className="text-xs text-ink-muted">
            Modérateur: {formatMoney(totalModerateur)} · Rejets: {formatMoney(totalExclu)}
          </div>
        </div>
      </div>

      {/* Filter and Report Selection Card */}
      <div className="bg-surface rounded-xl border border-line p-4 space-y-4 shadow-xs print:hidden">
        {/* Report Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-line-soft pb-3">
          <button
            onClick={() => setActiveReport('recap_societes')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeReport === 'recap_societes'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Building className="h-4 w-4" />
            <span>Synthèse par Société / Garant</span>
          </button>

          <button
            onClick={() => setActiveReport('rapprochement')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeReport === 'rapprochement'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Receipt className="h-4 w-4" />
            <span>Rapprochement Factures & Paiements</span>
          </button>

          <button
            onClick={() => setActiveReport('familles_actes')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeReport === 'familles_actes'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Ventilation par Famille d'Actes</span>
          </button>

          <button
            onClick={() => setActiveReport('assures')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeReport === 'assures'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Relevé Nominatif des Assurés</span>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
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
          </div>
        </div>
      </div>

      {/* REPORT CONTENT TABLES */}

      {/* 1. Synthèse par Société */}
      {activeReport === 'recap_societes' && (
        <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-xs">
          <div className="p-4 border-b border-line-soft flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-strong">
              État Récapitulatif par Organisme & Compagnie d'Assurance
            </h3>
            <span className="text-xs text-ink-muted">
              {syntheseSocietes.length} organisme(s) actif(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted text-ink-secondary uppercase font-semibold border-b border-line">
                <tr>
                  <th className="px-4 py-3">Société / Assurance</th>
                  <th className="px-4 py-3 text-center">Dossiers</th>
                  <th className="px-4 py-3 text-right">Montant Réclamé</th>
                  <th className="px-4 py-3 text-right">Montant Payé (Net)</th>
                  <th className="px-4 py-3 text-right">Ticket Modérateur</th>
                  <th className="px-4 py-3 text-right">Montant Exclu</th>
                  <th className="px-4 py-3 text-right">Solde Restant</th>
                  <th className="px-4 py-3 text-center">Recouvrement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-ink">
                {syntheseSocietes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-ink-faint">
                      Aucune donnée enregistrée pour les critères sélectionnés.
                    </td>
                  </tr>
                ) : (
                  syntheseSocietes.map(row => (
                    <tr key={row.societe.id} className="hover:bg-surface-muted/80 transition-colors">
                      <td className="px-4 py-3 font-semibold text-ink-strong">
                        <div>{row.societe.nom}</div>
                        <div className="text-[11px] font-mono text-ink-muted font-normal">Code: {row.societe.code}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">{row.countPrestations}</td>
                      <td className="px-4 py-3 text-right font-bold text-ink-strong">{formatMoney(row.totalReclame)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatMoney(row.totalPaye)}</td>
                      <td className="px-4 py-3 text-right text-ink-secondary">{formatMoney(row.totalModerateur)}</td>
                      <td className="px-4 py-3 text-right text-rose-600">{formatMoney(row.totalExclu)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600">{formatMoney(row.soldeRestant)}</td>
                      <td className="px-4 py-3 text-center">
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
                    </tr>
                  ))
                )}
              </tbody>
              {syntheseSocietes.length > 0 && (
                <tfoot className="bg-surface-muted font-bold text-ink-strong border-t-2 border-line">
                  <tr>
                    <td className="px-4 py-3 uppercase">Total Général</td>
                    <td className="px-4 py-3 text-center">{filteredPrestations.length}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(totalReclame)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{formatMoney(totalPaye)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(totalModerateur)}</td>
                    <td className="px-4 py-3 text-right text-rose-600">{formatMoney(totalExclu)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{formatMoney(resteARecouvrer)}</td>
                    <td className="px-4 py-3 text-center">{tauxRecouvrement}%</td>
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
            <h3 className="text-sm font-bold text-ink-strong">
              Rapprochement Détaillé Factures & Règlements Reçus
            </h3>
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
                  <th className="px-4 py-3 text-right">Réclamé</th>
                  <th className="px-4 py-3 text-right">Encaissé</th>
                  <th className="px-4 py-3 text-right">Ticket Mod.</th>
                  <th className="px-4 py-3 text-right">Solde Dû</th>
                  <th className="px-4 py-3 text-center">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-ink">
                {rapprochementFactures.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-ink-faint">
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
                      <td className="px-4 py-3 text-right font-bold text-ink-strong">
                        {formatMoney(row.montantReclame)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        {formatMoney(row.montantEncaisse)}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-secondary">
                        {formatMoney(row.moderateurAssocie)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600">
                        {formatMoney(row.soldeFacture)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          row.statutReglement === 'Soldé'
                            ? 'bg-emerald-100 text-emerald-800'
                            : row.statutReglement === 'Partiel'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
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
              Ventilation Médicale & Financière par Famille d'Actes
            </h3>
            <span className="text-xs text-ink-muted">
              {actesStats.length} catégorie(s) d'actes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted text-ink-secondary uppercase font-semibold border-b border-line">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Libellé de la Famille d'Actes</th>
                  <th className="px-4 py-3 text-center">Nombre d'Actes</th>
                  <th className="px-4 py-3 text-right">Montant Total</th>
                  <th className="px-4 py-3 text-right">Part dans les Soins</th>
                  <th className="px-4 py-3 text-right">Coût Moyen / Acte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-ink">
                {actesStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-ink-faint">
                      Aucun acte médical enregistré.
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
                      <td className="px-4 py-3 text-right font-semibold text-ink">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-surface-hover rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-2 rounded-full"
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
                  <th className="px-4 py-3">Nom & Prénom</th>
                  <th className="px-4 py-3">Qualité</th>
                  <th className="px-4 py-3">Société / Affiliation</th>
                  <th className="px-4 py-3 text-center">Dossiers</th>
                  <th className="px-4 py-3">Actes Bénéficiés</th>
                  <th className="px-4 py-3 text-right">Total Soins</th>
                  <th className="px-4 py-3 text-right">Ticket Mod.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-ink">
                {assuresStats.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-ink-faint">
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
                      <td className="px-4 py-3 text-center font-medium">
                        {row.countPrestations}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.actesList.map(act => (
                            <span key={act} className="px-1.5 py-0.5 rounded bg-surface-hover text-ink text-[10px] font-mono">
                              {act}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-ink-strong">
                        {formatMoney(row.totalMontant)}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-secondary">
                        {formatMoney(row.totalModerateur)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
