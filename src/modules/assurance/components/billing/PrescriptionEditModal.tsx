import { useState } from 'react';
import { X, Lock, Plus, Trash2, Building2, Calendar, Receipt, FilePlus2 } from 'lucide-react';
import type { Prestation, LignePrestation, Famille } from '../../types';
import { formatDate, formatMoney } from '../../utils/formatters';

type OrigineAjout = 'omission' | 'ordonnance_externe';

const LIBELLE_ORIGINE: Record<OrigineAjout, string> = {
  omission: 'Omission',
  ordonnance_externe: 'Ordonnance externe remboursée',
};

interface Props {
  prestation: Prestation;
  familles: Famille[];
  onClose: () => void;
  /** Reçoit la prescription complète (lignes d'origine intactes + ajouts). */
  onSave: (next: Prestation) => void;
}

const arrondi2 = (n: number) => Math.round((n || 0) * 100) / 100;
const devise = 'Ar';

/**
 * Éditeur de PRESCRIPTION pour le facturier :
 *  - les lignes de la facture Caisse sont affichées verrouillées (lecture seule) ;
 *  - le facturier ajoute des OMISSIONS ou des ORDONNANCES EXTERNES remboursées
 *    par l'hôpital (code, libellé, montant, ticket modérateur) et peut les
 *    corriger ou les supprimer avant enregistrement ;
 *  - les totaux se recalculent en direct (brut, modérateur, à rembourser).
 */
export function PrescriptionEditModal({ prestation, familles, onClose, onSave }: Props) {
  const originales = prestation.lignes.filter(l => !l.origine || l.origine === 'caisse');
  const [ajouts, setAjouts] = useState<LignePrestation[]>(() =>
    prestation.lignes.filter(l => l.origine === 'omission' || l.origine === 'ordonnance_externe').map(l => ({ ...l })));
  const [commentaires, setCommentaires] = useState(prestation.commentaires || '');
  const [erreur, setErreur] = useState('');

  const ajouter = (origine: OrigineAjout) => {
    setErreur('');
    setAjouts(a => [...a, {
      id: `${prestation.id}:facturier:${Date.now()}:${a.length}`,
      prestationId: prestation.id, code: '', libelle: '',
      totalPrestation: 0, ticketModerateur: 0, montantARembourser: 0, totalPaye: 0, origine,
    }]);
  };
  const majAjout = (id: string, patch: Partial<LignePrestation>) => {
    setErreur('');
    setAjouts(a => a.map(l => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      next.montantARembourser = Math.max(0, arrondi2((next.totalPrestation || 0) - (next.ticketModerateur || 0)));
      return next;
    }));
  };
  const retirer = (id: string) => { setErreur(''); setAjouts(a => a.filter(l => l.id !== id)); };

  const baseBrut = arrondi2(originales.reduce((s, l) => s + l.totalPrestation, 0));
  const baseMod = arrondi2(originales.reduce((s, l) => s + (l.ticketModerateur || 0), 0));
  const brut = arrondi2(baseBrut + ajouts.reduce((s, l) => s + (l.totalPrestation || 0), 0));
  const mod = arrondi2(baseMod + ajouts.reduce((s, l) => s + (l.ticketModerateur || 0), 0));
  const remb = arrondi2(brut - mod);
  const money = (v: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v)} ${devise}`;

  const enregistrer = () => {
    for (const a of ajouts) {
      if (!a.libelle?.trim() && !a.code?.trim()) return setErreur('Chaque ligne ajoutée doit avoir au moins un libellé ou un code d\'acte.');
      if (!(a.totalPrestation > 0)) return setErreur(`Montant attendu sur la ligne « ${a.libelle || a.code} ».`);
      if ((a.ticketModerateur || 0) < 0 || (a.ticketModerateur || 0) > a.totalPrestation) return setErreur(`Ticket modérateur invalide sur « ${a.libelle || a.code} ».`);
    }
    const lignes: LignePrestation[] = [...originales.map(l => ({ ...l })), ...ajouts];
    const totalPrestation = arrondi2(lignes.reduce((s, l) => s + l.totalPrestation, 0));
    const participation = arrondi2(lignes.reduce((s, l) => s + (l.ticketModerateur || 0), 0));
    const next: Prestation = {
      ...prestation,
      lignes,
      ajouts,
      totalPrestation, montantTotal: totalPrestation,
      participation, ticketModerateur: participation,
      montantARembourser: arrondi2(totalPrestation - participation),
      commentaires: commentaires.trim() || undefined,
    };
    onSave(next);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto" role="dialog" aria-label={`Prescription ${prestation.numeroFacture}`}>
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 border-b border-line-soft pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/25 text-indigo-700 dark:text-indigo-300"><Receipt className="w-6 h-6" /></div>
            <div>
              <h3 className="text-lg font-bold text-ink-strong font-mono">{prestation.numeroFacture}</h3>
              <p className="text-xs text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{prestation.societeNom || prestation.societeId}</span>
                <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(prestation.date)}</span>
                {prestation.sousSociete && <span>Sous-société : {prestation.sousSociete}</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-2 rounded-xl text-ink-faint hover:text-ink hover:bg-surface-hover transition cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-ink-muted">
          Les actes de la facture Caisse (verrouillés) restent inchangés. Ajoutez ci-dessous les
          <strong> omissions</strong> ou les <strong>ordonnances externes remboursées par l'hôpital</strong> :
          elles s'empilent sur la prescription et figurent dans les prochains totaux.
        </p>

        {/* Lignes d'origine (lecture seule) */}
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full text-left text-xs" aria-label="Actes de la facture Caisse">
            <thead className="bg-surface-muted text-ink-secondary"><tr><th className="p-2.5">Code</th><th className="p-2.5">Acte</th><th className="p-2.5 text-right">Montant</th><th className="p-2.5 text-right">Ticket mod.</th><th className="p-2.5 w-8" /></tr></thead>
            <tbody>
              {originales.map(l => (
                <tr key={l.id} className="border-t border-line-soft opacity-75">
                  <td className="p-2.5 font-mono">{l.code}</td>
                  <td className="p-2.5">{l.libelle}</td>
                  <td className="p-2.5 text-right font-mono">{money(l.totalPrestation)}</td>
                  <td className="p-2.5 text-right font-mono">{money(l.ticketModerateur || 0)}</td>
                  <td className="p-2.5 text-center text-ink-faint" title="Ligne de la facture Caisse — non modifiable"><Lock className="w-3.5 h-3.5 inline" /></td>
                </tr>
              ))}
              {!originales.length && <tr><td colSpan={5} className="p-3 text-center text-ink-muted italic">Prescription sans acte Caisse (importée).</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Lignes ajoutées par le facturier */}
        <div className="space-y-2">
          {ajouts.map(l => (
            <div key={l.id} className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/6 p-2.5 grid grid-cols-12 gap-2 items-center">
              <span className={`col-span-3 sm:col-span-2 text-[10px] font-bold px-2 py-1 rounded-full text-center ${l.origine === 'ordonnance_externe' ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300' : 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'}`}>{LIBELLE_ORIGINE[l.origine as OrigineAjout] || 'Ajout'}</span>
              <select aria-label="Code famille de l'acte ajouté" value={l.code} onChange={e => majAjout(l.id, { code: e.target.value })} className="col-span-4 sm:col-span-2 p-1.5 border border-line-strong rounded-lg bg-surface text-xs cursor-pointer">
                <option value="">Code…</option>
                {familles.map(f => <option key={f.id} value={f.code}>{f.code}</option>)}
              </select>
              <input aria-label="Libellé de l'acte ajouté" type="text" value={l.libelle || ''} onChange={e => majAjout(l.id, { libelle: e.target.value })} placeholder="Libellé de l'acte / ordonnance" className="col-span-12 sm:col-span-4 p-1.5 border border-line-strong rounded-lg bg-surface text-xs uppercase" />
              <input aria-label="Montant de l'acte ajouté" type="number" min={0} step="1" value={l.totalPrestation || ''} onChange={e => majAjout(l.id, { totalPrestation: Number(e.target.value) || 0 })} placeholder="Montant" className="col-span-5 sm:col-span-2 p-1.5 border border-line-strong rounded-lg bg-surface text-xs text-right font-mono" />
              <input aria-label="Ticket modérateur de l'acte ajouté" type="number" min={0} step="1" value={l.ticketModerateur || ''} onChange={e => majAjout(l.id, { ticketModerateur: Number(e.target.value) || 0 })} placeholder="Ticket" className="col-span-4 sm:col-span-1 p-1.5 border border-line-strong rounded-lg bg-surface text-xs text-right font-mono" />
              <button type="button" onClick={() => retirer(l.id)} aria-label={`Retirer la ligne ${l.libelle || l.code}`} className="col-span-3 sm:col-span-1 justify-self-end p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg cursor-pointer"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => ajouter('omission')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 text-xs font-bold cursor-pointer"><Plus className="w-4 h-4" /> Ajouter une omission</button>
            <button type="button" onClick={() => ajouter('ordonnance_externe')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sky-400 text-sky-800 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/10 text-xs font-bold cursor-pointer"><FilePlus2 className="w-4 h-4" /> Ordonnance externe remboursée par l'hôpital</button>
          </div>
        </div>

        {/* Commentaire */}
        <div>
          <label className="block text-xs font-bold text-ink mb-1">Commentaire (visible dans le suivi)</label>
          <textarea value={commentaires} onChange={e => setCommentaires(e.target.value)} rows={2}
            placeholder="Ex. : ordonnance externe du 12/09 réglée par l'hôpital, omise sur la facture d'origine…"
            className="w-full rounded-xl border border-line-strong p-2.5 text-sm bg-surface outline-none focus:border-accent" />
        </div>

        {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-500/8 p-2.5 text-sm text-red-800 dark:text-red-300">{erreur}</p>}

        {/* Totaux + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-surface-muted rounded-xl border border-line px-4 py-2"><div className="text-[10px] text-ink-muted font-semibold">BRUT</div><div className="font-bold font-mono text-sm text-ink-strong">{money(brut)}</div><div className="text-[10px] text-ink-faint">Caisse : {money(baseBrut)}</div></div>
            <div className="bg-surface-muted rounded-xl border border-line px-4 py-2"><div className="text-[10px] text-ink-muted font-semibold">TICKET MODÉRATEUR</div><div className="font-bold font-mono text-sm text-ink-strong">{money(mod)}</div><div className="text-[10px] text-ink-faint">Caisse : {money(baseMod)}</div></div>
            <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-200 dark:border-indigo-500/25 px-4 py-2"><div className="text-[10px] text-indigo-700 dark:text-indigo-300 font-semibold">À REMBOURSER</div><div className="font-bold font-mono text-sm text-indigo-800 dark:text-indigo-300">{money(remb)}</div><div className="text-[10px] text-indigo-400">Caisse : {money(arrondi2(baseBrut - baseMod))}</div></div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-line text-ink-secondary hover:bg-surface-hover text-sm font-semibold cursor-pointer">Annuler</button>
            <button type="button" onClick={enregistrer} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer shadow-sm">Enregistrer la prescription</button>
          </div>
        </div>
      </div>
    </div>
  );
}
