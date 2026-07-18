import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState } from '../store';
import type { TransferCategory, StockTransfer } from '../types';
import { addAuditLog, addNotification, formatAr, familyLabel, transferCategoryLabel, transferCategoryColor, addJourneyEvent } from '../store';
import { printDeliveryTicket } from '../utils/printTicket';
import DemandeAchatForm, { type ReqLine } from './DemandeAchatForm';
import {
  Pill, Package, CheckCircle, AlertTriangle, Clock, Search, PackageCheck, Send,
  Plus, Trash2, FileText, Filter, Printer, Edit3
} from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type Tab = 'pending' | 'stock' | 'delivered' | 'request' | 'history';

const CATEGORIES: TransferCategory[] = ['approvisionnement', 'hospitalisation', 'bloc', 'central'];

export default function PharmacyModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('pending');
  const [searchStock, setSearchStock] = useState('');
  const [filterCat, setFilterCat] = useState<TransferCategory | 'all'>('all');

  // Reappro Modal State
  const [reapproModalOpen, setReapproModalOpen] = useState(false);
  const [reapproEditingId, setReapproEditingId] = useState<string | null>(null);
  const [reapproEditingLine, setReapproEditingLine] = useState<ReqLine | null>(null);
  const [reapproEditingNotes, setReapproEditingNotes] = useState('');
  const [reapproEditingCategory, setReapproEditingCategory] = useState<TransferCategory | undefined>(undefined);

  const openReapproNew = () => {
    setReapproEditingId(null);
    setReapproEditingLine(null);
    setReapproEditingNotes('');
    setReapproEditingCategory('approvisionnement');
    setReapproModalOpen(true);
  };

  const openReapproEdit = (transferId: string) => {
    const tr = state.stockTransfers.find((t) => t.id === transferId);
    if (!tr) return;
    if (tr.status !== 'requested') { alert('Impossible de modifier une demande déjà traitée.'); return; }
    const a = state.articles.find((x) => x.id === tr.articleId);
    const line: ReqLine = {
      id: uuidv4(),
      articleId: tr.articleId,
      articleName: tr.articleName,
      family: a?.family || 'MEDIC',
      quantity: tr.quantity,
      purchasePrice: tr.purchasePrice || a?.purchasePrice || 0,
      expiryDate: tr.expiryDate || a?.expiryDate || '',
      notes: tr.notes || '',
      amount: tr.quantity * (tr.purchasePrice || a?.purchasePrice || 0),
    };
    setReapproEditingId(tr.id);
    setReapproEditingLine(line);
    setReapproEditingNotes(tr.notes || '');
    setReapproEditingCategory(tr.category);
    setReapproModalOpen(true);
  };

  const closeReappro = () => {
    setReapproModalOpen(false);
    setReapproEditingId(null);
    setReapproEditingLine(null);
    setReapproEditingNotes('');
    setReapproEditingCategory(undefined);
  };

  const submitReappro = (payload: { lines: ReqLine[]; category: TransferCategory; supplier: string; invoiceRef: string; notes: string; }) => {
    if (reapproEditingId) {
      const first = payload.lines[0];
      setState((prev) => {
        const next = {
          ...prev,
          stockTransfers: prev.stockTransfers.map((t) =>
            t.id === reapproEditingId
              ? {
                  ...t,
                  articleId: first.articleId,
                  articleName: first.articleName,
                  quantity: first.quantity,
                  category: payload.category,
                  notes: payload.notes || first.notes,
                  purchasePrice: first.purchasePrice,
                  expiryDate: first.expiryDate,
                  supplier: payload.supplier || t.supplier,
                  invoiceRef: payload.invoiceRef || t.invoiceRef,
                }
              : t
          ),
        };
        addAuditLog(next, 'DEMANDE_REAPPRO_MODIF', `[Pharma] Demande modifiée: ${first.articleName} (${first.quantity})`);
        return next;
      });
      closeReappro();
      return;
    }

    setState((prev) => {
      const newTransfers: StockTransfer[] = payload.lines.map((l) => ({
        id: uuidv4(),
        articleId: l.articleId,
        articleName: l.articleName,
        quantity: l.quantity,
        category: payload.category,
        purchasePrice: l.purchasePrice,
        expiryDate: l.expiryDate,
        supplier: payload.supplier,
        invoiceRef: payload.invoiceRef,
        requestedBy: prev.currentUser?.id,
        requestedAt: new Date().toISOString(),
        status: 'requested',
        notes: payload.notes || l.notes,
      }));
      const next = { ...prev, stockTransfers: [...prev.stockTransfers, ...newTransfers] };
      addAuditLog(next, 'DEMANDE_REAPPRO_PHARMA', `${payload.lines.length} article(s) — ${transferCategoryLabel(payload.category)} (Fournisseur: ${payload.supplier})`);
      addNotification(next, 'magasinier', `📩 [Pharmacie] Réappro: ${payload.lines.length} article(s) demandé(s)`, 'info');
      return next;
    });

    closeReappro();
  };

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

  // Requests list
  const myRequests = state.stockTransfers;
  const myRequestsFiltered = myRequests.filter((t) => filterCat === 'all' || t.category === filterCat);

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
      if (consultation.patientId) addJourneyEvent(next, { patientId: consultation.patientId, department: 'pharmacie', action: 'Médicaments délivrés', status: 'medications_delivered', details: consultation.prescriptions.map((p) => `${p.articleName} ×${p.quantity}`).join(', '), actorName: state.currentUser?.name });
      updatedArticles.forEach((a) => { if (a.stockPharmacie <= 0) addNotification(next, 'pharmacy', `🚨 ${a.name} en rupture (pharmacie)`, 'critical');
        else if (a.stockPharmacie <= a.minStockPharmacie) addNotification(next, 'pharmacy', `⚠️ Stock bas pharmacie: ${a.name} (${a.stockPharmacie})`, 'warning'); });
      return next;
    });
    // Imprime le bon de délivrance
    if (patient) {
      printDeliveryTicket(
        state.ticketSettings,
        patient,
        new Date(),
        consultation.prescriptions.filter((p) => !p.delivered).map((p) => ({ name: p.articleName, quantity: p.quantity, posology: p.posology })),
        state.currentUser?.name,
      );
    }
  };

  const printDelivery = (consultationId: string, isExternal?: boolean) => {
    const c = state.consultations.find((x) => x.id === consultationId);
    if (!c) return;
    const patient = isExternal ? null : state.patients.find((p) => p.id === c.patientId);
    if (!patient) return;
    printDeliveryTicket(
      state.ticketSettings,
      patient,
      new Date(c.date),
      c.prescriptions.filter((p) => !p.delivered).map((p) => ({ name: p.articleName, quantity: p.quantity, posology: p.posology })),
      state.currentUser?.name,
    );
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
                <div className="flex gap-1">
                  {patient && <button onClick={() => printDelivery(c.id, !!ext)} className="px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 font-medium text-sm flex items-center gap-1 cursor-pointer" title="Imprimer le bon de délivrance"><Printer className="w-4 h-4" /></button>}
                  <button onClick={() => deliver(c.id, !!ext)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm flex items-center gap-2 cursor-pointer"><CheckCircle className="w-4 h-4" /> Délivrer</button>
                </div>
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

          {/* === DEMANDER RÉAPPRO — Formulaire intégré style Sage Commercial === */}
          {tab === 'request' && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h4 className="font-bold text-purple-800 flex items-center gap-2">
                    <Send className="w-5 h-5 text-purple-600" /> Demander un réapprovisionnement au magasinier (Saisie Sage)
                  </h4>
                  <p className="text-xs text-purple-700 mt-1">Créez ou modifiez des demandes de réapprovisionnement pour la pharmacie avec saisie d'articles Sage Commercial.</p>
                </div>
                <button
                  onClick={openReapproNew}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer shadow transition"
                >
                  <Plus className="w-4 h-4" /> Nouveau réapprovisionnement
                </button>
              </div>

              {/* Liste des demandes en cours avec bouton Modifier */}
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-600">Demandes en cours :</span>
                  <button onClick={() => setFilterCat('all')} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filterCat === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Toutes</button>
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setFilterCat(c)} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filterCat === c ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{transferCategoryLabel(c)}</button>
                  ))}
                </div>

                {state.stockTransfers.filter(t => t.status === 'requested' && (filterCat === 'all' || t.category === filterCat)).length === 0 ? (
                  <div className="text-center py-8 text-slate-400 bg-slate-50 border border-dashed rounded-lg text-sm">
                    Aucune demande en cours. Cliquez sur <strong>Nouveau réapprovisionnement</strong> ci-dessus pour créer une demande.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b text-xs text-slate-600">
                        <tr>
                          <th className="p-2 text-left">Catégorie</th>
                          <th className="p-2 text-left">Article</th>
                          <th className="p-2 text-center">Qté</th>
                          <th className="p-2 text-left">Fournisseur</th>
                          <th className="p-2 text-left">N° BL</th>
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
                              <td className="p-2 text-xs">{tr.supplier || '—'}</td>
                              <td className="p-2 text-xs font-mono">{tr.invoiceRef || '—'}</td>
                              <td className="p-2 text-xs">{u?.name || '—'}</td>
                              <td className="p-2 text-xs text-slate-500">{tr.requestedAt ? new Date(tr.requestedAt).toLocaleDateString('fr-FR') : '—'}</td>
                              <td className="p-2 text-xs text-slate-500 truncate max-w-[150px]">{tr.notes || '—'}</td>
                              <td className="p-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => openReapproEdit(tr.id)} className="px-2 py-1 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded text-xs flex items-center gap-1 cursor-pointer font-medium">
                                    <Edit3 className="w-3 h-3" /> Modifier
                                  </button>
                                  <button onClick={() => cancelRequest(tr.id)} className="px-2 py-1 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded text-xs cursor-pointer font-medium">
                                    <Trash2 className="w-3 h-3" /> Annuler
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
              <div className="flex items-center gap-2 mb-3 flex-wrap">
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
                      <th className="p-2 text-center">Qté</th><th className="p-2 text-left">Fournisseur</th><th className="p-2 text-left">N° BL</th><th className="p-2 text-left">Demandeur</th><th className="p-2 text-center">Statut</th>
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
                          <td className="p-2 text-xs">{tr.supplier || '—'}</td>
                          <td className="p-2 text-xs font-mono">{tr.invoiceRef || '—'}</td>
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
                      <tr><td colSpan={8} className="p-6 text-center text-slate-400">Aucune demande.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === MODAL : Formulaire Sage de demande de réappro pour Pharmacie === */}
      <DemandeAchatForm
        open={reapproModalOpen}
        onClose={closeReappro}
        articles={state.articles}
        defaultCategory="approvisionnement"
        initialLine={reapproEditingLine}
        initialNotes={reapproEditingNotes}
        initialCategory={reapproEditingCategory}
        isEditMode={!!reapproEditingId}
        onSubmit={submitReappro}
        theme="purple"
      />
    </div>
  );
}
