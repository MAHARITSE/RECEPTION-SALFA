import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Patient, VitalSigns, ClientType, PatientStatus } from '../types';
import type { AppState } from '../store';
import { normalizeDossierNumber, isDossierTaken, calculateAge, addAuditLog, addNotification, addJourneyEvent, companyIsBlocked, selectableCompanies } from '../store';
import { printQueueTicket } from '../utils/printTicket';
import {
  Search, Plus, Edit, Trash2, UserX, Activity,
  X, Check, Ban, Users, LogIn, Hospital,
  Stethoscope, MessageCircle, Info, FileWarning, AlertCircle
} from 'lucide-react';
import { PhoneInput } from './PhoneInput';
import { motion, AnimatePresence } from 'motion/react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onStaffLogin: () => void; onOpenMessaging: () => void; }
type ModalType = 'none' | 'add' | 'edit' | 'vitals' | 'blacklistConfirm' | 'blacklistReason' | 'blacklistList' | 'unblacklistConfirm' | 'deleteConfirm' | 'patientInfo';

export default function ModuleReception({ state, setState, onStaffLogin, onOpenMessaging }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientToRestore, setPatientToRestore] = useState<Patient | null>(null);
  const [unblacklistToast, setUnblacklistToast] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalType>('none');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [blacklistReason, setBlacklistReason] = useState('');

  // Edition société — toujours visible quand patient choisi (comme hospit/bloc)
  const [recEditClientType, setRecEditClientType] = useState<ClientType>('comptoir');
  const [recEditCompany, setRecEditCompany] = useState('');
  const [recEditSubCompany, setRecEditSubCompany] = useState('');
  const [recEditNewCompany, setRecEditNewCompany] = useState('');

  const [patientTouched, setPatientTouched] = useState<Record<string, boolean>>({});
  const [patientSubmitted, setPatientSubmitted] = useState(false);

  const [vitalsTouched, setVitalsTouched] = useState<Record<string, boolean>>({});
  const [vitalsSubmitted, setVitalsSubmitted] = useState(false);

  const [patientForm, setPatientForm] = useState({
    dossier: '', lastName: '', firstName: '', dateOfBirth: '', gender: 'F' as 'M' | 'F',
    address: '', contact: '', ssn: '', matricule: '', insureName: '',
    clientType: 'comptoir' as ClientType, company: '', subCompany: '',
    famille: '', lienFamilial: '',
  });

  const getPatientFormErrors = (pf: typeof patientForm) => {
    const errors: Record<string, string> = {};
    const isNew = modal === 'add';

    const dossier = normalizeDossierNumber(pf.dossier);
    if (!dossier) {
      errors.dossier = 'Le numéro de dossier est obligatoire';
    } else if (isDossierTaken(state.patients, dossier, modal === 'edit' ? selectedPatient?.id : undefined)) {
      errors.dossier = 'Ce numéro de dossier existe déjà';
    }

    if (!pf.lastName.trim()) {
      errors.lastName = 'Le nom est obligatoire';
    } else if (pf.lastName.trim().length < 2) {
      errors.lastName = 'Le nom doit comporter au moins 2 caractères';
    } else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/.test(pf.lastName.trim())) {
      errors.lastName = 'Le nom contient des caractères invalides';
    }

    // Prénom facultatif : on ne le contrôle que s'il est renseigné.
    if (pf.firstName.trim() && pf.firstName.trim().length < 2) {
      errors.firstName = 'Le prénom doit comporter au moins 2 caractères';
    } else if (pf.firstName.trim() && !/^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/.test(pf.firstName.trim())) {
      errors.firstName = 'Le prénom contient des caractères invalides';
    }

    // Date de naissance obligatoire à la création.
    if (isNew && !pf.dateOfBirth) {
      errors.dateOfBirth = 'La date de naissance est obligatoire';
    } else if (pf.dateOfBirth) {
      const dob = new Date(pf.dateOfBirth);
      const today = new Date();
      if (isNaN(dob.getTime())) {
        errors.dateOfBirth = 'Date de naissance invalide';
      } else if (dob > today) {
        errors.dateOfBirth = 'La date de naissance ne peut pas être dans le futur';
      } else if (dob.getFullYear() < 1900) {
        errors.dateOfBirth = 'Année de naissance trop ancienne (min 1900)';
      }
    }

    if (pf.contact.trim()) {
      const cleanPhone = pf.contact.replace(/[\s\-\.\+]/g, '');
      if (!/^\d{8,15}$/.test(cleanPhone)) {
        errors.contact = 'Numéro invalide (ex: 034 12 345 67, 8 à 15 chiffres)';
      }
    }

    // Adresse obligatoire à la création.
    if (isNew && !pf.address.trim()) {
      errors.address = "L'adresse est obligatoire";
    }

    if (pf.clientType === 'societe' && !pf.company.trim()) {
      errors.company = 'Veuillez sélectionner une société obligatoire';
    }

    return errors;
  };

  const patientErrors = getPatientFormErrors(patientForm);

  const [vitalsForm, setVitalsForm] = useState<VitalSigns>({
    temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '',
    heartRate: '', oxygenSaturation: '', weight: '', height: '', tdr: '',
  });
  const [vitalsClientType, setVitalsClientType] = useState<ClientType>('comptoir');
  const [vitalsCompany, setVitalsCompany] = useState('');
  const [vitalsSubCompany, setVitalsSubCompany] = useState('');
  const [vitalsReadOnly, setVitalsReadOnly] = useState(false);

  const getVitalsFormErrors = (vitals: VitalSigns, clientType: ClientType, company: string) => {
    const errors: Record<string, string> = {};

    if (vitals.temperature !== '') {
      const val = parseFloat(vitals.temperature);
      if (isNaN(val) || val < 30 || val > 45) {
        errors.temperature = 'Entre 30.0 et 45.0 °C';
      }
    }

    if (vitals.oxygenSaturation !== '') {
      const val = parseFloat(vitals.oxygenSaturation);
      if (isNaN(val) || val < 50 || val > 100) {
        errors.oxygenSaturation = 'Entre 50 et 100 %';
      }
    }

    const sys = vitals.bloodPressureSystolic !== '' ? parseFloat(vitals.bloodPressureSystolic) : null;
    const dia = vitals.bloodPressureDiastolic !== '' ? parseFloat(vitals.bloodPressureDiastolic) : null;

    if (sys !== null) {
      if (isNaN(sys) || sys < 40 || sys > 280) {
        errors.bloodPressureSystolic = 'Sys 40 - 280';
      }
    }

    if (dia !== null) {
      if (isNaN(dia) || dia < 20 || dia > 180) {
        errors.bloodPressureDiastolic = 'Dia 20 - 180';
      }
    }

    if (sys !== null && dia !== null && !isNaN(sys) && !isNaN(dia) && dia >= sys) {
      errors.bloodPressureDiastolic = 'Dia doit être < Sys';
    }

    if (vitals.heartRate !== '') {
      const val = parseFloat(vitals.heartRate);
      if (isNaN(val) || val < 20 || val > 250) {
        errors.heartRate = '20 - 250 bpm';
      }
    }

    if (vitals.height !== '') {
      const val = parseFloat(vitals.height);
      if (isNaN(val) || val < 20 || val > 250) {
        errors.height = '20 - 250 cm';
      }
    }

    if (vitals.weight !== '') {
      const val = parseFloat(vitals.weight);
      if (isNaN(val) || val < 0.5 || val > 350) {
        errors.weight = '0.5 - 350 kg';
      }
    }

    if (clientType === 'societe' && !company.trim()) {
      errors.vitalsCompany = 'Société obligatoire';
    }

    return errors;
  };

  const vitalsErrors = getVitalsFormErrors(vitalsForm, vitalsClientType, vitalsCompany);

  const getBlacklistError = (reason: string) => {
    if (!reason.trim()) return 'Le motif de blocage est obligatoire';
    if (reason.trim().length < 3) return 'Le motif doit comporter au moins 3 caractères';
    return null;
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedPatient) {
      setRecEditClientType((selectedPatient.clientType === 'externe' ? 'comptoir' : selectedPatient.clientType) as ClientType);
      setRecEditCompany(selectedPatient.company || '');
      setRecEditSubCompany(selectedPatient.subCompany || '');
      setRecEditNewCompany('');
    }
  }, [selectedPatient?.id, selectedPatient?.clientType, selectedPatient?.company, selectedPatient?.subCompany]);

  // Ordre décroissant : dernier enregistré / dernier arrivé en haut
  const filteredPatients = state.patients
    .filter((p) => {
      const q = searchQuery.toLowerCase();
      const ms = p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) ||
        p.dossier.toLowerCase().includes(q) || (p.matricule && p.matricule.toLowerCase().includes(q));
      return ms;
    })
    .sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());

  const waitingCount = state.patients.filter((p) => p.status === 'waiting_consultation').length;
  const todayCount = state.patients.filter((p) => new Date(p.registeredAt).toDateString() === new Date().toDateString()).length;
  const blacklistedPatients = state.patients.filter((p) => p.blacklisted);

  const addRecPartnerCompany = (rawName: string): string | null => {
    const name = rawName.trim().toUpperCase();
    if (!name) return null;
    const existing = state.companies.find(c => c.name.toUpperCase() === name);
    if (existing) return existing.name;
    setState(prev => ({ ...prev, companies: [...prev.companies, { id: `comp-${Date.now()}`, name, paymentMode: 'Crédit', settlementMode: 'monthly_global', createdAt: new Date().toISOString() }]}));
    return name;
  };
  const saveRecSociete = () => {
    if (!selectedPatient) return;
    setState(prev => ({
      ...prev,
      patients: prev.patients.map(p => p.id === selectedPatient.id ? { ...p, clientType: recEditClientType === 'externe' ? 'comptoir' : recEditClientType as 'comptoir'|'societe', company: recEditClientType === 'societe' ? recEditCompany : undefined, subCompany: recEditClientType === 'societe' ? recEditSubCompany : undefined } : p)
    }));
  };

  const handleRowDoubleClick = (patient: Patient) => {
    setSelectedPatient(patient);
    setVitalsReadOnly(!canEditVitals(patient));
    setVitalsForm(patient.vitalSigns || {
      temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '',
      heartRate: '', oxygenSaturation: '', weight: '', height: '', tdr: '',
    });
    setVitalsClientType(patient.clientType === 'externe' ? 'comptoir' : patient.clientType);
    setVitalsCompany(patient.company || '');
    setVitalsSubCompany(patient.subCompany || '');
    setVitalsTouched({});
    setVitalsSubmitted(false);
    setModal('vitals');
  };

  const handleSaveVitalsAndSend = () => {
    if (!selectedPatient) return;
    setVitalsSubmitted(true);
    const errs = getVitalsFormErrors(vitalsForm, vitalsClientType, vitalsCompany);
    if (Object.keys(errs).length > 0) return;
    if (selectedPatient.vitalSigns && !canEditVitals(selectedPatient)) { alert('Les paramètres de ce passage en cours sont verrouillés : modification autorisée pendant 24 heures seulement.'); return; }
    setState((prev) => {
      const next = {
        ...prev,
        patients: prev.patients.map((p) =>
          p.id === selectedPatient.id ? {
            ...p,
            vitalSigns: { ...vitalsForm },
            status: 'waiting_consultation' as const,
            // Nouvelle venue : le patient retourne dans la file COMMUNE des médecins.
            // Sans cette remise à zéro, il restait rattaché au médecin de la visite
            // précédente et n'apparaissait dans aucune autre file d'attente.
            assignedDoctor: undefined,
            assignedSpecialty: undefined,
            lastVisitAt: new Date().toISOString(),
            clientType: vitalsClientType,
            company: vitalsClientType === 'societe' ? vitalsCompany : undefined,
            subCompany: vitalsClientType === 'societe' ? vitalsSubCompany : undefined,
          } : p
        ),
      };
      addAuditLog(next, 'PARAMETRES_ET_ENVOI', `${selectedPatient.dossier} → Envoyé médecin`, selectedPatient.id);
      addJourneyEvent(next, { patientId: selectedPatient.id, department: 'reception', action: 'Adressé au médecin', status: 'waiting_consultation', details: 'Paramètres vitaux saisis', actorName: 'Réception' });
      return next;
    });
    // Imprime un ticket de file d'attente (numéro auto = nombre de patients en attente + 1)
    const queueNumber = state.patients.filter((p) => p.status === 'waiting_consultation').length + 1;
    printQueueTicket(state.ticketSettings, { ...selectedPatient, status: 'waiting_consultation' }, queueNumber);
    setModal('none');
  };

  const handleAddPatient = () => {
    setPatientSubmitted(true);
    const errs = getPatientFormErrors(patientForm);
    if (Object.keys(errs).length > 0) return;

    const np: Patient = {
      id: uuidv4(), dossier: normalizeDossierNumber(patientForm.dossier),
      matricule: patientForm.matricule || undefined,
      firstName: patientForm.firstName.toUpperCase(), lastName: patientForm.lastName.toUpperCase(),
      dateOfBirth: patientForm.dateOfBirth || 'N/A', age: patientForm.dateOfBirth ? calculateAge(patientForm.dateOfBirth) : 'N/A',
      gender: patientForm.gender, address: patientForm.address.toUpperCase(), contact: patientForm.contact, ssn: patientForm.ssn,
      clientType: patientForm.clientType, company: patientForm.company || undefined, subCompany: patientForm.subCompany || undefined,
      allergies: [], chronicTreatments: [], antecedents: [],
      registeredAt: new Date().toISOString(), registeredBy: 'RECEPTION', status: 'registered',
      famille: patientForm.famille || undefined,
      lienFamilial: patientForm.lienFamilial || undefined,
    };
    setState((prev) => {
      const next = { ...prev, patients: [...prev.patients, np] };
      addAuditLog(next, 'ENREGISTREMENT', `Nouveau: ${np.dossier} - ${np.lastName} ${np.firstName}`, np.id);
      addJourneyEvent(next, { patientId: np.id, department: 'reception', action: 'Enregistrement patient', status: 'registered', details: `Dossier ${np.dossier} créé`, actorName: 'Réception' });
      return next;
    });
    setModal('none'); setSelectedPatient(np);
  };

  const handleEditPatient = () => {
    if (!selectedPatient) return;
    setPatientSubmitted(true);
    const errs = getPatientFormErrors(patientForm);
    if (Object.keys(errs).length > 0) return;

    setState((prev) => ({
      ...prev,
      patients: prev.patients.map((p) => p.id === selectedPatient.id ? {
        ...p, dossier: normalizeDossierNumber(patientForm.dossier), firstName: patientForm.firstName.toUpperCase(), lastName: patientForm.lastName.toUpperCase(),
        dateOfBirth: patientForm.dateOfBirth || 'N/A', age: patientForm.dateOfBirth ? calculateAge(patientForm.dateOfBirth) : 'N/A',
        gender: patientForm.gender, address: patientForm.address.toUpperCase(), contact: patientForm.contact, ssn: patientForm.ssn,
        matricule: patientForm.matricule || undefined,
        clientType: patientForm.clientType, company: patientForm.company || undefined, subCompany: patientForm.subCompany || undefined,
        famille: patientForm.famille || undefined,
        lienFamilial: patientForm.lienFamilial || undefined,
      } : p),
    }));
    setModal('none');
  };

  const handleDeletePatient = () => {
    if (!selectedPatient) return;
    setModal('deleteConfirm');
  };

  const confirmDeletePatient = () => {
    if (!selectedPatient) return;
    const target = selectedPatient;
    setState((prev) => {
      const next = { ...prev, patients: prev.patients.filter((p) => p.id !== target.id) };
      addAuditLog(next, 'SUPPRESSION', `Dossier supprimé: ${target.dossier}`, target.id);
      return next;
    });
    setUnblacklistToast(`Le dossier ${target.dossier} (${target.lastName} ${target.firstName}) a été supprimé.`);
    setTimeout(() => setUnblacklistToast(null), 5000);
    setSelectedPatient(null);
    setModal('none');
  };

  // Le bouton principal « Blacklist » est un accès à la liste complète.
  // L'ajout d'un patient à cette liste reste disponible depuis la colonne BL.
  const handleBlacklistClick = () => {
    setModal('blacklistList');
  };

  const confirmBlacklist = () => {
    setBlacklistReason('');
    setModal('blacklistReason');
  };

  const saveBlacklist = () => {
    if (!selectedPatient || !blacklistReason.trim()) return;
    const blacklistDate = new Date().toISOString();
    setState((prev) => {
      const next = { ...prev, patients: prev.patients.map((p) => p.id === selectedPatient.id ? {
        ...p, blacklisted: true, blacklistReason: blacklistReason.trim(), blacklistDate,
      } : p) };
      addAuditLog(next, 'BLACKLIST', `${selectedPatient.dossier} blacklisté — Motif : ${blacklistReason.trim()}`, selectedPatient.id);
      return next;
    });
    setUnblacklistToast(`Le patient ${selectedPatient.lastName} ${selectedPatient.firstName} (${selectedPatient.dossier}) a été mis en liste noire.`);
    setTimeout(() => setUnblacklistToast(null), 5000);
    setSelectedPatient(null);
    setModal('none');
  };

  const requestRestorePatient = (patient: Patient) => {
    setPatientToRestore(patient);
    setModal('unblacklistConfirm');
  };

  const confirmRestorePatient = () => {
    if (!patientToRestore) return;
    const target = patientToRestore;

    setState((prev) => {
      const next = {
        ...prev,
        patients: prev.patients.map((p) => p.id === target.id ? {
          ...p,
          blacklisted: false,
          blacklistReason: undefined,
          blacklistDate: undefined,
        } : p),
      };
      addAuditLog(next, 'UNBLACKLIST', `${target.dossier} rétabli — remis dans la liste normale`, target.id);
      return next;
    });

    // Évite de conserver un objet sélectionné avec l'ancien statut.
    setSelectedPatient((current) => current?.id === target.id ? {
      ...current,
      blacklisted: false,
      blacklistReason: undefined,
      blacklistDate: undefined,
    } : current);

    setUnblacklistToast(`Le patient ${target.lastName} ${target.firstName} (${target.dossier}) a été rétabli dans la liste normale.`);
    setTimeout(() => setUnblacklistToast(null), 5000);

    setPatientToRestore(null);
    const remaining = state.patients.filter((p) => p.blacklisted && p.id !== target.id);
    if (remaining.length > 0) {
      setModal('blacklistList');
    } else {
      setModal('none');
    }
  };

  const handleBlacklistToggle = (patient: Patient) => {
    if (patient.blacklisted) {
      requestRestorePatient(patient);
    } else {
      setSelectedPatient(patient);
      setBlacklistReason('');
      setModal('blacklistReason');
    }
  };

  /**
   * Saisie des paramètres vitaux autorisée ?
   *
   * Le verrou de 24 h protège les paramètres d'un passage EN COURS (le patient est
   * déjà dans le circuit : médecin, caisse, pharmacie, labo). Il ne doit JAMAIS
   * empêcher l'ouverture d'une NOUVELLE venue : auparavant, un patient revenu plus
   * de 24 h après sa dernière visite restait en lecture seule — le bouton
   * « VALIDER & ENVOYER AU MÉDECIN » était désactivé et la réception ne pouvait plus
   * l'adresser au médecin (les saisies n'arrivaient donc jamais chez le médecin).
   */
  const canEditVitals = (patient: Patient): boolean => {
    if (!patient.vitalSigns) return true;
    // Passage terminé / dossier au repos → nouvelle venue : saisie de nouveau ouverte.
    const ACTIVE_VISIT_STATUSES: PatientStatus[] = [
      'waiting_consultation', 'in_consultation', 'consulted_awaiting_payment',
      'invoice_paid', 'analyses_pending', 'analyses_complete',
    ];
    if (!ACTIVE_VISIT_STATUSES.includes(patient.status)) return true;
    if (!patient.lastVisitAt) return true;
    const last = new Date(patient.lastVisitAt).getTime();
    const now = Date.now();
    return (now - last) < 24 * 60 * 60 * 1000; // 24h sur le passage en cours
  };

  const openVitalsForPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setVitalsReadOnly(!canEditVitals(patient));
    setVitalsForm(patient.vitalSigns || {
      temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '',
      heartRate: '', oxygenSaturation: '', weight: '', height: '', tdr: '',
    });
    setVitalsClientType(patient.clientType === 'externe' ? 'comptoir' : patient.clientType);
    setVitalsCompany(patient.company || '');
    setVitalsSubCompany(patient.subCompany || '');
    setModal('vitals');
  };

  /**
   * Dernière visite : lastVisitAt si renseigné, sinon dernière facture payée,
   * sinon dernière consultation, sinon date d'enregistrement.
   * Corrige les fiches déjà payées dont lastVisitAt était resté vide.
   */
  const resolveLastVisit = (patient: Patient): string | undefined => {
    if (patient.lastVisitAt) return patient.lastVisitAt;
    const paidDates = state.invoices
      .filter((i) => i.patientId === patient.id && i.status === 'paid' && i.paidAt)
      .map((i) => i.paidAt as string);
    const consultDates = state.consultations
      .filter((c) => c.patientId === patient.id)
      .map((c) => c.date);
    const journeyDates = state.journey
      .filter((j) => j.patientId === patient.id && (j.department === 'reception' || j.department === 'caisse' || j.department === 'consultation'))
      .map((j) => j.timestamp);
    const all = [...paidDates, ...consultDates, ...journeyDates].filter(Boolean);
    if (all.length === 0) {
      // Patient déjà en parcours (payé / consulté) sans historique → registeredAt
      if (patient.status && patient.status !== 'registered') return patient.registeredAt;
      return undefined;
    }
    return all.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  };

  const formatLastVisit = (dateStr?: string): string => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="flex flex-col min-h-screen w-full bg-canvas text-ink font-sans select-none">
      {/* En-tête principal */}
      <header className="theme-header px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 max-w-full">
          <div className="theme-brand-mark mr-1"><Hospital className="w-5 h-5 -rotate-45" /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-wider uppercase font-mono text-ink-strong">MediCare <span className="text-accent">HIS</span></h1>
              <span className="hidden lg:inline-block rounded border border-accent-line bg-accent-soft text-accent-strong px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider">Réception &amp; Accueil</span>
            </div>
            <p className="text-ink-muted text-xs font-medium">Enregistrement des patients · File d'attente des consultations</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto min-w-0">
          <div className="flex-1 sm:flex-none min-w-0 text-right bg-surface-muted rounded-lg px-3 py-1.5 border border-line">
            <div className="text-lg sm:text-xl font-mono font-bold tabular-nums leading-tight text-accent">{currentTime.toLocaleTimeString('fr-FR')}</div>
            <div className="text-[11px] text-ink-muted capitalize truncate">{currentTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <button onClick={onOpenMessaging} className="flex items-center justify-center gap-2 p-2.5 border border-line bg-surface hover:bg-surface-hover text-ink-muted hover:text-accent rounded-lg transition-colors cursor-pointer" title="Messagerie interne">
            <MessageCircle className="w-5 h-5" />
          </button>
          <button onClick={onStaffLogin} className="theme-primary-button flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg transition-colors font-semibold text-sm cursor-pointer shrink-0">
            <LogIn className="w-4 h-4" /> <span className="hidden sm:inline">Espace</span> Personnel
          </button>
        </div>
      </header>

      {/* Barre d'outils — recherche + actions */}
      <section className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 sm:px-6 py-2.5 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Rechercher un patient" className="w-full pl-9 pr-9 py-2 bg-field text-ink border border-line rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" placeholder="Rechercher : nom, dossier, matricule…" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-secondary cursor-pointer" aria-label="Effacer la recherche"><X className="h-4 w-4" /></button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => { setModal('add'); setPatientTouched({}); setPatientSubmitted(false); setPatientForm({ dossier: '', lastName: '', firstName: '', dateOfBirth: '', gender: 'F', address: '', contact: '', ssn: '', matricule: '', insureName: '', clientType: 'comptoir', company: '', subCompany: '', famille: '', lienFamilial: '' }); }} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition cursor-pointer"><Plus className="h-4 w-4" /> Nouveau</button>
            <button onClick={() => { if (!selectedPatient) return; setPatientTouched({}); setPatientSubmitted(false); setPatientForm({ dossier: selectedPatient.dossier, lastName: selectedPatient.lastName, firstName: selectedPatient.firstName, dateOfBirth: selectedPatient.dateOfBirth === 'N/A' ? '' : selectedPatient.dateOfBirth, gender: selectedPatient.gender, address: selectedPatient.address, contact: selectedPatient.contact, ssn: selectedPatient.ssn, matricule: selectedPatient.matricule || '', insureName: selectedPatient.company || selectedPatient.insureName || '', clientType: selectedPatient.clientType === 'externe' ? 'comptoir' : selectedPatient.clientType, company: selectedPatient.company || '', subCompany: selectedPatient.subCompany || '', famille: selectedPatient.famille || '', lienFamilial: selectedPatient.lienFamilial || '' }); setModal('edit'); }} disabled={!selectedPatient} className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Edit className="h-4 w-4" /> Modifier</button>
            <button onClick={handleDeletePatient} disabled={!selectedPatient} className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Trash2 className="h-4 w-4" /> Supprimer</button>
            <div className="mx-0.5 hidden h-6 w-px bg-line-strong sm:block" />
            <button onClick={() => selectedPatient && setModal('patientInfo')} disabled={!selectedPatient} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Info className="h-4 w-4" /> Info</button>
            <button onClick={handleBlacklistClick} title="Afficher les patients bloqués" className="flex items-center gap-1.5 px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-xs font-bold shadow-sm transition cursor-pointer"><UserX className="h-4 w-4" /> Bloqués{blacklistedPatients.length > 0 && <span className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] leading-none">{blacklistedPatients.length}</span>}</button>
          </div>
        </div>
      </section>

      <main className="flex-1 px-4 sm:px-6 pt-4 pb-8">
        {unblacklistToast && (
          <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center p-4">
            <div className="pointer-events-auto max-w-md w-full p-4 sm:p-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white rounded-2xl shadow-2xl border border-emerald-300/40 dark:border-emerald-500/16 flex items-center justify-between gap-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-white/20 rounded-lg shrink-0">
                  <Check className="w-6 h-6 text-white" />
                </div>
                <span className="font-semibold text-sm leading-snug">{unblacklistToast}</span>
              </div>
              <button onClick={() => setUnblacklistToast(null)} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/20 cursor-pointer transition">
                ✕
              </button>
            </div>
          </div>
        )}
        <div className="bg-surface border border-line rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-line px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-surface-muted">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">📋 Patients — <span className="text-ink">{filteredPatients.length}</span> fiche(s)</span>
            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold bg-amber-100 dark:bg-amber-500/15 px-2.5 py-1 rounded-full">💡 Double-clic sur une ligne → saisie des paramètres</span>
          </div>

          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-surface-hover text-ink-muted sticky top-0 z-10">
                <tr><th className="p-2.5 border-r border-line w-10 text-center text-xs uppercase tracking-wide">#</th><th className="p-2.5 border-r border-line w-8 text-center text-xs uppercase" title="Liste noire">BL</th><th className="p-2.5 border-r border-line w-8 text-center text-xs uppercase" title="Paramètres">P</th><th className="p-2.5 border-r border-line w-20 text-left">Dossier</th><th className="p-2.5 border-r border-line w-20 text-left">Matricule</th><th className="p-2.5 border-r border-line min-w-[200px] text-left">Nom et Prénom</th><th className="p-2.5 border-r border-line w-24 text-left">Date naiss.</th><th className="p-2.5 border-r border-line w-16 text-left">Âge</th><th className="p-2.5 border-r border-line w-12 text-center">Sexe</th><th className="p-2.5 border-r border-line w-28 text-left">Téléphone</th><th className="p-2.5 border-r border-line min-w-[120px] text-left">Adresse</th><th className="p-2.5 border-r border-line w-32 text-left">Dernière visite</th><th className="p-2.5 min-w-[120px] text-left">Société</th></tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                {filteredPatients.map((patient, index) => {
                  const isSel = selectedPatient?.id === patient.id;
                  const hv = patient.vitalSigns && (patient.vitalSigns.temperature || patient.vitalSigns.weight);
                  return (
                    <motion.tr 
                      key={patient.id}
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3, type: 'spring', bounce: 0 }}
                      onClick={() => setSelectedPatient(patient)} onDoubleClick={() => handleRowDoubleClick(patient)}
                      className={`cursor-pointer border-b transition-colors ${patient.blacklisted ? (isSel ? 'bg-red-200 dark:bg-red-500/25 hover:bg-red-300 dark:hover:bg-red-500/35 border-red-300 dark:border-red-500/40 text-red-900 dark:text-red-300' : 'bg-red-50 dark:bg-red-500/8 hover:bg-red-100 dark:hover:bg-red-500/15 border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-400') : isSel ? 'bg-accent-soft hover:bg-accent-hover border-line' : index % 2 === 0 ? 'bg-surface hover:bg-surface-hover border-line' : 'bg-surface-muted hover:bg-surface-hover border-line'}`}>
                      <td className="p-2 border-r border-line text-center text-ink-faint font-mono">{index + 1}</td>
                      <td className="p-2 border-r border-line text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleBlacklistToggle(patient); }}
                          className={`px-1 py-0.5 rounded text-[9px] cursor-pointer ${patient.blacklisted ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-surface-active text-ink-secondary hover:bg-red-100 dark:hover:bg-red-500/15'}`}
                          title={patient.blacklisted ? 'Rétablir dans la liste normale' : 'Mettre en blacklist'}
                        >
                          {patient.blacklisted ? '✓' : 'BL'}
                        </button>
                      </td>
                      <td className="p-2 border-r border-line text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); openVitalsForPatient(patient); }}
                          className={`px-1 py-0.5 rounded text-[9px] ${patient.vitalSigns && (patient.vitalSigns.temperature || patient.vitalSigns.weight) ? 'bg-emerald-500 text-white' : 'bg-surface-active text-ink-secondary hover:bg-emerald-100 dark:hover:bg-emerald-500/15'}`}
                          title="Paramètres (modifiable 24h)"

                        >
                          P
                        </button>
                      </td>
                      <td className="p-2 border-r border-line"><span className="font-mono font-bold text-blue-700 dark:text-cyan-400">{patient.dossier}</span></td>
                      <td className="p-2 border-r border-line font-mono text-ink-secondary">{patient.matricule || '—'}</td>
                      <td className="p-2 border-r border-line uppercase font-medium"><div className="flex items-center gap-2"><span>{patient.lastName} {patient.firstName}</span>{patient.blacklisted && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">BLACKLISTE</span>}{hv && <span title="Paramètres saisis"><Activity className="w-3 h-3 text-green-600 dark:text-green-400" /></span>}</div></td>
                      <td className="p-2 border-r border-line text-ink-secondary">{patient.dateOfBirth === 'N/A' ? '—' : new Date(patient.dateOfBirth).toLocaleDateString('fr-FR')}</td>
                      <td className="p-2 border-r border-line font-medium">{patient.age === 'N/A' ? '—' : patient.age}</td>
                      <td className="p-2 border-r border-line text-center"><span className={`inline-block w-6 h-6 rounded-full font-bold text-xs leading-6 ${patient.gender === 'F' ? 'bg-pink-100 dark:bg-pink-500/15 text-pink-700 dark:text-pink-400' : 'bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400'}`}>{patient.gender}</span></td>
                      <td className="p-2 border-r border-line font-mono text-ink-secondary">{patient.contact || '—'}</td>
                      <td className="p-2 border-r border-line uppercase truncate text-ink-secondary">{patient.address || '—'}</td>
                      <td className="p-2 border-r border-line text-ink-secondary font-mono">{formatLastVisit(resolveLastVisit(patient))}</td>
                      <td className="p-2 uppercase truncate text-ink-secondary">{patient.company || patient.insureName || '—'}</td>
                    </motion.tr>
                  );
                })}
                </AnimatePresence>
                {filteredPatients.length === 0 && <tr><td colSpan={13} className="p-12 text-center text-ink-faint"><Users className="w-12 h-12 mx-auto mb-2 opacity-30" /><p className="font-medium">Aucun patient trouvé</p></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer className="border-t border-line bg-surface px-4 sm:px-6 pt-2.5 pb-20 sm:pb-2.5 sm:pr-48 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <div className="flex items-center gap-3 flex-wrap">
          <span>Affichage : <strong className="text-ink">{filteredPatients.length}</strong> sur <strong className="text-ink">{state.patients.length}</strong> dossiers</span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> En attente : <strong className="text-amber-700 dark:text-amber-400 tabular-nums">{waitingCount}</strong></span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Aujourd'hui : <strong className="text-blue-700 dark:text-cyan-400 tabular-nums">{todayCount}</strong></span>
        </div>
        <div className="font-semibold">MediCare HIS — Module Réception</div>
      </footer>

      {/* SAISIE PATIENT — fenêtre modale centrée */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-surface rounded border-2 border-line-control shadow-2xl">
            <div className="theme-header px-4 py-3 flex justify-between items-center"><span className="text-ink-strong text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" />{modal === 'add' ? 'NOUVEAU PATIENT' : 'MODIFIER PATIENT'}</span><button onClick={() => setModal('none')} className="text-ink-muted hover:text-accent hover:bg-surface-hover rounded p-0.5 px-2 transition cursor-pointer text-sm">✕</button></div>
            <div className="p-4">
              {patientSubmitted && Object.keys(patientErrors).length > 0 && (
                <div className="mb-4 p-2.5 bg-rose-50 dark:bg-rose-500/8 border border-rose-300 dark:border-rose-500/40 rounded text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>Veuillez corriger les erreurs de saisie ci-dessous.</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs items-start">
                {/* Sexe — pleine largeur */}
                <div className="col-span-2 flex items-center gap-3">
                  <label className="font-bold text-ink h-4 leading-4 shrink-0">Sexe</label>
                  <div className="flex h-9 border border-line-control rounded overflow-hidden">
                    <button type="button" onClick={() => setPatientForm({ ...patientForm, gender: 'M' })} className={`px-5 font-bold transition cursor-pointer ${patientForm.gender === 'M' ? 'bg-blue-500 text-white' : 'bg-surface text-ink hover:bg-surface-hover'}`}>M</button>
                    <button type="button" onClick={() => setPatientForm({ ...patientForm, gender: 'F' })} className={`px-5 font-bold border-l border-line-control transition cursor-pointer ${patientForm.gender === 'F' ? 'bg-pink-500 text-white' : 'bg-surface text-ink hover:bg-surface-hover'}`}>F</button>
                  </div>
                </div>

                {/* Ligne : N° Dossier / Matricule */}
                <div className="flex flex-col">
                  <label className="block font-bold text-ink h-4 leading-4 mb-1">N° Dossier *</label>
                  <input
                    type="text"
                    value={patientForm.dossier}
                    onBlur={() => setPatientTouched((t) => ({ ...t, dossier: true }))}
                    onChange={(e) => setPatientForm({ ...patientForm, dossier: e.target.value.toUpperCase() })}
                    className={`w-full h-9 bg-surface border rounded px-2 uppercase font-mono font-bold tracking-wide focus:outline-none ${ (patientTouched.dossier || patientSubmitted) && patientErrors.dossier ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-500/4 focus:border-rose-600' : 'border-line-control focus:border-accent'}`}
                    placeholder="SAISIE MANUELLE — MAJUSCULES"
                    autoComplete="off"
                  />
                  {(patientTouched.dossier || patientSubmitted) && patientErrors.dossier && (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 block">{patientErrors.dossier}</span>
                  )}
                  <span className="text-[10px] text-ink-muted mt-0.5 block">Clé unique, saisie manuelle, uniquement en majuscules.</span>
                </div>
                <div className="flex flex-col">
                  <label className="block font-bold text-ink h-4 leading-4 mb-1">Matricule</label>
                  <input type="text" value={patientForm.matricule} onChange={(e) => setPatientForm({ ...patientForm, matricule: e.target.value })} className="w-full h-9 bg-surface border border-line-control rounded px-2 font-mono focus:outline-none focus:border-accent" />
                  <span className="text-[10px] text-ink-muted mt-0.5 block">Facultatif.</span>
                </div>

                {/* Ligne : Nom / Prénom */}
                <div className="flex flex-col">
                  <label className="block font-bold text-ink h-4 leading-4 mb-1">Nom *</label>
                  <input
                    type="text"
                    value={patientForm.lastName}
                    onBlur={() => setPatientTouched((t) => ({ ...t, lastName: true }))}
                    onChange={(e) => setPatientForm({ ...patientForm, lastName: e.target.value })}
                    className={`w-full h-9 bg-surface border rounded px-2 uppercase font-medium focus:outline-none ${ (patientTouched.lastName || patientSubmitted) && patientErrors.lastName ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-500/4 focus:border-rose-600' : 'border-line-control focus:border-accent'}`}
                  />
                  {(patientTouched.lastName || patientSubmitted) && patientErrors.lastName && (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 block">{patientErrors.lastName}</span>
                  )}
                </div>
                <div className="flex flex-col">
                  <label className="block font-bold text-ink h-4 leading-4 mb-1">Prénom</label>
                  <input
                    type="text"
                    value={patientForm.firstName}
                    onBlur={() => setPatientTouched((t) => ({ ...t, firstName: true }))}
                    onChange={(e) => setPatientForm({ ...patientForm, firstName: e.target.value })}
                    className={`w-full h-9 bg-surface border rounded px-2 uppercase font-medium focus:outline-none ${ (patientTouched.firstName || patientSubmitted) && patientErrors.firstName ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-500/4 focus:border-rose-600' : 'border-line-control focus:border-accent'}`}
                  />
                  {(patientTouched.firstName || patientSubmitted) && patientErrors.firstName && (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 block">{patientErrors.firstName}</span>
                  )}
                </div>

                {/* Ligne : Date de naissance + Age / Téléphone */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col">
                    <label className="block font-bold text-ink h-4 leading-4 mb-1">Date Naiss. *</label>
                    <input
                      type="date"
                      value={patientForm.dateOfBirth}
                      onBlur={() => setPatientTouched((t) => ({ ...t, dateOfBirth: true }))}
                      onChange={(e) => setPatientForm({ ...patientForm, dateOfBirth: e.target.value })}
                      className={`w-full h-9 bg-surface border rounded px-2 focus:outline-none ${ (patientTouched.dateOfBirth || patientSubmitted) && patientErrors.dateOfBirth ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-500/4' : 'border-line-control focus:border-accent'}`}
                    />
                    {(patientTouched.dateOfBirth || patientSubmitted) && patientErrors.dateOfBirth && (
                      <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 block">{patientErrors.dateOfBirth}</span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <label className="block font-bold text-ink h-4 leading-4 mb-1">Age</label>
                    <input type="text" readOnly value={patientForm.dateOfBirth ? calculateAge(patientForm.dateOfBirth) : '—'} className="w-full h-9 bg-surface-active border border-line-control rounded px-2" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="block font-bold text-ink h-4 leading-4 mb-1">Téléphone</label>
                  <PhoneInput
                    value={patientForm.contact}
                    onBlur={() => setPatientTouched((t) => ({ ...t, contact: true }))}
                    onChange={(v) => setPatientForm({ ...patientForm, contact: v })}
                    className={`w-full h-9 bg-surface border rounded px-2 font-mono focus:outline-none ${ (patientTouched.contact || patientSubmitted) && patientErrors.contact ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-500/4' : 'border-line-control focus:border-accent'}`}
                    placeholder="Ex: 038 34 092 61"
                  />
                  {(patientTouched.contact || patientSubmitted) && patientErrors.contact && (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 block">{patientErrors.contact}</span>
                  )}
                </div>

                {/* Ligne : Adresse / Société (libre) */}
                <div className="flex flex-col">
                  <label className="block font-bold text-ink h-4 leading-4 mb-1">Adresse *</label>
                  <input
                    type="text"
                    value={patientForm.address}
                    onBlur={() => setPatientTouched((t) => ({ ...t, address: true }))}
                    onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                    className={`w-full h-9 bg-surface border rounded px-2 uppercase focus:outline-none ${ (patientTouched.address || patientSubmitted) && patientErrors.address ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-500/4 focus:border-rose-600' : 'border-line-control focus:border-accent'}`}
                  />
                  {(patientTouched.address || patientSubmitted) && patientErrors.address && (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 block">{patientErrors.address}</span>
                  )}
                </div>
                <div className="flex flex-col">
                  <label className="block font-bold text-ink h-4 leading-4 mb-1">Société (libre)</label>
                  <input
                    type="text"
                    value={patientForm.company}
                    disabled
                    title="La société se choisit dans la liste ci-dessous (Type Client → Société)."
                    placeholder="Sélection dans la liste"
                    className="w-full h-9 bg-surface-active text-ink-faint border border-line-strong rounded px-2 uppercase cursor-not-allowed"
                  />
                </div>

                {/* Ligne : Type Client / Société */}
                <div className="flex flex-col">
                  <label className="block font-bold text-ink h-4 leading-4 mb-1">Type Client</label>
                  <select value={patientForm.clientType} onChange={(e) => setPatientForm({ ...patientForm, clientType: e.target.value as ClientType })} className="w-full h-9 bg-surface border border-line-control rounded px-2 focus:outline-none focus:border-accent cursor-pointer">
                    <option value="comptoir">Client Comptoir</option>
                    <option value="societe">Client Société</option>
                  </select>
                </div>
                {patientForm.clientType === 'societe' && (
                  <div className="flex flex-col">
                    <label className="block font-bold text-ink h-4 leading-4 mb-1">Société *</label>
                    <select
                      value={patientForm.company}
                      onBlur={() => setPatientTouched((t) => ({ ...t, company: true }))}
                      onChange={(e) => setPatientForm({ ...patientForm, company: e.target.value })}
                      className={`w-full h-9 bg-surface border rounded px-2 focus:outline-none cursor-pointer ${ (patientTouched.company || patientSubmitted) && patientErrors.company ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-500/4' : 'border-line-control focus:border-accent'}`}
                    >
                      <option value="">— Sélectionner une société —</option>
                      {selectableCompanies(state.companies, patientForm.company).map((c) => (<option key={c.id} value={c.name}>{companyIsBlocked(c) ? `🚫 ${c.name} — bloquée` : c.name}</option>))}
                    </select>
                    {(patientTouched.company || patientSubmitted) && patientErrors.company && (
                      <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-0.5 block">{patientErrors.company}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t border-line-strong">
                <button onClick={modal === 'add' ? handleAddPatient : handleEditPatient} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow transition cursor-pointer"><Check className="w-4 h-4" /> VALIDER</button>
                <button onClick={() => setModal('none')} className="flex items-center gap-2 px-6 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded font-bold shadow transition cursor-pointer"><Ban className="w-4 h-4" /> ANNULER</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALES : BLACKLIST ET INFORMATIONS */}
      {modal === 'blacklistConfirm' && selectedPatient && (
        <ModalShell title="Bloquer ce patient" icon={<UserX className="w-5 h-5" />} onClose={() => setModal('none')}>
          <div className="py-3 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"><FileWarning className="h-7 w-7" /></div><p className="text-lg font-bold text-ink-strong">{selectedPatient.lastName} {selectedPatient.firstName}</p><p className="mt-2 text-sm text-ink-muted">Voulez-vous bloquer ce patient ?</p></div>
          <div className="flex justify-center gap-3"><button onClick={confirmBlacklist} className="rounded-lg bg-red-600 px-6 py-2 font-bold text-white hover:bg-red-700">Oui, ajouter</button><button onClick={() => setModal('none')} className="rounded-lg bg-surface-hover px-6 py-2 font-bold text-ink hover:bg-surface-active">Non</button></div>
        </ModalShell>
      )}
      {modal === 'blacklistReason' && selectedPatient && (
        <ModalShell title="Motif du blocage" icon={<UserX className="w-5 h-5" />} onClose={() => setModal('none')}>
          <p className="mb-3 text-sm text-ink-secondary">Indiquez le motif du blocage pour <strong>{selectedPatient.lastName} {selectedPatient.firstName}</strong>.</p>
          <textarea
            autoFocus
            value={blacklistReason}
            onChange={(e) => setBlacklistReason(e.target.value)}
            placeholder="Ex. Impayés répétés, comportement inapproprié..."
            className={`min-h-28 w-full rounded-lg border p-3 text-sm outline-none ${getBlacklistError(blacklistReason) && blacklistReason !== '' ? 'border-rose-400 bg-rose-50/30 dark:bg-rose-500/2 ring-2 ring-rose-100 dark:ring-rose-500/25' : 'border-line-strong focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-500/25'}`}
          />
          {getBlacklistError(blacklistReason) && (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">{getBlacklistError(blacklistReason)}</p>
          )}
          <div className="mt-4 flex justify-end gap-3"><button onClick={() => setModal('none')} className="rounded-lg px-4 py-2 font-semibold text-ink-secondary hover:bg-surface-hover">Annuler</button><button onClick={saveBlacklist} disabled={!!getBlacklistError(blacklistReason)} className="rounded-lg bg-red-600 px-5 py-2 font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40">Confirmer</button></div>
        </ModalShell>
      )}
      {modal === 'blacklistList' && (
        <ModalShell title={`Patients bloqués (${blacklistedPatients.length})`} icon={<UserX className="w-5 h-5" />} onClose={() => setModal('none')} wide>
          <p className="mb-4 text-sm text-ink-muted">
            Consultez le motif de chaque blocage ou rétablissez un patient dans la liste normale.
          </p>
          <div className="max-h-[55vh] overflow-auto rounded-lg border border-red-100 dark:border-red-500/25">
            {blacklistedPatients.length > 0 ? (
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-red-50 dark:bg-red-500/8 text-red-800 dark:text-red-300 shadow-sm">
                  <tr>
                    <th className="p-3">Patient</th>
                    <th className="p-3">Dossier</th>
                    <th className="p-3">Motif</th>
                    <th className="p-3">Date</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {blacklistedPatients.map((patient) => (
                    <tr key={patient.id} className="border-t border-red-100 dark:border-red-500/25 text-ink hover:bg-red-50/40 dark:hover:bg-red-500/3">
                      <td className="p-3 font-bold uppercase">{patient.lastName} {patient.firstName}</td>
                      <td className="p-3 font-mono text-blue-700 dark:text-cyan-400">{patient.dossier}</td>
                      <td className="max-w-sm whitespace-normal p-3">{patient.blacklistReason || 'Motif non renseigné'}</td>
                      <td className="p-3 whitespace-nowrap">{patient.blacklistDate ? new Date(patient.blacklistDate).toLocaleDateString('fr-FR') : '—'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => requestRestorePatient(patient)}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 cursor-pointer"
                          title="Rétablir dans la liste normale"
                        >
                          <Check className="h-4 w-4" /> Rétablir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-10 text-center text-ink-muted">
                <Users className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="font-medium">Aucune personne en blacklist.</p>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {modal === 'unblacklistConfirm' && patientToRestore && (
        <ModalShell title="Rétablir le patient" icon={<Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />} onClose={() => setModal('none')}>
          <div className="space-y-4 text-sm">
            <p className="text-ink">
              Voulez-vous rétablir le patient <strong className="uppercase">{patientToRestore.lastName} {patientToRestore.firstName}</strong> (Dossier : <span className="font-mono text-blue-700 dark:text-cyan-400">{patientToRestore.dossier}</span>) dans la liste normale ?
            </p>
            {patientToRestore.blacklistReason && (
              <div className="p-2.5 bg-amber-50 dark:bg-amber-500/8 border border-amber-200 dark:border-amber-500/25 rounded text-xs text-amber-800 dark:text-amber-300">
                <strong>Motif du blocage actuel :</strong> {patientToRestore.blacklistReason}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-3 border-t border-line">
              <button
                onClick={() => setModal(blacklistedPatients.length > 0 ? 'blacklistList' : 'none')}
                className="px-4 py-2 rounded-lg text-ink-secondary font-semibold hover:bg-surface-hover transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={confirmRestorePatient}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer shadow flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Confirmer le rétablissement
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {modal === 'deleteConfirm' && selectedPatient && (
        <ModalShell title="Supprimer le patient" icon={<Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />} onClose={() => setModal('none')}>
          <div className="space-y-4 text-sm">
            <p className="text-ink">
              Êtes-vous sûr de vouloir supprimer définitivement le dossier <strong className="font-mono text-blue-700 dark:text-cyan-400">{selectedPatient.dossier}</strong> (<span className="uppercase">{selectedPatient.lastName} {selectedPatient.firstName}</span>) ?
            </p>
            <div className="p-2.5 bg-rose-50 dark:bg-rose-500/8 border border-rose-200 dark:border-rose-500/25 rounded text-xs text-rose-800 dark:text-rose-300 font-medium">
              ⚠️ Attention : cette action supprimera la fiche patient de la liste principale.
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-line">
              <button
                onClick={() => setModal('none')}
                className="px-4 py-2 rounded-lg text-ink-secondary font-semibold hover:bg-surface-hover transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={confirmDeletePatient}
                className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition cursor-pointer shadow flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer définitivement
              </button>
            </div>
          </div>
        </ModalShell>
      )}
      {modal === 'patientInfo' && selectedPatient && (
        <ModalShell title="Informations du patient" icon={<Info className="w-5 h-5" />} onClose={() => setModal('none')}>
          <div className="rounded-xl bg-gradient-to-br from-blue-50 dark:from-cyan-950/60 to-surface-muted p-5"><div className="mb-5 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white">{selectedPatient.firstName[0]}{selectedPatient.lastName[0]}</div><h3 className="mt-2 text-xl font-bold text-ink-strong">{selectedPatient.lastName} {selectedPatient.firstName}</h3><p className="font-mono text-sm text-blue-700 dark:text-cyan-400">{selectedPatient.dossier}</p></div><div className="grid grid-cols-2 gap-3 text-sm"><InfoLine label="Date de naissance" value={selectedPatient.dateOfBirth === 'N/A' ? '—' : new Date(selectedPatient.dateOfBirth).toLocaleDateString('fr-FR')} /><InfoLine label="Âge" value={selectedPatient.age} /><InfoLine label="Téléphone" value={selectedPatient.contact || '—'} /><InfoLine label="Adresse" value={selectedPatient.address || '—'} /><InfoLine label="Société" value={selectedPatient.company || selectedPatient.insureName || '—'} /><InfoLine label="Type client" value={selectedPatient.clientType} /></div>{selectedPatient.blacklisted && <div className="mt-4 rounded-lg border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/8 p-3 text-sm text-red-800 dark:text-red-300"><b>⚠ Personne blacklistée</b><br />Motif : {selectedPatient.blacklistReason || 'Non renseigné'}</div>}</div>
        </ModalShell>
      )}

      {/* SAISIE PARAMÈTRES — fenêtre modale centrée */}
      {modal === 'vitals' && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto bg-surface rounded border-2 border-line-control shadow-2xl">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-1.5 flex justify-between items-center">
              <span className="text-white text-sm font-bold flex items-center gap-2"><Activity className="w-4 h-4" />SAISIE PARAMÈTRES</span>
              <button onClick={() => setModal('none')} className="text-ink-muted hover:text-accent hover:bg-surface-hover rounded p-0.5 px-2 transition cursor-pointer text-sm">✕</button>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-500/8 border-b border-emerald-200 dark:border-emerald-500/25 px-4 py-2 text-center">
              <div className="text-lg font-bold text-emerald-800 dark:text-emerald-300 uppercase">{selectedPatient.lastName} {selectedPatient.firstName}</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400">Dossier: {selectedPatient.dossier} | {selectedPatient.gender === 'M' ? 'Homme' : 'Femme'} | {selectedPatient.age}</div>
            </div>
            <div className="p-4">
              {vitalsReadOnly && <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/8 p-2 text-xs text-amber-800 dark:text-amber-300">Lecture seule : le délai de modification de 24 heures est dépassé.</div>}
              {vitalsSubmitted && Object.keys(vitalsErrors).length > 0 && (
                <div className="mb-3 p-2 bg-rose-50 dark:bg-rose-500/8 border border-rose-300 dark:border-rose-500/40 rounded text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>Certaines constantes comparent des valeurs hors limites ou incohérentes.</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs mb-4">
                {[ 
                  { label: '🌡️ Température (°C)', key: 'temperature' as const, step: '0.1' },
                  { label: '💨 SpO2 (%)', key: 'oxygenSaturation' as const, step: '1' },
                  { label: '💓 Tension Sys', key: 'bloodPressureSystolic' as const, step: '1' },
                  { label: '💓 Tension Dia', key: 'bloodPressureDiastolic' as const, step: '1' },
                  { label: '📏 Taille (cm)', key: 'height' as const, step: '1' },
                  { label: '⚖️ Poids (kg)', key: 'weight' as const, step: '0.1' },
                  { label: '❤️ Fréq. Cardiaque', key: 'heartRate' as const, step: '1' },
                  { label: '🧪 TDR', key: 'tdr' as const, step: '' },
                ].map((f) => {
                  const hasErr = (vitalsTouched[f.key] || vitalsSubmitted) && vitalsErrors[f.key];
                  return (
                    <div key={f.key} className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-ink">{f.label}</label>
                        {f.key === 'tdr' ? (
                          <select value={vitalsForm.tdr || ''} disabled={vitalsReadOnly} onChange={(e) => setVitalsForm({ ...vitalsForm, tdr: e.target.value })} className="w-24 bg-surface border border-line-control rounded px-2 py-1.5 text-center focus:outline-none focus:border-emerald-500 cursor-pointer"><option value="">—</option><option value="Positif">Positif</option><option value="Négatif">Négatif</option></select>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step={f.step}
                              inputMode={f.step === '0.1' ? 'decimal' : 'numeric'}
                              disabled={vitalsReadOnly}
                              value={(vitalsForm as any)[f.key]}
                              onBlur={() => setVitalsTouched((t) => ({ ...t, [f.key]: true }))}
                              onChange={(e) => setVitalsForm({ ...vitalsForm, [f.key]: e.target.value })}
                              className={`w-20 bg-surface border rounded px-2 py-1.5 text-center font-mono focus:outline-none ${hasErr ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-500/4' : 'border-line-control focus:border-emerald-500'}`}
                            />
                          </div>
                        )}
                      </div>
                      {hasErr && (
                        <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold text-right">{vitalsErrors[f.key]}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t-2 border-dashed border-emerald-300 dark:border-emerald-500/40 my-4" />

              <div className="bg-amber-50 dark:bg-amber-500/8 border border-amber-200 dark:border-amber-500/25 rounded-lg p-3 mb-4">
                <h4 className="font-bold text-amber-800 dark:text-amber-300 text-xs mb-3">🏢 TYPE CLIENT</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><label className="block font-bold text-ink mb-1">Type</label>
                    <select value={vitalsClientType} onChange={(e) => setVitalsClientType(e.target.value as ClientType)} className="w-full bg-surface border border-amber-400 rounded px-2 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer">
                      <option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option>
                    </select>
                  </div>
                  {vitalsClientType === 'societe' && <div><label className="block font-bold text-ink mb-1">Société *</label>
                    <select
                      value={vitalsCompany}
                      onBlur={() => setVitalsTouched((t) => ({ ...t, vitalsCompany: true }))}
                      onChange={(e) => setVitalsCompany(e.target.value)}
                      className={`w-full bg-surface border rounded px-2 py-1.5 focus:outline-none cursor-pointer ${ (vitalsTouched.vitalsCompany || vitalsSubmitted) && vitalsErrors.vitalsCompany ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-500/4' : 'border-amber-400 focus:border-amber-500'}`}
                    >
                      <option value="">— Sélectionner —</option>
                      {selectableCompanies(state.companies, vitalsCompany).map((c) => (<option key={c.id} value={c.name}>{companyIsBlocked(c) ? `🚫 ${c.name} — bloquée` : c.name}</option>))}
                    </select>
                    {(vitalsTouched.vitalsCompany || vitalsSubmitted) && vitalsErrors.vitalsCompany && (
                      <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-0.5 block">{vitalsErrors.vitalsCompany}</span>
                    )}
                  </div>}
                </div>
                {vitalsClientType === 'societe' && <div className="mt-3"><label className="block font-bold text-ink text-xs mb-1">Sous-société (libre)</label><input type="text" value={vitalsSubCompany} onChange={(e) => setVitalsSubCompany(e.target.value)} className="w-full bg-surface border border-amber-400 rounded px-2 py-1.5 uppercase focus:outline-none focus:border-amber-500" /></div>}
                <p className="text-[10px] text-ink-muted mt-2 italic">Remise saisie par le médecin</p>
              </div>

              <div className="flex items-center justify-center gap-3 mt-5">
                <button onClick={handleSaveVitalsAndSend} disabled={vitalsReadOnly} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow-lg transition cursor-pointer"><Stethoscope className="w-4 h-4" /> VALIDER & ENVOYER AU MÉDECIN</button>
                <button onClick={() => setModal('none')} className="flex items-center gap-2 px-6 py-2.5 bg-slate-500 hover:bg-slate-600 text-white rounded font-bold shadow transition cursor-pointer"><Ban className="w-4 h-4" /> ANNULER</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalShell({ title, icon, onClose, children, wide = false }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-2xl border border-line-strong bg-surface shadow-2xl`}>
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4 text-white">
          <div className="flex items-center gap-2 font-bold">{icon}{title}</div>
          <button onClick={onClose} className="rounded p-1 px-2 hover:bg-white/15 text-sm">✕ Fermer</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
function InfoLine({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-line bg-surface p-3"><p className="text-xs font-medium text-ink-faint">{label}</p><p className="mt-1 font-semibold text-ink">{value}</p></div>; }
