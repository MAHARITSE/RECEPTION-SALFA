import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { HospitalizationRecord, DailyNote } from '../types';
import type { AppState } from '../store';
import { addAuditLog, addNotification } from '../store';
import {
  Building2, BedDouble, CheckCircle, Clock,
  Plus, FileText, LogOut, Users
} from 'lucide-react';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

type Tab = 'admissions' | 'inpatients' | 'beds' | 'discharge';

export default function HospitalizationModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('admissions');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [dailyNoteForm, setDailyNoteForm] = useState({
    nursingCare: '',
    doctorObservations: '',
    medicationsAdministered: '',
  });

  // Patients awaiting hospitalization (with invoice paid and hospitalization requested)
  const pendingAdmissions = state.patients.filter((p) => {
    const consultation = state.consultations.find(
      (c) => c.patientId === p.id && c.hospitalizeRequested
    );
    if (!consultation) return false;
    const invoice = state.invoices.find((inv) => inv.consultationId === consultation.id && inv.status === 'paid');
    const alreadyHospitalized = state.hospitalizations.some((h) => h.patientId === p.id && h.status === 'active');
    return (invoice || consultation.isEmergency) && !alreadyHospitalized;
  });

  const activeHospitalizations = state.hospitalizations.filter((h) => h.status === 'active');
  const availableBeds = state.beds.filter((b) => !b.occupied);

  const admitPatient = () => {
    if (!selectedPatientId || !selectedBedId) {
      alert('Veuillez sélectionner un patient et un lit.');
      return;
    }

    const patient = state.patients.find((p) => p.id === selectedPatientId);
    const bed = state.beds.find((b) => b.id === selectedBedId);
    if (!patient || !bed) return;

    // Check for double assignment
    if (bed.occupied) {
      alert('⚠️ ERREUR: Ce lit est déjà occupé !');
      return;
    }

    const consultation = state.consultations.find(
      (c) => c.patientId === selectedPatientId && c.hospitalizeRequested
    );

    const record: HospitalizationRecord = {
      id: uuidv4(),
      patientId: selectedPatientId,
      consultationId: consultation?.id || '',
      service: bed.service,
      roomNumber: bed.roomNumber,
      bedNumber: bed.bedNumber,
      admissionDate: new Date().toISOString(),
      dailyNotes: [],
      status: 'active',
    };

    setState((prev) => {
      const next = {
        ...prev,
        hospitalizations: [...prev.hospitalizations, record],
        beds: prev.beds.map((b) =>
          b.id === selectedBedId ? { ...b, occupied: true, patientId: selectedPatientId } : b
        ),
        patients: prev.patients.map((p) =>
          p.id === selectedPatientId ? { ...p, status: 'hospitalized' as const } : p
        ),
      };

      addAuditLog(next, 'HOSPITALISATION', `${patient.lastName} admis en ${bed.service} - Chambre ${bed.roomNumber} Lit ${bed.bedNumber}`, selectedPatientId);
      addNotification(next, 'doctor', `Patient hospitalisé: ${patient.lastName} - ${bed.service}`, 'info', consultation?.doctorId);

      return next;
    });

    setSelectedPatientId(null);
    setSelectedBedId(null);
    alert('Patient admis avec succès !');
  };

  const addDailyNoteToPatient = (hospitalizationId: string) => {
    const note: DailyNote = {
      id: uuidv4(),
      date: new Date().toISOString(),
      authorId: state.currentUser?.id || '',
      authorName: state.currentUser?.name || '',
      nursingCare: dailyNoteForm.nursingCare,
      doctorObservations: dailyNoteForm.doctorObservations,
      medicationsAdministered: dailyNoteForm.medicationsAdministered
        ? dailyNoteForm.medicationsAdministered.split(',').map((s) => s.trim())
        : [],
    };

    setState((prev) => {
      const next = {
        ...prev,
        hospitalizations: prev.hospitalizations.map((h) =>
          h.id === hospitalizationId
            ? { ...h, dailyNotes: [...h.dailyNotes, note] }
            : h
        ),
      };
      const hosp = prev.hospitalizations.find((h) => h.id === hospitalizationId);
      const patient = prev.patients.find((p) => p.id === hosp?.patientId);
      addAuditLog(next, 'NOTE_QUOTIDIENNE', `Note ajoutée pour ${patient?.lastName}`, hosp?.patientId);
      return next;
    });

    setDailyNoteForm({ nursingCare: '', doctorObservations: '', medicationsAdministered: '' });
    alert('Note quotidienne ajoutée !');
  };

  const dischargePatient = (hospitalizationId: string) => {
    const hosp = state.hospitalizations.find((h) => h.id === hospitalizationId);
    if (!hosp) return;

    const patient = state.patients.find((p) => p.id === hosp.patientId);

    setState((prev) => {
      const next = {
        ...prev,
        hospitalizations: prev.hospitalizations.map((h) =>
          h.id === hospitalizationId ? { ...h, status: 'discharged' as const, dischargeDate: new Date().toISOString() } : h
        ),
        beds: prev.beds.map((b) =>
          b.service === hosp.service && b.roomNumber === hosp.roomNumber && b.bedNumber === hosp.bedNumber
            ? { ...b, occupied: false, patientId: undefined }
            : b
        ),
        patients: prev.patients.map((p) =>
          p.id === hosp.patientId ? { ...p, status: 'discharged' as const } : p
        ),
      };

      addAuditLog(next, 'SORTIE_HOSPITALISATION', `${patient?.lastName} sorti(e) de ${hosp.service}`, hosp.patientId);
      addNotification(next, 'cashier', `Sortie d'hospitalisation: ${patient?.lastName} - Facturation des nuitées à effectuer`, 'info');

      return next;
    });

    alert('Patient sorti avec succès !');
  };

  const services = [...new Set(state.beds.map((b) => b.service))];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{pendingAdmissions.length}</div>
              <div className="text-sm text-slate-500">Admissions en attente</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 rounded-lg"><Users className="w-5 h-5 text-rose-600" /></div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{activeHospitalizations.length}</div>
              <div className="text-sm text-slate-500">Patients hospitalisés</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><BedDouble className="w-5 h-5 text-green-600" /></div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{availableBeds.length}</div>
              <div className="text-sm text-slate-500">Lits disponibles</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Building2 className="w-5 h-5 text-blue-600" /></div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{state.beds.length}</div>
              <div className="text-sm text-slate-500">Capacité totale</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {[
            { key: 'admissions' as Tab, icon: <Plus className="w-4 h-4" />, label: `Admissions (${pendingAdmissions.length})` },
            { key: 'inpatients' as Tab, icon: <Users className="w-4 h-4" />, label: `Hospitalisés (${activeHospitalizations.length})` },
            { key: 'beds' as Tab, icon: <BedDouble className="w-4 h-4" />, label: 'Plan des lits' },
            { key: 'discharge' as Tab, icon: <LogOut className="w-4 h-4" />, label: 'Sorties' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.key
                  ? 'border-rose-500 text-rose-600 bg-rose-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'admissions' && (
            <div>
              {pendingAdmissions.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Aucune admission en attente</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-3">Patients en attente d'admission</h4>
                    <div className="space-y-2">
                      {pendingAdmissions.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => setSelectedPatientId(p.id)}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedPatientId === p.id ? 'border-rose-400 bg-rose-50' : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="font-medium text-slate-800">{p.lastName} {p.firstName}</div>
                          <div className="text-xs text-slate-500">{p.assignedSpecialty}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-3">Lits disponibles</h4>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {availableBeds.map((b) => (
                        <div
                          key={b.id}
                          onClick={() => setSelectedBedId(b.id)}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedBedId === b.id ? 'border-green-400 bg-green-50' : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="font-medium text-slate-800">{b.service}</div>
                          <div className="text-xs text-slate-500">
                            Chambre {b.roomNumber} — Lit {b.bedNumber}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={admitPatient}
                      disabled={!selectedPatientId || !selectedBedId}
                      className="mt-4 w-full py-2.5 bg-rose-600 text-white rounded-lg font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Admettre le patient
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'inpatients' && (
            <div>
              {activeHospitalizations.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Aucun patient hospitalisé</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeHospitalizations.map((h) => {
                    const patient = state.patients.find((p) => p.id === h.patientId);
                    return (
                      <div key={h.id} className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="p-4 bg-rose-50 flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-800">{patient?.lastName} {patient?.firstName}</div>
                            <div className="text-sm text-slate-500">
                              {h.service} — Chambre {h.roomNumber}, Lit {h.bedNumber}
                            </div>
                            <div className="text-xs text-slate-400">
                              Admis le {new Date(h.admissionDate).toLocaleDateString('fr-FR')}
                            </div>
                          </div>
                          <button
                            onClick={() => dischargePatient(h.id)}
                            className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm flex items-center gap-2 cursor-pointer"
                          >
                            <LogOut className="w-4 h-4" />
                            Sortie
                          </button>
                        </div>

                        {/* Daily notes */}
                        <div className="p-4">
                          <h5 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Dossier de soins ({h.dailyNotes.length} notes)
                          </h5>

                          {h.dailyNotes.length > 0 && (
                            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                              {h.dailyNotes.map((note) => (
                                <div key={note.id} className="p-2 bg-slate-50 rounded-lg text-sm">
                                  <div className="text-xs text-slate-400">
                                    {new Date(note.date).toLocaleString('fr-FR')} — {note.authorName}
                                  </div>
                                  {note.nursingCare && <p className="text-slate-600"><strong>Soins:</strong> {note.nursingCare}</p>}
                                  {note.doctorObservations && <p className="text-slate-600"><strong>Observations:</strong> {note.doctorObservations}</p>}
                                  {note.medicationsAdministered.length > 0 && (
                                    <p className="text-slate-600"><strong>Médicaments:</strong> {note.medicationsAdministered.join(', ')}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={dailyNoteForm.nursingCare}
                              onChange={(e) => setDailyNoteForm({ ...dailyNoteForm, nursingCare: e.target.value })}
                              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-rose-500"
                              placeholder="Soins infirmiers..."
                            />
                            <input
                              type="text"
                              value={dailyNoteForm.doctorObservations}
                              onChange={(e) => setDailyNoteForm({ ...dailyNoteForm, doctorObservations: e.target.value })}
                              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-rose-500"
                              placeholder="Observations..."
                            />
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={dailyNoteForm.medicationsAdministered}
                                onChange={(e) => setDailyNoteForm({ ...dailyNoteForm, medicationsAdministered: e.target.value })}
                                className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-rose-500"
                                placeholder="Médicaments administrés..."
                              />
                              <button
                                onClick={() => addDailyNoteToPatient(h.id)}
                                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 text-sm cursor-pointer"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'beds' && (
            <div>
              {services.map((service) => {
                const serviceBeds = state.beds.filter((b) => b.service === service);
                const occupied = serviceBeds.filter((b) => b.occupied).length;
                return (
                  <div key={service} className="mb-6">
                    <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      {service}
                      <span className="text-xs text-slate-500 font-normal">
                        ({occupied}/{serviceBeds.length} occupés)
                      </span>
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                      {serviceBeds.map((bed) => {
                        const patient = bed.patientId ? state.patients.find((p) => p.id === bed.patientId) : null;
                        return (
                          <div
                            key={bed.id}
                            className={`p-3 rounded-xl border-2 text-center ${
                              bed.occupied
                                ? 'border-red-300 bg-red-50'
                                : 'border-green-300 bg-green-50'
                            }`}
                          >
                            <BedDouble className={`w-6 h-6 mx-auto mb-1 ${bed.occupied ? 'text-red-500' : 'text-green-500'}`} />
                            <div className="font-mono text-xs font-bold text-slate-700">
                              Ch.{bed.roomNumber} - {bed.bedNumber}
                            </div>
                            {patient && (
                              <div className="text-xs text-slate-500 mt-1 truncate">
                                {patient.lastName}
                              </div>
                            )}
                            <div className={`text-xs mt-1 font-medium ${bed.occupied ? 'text-red-600' : 'text-green-600'}`}>
                              {bed.occupied ? 'Occupé' : 'Libre'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'discharge' && (
            <div>
              {state.hospitalizations.filter((h) => h.status === 'discharged').length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Aucune sortie enregistrée</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-600">Patient</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600">Service</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600">Admission</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-600">Sortie</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-600">Durée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.hospitalizations
                        .filter((h) => h.status === 'discharged')
                        .map((h) => {
                          const patient = state.patients.find((p) => p.id === h.patientId);
                          const days = h.dischargeDate
                            ? Math.ceil((new Date(h.dischargeDate).getTime() - new Date(h.admissionDate).getTime()) / 86400000) || 1
                            : '-';
                          return (
                            <tr key={h.id} className="border-b border-slate-100">
                              <td className="py-3 px-4 font-medium text-slate-700">{patient?.lastName} {patient?.firstName}</td>
                              <td className="py-3 px-4 text-slate-600">{h.service}</td>
                              <td className="py-3 px-4 text-slate-600">{new Date(h.admissionDate).toLocaleDateString('fr-FR')}</td>
                              <td className="py-3 px-4 text-slate-600">{h.dischargeDate ? new Date(h.dischargeDate).toLocaleDateString('fr-FR') : '-'}</td>
                              <td className="py-3 px-4 text-center font-mono">{days} jour(s)</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
