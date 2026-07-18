import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState } from '../store';
import type { StockTransfer, TransferCategory } from '../types';
import { addAuditLog, addNotification, formatAr, familyLabel, transferCategoryLabel, transferCategoryColor } from '../store';
import {
  Pill, Package, CheckCircle, AlertTriangle, Clock, Search, PackageCheck, Send,
  Plus, Trash2, Save, X, Edit3, FileText, Filter
} from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type Tab = 'pending' | 'stock' | 'delivered' | 'request' | 'history';

type ReqLine = {
  id: string;
  articleId: string;
  articleName: string;
  family: any;
  quantity: number;
  notes: string;
};

const CATEGORIES: TransferCategory[] = ['approvisionnement', 'hospitalisation', 'bloc', 'central'];

export default function PharmacyModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('pending');
  const [searchStock, setSearchStock] = useState('');
  const [filterCat, setFilterCat] = useState<TransferCategory | 'all'>('all');

  // Modal state for new/edit request
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEditingId, setModalEditingId] = useState<string | null>(null);
  const [reqLines, setReqLines] = useState<ReqLine[]>([]);
  const [reqCategory, setReqCategory] = useState<TransferCategory>('approvisionnement');
  const [reqGlobalNotes, setReqGlobalNotes] = useState('');
  const [reqSelLineId, setReqSelLineId] = useState<string | null>(null);
  const [reqLineForm, setReqLineForm] = useState<ReqLine>({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 10, notes: '' });
  const [reqSearch, setReqSearch] = useState('');
  const [reqSearchIdx, setReqSearchIdx] = useState(0);
  const [reqLineIsNew, setReqLineIsNew] = useState(true);
  const reqSearchRef = useRef<HTMLInputElement>(null);

  const paidConsultations = state.consultations.filter((c) => {
    const inv = state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid' && !i.isExternal);
    const hasUndelivered = c.prescriptions.some((p) => !p.delivered);
    return inv && hasUndelivered;
  });
  const emergencyConsults = state.consultations.filter((c) => c.isEmergency && c.prescriptions.some((p) => !p.delivered) && !state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid'));
  const externalInvoices = state.invoices.filter((i) => i.isExternal && i.status === 'paid');
  const allPending = [...paidConsultations, ...emergencyConsults];

  const deliveredCount = state.consultations.filter((c) => c.prescriptions.length > 0 && c.prescriptions.every((p) => p.delivered)).length;
  const lowStock = state.articles.filter((a) => a.stockPharmacie <= a.minStockPharmacie).length;
  const filtered = state.articles.filter((a) => a.name.toLowerCase().includes(searchStock.toLowerCase()));

  // Requests list (all sent by pharmacy, includes re-appro / hospit / bloc / achat)
  const myRequests = state.stockTransfers.filter((t) => t.requestedBy === state.currentUser?.id || true); // show all requests; pharm only sends 'approvisionnement' but display all for visibility
  const myRequestsFiltered = myRequests.filter((t) => filterCat === 'all' || t.category === filterCat);

  // ==== Modal logic ====
  const openNewRequest = () => {
    setModalEditingId(null);
    setReqLines([]);
    setReqCategory('approvisionnement');
    setReqGlobalNotes('');
    reqLineNew();
    setModalOpen(true);
    setTimeout(() => reqSearchRef.current?.focus(), 60);
  };

  const openEditRequest = (transferId: string) => {
    // Edit an existing pending request (single-line) -> load it into the modal
    const tr = state.stockTransfers.find((t) => t.id === transferId);
    if (!tr) return;
    if (tr.status !== 'requested') { alert('Impossible de modifier une demande déjà traitée.'); return; }
    setModalEditingId(tr.id);
    setReqCategory(tr.category);
    setReqGlobalNotes(tr.notes || '');
    const a = state.articles.find((x) => x.id === tr.articleId);
    const line: ReqLine = { id: uuidv4(), articleId: tr.articleId, articleName: tr.articleName, family: a?.family || 'MEDIC', quantity: tr.quantity, notes: tr.notes || '' };
    setReqLines([line]);
    setReqSelLineId(line.id);
    setReqLineForm(line);
    setReqLineIsNew(false);
    setReqSearch('');
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setModalEditingId(null); };

  // Esc closes modal
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  // Line filtering for search
  const reqFiltered = reqSearch.length >= 1
    ? state.articles.filter(a => a.name.toLowerCase().includes(reqSearch.toLowerCase()))
    : [];

  const reqSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    setReqLineForm({
      id: uuidv4(),
      articleId: a.id,
      articleName: a.name,
      family: a.family,
      quantity: Math.max(1, a.minStockPharmacie - a.stockPharmacie > 0 ? a.minStockPharmacie - a.stockPharmacie : 10),
      notes: '',
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
    if (reqLineIsNew || !reqLines.some(l => l.id === reqLineForm.id)) {
      setReqLines(prev => [...prev, { ...reqLineForm, id: uuidv4() }]);
    } else {
      setReqLines(prev => prev.map(l => l.id === reqLineForm.id ? reqLineForm : l));
    }
    reqLineNew();
  };

  const reqLineNew = () => {
    setReqLineForm({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 10, notes: '' });
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

  const submitRequest = () => {
    if (reqLines.length === 0) { alert('Ajoutez au moins un article.'); return; }

    if (modalEditingId) {
      // Update a single existing request (keep simple: replace the one we're editing, remove extras if multiple - or only take first)
      const first = reqLines[0];
      setState((prev) => {
        const next = {
          ...prev,
          stockTransfers: prev.stockTransfers.map((t) =>
            t.id === modalEditingId
              ? { ...t, articleId: first.articleId, articleName: first.articleName, quantity: first.quantity, category: reqCategory, notes: reqGlobalNotes || first.notes }
              : t
          ),
        };
        addAuditLog(next, 'DEMANDE_REAPPRO_MODIF', `Demande modifiée: ${first.articleName} (${first.quantity}) [${transferCategoryLabel(reqCategory)}]`);
        return next;
      });
      closeModal();
      return;
    }

    setState((prev) => {
      const newTransfers: StockTransfer[] = reqLines.map((l) => ({
        id: uuidv4(),
        articleId: l.articleId,
        articleName: l.articleName,
        quantity: l.quantity,
        category: reqCategory,
        requestedBy: prev.currentUser?.id,
        requestedAt: new Date().toISOString(),
        status: 'requested',
        notes: reqGlobalNotes || l.notes,
      }));
      const next = { ...prev, stockTransfers: [...prev.stockTransfers, ...newTransfers] };
      addAuditLog(next, 'DEMANDE_REAPPRO', `${reqLines.length} article(s) — ${transferCategoryLabel(reqCategory)}`);
      addNotification(next, 'magasinier', `📩 ${transferCategoryLabel(reqCategory)}: ${reqLines.length} article(s) en demande`, 'info');
      return next;
    });

    setReqLines([]);
    setReqGlobalNotes('');
    reqLineNew();
    closeModal();
  };

  const cancelRequest = (id: string) => {
    if (!confirm('Annuler cette demande ?')) return;
    setState((prev) => ({ ...prev, stockTransfers: prev.stockTransfers.map(t => t.id === id ? { ...t, status: 'cancelled' as const } : t) }));
  };

  const deliver = (consultationId: string, isExternal?: boolean) => {
    const consultation = state.consultations.find((c) => c.id === consultationId);
    if (!consultation) return;
    const patient = isExternal ? null : state.patients.find((p) => p.id === consultation.patientId);
    const name = patient ? `${patient.lastName} ${patient.firstName}` : 'Client externe';

    setState((prev) => {
      const updatedConsultations = prev.consultations.map((c) =>
        c.id === consultationId ? { ...c, prescriptions: c.prescriptions.map((p) => ({ ...p, delivered: true })) } : c);
      const updatedArticles = [...prev.articles];
      consultation.prescriptions.forEach((p) => {
        const idx = updatedArticles.findIndex((a) => a.name === p.articleName);
        if (idx >= 0) updatedArticles[idx] = { ...updatedArticles[idx], stockPharmacie: Math.max(0, updatedArticles[idx].stockPharmacie - p.quantity) };
      });
      const hasLab = updatedConsultations.find((c) => c.id === consultationId)?.labRequests.some((lr) => lr.status !== 'completed');
      const newStatus = hasLab ? 'invoice_paid' : 'medications_delivered';

      const next = { ...prev, consultations: updatedConsultations, articles: updatedArticles,
        patients: patient ? prev.patients.map((p) => p.id === consultation.patientId ? { ...p, status: newStatus as any } : p) : prev.patients };
      addAuditLog(next, 'DELIVRANCE', `Médicaments délivrés: ${name}`, consultation.patientId);
      updatedArticles.forEach((a) => { if (a.stockPharmacie <= 0) addNotification(next, 'pharmacy', `🚨 ${a.name} en rupture (pharmacie)`, 'critical');
        else if (a.stockPharmacie <= a.minStockPharmacie) addNotification(next, 'pharmacy', `⚠️ Stock bas pharmacie: ${a.name} (${a.stockPharmacie})`, 'warning'); });
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"><div className="flex items-center gap-3"><div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div><div><div className="text-2xl font-bold">{allPending.length}</div><div className="text-sm text-slate-500">À délivrer</div></div></div></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"><div className="flex items-center gap-3"><div className="p-2 bg-green-100 rounded-lg"><PackageCheck className="w-5 h-5 text-green-600" /></div><div><div className="text-2xl font-bold">{deliveredCount}</div><div className="text-sm text-slate-500">Délivrées</div></div></div></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"><div className="flex items-center gap-3"><div className="p-2 bg-purple-100 rounded-lg"><Package className="w-5 h-5 text-purple-600" /></div><div><div className="text-2xl font-bold">{state.articles.length}</div><div className="text-sm text-slate-500">Articles</div></div></div></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"><div className={`flex items-center gap-3 ${lowStock > 0 ? 'bg-red-100' : 'bg-green-100'} rounded-lg p-2`}><AlertTriangle className={`w-5 h-5 ${lowStock > 0 ? 'text-red-600' : 'text-green-600'}`} /><div><div className="text-2xl font-bold">{lowStock}</div><div className="text-sm text-slate-500">Alertes stock</div></div></div></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {[
            { key: 'pending' as Tab, icon: <Clock className="w-4 h-4" />, label: `Ordonnances (${allPending.length})` },
            { key: 'stock' as Tab, icon: <Package className="w-4 h-4" />, label: 'Stock pharmacie' },
            { key: 'delivered' as Tab, icon: <CheckCircle className="w-4 h-4" />, label: 'Délivrées' },
            { key: 'request' as Tab, icon: <Send className="w-4 h-4" />, label: `Demander réappro (${state.stockTransfers.filter(t=>t.status==='requested').length})` },
            { key: 'history' as Tab, icon: <FileText className="w-4 h-4" />, label: 'Historique demandes' },
          ].map((t) => (<button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${tab === t.key ? 'border-purple-500 text-purple-600 bg-purple-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t.icon}{t.label}</button>))}
        </div>

        <div className="p-6">
          {tab === 'pending' && <div>{allPending.length === 0 ? <div className="text-center py-12 text-slate-400"><Pill className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Aucune ordonnance</p></div> : allPending.map((c) => {
            const patient = state.patients.find((p) => p.id === c.patientId);
            const ext = externalInvoices.find((i) => i.consultationId === c.id);
            const isUrgent = c.isEmergency && !state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid');
            return (<div key={c.id} className={`border rounded-xl overflow-hidden mb-3 ${isUrgent ? 'border-red-300 bg-red-50/50' : 'border-slate-200'}`}>
              <div className="p-4 flex items-center justify-between bg-slate-50">
                <div><div className="font-semibold text-slate-800">{patient ? `${patient.lastName} ${patient.firstName}` : ext ? ext.clientName : 'Inconnu'}{isUrgent && <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">🚨 Urgence</span>}</div>
                  <div className="text-xs text-slate-500 mt-1">{c.doctorName} — {new Date(c.date).toLocaleDateString('fr-FR')}</div></div>
                <button onClick={() => deliver(c.id, !!ext)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm flex items-center gap-2 cursor-pointer"><CheckCircle className="w-4 h-4" /> Délivrer</button>
              </div>
              <div className="p-4"><table className="w-full text-sm"><thead><tr className="border-b border-slate-200"><th className="text-left py-2 text-slate-600">Article</th><th className="text-center py-2 text-slate-600">Qté</th><th className="text-left py-2 text-slate-600">Posologie</th><th className="text-right py-2 text-slate-600">Stock</th></tr></thead><tbody>{c.prescriptions.filter((p) => !p.delivered).map((p) => { const art = state.articles.find((a) => a.name === p.articleName); return (<tr key={p.id} className="border-b border-slate-100"><td className="py-2 font-medium">{p.articleName}</td><td className="py-2 text-center">{p.quantity}</td><td className="py-2">{p.posology}</td><td className={`py-2 text-right font-mono ${(art?.stockPharmacie || 0) <= 0 ? 'text-red-600 font-bold' : ''}`}>{art?.stockPharmacie || 0}</td></tr>); })}</tbody></table></div>
            </div>);
          })}</div>}

          {tab === 'stock' && <div>
            <div className="mb-4"><div className="relative max-w-md"><Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" /><input type="text" value={searchStock} onChange={(e) => setSearchStock(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none" placeholder="Rechercher..." /></div></div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-50 border-b border-slate-200"><th className="text-left py-3 px-4 font-semibold text-slate-600">Famille</th><th className="text-left py-3 px-4 font-semibold text-slate-600">Article</th><th className="text-center py-3 px-4 font-semibold text-slate-600">Stock Pharma</th><th className="text-center py-3 px-4 font-semibold text-slate-600">Stock Central</th><th className="text-right py-3 px-4 font-semibold text-slate-600">Prix</th><th className="text-center py-3 px-4 font-semibold text-slate-600">État</th></tr></thead><tbody>{filtered.map((a) => {
              const isLow = a.stockPharmacie <= a.minStockPharmacie && a.stockPharmacie > 0;
              const isOut = a.stockPharmacie === 0;
              return (<tr key={a.id} className={`border-b border-slate-100 ${isOut ? 'bg-red-50' : isLow ? 'bg-amber-50' : ''}`}>
                <td className="py-3 px-4"><span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{familyLabel(a.family)}</span></td>
                <td className="py-3 px-4 font-medium">{a.name}</td>
                <td className="py-3 px-4 text-center font-mono font-bold">{a.stockPharmacie}</td>
                <td className="py-3 px-4 text-center font-mono text-slate-500">{a.stockCentral}</td>
                <td className="py-3 px-4 text-right font-mono">{formatAr(a.priceComptoir)}</td>
                <td className="py-3 px-4 text-center">{isOut ? <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">RUPTURE</span> : isLow ? <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">Stock bas</span> : <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">OK</span>}</td>
              </tr>);
            })}</tbody></table></div>
          </div>}

          {tab === 'delivered' && (
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-700">Ordonnances délivrées</h4>
              {state.consultations.filter(c => c.prescriptions.length > 0 && c.prescriptions.every(p => p.delivered)).length === 0
                ? <div className="text-center py-8 text-slate-400 text-sm">Aucune ordonnance délivrée.</div>
                : state.consultations.filter(c => c.prescriptions.length > 0 && c.prescriptions.every(p => p.delivered)).slice(-20).reverse().map(c => {
                  const p = state.patients.find(pp => pp.id === c.patientId);
                  return (<div key={c.id} className="border rounded-lg p-3 flex justify-between items-center">
                    <div><div className="font-medium">{p?.lastName} {p?.firstName}</div><div className="text-xs text-slate-500">{c.doctorName} — {new Date(c.date).toLocaleDateString('fr-FR')}</div></div>
                    <span className="text-emerald-600 font-medium text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Délivrée</span>
                  </div>);
                })}
            </div>
          )}

          {/* === DEMANDER RÉAPPRO — Sage-style avec boutons Nouveau / Modifier qui ouvrent une fenêtre modale === */}
          {tab === 'request' && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h4 className="font-bold text-purple-800 flex items-center gap-2">
                    <Send className="w-5 h-5 text-purple-600" /> Demander un réapprovisionnement au magasinier
                  </h4>
                  <p className="text-xs text-purple-700 mt-1">Formulaire style Saisie Sage — Achat Central / Hospit / Bloc / Approvisionnement</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={openNewRequest} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer shadow">
                    <Plus className="w-4 h-4" /> Nouveau
                  </button>
                </div>
              </div>

              {/* Liste des demandes en cours avec bouton Modifier */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-600">Filtrer :</span>
                  <button onClick={() => setFilterCat('all')} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filterCat === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Toutes</button>
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setFilterCat(c)} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filterCat === c ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{transferCategoryLabel(c)}</button>
                  ))}
                </div>

                {state.stockTransfers.filter(t => t.status === 'requested' && (filterCat === 'all' || t.category === filterCat)).length === 0 ? (
                  <div className="text-center py-8 text-slate-400 bg-slate-50 border border-dashed rounded-lg text-sm">
                    Aucune demande en cours. Cliquez sur <strong>Nouveau</strong> pour créer une demande.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b text-xs text-slate-600">
                        <tr>
                          <th className="p-2 text-left">Catégorie</th>
                          <th className="p-2 text-left">Article</th>
                          <th className="p-2 text-center">Qté</th>
                          <th className="p-2 text-left">Demandeur</th>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-left">Notes</th>
                          <th className="p-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.stockTransfers.filter(t => t.status === 'requested' && (filterCat === 'all' || t.category === filterCat)).map(tr => {
                          const u = state.users.find(u => u.id === tr.requestedBy);
                          return (
                            <tr key={tr.id} className="border-b hover:bg-slate-50">
                              <td className="p-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${transferCategoryColor(tr.category)}`}>{transferCategoryLabel(tr.category)}</span></td>
                              <td className="p-2 font-medium">{tr.articleName}</td>
                              <td className="p-2 text-center font-mono font-bold">{tr.quantity}</td>
                              <td className="p-2 text-xs">{u?.name || '—'}</td>
                              <td className="p-2 text-xs text-slate-500">{tr.requestedAt ? new Date(tr.requestedAt).toLocaleDateString('fr-FR') : '—'}</td>
                              <td className="p-2 text-xs text-slate-500 truncate max-w-[150px]">{tr.notes || '—'}</td>
                              <td className="p-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => openEditRequest(tr.id)} className="px-2 py-1 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded text-xs flex items-center gap-1 cursor-pointer">
                                    <Edit3 className="w-3 h-3" /> Modifier
                                  </button>
                                  <button onClick={() => cancelRequest(tr.id)} className="px-2 py-1 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded text-xs cursor-pointer">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-600">Filtrer :</span>
                <button onClick={() => setFilterCat('all')} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filterCat === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Toutes</button>
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setFilterCat(c)} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filterCat === c ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{transferCategoryLabel(c)}</button>
                ))}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b text-slate-600">
                    <tr>
                      <th className="p-2 text-left">Date</th><th className="p-2 text-left">Catégorie</th><th className="p-2 text-left">Article</th>
                      <th className="p-2 text-center">Qté</th><th className="p-2 text-left">Demandeur</th><th className="p-2 text-center">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRequestsFiltered.slice().reverse().slice(0, 50).map(tr => {
                      const u = state.users.find(x => x.id === tr.requestedBy);
                      return (
                        <tr key={tr.id} className="border-b hover:bg-slate-50">
                          <td className="p-2 text-slate-500">{tr.requestedAt ? new Date(tr.requestedAt).toLocaleString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : '—'}</td>
                          <td className="p-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${transferCategoryColor(tr.category)}`}>{transferCategoryLabel(tr.category)}</span></td>
                          <td className="p-2 font-medium">{tr.articleName}</td>
                          <td className="p-2 text-center font-mono font-bold">{tr.quantity}</td>
                          <td className="p-2">{u?.name || '—'}</td>
                          <td className="p-2 text-center">
                            {tr.status === 'requested' && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-bold">En attente</span>}
                            {tr.status === 'transferred' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-bold">Transférée</span>}
                            {tr.status === 'cancelled' && <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] rounded-full font-bold">Annulée</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {myRequestsFiltered.length === 0 && (
                      <tr><td colSpan={6} className="p-6 text-center text-slate-400">Aucune demande.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === MODAL NOUVELLE FENÊTRE : Formulaire Sage-style de demande de réappro === */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 bg-purple-600 text-white flex items-center justify-between">
              <span className="font-bold flex items-center gap-2">
                {modalEditingId ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                {modalEditingId ? 'Modifier la demande' : 'Nouvelle demande de réapprovisionnement'} (Saisie Sage)
              </span>
              <button onClick={closeModal} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* Header info */}
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">🏷️ Type / Catégorie *</label>
                    <select
                      value={reqCategory}
                      onChange={e => setReqCategory(e.target.value as TransferCategory)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm text-slate-800 cursor-pointer"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{transferCategoryLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">📝 Notes / Motif global</label>
                    <input
                      type="text"
                      value={reqGlobalNotes}
                      onChange={e => setReqGlobalNotes(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm text-slate-800"
                      placeholder="Ex: Stock bas, urgence bloc..."
                    />
                  </div>
                </div>
              </div>

              {/* Sage Line Editor */}
              <div className="bg-[#f4f4f4] border border-slate-300 rounded text-xs select-none p-1">
                <div className="bg-slate-100 border-b border-slate-300 p-2 m-1.5 mb-0 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-1.5 font-sans">
                    <div className="flex-1 min-w-[180px] relative">
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
                        className="w-full bg-white border border-purple-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-500 text-slate-800"
                        placeholder="🔍 Saisir l'article à demander..."
                      />
                      {reqSearch.length >= 1 && reqFiltered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                          {reqFiltered.map((a, idx) => (
                            <div
                              key={a.id}
                              onClick={() => reqSelectArticle(a.id)}
                              className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b border-slate-100 ${idx === reqSearchIdx ? 'bg-purple-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}
                            >
                              <span>[{familyLabel(a.family)}] {a.name}</span>
                              <span className={`font-mono ${idx === reqSearchIdx ? 'text-white' : 'text-slate-500'}`}>Pharma: {a.stockPharmacie} / Central: {a.stockCentral}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Famille</label>
                      <input readOnly value={familyLabel(reqLineForm.family as any) || ''} className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-600 truncate font-sans" />
                    </div>

                    <div className="w-20">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quantité</label>
                      <input
                        id="req-qty-input"
                        type="number" min={1}
                        value={reqLineForm.quantity}
                        onChange={e => setReqLineForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); reqSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-purple-500 text-slate-800"
                      />
                    </div>

                    <div className="flex-1 min-w-[150px]">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Note ligne</label>
                      <input
                        type="text"
                        value={reqLineForm.notes}
                        onChange={e => setReqLineForm(prev => ({ ...prev, notes: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); reqSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs outline-none focus:border-purple-500 text-slate-800"
                        placeholder="Motif..."
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-1.5 mt-2">
                    <button onClick={reqLineNew} className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 transition cursor-pointer text-xs font-medium">
                      <Plus className="h-3.5 w-3.5 text-slate-500" /> Nouveau
                    </button>
                    <button onClick={reqDeleteLine} disabled={!reqSelLineId} className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 disabled:opacity-40 transition cursor-pointer text-xs font-medium">
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Supprimer
                    </button>
                    <button onClick={reqSaveLine} disabled={!reqLineForm.articleName} className="flex items-center gap-1 px-2.5 py-1 bg-purple-500 hover:bg-purple-600 text-white border border-purple-600 rounded shadow-sm font-semibold disabled:opacity-40 transition cursor-pointer text-xs">
                      <Save className="h-3.5 w-3.5" /> Enregistrer
                    </button>
                  </div>
                </div>

                {/* Lignes */}
                <div className="bg-white mx-1.5 mb-1.5 border-t border-slate-300 overflow-x-auto rounded-b max-h-[240px] overflow-y-auto">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
                      <tr className="divide-x divide-slate-200">
                        <th className="p-1 font-normal w-24">Famille</th>
                        <th className="p-1 font-normal min-w-[160px]">Article</th>
                        <th className="p-1 font-normal text-right w-16">Qté</th>
                        <th className="p-1 font-normal min-w-[140px]">Note</th>
                        <th className="p-1 font-normal w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-sans">
                      {reqLines.map(l => {
                        const isSel = l.id === reqSelLineId;
                        return (
                          <tr
                            key={l.id}
                            onClick={() => { setReqSelLineId(l.id); setReqLineForm(l); setReqLineIsNew(false); setReqSearch(''); }}
                            className={`cursor-pointer divide-x divide-slate-200 transition-colors ${isSel ? 'bg-purple-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}
                          >
                            <td className="p-1"><span className={`px-1 rounded text-[10px] ${isSel ? 'bg-purple-600 text-white font-medium' : 'bg-slate-200 text-slate-700'}`}>{familyLabel(l.family)}</span></td>
                            <td className="p-1">{l.articleName}</td>
                            <td className="p-1 text-right font-mono">{l.quantity}</td>
                            <td className="p-1 text-xs truncate">{l.notes || '—'}</td>
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
                        <tr><td colSpan={5} className="p-4 text-center text-slate-400">Aucun article dans cette demande. Saisissez un article ci-dessus.</td></tr>
                      )}
                    </tbody>
                    {reqLines.length > 0 && (
                      <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 text-slate-800 font-sans font-bold">
                        <tr>
                          <td colSpan={2} className="p-1.5 text-right text-xs">TOTAL ARTICLES :</td>
                          <td className="p-1.5 text-right font-mono text-lg text-emerald-700">{reqLines.reduce((s, l) => s + l.quantity, 0)}</td>
                          <td colSpan={2} className="p-1.5 text-right text-xs text-emerald-700">{reqLines.length} ligne(s)</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t bg-slate-50 flex justify-end gap-2">
              <button onClick={closeModal} className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-lg text-sm font-medium cursor-pointer">Annuler</button>
              <button
                onClick={submitRequest}
                disabled={reqLines.length === 0}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-40 cursor-pointer flex items-center gap-2 shadow"
              >
                <Send className="w-4 h-4" /> {modalEditingId ? 'Enregistrer les modifications' : 'Envoyer la demande au magasinier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
