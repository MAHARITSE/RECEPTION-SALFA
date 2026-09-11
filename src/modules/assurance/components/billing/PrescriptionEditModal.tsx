import { useRef, useState } from 'react';
import { X, Lock, Trash2, Save, FilePlus2, Plus } from 'lucide-react';
import type { Prestation, LignePrestation, Famille } from '../../types';
import type { Article } from '../../../../types';
import { getPrice, formatAr } from '../../../../store';
import { formatDate } from '../../utils/formatters';

type OrigineAjout = 'omission' | 'ordonnance_externe';

const LIBELLE_ORIGINE: Record<OrigineAjout, string> = {
  omission: 'Omission',
  ordonnance_externe: 'Ordonnance externe',
};

interface FormLigne {
  origine: OrigineAjout;
  code: string;
  libelle: string;
  quantity: number;
  remisePct: number;
  prixUnitaire: number;
  ticketModerateur: number;
  dateActe: string;
}

const FORM_VIDE: FormLigne = { origine: 'omission', code: '', libelle: '', quantity: 1, remisePct: 0, prixUnitaire: 0, ticketModerateur: 0, dateActe: new Date().toISOString().split('T')[0] };
const arrondi2 = (n: number) => Math.round((n || 0) * 100) / 100;
const montantDe = (f: FormLigne) => arrondi2((f.quantity || 0) * (f.prixUnitaire || 0) * (1 - (f.remisePct || 0) / 100));

interface Props {
  prestation: Prestation;
  familles: Famille[];
  articles?: Article[];
  onClose: () => void;
  /** Reçoit la prescription complète (lignes d'origine intactes + ajouts). */
  onSave: (next: Prestation) => void;
}

/**
 * Éditeur de PRESCRIPTION du facturier — même ergonomie que la Saisie Sage
 * du bloc / hospitalisation (Caisse) :
 *  - barre de saisie : acte/article (recherche ↑↓ Entrée dans le catalogue),
 *    code famille, Qté, Rem%, P.U., Montant calculé, Ticket mod., date d'acte 📌 ;
 *  - boutons Nouveau / Supprimer / Enregistrer (Entrée valide la ligne) ;
 *  - tableau des lignes : actes Caisse 🔒 (verrouillés, non cliquables) puis
 *    les ajouts du facturier (clic = recharger dans la barre pour correction) ;
 *  - pied de tableau TOTAL + enregistrement de la prescription.
 */
export function PrescriptionEditModal({ prestation, familles, articles = [], onClose, onSave }: Props) {
  const originales = prestation.lignes.filter(l => !l.origine || l.origine === 'caisse');
  const [ajouts, setAjouts] = useState<LignePrestation[]>(() =>
    prestation.lignes.filter(l => l.origine === 'omission' || l.origine === 'ordonnance_externe').map(l => ({ ...l })));
  const [commentaires, setCommentaires] = useState(prestation.commentaires || '');
  const [erreur, setErreur] = useState('');
  const [form, setForm] = useState<FormLigne>({ ...FORM_VIDE });
  const [editionId, setEditionId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [idx, setIdx] = useState(0);
  const [listeOuverte, setListeOuverte] = useState(false);
  const champRef = useRef<HTMLInputElement>(null);

  const filtres = recherche.trim().length >= 1
    ? articles.filter(a => a.name.toLowerCase().includes(recherche.toLowerCase()) && !a.saleBlocked).slice(0, 12)
    : [];

  const choisirArticle = (id: string) => {
    const art = articles.find(a => a.id === id);
    if (!art) return;
    setForm(f => ({ ...f, code: art.family || f.code, libelle: art.name, prixUnitaire: getPrice(art, 'societe') }));
    setRecherche('');
    setListeOuverte(false);
    setErreur('');
    document.getElementById('presc-qty-input')?.focus();
  };

  const surToujours = (e: React.KeyboardEvent) => {
    if (listeOuverte && filtres.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => (i + 1) % filtres.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => (i - 1 + filtres.length) % filtres.length); return; }
      if (e.key === 'Enter') { e.preventDefault(); choisirArticle(filtres[idx].id); return; }
      if (e.key === 'Escape') { setListeOuverte(false); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); enregistrerLigne(); }
  };

  const nouveau = () => { setForm({ ...FORM_VIDE }); setEditionId(null); setRecherche(''); setListeOuverte(false); champRef.current?.focus(); };

  const chargerLigne = (l: LignePrestation) => {
    setEditionId(l.id);
    setForm({
      origine: (l.origine as OrigineAjout) || 'omission', code: l.code || '', libelle: l.libelle || '',
      quantity: l.quantity || 1, remisePct: l.remisePct || 0,
      prixUnitaire: l.prixUnitaire ?? l.totalPrestation ?? 0,
      ticketModerateur: l.ticketModerateur || 0, dateActe: l.dateActe || '',
    });
    setErreur('');
  };

  const supprimerSelection = () => {
    if (!editionId) return;
    setAjouts(a => a.filter(l => l.id !== editionId));
    nouveau();
  };

  const enregistrerLigne = () => {
    if (!form.libelle.trim() && !form.code.trim()) return setErreur('Saisissez un acte / article (ou au moins un code).');
    const montant = montantDe(form);
    if (!(montant > 0)) return setErreur('Le montant de la ligne doit être supérieur à 0.');
    if ((form.ticketModerateur || 0) < 0 || (form.ticketModerateur || 0) > montant) return setErreur('Ticket modérateur invalide (entre 0 et le montant).');
    const ligne: LignePrestation = {
      id: editionId || `${prestation.id}:facturier:${Date.now()}`,
      prestationId: prestation.id, code: form.code || 'CONS', libelle: form.libelle.trim().toUpperCase(),
      totalPrestation: montant, montantARembourser: arrondi2(montant - (form.ticketModerateur || 0)),
      ticketModerateur: form.ticketModerateur || 0, totalPaye: 0,
      origine: form.origine, quantity: form.quantity, remisePct: form.remisePct || undefined,
      prixUnitaire: form.prixUnitaire, dateActe: form.dateActe || undefined,
    };
    setAjouts(a => editionId ? a.map(l => (l.id === editionId ? ligne : l)) : [...a, ligne]);
    nouveau();
  };

  const baseBrut = arrondi2(originales.reduce((s, l) => s + l.totalPrestation, 0));
  const baseMod = arrondi2(originales.reduce((s, l) => s + (l.ticketModerateur || 0), 0));
  const brut = arrondi2(baseBrut + ajouts.reduce((s, l) => s + l.totalPrestation, 0));
  const mod = arrondi2(baseMod + ajouts.reduce((s, l) => s + (l.ticketModerateur || 0), 0));
  const remb = arrondi2(brut - mod);

  const enregistrer = () => {
    for (const a of ajouts) {
      if (!a.libelle?.trim() && !a.code?.trim()) return setErreur('Chaque ligne ajoutée doit avoir un libellé ou un code.');
      if (!(a.totalPrestation > 0)) return setErreur(`Montant attendu sur « ${a.libelle || a.code} ».`);
      if ((a.ticketModerateur || 0) < 0 || (a.ticketModerateur || 0) > a.totalPrestation) return setErreur(`Ticket modérateur invalide sur « ${a.libelle || a.code} ».`);
    }
    const lignes: LignePrestation[] = [...originales.map(l => ({ ...l })), ...ajouts];
    const totalPrestation = arrondi2(lignes.reduce((s, l) => s + l.totalPrestation, 0));
    const participation = arrondi2(lignes.reduce((s, l) => s + (l.ticketModerateur || 0), 0));
    onSave({
      ...prestation, lignes, ajouts,
      totalPrestation, montantTotal: totalPrestation,
      participation, ticketModerateur: participation,
      montantARembourser: arrondi2(totalPrestation - participation),
      commentaires: commentaires.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 animate-in fade-in duration-200" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-surface rounded-xl shadow-2xl border border-line-strong" role="dialog" aria-label={`Prescription ${prestation.numeroFacture}`}>
        {/* Barre de titre */}
        <div className="bg-emerald-600 px-4 py-3 flex justify-between items-center text-white sticky top-0 z-10">
          <span className="font-bold flex items-center gap-2 text-sm">
            🧾 Prescription (Facturier) — {prestation.numeroFacture}
            <span className="font-normal opacity-90">· {prestation.societeNom || prestation.societeId} · {formatDate(prestation.date)}{prestation.sousSociete ? ` · ${prestation.sousSociete}` : ''}</span>
          </span>
          <button onClick={onClose} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-ink-muted">
            Les actes de la facture Caisse 🔒 restent inchangés. Saisissez ci-dessous les <strong>omissions</strong> ou
            les <strong>ordonnances externes remboursées par l'hôpital</strong> : elles s'empilent sur la prescription
            et figurent dans les prochains totaux.
          </p>

          {/* Barre de saisie façon Sage */}
          <div className="bg-surface-muted border border-line-strong rounded text-xs select-none">
            <div className="bg-surface-hover border-b border-line-strong p-2 m-2 mb-0 rounded shadow-inner">
              <div className="flex flex-wrap items-end gap-1.5">
                <div className="w-36">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Type</label>
                  <select value={form.origine} onChange={e => setForm(f => ({ ...f, origine: e.target.value as OrigineAjout }))} className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs outline-none focus:border-accent cursor-pointer text-ink-strong">
                    <option value="omission">Omission</option>
                    <option value="ordonnance_externe">Ordonnance externe</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[170px] relative">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Acte / Article (↑↓ Entrée)</label>
                  <input
                    ref={champRef}
                    type="text"
                    value={recherche || form.libelle}
                    onChange={e => { setRecherche(e.target.value); setListeOuverte(true); setIdx(0); setForm(f => ({ ...f, libelle: '' })); }}
                    onKeyDown={surToujours}
                    className="w-full bg-surface border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent/25 text-ink-strong uppercase"
                    placeholder="🔍 Saisir l'acte ou l'article…"
                  />
                  {listeOuverte && recherche.trim().length >= 1 && filtres.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-surface border border-line-strong rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                      {filtres.map((a, i) => (
                        <div key={a.id} onClick={() => choisirArticle(a.id)}
                          className={`px-3 py-1.5 text-xs flex justify-between border-b border-line-soft cursor-pointer ${i === idx ? 'bg-blue-500 text-white font-medium' : 'hover:bg-surface-muted text-ink-strong'}`}>
                          <span>[{a.family}] {a.name}</span>
                          <span className={`font-mono ${i === idx ? 'text-white' : 'text-blue-600 dark:text-cyan-400 font-medium'}`}>{formatAr(getPrice(a, 'societe'))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="w-20">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Code</label>
                  <select value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="w-full bg-surface border border-line-strong rounded px-1 py-0.5 text-xs outline-none focus:border-accent cursor-pointer text-ink-strong">
                    <option value="">—</option>
                    {familles.map(f => <option key={f.id} value={f.code}>{f.code}</option>)}
                  </select>
                </div>
                <div className="w-14">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Qté</label>
                  <input id="presc-qty-input" type="number" min={1} value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 1 }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enregistrerLigne(); } }}
                    className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong" />
                </div>
                <div className="w-14">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Rem%</label>
                  <input type="number" min={0} max={100} value={form.remisePct}
                    onChange={e => setForm(f => ({ ...f, remisePct: parseFloat(e.target.value) || 0 }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enregistrerLigne(); } }}
                    className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong" />
                </div>
                <div className="w-24">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">P.U.</label>
                  <input type="number" min={0} value={form.prixUnitaire}
                    onChange={e => setForm(f => ({ ...f, prixUnitaire: parseFloat(e.target.value) || 0 }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enregistrerLigne(); } }}
                    className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong" />
                </div>
                <div className="w-24">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Montant</label>
                  <input readOnly value={formatAr(montantDe(form))}
                    className="w-full bg-surface-active border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono font-bold text-ink" />
                </div>
                <div className="w-20">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Ticket mod.</label>
                  <input type="number" min={0} value={form.ticketModerateur}
                    onChange={e => setForm(f => ({ ...f, ticketModerateur: parseFloat(e.target.value) || 0 }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enregistrerLigne(); } }}
                    className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong" />
                </div>
                <div className="w-36">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5" title="Conservée après validation de la ligne">Date d'acte 📌</label>
                  <input type="date" value={form.dateActe || ''} onChange={e => setForm(f => ({ ...f, dateActe: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enregistrerLigne(); } }}
                    className="w-full bg-amber-50 dark:bg-amber-500/8 border border-amber-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-accent text-ink-strong" />
                </div>
              </div>
              <div className="flex justify-end gap-1.5 mt-2">
                <button type="button" onClick={nouveau} className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-muted border border-line-strong rounded shadow-sm text-ink transition cursor-pointer text-xs font-medium">
                  <Plus className="h-3.5 w-3.5 text-ink-muted" /> Nouveau
                </button>
                <button type="button" onClick={supprimerSelection} disabled={!editionId} className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-muted border border-line-strong rounded shadow-sm text-ink disabled:opacity-40 transition cursor-pointer text-xs font-medium">
                  <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" /> Supprimer
                </button>
                <button type="button" onClick={enregistrerLigne} className="flex items-center gap-1 px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white border border-sky-600 rounded shadow-sm font-semibold transition cursor-pointer text-xs">
                  <Save className="h-3.5 w-3.5" /> {editionId ? 'Mettre à jour' : 'Enregistrer'} la ligne
                </button>
              </div>
            </div>

            {/* Tableau des lignes */}
            <div className="bg-surface mx-2 mb-2 border-t border-line-strong overflow-x-auto rounded-b max-h-[260px] overflow-y-auto">
              <table className="w-full text-[11px] text-left border-collapse" aria-label="Lignes de la prescription">
                <thead className="bg-surface-muted border-b border-line-strong text-ink-secondary">
                  <tr className="divide-x divide-line">
                    <th className="p-1 font-normal min-w-[190px]">Acte / Article</th>
                    <th className="p-1 font-normal w-16">Code</th>
                    <th className="p-1 font-normal text-right w-12">Qté</th>
                    <th className="p-1 font-normal text-center w-12">Rem%</th>
                    <th className="p-1 font-normal text-right w-20">P.U.</th>
                    <th className="p-1 font-normal text-right w-24">Montant</th>
                    <th className="p-1 font-normal text-right w-20">Ticket</th>
                    <th className="p-1 font-normal w-28">Date d'acte</th>
                    <th className="p-1 font-normal w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-mono">
                  {originales.map(l => (
                    <tr key={l.id} title="Ligne de la facture Caisse — non modifiable" className="divide-x divide-line opacity-70 cursor-not-allowed text-ink-muted">
                      <td className="p-1 font-sans">🔒 {l.libelle}</td>
                      <td className="p-1">{l.code}</td>
                      <td className="p-1 text-right">{l.quantity || '—'}</td>
                      <td className="p-1 text-center">{l.remisePct ? `${l.remisePct}%` : '—'}</td>
                      <td className="p-1 text-right">{l.prixUnitaire != null ? formatNum(l.prixUnitaire) : '—'}</td>
                      <td className="p-1 text-right font-bold">{formatNum(l.totalPrestation)}</td>
                      <td className="p-1 text-right">{formatNum(l.ticketModerateur || 0)}</td>
                      <td className="p-1 font-sans text-ink-faint">{l.dateActe || '—'}</td>
                      <td className="p-1 text-center"><Lock className="w-3 h-3 inline" /></td>
                    </tr>
                  ))}
                  {ajouts.map(l => {
                    const isSel = l.id === editionId;
                    return (
                      <tr key={l.id} onClick={() => chargerLigne(l)}
                        className={`cursor-pointer divide-x divide-line transition-colors ${isSel ? 'bg-blue-500 text-white font-medium' : 'hover:bg-surface-muted text-ink-strong'}`}>
                        <td className="p-1 font-sans">
                          <span className={`inline-block mr-1 px-1 py-0.5 rounded text-[9px] font-bold align-middle ${l.origine === 'ordonnance_externe' ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300' : 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'}`}>{LIBELLE_ORIGINE[(l.origine as OrigineAjout)] || 'Ajout'}</span>
                          {l.libelle}
                        </td>
                        <td className="p-1">{l.code}</td>
                        <td className="p-1 text-right">{l.quantity || 1}</td>
                        <td className="p-1 text-center">{l.remisePct ? `${l.remisePct}%` : '—'}</td>
                        <td className="p-1 text-right">{formatNum(l.prixUnitaire ?? l.totalPrestation)}</td>
                        <td className="p-1 text-right font-bold">{formatNum(l.totalPrestation)}</td>
                        <td className="p-1 text-right">{formatNum(l.ticketModerateur || 0)}</td>
                        <td className="p-1 font-sans text-ink-muted">{l.dateActe || '—'}</td>
                        <td className="p-1 text-center">
                          <button onClick={e => { e.stopPropagation(); setAjouts(a => a.filter(x => x.id !== l.id)); if (isSel) nouveau(); }}
                            className={`cursor-pointer ${isSel ? 'text-white hover:text-red-200' : 'text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300'}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!originales.length && !ajouts.length && (
                    <tr><td colSpan={9} className="p-4 text-center text-ink-faint font-sans">Aucun acte. Saisissez une omission ou une ordonnance externe ci-dessus.</td></tr>
                  )}
                </tbody>
                {(originales.length > 0 || ajouts.length > 0) && (
                  <tfoot className="bg-emerald-50 dark:bg-emerald-500/8 border-t-2 border-emerald-300 dark:border-emerald-500/40 text-ink-strong font-sans">
                    <tr className="font-bold">
                      <td colSpan={5} className="p-1 text-right">TOTAL BRUT :</td>
                      <td className="p-1 text-right font-mono">{formatAr(brut)}</td>
                      <td className="p-1 text-right font-mono">{formatAr(mod)}</td>
                      <td colSpan={2} className="p-1 text-ink-muted font-normal text-[10px]">Caisse 🔒 : {formatAr(baseBrut)} / {formatAr(baseMod)}</td>
                    </tr>
                    <tr className="font-bold">
                      <td colSpan={5} className="p-1.5 text-right">TOTAL À REMBOURSER :</td>
                      <td colSpan={4} className="p-1.5 text-right font-mono text-lg text-emerald-700 dark:text-emerald-400">{formatAr(remb)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Commentaire */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">Commentaire (visible dans le suivi)</label>
            <textarea value={commentaires} onChange={e => setCommentaires(e.target.value)} rows={2}
              placeholder="Ex. : ordonnance externe du 31/08 réglée par l'hôpital, omise sur la facture d'origine…"
              className="w-full rounded-xl border border-line-strong p-2.5 text-sm bg-surface outline-none focus:border-accent" />
          </div>

          {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-500/8 p-2.5 text-sm text-red-800 dark:text-red-300">{erreur}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="w-1/3 py-2 bg-surface hover:bg-surface-muted border border-line-strong rounded-lg text-ink-secondary cursor-pointer font-medium transition text-sm">Annuler</button>
            <button type="button" onClick={enregistrer} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer font-medium transition text-sm">✅ Enregistrer la prescription</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatNum(n: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n || 0);
}
