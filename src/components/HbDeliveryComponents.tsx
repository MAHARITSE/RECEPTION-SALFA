import React, { useState } from 'react';
import { Bell, CheckCircle2, Circle, PackageCheck, Pill, Sparkles, UserCheck } from 'lucide-react';
import type { Article, HbRecord } from '../types';
import type { AppState } from '../store';
import {
  deliverAllHbRecordMedications,
  getHbMedicationStats,
  getHbRecordServiceAdditions,
  toggleHbLineDelivery,
} from '../utils/hbDeliveryTracking';
import { formatAr } from '../store';

interface HbServiceNotificationBadgeProps {
  record: HbRecord;
  currentUserRole?: string;
}

/**
 * Badge de notification affiché sur le nom de la personne / après la société (ex : après 🏢 JIRAMA)
 * Réservé UNIQUEMENT au compte pharmacie (role 'pharmacy') pour l'alerter des ajouts faits par les autres services.
 * Rendu comme un simple badge visuel sans bouton.
 */
export const HbServiceNotificationBadge: React.FC<HbServiceNotificationBadgeProps> = ({ record, currentUserRole }) => {
  // Uniquement pour le compte pharmacie
  if (currentUserRole !== 'pharmacy') return null;

  const notifs = getHbRecordServiceAdditions(record);
  if (!notifs.hasAdditions) return null;

  const tooltipText = notifs.services
    .map((s) => `${s.service} ${s.author ? `(${s.author})` : ''}: +${s.count} acte(s) [${s.articles.join(', ')}]`)
    .join(' | ');

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 shadow-xs select-none"
      title={tooltipText}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
      </span>
      <span className="font-bold flex items-center gap-1">
        <Bell className="w-2.5 h-2.5" />
        Ajouts : {notifs.services.map((s) => `${s.service} (+${s.count})`).join(' · ')}
      </span>
    </span>
  );
};

interface HbMedicationDeliveryBadgeProps {
  record: HbRecord;
  articles: Article[];
  familles: any[];
  currentUserRole?: string;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Signalement clignotant de sortie de médicament (Pharmacie uniquement).
 * Alerte la pharmacie en cas de médicaments à délivrer sur un dossier Hospit / Bloc.
 */
export const HbMedicationDeliveryBadge: React.FC<HbMedicationDeliveryBadgeProps> = ({
  record,
  articles,
  familles,
  currentUserRole,
  onToggle,
}) => {
  // Afficher UNIQUEMENT pour le compte Pharmacie
  if (currentUserRole !== 'pharmacy') return null;

  const stats = getHbMedicationStats(record.lines, articles, familles);
  if (!stats.hasMeds) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shadow-xs transition cursor-pointer select-none ${
        stats.isAllDelivered
          ? 'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40'
          : 'bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/20 text-rose-900 dark:text-rose-300 border-rose-300 dark:border-rose-500/50 animate-pulse ring-2 ring-rose-400/50'
      }`}
      title="Signalement clignotant : cliquer pour ouvrir la délivrance de stock médicament"
    >
      {!stats.isAllDelivered ? (
        <>
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-80" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600" />
          </span>
          <Pill className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
          <span className="font-extrabold text-rose-900 dark:text-rose-200">
            🚨 Sortie Médicament ({stats.pendingQty} à délivrer)
          </span>
        </>
      ) : (
        <>
          <Pill className="w-3 h-3 text-emerald-600" />
          <span>Tous livrés</span>
          <span className="text-emerald-700 dark:text-emerald-400 font-bold">✓</span>
        </>
      )}
    </button>
  );
};

interface HbMedicationDeliveryDrawerProps {
  record: HbRecord;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onClose?: () => void;
  onToast?: (msg: string) => void;
}

/**
 * Tiroir / Panneau dépliable de suivi de livraison des médicaments
 * avec cases à cocher pour chaque médicament et déduction / fiabilisation immédiate du stock pharmacie.
 */
export const HbMedicationDeliveryDrawer: React.FC<HbMedicationDeliveryDrawerProps> = ({
  record,
  state,
  setState,
  onClose,
  onToast,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'delivered'>('pending');
  const articles = state.articles || [];
  const familles = state.familles || [];
  const stats = getHbMedicationStats(record.lines, articles, familles);

  // Indexation pour trier par ordre de saisie décroissant (les plus récents en premier)
  const medLinesWithIndex = stats.medLines.map((l) => ({
    ...l,
    _origIdx: record.lines.findIndex((x) => x.id === l.id),
  }));

  const filteredLines = medLinesWithIndex.filter((l) => {
    if (filterMode === 'pending') return !l.delivered;
    if (filterMode === 'delivered') return !!l.delivered;
    return true;
  });

  // Tri par ordre de saisie décroissant (les plus récents en premier)
  filteredLines.sort((a, b) => b._origIdx - a._origIdx);

  const handleToggle = (lineId: string) => {
    const res = toggleHbLineDelivery(state, record.id, lineId, state.currentUser);
    if (res.success) {
      setState(res.nextState);
      if (res.message && onToast) onToast(res.message);
    } else if (res.message) {
      alert(`⚠️ ${res.message}`);
    }
  };

  const handleDeliverAll = () => {
    const res = deliverAllHbRecordMedications(state, record.id, state.currentUser);
    if (res.count > 0) {
      setState(res.nextState);
      if (onToast) onToast(res.message);
    } else if (res.message) {
      alert(res.message);
    }
  };

  if (!stats.hasMeds) {
    return (
      <div className="p-3 bg-surface border-t border-line text-xs text-ink-faint text-center">
        Aucun médicament géré en stock dans ce dossier.
      </div>
    );
  }

  return (
    <div className="bg-surface-muted/80 border-t border-line p-3 space-y-2.5 animate-in slide-in-from-top-2 duration-150">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Pill className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span className="font-bold text-xs text-ink-strong">
            Suivi des médicaments délivrés (Pharmacie & Stock de garde)
          </span>
          <span className="text-[10px] text-ink-muted">
            • {stats.deliveredQty} sur {stats.totalQty} unité(s) délivrée(s)
          </span>
        </div>

        {/* Boutons Filtres : Non livrés en 1er */}
        <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-line text-xs">
          <button
            type="button"
            onClick={() => setFilterMode('pending')}
            className={`px-2 py-0.5 rounded font-bold text-[11px] cursor-pointer transition ${
              filterMode === 'pending'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10'
            }`}
          >
            Non livrés ({stats.medLines.filter((x) => !x.delivered).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-2 py-0.5 rounded font-semibold text-[11px] cursor-pointer transition ${
              filterMode === 'all'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Tous ({stats.medLines.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('delivered')}
            className={`px-2 py-0.5 rounded font-semibold text-[11px] cursor-pointer transition ${
              filterMode === 'delivered'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
            }`}
          >
            Livrés ({stats.medLines.filter((x) => !!x.delivered).length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {stats.pendingQty > 0 && (
            <button
              type="button"
              onClick={handleDeliverAll}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition"
              title="Valider la délivrance de tous les médicaments en attente"
            >
              <PackageCheck className="w-3.5 h-3.5" /> Tout délivrer ({stats.pendingQty})
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 text-ink-muted hover:text-ink text-xs font-medium cursor-pointer"
            >
              Fermer ✕
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {filteredLines.map((l) => {
          const art = articles.find(
            (a: Article) => a.name.toLowerCase() === l.articleName.toLowerCase() || a.id === l.id,
          );
          const stock = art ? art.stockPharmacie : null;
          const isDelivered = !!l.delivered;

          return (
            <div
              key={l.id}
              className={`p-2.5 rounded-lg border transition-all select-none flex items-start justify-between gap-2.5 ${
                isDelivered
                  ? 'bg-emerald-50/60 dark:bg-emerald-500/8 border-emerald-200 dark:border-emerald-500/25'
                  : 'bg-surface border-line shadow-xs'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <div className="pt-0.5">
                  <Pill className={`w-4 h-4 shrink-0 ${isDelivered ? 'text-emerald-600 dark:text-emerald-400' : 'text-purple-600 dark:text-purple-400'}`} />
                </div>
                <div className="min-w-0">
                  <div className={`font-semibold text-xs truncate ${isDelivered ? 'text-emerald-950 dark:text-emerald-300' : 'text-ink-strong'}`}>
                    {l.articleName}
                  </div>
                  {l.posology && (
                    <div className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 px-2 py-0.5 rounded mt-1 inline-flex items-center gap-1">
                      <span>💊 Posologie :</span> <span className="font-bold">{l.posology}</span>
                    </div>
                  )}
                  <div className="text-[10px] text-ink-muted flex items-center gap-2 mt-0.5">
                    <span className="font-bold text-ink">Qté : {l.quantity}</span>
                    <span>• P.U. : {formatAr(l.unitPrice)}</span>
                    {stock !== null && (
                      <span className={`font-mono ${stock <= 0 ? 'text-rose-600 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>
                        (Stock pharma : {stock})
                      </span>
                    )}
                  </div>
                  {isDelivered && (
                    <div className="text-[9px] text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                      ✓ Livré par {l.deliveredBy || 'Pharmacie'} le {l.deliveredAt ? new Date(l.deliveredAt).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                {!isDelivered ? (
                  <button
                    type="button"
                    onClick={() => handleToggle(l.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-1 transition"
                    title="Marquer cet article comme livré"
                  >
                    <PackageCheck className="w-3.5 h-3.5" />
                    Livrer
                  </button>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200 dark:border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Livré
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggle(l.id)}
                      className="text-[10px] text-ink-muted hover:text-rose-600 hover:underline cursor-pointer transition"
                      title="Annuler la livraison"
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filteredLines.length === 0 && (
          <div className="col-span-full py-4 text-center text-xs text-ink-faint italic">
            Aucun médicament dans la catégorie sélectionnée ({filterMode === 'pending' ? 'Non livrés' : 'Livrés'}).
          </div>
        )}

        {/* Bouton "Tous livrés" tout en bas de la liste */}
        {stats.pendingQty > 0 && (
          <div className="col-span-full pt-2 mt-1 border-t border-line flex items-center justify-end">
            <button
              type="button"
              onClick={handleDeliverAll}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition"
              title="Valider la délivrance de tous les médicaments non livrés"
            >
              <PackageCheck className="w-4 h-4" />
              Tous livrés ({stats.pendingQty} en attente)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
