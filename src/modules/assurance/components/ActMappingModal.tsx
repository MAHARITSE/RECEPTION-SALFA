import React, { useState } from 'react';
import { Famille } from '../types';
import { Check, ArrowRight, Sparkles, Tag, HelpCircle, Layers, BookmarkCheck } from 'lucide-react';
import { formatMoney } from '../utils/formatters';
import { Select } from '../../../components/Select';

interface ActMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  unmappedActs: {
    rawCode: string;
    rawLibelle: string;
    occurrences: number;
    totalAmount: number;
    suggestedFamilleCode?: string;
  }[];
  familles: Famille[];
  onApplyMapping: (mapping: Record<string, string>, saveAsPermanentAliases?: boolean) => void;
}

export const ActMappingModal: React.FC<ActMappingModalProps> = ({
  isOpen,
  onClose,
  unmappedActs,
  familles,
  onApplyMapping,
}) => {
  const [saveAsPermanentAliases, setSaveAsPermanentAliases] = useState<boolean>(true);

  const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    unmappedActs.forEach(act => {
      const codeUpper = act.rawCode.toUpperCase();
      const libUpper = act.rawLibelle.toUpperCase();

      if (codeUpper === 'DC' || codeUpper === 'DK' || libUpper.includes('RADICULAIRE') || libUpper.includes('DENT')) {
        initial[act.rawCode] = 'DENT';
      } else if (codeUpper === 'PH' || codeUpper === 'PHSB' || libUpper.includes('PHARMACIE') || libUpper.includes('DOLIPRANE') || libUpper.includes('EFFERALGAN')) {
        initial[act.rawCode] = 'PHAR';
      } else if (codeUpper === 'CG' || codeUpper === 'CONS' || libUpper.includes('CONSULT')) {
        initial[act.rawCode] = 'CONS';
      } else if (codeUpper === 'EB' || codeUpper === 'LABO' || libUpper.includes('LABO') || libUpper.includes('BIOLOG') || libUpper.includes('TDR')) {
        initial[act.rawCode] = 'LABO';
      } else if (codeUpper === 'SI' || codeUpper === 'SOINS' || libUpper.includes('SOIN') || libUpper.includes('INJ')) {
        initial[act.rawCode] = 'SOINS';
      } else if (codeUpper === 'ECHO' || codeUpper === 'RADI' || libUpper.includes('ECHO')) {
        initial[act.rawCode] = 'ECHO';
      } else if (codeUpper === 'HOSP' || libUpper.includes('ACCOUCHEMENT') || libUpper.includes('CHIRURG')) {
        initial[act.rawCode] = 'HOSP';
      } else {
        initial[act.rawCode] = act.suggestedFamilleCode || familles[0]?.code || 'CONS';
      }
    });
    return initial;
  });

  const handleSelectFamille = (rawCode: string, familleCode: string) => {
    setSelectedMappings(prev => ({
      ...prev,
      [rawCode]: familleCode
    }));
  };

  const handleConfirm = () => {
    onApplyMapping(selectedMappings, saveAsPermanentAliases);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-surface rounded-2xl shadow-2xl max-w-2xl w-full border border-line overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Rattachement des Actes & Correspondances d'Assurance
              </h3>
              <p className="text-xs text-ink-faint">
                Codes d'actes détectés dans le document à associer à vos actes médicaux.
              </p>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="p-4 bg-indigo-50/60 border-b border-indigo-100 flex items-start space-x-2 text-xs text-indigo-900">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <span>
            Sélectionnez ci-dessous pour chaque code du décompte l'<strong>Acte Médical (Famille)</strong> correspondant. Ces codes pourront être mémorisés pour être automatiquement reconnus lors des prochains imports.
          </span>
        </div>

        {/* List of Acts */}
        <div className="p-5 overflow-y-auto space-y-3 divide-y divide-slate-100">
          {unmappedActs.map((act, index) => {
            const currentSelected = selectedMappings[act.rawCode] || 'CONS';

            return (
              <div key={act.rawCode} className={`pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${index > 0 ? 'mt-2' : ''}`}>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-900 text-white">
                      {act.rawCode}
                    </span>
                    <span className="font-semibold text-ink text-xs">{act.rawLibelle}</span>
                  </div>
                  <div className="text-[11px] text-ink-muted flex items-center space-x-2">
                    <span>{act.occurrences} occurrence(s)</span>
                    <span>•</span>
                    <span className="font-mono font-medium text-ink">Total : {formatMoney(act.totalAmount)}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <ArrowRight className="w-4 h-4 text-slate-300 hidden sm:block" />
                  <Select
                    value={currentSelected}
                    onChange={(e) => handleSelectFamille(act.rawCode, e.target.value)}
                    className="px-3 py-2 bg-surface-muted border border-line-strong rounded-xl text-xs font-semibold text-ink focus:outline-hidden focus:ring-2 focus:ring-indigo-500 min-w-[220px]"
                  >
                    {familles.map(f => (
                      <option key={f.id} value={f.code}>
                        {f.code} - {f.libelle}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            );
          })}
        </div>

        {/* Permanent memorization checkbox */}
        <div className="px-5 py-3 bg-surface-muted border-t border-line">
          <label className="flex items-center space-x-2.5 text-xs text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsPermanentAliases}
              onChange={(e) => setSaveAsPermanentAliases(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-line-strong focus:ring-indigo-500"
            />
            <div className="flex items-center space-x-1.5 font-medium">
              <BookmarkCheck className="w-4 h-4 text-indigo-600" />
              <span>Mémoriser définitivement ces codes comme alias dans les actes médicaux pour les prochaines importations</span>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="bg-surface p-4 border-t border-line flex items-center justify-between">
          <span className="text-xs text-ink-muted">
            {unmappedActs.length} code(s) prêt(s) à être rattaché(s)
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-ink-secondary hover:bg-surface-hover transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition"
            >
              <Check className="w-4 h-4" />
              <span>Valider le Rattachement</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
