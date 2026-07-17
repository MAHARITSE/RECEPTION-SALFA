import React, { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { HospitalizationRecord, DailyNote, StockEntry } from '../types';
import type { AppState } from '../store';
import { addAuditLog, addNotification, formatAr, familyLabel } from '../store';
import {
  Building2, BedDouble, CheckCircle, Clock,
  Plus, FileText, LogOut, Users, PackagePlus, Search, Trash2, Save, Check, Truck
} from 'lucide-react';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

type Tab = 'admissions' | 'inpatients' | 'beds' | 'discharge' | 'achats_hospit' | 'achats_bloc';

export default function HospitalizationModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('admissions');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [dailyNoteForm, setDailyNoteForm] = useState({
    nursingCare: '',
    doctorObservations: '',
    medicationsAdministered: '',
  });

  // === SAGE ACHATS HOSPITALISATION & BLOC (copié/adapté du MagasinierModule) ===
  type PurchaseLine = { id: string; articleId: string; articleName: string; family: any; quantity: number; purchasePrice: number; expiryDate: string; amount: number; };

  // Hospitalisation Achats
  const [hospitSupplier, setHospitSupplier] = useState('');
  const [hospitInvoiceRef, setHospitInvoiceRef] = useState('');
  const [hospitLines, setHospitLines] = useState<PurchaseLine[]>([]);
  const [hospitSelLineId, setHospitSelLineId] = useState<string | null>(null);
  const [hospitIsNew, setHospitIsNew] = useState(true);
  const [hospitForm, setHospitForm] = useState({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 1, purchasePrice: 0, expiryDate: '' });
  const [hospitSearch, setHospitSearch] = useState('');
  const [hospitSearchIdx, setHospitSearchIdx] = useState(0);
  const hospitSearchRef = useRef<HTMLInputElement>(null);

  // Bloc Achats
  const [blocSupplier, setBlocSupplier] = useState('');
  const [blocInvoiceRef, setBlocInvoiceRef] = useState('');
  const [blocLines, setBlocLines] = useState<PurchaseLine[]>([]);
  const [blocSelLineId, setBlocSelLineId] = useState<string | null>(null);
  const [blocIsNew, setBlocIsNew] = useState(true);
  const [blocForm, setBlocForm] = useState({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 1, purchasePrice: 0, expiryDate: '' });
  const [blocSearch, setBlocSearch] = useState('');
  const [blocSearchIdx, setBlocSearchIdx] = useState(0);
  const blocSearchRef = useRef<HTMLInputElement>(null);

  // Purchase filtered for both
  const hospitFiltered = hospitSearch.length >= 1 
    ? state.articles.filter(a => a.name.toLowerCase().includes(hospitSearch.toLowerCase())) 
    : [];
  const blocFiltered = blocSearch.length >= 1 
    ? state.articles.filter(a => a.name.toLowerCase().includes(blocSearch.toLowerCase())) 
    : [];

  // === HOSPITALISATION PURCHASE HELPERS (Sage style) ===
  const hospitSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    setHospitForm({
      id: uuidv4(),
      articleId: a.id,
      articleName: a.name,
      family: a.family,
      quantity: 1,
      purchasePrice: a.purchasePrice,
      expiryDate: a.expiryDate || '',
    });
    setHospitIsNew(true);
    setHospitSelLineId(null);
    setHospitSearch('');
    setTimeout(() => {
      const qtyInput = document.getElementById('hospit-qty-input');
      qtyInput?.focus();
      (qtyInput as HTMLInputElement)?.select();
    }, 50);
  };

  const hospitArtKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHospitSearchIdx(i => Math.min(i + 1, hospitFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHospitSearchIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hospitFiltered.length > 0 && hospitSearch) {
        hospitSelectArticle(hospitFiltered[hospitSearchIdx].id);
      } else if (hospitForm.articleName) {
        hospitSaveLine();
      }
    } else if (e.key === 'Escape') {
      setHospitSearch('');
    }
  };

  const hospitSaveLine = () => {
    if (!hospitForm.articleId || !hospitForm.articleName) return;
    const amount = hospitForm.quantity * hospitForm.purchasePrice;
    const lineToSave = { ...hospitForm, amount };

    if (hospitIsNew || !hospitLines.some(l => l.id === hospitForm.id)) {
      setHospitLines([...hospitLines, { ...lineToSave, id: uuidv4() }]);
    } else {
      setHospitLines(hospitLines.map(l => l.id === hospitForm.id ? lineToSave : l));
    }
    hospitNew();
  };

  const hospitNew = () => {
    setHospitForm({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 1, purchasePrice: 0, expiryDate: '' });
    setHospitSelLineId(null);
    setHospitIsNew(true);
    setHospitSearch('');
    setTimeout(() => hospitSearchRef.current?.focus(), 50);
  };

  const hospitDeleteLine = () => {
    if (!hospitSelLineId) return;
    setHospitLines(hospitLines.filter(l => l.id !== hospitSelLineId));
    hospitNew();
  };

  const validateHospitPurchase = () => {
    if (hospitLines.length === 0) return;
    if (!hospitSupplier.trim()) { alert('Fournisseur requis'); return; }
    if (!hospitInvoiceRef.trim()) { alert('N° BL / Facture requis'); return; }

    setState((prev) => {
      let nextArticles = [...prev.articles];
      const newEntries: StockEntry[] = [];

      hospitLines.forEach((line) => {
        nextArticles = nextArticles.map((a) => {
          if (a.id === line.articleId) {
            return {
              ...a,
              stockCentral: a.stockCentral + line.quantity,
              purchasePrice: line.purchasePrice,
              expiryDate: line.expiryDate || a.expiryDate,
              supplier: hospitSupplier.trim(),
            };
          }
          return a;
        });

        newEntries.push({
          id: uuidv4(),
          articleId: line.articleId,
          articleName: line.articleName,
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
          supplier: hospitSupplier.trim(),
          invoiceRef: hospitInvoiceRef.trim(),
          expiryDate: line.expiryDate || undefined,
          date: new Date().toISOString(),
          enteredBy: prev.currentUser?.id || 'HOSPITALISATION',
          category: 'hospitalisation',
        });
      });

      const next = {
        ...prev,
        articles: nextArticles,
        stockEntries: [...prev.stockEntries, ...newEntries],
      };

      addAuditLog(next, 'ACHAT_HOSPITALISATION', `Achat Hospitalisation ${hospitLines.length} articles chez ${hospitSupplier.trim()} (BL: ${hospitInvoiceRef.trim()})`);
      return next;
    });

    setHospitLines([]);
    setHospitSupplier('');
    setHospitInvoiceRef('');
    hospitNew();
    alert('Achat Hospitalisation validé ! Stock mis à jour.');
  };

  // === BLOC PURCHASE HELPERS ===
  const blocSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    setBlocForm({
      id: uuidv4(),
      articleId: a.id,
      articleName: a.name,
      family: a.family,
      quantity: 1,
      purchasePrice: a.purchasePrice,
      expiryDate: a.expiryDate || '',
    });
    setBlocIsNew(true);
    setBlocSelLineId(null);
    setBlocSearch('');
    setTimeout(() => {
      const qtyInput = document.getElementById('bloc-qty-input');
      qtyInput?.focus();
      (qtyInput as HTMLInputElement)?.select();
    }, 50);
  };

  const blocArtKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setBlocSearchIdx(i => Math.min(i + 1, blocFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setBlocSearchIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (blocFiltered.length > 0 && blocSearch) {
        blocSelectArticle(blocFiltered[blocSearchIdx].id);
      } else if (blocForm.articleName) {
        blocSaveLine();
      }
    } else if (e.key === 'Escape') {
      setBlocSearch('');
    }
  };

  const blocSaveLine = () => {
    if (!blocForm.articleId || !blocForm.articleName) return;
    const amount = blocForm.quantity * blocForm.purchasePrice;
    const lineToSave = { ...blocForm, amount };

    if (blocIsNew || !blocLines.some(l => l.id === blocForm.id)) {
      setBlocLines([...blocLines, { ...lineToSave, id: uuidv4() }]);
    } else {
      setBlocLines(blocLines.map(l => l.id === blocForm.id ? lineToSave : l));
    }
    blocNew();
  };

  const blocNew = () => {
    setBlocForm({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 1, purchasePrice: 0, expiryDate: '' });
    setBlocSelLineId(null);
    setBlocIsNew(true);
    setBlocSearch('');
    setTimeout(() => blocSearchRef.current?.focus(), 50);
  };

  const blocDeleteLine = () => {
    if (!blocSelLineId) return;
    setBlocLines(blocLines.filter(l => l.id !== blocSelLineId));
    blocNew();
  };

  const validateBlocPurchase = () => {
    if (blocLines.length === 0) return;
    if (!blocSupplier.trim()) { alert('Fournisseur requis'); return; }
    if (!blocInvoiceRef.trim()) { alert('N° BL / Facture requis'); return; }

    setState((prev) => {
      let nextArticles = [...prev.articles];
      const newEntries: StockEntry[] = [];

      blocLines.forEach((line) => {
        nextArticles = nextArticles.map((a) => {
          if (a.id === line.articleId) {
            return {
              ...a,
              stockCentral: a.stockCentral + line.quantity,
              purchasePrice: line.purchasePrice,
              expiryDate: line.expiryDate || a.expiryDate,
              supplier: blocSupplier.trim(),
            };
          }
          return a;
        });

        newEntries.push({
          id: uuidv4(),
          articleId: line.articleId,
          articleName: line.articleName,
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
          supplier: blocSupplier.trim(),
          invoiceRef: blocInvoiceRef.trim(),
          expiryDate: line.expiryDate || undefined,
          date: new Date().toISOString(),
          enteredBy: prev.currentUser?.id || 'BLOC',
          category: 'bloc',
        });
      });

      const next = {
        ...prev,
        articles: nextArticles,
        stockEntries: [...prev.stockEntries, ...newEntries],
      };

      addAuditLog(next, 'ACHAT_BLOC', `Achat Bloc Opératoire ${blocLines.length} articles chez ${blocSupplier.trim()} (BL: ${blocInvoiceRef.trim()})`);
      return next;
    });

    setBlocLines([]);
    setBlocSupplier('');
    setBlocInvoiceRef('');
    blocNew();
    alert('Achat Bloc validé ! Stock mis à jour.');
  };

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
            { key: 'achats_hospit' as Tab, icon: <PackagePlus className="w-4 h-4" />, label: `Achats Hospit. (${hospitLines.length})` },
            { key: 'achats_bloc' as Tab, icon: <PackagePlus className="w-4 h-4" />, label: `Achats Bloc (${blocLines.length})` },
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

          {/* ACHATS HOSPITALISATION - SAGE FORM */}
          {tab === 'achats_hospit' && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
                <h4 className="font-bold text-rose-800 flex items-center gap-2 mb-3">
                  <PackagePlus className="w-5 h-5 text-rose-600" /> Saisie Sage — Achats Hospitalisation
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">👤 Fournisseur *</label>
                    <input 
                      type="text" 
                      value={hospitSupplier} 
                      onChange={e => setHospitSupplier(e.target.value)} 
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white text-sm text-slate-800" 
                      placeholder="Nom du fournisseur..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">📄 N° BL / Facture *</label>
                    <input 
                      type="text" 
                      value={hospitInvoiceRef} 
                      onChange={e => setHospitInvoiceRef(e.target.value)} 
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white text-sm text-slate-800" 
                      placeholder="Ex: BL-HOSP-2026-001..."
                    />
                  </div>
                </div>
              </div>

              {/* Sage Line Editor - Hospitalisation */}
              <div className="bg-[#f4f4f4] border border-slate-300 rounded text-xs select-none p-1">
                <div className="bg-slate-100 border-b border-slate-300 p-2 m-1.5 mb-0 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-1.5 font-sans">
                    <div className="flex-1 min-w-[150px] relative">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Article (↑↓ Entrée)</label>
                      <input
                        ref={hospitSearchRef}
                        type="text"
                        value={hospitForm.articleName && !hospitSearch ? hospitForm.articleName : hospitSearch}
                        onChange={e => {
                          setHospitSearch(e.target.value);
                          setHospitSearchIdx(0);
                          if (hospitForm.articleName && e.target.value !== hospitForm.articleName) {
                            setHospitForm(prev => ({ ...prev, articleName: '', articleId: '' }));
                          }
                        }}
                        onKeyDown={hospitArtKeyDown}
                        className="w-full bg-white border border-rose-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-500 text-slate-800"
                        placeholder="🔍 Saisir article à acheter (Hospit)..."
                      />
                      {hospitSearch.length >= 1 && hospitFiltered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                          {hospitFiltered.map((a, idx) => (
                            <div
                              key={a.id}
                              onClick={() => hospitSelectArticle(a.id)}
                              className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b border-slate-100 ${idx === hospitSearchIdx ? 'bg-rose-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}
                            >
                              <span>[{familyLabel(a.family)}] {a.name}</span>
                              <span className={`font-mono ${idx === hospitSearchIdx ? 'text-white' : 'text-slate-500'}`}>Stock: {a.stockCentral}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Famille</label>
                      <input
                        readOnly
                        value={familyLabel(hospitForm.family as any) || ''}
                        className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-600 truncate font-sans"
                      />
                    </div>

                    <div className="w-20">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quantité</label>
                      <input
                        id="hospit-qty-input"
                        type="number"
                        min={1}
                        value={hospitForm.quantity}
                        onChange={e => setHospitForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hospitSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-rose-500 text-slate-800"
                      />
                    </div>

                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">P. Achat Unitaire</label>
                      <input
                        type="number"
                        min={0}
                        value={hospitForm.purchasePrice}
                        onChange={e => setHospitForm(prev => ({ ...prev, purchasePrice: parseInt(e.target.value) || 0 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hospitSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-rose-500 text-slate-800"
                      />
                    </div>

                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Date Péremption</label>
                      <input
                        type="date"
                        value={hospitForm.expiryDate}
                        onChange={e => setHospitForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hospitSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-rose-500 text-slate-800"
                      />
                    </div>

                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Montant Total</label>
                      <input
                        readOnly
                        value={formatAr(hospitForm.quantity * hospitForm.purchasePrice)}
                        className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono font-bold text-slate-700"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-1.5 mt-2">
                    <button
                      onClick={hospitNew}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 transition cursor-pointer text-xs font-medium"
                    >
                      <Plus className="h-3.5 w-3.5 text-slate-500" /> Nouveau
                    </button>
                    <button
                      onClick={hospitDeleteLine}
                      disabled={!hospitSelLineId}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 disabled:opacity-40 transition cursor-pointer text-xs font-medium"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Supprimer
                    </button>
                    <button
                      onClick={hospitSaveLine}
                      disabled={!hospitForm.articleName}
                      className="flex items-center gap-1 px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white border border-rose-600 rounded shadow-sm font-semibold disabled:opacity-40 transition cursor-pointer text-xs"
                    >
                      <Save className="h-3.5 w-3.5" /> Enregistrer
                    </button>
                  </div>
                </div>

                {/* Grid Table */}
                <div className="bg-white mx-1.5 mb-1.5 border-t border-slate-300 overflow-x-auto rounded-b max-h-[220px] overflow-y-auto">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
                      <tr className="divide-x divide-slate-200">
                        <th className="p-1 font-normal w-24">Famille</th>
                        <th className="p-1 font-normal min-w-[150px]">Article</th>
                        <th className="p-1 font-normal text-right w-16">Qté</th>
                        <th className="p-1 font-normal text-right w-24">P. Achat</th>
                        <th className="p-1 font-normal text-center w-24">Péremption</th>
                        <th className="p-1 font-normal text-right w-28">Montant</th>
                        <th className="p-1 font-normal w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-mono">
                      {hospitLines.map(l => {
                        const isSel = l.id === hospitSelLineId;
                        return (
                          <tr 
                            key={l.id} 
                            onClick={() => {
                              setHospitSelLineId(l.id);
                              setHospitForm({ ...l });
                              setHospitIsNew(false);
                            }} 
                            className={`cursor-pointer divide-x divide-slate-200 transition-colors ${isSel ? 'bg-rose-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}
                          >
                            <td className="p-1 font-sans"><span className={`px-1 rounded text-[10px] ${isSel ? 'bg-rose-600 text-white font-medium' : 'bg-slate-200 text-slate-700'}`}>{familyLabel(l.family)}</span></td>
                            <td className="p-1 font-sans">{l.articleName}</td>
                            <td className="p-1 text-right">{l.quantity}</td>
                            <td className="p-1 text-right">{l.purchasePrice.toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-center">{l.expiryDate ? new Date(l.expiryDate).toLocaleDateString('fr-FR') : '—'}</td>
                            <td className="p-1 text-right font-bold">{l.amount.toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-center">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHospitLines(hospitLines.filter(x => x.id !== l.id));
                                  if (hospitSelLineId === l.id) {
                                    hospitNew();
                                  }
                                }} 
                                className={`cursor-pointer ${isSel ? 'text-white hover:text-red-200' : 'text-rose-600 hover:text-rose-800'}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {hospitLines.length === 0 && (
                        <tr><td colSpan={7} className="p-4 text-center text-slate-400 font-sans">Aucun article. Saisissez un article ci-dessus.</td></tr>
                      )}
                    </tbody>
                    {hospitLines.length > 0 && (
                      <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 text-slate-800 font-sans font-bold">
                        <tr>
                          <td colSpan={5} className="p-1.5 text-right text-xs">TOTAL ACHAT HOSPIT. :</td>
                          <td colSpan={2} className="p-1.5 text-right font-mono text-lg text-emerald-700">
                            {formatAr(hospitLines.reduce((s, l) => s + l.amount, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                {hospitLines.length > 0 && (
                  <button 
                    onClick={() => {
                      if (confirm('Voulez-vous vider tout le bon ?')) {
                        setHospitLines([]);
                        hospitNew();
                      }
                    }} 
                    className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-sm font-medium cursor-pointer transition"
                  >
                    Vider
                  </button>
                )}
                <button
                  onClick={validateHospitPurchase}
                  disabled={hospitLines.length === 0 || !hospitSupplier.trim() || !hospitInvoiceRef.trim()}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-40 cursor-pointer flex items-center gap-2 shadow transition"
                >
                  <Check className="w-4 h-4" /> Valider cet Achat Hospitalisation
                </button>
              </div>
            </div>
          )}

          {/* ACHATS BLOC - SAGE FORM */}
          {tab === 'achats_bloc' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h4 className="font-bold text-blue-800 flex items-center gap-2 mb-3">
                  <PackagePlus className="w-5 h-5 text-blue-600" /> Saisie Sage — Achats Bloc Opératoire
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">👤 Fournisseur *</label>
                    <input 
                      type="text" 
                      value={blocSupplier} 
                      onChange={e => setBlocSupplier(e.target.value)} 
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm text-slate-800" 
                      placeholder="Nom du fournisseur..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">📄 N° BL / Facture *</label>
                    <input 
                      type="text" 
                      value={blocInvoiceRef} 
                      onChange={e => setBlocInvoiceRef(e.target.value)} 
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm text-slate-800" 
                      placeholder="Ex: BL-BLOC-2026-001..."
                    />
                  </div>
                </div>
              </div>

              {/* Sage Line Editor - Bloc */}
              <div className="bg-[#f4f4f4] border border-slate-300 rounded text-xs select-none p-1">
                <div className="bg-slate-100 border-b border-slate-300 p-2 m-1.5 mb-0 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-1.5 font-sans">
                    <div className="flex-1 min-w-[150px] relative">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Article (↑↓ Entrée)</label>
                      <input
                        ref={blocSearchRef}
                        type="text"
                        value={blocForm.articleName && !blocSearch ? blocForm.articleName : blocSearch}
                        onChange={e => {
                          setBlocSearch(e.target.value);
                          setBlocSearchIdx(0);
                          if (blocForm.articleName && e.target.value !== blocForm.articleName) {
                            setBlocForm(prev => ({ ...prev, articleName: '', articleId: '' }));
                          }
                        }}
                        onKeyDown={blocArtKeyDown}
                        className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 text-slate-800"
                        placeholder="🔍 Saisir article à acheter (Bloc)..."
                      />
                      {blocSearch.length >= 1 && blocFiltered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                          {blocFiltered.map((a, idx) => (
                            <div
                              key={a.id}
                              onClick={() => blocSelectArticle(a.id)}
                              className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b border-slate-100 ${idx === blocSearchIdx ? 'bg-blue-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}
                            >
                              <span>[{familyLabel(a.family)}] {a.name}</span>
                              <span className={`font-mono ${idx === blocSearchIdx ? 'text-white' : 'text-slate-500'}`}>Stock: {a.stockCentral}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Famille</label>
                      <input
                        readOnly
                        value={familyLabel(blocForm.family as any) || ''}
                        className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-600 truncate font-sans"
                      />
                    </div>

                    <div className="w-20">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quantité</label>
                      <input
                        id="bloc-qty-input"
                        type="number"
                        min={1}
                        value={blocForm.quantity}
                        onChange={e => setBlocForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); blocSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>

                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">P. Achat Unitaire</label>
                      <input
                        type="number"
                        min={0}
                        value={blocForm.purchasePrice}
                        onChange={e => setBlocForm(prev => ({ ...prev, purchasePrice: parseInt(e.target.value) || 0 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); blocSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>

                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Date Péremption</label>
                      <input
                        type="date"
                        value={blocForm.expiryDate}
                        onChange={e => setBlocForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); blocSaveLine(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>

                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Montant Total</label>
                      <input
                        readOnly
                        value={formatAr(blocForm.quantity * blocForm.purchasePrice)}
                        className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono font-bold text-slate-700"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-1.5 mt-2">
                    <button
                      onClick={blocNew}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 transition cursor-pointer text-xs font-medium"
                    >
                      <Plus className="h-3.5 w-3.5 text-slate-500" /> Nouveau
                    </button>
                    <button
                      onClick={blocDeleteLine}
                      disabled={!blocSelLineId}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 disabled:opacity-40 transition cursor-pointer text-xs font-medium"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-blue-600" /> Supprimer
                    </button>
                    <button
                      onClick={blocSaveLine}
                      disabled={!blocForm.articleName}
                      className="flex items-center gap-1 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white border border-blue-600 rounded shadow-sm font-semibold disabled:opacity-40 transition cursor-pointer text-xs"
                    >
                      <Save className="h-3.5 w-3.5" /> Enregistrer
                    </button>
                  </div>
                </div>

                {/* Grid Table */}
                <div className="bg-white mx-1.5 mb-1.5 border-t border-slate-300 overflow-x-auto rounded-b max-h-[220px] overflow-y-auto">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
                      <tr className="divide-x divide-slate-200">
                        <th className="p-1 font-normal w-24">Famille</th>
                        <th className="p-1 font-normal min-w-[150px]">Article</th>
                        <th className="p-1 font-normal text-right w-16">Qté</th>
                        <th className="p-1 font-normal text-right w-24">P. Achat</th>
                        <th className="p-1 font-normal text-center w-24">Péremption</th>
                        <th className="p-1 font-normal text-right w-28">Montant</th>
                        <th className="p-1 font-normal w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-mono">
                      {blocLines.map(l => {
                        const isSel = l.id === blocSelLineId;
                        return (
                          <tr 
                            key={l.id} 
                            onClick={() => {
                              setBlocSelLineId(l.id);
                              setBlocForm({ ...l });
                              setBlocIsNew(false);
                            }} 
                            className={`cursor-pointer divide-x divide-slate-200 transition-colors ${isSel ? 'bg-blue-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}
                          >
                            <td className="p-1 font-sans"><span className={`px-1 rounded text-[10px] ${isSel ? 'bg-blue-600 text-white font-medium' : 'bg-slate-200 text-slate-700'}`}>{familyLabel(l.family)}</span></td>
                            <td className="p-1 font-sans">{l.articleName}</td>
                            <td className="p-1 text-right">{l.quantity}</td>
                            <td className="p-1 text-right">{l.purchasePrice.toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-center">{l.expiryDate ? new Date(l.expiryDate).toLocaleDateString('fr-FR') : '—'}</td>
                            <td className="p-1 text-right font-bold">{l.amount.toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-center">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setBlocLines(blocLines.filter(x => x.id !== l.id));
                                  if (blocSelLineId === l.id) {
                                    blocNew();
                                  }
                                }} 
                                className={`cursor-pointer ${isSel ? 'text-white hover:text-red-200' : 'text-blue-600 hover:text-blue-800'}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {blocLines.length === 0 && (
                        <tr><td colSpan={7} className="p-4 text-center text-slate-400 font-sans">Aucun article. Saisissez un article ci-dessus.</td></tr>
                      )}
                    </tbody>
                    {blocLines.length > 0 && (
                      <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 text-slate-800 font-sans font-bold">
                        <tr>
                          <td colSpan={5} className="p-1.5 text-right text-xs">TOTAL ACHAT BLOC :</td>
                          <td colSpan={2} className="p-1.5 text-right font-mono text-lg text-emerald-700">
                            {formatAr(blocLines.reduce((s, l) => s + l.amount, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                {blocLines.length > 0 && (
                  <button 
                    onClick={() => {
                      if (confirm('Voulez-vous vider tout le bon ?')) {
                        setBlocLines([]);
                        blocNew();
                      }
                    }} 
                    className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-sm font-medium cursor-pointer transition"
                  >
                    Vider
                  </button>
                )}
                <button
                  onClick={validateBlocPurchase}
                  disabled={blocLines.length === 0 || !blocSupplier.trim() || !blocInvoiceRef.trim()}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-40 cursor-pointer flex items-center gap-2 shadow transition"
                >
                  <Check className="w-4 h-4" /> Valider cet Achat Bloc
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
