import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Consultation, VitalSigns, Prescription } from '../types';
import type { AppState } from '../store';
import { addAuditLog, addNotification, formatAr, getPrice } from '../store';
import { printPrescriptionTicket } from '../utils/printTicket';
import { Stethoscope, History, Trash2, AlertTriangle, Heart, FileText, Clock, CheckCircle, Send, Search, Edit2, RotateCcw, Save, Printer } from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type ViewMode = 'queue' | 'consultation' | 'my_consults';

export default function DoctorModule({ state, setState }: Props) {
  const [view, setView] = useState<ViewMode>('queue');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [articleSearch, setArticleSearch] = useState('');
  const [artSearchIdx, setArtSearchIdx] = useState(0);
  const [consultForm, setConsultForm] = useState({ visitReason: '', diagnosis: '', notes: '', isEmergency: false, hospitalizeRequested: false, surgeryRequested: false });
  const [vitals, setVitals] = useState<VitalSigns>({ temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' });
  const [lines, setLines] = useState<Prescription[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState<Prescription>({ id: '', articleId: '', articleName: '', quantity: 1, posology: '', duration: '', instructions: '', unitPrice: 0, discount: 0, delivered: false });
  const [isNewLine, setIsNewLine] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const myWaiting = state.patients.filter((p) => (!p.assignedDoctor || p.assignedDoctor === state.currentUser?.id) && p.status === 'waiting_consultation');
  const searchResults = searchQuery.length >= 2 ? state.patients.filter((p) => { const q = searchQuery.toLowerCase(); return p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) || p.dossier.toLowerCase().includes(q); }) : [];
  const selectedPatient = state.patients.find((p) => p.id === selectedPatientId);
  const patientConsultations = selectedPatientId ? state.consultations.filter((c) => c.patientId === selectedPatientId) : [];
  const clientType = selectedPatient?.clientType || 'comptoir';

  // Article search across ALL families
  const filteredArticles = articleSearch.length >= 1
    ? state.articles.filter((a) => a.name.toLowerCase().includes(articleSearch.toLowerCase()))
    : [];

  const today = new Date().toDateString();
  const myTodayConsults = state.consultations.filter((c) => c.doctorId === state.currentUser?.id && new Date(c.date).toDateString() === today);

  useEffect(() => {
    const line = lines.find(l => l.id === selectedLineId);
    if (line && !isNewLine) setLineForm({ ...line });
  }, [selectedLineId]);

  const updateLineForm = (key: string, val: any) => {
    setLineForm(prev => {
      const u = { ...prev, [key]: val };
      return u;
    });
  };

  const lineAmount = (l: Prescription) => Math.round(l.unitPrice * l.quantity * (1 - l.discount / 100));
  const totalPres = lines.reduce((s, l) => s + lineAmount(l), 0);

  const selectPatient = (pid: string) => {
    const p = state.patients.find((x) => x.id === pid);
    setSelectedPatientId(pid); setLines([]); setSelectedLineId(null); setIsNewLine(false); setView('consultation');
    if (p?.vitalSigns) setVitals({ ...p.vitalSigns }); else setVitals({ temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' });
    setState((prev) => ({ ...prev, patients: prev.patients.map((x) => x.id === pid ? { ...x, status: 'in_consultation' as const, assignedDoctor: prev.currentUser?.id } : x) }));
  };

  // Keyboard navigation in search results
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setArtSearchIdx(i => Math.min(i + 1, filteredArticles.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setArtSearchIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredArticles.length > 0 && articleSearch) {
        const a = filteredArticles[artSearchIdx];
        if (a) handleArticleSelect(a.id);
      } else if (lineForm.articleName) {
        handleSaveLine(); // Enter = validate current line
      }
    }
    else if (e.key === 'Escape') { setArticleSearch(''); }
  };

  const handleArticleSelect = (articleId: string) => {
    const a = state.articles.find((x) => x.id === articleId);
    if (!a) return;
    const nl: Prescription = { id: uuidv4(), articleId: a.id, articleName: a.name, quantity: 1, posology: '', duration: '', instructions: '', unitPrice: getPrice(a, clientType), discount: 0, delivered: false };
    setLineForm({ ...nl }); setSelectedLineId(nl.id); setIsNewLine(true); setArticleSearch(''); setArtSearchIdx(0);
  };

  const handleSaveLine = () => {
    if (!lineForm.articleName) return;
    if (isNewLine || !lines.find(l => l.id === lineForm.id)) {
      setLines([...lines, { ...lineForm }]);
    } else {
      setLines(lines.map(l => l.id === lineForm.id ? { ...lineForm } : l));
    }
    setIsNewLine(false);
    // Focus back to search
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleDeleteLine = () => {
    if (!selectedLineId) return;
    setLines(lines.filter(l => l.id !== selectedLineId));
    setSelectedLineId(null);
    setLineForm({ id: '', articleId: '', articleName: '', quantity: 1, posology: '', duration: '', instructions: '', unitPrice: 0, discount: 0, delivered: false });
  };

  const getConsultStatus = (c: Consultation) => {
    const inv = state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid');
    const allDel = c.prescriptions.length > 0 && c.prescriptions.every((p) => p.delivered);
    if (allDel) return { label: '💊 Livré', color: 'bg-emerald-100 text-emerald-800', canReturn: false, canEdit: false };
    if (inv) return { label: '✅ Payé', color: 'bg-green-100 text-green-800', canReturn: true, canEdit: false };
    return { label: '⏳ Attente', color: 'bg-amber-100 text-amber-800', canReturn: false, canEdit: true };
  };

  const returnToCashier = (cid: string) => {
    const c = state.consultations.find((x) => x.id === cid);
    if (!c || !confirm('Retourner à la caisse ?')) return;
    setState((prev) => ({ ...prev, consultations: prev.consultations.map((x) => x.id === cid ? { ...x, prescriptions: x.prescriptions.map((p) => ({ ...p, delivered: false })) } : x), patients: prev.patients.map((p) => p.id === c.patientId ? { ...p, status: 'consulted_awaiting_payment' as const } : p), invoices: prev.invoices.filter((i) => i.consultationId !== cid) }));
  };

  const reEditConsultation = (cid: string) => {
    const c = state.consultations.find((x) => x.id === cid);
    if (!c) return;
    setSelectedPatientId(c.patientId); setConsultForm({ visitReason: c.visitReason, diagnosis: c.diagnosis, notes: c.notes, isEmergency: c.isEmergency, hospitalizeRequested: c.hospitalizeRequested, surgeryRequested: c.surgeryRequested });
    setVitals({ ...c.vitalSigns }); setLines([...c.prescriptions]); setView('consultation');
    setState((prev) => ({ ...prev, consultations: prev.consultations.filter((x) => x.id !== cid), patients: prev.patients.map((p) => p.id === c.patientId ? { ...p, status: 'in_consultation' as const } : p) }));
  };

  const submitConsultation = () => {
    if (!selectedPatientId || !selectedPatient || !consultForm.diagnosis) { alert('Diagnostic obligatoire'); return; }
    if (lines.length === 0) { alert('Ajoutez au moins une ligne'); return; }
    const consultation: Consultation = {
      id: uuidv4(), patientId: selectedPatientId, doctorId: state.currentUser?.id || '', doctorName: state.currentUser?.name || '',
      date: new Date().toISOString(), vitalSigns: { ...vitals }, visitReason: consultForm.visitReason, diagnosis: consultForm.diagnosis, notes: consultForm.notes,
      prescriptions: lines.map((l) => ({ ...l })), labRequests: [], hospitalizeRequested: consultForm.hospitalizeRequested, surgeryRequested: consultForm.surgeryRequested, isEmergency: consultForm.isEmergency,
    };
    setState((prev) => {
      const next = { ...prev, consultations: [...prev.consultations, consultation], patients: prev.patients.map((p) => p.id === selectedPatientId ? { ...p, status: 'consulted_awaiting_payment' as const } : p) };
      addAuditLog(next, 'CONSULTATION', `${selectedPatient.lastName} — ${formatAr(totalPres)}`, selectedPatientId);
      addNotification(next, 'cashier', `💰 ${selectedPatient.lastName} ${selectedPatient.firstName} — ${formatAr(totalPres)}`, 'info');
      return next;
    });
    // Impression automatique de l'ordonnance
    if (state.currentUser) {
      printPrescriptionTicket(state.ticketSettings, selectedPatient, state.currentUser, new Date(), lines, consultForm.diagnosis);
    }
    setSelectedPatientId(null); setConsultForm({ visitReason: '', diagnosis: '', notes: '', isEmergency: false, hospitalizeRequested: false, surgeryRequested: false });
    setVitals({ temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' });
    setLines([]); setShowHistory(false); setSearchQuery(''); setSelectedLineId(null); setIsNewLine(false); setView('queue');
  };

  const printPrescription = (c: Consultation) => {
    const pat = state.patients.find((p) => p.id === c.patientId);
    if (!pat || !state.currentUser) return;
    printPrescriptionTicket(state.ticketSettings, pat, state.currentUser, new Date(c.date), c.prescriptions, c.diagnosis);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border cursor-pointer hover:border-amber-400" onClick={() => setView('queue')}><div className="flex items-center gap-3"><div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div><div><div className="text-2xl font-bold">{myWaiting.length}</div><div className="text-sm text-slate-500">En attente</div></div></div></div>
        <div className="bg-white rounded-xl p-4 shadow-sm border cursor-pointer hover:border-emerald-400" onClick={() => setView('my_consults')}><div className="flex items-center gap-3"><div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600" /></div><div><div className="text-2xl font-bold">{myTodayConsults.length}</div><div className="text-sm text-slate-500">Mes consultations (auj.)</div></div></div></div>
      </div>

      {/* MY CONSULTS */}
      {view === 'my_consults' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-3 border-b bg-emerald-50 flex justify-between"><h3 className="font-semibold text-emerald-800"><FileText className="w-5 h-5 inline" /> Consultations du jour</h3><button onClick={() => setView('queue')} className="px-3 py-1 bg-slate-200 hover:bg-slate-300 rounded text-sm cursor-pointer">← File</button></div>
          <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-slate-100 sticky top-0"><tr><th className="p-2 text-left">Heure</th><th className="p-2 text-left">Patient</th><th className="p-2 text-right">Montant</th><th className="p-2 text-center">Statut</th><th className="p-2 text-center">Action</th></tr></thead>
            <tbody>{myTodayConsults.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">Aucune</td></tr>
              : myTodayConsults.map((c) => { const pat = state.patients.find((p) => p.id === c.patientId); const st = getConsultStatus(c); const total = c.prescriptions.reduce((s, p) => s + Math.round(p.unitPrice * p.quantity * (1 - p.discount / 100)), 0);
                return (<tr key={c.id} className="border-b hover:bg-slate-50"><td className="p-2 font-mono">{new Date(c.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td className="p-2 font-medium">{pat?.lastName} {pat?.firstName} <span className="text-xs text-slate-400">({pat?.dossier})</span></td><td className="p-2 text-right font-mono font-bold">{formatAr(total)}</td><td className="p-2 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${st.color}`}>{st.label}</span></td><td className="p-2 text-center flex gap-1 justify-center flex-wrap"><button onClick={() => printPrescription(c)} className="px-2 py-1 bg-slate-700 text-white rounded text-xs cursor-pointer" title="Imprimer l'ordonnance"><Printer className="w-3 h-3 inline" /></button>{st.canEdit && <button onClick={() => reEditConsultation(c.id)} className="px-2 py-1 bg-blue-500 text-white rounded text-xs cursor-pointer"><Edit2 className="w-3 h-3 inline" /> Mod.</button>}{st.canReturn && <button onClick={() => returnToCashier(c.id)} className="px-2 py-1 bg-amber-500 text-white rounded text-xs cursor-pointer"><RotateCcw className="w-3 h-3 inline" /> Caisse</button>}</td></tr>); })}</tbody>
          </table></div>
        </div>
      )}

      {/* QUEUE */}
      {view === 'queue' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-3">
            <div className="bg-white rounded-xl shadow-sm border p-3"><div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-lg outline-none text-sm" placeholder="Rechercher patient..." /></div>
              {searchQuery.length >= 2 && searchResults.length > 0 && <div className="mt-2 max-h-40 overflow-y-auto border rounded divide-y">{searchResults.map((p) => (<div key={p.id} onClick={() => selectPatient(p.id)} className="p-2 hover:bg-emerald-50 cursor-pointer text-sm">{p.lastName} {p.firstName} ({p.dossier})</div>))}</div>}
            </div>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="p-3 border-b bg-amber-50"><h3 className="font-semibold text-sm"><Clock className="w-4 h-4 inline text-amber-500" /> File ({myWaiting.length})</h3></div>
              <div className="divide-y max-h-[500px] overflow-y-auto">{myWaiting.length === 0 ? <div className="p-6 text-center text-slate-400 text-sm">Aucun</div>
                : myWaiting.map((p) => (<div key={p.id} onClick={() => selectPatient(p.id)} className="p-3 cursor-pointer hover:bg-emerald-50"><div className="font-medium text-sm">{p.lastName} {p.firstName}</div><div className="text-xs text-slate-500">{p.dossier}{p.company ? ` • ${p.company}` : ''}</div>{p.allergies.length > 0 && <div className="text-xs text-red-600"><AlertTriangle className="w-3 h-3 inline" /> {p.allergies.join(', ')}</div>}</div>))}</div>
            </div>
          </div>
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-12 text-center text-slate-400"><Stethoscope className="w-16 h-16 mx-auto mb-4 opacity-30" /><p>Sélectionnez un patient</p></div>
        </div>
      )}

      {/* CONSULTATION */}
      {view === 'consultation' && selectedPatient && (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border p-3">
            <div className="flex justify-between items-start">
              <div><h3 className="font-bold text-lg">{selectedPatient.lastName} {selectedPatient.firstName} <span className="text-sm font-mono text-blue-600">({selectedPatient.dossier})</span>{selectedPatient.company && <span className="ml-2 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">{selectedPatient.company}</span>}</h3><div className="text-sm text-slate-500">{selectedPatient.gender === 'M' ? 'H' : 'F'} | {selectedPatient.age}</div></div>
              <div className="flex gap-2"><button onClick={() => setShowHistory(!showHistory)} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs cursor-pointer"><History className="w-3 h-3 inline" /> ({patientConsultations.length})</button><button onClick={() => setView('queue')} className="px-2 py-1 bg-slate-200 rounded text-xs cursor-pointer">← Retour</button></div>
            </div>
            {selectedPatient.allergies.length > 0 && <div className="mt-1 p-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700"><AlertTriangle className="w-3 h-3 inline" /> {selectedPatient.allergies.join(', ')}</div>}
          </div>

          {showHistory && <div className="bg-white rounded-xl shadow-sm border p-3 max-h-40 overflow-y-auto text-xs">{patientConsultations.length === 0 ? <p className="text-slate-400">Premier passage</p> : patientConsultations.map((c) => (<div key={c.id} className="p-1.5 bg-slate-50 rounded mb-1"><strong>{new Date(c.date).toLocaleDateString('fr-FR')}</strong> — {c.diagnosis}</div>))}</div>}

          {/* Vitals + Consult */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <div className="bg-white rounded-xl shadow-sm border p-3">
              <h4 className="font-semibold mb-1 text-xs"><Heart className="w-3 h-3 text-red-500 inline" /> Constantes</h4>
              <div className="grid grid-cols-4 gap-1">{[{l:'T°C',k:'temperature' as const},{l:'PAS',k:'bloodPressureSystolic' as const},{l:'PAD',k:'bloodPressureDiastolic' as const},{l:'FC',k:'heartRate' as const},{l:'SpO2',k:'oxygenSaturation' as const},{l:'Poids',k:'weight' as const},{l:'Taille',k:'height' as const}].map(v => (<div key={v.k}><label className="text-[9px] text-slate-500">{v.l}</label><input type="number" step="0.1" value={vitals[v.k]||''} onChange={(e)=>setVitals({...vitals,[v.k]:e.target.value})} className="w-full px-1 py-0.5 border rounded text-xs outline-none" placeholder="—" /></div>))}</div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-3">
              <h4 className="font-semibold mb-1 text-xs"><FileText className="w-3 h-3 text-emerald-500 inline" /> Consultation</h4>
              <div className="space-y-1">
                <input type="text" value={consultForm.visitReason} onChange={(e)=>setConsultForm({...consultForm,visitReason:e.target.value})} className="w-full px-2 py-0.5 border rounded text-xs outline-none" placeholder="Motif (optionnel)" />
                <textarea value={consultForm.diagnosis} onChange={(e)=>setConsultForm({...consultForm,diagnosis:e.target.value})} className="w-full px-2 py-0.5 border border-red-300 rounded text-xs outline-none" rows={2} placeholder="Diagnostic * (obligatoire)" />
                <textarea value={consultForm.notes} onChange={(e)=>setConsultForm({...consultForm,notes:e.target.value})} className="w-full px-2 py-0.5 border rounded text-xs outline-none" rows={1} placeholder="Notes" />
                <div className="flex gap-3 text-[10px]">
                  <label className="cursor-pointer"><input type="checkbox" checked={consultForm.isEmergency} onChange={(e)=>setConsultForm({...consultForm,isEmergency:e.target.checked})} /> <span className="text-red-600">🚨 Urgence</span></label>
                  <label className="cursor-pointer"><input type="checkbox" checked={consultForm.hospitalizeRequested} onChange={(e)=>setConsultForm({...consultForm,hospitalizeRequested:e.target.checked})} /> Hospit.</label>
                  <label className="cursor-pointer"><input type="checkbox" checked={consultForm.surgeryRequested} onChange={(e)=>setConsultForm({...consultForm,surgeryRequested:e.target.checked})} /> <span className="text-blue-600">🏥 Bloc</span></label>
                </div>
              </div>
            </div>
          </div>

          {/* SAGE-STYLE PRESCRIPTION — no family combo, single search field */}
          <div className="bg-[#f4f4f4] border border-slate-300 rounded">
            {/* Sage form bar */}
            <div className="bg-slate-100 border-b border-slate-300 p-1.5 m-2 mb-0 rounded shadow-inner">
              <div className="flex flex-wrap items-end gap-1">
                <div className="flex-1 min-w-[140px] relative">
                  <label className="block text-[9px] text-slate-500">Article (tapez + ↑↓ + Entrée)</label>
                  <input ref={searchRef} type="text" value={isNewLine && lineForm.articleName ? lineForm.articleName : articleSearch}
                    onChange={(e) => { setArticleSearch(e.target.value); setArtSearchIdx(0); }}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500"
                    placeholder="🔍 Tapez le nom..." />
                  {articleSearch.length >= 1 && filteredArticles.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-xl z-30 max-h-40 overflow-y-auto">
                      {filteredArticles.map((a, idx) => (
                        <div key={a.id} onClick={() => handleArticleSelect(a.id)}
                          className={`px-2 py-1 cursor-pointer text-xs flex justify-between border-b border-slate-100 ${idx === artSearchIdx ? 'bg-blue-100' : 'hover:bg-blue-50'}`}>
                          <span><span className="text-[9px] text-slate-400 mr-1">[{a.family}]</span> {a.name}</span>
                          <span className="font-mono text-blue-600">{formatAr(getPrice(a, clientType))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="w-14"><label className="block text-[9px] text-slate-500">Qté</label><input type="number" min={1} value={lineForm.quantity} onChange={(e)=>updateLineForm('quantity',parseInt(e.target.value)||1)} onKeyDown={(e)=>{ if(e.key==='Enter'){e.preventDefault();handleSaveLine();}}} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500" /></div>
                <div className="w-28"><label className="block text-[9px] text-slate-500">Posologie</label><input type="text" value={lineForm.posology} onChange={(e)=>updateLineForm('posology',e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter'){e.preventDefault();handleSaveLine();}}} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs outline-none focus:border-blue-500" placeholder="1cp 3x/j" /></div>
                <div className="w-14"><label className="block text-[9px] text-slate-500">Remise%</label><input type="number" min={0} max={100} value={lineForm.discount} onChange={(e)=>updateLineForm('discount',parseInt(e.target.value)||0)} onKeyDown={(e)=>{ if(e.key==='Enter'){e.preventDefault();handleSaveLine();}}} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500" /></div>
                <div className="w-20"><label className="block text-[9px] text-slate-500">P.U.</label><input type="text" readOnly value={formatAr(lineForm.unitPrice)} className="w-full bg-slate-200 border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono" /></div>
                <div className="w-24"><label className="block text-[9px] text-slate-500">Montant</label><input type="text" readOnly value={formatAr(lineAmount(lineForm))} className="w-full bg-slate-200 border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono font-bold text-slate-700" /></div>
              </div>
              <div className="flex justify-end gap-1 mt-1">
                <button onClick={handleDeleteLine} disabled={!selectedLineId} className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 rounded shadow-sm text-slate-700 text-[10px] disabled:opacity-40 cursor-pointer"><Trash2 className="h-3 w-3 text-rose-600" /> Supprimer</button>
                <button onClick={handleSaveLine} disabled={!lineForm.articleName} className="flex items-center gap-1 px-2 py-0.5 bg-sky-500 text-white border border-sky-600 rounded shadow-sm text-[10px] font-medium disabled:opacity-40 cursor-pointer"><Save className="h-3 w-3" /> Enregistrer</button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white mx-2 mb-2 border-t border-slate-300 overflow-x-auto rounded-b">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
                  <tr className="divide-x divide-slate-200"><th className="p-1 min-w-[130px]">Désignation</th><th className="p-1 text-right w-12">Qté</th><th className="p-1 w-24">Posologie</th><th className="p-1 text-center w-12">Rem%</th><th className="p-1 text-right w-20">P.U.</th><th className="p-1 text-right w-24">Montant</th></tr>
                </thead>
                <tbody className="divide-y font-mono">
                  {lines.map((l) => {
                    const isSel = l.id === selectedLineId;
                    return (<tr key={l.id} onClick={() => { setSelectedLineId(l.id); setIsNewLine(false); }} className={`cursor-pointer divide-x divide-slate-200 transition-colors ${isSel ? 'bg-blue-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}>
                      <td className="p-1 font-sans">{l.articleName}</td><td className="p-1 text-right">{l.quantity}</td><td className="p-1 font-sans">{l.posology || '—'}</td><td className="p-1 text-center">{l.discount > 0 ? `${l.discount}%` : '—'}</td><td className="p-1 text-right">{l.unitPrice.toLocaleString('fr-FR')}</td><td className="p-1 text-right font-bold">{lineAmount(l).toLocaleString('fr-FR')}</td>
                    </tr>);
                  })}
                  {lines.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-slate-400 font-sans">Tapez un article ci-dessus (↑↓ pour naviguer, Entrée pour ajouter)</td></tr>}
                </tbody>
                {lines.length > 0 && <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 font-sans">
                  <tr className="divide-x divide-emerald-200"><td colSpan={4} className="p-1 text-right font-bold">TOTAL:</td><td colSpan={2} className="p-1 text-right font-mono font-bold text-lg text-emerald-800">{formatAr(totalPres)}</td></tr>
                </tfoot>}
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => lines.length > 0 && state.currentUser && printPrescriptionTicket(state.ticketSettings, selectedPatient!, state.currentUser, new Date(), lines, consultForm.diagnosis)}
              disabled={lines.length === 0}
              className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-semibold hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer shadow-lg"
            >
              <Printer className="w-5 h-5" /> Aperçu ordonnance
            </button>
            <button onClick={submitConsultation} className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2 cursor-pointer shadow-lg">
              <Send className="w-5 h-5" /> Valider — {formatAr(totalPres)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
