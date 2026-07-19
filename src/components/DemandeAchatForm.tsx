import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Article, TransferCategory } from '../types';
import { familyLabel, formatAr, transferCategoryLabel, transferCategoryColor, TRANSFER_CATEGORIES } from '../store';
import { Plus, Trash2, Save, X, Send, Edit3 } from 'lucide-react';

export interface ReqLine {
  id: string;
  articleId: string;
  articleName: string;
  family: any;
  quantity: number;
  purchasePrice: number;
  expiryDate: string;
  notes: string;
  amount: number;
}

interface DemandeAchatFormProps {
  open: boolean;
  onClose: () => void;
  articles: Article[];
  defaultCategory?: TransferCategory;
  defaultSupplier?: string;
  defaultInvoiceRef?: string;
  /** Pass an existing line when editing a single line request */
  initialLine?: ReqLine | null;
  initialNotes?: string;
  initialCategory?: TransferCategory;
  isEditMode?: boolean;
  onSubmit: (payload: {
    lines: ReqLine[];
    category: TransferCategory;
    supplier: string;
    invoiceRef: string;
    notes: string;
  }) => void;
  /** Color theme for the modal header & accents */
  theme?: 'purple' | 'blue' | 'rose' | 'sky' | 'amber' | 'emerald';
  /** Mode pharmacie : demande d'appro au magasinier (pas d'achat fournisseur) */
  pharmacyMode?: boolean;
  /** Libellé service destinataire (affiché en mode pharmacie) */
  targetServiceName?: string;
}

const THEME_STYLES: Record<string, { header: string; ring: string; row: string; save: string; }> = {
  purple:  { header: 'bg-purple-600',  ring: 'focus:ring-purple-500',  row: 'bg-purple-500',  save: 'bg-purple-500 hover:bg-purple-600 border-purple-600' },
  blue:    { header: 'bg-blue-600',    ring: 'focus:ring-blue-500',    row: 'bg-blue-500',    save: 'bg-blue-500 hover:bg-blue-600 border-blue-600' },
  rose:    { header: 'bg-rose-600',    ring: 'focus:ring-rose-500',    row: 'bg-rose-500',    save: 'bg-rose-500 hover:bg-rose-600 border-rose-600' },
  sky:     { header: 'bg-sky-600',     ring: 'focus:ring-sky-500',     row: 'bg-sky-500',     save: 'bg-sky-500 hover:bg-sky-600 border-sky-600' },
  amber:   { header: 'bg-amber-600',   ring: 'focus:ring-amber-500',   row: 'bg-amber-500',   save: 'bg-amber-500 hover:bg-amber-600 border-amber-600' },
  emerald: { header: 'bg-emerald-600', ring: 'focus:ring-emerald-500', row: 'bg-emerald-500', save: 'bg-emerald-500 hover:bg-emerald-600 border-emerald-600' },
};

export default function DemandeAchatForm({
  open, onClose, articles, defaultCategory = 'approvisionnement',
  defaultSupplier = '', defaultInvoiceRef = '',
  initialLine = null, initialNotes = '', initialCategory, isEditMode = false,
  onSubmit, theme = 'purple', pharmacyMode = false, targetServiceName = 'Pharmacie',
}: DemandeAchatFormProps) {
  const [reqLines, setReqLines] = useState<ReqLine[]>([]);
  const [reqCategory, setReqCategory] = useState<TransferCategory>(initialCategory || defaultCategory);
  const [reqSupplier, setReqSupplier] = useState(defaultSupplier);
  const [reqInvoiceRef, setReqInvoiceRef] = useState(defaultInvoiceRef);
  const [reqGlobalNotes, setReqGlobalNotes] = useState(initialNotes);
  const [reqSelLineId, setReqSelLineId] = useState<string | null>(null);
  const [reqLineForm, setReqLineForm] = useState<ReqLine>({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 10, purchasePrice: 0, expiryDate: '', notes: '', amount: 0 });
  const [reqSearch, setReqSearch] = useState('');
  const [reqSearchIdx, setReqSearchIdx] = useState(0);
  const [reqLineIsNew, setReqLineIsNew] = useState(true);
  const reqSearchRef = useRef<HTMLInputElement>(null);

  const styles = THEME_STYLES[theme] || THEME_STYLES.purple;

  // Reset / load initial values when opening
  useEffect(() => {
    if (!open) return;
    if (isEditMode && initialLine) {
      setReqLines([initialLine]);
      setReqSelLineId(initialLine.id);
      setReqLineForm(initialLine);
      setReqLineIsNew(false);
    } else {
      setReqLines([]);
      setReqSelLineId(null);
      setReqLineForm({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 10, purchasePrice: 0, expiryDate: '', notes: '', amount: 0 });
      setReqLineIsNew(true);
    }
    setReqCategory(initialCategory || defaultCategory);
    setReqSupplier(defaultSupplier);
    setReqInvoiceRef(defaultInvoiceRef);
    setReqGlobalNotes(initialNotes);
  }, [open]);

  // Esc closes modal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const reqFiltered = reqSearch.length >= 1
    ? articles.filter(a => a.name.toLowerCase().includes(reqSearch.toLowerCase()))
    : [];

  const reqSelectArticle = (articleId: string) => {
    const a = articles.find(x => x.id === articleId);
    if (!a) return;
    const suggested = Math.max(1, a.minStockPharmacie - a.stockPharmacie > 0 ? a.minStockPharmacie - a.stockPharmacie : 10);
    setReqLineForm({
      id: uuidv4(),
      articleId: a.id,
      articleName: a.name,
      family: a.family,
      quantity: suggested,
      purchasePrice: a.purchasePrice || 0,
      expiryDate: a.expiryDate || '',
      notes: '',
      amount: suggested * (a.purchasePrice || 0),
    });
    setReqLineIsNew(true);
    setReqSelLineId(null);
    setReqSearch('');
    setTimeout(() => {
      const q = document.getElementById('req-qty-input');
      q?.focus();
      (q as HTMLInputElement)?.select();
    }, 50);
  };

  const reqArtKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setReqSearchIdx(i => Math.min(i + 1, reqFiltered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setReqSearchIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (reqFiltered.length > 0 && reqSearch) reqSelectArticle(reqFiltered[reqSearchIdx].id);
      else if (reqLineForm.articleName) reqSaveLine();
    } else if (e.key === 'Escape') { setReqSearch(''); }
  };

  const reqSaveLine = () => {
    if (!reqLineForm.articleId || !reqLineForm.articleName) return;
    const amount = (reqLineForm.quantity || 0) * (reqLineForm.purchasePrice || 0);
    const lineToSave = { ...reqLineForm, amount };
    if (reqLineIsNew || !reqLines.some(l => l.id === reqLineForm.id)) {
      setReqLines(prev => [...prev, { ...lineToSave, id: uuidv4() }]);
    } else {
      setReqLines(prev => prev.map(l => l.id === reqLineForm.id ? lineToSave : l));
    }
    reqLineNew();
  };

  const reqLineNew = () => {
    setReqLineForm({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 10, purchasePrice: 0, expiryDate: '', notes: '', amount: 0 });
    setReqSelLineId(null);
    setReqLineIsNew(true);
    setReqSearch('');
    setTimeout(() => reqSearchRef.current?.focus(), 30);
  };

  const reqDeleteLine = () => {
    if (!reqSelLineId) return;
    setReqLines(prev => prev.filter(l => l.id !== reqSelLineId));
    reqLineNew();
  };

  const handleSubmit = () => {
    if (reqLines.length === 0) { alert('Ajoutez au moins un article.'); return; }
    // En mode pharmacie : demande d'appro interne (pas d'achat fournisseur)
    if (!pharmacyMode) {
      if (!reqSupplier.trim() && !isEditMode) { alert('Fournisseur requis.'); return; }
      if (!reqInvoiceRef.trim() && !isEditMode) { alert('N° BL / Facture requis.'); return; }
    }
    onSubmit({
      lines: reqLines,
      category: pharmacyMode ? 'approvisionnement' : reqCategory,
      supplier: reqSupplier.trim(),
      invoiceRef: reqInvoiceRef.trim(),
      notes: reqGlobalNotes.trim(),
    });
  };

  const totalAmount = reqLines.reduce((s, l) => s + (l.amount || 0), 0);
  const totalQty = reqLines.reduce((s, l) => s + l.quantity, 0);

  const headerBg = transferCategoryColor(reqCategory).replace('text-', 'border-').split(' ').find(s => s.startsWith('bg-')) || 'bg-slate-100';
  const headerText = transferCategoryColor(reqCategory).split(' ').find(s => s.startsWith('text-')) || 'text-slate-800';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`px-5 py-3 ${styles.header} text-white flex items-center justify-between`}>
          <span className="font-bold flex items-center gap-2">
            {isEditMode ? <Edit3 className="w-5 h-5" /> : <Send className="w-5 h-5" />}
            {isEditMode
              ? 'Modifier la demande'
              : pharmacyMode
                ? `Demande d'approvisionnement — ${targetServiceName} → Magasinier`
                : "Nouvelle fenêtre — Demande d'achat / Réapprovisionnement"} (Saisie Sage)
          </span>
          <button onClick={onClose} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* Header info */}
          <div className={`p-4 ${headerBg} border rounded-xl`}>
            <h4 className={`font-bold flex items-center gap-2 mb-3 ${headerText}`}>
              <Send className="w-5 h-5" />
              {pharmacyMode
                ? `Demande d'appro ${targetServiceName} → dépôt central (magasinier)`
                : `Demander un réapprovisionnement au magasinier — ${transferCategoryLabel(reqCategory)}`}
            </h4>

            {pharmacyMode ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">🏥 Service destinataire</label>
                  <input readOnly value={targetServiceName} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-slate-100 text-sm text-slate-700 font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">📝 Motif / Notes</label>
                  <input
                    type="text"
                    value={reqGlobalNotes}
                    onChange={e => setReqGlobalNotes(e.target.value)}
                    className={`w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 ${styles.ring} bg-white text-sm text-slate-800`}
                    placeholder="Ex: Stock bas, urgence, patient en attente..."
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">🏷️ Type d'achat *</label>
                    <select
                      value={reqCategory}
                      onChange={e => setReqCategory(e.target.value as TransferCategory)}
                      className={`w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 ${styles.ring} bg-white text-sm text-slate-800 cursor-pointer`}
                    >
                      {TRANSFER_CATEGORIES.map(c => (
                        <option key={c} value={c}>{transferCategoryLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">👤 Fournisseur *</label>
                    <input
                      type="text"
                      value={reqSupplier}
                      onChange={e => setReqSupplier(e.target.value)}
                      className={`w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 ${styles.ring} bg-white text-sm text-slate-800`}
                      placeholder="Nom du fournisseur..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">📄 N° BL / Facture *</label>
                    <input
                      type="text"
                      value={reqInvoiceRef}
                      onChange={e => setReqInvoiceRef(e.target.value)}
                      className={`w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 ${styles.ring} bg-white text-sm text-slate-800`}
                      placeholder="Ex: BL-2026-004..."
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">📝 Notes / Motif global</label>
                  <input
                    type="text"
                    value={reqGlobalNotes}
                    onChange={e => setReqGlobalNotes(e.target.value)}
                    className={`w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 ${styles.ring} bg-white text-sm text-slate-800`}
                    placeholder="Ex: Stock bas, urgence bloc opératoire..."
                  />
                </div>
              </>
            )}
          </div>

          {/* Category quick pills — masqués en mode pharmacie */}
          {!pharmacyMode && (
            <div className="flex flex-wrap gap-2">
              {TRANSFER_CATEGORIES.map(c => (
                <button key={c} onClick={() => setReqCategory(c)} className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer border transition ${reqCategory === c ? `${transferCategoryColor(c)} border-transparent shadow` : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {transferCategoryLabel(c)}
                </button>
              ))}
            </div>
          )}

          {/* Sage Line Editor */}
          <div className="bg-[#f4f4f4] border border-slate-300 rounded text-xs select-none p-1">
            <div className="bg-slate-100 border-b border-slate-300 p-2 m-1.5 mb-0 rounded shadow-inner">
              <div className="flex flex-wrap items-end gap-1.5 font-sans">
                <div className="flex-1 min-w-[160px] relative">
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Article (↑↓ Entrée)</label>
                  <input
                    ref={reqSearchRef}
                    type="text"
                    value={reqLineForm.articleName && !reqSearch ? reqLineForm.articleName : reqSearch}
                    onChange={e => {
                      setReqSearch(e.target.value);
                      setReqSearchIdx(0);
                      if (reqLineForm.articleName && e.target.value !== reqLineForm.articleName) {
                        setReqLineForm(prev => ({ ...prev, articleName: '', articleId: '' }));
                      }
                    }}
                    onKeyDown={reqArtKeyDown}
                    className={`w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-slate-500 focus:ring-1 text-slate-800`}
                    placeholder="🔍 Saisir article à demander..."
                  />
                  {reqSearch.length >= 1 && reqFiltered.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                      {reqFiltered.map((a, idx) => (
                        <div
                          key={a.id}
                          onClick={() => reqSelectArticle(a.id)}
                          className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b border-slate-100 ${idx === reqSearchIdx ? `${styles.row} text-white font-medium` : 'hover:bg-slate-50 text-slate-800'}`}
                        >
                          <span>[{familyLabel(a.family)}] {a.name}</span>
                          <span className={`font-mono ${idx === reqSearchIdx ? 'text-white' : 'text-slate-500'}`}>Pharma: {a.stockPharmacie} / Central: {a.stockCentral}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="w-24"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Famille</label><input readOnly value={familyLabel(reqLineForm.family as any) || ''} className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-600 truncate font-sans" /></div>

                <div className="w-20"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quantité</label>
                  <input id="req-qty-input" type="number" min={1} value={reqLineForm.quantity}
                    onChange={e => setReqLineForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1, amount: (parseInt(e.target.value) || 1) * (prev.purchasePrice || 0) }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); reqSaveLine(); } }}
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-slate-500 text-slate-800" />
                </div>

                <div className="w-24"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">P. Achat</label>
                  <input type="number" min={0} value={reqLineForm.purchasePrice}
                    onChange={e => setReqLineForm(prev => ({ ...prev, purchasePrice: parseInt(e.target.value) || 0, amount: prev.quantity * (parseInt(e.target.value) || 0) }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); reqSaveLine(); } }}
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-slate-500 text-slate-800" />
                </div>

                <div className="w-28"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Péremption</label>
                  <input type="date" value={reqLineForm.expiryDate}
                    onChange={e => setReqLineForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); reqSaveLine(); } }}
                    className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-slate-500 text-slate-800" />
                </div>

                <div className="w-28"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Montant</label>
                  <input readOnly value={formatAr(reqLineForm.quantity * reqLineForm.purchasePrice)}
                    className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono font-bold text-slate-700" />
                </div>
              </div>

              <div className="flex justify-end gap-1.5 mt-2">
                <button onClick={reqLineNew} className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 transition cursor-pointer text-xs font-medium">
                  <Plus className="h-3.5 w-3.5 text-slate-500" /> Nouveau
                </button>
                <button onClick={reqDeleteLine} disabled={!reqSelLineId} className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 disabled:opacity-40 transition cursor-pointer text-xs font-medium">
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Supprimer
                </button>
                <button onClick={reqSaveLine} disabled={!reqLineForm.articleName} className={`flex items-center gap-1 px-2.5 py-1 text-white border rounded shadow-sm font-semibold disabled:opacity-40 transition cursor-pointer text-xs ${styles.save}`}>
                  <Save className="h-3.5 w-3.5" /> Enregistrer
                </button>
              </div>
            </div>

            {/* Lignes */}
            <div className="bg-white mx-1.5 mb-1.5 border-t border-slate-300 overflow-x-auto rounded-b max-h-[260px] overflow-y-auto">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
                  <tr className="divide-x divide-slate-200">
                    <th className="p-1 font-normal w-24">Famille</th>
                    <th className="p-1 font-normal min-w-[140px]">Article</th>
                    <th className="p-1 font-normal text-right w-16">Qté</th>
                    <th className="p-1 font-normal text-right w-24">P. Achat</th>
                    <th className="p-1 font-normal text-center w-24">Péremption</th>
                    <th className="p-1 font-normal text-right w-24">Montant</th>
                    <th className="p-1 font-normal min-w-[100px]">Note</th>
                    <th className="p-1 font-normal w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 font-mono">
                  {reqLines.map(l => {
                    const isSel = l.id === reqSelLineId;
                    return (
                      <tr
                        key={l.id}
                        onClick={() => { setReqSelLineId(l.id); setReqLineForm(l); setReqLineIsNew(false); setReqSearch(''); }}
                        className={`cursor-pointer divide-x divide-slate-200 transition-colors ${isSel ? `${styles.row} text-white font-medium` : 'hover:bg-slate-50 text-slate-800'}`}
                      >
                        <td className="p-1 font-sans"><span className={`px-1 rounded text-[10px] ${isSel ? 'bg-white/20 text-white font-medium' : 'bg-slate-200 text-slate-700'}`}>{familyLabel(l.family)}</span></td>
                        <td className="p-1 font-sans">{l.articleName}</td>
                        <td className="p-1 text-right">{l.quantity}</td>
                        <td className="p-1 text-right">{l.purchasePrice.toLocaleString('fr-FR')}</td>
                        <td className="p-1 text-center">{l.expiryDate ? new Date(l.expiryDate).toLocaleDateString('fr-FR') : '—'}</td>
                        <td className="p-1 text-right font-bold">{l.amount.toLocaleString('fr-FR')}</td>
                        <td className="p-1 font-sans text-xs truncate">{l.notes || '—'}</td>
                        <td className="p-1 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReqLines(reqLines.filter(x => x.id !== l.id));
                              if (reqSelLineId === l.id) reqLineNew();
                            }}
                            className={`cursor-pointer ${isSel ? 'text-white hover:text-red-200' : 'text-rose-600 hover:text-rose-800'}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {reqLines.length === 0 && (
                    <tr><td colSpan={8} className="p-4 text-center text-slate-400 font-sans">Aucun article. Saisissez un article ci-dessus.</td></tr>
                  )}
                </tbody>
                {reqLines.length > 0 && (
                  <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 text-slate-800 font-sans font-bold">
                    <tr>
                      <td colSpan={2} className="p-1.5 text-right text-xs">TOTAUX :</td>
                      <td className="p-1.5 text-right font-mono text-sm">{totalQty}</td>
                      <td colSpan={2} className="p-1.5"></td>
                      <td className="p-1.5 text-right font-mono text-lg text-emerald-700">{formatAr(totalAmount)}</td>
                      <td colSpan={2} className="p-1.5 text-right text-xs text-emerald-700">{reqLines.length} ligne(s)</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-lg text-sm font-medium cursor-pointer">Annuler</button>
          <button
            onClick={handleSubmit}
            disabled={reqLines.length === 0}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-40 cursor-pointer flex items-center gap-2 shadow"
          >
            <Send className="w-4 h-4" /> {isEditMode ? 'Enregistrer les modifications' : pharmacyMode ? 'Envoyer au magasinier (dépôt central)' : 'Envoyer la demande au magasinier'}
          </button>
        </div>
      </div>
    </div>
  );
}
