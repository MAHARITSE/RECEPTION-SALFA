import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { LabRequest, Patient, ClientType, LabExamCatalog, LabCategory } from '../types';
import type { AppState } from '../store';
import {
  addAuditLog, addNotification, addJourneyEvent, LAB_NORMS,
  labCategoryLabel, LAB_CATEGORIES, generateDossierNumber, calculateAge, formatAr,
} from '../store';
import { printLabResultTicket } from '../utils/printTicket';
import {
  FlaskConical, Clock, CheckCircle, AlertTriangle, Send, Microscope, FileSearch,
  Plus, Search, X, Printer, Syringe, Check,
} from 'lucide-react';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

interface DispLab {
  lr: LabRequest;
  patient?: Patient;
  patientName: string;
  doctorName: string;
  source: 'consultation' | 'standalone';
  consultationId?: string;
  paid: boolean;
  billable: boolean;
}

type Tab = 'to_bill' | 'awaiting' | 'in_progress' | 'completed' | 'all';

export default function LaboratoryModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('to_bill');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [activeLab, setActiveLab] = useState<DispLab | null>(null);
  const [resultValues, setResultValues] = useState<Record<string, number>>({});

  // Nouvelle demande
  const [showNew, setShowNew] = useState(false);
  const [patSearch, setPatSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [newPat, setNewPat] = useState({ lastName: '', firstName: '', gender: 'F' as 'M' | 'F', dateOfBirth: '', contact: '', clientType: 'comptoir' as ClientType, company: '' });
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [sampleType, setSampleType] = useState('Sang veineux');

  // ---- Ajout d'un examen au catalogue (formulaire d'ajout d'article) ----
  const [showAddExam, setShowAddExam] = useState(false);
  const [examForm, setExamForm] = useState<LabExamCatalog>({
    id: '', code: '', name: '', category: 'biochimie', parameters: [], sampleType: 'Sang veineux',
    priceComptoir: 0, priceSociete: 0, priceExterne: 0, urgentPrice: 0, durationHours: 4, defaultUrgent: false,
  });

  const createExam = () => {
    if (!examForm.name.trim() || !examForm.code.trim()) { alert('Le code et le nom de l\'examen sont obligatoires.'); return; }
    const code = examForm.code.trim().toUpperCase();
    if (state.labCatalog.some((e) => e.code.toLowerCase() === code.toLowerCase())) { alert('Ce code existe déjà dans le catalogue.'); return; }
    const params = examForm.parameters.length
      ? examForm.parameters
      : (document.getElementById('lab-params') as HTMLInputElement)?.value.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean) || [];
    const newExam: LabExamCatalog = {
      id: uuidv4(), code, name: examForm.name.trim(),
      category: examForm.category,
      parameters: params,
      sampleType: examForm.sampleType.trim() || 'Sang veineux',
      priceComptoir: examForm.priceComptoir || 0, priceSociete: examForm.priceSociete || 0,
      priceExterne: examForm.priceExterne || 0, urgentPrice: examForm.urgentPrice || examForm.priceComptoir || 0,
      durationHours: examForm.durationHours || 4, defaultUrgent: examForm.defaultUrgent,
    };
    setState((prev) => ({ ...prev, labCatalog: [...prev.labCatalog, newExam] }));
    setShowAddExam(false);
    setExamForm({ id: '', code: '', name: '', category: 'biochimie', parameters: [], sampleType: 'Sang veineux', priceComptoir: 0, priceSociete: 0, priceExterne: 0, urgentPrice: 0, durationHours: 4, defaultUrgent: false });
    alert(`Examen « ${newExam.name} » (${newExam.code}) ajouté au catalogue.`);
  };

  // ---- Agrégation des demandes (consultations + autonomes) ----
  const allLabs: DispLab[] = [];
  state.consultations.forEach((c) => {
    const patient = state.patients.find((p) => p.id === c.patientId);
    const inv = state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid');
    c.labRequests.forEach((lr) => {
      const canProcess = !!inv || c.isEmergency;
      allLabs.push({
        lr, patient,
        patientName: `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim(),
        doctorName: c.doctorName, source: 'consultation', consultationId: c.id,
        paid: !!inv, billable: !canProcess,
      });
    });
  });
  state.labRequests.forEach((lr) => {
    const patient = lr.patientId ? state.patients.find((p) => p.id === lr.patientId) : undefined;
    const patientName = patient
      ? `${patient.lastName} ${patient.firstName}`
      : (lr.patientId ? 'Inconnu' : 'Patient externe');
    const inv = lr.invoiceId ? state.invoices.find((i) => i.id === lr.invoiceId) : undefined;
    const paid = inv?.status === 'paid';
    allLabs.push({
      lr, patient, patientName,
      doctorName: state.users.find((u) => u.id === lr.requestedBy)?.name || '',
      source: 'standalone', paid, billable: !paid,
    });
  });

  const filtered = allLabs.filter((d) => {
    if (search) {
      const q = search.toLowerCase();
      if (!d.patientName.toLowerCase().includes(q) && !(d.lr.examType.toLowerCase().includes(q))) return false;
    }
    if (filterCat !== 'all' && (d.lr.category || 'autre') !== filterCat) return false;
    if (tab === 'to_bill') return d.lr.status === 'pending';
    if (tab === 'awaiting') return d.lr.status === 'paid' || d.lr.status === 'sample_received';
    if (tab === 'in_progress') return d.lr.status === 'in_progress';
    if (tab === 'completed') return d.lr.status === 'completed';
    return true;
  });

  const counts = {
    to_bill: allLabs.filter((d) => d.lr.status === 'pending').length,
    awaiting: allLabs.filter((d) => d.lr.status === 'paid' || d.lr.status === 'sample_received').length,
    in_progress: allLabs.filter((d) => d.lr.status === 'in_progress').length,
    completed: allLabs.filter((d) => d.lr.status === 'completed').length,
  };

  // ---- Mise à jour d'une demande (consultation OU autonome) ----
  const patchLab = (d: DispLab, patch: Partial<LabRequest>, journeyEvent?: Parameters<typeof addJourneyEvent>[1]) => {
    setState((prev) => {
      let next: AppState;
      if (d.consultationId) {
        next = {
          ...prev,
          consultations: prev.consultations.map((c) =>
            c.id === d.consultationId
              ? { ...c, labRequests: c.labRequests.map((l) => (l.id === d.lr.id ? { ...l, ...patch } : l)) }
              : c,
          ),
        };
      } else {
        next = { ...prev, labRequests: prev.labRequests.map((l) => (l.id === d.lr.id ? { ...l, ...patch } : l)) };
      }
      if (journeyEvent) addJourneyEvent(next, journeyEvent);
      return next;
    });
  };

  const receiveSample = (d: DispLab) => {
    patchLab(d, { sampleReceived: true, sampleReceivedAt: new Date().toISOString(), status: 'sample_received' },
      { patientId: d.patient?.id || d.lr.patientId || '', department: 'laboratoire', action: 'Échantillon réceptionné', details: `${d.lr.examType} — ${d.lr.sampleType || sampleType}`, actorId: state.currentUser?.id, actorName: state.currentUser?.name, labRequestId: d.lr.id });
    setActiveLab({ ...d, lr: { ...d.lr, status: 'sample_received', sampleReceived: true } });
  };

  const startAnalysis = (d: DispLab) => {
    patchLab(d, { status: 'in_progress' },
      { patientId: d.patient?.id || d.lr.patientId || '', department: 'laboratoire', action: 'Analyse en cours', details: d.lr.examType, actorId: state.currentUser?.id, actorName: state.currentUser?.name, labRequestId: d.lr.id });
    setActiveLab(d);
    setResultValues({});
  };

  const submitResults = (d: DispLab) => {
    const results = d.lr.parameters.map((param) => {
      const value = resultValues[param] || 0;
      const norm = LAB_NORMS[param];
      return {
        parameter: param, value,
        unit: norm?.unit || '',
        normalMin: norm?.min || 0, normalMax: norm?.max || 0,
        isAbnormal: norm ? value < norm.min || value > norm.max : false,
      };
    });
    const hasAbnormal = results.some((r) => r.isAbnormal);
    const targetUserId = d.consultationId
      ? state.consultations.find((c) => c.id === d.consultationId)?.doctorId
      : d.lr.requestedBy;

    setState((prev) => {
      let next: AppState;
      if (d.consultationId) {
        next = {
          ...prev,
          consultations: prev.consultations.map((c) =>
            c.id === d.consultationId
              ? { ...c, labRequests: c.labRequests.map((l) => (l.id === d.lr.id ? {
                  ...l, status: 'completed', results, completedAt: new Date().toISOString(),
                  completedBy: prev.currentUser?.id || '', validatedBy: prev.currentUser?.id || '',
                } : l)) }
              : c,
          ),
        };
      } else {
        next = {
          ...prev,
          labRequests: prev.labRequests.map((l) => (l.id === d.lr.id ? {
            ...l, status: 'completed', results, completedAt: new Date().toISOString(),
            completedBy: prev.currentUser?.id || '', validatedBy: prev.currentUser?.id || '',
          } : l)),
        };
      }
      addAuditLog(next, 'RESULTATS_ANALYSE', `Résultats ${d.lr.examType} pour ${d.patientName}${hasAbnormal ? ' — ANORMAL' : ''}`, d.patient?.id || d.lr.patientId);
      addNotification(
        next, 'doctor',
        hasAbnormal
          ? `🚨 Résultats ANORMAUX — ${d.lr.examType} pour ${d.patientName}`
          : `Résultats disponibles: ${d.lr.examType} pour ${d.patientName}`,
        hasAbnormal ? 'critical' : 'info', targetUserId,
      );
      addJourneyEvent(next, {
        patientId: d.patient?.id || d.lr.patientId || '', department: 'laboratoire',
        action: 'Résultats validés', status: 'completed',
        details: `${d.lr.examType}${hasAbnormal ? ' — ANORMAL' : ' — Normal'}`,
        actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, labRequestId: d.lr.id,
      });
      return next;
    });

    setActiveLab(null);
    setResultValues({});
    alert('Résultats validés et transmis au prescripteur !');
  };

  // ---- Nouvelle demande ----
  const patFiltered = patSearch.length >= 1
    ? state.patients.filter((p) => !p.blacklisted && (`${p.lastName} ${p.firstName}`.toLowerCase().includes(patSearch.toLowerCase()) || p.dossier.toLowerCase().includes(patSearch.toLowerCase())))
    : [];

  const createNewPatient = () => {
    if (!newPat.lastName || !newPat.firstName) { alert('Nom et prénom requis'); return; }
    const np: Patient = {
      id: uuidv4(), dossier: generateDossierNumber(newPat.lastName),
      firstName: newPat.firstName.toUpperCase(), lastName: newPat.lastName.toUpperCase(),
      dateOfBirth: newPat.dateOfBirth || 'N/A', age: newPat.dateOfBirth ? calculateAge(newPat.dateOfBirth) : 'N/A',
      gender: newPat.gender, address: '', contact: newPat.contact, ssn: '',
      allergies: [], chronicTreatments: [], antecedents: [],
      registeredAt: new Date().toISOString(), registeredBy: state.currentUser?.id || 'LABO', status: 'registered',
      clientType: newPat.clientType, company: newPat.clientType === 'societe' ? newPat.company : undefined,
    };
    setState((prev) => {
      const next = { ...prev, patients: [...prev.patients, np] };
      addAuditLog(next, 'ENREGISTREMENT', `Nouveau (labo): ${np.dossier} - ${np.lastName} ${np.firstName}`, np.id);
      return next;
    });
    setSelectedPatientId(np.id);
    setPatSearch('');
    setNewPat({ lastName: '', firstName: '', gender: 'F', dateOfBirth: '', contact: '', clientType: 'comptoir', company: '' });
  };

  const toggleExam = (id: string) => {
    setSelectedExamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const priceFor = (exam: typeof state.labCatalog[number], ct: ClientType) => {
    if (urgent) return exam.urgentPrice;
    return ct === 'societe' ? exam.priceSociete : ct === 'externe' ? exam.priceExterne : exam.priceComptoir;
  };

  const createRequests = () => {
    if (!selectedPatientId) { alert('Sélectionnez un patient'); return; }
    if (selectedExamIds.length === 0) { alert('Choisissez au moins un examen'); return; }
    const patient = state.patients.find((p) => p.id === selectedPatientId);
    if (!patient) return;
    const ct = patient.clientType;
    const chosen = state.labCatalog.filter((e) => selectedExamIds.includes(e.id));
    const invoiceId = uuidv4();
    const items = chosen.map((e) => ({ description: e.name, amount: priceFor(e, ct), category: 'lab' as const }));
    const total = items.reduce((s, i) => s + i.amount, 0);
    const reqIds: string[] = [];

    setState((prev) => {
      const newRequests: LabRequest[] = chosen.map((e) => {
        const id = uuidv4();
        reqIds.push(id);
        return {
          id, patientId: patient.id, examType: e.name, code: e.code, category: e.category,
          parameters: e.parameters, urgent, status: 'pending', sampleType: e.sampleType,
          requestedBy: prev.currentUser?.id, requestedAt: new Date().toISOString(),
          invoiceId, price: priceFor(e, ct),
        };
      });
      const inv = {
        id: invoiceId, patientId: patient.id, clientType: ct, items, totalAmount: total,
        patientCharge: total, status: 'pending' as const, createdAt: new Date().toISOString(), isExternal: ct === 'externe',
      };
      const next = { ...prev, labRequests: [...prev.labRequests, ...newRequests], invoices: [...prev.invoices, inv] };
      addAuditLog(next, 'DEMANDE_ANALYSE', `${chosen.map((c) => c.name).join(', ')} — ${formatAr(total)} (${patient.dossier})`, patient.id);
      addNotification(next, 'cashier', `🧪 Analyses à facturer: ${patient.lastName} ${patient.firstName} — ${formatAr(total)}`, 'info');
      addJourneyEvent(next, { patientId: patient.id, department: 'laboratoire', action: 'Demande d\'analyse', status: 'analyses_pending', details: `${chosen.map((c) => c.name).join(', ')} — à facturer`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name });
      return next;
    });

    alert(`Demande(s) créée(s) pour ${patient.lastName} ${patient.firstName}.\nÀ facturer en caisse : ${formatAr(total)}`);
    setShowNew(false);
    setSelectedPatientId(null);
    setSelectedExamIds([]);
    setUrgent(false);
    setSampleType('Sang veineux');
    setPatSearch('');
  };

  const openNew = () => { setShowNew(true); setSelectedPatientId(null); setPatSearch(''); setSelectedExamIds([]); setUrgent(false); setSampleType('Sang veineux'); };

  return (
    <div className="space-y-6 flex flex-col">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3"><div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{counts.to_bill}</div><div className="text-sm text-slate-500">À facturer</div></div></div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3"><div className="p-2 bg-cyan-100 rounded-lg"><Syringe className="w-5 h-5 text-cyan-600" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{counts.awaiting}</div><div className="text-sm text-slate-500">En attente / échantillon</div></div></div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3"><div className="p-2 bg-blue-100 rounded-lg"><Microscope className="w-5 h-5 text-blue-600" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{counts.in_progress}</div><div className="text-sm text-slate-500">En cours</div></div></div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3"><div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600" /></div>
            <div><div className="text-2xl font-bold text-slate-800">{counts.completed}</div><div className="text-sm text-slate-500">Terminées</div></div></div>
        </div>
      </div>

      {/* Barre d'actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 flex flex-wrap items-center gap-3">
        <button onClick={openNew} className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition font-medium text-sm flex items-center gap-2 cursor-pointer">
          <Plus className="w-4 h-4" /> Nouvelle demande
        </button>
        <button onClick={() => setShowAddExam(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium text-sm flex items-center gap-2 cursor-pointer">
          <Plus className="w-4 h-4" /> Ajouter un examen
        </button>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 text-sm" placeholder="Rechercher patient ou examen..." />
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm cursor-pointer">
          <option value="all">Toutes catégories</option>
          {LAB_CATEGORIES.map((c) => <option key={c} value={c}>{labCategoryLabel(c)}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {[
            { key: 'to_bill' as Tab, label: `À facturer (${counts.to_bill})` },
            { key: 'awaiting' as Tab, label: `En attente (${counts.awaiting})` },
            { key: 'in_progress' as Tab, label: `En cours (${counts.in_progress})` },
            { key: 'completed' as Tab, label: `Terminées (${counts.completed})` },
            { key: 'all' as Tab, label: 'Toutes' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.key ? 'border-cyan-500 text-cyan-600 bg-cyan-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Aucune analyse dans cet onglet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((d) => {
                const st = d.lr.status;
                const isActive = activeLab?.lr.id === d.lr.id;
                const patient = d.patient;
                return (
                  <div key={d.lr.id} className={`border rounded-xl overflow-hidden ${st === 'completed' ? ((d.lr.results || []).some((r) => r.isAbnormal) ? 'border-red-200' : 'border-emerald-200') : 'border-slate-200'}`}>
                    <div className={`p-4 flex items-center justify-between ${st === 'completed' ? ((d.lr.results || []).some((r) => r.isAbnormal) ? 'bg-red-50' : 'bg-emerald-50') : st === 'in_progress' ? 'bg-cyan-50' : 'bg-slate-50'}`}>
                      <div>
                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                          {d.patientName || '—'}
                          {d.lr.urgent && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">URGENT</span>}
                          {st === 'completed' && (d.lr.results || []).some((r) => r.isAbnormal) && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-bold">ANORMAL</span>}
                        </div>
                        <div className="text-sm text-slate-500 mt-0.5">{d.lr.examType} — {labCategoryLabel(d.lr.category || 'autre')}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Prescripteur: {d.doctorName || d.lr.requestedBy || '—'}
                          {patient ? ` · Dossier ${patient.dossier}` : ''}
                          {d.lr.sampleType ? ` · ${d.lr.sampleType}` : ''}
                          {d.billable && <span className="text-amber-600 font-semibold"> · 💳 À facturer</span>}
                          {st === 'completed' && d.lr.completedAt && ` · ${new Date(d.lr.completedAt).toLocaleDateString('fr-FR')}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {st === 'pending' && (
                          <span className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold">En attente de paiement (caisse)</span>
                        )}
                        {st === 'paid' && (
                          <button onClick={() => receiveSample(d)} className="px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-xs flex items-center gap-1 cursor-pointer">
                            <Syringe className="w-3.5 h-3.5" /> Réception échantillon
                          </button>
                        )}
                        {(st === 'sample_received') && (
                          <button onClick={() => startAnalysis(d)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs flex items-center gap-1 cursor-pointer">
                            <Microscope className="w-3.5 h-3.5" /> Commencer
                          </button>
                        )}
                        {st === 'in_progress' && !isActive && (
                          <button onClick={() => { setActiveLab(d); setResultValues({}); }} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs flex items-center gap-1 cursor-pointer">
                            <FileSearch className="w-3.5 h-3.5" /> Saisir résultats
                          </button>
                        )}
                        {st === 'in_progress' && isActive && (
                          <button onClick={() => submitResults(d)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs flex items-center gap-1 cursor-pointer">
                            <Send className="w-3.5 h-3.5" /> Valider
                          </button>
                        )}
                        {st === 'completed' && patient && (
                          <button onClick={() => printLabResultTicket(state.ticketSettings, patient, d.lr, d.doctorName, labCategoryLabel(d.lr.category || 'autre'))} className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs flex items-center gap-1 cursor-pointer">
                            <Printer className="w-3.5 h-3.5" /> Compte-rendu
                          </button>
                        )}
                        {isActive && (
                          <button onClick={() => setActiveLab(null)} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-xs cursor-pointer">Fermer</button>
                        )}
                      </div>
                    </div>

                    {/* Saisie des résultats */}
                    {isActive && (
                      <div className="p-4 border-t border-slate-200">
                        <h4 className="font-medium text-slate-700 mb-3 flex items-center gap-2"><FileSearch className="w-4 h-4" /> Saisie des résultats — {d.lr.examType}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {d.lr.parameters.map((param) => {
                            const norm = LAB_NORMS[param];
                            return (
                              <div key={param} className="p-3 bg-slate-50 rounded-lg">
                                <label className="text-sm font-medium text-slate-700">{param}</label>
                                {norm && <div className="text-xs text-slate-400 mt-0.5">Normes: {norm.min} – {norm.max} {norm.unit}</div>}
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    type="number" step="0.01"
                                    value={resultValues[param] || ''}
                                    onChange={(e) => setResultValues({ ...resultValues, [param]: parseFloat(e.target.value) || 0 })}
                                    className={`w-full px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 ${
                                      resultValues[param] !== undefined && norm && (resultValues[param] < norm.min || resultValues[param] > norm.max)
                                        ? 'border-red-400 focus:ring-red-500 bg-red-50' : 'border-slate-300 focus:ring-cyan-500'
                                    }`}
                                  />
                                  <span className="text-xs text-slate-500 whitespace-nowrap">{norm?.unit || ''}</span>
                                </div>
                                {resultValues[param] !== undefined && norm && (resultValues[param] < norm.min || resultValues[param] > norm.max) && (
                                  <div className="flex items-center gap-1 mt-1 text-xs text-red-600"><AlertTriangle className="w-3 h-3" /> HORS NORMES</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Résultats déjà validés */}
                    {st === 'completed' && d.lr.results && !isActive && (
                      <div className="p-4 border-t border-slate-200">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-slate-200 text-slate-500">
                            <th className="text-left py-2">Paramètre</th><th className="text-center py-2">Résultat</th>
                            <th className="text-center py-2">Normes</th><th className="text-center py-2">État</th>
                          </tr></thead>
                          <tbody>
                            {d.lr.results.map((r) => (
                              <tr key={r.parameter} className={r.isAbnormal ? 'bg-red-50' : ''}>
                                <td className="py-2 text-slate-700">{r.parameter}</td>
                                <td className={`py-2 text-center font-mono font-bold ${r.isAbnormal ? 'text-red-600' : 'text-green-600'}`}>{r.value} {r.unit}</td>
                                <td className="py-2 text-center text-xs text-slate-500">{r.normalMin} – {r.normalMax} {r.unit}</td>
                                <td className="py-2 text-center">
                                  {r.isAbnormal
                                    ? <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-bold flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" /> ANORMAL</span>
                                    : <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Normal</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* NOUVELLE DEMANDE — Inline (no modal) */}
      {showNew && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mt-0 order-first">
            <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold flex items-center gap-2"><FlaskConical className="w-5 h-5" /> Nouvelle demande d'analyse</span>
              <button onClick={() => setShowNew(false)} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
            </div>
            <div className="p-4 space-y-4">
              {/* 1. Patient */}
              {!selectedPatientId ? (
                <div>
                  <h4 className="font-semibold text-sm mb-2">1. Patient</h4>
                  <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type="text" value={patSearch} onChange={(e) => setPatSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500" placeholder="Rechercher un patient enregistré..." />
                  </div>
                  {patFiltered.length > 0 && (
                    <div className="border rounded-lg mt-2 max-h-40 overflow-y-auto divide-y">
                      {patFiltered.map((p) => (
                        <div key={p.id} onClick={() => setSelectedPatientId(p.id)} className="p-2 hover:bg-cyan-50 cursor-pointer text-sm flex justify-between">
                          <span className="font-medium">{p.lastName} {p.firstName}</span>
                          <span className="text-xs text-slate-400">{p.dossier} · {p.clientType === 'societe' ? p.company : 'Comptoir'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 p-3 bg-slate-50 rounded-lg border">
                    <div className="text-xs font-bold text-slate-600 mb-2">Ou créer un nouveau patient (externe / ponctuel)</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <input value={newPat.lastName} onChange={(e) => setNewPat({ ...newPat, lastName: e.target.value })} placeholder="Nom *" className="px-2 py-1.5 border rounded uppercase outline-none" />
                      <input value={newPat.firstName} onChange={(e) => setNewPat({ ...newPat, firstName: e.target.value })} placeholder="Prénom *" className="px-2 py-1.5 border rounded uppercase outline-none" />
                      <input type="date" value={newPat.dateOfBirth} onChange={(e) => setNewPat({ ...newPat, dateOfBirth: e.target.value })} className="px-2 py-1.5 border rounded outline-none" />
                      <input value={newPat.contact} onChange={(e) => setNewPat({ ...newPat, contact: e.target.value })} placeholder="Téléphone" className="px-2 py-1.5 border rounded outline-none" />
                      <select value={newPat.gender} onChange={(e) => setNewPat({ ...newPat, gender: e.target.value as 'M' | 'F' })} className="px-2 py-1.5 border rounded cursor-pointer">
                        <option value="F">Femme</option><option value="M">Homme</option>
                      </select>
                      <select value={newPat.clientType} onChange={(e) => setNewPat({ ...newPat, clientType: e.target.value as ClientType })} className="px-2 py-1.5 border rounded cursor-pointer">
                        <option value="comptoir">Comptoir</option><option value="societe">Société</option><option value="externe">Externe</option>
                      </select>
                      {newPat.clientType === 'societe' && (
                        <input value={newPat.company} onChange={(e) => setNewPat({ ...newPat, company: e.target.value })} placeholder="Société" className="px-2 py-1.5 border rounded uppercase col-span-2 outline-none" />
                      )}
                    </div>
                    <button onClick={createNewPatient} className="mt-2 w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium cursor-pointer flex items-center justify-center gap-2">
                      <Check className="w-4 h-4" /> Créer et sélectionner
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                  <div>
                    <span className="text-xs text-cyan-700 font-bold">Patient :</span>{' '}
                    <span className="font-semibold">{state.patients.find((p) => p.id === selectedPatientId)?.lastName} {state.patients.find((p) => p.id === selectedPatientId)?.firstName}</span>
                    <span className="text-xs text-slate-500"> ({state.patients.find((p) => p.id === selectedPatientId)?.dossier})</span>
                  </div>
                  <button onClick={() => setSelectedPatientId(null)} className="text-xs text-cyan-700 underline cursor-pointer">Changer</button>
                </div>
              )}

              {/* 2. Examens */}
              {selectedPatientId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm">2. Examens demandés</h4>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="w-4 h-4" />
                      <span className="text-red-600 font-semibold">Urgent (+ supplément)</span>
                    </label>
                  </div>
                  <div className="space-y-3 pr-1">
                    {LAB_CATEGORIES.map((cat) => {
                      const exams = state.labCatalog.filter((e) => e.category === cat);
                      if (exams.length === 0) return null;
                      const ct = state.patients.find((p) => p.id === selectedPatientId)?.clientType || 'comptoir';
                      return (
                        <div key={cat}>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-1">{labCategoryLabel(cat)}</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {exams.map((e) => {
                              const sel = selectedExamIds.includes(e.id);
                              const price = priceFor(e, ct);
                              return (
                                <button key={e.id} onClick={() => toggleExam(e.id)}
                                  className={`text-left p-2 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition ${sel ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                  <div>
                                    <div className="text-sm font-medium text-slate-800">{e.name}</div>
                                    <div className="text-[10px] text-slate-400">{e.code} · {e.sampleType} · {e.durationHours}h</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs font-mono font-bold text-slate-700">{formatAr(price)}</div>
                                    {sel && <Check className="w-4 h-4 text-cyan-600 mx-auto" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3">
                    <div className="text-sm">
                      <span className="text-slate-500">{selectedExamIds.length} examen(s) · </span>
                      <span className="font-bold font-mono text-slate-800">
                        {formatAr(state.labCatalog.filter((e) => selectedExamIds.includes(e.id)).reduce((s, e) => s + priceFor(e, state.patients.find((p) => p.id === selectedPatientId)?.clientType || 'comptoir'), 0))}
                      </span>
                    </div>
                    <button onClick={createRequests} disabled={selectedExamIds.length === 0} className="px-5 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 font-medium text-sm disabled:opacity-40 cursor-pointer flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Créer la demande
                    </button>
                  </div>
                </div>
              )}
            </div>
        </div>
      )}

      {/* AJOUT D'EXAMEN — Inline (no modal) */}
      {showAddExam && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mt-0 order-first">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold flex items-center gap-2"><FlaskConical className="w-5 h-5" /> Ajouter un examen au catalogue</span>
              <button onClick={() => setShowAddExam(false)} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Code *</label>
                  <input value={examForm.code} onChange={(e) => setExamForm({ ...examForm, code: e.target.value })} placeholder="ex: BIO009" className="w-full px-2 py-1.5 border rounded uppercase outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Nom *</label>
                  <input value={examForm.name} onChange={(e) => setExamForm({ ...examForm, name: e.target.value })} placeholder="ex: Magnésémie" className="w-full px-2 py-1.5 border rounded outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Catégorie</label>
                  <select value={examForm.category} onChange={(e) => setExamForm({ ...examForm, category: e.target.value as LabCategory })} className="w-full px-2 py-1.5 border rounded cursor-pointer">
                    {LAB_CATEGORIES.map((c) => <option key={c} value={c}>{labCategoryLabel(c)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Prélèvement</label>
                  <input value={examForm.sampleType} onChange={(e) => setExamForm({ ...examForm, sampleType: e.target.value })} placeholder="Sang veineux" className="w-full px-2 py-1.5 border rounded outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Paramètres (séparés par virgule)</label>
                <input id="lab-params" onChange={(e) => setExamForm({ ...examForm, parameters: e.target.value.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean) })} placeholder="Glucose, Sodium, Potassium" className="w-full px-2 py-1.5 border rounded outline-none" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div><label className="block text-[10px] font-bold text-slate-600 mb-1">Prix Comptoir</label><input type="number" value={examForm.priceComptoir} onChange={(e) => setExamForm({ ...examForm, priceComptoir: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded outline-none" /></div>
                <div><label className="block text-[10px] font-bold text-slate-600 mb-1">Prix Société</label><input type="number" value={examForm.priceSociete} onChange={(e) => setExamForm({ ...examForm, priceSociete: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded outline-none" /></div>
                <div><label className="block text-[10px] font-bold text-slate-600 mb-1">Prix Externe</label><input type="number" value={examForm.priceExterne} onChange={(e) => setExamForm({ ...examForm, priceExterne: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded outline-none" /></div>
                <div><label className="block text-[10px] font-bold text-slate-600 mb-1">Prix Urgent</label><input type="number" value={examForm.urgentPrice} onChange={(e) => setExamForm({ ...examForm, urgentPrice: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-slate-600 mb-1">Délai (heures)</label><input type="number" value={examForm.durationHours} onChange={(e) => setExamForm({ ...examForm, durationHours: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded outline-none" /></div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={examForm.defaultUrgent} onChange={(e) => setExamForm({ ...examForm, defaultUrgent: e.target.checked })} className="w-4 h-4" /> <span className="text-red-600 font-semibold">Urgent par défaut</span></label>
                </div>
              </div>
              <button onClick={createExam} className="w-full py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm cursor-pointer flex items-center justify-center gap-2">
                <Check className="w-4 h-4" /> Enregistrer l'examen
              </button>
            </div>
        </div>
      )}

    </div>
  );
}
