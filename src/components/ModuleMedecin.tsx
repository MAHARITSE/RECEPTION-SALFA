import { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Consultation, VitalSigns, Prescription, LabRequest, ClientType, Invoice, EchoRequest, PatientStatus, Patient, Article } from '../types';
import type { AppState } from '../store';
import type { Societe } from '../modules/assurance/types';
import { allocateFactureNumber, applySocieteUpsert, collectExistingFactureNumbers } from '../store';
import { SearchableSelect, optionsFromValues } from './SearchableSelect';
import { SuggestionInput, classerSuggestions } from './SuggestionInput';
import {
  addAuditLog, addNotification, formatAr, formatNum, roundTo2, getPrice, addJourneyEvent,
  labCategoryLabel, purgePatientFromQueue, isPrescriptionPaid, isMedicationEntryFamily,
  getEchoCatalog, getLabCatalog, DEFAULT_ECHO_CATALOG, familyManagesStock, companyIsBlocked, companyOptions, sousSocietesConnues
} from '../store';
import type { EchoExamCatalog } from '../store';
import { blockIfUnsavedDraftLine } from '../utils/validation';
import AlerteArticleIndisponible from './AlerteArticleIndisponible';
import type { ArticleAlertInfo } from './AlerteArticleIndisponible';
import { printLabResultTicket } from '../utils/printTicket';
import { PhoneInput } from './PhoneInput';
import {
  Stethoscope, History, Trash2, AlertTriangle, Heart, FileText, Clock, CheckCircle,
  Send, Search, Edit2, RotateCcw, Save, FlaskConical, Scan, Plus, X, Droplets,
  Users, Printer, Eye, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { Select } from './Select';

export type { EchoExamCatalog };
export const ECHO_CATALOG: EchoExamCatalog[] = DEFAULT_ECHO_CATALOG;

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onOpenMedicalRecord?: (patientId: string) => void;
  /** Relecture immédiate des saisies des autres postes (réception, caisse…). */
  onRefreshQueue?: () => void;
}
type ViewMode = 'queue' | 'consultation' | 'my_consults';

export default function ModuleMedecin({ state, setState, onOpenMedicalRecord, onRefreshQueue }: Props) {
  const [view, setView] = useState<ViewMode>('queue');
  const [toastFeedback, setToastFeedback] = useState<string | null>(null);
  // Notification rouge centrée : article bloqué en vente par la pharmacie ou en rupture de stock
  const [articleAlert, setArticleAlert] = useState<ArticleAlertInfo | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [articleSearch, setArticleSearch] = useState('');
  const [artSearchIdx, setArtSearchIdx] = useState(0);
  const [consultForm, setConsultForm] = useState({ visitReason: '', diagnosis: '', notes: '', isEmergency: false, hospitalizeRequested: false, surgeryRequested: false });
  const [vitals, setVitals] = useState<VitalSigns>({ temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' });
  const [lines, setLines] = useState<Prescription[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState<Prescription>({ id: '', articleId: '', articleName: '', quantity: 1, posology: '', duration: '', instructions: '', unitPrice: 0, discount: 0, delivered: false });
  const [isNewLine, setIsNewLine] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  // Snapshot de la consultation ouverte via le bouton « Mod. » : permet de la
  // restaurer si l'utilisateur quitte par « Retour » sans rien valider.
  // On garde aussi les paiements/factures unifiés afin que l'annulation locale
  // d'une modification ne supprime jamais définitivement un paiement existant.
  const editSnapshotRef = useRef<{
    consultation: Consultation;
    invoices: Invoice[];
    labRequests: LabRequest[];
    ventes: AppState['ventes'];
    venteLines: AppState['venteLines'];
    ventePayments: AppState['ventePayments'];
    previousStatus: PatientStatus;
  } | null>(null);

  // ---- Demandes d'analyses (Laboratoire) saisies par le médecin ----
  const [labSearch, setLabSearch] = useState('');
  const [labDraft, setLabDraft] = useState<{ examId: string; urgent: boolean }[]>([]);
  const [labSearchIdx, setLabSearchIdx] = useState(0);
  const labSearchRef = useRef<HTMLInputElement>(null);

  // ---- Demandes d'échographie ----
  const [echoSearch, setEchoSearch] = useState('');
  const [echoDraft, setEchoDraft] = useState<{ examId: string; urgent: boolean; notes?: string }[]>([]);
  const [echoSearchIdx, setEchoSearchIdx] = useState(0);
  const echoSearchRef = useRef<HTMLInputElement>(null);

  // ---- Compléter / Modifier le dossier médical du patient par le médecin ----
  const [showPatientEditModal, setShowPatientEditModal] = useState(false);
  const [patientEditForm, setPatientEditForm] = useState({
    bloodGroup: '',
    allergiesText: '',
    antecedentsText: '',
    chronicTreatmentsText: '',
    famille: '',
    lienFamilial: '',
    ssn: '',
    matricule: '',
    contact: '',
    address: '',
  });

  // Edition société — panneau repliable, ouvert via l'icône stylo à côté du dossier
  const [medEditClientType, setMedEditClientType] = useState<ClientType>('comptoir');
  const [medEditCompany, setMedEditCompany] = useState('');
  const [medEditSubCompany, setMedEditSubCompany] = useState('');
  const [medEditNewCompany, setMedEditNewCompany] = useState('');
  const [showMedClientTypeEdit, setShowMedClientTypeEdit] = useState(false);

  const selectedPatient = state.patients.find((p) => p.id === selectedPatientId);

  useEffect(() => {
    if (selectedPatient) {
      setMedEditClientType((selectedPatient.clientType === 'externe' ? 'comptoir' : selectedPatient.clientType) as ClientType);
      setMedEditCompany(selectedPatient.company || '');
      setMedEditSubCompany(selectedPatient.subCompany || '');
      setMedEditNewCompany('');
      setShowMedClientTypeEdit(false);
    }
  }, [selectedPatientId, selectedPatient?.clientType, selectedPatient?.company, selectedPatient?.subCompany]);

  useEffect(() => {
    if (selectedPatient) {
      setPatientEditForm({
        bloodGroup: selectedPatient.bloodGroup || '',
        allergiesText: (selectedPatient.allergies || []).join(', '),
        antecedentsText: (selectedPatient.antecedents || []).join(', '),
        chronicTreatmentsText: (selectedPatient.chronicTreatments || []).join(', '),
        famille: selectedPatient.famille || '',
        lienFamilial: selectedPatient.lienFamilial || '',
        ssn: selectedPatient.ssn || '',
        matricule: selectedPatient.matricule || '',
        contact: selectedPatient.contact || '',
        address: selectedPatient.address || '',
      });
    }
  }, [
    selectedPatientId,
    selectedPatient?.bloodGroup,
    selectedPatient?.allergies,
    selectedPatient?.antecedents,
    selectedPatient?.chronicTreatments,
    selectedPatient?.famille,
    selectedPatient?.lienFamilial,
    selectedPatient?.ssn,
    selectedPatient?.matricule,
    selectedPatient?.contact,
    selectedPatient?.address,
  ]);

  const savePatientMedicalProfile = () => {
    if (!selectedPatientId || !selectedPatient) return;
    const newAllergies = patientEditForm.allergiesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const newAntecedents = patientEditForm.antecedentsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const newChronic = patientEditForm.chronicTreatmentsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setState((prev) => {
      const next: AppState = {
        ...prev,
        patients: prev.patients.map((p) =>
          p.id === selectedPatientId
            ? {
                ...p,
                bloodGroup: patientEditForm.bloodGroup || undefined,
                allergies: newAllergies,
                antecedents: newAntecedents,
                chronicTreatments: newChronic,
                famille: patientEditForm.famille || undefined,
                lienFamilial: patientEditForm.lienFamilial || undefined,
                ssn: patientEditForm.ssn,
                matricule: patientEditForm.matricule || undefined,
                contact: patientEditForm.contact,
                address: patientEditForm.address,
              }
            : p
        ),
      };
      addAuditLog(next, 'MAJ_DOSSIER_PATIENT_MEDECIN', `Dossier médical mis à jour par Dr. ${prev.currentUser?.name || ''} (${selectedPatient.dossier})`, selectedPatientId);
      addJourneyEvent(next, {
        patientId: selectedPatientId,
        department: 'consultation',
        action: 'Mise à jour du dossier médical',
        status: selectedPatient.status,
        details: 'Données médicales complétées (groupe sanguin, antécédents, allergies, famille...) par le médecin',
        actorId: prev.currentUser?.id,
        actorName: prev.currentUser?.name,
      });
      return next;
    });
    setShowPatientEditModal(false);
    setToastFeedback('Dossier médical du patient mis à jour avec succès');
    setTimeout(() => setToastFeedback(null), 3000);
  };

  const addMedPartnerCompany = (rawName: string): string | null => {
    const name = rawName.trim().toUpperCase();
    if (!name) return null;
    const existing = state.companies.find(c => c.name.toUpperCase() === name);
    if (existing) return existing.name;
    setState(prev => ({ ...prev, companies: [...prev.companies, { id: `comp-${Date.now()}`, name, paymentMode: 'Crédit', settlementMode: 'monthly_global', createdAt: new Date().toISOString() }]}));
    return name;
  };
  const saveMedSociete = () => {
    if (!selectedPatientId || !selectedPatient) return;
    setState(prev => ({
      ...prev,
      patients: prev.patients.map(p => p.id === selectedPatientId ? { ...p, clientType: medEditClientType === 'externe' ? 'comptoir' : medEditClientType as 'comptoir'|'societe', company: medEditClientType === 'societe' ? medEditCompany : undefined, subCompany: medEditClientType === 'societe' ? medEditSubCompany : undefined } : p)
    }));
    setToastFeedback(`Société mise à jour : ${medEditClientType === 'societe' ? medEditCompany || 'Société' : 'Comptoir'}`);
    setShowMedClientTypeEdit(false);
    setTimeout(()=>setToastFeedback(null),3000);
  };

  const isAdminUser = state.currentUser?.role === 'admin';
  // File d'attente du médecin : seuls les passages qui attendent encore le
  // médecin restent affichés. Dès qu'une consultation est VALIDÉE, le patient
  // quitte la file (il passe à la caisse / laboratoire / pharmacie) afin que
  // la file d'attente ne soit pas encombrée.
  const DOCTOR_QUEUE_STATUSES: PatientStatus[] = ['waiting_consultation', 'in_consultation', 'analyses_pending', 'analyses_complete'];
  // Ordre décroissant : dernier arrivé en haut (exigence utilisateur) — tri secondaire par date après priorité statut
  const myWaiting = state.patients
    .filter((p) => {
      if (!DOCTOR_QUEUE_STATUSES.includes(p.status)) return false;
      if (isAdminUser) return true;
      // File d'attente COMMUNE : un patient adressé par la réception est visible par
      // TOUS les médecins, même s'il a déjà été vu par un confrère lors d'une visite
      // précédente (l'ancien `assignedDoctor` ne doit plus le masquer).
      if (p.status === 'waiting_consultation') return true;
      return !p.assignedDoctor || p.assignedDoctor === state.currentUser?.id;
    })
    .sort((a, b) => {
      const score = (s: PatientStatus) => {
        if (s === 'waiting_consultation') return 1;
        if (s === 'analyses_complete') return 2;
        if (s === 'in_consultation') return 3;
        if (s === 'analyses_pending') return 4;
        if (s === 'consulted_awaiting_payment') return 5;
        if (s === 'invoice_paid') return 6;
        if (s === 'medications_delivered') return 7;
        if (s === 'completed') return 8;
        return 9;
      };
      const diff = score(a.status) - score(b.status);
      if (diff !== 0) return diff;
      const da = new Date(a.lastVisitAt || a.registeredAt).getTime() || 0;
      const db = new Date(b.lastVisitAt || b.registeredAt).getTime() || 0;
      return db - da;
    });
  const searchResults = searchQuery.length >= 2 ? state.patients.filter((p) => { const q = searchQuery.toLowerCase(); return p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) || p.dossier.toLowerCase().includes(q); }) : [];
  const patientConsultations = selectedPatientId ? state.consultations.filter((c) => c.patientId === selectedPatientId) : [];
  const clientType = selectedPatient?.clientType || 'comptoir';

  // Catalogue dynamique des analyses et des échographies synchronisé avec la base des articles
  const currentLabCatalog = useMemo(() => getLabCatalog(state.articles, state.labCatalog), [state.articles, state.labCatalog]);
  const currentEchoCatalog = useMemo(() => getEchoCatalog(state.articles), [state.articles]);

  // Catalogue labo : recherche + prix + brouillon de demandes d'analyses
  const labFiltered = labSearch.length >= 1
    ? currentLabCatalog.filter((e) => e.name.toLowerCase().includes(labSearch.toLowerCase()) || e.code.toLowerCase().includes(labSearch.toLowerCase()))
    : [];
  const priceForExam = (examId: string, ct: ClientType, urgent: boolean) => {
    const e = currentLabCatalog.find((x) => x.id === examId);
    if (!e) return 0;
    if (urgent) return e.urgentPrice;
    return ct === 'societe' ? e.priceSociete : ct === 'externe' ? e.priceExterne : e.priceComptoir;
  };
  const labTotal = labDraft.reduce((s, d) => s + priceForExam(d.examId, clientType, d.urgent), 0);

  // Catalogue écho : recherche + prix + brouillon de demandes d'échographies
  const echoFiltered = echoSearch.length >= 1
    ? currentEchoCatalog.filter((e) => e.name.toLowerCase().includes(echoSearch.toLowerCase()) || e.code.toLowerCase().includes(echoSearch.toLowerCase()))
    : [];
  const echoPriceForExam = (examId: string, ct: ClientType, urgent: boolean) => {
    const e = currentEchoCatalog.find((x) => x.id === examId);
    if (!e) return 0;
    if (urgent) return e.urgentPrice;
    return ct === 'societe' ? e.priceSociete : ct === 'externe' ? e.priceExterne : e.priceComptoir;
  };
  const echoTotal = echoDraft.reduce((s, d) => s + echoPriceForExam(d.examId, clientType, d.urgent), 0);

  const addLabExam = (examId: string) => {
    setLabDraft((prev) => (prev.some((d) => d.examId === examId) ? prev : [...prev, { examId, urgent: false }]));
    setLabSearch('');
  };
  const removeLabExam = (examId: string) => setLabDraft(labDraft.filter((d) => d.examId !== examId));
  const toggleLabUrgent = (examId: string) => setLabDraft(labDraft.map((d) => (d.examId === examId ? { ...d, urgent: !d.urgent } : d)));

  const addEchoExam = (examId: string) => {
    setEchoDraft((prev) => (prev.some((d) => d.examId === examId) ? prev : [...prev, { examId, urgent: false, notes: '' }]));
    setEchoSearch('');
  };
  const removeEchoExam = (examId: string) => setEchoDraft(echoDraft.filter((d) => d.examId !== examId));
  const toggleEchoUrgent = (examId: string) => setEchoDraft(echoDraft.map((d) => (d.examId === examId ? { ...d, urgent: !d.urgent } : d)));
  const updateEchoNotes = (examId: string, val: string) => setEchoDraft(echoDraft.map((d) => (d.examId === examId ? { ...d, notes: val } : d)));

  // Saisie médicament : exclure les familles Laboratoire (LAB/LABO), Échographie (ECHO)
  // et Hospitalisation (HOSP). Les autres familles (MEDIC, DENT, familles ajoutées...)
  // restent disponibles.
  const filteredArticles = articleSearch.length >= 1
    ? state.articles.filter((a) => isMedicationEntryFamily(a.family) && a.name.toLowerCase().includes(articleSearch.toLowerCase()))
    : [];

  const today = new Date().toDateString();
  const myTodayConsults = state.consultations.filter((c) => (isAdminUser || c.doctorId === state.currentUser?.id) && new Date(c.date).toDateString() === today);

  useEffect(() => {
    const line = lines.find(l => l.id === selectedLineId);
    if (line && !isNewLine) setLineForm({ ...line });
  }, [selectedLineId, lines, isNewLine]);

  const updateLineForm = (key: string, val: any) => {
    setLineForm(prev => {
      const u = { ...prev, [key]: val };
      return u;
    });
  };

  const lineAmount = (l: Prescription) => roundTo2(l.unitPrice * l.quantity * (1 - l.discount / 100));
  const totalPres = lines.reduce((s, l) => s + lineAmount(l), 0);

  const selectPatient = (pid: string) => {
    if (pid === selectedPatientId) {
      setView('consultation');
      return;
    }
    const p = state.patients.find((x) => x.id === pid);
    submittingRef.current = false;
    editSnapshotRef.current = null;
    setSelectedPatientId(pid); setLines([]); setSelectedLineId(null); setIsNewLine(false); setView('consultation');
    setLabDraft([]); setLabSearch(''); setEchoDraft([]); setEchoSearch('');
    setLabDraftIdx(-1); setEchoDraftIdx(-1);
    setArticleSearch('');
    setLineForm({ id: '', articleId: '', articleName: '', quantity: 1, posology: '', duration: '', instructions: '', unitPrice: 0, discount: 0, delivered: false });
    setConsultForm({ visitReason: '', diagnosis: '', notes: '', isEmergency: false, hospitalizeRequested: false, surgeryRequested: false });
    if (p?.vitalSigns) setVitals({ ...p.vitalSigns }); else setVitals({ temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' });
    setState((prev) => {
      const next = { ...prev, patients: prev.patients.map((x) => x.id === pid ? { ...x, status: 'in_consultation' as const, assignedDoctor: prev.currentUser?.id } : x) };
      addJourneyEvent(next, { patientId: pid, department: 'consultation', action: 'Consultation', status: 'in_consultation', details: `Dr. ${prev.currentUser?.name || ''}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name });
      return next;
    });
  };

  // Retour à la file SANS valider : le patient ne doit JAMAIS disparaître des files.
  // - Consultation fraîchement ouverte     → remis dans la file d'attente médecin.
  // - Modification (bouton « Mod. ») annulée → consultation d'origine restaurée.
  const handleBackToQueue = () => {
    const pid = selectedPatientId;
    const snap = editSnapshotRef.current;
    editSnapshotRef.current = null;
    if (pid) {
      setState((prev) => {
        const pat = prev.patients.find((x) => x.id === pid);
        if (!pat || pat.status !== 'in_consultation') return prev;
        let next: AppState = { ...prev };
        let restoredStatus: PatientStatus = 'waiting_consultation';
        if (snap && !prev.consultations.some((c) => c.id === snap.consultation.id)) {
          // Annulation d'une « Mod. » : consultation d'origine + factures/demandes restaurées
          restoredStatus = snap.previousStatus;
          const invoiceIds = new Set(snap.invoices.map((inv) => inv.id));
          const labRequestIds = new Set(snap.labRequests.map((lr) => lr.id));
          const venteIds = new Set(snap.ventes.map((v) => v.id));
          const venteLineIds = new Set(snap.venteLines.map((vl) => vl.id));
          const ventePaymentIds = new Set(snap.ventePayments.map((vp) => vp.id));
          next = {
            ...next,
            consultations: [...next.consultations.filter((c) => c.id !== snap.consultation.id), snap.consultation],
            invoices: [...next.invoices.filter((inv) => !invoiceIds.has(inv.id)), ...snap.invoices],
            labRequests: [...next.labRequests.filter((lr) => !labRequestIds.has(lr.id)), ...snap.labRequests],
            ventes: [...(next.ventes || []).filter((v) => !venteIds.has(v.id)), ...snap.ventes],
            venteLines: [...(next.venteLines || []).filter((vl) => !venteLineIds.has(vl.id)), ...snap.venteLines],
            ventePayments: [...(next.ventePayments || []).filter((vp) => !ventePaymentIds.has(vp.id)), ...snap.ventePayments],
          };
          addAuditLog(next, 'MODIF_ANNULEE', `${pat.dossier} — modification annulée, consultation restaurée`, pid);
          addJourneyEvent(next, { patientId: pid, department: 'consultation', action: 'Modification annulée', status: restoredStatus, details: `Consultation d'origine restaurée (retour sans validation)`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, consultationId: snap.consultation.id });
        } else {
          addAuditLog(next, 'RETOUR_FILE_ATTENTE', `${pat.dossier} — remis dans la file médecin (retour sans prescription)`, pid);
          addJourneyEvent(next, { patientId: pid, department: 'consultation', action: 'Consultation non validée', status: 'waiting_consultation', details: `Remis dans la file d'attente médecin`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name });
        }
        next = {
          ...next,
          patients: next.patients.map((x) => x.id === pid
            ? { ...x, status: restoredStatus, assignedDoctor: restoredStatus === 'waiting_consultation' ? undefined : x.assignedDoctor }
            : x),
        };
        return next;
      });
    }
    // Réinitialiser le formulaire local (identique à la fin de validation)
    setSelectedPatientId(null); setConsultForm({ visitReason: '', diagnosis: '', notes: '', isEmergency: false, hospitalizeRequested: false, surgeryRequested: false });
    setVitals({ temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' });
    setLines([]); setSearchQuery(''); setSelectedLineId(null); setIsNewLine(false);
    setArticleSearch(''); setLineForm({ id: '', articleId: '', articleName: '', quantity: 1, posology: '', duration: '', instructions: '', unitPrice: 0, discount: 0, delivered: false });
    setLabDraft([]); setLabSearch(''); setEchoDraft([]); setEchoSearch('');
    setLabDraftIdx(-1); setEchoDraftIdx(-1);
    setView('queue');
    submittingRef.current = false;
  };

  const [patientToPurge, setPatientToPurge] = useState<Patient | null>(null);

  // Retrait de la file médecin : le dossier patient est toujours conservé.
  const deleteWaitingPatient = (pid: string) => {
    const p = state.patients.find((x) => x.id === pid);
    if (!p) return;
    setPatientToPurge(p);
  };

  const confirmPurgePatient = (p: Patient) => {
    const pid = p.id;
    setState((prev) => {
      const next: AppState = { ...prev };
      purgePatientFromQueue(next, pid);
      addAuditLog(next, 'RETRAIT_FILE_MEDECIN', `${p.lastName} ${p.firstName} (${p.dossier}) retiré de la file médecin — dossier conservé`, pid);
      addJourneyEvent(next, { patientId: pid, department: 'consultation', action: 'Consultation retirée de la file médecin', status: 'registered', details: `Consultation annulée ; dossier conservé par Dr. ${prev.currentUser?.name || ''}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name });
      return next;
    });
    if (selectedPatientId === pid) {
      setSelectedPatientId(null);
      setView('queue');
    }
    setPatientToPurge(null);
    setToastFeedback(`Consultation de ${p.lastName} ${p.firstName} retirée de la file.`);
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

  // Keyboard navigation in lab search dropdown
  const handleLabSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setLabSearchIdx(i => Math.min(i + 1, labFiltered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setLabSearchIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (labFiltered.length > 0 && labSearch) {
        const ex = labFiltered[labSearchIdx];
        if (ex) addLabExam(ex.id);
      }
    }
    else if (e.key === 'Escape') { setLabSearch(''); }
    else if (e.key === 'Tab' && !e.shiftKey && !labSearch) { e.preventDefault(); echoSearchRef.current?.focus(); }
  };

  // Lab draft item keyboard navigation (select item + toggle urgent with U key)
  const [labDraftIdx, setLabDraftIdx] = useState(-1);
  const handleLabDraftKeyDown = (e: React.KeyboardEvent) => {
    if (labDraft.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setLabDraftIdx(i => Math.min(i + 1, labDraft.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setLabDraftIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'u' || e.key === 'U') { e.preventDefault(); if (labDraftIdx >= 0 && labDraftIdx < labDraft.length) toggleLabUrgent(labDraft[labDraftIdx].examId); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (labDraftIdx >= 0 && labDraftIdx < labDraft.length) { removeLabExam(labDraft[labDraftIdx].examId); setLabDraftIdx(i => Math.max(0, i - 1)); } }
  };

  // Keyboard navigation in echo search dropdown
  const handleEchoSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setEchoSearchIdx(i => Math.min(i + 1, echoFiltered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setEchoSearchIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (echoFiltered.length > 0 && echoSearch) {
        const ex = echoFiltered[echoSearchIdx];
        if (ex) addEchoExam(ex.id);
      }
    }
    else if (e.key === 'Escape') { setEchoSearch(''); }
    else if (e.key === 'Tab' && e.shiftKey && !echoSearch) { e.preventDefault(); labSearchRef.current?.focus(); }
  };

  // Echo draft item keyboard navigation (select item + toggle urgent with U key)
  const [echoDraftIdx, setEchoDraftIdx] = useState(-1);
  const handleEchoDraftKeyDown = (e: React.KeyboardEvent) => {
    if (echoDraft.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setEchoDraftIdx(i => Math.min(i + 1, echoDraft.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setEchoDraftIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'u' || e.key === 'U') { e.preventDefault(); if (echoDraftIdx >= 0 && echoDraftIdx < echoDraft.length) toggleEchoUrgent(echoDraft[echoDraftIdx].examId); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (echoDraftIdx >= 0 && echoDraftIdx < echoDraft.length) { removeEchoExam(echoDraft[echoDraftIdx].examId); setEchoDraftIdx(i => Math.max(0, i - 1)); } }
  };

  /** Statut de disponibilité d'un article vis-à-vis de la pharmacie (blocage vente / rupture) */
  const articleAvailability = (a: Article) => {
    const manages = familyManagesStock(a.family, state.familles);
    return {
      blocked: !!a.saleBlocked,
      outOfStock: manages && a.stockPharmacie <= 0,
      manages,
    };
  };

  const applyArticleSelection = (a: Article) => {
    // Si on est en mode édition d'une ligne existante, on met à jour cette ligne (même id) au lieu de créer un doublon
    if (!isNewLine && selectedLineId && lines.find(l => l.id === selectedLineId)) {
      const existing = lines.find(l => l.id === selectedLineId)!;
      // On garde la quantité / posologie déjà saisies si l'utilisateur était en train d'éditer
      // Mais si lineForm est déjà l'édition de cette ligne, on préfère garder les valeurs de lineForm pour quantité etc.
      // Pour éviter toute confusion, on met à jour lineForm directement avec le nouvel article tout en conservant l'id d'origine
      const merged: Prescription = {
        ...lineForm,
        id: selectedLineId,
        articleId: a.id,
        articleName: a.name,
        unitPrice: getPrice(a, clientType),
      };
      // Si lineForm ne correspondait pas à la ligne sélectionnée (cas stale), on utilise existing comme base
      const finalForm = lineForm.id === selectedLineId ? merged : { ...existing, articleId: a.id, articleName: a.name, unitPrice: getPrice(a, clientType) };
      setLineForm(finalForm);
      setArticleSearch('');
      setArtSearchIdx(0);
      // On reste en mode édition (pas de nouvelle ligne)
      return;
    }
    const nl: Prescription = { id: uuidv4(), articleId: a.id, articleName: a.name, quantity: 1, posology: '', duration: '', instructions: '', unitPrice: getPrice(a, clientType), discount: 0, delivered: false };
    setLineForm({ ...nl }); setSelectedLineId(nl.id); setIsNewLine(true); setArticleSearch(''); setArtSearchIdx(0);
  };

  const handleArticleSelect = (articleId: string) => {
    const a = state.articles.find((x) => x.id === articleId);
    if (!a) return;
    const { blocked, outOfStock } = articleAvailability(a);
    // Notification rouge centrée : l'article est bloqué à la vente par la pharmacie
    // ou en rupture de stock. Le médecin est prévenu AVANT de l'inscrire sur l'ordonnance.
    if (blocked || outOfStock) {
      setArticleAlert({
        kind: blocked ? 'blocked' : 'out_of_stock',
        title: blocked ? '⛔ Article bloqué à la vente par la pharmacie' : '🚨 Rupture de stock pharmacie',
        message: `« ${a.name} »`,
        reason: blocked ? (a.saleBlockReason || undefined) : undefined,
        hint: blocked
          ? "Cet article est bloqué à la vente par la pharmacie : il ne pourra pas être délivré ni encaissé. Prescrivez une alternative ou demandez son déblocage à la pharmacie."
          : `Stock pharmacie = ${a.stockPharmacie}. Cet article ne pourra pas être délivré ni encaissé tant qu'il n'est pas réapprovisionné.`,
        onForce: () => applyArticleSelection(a),
        forceLabel: 'Prescrire quand même',
      });
      setArticleSearch('');
      setArtSearchIdx(0);
      return;
    }
    applyArticleSelection(a);
  };

  const resetLineDraft = () => {
    setSelectedLineId(null);
    setIsNewLine(false);
    setArticleSearch('');
    setArtSearchIdx(0);
    setLineForm({ id: '', articleId: '', articleName: '', quantity: 1, posology: '', duration: '', instructions: '', unitPrice: 0, discount: 0, delivered: false });
  };

  const handleSaveLine = () => {
    if (!lineForm.articleName) return;
    const currentId = lineForm.id;
    const exists = lines.some(l => l.id === currentId);
    if (isNewLine || !exists) {
      // Ajout : éviter les doublons si le même article existe déjà avec un autre id mais qu'on est en édition
      // On s'assure qu'on n'ajoute pas une deuxième fois la même ligne en mode édition
      if (!isNewLine && selectedLineId && exists) {
        // Cas incohérent : on était censé être en édition mais isNewLine est resté true -> on corrige en remplaçant
        setLines(prev => prev.map(l => l.id === currentId ? { ...lineForm } : l));
      } else {
        setLines(prev => [...prev, { ...lineForm }]);
      }
    } else {
      setLines(prev => prev.map(l => l.id === currentId ? { ...lineForm } : l));
    }

    // Après l'enregistrement, on libère complètement la barre de recherche.
    // Avant, elle conservait l'article enregistré (ex. « Paracétamol ») et le
    // prochain choix modifiait cette même ligne au lieu d'ajouter un médicament.
    resetLineDraft();
    // Focus back to search
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleDeleteLine = () => {
    if (!selectedLineId) return;
    setLines(prev => prev.filter(l => l.id !== selectedLineId));
    setSelectedLineId(null);
    setLineForm({ id: '', articleId: '', articleName: '', quantity: 1, posology: '', duration: '', instructions: '', unitPrice: 0, discount: 0, delivered: false });
  };

  const consultationInvoiceIds = (s: AppState, consultationId: string) => new Set(
    s.invoices.filter((inv) => inv.consultationId === consultationId).map((inv) => inv.id)
  );

  const consultationVenteIds = (s: AppState, consultationId: string, invoiceIds = consultationInvoiceIds(s, consultationId)) => new Set(
    (s.ventes || [])
      .filter((v) => v.consultationId === consultationId || (!!v.legacyInvoiceId && invoiceIds.has(v.legacyInvoiceId)))
      .map((v) => v.id)
  );

  const hasDeliveredPrescription = (c: Consultation) => c.prescriptions.some((p) => p.delivered);

  const hasPaidConsultationBilling = (s: AppState, c: Consultation) => {
    const invoiceIds = consultationInvoiceIds(s, c.id);
    const paidInvoice = s.invoices.some((inv) => invoiceIds.has(inv.id) && inv.status === 'paid');
    const venteIds = consultationVenteIds(s, c.id, invoiceIds);
    const paidVente = (s.ventes || []).some((v) =>
      venteIds.has(v.id) && (v.status === 'paid' || v.status === 'partiel' || (v.montantPaye || 0) > 0)
    );
    return paidInvoice || paidVente || isPrescriptionPaid(s, c.id);
  };

  /** La facture a-t-elle été réglée en CRÉDIT SOCIÉTÉ (aucune espèce encaissée) ? */
  const isPaidViaCompanyCredit = (s: AppState, c: Consultation) => {
    const invoiceIds = consultationInvoiceIds(s, c.id);
    return s.invoices.some((inv) => invoiceIds.has(inv.id) && inv.status === 'paid' && inv.creditSociete);
  };

  const getConsultStatus = (c: Consultation) => {
    const delivered = hasDeliveredPrescription(c);
    const paid = hasPaidConsultationBilling(state, c);
    if (delivered) {
      return {
        label: '💊 Livré',
        color: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
        canReturn: false,
        canEdit: false,
        editCancelsPayment: false,
        editTitle: 'Impossible : ordonnance déjà payée et livrée',
      };
    }
    if (paid) {
      if (isPaidViaCompanyCredit(state, c)) {
        return {
          label: '🏢 Crédit Société',
          color: 'bg-blue-100 dark:bg-cyan-500/15 text-blue-800 dark:text-cyan-300',
          canReturn: true,
          canEdit: true,
          editCancelsPayment: true,
          editTitle: 'Modifier : la validation crédit société sera annulée et le patient repassera en caisse après validation',
        };
      }
      return {
        label: '✅ Payé',
        color: 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300',
        canReturn: true,
        canEdit: true,
        editCancelsPayment: true,
        editTitle: 'Modifier : le paiement déjà encaissé sera annulé et le patient repassera en caisse après validation',
      };
    }
    return {
      label: '⏳ Attente',
      color: 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300',
      canReturn: false,
      canEdit: true,
      editCancelsPayment: false,
      editTitle: 'Modifier la prescription avant paiement',
    };
  };

  const returnToCashier = (cid: string) => {
    const c = state.consultations.find((x) => x.id === cid);
    if (!c) return;
    const patient = state.patients.find((p) => p.id === c.patientId);
    if (hasDeliveredPrescription(c)) {
      alert('Impossible : cette prescription est déjà payée et livrée. Le retour arrière est bloqué.');
      return;
    }
    const paid = hasPaidConsultationBilling(state, c);
    const msg = paid
      ? 'Annuler le paiement déjà encaissé et renvoyer le patient à la caisse ?\n\nLa prescription pourra être refacturée après correction.'
      : 'Retourner à la caisse ?';
    if (!confirm(msg)) return;
    setState((prev) => {
      const invoiceIds = consultationInvoiceIds(prev, cid);
      const venteIds = consultationVenteIds(prev, cid, invoiceIds);
      const next: AppState = {
        ...prev,
        consultations: prev.consultations.map((x) => x.id === cid
          ? { ...x, prescriptions: x.prescriptions.map((p) => ({ ...p, delivered: false })) }
          : x),
        patients: prev.patients.map((p) => p.id === c.patientId ? { ...p, status: 'consulted_awaiting_payment' as const } : p),
        invoices: prev.invoices.filter((i) => !invoiceIds.has(i.id)),
        ventes: (prev.ventes || []).filter((v) => !venteIds.has(v.id)),
        venteLines: (prev.venteLines || []).filter((l) => !venteIds.has(l.venteId)),
        ventePayments: (prev.ventePayments || []).filter((p) => !venteIds.has(p.venteId)),
      };
      addAuditLog(next, paid ? 'ANNULATION_PAIEMENT_RETOUR_CAISSE' : 'RETOUR_CAISSE', `${patient?.dossier || c.patientId} — retour à la caisse${paid ? ' avec annulation du paiement' : ''}`, c.patientId);
      addJourneyEvent(next, { patientId: c.patientId, department: 'caisse', action: paid ? 'Paiement annulé — retour caisse' : 'Retour caisse', status: 'consulted_awaiting_payment', details: paid ? 'Paiement annulé avant nouvelle facturation' : 'Patient remis en attente de paiement', actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, consultationId: cid });
      return next;
    });
  };

  const reEditConsultation = (cid: string) => {
    const c = state.consultations.find((x) => x.id === cid);
    if (!c) return;
    const patient = state.patients.find((p) => p.id === c.patientId);
    if (hasDeliveredPrescription(c)) {
      alert('Impossible : cette prescription est déjà payée et livrée. La modification est bloquée.');
      return;
    }
    const paid = hasPaidConsultationBilling(state, c);
    if (paid && !confirm('Cette prescription a déjà été payée.\n\nLa modification va annuler le paiement/la facture existante. Après validation, le patient devra repasser à la caisse.\n\nContinuer ?')) return;

    const invoiceIds = consultationInvoiceIds(state, cid);
    const venteIds = consultationVenteIds(state, cid, invoiceIds);
    // Snapshot : si le médecin quitte par « Retour » sans valider, tout est restauré
    editSnapshotRef.current = {
      consultation: c,
      invoices: state.invoices.filter((inv) => invoiceIds.has(inv.id)),
      labRequests: state.labRequests.filter((lr) => lr.consultationId === cid),
      ventes: (state.ventes || []).filter((v) => venteIds.has(v.id)),
      venteLines: (state.venteLines || []).filter((vl) => venteIds.has(vl.venteId)),
      ventePayments: (state.ventePayments || []).filter((vp) => venteIds.has(vp.venteId)),
      previousStatus: patient?.status || 'consulted_awaiting_payment',
    };
    setSelectedPatientId(c.patientId); setConsultForm({ visitReason: c.visitReason, diagnosis: c.diagnosis, notes: c.notes, isEmergency: c.isEmergency, hospitalizeRequested: c.hospitalizeRequested, surgeryRequested: c.surgeryRequested });
    setVitals({ ...c.vitalSigns }); setLines([...c.prescriptions]); setView('consultation');
    // Réinitialiser le formulaire de ligne pour éviter doublon (bug montant qui se dédouble)
    setSelectedLineId(null);
    setIsNewLine(false);
    setArticleSearch('');
    setLineForm({ id: '', articleId: '', articleName: '', quantity: 1, posology: '', duration: '', instructions: '', unitPrice: 0, discount: 0, delivered: false });
    // Restaurer les demandes d'analyses labo dans le brouillon
    const restoredLabDraft = (c.labRequests || []).map((lr) => {
      const catalogMatch = state.labCatalog.find((e) => e.name === lr.examType && e.code === lr.code);
      return catalogMatch ? { examId: catalogMatch.id, urgent: lr.urgent } : null;
    }).filter((d): d is { examId: string; urgent: boolean } => d !== null);
    setLabDraft(restoredLabDraft); setLabSearch(''); setLabSearchIdx(0);
    // Restaurer les demandes d'échographie dans le brouillon
    const restoredEchoDraft = (c.echoRequests || []).map((er) => {
      const catalogMatch = ECHO_CATALOG.find((e) => e.name === er.examType);
      return catalogMatch ? { examId: catalogMatch.id, urgent: er.urgent, notes: er.notes || '' } : null;
    }).filter((d): d is { examId: string; urgent: boolean; notes: string } => d !== null);
    setEchoDraft(restoredEchoDraft); setEchoSearch(''); setEchoSearchIdx(0);
    setState((prev) => {
      const invoiceIds = consultationInvoiceIds(prev, cid);
      const venteIds = consultationVenteIds(prev, cid, invoiceIds);
      const next: AppState = {
        ...prev,
        consultations: prev.consultations.filter((x) => x.id !== cid),
        // IMPORTANT : supprimer aussi les factures, paiements et demandes labo liés à cette consultation pour éviter le double comptage
        invoices: prev.invoices.filter((inv) => !invoiceIds.has(inv.id)),
        labRequests: prev.labRequests.filter((lr) => lr.consultationId !== cid),
        ventes: (prev.ventes || []).filter((v) => !venteIds.has(v.id)),
        venteLines: (prev.venteLines || []).filter((vl) => !venteIds.has(vl.venteId)),
        ventePayments: (prev.ventePayments || []).filter((vp) => !venteIds.has(vp.venteId)),
        patients: prev.patients.map((p) => p.id === c.patientId ? { ...p, status: 'in_consultation' as const } : p)
      };
      addAuditLog(next, paid ? 'MODIF_PRESCRIPTION_PAIEMENT_ANNULE' : 'MODIF_PRESCRIPTION', `${patient?.dossier || c.patientId} — modification de prescription${paid ? ' (paiement annulé)' : ''}`, c.patientId);
      addJourneyEvent(next, { patientId: c.patientId, department: 'consultation', action: paid ? 'Modification avec annulation du paiement' : 'Modification de prescription', status: 'in_consultation', details: paid ? 'Paiement existant annulé ; nouvelle validation attendue' : 'Prescription remise en édition avant paiement', actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, consultationId: cid });
      return next;
    });
  };

  const submitConsultation = (force = false) => {
    if (!selectedPatientId || !selectedPatient || !consultForm.diagnosis) { alert('Diagnostic obligatoire'); return; }
    // Ne pas valider si une ligne d'ordonnance est en cours de saisie mais non enregistrée
    if (blockIfUnsavedDraftLine(lineForm, lines, { entityLabel: 'le médicament' })) return;
    // Dernier contrôle avant validation : notification rouge centrée si l'ordonnance contient
    // des articles bloqués à la vente par la pharmacie ou en rupture de stock.
    if (!force) {
      const koLines = lines
        .map((l) => {
          const art = state.articles.find((a) => a.id === l.articleId || a.name === l.articleName);
          if (!art) return null;
          const av = articleAvailability(art);
          if (!av.blocked && !av.outOfStock) return null;
          return { art, av };
        })
        .filter(Boolean) as { art: Article; av: { blocked: boolean; outOfStock: boolean; manages: boolean } }[];
      if (koLines.length > 0) {
        const anyBlocked = koLines.some((k) => k.av.blocked);
        setArticleAlert({
          kind: anyBlocked ? 'blocked' : 'out_of_stock',
          title: '⛔ Ordonnance : article(s) non délivrable(s)',
          message: `${koLines.length} article(s) de l'ordonnance ne peuvent pas être délivrés par la pharmacie.`,
          items: koLines.map((k) => k.av.blocked
            ? `${k.art.name} — BLOQUÉ À LA VENTE${k.art.saleBlockReason ? ` (${k.art.saleBlockReason})` : ''}`
            : `${k.art.name} — RUPTURE DE STOCK (stock pharmacie = ${k.art.stockPharmacie})`),
          hint: "Retirez ou remplacez ces lignes, ou validez quand même : le patient devra attendre le déblocage / réapprovisionnement.",
          onForce: () => submitConsultation(true),
          forceLabel: 'Valider quand même',
        });
        return;
      }
    }
    // Garde anti double-soumission : évite les doublons de factures labo/écho
    if (submittingRef.current) return;
    submittingRef.current = true;
    // Consultation validée : le snapshot d'annulation n'est plus nécessaire
    editSnapshotRef.current = null;
    // Ordonnance NON obligatoire : diagnostic seul, analyses et/ou échographies suffisent
    const ct = clientType;
    const consultId = uuidv4();
    // Numérotation officielle des factures labo / écho créées en attente :
    // FA-MM/CODE/YY-NNN pour les sociétés, AAFAMMJJ + ordre du jour sinon.
    const factureNumbers = collectExistingFactureNumbers(state);
    const factureUpserts: Societe[] = [];
    const allocNumero = (): string => {
      const allocated = allocateFactureNumber(state, {
        clientType: ct, company: selectedPatient?.company, invoiceDate: new Date().toISOString(), numbers: factureNumbers,
      });
      if (allocated.societeUpsert) factureUpserts.push(allocated.societeUpsert);
      factureNumbers.push(allocated.numeroFacture);
      return allocated.numeroFacture;
    };
    const labNumeroFacture = labDraft.length > 0 ? allocNumero() : undefined;
    const echoNumeroFacture = echoDraft.length > 0 ? allocNumero() : undefined;
    // ---- Analyses labo -> facture en attente (bon imprimé à la CAISSE après paiement) ----
    const labInvoiceId = labDraft.length > 0 ? uuidv4() : null;
    const newLabRequests: LabRequest[] = labDraft.map((d) => {
      const e = currentLabCatalog.find((x) => x.id === d.examId) || state.labCatalog.find((x) => x.id === d.examId);
      const examName = e ? e.name : 'Examen de laboratoire';
      const examCode = e?.code || 'LAB';
      const category = e?.category;
      const parameters = e?.parameters ? [...e.parameters] : [examName];
      const sampleType = e?.sampleType || 'Sang veineux';
      const price = priceForExam(d.examId, ct, d.urgent);
      return {
        id: uuidv4(), patientId: selectedPatientId, consultationId: consultId, examType: examName, code: examCode,
        category, parameters, urgent: d.urgent, status: 'pending' as const,
        sampleType, requestedBy: state.currentUser?.id || '', requestedAt: new Date().toISOString(),
        invoiceId: labInvoiceId || undefined, price,
      };
    });
    // ---- Échographies -> facture en attente (bon imprimé à la CAISSE après paiement) ----
    const echoInvoiceId = echoDraft.length > 0 ? uuidv4() : null;
    const newEchoRequests: EchoRequest[] = echoDraft.map((d) => {
      const e = currentEchoCatalog.find((x) => x.id === d.examId) || ECHO_CATALOG.find((x) => x.id === d.examId);
      const examName = e ? e.name : 'Échographie';
      const price = echoPriceForExam(d.examId, ct, d.urgent);
      return {
        id: uuidv4(), patientId: selectedPatientId, consultationId: consultId,
        examType: examName, notes: d.notes || undefined, urgent: d.urgent,
        status: 'pending' as const, requestedBy: state.currentUser?.id || '',
        requestedAt: new Date().toISOString(), invoiceId: echoInvoiceId || undefined, price,
      };
    });

    const consultation: Consultation = {
      id: consultId, patientId: selectedPatientId, doctorId: state.currentUser?.id || '', doctorName: state.currentUser?.name || '',
      date: new Date().toISOString(), vitalSigns: { ...vitals }, visitReason: consultForm.visitReason, diagnosis: consultForm.diagnosis, notes: consultForm.notes,
      prescriptions: lines.map((l) => ({ ...l })), labRequests: newLabRequests, echoRequests: newEchoRequests,
      hospitalizeRequested: consultForm.hospitalizeRequested, surgeryRequested: consultForm.surgeryRequested, isEmergency: consultForm.isEmergency,
    };

    // RÈGLE MÉTIER : TOUT patient vu par le médecin (client comptoir OU société)
    // est envoyé à la caisse pour validation du paiement. Les clients société ne
    // paient pas en espèces : la caisse valide un CRÉDIT SOCIÉTÉ (prise en charge).
    // Le patient sort en même temps de la file d'attente du médecin.
    const nextStatus = 'consulted_awaiting_payment' as const;
    const grandTotal = totalPres + labTotal + echoTotal;

    setState((prev) => {
      // Codes société générés pour la numérotation → enregistrés dans les sociétés.
      const withCodes = factureUpserts.reduce((s, u) => applySocieteUpsert(s, u), prev);
      let next: AppState = {
        ...withCodes,
        consultations: [...withCodes.consultations, consultation],
        patients: withCodes.patients.map((p) => p.id === selectedPatientId
          ? { ...p, status: nextStatus, lastVisitAt: new Date().toISOString() }
          : p),
      };
      if (newLabRequests.length > 0 && labInvoiceId) {
        const labItems = newLabRequests.map((lr) => ({ description: `${lr.examType}${lr.urgent ? ' (Urgent)' : ''}`, amount: lr.price || 0, category: 'lab' as const }));
        const labTotalAmt = labItems.reduce((s, i) => s + i.amount, 0);
        const labInv: Invoice = {
          id: labInvoiceId, patientId: selectedPatientId, consultationId: consultation.id, clientType: ct,
          items: labItems, totalAmount: labTotalAmt, patientCharge: labTotalAmt, numeroFacture: labNumeroFacture,
          status: 'pending' as const, createdAt: new Date().toISOString(), isExternal: ct === 'externe',
        };
        next = { ...next, labRequests: [...next.labRequests, ...newLabRequests], invoices: [...next.invoices, labInv] };
        addAuditLog(next, 'DEMANDE_ANALYSE', `${newLabRequests.map((r) => r.examType).join(', ')} — ${formatAr(labTotalAmt)} (${selectedPatient.dossier})`, selectedPatientId);
        addJourneyEvent(next, { patientId: selectedPatientId, department: 'consultation', action: "Demande d'analyse", status: 'analyses_pending', details: `${newLabRequests.map((r) => r.examType).join(', ')} — à facturer (caisse)`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, consultationId: consultation.id });
      }
      if (newEchoRequests.length > 0 && echoInvoiceId) {
        const echoItems = newEchoRequests.map((er) => ({ description: `${er.examType}${er.urgent ? ' (Urgent)' : ''}`, amount: er.price || 0, category: 'echo' as const }));
        const echoTotalAmt = echoItems.reduce((s, i) => s + i.amount, 0);
        const echoInv: Invoice = {
          id: echoInvoiceId, patientId: selectedPatientId, consultationId: consultation.id, clientType: ct,
          items: echoItems, totalAmount: echoTotalAmt, patientCharge: echoTotalAmt, numeroFacture: echoNumeroFacture,
          status: 'pending' as const, createdAt: new Date().toISOString(), isExternal: ct === 'externe',
        };
        next = { ...next, invoices: [...next.invoices, echoInv] };
        addAuditLog(next, 'DEMANDE_ECHO', `${newEchoRequests.map((r) => r.examType).join(', ')} — ${formatAr(echoTotalAmt)} (${selectedPatient.dossier})`, selectedPatientId);
        addJourneyEvent(next, { patientId: selectedPatientId, department: 'imagerie', action: "Demande d'échographie", status: nextStatus, details: `${newEchoRequests.map((r) => r.examType).join(', ')} — à facturer (caisse)`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, consultationId: consultation.id });
      }

      addAuditLog(next, 'CONSULTATION', `${selectedPatient.lastName} — ${formatAr(grandTotal)}${lines.length === 0 ? ' (sans ordonnance)' : ''} — envoyé à la caisse${ct === 'societe' ? ' (crédit société)' : ''}`, selectedPatientId);
      addJourneyEvent(next, { patientId: selectedPatientId, department: 'consultation', action: 'Consultation terminée', status: nextStatus, details: `${formatAr(grandTotal)} — ${consultForm.diagnosis} — envoyé à la caisse pour validation du paiement${ct === 'societe' ? ' (crédit société)' : ''}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, consultationId: consultation.id });
      return next;
    });

    const savedPatientName = `${selectedPatient.lastName} ${selectedPatient.firstName}`;
    const savedDiagnosis = consultForm.diagnosis;
    setToastFeedback(`✅ Diagnostic & consultation validés pour ${savedPatientName} (${savedDiagnosis}) ! Patient envoyé à la caisse${clientType === 'societe' ? ' — crédit société' : ''}.`);
    setTimeout(() => setToastFeedback(null), 6000);

    setSelectedPatientId(null); setConsultForm({ visitReason: '', diagnosis: '', notes: '', isEmergency: false, hospitalizeRequested: false, surgeryRequested: false });
    setVitals({ temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' });
    setLines([]); setSearchQuery(''); setSelectedLineId(null); setIsNewLine(false);
    setArticleSearch(''); setLineForm({ id: '', articleId: '', articleName: '', quantity: 1, posology: '', duration: '', instructions: '', unitPrice: 0, discount: 0, delivered: false });
    setLabDraft([]); setLabSearch(''); setEchoDraft([]); setEchoSearch('');
    setLabDraftIdx(-1); setEchoDraftIdx(-1);
    setView('queue');
    submittingRef.current = false;
  };

  return (
    <div className="space-y-3">
      {toastFeedback && (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center p-4">
          <div className="pointer-events-auto max-w-md w-full p-4 sm:p-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white rounded-2xl shadow-2xl border border-emerald-300/40 dark:border-emerald-500/16 flex items-center justify-between gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white/20 rounded-lg shrink-0">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <span className="font-semibold text-sm leading-snug">{toastFeedback}</span>
            </div>
            <button onClick={() => setToastFeedback(null)} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/20 cursor-pointer transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
      {/* Notification rouge centrée : article bloqué en vente par la pharmacie ou en rupture de stock */}
      <AlerteArticleIndisponible alert={articleAlert} onClose={() => { setArticleAlert(null); setTimeout(() => searchRef.current?.focus(), 50); }} />
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl p-4 shadow-sm border cursor-pointer hover:border-amber-400" onClick={() => setView('queue')}><div className="flex items-center gap-3"><div className="p-2 bg-amber-100 dark:bg-amber-500/15 rounded-lg"><Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div><div><div className="text-2xl font-bold">{myWaiting.length}</div><div className="text-sm text-ink-muted">En attente</div></div></div></div>
        <div className="bg-surface rounded-xl p-4 shadow-sm border cursor-pointer hover:border-emerald-400" onClick={() => setView('my_consults')}><div className="flex items-center gap-3"><div className="p-2 bg-green-100 dark:bg-green-500/15 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" /></div><div><div className="text-2xl font-bold">{myTodayConsults.length}</div><div className="text-sm text-ink-muted">Mes consultations (auj.)</div></div></div></div>
      </div>

      {/* MY CONSULTS */}
      {view === 'my_consults' && (
        <div className="bg-surface rounded-xl shadow-sm border overflow-hidden">
          <div className="p-3 border-b bg-emerald-50 dark:bg-emerald-500/8 flex justify-between"><h3 className="font-semibold text-emerald-800 dark:text-emerald-300"><FileText className="w-5 h-5 inline" /> Consultations du jour</h3><button onClick={() => setView('queue')} className="px-3 py-1 bg-surface-active hover:bg-line-strong rounded text-sm cursor-pointer">← File</button></div>
          <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-surface-hover sticky top-0"><tr><th className="p-2 text-left">Heure</th><th className="p-2 text-left">Patient</th><th className="p-2 text-right">Montant</th><th className="p-2 text-center">Statut</th><th className="p-2 text-center">Action</th></tr></thead>
            <tbody>{myTodayConsults.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-ink-faint">Aucune</td></tr>
              : myTodayConsults.map((c) => { const pat = state.patients.find((p) => p.id === c.patientId); const st = getConsultStatus(c); const prescriptionIsPaid = isPrescriptionPaid(state, c.id); const prescTotal = c.prescriptions.reduce((s, p) => s + roundTo2(p.unitPrice * p.quantity * (1 - p.discount / 100)), 0); const labTotal = (c.labRequests || []).reduce((s, lr) => s + (lr.price || 0), 0); const echoTotal = (c.echoRequests || []).reduce((s, er) => s + (er.price || 0), 0); const total = prescTotal + labTotal + echoTotal;
                return (<tr key={c.id} className="border-b hover:bg-surface-muted"><td className="p-2 font-mono">{new Date(c.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td className="p-2 font-medium">{pat?.lastName} {pat?.firstName} <span className="text-xs text-ink-faint">({pat?.dossier})</span></td><td className="p-2 text-right font-mono font-bold">{formatAr(total)}{(prescTotal > 0 && !prescriptionIsPaid) ? <span className="block text-[10px] font-normal text-amber-600 dark:text-amber-400">Prescription masquée — paiement requis</span> : (prescriptionIsPaid && prescTotal > 0) || labTotal > 0 || echoTotal > 0 ? <span className="block text-[10px] font-normal text-ink-faint">{prescriptionIsPaid && prescTotal > 0 ? `💊${formatAr(prescTotal)} ` : ''}{labTotal > 0 ? `🧪${formatAr(labTotal)} ` : ''}{echoTotal > 0 ? `📡${formatAr(echoTotal)}` : ''}</span> : ''}</td><td className="p-2 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${st.color}`}>{st.label}</span></td><td className="p-2 text-center flex gap-1 justify-center flex-wrap">{st.canEdit && <button onClick={() => reEditConsultation(c.id)} title={st.editTitle} className={`px-2 py-1 text-white rounded text-xs cursor-pointer ${st.editCancelsPayment ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-500 hover:bg-blue-600'}`}><Edit2 className="w-3 h-3 inline" /> {st.editCancelsPayment ? 'Mod. (annule)' : 'Mod.'}</button>}{st.canReturn && <button onClick={() => returnToCashier(c.id)} title="Annuler le paiement et renvoyer en caisse" className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs cursor-pointer"><RotateCcw className="w-3 h-3 inline" /> Caisse</button>}{!st.canEdit && !st.canReturn && <span className="text-[10px] text-ink-faint" title={st.editTitle}>—</span>}</td></tr>); })}</tbody>
          </table></div>
        </div>
      )}

      {/* QUEUE */}
      {view === 'queue' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-3">
            <div className="bg-surface rounded-xl shadow-sm border p-3"><div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-ink-faint" /><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-lg outline-none text-sm" placeholder="Rechercher patient..." /></div>
              {searchQuery.length >= 2 && searchResults.length > 0 && <div className="mt-2 max-h-40 overflow-y-auto border rounded divide-y">{searchResults.map((p) => (<div key={p.id} onClick={() => selectPatient(p.id)} className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/8 cursor-pointer text-sm">{p.lastName} {p.firstName} ({p.dossier})</div>))}</div>}
            </div>
            <div className="bg-surface rounded-xl shadow-sm border overflow-hidden">
              <div className="p-3 border-b bg-amber-50 dark:bg-amber-500/8 flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm"><Clock className="w-4 h-4 inline text-amber-500" /> File ({myWaiting.length})</h3>
                {onRefreshQueue && (
                  <button
                    onClick={onRefreshQueue}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 text-[11px] font-semibold hover:bg-amber-100 dark:hover:bg-amber-500/15 cursor-pointer transition"
                    title="Relire immédiatement les saisies de la réception et des autres postes"
                  ><RefreshCw className="w-3.5 h-3.5" /> Actualiser</button>
                )}
              </div>
              <div className="divide-y max-h-[500px] overflow-y-auto">{myWaiting.length === 0 ? <div className="p-6 text-center text-ink-faint text-sm">Aucun</div>
                : myWaiting.map((p) => {
                  return (
                    <div key={p.id} onClick={() => selectPatient(p.id)} className="p-3 cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-500/8 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-sm">{p.lastName} {p.firstName}</div>
                        </div>
                        <div className="text-xs text-ink-muted">{p.dossier}{p.company ? ` • ${p.company}` : ''}</div>
                        {p.allergies.length > 0 && <div className="text-xs text-red-600 dark:text-red-400"><AlertTriangle className="w-3 h-3 inline" /> {p.allergies.join(', ')}</div>}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteWaitingPatient(p.id); }}
                        className="shrink-0 p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/15 hover:text-rose-700 dark:hover:text-rose-400 cursor-pointer transition"
                        title="Retirer la consultation de la file — dossier conservé"
                      ><Trash2 className="w-4 h-4" /></button>
                    </div>
                  );
                })}</div>
            </div>
          </div>
          <div className="lg:col-span-2 bg-surface rounded-xl shadow-sm border p-12 text-center text-ink-faint"><Stethoscope className="w-16 h-16 mx-auto mb-4 opacity-30" /><p>Sélectionnez un patient</p></div>
        </div>
      )}

      {/* CONSULTATION */}
      {view === 'consultation' && selectedPatient && (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          {/* Header */}
          <div className="bg-surface rounded-xl shadow-sm border p-3.5 space-y-2">
            <div className="flex flex-wrap justify-between items-start gap-2">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2 flex-wrap">
                  <span>{selectedPatient.lastName} {selectedPatient.firstName}</span>
                  <span className="text-sm font-mono text-blue-600 dark:text-cyan-400 font-semibold">({selectedPatient.dossier})</span>
                  <button
                    type="button"
                    onClick={() => setShowMedClientTypeEdit(v => !v)}
                    className="p-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 rounded transition cursor-pointer"
                    title="Modifier le type de client / société"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {selectedPatient.company && <span className="px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400 font-medium">{selectedPatient.company}{selectedPatient.subCompany ? ` / ${selectedPatient.subCompany}` : ''}</span>}
                  {selectedPatient.famille && (
                    <span className="px-2 py-0.5 rounded text-xs bg-indigo-50 dark:bg-indigo-500/8 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/25 font-medium" title="Base de famille">
                      👨‍👩‍👧 {selectedPatient.famille} {selectedPatient.lienFamilial ? `(${selectedPatient.lienFamilial})` : ''}
                    </span>
                  )}
                </h3>
                <div className="text-xs text-ink-muted flex items-center gap-3 mt-0.5 flex-wrap">
                  <span>Sexe: <strong>{selectedPatient.gender === 'M' ? 'Homme (H)' : 'Femme (F)'}</strong></span>
                  <span>•</span>
                  <span>Âge: <strong>{selectedPatient.age}</strong></span>
                  {selectedPatient.bloodGroup && (
                    <>
                      <span>•</span>
                      <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                        <Droplets className="w-3.5 h-3.5 inline" /> Groupe: {selectedPatient.bloodGroup}
                      </span>
                    </>
                  )}
                  {selectedPatient.ssn && (
                    <>
                      <span>•</span>
                      <span>CIN/SSN: <span className="font-mono">{selectedPatient.ssn}</span></span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowPatientEditModal(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm flex items-center gap-1.5 transition"
                  title="Compléter ou modifier le dossier médical du patient (groupe sanguin, antécédents, allergies, famille...)"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Compléter Dossier
                </button>
                <button onClick={() => onOpenMedicalRecord && onOpenMedicalRecord(selectedPatient.id)} className="px-2.5 py-1.5 bg-surface-hover hover:bg-surface-active text-ink rounded-lg text-xs font-medium cursor-pointer transition">
                  <History className="w-3.5 h-3.5 inline mr-1" /> Historique ({patientConsultations.length})
                </button>
                <button onClick={handleBackToQueue} className="px-2.5 py-1.5 bg-surface-active hover:bg-line-strong text-ink rounded-lg text-xs font-medium cursor-pointer transition" title="Retour à la file — le patient est remis en attente s'il n'a pas été validé">
                  ← Retour
                </button>
              </div>
            </div>

            {/* 🏢 Société / Type client — panneau repliable, ouvert via l'icône stylo du titre */}
            {showMedClientTypeEdit && (
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/25 bg-indigo-50 dark:bg-indigo-500/8 p-3 space-y-2">
              <div className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">🏢 Société / Type client
                <button type="button" onClick={() => setShowMedClientTypeEdit(false)} className="ml-auto text-indigo-500 hover:text-indigo-800 dark:hover:text-indigo-300 cursor-pointer" title="Fermer">✕</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block font-bold text-ink mb-0.5">Type</label>
                  <select value={medEditClientType} onChange={e => setMedEditClientType(e.target.value as ClientType)} className="w-full px-2 py-1.5 border rounded bg-surface cursor-pointer">
                    <option value="comptoir">Client Comptoir</option>
                    <option value="societe">Client Société</option>
                  </select>
                </div>
                {medEditClientType === 'societe' && (
                  <div>
                    <label className="block font-bold text-ink mb-0.5">Société</label>
                    <SearchableSelect value={medEditCompany} onChange={setMedEditCompany} options={companyOptions(state.companies)} placeholder="— Taper pour filtrer puis choisir —" ariaLabel="Société" inputClassName="w-full px-2 py-1.5 border rounded outline-none bg-surface" />
                  </div>
                )}
              </div>
              {medEditClientType === 'societe' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex gap-1">
                    <input type="text" value={medEditNewCompany} onChange={e => setMedEditNewCompany(e.target.value.toUpperCase())} className="flex-1 px-2 py-1.5 border rounded uppercase bg-surface" placeholder="Nouvelle société…" />
                    <button type="button" onClick={() => { const name = addMedPartnerCompany(medEditNewCompany); if (name) { setMedEditCompany(name); setMedEditNewCompany(''); }}} className="px-2 py-1.5 bg-indigo-600 text-white rounded font-bold">+</button>
                  </div>
                  <div>
                    <label className="block font-bold text-ink mb-0.5">Sous-société</label>
                    <SuggestionInput mode="contient" value={medEditSubCompany} onChange={setMedEditSubCompany} suggestions={classerSuggestions(sousSocietesConnues(state, medEditCompany))} placeholder="Sous-société — saisie libre (assistance de la base)" ariaLabel="Sous-société" className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-surface" />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={saveMedSociete} className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded text-xs font-bold cursor-pointer">Enregistrer type / société</button>
                <button type="button" onClick={() => setShowMedClientTypeEdit(false)} className="px-3 py-1.5 bg-surface border border-line-strong hover:bg-surface-hover text-ink rounded text-xs font-bold cursor-pointer">Annuler</button>
              </div>
            </div>
            )}

            {/* Badges synthétiques du dossier médical */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-line-soft text-xs">
              <div className={`p-2 rounded-lg border ${selectedPatient.allergies.length > 0 ? 'bg-red-50 dark:bg-red-500/8 border-red-200 dark:border-red-500/25 text-red-800 dark:text-red-300' : 'bg-surface-muted border-line text-ink-muted'}`}>
                <span className="font-bold block text-[11px] mb-0.5">⚠️ Allergies :</span>
                {selectedPatient.allergies.length > 0 ? selectedPatient.allergies.join(', ') : 'Aucune allergie renseignée'}
              </div>
              <div className={`p-2 rounded-lg border ${selectedPatient.antecedents.length > 0 ? 'bg-amber-50 dark:bg-amber-500/8 border-amber-200 dark:border-amber-500/25 text-amber-900 dark:text-amber-300' : 'bg-surface-muted border-line text-ink-muted'}`}>
                <span className="font-bold block text-[11px] mb-0.5">📋 Antécédents :</span>
                {selectedPatient.antecedents.length > 0 ? selectedPatient.antecedents.join(', ') : 'Aucun antécédent répertorié'}
              </div>
              <div className={`p-2 rounded-lg border ${selectedPatient.chronicTreatments.length > 0 ? 'bg-blue-50 dark:bg-cyan-500/8 border-blue-200 dark:border-cyan-500/25 text-blue-900 dark:text-cyan-300' : 'bg-surface-muted border-line text-ink-muted'}`}>
                <span className="font-bold block text-[11px] mb-0.5">💊 Traitements chroniques :</span>
                {selectedPatient.chronicTreatments.length > 0 ? selectedPatient.chronicTreatments.join(', ') : 'Aucun traitement continu'}
              </div>
            </div>
          </div>

          {/* SECTION : RÉSULTATS D'ANALYSES BIOLOGIQUES POUR LE MÉDECIN */}
          {(() => {
            const rawPatientLabs = state.labRequests.filter(lr => lr.patientId === selectedPatient.id || (lr.consultationId && patientConsultations.some(c => c.id === lr.consultationId)));
            const seenMedLabIds = new Set<string>();
            const patientLabs: typeof rawPatientLabs = [];
            for (const lr of rawPatientLabs) {
              if (!seenMedLabIds.has(lr.id)) {
                seenMedLabIds.add(lr.id);
                patientLabs.push(lr);
              }
            }
            const completedLabs = patientLabs.filter(lr => lr.status === 'completed' && lr.results && lr.results.length > 0);
            const inProgressLabs = patientLabs.filter(lr => lr.status !== 'completed');

            if (patientLabs.length === 0) return null;

            return (
              <div className="bg-surface rounded-xl shadow-sm border border-cyan-200 dark:border-cyan-500/25 overflow-hidden">
                <div className="p-3 bg-cyan-50 dark:bg-cyan-500/8 border-b border-cyan-100 dark:border-cyan-500/25 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                    <h4 className="font-bold text-sm text-cyan-900 dark:text-cyan-300">
                      Résultats & Analyses Laboratoire ({completedLabs.length} disponible{completedLabs.length > 1 ? 's' : ''})
                    </h4>
                    {inProgressLabs.length > 0 && (
                      <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-bold rounded-full animate-pulse">
                        ⏳ {inProgressLabs.length} en cours au labo
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-muted font-mono">Espace Biologie & Médical</span>
                </div>

                <div className="p-3 space-y-3 max-h-80 overflow-y-auto bg-surface-muted/50 divide-y divide-line">
                  {completedLabs.length === 0 ? (
                    <p className="text-xs text-ink-muted italic py-2 text-center">
                      Aucun résultat d'analyse encore disponible. Les demandes sont en cours de traitement au laboratoire.
                    </p>
                  ) : (
                    completedLabs.map((lr) => {
                      const hasAbnormal = (lr.results || []).some((r) => r.isAbnormal) || lr.biologicalAlert;
                      return (
                        <div key={lr.id} className="pt-2 first:pt-0 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-ink-strong text-xs">{lr.examType}</span>
                              <span className="text-[10px] text-ink-faint font-mono">
                                [{lr.code || 'LAB'}] · Réalisé le {new Date(lr.completedAt || Date.now()).toLocaleString('fr-FR')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {hasAbnormal ? (
                                <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/25 rounded-full text-[10px] font-bold flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> PATHOLOGIQUE / ALERTE
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25 rounded-full text-[10px] font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Résultats Normaux
                                </span>
                              )}
                              <button
                                onClick={() => printLabResultTicket(state.ticketSettings, selectedPatient, lr, state.currentUser?.name, labCategoryLabel(lr.category || 'autre'))}
                                className="px-2 py-1 bg-surface hover:bg-surface-hover text-ink border border-line-strong rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition shadow-xs"
                                title="Imprimer le compte-rendu d'analyse"
                              >
                                <Printer className="w-3 h-3 text-ink-muted" /> Imprimer
                              </button>
                            </div>
                          </div>

                          {/* Paramètres et valeurs */}
                          <div className="bg-surface rounded-lg border border-line overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-surface-hover text-ink-secondary font-semibold border-b border-line">
                                <tr>
                                  <th className="text-left p-1.5">Paramètre</th>
                                  <th className="text-center p-1.5">Valeur Mesurée</th>
                                  <th className="text-center p-1.5">Normes de Référence</th>
                                  <th className="text-center p-1.5">Interprétation</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line-soft">
                                {(lr.results || []).map((r, idx) => (
                                  <tr key={idx} className={r.isAbnormal ? 'bg-rose-50/70 dark:bg-rose-500/6 font-semibold' : ''}>
                                    <td className="p-1.5 text-ink-strong">{r.parameter}</td>
                                    <td className={`p-1.5 text-center font-mono font-bold ${r.isAbnormal ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                                      {r.value} {r.unit || ''}
                                    </td>
                                    <td className="p-1.5 text-center text-ink-muted font-mono text-[11px]">
                                      {r.normalRangeText || (r.normalMin !== undefined && r.normalMax !== undefined && r.normalMin !== r.normalMax ? `${r.normalMin} - ${r.normalMax} ${r.unit || ''}` : '—')}
                                    </td>
                                    <td className="p-1.5 text-center">
                                      {r.isAbnormal ? (
                                        <span className="text-rose-700 dark:text-rose-400 font-bold text-[10px] flex items-center justify-center gap-0.5">
                                          <AlertTriangle className="w-3 h-3 inline" /> ANORMAL
                                        </span>
                                      ) : (
                                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">Normal</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Conclusion du Biologiste */}
                          {lr.labConclusion && (
                            <div className="p-2.5 bg-cyan-50 dark:bg-cyan-500/8 border border-cyan-200 dark:border-cyan-500/25 rounded-lg text-xs text-cyan-950 dark:text-cyan-300 flex items-start justify-between gap-2">
                              <div>
                                <span className="font-bold block text-[11px] text-cyan-900 dark:text-cyan-300 mb-0.5">💬 Conclusion du Laboratoire :</span>
                                <p className="italic">{lr.labConclusion}</p>
                              </div>
                              <button
                                onClick={() => {
                                  setConsultForm(prev => ({
                                    ...prev,
                                    notes: prev.notes ? `${prev.notes}\n[Labo ${lr.examType}] ${lr.labConclusion}` : `[Labo ${lr.examType}] ${lr.labConclusion}`
                                  }));
                                  setToastFeedback('Conclusion ajoutée aux notes de consultation !');
                                }}
                                className="shrink-0 px-2 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-[10px] font-bold cursor-pointer transition shadow-xs"
                              >
                                + Copier dans mes notes
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}

          {/* Vitals + Consult */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <div className="bg-surface rounded-xl shadow-sm border p-3">
              <h4 className="font-semibold mb-1 text-xs"><Heart className="w-3 h-3 text-red-500 inline" /> Constantes</h4>
              <div className="grid grid-cols-4 gap-1">{[{l:'T°C',k:'temperature' as const},{l:'PAS',k:'bloodPressureSystolic' as const},{l:'PAD',k:'bloodPressureDiastolic' as const},{l:'FC',k:'heartRate' as const},{l:'SpO2',k:'oxygenSaturation' as const},{l:'Poids',k:'weight' as const},{l:'Taille',k:'height' as const}].map(v => (<div key={v.k}><label className="text-[9px] text-ink-muted">{v.l}</label><input type="number" step="0.1" value={vitals[v.k]||''} onChange={(e)=>setVitals({...vitals,[v.k]:e.target.value})} className="w-full px-1 py-0.5 border rounded text-xs outline-none" placeholder="—" /></div>))}</div>
            </div>
            <div className="bg-surface rounded-xl shadow-sm border p-3">
              <h4 className="font-semibold mb-1 text-xs"><FileText className="w-3 h-3 text-emerald-500 inline" /> Consultation</h4>
              <div className="space-y-1">
                <input type="text" value={consultForm.visitReason} onChange={(e)=>setConsultForm({...consultForm,visitReason:e.target.value})} className="w-full px-2 py-0.5 border rounded text-xs outline-none" placeholder="Motif (optionnel)" />
                <textarea value={consultForm.diagnosis} onChange={(e)=>setConsultForm({...consultForm,diagnosis:e.target.value})} className="w-full px-2 py-0.5 border border-red-300 dark:border-red-500/40 rounded text-xs outline-none" rows={2} placeholder="Diagnostic * (obligatoire)" />
                <textarea value={consultForm.notes} onChange={(e)=>setConsultForm({...consultForm,notes:e.target.value})} className="w-full px-2 py-0.5 border rounded text-xs outline-none" rows={1} placeholder="Notes" />
                <div className="flex gap-3 text-[10px]">
                  <label className="cursor-pointer"><input type="checkbox" checked={consultForm.isEmergency} onChange={(e)=>setConsultForm({...consultForm,isEmergency:e.target.checked})} /> <span className="text-red-600 dark:text-red-400">🚨 Urgence</span></label>
                  <label className="cursor-pointer"><input type="checkbox" checked={consultForm.hospitalizeRequested} onChange={(e)=>setConsultForm({...consultForm,hospitalizeRequested:e.target.checked})} /> Hospit.</label>
                  <label className="cursor-pointer"><input type="checkbox" checked={consultForm.surgeryRequested} onChange={(e)=>setConsultForm({...consultForm,surgeryRequested:e.target.checked})} /> <span className="text-blue-600 dark:text-cyan-400">🏥 Bloc</span></label>
                </div>
              </div>
            </div>
          </div>

          {/* SAGE-STYLE PRESCRIPTION — no family combo, single search field */}
          <div className="bg-surface-muted border border-line-strong rounded">
            {/* Sage form bar */}
            <div className="bg-surface-hover border-b border-line-strong p-1.5 m-2 mb-0 rounded shadow-inner">
              <div className="flex flex-wrap items-end gap-1">
                <div className="flex-1 min-w-[140px] relative">
                  <label className="block text-[9px] text-ink-muted">Article (tapez + ↑↓ + Entrée)</label>
                  <input ref={searchRef} type="text" value={articleSearch ? articleSearch : lineForm.articleName}
                    onChange={(e) => { setArticleSearch(e.target.value); setArtSearchIdx(0); }}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full bg-surface border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent/25"
                    placeholder="🔍 Médicament / article hors LAB et ECHO..." />
                  {articleSearch.length >= 1 && filteredArticles.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-surface border border-line-strong rounded-b shadow-xl z-30 max-h-40 overflow-y-auto">
                      {filteredArticles.map((a, idx) => {
                        const manages = familyManagesStock(a.family, state.familles);
                        const isBlocked = !!a.saleBlocked;
                        const isOut = manages && a.stockPharmacie <= 0;
                        const isLow = manages && !isOut && a.stockPharmacie <= a.minStockPharmacie && !a.alertDisabledPharmacie;
                        const isKo = isBlocked || isOut;
                        return (
                        <div key={a.id} onClick={() => handleArticleSelect(a.id)}
                          title={isBlocked
                            ? `Bloqué à la vente par la pharmacie${a.saleBlockReason ? ` — ${a.saleBlockReason}` : ''}`
                            : isOut ? 'Rupture de stock pharmacie — non délivrable tant que non réapprovisionné' : undefined}
                          className={`px-2 py-1 cursor-pointer text-xs flex justify-between border-b border-line-soft ${isKo ? 'bg-red-50 dark:bg-red-500/8 text-red-700 dark:text-red-400' : idx === artSearchIdx ? 'bg-blue-100 dark:bg-cyan-500/15' : 'hover:bg-blue-50 dark:hover:bg-cyan-500/8'}`}>
                          <span><span className="text-[9px] text-ink-faint mr-1">[{a.family}]</span> {a.name}</span>
                          <span className="flex items-center gap-2">
                            {isBlocked
                              ? <span className="px-1.5 py-0.5 bg-red-700 text-white rounded text-[9px] font-bold">⛔ BLOQUÉ VENTE</span>
                              : isOut
                                ? <span className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[9px] font-bold">🚨 RUPTURE</span>
                                : manages
                                  ? <span className={`font-mono text-[10px] ${isLow ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-ink-faint'}`}>Stock: {a.stockPharmacie}{isLow ? ' ⚠️' : ''}</span>
                                  : <span className="font-mono text-[10px] text-ink-faint" title="Famille non gérée en stock">stock: —</span>}
                            <span className={`font-mono ${isKo ? 'text-red-400' : 'text-blue-600 dark:text-cyan-400'}`}>{formatAr(getPrice(a, clientType))}</span>
                          </span>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="w-14"><label className="block text-[9px] text-ink-muted">Qté</label><input type="number" min={1} value={lineForm.quantity} onChange={(e)=>updateLineForm('quantity',parseFloat(e.target.value)||1)} onKeyDown={(e)=>{ if(e.key==='Enter'){e.preventDefault();handleSaveLine();}}} className="w-full bg-surface border border-line-strong rounded px-1 py-0.5 text-xs text-right font-mono outline-none focus:border-accent" /></div>
                <div className="w-28"><label className="block text-[9px] text-ink-muted">Posologie</label><input type="text" value={lineForm.posology} onChange={(e)=>updateLineForm('posology',e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter'){e.preventDefault();handleSaveLine();}}} className="w-full bg-surface border border-line-strong rounded px-1 py-0.5 text-xs outline-none focus:border-accent" placeholder="1cp 3x/j" /></div>
                <div className="w-14"><label className="block text-[9px] text-ink-muted">Remise%</label><input type="number" min={0} max={100} value={lineForm.discount} onChange={(e)=>updateLineForm('discount',parseFloat(e.target.value)||0)} onKeyDown={(e)=>{ if(e.key==='Enter'){e.preventDefault();handleSaveLine();}}} className="w-full bg-surface border border-line-strong rounded px-1 py-0.5 text-xs text-right font-mono outline-none focus:border-accent" /></div>
                <div className="w-20"><label className="block text-[9px] text-ink-muted">P.U.</label><input type="text" readOnly value={formatAr(lineForm.unitPrice)} className="w-full bg-surface-active border border-line-strong rounded px-1 py-0.5 text-xs text-right font-mono" /></div>
                <div className="w-24"><label className="block text-[9px] text-ink-muted">Montant</label><input type="text" readOnly value={formatAr(lineAmount(lineForm))} className="w-full bg-surface-active border border-line-strong rounded px-1 py-0.5 text-xs text-right font-mono font-bold text-ink" /></div>
              </div>
              <div className="flex justify-end gap-1 mt-1">
                <button onClick={() => { resetLineDraft(); setTimeout(() => searchRef.current?.focus(), 50); }} className="flex items-center gap-1 px-2 py-0.5 bg-surface border border-line-strong rounded shadow-sm text-ink text-[10px] cursor-pointer" title="Effacer la saisie en cours et rechercher un nouveau médicament"><Plus className="h-3 w-3 text-ink-muted" /> Nouveau</button>
                <button onClick={handleDeleteLine} disabled={!selectedLineId} className="flex items-center gap-1 px-2 py-0.5 bg-surface border border-line-strong rounded shadow-sm text-ink text-[10px] disabled:opacity-40 cursor-pointer"><Trash2 className="h-3 w-3 text-rose-600 dark:text-rose-400" /> Supprimer</button>
                <button onClick={handleSaveLine} disabled={!lineForm.articleName} className="flex items-center gap-1 px-2 py-0.5 bg-sky-500 text-white border border-sky-600 rounded shadow-sm text-[10px] font-medium disabled:opacity-40 cursor-pointer"><Save className="h-3 w-3" /> Enregistrer</button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-surface mx-2 mb-2 border-t border-line-strong overflow-x-auto rounded-b">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-surface-muted border-b border-line-strong text-ink-secondary">
                  <tr className="divide-x divide-line"><th className="p-1 min-w-[130px]">Désignation</th><th className="p-1 text-right w-12">Qté</th><th className="p-1 w-24">Posologie</th><th className="p-1 text-center w-12">Rem%</th><th className="p-1 text-right w-20">P.U.</th><th className="p-1 text-right w-24">Montant</th></tr>
                </thead>
                <tbody className="divide-y font-mono">
                  {lines.map((l) => {
                    const isSel = l.id === selectedLineId;
                    const art = state.articles.find((a) => a.id === l.articleId || a.name === l.articleName);
                    const av = art ? articleAvailability(art) : null;
                    const lineKo = !!av && (av.blocked || av.outOfStock);
                    return (<tr key={l.id} onClick={() => { setSelectedLineId(l.id); setIsNewLine(false); }} className={`cursor-pointer divide-x divide-line transition-colors ${isSel ? 'bg-blue-500 text-white font-medium' : lineKo ? 'bg-red-50 dark:bg-red-500/8 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/15' : 'hover:bg-surface-muted text-ink-strong'}`}>
                      <td className="p-1 font-sans">{l.articleName}{lineKo && <span className={`ml-1.5 px-1 py-0.5 rounded text-[8px] font-bold align-middle ${isSel ? 'bg-surface text-red-700 dark:text-red-400' : 'bg-red-600 text-white'}`}>{av!.blocked ? '⛔ BLOQUÉ' : '🚨 RUPTURE'}</span>}</td><td className="p-1 text-right">{l.quantity}</td><td className="p-1 font-sans">{l.posology || '—'}</td><td className="p-1 text-center">{l.discount > 0 ? `${l.discount}%` : '—'}</td><td className="p-1 text-right">{formatNum(l.unitPrice)}</td><td className="p-1 text-right font-bold">{formatNum(lineAmount(l))}</td>
                    </tr>);
                  })}
                  {lines.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-ink-faint font-sans">Ordonnance optionnelle — tapez un article (↑↓ Entrée) ou validez sans médicament</td></tr>}
                </tbody>
                {lines.length > 0 && <tfoot className="bg-emerald-50 dark:bg-emerald-500/8 border-t-2 border-emerald-300 dark:border-emerald-500/40 font-sans">
                  <tr className="divide-x divide-emerald-200 dark:divide-emerald-500/25"><td colSpan={4} className="p-1 text-right font-bold">TOTAL:</td><td colSpan={2} className="p-1 text-right font-mono font-bold text-lg text-emerald-800 dark:text-emerald-300">{formatAr(totalPres)}</td></tr>
                </tfoot>}
              </table>
            </div>
          </div>

          {/* SAISIE DES EXAMENS LABORATOIRE ET ÉCHOGRAPHIE CÔTE À CÔTE */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* DEMANDES D'ANALYSES — LABORATOIRE (saisies par le médecin) */}
            <div className="bg-surface rounded-xl shadow-sm border p-3.5 flex flex-col justify-between h-full space-y-2">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm flex items-center gap-2 text-ink-strong"><FlaskConical className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Demandes d'analyses (Labo)</h4>
                  <span className="text-[10px] text-ink-faint hidden sm:block">A facturer en caisse</span>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-ink-faint" />
                  <input ref={labSearchRef} type="text" value={labSearch} onChange={(e) => { setLabSearch(e.target.value); setLabSearchIdx(0); }} onKeyDown={handleLabSearchKeyDown} className="w-full pl-9 pr-3 py-2 border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 text-sm" placeholder="Rechercher analyse (NFS, Glycémie...) ↑↓ ↵" />
                  {labSearch.length >= 1 && labFiltered.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-surface border border-line-strong rounded-b shadow-xl z-30 max-h-48 overflow-y-auto">
                      {labFiltered.map((e, idx) => {
                        const already = labDraft.some((d) => d.examId === e.id);
                        return (
                          <div key={e.id} onClick={() => addLabExam(e.id)} className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b border-line-soft ${already ? 'opacity-40 bg-surface-muted' : idx === labSearchIdx ? 'bg-cyan-100 dark:bg-cyan-500/15' : 'hover:bg-cyan-50 dark:hover:bg-cyan-500/8'}`}>
                            <span><span className="text-[9px] text-ink-faint mr-1">[{e.code}]</span> {e.name} <span className="text-ink-faint">· {labCategoryLabel(e.category)}</span></span>
                            <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">{formatAr(clientType === 'societe' ? e.priceSociete : clientType === 'externe' ? e.priceExterne : e.priceComptoir)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div>
                {labDraft.length > 0 ? (
                  <div className="border border-line rounded-lg divide-y bg-surface-muted/40" tabIndex={0} onKeyDown={handleLabDraftKeyDown} onFocus={() => setLabDraftIdx(0)}>
                    {labDraft.map((d) => {
                      const e = currentLabCatalog.find((x) => x.id === d.examId);
                      if (!e) return null;
                      const isDraftSel = labDraft.indexOf(d) === labDraftIdx;
                      return (
                        <div key={d.examId} className={`flex items-center justify-between p-2 text-xs ${isDraftSel ? 'bg-cyan-100 dark:bg-cyan-500/15 border-l-2 border-cyan-500' : ''}`}>
                          <div className="mr-2">
                            <div className="font-bold text-ink-strong">{e.name} <span className="text-[10px] text-ink-faint font-normal">[{e.code}]</span></div>
                            <div className="text-[10px] text-ink-faint">{e.sampleType} · {e.durationHours}h</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <label className="flex items-center gap-1 text-[10px] cursor-pointer"><input type="checkbox" checked={d.urgent} onChange={() => toggleLabUrgent(d.examId)} className="w-3.5 h-3.5" /> <span className="text-red-600 dark:text-red-400 font-semibold">Urgent</span></label>
                            <span className="font-mono font-bold text-ink w-20 text-right">{formatAr(priceForExam(d.examId, clientType, d.urgent))}</span>
                            <button onClick={() => removeLabExam(d.examId)} className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 cursor-pointer p-0.5" title="Retirer"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center p-2 bg-cyan-100/70 dark:bg-cyan-500/10 text-xs font-bold text-cyan-900 dark:text-cyan-300 rounded-b-lg">
                      <span>Total analyses</span>
                      <span className="font-mono text-sm">{formatAr(labTotal)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ink-faint text-center py-4 border border-dashed border-line rounded-lg bg-surface-muted/50">Aucune analyse sélectionnée — recherchez ci-dessus.</p>
                )}
              </div>
            </div>

            {/* DEMANDES D'ÉCHOGRAPHIE (saisies par le médecin) */}
            <div className="bg-surface rounded-xl shadow-sm border p-3.5 flex flex-col justify-between h-full space-y-2">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm flex items-center gap-2 text-ink-strong"><Scan className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Demandes d'échographie</h4>
                  <span className="text-[10px] text-ink-faint hidden sm:block">A facturer en caisse</span>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-ink-faint" />
                  <input ref={echoSearchRef} type="text" value={echoSearch} onChange={(e) => { setEchoSearch(e.target.value); setEchoSearchIdx(0); }} onKeyDown={handleEchoSearchKeyDown} className="w-full pl-9 pr-3 py-2 border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="Rechercher échographie (Abdominale, Pelvienne...) ↑↓ ↵" />
                  {echoSearch.length >= 1 && echoFiltered.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-surface border border-line-strong rounded-b shadow-xl z-30 max-h-48 overflow-y-auto">
                      {echoFiltered.map((e, idx) => {
                        const already = echoDraft.some((d) => d.examId === e.id);
                        return (
                          <div key={e.id} onClick={() => addEchoExam(e.id)} className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b border-line-soft ${already ? 'opacity-40 bg-surface-muted' : idx === echoSearchIdx ? 'bg-indigo-100 dark:bg-indigo-500/15' : 'hover:bg-indigo-50 dark:hover:bg-indigo-500/8'}`}>
                            <span><span className="text-[9px] text-ink-faint mr-1">[{e.code}]</span> {e.name}</span>
                            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{formatAr(clientType === 'societe' ? e.priceSociete : clientType === 'externe' ? e.priceExterne : e.priceComptoir)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div>
                {echoDraft.length > 0 ? (
                  <div className="border border-line rounded-lg divide-y bg-surface-muted/40" tabIndex={0} onKeyDown={handleEchoDraftKeyDown} onFocus={() => setEchoDraftIdx(0)}>
                    {echoDraft.map((d) => {
                      const e = currentEchoCatalog.find((x) => x.id === d.examId);
                      if (!e) return null;
                      const isDraftSel = echoDraft.indexOf(d) === echoDraftIdx;
                      return (
                        <div key={d.examId} className={`flex items-center justify-between p-2 text-xs ${isDraftSel ? 'bg-indigo-100 dark:bg-indigo-500/15 border-l-2 border-indigo-500' : ''}`}>
                          <div className="flex-1 mr-2">
                            <div className="font-bold text-ink-strong">{e.name} <span className="text-[10px] text-ink-faint font-normal">[{e.code}]</span></div>
                            <input
                              type="text"
                              placeholder="Notes / indication clinique..."
                              value={d.notes || ''}
                              onChange={(evt) => updateEchoNotes(d.examId, evt.target.value)}
                              className="w-full text-[11px] text-ink-secondary border-b border-dashed border-line outline-none focus:border-indigo-500 py-0.5 mt-0.5 bg-transparent"
                            />
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <label className="flex items-center gap-1 text-[10px] cursor-pointer"><input type="checkbox" checked={d.urgent} onChange={() => toggleEchoUrgent(d.examId)} className="w-3.5 h-3.5" /> <span className="text-red-600 dark:text-red-400 font-semibold">Urgent</span></label>
                            <span className="font-mono font-bold text-ink w-20 text-right">{formatAr(echoPriceForExam(d.examId, clientType, d.urgent))}</span>
                            <button onClick={() => removeEchoExam(d.examId)} className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 cursor-pointer p-0.5" title="Retirer"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center p-2 bg-indigo-100/70 dark:bg-indigo-500/10 text-xs font-bold text-indigo-900 dark:text-indigo-300 rounded-b-lg">
                      <span>Total échographies</span>
                      <span className="font-mono text-sm">{formatAr(echoTotal)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ink-faint text-center py-4 border border-dashed border-line rounded-lg bg-surface-muted/50">Aucune échographie sélectionnée — recherchez ci-dessus.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => submitConsultation()} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2 cursor-pointer shadow-lg">
              <Send className="w-5 h-5" /> Valider — {formatAr(totalPres + labTotal + echoTotal)}
            </button>
          </div>
        </div>
      )}

      {/* MODAL COMPLETION DOSSIER MEDICAL PATIENT (PAR LE MEDECIN) */}
      {showPatientEditModal && selectedPatient && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 bg-gradient-to-r from-indigo-700 to-blue-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-indigo-200" />
                <div>
                  <h3 className="font-bold text-base">Compléter le Dossier Médical Patient</h3>
                  <p className="text-xs text-indigo-100">{selectedPatient.lastName} {selectedPatient.firstName} ({selectedPatient.dossier})</p>
                </div>
              </div>
              <button onClick={() => setShowPatientEditModal(false)} className="p-1 hover:bg-white/20 rounded-lg text-white transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-sm">
              {/* Section Profil Médical */}
              <div className="bg-surface-muted rounded-xl p-3.5 border border-line space-y-3">
                <h4 className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                  <Droplets className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Profil Médical & Risques Cliniques
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Groupe Sanguin</label>
                    <Select
                      value={patientEditForm.bloodGroup}
                      onChange={(e) => setPatientEditForm({ ...patientEditForm, bloodGroup: e.target.value })}
                      className="w-full px-3 py-2 bg-surface border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold text-rose-700 dark:text-rose-400"
                    >
                      <option value="">-- Non renseigné --</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Allergies (séparées par virgules)</label>
                    <input
                      type="text"
                      value={patientEditForm.allergiesText}
                      onChange={(e) => setPatientEditForm({ ...patientEditForm, allergiesText: e.target.value })}
                      placeholder="Ex: Pénicilline, Aspirine, Latex..."
                      className="w-full px-3 py-2 bg-surface border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs text-red-700 dark:text-red-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Antécédents Médicaux / Chirurgicaux (séparés par virgules)</label>
                  <textarea
                    rows={2}
                    value={patientEditForm.antecedentsText}
                    onChange={(e) => setPatientEditForm({ ...patientEditForm, antecedentsText: e.target.value })}
                    placeholder="Ex: HTA sous Amlodipine, Diabète Type 2, Appendicectomie 2018..."
                    className="w-full px-3 py-2 bg-surface border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Traitements Chroniques / Longue Durée (séparés par virgules)</label>
                  <textarea
                    rows={2}
                    value={patientEditForm.chronicTreatmentsText}
                    onChange={(e) => setPatientEditForm({ ...patientEditForm, chronicTreatmentsText: e.target.value })}
                    placeholder="Ex: Metformine 1000mg 2x/j, Levothyrox 75µg..."
                    className="w-full px-3 py-2 bg-surface border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs text-blue-800 dark:text-cyan-300"
                  />
                </div>
              </div>

              {/* Section Base de Famille & Identité */}
              <div className="bg-surface-muted rounded-xl p-3.5 border border-line space-y-3">
                <h4 className="font-bold text-ink-strong flex items-center gap-1.5 text-xs uppercase tracking-wider">
                  <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Base de Famille & Identité Administrative
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Base de Famille (Nom du Foyer)</label>
                    <input
                      type="text"
                      value={patientEditForm.famille}
                      onChange={(e) => setPatientEditForm({ ...patientEditForm, famille: e.target.value })}
                      placeholder="Ex: Famille RAKOTO, Famille DUPONT..."
                      className="w-full px-3 py-2 bg-surface border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Lien Familial dans le Foyer</label>
                    <Select
                      value={patientEditForm.lienFamilial}
                      onChange={(e) => setPatientEditForm({ ...patientEditForm, lienFamilial: e.target.value })}
                      className="w-full px-3 py-2 bg-surface border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                    >
                      <option value="">-- Sélectionner --</option>
                      <option value="Chef de famille">Chef de famille</option>
                      <option value="Époux / Épouse">Époux / Épouse</option>
                      <option value="Enfant">Enfant</option>
                      <option value="Parent (Père/Mère)">Parent (Père/Mère)</option>
                      <option value="Autre ayant droit">Autre ayant droit</option>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">CIN / N° Sécurité Sociale (SSN)</label>
                    <input
                      type="text"
                      value={patientEditForm.ssn}
                      onChange={(e) => setPatientEditForm({ ...patientEditForm, ssn: e.target.value })}
                      placeholder="N° CIN / Sécurité Sociale"
                      className="w-full px-3 py-2 bg-surface border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Matricule Interne / Société</label>
                    <input
                      type="text"
                      value={patientEditForm.matricule}
                      onChange={(e) => setPatientEditForm({ ...patientEditForm, matricule: e.target.value })}
                      placeholder="N° Matricule..."
                      className="w-full px-3 py-2 bg-surface border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Téléphone / Contact</label>
                    <PhoneInput
                      value={patientEditForm.contact}
                      onChange={(v) => setPatientEditForm({ ...patientEditForm, contact: v })}
                      placeholder="038 34 092 61"
                      className="w-full px-3 py-2 bg-surface border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Adresse Domicile</label>
                    <input
                      type="text"
                      value={patientEditForm.address}
                      onChange={(e) => setPatientEditForm({ ...patientEditForm, address: e.target.value })}
                      placeholder="Adresse complète..."
                      className="w-full px-3 py-2 bg-surface border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-surface-hover border-t border-line flex justify-end gap-2">
              <button
                onClick={() => setShowPatientEditModal(false)}
                className="px-4 py-2 bg-surface-active hover:bg-line-strong text-ink font-semibold rounded-lg text-xs cursor-pointer transition"
              >
                Annuler
              </button>
              <button
                onClick={savePatientMedicalProfile}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs shadow-md flex items-center gap-1.5 cursor-pointer transition"
              >
                <Save className="w-4 h-4" /> Enregistrer le Dossier Médical
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMATION DE RETRAIT DE LA FILE */}
      {patientToPurge && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl max-w-md w-full shadow-2xl border border-line-soft overflow-hidden">
            <div className="p-5 border-b border-line-soft flex items-center justify-between bg-rose-50/50 dark:bg-rose-500/4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 rounded-xl">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-ink-strong text-base">Retirer de la file d'attente</h3>
                  <p className="text-xs text-ink-muted font-mono">{patientToPurge.dossier}</p>
                </div>
              </div>
              <button
                onClick={() => setPatientToPurge(null)}
                className="text-ink-faint hover:text-ink-secondary p-1.5 rounded-lg hover:bg-surface-hover cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-ink-secondary">
              <p className="text-sm font-semibold text-ink-strong">
                Êtes-vous sûr de vouloir retirer <strong>{patientToPurge.lastName} {patientToPurge.firstName}</strong> de votre file de consultation ?
              </p>
              <div className="p-3 bg-amber-50 dark:bg-amber-500/8 border border-amber-200 dark:border-amber-500/25 rounded-xl space-y-1 text-amber-900 dark:text-amber-300">
                <p className="font-bold flex items-center gap-1 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Dossier médical intact :
                </p>
                <p className="text-[11px]">
                  Le dossier du patient, ses antécédents, ses constantes déjà enregistrées et son historique restent intégrés en base de données.
                </p>
              </div>
            </div>

            <div className="p-4 bg-surface-muted border-t border-line-soft flex justify-end gap-2">
              <button
                onClick={() => setPatientToPurge(null)}
                className="px-4 py-2 bg-surface-active hover:bg-line-strong text-ink font-semibold rounded-xl text-xs cursor-pointer transition"
              >
                Annuler
              </button>
              <button
                onClick={() => confirmPurgePatient(patientToPurge)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-1.5 cursor-pointer transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> Retirer de la file
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
