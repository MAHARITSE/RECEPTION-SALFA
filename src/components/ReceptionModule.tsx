import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Patient, VitalSigns, ClientType } from '../types';
import type { AppState } from '../store';
import { generateDossierNumber, calculateAge, addAuditLog, addNotification, addJourneyEvent } from '../store';
import { printQueueTicket } from '../utils/printTicket';
import {
  Search, Plus, Edit, Trash2, UserX, Activity,
  X, Check, Ban, Users, LogIn, Hospital,
  RefreshCw, Stethoscope, MessageCircle
} from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onStaffLogin: () => void; onOpenMessaging: () => void; }
type ModalType = 'none' | 'add' | 'edit' | 'vitals';

export default function ReceptionModule({ state, setState, onStaffLogin, onOpenMessaging }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [modal, setModal] = useState<ModalType>('none');
  const [currentTime, setCurrentTime] = useState(new Date());


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

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const filteredPatients = state.patients.filter((p) => {
    if (p.blacklisted) return false;
    const q = searchQuery.toLowerCase();
    const ms = p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) ||
      p.dossier.toLowerCase().includes(q) || (p.matricule && p.matricule.toLowerCase().includes(q));
    return ms;
  });

  const waitingCount = state.patients.filter((p) => p.status === 'waiting_consultation').length;
  const todayCount = state.patients.filter((p) => new Date(p.registeredAt).toDateString() === new Date().toDateString()).length;

  const handleRowDoubleClick = (patient: Patient) => {
    setSelectedPatient(patient);
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
      insureName: patientForm.insureName?.toUpperCase() || undefined,
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
        matricule: patientForm.matricule || undefined, insureName: patientForm.insureName?.toUpperCase() || undefined,
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

  const handleBlacklist = () => {
    if (!selectedPatient || !confirm(`Blacklist ${selectedPatient.lastName} ?`)) return;
    setState((prev) => {
      const next = { ...prev, patients: prev.patients.map((p) => p.id === selectedPatient.id ? { ...p, blacklisted: true } : p) };
      addAuditLog(next, 'BLACKLIST', `${selectedPatient.dossier} blacklisté`, selectedPatient.id);
      return next;
    });
    setSelectedPatient(null);
  };

  const formatLastVisit = (dateStr?: string): string => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#e8e8e8] text-slate-800 font-sans select-none overflow-hidden">
      <header className="bg-gradient-to-b from-[#4a90d9] to-[#3a7bc8] text-white px-4 py-2 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center bg-white/20 backdrop-blur rounded-lg p-2"><Hospital className="w-7 h-7" /></div>
          <div><h1 className="text-2xl font-bold tracking-tight">MediCare HIS</h1><p className="text-blue-100 text-xs font-medium">Module Réception</p></div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex gap-3 text-sm">
            <div className="bg-white/10 backdrop-blur rounded-lg px-3 py-1.5 flex items-center gap-2"><Stethoscope className="w-4 h-4 text-amber-300" /><span className="text-blue-100">Attente:</span><span className="font-bold text-lg">{waitingCount}</span></div>
            <div className="bg-white/10 backdrop-blur rounded-lg px-3 py-1.5"><span className="text-blue-100">Auj:</span><span className="font-bold ml-1">{todayCount}</span></div>
          </div>
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
            <button onClick={() => { if (!selectedPatient) return; setPatientForm({ lastName: selectedPatient.lastName, firstName: selectedPatient.firstName, dateOfBirth: selectedPatient.dateOfBirth === 'N/A' ? '' : selectedPatient.dateOfBirth, gender: selectedPatient.gender, address: selectedPatient.address, contact: selectedPatient.contact, ssn: selectedPatient.ssn, matricule: selectedPatient.matricule || '', insureName: selectedPatient.insureName || '', clientType: selectedPatient.clientType === 'externe' ? 'comptoir' : selectedPatient.clientType, company: selectedPatient.company || '', subCompany: selectedPatient.subCompany || '' }); setModal('edit'); }} disabled={!selectedPatient} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold shadow disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Edit className="h-4 w-4" /> Modifier</button>
            <button onClick={handleDeletePatient} disabled={!selectedPatient} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold shadow disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Trash2 className="h-4 w-4" /> Supprimer</button>
            <div className="w-px h-6 bg-slate-300 mx-1" />
            <button onClick={handleBlacklist} disabled={!selectedPatient} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded text-xs font-bold shadow disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><UserX className="h-4 w-4" /> Blacklist</button>
            <div className="w-px h-6 bg-slate-300 mx-1" />
            <button className="p-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded shadow-sm transition cursor-pointer" title="Actualiser"><RefreshCw className="h-4 w-4 text-slate-600" /></button>
          </div>
        </div>
      </section>

      <main className="flex-1 overflow-hidden p-3">
        <div className="bg-white border border-slate-400 rounded shadow-lg overflow-hidden h-full flex flex-col">
          <div className="bg-gradient-to-b from-slate-100 to-slate-200 border-b border-slate-400 px-3 py-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">📋 Patients — {filteredPatients.length} fiche(s)</span>
            <span className="text-[10px] text-amber-700 font-semibold bg-amber-100 px-2 py-0.5 rounded">💡 Double-clic → Saisie paramètres</span>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gradient-to-b from-[#4a6fa5] to-[#3d5a80] text-white sticky top-0 z-10">
                <tr><th className="p-2 border-r border-[#5a7fb5] w-10 text-center">#</th><th className="p-2 border-r border-[#5a7fb5] w-20">Dossier</th><th className="p-2 border-r border-[#5a7fb5] w-20">Matricule</th><th className="p-2 border-r border-[#5a7fb5] min-w-[200px]">Nom et Prénom</th><th className="p-2 border-r border-[#5a7fb5] w-24">Date Nais.</th><th className="p-2 border-r border-[#5a7fb5] w-16">Age</th><th className="p-2 border-r border-[#5a7fb5] w-12 text-center">Sexe</th><th className="p-2 border-r border-[#5a7fb5] w-28">Téléphone</th><th className="p-2 border-r border-[#5a7fb5] min-w-[120px]">Adresse</th><th className="p-2 border-r border-[#5a7fb5] w-32">Dernière visite</th><th className="p-2 min-w-[120px]">Assuré</th></tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient, index) => {
                  const isSel = selectedPatient?.id === patient.id;
                  const hv = patient.vitalSigns && (patient.vitalSigns.temperature || patient.vitalSigns.weight);
                  return (
                    <tr key={patient.id} onClick={() => setSelectedPatient(patient)} onDoubleClick={() => handleRowDoubleClick(patient)}
                      className={`cursor-pointer border-b border-slate-200 transition-colors ${isSel ? 'bg-[#cce5ff] hover:bg-[#b8daff]' : index % 2 === 0 ? 'bg-white hover:bg-slate-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
                      <td className="p-2 border-r border-slate-200 text-center text-slate-400 font-mono">{index + 1}</td>
                      <td className="p-2 border-r border-slate-200"><span className="font-mono font-bold text-blue-700">{patient.dossier}</span></td>
                      <td className="p-2 border-r border-slate-200 font-mono text-slate-600">{patient.matricule || '—'}</td>
                      <td className="p-2 border-r border-slate-200 uppercase font-medium"><div className="flex items-center gap-2"><span>{patient.lastName} {patient.firstName}</span>{hv && <span title="Paramètres saisis"><Activity className="w-3 h-3 text-green-600" /></span>}</div></td>
                      <td className="p-2 border-r border-slate-200 text-slate-600">{patient.dateOfBirth === 'N/A' ? '—' : new Date(patient.dateOfBirth).toLocaleDateString('fr-FR')}</td>
                      <td className="p-2 border-r border-slate-200 font-medium">{patient.age === 'N/A' ? '—' : patient.age}</td>
                      <td className="p-2 border-r border-slate-200 text-center"><span className={`inline-block w-6 h-6 rounded-full font-bold text-xs leading-6 ${patient.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>{patient.gender}</span></td>
                      <td className="p-2 border-r border-slate-200 font-mono text-slate-600">{patient.contact || '—'}</td>
                      <td className="p-2 border-r border-slate-200 uppercase truncate text-slate-600">{patient.address || '—'}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-600 font-mono">{formatLastVisit(patient.lastVisitAt)}</td>
                      <td className="p-2 uppercase truncate text-slate-600">{patient.insureName || '—'}</td>
                    </tr>
                  );
                })}
                {filteredPatients.length === 0 && <tr><td colSpan={11} className="p-12 text-center text-slate-400"><Users className="w-12 h-12 mx-auto mb-2 opacity-30" /><p className="font-medium">Aucun patient trouvé</p></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer className="bg-gradient-to-b from-slate-200 to-slate-300 border-t border-slate-400 px-4 py-1 flex justify-between items-center text-xs text-slate-600">
        <div className="flex items-center gap-4"><span>📊 Total: <strong>{filteredPatients.length}</strong></span><span>|</span><span>🩺 En attente: <strong className="text-amber-700">{waitingCount}</strong></span><span>|</span><span>📅 Auj: <strong className="text-blue-700">{todayCount}</strong></span></div>
        <div className="font-semibold">MediCare HIS v2.0 © 2026</div>
      </footer>

      {/* MODAL: SAISIE PATIENT */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-xl bg-[#f0f0f0] rounded border-2 border-slate-500 shadow-2xl overflow-auto max-h-[90vh]">
            <div className="bg-gradient-to-r from-[#4a6fa5] to-[#3d5a80] px-3 py-1.5 flex justify-between items-center"><span className="text-white text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" />{modal === 'add' ? 'NOUVEAU PATIENT' : 'MODIFIER PATIENT'}</span><button onClick={() => setModal('none')} className="text-white/80 hover:text-white hover:bg-white/20 rounded p-0.5 transition cursor-pointer"><X className="h-4 w-4" /></button></div>
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
                  <div><label className="block font-bold text-slate-700 mb-1">Assuré</label><input type="text" value={patientForm.insureName} onChange={(e) => setPatientForm({ ...patientForm, insureName: e.target.value })} className="w-full bg-white border border-slate-400 rounded px-2 py-1.5 uppercase focus:outline-none focus:border-blue-500" /></div>
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

      {/* MODAL: SAISIE PARAMÈTRES */}
      {modal === 'vitals' && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg bg-[#f0f0f0] rounded border-2 border-slate-500 shadow-2xl overflow-auto max-h-[90vh]">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-1.5 flex justify-between items-center">
              <span className="text-white text-sm font-bold flex items-center gap-2"><Activity className="w-4 h-4" />SAISIE PARAMÈTRES</span>
              <button onClick={() => setModal('none')} className="text-white/80 hover:text-white hover:bg-white/20 rounded p-0.5 transition cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
            <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-center">
              <div className="text-lg font-bold text-emerald-800 uppercase">{selectedPatient.lastName} {selectedPatient.firstName}</div>
              <div className="text-xs text-emerald-600">Dossier: {selectedPatient.dossier} | {selectedPatient.gender === 'M' ? 'Homme' : 'Femme'} | {selectedPatient.age}</div>
            </div>
            <div className="p-4">
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
                      <select value={vitalsForm.tdr || ''} onChange={(e) => setVitalsForm({ ...vitalsForm, tdr: e.target.value })} className="w-24 bg-white border border-slate-400 rounded px-2 py-1.5 text-center focus:outline-none focus:border-emerald-500 cursor-pointer"><option value="">—</option><option value="Positif">Positif</option><option value="Négatif">Négatif</option></select>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input type="number" step={f.step} inputMode={f.step === '0.1' ? 'decimal' : 'numeric'} value={(vitalsForm as any)[f.key]} onChange={(e) => setVitalsForm({ ...vitalsForm, [f.key]: e.target.value })} className="w-20 bg-white border border-slate-400 rounded px-2 py-1.5 text-center font-mono focus:outline-none focus:border-emerald-500" />
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
                <button onClick={handleSaveVitalsAndSend} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow-lg transition cursor-pointer"><Stethoscope className="w-4 h-4" /> VALIDER & ENVOYER AU MÉDECIN</button>
                <button onClick={() => setModal('none')} className="flex items-center gap-2 px-6 py-2.5 bg-slate-500 hover:bg-slate-600 text-white rounded font-bold shadow transition cursor-pointer"><Ban className="w-4 h-4" /> ANNULER</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
