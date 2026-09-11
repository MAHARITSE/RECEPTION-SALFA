import { useState } from 'react';
import { X, Merge, Undo2 } from 'lucide-react';
import type { Prestation } from '../../types';
import { formatDate } from '../../utils/formatters';

interface Props {
  /** Prescription liée à une facture Caisse qui va absorber la cible. */
  source: Prestation;
  /** Prescriptions de la même société pouvant être absorbées. */
  candidates: Prestation[];
  societeNom: string;
  formatMoney: (value: number) => string;
  onClose: () => void;
  onConfirm: (conserveId: string, libelle?: string) => void;
}

/**
 * Fusion de deux prescriptions — le patient est revenu deux fois en peu de temps :
 * la prescription Caisse (facture d'origine) absorbe une autre prescription de la
 * même société. Les montants s'additionnent, les ajouts du facturier migrent,
 * l'opération est annulable (restitution de l'absorbée).
 */
export function FusionPrescriptionModal({ source, candidates, societeNom, formatMoney, onClose, onConfirm }: Props) {
  const [cibleId, setCibleId] = useState('');
  const [libelle, setLibelle] = useState('');
  const cible = candidates.find(p => p.id === cibleId);
  const brutTotal = source.totalPrestation + (cible?.totalPrestation || 0);
  const modTotal = (source.ticketModerateur ?? source.participation ?? 0) + (cible ? (cible.ticketModerateur ?? cible.participation ?? 0) : 0);
  const rembTotal = brutTotal - modTotal;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto" role="dialog" aria-label="Fusion de prescriptions">
        <div className="flex items-start justify-between gap-3 border-b border-line-soft pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/25 text-indigo-700 dark:text-indigo-300"><Merge className="w-6 h-6" /></div>
            <div>
              <h3 className="text-lg font-bold text-ink-strong">Fusionner deux prescriptions</h3>
              <p className="text-xs text-ink-muted mt-0.5">{societeNom} — le patient est revenu deux fois en peu de temps.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-2 rounded-xl text-ink-faint hover:text-ink hover:bg-surface-hover transition cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-ink-muted">
          La prescription <strong>absorbée</strong> disparaît de la liste et ses montants s'ajoutent à la prescription
          <strong> conservée</strong> (saisie dans le suivi assurance). Son numéro reste lisible dans le commentaire et
          l'opération est <strong>annulable</strong> : la prescription absorbée est restituée à l'identique.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          {/* Source (facture Caisse, conserve le numéro de la facture) */}
          <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-500/6 p-3 space-y-1.5">
            <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">CONSERVÉ · Facture Caisse</span>
            <div className="font-mono font-bold text-sm text-ink-strong">{source.numeroFacture}</div>
            <div className="text-xs text-ink">{source.nomAgent || '—'}{source.matricule ? ` · ${source.matricule}` : ''}</div>
            <div className="text-xs text-ink-muted">{formatDate(source.date)} · {source.lignes?.length || 0} ligne(s)</div>
            <div className="text-xs font-mono font-bold text-ink-strong">{formatMoney(source.totalPrestation)}</div>
          </div>

          {/* Cible */}
          <div className="rounded-xl border-2 border-dashed border-line-strong p-3 space-y-2">
            <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-bold">ABSORBÉE</span>
            {candidates.length > 0 ? (
              <select aria-label="Prescription à absorber" value={cibleId} onChange={e => setCibleId(e.target.value)}
                className="w-full p-2 border border-line-strong rounded-lg bg-surface text-xs cursor-pointer">
                <option value="">— Choisir la prescription à fusionner —</option>
                {candidates.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.numeroFacture} · {formatDate(p.date)} · {p.nomAgent || '—'} · {new Intl.NumberFormat('fr-FR').format(p.totalPrestation)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-ink-muted italic">Aucune autre prescription de la même société à fusionner.</p>
            )}
            {cible && (
              <div className="text-xs text-ink space-y-0.5">
                <div className="text-ink-muted">{cible.lignes?.length || 0} ligne(s){(cible.ajouts?.length || 0) > 0 ? ` · ${cible.ajouts?.length} ajout(s) facturier` : ''}</div>
                {cible.commentaires && <div className="text-ink-muted italic">« {cible.commentaires} »</div>}
              </div>
            )}
          </div>
        </div>

        {cible && (
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/25 bg-indigo-50/70 dark:bg-indigo-500/6 p-3 grid grid-cols-3 gap-3 text-center">
            <div><div className="text-[10px] font-semibold text-ink-muted">BRUT FUSIONNÉ</div><div className="font-mono font-bold text-sm text-ink-strong">{formatMoney(brutTotal)}</div></div>
            <div><div className="text-[10px] font-semibold text-ink-muted">TICKET MODÉRATEUR</div><div className="font-mono font-bold text-sm text-ink-strong">{formatMoney(modTotal)}</div></div>
            <div><div className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">À REMBOURSER</div><div className="font-mono font-bold text-sm text-indigo-800 dark:text-indigo-300">{formatMoney(rembTotal)}</div></div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-ink mb-1">Motif / commentaire (facultatif)</label>
          <input type="text" value={libelle} onChange={e => setLibelle(e.target.value)}
            placeholder="Ex. : retour du patient le lendemain — actes regroupés"
            className="w-full rounded-xl border border-line-strong p-2.5 text-sm bg-surface outline-none focus:border-accent" />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-line text-ink-secondary hover:bg-surface-hover text-sm font-semibold cursor-pointer">Annuler</button>
          <button type="button" disabled={!cible} onClick={() => onConfirm(cibleId, libelle.trim() || undefined)}
            className="flex-1 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2">
            <Merge className="w-4 h-4" /> Fusionner les prescriptions
          </button>
        </div>

        {source.fusionsAnnulees && source.fusionsAnnulees.length > 0 && (
          <div className="border-t border-line-soft pt-3 space-y-1.5">
            <p className="text-xs font-bold text-ink inline-flex items-center gap-1.5"><Undo2 className="w-3.5 h-3.5" /> Fusions déjà reçues par cette facture (annulables) :</p>
            {source.fusionsAnnulees.map(f => (
              <div key={f.id} className="text-xs text-ink-muted">· {f.numeroFacture || f.id} — {formatDate(f.date)} — {new Intl.NumberFormat('fr-FR').format(f.totalPrestation)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
