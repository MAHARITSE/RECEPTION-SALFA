import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Patient, VitalSigns, ClientType } from '../types';
import type { AppState } from '../store';
import { generateDossierNumber, calculateAge, addAuditLog, addNotification, addJourneyEvent } from '../store';
import { printQueueTicket } from '../utils/printTicket';
import {
  Search, Plus, Edit, Trash2, UserX, Activity,
  X, Check, Ban, Users, LogIn, Hospital,
  Stethoscope, MessageCircle, Info, Clock, Printer
} from 'lucide-react';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onStaffLogin: () => void;
  onOpenMessaging: () => void;
}
type ModalType =
  | 'none' | 'add' | 'edit' | 'vitals'
  | 'blacklistReason' | 'blacklistList' | 'patientInfo';

function formatFrDate(d?: Date | string | null) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function ModuleReception({ state, setState, onStaffLogin, onOpenMessaging }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [modal, setModal] = useState<ModalType>('none');
  const [now, setNow] = useState(new Date());
  const [blacklistReason, setBlacklistReason] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const resetPatientForm = () => setPatientForm({
    lastName: '', firstName: '', dateOfBirth: '', gender: 'F',
    address: '', contact: '', ssn: '', matricule: '', insureName: '',
    clientType: 'comptoir', company: '', subCompany: '',
  });
  const resetVitalsForm = (p: Patient) => {
    setVitalsForm(p.vitalSigns || {
      temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '',
      heartRate: '', oxygenSaturation: '', weight: '', height: '', tdr: '',
    });
    setVitalsClientType(p.clientType === 'externe' ? 'comptoir' : p.clientType);
    setVitalsCompany(p.company || '');
    setVitalsSubCompany(p.subCompany || '');
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredPatients = state.patients.filter((p) =>
    !q ||
    p.firstName.toLowerCase().includes(q) ||
    p.lastName.toLowerCase().includes(q) ||
    p.dossier.toLowerCase().includes(q) ||
    (p.matricule || '').toLowerCase().includes(q)
  );

  const waitingCount = state.patients.filter(p => p.status === 'waiting_consultation').length;
  const todayCount = state.patients.filter(p =>
    new Date(p.registeredAt).toDateString() === now.toDateString()
  ).length;
  const blacklistedPatients = state.patients.filter(p => p.blacklisted);

  /* ───────── actions ───────── */
  const openVitals = (p: Patient) => {
    setSelectedPatient(p);
    setVitalsReadOnly(!canEditVitals(p));
    resetVitalsForm(p);
    setModal('vitals');
  };

  const handleRowDoubleClick = (p: Patient) => openVitals(p);

  const canEditVitals = (p: Patient): boolean => {
    if (!p.vitalSigns) return true;
    if (!p.lastVisitAt) return false;
    return (Date.now() - new Date(p.lastVisitAt).getTime()) < 24 * 3600 * 1000;
  };

  const handleSaveVitalsAndSend = () => {
    if (!selectedPatient) return;
    if (selectedPatient.vitalSigns && !canEditVitals(selectedPatient)) {
      alert('Paramètres verrouillés : délai de modification de 24 h dépassé.');
      return;
    }
    setState(prev => {
      const next = {
        ...prev,
        patients: prev.patients.map(p =>
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
      addJourneyEvent(next, {
        patientId: selectedPatient.id, department: 'reception',
        action: 'Adressé au médecin', status: 'waiting_consultation',
        details: 'Paramètres vitaux saisis', actorName: 'Réception',
      });
      addNotification(next, 'doctor', `📋 Nouveau patient: ${selectedPatient.lastName} ${selectedPatient.firstName}`, 'info');
      return next;
    });
    const queueNumber = state.patients.filter(p => p.status === 'waiting_consultation').length + 1;
    printQueueTicket(state.ticketSettings, { ...selectedPatient, status: 'waiting_consultation' }, queueNumber);
    setModal('none');
  };

  const handleAddPatient = () => {
    if (!patientForm.lastName || !patientForm.firstName) {
      alert('Nom et prénom obligatoires'); return;
    }
    const np: Patient = {
      id: uuidv4(),
      dossier: generateDossierNumber(patientForm.lastName),
      matricule: patientForm.matricule || undefined,
      firstName: patientForm.firstName.toUpperCase(),
      lastName: patientForm.lastName.toUpperCase(),
      dateOfBirth: patientForm.dateOfBirth || 'N/A',
      age: patientForm.dateOfBirth ? calculateAge(patientForm.dateOfBirth) : 'N/A',
      gender: patientForm.gender,
      address: patientForm.address.toUpperCase(),
      contact: patientForm.contact,
      ssn: patientForm.ssn,
      clientType: patientForm.clientType,
      company: patientForm.company || undefined,
      subCompany: patientForm.subCompany || undefined,
      allergies: [], chronicTreatments: [], antecedents: [],
      registeredAt: new Date().toISOString(),
      registeredBy: 'RECEPTION',
      status: 'registered',
    };
    setState(prev => {
      const next = { ...prev, patients: [...prev.patients, np] };
      addAuditLog(next, 'ENREGISTREMENT', `Nouveau: ${np.dossier} - ${np.lastName} ${np.firstName}`, np.id);
      addJourneyEvent(next, {
        patientId: np.id, department: 'reception',
        action: 'Enregistrement patient', status: 'registered',
        details: `Dossier ${np.dossier} créé`, actorName: 'Réception',
      });
      return next;
    });
    setSelectedPatient(np);
    setModal('none');
  };

  const handleEditPatient = () => {
    if (!selectedPatient) return;
    setState(prev => ({
      ...prev,
      patients: prev.patients.map(p =>
        p.id === selectedPatient.id ? {
          ...p,
          firstName: patientForm.firstName.toUpperCase(),
          lastName: patientForm.lastName.toUpperCase(),
          dateOfBirth: patientForm.dateOfBirth || 'N/A',
          age: patientForm.dateOfBirth ? calculateAge(patientForm.dateOfBirth) : 'N/A',
          gender: patientForm.gender,
          address: patientForm.address.toUpperCase(),
          contact: patientForm.contact,
          ssn: patientForm.ssn,
          matricule: patientForm.matricule || undefined,
          clientType: patientForm.clientType,
          company: patientForm.company || undefined,
          subCompany: patientForm.subCompany || undefined,
        } : p
      ),
    }));
    setModal('none');
  };

  const handleDeletePatient = () => {
    if (!selectedPatient) return;
    if (!confirm(`Supprimer le dossier ${selectedPatient.dossier} ?`)) return;
    setState(prev => {
      const next = { ...prev, patients: prev.patients.filter(p => p.id !== selectedPatient.id) };
      addAuditLog(next, 'SUPPRESSION', `Dossier supprimé: ${selectedPatient.dossier}`, selectedPatient.id);
      return next;
    });
    setSelectedPatient(null);
  };

  const saveBlacklist = () => {
    if (!selectedPatient || !blacklistReason.trim()) return;
    setState(prev => {
      const next = {
        ...prev,
        patients: prev.patients.map(p =>
          p.id === selectedPatient.id
            ? { ...p, blacklisted: true, blacklistReason: blacklistReason.trim(), blacklistDate: new Date().toISOString() }
            : p
        ),
      };
      addAuditLog(next, 'BLACKLIST', `${selectedPatient.dossier} bloqué — ${blacklistReason.trim()}`, selectedPatient.id);
      return next;
    });
    setSelectedPatient(null);
    setBlacklistReason('');
    setModal('none');
  };

  const restoreBlacklistedPatient = (p: Patient) => {
    if (!confirm(`Rétablir ${p.lastName} ${p.firstName} dans la liste ?`)) return;
    setState(prev => {
      const next = {
        ...prev,
        patients: prev.patients.map(x =>
          x.id === p.id
            ? { ...x, blacklisted: false, blacklistReason: undefined, blacklistDate: undefined }
            : x
        ),
      };
      addAuditLog(next, 'UNBLACKLIST', `${p.dossier} rétabli`, p.id);
      return next;
    });
    setSelectedPatient(s => s?.id === p.id ? { ...s, blacklisted: false, blacklistReason: undefined, blacklistDate: undefined } : s);
  };

  const resolveLastVisit = (p: Patient): string | undefined => {
    if (p.lastVisitAt) return p.lastVisitAt;
    const paid = state.invoices.filter(i => i.patientId === p.id && i.status === 'paid' && i.paidAt).map(i => i.paidAt!);
    const cons = state.consultations.filter(c => c.patientId === p.id).map(c => c.date);
    const jour = state.journey.filter(j => j.patientId === p.id).map(j => j.timestamp);
    const all = [...paid, ...cons, ...jour].filter(Boolean);
    if (!all.length) return (p.status && p.status !== 'registered') ? p.registeredAt : undefined;
    return all.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  };
  const fmtLastVisit = (d?: string) => d
    ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  /* ───────── RENDER ───────── */
  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-ward)] text-[var(--color-ink)] select-none">
      {/* ========= HEADER appareil médical ========= */}
      <header className="device-bar">
        <div className="px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="brass-plaque px-3 py-1.5 flex items-center gap-2 rounded-sm">
              <Hospital className="w-5 h-5" strokeWidth={2.25}/>
              <span className="text-sm sm:text-base leading-none">Salfa</span>
              <span className="text-[10px] leading-none opacity-80 hidden sm:inline">· RÉCEPTION</span>
            </div>

            {/* File d'attente */}
            <div className="hidden md:flex items-center gap-2 text-[var(--color-ward-2)] text-xs font-mono">
              <span className="led text-amber-300 animate-pulse" aria-hidden />
              <span>FILE ATTENTE</span>
              <span className="text-amber-200 font-bold text-sm font-display tracking-widest ml-1">
                {String(waitingCount).padStart(2,'0')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="led-clock hidden sm:flex items-center gap-2 text-sm">
              <Clock className="w-3.5 h-3.5"/>
              <span>{now.toLocaleTimeString('fr-FR')}</span>
            </div>
            <span className="hidden lg:inline text-[11px] font-mono text-slate-400 tracking-wider">
              {formatFrDate(now)}
            </span>

            <button onClick={onOpenMessaging}
              className="btn-bake" title="Messagerie interne">
              <MessageCircle className="w-3.5 h-3.5"/>
              <span className="hidden sm:inline">Messages</span>
            </button>
            <button onClick={onStaffLogin}
              className="btn-bake primary" title="Connexion du personnel">
              <LogIn className="w-3.5 h-3.5"/>
              <span className="hidden sm:inline">Personnel</span>
            </button>
          </div>
        </div>
      </header>

      {/* ========= BARRE OUTILS ========= */}
      <section className="bg-[var(--color-paper-2)] border-b border-[var(--color-rule)] px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-inksoft)]"/>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field-reg w-full pl-9 font-mono text-sm"
              placeholder="Recherche · nom, n° dossier, matricule…"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { resetPatientForm(); setModal('add'); }}
              className="btn-bake ok"><Plus className="w-3.5 h-3.5"/>Nouveau</button>
            <button
              disabled={!selectedPatient}
              onClick={() => {
                if (!selectedPatient) return;
                setPatientForm({
                  lastName: selectedPatient.lastName,
                  firstName: selectedPatient.firstName,
                  dateOfBirth: selectedPatient.dateOfBirth === 'N/A' ? '' : selectedPatient.dateOfBirth,
                  gender: selectedPatient.gender,
                  address: selectedPatient.address,
                  contact: selectedPatient.contact,
                  ssn: selectedPatient.ssn,
                  matricule: selectedPatient.matricule || '',
                  insureName: selectedPatient.company || selectedPatient.insureName || '',
                  clientType: selectedPatient.clientType === 'externe' ? 'comptoir' : selectedPatient.clientType,
                  company: selectedPatient.company || '',
                  subCompany: selectedPatient.subCompany || '',
                });
                setModal('edit');
              }}
              className="btn-bake warn"><Edit className="w-3.5 h-3.5"/>Modifier</button>
            <button
              disabled={!selectedPatient}
              onClick={handleDeletePatient}
              className="btn-bake danger"><Trash2 className="w-3.5 h-3.5"/>Supprimer</button>
            <span className="mx-1 w-px h-6 bg-[var(--color-rule)]"/>
            <button
              disabled={!selectedPatient}
              onClick={() => selectedPatient && setModal('patientInfo')}
              className="btn-bake"><Info className="w-3.5 h-3.5"/>Fiche</button>
            <button
              onClick={() => setModal('blacklistList')}
              className="btn-bake" title="Patients bloqués">
              <UserX className="w-3.5 h-3.5"/>Bloqués
              {blacklistedPatients.length > 0 && (
                <span className="ml-1 px-1.5 bg-[var(--color-stamp-red)] text-white text-[10px] font-mono rounded-sm">
                  {blacklistedPatients.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ========= TABLEAU ========= */}
      <main className="flex-1 p-3 sm:p-4">
        <div className="folder rounded-sm flex flex-col h-full overflow-hidden">
          <div className="module-hdr">
            <span className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5"/>
              REGISTRE DES PATIENTS · {filteredPatients.length} fiche{filteredPatients.length > 1 ? 's' : ''}
            </span>
            <span className="sticky hidden sm:inline-block" style={{ transform: 'rotate(1deg)' }}>
              💡 double-clic → saisie des paramètres
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="chart">
              <thead>
                <tr>
                  <th className="w-10 text-center">#</th>
                  <th className="w-10 text-center">BL</th>
                  <th className="w-10 text-center">P</th>
                  <th className="w-24">Dossier</th>
                  <th className="w-24">Matricule</th>
                  <th className="min-w-[220px]">Nom & Prénom</th>
                  <th className="w-24">Né(e) le</th>
                  <th className="w-14 text-center">Âge</th>
                  <th className="w-12 text-center">Sexe</th>
                  <th className="w-28">Téléphone</th>
                  <th className="min-w-[130px]">Adresse</th>
                  <th className="w-28">Dern. visite</th>
                  <th>Société</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((p, i) => {
                  const isSel = selectedPatient?.id === p.id;
                  const hasVitals = !!(p.vitalSigns && (p.vitalSigns.temperature || p.vitalSigns.weight));
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPatient(p)}
                      onDoubleClick={() => handleRowDoubleClick(p)}
                      className={`cursor-pointer ${isSel ? 'selected' : ''} ${p.blacklisted ? 'blacklisted' : ''}`}
                    >
                      <td className="text-center font-mono text-[var(--color-inksoft)]">{i + 1}</td>
                      <td className="text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); p.blacklisted ? restoreBlacklistedPatient(p) : (setSelectedPatient(p), setBlacklistReason(''), setModal('blacklistReason')); }}
                          className={`btn-key !text-[10px] ${p.blacklisted ? '!bg-[var(--color-stamp-red)] !text-white !border-[#4a0f0a]' : ''}`}
                          title={p.blacklisted ? 'Rétablir' : 'Bloquer ce patient'}
                        >
                          {p.blacklisted ? '✓ BL' : 'BL'}
                        </button>
                      </td>
                      <td className="text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); openVitals(p); }}
                          className={`btn-key !text-[10px] ${hasVitals ? '!bg-[var(--color-stamp-grn)] !text-white !border-[#0f3819]' : ''}`}
                          title="Saisir / voir paramètres"
                        >
                          {hasVitals ? '✓ P' : 'P'}
                        </button>
                      </td>
                      <td>
                        <span className="font-mono font-bold text-[var(--color-stamp-blue)] tracking-wider">
                          {p.dossier}
                        </span>
                      </td>
                      <td className="font-mono text-[var(--color-inksoft)]">{p.matricule || '—'}</td>
                      <td className="uppercase font-semibold tracking-wide">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{p.lastName} {p.firstName}</span>
                          {p.blacklisted && <span className="stamp">bloqué</span>}
                          {hasVitals && <span title="Paramètres saisis"><Activity className="w-3.5 h-3.5 text-[var(--color-stamp-grn)]"/></span>}
                        </div>
                      </td>
                      <td className="text-[var(--color-inksoft)] font-mono">
                        {p.dateOfBirth === 'N/A' ? '—' : new Date(p.dateOfBirth).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="font-semibold">{p.age === 'N/A' ? '—' : p.age}</td>
                      <td className="text-center">
                        <span className={`pill ${p.gender === 'F' ? 'text-pink-700' : 'text-[var(--color-stamp-blue)]'}`}>
                          {p.gender}
                        </span>
                      </td>
                      <td className="font-mono text-[var(--color-inksoft)]">{p.contact || '—'}</td>
                      <td className="uppercase truncate text-[var(--color-inksoft)] max-w-[240px]">{p.address || '—'}</td>
                      <td className="font-mono text-[var(--color-inksoft)]">{fmtLastVisit(resolveLastVisit(p))}</td>
                      <td className="uppercase truncate text-[var(--color-inksoft)] max-w-[180px]">
                        {p.company || p.insureName || '—'}
                      </td>
                    </tr>
                  );
                })}
                {filteredPatients.length === 0 && (
                  <tr>
                    <td colSpan={13} className="p-16 text-center">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-30"/>
                      <p className="font-display tracking-widest uppercase text-[var(--color-inksoft)]">Registre vide</p>
                      <p className="text-xs text-[var(--color-inksoft)] mt-1 italic">Aucun patient ne correspond à la recherche.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Perforation + bas de page ticket */}
          <div className="perf"/>
          <div className="bg-[var(--color-thermal)] px-4 py-2 flex flex-wrap justify-between items-center text-[11px] font-mono text-[var(--color-inksoft)] border-t border-[var(--color-rule)] border-dashed">
            <div className="flex items-center gap-4">
              <span>📋 TOTAL <b className="text-[var(--color-ink)]">{filteredPatients.length}</b></span>
              <span className="text-amber-700">🩺 EN ATTENTE <b>{waitingCount}</b></span>
              <span className="text-[var(--color-stamp-blue)]">📅 AUJOURD'HUI <b>{todayCount}</b></span>
            </div>
            <div className="font-display tracking-widest text-[var(--color-ink)]">
              SALFA · RÉCEPTION · v3
            </div>
          </div>
        </div>
      </main>

      {/* =============== MODALE : ADD / EDIT PATIENT =============== */}
      {(modal === 'add' || modal === 'edit') && (
        <ModalShell onClose={() => setModal('none')} title={modal === 'add' ? 'NOUVEAU PATIENT' : 'MODIFIER FICHE'} accent="brass">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
            <div className="space-y-3">
              <FieldLabel>SEXE</FieldLabel>
              <div className="flex border border-[var(--color-rule)] rounded-sm overflow-hidden w-max">
                <button type="button" onClick={() => setPatientForm({ ...patientForm, gender: 'M' })}
                  className={`px-5 py-1.5 font-display tracking-widest text-sm transition ${patientForm.gender === 'M' ? 'bg-[var(--color-stamp-blue)] text-white' : 'bg-white hover:bg-[var(--color-paper)]'}`}>
                  M
                </button>
                <button type="button" onClick={() => setPatientForm({ ...patientForm, gender: 'F' })}
                  className={`px-5 py-1.5 font-display tracking-widest text-sm border-l border-[var(--color-rule)] transition ${patientForm.gender === 'F' ? 'bg-pink-700 text-white' : 'bg-white hover:bg-[var(--color-paper)]'}`}>
                  F
                </button>
              </div>

              <Field label="Nom *" value={patientForm.lastName} onChange={v => setPatientForm({ ...patientForm, lastName: v })} uppercase/>
              <Field label="Prénom *" value={patientForm.firstName} onChange={v => setPatientForm({ ...patientForm, firstName: v })} uppercase/>
              <div className="grid grid-cols-2 gap-2">
                <Field type="date" label="Date naissance" value={patientForm.dateOfBirth} onChange={v => setPatientForm({ ...patientForm, dateOfBirth: v })}/>
                <div>
                  <FieldLabel>ÂGE</FieldLabel>
                  <div className="field-reg field-mono bg-[var(--color-chart)] text-center">
                    {patientForm.dateOfBirth ? calculateAge(patientForm.dateOfBirth) : '—'}
                  </div>
                </div>
              </div>
              <Field label="Téléphone" value={patientForm.contact} onChange={v => setPatientForm({ ...patientForm, contact: v })} mono/>
            </div>
            <div className="space-y-3">
              <Field label="Matricule" value={patientForm.matricule} onChange={v => setPatientForm({ ...patientForm, matricule: v })} mono/>
              <Field label="Société (libre)" value={patientForm.company} onChange={v => setPatientForm({ ...patientForm, company: v })} uppercase/>
              <Field label="Adresse" value={patientForm.address} onChange={v => setPatientForm({ ...patientForm, address: v })} uppercase/>
              <div>
                <FieldLabel>Type client</FieldLabel>
                <select value={patientForm.clientType} onChange={e => setPatientForm({ ...patientForm, clientType: e.target.value as ClientType })}
                  className="field-reg w-full cursor-pointer">
                  <option value="comptoir">Comptoir</option>
                  <option value="societe">Société</option>
                </select>
              </div>
              {patientForm.clientType === 'societe' && (
                <div>
                  <FieldLabel>Société (liste)</FieldLabel>
                  <select value={patientForm.company} onChange={e => setPatientForm({ ...patientForm, company: e.target.value })}
                    className="field-reg w-full cursor-pointer">
                    <option value="">—</option>
                    {state.companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="perf-divider mt-6"/>
          <div className="flex items-center justify-center gap-3">
            <button onClick={modal === 'add' ? handleAddPatient : handleEditPatient}
              className="btn-bake ok !text-sm !px-6 !py-2.5">
              <Check className="w-4 h-4"/> Valider la fiche
            </button>
            <button onClick={() => setModal('none')} className="btn-bake !text-sm !px-6 !py-2.5">
              <Ban className="w-4 h-4"/> Annuler
            </button>
          </div>
        </ModalShell>
      )}

      {/* =============== MODALE : BLACKLIST =============== */}
      {modal === 'blacklistReason' && selectedPatient && (
        <ModalShell onClose={() => setModal('none')} title="MOTIF DU BLOCAGE" accent="red">
          <p className="text-sm text-[var(--color-inksoft)] mb-3">
            Indiquez le motif du blocage pour <b className="uppercase">{selectedPatient.lastName} {selectedPatient.firstName}</b>
            <span className="font-mono text-[var(--color-stamp-blue)] ml-2">({selectedPatient.dossier})</span>.
          </p>
          <textarea autoFocus value={blacklistReason} onChange={e => setBlacklistReason(e.target.value)}
            placeholder="Ex. Impayés répétés, comportement agressif…"
            className="field-reg w-full min-h-28 resize-none"/>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setModal('none')} className="btn-bake">Annuler</button>
            <button onClick={saveBlacklist} disabled={!blacklistReason.trim()} className="btn-bake danger">
              <Ban className="w-4 h-4"/> Confirmer le blocage
            </button>
          </div>
        </ModalShell>
      )}

      {modal === 'blacklistList' && (
        <ModalShell onClose={() => setModal('none')} title={`PATIENTS BLOQUÉS · ${blacklistedPatients.length}`} accent="red" wide>
          {blacklistedPatients.length === 0 ? (
            <div className="p-10 text-center">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30"/>
              <p className="font-display tracking-widest uppercase">Aucun patient bloqué</p>
            </div>
          ) : (
            <div className="border border-[var(--color-stamp-red)]/50 rounded-sm overflow-hidden">
              <table className="chart">
                <thead>
                  <tr>
                    <th>Patient</th><th className="w-28">Dossier</th>
                    <th>Motif</th><th className="w-32">Date</th><th className="w-32 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {blacklistedPatients.map(p => (
                    <tr key={p.id}>
                      <td className="uppercase font-semibold">{p.lastName} {p.firstName}</td>
                      <td className="font-mono text-[var(--color-stamp-blue)]">{p.dossier}</td>
                      <td className="text-[var(--color-inksoft)]">{p.blacklistReason || '—'}</td>
                      <td className="font-mono">{p.blacklistDate ? new Date(p.blacklistDate).toLocaleDateString('fr-FR') : '—'}</td>
                      <td className="text-right">
                        <button onClick={() => restoreBlacklistedPatient(p)} className="btn-bake ok">
                          <Check className="w-3.5 h-3.5"/>Rétablir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ModalShell>
      )}

      {/* =============== MODALE : INFO PATIENT =============== */}
      {modal === 'patientInfo' && selectedPatient && (
        <ModalShell onClose={() => setModal('none')} title="FICHE PATIENT" accent="teal">
          <div className="p-4 bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-sm relative">
            <div className="absolute -top-3 right-3 stamp green">À JOUR</div>
            <div className="text-center mb-4">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-sm brass-plaque text-xl font-bold">
                {selectedPatient.firstName[0]}{selectedPatient.lastName[0]}
              </div>
              <h3 className="mt-2 font-display text-xl tracking-widest uppercase">
                {selectedPatient.lastName} {selectedPatient.firstName}
              </h3>
              <p className="font-mono text-sm text-[var(--color-stamp-blue)]">{selectedPatient.dossier}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <InfoLine label="Naissance" value={selectedPatient.dateOfBirth === 'N/A' ? '—' : new Date(selectedPatient.dateOfBirth).toLocaleDateString('fr-FR')}/>
              <InfoLine label="Âge" value={selectedPatient.age}/>
              <InfoLine label="Téléphone" value={selectedPatient.contact || '—'}/>
              <InfoLine label="Sexe" value={selectedPatient.gender === 'M' ? 'Masculin' : 'Féminin'}/>
              <InfoLine label="Adresse" value={selectedPatient.address || '—'}/>
              <InfoLine label="Société" value={selectedPatient.company || selectedPatient.insureName || '—'}/>
              <InfoLine label="Type client" value={selectedPatient.clientType}/>
              <InfoLine label="Enregistré par" value={selectedPatient.registeredBy}/>
            </div>
            {selectedPatient.blacklisted && (
              <div className="mt-4 p-3 border border-[var(--color-stamp-red)] bg-[color:color-mix(in_srgb,var(--color-stamp-red)_8%,transparent)]">
                <div className="stamp mb-2">bloqué</div>
                <p className="text-sm"><b>Motif :</b> {selectedPatient.blacklistReason}</p>
                <p className="text-xs font-mono text-[var(--color-inksoft)] mt-1">
                  Depuis le {selectedPatient.blacklistDate ? new Date(selectedPatient.blacklistDate).toLocaleDateString('fr-FR') : '—'}
                </p>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* =============== MODALE : VITAUX =============== */}
      {modal === 'vitals' && selectedPatient && (
        <ModalShell onClose={() => setModal('none')} title="SAISIE DES CONSTANTES" accent="teal">
          <div className="mb-3 p-3 bg-[var(--color-paper)] border border-dashed border-[var(--color-rule)] text-center relative">
            <div className="absolute -top-3 left-3 stamp blue" style={{ transform: 'rotate(-4deg)' }}>FICHE CLINIQUE</div>
            <div className="font-display text-xl tracking-widest uppercase">
              {selectedPatient.lastName} {selectedPatient.firstName}
            </div>
            <div className="text-xs font-mono text-[var(--color-inksoft)] mt-1">
              DOSSIER {selectedPatient.dossier} · {selectedPatient.gender === 'M' ? 'Homme' : 'Femme'} · {selectedPatient.age}
            </div>
          </div>

          {vitalsReadOnly && (
            <div className="sticky mb-3" style={{ transform: 'rotate(-.8deg)' }}>
              <b>⚠ Lecture seule</b> — délai 24 h dépassé.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm mb-4">
            {[
              { k: 'temperature' as const,           lbl: '🌡 TEMPÉRATURE (°C)', step: '0.1', unit: '°C' },
              { k: 'oxygenSaturation' as const,     lbl: '💨 SPO₂ (%)',         step: '1',   unit: '%' },
              { k: 'bloodPressureSystolic' as const,lbl: '💓 TENSION SYS',      step: '1',   unit: 'mmHg' },
              { k: 'bloodPressureDiastolic' as const,lbl: '💓 TENSION DIA',     step: '1',   unit: 'mmHg' },
              { k: 'height' as const,               lbl: '📏 TAILLE (cm)',      step: '1',   unit: 'cm' },
              { k: 'weight' as const,               lbl: '⚖ POIDS (kg)',       step: '0.1',unit: 'kg' },
              { k: 'heartRate' as const,            lbl: '❤ POULS (bpm)',      step: '1',   unit: 'bpm' },
            ].map(f => (
              <div key={f.k} className="flex items-center justify-between gap-3">
                <label className="text-[11px] font-display tracking-widest uppercase text-[var(--color-inksoft)]">
                  {f.lbl}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" step={f.step} inputMode={f.step === '0.1' ? 'decimal' : 'numeric'}
                    disabled={vitalsReadOnly}
                    value={(vitalsForm as any)[f.k]}
                    onChange={e => setVitalsForm({ ...vitalsForm, [f.k]: e.target.value })}
                    className="field-reg field-mono !w-24 text-center"/>
                  <span className="text-[10px] font-mono text-[var(--color-inksoft)]">{f.unit}</span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <label className="text-[11px] font-display tracking-widest uppercase text-[var(--color-inksoft)]">
                🧪 TDR
              </label>
              <select
                disabled={vitalsReadOnly}
                value={vitalsForm.tdr || ''}
                onChange={e => setVitalsForm({ ...vitalsForm, tdr: e.target.value })}
                className="field-reg !w-28 text-center cursor-pointer">
                <option value="">—</option>
                <option value="Positif">Positif</option>
                <option value="Négatif">Négatif</option>
              </select>
            </div>
          </div>

          <div className="perf-divider"/>

          <div className="bg-[var(--color-paper-2)]/60 border border-[var(--color-brass)]/40 p-3 rounded-sm mb-4">
            <h4 className="text-[11px] font-display tracking-widest text-[var(--color-brass-ink)] mb-2">
              🏢 TYPE CLIENT
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Type</FieldLabel>
                <select value={vitalsClientType} onChange={e => setVitalsClientType(e.target.value as ClientType)}
                  className="field-reg w-full cursor-pointer">
                  <option value="comptoir">Comptoir</option>
                  <option value="societe">Société</option>
                </select>
              </div>
              {vitalsClientType === 'societe' && (
                <div>
                  <FieldLabel>Société</FieldLabel>
                  <select value={vitalsCompany} onChange={e => setVitalsCompany(e.target.value)}
                    className="field-reg w-full cursor-pointer">
                    <option value="">—</option>
                    {state.companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            {vitalsClientType === 'societe' && (
              <div className="mt-3">
                <FieldLabel>Sous-société (libre)</FieldLabel>
                <input type="text" value={vitalsSubCompany} onChange={e => setVitalsSubCompany(e.target.value)}
                  className="field-reg w-full uppercase"/>
              </div>
            )}
            <p className="text-[10px] font-mono text-[var(--color-inksoft)] italic mt-2">
              Remise saisie par le médecin · Envoi automatique à tous les médecins en service.
            </p>
          </div>

          <div className="perf-divider"/>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button onClick={handleSaveVitalsAndSend} disabled={vitalsReadOnly}
              className="btn-bake primary !text-sm !px-6 !py-2.5">
              <Stethoscope className="w-4 h-4"/> Valider & envoyer au médecin
            </button>
            <button onClick={() => setModal('none')} className="btn-bake !text-sm !px-6 !py-2.5">
              <X className="w-4 h-4"/> Fermer
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

/* ─────────────── Sous-composants ─────────────── */

function ModalShell({
  title, onClose, children, wide = false, accent = 'teal',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  accent?: 'teal' | 'brass' | 'red';
}) {
  const bar = {
    teal:  'linear-gradient(90deg, #0a696b, #0f8b8d)',
    brass: 'linear-gradient(90deg, #7d5c22, #b98b3a)',
    red:   'linear-gradient(90deg, #7a1f15, #b4261b)',
  }[accent];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-4"
         role="dialog" aria-modal="true" aria-label={title}>
      <div className={`folder rounded-sm w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} max-h-[92vh] overflow-y-auto`}>
        <div className="px-4 py-2.5 flex items-center justify-between text-white font-display tracking-[.18em] text-sm"
             style={{ background: bar, borderBottom: '1px solid rgba(0,0,0,.4)' }}>
          <span className="flex items-center gap-2">
            <Printer className="w-3.5 h-3.5 opacity-80"/>
            {title}
          </span>
          <button onClick={onClose} className="btn-key !bg-white/20 !text-white !border-white/30 hover:!bg-white/30">
            ✕
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-display tracking-[.18em] uppercase text-[var(--color-inksoft)] mb-1">
      {children}
    </label>
  );
}

function Field({
  label, value, onChange, type = 'text', uppercase = false, mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  uppercase?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
        className={`field-reg w-full ${mono ? 'field-mono' : ''} ${uppercase ? 'uppercase' : ''}`}
      />
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--color-rule-soft)] bg-white/70 p-2.5 rounded-sm">
      <p className="text-[10px] font-display tracking-widest uppercase text-[var(--color-inksoft)]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold uppercase">{value || '—'}</p>
    </div>
  );
}
