import React, { useState } from 'react';
import { History, Search, Calendar, Download, Building, Receipt, ArrowUpDown } from 'lucide-react';
import { Paiement, Societe } from '../types';
import { formatMoney, formatDate } from '../utils/formatters';
import * as XLSX from 'xlsx';

interface HistoriqueViewProps {
  paiements: Paiement[];
  societes: Societe[];
  selectedSocieteId: string;
}

export const HistoriqueView: React.FC<HistoriqueViewProps> = ({
  paiements,
  societes,
  selectedSocieteId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [selectedMode, setSelectedMode] = useState('ALL');

  const filteredPaiements = paiements.filter(p => {
    const matchesSoc = !selectedSocieteId || selectedSocieteId === 'ALL' || p.societeId === selectedSocieteId;
    const matchesMode = selectedMode === 'ALL' || p.modePaiement === selectedMode;
    const matchesDateStart = !dateStart || p.datePaiement >= dateStart;
    const matchesDateEnd = !dateEnd || p.datePaiement <= dateEnd;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      p.numeroBordereau.toLowerCase().includes(searchLower) ||
      p.referencePaiement.toLowerCase().includes(searchLower) ||
      (p.notes && p.notes.toLowerCase().includes(searchLower));

    return matchesSoc && matchesMode && matchesDateStart && matchesDateEnd && matchesSearch;
  });

  const getSocieteNom = (id: string) => societes.find(s => s.id === id)?.nom || 'Société';

  const handleExportHistory = () => {
    const rows = filteredPaiements.map(p => ({
      'N° Bordereau': p.numeroBordereau,
      'Date Règlement': p.datePaiement,
      'Société': getSocieteNom(p.societeId),
      'Mode de Paiement': p.modePaiement,
      'Référence': p.referencePaiement,
      'Total Réclamé': p.totalReclame,
      'Total Payé (Net)': p.totalPaye,
      'Ticket Modérateur': p.totalModerateur,
      'Total Exclu': p.totalExclu,
      'Remise': p.remise,
      'Notes': p.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historique');
    XLSX.writeFile(wb, `Historique_Paiements_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div id="historique-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-strong">Historique des Règlements & Écritures Financières</h2>
          <p className="text-xs text-ink-muted">
            Journal complet des transactions, virements et déductions assurance
          </p>
        </div>

        <button
          onClick={handleExportHistory}
          className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-surface border border-line text-ink hover:bg-surface-muted shadow-xs"
        >
          <Download className="w-3.5 h-3.5 text-ink-muted" />
          <span>Exporter l'Historique</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface p-4 rounded-xl border border-line shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="block text-ink-muted font-medium mb-1">Recherche</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-ink-faint" />
            <input
              type="text"
              placeholder="Bordereau, référence..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-line focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-ink-muted font-medium mb-1">Du (Date Début)</label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="w-full p-1.5 rounded-lg border border-line focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-ink-muted font-medium mb-1">Au (Date Fin)</label>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="w-full p-1.5 rounded-lg border border-line focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-ink-muted font-medium mb-1">Mode de Paiement</label>
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value)}
            className="w-full p-1.5 rounded-lg border border-line focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">Tous les modes</option>
            <option value="Virement bancaire">Virement bancaire</option>
            <option value="Chèque">Chèque</option>
            <option value="Espèces">Espèces</option>
            <option value="Mobile Money">Mobile Money</option>
          </select>
        </div>
      </div>

      {/* History Ledger Table */}
      <div className="bg-surface rounded-xl border border-line shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted text-ink-secondary uppercase text-[11px] font-semibold border-b border-line">
              <tr>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">N° Bordereau</th>
                <th className="py-3 px-3">Compagnie / Assureur</th>
                <th className="py-3 px-3">Mode & Réf</th>
                <th className="py-3 px-3 text-right">Total Réclamé</th>
                <th className="py-3 px-3 text-right">Total Réglé (Net)</th>
                <th className="py-3 px-3 text-right">Ticket Modérateur</th>
                <th className="py-3 px-3 text-right">Exclusions</th>
                <th className="py-3 px-3 text-center">Nombre d'Actes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPaiements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-faint">
                    Aucune écriture trouvée dans l'historique.
                  </td>
                </tr>
              ) : (
                filteredPaiements.map(p => (
                  <tr key={p.id} className="hover:bg-surface-muted">
                    <td className="py-3 px-3 text-ink-secondary font-medium">{formatDate(p.datePaiement)}</td>
                    <td className="py-3 px-3 font-bold text-indigo-700">{p.numeroBordereau}</td>
                    <td className="py-3 px-3 text-ink font-medium">{getSocieteNom(p.societeId)}</td>
                    <td className="py-3 px-3">
                      <div>{p.modePaiement}</div>
                      <div className="text-[10px] text-ink-faint font-mono">{p.referencePaiement}</div>
                    </td>
                    <td className="py-3 px-3 text-right text-ink-secondary">{formatMoney(p.totalReclame)}</td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-700">{formatMoney(p.totalPaye)}</td>
                    <td className="py-3 px-3 text-right text-amber-700">{formatMoney(p.totalModerateur)}</td>
                    <td className="py-3 px-3 text-right text-rose-600">{formatMoney(p.totalExclu)}</td>
                    <td className="py-3 px-3 text-center font-semibold text-ink">{p.lignes.length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
