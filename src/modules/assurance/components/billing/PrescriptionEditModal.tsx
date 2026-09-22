import { useRef, useState } from 'react';
import { Trash2, Save, Plus } from 'lucide-react';
import type { Prestation, LignePrestation, Famille } from '../../types';
import type { Article, ClientType, NatureRemise } from '../../../../types';
import { natureRemiseLabel, natureRemiseLabelCourt } from '../../../../utils/natureRemise';
import { getPrice, formatAr } from '../../../../store';
import { formatDate } from '../../utils/formatters';
import MoneyInput from '../../../../components/MoneyInput';

type OrigineAjout = 'caisse' | 'omission' | 'ordonnance_externe';

const LIBELLE_ORIGINE: Record<OrigineAjout, string> = {
  caisse: 'Facture Caisse',
  omission: 'Vente omise',
  ordonnance_externe: 'Ordonnance externe',
};

interface FormLigne {
  origine: OrigineAjout;
  articleId?: string;
  code: string;
  libelle: string;
  quantity: number;
  remisePct: number;
  prixUnitaire: number;
  ticketModerateur: number;
}

const FORM_VIDE: FormLigne = {
  origine: 'caisse',
  articleId: undefined,
  code: '',
  libelle: '',
  quantity: 1,
  remisePct: 0,
  prixUnitaire: 0,
  ticketModerateur: 0,
};

const arrondi2 = (n: number) => Math.round((n || 0) * 100) / 100;
const montantDe = (f: FormLigne) =>
  arrondi2((f.quantity || 0) * (f.prixUnitaire || 0) * (1 - (f.remisePct || 0) / 100));

interface Props {
  prestation: Prestation;
  familles: Famille[];
  articles?: Article[];
  /** Grille de prix à l'ajout d'un article du catalogue ('societe' par défaut). */
  tarif?: ClientType;
  /** Nature de la réduction (brut − net) de la société / de l'assuré :
   *  ticket modérateur (défaut) ou vraie remise. Ne change aucun montant,
   *  seulement l'intitulé de la colonne saisie. */
  natureRemise?: NatureRemise;
  onClose: () => void;
  /** Reçoit la prescription complète modifiée. */
  onSave: (next: Prestation) => void;
}

/**
 * Éditeur de PRESCRIPTION du facturier — Déverrouillé pour tous les articles :
 *  - Tous les articles (Caisse, omissions, ordonnances externes) sont déverrouillés et éditables ;
 *  - Affichage et modification complets : Quantité (Qté), Remise (Rem%), Prix Unitaire (P.U.), Montant et Ticket modérateur / Remise ;
 *  - Saisie rapide façon Sage avec recherche catalogue, sélection au clavier/souris ;
 *  - Calculs automatiques et recalcul en temps réel des totaux.
 */
export function PrescriptionEditModal({
  prestation,
  familles,
  articles = [],
  tarif = 'societe',
  natureRemise,
  onClose,
  onSave,
}: Props) {
  const libellePart = natureRemiseLabelCourt(natureRemise);
  const libellePartLong = natureRemiseLabel(natureRemise);

  const [lignes, setLignes] = useState<LignePrestation[]>(() =>
    (prestation.lignes || []).map((l, index) => {
      const qty = l.quantity != null && l.quantity > 0 ? l.quantity : 1;
      const pu =
        l.prixUnitaire != null
          ? l.prixUnitaire
          : qty > 0
            ? Math.round((l.totalPrestation || 0) / qty)
            : l.totalPrestation || 0;
      return {
        ...l,
        id: l.id || `${prestation.id}:ligne:${index}`,
        quantity: qty,
        remisePct: l.remisePct ?? 0,
        prixUnitaire: pu,
        ticketModerateur: l.ticketModerateur || 0,
        origine: l.origine || 'caisse',
      };
    })
  );

  const [commentaires, setCommentaires] = useState(prestation.commentaires || '');
  const [erreur, setErreur] = useState('');
  const [form, setForm] = useState<FormLigne>({ ...FORM_VIDE });
  const [editionId, setEditionId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [idx, setIdx] = useState(0);
  const [listeOuverte, setListeOuverte] = useState(false);
  const champRef = useRef<HTMLInputElement>(null);

  const filtres =
    recherche.trim().length >= 1
      ? articles
          .filter(a => a.name.toLowerCase().includes(recherche.toLowerCase()) && !a.saleBlocked)
          .slice(0, 12)
      : [];

  const choisirArticle = (id: string) => {
    const art = articles.find(a => a.id === id);
    if (!art) return;
    const pu = getPrice(art, tarif || 'societe');
    setForm(f => ({
      ...f,
      articleId: art.id,
      code: art.family || f.code || 'MEDIC',
      libelle: art.name,
      prixUnitaire: pu,
      quantity: f.quantity > 0 ? f.quantity : 1,
      origine: f.origine === 'caisse' ? 'omission' : f.origine,
    }));
    setRecherche('');
    setListeOuverte(false);
    setErreur('');
    document.getElementById('presc-qty-input')?.focus();
  };

  const surToujours = (e: React.KeyboardEvent) => {
    if (listeOuverte && filtres.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx(i => (i + 1) % filtres.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx(i => (i - 1 + filtres.length) % filtres.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        choisirArticle(filtres[idx].id);
        return;
      }
      if (e.key === 'Escape') {
        setListeOuverte(false);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      enregistrerLigne();
    }
  };

  const nouveau = () => {
    setForm({ ...FORM_VIDE, origine: 'omission' });
    setEditionId(null);
    setRecherche('');
    setListeOuverte(false);
    champRef.current?.focus();
  };

  const chargerLigne = (l: LignePrestation) => {
    setEditionId(l.id);
    const qty = l.quantity != null && l.quantity > 0 ? l.quantity : 1;
    const pu =
      l.prixUnitaire != null
        ? l.prixUnitaire
        : qty > 0
          ? Math.round(l.totalPrestation / qty)
          : l.totalPrestation;
    setForm({
      origine: (l.origine as OrigineAjout) || 'caisse',
      articleId: l.articleId,
      code: l.code || '',
      libelle: l.libelle || '',
      quantity: qty,
      remisePct: l.remisePct ?? 0,
      prixUnitaire: pu,
      ticketModerateur: l.ticketModerateur || 0,
    });
    setRecherche('');
    setListeOuverte(false);
    setErreur('');
  };

  const supprimerLigne = (id: string) => {
    setLignes(prev => prev.filter(l => l.id !== id));
    if (editionId === id) {
      nouveau();
    }
  };

  const supprimerSelection = () => {
    if (!editionId) return;
    supprimerLigne(editionId);
  };

  const enregistrerLigne = () => {
    if (!form.libelle.trim() && !form.code.trim()) {
      return setErreur('Saisissez un acte / article (ou au moins un code).');
    }
    const montant = montantDe(form);
    if (montant < 0) {
      return setErreur('Le montant de la ligne ne peut pas être négatif.');
    }
    if ((form.ticketModerateur || 0) < 0 || (form.ticketModerateur || 0) > montant) {
      return setErreur(`${libellePartLong} invalide (doit être compris entre 0 et le montant ${formatAr(montant)}).`);
    }

    if (editionId) {
      setLignes(prev =>
        prev.map(l => {
          if (l.id !== editionId) return l;
          return {
            ...l,
            code: form.code || l.code || 'CONS',
            libelle: form.libelle.trim().toUpperCase(),
            quantity: form.quantity || 1,
            remisePct: form.remisePct ?? 0,
            prixUnitaire: form.prixUnitaire,
            totalPrestation: montant,
            ticketModerateur: form.ticketModerateur || 0,
            montantARembourser: Math.max(0, montant - (form.ticketModerateur || 0)),
            origine: form.origine,
            articleId: form.articleId,
          };
        })
      );
    } else {
      const newLine: LignePrestation = {
        id: `${prestation.id}:ligne:${Date.now()}:${Math.floor(Math.random() * 1000)}`,
        prestationId: prestation.id,
        code: form.code || 'CONS',
        libelle: form.libelle.trim().toUpperCase(),
        quantity: form.quantity || 1,
        remisePct: form.remisePct ?? 0,
        prixUnitaire: form.prixUnitaire,
        totalPrestation: montant,
        ticketModerateur: form.ticketModerateur || 0,
        montantARembourser: Math.max(0, montant - (form.ticketModerateur || 0)),
        totalPaye: 0,
        origine: form.origine,
        articleId: form.articleId,
      };
      setLignes(prev => [...prev, newLine]);
    }
    nouveau();
  };

  const brut = arrondi2(lignes.reduce((s, l) => s + (l.totalPrestation || 0), 0));
  const mod = arrondi2(lignes.reduce((s, l) => s + (l.ticketModerateur || 0), 0));
  const remb = arrondi2(brut - mod);

  const enregistrer = () => {
    if (lignes.length === 0) {
      return setErreur('La prescription doit contenir au moins un article ou un acte.');
    }
    for (const l of lignes) {
      if (!l.libelle?.trim() && !l.code?.trim()) {
        return setErreur('Chaque ligne doit avoir un libellé ou un code.');
      }
      if (!(l.totalPrestation >= 0)) {
        return setErreur(`Montant invalide sur « ${l.libelle || l.code} ».`);
      }
      if ((l.ticketModerateur || 0) < 0 || (l.ticketModerateur || 0) > l.totalPrestation) {
        return setErreur(`${libellePartLong} invalide sur « ${l.libelle || l.code} ».`);
      }
    }

    const ajouts = lignes.filter(l => l.origine === 'omission' || l.origine === 'ordonnance_externe');

    onSave({
      ...prestation,
      lignes: [...lignes],
      ajouts,
      totalPrestation: brut,
      montantTotal: brut,
      participation: mod,
      ticketModerateur: mod,
      montantARembourser: remb,
      commentaires: commentaires.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 animate-in fade-in duration-200"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-surface rounded-xl shadow-2xl border border-line-strong"
        role="dialog"
        aria-label={`Prescription ${prestation.numeroFacture}`}
      >
        {/* Barre de titre */}
        <div className="bg-emerald-600 px-4 py-3 flex justify-between items-center text-white sticky top-0 z-10">
          <span className="font-bold flex items-center gap-2 text-sm">
            🧾 Prescription (Facturier) — {prestation.numeroFacture}
            <span className="font-normal opacity-90">
              · {prestation.societeNom || prestation.societeId} · {formatDate(prestation.date)}
              {prestation.sousSociete ? ` · ${prestation.sousSociete}` : ''}
            </span>
          </span>
          <button
            onClick={onClose}
            className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm font-medium"
          >
            ✕ Fermer
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-ink-muted">
            Articles et actes de la prescription <strong>déverrouillés</strong>. Vous pouvez modifier les{' '}
            <strong>quantités</strong>, <strong>remises (%)</strong>, <strong>prix unitaires (P.U.)</strong> et{' '}
            <strong>tickets modérateurs</strong> de chaque ligne, ou ajouter de nouveaux actes (ventes omises ou
            ordonnances externes). Cliquez sur une ligne du tableau pour la charger dans la barre de saisie.
          </p>

          {/* Barre de saisie façon Sage */}
          <div className="bg-surface-muted border border-line-strong rounded text-xs select-none">
            <div className="bg-surface-hover border-b border-line-strong p-2 m-2 mb-0 rounded shadow-inner">
              <div className="flex flex-wrap items-end gap-1.5">
                <div className="w-36">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Type</label>
                  <select
                    value={form.origine}
                    onChange={e => setForm(f => ({ ...f, origine: e.target.value as OrigineAjout }))}
                    title={
                      form.origine === 'omission'
                        ? 'Produits réellement sortis sans saisie : le stock pharmacie sera régularisé à l\'enregistrement.'
                        : form.origine === 'ordonnance_externe'
                          ? 'Médicaments pris dans une autre pharmacie et remboursés par l\'hôpital : aucun impact sur le stock.'
                          : 'Acte / Article standard de la facture'
                    }
                    className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs outline-none focus:border-accent cursor-pointer text-ink-strong"
                  >
                    <option value="caisse">Facture Caisse</option>
                    <option value="omission">Vente omise (− stock)</option>
                    <option value="ordonnance_externe">Ordonnance externe (sans stock)</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[170px] relative">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">
                    Acte / Article (↑↓ Entrée)
                  </label>
                  <input
                    ref={champRef}
                    type="text"
                    value={recherche || form.libelle}
                    onChange={e => {
                      setRecherche(e.target.value);
                      setListeOuverte(true);
                      setIdx(0);
                      setForm(f => ({ ...f, libelle: e.target.value }));
                    }}
                    onKeyDown={surToujours}
                    className="w-full bg-surface border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent/25 text-ink-strong uppercase"
                    placeholder="🔍 Saisir ou modifier l'acte / article…"
                  />
                  {listeOuverte && recherche.trim().length >= 1 && filtres.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-surface border border-line-strong rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                      {filtres.map((a, i) => (
                        <div
                          key={a.id}
                          onClick={() => choisirArticle(a.id)}
                          className={`px-3 py-1.5 text-xs flex justify-between items-center gap-2 border-b border-line-soft cursor-pointer ${
                            i === idx
                              ? 'bg-blue-500 text-white font-medium'
                              : 'hover:bg-surface-muted text-ink-strong'
                          }`}
                        >
                          <span className="truncate">
                            [{a.family}] {a.name}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span
                              className={`font-mono text-[10px] ${
                                i === idx ? 'text-white/90' : 'text-ink-faint'
                              }`}
                            >
                              Stock: {a.stockPharmacie}
                            </span>
                            <span
                              className={`font-mono ${
                                i === idx
                                  ? 'text-white'
                                  : 'text-blue-600 dark:text-cyan-400 font-medium'
                              }`}
                            >
                              {formatAr(getPrice(a, tarif))}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="w-20">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Code</label>
                  <select
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full bg-surface border border-line-strong rounded px-1 py-0.5 text-xs outline-none focus:border-accent cursor-pointer text-ink-strong"
                  >
                    <option value="">—</option>
                    {familles.map(f => (
                      <option key={f.id} value={f.code}>
                        {f.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-14">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Qté</label>
                  <input
                    id="presc-qty-input"
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={e =>
                      setForm(f => ({ ...f, quantity: Math.max(1, parseFloat(e.target.value) || 1) }))
                    }
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        enregistrerLigne();
                      }
                    }}
                    className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong"
                  />
                </div>
                <div className="w-14">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Rem%</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.remisePct}
                    onChange={e =>
                      setForm(f => ({
                        ...f,
                        remisePct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                      }))
                    }
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        enregistrerLigne();
                      }
                    }}
                    className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">P.U.</label>
                  <MoneyInput
                    value={form.prixUnitaire}
                    onChange={n => setForm(f => ({ ...f, prixUnitaire: n }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        enregistrerLigne();
                      }
                    }}
                    ariaLabel="Prix unitaire"
                    title="Prix unitaire — séparateur de milliers automatique"
                    className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Montant</label>
                  <input
                    readOnly
                    value={formatAr(montantDe(form))}
                    className="w-full bg-surface-active border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono font-bold text-ink"
                  />
                </div>
                <div className="w-20">
                  <label
                    className="block text-[10px] font-bold text-ink-muted mb-0.5"
                    title={libellePartLong}
                  >
                    {libellePart}
                  </label>
                  <MoneyInput
                    value={form.ticketModerateur}
                    onChange={n => setForm(f => ({ ...f, ticketModerateur: n }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        enregistrerLigne();
                      }
                    }}
                    ariaLabel="Ticket modérateur"
                    title="Séparateur de milliers automatique"
                    className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={nouveau}
                  className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-muted border border-line-strong rounded shadow-sm text-ink transition cursor-pointer text-xs font-medium"
                >
                  <Plus className="h-3.5 w-3.5 text-ink-muted" /> Nouveau
                </button>
                <button
                  type="button"
                  onClick={supprimerSelection}
                  disabled={!editionId}
                  className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-muted border border-line-strong rounded shadow-sm text-ink disabled:opacity-40 transition cursor-pointer text-xs font-medium"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" /> Supprimer
                </button>
                <button
                  type="button"
                  onClick={enregistrerLigne}
                  className="flex items-center gap-1 px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white border border-sky-600 rounded shadow-sm font-semibold transition cursor-pointer text-xs"
                >
                  <Save className="h-3.5 w-3.5" /> {editionId ? 'Mettre à jour' : 'Ajouter'} la ligne
                </button>
              </div>
            </div>

            {/* Tableau des lignes déverrouillées */}
            <div className="bg-surface mx-2 mb-2 border-t border-line-strong overflow-x-auto rounded-b max-h-[260px] overflow-y-auto">
              <table className="w-full text-[11px] text-left border-collapse" aria-label="Lignes de la prescription">
                <thead className="bg-surface-muted border-b border-line-strong text-ink-secondary sticky top-0 z-10">
                  <tr className="divide-x divide-line">
                    <th className="p-1 font-semibold min-w-[190px]">Acte / Article</th>
                    <th className="p-1 font-semibold w-16">Code</th>
                    <th className="p-1 font-semibold text-right w-12">Qté</th>
                    <th className="p-1 font-semibold text-center w-12">Rem%</th>
                    <th className="p-1 font-semibold text-right w-20">P.U.</th>
                    <th className="p-1 font-semibold text-right w-24">Montant</th>
                    <th className="p-1 font-semibold text-right w-20" title={libellePartLong}>
                      {natureRemise === 'remise' ? 'Remise' : 'Ticket'}
                    </th>
                    <th className="p-1 font-semibold w-8 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-mono">
                  {lignes.map(l => {
                    const isSel = l.id === editionId;
                    const qty = l.quantity != null && l.quantity > 0 ? l.quantity : 1;
                    const pu =
                      l.prixUnitaire != null
                        ? l.prixUnitaire
                        : qty > 0
                          ? Math.round(l.totalPrestation / qty)
                          : l.totalPrestation;
                    const rem = l.remisePct ?? 0;
                    return (
                      <tr
                        key={l.id}
                        onClick={() => chargerLigne(l)}
                        className={`cursor-pointer divide-x divide-line transition-colors ${
                          isSel
                            ? 'bg-blue-500 text-white font-medium'
                            : 'hover:bg-surface-muted text-ink-strong'
                        }`}
                      >
                        <td className="p-1 font-sans">
                          {l.origine && l.origine !== 'caisse' && (
                            <span
                              className={`inline-block mr-1 px-1 py-0.5 rounded text-[9px] font-bold align-middle ${
                                isSel
                                  ? 'bg-white/20 text-white'
                                  : l.origine === 'ordonnance_externe'
                                    ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300'
                                    : 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              {LIBELLE_ORIGINE[l.origine as OrigineAjout] || 'Ajout'}
                            </span>
                          )}
                          {l.libelle}
                        </td>
                        <td className="p-1">{l.code}</td>
                        <td className="p-1 text-right">{qty}</td>
                        <td className="p-1 text-center">{rem ? `${rem}%` : '0%'}</td>
                        <td className="p-1 text-right">{formatNum(pu)}</td>
                        <td className="p-1 text-right font-bold">{formatNum(l.totalPrestation)}</td>
                        <td className="p-1 text-right">{formatNum(l.ticketModerateur || 0)}</td>
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              supprimerLigne(l.id);
                            }}
                            title="Supprimer cette ligne"
                            className={`cursor-pointer p-0.5 rounded transition ${
                              isSel
                                ? 'text-white hover:text-rose-200'
                                : 'text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {lignes.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-ink-faint font-sans">
                        Aucun acte dans cette prescription. Saisissez ou recherchez un acte/article ci-dessus.
                      </td>
                    </tr>
                  )}
                </tbody>
                {lignes.length > 0 && (
                  <tfoot className="bg-emerald-50 dark:bg-emerald-500/8 border-t-2 border-emerald-300 dark:border-emerald-500/40 text-ink-strong font-sans">
                    <tr className="font-bold">
                      <td colSpan={5} className="p-1 text-right">
                        TOTAL BRUT ({lignes.length} acte{lignes.length > 1 ? 's' : ''}) :
                      </td>
                      <td className="p-1 text-right font-mono">{formatAr(brut)}</td>
                      <td className="p-1 text-right font-mono">{formatAr(mod)}</td>
                      <td className="p-1 text-center"></td>
                    </tr>
                    <tr className="font-bold">
                      <td colSpan={5} className="p-1.5 text-right">
                        TOTAL À REMBOURSER :
                      </td>
                      <td
                        colSpan={3}
                        className="p-1.5 text-right font-mono text-lg text-emerald-700 dark:text-emerald-400"
                      >
                        {formatAr(remb)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Commentaire */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">Commentaire (visible dans le suivi)</label>
            <textarea
              value={commentaires}
              onChange={e => setCommentaires(e.target.value)}
              rows={2}
              placeholder="Ex. : ordonnance externe réglée par l'hôpital, omission de stock, ajustement de quantité…"
              className="w-full rounded-xl border border-line-strong p-2.5 text-sm bg-surface outline-none focus:border-accent"
            />
          </div>

          {erreur && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-500/8 p-2.5 text-sm text-red-800 dark:text-red-300"
            >
              {erreur}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-2 bg-surface hover:bg-surface-muted border border-line-strong rounded-lg text-ink-secondary cursor-pointer font-medium transition text-sm"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={enregistrer}
              className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer font-medium transition text-sm"
            >
              ✅ Enregistrer la prescription
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatNum(n: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n || 0);
}
