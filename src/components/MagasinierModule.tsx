import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { StockEntry } from '../types';
import type { AppState } from '../store';
import { addAuditLog, addNotification, formatAr, ARTICLE_FAMILIES, familyLabel } from '../store';
import { Package, PackageCheck, PackagePlus, Search, Truck } from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type Tab = 'stock' | 'entries' | 'requests';

export default function MagasinierModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('stock');
  const [searchStock, setSearchStock] = useState('');
  const [entryForm, setEntryForm] = useState({ family: 'MEDIC', articleId: '', quantity: 0, supplier: '', invoiceRef: '', unitPrice: 0, expiryDate: '' });

  const filteredArticles = state.articles.filter((a) => {
    const q = searchStock.toLowerCase();
    return a.name.toLowerCase().includes(q) || familyLabel(a.family).toLowerCase().includes(q);
  });
  const pendingRequests = state.stockTransfers.filter((t) => t.status === 'requested');
  const familyArticles = state.articles.filter((a) => a.family === entryForm.family);

  const registerEntry = () => {
    if (!entryForm.articleId || entryForm.quantity <= 0) { alert('Article et quantité requis'); return; }
    const art = state.articles.find((a) => a.id === entryForm.articleId);
    const entry: StockEntry = { id: uuidv4(), articleId: entryForm.articleId, articleName: art?.name || '', quantity: entryForm.quantity,
      purchasePrice: entryForm.unitPrice, supplier: entryForm.supplier, invoiceRef: entryForm.invoiceRef,
      expiryDate: entryForm.expiryDate || undefined, date: new Date().toISOString(), enteredBy: state.currentUser?.id || '' };
    setState((prev) => {
      const next = { ...prev,
        articles: prev.articles.map((a) => a.id === entryForm.articleId ? { ...a, stockCentral: a.stockCentral + entryForm.quantity, purchasePrice: entryForm.unitPrice || a.purchasePrice, expiryDate: entryForm.expiryDate || a.expiryDate, supplier: entryForm.supplier || a.supplier } : a),
        stockEntries: [...prev.stockEntries, entry] };
      addAuditLog(next, 'ENTREE_STOCK', `${entryForm.quantity} × ${art?.name} — Fournisseur: ${entryForm.supplier}`);
      return next;
    });
    setEntryForm({ family: 'MEDIC', articleId: '', quantity: 0, supplier: '', invoiceRef: '', unitPrice: 0, expiryDate: '' });
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

          {tab === 'entries' && <div className="max-w-xl mx-auto space-y-3">
            <h4 className="font-bold flex items-center gap-2"><PackagePlus className="w-5 h-5 text-blue-500" /> Nouvelle entrée (achat)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium mb-1">Famille</label><select value={entryForm.family} onChange={(e) => setEntryForm({...entryForm,family:e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none cursor-pointer">{ARTICLE_FAMILIES.map((f) => (<option key={f} value={f}>{familyLabel(f)}</option>))}</select></div>
              <div><label className="block text-xs font-medium mb-1">Article</label><select value={entryForm.articleId} onChange={(e) => setEntryForm({...entryForm,articleId:e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none cursor-pointer"><option value="">—</option>{familyArticles.map((a) => (<option key={a.id} value={a.id}>{a.name} (Stock: {a.stockCentral})</option>))}</select></div>
              <div><label className="block text-xs font-medium mb-1">Quantité</label><input type="number" min={1} value={entryForm.quantity || ''} onChange={(e) => setEntryForm({...entryForm,quantity:parseInt(e.target.value)||0})} className="w-full px-3 py-2 border rounded-lg outline-none" /></div>
              <div><label className="block text-xs font-medium mb-1">Prix achat unitaire (Ar)</label><input type="number" min={0} value={entryForm.unitPrice || ''} onChange={(e) => setEntryForm({...entryForm,unitPrice:parseInt(e.target.value)||0})} className="w-full px-3 py-2 border rounded-lg outline-none" /></div>
              <div><label className="block text-xs font-medium mb-1">Fournisseur</label><input type="text" value={entryForm.supplier} onChange={(e) => setEntryForm({...entryForm,supplier:e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none" /></div>
              <div><label className="block text-xs font-medium mb-1">N° BL / Facture</label><input type="text" value={entryForm.invoiceRef} onChange={(e) => setEntryForm({...entryForm,invoiceRef:e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none" /></div>
              <div className="col-span-2"><label className="block text-xs font-medium mb-1">📅 Date de péremption</label><input type="date" value={entryForm.expiryDate} onChange={(e) => setEntryForm({...entryForm,expiryDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none" /></div>
            </div>
            <button onClick={registerEntry} disabled={!entryForm.articleId || entryForm.quantity <= 0} className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"><PackagePlus className="w-4 h-4" /> Enregistrer</button>
            {state.stockEntries.length > 0 && <div className="border rounded-lg overflow-hidden mt-4"><table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Article</th><th className="p-2 text-center">Qté</th><th className="p-2 text-right">P.A.</th><th className="p-2">Fournisseur</th><th className="p-2">Péremption</th></tr></thead><tbody>{state.stockEntries.slice(0,10).map((e) => (<tr key={e.id} className="border-b border-slate-100"><td className="p-2">{new Date(e.date).toLocaleDateString('fr-FR')}</td><td className="p-2 font-medium">{e.articleName}</td><td className="p-2 text-center">{e.quantity}</td><td className="p-2 text-right font-mono">{formatAr(e.purchasePrice)}</td><td className="p-2">{e.supplier}</td><td className="p-2">{e.expiryDate ? new Date(e.expiryDate).toLocaleDateString('fr-FR') : '—'}</td></tr>))}</tbody></table></div>}
          </div>}

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
