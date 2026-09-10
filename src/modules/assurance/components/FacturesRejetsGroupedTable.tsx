import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Receipt,
  AlertTriangle,
  XCircle,
  Building2,
  Calendar,
  Users,
  RotateCcw,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { formatMoney, formatDate } from '../utils/formatters';
import { RejetDetail } from './RejetsView';

export interface GroupedRejetFacture {
  numeroFacture: string;
  societeId: string;
  societeNom: string;
  sousSocietes: string[];
  dateMin: string;
  dateMax: string;
  rejets: RejetDetail[];
  nombreAssures: number;
  nombreLignesRejet: number;
  totalMontantBrut: number;
  totalMontantRejete: number;
  tauxRejet: number; // (totalMontantRejete / totalMontantBrut) * 100
  hasDismissed?: boolean;
}

export type RejetFactureSortField =
  | 'numeroFacture'
  | 'date'
  | 'societe'
  | 'nombreAssures'
  | 'nombreLignesRejet'
  | 'totalMontantBrut'
  | 'totalMontantRejete'
  | 'tauxRejet';

interface FacturesRejetsGroupedTableProps {
  groupedFactures: GroupedRejetFacture[];
  expandedRows: Record<string, boolean>;
  toggleRow: (numeroFacture: string) => void;
  sortField: RejetFactureSortField;
  sortDirection: 'asc' | 'desc';
  onSort: (field: RejetFactureSortField) => void;
  onDismissRejet: (id: string, numFacture: string) => void;
  onRestoreRejet: (id: string, numFacture: string) => void;
  onDeleteRejet?: (rejet: RejetDetail) => void;
  showDismissed: boolean;
}

export const FacturesRejetsGroupedTable: React.FC<FacturesRejetsGroupedTableProps> = ({
  groupedFactures,
  expandedRows,
  toggleRow,
  sortField,
  sortDirection,
  onSort,
  onDismissRejet,
  onRestoreRejet,
  onDeleteRejet,
  showDismissed
}) => {
  const renderSortIcon = (field: RejetFactureSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-rose-600 font-bold ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-rose-600 font-bold ml-1" />
    );
  };

  const totals = groupedFactures.reduce(
    (acc, f) => {
      acc.totalBrut += f.totalMontantBrut;
      acc.totalRejete += f.totalMontantRejete;
      acc.totalRejetsCount += f.nombreLignesRejet;
      acc.totalAssuresCount += f.nombreAssures;
      return acc;
    },
    { totalBrut: 0, totalRejete: 0, totalRejetsCount: 0, totalAssuresCount: 0 }
  );

  return (
    <div className="bg-surface rounded-xl border border-line shadow-2xs overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
      <div className="overflow-auto flex-1">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-surface-muted text-ink uppercase text-[11px] font-semibold border-b border-line select-none shadow-2xs">
            <tr>
              <th className="py-3 px-2 w-8"></th>

              {/* N° Facture */}
              <th
                onClick={() => onSort('numeroFacture')}
                className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${
                  sortField === 'numeroFacture' ? 'bg-rose-50/60 text-rose-900 font-bold' : ''
                }`}
              >
                <div className="flex items-center">
                  <span>N° Facture</span>
                  {renderSortIcon('numeroFacture')}
                </div>
              </th>

              {/* Date Soins */}
              <th
                onClick={() => onSort('date')}
                className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${
                  sortField === 'date' ? 'bg-rose-50/60 text-rose-900 font-bold' : ''
                }`}
              >
                <div className="flex items-center">
                  <span>Période / Date</span>
                  {renderSortIcon('date')}
                </div>
              </th>

              {/* Tiers-Payeur */}
              <th
                onClick={() => onSort('societe')}
                className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${
                  sortField === 'societe' ? 'bg-rose-50/60 text-rose-900 font-bold' : ''
                }`}
              >
                <div className="flex items-center">
                  <span>Organisme Assureur</span>
                  {renderSortIcon('societe')}
                </div>
              </th>

              {/* Assurés & Actes */}
              <th
                onClick={() => onSort('nombreAssures')}
                className={`py-3 px-3 text-center cursor-pointer group hover:bg-surface-hover/80 transition ${
                  sortField === 'nombreAssures' ? 'bg-rose-50/60 text-rose-900 font-bold' : ''
                }`}
              >
                <div className="flex items-center justify-center">
                  <span>Assurés / Rejets</span>
                  {renderSortIcon('nombreAssures')}
                </div>
              </th>

              {/* Montant Initial Brut */}
              <th
                onClick={() => onSort('totalMontantBrut')}
                className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${
                  sortField === 'totalMontantBrut' ? 'bg-rose-50/60 text-rose-900 font-bold' : ''
                }`}
              >
                <div className="flex items-center justify-end">
                  <span>Total Facturé</span>
                  {renderSortIcon('totalMontantBrut')}
                </div>
              </th>

              {/* Montant Total Rejeté */}
              <th
                onClick={() => onSort('totalMontantRejete')}
                className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${
                  sortField === 'totalMontantRejete' ? 'bg-rose-50/60 text-rose-900 font-bold' : ''
                }`}
              >
                <div className="flex items-center justify-end">
                  <span className="text-rose-700">Montant Rejeté</span>
                  {renderSortIcon('totalMontantRejete')}
                </div>
              </th>

              {/* Impact / Taux */}
              <th
                onClick={() => onSort('tauxRejet')}
                className={`py-3 px-3 text-center cursor-pointer group hover:bg-surface-hover/80 transition ${
                  sortField === 'tauxRejet' ? 'bg-rose-50/60 text-rose-900 font-bold' : ''
                }`}
              >
                <div className="flex items-center justify-center">
                  <span>Impact Rejet</span>
                  {renderSortIcon('tauxRejet')}
                </div>
              </th>

              <th className="py-3 px-3 text-center">Détails</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {groupedFactures.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-ink-faint">
                  <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold">Aucune facture avec rejet trouvée pour ces critères.</p>
                  <p className="text-[11px] text-ink-faint mt-0.5">
                    Modifiez les filtres de recherche ou sélectionnez une autre période.
                  </p>
                </td>
              </tr>
            ) : (
              groupedFactures.map((facture) => {
                const isExpanded = !!expandedRows[facture.numeroFacture];

                return (
                  <React.Fragment key={facture.numeroFacture}>
                    <tr
                      onClick={() => toggleRow(facture.numeroFacture)}
                      className={`hover:bg-rose-50/40 transition-colors cursor-pointer ${
                        isExpanded ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      {/* Expand Chevron */}
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(facture.numeroFacture);
                          }}
                          className="p-1 rounded hover:bg-rose-100 text-ink-faint hover:text-rose-700 transition"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-rose-600 font-bold" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* N° Facture */}
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-indigo-700 flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{facture.numeroFacture}</span>
                        </div>
                        <div className="text-[10px] text-ink-muted mt-0.5">
                          {facture.nombreLignesRejet} ligne(s) d'exclusion/rejet
                        </div>
                      </td>

                      {/* Date Soins */}
                      <td className="py-3 px-3">
                        <div className="font-medium text-ink flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-ink-faint" />
                          <span>
                            {facture.dateMin
                              ? facture.dateMin === facture.dateMax
                                ? formatDate(facture.dateMin)
                                : `${formatDate(facture.dateMin)} - ${formatDate(facture.dateMax)}`
                              : '-'}
                          </span>
                        </div>
                      </td>

                      {/* Tiers-Payeur */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-ink flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                          <span>{facture.societeNom}</span>
                        </div>
                        {facture.sousSocietes.length > 0 && (
                          <div className="text-[10px] text-ink-muted truncate max-w-[200px]">
                            {facture.sousSocietes.join(', ')}
                          </div>
                        )}
                      </td>

                      {/* Assurés & Actes */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center gap-1 font-semibold text-ink bg-surface-hover px-2 py-0.5 rounded-full text-[10px]">
                          <Users className="w-3 h-3 text-ink-muted" />
                          <span>{facture.nombreAssures} patient(s)</span>
                        </div>
                      </td>

                      {/* Total Facturé */}
                      <td className="py-3 px-3 text-right font-medium text-ink">
                        {formatMoney(facture.totalMontantBrut)}
                      </td>

                      {/* Total Rejeté */}
                      <td className="py-3 px-3 text-right font-black text-rose-700 bg-rose-50/60 font-mono text-sm">
                        {formatMoney(facture.totalMontantRejete)}
                      </td>

                      {/* Impact / Taux */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            facture.tauxRejet >= 100
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : facture.tauxRejet >= 50
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-surface-hover text-ink'
                          }`}>
                            {facture.tauxRejet.toFixed(0)}%
                          </span>
                          <span className="text-[9px] text-ink-faint mt-0.5">
                            {facture.tauxRejet >= 100 ? 'Rejet 100%' : 'Rejet partiel'}
                          </span>
                        </div>
                      </td>

                      {/* Action Expand Details */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleRow(facture.numeroFacture)}
                          className="px-2.5 py-1 rounded-lg border border-line text-ink hover:bg-surface-hover text-[11px] font-semibold transition cursor-pointer"
                        >
                          {isExpanded ? 'Masquer' : 'Voir les rejets'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Detail Rows */}
                    {isExpanded && (
                      <tr className="bg-surface-muted/80">
                        <td colSpan={9} className="p-4 space-y-3">
                          <div className="bg-surface rounded-xl border border-line p-3 shadow-xs space-y-2">
                            <div className="text-[11px] font-bold text-ink uppercase tracking-wider flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-rose-700">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                <span>Actes Médicaux et Motifs de Rejet pour la facture {facture.numeroFacture}</span>
                              </span>
                              <span className="text-ink-faint lowercase font-normal">
                                {facture.rejets.length} acte(s) / exclusion(s)
                              </span>
                            </div>

                            <table className="w-full text-xs">
                              <thead className="text-[10px] text-ink-muted uppercase bg-surface-muted border-b border-line">
                                <tr>
                                  <th className="py-2 px-2 text-left">Date</th>
                                  <th className="py-2 px-2 text-left">Patient / Assuré</th>
                                  <th className="py-2 px-2 text-left">Acte Médical</th>
                                  <th className="py-2 px-2 text-right">Montant Brut</th>
                                  <th className="py-2 px-2 text-right text-rose-700">Montant Rejeté</th>
                                  <th className="py-2 px-2 text-left">Motif notifié</th>
                                  <th className="py-2 px-2 text-center">Bordereau Paiement</th>
                                  <th className="py-2 px-2 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {facture.rejets.map((r) => (
                                  <tr key={r.id} className="hover:bg-rose-50/30">
                                    <td className="py-2 px-2 text-ink-secondary whitespace-nowrap">
                                      {formatDate(r.dateSoins)}
                                    </td>
                                    <td className="py-2 px-2">
                                      <div className="font-semibold text-ink-strong">{r.nomAgent}</div>
                                      <div className="text-[10px] text-ink-faint font-mono">{r.matricule}</div>
                                    </td>
                                    <td className="py-2 px-2">
                                      <div className="font-mono font-bold text-indigo-700">{r.codeActe}</div>
                                      <div className="text-[10px] text-ink-secondary">{r.libelleActe}</div>
                                    </td>
                                    <td className="py-2 px-2 text-right font-medium text-ink whitespace-nowrap">
                                      {formatMoney(r.montantInitial)}
                                    </td>
                                    <td className="py-2 px-2 text-right font-black text-rose-700 bg-rose-50/50 whitespace-nowrap">
                                      {formatMoney(r.montantExcluRejete)}
                                    </td>
                                    <td className="py-2 px-2 max-w-[200px]">
                                      <p className="text-[11px] text-ink truncate" title={r.motif}>
                                        {r.motif}
                                      </p>
                                    </td>
                                    <td className="py-2 px-2 text-center font-mono text-[10px] text-ink-secondary whitespace-nowrap">
                                      {r.bordereauPaiement || '-'}
                                    </td>
                                    <td className="py-2 px-2 text-center whitespace-nowrap space-x-1">
                                      {showDismissed ? (
                                        <button
                                          type="button"
                                          onClick={() => onRestoreRejet(r.id, r.numeroFacture)}
                                          className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-[10px] font-semibold transition cursor-pointer"
                                          title="Restaurer"
                                        >
                                          <RotateCcw className="w-3 h-3 inline" />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => onDismissRejet(r.id, r.numeroFacture)}
                                          className="px-1.5 py-0.5 rounded bg-surface-muted border border-line text-ink-faint hover:text-rose-600 hover:bg-rose-50 text-[10px] font-semibold transition cursor-pointer"
                                          title="Masquer"
                                        >
                                          <XCircle className="w-3 h-3 inline" />
                                        </button>
                                      )}
                                      {onDeleteRejet && (
                                        <button
                                          type="button"
                                          onClick={() => onDeleteRejet(r)}
                                          className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 text-[10px] font-semibold transition cursor-pointer"
                                          title="Supprimer définitivement ce rejet (remet à zéro les exclusions et recalcule la prestation)"
                                        >
                                          <Trash2 className="w-3 h-3 inline" />
                                        </button>
                                      )}
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

      {/* Bar de Totaux Généraux */}
      <div className="sticky bottom-0 z-20 shrink-0 bg-slate-900 text-white border-t border-slate-800 px-4 py-3 shadow-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold uppercase text-slate-300 tracking-wider">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
          <span>Synthèse par Facture ({groupedFactures.length} factures rejetées)</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono font-bold">
          <div className="text-right">
            <span className="text-[10px] uppercase font-sans text-ink-faint block font-normal">Total Facturé</span>
            <span className="text-slate-100">{formatMoney(totals.totalBrut)}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-sans text-rose-400 block font-normal">Total Rejeté</span>
            <span className="text-rose-400 font-extrabold text-sm">{formatMoney(totals.totalRejete)}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-sans text-ink-faint block font-normal">Impact Global</span>
            <span className="text-amber-300">
              {totals.totalBrut > 0 ? ((totals.totalRejete / totals.totalBrut) * 100).toFixed(1) : 0}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
