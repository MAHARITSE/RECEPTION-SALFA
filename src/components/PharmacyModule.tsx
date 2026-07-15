import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState } from '../store';
import type { StockTransfer } from '../types';
import { addAuditLog, addNotification, formatAr, ARTICLE_FAMILIES, familyLabel } from '../store';
import { Pill, Package, CheckCircle, AlertTriangle, Clock, Search, PackageCheck, Send } from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type Tab = 'pending' | 'stock' | 'delivered' | 'request';

export default function PharmacyModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('pending');
  const [searchStock, setSearchStock] = useState('');
  const [reqForm, setReqForm] = useState({ family: 'MEDIC', articleId: '', quantity: 10, notes: '' });

  const paidConsultations = state.consultations.filter((c) => {
    const inv = state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid' && !i.isExternal);
    const hasUndelivered = c.prescriptions.some((p) => !p.delivered);
    return inv && hasUndelivered;
  });
  const emergencyConsults = state.consultations.filter((c) => c.isEmergency && c.prescriptions.some((p) => !p.delivered) && !state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid'));

  const externalInvoices = state.invoices.filter((i) => i.isExternal && i.status === 'paid');
  const allPending = [...paidConsultations, ...emergencyConsults];

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

  const reqArticles = state.articles.filter((a) => a.family === reqForm.family);
  const sendRequest = () => {
    const art = state.articles.find((a) => a.id === reqForm.articleId);
    if (!art) return;
    setState((prev) => {
      const tr: StockTransfer = { id: uuidv4(), articleId: art.id, articleName: art.name, quantity: reqForm.quantity,
        requestedBy: prev.currentUser?.id, requestedAt: new Date().toISOString(), status: 'requested', notes: reqForm.notes };
      const next = { ...prev, stockTransfers: [...prev.stockTransfers, tr] };
      addNotification(next, 'magasinier', `📩 Demande réappro: ${art.name} (${reqForm.quantity})`, 'info');
      return next;
    });
    setReqForm({ family: 'MEDIC', articleId: '', quantity: 10, notes: '' });
  };

  const lowStock = state.articles.filter((a) => a.stockPharmacie <= a.minStockPharmacie).length;
  const filtered = state.articles.filter((a) => a.name.toLowerCase().includes(searchStock.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"><div className="flex items-center gap-3"><div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div><div><div className="text-2xl font-bold">{allPending.length}</div><div className="text-sm text-slate-500">À délivrer</div></div></div></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"><div className="flex items-center gap-3"><div className="p-2 bg-green-100 rounded-lg"><PackageCheck className="w-5 h-5 text-green-600" /></div><div><div className="text-2xl font-bold">{state.consultations.filter((c) => c.prescriptions.length > 0 && c.prescriptions.every((p) => p.delivered)).length}</div><div className="text-sm text-slate-500">Délivrées</div></div></div></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"><div className="flex items-center gap-3"><div className="p-2 bg-purple-100 rounded-lg"><Package className="w-5 h-5 text-purple-600" /></div><div><div className="text-2xl font-bold">{state.articles.length}</div><div className="text-sm text-slate-500">Articles</div></div></div></div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"><div className={`flex items-center gap-3 ${lowStock > 0 ? 'bg-red-100' : 'bg-green-100'} rounded-lg p-2`}><AlertTriangle className={`w-5 h-5 ${lowStock > 0 ? 'text-red-600' : 'text-green-600'}`} /><div><div className="text-2xl font-bold">{lowStock}</div><div className="text-sm text-slate-500">Alertes stock</div></div></div></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {[
            { key: 'pending' as Tab, icon: <Clock className="w-4 h-4" />, label: `Ordonnances (${allPending.length})` },
            { key: 'stock' as Tab, icon: <Package className="w-4 h-4" />, label: 'Stock pharmacie' },
            { key: 'request' as Tab, icon: <Send className="w-4 h-4" />, label: 'Demander réappro' },
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

          {tab === 'request' && <div className="max-w-lg mx-auto space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">📩 Demander un réapprovisionnement au magasinier</div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Famille</label>
              <select value={reqForm.family} onChange={(e) => setReqForm({ ...reqForm, family: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer">{ARTICLE_FAMILIES.map((f) => (<option key={f} value={f}>{familyLabel(f)}</option>))}</select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Article</label>
              <select value={reqForm.articleId} onChange={(e) => setReqForm({ ...reqForm, articleId: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer"><option value="">— Choisir —</option>{reqArticles.map((a) => (<option key={a.id} value={a.id}>{a.name} (Stock: {a.stockPharmacie})</option>))}</select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Quantité</label><input type="number" min={1} value={reqForm.quantity} onChange={(e) => setReqForm({ ...reqForm, quantity: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Notes</label><input type="text" value={reqForm.notes} onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none" placeholder="Motif..." /></div>
            <button onClick={sendRequest} disabled={!reqForm.articleId} className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 font-medium flex items-center justify-center gap-2 cursor-pointer"><Send className="w-4 h-4" /> Envoyer la demande</button>
          </div>}
        </div>
      </div>
    </div>
  );
}
