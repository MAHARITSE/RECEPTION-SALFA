import { useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { LabRequest, Patient, ClientType, LabExamCatalog, LabCategory, Article } from '../types';
import type { AppState } from '../store';
import type { Societe } from '../modules/assurance/types';
import { allocateFactureNumber, applySocieteUpsert, collectExistingFactureNumbers } from '../store';
import { SearchableSelect, optionsFromValues } from './SearchableSelect';
import { SuggestionInput, classerSuggestions } from './SuggestionInput';
import {
  addAuditLog, addNotification, addJourneyEvent, LAB_NORMS,
  labCategoryLabel, LAB_CATEGORIES, normalizeDossierNumber, isDossierTaken, calculateAge, formatAr, getLabCatalog, companyIsBlocked, companyOptions, sousSocietesConnues,
} from '../store';
import { printLabResultTicket } from '../utils/printTicket';
import { PhoneInput } from './PhoneInput';
import {
  FlaskConical, CheckCircle, AlertTriangle, Send, Microscope, FileSearch,
  Plus, Search, Printer, Check, Edit2,
} from 'lucide-react';
import { Select } from './Select';

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

type Tab = 'awaiting' | 'in_progress' | 'completed' | 'all';

export default function ModuleLaboratoire({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('awaiting');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [activeLab, setActiveLab] = useState<DispLab | null>(null);
  const [resultValues, setResultValues] = useState<Record<string, string | number>>({});
  const [resultAbnormal, setResultAbnormal] = useState<Record<string, boolean>>({});
  const [resultComments, setResultComments] = useState<Record<string, string>>({});
  const [labConclusion, setLabConclusion] = useState('');
  const [biologicalAlert, setBiologicalAlert] = useState(false);

  // Nouvelle demande
  const [showNew, setShowNew] = useState(false);
  const [patSearch, setPatSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [newPat, setNewPat] = useState({ dossier: '', lastName: '', firstName: '', gender: 'F' as 'M' | 'F', dateOfBirth: '', contact: '', clientType: 'comptoir' as ClientType, company: '' });

  // Saisie assistée : valeurs déjà connues dans la base
  // (appariement : noms/prénoms déjà portés ensemble passent en tête).
  const suggestionsNomsPatients = useMemo(() => classerSuggestions(
    state.patients.map(p => p.lastName),
    (nom) => state.patients.some(p =>
      (p.lastName || '').trim().toUpperCase() === nom.toUpperCase()
      && (p.firstName || '').trim().toUpperCase() === (newPat.firstName || '').trim().toUpperCase()),
  ), [state.patients, newPat.firstName]);
  const suggestionsPrenomsPatients = useMemo(() => classerSuggestions(
    state.patients.map(p => p.firstName),
    (pr) => state.patients.some(p =>
      (p.firstName || '').trim().toUpperCase() === pr.toUpperCase()
      && (p.lastName || '').trim().toUpperCase() === (newPat.lastName || '').trim().toUpperCase()),
  ), [state.patients, newPat.lastName]);
  // Edition société — toujours visible quand patient choisi (comme hospit/bloc)
  const [labEditClientType, setLabEditClientType] = useState<ClientType>('comptoir');
  const [labEditCompany, setLabEditCompany] = useState('');
  const [labEditSubCompany, setLabEditSubCompany] = useState('');
  const [labEditNewCompany, setLabEditNewCompany] = useState('');
  const [showLabClientTypeEdit, setShowLabClientTypeEdit] = useState(false);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [sampleType, setSampleType] = useState('Sang veineux');

  // ---- Ajout d'un examen au catalogue (formulaire d'ajout d'article) ----
  const [showAddExam, setShowAddExam] = useState(false);
  const [examForm, setExamForm] = useState<LabExamCatalog>({
    id: '', code: '', name: '', category: 'biochimie', parameters: [], sampleType: 'Sang veineux',
    priceComptoir: 0, priceSociete: 0, priceExterne: 0, urgentPrice: 0, durationHours: 4, defaultUrgent: false,
  });

  // Catalogue unifié : examens dérivés de la table `articles` (famille LABO),
  // avec repli sur le catalogue legacy `labCatalog` (même logique que Médecin et Caisse).
  const currentLabCatalog = getLabCatalog(state.articles, state.labCatalog);

  const createExam = () => {
    if (!examForm.name.trim() || !examForm.code.trim()) { alert('Le code et le nom de l\'examen sont obligatoires.'); return; }
    const code = examForm.code.trim().toUpperCase();
    if (currentLabCatalog.some((e) => e.code.toLowerCase() === code.toLowerCase()) || state.labCatalog.some((e) => e.code.toLowerCase() === code.toLowerCase())) { alert('Ce code existe déjà dans le catalogue.'); return; }
    const params = examForm.parameters.length
      ? examForm.parameters
      : (document.getElementById('lab-params') as HTMLInputElement)?.value.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean) || [];
    const newExamId = uuidv4();
    const newExam: LabExamCatalog = {
      id: newExamId, code, name: examForm.name.trim(),
      category: examForm.category,
      parameters: params,
      sampleType: examForm.sampleType.trim() || 'Sang veineux',
      priceComptoir: examForm.priceComptoir || 0, priceSociete: examForm.priceSociete || 0,
      priceExterne: examForm.priceExterne || 0, urgentPrice: examForm.urgentPrice || examForm.priceComptoir || 0,
      durationHours: examForm.durationHours || 4, defaultUrgent: examForm.defaultUrgent,
    };
    const newArticle: Article = {
      id: newExamId,
      name: newExam.name,
      code: newExam.code,
      barcode: newExam.code,
      family: 'LABO',
      unit: 'analyse',
      priceComptoir: newExam.priceComptoir,
      priceSociete: newExam.priceSociete,
      priceExterne: newExam.priceExterne,
      urgentPrice: newExam.urgentPrice,
      purchasePrice: 0,
      stockCentral: 0,
      stockPharmacie: 0,
      minStockCentral: 0,
      minStockPharmacie: 0,
      alertDisabledCentral: true,
      alertDisabledPharmacie: true,
      category: newExam.category,
      parameters: newExam.parameters,
      sampleType: newExam.sampleType,
      durationHours: newExam.durationHours,
    };
    setState((prev) => ({
      ...prev,
      labCatalog: [...prev.labCatalog, newExam],
      articles: [...(prev.articles || []).filter(a => a.id !== newExamId && a.name.toLowerCase() !== newExam.name.toLowerCase()), newArticle],
    }));
    setShowAddExam(false);
    setExamForm({ id: '', code: '', name: '', category: 'biochimie', parameters: [], sampleType: 'Sang veineux', priceComptoir: 0, priceSociete: 0, priceExterne: 0, urgentPrice: 0, durationHours: 4, defaultUrgent: false });
    alert(`Examen « ${newExam.name} » (${newExam.code}) ajouté au catalogue et intégré à la base des articles (famille LABO).`);
  };

  useEffect(() => {
    if (selectedPatientId) {
      const p = state.patients.find(x => x.id === selectedPatientId);
      if (p) {
        setLabEditClientType((p.clientType === 'externe' ? 'comptoir' : p.clientType) as ClientType);
        setLabEditCompany(p.company || '');
        setLabEditSubCompany(p.subCompany || '');
        setLabEditNewCompany('');
        setShowLabClientTypeEdit(false);
      }
    }
  }, [selectedPatientId, state.patients]);

  const addLabPartnerCompany = (rawName: string): string | null => {
    const name = rawName.trim().toUpperCase();
    if (!name) return null;
    const existing = state.companies.find(c => c.name.toUpperCase() === name);
    if (existing) return existing.name;
    setState(prev => ({ ...prev, companies: [...prev.companies, { id: `comp-${Date.now()}`, name, paymentMode: 'Crédit', settlementMode: 'monthly_global', createdAt: new Date().toISOString() }]}));
    return name;
  };
  const saveLabSociete = () => {
    if (!selectedPatientId) return;
    setState(prev => ({
      ...prev,
      patients: prev.patients.map(p => p.id === selectedPatientId ? { ...p, clientType: labEditClientType === 'externe' ? 'comptoir' : labEditClientType as 'comptoir'|'societe', company: labEditClientType === 'societe' ? labEditCompany : undefined, subCompany: labEditClientType === 'societe' ? labEditSubCompany : undefined } : p)
    }));
    setShowLabClientTypeEdit(false);
  };

  // ---- Agrégation des demandes (consultations + autonomes) ----
  const allLabs: DispLab[] = [];
  const seenLabIds = new Set<string>();

  state.consultations.forEach((c) => {
    const patient = state.patients.find((p) => p.id === c.patientId);
    const inv = state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid');
    (c.labRequests || []).forEach((lr) => {
      if (!seenLabIds.has(lr.id)) {
        seenLabIds.add(lr.id);
        const canProcess = !!inv || c.isEmergency;
        allLabs.push({
          lr, patient,
          patientName: `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim(),
          doctorName: c.doctorName, source: 'consultation', consultationId: c.id,
          paid: !!inv, billable: !canProcess,
        });
      }
    });
  });

  state.labRequests.forEach((lr) => {
    if (!seenLabIds.has(lr.id)) {
      seenLabIds.add(lr.id);
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
    }
  });

  // Le laboratoire ne liste que les examens déjà réglés / prêts à traiter.
  // Les demandes encore au statut `pending` restent visibles uniquement à la caisse,
  // afin de ne plus afficher de partie « À facturer » dans la liste laboratoire.
  // ⚠️ Tolérance : une demande restée `pending` mais dont la facture est payée est
  // quand même affichée (les demandes payées doivent TOUJOURS arriver au laboratoire).
  const visibleLabs = allLabs.filter((d) => !(d.lr.status === 'pending' && !d.paid));

  const isAwaitingStatus = (d: DispLab) =>
    d.lr.status === 'paid' || d.lr.status === 'sample_received' ||
    (d.lr.status === 'pending' && d.paid);

  // Ordre décroissant : dernier arrivé / dernière saisie en haut
  const filtered = visibleLabs
    .filter((d) => {
      if (search) {
        const q = search.toLowerCase();
        if (!d.patientName.toLowerCase().includes(q) && !(d.lr.examType.toLowerCase().includes(q))) return false;
      }
      if (filterCat !== 'all' && (d.lr.category || 'autre') !== filterCat) return false;
      if (tab === 'awaiting') return isAwaitingStatus(d);
      if (tab === 'in_progress') return d.lr.status === 'in_progress';
      if (tab === 'completed') return d.lr.status === 'completed';
      return true;
    })
    .sort((a, b) => new Date(b.lr.requestedAt || 0).getTime() - new Date(a.lr.requestedAt || 0).getTime());

  const counts = {
    awaiting: visibleLabs.filter((d) => isAwaitingStatus(d)).length,
    in_progress: visibleLabs.filter((d) => d.lr.status === 'in_progress').length,
    completed: visibleLabs.filter((d) => d.lr.status === 'completed').length,
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
              ? { ...c, labRequests: (c.labRequests || []).map((l) => (l.id === d.lr.id ? { ...l, ...patch } : l)) }
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

  const startAnalysis = (d: DispLab) => {
    patchLab(d, { status: 'in_progress' },
      { patientId: d.patient?.id || d.lr.patientId || '', department: 'laboratoire', action: 'Analyse en cours', details: d.lr.examType, actorId: state.currentUser?.id, actorName: state.currentUser?.name, labRequestId: d.lr.id });
    setActiveLab(d);
    setResultValues({});
    setResultAbnormal({});
    setResultComments({});
    setLabConclusion(d.lr.labConclusion || '');
    setBiologicalAlert(d.lr.biologicalAlert || false);
  };

  const submitResults = (d: DispLab) => {
    const missingParameters = d.lr.parameters.filter((param) => !String(resultValues[param] ?? '').trim());
    if (missingParameters.length > 0 && !window.confirm(`Attention : ${missingParameters.length} paramètre(s) ne sont pas renseignés (${missingParameters.join(', ')}). Valider malgré tout ?`)) return;
    const results = d.lr.parameters.map((param) => {
      const valRaw = resultValues[param];
      const valStr = valRaw !== undefined ? String(valRaw).trim() : '';
      const valNum = parseFloat(valStr);
      const valIsNumeric = !isNaN(valNum) && valStr !== '';
      const norm = LAB_NORMS[param];

      let isAbn = resultAbnormal[param] ?? false;
      if (valIsNumeric && norm) {
        if (valNum < norm.min || valNum > norm.max) {
          isAbn = true;
        }
      }

      return {
        parameter: param,
        value: valIsNumeric ? valNum : (valStr || '—'),
        unit: norm?.unit || '',
        normalMin: norm?.min || 0,
        normalMax: norm?.max || 0,
        normalRangeText: norm ? `${norm.min} - ${norm.max} ${norm.unit}` : undefined,
        isAbnormal: isAbn,
        comments: resultComments[param] || '',
      };
    });

    const hasAbnormal = results.some((r) => r.isAbnormal) || biologicalAlert;

    setState((prev) => {
      let next: AppState;
      if (d.consultationId) {
        next = {
          ...prev,
          consultations: prev.consultations.map((c) =>
            c.id === d.consultationId
              ? { ...c, labRequests: (c.labRequests || []).map((l) => (l.id === d.lr.id ? {
                  ...l, status: 'completed', results, labConclusion, biologicalAlert: hasAbnormal, completedAt: new Date().toISOString(),
                  completedBy: prev.currentUser?.id || '', validatedBy: prev.currentUser?.id || '',
                } : l)) }
              : c,
          ),
        };
      } else {
        next = {
          ...prev,
          labRequests: prev.labRequests.map((l) => (l.id === d.lr.id ? {
            ...l, status: 'completed', results, labConclusion, biologicalAlert: hasAbnormal, completedAt: new Date().toISOString(),
            completedBy: prev.currentUser?.id || '', validatedBy: prev.currentUser?.id || '',
          } : l)),
        };
      }
      addAuditLog(next, 'RESULTATS_ANALYSE', `Résultats ${d.lr.examType} pour ${d.patientName}${hasAbnormal ? ' — ANORMAL' : ''}`, d.patient?.id || d.lr.patientId);
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
    setResultAbnormal({});
    setResultComments({});
    setLabConclusion('');
    setBiologicalAlert(false);
  };

  // ---- Nouvelle demande ----
  const patFiltered = patSearch.length >= 1
    ? state.patients.filter((p) => !p.blacklisted && (`${p.lastName} ${p.firstName}`.toLowerCase().includes(patSearch.toLowerCase()) || p.dossier.toLowerCase().includes(patSearch.toLowerCase())))
    : [];

  const createNewPatient = () => {
    if (!newPat.lastName || !newPat.firstName) { alert('Nom et prénom requis'); return; }
    const dossier = normalizeDossierNumber(newPat.dossier);
    if (!dossier) { alert('Le numéro de dossier est obligatoire (saisie manuelle, majuscules).'); return; }
    if (isDossierTaken(state.patients, dossier)) { alert('Ce numéro de dossier existe déjà.'); return; }
    const np: Patient = {
      id: uuidv4(), dossier,
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
    setNewPat({ dossier: '', lastName: '', firstName: '', gender: 'F', dateOfBirth: '', contact: '', clientType: 'comptoir', company: '' });
  };

  const toggleExam = (id: string) => {
    setSelectedExamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const priceFor = (exam: LabExamCatalog, ct: ClientType) => {
    if (urgent) return exam.urgentPrice;
    return ct === 'societe' ? exam.priceSociete : ct === 'externe' ? exam.priceExterne : exam.priceComptoir;
  };

  const createRequests = () => {
    if (!selectedPatientId) { alert('Sélectionnez un patient'); return; }
    if (selectedExamIds.length === 0) { alert('Choisissez au moins un examen'); return; }
    const patient = state.patients.find((p) => p.id === selectedPatientId);
    if (!patient) return;
    const ct = patient.clientType;
    const chosen = currentLabCatalog.filter((e) => selectedExamIds.includes(e.id));
    const invoiceId = uuidv4();
    const items = chosen.map((e) => ({ description: e.name, amount: priceFor(e, ct), category: 'lab' as const }));
    const total = items.reduce((s, i) => s + i.amount, 0);
    const reqIds: string[] = [];

    // Numérotation officielle de la facture d'analyses en attente :
    // FA-MM/CODE/YY-NNN pour les sociétés, AAFAMMJJ + ordre du jour sinon.
    const factureNumbers = collectExistingFactureNumbers(state);
    let factureUpsert: Societe | undefined;
    const allocated = allocateFactureNumber(state, {
      clientType: ct, company: patient.company, invoiceDate: new Date().toISOString(), numbers: factureNumbers,
    });
    factureUpsert = allocated.societeUpsert;

    setState((prev) => {
      const base = factureUpsert ? applySocieteUpsert(prev, factureUpsert) : prev;
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
        patientCharge: total, numeroFacture: allocated.numeroFacture,
        status: 'pending' as const, createdAt: new Date().toISOString(), isExternal: ct === 'externe',
      };
      const next = { ...base, labRequests: [...base.labRequests, ...newRequests], invoices: [...base.invoices, inv] };
      addAuditLog(next, 'DEMANDE_ANALYSE', `${chosen.map((c) => c.name).join(', ')} — ${formatAr(total)} (${patient.dossier})`, patient.id);
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
      {/* Poste de travail laboratoire — suivi simple des analyses */}
      <section className="rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br from-slate-900 via-cyan-950 to-teal-900 text-white">
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <div className="text-xs font-bold tracking-[0.18em] text-cyan-200">LABORATOIRE · TEMPS RÉEL</div>
            <h3 className="text-2xl font-bold mt-1 flex items-center gap-2">🔬 Poste laboratoire</h3>
            <p className="text-sm text-slate-300 mt-1">Suivez la file d'attente, les analyses et les résultats validés.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-2"><div className="font-bold text-lg">{counts.awaiting}</div><div className="text-slate-300">File d'attente</div></div>
            <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-2"><div className="font-bold text-lg">{counts.in_progress}</div><div className="text-slate-300">En analyse</div></div>
            <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-2"><div className="font-bold text-lg">{counts.completed}</div><div className="text-slate-300">Résultats faits</div></div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl p-5 shadow-sm border border-line">
          <div className="flex items-center gap-3"><div className="p-2 bg-cyan-100 dark:bg-cyan-500/15 rounded-lg"><FlaskConical className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /></div>
            <div><div className="text-2xl font-bold text-ink-strong">{counts.awaiting}</div><div className="text-sm text-ink-muted">File d'attente</div></div></div>
        </div>
        <div className="bg-surface rounded-xl p-5 shadow-sm border border-line">
          <div className="flex items-center gap-3"><div className="p-2 bg-blue-100 dark:bg-cyan-500/15 rounded-lg"><Microscope className="w-5 h-5 text-blue-600 dark:text-cyan-400" /></div>
            <div><div className="text-2xl font-bold text-ink-strong">{counts.in_progress}</div><div className="text-sm text-ink-muted">En cours</div></div></div>
        </div>
        <div className="bg-surface rounded-xl p-5 shadow-sm border border-line">
          <div className="flex items-center gap-3"><div className="p-2 bg-green-100 dark:bg-green-500/15 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" /></div>
            <div><div className="text-2xl font-bold text-ink-strong">{counts.completed}</div><div className="text-sm text-ink-muted">Terminées</div></div></div>
        </div>
      </div>

      {/* Barre d'actions */}
      <div className="bg-surface rounded-xl shadow-sm border border-line p-3 flex flex-wrap items-center gap-3">
        <button onClick={openNew} className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition font-medium text-sm flex items-center gap-2 cursor-pointer">
          <Plus className="w-4 h-4" /> Nouvelle demande
        </button>
        <button onClick={() => setShowAddExam(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium text-sm flex items-center gap-2 cursor-pointer">
          <Plus className="w-4 h-4" /> Ajouter un examen
        </button>
        <div className="relative flex-1 min-w-[200px]">




          <Search className="absolute left-3 top-2.5 w-4 h-4 text-ink-faint" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 text-sm" placeholder={tab === 'completed' ? 'Rechercher une personne dans les résultats...' : 'Rechercher patient ou examen...'} />
        </div>
        <Select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="px-3 py-2 border border-line-strong rounded-lg text-sm cursor-pointer">
          <option value="all">Toutes catégories</option>
          {LAB_CATEGORIES.map((c) => <option key={c} value={c}>{labCategoryLabel(c)}</option>)}
        </Select>
      </div>

      {/* Tabs */}
      <div className="bg-surface rounded-xl shadow-sm border border-line overflow-hidden">
        <div className="flex border-b border-line overflow-x-auto">
          {[
            { key: 'awaiting' as Tab, label: `File d'attente (${counts.awaiting})` },
            { key: 'in_progress' as Tab, label: `En cours (${counts.in_progress})` },
            { key: 'completed' as Tab, label: `Résultats (${counts.completed})` },
            { key: 'all' as Tab, label: 'Toutes' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.key ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-cyan-50/50 dark:bg-cyan-500/4' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-ink-faint">
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
                  <div key={d.lr.id} className={`border rounded-xl overflow-hidden ${st === 'completed' ? ((d.lr.results || []).some((r) => r.isAbnormal) ? 'border-red-200 dark:border-red-500/25' : 'border-emerald-200 dark:border-emerald-500/25') : 'border-line'}`}>
                    <div className={`p-4 flex items-center justify-between ${st === 'completed' ? ((d.lr.results || []).some((r) => r.isAbnormal) ? 'bg-red-50 dark:bg-red-500/8' : 'bg-emerald-50 dark:bg-emerald-500/8') : st === 'in_progress' ? 'bg-cyan-50 dark:bg-cyan-500/8' : 'bg-surface-muted'}`}>
                      <div>
                        <div className="font-semibold text-ink-strong flex items-center gap-2">
                          {d.patientName || '—'}
                          {d.lr.urgent && <span className="px-2 py-0.5 bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 text-xs rounded-full">URGENT</span>}
                          {st === 'completed' && (d.lr.results || []).some((r) => r.isAbnormal) && <span className="px-2 py-0.5 bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 text-xs rounded-full font-bold">ANORMAL</span>}
                        </div>
                        <div className="text-sm text-ink-muted mt-0.5">{d.lr.examType} — {labCategoryLabel(d.lr.category || 'autre')}</div>
                        <div className="text-xs text-ink-faint mt-0.5">
                          Prescripteur: {d.doctorName || d.lr.requestedBy || '—'}
                          {patient ? ` · Dossier ${patient.dossier}` : ''}
                          {d.lr.sampleType ? ` · ${d.lr.sampleType}` : ''}
                          {st === 'completed' && d.lr.completedAt && ` · ${new Date(d.lr.completedAt).toLocaleDateString('fr-FR')}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {st === 'pending' && !d.paid && (
                          <span className="px-3 py-1.5 bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 rounded-lg text-xs font-semibold">En attente de paiement (caisse)</span>
                        )}
                        {(st === 'paid' || (st === 'pending' && d.paid)) && (
                          <button onClick={() => startAnalysis(d)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs flex items-center gap-1 cursor-pointer">
                            <Microscope className="w-3.5 h-3.5" /> Démarrer l'analyse
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
                          <button onClick={() => printLabResultTicket(state.ticketSettings, patient, d.lr, d.doctorName, labCategoryLabel(d.lr.category || 'autre'))} className="px-3 py-1.5 bg-surface border border-line-strong hover:bg-surface-muted rounded-lg text-xs flex items-center gap-1 cursor-pointer">
                            <Printer className="w-3.5 h-3.5" /> Compte-rendu
                          </button>
                        )}
                        {isActive && (
                          <button onClick={() => setActiveLab(null)} className="px-3 py-1.5 bg-surface-active hover:bg-line-strong rounded-lg text-xs cursor-pointer">Fermer</button>
                        )}
                      </div>
                    </div>

                    {/* Saisie des résultats */}
                    {isActive && (
                      <div className="p-4 border-t border-line bg-surface-muted/50">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-bold text-ink-strong text-sm flex items-center gap-2">
                            <FileSearch className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Saisie Biologique des Résultats — {d.lr.examType}
                          </h4>
                          <label className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-500/8 border border-rose-200 dark:border-rose-500/25 px-2.5 py-1 rounded-lg text-xs font-bold text-rose-700 dark:text-rose-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={biologicalAlert}
                              onChange={(e) => setBiologicalAlert(e.target.checked)}
                              className="w-4 h-4 text-rose-600 dark:text-rose-400 rounded"
                            />
                            <span>🚨 Alerte Biologique Majeure</span>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                          {d.lr.parameters.map((param) => {
                            const norm = LAB_NORMS[param];
                            const curVal = resultValues[param] ?? '';
                            const isNumericVal = typeof curVal === 'number' || (!isNaN(parseFloat(String(curVal))) && String(curVal).trim() !== '');
                            const numVal = parseFloat(String(curVal));
                            const autoAbn = isNumericVal && norm ? (numVal < norm.min || numVal > norm.max) : false;
                            const isAbn = resultAbnormal[param] ?? autoAbn;

                            return (
                              <div key={param} className={`p-3 rounded-xl border transition-all ${isAbn ? 'bg-rose-50/80 dark:bg-rose-500/6 border-rose-300 dark:border-rose-500/40' : 'bg-surface border-line'}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-bold text-ink-strong">{param}</label>
                                  {norm && <span className="text-[10px] text-ink-muted font-mono">Norme: {norm.min} – {norm.max} {norm.unit}</span>}
                                </div>

                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={curVal}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      setResultValues({ ...resultValues, [param]: raw });
                                    }}
                                    placeholder={norm ? `Valeur en ${norm.unit}` : 'Résultat (ex: Négatif, Positif, 12.5...)'}
                                    className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-mono outline-none ${
                                      isAbn ? 'border-rose-400 bg-surface text-rose-900 dark:text-rose-300 font-bold' : 'border-line-strong focus:border-cyan-500'
                                    }`}
                                  />
                                  {norm?.unit && <span className="text-xs text-ink-muted font-medium whitespace-nowrap">{norm.unit}</span>}
                                </div>

                                {/* Quick Qualitative Shortcuts */}
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {['Négatif', 'Positif', 'Absence', 'Présence', 'Normal'].map((opt) => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => {
                                        setResultValues({ ...resultValues, [param]: opt });
                                        if (opt === 'Positif' || opt === 'Présence') {
                                          setResultAbnormal({ ...resultAbnormal, [param]: true });
                                        } else if (opt === 'Négatif' || opt === 'Absence' || opt === 'Normal') {
                                          setResultAbnormal({ ...resultAbnormal, [param]: false });
                                        }
                                      }}
                                      className="px-1.5 py-0.5 bg-surface-hover hover:bg-surface-active text-ink-secondary rounded text-[10px] cursor-pointer transition"
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => setResultAbnormal({ ...resultAbnormal, [param]: !isAbn })}
                                    className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                                      isAbn ? 'bg-rose-600 text-white' : 'bg-surface-active text-ink-secondary hover:bg-rose-100 dark:hover:bg-rose-500/15 hover:text-rose-700 dark:hover:text-rose-400'
                                    }`}
                                  >
                                    {isAbn ? '⚠️ Pathologique' : 'Cocher Anormal'}
                                  </button>
                                </div>

                                {/* Parameter optional comment */}
                                <input
                                  type="text"
                                  value={resultComments[param] || ''}
                                  onChange={(e) => setResultComments({ ...resultComments, [param]: e.target.value })}
                                  placeholder="Remarque / note (optionnel)"
                                  className="w-full mt-1.5 px-2 py-1 bg-surface-muted border border-line rounded text-[11px] text-ink-secondary outline-none"
                                />
                              </div>
                            );
                          })}
                        </div>

                        {/* Biologist / Lab Conclusion */}
                        <div className="bg-surface p-3 rounded-xl border border-line mb-3">
                          <label className="block text-xs font-bold text-ink mb-1">
                            💬 Conclusion du Biologiste / Laboratoire
                          </label>
                          <textarea
                            value={labConclusion}
                            onChange={(e) => setLabConclusion(e.target.value)}
                            rows={2}
                            placeholder="Ex: Anémie microcytaire hypochrome marquée. Bilan martial et réticulocytes recommandés."
                            className="w-full p-2 border border-line-strong rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <button onClick={() => setActiveLab(null)} className="px-3 py-1.5 bg-surface-active hover:bg-line-strong rounded-lg text-xs font-medium cursor-pointer">
                            Annuler
                          </button>
                          <button onClick={() => submitResults(d)} className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-sm">
                            <Send className="w-3.5 h-3.5" /> Valider & Transmettre au Médecin
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Résultats déjà validés */}
                    {st === 'completed' && d.lr.results && !isActive && (
                      <div className="p-4 border-t border-line">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-line text-ink-muted">
                            <th className="text-left py-2">Paramètre</th><th className="text-center py-2">Résultat</th>
                            <th className="text-center py-2">Normes</th><th className="text-center py-2">État</th>
                          </tr></thead>
                          <tbody>
                            {d.lr.results.map((r) => (
                              <tr key={r.parameter} className={r.isAbnormal ? 'bg-red-50 dark:bg-red-500/8' : ''}>
                                <td className="py-2 text-ink">{r.parameter}</td>
                                <td className={`py-2 text-center font-mono font-bold ${r.isAbnormal ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{r.value} {r.unit}</td>
                                <td className="py-2 text-center text-xs text-ink-muted">{r.normalMin} – {r.normalMax} {r.unit}</td>
                                <td className="py-2 text-center">
                                  {r.isAbnormal
                                    ? <span className="px-2 py-0.5 bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 text-xs rounded-full font-bold flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" /> ANORMAL</span>
                                    : <span className="px-2 py-0.5 bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 text-xs rounded-full">Normal</span>}
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
        <div className="bg-surface rounded-xl shadow-sm border overflow-hidden mt-0 order-first">
            <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold flex items-center gap-2"><FlaskConical className="w-5 h-5" /> Nouvelle demande d'analyse</span>
              <button onClick={() => setShowNew(false)} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
            </div>
            <div className="p-4 space-y-4">
              {/* 1. Patient */}
              {!selectedPatientId ? (
                <div>
                  <h4 className="font-semibold text-sm mb-2">1. Patient</h4>
                  <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-ink-faint" />
                    <input type="text" value={patSearch} onChange={(e) => setPatSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-cyan-500" placeholder="Rechercher un patient enregistré..." />
                  </div>
                  {patFiltered.length > 0 && (
                    <div className="border rounded-lg mt-2 max-h-40 overflow-y-auto divide-y">
                      {patFiltered.map((p) => (
                        <div key={p.id} onClick={() => setSelectedPatientId(p.id)} className="p-2 hover:bg-cyan-50 dark:hover:bg-cyan-500/8 cursor-pointer text-sm flex justify-between">
                          <span className="font-medium">{p.lastName} {p.firstName}</span>
                          <span className="text-xs text-ink-faint">{p.dossier} · {p.clientType === 'societe' ? p.company : 'Comptoir'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 p-3 bg-surface-muted rounded-lg border">
                    <div className="text-xs font-bold text-ink-secondary mb-2">Ou créer un nouveau patient (externe / ponctuel)</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <SuggestionInput id="labo-nouveau-nom" value={newPat.lastName} onChange={(v) => setNewPat({ ...newPat, lastName: v })} suggestions={suggestionsNomsPatients} placeholder="Nom *" ariaLabel="Nom" className="px-2 py-1.5 border rounded uppercase outline-none" />
                      <SuggestionInput id="labo-nouveau-prenom" value={newPat.firstName} onChange={(v) => setNewPat({ ...newPat, firstName: v })} suggestions={suggestionsPrenomsPatients} placeholder="Prénom *" ariaLabel="Prénom" className="px-2 py-1.5 border rounded uppercase outline-none" />
                      <input type="date" value={newPat.dateOfBirth} onChange={(e) => setNewPat({ ...newPat, dateOfBirth: e.target.value })} className="px-2 py-1.5 border rounded outline-none" />
                      <PhoneInput value={newPat.contact} onChange={(v) => setNewPat({ ...newPat, contact: v })} placeholder="Téléphone" className="px-2 py-1.5 border rounded outline-none" />
                      <Select value={newPat.gender} onChange={(e) => setNewPat({ ...newPat, gender: e.target.value as 'M' | 'F' })} className="px-2 py-1.5 border rounded cursor-pointer">
                        <option value="F">Femme</option><option value="M">Homme</option>
                      </Select>
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
                <div className="flex items-center justify-between bg-cyan-50 dark:bg-cyan-500/8 border border-cyan-200 dark:border-cyan-500/25 rounded-lg p-3 gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap text-sm">
                    <span className="text-xs text-cyan-700 dark:text-cyan-400 font-bold">Patient :</span>{' '}
                    <span className="font-semibold">{state.patients.find((p) => p.id === selectedPatientId)?.lastName} {state.patients.find((p) => p.id === selectedPatientId)?.firstName}</span>
                    <span className="text-xs text-ink-muted font-mono">({state.patients.find((p) => p.id === selectedPatientId)?.dossier})</span>
                    {state.patients.find(p=>p.id===selectedPatientId)?.clientType === 'societe'
                      ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400">🏢 {state.patients.find(p=>p.id===selectedPatientId)?.company || 'Société'}</span>
                      : <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-surface-hover text-ink-secondary">🏪 Comptoir</span>}
                    <button
                      type="button"
                      onClick={() => setShowLabClientTypeEdit(v => !v)}
                      className="p-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 rounded transition cursor-pointer"
                      title="Modifier le type de client / société"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button onClick={() => setSelectedPatientId(null)} className="text-xs text-cyan-700 dark:text-cyan-400 underline cursor-pointer">Changer</button>
                </div>
              )}
              {selectedPatientId && showLabClientTypeEdit && (
                <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/25 bg-indigo-50 dark:bg-indigo-500/8 p-3 space-y-2">
                  <div className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">🏢 Société / Type client
                    <button type="button" onClick={() => setShowLabClientTypeEdit(false)} className="ml-auto text-indigo-500 hover:text-indigo-800 dark:hover:text-indigo-300 cursor-pointer" title="Fermer">✕</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block font-bold text-ink mb-0.5">Type</label>
                      <select value={labEditClientType} onChange={e => setLabEditClientType(e.target.value as ClientType)} className="w-full px-2 py-1.5 border rounded bg-surface cursor-pointer">
                        <option value="comptoir">Client Comptoir</option>
                        <option value="societe">Client Société</option>
                      </select>
                    </div>
                    {labEditClientType === 'societe' && (
                      <div>
                        <label className="block font-bold text-ink mb-0.5">Société</label>
                        <SearchableSelect value={labEditCompany} onChange={setLabEditCompany} options={companyOptions(state.companies)} placeholder="— Taper pour filtrer puis choisir —" ariaLabel="Société" inputClassName="w-full px-2 py-1.5 border rounded outline-none bg-surface" />
                      </div>
                    )}
                  </div>
                  {labEditClientType === 'societe' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="flex gap-1">
                        <input type="text" value={labEditNewCompany} onChange={e => setLabEditNewCompany(e.target.value.toUpperCase())} className="flex-1 px-2 py-1.5 border rounded uppercase bg-surface" placeholder="Nouvelle société…" />
                        <button type="button" onClick={() => { const name = addLabPartnerCompany(labEditNewCompany); if (name) { setLabEditCompany(name); setLabEditNewCompany(''); }}} className="px-2 py-1.5 bg-indigo-600 text-white rounded font-bold">+</button>
                      </div>
                      <div>
                        <label className="block font-bold text-ink mb-0.5">Sous-société</label>
                        <SearchableSelect value={labEditSubCompany} onChange={setLabEditSubCompany} options={optionsFromValues(sousSocietesConnues(state, labEditCompany))} placeholder={"— Sous-société de " + (labEditCompany || "la société") + " —"} ariaLabel="Sous-société" inputClassName="w-full px-2 py-1.5 border rounded outline-none bg-surface uppercase" />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={saveLabSociete} className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded text-xs font-bold cursor-pointer">Enregistrer type / société</button>
                    <button type="button" onClick={() => setShowLabClientTypeEdit(false)} className="px-3 py-1.5 bg-surface border border-line-strong hover:bg-surface-hover text-ink rounded text-xs font-bold cursor-pointer">Annuler</button>
                  </div>
                </div>
              )}

              {/* 2. Examens */}
              {selectedPatientId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm">2. Examens demandés</h4>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="w-4 h-4" />
                      <span className="text-red-600 dark:text-red-400 font-semibold">Urgent (+ supplément)</span>
                    </label>
                  </div>
                  <div className="space-y-3 pr-1">
                    {LAB_CATEGORIES.map((cat) => {
                      const exams = currentLabCatalog.filter((e) => e.category === cat);
                      if (exams.length === 0) return null;
                      const ct = state.patients.find((p) => p.id === selectedPatientId)?.clientType || 'comptoir';
                      return (
                        <div key={cat}>
                          <div className="text-xs font-bold text-ink-muted uppercase mb-1">{labCategoryLabel(cat)}</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {exams.map((e) => {
                              const sel = selectedExamIds.includes(e.id);
                              const price = priceFor(e, ct);
                              return (
                                <button key={e.id} onClick={() => toggleExam(e.id)}
                                  className={`text-left p-2 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition ${sel ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-500/8' : 'border-line hover:bg-surface-muted'}`}>
                                  <div>
                                    <div className="text-sm font-medium text-ink-strong">{e.name}</div>
                                    <div className="text-[10px] text-ink-faint">{e.code} · {e.sampleType} · {e.durationHours}h</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs font-mono font-bold text-ink">{formatAr(price)}</div>
                                    {sel && <Check className="w-4 h-4 text-cyan-600 dark:text-cyan-400 mx-auto" />}
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
                      <span className="text-ink-muted">{selectedExamIds.length} examen(s) · </span>
                      <span className="font-bold font-mono text-ink-strong">
                        {formatAr(currentLabCatalog.filter((e) => selectedExamIds.includes(e.id)).reduce((s, e) => s + priceFor(e, state.patients.find((p) => p.id === selectedPatientId)?.clientType || 'comptoir'), 0))}
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
        <div className="bg-surface rounded-xl shadow-sm border overflow-hidden mt-0 order-first">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold flex items-center gap-2"><FlaskConical className="w-5 h-5" /> Ajouter un examen au catalogue</span>
              <button onClick={() => setShowAddExam(false)} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">Code *</label>
                  <input value={examForm.code} onChange={(e) => setExamForm({ ...examForm, code: e.target.value })} placeholder="ex: BIO009" className="w-full px-2 py-1.5 border rounded uppercase outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">Nom *</label>
                  <input value={examForm.name} onChange={(e) => setExamForm({ ...examForm, name: e.target.value })} placeholder="ex: Magnésémie" className="w-full px-2 py-1.5 border rounded outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">Catégorie</label>
                  <Select value={examForm.category} onChange={(e) => setExamForm({ ...examForm, category: e.target.value as LabCategory })} className="w-full px-2 py-1.5 border rounded cursor-pointer">
                    {LAB_CATEGORIES.map((c) => <option key={c} value={c}>{labCategoryLabel(c)}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-secondary mb-1">Prélèvement</label>
                  <input value={examForm.sampleType} onChange={(e) => setExamForm({ ...examForm, sampleType: e.target.value })} placeholder="Sang veineux" className="w-full px-2 py-1.5 border rounded outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-secondary mb-1">Paramètres (séparés par virgule)</label>
                <input id="lab-params" onChange={(e) => setExamForm({ ...examForm, parameters: e.target.value.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean) })} placeholder="Glucose, Sodium, Potassium" className="w-full px-2 py-1.5 border rounded outline-none" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div><label className="block text-[10px] font-bold text-ink-secondary mb-1">Prix Comptoir</label><input type="number" value={examForm.priceComptoir} onChange={(e) => setExamForm({ ...examForm, priceComptoir: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded outline-none" /></div>
                <div><label className="block text-[10px] font-bold text-ink-secondary mb-1">Prix Société</label><input type="number" value={examForm.priceSociete} onChange={(e) => setExamForm({ ...examForm, priceSociete: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded outline-none" /></div>
                <div><label className="block text-[10px] font-bold text-ink-secondary mb-1">Prix Externe</label><input type="number" value={examForm.priceExterne} onChange={(e) => setExamForm({ ...examForm, priceExterne: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded outline-none" /></div>
                <div><label className="block text-[10px] font-bold text-ink-secondary mb-1">Prix Urgent</label><input type="number" value={examForm.urgentPrice} onChange={(e) => setExamForm({ ...examForm, urgentPrice: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-ink-secondary mb-1">Délai (heures)</label><input type="number" value={examForm.durationHours} onChange={(e) => setExamForm({ ...examForm, durationHours: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded outline-none" /></div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={examForm.defaultUrgent} onChange={(e) => setExamForm({ ...examForm, defaultUrgent: e.target.checked })} className="w-4 h-4" /> <span className="text-red-600 dark:text-red-400 font-semibold">Urgent par défaut</span></label>
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
