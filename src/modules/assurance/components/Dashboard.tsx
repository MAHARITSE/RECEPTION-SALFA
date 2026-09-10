import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Receipt, 
  AlertTriangle, 
  FileText, 
  CheckCircle2, 
  Plus, 
  ArrowRight,
  Clock,
  Calendar,
  Filter
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { Prestation, Paiement, Societe, Personne, ActiveTab } from '../types';
import { formatMoney, formatDate } from '../utils/formatters';

interface DashboardProps {
  prestations: Prestation[];
  paiements: Paiement[];
  societes: Societe[];
  personnes: Personne[];
  selectedSocieteId: string;
  onNavigate: (tab: ActiveTab) => void;
  onOpenNewPrestation: () => void;
  onOpenNewPaiement: () => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface p-3 rounded-xl border border-line shadow-xl text-xs space-y-1.5 min-w-[170px]">
        <p className="font-bold text-ink border-b border-line-soft pb-1">{label || payload[0].name}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <span className="text-ink-muted font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: entry.color || entry.fill }}></span>
              {entry.name || 'Montant'} :
            </span>
            <span className="font-bold font-mono" style={{ color: entry.color || entry.fill }}>
              {formatMoney(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const Dashboard: React.FC<DashboardProps> = ({
  prestations,
  paiements,
  societes,
  personnes,
  selectedSocieteId,
  onNavigate,
  onOpenNewPrestation,
  onOpenNewPaiement,
}) => {
  // Filter by selected society if active
  const isAllSoc = !selectedSocieteId || selectedSocieteId === 'ALL';
  const filteredPrestations = isAllSoc
    ? prestations
    : prestations.filter(p => p.societeId === selectedSocieteId || p.societeNom === selectedSocieteId);

  const filteredPaiements = isAllSoc
    ? paiements
    : paiements.filter(p => p.societeId === selectedSocieteId);

  // Compute key indicators
  const totalReclame = filteredPrestations.reduce((sum, p) => sum + (p.totalPrestation || 0), 0);

  // Total Ticket Modérateur (Part assurés)
  const totalModerateur = filteredPrestations.reduce((sum, p) => {
    return sum + (p.participation || p.ticketModerateur || 0);
  }, 0);

  // Total Règlements Effectués par les assurances
  const totalPaye = filteredPaiements.reduce((sum, p) => sum + (p.totalPaye || 0), 0);

  // Total Exclusions & Rejets
  const totalExclu = filteredPrestations.reduce((sum, p) => sum + (p.montantExclu || 0), 0)
    || filteredPaiements.reduce((sum, p) => sum + (p.totalExclu || 0), 0);

  // Total Factures à Recouvrir (Solde restant dû par les assurances = Part Assurance Net - Règlements - Rejets)
  const totalARecouvrer = filteredPrestations.reduce((sum, p) => {
    const partAssurance = p.montantARembourser ?? Math.max(0, (p.totalPrestation || 0) - (p.participation || p.ticketModerateur || 0));
    const paye = p.totalPaye || 0;
    const exclu = p.montantExclu || 0;
    const reste = Math.max(0, partAssurance - paye - exclu);
    return sum + reste;
  }, 0);

  // Nombre de dossiers non soldés auprès des assurances
  const dossiersARecouvrer = filteredPrestations.filter(p => {
    const partAssurance = p.montantARembourser ?? Math.max(0, (p.totalPrestation || 0) - (p.participation || p.ticketModerateur || 0));
    const paye = p.totalPaye || 0;
    const exclu = p.montantExclu || 0;
    const reste = partAssurance - paye - exclu;
    return reste > 50;
  }).length;

  const totalPartAssurance = filteredPrestations.reduce((sum, p) => {
    return sum + (p.montantARembourser ?? Math.max(0, (p.totalPrestation || 0) - (p.participation || p.ticketModerateur || 0)));
  }, 0);

  const tauxCouvertureGlobal = totalPartAssurance > 0 
    ? Math.round((totalPaye / totalPartAssurance) * 100) 
    : (totalReclame > 0 ? Math.round((totalPaye / totalReclame) * 100) : 0);

  // Helper getters
  const getSocieteNom = (id: string) => societes.find(s => s.id === id)?.nom || 'Société Inconnue';
  const getPersonneNom = (id: string) => personnes.find(p => p.id === id)?.nomPrenom || 'Assuré Inconnu';

  // --- Year Selector for Monthly Recovery Section ---
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    filteredPrestations.forEach(p => {
      if (p.date) {
        const d = new Date(p.date);
        if (!isNaN(d.getTime())) {
          yearsSet.add(String(d.getFullYear()));
        }
      }
    });
    const sorted = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    if (sorted.length === 0) {
      sorted.push(String(new Date().getFullYear()));
    }
    return sorted;
  }, [filteredPrestations]);

  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  // Prestations filtered by selected year for monthly analysis
  const monthlyFilteredPrestations = useMemo(() => {
    if (selectedYear === 'ALL') return filteredPrestations;
    return filteredPrestations.filter(p => {
      if (!p.date) return false;
      const d = new Date(p.date);
      return !isNaN(d.getTime()) && String(d.getFullYear()) === selectedYear;
    });
  }, [filteredPrestations, selectedYear]);

  // Section specific totals for the selected year
  const monthlySectionTotalReclame = useMemo(() => 
    monthlyFilteredPrestations.reduce((sum, p) => sum + (p.totalPrestation || 0), 0)
  , [monthlyFilteredPrestations]);

  const monthlySectionTotalPartAssurance = useMemo(() => 
    monthlyFilteredPrestations.reduce((sum, p) => 
      sum + (p.montantARembourser ?? Math.max(0, (p.totalPrestation || 0) - (p.participation || p.ticketModerateur || 0)))
    , 0)
  , [monthlyFilteredPrestations]);

  const monthlySectionTotalPaye = useMemo(() => 
    monthlyFilteredPrestations.reduce((sum, p) => sum + (p.totalPaye || 0), 0)
  , [monthlyFilteredPrestations]);

  const monthlySectionTotalExclu = useMemo(() => 
    monthlyFilteredPrestations.reduce((sum, p) => sum + (p.montantExclu || 0), 0)
  , [monthlyFilteredPrestations]);

  const monthlySectionTotalARecouvrer = useMemo(() => 
    monthlyFilteredPrestations.reduce((sum, p) => {
      const partAssurance = p.montantARembourser ?? Math.max(0, (p.totalPrestation || 0) - (p.participation || p.ticketModerateur || 0));
      const paye = p.totalPaye || 0;
      const exclu = p.montantExclu || 0;
      return sum + Math.max(0, partAssurance - paye - exclu);
    }, 0)
  , [monthlyFilteredPrestations]);

  const monthlySectionDossiersARecouvrer = useMemo(() => 
    monthlyFilteredPrestations.filter(p => {
      const partAssurance = p.montantARembourser ?? Math.max(0, (p.totalPrestation || 0) - (p.participation || p.ticketModerateur || 0));
      const paye = p.totalPaye || 0;
      const exclu = p.montantExclu || 0;
      return (partAssurance - paye - exclu) > 50;
    }).length
  , [monthlyFilteredPrestations]);

  const monthlySectionTauxCouverture = useMemo(() => {
    if (monthlySectionTotalPartAssurance > 0) {
      return Math.round((monthlySectionTotalPaye / monthlySectionTotalPartAssurance) * 100);
    }
    return monthlySectionTotalReclame > 0 ? Math.round((monthlySectionTotalPaye / monthlySectionTotalReclame) * 100) : 0;
  }, [monthlySectionTotalPaye, monthlySectionTotalPartAssurance, monthlySectionTotalReclame]);

  // --- Charts Data Preparation ---
  // --- Data for Factures à Recouvrir par Mois ---
  const monthlyRecouvrementMap = monthlyFilteredPrestations.reduce((acc, p) => {
    if (!p.date) return acc;
    const dateObj = new Date(p.date);
    if (isNaN(dateObj.getTime())) return acc;
    
    const year = dateObj.getFullYear();
    const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${monthStr}`;
    
    const monthLabelRaw = dateObj.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
    const shortLabel = dateObj.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });

    const totalPrestation = p.totalPrestation || 0;
    const partAssurance = p.montantARembourser ?? Math.max(0, totalPrestation - (p.participation || p.ticketModerateur || 0));
    const paye = p.totalPaye || 0;
    const exclu = p.montantExclu || 0;
    const reste = Math.max(0, partAssurance - paye - exclu);

    if (!acc[monthKey]) {
      acc[monthKey] = {
        monthKey,
        monthLabel,
        shortLabel,
        totalPrestation: 0,
        partAssurance: 0,
        totalPaye: 0,
        totalExclu: 0,
        totalARecouvrer: 0,
        countTotal: 0,
        countEnAttente: 0,
      };
    }

    acc[monthKey].totalPrestation += totalPrestation;
    acc[monthKey].partAssurance += partAssurance;
    acc[monthKey].totalPaye += paye;
    acc[monthKey].totalExclu += exclu;
    acc[monthKey].totalARecouvrer += reste;
    acc[monthKey].countTotal += 1;
    if (reste > 50) {
      acc[monthKey].countEnAttente += 1;
    }

    return acc;
  }, {} as Record<string, {
    monthKey: string;
    monthLabel: string;
    shortLabel: string;
    totalPrestation: number;
    partAssurance: number;
    totalPaye: number;
    totalExclu: number;
    totalARecouvrer: number;
    countTotal: number;
    countEnAttente: number;
  }>);

  const monthlyRecouvrementChronological = Object.values(monthlyRecouvrementMap)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const monthlyRecouvrementList = Object.values(monthlyRecouvrementMap)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const caParSocieteMap = filteredPrestations.reduce((acc, p) => {
    const societeNom = getSocieteNom(p.societeId);
    if (!acc[societeNom]) acc[societeNom] = 0;
    acc[societeNom] += p.totalPrestation;
    return acc;
  }, {} as Record<string, number>);

  const caParSocieteData = Object.entries(caParSocieteMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];

  const monthlyDataMap = filteredPrestations.reduce((acc, p) => {
    const dateObj = new Date(p.date);
    const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    // Ex: "janv. 26"
    const monthLabel = dateObj.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    
    if (!acc[monthKey]) {
      acc[monthKey] = { label: monthLabel, monthKey, total: 0 };
    }
    acc[monthKey].total += p.totalPrestation;
    return acc;
  }, {} as Record<string, { label: string; monthKey: string; total: number }>);

  const monthlyData = Object.values(monthlyDataMap)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  // ------------------------------

  return (
    <div id="dashboard-view" className="space-y-6">
      {/* En-tête volontairement concis : les actions utiles restent accessibles sans bannière dense. */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-ink-strong">Vue d'ensemble</h2>
          <p className="mt-0.5 text-sm text-ink-muted">Les indicateurs essentiels de votre activité.</p>
        </div>


      </div>

      {/* 5 Major Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* 1. Total Prestations */}
        <div className="bg-surface p-5 rounded-xl border border-line shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total Prestations</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-ink-strong">{formatMoney(totalReclame)}</div>
          <div className="flex items-center text-xs text-ink-muted">
            <span className="font-medium text-ink mr-1">{filteredPrestations.length}</span> dossiers enregistrés
          </div>
        </div>

        {/* 2. Tickets Modérateurs (Copay) */}
        <div className="bg-surface p-5 rounded-xl border border-line shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Tickets Modérateurs (Copay)</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600">{formatMoney(totalModerateur)}</div>
          <div className="text-xs text-ink-muted">
            Part restant à la charge directe des assurés
          </div>
        </div>

        {/* 3. Total Règlements Effectués */}
        <div className="bg-surface p-5 rounded-xl border border-line shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Total Règlements Effectués</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{formatMoney(totalPaye)}</div>
          <div className="flex items-center text-xs text-emerald-700">
            <TrendingUp className="w-3.5 h-3.5 mr-1 inline" />
            <span>Taux de prise en charge : <strong>{tauxCouvertureGlobal}%</strong></span>
          </div>
        </div>

        {/* 4. Factures à Recouvrir */}
        <div 
          onClick={() => onNavigate('prestations')}
          className="bg-surface p-5 rounded-xl border border-line shadow-xs space-y-2 cursor-pointer hover:border-sky-300 hover:shadow-sm transition-all"
          title="Cliquer pour accéder aux prestations non soldées"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Factures à Recouvrir</span>
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-sky-700">{formatMoney(totalARecouvrer)}</div>
          <div className="flex items-center text-xs text-ink-muted">
            <span className="font-medium text-ink mr-1">{dossiersARecouvrer}</span> dossier(s) en attente
          </div>
        </div>

        {/* 5. Exclusions & Rejets */}
        <div 
          onClick={() => onNavigate('rejets')}
          className="bg-surface p-5 rounded-xl border border-line shadow-xs space-y-2 cursor-pointer hover:border-rose-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Exclusions & Rejets</span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600">{formatMoney(totalExclu)}</div>
          <div className="text-xs text-ink-muted">
            Montants non pris en charge (cliquer pour détails)
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart: Répartition CA par Société */}
        <div className="bg-surface p-5 rounded-xl border border-line shadow-xs flex flex-col">
          <h3 className="font-bold text-ink-strong text-sm mb-4">Répartition par Société</h3>
          <div className="flex-1 min-h-[250px]">
            {caParSocieteData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={caParSocieteData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {caParSocieteData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-ink-faint">
                Aucune donnée disponible
              </div>
            )}
          </div>
          {/* Custom minimal legend */}
          {caParSocieteData.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
              {caParSocieteData.slice(0, 8).map((entry, index) => (
                <div key={entry.name} className="flex items-center text-[11px] text-ink-secondary">
                  <span className="w-2.5 h-2.5 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                  <span className="truncate max-w-[120px]" title={entry.name}>{entry.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bar Chart: Évolution mensuelle */}
        <div className="bg-surface p-5 rounded-xl border border-line shadow-xs flex flex-col">
          <h3 className="font-bold text-ink-strong text-sm mb-4">Évolution Mensuelle</h3>
          <div className="flex-1 min-h-[250px]">
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="label" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    dy={10} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-ink-faint">
                Aucune donnée disponible
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION : Factures à Recouvrir par Mois */}
      <div className="bg-surface rounded-xl border border-line shadow-xs p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-line-soft pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-ink-strong text-base">Factures à Recouvrir par Mois</h3>
                {selectedYear !== 'ALL' && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">
                    Année {selectedYear}
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-muted">
                Suivi mensuel et historique des montants de la part assurance restant en attente de paiement.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Year Selector Control */}
            <div className="flex items-center gap-1.5 bg-surface-hover/90 p-1 rounded-xl border border-line shadow-2xs">
              <div className="flex items-center gap-1 px-2 text-ink-muted text-xs font-semibold shrink-0">
                <Calendar className="w-3.5 h-3.5 text-ink-faint" />
                <span className="hidden sm:inline">Année :</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedYear('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedYear === 'ALL'
                    ? 'bg-surface text-indigo-700 shadow-xs border border-line/60'
                    : 'text-ink-secondary hover:text-ink-strong hover:bg-surface-active/60'
                }`}
              >
                Toutes
              </button>
              {availableYears.map(yr => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setSelectedYear(yr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedYear === yr
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-ink-secondary hover:text-ink-strong hover:bg-surface-active/60'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>

            {/* Total Badge for Selected Year */}
            <div className="flex items-center gap-3 bg-surface-muted border border-line px-3.5 py-1.5 rounded-xl text-xs shrink-0">
              <div>
                <span className="text-ink-muted font-medium block text-[10px] uppercase tracking-wider">
                  {selectedYear === 'ALL' ? 'Total à recouvrir' : `À recouvrir (${selectedYear})`}
                </span>
                <span className="font-extrabold text-sky-700 text-sm font-mono">{formatMoney(monthlySectionTotalARecouvrer)}</span>
              </div>
              <div className="w-px h-7 bg-surface-active"></div>
              <div>
                <span className="text-ink-muted font-medium block text-[10px] uppercase tracking-wider">En attente</span>
                <span className="font-bold text-ink text-xs">{monthlySectionDossiersARecouvrer} dossier(s)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Visual Graph: Règlements reçus vs Solde à recouvrir par mois */}
        {monthlyRecouvrementChronological.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">
                Aperçu Visuel des Règlements vs Restant dû {selectedYear !== 'ALL' ? `(${selectedYear})` : ''}
              </span>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-ink-secondary font-medium text-[11px]">
                  <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block"></span>
                  Règlements reçus
                </span>
                <span className="flex items-center gap-1.5 text-ink-secondary font-medium text-[11px]">
                  <span className="w-3 h-3 rounded-xs bg-sky-500 inline-block"></span>
                  Solde à recouvrir
                </span>
              </div>
            </div>
            <div className="h-[200px] w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRecouvrementChronological} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="shortLabel" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    dy={5}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="totalPaye" name="Règlements reçus" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="totalARecouvrer" name="Solde à recouvrir" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Tableau Récapitulatif Mensuel */}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted text-ink-muted uppercase text-[10.5px] font-semibold border-b border-line">
              <tr>
                <th className="py-2.5 px-3.5">Mois</th>
                <th className="py-2.5 px-3 text-center">Dossiers (Attente / Total)</th>
                <th className="py-2.5 px-3 text-right">Total Facturé</th>
                <th className="py-2.5 px-3 text-right">Part Assurance</th>
                <th className="py-2.5 px-3 text-right text-emerald-700">Règlements Reçus</th>
                <th className="py-2.5 px-3 text-right text-rose-700">Exclusions</th>
                <th className="py-2.5 px-3 text-right text-sky-900 bg-sky-50/70">Solde à Recouvrir</th>
                <th className="py-2.5 px-3 text-center min-w-[120px]">Taux Recouvrement</th>
                <th className="py-2.5 px-3 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthlyRecouvrementList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-faint">
                    Aucune prestation enregistrée pour l'année {selectedYear}.
                  </td>
                </tr>
              ) : (
                monthlyRecouvrementList.map(item => {
                  const pctRecouvre = item.partAssurance > 0 
                    ? Math.min(100, Math.round((item.totalPaye / item.partAssurance) * 100))
                    : 100;

                  const isSolde = item.totalARecouvrer <= 50;
                  const isPartiel = item.totalPaye > 0 && !isSolde;

                  return (
                    <tr key={item.monthKey} className="hover:bg-surface-muted/80 transition">
                      <td className="py-3 px-3.5 font-bold text-ink-strong flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                        <span>{item.monthLabel}</span>
                      </td>
                      <td className="py-3 px-3 text-center font-medium">
                        <span className={item.countEnAttente > 0 ? 'text-sky-700 font-bold' : 'text-ink-muted'}>
                          {item.countEnAttente}
                        </span>
                        <span className="text-ink-faint"> / {item.countTotal}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-ink-secondary">
                        {formatMoney(item.totalPrestation)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-ink font-medium">
                        {formatMoney(item.partAssurance)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-600">
                        {formatMoney(item.totalPaye)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-rose-600">
                        {item.totalExclu > 0 ? formatMoney(item.totalExclu) : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-sky-800 bg-sky-50/40">
                        {formatMoney(item.totalARecouvrer)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="w-16 h-2 bg-surface-hover rounded-full overflow-hidden shrink-0">
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
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : isPartiel
                            ? 'bg-sky-100 text-sky-800 border border-sky-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {isSolde ? 'Soldé' : isPartiel ? 'En cours' : 'En attente'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {monthlyRecouvrementList.length > 0 && (
              <tfoot className="bg-surface-hover/80 font-bold border-t-2 border-line-strong text-xs text-ink-strong">
                <tr>
                  <td className="py-3 px-3.5 uppercase text-[10px] tracking-wider text-ink-secondary">
                    {selectedYear === 'ALL' ? 'Total Général' : `Total Année ${selectedYear}`}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="text-sky-800">{monthlySectionDossiersARecouvrer}</span> / {monthlyFilteredPrestations.length}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">{formatMoney(monthlySectionTotalReclame)}</td>
                  <td className="py-3 px-3 text-right font-mono">{formatMoney(monthlySectionTotalPartAssurance)}</td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-700">{formatMoney(monthlySectionTotalPaye)}</td>
                  <td className="py-3 px-3 text-right font-mono text-rose-700">{formatMoney(monthlySectionTotalExclu)}</td>
                  <td className="py-3 px-3 text-right font-mono text-sky-900 text-sm bg-sky-100/70 border-x border-sky-200">
                    {formatMoney(monthlySectionTotalARecouvrer)}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-ink">{monthlySectionTauxCouverture}%</td>
                  <td className="py-3 px-3 text-center">
                    <span className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">
                      {selectedYear === 'ALL' ? 'Historique' : `Bilan ${selectedYear}`}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
