import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { StockEntry } from '../types';
import type { AppState } from '../store';
import { addAuditLog, addNotification, formatAr, ARTICLE_FAMILIES, familyLabel } from '../store';
import { Package, PackageCheck, PackagePlus, Search, Truck, Plus, Trash2, Save, Check } from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type Tab = 'stock' | 'entries' | 'requests';

export default function MagasinierModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('stock');
  const [searchStock, setSearchStock] = useState('');
  
  // Sage Purchase Editor states
  const [supplier, setSupplier] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [purchaseLines, setPurchaseLines] = useState<{ id: string; articleId: string; articleName: string; family: any; quantity: number; purchasePrice: number; expiryDate: string; amount: number; }[]>([]);
  const [purchaseSelLineId, setPurchaseSelLineId] = useState<string | null>(null);
  const [purchaseIsNew, setPurchaseIsNew] = useState(true);
  
  const [purchaseForm, setPurchaseForm] = useState({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 1, purchasePrice: 0, expiryDate: '' });
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseSearchIdx, setPurchaseSearchIdx] = useState(0);
  const purchaseSearchRef = useRef<HTMLInputElement>(null);

  const filteredArticles = state.articles.filter((a) => {
    const q = searchStock.toLowerCase();
    return a.name.toLowerCase().includes(q) || familyLabel(a.family).toLowerCase().includes(q);
  });
  const pendingRequests = state.stockTransfers.filter((t) => t.status === 'requested');

  const purchaseFiltered = purchaseSearch.length >= 1 
    ? state.articles.filter(a => a.name.toLowerCase().includes(purchaseSearch.toLowerCase())) 
    : [];

  const purchaseSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    setPurchaseForm({
      id: uuidv4(),
      articleId: a.id,
      articleName: a.name,
      family: a.family,
      quantity: 1,
      purchasePrice: a.purchasePrice,
      expiryDate: a.expiryDate || '',
    });
    setPurchaseIsNew(true);
    setPurchaseSelLineId(null);
    setPurchaseSearch('');
    setTimeout(() => {
      const qtyInput = document.getElementById('purchase-qty-input');
      qtyInput?.focus();
      (qtyInput as HTMLInputElement)?.select();
    }, 50);
  };

  const purchaseArtKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPurchaseSearchIdx(i => Math.min(i + 1, purchaseFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPurchaseSearchIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (purchaseFiltered.length > 0 && purchaseSearch) {
        purchaseSelectArticle(purchaseFiltered[purchaseSearchIdx].id);
      } else if (purchaseForm.articleName) {
        purchaseSaveLine();
      }
    } else if (e.key === 'Escape') {
      setPurchaseSearch('');
    }
  };

  const purchaseSaveLine = () => {
    if (!purchaseForm.articleId || !purchaseForm.articleName) return;
    const amount = purchaseForm.quantity * purchaseForm.purchasePrice;
    const lineToSave = {
      ...purchaseForm,
      amount,
    };

    if (purchaseIsNew || !purchaseLines.some(l => l.id === purchaseForm.id)) {
      setPurchaseLines([...purchaseLines, { ...lineToSave, id: uuidv4() }]);
    } else {
      setPurchaseLines(purchaseLines.map(l => l.id === purchaseForm.id ? lineToSave : l));
    }
    purchaseNew();
  };

  const purchaseNew = () => {
    setPurchaseForm({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 1, purchasePrice: 0, expiryDate: '' });
    setPurchaseSelLineId(null);
    setPurchaseIsNew(true);
    setPurchaseSearch('');
    setTimeout(() => purchaseSearchRef.current?.focus(), 50);
  };

  const purchaseDeleteLine = () => {
    if (!purchaseSelLineId) return;
    setPurchaseLines(purchaseLines.filter(l => l.id !== purchaseSelLineId));
    purchaseNew();
  };

  const validatePurchase = () => {
    if (purchaseLines.length === 0) return;
    if (!supplier.trim()) { alert('Fournisseur requis'); return; }
    if (!invoiceRef.trim()) { alert('N° BL / Facture requis'); return; }

    setState((prev) => {
      let nextArticles = [...prev.articles];
      const newEntries: StockEntry[] = [];

      purchaseLines.forEach((line) => {
        nextArticles = nextArticles.map((a) => {
          if (a.id === line.articleId) {
            return {
              ...a,
              stockCentral: a.stockCentral + line.quantity,
              purchasePrice: line.purchasePrice,
              expiryDate: line.expiryDate || a.expiryDate,
              supplier: supplier.trim(),
            };
          }
          return a;
        });

        newEntries.push({
          id: uuidv4(),
          articleId: line.articleId,
          articleName: line.articleName,
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
          supplier: supplier.trim(),
          invoiceRef: invoiceRef.trim(),
          expiryDate: line.expiryDate || undefined,
          date: new Date().toISOString(),
          enteredBy: prev.currentUser?.id || 'MAGASINIER',
        });
      });

      const next = {
        ...prev,
        articles: nextArticles,
        stockEntries: [...prev.stockEntries, ...newEntries],
      };

      addAuditLog(next, 'ACHAT_STOCK', `Achat ${purchaseLines.length} articles chez ${supplier.trim()} (BL: ${invoiceRef.trim()})`);
      return next;
    });

    setPurchaseLines([]);
    setSupplier('');
    setInvoiceRef('');
    purchaseNew();
    alert('Achat validé avec succès ! Le stock central a été mis à jour.');
  };

  const transferToPharmacy = (transferId: string) => {
    const tr = state.stockTransfers.find((t) => t.id === transferId);
    if (!tr) return;
    const art = state.articles.find((a) => a.id === tr.articleId);
    if (art && art.stockCentral < tr.quantity) { alert(`Stock central insuffisant (${art.stockCentral})`); return; }
    setState((prev) => ({
      ...prev,
      stockTransfers: prev.stockTransfers.map((t) => t.id === transferId ? { ...t, status: 'transferred' as const, transferredBy: prev.currentUser?.id, transferredAt: new Date().toISOString() } : t),
      articles: prev.articles.map((a) => a.id === tr.articleId ? { ...a, stockCentral: Math.max(0, a.stockCentral - tr.quantity), stockPharmacie: a.stockPharmacie + tr.quantity } : a),
    }));
    addNotification(state, 'pharmacy', `📦 Réappro: ${tr.articleName} (${tr.quantity})`, 'info');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {ARTICLE_FAMILIES.map((f) => { const arts = state.articles.filter((a) => a.family === f); const low = arts.filter((a) => a.stockCentral <= a.minStockCentral).length;
          return (<div key={f} className="bg-white rounded-xl p-4 shadow-sm border"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${low > 0 ? 'bg-red-100' : 'bg-green-100'}`}><Package className={`w-5 h-5 ${low > 0 ? 'text-red-600' : 'text-green-600'}`} /></div><div><div className="text-xl font-bold">{arts.length} <span className="text-sm text-slate-400">({low}⚠️)</span></div><div className="text-sm text-slate-500">{familyLabel(f)}</div></div></div></div>);
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {[{ key: 'stock' as Tab, l: '📦 Stock Central' },{ key: 'entries' as Tab, l: `📥 Entrées` },{ key: 'requests' as Tab, l: `📩 Demandes (${pendingRequests.length})` }].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-6 py-3 text-sm font-medium border-b-2 cursor-pointer ${tab===t.key?'border-blue-500 text-blue-600 bg-blue-50/50':'border-transparent text-slate-500'}`}>{t.l}</button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'stock' && <div>
            <div className="mb-3"><div className="relative max-w-md"><Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" /><input type="text" value={searchStock} onChange={(e) => setSearchStock(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none" placeholder="Rechercher..." /></div></div>
            <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr><th className="p-2 text-left">Famille</th><th className="p-2 text-left">Article</th><th className="p-2 text-center">Stock Central</th><th className="p-2 text-center">Stock Pharma</th><th className="p-2 text-right">P. Achat</th><th className="p-2 text-center">Péremption</th><th className="p-2 text-center">État</th></tr></thead><tbody>{filteredArticles.map((a) => {
              const out = a.stockCentral <= 0; const low = a.stockCentral <= a.minStockCentral && !out;
              return (<tr key={a.id} className={`border-b ${out?'bg-red-50':low?'bg-amber-50':''}`}><td className="p-2"><span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{familyLabel(a.family)}</span></td><td className="p-2 font-medium">{a.name}</td><td className="p-2 text-center font-mono font-bold">{a.stockCentral}</td><td className="p-2 text-center font-mono">{a.stockPharmacie}</td><td className="p-2 text-right font-mono">{formatAr(a.purchasePrice)}</td><td className="p-2 text-center text-xs">{a.expiryDate ? new Date(a.expiryDate).toLocaleDateString('fr-FR') : '—'}</td><td className="p-2 text-center">{out?<span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">RUPTURE</span>:low?<span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">BAS</span>:<span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">OK</span>}</td></tr>);
            })}</tbody></table></div>
          </div>}

          {tab === 'entries' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h4 className="font-bold text-blue-800 flex items-center gap-2 mb-3">
                  <PackagePlus className="w-5 h-5 text-blue-600" /> Gestionnaire d'Achats & Entrées Stock (Saisie Sage)
                </h4>
                
                {/* Header info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">👤 Fournisseur *</label>
                    <input 
                      type="text" 
                      value={supplier} 
                      onChange={e => setSupplier(e.target.value)} 
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm text-slate-800" 
                      placeholder="Nom du fournisseur..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">📄 N° BL / Facture *</label>
                    <input 
                      type="text" 
                      value={invoiceRef} 
                      onChange={e => setInvoiceRef(e.target.value)} 
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm text-slate-800" 
                      placeholder="Ex: BL-2026-004..."
                    />
                  </div>
                </div>
              </div>

              {/* Sage Line Editor for Purchase Lines */}
              <div className="bg-[#f4f4f4] border border-slate-300 rounded text-xs select-none p-1">
                {/* Line Form Bar */}
                <div className="bg-slate-100 border-b border-slate-300 p-2 m-1.5 mb-0 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-1.5 font-sans">
                    <div className="flex-1 min-w-[150px] relative">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Article (↑↓ Entrée)</label>
                      <input
                        ref={purchaseSearchRef}
                        type="text"
                        value={purchaseForm.articleName && !purchaseSearch ? purchaseForm.articleName : purchaseSearch}
                        onChange={e => {
                          setPurchaseSearch(e.target.value);
                          setPurchaseSearchIdx(0);
                          if (purchaseForm.articleName && e.target.value !== purchaseForm.articleName) {
                            setPurchaseForm(prev => ({ ...prev, articleName: '', articleId: '' }));
                          }
                        }}
                        onKeyDown={purchaseArtKeyDown}
                        className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 text-slate-800"
                        placeholder="🔍 Saisir article à acheter..."
                      />
                      {purchaseSearch.length >= 1 && purchaseFiltered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                          {purchaseFiltered.map((a, idx) => (
                            <div
                              key={a.id}
                              onClick={() => purchaseSelectArticle(a.id)}
                              className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b border-slate-100 ${idx === purchaseSearchIdx ? 'bg-blue-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}
                            >
                              <span>[{familyLabel(a.family)}] {a.name}</span>
                              <span className={`font-mono ${idx === purchaseSearchIdx ? 'text-white' : 'text-slate-500'}`}>Stock Actuel Central: {a.stockCentral}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Famille</label>
                      <input
                        readOnly
                        value={familyLabel(purchaseForm.family as any) || ''}
                        className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-600 truncate font-sans"
                      />
                    </div>

                    <div className="w-20">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quantité</label>
                      <input
                        id="purchase-qty-input"
                        type="number"
                        min={1}
                        value={purchaseForm.quantity}
                        onChange={e => setPurchaseForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); purchaseSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>

                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">P. Achat Unitaire</label>
                      <input
                        type="number"
                        min={0}
                        value={purchaseForm.purchasePrice}
                        onChange={e => setPurchaseForm(prev => ({ ...prev, purchasePrice: parseInt(e.target.value) || 0 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); purchaseSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>

                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Date Péremption</label>
                      <input
                        type="date"
                        value={purchaseForm.expiryDate}
                        onChange={e => setPurchaseForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); purchaseSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>

                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Montant Total</label>
                      <input
                        readOnly
                        value={formatAr(purchaseForm.quantity * purchaseForm.purchasePrice)}
                        className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono font-bold text-slate-700"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-1.5 mt-2">
                    <button
                      onClick={purchaseNew}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 transition cursor-pointer text-xs font-medium"
                    >
                      <Plus className="h-3.5 w-3.5 text-slate-500" /> Nouveau
                    </button>
                    <button
                      onClick={purchaseDeleteLine}
                      disabled={!purchaseSelLineId}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 disabled:opacity-40 transition cursor-pointer text-xs font-medium"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Supprimer
                    </button>
                    <button
                      onClick={purchaseSaveLine}
                      disabled={!purchaseForm.articleName}
                      className="flex items-center gap-1 px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white border border-sky-600 rounded shadow-sm font-semibold disabled:opacity-40 transition cursor-pointer text-xs"
                    >
                      <Save className="h-3.5 w-3.5" /> Enregistrer
                    </button>
                  </div>
                </div>

                {/* Grid Table of Purchase Lines */}
                <div className="bg-white mx-1.5 mb-1.5 border-t border-slate-300 overflow-x-auto rounded-b max-h-[220px] overflow-y-auto">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
                      <tr className="divide-x divide-slate-200">
                        <th className="p-1 font-normal w-24">Famille</th>
                        <th className="p-1 font-normal min-w-[150px]">Article</th>
                        <th className="p-1 font-normal text-right w-16">Qté</th>
                        <th className="p-1 font-normal text-right w-24">P. Achat</th>
                        <th className="p-1 font-normal text-center w-24">Péremption</th>
                        <th className="p-1 font-normal text-right w-28">Montant</th>
                        <th className="p-1 font-normal w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-mono">
                      {purchaseLines.map(l => {
                        const isSel = l.id === purchaseSelLineId;
                        return (
                          <tr 
                            key={l.id} 
                            onClick={() => {
                              setPurchaseSelLineId(l.id);
                              setPurchaseForm({ ...l });
                              setPurchaseIsNew(false);
                            }} 
                            className={`cursor-pointer divide-x divide-slate-200 transition-colors ${isSel ? 'bg-blue-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}
                          >
                            <td className="p-1 font-sans"><span className={`px-1 rounded text-[10px] ${isSel ? 'bg-blue-600 text-white font-medium' : 'bg-slate-200 text-slate-700'}`}>{familyLabel(l.family)}</span></td>
                            <td className="p-1 font-sans">{l.articleName}</td>
                            <td className="p-1 text-right">{l.quantity}</td>
                            <td className="p-1 text-right">{l.purchasePrice.toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-center">{l.expiryDate ? new Date(l.expiryDate).toLocaleDateString('fr-FR') : '—'}</td>
                            <td className="p-1 text-right font-bold">{l.amount.toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-center">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPurchaseLines(purchaseLines.filter(x => x.id !== l.id));
                                  if (purchaseSelLineId === l.id) {
                                    purchaseNew();
                                  }
                                }} 
                                className={`cursor-pointer ${isSel ? 'text-white hover:text-red-200' : 'text-rose-600 hover:text-rose-800'}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {purchaseLines.length === 0 && (
                        <tr><td colSpan={7} className="p-4 text-center text-slate-400 font-sans">Aucun article dans ce bon d'achat. Saisissez un article ci-dessus.</td></tr>
                      )}
                    </tbody>
                    {purchaseLines.length > 0 && (
                      <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 text-slate-800 font-sans font-bold">
                        <tr>
                          <td colSpan={5} className="p-1.5 text-right text-xs">TOTAL DE L'ACHAT :</td>
                          <td colSpan={2} className="p-1.5 text-right font-mono text-lg text-emerald-700">
                            {formatAr(purchaseLines.reduce((s, l) => s + l.amount, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Validate Purchase action */}
              <div className="flex gap-2 justify-end">
                {purchaseLines.length > 0 && (
                  <button 
                    onClick={() => {
                      if (confirm('Voulez-vous vider tout le bon de commande ?')) {
                        setPurchaseLines([]);
                        purchaseNew();
                      }
                    }} 
                    className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-sm font-medium cursor-pointer transition"
                  >
                    Vider le document
                  </button>
                )}
                <button
                  onClick={validatePurchase}
                  disabled={purchaseLines.length === 0 || !supplier.trim() || !invoiceRef.trim()}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-40 cursor-pointer flex items-center gap-2 shadow transition"
                >
                  <Check className="w-4 h-4" /> Valider cet Achat / Réception
                </button>
              </div>

              {/* Purchase History */}
              <div className="border-t pt-4">
                <h5 className="font-bold text-sm text-slate-700 mb-2">📜 Historique des 10 dernières entrées d'achats :</h5>
                {state.stockEntries.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="p-2">Date</th>
                          <th className="p-2">Article</th>
                          <th className="p-2 text-center">Qté</th>
                          <th className="p-2 text-right">P. Achat</th>
                          <th className="p-2">Fournisseur</th>
                          <th className="p-2">Réf BL / Facture</th>
                          <th className="p-2">Péremption</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.stockEntries.slice(-10).reverse().map((e) => (
                          <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-2 text-slate-500">{new Date(e.date).toLocaleDateString('fr-FR')} {new Date(e.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="p-2 font-medium">{e.articleName}</td>
                            <td className="p-2 text-center font-mono font-bold text-slate-800">{e.quantity}</td>
                            <td className="p-2 text-right font-mono font-bold text-blue-600">{formatAr(e.purchasePrice)}</td>
                            <td className="p-2">{e.supplier}</td>
                            <td className="p-2 font-mono text-xs">{e.invoiceRef}</td>
                            <td className="p-2 text-center">{e.expiryDate ? new Date(e.expiryDate).toLocaleDateString('fr-FR') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 border border-dashed rounded-lg">Aucun achat enregistré pour l'instant.</div>
                )}
              </div>
            </div>
          )}

          {tab === 'requests' && <div>
            {pendingRequests.length === 0 ? <div className="text-center py-12 text-slate-400"><PackageCheck className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Aucune demande</p></div>
              : pendingRequests.map((tr) => {
                const art = state.articles.find((a) => a.id === tr.articleId);
                return (<div key={tr.id} className="border rounded-lg p-4 mb-3 flex items-center justify-between">
                  <div><div className="font-semibold">{tr.articleName} × {tr.quantity}</div><div className="text-xs text-slate-500">Demandé: {new Date(tr.requestedAt||'').toLocaleDateString('fr-FR')}</div><div className="text-xs">Stock central: <strong className={art && art.stockCentral >= tr.quantity ? 'text-green-600' : 'text-red-600'}>{art?.stockCentral || 0}</strong></div></div>
                  <button onClick={() => transferToPharmacy(tr.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer flex items-center gap-2" disabled={!art || art.stockCentral < tr.quantity}><Truck className="w-4 h-4" /> Transférer</button>
                </div>);
              })}
          </div>}
        </div>
      </div>
    </div>
  );
}
