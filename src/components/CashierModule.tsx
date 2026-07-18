import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Invoice, InvoiceItem, ClientType } from '../types';
import type { AppState } from '../store';
import { addAuditLog, addNotification, formatAr, getPrice, calculateAge, generateDossierNumber } from '../store';
import { CreditCard, CheckCircle, DollarSign, Clock, ShoppingCart, Trash2, Lock, Printer, Building2, Heart, Save, X, UserPlus, Edit2, Plus } from 'lucide-react';
import { printTicket as openThermalTicket } from '../utils/printTicket';

interface HbLine { id: string; articleName: string; quantity: number; unitPrice: number; discount: number; dateSort?: string; }
interface HbRecord { id: string; patientId?: string; patientName: string; clientType: ClientType; company?: string; type: 'hospit' | 'bloc'; lines: HbLine[]; payments: { amount: number; paidBy: string; date: string }[]; }

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type Tab = 'payment' | 'external' | 'hospit' | 'bloc' | 'closing';
type HbModal = 'none' | 'add_patient' | 'add_article' | 'edit_client';

export default function CashierModule({ state, setState }: Props) {
  const [selConsultId, setSelConsultId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('payment');
  const [printTicket, setPrintTicket] = useState<string | null>(null);

  // External sale
  const [extSearch, setExtSearch] = useState('');
  const [extSearchIdx, setExtSearchIdx] = useState(0);
  const [extLines, setExtLines] = useState<HbLine[]>([]);
  const [extSelLineId, setExtSelLineId] = useState<string | null>(null);
  const [extLineForm, setExtLineForm] = useState<HbLine>({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: '' });
  const [extIsNew, setExtIsNew] = useState(false);
  const extSearchRef = useRef<HTMLInputElement>(null);

  // Hospit/Bloc
  const [hbRecords, setHbRecords] = useState<HbRecord[]>([]);
  const [hbSelRecordId, setHbSelRecordId] = useState<string | null>(null);
  const [hbPayAmount, setHbPayAmount] = useState(0);
  const [hbModal, setHbModal] = useState<HbModal>('none');

  // HB Modal: patient search/add (ALL fields like reception)
  const [hbPatSearch, setHbPatSearch] = useState('');
  const [hbNewPat, setHbNewPat] = useState({ lastName: '', firstName: '', dateOfBirth: '', gender: 'M' as 'M'|'F', contact: '', address: '', matricule: '', ssn: '', insureName: '', clientType: 'comptoir' as ClientType, company: '', subCompany: '' });

  // HB Modal: article add
  const [hbArtSearch, setHbArtSearch] = useState('');
  const [hbArtIdx, setHbArtIdx] = useState(0);
  const [hbArtForm, setHbArtForm] = useState<HbLine>({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: new Date().toISOString().split('T')[0] });
  const [hbDateSort, setHbDateSort] = useState(new Date().toISOString().split('T')[0]); // persistent date
  const hbArtRef = useRef<HTMLInputElement>(null);
  const [hbSelLineId, setHbSelLineId] = useState<string | null>(null);
  const [hbIsNew, setHbIsNew] = useState(true);

  // HB Modal: edit client type
  const [hbEditClientType, setHbEditClientType] = useState<ClientType>('comptoir');
  const [hbEditCompany, setHbEditCompany] = useState('');

  // Data
  const pendingPatients = state.patients.filter(p => p.status === 'consulted_awaiting_payment');
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
    openThermalTicket(state.ticketSettings, inv, selPatient, state.currentUser || undefined);
    setSelConsultId(null);
  };

  // === EXTERNAL ===
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
    setExtIsNew(false); setExtLineForm({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0 }); setTimeout(() => extSearchRef.current?.focus(), 50);
  };
  const extKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setExtSearchIdx(i => Math.min(i + 1, extFiltered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setExtSearchIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (extFiltered.length > 0 && extSearch) extSelectArticle(extFiltered[extSearchIdx].id);
      else if (extLineForm.articleName) extSaveLine(); // Enter = validate
    }
    else if (e.key === 'Escape') setExtSearch('');
  };
  const extPay = () => {
    if (extLines.length === 0) return;
    const inv: Invoice = { id: uuidv4(), clientName: 'Client Externe', clientType: 'externe', items: extLines.map(l => ({ description: `${l.articleName} × ${l.quantity}`, amount: extLineAmt(l), category: 'pharmacy' as const })), totalAmount: extTotal, patientCharge: extTotal, status: 'paid', paidAt: new Date().toISOString(), paidBy: state.currentUser?.id || '', createdAt: new Date().toISOString(), isExternal: true };
    setState(prev => { const next = { ...prev, invoices: [...prev.invoices, inv] }; addAuditLog(next, 'VENTE_EXTERNE', `Client Externe — ${formatAr(extTotal)}`); addNotification(next, 'pharmacy', `🛒 Client Externe — ${formatAr(extTotal)}`, 'info'); return next; });
    openThermalTicket(state.ticketSettings, inv, undefined, state.currentUser || undefined);
    setExtLines([]); setExtSearch('');
  };

  // === HOSPIT/BLOC ===
  const hbLineAmt = (l: HbLine) => Math.round(l.unitPrice * l.quantity * (1 - l.discount / 100));
  const hbPatFiltered = hbPatSearch.length >= 1 ? state.patients.filter(p => `${p.lastName} ${p.firstName}`.toLowerCase().includes(hbPatSearch.toLowerCase()) || p.dossier.toLowerCase().includes(hbPatSearch.toLowerCase())) : [];

  const hbSelectPatient = (patientId: string) => {
    const p = state.patients.find(x => x.id === patientId);
    if (!p) return;
    const exists = hbRecords.some(r => r.patientId === p.id && r.type === tab);
    if (exists) { alert('Ce patient est déjà dans la liste'); return; }
    setHbRecords([...hbRecords, { id: uuidv4(), patientId: p.id, patientName: `${p.lastName} ${p.firstName}`, clientType: p.clientType, company: p.company, type: tab as 'hospit' | 'bloc', lines: [], payments: [] }]);
    setHbPatSearch(''); setHbModal('none');
  };

  const hbAddNewPatient = () => {
    if (!hbNewPat.lastName || !hbNewPat.firstName) { alert('Nom et prénom requis'); return; }
    const np = {
      id: uuidv4(), dossier: generateDossierNumber(hbNewPat.lastName),
      firstName: hbNewPat.firstName.toUpperCase(), lastName: hbNewPat.lastName.toUpperCase(),
      dateOfBirth: hbNewPat.dateOfBirth || 'N/A', age: hbNewPat.dateOfBirth ? calculateAge(hbNewPat.dateOfBirth) : 'N/A',
      gender: hbNewPat.gender, address: hbNewPat.address.toUpperCase(), contact: hbNewPat.contact,
      ssn: hbNewPat.ssn, matricule: hbNewPat.matricule || undefined,
      insureName: hbNewPat.insureName?.toUpperCase() || undefined,
      clientType: hbNewPat.clientType,
      company: hbNewPat.clientType === 'societe' ? hbNewPat.company : undefined,
      subCompany: hbNewPat.clientType === 'societe' ? hbNewPat.subCompany : undefined,
      allergies: [] as string[], chronicTreatments: [] as string[],
      registeredAt: new Date().toISOString(), registeredBy: state.currentUser?.id || 'CAISSE', status: 'registered' as const,
    };
    setState(prev => ({ ...prev, patients: [...prev.patients, np] }));
    setHbRecords([...hbRecords, { id: uuidv4(), patientId: np.id, patientName: `${np.lastName} ${np.firstName}`, clientType: np.clientType, company: np.company, type: tab as 'hospit' | 'bloc', lines: [], payments: [] }]);
    setHbNewPat({ lastName: '', firstName: '', dateOfBirth: '', gender: 'M', contact: '', address: '', matricule: '', ssn: '', insureName: '', clientType: 'comptoir', company: '', subCompany: '' });
    setHbModal('none');
  };

  // Article modal for hospit/bloc
  const hbArtFiltered = hbArtSearch.length >= 1 ? state.articles.filter(a => a.name.toLowerCase().includes(hbArtSearch.toLowerCase())) : [];

  const hbArtNew = () => {
    setHbArtForm({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: hbDateSort });
    setHbSelLineId(null);
    setHbIsNew(true);
    setHbArtSearch('');
    setTimeout(() => hbArtRef.current?.focus(), 50);
  };

  const hbArtDelete = () => {
    if (!hbSelRecordId || !hbSelLineId) return;
    setHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, lines: r.lines.filter(l => l.id !== hbSelLineId) } : r));
    hbArtNew();
  };

  const hbArtSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    const rec = hbRecords.find(r => r.id === hbSelRecordId);
    setHbArtForm({ id: uuidv4(), articleName: a.name, quantity: 1, unitPrice: getPrice(a, rec?.clientType || 'comptoir'), discount: 0, dateSort: hbDateSort });
    setHbIsNew(true);
    setHbSelLineId(null);
    setHbArtSearch('');
    setTimeout(() => {
      const qtyInput = document.getElementById('hb-qty-input');
      qtyInput?.focus();
      (qtyInput as HTMLInputElement)?.select();
    }, 50);
  };

  const hbArtSave = () => {
    if (!hbSelRecordId || !hbArtForm.articleName) return;
    const rec = hbRecords.find(r => r.id === hbSelRecordId);
    if (!rec) return;

    const lineToSave: HbLine = {
      ...hbArtForm,
      dateSort: hbDateSort
    };

    if (hbIsNew || !rec.lines.some(l => l.id === hbArtForm.id)) {
      setHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, lines: [...r.lines, { ...lineToSave, id: uuidv4() }] } : r));
    } else {
      setHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, lines: r.lines.map(l => l.id === hbArtForm.id ? lineToSave : l) } : r));
    }
    hbArtNew();
  };

  const hbArtKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHbArtIdx(i => Math.min(i + 1, hbArtFiltered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHbArtIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (hbArtFiltered.length > 0 && hbArtSearch) hbArtSelectArticle(hbArtFiltered[hbArtIdx].id);
      else if (hbArtForm.articleName) hbArtSave();
    }
    else if (e.key === 'Escape') setHbArtSearch('');
  };

  const addPartialPay = (recordId: string) => {
    const rec = hbRecords.find(r => r.id === recordId);
    if (!rec || hbPayAmount <= 0) return;
    const totalFact = rec.lines.reduce((s, l) => s + hbLineAmt(l), 0);
    const totalPaid = rec.payments.reduce((s, p) => s + p.amount, 0);
    const reste = totalFact - totalPaid;
    if (hbPayAmount > reste) { alert(`Montant supérieur au reste à payer (${formatAr(reste)})`); return; }
    setHbRecords(hbRecords.map(r => r.id === recordId ? { ...r, payments: [...r.payments, { amount: hbPayAmount, paidBy: state.currentUser?.name || '', date: new Date().toISOString() }] } : r));
    setHbPayAmount(0);
  };

  // Edit client type
  const hbSaveClientType = () => {
    if (!hbSelRecordId) return;
    const rec = hbRecords.find(r => r.id === hbSelRecordId);
    setHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, clientType: hbEditClientType, company: hbEditClientType === 'societe' ? hbEditCompany : undefined } : r));
    // Also update patient in state if linked
    if (rec?.patientId) {
      setState(prev => ({ ...prev, patients: prev.patients.map(p => p.id === rec.patientId ? { ...p, clientType: hbEditClientType === 'externe' ? 'comptoir' : hbEditClientType as 'comptoir'|'societe', company: hbEditClientType === 'societe' ? hbEditCompany : undefined } : p) }));
    }
    setHbModal('none');
  };

  // Auto-add from doctor requests
  const autoAddRequests = () => {
    state.consultations.forEach(c => {
      const pat = state.patients.find(p => p.id === c.patientId);
      if (!pat) return;
      const name = `${pat.lastName} ${pat.firstName}`;
      if (c.hospitalizeRequested && !hbRecords.some(h => h.patientId === pat.id && h.type === 'hospit'))
        setHbRecords(prev => [...prev, { id: uuidv4(), patientId: pat.id, patientName: name, clientType: pat.clientType, company: pat.company, type: 'hospit', lines: [], payments: [] }]);
      if (c.surgeryRequested && !hbRecords.some(h => h.patientId === pat.id && h.type === 'bloc'))
        setHbRecords(prev => [...prev, { id: uuidv4(), patientId: pat.id, patientName: name, clientType: pat.clientType, company: pat.company, type: 'bloc', lines: [], payments: [] }]);
    });
  };
  const switchTab = (t: Tab) => { setTab(t); if (t === 'hospit' || t === 'bloc') autoAddRequests(); };

  // Stats
  const paidInvoices = state.invoices.filter(inv => inv.status === 'paid');
  const todayInvoices = paidInvoices.filter(inv => new Date(inv.paidAt || '').toDateString() === new Date().toDateString());
  const todayTotal = todayInvoices.reduce((s, inv) => s + inv.patientCharge, 0);
  const todayExtTotal = todayInvoices.filter(i => i.isExternal).reduce((s, i) => s + i.patientCharge, 0);
  const todayPartialTotal = hbRecords.reduce((s, h) => s + h.payments.filter(p => new Date(p.date).toDateString() === new Date().toDateString()).reduce((ss, p) => ss + p.amount, 0), 0);
  const grandTotal = todayTotal + todayPartialTotal;

  const curHbRecords = hbRecords.filter(h => h.type === tab);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border"><div className="flex items-center gap-3"><div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div><div><div className="text-2xl font-bold">{pendingPatients.length}</div><div className="text-sm text-slate-500">En attente</div></div></div></div>
        <div className="bg-white rounded-xl p-4 shadow-sm border"><div className="flex items-center gap-3"><div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600" /></div><div><div className="text-2xl font-bold">{todayInvoices.length}</div><div className="text-sm text-slate-500">Factures auj.</div></div></div></div>
        <div className="bg-white rounded-xl p-4 shadow-sm border"><div className="flex items-center gap-3"><div className="p-2 bg-emerald-100 rounded-lg"><DollarSign className="w-5 h-5 text-emerald-600" /></div><div><div className="text-lg font-bold font-mono">{formatAr(grandTotal)}</div><div className="text-sm text-slate-500">Total auj.</div></div></div></div>
        <div className="bg-white rounded-xl p-4 shadow-sm border"><div className="flex items-center gap-3"><div className="p-2 bg-purple-100 rounded-lg"><ShoppingCart className="w-5 h-5 text-purple-600" /></div><div><div className="text-lg font-bold font-mono">{formatAr(todayExtTotal)}</div><div className="text-sm text-slate-500">Ventes ext.</div></div></div></div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {([['payment','📋 Facturation',pendingPatients.length],['external','🛒 Vte Externe',0],['hospit','🏨 Hospit.',hbRecords.filter(h=>h.type==='hospit').length],['bloc','🏥 Bloc',hbRecords.filter(h=>h.type==='bloc').length],['closing','🔒 Clôture',0]] as [Tab,string,number][]).map(([k,l,c]) => (
            <button key={k} onClick={() => switchTab(k)} className={`flex items-center gap-1 px-4 py-3 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap ${tab===k?'border-amber-500 text-amber-600 bg-amber-50/50':'border-transparent text-slate-500'}`}>{l}{c > 0 ? ` (${c})` : ''}</button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>

          {/* PAYMENT */}
          {tab === 'payment' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="divide-y border rounded-lg max-h-[500px] overflow-y-auto">
                {pendingPatients.length === 0 ? <div className="p-6 text-center text-slate-400">Aucune facture</div>
                  : pendingPatients.map(p => getConsults(p.id).map(c => {
                    const cTotal = c.prescriptions.reduce((s, pr) => s + Math.round(pr.unitPrice * pr.quantity * (1 - pr.discount / 100)), 0);
                    return (
                      <div key={c.id} className={`p-3 cursor-pointer hover:bg-slate-50 ${selConsultId === c.id ? 'bg-amber-50 border-l-4 border-amber-500' : ''}`} onClick={() => setSelConsultId(c.id)}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-sm">{p.lastName} {p.firstName}</div>
                            <div className="text-xs text-slate-500">{c.doctorName}</div>
                          </div>
                          <div className="font-mono font-bold text-sm text-amber-700">{formatAr(cTotal)}</div>
                        </div>
                        <div className="flex gap-1 mt-1">{c.hospitalizeRequested && <span className="px-1 py-0.5 bg-rose-100 text-rose-700 text-[10px] rounded">🏨</span>}{c.surgeryRequested && <span className="px-1 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded">🏥</span>}</div>
                      </div>
                    );
                  }))}
              </div>
              <div className="lg:col-span-2">
                {!selConsult || !selPatient ? <div className="p-12 text-center text-slate-400"><CreditCard className="w-16 h-16 mx-auto mb-4 opacity-30" /><p>Sélectionnez une consultation</p></div>
                  : <div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3"><h3 className="font-bold">{selPatient.lastName} {selPatient.firstName} ({selPatient.dossier})</h3><p className="text-xs text-slate-500">{selConsult.doctorName} | {selConsult.diagnosis}</p></div>
                    <div className="flex justify-between text-xl font-bold border-t-2 pt-2 mb-4"><span>À PAYER</span><span className="font-mono text-amber-600">{formatAr(totalAmount)}</span></div>
                    <button onClick={handlePayment} className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 cursor-pointer shadow-lg flex items-center justify-center gap-2"><CreditCard className="w-5 h-5" /> Encaisser {formatAr(totalAmount)}</button>
                  </div>}
              </div>
            </div>
          )}

          {/* EXTERNAL - Sage */}
          {tab === 'external' && (
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg"><h3 className="font-bold text-purple-800"><ShoppingCart className="w-5 h-5 inline" /> Vente Directe — Client Externe</h3></div>
              <div className="bg-[#f4f4f4] border border-slate-300 rounded">
                <div className="bg-slate-100 border-b border-slate-300 p-1.5 m-2 mb-0 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-1">
                    <div className="flex-1 min-w-[140px] relative">
                      <label className="block text-[9px] text-slate-500">Article (↑↓ Entrée)</label>
                      <input ref={extSearchRef} type="text" value={extLineForm.articleName && !extSearch ? extLineForm.articleName : extSearch} onChange={e => { setExtSearch(e.target.value); setExtSearchIdx(0); }} onKeyDown={extKeyDown} className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-600" placeholder="🔍 Tapez..." />
                      {extSearch.length >= 1 && extFiltered.length > 0 && <div className="absolute top-full left-0 right-0 bg-white border rounded-b shadow-xl z-30 max-h-36 overflow-y-auto">{extFiltered.map((a, idx) => (<div key={a.id} onClick={() => extSelectArticle(a.id)} className={`px-2 py-1 cursor-pointer text-xs flex justify-between border-b ${idx === extSearchIdx ? 'bg-blue-100' : 'hover:bg-blue-50'}`}><span>[{a.family}] {a.name}</span><span className="font-mono text-blue-600">{formatAr(getPrice(a, 'externe'))}</span></div>))}</div>}
                    </div>
                    <div className="w-14"><label className="block text-[9px] text-slate-500">Qté</label><input type="number" min={1} value={extLineForm.quantity} onChange={e => setExtLineForm({...extLineForm, quantity: parseInt(e.target.value)||1})} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); extSaveLine(); }}} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono outline-none" /></div>
                    <div className="w-14"><label className="block text-[9px] text-slate-500">Rem%</label><input type="number" min={0} max={100} value={extLineForm.discount} onChange={e => setExtLineForm({...extLineForm, discount: parseInt(e.target.value)||0})} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); extSaveLine(); }}} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono outline-none" /></div>
                    <div className="w-20"><label className="block text-[9px] text-slate-500">P.U.</label><input readOnly value={formatAr(extLineForm.unitPrice)} className="w-full bg-slate-200 border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono" /></div>
                    <div className="w-24"><label className="block text-[9px] text-slate-500">Montant</label><input readOnly value={formatAr(extLineAmt(extLineForm))} className="w-full bg-slate-200 border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono font-bold" /></div>
                  </div>
                  <div className="flex justify-end gap-1 mt-1">
                    <button onClick={() => { if (extSelLineId) { setExtLines(extLines.filter(l => l.id !== extSelLineId)); setExtSelLineId(null); }}} disabled={!extSelLineId} className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[10px] disabled:opacity-40 cursor-pointer"><Trash2 className="h-3 w-3 text-rose-600 inline" /></button>
                    <button onClick={extSaveLine} disabled={!extLineForm.articleName} className="px-2 py-0.5 bg-sky-500 text-white border border-sky-600 rounded text-[10px] disabled:opacity-40 cursor-pointer"><Save className="h-3 w-3 inline" /> Enreg.</button>
                  </div>
                </div>
                <div className="bg-white mx-2 mb-2 border-t border-slate-300 overflow-x-auto rounded-b">
                  <table className="w-full text-[11px]"><thead className="bg-slate-50 border-b text-slate-600"><tr className="divide-x divide-slate-200"><th className="p-1 min-w-[130px]">Article</th><th className="p-1 text-right w-12">Qté</th><th className="p-1 text-center w-12">Rem%</th><th className="p-1 text-right w-20">P.U.</th><th className="p-1 text-right w-24">Montant</th></tr></thead>
                    <tbody className="divide-y font-mono">{extLines.map(l => (<tr key={l.id} onClick={() => { setExtSelLineId(l.id); setExtLineForm({...l}); setExtIsNew(false); }} className={`cursor-pointer divide-x divide-slate-200 ${l.id === extSelLineId ? 'bg-blue-500 text-white' : 'hover:bg-slate-50'}`}><td className="p-1 font-sans">{l.articleName}</td><td className="p-1 text-right">{l.quantity}</td><td className="p-1 text-center">{l.discount > 0 ? `${l.discount}%` : '—'}</td><td className="p-1 text-right">{l.unitPrice.toLocaleString('fr-FR')}</td><td className="p-1 text-right font-bold">{extLineAmt(l).toLocaleString('fr-FR')}</td></tr>))}
                      {extLines.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-slate-400 font-sans">Tapez un article</td></tr>}
                    </tbody>
                    {extLines.length > 0 && <tfoot className="bg-emerald-50 border-t-2 border-emerald-300"><tr><td colSpan={3} className="p-1 text-right font-bold font-sans">TOTAL:</td><td colSpan={2} className="p-1 text-right font-mono font-bold text-lg">{formatAr(extTotal)}</td></tr></tfoot>}
                  </table>
                </div>
              </div>
              <button onClick={extPay} disabled={extLines.length === 0} className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"><CreditCard className="w-5 h-5" /> Encaisser {formatAr(extTotal)}</button>
            </div>
          )}

          {/* HOSPIT / BLOC */}
          {(tab === 'hospit' || tab === 'bloc') && (
            <div className="space-y-4">
              <div className={`p-3 rounded-lg border flex justify-between items-center ${tab === 'hospit' ? 'bg-rose-50 border-rose-200' : 'bg-blue-50 border-blue-200'}`}>
                <h3 className="font-bold flex items-center gap-2">{tab === 'hospit' ? <><Building2 className="w-5 h-5 text-rose-600" /> Hospitalisation</> : <><Heart className="w-5 h-5 text-blue-600" /> Bloc Opératoire</>}</h3>
                <button onClick={() => { setHbPatSearch(''); setHbModal('add_patient'); }} className={`px-3 py-1.5 text-white rounded-lg cursor-pointer text-sm flex items-center gap-1 ${tab === 'hospit' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}><UserPlus className="w-4 h-4" /> Ajouter Patient</button>
              </div>

              {/* Records list */}
              {curHbRecords.length === 0 ? <div className="text-center py-8 text-slate-400">Aucun patient</div>
                : curHbRecords.map(record => {
                  const totalFact = record.lines.reduce((s, l) => s + hbLineAmt(l), 0);
                  const totalPaid = record.payments.reduce((s, p) => s + p.amount, 0);
                  const reste = totalFact - totalPaid;
                  const isOpen = hbSelRecordId === record.id;
                  return (
                    <div key={record.id} className={`border rounded-lg overflow-hidden ${isOpen ? 'border-blue-400' : 'border-slate-200'}`}>
                      <div className={`p-3 flex justify-between items-center cursor-pointer ${isOpen ? 'bg-blue-50' : 'bg-slate-50'}`} onClick={() => setHbSelRecordId(isOpen ? null : record.id)}>
                        <div>
                          <div className="font-bold text-sm flex items-center gap-2">{record.patientName}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${record.clientType === 'societe' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{record.clientType === 'societe' ? `🏢 ${record.company}` : '🏪 Comptoir'}</span>
                            <button onClick={(e) => { e.stopPropagation(); setHbSelRecordId(record.id); setHbEditClientType(record.clientType); setHbEditCompany(record.company || ''); setHbModal('edit_client'); }} className="text-blue-500 cursor-pointer" title="Modifier type"><Edit2 className="w-3 h-3" /></button>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">Facture: <strong>{formatAr(totalFact)}</strong> | Payé: <span className="text-green-600">{formatAr(totalPaid)}</span> | Reste: <span className="text-red-600 font-bold">{formatAr(reste)}</span></div>
                        </div>
                        <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setHbSelRecordId(record.id); setHbArtSearch(''); setHbArtForm({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: hbDateSort }); setHbSelLineId(null); setHbIsNew(true); setHbModal('add_article'); }} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs cursor-pointer transition font-medium">📋 Prescriptions</button>
                          {reste > 0 && <>
                            <input type="number" min={1} max={reste} value={hbPayAmount || ''} onChange={e => setHbPayAmount(Math.min(parseInt(e.target.value) || 0, reste))} className="w-24 px-2 py-1 border rounded text-xs text-right outline-none" placeholder="Montant" />
                            <button onClick={() => addPartialPay(record.id)} disabled={hbPayAmount <= 0 || hbPayAmount > reste} className="px-2 py-1 bg-amber-600 text-white rounded text-xs cursor-pointer disabled:opacity-40">💰 Payer</button>
                          </>}
                        </div>
                      </div>
                      {isOpen && (
                        <div className="p-3 border-t bg-white">
                          {record.lines.length > 0 && <table className="w-full text-[11px] mb-2"><thead className="bg-slate-100"><tr><th className="p-1 text-left w-16">Date</th><th className="p-1 text-left">Article</th><th className="p-1 text-right">Qté</th><th className="p-1 text-right">P.U.</th><th className="p-1 text-right">Montant</th></tr></thead><tbody>{record.lines.map(l => (<tr key={l.id} className="border-b border-slate-100"><td className="p-1 text-slate-500">{l.dateSort || '—'}</td><td className="p-1">{l.articleName}</td><td className="p-1 text-right">{l.quantity}</td><td className="p-1 text-right font-mono">{l.unitPrice.toLocaleString('fr-FR')}</td><td className="p-1 text-right font-mono font-bold">{hbLineAmt(l).toLocaleString('fr-FR')}</td></tr>))}</tbody></table>}
                          {record.lines.length === 0 && <p className="text-slate-400 text-xs text-center py-2">Aucun article — cliquez "+ Article"</p>}
                          {record.payments.length > 0 && <div className="mt-2 text-[10px] text-slate-500 border-t pt-1"><div className="font-bold mb-1">Historique paiements :</div>{record.payments.map((p, i) => (<div key={i}>{new Date(p.date).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'})} — {formatAr(p.amount)} — {p.paidBy}</div>))}</div>}
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
                <button onClick={() => setPrintTicket(`${'═'.repeat(32)}\n   CLÔTURE DE CAISSE\n   ${new Date().toLocaleDateString('fr-FR')}\n   ${state.currentUser?.name}\n${'═'.repeat(32)}\n\n1. PAR FAMILLE\nConsultations: ${formatAr(todayTotal - todayExtTotal)}\nVentes Ext.: ${formatAr(todayExtTotal)}\nHospit/Bloc: ${formatAr(todayPartialTotal)}\n\n2. HOSPIT & BLOC\n${hbRecords.filter(h => h.payments.length > 0).map(h => `${h.patientName} (${h.type})\n${h.payments.map(p => `  ${formatAr(p.amount)} — ${p.paidBy}`).join('\n')}`).join('\n')}\n\n3. TOTAL GÉNÉRAL\n${'═'.repeat(32)}\n   ${formatAr(grandTotal)}\n\n4. CLIENTS\n${todayInvoices.map(inv => { const pat = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : null; return `${pat ? `${pat.lastName} ${pat.firstName}` : inv.clientName || 'Ext.'} — ${formatAr(inv.patientCharge)}`; }).join('\n')}\n${hbRecords.filter(h => h.payments.length > 0).map(h => `${h.patientName} — ${formatAr(h.payments.reduce((s,p) => s+p.amount, 0))}`).join('\n')}`)} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm cursor-pointer flex items-center gap-2"><Printer className="w-4 h-4" /> 🧾 80×80</button>
              </div>
              <div className="bg-white border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">1. Versements par famille</h4><div className="grid grid-cols-3 gap-2"><div className="p-3 bg-green-50 rounded flex justify-between"><span>Consultations</span><span className="font-mono font-bold">{formatAr(todayTotal - todayExtTotal)}</span></div><div className="p-3 bg-purple-50 rounded flex justify-between"><span>Ventes Ext.</span><span className="font-mono font-bold">{formatAr(todayExtTotal)}</span></div><div className="p-3 bg-rose-50 rounded flex justify-between"><span>Hospit/Bloc</span><span className="font-mono font-bold">{formatAr(todayPartialTotal)}</span></div></div></div>
              {hbRecords.filter(h => h.payments.length > 0).length > 0 && <div className="bg-white border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">2. Hospitalisation & Bloc</h4><table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Patient</th><th className="p-2">Type</th><th className="p-2 text-right">Facture</th><th className="p-2 text-right">Reçu</th><th className="p-2 text-right">Reste</th><th className="p-2">Caissier</th></tr></thead><tbody>{hbRecords.filter(h => h.payments.length > 0).map(h => { const tf = h.lines.reduce((s,l) => s+hbLineAmt(l),0); const tp = h.payments.reduce((s,p) => s+p.amount,0); return (<tr key={h.id} className="border-b"><td className="p-2">{h.patientName}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${h.type==='hospit'?'bg-rose-100 text-rose-700':'bg-blue-100 text-blue-700'}`}>{h.type==='hospit'?'Hosp.':'Bloc'}</span></td><td className="p-2 text-right font-mono">{formatAr(tf)}</td><td className="p-2 text-right font-mono text-green-600">{formatAr(tp)}</td><td className="p-2 text-right font-mono text-red-600">{formatAr(tf-tp)}</td><td className="p-2">{h.payments.map(p => p.paidBy).filter((v,i,a) => a.indexOf(v)===i).join(', ')}</td></tr>); })}</tbody></table></div>}
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-lg p-6 text-center"><div className="text-sm text-slate-600">3. TOTAL GÉNÉRAL</div><div className="text-4xl font-bold font-mono text-emerald-700">{formatAr(grandTotal)}</div></div>
              <div className="bg-white border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">4. Liste clients</h4><table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Heure</th><th className="p-2 text-left">Client</th><th className="p-2">Type</th><th className="p-2 text-right">Montant</th></tr></thead><tbody>
                {todayInvoices.map(inv => { const pat = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : null; return (<tr key={inv.id} className="border-b"><td className="p-2 font-mono">{new Date(inv.paidAt || '').toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td className="p-2">{pat ? `${pat.lastName} ${pat.firstName}` : inv.clientName || 'Ext.'}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${inv.isExternal ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>{inv.isExternal ? 'Externe' : 'Consult.'}</span></td><td className="p-2 text-right font-mono font-bold">{formatAr(inv.patientCharge)}</td></tr>); })}
                {hbRecords.filter(h => h.payments.length > 0).map(h => { const tp = h.payments.reduce((s,p) => s+p.amount,0); return (<tr key={h.id} className="border-b"><td className="p-2">—</td><td className="p-2">{h.patientName}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${h.type==='hospit'?'bg-rose-100 text-rose-700':'bg-blue-100 text-blue-700'}`}>{h.type==='hospit'?'Hosp.':'Bloc'}</span></td><td className="p-2 text-right font-mono font-bold">{formatAr(tp)}</td></tr>); })}
              </tbody><tfoot className="bg-emerald-50"><tr><td colSpan={3} className="p-2 text-right font-bold">TOTAL:</td><td className="p-2 text-right font-mono font-bold text-lg">{formatAr(grandTotal)}</td></tr></tfoot></table></div>
            </div>
          )}
        </div>
      </div>

      {/* === MODALS === */}

      {/* Add Patient Modal */}
      {hbModal === 'add_patient' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto">
            <div className={`px-4 py-3 flex justify-between items-center text-white ${tab === 'hospit' ? 'bg-rose-600' : 'bg-blue-600'}`}><span className="font-bold"><UserPlus className="w-5 h-5 inline" /> Ajouter Patient — {tab === 'hospit' ? 'Hospitalisation' : 'Bloc'}</span><button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5" /></button></div>
            <div className="p-4 space-y-3">
              {/* Search existing */}
              <div><label className="block text-sm font-medium mb-1">Rechercher patient existant</label>
                <input type="text" value={hbPatSearch} onChange={e => setHbPatSearch(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="🔍 Nom, prénom ou dossier..." />
                {hbPatFiltered.length > 0 && <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto">{hbPatFiltered.map(p => (<div key={p.id} onClick={() => hbSelectPatient(p.id)} className="p-2 hover:bg-blue-50 cursor-pointer text-sm flex justify-between border-b"><span className="font-medium">{p.lastName} {p.firstName}</span><span className="text-slate-400 text-xs">{p.dossier} | {p.clientType === 'societe' ? `🏢 ${p.company}` : '🏪 Comptoir'}</span></div>))}</div>}
              </div>
              <div className="border-t pt-3">
                <h4 className="font-bold text-sm mb-2">Ou créer un nouveau patient :</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="col-span-2 flex items-center gap-3 mb-1">
                    <span className="font-bold text-slate-700">Sexe</span>
                    <div className="flex border border-slate-400 rounded overflow-hidden">
                      <button type="button" onClick={() => setHbNewPat({...hbNewPat, gender: 'M'})} className={`px-3 py-1 font-bold cursor-pointer ${hbNewPat.gender === 'M' ? 'bg-blue-500 text-white' : 'bg-white'}`}>M</button>
                      <button type="button" onClick={() => setHbNewPat({...hbNewPat, gender: 'F'})} className={`px-3 py-1 font-bold border-l border-slate-400 cursor-pointer ${hbNewPat.gender === 'F' ? 'bg-pink-500 text-white' : 'bg-white'}`}>F</button>
                    </div>
                  </div>
                  <div><label className="block font-bold text-slate-700 mb-0.5">Nom *</label><input type="text" value={hbNewPat.lastName} onChange={e => setHbNewPat({...hbNewPat, lastName: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" /></div>
                  <div><label className="block font-bold text-slate-700 mb-0.5">Prénom *</label><input type="text" value={hbNewPat.firstName} onChange={e => setHbNewPat({...hbNewPat, firstName: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" /></div>
                  <div><label className="block font-bold text-slate-700 mb-0.5">Date Naissance</label><input type="date" value={hbNewPat.dateOfBirth} onChange={e => setHbNewPat({...hbNewPat, dateOfBirth: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none bg-white" /></div>
                  <div><label className="block font-bold text-slate-700 mb-0.5">Age</label><input type="text" readOnly value={hbNewPat.dateOfBirth ? calculateAge(hbNewPat.dateOfBirth) : '—'} className="w-full px-2 py-1.5 border rounded bg-slate-100" /></div>
                  <div><label className="block font-bold text-slate-700 mb-0.5">Matricule</label><input type="text" value={hbNewPat.matricule} onChange={e => setHbNewPat({...hbNewPat, matricule: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none font-mono bg-white" placeholder="M-0000" /></div>
                  <div><label className="block font-bold text-slate-700 mb-0.5">Téléphone</label><input type="text" value={hbNewPat.contact} onChange={e => setHbNewPat({...hbNewPat, contact: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none font-mono bg-white" placeholder="034 00 000 00" /></div>
                  <div className="col-span-2"><label className="block font-bold text-slate-700 mb-0.5">Adresse</label><input type="text" value={hbNewPat.address} onChange={e => setHbNewPat({...hbNewPat, address: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" /></div>
                  <div><label className="block font-bold text-slate-700 mb-0.5">N° Sécurité Sociale</label><input type="text" value={hbNewPat.ssn} onChange={e => setHbNewPat({...hbNewPat, ssn: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none bg-white" /></div>
                  <div><label className="block font-bold text-slate-700 mb-0.5">Nom de l'assuré</label><input type="text" value={hbNewPat.insureName} onChange={e => setHbNewPat({...hbNewPat, insureName: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" /></div>
                  <div><label className="block font-bold text-slate-700 mb-0.5">Type Client</label><select value={hbNewPat.clientType} onChange={e => setHbNewPat({...hbNewPat, clientType: e.target.value as ClientType})} className="w-full px-2 py-1.5 border rounded outline-none cursor-pointer bg-white"><option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option></select></div>
                  {hbNewPat.clientType === 'societe' && <div><label className="block font-bold text-slate-700 mb-0.5">Société</label><select value={hbNewPat.company} onChange={e => setHbNewPat({...hbNewPat, company: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none cursor-pointer bg-white"><option value="">— Sélectionner —</option>{state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}</select></div>}
                  {hbNewPat.clientType === 'societe' && <div className="col-span-2"><label className="block font-bold text-slate-700 mb-0.5">Sous-société (libre)</label><input type="text" value={hbNewPat.subCompany} onChange={e => setHbNewPat({...hbNewPat, subCompany: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" placeholder="Direction, Service..." /></div>}
                </div>
                <button onClick={hbAddNewPatient} className="mt-3 w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer flex items-center justify-center gap-2"><UserPlus className="w-4 h-4" /> Créer et ajouter</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prescription Modal — Full Sage-style window */}
      {hbModal === 'add_article' && hbSelRecordId && (() => {
        const rec = hbRecords.find(r => r.id === hbSelRecordId);
        const recTotal = rec ? rec.lines.reduce((s, l) => s + hbLineAmt(l), 0) : 0;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
            <div className="bg-emerald-600 px-4 py-3 flex justify-between items-center text-white rounded-t-xl">
              <span className="font-bold flex items-center gap-1">💊 Prescription (Saisie Sage) — {rec?.patientName} ({rec?.type === 'hospit' ? 'Hospitalisation' : 'Bloc'})</span>
              <button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              {/* Date de sortie — persiste entre les saisies */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <label className="text-xs font-bold text-amber-800 whitespace-nowrap">📅 Date d'acte / de sortie :</label>
                <input type="date" value={hbDateSort} onChange={e => {
                  setHbDateSort(e.target.value);
                  setHbArtForm(prev => ({ ...prev, dateSort: e.target.value }));
                }} className="px-2 py-1 border border-amber-400 rounded text-sm outline-none focus:border-amber-600 bg-white" />
                <span className="text-[10px] text-amber-600 italic">Cette date est conservée pour les prochaines lignes</span>
              </div>

              {/* Sage-style input bar */}
              <div className="bg-[#f4f4f4] border border-slate-300 rounded text-xs select-none">
                <div className="bg-slate-100 border-b border-slate-300 p-2 m-2 mb-0 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-1.5">
                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Date</label>
                      <input
                        type="date"
                        value={hbArtForm.dateSort || hbDateSort}
                        onChange={e => setHbArtForm(prev => ({ ...prev, dateSort: e.target.value }))}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                    <div className="flex-1 min-w-[150px] relative">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Article (↑↓ Entrée)</label>
                      <input
                        ref={hbArtRef}
                        type="text"
                        value={hbArtForm.articleName && !hbArtSearch ? hbArtForm.articleName : hbArtSearch}
                        onChange={e => {
                          setHbArtSearch(e.target.value);
                          setHbArtIdx(0);
                          if (hbArtForm.articleName && e.target.value !== hbArtForm.articleName) {
                            setHbArtForm(prev => ({ ...prev, articleName: '' }));
                          }
                        }}
                        onKeyDown={hbArtKeyDown}
                        className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 text-slate-800"
                        placeholder="🔍 Saisir article..."
                        autoFocus
                      />
                      {hbArtSearch.length >= 1 && hbArtFiltered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                          {hbArtFiltered.map((a, idx) => (
                            <div
                              key={a.id}
                              onClick={() => hbArtSelectArticle(a.id)}
                              className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b border-slate-100 ${idx === hbArtIdx ? 'bg-blue-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}
                            >
                              <span>[{a.family}] {a.name}</span>
                              <span className={`font-mono ${idx === hbArtIdx ? 'text-white' : 'text-blue-600 font-medium'}`}>{formatAr(getPrice(a, rec?.clientType || 'comptoir'))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-16">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Qté</label>
                      <input
                        id="hb-qty-input"
                        type="number"
                        min={1}
                        value={hbArtForm.quantity}
                        onChange={e => setHbArtForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                    <div className="w-16">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Rem%</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={hbArtForm.discount}
                        onChange={e => setHbArtForm(prev => ({ ...prev, discount: parseInt(e.target.value) || 0 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">P.U.</label>
                      <input
                        type="number"
                        value={hbArtForm.unitPrice}
                        onChange={e => setHbArtForm(prev => ({ ...prev, unitPrice: parseInt(e.target.value) || 0 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Montant</label>
                      <input
                        readOnly
                        value={formatAr(hbLineAmt(hbArtForm))}
                        className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono font-bold text-slate-700"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5 mt-2">
                    <button
                      onClick={hbArtNew}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 transition cursor-pointer text-xs font-medium"
                    >
                      <Plus className="h-3.5 w-3.5 text-slate-500" /> Nouveau
                    </button>
                    <button
                      onClick={hbArtDelete}
                      disabled={!hbSelLineId}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 disabled:opacity-40 transition cursor-pointer text-xs font-medium"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Supprimer
                    </button>
                    <button
                      onClick={hbArtSave}
                      disabled={!hbArtForm.articleName}
                      className="flex items-center gap-1 px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white border border-sky-600 rounded shadow-sm font-semibold disabled:opacity-40 transition cursor-pointer text-xs"
                    >
                      <Save className="h-3.5 w-3.5" /> Enregistrer
                    </button>
                  </div>
                </div>

                {/* Lines table */}
                <div className="bg-white mx-2 mb-2 border-t border-slate-300 overflow-x-auto rounded-b max-h-[250px] overflow-y-auto">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
                      <tr className="divide-x divide-slate-200">
                        <th className="p-1 font-normal w-20">Date</th>
                        <th className="p-1 font-normal min-w-[150px]">Article</th>
                        <th className="p-1 font-normal text-right w-12">Qté</th>
                        <th className="p-1 font-normal text-center w-12">Rem%</th>
                        <th className="p-1 font-normal text-right w-20">P.U.</th>
                        <th className="p-1 font-normal text-right w-24">Montant</th>
                        <th className="p-1 font-normal w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-mono">
                      {rec && rec.lines.map(l => {
                        const isSel = l.id === hbSelLineId;
                        return (
                          <tr key={l.id} onClick={() => {
                            setHbSelLineId(l.id);
                            setHbArtForm({ ...l });
                            setHbIsNew(false);
                          }} className={`cursor-pointer divide-x divide-slate-200 transition-colors ${isSel ? 'bg-blue-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}>
                            <td className="p-1 font-sans">{l.dateSort || '—'}</td>
                            <td className="p-1 font-sans">{l.articleName}</td>
                            <td className="p-1 text-right">{l.quantity}</td>
                            <td className="p-1 text-center">{l.discount ? `${l.discount}%` : '—'}</td>
                            <td className="p-1 text-right">{l.unitPrice.toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-right font-bold">{hbLineAmt(l).toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-center">
                              <button onClick={(e) => {
                                e.stopPropagation();
                                setHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, lines: r.lines.filter(x => x.id !== l.id) } : r));
                                if (hbSelLineId === l.id) {
                                  hbArtNew();
                                }
                              }} className={`cursor-pointer ${isSel ? 'text-white hover:text-red-200' : 'text-rose-600 hover:text-rose-800'}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {rec && rec.lines.length === 0 && (
                        <tr><td colSpan={7} className="p-4 text-center text-slate-400 font-sans">Aucun article enregistré. Tapez ou recherchez un article ci-dessus.</td></tr>
                      )}
                    </tbody>
                    {rec && rec.lines.length > 0 && (
                      <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 text-slate-800 font-sans">
                        <tr className="font-bold">
                          <td colSpan={4} className="p-1.5 text-right">TOTAL PATIENT :</td>
                          <td colSpan={3} className="p-1.5 text-right font-mono text-lg text-emerald-700">{formatAr(recTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              <button onClick={() => setHbModal('none')} className="w-full py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 cursor-pointer font-medium transition text-sm">✅ Terminer et fermer</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Edit Client Type Modal */}
      {hbModal === 'edit_client' && hbSelRecordId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="bg-blue-600 px-4 py-3 flex justify-between items-center text-white rounded-t-xl"><span className="font-bold"><Edit2 className="w-5 h-5 inline" /> Modifier Type Client</span><button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5" /></button></div>
            <div className="p-4 space-y-3">
              <div><label className="block text-sm font-medium mb-1">Type</label><select value={hbEditClientType} onChange={e => setHbEditClientType(e.target.value as ClientType)} className="w-full px-3 py-2 border rounded-lg outline-none cursor-pointer"><option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option></select></div>
              {hbEditClientType === 'societe' && <div><label className="block text-sm font-medium mb-1">Société</label><select value={hbEditCompany} onChange={e => setHbEditCompany(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none cursor-pointer"><option value="">—</option>{state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}</select></div>}
              <button onClick={hbSaveClientType} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Print Ticket */}
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
