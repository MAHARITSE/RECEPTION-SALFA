import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Patient, VitalSigns, ClientType } from '../types';
import type { AppState } from '../store';
import { generateDossierNumber, calculateAge, addAuditLog, addNotification, addJourneyEvent } from '../store';
import { printQueueTicket } from '../utils/printTicket';
import {
  Search, Plus, Edit, Trash2, UserX, Activity,
  Check, Ban, Users, LogIn, Hospital,
  Stethoscope, MessageCircle, Info, FileWarning
} from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onStaffLogin: () => void; onOpenMessaging: () => void; }
type ModalType = 'none' | 'add' | 'edit' | 'vitals' | 'blacklistConfirm' | 'blacklistReason' | 'blacklistList' | 'patientInfo';

export default function ReceptionModule({ state, setState, onStaffLogin, onOpenMessaging }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [modal, setModal] = useState<ModalType>('none');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [blacklistReason, setBlacklistReason] = useState('');


  const [patientForm, setPatientForm] = useState({
    lastName: '', firstName: '', dateOfBirth: '', gender: 'F' as 'M' | 'F',
    address: '', contact: '', ssn: '', matricule: '', insureName: '',
    clientType: 'comptoir' as ClientType, company: '', subCompany: '',
  });

  const [vitalsForm, setVitalsForm] = useState<VitalSigns>({
    temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '',
    heartRate: '', oxygenSaturation: '', weight: '', height: '', tdr: '',
  });
  const [vitalsClientType, setVitalsClientType] = useState<ClientType>('comptoir');
  const [vitalsCompany, setVitalsCompany] = useState('');
  const [vitalsSubCompany, setVitalsSubCompany] = useState('');
  const [vitalsReadOnly, setVitalsReadOnly] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const filteredPatients = state.patients.filter((p) => {
    const q = searchQuery.toLowerCase();
    const ms = p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) ||
      p.dossier.toLowerCase().includes(q) || (p.matricule && p.matricule.toLowerCase().includes(q));
    return ms;
  });

  const waitingCount = state.patients.filter((p) => p.status === 'waiting_consultation').length;
  const todayCount = state.patients.filter((p) => new Date(p.registeredAt).toDateString() === new Date().toDateString()).length;
  const blacklistedPatients = state.patients.filter((p) => p.blacklisted);

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
    setModal('vitals');
  };

  const handleSaveVitalsAndSend = () => {
    if (!selectedPatient) return;
    if (selectedPatient.vitalSigns && !canEditVitals(selectedPatient)) { alert('Les paramètres sont verrouillés : modification autorisée pendant 24 heures seulement.'); return; }
    setState((prev) => {
      const next = {
        ...prev,
        patients: prev.patients.map((p) =>
          p.id === selectedPatient.id ? {
            ...p,
            vitalSigns: { ...vitalsForm },
            status: 'waiting_consultation' as const,
            lastVisitAt: new Date().toISOString(),
            clientType: vitalsClientType,
            company: vitalsClientType === 'societe' ? vitalsCompany : undefined,
            subCompany: vitalsClientType === 'societe' ? vitalsSubCompany : undefined,
          } : p
        ),
      };
      addAuditLog(next, 'PARAMETRES_ET_ENVOI', `${selectedPatient.dossier} → Envoyé médecin`, selectedPatient.id);
      addJourneyEvent(next, { patientId: selectedPatient.id, department: 'reception', action: 'Adressé au médecin', status: 'waiting_consultation', details: 'Paramètres vitaux saisis', actorName: 'Réception' });
      addNotification(next, 'doctor', `📋 Nouveau patient: ${selectedPatient.lastName} ${selectedPatient.firstName}`, 'info');
      return next;
    });
    // Imprime un ticket de file d'attente (numéro auto = nombre de patients en attente + 1)
    const queueNumber = state.patients.filter((p) => p.status === 'waiting_consultation').length + 1;
    printQueueTicket(state.ticketSettings, { ...selectedPatient, status: 'waiting_consultation' }, queueNumber);
    setModal('none');
  };

  const handleAddPatient = () => {
    if (!patientForm.lastName || !patientForm.firstName) { alert('Nom et prénom obligatoires'); return; }
    const np: Patient = {
      id: uuidv4(), dossier: generateDossierNumber(patientForm.lastName),
      matricule: patientForm.matricule || undefined,
      firstName: patientForm.firstName.toUpperCase(), lastName: patientForm.lastName.toUpperCase(),
      dateOfBirth: patientForm.dateOfBirth || 'N/A', age: patientForm.dateOfBirth ? calculateAge(patientForm.dateOfBirth) : 'N/A',
      gender: patientForm.gender, address: patientForm.address.toUpperCase(), contact: patientForm.contact, ssn: patientForm.ssn,
      clientType: patientForm.clientType, company: patientForm.company || undefined, subCompany: patientForm.subCompany || undefined,
      allergies: [], chronicTreatments: [], antecedents: [],
      registeredAt: new Date().toISOString(), registeredBy: 'RECEPTION', status: 'registered',
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
    setState((prev) => ({
      ...prev,
      patients: prev.patients.map((p) => p.id === selectedPatient.id ? {
        ...p, firstName: patientForm.firstName.toUpperCase(), lastName: patientForm.lastName.toUpperCase(),
        dateOfBirth: patientForm.dateOfBirth || 'N/A', age: patientForm.dateOfBirth ? calculateAge(patientForm.dateOfBirth) : 'N/A',
        gender: patientForm.gender, address: patientForm.address.toUpperCase(), contact: patientForm.contact, ssn: patientForm.ssn,
        matricule: patientForm.matricule || undefined,
        clientType: patientForm.clientType, company: patientForm.company || undefined, subCompany: patientForm.subCompany || undefined,
      } : p),
    }));
    setModal('none');
  };

  const handleDeletePatient = () => {
    if (!selectedPatient || !confirm(`Supprimer ${selectedPatient.dossier} ?`)) return;
    setState((prev) => {
      const next = { ...prev, patients: prev.patients.filter((p) => p.id !== selectedPatient.id) };
      addAuditLog(next, 'SUPPRESSION', `Dossier supprimé: ${selectedPatient.dossier}`, selectedPatient.id);
      return next;
    });
    setSelectedPatient(null);
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
    setSelectedPatient(null);
    setModal('none');
  };

  const restoreBlacklistedPatient = (patient: Patient) => {
    if (!confirm(`Rétablir ${patient.lastName} ${patient.firstName} dans la liste normale ?`)) return;

    setState((prev) => {
      const next = {
        ...prev,
        patients: prev.patients.map((p) => p.id === patient.id ? {
          ...p,
          blacklisted: false,
          blacklistReason: undefined,
          blacklistDate: undefined,
        } : p),
      };
      addAuditLog(next, 'UNBLACKLIST', `${patient.dossier} rétabli — remis dans la liste normale`, patient.id);
      return next;
    });

    // Évite de conserver un objet sélectionné avec l'ancien statut.
    setSelectedPatient((current) => current?.id === patient.id ? {
      ...current,
      blacklisted: false,
      blacklistReason: undefined,
      blacklistDate: undefined,
    } : current);
  };

  const handleBlacklistToggle = (patient: Patient) => {
    if (patient.blacklisted) {
      restoreBlacklistedPatient(patient);
    } else {
      setSelectedPatient(patient);
      setBlacklistReason('');
      setModal('blacklistReason');
    }
  };

  // Check if vitals editable within 24h
  const canEditVitals = (patient: Patient): boolean => {
    if (!patient.vitalSigns) return true;
    if (!patient.lastVisitAt) return false;
    const last = new Date(patient.lastVisitAt).getTime();
    const now = Date.now();
    return (now - last) < 24 * 60 * 60 * 1000; // 24h
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
    <div className="flex flex-col min-h-screen w-full bg-[#e8e8e8] text-slate-800 font-sans select-none">
      <header className="bg-gradient-to-b from-[#4a90d9] to-[#3a7bc8] text-white px-4 py-2 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center bg-white/20 backdrop-blur rounded-lg p-2"><Hospital className="w-7 h-7" /></div>
          <div><h1 className="text-2xl font-bold tracking-tight">MediCare HIS</h1><p className="text-blue-100 text-xs font-medium">Module Réception</p></div>
        </div>
        <div className="flex items-center gap-6">

          <div className="text-right bg-white/10 backdrop-blur rounded-lg px-4 py-1.5">
            <div className="text-xl font-mono font-bold">{currentTime.toLocaleTimeString('fr-FR')}</div>
            <div className="text-xs text-blue-100">{currentTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <button onClick={onOpenMessaging} className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 backdrop-blur rounded-lg transition font-medium cursor-pointer" title="Messagerie">




            <MessageCircle className="w-4 h-4" />
          </button>
          <button onClick={onStaffLogin} className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur rounded-lg transition font-medium cursor-pointer">
            <LogIn className="w-4 h-4" /> Personnel
          </button>
        </div>
      </header>

      <section className="bg-[#f5f5f5] border-b border-slate-300 px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2 h-4 w-4 text-slate-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-inner" placeholder="Rechercher: Nom, Dossier, Matricule..." />
            </div>

          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { setModal('add'); setPatientForm({ ...patientForm, lastName: '', firstName: '', dateOfBirth: '', gender: 'F', address: '', contact: '', ssn: '', matricule: '', insureName: '', clientType: 'comptoir', company: '', subCompany: '' }); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow transition cursor-pointer"><Plus className="h-4 w-4" /> Nouveau</button>
            <button onClick={() => { if (!selectedPatient) return; setPatientForm({ lastName: selectedPatient.lastName, firstName: selectedPatient.firstName, dateOfBirth: selectedPatient.dateOfBirth === 'N/A' ? '' : selectedPatient.dateOfBirth, gender: selectedPatient.gender, address: selectedPatient.address, contact: selectedPatient.contact, ssn: selectedPatient.ssn, matricule: selectedPatient.matricule || '', insureName: selectedPatient.company || selectedPatient.insureName || '', clientType: selectedPatient.clientType === 'externe' ? 'comptoir' : selectedPatient.clientType, company: selectedPatient.company || '', subCompany: selectedPatient.subCompany || '' }); setModal('edit'); }} disabled={!selectedPatient} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold shadow disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Edit className="h-4 w-4" /> Modifier</button>
            <button onClick={handleDeletePatient} disabled={!selectedPatient} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold shadow disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Trash2 className="h-4 w-4" /> Supprimer</button>
            <div className="w-px h-6 bg-slate-300 mx-1" />
            <button onClick={() => selectedPatient && setModal('patientInfo')} disabled={!selectedPatient} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold shadow disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Info className="h-4 w-4" /> Info</button>
            <button onClick={handleBlacklistClick} title="Afficher les patients bloqués" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded text-xs font-bold shadow cursor-pointer"><UserX className="h-4 w-4" /> Bloqués{blacklistedPatients.length > 0 && <span className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] leading-none">{blacklistedPatients.length}</span>}</button>
          </div>
        </div>
      </section>

      <main className="flex-1 p-3">
        <div className="bg-white border border-slate-400 rounded shadow-lg overflow-hidden h-full flex flex-col">
          <div className="bg-gradient-to-b from-slate-100 to-slate-200 border-b border-slate-400 px-3 py-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">📋 Patients — {filteredPatients.length} fiche(s)</span>
            <span className="text-[10px] text-amber-700 font-semibold bg-amber-100 px-2 py-0.5 rounded">💡 Double-clic → Saisie paramètres</span>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gradient-to-b from-[#4a6fa5] to-[#3d5a80] text-white sticky top-0 z-10">
                <tr><th className="p-2 border-r border-[#5a7fb5] w-10 text-center">#</th><th className="p-2 border-r border-[#5a7fb5] w-8 text-center">BL</th><th className="p-2 border-r border-[#5a7fb5] w-8 text-center">P</th><th className="p-2 border-r border-[#5a7fb5] w-20">Dossier</th><th className="p-2 border-r border-[#5a7fb5] w-20">Matricule</th><th className="p-2 border-r border-[#5a7fb5] min-w-[200px]">Nom et Prénom</th><th className="p-2 border-r border-[#5a7fb5] w-24">Date Nais.</th><th className="p-2 border-r border-[#5a7fb5] w-16">Age</th><th className="p-2 border-r border-[#5a7fb5] w-12 text-center">Sexe</th><th className="p-2 border-r border-[#5a7fb5] w-28">Téléphone</th><th className="p-2 border-r border-[#5a7fb5] min-w-[120px]">Adresse</th><th className="p-2 border-r border-[#5a7fb5] w-32">Dernière visite</th><th className="p-2 min-w-[120px]">Société</th></tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient, index) => {
                  const isSel = selectedPatient?.id === patient.id;
                  const hv = patient.vitalSigns && (patient.vitalSigns.temperature || patient.vitalSigns.weight);
                  return (
                    <tr key={patient.id} onClick={() => setSelectedPatient(patient)} onDoubleClick={() => handleRowDoubleClick(patient)}
                      className={`cursor-pointer border-b transition-colors ${patient.blacklisted ? (isSel ? 'bg-red-200 hover:bg-red-300 border-red-300 text-red-900' : 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700') : isSel ? 'bg-[#cce5ff] hover:bg-[#b8daff] border-slate-200' : index % 2 === 0 ? 'bg-white hover:bg-slate-100 border-slate-200' : 'bg-slate-50 hover:bg-slate-100 border-slate-200'}`}>
                      <td className="p-2 border-r border-slate-200 text-center text-slate-400 font-mono">{index + 1}</td>
                      <td className="p-2 border-r border-slate-200 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleBlacklistToggle(patient); }}
                          className={`px-1 py-0.5 rounded text-[9px] cursor-pointer ${patient.blacklisted ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-200 text-slate-600 hover:bg-red-100'}`}
                          title={patient.blacklisted ? 'Rétablir dans la liste normale' : 'Mettre en blacklist'}
                        >
                          {patient.blacklisted ? '✓' : 'BL'}
                        </button>
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); openVitalsForPatient(patient); }}
                          className={`px-1 py-0.5 rounded text-[9px] ${patient.vitalSigns && (patient.vitalSigns.temperature || patient.vitalSigns.weight) ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-emerald-100'}`}
                          title="Paramètres (modifiable 24h)"

                        >
                          P
                        </button>
                      </td>
                      <td className="p-2 border-r border-slate-200"><span className="font-mono font-bold text-blue-700">{patient.dossier}</span></td>
                      <td className="p-2 border-r border-slate-200 font-mono text-slate-600">{patient.matricule || '—'}</td>
                      <td className="p-2 border-r border-slate-200 uppercase font-medium"><div className="flex items-center gap-2"><span>{patient.lastName} {patient.firstName}</span>{patient.blacklisted && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">BLACKLISTE</span>}{hv && <span title="Paramètres saisis"><Activity className="w-3 h-3 text-green-600" /></span>}</div></td>
                      <td className="p-2 border-r border-slate-200 text-slate-600">{patient.dateOfBirth === 'N/A' ? '—' : new Date(patient.dateOfBirth).toLocaleDateString('fr-FR')}</td>
                      <td className="p-2 border-r border-slate-200 font-medium">{patient.age === 'N/A' ? '—' : patient.age}</td>
                      <td className="p-2 border-r border-slate-200 text-center"><span className={`inline-block w-6 h-6 rounded-full font-bold text-xs leading-6 ${patient.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>{patient.gender}</span></td>
                      <td className="p-2 border-r border-slate-200 font-mono text-slate-600">{patient.contact || '—'}</td>
                      <td className="p-2 border-r border-slate-200 uppercase truncate text-slate-600">{patient.address || '—'}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-600 font-mono">{formatLastVisit(resolveLastVisit(patient))}</td>
                      <td className="p-2 uppercase truncate text-slate-600">{patient.company || patient.insureName || '—'}</td>
                    </tr>
                  );
                })}
                {filteredPatients.length === 0 && <tr><td colSpan={13} className="p-12 text-center text-slate-400"><Users className="w-12 h-12 mx-auto mb-2 opacity-30" /><p className="font-medium">Aucun patient trouvé</p></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer className="bg-gradient-to-b from-slate-200 to-slate-300 border-t border-slate-400 px-4 py-1 flex justify-between items-center text-xs text-slate-600">
        <div className="flex items-center gap-4"><span>📊 Total: <strong>{filteredPatients.length}</strong></span><span>|</span><span>🩺 <strong className="text-amber-700">{waitingCount}</strong></span><span>|</span><span>📅 <strong className="text-blue-700">{todayCount}</strong></span></div>
        <div className="font-semibold">MediCare HIS v2.0 © 2026</div>
      </footer>

      {/* SAISIE PATIENT — fenêtre modale centrée */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-[#f0f0f0] rounded border-2 border-slate-500 shadow-2xl">
            <div className="bg-gradient-to-r from-[#4a6fa5] to-[#3d5a80] px-3 py-1.5 flex justify-between items-center"><span className="text-white text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" />{modal === 'add' ? 'NOUVEAU PATIENT' : 'MODIFIER PATIENT'}</span><button onClick={() => setModal('none')} className="text-white/80 hover:text-white hover:bg-white/20 rounded p-0.5 px-2 transition cursor-pointer text-sm">✕</button></div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-3">
                  <div className="flex items-center gap-3"><label className="font-bold text-slate-700 w-16">Sexe</label><div className="flex border border-slate-400 rounded overflow-hidden"><button type="button" onClick={() => setPatientForm({ ...patientForm, gender: 'M' })} className={`px-4 py-1.5 font-bold transition cursor-pointer ${patientForm.gender === 'M' ? 'bg-blue-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>M</button><button type="button" onClick={() => setPatientForm({ ...patientForm, gender: 'F' })} className={`px-4 py-1.5 font-bold border-l border-slate-400 transition cursor-pointer ${patientForm.gender === 'F' ? 'bg-pink-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>F</button></div></div>
                  <div><label className="block font-bold text-slate-700 mb-1">Nom *</label><input type="text" value={patientForm.lastName} onChange={(e) => setPatientForm({ ...patientForm, lastName: e.target.value })} className="w-full bg-white border border-slate-400 rounded px-2 py-1.5 uppercase font-medium focus:outline-none focus:border-blue-500" /></div>
                  <div><label className="block font-bold text-slate-700 mb-1">Prénom *</label><input type="text" value={patientForm.firstName} onChange={(e) => setPatientForm({ ...patientForm, firstName: e.target.value })} className="w-full bg-white border border-slate-400 rounded px-2 py-1.5 uppercase font-medium focus:outline-none focus:border-blue-500" /></div>
                  <div className="grid grid-cols-2 gap-2"><div><label className="block font-bold text-slate-700 mb-1">Date Naiss.</label><input type="date" value={patientForm.dateOfBirth} onChange={(e) => setPatientForm({ ...patientForm, dateOfBirth: e.target.value })} className="w-full bg-white border border-slate-400 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500" /></div><div><label className="block font-bold text-slate-700 mb-1">Age</label><input type="text" readOnly value={patientForm.dateOfBirth ? calculateAge(patientForm.dateOfBirth) : '—'} className="w-full bg-slate-200 border border-slate-400 rounded px-2 py-1.5" /></div></div>
                  <div><label className="block font-bold text-slate-700 mb-1">Téléphone</label><input type="text" value={patientForm.contact} onChange={(e) => setPatientForm({ ...patientForm, contact: e.target.value })} className="w-full bg-white border border-slate-400 rounded px-2 py-1.5 font-mono focus:outline-none focus:border-blue-500" /></div>
                </div>
                <div className="space-y-3">
                  <div><label className="block font-bold text-slate-700 mb-1">Matricule</label><input type="text" value={patientForm.matricule} onChange={(e) => setPatientForm({ ...patientForm, matricule: e.target.value })} className="w-full bg-white border border-slate-400 rounded px-2 py-1.5 font-mono focus:outline-none focus:border-blue-500" /></div>
                  <div><label className="block font-bold text-slate-700 mb-1">Société (libre)</label><input type="text" value={patientForm.company} onChange={(e) => setPatientForm({ ...patientForm, company: e.target.value })} className="w-full bg-white border border-slate-400 rounded px-2 py-1.5 uppercase focus:outline-none focus:border-blue-500" /></div>
                  <div><label className="block font-bold text-slate-700 mb-1">Adresse</label><input type="text" value={patientForm.address} onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })} className="w-full bg-white border border-slate-400 rounded px-2 py-1.5 uppercase focus:outline-none focus:border-blue-500" /></div>
                  <div><label className="block font-bold text-slate-700 mb-1">Type Client</label><select value={patientForm.clientType} onChange={(e) => setPatientForm({ ...patientForm, clientType: e.target.value as ClientType })} className="w-full bg-white border border-slate-400 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"><option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option></select></div>
                  {patientForm.clientType === 'societe' && <div><label className="block font-bold text-slate-700 mb-1">Société</label><select value={patientForm.company} onChange={(e) => setPatientForm({ ...patientForm, company: e.target.value })} className="w-full bg-white border border-slate-400 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"><option value="">—</option>{state.companies.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}</select></div>}
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t border-slate-300">
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
          <div className="py-3 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700"><FileWarning className="h-7 w-7" /></div><p className="text-lg font-bold text-slate-800">{selectedPatient.lastName} {selectedPatient.firstName}</p><p className="mt-2 text-sm text-slate-500">Voulez-vous bloquer ce patient ?</p></div>
          <div className="flex justify-center gap-3"><button onClick={confirmBlacklist} className="rounded-lg bg-red-600 px-6 py-2 font-bold text-white hover:bg-red-700">Oui, ajouter</button><button onClick={() => setModal('none')} className="rounded-lg bg-slate-100 px-6 py-2 font-bold text-slate-700 hover:bg-slate-200">Non</button></div>
        </ModalShell>
      )}
      {modal === 'blacklistReason' && selectedPatient && (
        <ModalShell title="Motif du blocage" icon={<UserX className="w-5 h-5" />} onClose={() => setModal('none')}>
          <p className="mb-3 text-sm text-slate-600">Indiquez le motif du blocage pour <strong>{selectedPatient.lastName} {selectedPatient.firstName}</strong>.</p><textarea autoFocus value={blacklistReason} onChange={(e) => setBlacklistReason(e.target.value)} placeholder="Ex. Impayés répétés…" className="min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
          <div className="mt-4 flex justify-end gap-3"><button onClick={() => setModal('none')} className="rounded-lg px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">Annuler</button><button onClick={saveBlacklist} disabled={!blacklistReason.trim()} className="rounded-lg bg-red-600 px-5 py-2 font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40">Confirmer</button></div>
        </ModalShell>
      )}
      {modal === 'blacklistList' && (
        <ModalShell title={`Patients bloqués (${blacklistedPatients.length})`} icon={<UserX className="w-5 h-5" />} onClose={() => setModal('none')} wide>
          <p className="mb-4 text-sm text-slate-500">
            Consultez le motif de chaque blocage ou rétablissez un patient dans la liste normale.
          </p>
          <div className="max-h-[55vh] overflow-auto rounded-lg border border-red-100">
            {blacklistedPatients.length > 0 ? (
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-red-50 text-red-800 shadow-sm">
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
                    <tr key={patient.id} className="border-t border-red-100 text-slate-700 hover:bg-red-50/40">
                      <td className="p-3 font-bold uppercase">{patient.lastName} {patient.firstName}</td>
                      <td className="p-3 font-mono text-blue-700">{patient.dossier}</td>
                      <td className="max-w-sm whitespace-normal p-3">{patient.blacklistReason || 'Motif non renseigné'}</td>
                      <td className="p-3 whitespace-nowrap">{patient.blacklistDate ? new Date(patient.blacklistDate).toLocaleDateString('fr-FR') : '—'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => restoreBlacklistedPatient(patient)}
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
              <div className="p-10 text-center text-slate-500">
                <Users className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                <p className="font-medium">Aucune personne en blacklist.</p>
              </div>
            )}
          </div>
        </ModalShell>
      )}
      {modal === 'patientInfo' && selectedPatient && (
        <ModalShell title="Informations du patient" icon={<Info className="w-5 h-5" />} onClose={() => setModal('none')}>
          <div className="rounded-xl bg-gradient-to-br from-blue-50 to-slate-50 p-5"><div className="mb-5 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white">{selectedPatient.firstName[0]}{selectedPatient.lastName[0]}</div><h3 className="mt-2 text-xl font-bold text-slate-800">{selectedPatient.lastName} {selectedPatient.firstName}</h3><p className="font-mono text-sm text-blue-700">{selectedPatient.dossier}</p></div><div className="grid grid-cols-2 gap-3 text-sm"><InfoLine label="Date de naissance" value={selectedPatient.dateOfBirth === 'N/A' ? '—' : new Date(selectedPatient.dateOfBirth).toLocaleDateString('fr-FR')} /><InfoLine label="Âge" value={selectedPatient.age} /><InfoLine label="Téléphone" value={selectedPatient.contact || '—'} /><InfoLine label="Adresse" value={selectedPatient.address || '—'} /><InfoLine label="Société" value={selectedPatient.company || selectedPatient.insureName || '—'} /><InfoLine label="Type client" value={selectedPatient.clientType} /></div>{selectedPatient.blacklisted && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>⚠ Personne blacklistée</b><br />Motif : {selectedPatient.blacklistReason || 'Non renseigné'}</div>}</div>
        </ModalShell>
      )}

      {/* SAISIE PARAMÈTRES — fenêtre modale centrée */}
      {modal === 'vitals' && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto bg-[#f0f0f0] rounded border-2 border-slate-500 shadow-2xl">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-1.5 flex justify-between items-center">
              <span className="text-white text-sm font-bold flex items-center gap-2"><Activity className="w-4 h-4" />SAISIE PARAMÈTRES</span>
              <button onClick={() => setModal('none')} className="text-white/80 hover:text-white hover:bg-white/20 rounded p-0.5 px-2 transition cursor-pointer text-sm">✕</button>
            </div>
            <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-center">
              <div className="text-lg font-bold text-emerald-800 uppercase">{selectedPatient.lastName} {selectedPatient.firstName}</div>
              <div className="text-xs text-emerald-600">Dossier: {selectedPatient.dossier} | {selectedPatient.gender === 'M' ? 'Homme' : 'Femme'} | {selectedPatient.age}</div>
            </div>
            <div className="p-4">
              {vitalsReadOnly && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">Lecture seule : le délai de modification de 24 heures est dépassé.</div>}
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
                ].map((f) => (
                  <div key={f.key} className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">{f.label}</label>
                    {f.key === 'tdr' ? (
                      <select value={vitalsForm.tdr || ''} disabled={vitalsReadOnly} onChange={(e) => setVitalsForm({ ...vitalsForm, tdr: e.target.value })} className="w-24 bg-white border border-slate-400 rounded px-2 py-1.5 text-center focus:outline-none focus:border-emerald-500 cursor-pointer"><option value="">—</option><option value="Positif">Positif</option><option value="Négatif">Négatif</option></select>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input type="number" step={f.step} inputMode={f.step === '0.1' ? 'decimal' : 'numeric'} disabled={vitalsReadOnly} value={(vitalsForm as any)[f.key]} onChange={(e) => setVitalsForm({ ...vitalsForm, [f.key]: e.target.value })} className="w-20 bg-white border border-slate-400 rounded px-2 py-1.5 text-center font-mono focus:outline-none focus:border-emerald-500" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-dashed border-emerald-300 my-4" />

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <h4 className="font-bold text-amber-800 text-xs mb-3">🏢 TYPE CLIENT</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><label className="block font-bold text-slate-700 mb-1">Type</label>
                    <select value={vitalsClientType} onChange={(e) => setVitalsClientType(e.target.value as ClientType)} className="w-full bg-white border border-amber-400 rounded px-2 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer">
                      <option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option>
                    </select>
                  </div>
                  {vitalsClientType === 'societe' && <div><label className="block font-bold text-slate-700 mb-1">Société</label>
                    <select value={vitalsCompany} onChange={(e) => setVitalsCompany(e.target.value)} className="w-full bg-white border border-amber-400 rounded px-2 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer">
                      <option value="">—</option>{state.companies.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}</select>
                  </div>}
                </div>
                {vitalsClientType === 'societe' && <div className="mt-3"><label className="block font-bold text-slate-700 text-xs mb-1">Sous-société (libre)</label><input type="text" value={vitalsSubCompany} onChange={(e) => setVitalsSubCompany(e.target.value)} className="w-full bg-white border border-amber-400 rounded px-2 py-1.5 uppercase focus:outline-none focus:border-amber-500" /></div>}
                <p className="text-[10px] text-slate-500 mt-2 italic">Remise saisie par le médecin</p>
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
      <div className={`${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-2xl`}>
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4 text-white">
          <div className="flex items-center gap-2 font-bold">{icon}{title}</div>
          <button onClick={onClose} className="rounded p-1 px-2 hover:bg-white/15 text-sm">✕ Fermer</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
function InfoLine({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs font-medium text-slate-400">{label}</p><p className="mt-1 font-semibold text-slate-700">{value}</p></div>; }
