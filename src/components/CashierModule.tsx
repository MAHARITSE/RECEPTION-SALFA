import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Invoice, InvoiceItem } from '../types';
import type { AppState } from '../store';
import { addAuditLog, addNotification, formatAr, getPrice } from '../store';
import { CreditCard, CheckCircle, DollarSign, Clock, ShoppingCart, Trash2, Lock, Printer, Building2, Heart, Save } from 'lucide-react';

interface HbLine { id: string; articleName: string; quantity: number; unitPrice: number; discount: number; }
interface HbRecord { id: string; patientName: string; type: 'hospit' | 'bloc'; lines: HbLine[]; payments: { amount: number; paidBy: string; date: string }[]; }

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type Tab = 'payment' | 'external' | 'hospit' | 'bloc' | 'closing';

export default function CashierModule({ state, setState }: Props) {
  const [selConsultId, setSelConsultId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('payment');
  const [printTicket, setPrintTicket] = useState<string | null>(null);

  // External sale — Sage style
  const [extSearch, setExtSearch] = useState('');
  const [extSearchIdx, setExtSearchIdx] = useState(0);
  const [extLines, setExtLines] = useState<HbLine[]>([]);
  const [extSelLineId, setExtSelLineId] = useState<string | null>(null);
  const [extLineForm, setExtLineForm] = useState<HbLine>({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0 });
  const [extIsNew, setExtIsNew] = useState(false);
  const extSearchRef = useRef<HTMLInputElement>(null);

  // Hospit/Bloc
  const [hbRecords, setHbRecords] = useState<HbRecord[]>([]);
  const [hbPatientName, setHbPatientName] = useState('');
  const [hbPayAmount, setHbPayAmount] = useState(0);
  const [hbSearch, setHbSearch] = useState('');
  const [hbSearchIdx, setHbSearchIdx] = useState(0);
  const [hbLineForm, setHbLineForm] = useState<HbLine>({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0 });
  const [hbSelRecordId, setHbSelRecordId] = useState<string | null>(null);
  const hbSearchRef = useRef<HTMLInputElement>(null);

  // Patients waiting for payment (from doctor consultations)
  const pendingPatients = state.patients.filter(p => p.status === 'consulted_awaiting_payment');
  // Patients requesting hospitalization
  const hospitRequests = state.consultations.filter(c => {
    const pat = state.patients.find(p => p.id === c.patientId);
    return c.hospitalizeRequested && pat && !hbRecords.some(h => h.patientName === `${pat.lastName} ${pat.firstName}` && h.type === 'hospit');
  });
  const blocRequests = state.consultations.filter(c => {
    const pat = state.patients.find(p => p.id === c.patientId);
    return c.surgeryRequested && pat && !hbRecords.some(h => h.patientName === `${pat.lastName} ${pat.firstName}` && h.type === 'bloc');
  });

  const getConsults = (pid: string) => state.consultations.filter(c => c.patientId === pid && !state.invoices.some(inv => inv.consultationId === c.id && inv.status === 'paid'));
  const selConsult = state.consultations.find(c => c.id === selConsultId);
  const selPatient = selConsult ? state.patients.find(p => p.id === selConsult.patientId) : null;

  const calcItems = (): InvoiceItem[] => {
    if (!selConsult) return [];
    return selConsult.prescriptions.map(p => ({
      description: `${p.articleName} × ${p.quantity}${p.discount > 0 ? ` (-${p.discount}%)` : ''}`,
      amount: Math.round(p.unitPrice * p.quantity * (1 - p.discount / 100)), category: 'pharmacy' as const,
    }));
  };
  const items = calcItems();
  const totalAmount = items.reduce((s, it) => s + it.amount, 0);

  const handlePayment = () => {
    if (!selConsult || !selPatient) return;
    const inv: Invoice = { id: uuidv4(), patientId: selConsult.patientId, consultationId: selConsult.id, clientType: selPatient.clientType, items, totalAmount, patientCharge: totalAmount, status: 'paid', paidAt: new Date().toISOString(), paidBy: state.currentUser?.id || '', createdAt: new Date().toISOString(), isExternal: false };
    setState(prev => {
      const next = { ...prev, invoices: [...prev.invoices, inv], patients: prev.patients.map(p => p.id === selConsult.patientId ? { ...p, status: 'invoice_paid' as const } : p) };
      addAuditLog(next, 'PAIEMENT', `${formatAr(totalAmount)} — ${selPatient.lastName}`, selConsult.patientId);
      if (selConsult.prescriptions.length > 0) addNotification(next, 'pharmacy', `💊 ${selPatient.lastName} ${selPatient.firstName}`, 'info');
      return next;
    });
    setPrintTicket(`🧾 TICKET CAISSE\n${new Date().toLocaleString('fr-FR')}\n${state.currentUser?.name}\n${'─'.repeat(32)}\n${selPatient.lastName} ${selPatient.firstName}\n${'─'.repeat(32)}\n${items.map(i => `${i.description}\n  ${formatAr(i.amount)}`).join('\n')}\n${'─'.repeat(32)}\nTOTAL: ${formatAr(totalAmount)}`);
    setSelConsultId(null);
  };

  // === EXTERNAL SALE - Sage style ===
  const extFiltered = extSearch.length >= 1 ? state.articles.filter(a => a.name.toLowerCase().includes(extSearch.toLowerCase())) : [];
  const extLineAmt = (l: HbLine) => Math.round(l.unitPrice * l.quantity * (1 - l.discount / 100));
  const extTotal = extLines.reduce((s, l) => s + extLineAmt(l), 0);

  const extSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    const nl: HbLine = { id: uuidv4(), articleName: a.name, quantity: 1, unitPrice: getPrice(a, 'externe'), discount: 0 };
    setExtLineForm({ ...nl }); setExtSelLineId(nl.id); setExtIsNew(true); setExtSearch('');
  };
  const extSaveLine = () => {
    if (!extLineForm.articleName) return;
    if (extIsNew || !extLines.find(l => l.id === extLineForm.id)) setExtLines([...extLines, { ...extLineForm }]);
    else setExtLines(extLines.map(l => l.id === extLineForm.id ? { ...extLineForm } : l));
    setExtIsNew(false); setTimeout(() => extSearchRef.current?.focus(), 50);
  };
  const extDeleteLine = () => { if (!extSelLineId) return; setExtLines(extLines.filter(l => l.id !== extSelLineId)); setExtSelLineId(null); };
  const extPay = () => {
    if (extLines.length === 0) return;
    const inv: Invoice = { id: uuidv4(), clientName: 'Client Externe', clientType: 'externe', items: extLines.map(l => ({ description: `${l.articleName} × ${l.quantity}`, amount: extLineAmt(l), category: 'pharmacy' as const })), totalAmount: extTotal, patientCharge: extTotal, status: 'paid', paidAt: new Date().toISOString(), paidBy: state.currentUser?.id || '', createdAt: new Date().toISOString(), isExternal: true };
    setState(prev => { const next = { ...prev, invoices: [...prev.invoices, inv] }; addAuditLog(next, 'VENTE_EXTERNE', `Client Externe — ${formatAr(extTotal)}`); addNotification(next, 'pharmacy', `🛒 Client Externe — ${formatAr(extTotal)}`, 'info'); return next; });
    setPrintTicket(`🧾 VENTE EXTERNE\n${new Date().toLocaleString('fr-FR')}\n${state.currentUser?.name}\n${'─'.repeat(32)}\n${extLines.map(l => `${l.articleName} × ${l.quantity}\n  ${formatAr(extLineAmt(l))}`).join('\n')}\n${'─'.repeat(32)}\nTOTAL: ${formatAr(extTotal)}`);
    setExtLines([]); setExtSearch('');
  };
  const extKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setExtSearchIdx(i => Math.min(i + 1, extFiltered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setExtSearchIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && extFiltered.length > 0) { e.preventDefault(); extSelectArticle(extFiltered[extSearchIdx].id); }
    else if (e.key === 'Escape') setExtSearch('');
  };

  // === HOSPIT/BLOC - article-by-article ===
  const hbFiltered = hbSearch.length >= 1 ? state.articles.filter(a => a.name.toLowerCase().includes(hbSearch.toLowerCase())) : [];
  const hbLineAmt = (l: HbLine) => Math.round(l.unitPrice * l.quantity * (1 - l.discount / 100));
  const hbSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    setHbLineForm({ id: uuidv4(), articleName: a.name, quantity: 1, unitPrice: getPrice(a, 'comptoir'), discount: 0 });
    setHbSearch('');
  };
  const hbAddLineToRecord = () => {
    if (!hbSelRecordId || !hbLineForm.articleName) return;
    setHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, lines: [...r.lines, { ...hbLineForm }] } : r));
    setHbLineForm({ id: uuidv4(), articleName: '', quantity: 1, unitPrice: 0, discount: 0 });
    setTimeout(() => hbSearchRef.current?.focus(), 50);
  };
  const hbRemoveLine = (recordId: string, lineId: string) => {
    setHbRecords(hbRecords.map(r => r.id === recordId ? { ...r, lines: r.lines.filter(l => l.id !== lineId) } : r));
  };
  const addHbRecord = (type: 'hospit' | 'bloc', name?: string) => {
    if (!name && !hbPatientName) { alert('Nom patient requis'); return; }
    setHbRecords([...hbRecords, { id: uuidv4(), patientName: name || hbPatientName, type, lines: [], payments: [] }]);
    setHbPatientName('');
  };
  const addPartialPay = (recordId: string) => {
    if (hbPayAmount <= 0) return;
    setHbRecords(hbRecords.map(r => r.id === recordId ? { ...r, payments: [...r.payments, { amount: hbPayAmount, paidBy: state.currentUser?.name || '', date: new Date().toISOString() }] } : r));
    setHbPayAmount(0);
  };
  const hbKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHbSearchIdx(i => Math.min(i + 1, hbFiltered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHbSearchIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && hbFiltered.length > 0) { e.preventDefault(); hbSelectArticle(hbFiltered[hbSearchIdx].id); }
    else if (e.key === 'Escape') setHbSearch('');
  };

  // Auto-add hospitalization/bloc requests from doctors
  const autoAddRequests = () => {
    hospitRequests.forEach(c => { const pat = state.patients.find(p => p.id === c.patientId); if (pat && !hbRecords.some(h => h.patientName === `${pat.lastName} ${pat.firstName}` && h.type === 'hospit')) addHbRecord('hospit', `${pat.lastName} ${pat.firstName}`); });
    blocRequests.forEach(c => { const pat = state.patients.find(p => p.id === c.patientId); if (pat && !hbRecords.some(h => h.patientName === `${pat.lastName} ${pat.firstName}` && h.type === 'bloc')) addHbRecord('bloc', `${pat.lastName} ${pat.firstName}`); });
  };
  // Auto-add on tab switch
  const switchTab = (t: Tab) => { setTab(t); if (t === 'hospit' || t === 'bloc') autoAddRequests(); };

  // Stats
  const paidInvoices = state.invoices.filter(inv => inv.status === 'paid');
  const todayInvoices = paidInvoices.filter(inv => new Date(inv.paidAt || '').toDateString() === new Date().toDateString());
  const todayTotal = todayInvoices.reduce((s, inv) => s + inv.patientCharge, 0);
  const todayExtTotal = todayInvoices.filter(i => i.isExternal).reduce((s, i) => s + i.patientCharge, 0);
  const todayPartialTotal = hbRecords.reduce((s, h) => s + h.payments.filter(p => new Date(p.date).toDateString() === new Date().toDateString()).reduce((ss, p) => ss + p.amount, 0), 0);
  const grandTotal = todayTotal + todayPartialTotal;

  // Sage-style editor component
  const renderSageEditor = (
    search: string, setSearch: (v: string) => void, searchRef: React.RefObject<HTMLInputElement | null>,
    filtered: typeof state.articles, searchIdx: number, onKeyDown: (e: React.KeyboardEvent) => void,
    onSelect: (id: string) => void, lineForm: HbLine, setLineForm: (l: HbLine) => void,
    onSave: () => void, onDelete: () => void, lines: HbLine[], selId: string | null, setSelId: (id: string | null) => void,
    lineAmt: (l: HbLine) => number, total: number, showSaveBtn: boolean
  ) => (
    <div className="bg-[#f4f4f4] border border-slate-300 rounded">
      <div className="bg-slate-100 border-b border-slate-300 p-1.5 m-2 mb-0 rounded shadow-inner">
        <div className="flex flex-wrap items-end gap-1">
          <div className="flex-1 min-w-[140px] relative">
            <label className="block text-[9px] text-slate-500">Article (↑↓ Entrée)</label>
            <input ref={searchRef} type="text" value={lineForm.articleName && !search ? lineForm.articleName : search} onChange={e => { setSearch(e.target.value); setHbSearchIdx(0); setExtSearchIdx(0); }} onKeyDown={onKeyDown}
              className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-600" placeholder="🔍 Tapez le nom..." />
            {search.length >= 1 && filtered.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-xl z-30 max-h-36 overflow-y-auto">
                {filtered.map((a, idx) => (
                  <div key={a.id} onClick={() => onSelect(a.id)} className={`px-2 py-1 cursor-pointer text-xs flex justify-between border-b border-slate-100 ${idx === searchIdx ? 'bg-blue-100' : 'hover:bg-blue-50'}`}>
                    <span><span className="text-[9px] text-slate-400">[{a.family}]</span> {a.name}</span>
                    <span className="font-mono text-blue-600">{formatAr(a.priceComptoir)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="w-14"><label className="block text-[9px] text-slate-500">Qté</label><input type="number" min={1} value={lineForm.quantity} onChange={e => setLineForm({ ...lineForm, quantity: parseInt(e.target.value) || 1 })} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono outline-none" /></div>
          <div className="w-14"><label className="block text-[9px] text-slate-500">Rem%</label><input type="number" min={0} max={100} value={lineForm.discount} onChange={e => setLineForm({ ...lineForm, discount: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono outline-none" /></div>
          <div className="w-20"><label className="block text-[9px] text-slate-500">P.U.</label><input type="text" readOnly value={formatAr(lineForm.unitPrice)} className="w-full bg-slate-200 border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono" /></div>
          <div className="w-24"><label className="block text-[9px] text-slate-500">Montant</label><input type="text" readOnly value={formatAr(lineAmt(lineForm))} className="w-full bg-slate-200 border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono font-bold" /></div>
        </div>
        <div className="flex justify-end gap-1 mt-1">
          {showSaveBtn && <><button onClick={onDelete} disabled={!selId} className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[10px] disabled:opacity-40 cursor-pointer"><Trash2 className="h-3 w-3 text-rose-600 inline" /> Suppr.</button>
          <button onClick={onSave} disabled={!lineForm.articleName} className="px-2 py-0.5 bg-sky-500 text-white border border-sky-600 rounded text-[10px] font-medium disabled:opacity-40 cursor-pointer"><Save className="h-3 w-3 inline" /> Enreg.</button></>}
        </div>
      </div>
      <div className="bg-white mx-2 mb-2 border-t border-slate-300 overflow-x-auto rounded-b">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead className="bg-slate-50 border-b border-slate-300 text-slate-600"><tr className="divide-x divide-slate-200"><th className="p-1 min-w-[130px]">Article</th><th className="p-1 text-right w-12">Qté</th><th className="p-1 text-center w-12">Rem%</th><th className="p-1 text-right w-20">P.U.</th><th className="p-1 text-right w-24">Montant</th></tr></thead>
          <tbody className="divide-y font-mono">
            {lines.map(l => {
              const isSel = l.id === selId;
              return (<tr key={l.id} onClick={() => { setSelId(l.id); setLineForm({ ...l }); }} className={`cursor-pointer divide-x divide-slate-200 ${isSel ? 'bg-blue-500 text-white' : 'hover:bg-slate-50'}`}>
                <td className="p-1 font-sans">{l.articleName}</td><td className="p-1 text-right">{l.quantity}</td><td className="p-1 text-center">{l.discount > 0 ? `${l.discount}%` : '—'}</td><td className="p-1 text-right">{l.unitPrice.toLocaleString('fr-FR')}</td><td className="p-1 text-right font-bold">{lineAmt(l).toLocaleString('fr-FR')}</td>
              </tr>);
            })}
            {lines.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-slate-400 font-sans">Aucune ligne</td></tr>}
          </tbody>
          {lines.length > 0 && <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 font-sans"><tr><td colSpan={3} className="p-1 text-right font-bold">TOTAL:</td><td colSpan={2} className="p-1 text-right font-mono font-bold text-lg">{formatAr(total)}</td></tr></tfoot>}
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border"><div className="flex items-center gap-3"><div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div><div><div className="text-2xl font-bold">{pendingPatients.length}</div><div className="text-sm text-slate-500">En attente</div></div></div></div>
        <div className="bg-white rounded-xl p-4 shadow-sm border"><div className="flex items-center gap-3"><div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600" /></div><div><div className="text-2xl font-bold">{todayInvoices.length}</div><div className="text-sm text-slate-500">Factures auj.</div></div></div></div>
        <div className="bg-white rounded-xl p-4 shadow-sm border"><div className="flex items-center gap-3"><div className="p-2 bg-emerald-100 rounded-lg"><DollarSign className="w-5 h-5 text-emerald-600" /></div><div><div className="text-lg font-bold font-mono">{formatAr(grandTotal)}</div><div className="text-sm text-slate-500">Total auj.</div></div></div></div>
        <div className="bg-white rounded-xl p-4 shadow-sm border"><div className="flex items-center gap-3"><div className="p-2 bg-purple-100 rounded-lg"><ShoppingCart className="w-5 h-5 text-purple-600" /></div><div><div className="text-lg font-bold font-mono">{formatAr(todayExtTotal)}</div><div className="text-sm text-slate-500">Ventes ext.</div></div></div></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {([['payment','📋 Facturation',pendingPatients.length],['external','🛒 Vte Externe',0],['hospit','🏨 Hospitalisation',hospitRequests.length + hbRecords.filter(h=>h.type==='hospit').length],['bloc','🏥 Bloc Op.',blocRequests.length + hbRecords.filter(h=>h.type==='bloc').length],['closing','🔒 Clôture',0]] as [Tab,string,number][]).map(([k,l,c]) => (
            <button key={k} onClick={() => switchTab(k)} className={`flex items-center gap-1 px-4 py-3 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap ${tab===k?'border-amber-500 text-amber-600 bg-amber-50/50':'border-transparent text-slate-500'}`}>{l}{c > 0 ? ` (${c})` : ''}</button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          {/* PAYMENT */}
          {tab === 'payment' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="divide-y border rounded-lg max-h-[500px] overflow-y-auto">
                {pendingPatients.length === 0 ? <div className="p-6 text-center text-slate-400">Aucune facture</div>
                  : pendingPatients.map(p => getConsults(p.id).map(c => (
                    <div key={c.id} className={`p-3 cursor-pointer hover:bg-slate-50 ${selConsultId === c.id ? 'bg-amber-50 border-l-4 border-amber-500' : ''}`} onClick={() => setSelConsultId(c.id)}>
                      <div className="font-medium text-sm">{p.lastName} {p.firstName}</div>
                      <div className="text-xs text-slate-500">{c.doctorName} — {new Date(c.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
                      <div className="flex gap-1 mt-1">{c.hospitalizeRequested && <span className="px-1 py-0.5 bg-rose-100 text-rose-700 text-[10px] rounded">🏨 Hospit.</span>}{c.surgeryRequested && <span className="px-1 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded">🏥 Bloc</span>}</div>
                    </div>
                  )))}
              </div>
              <div className="lg:col-span-2">
                {!selConsult || !selPatient ? <div className="p-12 text-center text-slate-400"><CreditCard className="w-16 h-16 mx-auto mb-4 opacity-30" /><p>Sélectionnez une consultation</p></div>
                  : <div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3"><h3 className="font-bold">{selPatient.lastName} {selPatient.firstName} <span className="text-sm text-slate-500">({selPatient.dossier})</span></h3><p className="text-xs text-slate-500">{selConsult.doctorName} | {selConsult.diagnosis}</p></div>
                    <table className="w-full text-sm mb-3"><thead><tr className="border-b"><th className="text-left py-2">Description</th><th className="text-right py-2">Montant</th></tr></thead><tbody>{items.map((it,i) => (<tr key={i} className="border-b border-slate-100"><td className="py-2">{it.description}</td><td className="py-2 text-right font-mono">{formatAr(it.amount)}</td></tr>))}</tbody></table>
                    <div className="flex justify-between text-xl font-bold border-t-2 pt-2 mb-4"><span>À PAYER</span><span className="font-mono text-amber-600">{formatAr(totalAmount)}</span></div>
                    <button onClick={handlePayment} className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 cursor-pointer shadow-lg flex items-center justify-center gap-2"><CreditCard className="w-5 h-5" /> Encaisser {formatAr(totalAmount)}</button>
                  </div>}
              </div>
            </div>
          )}

          {/* EXTERNAL — Sage style */}
          {tab === 'external' && (
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg"><h3 className="font-bold text-purple-800"><ShoppingCart className="w-5 h-5 inline" /> Vente Directe — Client Externe</h3></div>
              {renderSageEditor(extSearch, setExtSearch, extSearchRef, extFiltered, extSearchIdx, extKeyDown, extSelectArticle, extLineForm, setExtLineForm, extSaveLine, extDeleteLine, extLines, extSelLineId, setExtSelLineId, extLineAmt, extTotal, true)}
              <button onClick={extPay} disabled={extLines.length === 0} className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"><CreditCard className="w-5 h-5" /> Encaisser {formatAr(extTotal)}</button>
            </div>
          )}

          {/* HOSPIT / BLOC */}
          {(tab === 'hospit' || tab === 'bloc') && (
            <div className="space-y-4">
              <div className={`p-3 rounded-lg border ${tab === 'hospit' ? 'bg-rose-50 border-rose-200' : 'bg-blue-50 border-blue-200'}`}>
                <h3 className="font-bold flex items-center gap-2">{tab === 'hospit' ? <><Building2 className="w-5 h-5 text-rose-600" /> Hospitalisation</> : <><Heart className="w-5 h-5 text-blue-600" /> Bloc Opératoire</>} — Paiement Partiel + Saisie articles</h3>
              </div>
              {/* Add patient */}
              <div className="flex gap-2 items-end">
                <div className="flex-1"><label className="block text-xs font-medium mb-1">Nom patient</label><input type="text" value={hbPatientName} onChange={e => setHbPatientName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" /></div>
                <button onClick={() => addHbRecord(tab as 'hospit' | 'bloc')} className={`px-4 py-2 text-white rounded-lg cursor-pointer ${tab === 'hospit' ? 'bg-rose-600' : 'bg-blue-600'}`}>+ Patient</button>
              </div>

              {/* Records */}
              {hbRecords.filter(h => h.type === tab).map(record => {
                const totalFact = record.lines.reduce((s, l) => s + hbLineAmt(l), 0);
                const totalPaid = record.payments.reduce((s, p) => s + p.amount, 0);
                const reste = totalFact - totalPaid;
                return (
                  <div key={record.id} className={`border rounded-lg overflow-hidden ${hbSelRecordId === record.id ? 'border-blue-400' : 'border-slate-200'}`}>
                    <div className={`p-3 flex justify-between items-center cursor-pointer ${hbSelRecordId === record.id ? 'bg-blue-50' : 'bg-slate-50'}`} onClick={() => setHbSelRecordId(record.id === hbSelRecordId ? null : record.id)}>
                      <div><div className="font-bold text-sm">{record.patientName}</div><div className="text-xs text-slate-500">Facture: {formatAr(totalFact)} | Payé: <span className="text-green-600">{formatAr(totalPaid)}</span> | Reste: <span className="text-red-600 font-bold">{formatAr(reste)}</span></div></div>
                      <div className="flex gap-1">
                        <input type="number" min={0} value={hbPayAmount || ''} onChange={e => setHbPayAmount(parseInt(e.target.value) || 0)} className="w-24 px-2 py-1 border rounded text-xs text-right outline-none" placeholder="Montant" onClick={e => e.stopPropagation()} />
                        <button onClick={e => { e.stopPropagation(); addPartialPay(record.id); }} disabled={hbPayAmount <= 0 || hbPayAmount > reste} className="px-2 py-1 bg-emerald-600 text-white rounded text-xs cursor-pointer disabled:opacity-40">💰 Payer</button>
                      </div>
                    </div>
                    {/* Article list + add */}
                    {hbSelRecordId === record.id && (
                      <div className="p-3 border-t">
                        <div className="text-xs font-medium text-slate-600 mb-2">Articles facturés :</div>
                        {record.lines.length > 0 && <div className="mb-2 overflow-auto"><table className="w-full text-[11px]"><thead className="bg-slate-100"><tr><th className="p-1 text-left">Article</th><th className="p-1 text-right">Qté</th><th className="p-1 text-right">P.U.</th><th className="p-1 text-right">Montant</th><th className="p-1 w-6"></th></tr></thead><tbody>{record.lines.map(l => (<tr key={l.id} className="border-b border-slate-100"><td className="p-1">{l.articleName}</td><td className="p-1 text-right">{l.quantity}</td><td className="p-1 text-right font-mono">{l.unitPrice.toLocaleString('fr-FR')}</td><td className="p-1 text-right font-mono font-bold">{hbLineAmt(l).toLocaleString('fr-FR')}</td><td className="p-1"><button onClick={() => hbRemoveLine(record.id, l.id)} className="text-red-500 cursor-pointer"><Trash2 className="w-3 h-3" /></button></td></tr>))}</tbody></table></div>}
                        {/* Sage-style add article */}
                        <div className="flex gap-1 items-end">
                          <div className="flex-1 relative">
                            <input ref={hbSearchRef} type="text" value={hbSearch} onChange={e => { setHbSearch(e.target.value); setHbSearchIdx(0); }} onKeyDown={hbKeyDown} className="w-full bg-white border border-blue-400 rounded px-2 py-1 text-xs outline-none" placeholder="🔍 Ajouter article..." />
                            {hbSearch.length >= 1 && hbFiltered.length > 0 && <div className="absolute top-full left-0 right-0 bg-white border rounded-b shadow-xl z-30 max-h-32 overflow-y-auto">{hbFiltered.map((a, idx) => (<div key={a.id} onClick={() => hbSelectArticle(a.id)} className={`px-2 py-1 cursor-pointer text-xs flex justify-between border-b ${idx === hbSearchIdx ? 'bg-blue-100' : 'hover:bg-blue-50'}`}><span>{a.name}</span><span className="font-mono text-blue-600">{formatAr(a.priceComptoir)}</span></div>))}</div>}
                          </div>
                          <input type="number" min={1} value={hbLineForm.quantity} onChange={e => setHbLineForm({ ...hbLineForm, quantity: parseInt(e.target.value) || 1 })} className="w-14 px-1 py-1 border rounded text-xs text-right outline-none" placeholder="Qté" />
                          <span className="text-xs font-mono w-20 text-right">{formatAr(hbLineForm.unitPrice)}</span>
                          <button onClick={hbAddLineToRecord} disabled={!hbLineForm.articleName} className="px-2 py-1 bg-sky-500 text-white rounded text-xs cursor-pointer disabled:opacity-40"><Save className="w-3 h-3 inline" /></button>
                        </div>
                        {/* Payment history */}
                        {record.payments.length > 0 && <div className="mt-2 text-[10px] text-slate-500 border-t pt-1">{record.payments.map((p, i) => (<div key={i}>{new Date(p.date).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'})} — {formatAr(p.amount)} — {p.paidBy}</div>))}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* CLOSING */}
          {tab === 'closing' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="p-4 bg-slate-800 text-white rounded-lg flex justify-between items-center"><div><h3 className="font-bold text-lg"><Lock className="w-5 h-5 inline" /> Clôture — {new Date().toLocaleDateString('fr-FR')}</h3><p className="text-slate-300 text-sm">{state.currentUser?.name}</p></div>
                <button onClick={() => setPrintTicket(`${'═'.repeat(32)}\n   CLÔTURE DE CAISSE\n   ${new Date().toLocaleDateString('fr-FR')}\n   ${state.currentUser?.name}\n${'═'.repeat(32)}\n\n1. VERSEMENTS PAR FAMILLE\n${'─'.repeat(32)}\nConsultations: ${formatAr(todayTotal - todayExtTotal)}\nVentes Externes: ${formatAr(todayExtTotal)}\nHospit/Bloc: ${formatAr(todayPartialTotal)}\n\n2. HOSPIT. & BLOC\n${'─'.repeat(32)}\n${hbRecords.filter(h => h.payments.length > 0).map(h => `${h.patientName} (${h.type})\n${h.payments.map(p => `  ${formatAr(p.amount)} — ${p.paidBy}`).join('\n')}`).join('\n')}\n\n3. TOTAL GÉNÉRAL\n${'═'.repeat(32)}\n   ${formatAr(grandTotal)}\n\n4. TOUS LES CLIENTS\n${'─'.repeat(32)}\n${todayInvoices.map(inv => { const pat = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : null; return `${pat ? `${pat.lastName} ${pat.firstName}` : inv.clientName || 'Ext.'} — ${formatAr(inv.patientCharge)}`; }).join('\n')}\n${hbRecords.filter(h => h.payments.length > 0).map(h => `${h.patientName} — ${formatAr(h.payments.reduce((s,p) => s+p.amount, 0))}`).join('\n')}`)} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm cursor-pointer flex items-center gap-2"><Printer className="w-4 h-4" /> Ticket 80×80</button>
              </div>

              <div className="bg-white border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">1. Versements par famille</h4>
                <div className="grid grid-cols-3 gap-2"><div className="p-3 bg-green-50 rounded flex justify-between"><span>Consultations</span><span className="font-mono font-bold">{formatAr(todayTotal - todayExtTotal)}</span></div><div className="p-3 bg-purple-50 rounded flex justify-between"><span>Ventes Ext.</span><span className="font-mono font-bold">{formatAr(todayExtTotal)}</span></div><div className="p-3 bg-rose-50 rounded flex justify-between"><span>Hospit/Bloc</span><span className="font-mono font-bold">{formatAr(todayPartialTotal)}</span></div></div></div>

              {hbRecords.filter(h => h.payments.length > 0).length > 0 && <div className="bg-white border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">2. Hospitalisation & Bloc</h4>
                <table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Patient</th><th className="p-2">Type</th><th className="p-2 text-right">Total Fact.</th><th className="p-2 text-right">Reçu</th><th className="p-2 text-right">Reste</th><th className="p-2">Caissier</th></tr></thead><tbody>{hbRecords.filter(h => h.payments.length > 0).map(h => { const tf = h.lines.reduce((s, l) => s + hbLineAmt(l), 0); const tp = h.payments.reduce((s, p) => s + p.amount, 0); return (<tr key={h.id} className="border-b"><td className="p-2 font-medium">{h.patientName}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${h.type === 'hospit' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>{h.type === 'hospit' ? 'Hosp.' : 'Bloc'}</span></td><td className="p-2 text-right font-mono">{formatAr(tf)}</td><td className="p-2 text-right font-mono text-green-600">{formatAr(tp)}</td><td className="p-2 text-right font-mono text-red-600">{formatAr(tf - tp)}</td><td className="p-2">{h.payments.map(p => p.paidBy).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</td></tr>); })}</tbody></table></div>}

              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-lg p-6 text-center"><div className="text-sm text-slate-600">3. TOTAL GÉNÉRAL</div><div className="text-4xl font-bold font-mono text-emerald-700">{formatAr(grandTotal)}</div></div>

              <div className="bg-white border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">4. Liste des clients</h4>
                <table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Heure</th><th className="p-2 text-left">Client</th><th className="p-2">Type</th><th className="p-2 text-right">Montant</th></tr></thead>
                <tbody>
                  {todayInvoices.map(inv => { const pat = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : null; return (<tr key={inv.id} className="border-b"><td className="p-2 font-mono">{new Date(inv.paidAt || '').toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td className="p-2">{pat ? `${pat.lastName} ${pat.firstName}` : inv.clientName || 'Ext.'}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${inv.isExternal ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>{inv.isExternal ? 'Externe' : 'Consult.'}</span></td><td className="p-2 text-right font-mono font-bold">{formatAr(inv.patientCharge)}</td></tr>); })}
                  {hbRecords.filter(h => h.payments.length > 0).map(h => { const tp = h.payments.reduce((s, p) => s + p.amount, 0); return (<tr key={h.id} className="border-b"><td className="p-2">—</td><td className="p-2">{h.patientName}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${h.type === 'hospit' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>{h.type === 'hospit' ? 'Hosp.' : 'Bloc'}</span></td><td className="p-2 text-right font-mono font-bold">{formatAr(tp)}</td></tr>); })}
                </tbody>
                <tfoot className="bg-emerald-50"><tr><td colSpan={3} className="p-2 text-right font-bold">TOTAL:</td><td className="p-2 text-right font-mono font-bold text-lg">{formatAr(grandTotal)}</td></tr></tfoot></table></div>
            </div>
          )}
        </div>
      </div>

      {/* PRINT TICKET */}
      {printTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-2xl w-80 max-h-[80vh] overflow-auto">
            <div className="p-3 border-b bg-slate-100 flex justify-between"><span className="font-bold text-sm">🧾 Ticket</span><button onClick={() => setPrintTicket(null)} className="cursor-pointer">✕</button></div>
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap">{printTicket}</pre>
            <div className="p-3 border-t"><button onClick={() => { window.print(); setPrintTicket(null); }} className="w-full py-2 bg-slate-800 text-white rounded-lg cursor-pointer flex items-center justify-center gap-2"><Printer className="w-4 h-4" /> Imprimer</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
