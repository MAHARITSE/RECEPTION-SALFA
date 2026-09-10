import React from 'react';
import { 
  Receipt, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUp, 
  Download,
  Percent,
  CheckSquare,
  Square,
  FileDown
} from 'lucide-react';
import { formatMoney } from '../../utils/formatters';

interface PrestationsStickyFooterProps {
  viewMode: 'detaillee' | 'factures';
  dossiersCount: number;
  facturesCount: number;
  totalFacture: number;
  totalTicketMod: number;
  totalARembourser: number;
  totalPaye: number;
  totalReste: number;
  selectedCount?: number;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onExportPdfSelected?: () => void;
  onExportExcel?: () => void;
}

export const PrestationsStickyFooter: React.FC<PrestationsStickyFooterProps> = ({
  viewMode,
  dossiersCount,
  facturesCount,
  totalFacture,
  totalTicketMod,
  totalARembourser,
  totalPaye,
  totalReste,
  selectedCount = 0,
  onSelectAll,
  onClearSelection,
  onExportPdfSelected,
  onExportExcel,
}) => {
  const isCustomSelection = selectedCount > 0;
  const effectiveCount = isCustomSelection 
    ? selectedCount 
    : (viewMode === 'factures' ? facturesCount : dossiersCount);

  const tauxRecouvrement = totalARembourser > 0 
    ? Math.min(100, Math.round((totalPaye / totalARembourser) * 100)) 
    : (totalPaye > 0 ? 100 : 0);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div 
      id="prestations-sticky-footer"
      className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 text-white border-t-2 border-indigo-500 shadow-2xl backdrop-blur-md py-2.5 px-3 sm:px-6 transition-all duration-200 select-none"
    >
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
        
        {/* Left Badge: Exact User-Requested "Total de la sélection (N) :" */}
        <div className="flex items-center flex-wrap gap-2">
          <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border font-bold ${
            isCustomSelection
              ? 'bg-indigo-950/90 border-indigo-500 text-indigo-200'
              : 'bg-slate-800/90 border-slate-700 text-white'
          }`}>
            {viewMode === 'factures' ? (
              <Receipt className="w-4 h-4 text-indigo-400 shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            
            <div className="flex items-center space-x-1.5">
              <span className="uppercase tracking-wider text-[11px] text-slate-300">
                Total de la sélection
              </span>
              <span className="bg-indigo-600 text-white font-mono font-extrabold px-2 py-0.5 rounded-full text-xs shadow-xs">
                ({effectiveCount})
              </span>
              <span className="text-slate-300 font-bold">:</span>
            </div>
          </div>

          {/* Selection quick actions */}
          {viewMode === 'detaillee' && (
            <div className="flex items-center space-x-1">
              {isCustomSelection ? (
                <>
                  {onClearSelection && (
                    <button
                      onClick={onClearSelection}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition cursor-pointer"
                      title="Désélectionner toutes les lignes"
                    >
                      <Square className="w-3 h-3 text-ink-faint" />
                      <span>Désélectionner</span>
                    </button>
                  )}
                  {onExportPdfSelected && (
                    <button
                      onClick={onExportPdfSelected}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition cursor-pointer shadow-xs"
                      title="Exporter le décompte PDF des lignes sélectionnées"
                    >
                      <FileDown className="w-3 h-3" />
                      <span>PDF Sélection ({selectedCount})</span>
                    </button>
                  )}
                </>
              ) : (
                onSelectAll && dossiersCount > 0 && (
                  <button
                    onClick={onSelectAll}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition cursor-pointer"
                    title="Cocher tous les dossiers affichés"
                  >
                    <CheckSquare className="w-3 h-3 text-indigo-400" />
                    <span>Tout cocher ({dossiersCount})</span>
                  </button>
                )
              )}
            </div>
          )}

          {/* Taux de recouvrement / encaissement badge */}
          <div className="hidden xl:flex items-center space-x-1.5 bg-emerald-950/70 border border-emerald-700/80 px-2.5 py-1 rounded-lg">
            <Percent className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] uppercase font-bold text-emerald-300">Encaissé :</span>
            <span className="text-xs font-mono font-extrabold text-emerald-400">
              {tauxRecouvrement}%
            </span>
          </div>
        </div>

        {/* Center: Financial Figures Grid */}
        <div className="flex items-center flex-wrap gap-x-4 sm:gap-x-6 gap-y-1.5 justify-between lg:justify-center">
          {/* Total Facturé Brut */}
          <div>
            <span className="text-[10px] uppercase font-semibold text-ink-faint block">Total Brut</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-slate-100">
              {formatMoney(totalFacture)}
            </span>
          </div>

          {/* Ticket Modérateur */}
          <div>
            <span className="text-[10px] uppercase font-semibold text-amber-400 block">Ticket Mod.</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-amber-300">
              {formatMoney(totalTicketMod)}
            </span>
          </div>

          {/* Part Assurance (À Rembourser) */}
          <div>
            <span className="text-[10px] uppercase font-semibold text-sky-400 block">Part Assurance</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-sky-200">
              {formatMoney(totalARembourser)}
            </span>
          </div>

          {/* Total Perçu (Encaissé) */}
          <div className="bg-emerald-900/50 px-2.5 py-1 rounded-md border border-emerald-600/70">
            <span className="text-[10px] uppercase font-bold text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Total Perçu</span>
            </span>
            <span className="text-xs sm:text-sm font-extrabold font-mono text-emerald-400">
              {formatMoney(totalPaye)}
            </span>
          </div>

          {/* Restant à Réclamer */}
          <div className={`px-2.5 py-1 rounded-md border ${
            totalReste > 0 
              ? 'bg-rose-950/70 border-rose-600/80 text-rose-300' 
              : 'bg-slate-800/80 border-slate-700 text-ink-faint'
          }`}>
            <span className="text-[10px] uppercase font-bold flex items-center gap-1">
              {totalReste > 0 && <AlertCircle className="w-3 h-3 text-rose-400" />}
              <span>Reste à Réclamer</span>
            </span>
            <span className={`text-xs sm:text-sm font-extrabold font-mono ${
              totalReste > 0 ? 'text-rose-400' : 'text-slate-300'
            }`}>
              {formatMoney(totalReste)}
            </span>
          </div>
        </div>

        {/* Right: Quick actions & Scroll to top */}
        <div className="flex items-center justify-end space-x-2">
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition cursor-pointer"
              title="Exporter le tableau actuel vers Excel"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Excel</span>
            </button>
          )}

          <button
            onClick={scrollToTop}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition cursor-pointer shadow-xs"
            title="Remonter tout en haut de la page"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Haut</span>
          </button>
        </div>

      </div>
    </div>
  );
};
