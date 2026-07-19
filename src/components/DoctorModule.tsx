import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Consultation, VitalSigns, Prescription, LabRequest, ClientType, Invoice, EchoRequest } from '../types';
import type { AppState } from '../store';
import { addAuditLog, addNotification, formatAr, getPrice, addJourneyEvent, labCategoryLabel } from '../store';
import { printPrescriptionTicket } from '../utils/printTicket';
import { Stethoscope, History, Trash2, AlertTriangle, Heart, FileText, Clock, CheckCircle, Send, Search, Edit2, RotateCcw, Save, Printer, FlaskConical, Scan } from 'lucide-react';

/** Types d'échographie proposés au médecin (saisie libre possible) */
const ECHO_TYPES = [
  'Échographie abdominale',
  'Échographie pelvienne',
  'Échographie obstétricale',
  'Échographie cardiaque (ETT)',
  'Échographie rénale',
  'Échographie thyroïdienne',
  'Échographie mammaire',
  'Échographie des parties molles',
  'Échographie Doppler',
  'Échographie prostatique',
];
const DEFAULT_ECHO_PRICE = 25000;

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

  // ---- Demandes d'analyses (Laboratoire) saisies par le médecin ----
  const [labSearch, setLabSearch] = useState('');
  const [labDraft, setLabDraft] = useState<{ examId: string; urgent: boolean }[]>([]);

  // ---- Demandes d'échographie ----
  const [echoDraft, setEchoDraft] = useState<{ examType: string; notes: string; urgent: boolean; price: number }[]>([]);
  const [echoType, setEchoType] = useState('');
  const [echoNotes, setEchoNotes] = useState('');
  const [echoUrgent, setEchoUrgent] = useState(false);
  const [echoPrice, setEchoPrice] = useState(DEFAULT_ECHO_PRICE);

  const myWaiting = state.patients.filter((p) => (!p.assignedDoctor || p.assignedDoctor === state.currentUser?.id) && p.status === 'waiting_consultation');
  const searchResults = searchQuery.length >= 2 ? state.patients.filter((p) => { const q = searchQuery.toLowerCase(); return p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) || p.dossier.toLowerCase().includes(q); }) : [];
  const selectedPatient = state.patients.find((p) => p.id === selectedPatientId);
  const patientConsultations = selectedPatientId ? state.consultations.filter((c) => c.patientId === selectedPatientId) : [];
  const clientType = selectedPatient?.clientType || 'comptoir';

  // Catalogue labo : recherche + prix + brouillon de demandes d'analyses
  const labFiltered = labSearch.length >= 1
    ? state.labCatalog.filter((e) => e.name.toLowerCase().includes(labSearch.toLowerCase()) || e.code.toLowerCase().includes(labSearch.toLowerCase()))
    : [];
  const priceForExam = (examId: string, ct: ClientType, urgent: boolean) => {
    const e = state.labCatalog.find((x) => x.id === examId);
    if (!e) return 0;
    if (urgent) return e.urgentPrice;
    return ct === 'societe' ? e.priceSociete : ct === 'externe' ? e.priceExterne : e.priceComptoir;
  };
  const labTotal = labDraft.reduce((s, d) => s + priceForExam(d.examId, clientType, d.urgent), 0);
  const echoTotal = echoDraft.reduce((s, d) => s + (d.price || 0), 0);
  const addLabExam = (examId: string) => {
    setLabDraft((prev) => (prev.some((d) => d.examId === examId) ? prev : [...prev, { examId, urgent: false }]));
    setLabSearch('');
  };
  const removeLabExam = (examId: string) => setLabDraft(labDraft.filter((d) => d.examId !== examId));
  const toggleLabUrgent = (examId: string) => setLabDraft(labDraft.map((d) => (d.examId === examId ? { ...d, urgent: !d.urgent } : d)));

  const addEchoExam = () => {
    const name = echoType.trim();
    if (!name) { alert('Indiquez le type d\'échographie'); return; }
    if (echoDraft.some((d) => d.examType.toLowerCase() === name.toLowerCase())) {
      alert('Cette échographie est déjà dans la liste');
      return;
    }
    setEchoDraft([...echoDraft, { examType: name, notes: echoNotes.trim(), urgent: echoUrgent, price: echoPrice || DEFAULT_ECHO_PRICE }]);
    setEchoType(''); setEchoNotes(''); setEchoUrgent(false); setEchoPrice(DEFAULT_ECHO_PRICE);
  };
  const removeEchoExam = (idx: number) => setEchoDraft(echoDraft.filter((_, i) => i !== idx));

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
    setLabDraft([]); setLabSearch(''); setEchoDraft([]); setEchoType(''); setEchoNotes(''); setEchoUrgent(false); setEchoPrice(DEFAULT_ECHO_PRICE);
    setConsultForm({ visitReason: '', diagnosis: '', notes: '', isEmergency: false, hospitalizeRequested: false, surgeryRequested: false });
    if (p?.vitalSigns) setVitals({ ...p.vitalSigns }); else setVitals({ temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' });
    setState((prev) => {
      const next = { ...prev, patients: prev.patients.map((x) => x.id === pid ? { ...x, status: 'in_consultation' as const, assignedDoctor: prev.currentUser?.id } : x) };
      addJourneyEvent(next, { patientId: pid, department: 'consultation', action: 'Consultation', status: 'in_consultation', details: `Dr. ${prev.currentUser?.name || ''}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name });
      return next;
    });
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
    // Ordonnance NON obligatoire : diagnostic seul, analyses et/ou échographies suffisent
    const ct = clientType;
    const consultId = uuidv4();
    // ---- Analyses labo -> facture en attente (bon imprimé à la CAISSE après paiement) ----
    const labInvoiceId = labDraft.length > 0 ? uuidv4() : null;
    const newLabRequests: LabRequest[] = labDraft.map((d) => {
      const e = state.labCatalog.find((x) => x.id === d.examId)!;
      const price = d.urgent ? e.urgentPrice : ct === 'societe' ? e.priceSociete : ct === 'externe' ? e.priceExterne : e.priceComptoir;
      return {
        id: uuidv4(), patientId: selectedPatientId, consultationId: consultId, examType: e.name, code: e.code,
        category: e.category, parameters: [...e.parameters], urgent: d.urgent, status: 'pending' as const,
        sampleType: e.sampleType, requestedBy: state.currentUser?.id || '', requestedAt: new Date().toISOString(),
        invoiceId: labInvoiceId || undefined, price,
      };
    });
    // ---- Échographies -> facture en attente (bon imprimé à la CAISSE après paiement) ----
    const echoInvoiceId = echoDraft.length > 0 ? uuidv4() : null;
    const newEchoRequests: EchoRequest[] = echoDraft.map((d) => ({
      id: uuidv4(), patientId: selectedPatientId, consultationId: consultId,
      examType: d.examType, notes: d.notes || undefined, urgent: d.urgent,
      status: 'pending' as const, requestedBy: state.currentUser?.id || '',
      requestedAt: new Date().toISOString(), invoiceId: echoInvoiceId || undefined, price: d.price,
    }));

    const consultation: Consultation = {
      id: consultId, patientId: selectedPatientId, doctorId: state.currentUser?.id || '', doctorName: state.currentUser?.name || '',
      date: new Date().toISOString(), vitalSigns: { ...vitals }, visitReason: consultForm.visitReason, diagnosis: consultForm.diagnosis, notes: consultForm.notes,
      prescriptions: lines.map((l) => ({ ...l })), labRequests: newLabRequests, echoRequests: newEchoRequests,
      hospitalizeRequested: consultForm.hospitalizeRequested, surgeryRequested: consultForm.surgeryRequested, isEmergency: consultForm.isEmergency,
    };

    const hasBillable = lines.length > 0 || newLabRequests.length > 0 || newEchoRequests.length > 0;
    const nextStatus = hasBillable ? 'consulted_awaiting_payment' as const : 'completed' as const;
    const grandTotal = totalPres + labTotal + echoTotal;

    setState((prev) => {
      let next: AppState = {
        ...prev,
        consultations: [...prev.consultations, consultation],
        patients: prev.patients.map((p) => p.id === selectedPatientId
          ? { ...p, status: nextStatus, lastVisitAt: new Date().toISOString() }
          : p),
      };
      if (newLabRequests.length > 0 && labInvoiceId) {
        const labItems = newLabRequests.map((lr) => ({ description: `${lr.examType}${lr.urgent ? ' (Urgent)' : ''}`, amount: lr.price || 0, category: 'lab' as const }));
        const labTotalAmt = labItems.reduce((s, i) => s + i.amount, 0);
        const labInv: Invoice = {
          id: labInvoiceId, patientId: selectedPatientId, consultationId: consultation.id, clientType: ct,
          items: labItems, totalAmount: labTotalAmt, patientCharge: labTotalAmt,
          status: 'pending' as const, createdAt: new Date().toISOString(), isExternal: ct === 'externe',
        };
        next = { ...next, labRequests: [...next.labRequests, ...newLabRequests], invoices: [...next.invoices, labInv] };
        addAuditLog(next, 'DEMANDE_ANALYSE', `${newLabRequests.map((r) => r.examType).join(', ')} — ${formatAr(labTotalAmt)} (${selectedPatient.dossier})`, selectedPatientId);
        addNotification(next, 'cashier', `🧪 Analyses à facturer: ${selectedPatient.lastName} ${selectedPatient.firstName} — ${formatAr(labTotalAmt)}`, 'info');
        addJourneyEvent(next, { patientId: selectedPatientId, department: 'consultation', action: "Demande d'analyse", status: 'analyses_pending', details: `${newLabRequests.map((r) => r.examType).join(', ')} — à facturer (caisse)`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, consultationId: consultation.id });
      }
      if (newEchoRequests.length > 0 && echoInvoiceId) {
        const echoItems = newEchoRequests.map((er) => ({ description: `${er.examType}${er.urgent ? ' (Urgent)' : ''}`, amount: er.price || 0, category: 'echo' as const }));
        const echoTotalAmt = echoItems.reduce((s, i) => s + i.amount, 0);
        const echoInv: Invoice = {
          id: echoInvoiceId, patientId: selectedPatientId, consultationId: consultation.id, clientType: ct,
          items: echoItems, totalAmount: echoTotalAmt, patientCharge: echoTotalAmt,
          status: 'pending' as const, createdAt: new Date().toISOString(), isExternal: ct === 'externe',
        };
        next = { ...next, invoices: [...next.invoices, echoInv] };
        addAuditLog(next, 'DEMANDE_ECHO', `${newEchoRequests.map((r) => r.examType).join(', ')} — ${formatAr(echoTotalAmt)} (${selectedPatient.dossier})`, selectedPatientId);
        addNotification(next, 'cashier', `📡 Échographie à facturer: ${selectedPatient.lastName} ${selectedPatient.firstName} — ${formatAr(echoTotalAmt)}`, 'info');
        addJourneyEvent(next, { patientId: selectedPatientId, department: 'imagerie', action: "Demande d'échographie", status: nextStatus, details: `${newEchoRequests.map((r) => r.examType).join(', ')} — à facturer (caisse)`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, consultationId: consultation.id });
      }
      addAuditLog(next, 'CONSULTATION', `${selectedPatient.lastName} — ${formatAr(grandTotal)}${lines.length === 0 ? ' (sans ordonnance)' : ''}`, selectedPatientId);
      addJourneyEvent(next, { patientId: selectedPatientId, department: 'consultation', action: 'Consultation terminée', status: nextStatus, details: `${formatAr(grandTotal)} — ${consultForm.diagnosis}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, consultationId: consultation.id });
      if (hasBillable) {
        addNotification(next, 'cashier', `💰 ${selectedPatient.lastName} ${selectedPatient.firstName} — ${formatAr(grandTotal)}`, 'info');
      }
      return next;
    });
    // Impression médecin : ordonnance UNIQUEMENT s'il y a des médicaments
    // (les bons labo / écho sortent à la CAISSE après paiement, avec le ticket)
    if (state.currentUser && lines.length > 0) {
      printPrescriptionTicket(state.ticketSettings, selectedPatient!, state.currentUser, new Date(), lines, consultForm.diagnosis);
    }
    setSelectedPatientId(null); setConsultForm({ visitReason: '', diagnosis: '', notes: '', isEmergency: false, hospitalizeRequested: false, surgeryRequested: false });
    setVitals({ temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' });
    setLines([]); setShowHistory(false); setSearchQuery(''); setSelectedLineId(null); setIsNewLine(false);
    setLabDraft([]); setLabSearch(''); setEchoDraft([]); setEchoType(''); setEchoNotes(''); setEchoUrgent(false); setEchoPrice(DEFAULT_ECHO_PRICE);
    setView('queue');
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
                  {lines.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-slate-400 font-sans">Ordonnance optionnelle — tapez un article (↑↓ Entrée) ou validez sans médicament</td></tr>}
                </tbody>
                {lines.length > 0 && <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 font-sans">
                  <tr className="divide-x divide-emerald-200"><td colSpan={4} className="p-1 text-right font-bold">TOTAL:</td><td colSpan={2} className="p-1 text-right font-mono font-bold text-lg text-emerald-800">{formatAr(totalPres)}</td></tr>
                </tfoot>}
              </table>
            </div>
          </div>

          {/* DEMANDES D'ANALYSES — LABORATOIRE (saisies par le médecin) */}
          <div className="bg-white rounded-xl shadow-sm border p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm flex items-center gap-2"><FlaskConical className="w-4 h-4 text-cyan-600" /> Demandes d'analyses (Laboratoire)</h4>
              <span className="text-[10px] text-slate-400 hidden sm:block">Facturées à la caisse (onglet Laboratoire) puis transmises au labo après paiement</span>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input type="text" value={labSearch} onChange={(e) => setLabSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 text-sm" placeholder="Rechercher un examen (NFS, Glycémie, Créatinine...)" />
              {labSearch.length >= 1 && labFiltered.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-xl z-30 max-h-48 overflow-y-auto">
                  {labFiltered.map((e) => {
                    const already = labDraft.some((d) => d.examId === e.id);
                    return (
                      <div key={e.id} onClick={() => addLabExam(e.id)} className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b border-slate-100 ${already ? 'opacity-40 bg-slate-50' : 'hover:bg-cyan-50'}`}>
                        <span><span className="text-[9px] text-slate-400 mr-1">[{e.code}]</span> {e.name} <span className="text-slate-400">· {labCategoryLabel(e.category)}</span></span>
                        <span className="font-mono text-cyan-600">{formatAr(clientType === 'societe' ? e.priceSociete : clientType === 'externe' ? e.priceExterne : e.priceComptoir)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {labDraft.length > 0 ? (
              <div className="border rounded-lg divide-y">
                {labDraft.map((d) => {
                  const e = state.labCatalog.find((x) => x.id === d.examId);
                  if (!e) return null;
                  return (
                    <div key={d.examId} className="flex items-center justify-between p-2 text-sm">
                      <div>
                        <div className="font-medium text-slate-800">{e.name} <span className="text-[10px] text-slate-400">{e.code} · {labCategoryLabel(e.category)}</span></div>
                        <div className="text-[10px] text-slate-400">{e.sampleType} · {e.durationHours}h</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-[10px] cursor-pointer"><input type="checkbox" checked={d.urgent} onChange={() => toggleLabUrgent(d.examId)} className="w-3.5 h-3.5" /> <span className="text-red-600 font-semibold">Urgent</span></label>
                        <span className="font-mono font-bold text-slate-700 w-24 text-right">{formatAr(priceForExam(d.examId, clientType, d.urgent))}</span>
                        <button onClick={() => removeLabExam(d.examId)} className="text-rose-600 hover:text-rose-800 cursor-pointer" title="Retirer"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between items-center p-2 bg-cyan-50 text-sm font-bold">
                  <span>Total analyses</span>
                  <span className="font-mono">{formatAr(labTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-2 border border-dashed rounded-lg">Aucune analyse sélectionnée — recherchez un examen ci-dessus.</p>
            )}
          </div>


          {/* DEMANDES D'ÉCHOGRAPHIE */}
          <div className="bg-white rounded-xl shadow-sm border p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm flex items-center gap-2"><Scan className="w-4 h-4 text-indigo-600" /> Demandes d'échographie</h4>
              <span className="text-[10px] text-slate-400 hidden sm:block">Bon imprimé à la caisse après paiement</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-2">
              <div className="md:col-span-4">
                <label className="block text-[10px] text-slate-500 mb-0.5">Type d'échographie</label>
                <input
                  list="echo-types"
                  type="text"
                  value={echoType}
                  onChange={(e) => setEchoType(e.target.value)}
                  className="w-full px-2 py-1.5 border border-indigo-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Ex: Échographie abdominale..."
                />
                <datalist id="echo-types">
                  {ECHO_TYPES.map((t) => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[10px] text-slate-500 mb-0.5">Notes / indication</label>
                <input type="text" value={echoNotes} onChange={(e) => setEchoNotes(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg outline-none text-sm" placeholder="Indication clinique..." />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] text-slate-500 mb-0.5">Tarif (Ar)</label>
                <input type="number" min={0} value={echoPrice} onChange={(e) => setEchoPrice(parseInt(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg outline-none text-sm font-mono text-right" />
              </div>
              <div className="md:col-span-1 flex items-end pb-1">
                <label className="flex items-center gap-1 text-[10px] cursor-pointer"><input type="checkbox" checked={echoUrgent} onChange={(e) => setEchoUrgent(e.target.checked)} className="w-3.5 h-3.5" /> <span className="text-red-600 font-semibold">Urg.</span></label>
              </div>
              <div className="md:col-span-2 flex items-end">
                <button type="button" onClick={addEchoExam} className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer">+ Ajouter</button>
              </div>
            </div>
            {echoDraft.length > 0 ? (
              <div className="border rounded-lg divide-y">
                {echoDraft.map((d, idx) => (
                  <div key={`${d.examType}-${idx}`} className="flex items-center justify-between p-2 text-sm">
                    <div>
                      <div className="font-medium text-slate-800">{d.examType}{d.urgent && <span className="ml-1 text-[10px] text-red-600 font-bold">[URGENT]</span>}</div>
                      {d.notes && <div className="text-[10px] text-slate-400">{d.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-700 w-24 text-right">{formatAr(d.price)}</span>
                      <button onClick={() => removeEchoExam(idx)} className="text-rose-600 hover:text-rose-800 cursor-pointer" title="Retirer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center p-2 bg-indigo-50 text-sm font-bold">
                  <span>Total échographies</span>
                  <span className="font-mono">{formatAr(echoTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-2 border border-dashed rounded-lg">Aucune échographie — saisissez un type ci-dessus (liste ou libre).</p>
            )}
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
              <Send className="w-5 h-5" /> Valider — {formatAr(totalPres + labTotal + echoTotal)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
