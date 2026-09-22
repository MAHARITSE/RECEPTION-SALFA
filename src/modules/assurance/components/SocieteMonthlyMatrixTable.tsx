import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  Search, 
  Filter, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  ArrowUpDown,
  Maximize2
} from 'lucide-react';
import { Prestation, Societe } from '../types';
import { formatMoney } from '../utils/formatters';

interface SocieteMonthlyMatrixTableProps {
  prestations: Prestation[];
  societes: Societe[];
  selectedYear: string;
  onOpenMonthDetail?: (monthKey: string, monthLabel: string) => void;
}

export const SocieteMonthlyMatrixTable: React.FC<SocieteMonthlyMatrixTableProps> = ({
  prestations,
  societes,
  selectedYear,
  onOpenMonthDetail,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [hideZeroBalances, setHideZeroBalances] = useState(true);
  const [sortOrder, setSortOrder] = useState<'total_desc' | 'name_asc'>('total_desc');

  const getSocieteNom = (id?: string) => {
    if (!id) return 'Société Inconnue';
    return societes.find(s => s.id === id)?.nom || id;
  };

  const getSocieteCode = (id?: string) => {
    if (!id) return '';
    return societes.find(s => s.id === id)?.code || '';
  };

  // 1. Identify all distinct months present in the filtered dataset
  const monthColumns = useMemo(() => {
    const map: Record<string, { monthKey: string; monthLabel: string; shortLabel: string; orderDate: number }> = {};

    prestations.forEach(p => {
      if (!p.date) return;
      const d = new Date(p.date);
      if (isNaN(d.getTime())) return;
      
      const yr = d.getFullYear();
      if (selectedYear !== 'ALL' && String(yr) !== selectedYear) return;

      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const monthKey = `${yr}-${monthStr}`;
      
      if (!map[monthKey]) {
        const rawLabel = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const monthLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
        const shortLabel = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        map[monthKey] = {
          monthKey,
          monthLabel,
          shortLabel,
          orderDate: d.getTime(),
        };
      }
    });

    return Object.values(map).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [prestations, selectedYear]);

  // 2. Build cross-tab matrix data: [SocieteId -> { societeNom, monthKey -> { totalARecouvrer, totalPrestation, totalPaye }, totalRowARecouvrer }]
  const matrixData = useMemo(() => {
    const map: Record<string, {
      societeId: string;
      societeNom: string;
      societeCode: string;
      byMonth: Record<string, {
        totalARecouvrer: number;
        totalPrestation: number;
        partAssurance: number;
        totalPaye: number;
        totalExclu: number;
        count: number;
      }>;
      totalARecouvrerAllMonths: number;
      totalFactureAllMonths: number;
      totalPayeAllMonths: number;
    }> = {};

    prestations.forEach(p => {
      if (!p.date) return;
      const d = new Date(p.date);
      if (isNaN(d.getTime())) return;

      const yr = d.getFullYear();
      if (selectedYear !== 'ALL' && String(yr) !== selectedYear) return;

      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const monthKey = `${yr}-${monthStr}`;

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
          byMonth: {},
          totalARecouvrerAllMonths: 0,
          totalFactureAllMonths: 0,
          totalPayeAllMonths: 0,
        };
      }

      if (!map[socId].byMonth[monthKey]) {
        map[socId].byMonth[monthKey] = {
          totalARecouvrer: 0,
          totalPrestation: 0,
          partAssurance: 0,
          totalPaye: 0,
          totalExclu: 0,
          count: 0,
        };
      }

      map[socId].byMonth[monthKey].totalARecouvrer += reste;
      map[socId].byMonth[monthKey].totalPrestation += totalPres;
      map[socId].byMonth[monthKey].partAssurance += partAss;
      map[socId].byMonth[monthKey].totalPaye += paye;
      map[socId].byMonth[monthKey].totalExclu += exclu;
      map[socId].byMonth[monthKey].count += 1;

      map[socId].totalARecouvrerAllMonths += reste;
      map[socId].totalFactureAllMonths += totalPres;
      map[socId].totalPayeAllMonths += paye;
    });

    return Object.values(map);
  }, [prestations, selectedYear, societes]);

  // 3. Filter and sort rows
  const filteredRows = useMemo(() => {
    return matrixData
      .filter(row => {
        if (hideZeroBalances && row.totalARecouvrerAllMonths <= 50) {
          return false;
        }
        if (searchTerm.trim()) {
          const s = searchTerm.toLowerCase();
          const matchNom = row.societeNom.toLowerCase().includes(s);
          const matchCode = row.societeCode.toLowerCase().includes(s);
          if (!matchNom && !matchCode) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'total_desc') {
          return b.totalARecouvrerAllMonths - a.totalARecouvrerAllMonths;
        }
        return a.societeNom.localeCompare(b.societeNom);
      });
  }, [matrixData, hideZeroBalances, searchTerm, sortOrder]);

  // 4. Calculate column totals (by month)
  const columnTotals = useMemo(() => {
    const totalsByMonth: Record<string, number> = {};
    let grandTotalARecouvrer = 0;

    monthColumns.forEach(col => {
      totalsByMonth[col.monthKey] = 0;
    });

    filteredRows.forEach(row => {
      monthColumns.forEach(col => {
        const monthData = row.byMonth[col.monthKey];
        if (monthData) {
          totalsByMonth[col.monthKey] += monthData.totalARecouvrer;
        }
      });
      grandTotalARecouvrer += row.totalARecouvrerAllMonths;
    });

    return {
      totalsByMonth,
      grandTotalARecouvrer,
    };
  }, [filteredRows, monthColumns]);

  if (monthColumns.length === 0) {
    return null;
  }

  return (
    <div className="bg-surface rounded-xl border border-line shadow-xs p-5 space-y-4">
      {/* Section Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-line-soft pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-ink-strong text-base">
                Factures à Recouvrir par Société & par Mois
              </h3>
              {selectedYear !== 'ALL' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                  {selectedYear}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-muted">
              Tableau croisé : ventilation horizontale des soldes restant à recouvrer pour chaque société sur chaque mois.
            </p>
          </div>
        </div>

        {/* Filters and controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Filtrer société..."
              className="pl-8 pr-3 py-1.5 rounded-xl border border-line bg-surface-muted/50 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-ink-secondary font-medium cursor-pointer bg-surface-muted/60 px-3 py-1.5 rounded-xl border border-line select-none hover:bg-surface-hover">
            <input
              type="checkbox"
              checked={hideZeroBalances}
              onChange={e => setHideZeroBalances(e.target.checked)}
              className="rounded text-indigo-600 cursor-pointer"
            />
            <span>Uniquement avec solde dû ({matrixData.filter(x => x.totalARecouvrerAllMonths > 50).length})</span>
          </label>

          <button
            type="button"
            onClick={() => setSortOrder(prev => prev === 'total_desc' ? 'name_asc' : 'total_desc')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line bg-surface hover:bg-surface-hover text-xs font-semibold text-ink-secondary cursor-pointer transition"
            title="Changer l'ordre de tri"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
            <span>{sortOrder === 'total_desc' ? 'Par montant ↓' : 'Nom A-Z'}</span>
          </button>
        </div>
      </div>

      {/* Cross-Tab Matrix Table */}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-surface-muted text-ink-muted uppercase text-[10.5px] font-semibold border-b border-line">
            <tr>
              <th className="py-3 px-3.5 min-w-[200px] sticky left-0 bg-surface-muted z-10 border-r border-line shadow-xs">
                Société / Garant
              </th>
              {monthColumns.map(col => (
                <th 
                  key={col.monthKey} 
                  className="py-3 px-3 text-right min-w-[105px] hover:bg-surface-hover/80 transition cursor-pointer"
                  onClick={() => onOpenMonthDetail?.(col.monthKey, col.monthLabel)}
                  title={`Cliquer pour voir l'aperçu complet de ${col.monthLabel}`}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-ink-strong font-bold">{col.shortLabel}</span>
                  </div>
                </th>
              ))}
              <th className="py-3 px-3.5 text-right min-w-[130px] bg-sky-50/80 dark:bg-sky-500/15 text-sky-900 dark:text-sky-200 border-l border-sky-200 dark:border-sky-500/30">
                Total à Recouvrir
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={monthColumns.length + 2} className="py-8 text-center text-ink-faint">
                  Aucune société ne correspond aux filtres actuels.
                </td>
              </tr>
            ) : (
              filteredRows.map(row => {
                const isOverallSolde = row.totalARecouvrerAllMonths <= 50;

                return (
                  <tr key={row.societeId} className="hover:bg-surface-muted/70 transition group">
                    <td className="py-2.5 px-3.5 font-bold text-ink-strong sticky left-0 bg-surface group-hover:bg-surface-muted/90 transition z-1 border-r border-line">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate max-w-[180px]" title={row.societeNom}>
                          {row.societeNom}
                        </span>
                        {row.societeCode && (
                          <span className="px-1.5 py-0.2 rounded text-[9.5px] font-mono bg-surface-muted text-ink-faint shrink-0">
                            {row.societeCode}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Month cells */}
                    {monthColumns.map(col => {
                      const mData = row.byMonth[col.monthKey];
                      const solde = mData?.totalARecouvrer || 0;
                      const hasActivity = !!mData && mData.count > 0;
                      const isZero = solde <= 50;

                      return (
                        <td 
                          key={col.monthKey} 
                          className={`py-2.5 px-3 text-right font-mono transition ${
                            !hasActivity
                              ? 'text-ink-faint/50'
                              : isZero
                              ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                              : 'text-sky-800 dark:text-sky-300 font-bold bg-sky-50/40 dark:bg-sky-500/10'
                          }`}
                          title={
                            hasActivity
                              ? `${row.societeNom} - ${col.monthLabel}\n• Facturé: ${formatMoney(mData.totalPrestation)}\n• Part Assurance: ${formatMoney(mData.partAssurance)}\n• Règlements: ${formatMoney(mData.totalPaye)}\n• Solde à recouvrir: ${formatMoney(solde)}`
                              : 'Aucune prestation pour ce mois'
                          }
                          onDoubleClick={() => onOpenMonthDetail?.(col.monthKey, col.monthLabel)}
                        >
                          {!hasActivity ? (
                            <span className="text-ink-faint/40">-</span>
                          ) : isZero ? (
                            <span className="inline-flex items-center gap-0.5 text-[11px]">
                              0 Ar
                            </span>
                          ) : (
                            <span>{formatMoney(solde)}</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Total Row Cell */}
                    <td className="py-2.5 px-3.5 text-right font-mono font-extrabold text-sky-900 dark:text-sky-200 bg-sky-50/70 dark:bg-sky-500/15 border-l border-sky-200 dark:border-sky-500/30 text-xs">
                      {isOverallSolde ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">0 Ar</span>
                      ) : (
                        <span>{formatMoney(row.totalARecouvrerAllMonths)}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Footer Totals */}
          {filteredRows.length > 0 && (
            <tfoot className="bg-surface-hover font-bold border-t-2 border-line-strong text-xs text-ink-strong">
              <tr>
                <td className="py-3 px-3.5 uppercase text-[10px] tracking-wider text-ink-secondary sticky left-0 bg-surface-hover z-1 border-r border-line">
                  TOTAL PAR MOIS ({filteredRows.length} soc.)
                </td>
                {monthColumns.map(col => {
                  const monthTotal = columnTotals.totalsByMonth[col.monthKey] || 0;
                  return (
                    <td 
                      key={col.monthKey} 
                      className="py-3 px-3 text-right font-mono text-sky-900 dark:text-sky-300 font-extrabold cursor-pointer hover:underline"
                      onClick={() => onOpenMonthDetail?.(col.monthKey, col.monthLabel)}
                      title={`Total à recouvrir pour ${col.monthLabel} : ${formatMoney(monthTotal)}`}
                    >
                      {formatMoney(monthTotal)}
                    </td>
                  );
                })}
                <td className="py-3 px-3.5 text-right font-mono text-sky-950 dark:text-sky-100 text-sm bg-sky-200/60 dark:bg-sky-500/30 border-l border-sky-300 dark:border-sky-500/40 font-black">
                  {formatMoney(columnTotals.grandTotalARecouvrer)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
