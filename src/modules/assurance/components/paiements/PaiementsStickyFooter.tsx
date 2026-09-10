import React from 'react';
import { 
  Receipt, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUp, 
  Download,
  Ban
} from 'lucide-react';
import { formatMoney } from '../../utils/formatters';

interface PaiementsStickyFooterProps {
  viewMode: 'bordereaux' | 'groupes';
  count: number;
  totalReclame: number;
  totalModerateur: number;
  totalPaye: number;
  totalExclu: number;
  onExportExcel?: () => void;
}

export const PaiementsStickyFooter: React.FC<PaiementsStickyFooterProps> = ({
  viewMode,
  count,
  totalReclame,
  totalModerateur,
  totalPaye,
  totalExclu,
  onExportExcel,
}) => {
  const partAssuranceReclamee = Math.max(0, totalReclame - totalModerateur);
  const resteNonRegle = Math.max(0, partAssuranceReclamee - totalPaye);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div 
      id="paiements-sticky-footer"
      className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 text-white border-t-2 border-emerald-500 shadow-2xl backdrop-blur-md py-2.5 px-3 sm:px-6 transition-all duration-200 select-none"
    >
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
        
        {/* Left Badge: Exact Requested "Total de la sélection (N) :" */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-lg text-white font-bold">
            {viewMode === 'bordereaux' ? (
              <Receipt className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Layers className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <div className="flex items-center space-x-1.5">
              <span className="uppercase tracking-wider text-[11px] text-slate-300">
                Total de la sélection
              </span>
              <span className="bg-emerald-600 text-white font-mono font-extrabold px-2 py-0.5 rounded-full text-xs shadow-xs">
                ({count})
              </span>
              <span className="text-slate-300 font-bold">:</span>
            </div>
          </div>
        </div>

        {/* Center: Financial Figures */}
        <div className="flex items-center flex-wrap gap-x-4 sm:gap-x-6 gap-y-1.5 justify-between lg:justify-center">
          {/* Total Réclamé Brut */}
          <div>
            <span className="text-[10px] uppercase font-semibold text-ink-faint block">Total Réclamé</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-slate-100">
              {formatMoney(totalReclame)}
            </span>
          </div>

          {/* Ticket Modérateur */}
          <div>
            <span className="text-[10px] uppercase font-semibold text-amber-400 block">Ticket Mod.</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-amber-300">
              {formatMoney(totalModerateur)}
            </span>
          </div>

          {/* Part Assurance (Reste Réclamé) */}
          <div>
            <span className="text-[10px] uppercase font-semibold text-sky-400 block">Part Assurance</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-sky-200">
              {formatMoney(partAssuranceReclamee)}
            </span>
          </div>

          {/* Total Réglé (Encaissé) */}
          <div className="bg-emerald-900/50 px-2.5 py-1 rounded-md border border-emerald-600/70">
            <span className="text-[10px] uppercase font-bold text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Total Réglé</span>
            </span>
            <span className="text-xs sm:text-sm font-extrabold font-mono text-emerald-400">
              {formatMoney(totalPaye)}
            </span>
          </div>

          {/* Solde Non Réglé */}
          <div className={`px-2.5 py-1 rounded-md border ${
            resteNonRegle > 0 
              ? 'bg-rose-950/70 border-rose-600/80 text-rose-300' 
              : 'bg-slate-800/80 border-slate-700 text-ink-faint'
          }`}>
            <span className="text-[10px] uppercase font-bold flex items-center gap-1">
              {resteNonRegle > 0 && <AlertCircle className="w-3 h-3 text-rose-400" />}
              <span>Reste non réglé</span>
            </span>
            <span className={`text-xs sm:text-sm font-extrabold font-mono ${
              resteNonRegle > 0 ? 'text-rose-400' : 'text-slate-300'
            }`}>
              {formatMoney(resteNonRegle)}
            </span>
          </div>

          {/* Total Exclu / Rejets */}
          {totalExclu > 0 && (
            <div className="bg-amber-950/60 border border-amber-700/70 px-2.5 py-1 rounded-md text-amber-300">
              <span className="text-[10px] uppercase font-bold flex items-center gap-1">
                <Ban className="w-3 h-3 text-amber-400" />
                <span>Rejets/Exclus</span>
              </span>
              <span className="text-xs sm:text-sm font-extrabold font-mono text-amber-300">
                {formatMoney(totalExclu)}
              </span>
            </div>
          )}
        </div>

        {/* Right: Quick actions & Scroll to top */}
        <div className="flex items-center justify-end space-x-2">
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition cursor-pointer"
              title="Exporter les règlements affichés vers Excel"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Excel</span>
            </button>
          )}

          <button
            onClick={scrollToTop}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition cursor-pointer shadow-xs"
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
