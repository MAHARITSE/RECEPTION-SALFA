import React, { useState } from 'react';
import { X, Save, ShieldOff } from 'lucide-react';
import type { ExclusionSociete, Famille, Personne, Societe } from '../../types';
import { ExclusionsEditor } from './ExclusionsEditor';
import { resumerExclusions, societeModeLabel } from '../../utils/societeExclusions';

interface ExclusionsModalProps {
  societe: Societe;
  personnes: Personne[];
  familles: Famille[];
  onSave: (societe: Societe) => void;
  onClose: () => void;
}

/** Fenêtre dédiée aux exclusions d'une société (assurés et familles d'articles). */
export const ExclusionsModal: React.FC<ExclusionsModalProps> = ({ societe, personnes, familles, onSave, onClose }) => {
  const [brouillon, setBrouillon] = useState<ExclusionSociete[]>(societe.exclusions || []);
  const resume = resumerExclusions({ exclusions: brouillon });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-surface rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between border-b border-line-soft pb-3 shrink-0">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-xl bg-rose-100 text-rose-600">
              <ShieldOff className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink-strong text-base">Exclusions de la société</h3>
              <p className="text-xs text-ink-muted">
                {societe.nom} ({societe.code}) • {societeModeLabel(societe)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1 rounded-lg hover:bg-surface-hover">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <ExclusionsEditor
            exclusions={brouillon}
            onChange={setBrouillon}
            personnes={personnes}
            familles={familles}
            societeId={societe.id}
            societeNom={societe.nom}
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-line-soft shrink-0">
          <span className="text-[11px] text-ink-muted">
            {resume.total} exclusion(s) : {resume.personnes} personne(s) · {resume.familles} famille(s) d'articles
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-line text-ink-secondary text-xs font-semibold hover:bg-surface-hover transition cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => onSave({ ...societe, exclusions: brouillon })}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Enregistrer les exclusions</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
