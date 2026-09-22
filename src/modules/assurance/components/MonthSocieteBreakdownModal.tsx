import React, { useState, useMemo } from 'react';
import { 
  X, 
  Building2, 
  Calendar, 
  Search, 
  Printer, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Receipt,
  FileText,
  DollarSign,
  TrendingUp,
  Percent
} from 'lucide-react';
import { Prestation, Societe, Personne } from '../types';
import { formatMoney, formatDate } from '../utils/formatters';

interface MonthSocieteBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthKey: string;
  monthLabel: string;
  prestations: Prestation[];
  societes: Societe[];
  personnes: Personne[];
}

export const MonthSocieteBreakdownModal: React.FC<MonthSocieteBreakdownModalProps> = ({
  isOpen,
  onClose,
  monthKey,
  monthLabel,
  prestations,
  societes,
  personnes,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [sortBy, setSortBy] = useState<'solde_desc' | 'facture_desc' | 'name_asc' | 'taux_asc'>('solde_desc');
  const [expandedSocieteIds, setExpandedSocieteIds] = useState<Record<string, boolean>>({});

  // Helper getters
  const getSocieteNom = (id?: string) => {
    if (!id) return 'Société Inconnue';
    return societes.find(s => s.id === id)?.nom || id;
  };

  const getSocieteCode = (id?: string) => {
    if (!id) return '';
    return societes.find(s => s.id === id)?.code || '';
  };

  const getPersonneNom = (id?: string) => {
    if (!id) return 'Assuré Inconnu';
    return personnes.find(p => p.id === id)?.nomPrenom || id;
  };

  // Prestations for this exact monthKey (YYYY-MM)
  const monthPrestations = useMemo(() => {
    if (!monthKey) return [];
    return prestations.filter(p => {
      if (!p.date) return false;
      const d = new Date(p.date);
      if (isNaN(d.getTime())) return false;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === monthKey;
    });
  }, [prestations, monthKey]);

  // Aggregate by societe
  const societeBreakdown = useMemo(() => {
    const map: Record<string, {
      societeId: string;
      societeNom: string;
      societeCode: string;
      totalPrestation: number;
      partAssurance: number;
      totalPaye: number;
      totalExclu: number;
      totalARecouvrer: number;
      countTotal: number;
      countEnAttente: number;
      prestations: Prestation[];
    }> = {};

    monthPrestations.forEach(p => {
      const socId = p.societeId || p.societeNom || 'INCONNU';
      const socNom = getSocieteNom(p.societeId) || p.societeNom || 'Société Inconnue';
      const socCode = getSocieteCode(p.societeId);

      const totalPres = p.totalPrestation || 0;
      const partAss = p.montantARembourser ?? Math.max(0, totalPres - (p.participation || p.ticketModerateur || 0));
      const paye = p.totalPaye || 0;
      const exclu = p.montantExclu || 0;
      const reste = Math.max(0, partAss - paye - exclu);

      if (!map[socId]) {
        map[socId] = {
          societeId: socId,
          societeNom: socNom,
          societeCode: socCode,
          totalPrestation: 0,
          partAssurance: 0,
          totalPaye: 0,
          totalExclu: 0,
          totalARecouvrer: 0,
          countTotal: 0,
          countEnAttente: 0,
          prestations: [],
        };
      }

      map[socId].totalPrestation += totalPres;
      map[socId].partAssurance += partAss;
      map[socId].totalPaye += paye;
      map[socId].totalExclu += exclu;
      map[socId].totalARecouvrer += reste;
      map[socId].countTotal += 1;
      if (reste > 50) {
        map[socId].countEnAttente += 1;
      }
      map[socId].prestations.push(p);
    });

    return Object.values(map);
  }, [monthPrestations, societes]);

  // Global month metrics
  const monthTotals = useMemo(() => {
    return societeBreakdown.reduce((acc, item) => ({
      totalPrestation: acc.totalPrestation + item.totalPrestation,
      partAssurance: acc.partAssurance + item.partAssurance,
      totalPaye: acc.totalPaye + item.totalPaye,
      totalExclu: acc.totalExclu + item.totalExclu,
      totalARecouvrer: acc.totalARecouvrer + item.totalARecouvrer,
      countTotal: acc.countTotal + item.countTotal,
      countEnAttente: acc.countEnAttente + item.countEnAttente,
    }), {
      totalPrestation: 0,
      partAssurance: 0,
      totalPaye: 0,
      totalExclu: 0,
      totalARecouvrer: 0,
      countTotal: 0,
      countEnAttente: 0,
    });
  }, [societeBreakdown]);

  const globalTaux = monthTotals.partAssurance > 0
    ? Math.min(100, Math.round((monthTotals.totalPaye / monthTotals.partAssurance) * 100))
    : (monthTotals.totalPrestation > 0 ? Math.min(100, Math.round((monthTotals.totalPaye / monthTotals.totalPrestation) * 100)) : 100);

  // Filter and sort
  const filteredList = useMemo(() => {
    return societeBreakdown
      .filter(item => {
        // Search term
        if (searchTerm.trim()) {
          const s = searchTerm.toLowerCase();
          const matchNom = item.societeNom.toLowerCase().includes(s);
          const matchCode = item.societeCode.toLowerCase().includes(s);
          if (!matchNom && !matchCode) return false;
        }

        // Filter Mode
        if (filterMode === 'unpaid') {
          return item.totalARecouvrer > 50;
        }
        if (filterMode === 'paid') {
          return item.totalARecouvrer <= 50;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'solde_desc') {
          return b.totalARecouvrer - a.totalARecouvrer;
        }
        if (sortBy === 'facture_desc') {
          return b.totalPrestation - a.totalPrestation;
        }
        if (sortBy === 'name_asc') {
          return a.societeNom.localeCompare(b.societeNom);
        }
        if (sortBy === 'taux_asc') {
          const tauxA = a.partAssurance > 0 ? (a.totalPaye / a.partAssurance) : 1;
          const tauxB = b.partAssurance > 0 ? (b.totalPaye / b.partAssurance) : 1;
          return tauxA - tauxB;
        }
        return 0;
      });
  }, [societeBreakdown, searchTerm, filterMode, sortBy]);

  const toggleExpand = (socId: string) => {
    setExpandedSocieteIds(prev => ({
      ...prev,
      [socId]: !prev[socId]
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-surface w-full max-w-6xl max-h-[92vh] rounded-2xl border border-line shadow-2xl flex flex-col overflow-hidden text-ink animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface-muted/60 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-lg font-bold text-ink-strong">
                  Aperçu des Sociétés & Garants
                </h3>
                <span className="px-3 py-0.5 rounded-full text-xs font-extrabold bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {monthLabel || monthKey}
                </span>
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                Ventilation détaillée des prestations, règlements reçus et soldes restant dus pour chaque organisme payeur.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="p-2 rounded-xl border border-line text-ink-muted hover:text-ink-strong hover:bg-surface-hover transition cursor-pointer text-xs font-semibold flex items-center gap-1.5"
              title="Imprimer cette vue mensuelle"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimer</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-ink-muted hover:text-ink-strong hover:bg-surface-hover transition cursor-pointer"
              title="Fermer (Échap)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Month Summary KPI Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4 px-6 bg-surface-muted/30 border-b border-line text-xs shrink-0">
          <div className="p-2.5 rounded-xl bg-surface border border-line shadow-2xs">
            <span className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider block">Total Facturé</span>
            <span className="text-sm font-bold font-mono text-ink-strong block mt-0.5">{formatMoney(monthTotals.totalPrestation)}</span>
            <span className="text-[10.5px] text-ink-faint">{monthTotals.countTotal} dossier(s)</span>
          </div>

          <div className="p-2.5 rounded-xl bg-surface border border-line shadow-2xs">
            <span className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider block">Part Assurance</span>
            <span className="text-sm font-bold font-mono text-ink block mt-0.5">{formatMoney(monthTotals.partAssurance)}</span>
            <span className="text-[10.5px] text-ink-muted">Montant net pris en charge</span>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 shadow-2xs">
            <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">Règlements Reçus</span>
            <span className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400 block mt-0.5">{formatMoney(monthTotals.totalPaye)}</span>
            <span className="text-[10.5px] text-emerald-600/80 dark:text-emerald-400/80">Encaissé par virement/chèque</span>
          </div>

          <div className="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 shadow-2xs">
            <span className="text-[10px] font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider block">Rejets / Exclus</span>
            <span className="text-sm font-bold font-mono text-rose-700 dark:text-rose-400 block mt-0.5">{formatMoney(monthTotals.totalExclu)}</span>
            <span className="text-[10.5px] text-rose-600/80 dark:text-rose-400/80">Non pris en charge</span>
          </div>

          <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/15 border-2 border-sky-300 dark:border-sky-500/30 shadow-2xs col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-sky-900 dark:text-sky-200 uppercase tracking-wider block">Solde à Recouvrir</span>
            <span className="text-base font-extrabold font-mono text-sky-800 dark:text-sky-300 block mt-0.5">{formatMoney(monthTotals.totalARecouvrer)}</span>
            <span className="text-[10.5px] font-semibold text-sky-700 dark:text-sky-400">{monthTotals.countEnAttente} dossier(s) en attente</span>
          </div>

          <div className="p-2.5 rounded-xl bg-surface border border-line shadow-2xs col-span-2 sm:col-span-1">
            <span className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider block">Taux Recouvrement</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-base font-extrabold font-mono text-ink-strong">{globalTaux}%</span>
              <div className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${globalTaux >= 90 ? 'bg-emerald-500' : globalTaux >= 50 ? 'bg-sky-500' : 'bg-amber-400'}`}
                  style={{ width: `${globalTaux}%` }}
                ></div>
              </div>
            </div>
            <span className="text-[10.5px] text-ink-faint">Sur part assurance</span>
          </div>
        </div>

        {/* Filter and Search Controls */}
        <div className="p-4 px-6 border-b border-line bg-surface flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Rechercher une société ou un code..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-line bg-surface-muted/40 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter mode chips */}
            <div className="flex items-center bg-surface-muted p-0.5 rounded-xl border border-line text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-surface text-ink-strong shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Toutes ({societeBreakdown.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unpaid')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  filterMode === 'unpaid'
                    ? 'bg-sky-600 text-white shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                En attente ({societeBreakdown.filter(s => s.totalARecouvrer > 50).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('paid')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  filterMode === 'paid'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Soldées ({societeBreakdown.filter(s => s.totalARecouvrer <= 50).length})
              </button>
            </div>

            {/* Sort selector */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl border border-line bg-surface text-xs font-semibold text-ink-secondary focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="solde_desc">Trier par solde à recouvrir ↓</option>
              <option value="facture_desc">Trier par montant facturé ↓</option>
              <option value="name_asc">Trier par nom (A-Z)</option>
              <option value="taux_asc">Trier par taux recouvrement ↑</option>
            </select>
          </div>
        </div>

        {/* Modal Body Table */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-6 space-y-4">
          <div className="rounded-xl border border-line overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted text-ink-muted uppercase text-[10.5px] font-semibold border-b border-line sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3.5">Société / Garant</th>
                  <th className="py-2.5 px-3 text-center">Dossiers (Attente / Total)</th>
                  <th className="py-2.5 px-3 text-right">Total Facturé</th>
                  <th className="py-2.5 px-3 text-right">Part Assurance</th>
                  <th className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-400">Règlements Reçus</th>
                  <th className="py-2.5 px-3 text-right text-rose-700 dark:text-rose-400">Exclusions</th>
                  <th className="py-2.5 px-3 text-right text-sky-900 dark:text-sky-300 bg-sky-50/70 dark:bg-sky-500/10">Solde à Recouvrir</th>
                  <th className="py-2.5 px-3 text-center min-w-[110px]">Taux Recouv.</th>
                  <th className="py-2.5 px-3 text-center">Statut</th>
                  <th className="py-2.5 px-3 text-center w-12">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-ink-faint">
                      <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Aucune société ne correspond aux critères de recherche pour {monthLabel}.
                    </td>
                  </tr>
                ) : (
                  filteredList.map(soc => {
                    const isExpanded = !!expandedSocieteIds[soc.societeId];
                    const pctRecouvre = soc.partAssurance > 0
                      ? Math.min(100, Math.round((soc.totalPaye / soc.partAssurance) * 100))
                      : (soc.totalPrestation > 0 ? Math.min(100, Math.round((soc.totalPaye / soc.totalPrestation) * 100)) : 100);

                    const isSolde = soc.totalARecouvrer <= 50;
                    const isPartiel = soc.totalPaye > 0 && !isSolde;

                    return (
                      <React.Fragment key={soc.societeId}>
                        <tr 
                          onClick={() => toggleExpand(soc.societeId)}
                          className={`hover:bg-sky-50/50 dark:hover:bg-sky-500/5 transition cursor-pointer ${
                            isExpanded ? 'bg-sky-50/30 dark:bg-sky-500/5' : ''
                          }`}
                        >
                          <td className="py-3 px-3.5 font-bold text-ink-strong">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="text-ink-faint hover:text-ink p-0.5 rounded transition"
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-sky-600" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span>{soc.societeNom}</span>
                                  {soc.societeCode && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-surface-muted text-ink-muted border border-line">
                                      {soc.societeCode}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center font-medium">
                            <span className={soc.countEnAttente > 0 ? 'text-sky-700 dark:text-sky-400 font-bold' : 'text-ink-muted'}>
                              {soc.countEnAttente}
                            </span>
                            <span className="text-ink-faint"> / {soc.countTotal}</span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-ink-secondary">
                            {formatMoney(soc.totalPrestation)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-ink font-medium">
                            {formatMoney(soc.partAssurance)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatMoney(soc.totalPaye)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                            {soc.totalExclu > 0 ? formatMoney(soc.totalExclu) : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-extrabold text-sky-800 dark:text-sky-300 bg-sky-50/40 dark:bg-sky-500/10">
                            {formatMoney(soc.totalARecouvrer)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center gap-1.5 justify-center">
                              <div className="w-14 h-2 bg-surface-muted rounded-full overflow-hidden shrink-0">
                                <div 
                                  className={`h-full rounded-full ${isSolde ? 'bg-emerald-500' : isPartiel ? 'bg-sky-500' : 'bg-amber-400'}`}
                                  style={{ width: `${pctRecouvre}%` }}
                                ></div>
                              </div>
                              <span className="font-mono text-[10.5px] font-semibold text-ink min-w-[28px] text-right">
                                {pctRecouvre}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isSolde 
                                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                                : isPartiel
                                ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30'
                                : 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                            }`}>
                              {isSolde ? 'Soldé' : isPartiel ? 'En cours' : 'En attente'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(soc.societeId);
                              }}
                              className="px-2 py-1 rounded-lg bg-surface-muted hover:bg-surface-hover text-ink-secondary text-[11px] font-semibold border border-line"
                            >
                              {isExpanded ? 'Replier' : 'Dossiers'}
                            </button>
                          </td>
                        </tr>

                        {/* Expandable sub-table of dossiers */}
                        {isExpanded && (
                          <tr className="bg-surface-muted/30">
                            <td colSpan={10} className="p-4 px-6 border-y border-line-soft">
                              <div className="bg-surface rounded-xl border border-line overflow-hidden shadow-2xs">
                                <div className="px-4 py-2.5 bg-surface-muted/60 border-b border-line flex items-center justify-between">
                                  <span className="font-bold text-ink text-xs flex items-center gap-1.5">
                                    <Receipt className="w-3.5 h-3.5 text-sky-600" />
                                    Factures & Prestations ({soc.prestations.length}) — {soc.societeNom}
                                  </span>
                                  <span className="text-[11px] text-ink-muted">
                                    Mois : {monthLabel}
                                  </span>
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                  <table className="w-full text-left text-[11.5px]">
                                    <thead className="bg-surface-hover text-ink-muted text-[10px] uppercase font-semibold border-b border-line">
                                      <tr>
                                        <th className="py-2 px-3">Date</th>
                                        <th className="py-2 px-3">N° Facture / PEC</th>
                                        <th className="py-2 px-3">Patient / Assuré</th>
                                        <th className="py-2 px-3 text-right">Total Brut</th>
                                        <th className="py-2 px-3 text-right">Part Assurance</th>
                                        <th className="py-2 px-3 text-right text-emerald-700">Payé</th>
                                        <th className="py-2 px-3 text-right text-rose-700">Exclu</th>
                                        <th className="py-2 px-3 text-right text-sky-900 bg-sky-50/50 font-bold">Reste Dû</th>
                                        <th className="py-2 px-3 text-center">Statut</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                      {soc.prestations.map((p, pIdx) => {
                                        const pPart = p.montantARembourser ?? Math.max(0, (p.totalPrestation || 0) - (p.participation || p.ticketModerateur || 0));
                                        const pPaye = p.totalPaye || 0;
                                        const pExclu = p.montantExclu || 0;
                                        const pReste = Math.max(0, pPart - pPaye - pExclu);
                                        const pSolde = pReste <= 50;

                                        return (
                                          <tr key={p.id || pIdx} className="hover:bg-surface-hover/50">
                                            <td className="py-2 px-3 font-mono text-ink-secondary">{formatDate(p.date)}</td>
                                            <td className="py-2 px-3 font-mono font-medium text-ink">
                                              {p.numeroFacture || p.numeroBordereau || '-'}
                                            </td>
                                            <td className="py-2 px-3 font-medium text-ink-strong">
                                              {p.nomAgent || getPersonneNom(p.personneId)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-ink-secondary">
                                              {formatMoney(p.totalPrestation)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-medium text-ink">
                                              {formatMoney(pPart)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-600">
                                              {formatMoney(pPaye)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-rose-600">
                                              {pExclu > 0 ? formatMoney(pExclu) : '-'}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-sky-800 bg-sky-50/30">
                                              {formatMoney(pReste)}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                              <span className={`inline-block px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                                                pSolde ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
                                              }`}>
                                                {pSolde ? 'Soldé' : 'En attente'}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              {filteredList.length > 0 && (
                <tfoot className="bg-surface-hover/90 font-bold border-t-2 border-line-strong text-xs text-ink-strong">
                  <tr>
                    <td className="py-3 px-3.5 uppercase text-[10px] tracking-wider text-ink-secondary">
                      TOTAL ({filteredList.length} Sociétés)
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-sky-800 dark:text-sky-400 font-bold">
                        {filteredList.reduce((s, x) => s + x.countEnAttente, 0)}
                      </span> / {filteredList.reduce((s, x) => s + x.countTotal, 0)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatMoney(filteredList.reduce((s, x) => s + x.totalPrestation, 0))}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatMoney(filteredList.reduce((s, x) => s + x.partAssurance, 0))}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                      {formatMoney(filteredList.reduce((s, x) => s + x.totalPaye, 0))}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-rose-700 dark:text-rose-400">
                      {formatMoney(filteredList.reduce((s, x) => s + x.totalExclu, 0))}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-sky-900 dark:text-sky-300 text-sm bg-sky-100/70 dark:bg-sky-500/20 border-x border-sky-200 dark:border-sky-500/30">
                      {formatMoney(filteredList.reduce((s, x) => s + x.totalARecouvrer, 0))}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      {globalTaux}%
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-[10px] uppercase font-bold text-ink-muted">SYNTHÈSE</span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-line bg-surface-muted/50 text-xs shrink-0">
          <div className="text-ink-muted text-[11px]">
            Double-cliquez ou cliquez sur <span className="font-semibold text-ink">Dossiers</span> pour inspecter les factures d'une société.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-line text-ink-strong font-bold transition cursor-pointer text-xs"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
