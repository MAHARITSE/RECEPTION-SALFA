import { useRef, useState } from 'react';
import type { AppState } from '../store';
import { formatAr, roundTo2, labCategoryLabel, paidPrescriptionsForConsultation, safeInvoiceItemDescriptions } from '../store';
import type { LabRequest, Consultation, Invoice, HbRecord } from '../types';
import { printDossierTicket, printLabResultTicket } from '../utils/printTicket';
import {
  ArrowLeft, Printer, Search, FileText, FlaskConical, Stethoscope,
  Receipt, AlertTriangle, Droplets, Pill, Clock, Calendar, Activity,
  ChevronDown, ChevronUp, Filter, CheckCircle2,
} from 'lucide-react';

interface Props {
  state: AppState;
  patientId?: string | null;
  onBack?: () => void;
}

type DispLab = { lr: LabRequest; doctorName: string; consultationId?: string };
type Tab = 'timeline' | 'consultations' | 'analyses' | 'factures';

const statusCfg: Record<string, { label: string; bg: string; text: string }> = {
  registered: { label: 'Enregistré', bg: 'bg-slate-200', text: 'text-slate-700' },
  waiting_consultation: { label: '⏳ Attente', bg: 'bg-amber-200', text: 'text-amber-800' },
  in_consultation: { label: '🩺 Consult.', bg: 'bg-blue-200', text: 'text-blue-800' },
  consulted_awaiting_payment: { label: '💰 À payer', bg: 'bg-orange-200', text: 'text-orange-800' },
  invoice_paid: { label: '✅ Payé', bg: 'bg-green-200', text: 'text-green-800' },
  medications_delivered: { label: '💊 Délivré', bg: 'bg-emerald-200', text: 'text-emerald-800' },
  analyses_pending: { label: '🧪 Analyse', bg: 'bg-cyan-200', text: 'text-cyan-800' },
  analyses_complete: { label: '🧪 Résultats', bg: 'bg-teal-200', text: 'text-teal-800' },
  completed: { label: '✅ Terminé', bg: 'bg-emerald-200', text: 'text-emerald-800' },
};

export default function ModuleDossierMedical({ state, patientId, onBack }: Props) {
  const [localId, setLocalId] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('timeline');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'consultations' | 'prescriptions' | 'analyses' | 'factures'>('all');
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null);
  const lastRowClickRef = useRef<{ patientId: string; timestamp: number } | null>(null);
  // Ne jamais rendre une donnée clinique si le composant est appelé hors du parcours médecin / administrateur.
  if (state.currentUser?.role !== 'doctor' && state.currentUser?.role !== 'admin') return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">Accès refusé : le dossier médical est réservé aux médecins et administrateurs.</div>;

  const pid = patientId ?? localId;
  const patient = state.patients.find((p) => p.id === pid) || null;

  const consultations = pid
    ? state.consultations.filter((c) => c.patientId === pid).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];
  const invoices = pid
    ? state.invoices.filter((i) => i.patientId === pid).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];
  const journey = pid
    ? state.journey.filter((j) => j.patientId === pid)
    : [];

  const seenDossierLabIds = new Set<string>();
  const rawDossierLabs = pid
    ? [
        ...consultations.flatMap((c) =>
          c.labRequests.map((lr) => ({ lr, doctorName: c.doctorName, consultationId: c.id })),
        ),
        ...state.labRequests
          .filter((l) => l.patientId === pid)
          .map((lr) => ({
            lr,
            doctorName: state.users.find((u) => u.id === lr.requestedBy)?.name || '',
            consultationId: lr.consultationId,
          })),
      ]
    : [];

  const allLabs: DispLab[] = [];
  for (const item of rawDossierLabs) {
    if (!seenDossierLabIds.has(item.lr.id)) {
      seenDossierLabIds.add(item.lr.id);
      allLabs.push(item);
    }
  }
  allLabs.sort((a, b) => {
    const da = new Date(a.lr.completedAt || a.lr.requestedAt || 0).getTime();
    const db = new Date(b.lr.completedAt || b.lr.requestedAt || 0).getTime();
    return db - da;
  });

  // ---- Unified Visit Timeline Encounters Construction ----
  const usedLabIds = new Set<string>();
  const usedInvoiceIds = new Set<string>();

  interface UnifiedEncounter {
    id: string;
    timestamp: number;
    dateFormatted: string;
    timeFormatted: string;
    type: 'visit' | 'lab' | 'invoice' | 'hospitalization';
    title: string;
    doctorName?: string;
    isEmergency?: boolean;
    consultation?: Consultation;
    prescriptions: any[];
    labs: DispLab[];
    invoice?: Invoice;
    hbRecord?: HbRecord;
  }

  const encounters: UnifiedEncounter[] = [];

  consultations.forEach((c) => {
    const d = new Date(c.date);
    const prescr = paidPrescriptionsForConsultation(state, c);

    const consultLabs = allLabs.filter((item) => {
      const isDirectMatch = item.lr.consultationId === c.id;
      const isDateMatch = !item.lr.consultationId && item.lr.requestedAt && new Date(item.lr.requestedAt).toDateString() === d.toDateString();
      if (isDirectMatch || isDateMatch) {
        usedLabIds.add(item.lr.id);
        return true;
      }
      return false;
    });

    const consultInvoice = invoices.find((inv) => {
      if (inv.consultationId === c.id) {
        usedInvoiceIds.add(inv.id);
        return true;
      }
      return false;
    });

    encounters.push({
      id: `visit-${c.id}`,
      timestamp: d.getTime(),
      dateFormatted: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
      timeFormatted: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      type: 'visit',
      title: c.visitReason ? `Visite Médicale : ${c.visitReason}` : `Consultation avec Dr. ${c.doctorName}`,
      doctorName: c.doctorName,
      isEmergency: c.isEmergency,
      consultation: c,
      prescriptions: prescr,
      labs: consultLabs,
      invoice: consultInvoice,
    });
  });

  // Standalone Labs
  allLabs.forEach((item) => {
    if (!usedLabIds.has(item.lr.id)) {
      const lr = item.lr;
      const t = new Date(lr.completedAt || lr.requestedAt || Date.now()).getTime();
      const d = new Date(t);
      encounters.push({
        id: `lab-single-${lr.id}`,
        timestamp: t,
        dateFormatted: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
        timeFormatted: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type: 'lab',
        title: `Examen de Laboratoire : ${lr.examType}`,
        doctorName: item.doctorName,
        prescriptions: [],
        labs: [item],
      });
    }
  });

  // Standalone Invoices
  invoices.forEach((inv) => {
    if (!usedInvoiceIds.has(inv.id)) {
      const t = new Date(inv.paidAt || inv.createdAt).getTime();
      const d = new Date(t);
      encounters.push({
        id: `inv-single-${inv.id}`,
        timestamp: t,
        dateFormatted: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
        timeFormatted: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type: 'invoice',
        title: `Facture directe n° ${inv.id.slice(0, 8).toUpperCase()}`,
        prescriptions: [],
        labs: [],
        invoice: inv,
      });
    }
  });

  // Hospitalizations
  (state.hbRecords || []).filter(r => r.patientId === pid).forEach((rec) => {
    const t = new Date(rec.openedAt || Date.now()).getTime();
    const d = new Date(t);
    encounters.push({
      id: `hb-${rec.id}`,
      timestamp: t,
      dateFormatted: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
      timeFormatted: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      type: 'hospitalization',
      title: `Séjour ${rec.type === 'hospit' ? 'Hospitalisation' : 'Intervention Bloc'}`,
      prescriptions: [],
      labs: [],
      hbRecord: rec,
    });
  });

  encounters.sort((a, b) => b.timestamp - a.timestamp);

  const filteredTimeline = encounters.filter((item) => {
    if (timelineFilter === 'all') return true;
    if (timelineFilter === 'consultations') return item.isEmergency || item.type === 'visit';
    if (timelineFilter === 'prescriptions') return item.prescriptions.length > 0;
    if (timelineFilter === 'analyses') return item.labs.length > 0;
    if (timelineFilter === 'factures') return !!item.invoice;
    return true;
  });

  const totalPrescriptionsCount = consultations.reduce((acc, c) => acc + paidPrescriptionsForConsultation(state, c).length, 0);

  const openDossier = (id: string) => {
    setSelectedListId(id);
    setLocalId(id);
    setTab('timeline');
  };

  const handlePatientRowClick = (id: string) => {
    const now = Date.now();
    const previous = lastRowClickRef.current;
    setSelectedListId(id);

    // Sécurité : certains environnements n'émettent pas toujours `onDoubleClick`
    // sur les lignes de tableau. On détecte donc aussi 2 clics rapprochés
    // sur le même patient pour garantir l'ouverture du dossier.
    if (previous?.patientId === id && now - previous.timestamp <= 500) {
      lastRowClickRef.current = null;
      openDossier(id);
      return;
    }

    lastRowClickRef.current = { patientId: id, timestamp: now };
  };

  const handleBack = () => {
    if (!patientId && localId) {
      setLocalId(null);
      setSelectedListId(null);
      return;
    }
    onBack?.();
  };

  // ---- Vue liste (aucun patient sélectionné) ----
  if (!patient) {
    const q = search.toLowerCase();
    const list = state.patients
      .filter((p) => !p.blacklisted)
      .filter(
        (p) =>
          !q ||
          p.firstName.toLowerCase().includes(q) ||
          p.lastName.toLowerCase().includes(q) ||
          p.dossier.toLowerCase().includes(q),
      )
      .sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());
    return (
      <div className="space-y-4 select-none">
        <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-700" /> Dossiers Médicaux
            </h2>
            <p className="text-sm text-slate-500">Gestion totale du dossier : identité, parcours, historique et analyses.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold">
              💡 Double-clic sur une ligne → ouvrir le dossier
            </span>
            {onBack && (
              <button onClick={onBack} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm flex items-center gap-2 cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> Retour
              </button>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="relative max-w-md mb-3">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Rechercher: Nom, Dossier, Matricule..."
            />
          </div>
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Dossier</th>
                  <th className="p-2 text-left">Nom et Prénom</th>
                  <th className="p-2 text-center">Sexe</th>
                  <th className="p-2 text-left">Âge</th>
                  <th className="p-2 text-left">Société</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const isSelected = selectedListId === p.id;
                  return (
                    <tr
                      key={p.id}
                      tabIndex={0}
                      title="Double-cliquez pour ouvrir le dossier médical"
                      onClick={() => handlePatientRowClick(p.id)}
                      onDoubleClick={() => openDossier(p.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') openDossier(p.id); }}
                      className={`border-b border-slate-100 cursor-pointer outline-none transition-colors ${
                        isSelected ? 'bg-[#cce5ff] hover:bg-[#b8daff] ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50 focus:bg-slate-50'
                      }`}
                    >
                      <td className="p-2 font-mono font-bold text-blue-700">{p.dossier}</td>
                      <td className="p-2 font-medium uppercase">{p.lastName} {p.firstName}</td>
                      <td className="p-2 text-center">
                        <span className={`inline-block w-6 h-6 rounded-full font-bold text-xs leading-6 ${p.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>{p.gender}</span>
                      </td>
                      <td className="p-2">{p.age}</td>
                      <td className="p-2">{p.company || p.insureName || '—'}</td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-400">Aucun patient trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const st = statusCfg[patient.status] || { label: patient.status, bg: 'bg-slate-100', text: 'text-slate-600' };
  const vitals = patient.vitalSigns || consultations[0]?.vitalSigns;
  const labCount = allLabs.length;
  const abnormalLabs = allLabs.filter((d) => (d.lr.results || []).some((r) => r.isAbnormal)).length;

  return (
    <div className="space-y-4">
      {/* En-tête identité */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white p-4 flex items-start justify-between">
          <div>
            <div className="text-2xl font-bold uppercase flex items-center gap-2">
              {patient.lastName} {patient.firstName}
              <span className={`text-xs px-2 py-0.5 rounded ${st.bg} ${st.text} bg-opacity-90`}>{st.label}</span>
            </div>
            <div className="text-sm text-slate-200 mt-1 font-mono">
              Dossier: {patient.dossier} · {patient.gender === 'M' ? 'Homme' : 'Femme'} · {patient.age}
              {patient.bloodGroup ? ` · Groupe ${patient.bloodGroup}` : ''}
            </div>
            <div className="text-xs text-slate-300 mt-0.5">
              {patient.address} · {patient.contact}
              {patient.company ? ` · 🏢 ${patient.company}` : ''}
              {patient.company ? ` · Société: ${patient.company}` : (patient.insureName ? ` · Société: ${patient.insureName}` : '')}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const printableConsultations = consultations.map((c) => ({
                  ...c,
                  prescriptions: paidPrescriptionsForConsultation(state, c),
                }));
                const printableInvoices = invoices.map((inv) => ({
                  ...inv,
                  items: inv.items.map((it, idx) => ({ ...it, description: safeInvoiceItemDescriptions(inv)[idx] })),
                }));
                printDossierTicket(state.ticketSettings, patient, { consultations: printableConsultations, labRequests: allLabs.map((d) => d.lr), invoices: printableInvoices, journey });
              }}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Imprimer le dossier
            </button>
            {(onBack || (!patientId && localId)) && (
              <button onClick={handleBack} className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm flex items-center gap-2 cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> {!patientId && localId ? 'Retour à la liste' : 'Retour'}
              </button>
            )}
          </div>
        </div>

        {/* Bandeau allergies / antécédents */}
        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border-b">
          {patient.allergies.length > 0 && (
            <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Allergies : {patient.allergies.join(', ')}
            </span>
          )}
          {patient.antecedents.length > 0 && (
            <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-semibold">Antécédents : {patient.antecedents.join(', ')}</span>
          )}
          {patient.chronicTreatments.length > 0 && (
            <span className="px-2 py-1 bg-sky-100 text-sky-800 rounded text-xs font-semibold flex items-center gap-1">
              <Pill className="w-3 h-3" /> Traitements : {patient.chronicTreatments.join(', ')}
            </span>


          )}
          {patient.bloodGroup && (
            <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded text-xs font-semibold flex items-center gap-1">
              <Droplets className="w-3 h-3" /> {patient.bloodGroup}
            </span>
          )}
        </div>

        {/* Constantes */}
        {vitals && (vitals.temperature || vitals.weight) && (
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 p-3 text-center">
            {[
              { l: 'T°C', v: vitals.temperature },
              { l: 'PAS', v: vitals.bloodPressureSystolic },
              { l: 'PAD', v: vitals.bloodPressureDiastolic },
              { l: 'FC', v: vitals.heartRate },
              { l: 'SpO2', v: vitals.oxygenSaturation },
              { l: 'Poids', v: vitals.weight ? vitals.weight + 'kg' : '' },
              { l: 'Taille', v: vitals.height ? vitals.height + 'cm' : '' },
            ].map((x) => (
              <div key={x.l} className="bg-slate-50 rounded-lg p-2">
                <div className="text-[10px] text-slate-500">{x.l}</div>
                <div className="font-bold text-slate-700">{x.v || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {[
            { key: 'timeline' as Tab, icon: <Clock className="w-4 h-4" />, label: `Chronologie (${encounters.length})` },
            { key: 'consultations' as Tab, icon: <Stethoscope className="w-4 h-4" />, label: `Consult. (${consultations.length})` },
            { key: 'analyses' as Tab, icon: <FlaskConical className="w-4 h-4" />, label: `Analyses (${labCount})` },
            { key: 'factures' as Tab, icon: <Receipt className="w-4 h-4" />, label: `Factures (${invoices.length})` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.key ? 'border-indigo-600 text-indigo-900 bg-indigo-50/50 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6">
          {/* CHRONOLOGIE / VISIT TIMELINE */}
          {tab === 'timeline' && (
            <div className="space-y-6">
              {/* Filter Toolbar without duplicating tabs */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-slate-800 text-sm">Visites & rencontres médicales</span>
                  <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-semibold">
                    {encounters.length}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'all', label: `Toutes (${encounters.length})` },
                    { id: 'consultations', label: `🚨 Urgences (${encounters.filter(e => e.isEmergency).length})` },
                    { id: 'prescriptions', label: `💊 Ordonnances (${encounters.filter(e => e.prescriptions.length > 0).length})` },
                    { id: 'analyses', label: `🧪 Examens (${encounters.filter(e => e.labs.length > 0).length})` },
                    { id: 'factures', label: `💳 Facturées (${encounters.filter(e => !!e.invoice).length})` },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setTimelineFilter(f.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        timelineFilter === f.id
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline Container */}
              {filteredTimeline.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300 p-8">
                  <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 font-semibold text-base">Aucune visite correspondant aux filtres</p>
                  <p className="text-slate-400 text-xs mt-1">Sélectionnez "Toutes" ou modifiez vos critères de recherche.</p>
                </div>
              ) : (
                <div className="relative pl-6 sm:pl-8 border-l-2 border-indigo-200 ml-4 sm:ml-6 space-y-5 py-2">
                  {filteredTimeline.map((item) => {
                    const isExpanded = expandedTimelineId === item.id;
                    return (
                      <div key={item.id} className="relative group">
                        {/* Timeline Node Bullet Icon */}
                        <div
                          className={`absolute -left-[31px] sm:-left-[39px] top-3.5 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-white shadow-md ${
                            item.isEmergency
                              ? 'bg-red-600 text-white'
                              : item.type === 'visit'
                              ? 'bg-emerald-600 text-white'
                              : item.type === 'lab'
                              ? 'bg-cyan-600 text-white'
                              : item.type === 'invoice'
                              ? 'bg-amber-600 text-white'
                              : 'bg-indigo-600 text-white'
                          }`}
                        >
                          {item.isEmergency ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : item.type === 'visit' ? (
                            <Stethoscope className="w-4 h-4" />
                          ) : item.type === 'lab' ? (
                            <FlaskConical className="w-4 h-4" />
                          ) : item.type === 'invoice' ? (
                            <Receipt className="w-4 h-4" />
                          ) : (
                            <Activity className="w-4 h-4" />
                          )}
                        </div>

                        {/* Event Card */}
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden">
                          {/* Card Header */}
                          <div
                            onClick={() => setExpandedTimelineId(isExpanded ? null : item.id)}
                            className="p-4 flex items-center justify-between cursor-pointer select-none bg-gradient-to-r from-slate-50/80 to-white hover:bg-slate-50 transition"
                          >
                            <div className="flex-1 min-w-0 pr-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  {item.type === 'visit'
                                    ? 'Visite Médicale'
                                    : item.type === 'lab'
                                    ? 'Examen Labo Seul'
                                    : item.type === 'invoice'
                                    ? 'Facturation Seule'
                                    : 'Hospitalisation / Bloc'}
                                </span>
                                <span className="text-xs font-mono font-medium text-slate-400">
                                  • {item.dateFormatted} à {item.timeFormatted}
                                </span>
                              </div>
                              <div className="text-base font-bold text-slate-800 mt-0.5 truncate">
                                {item.title}
                              </div>

                              {/* Summary Badges for this Visit Encounter */}
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {item.isEmergency && (
                                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                    🚨 Urgence
                                  </span>
                                )}
                                {item.consultation?.diagnosis && (
                                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                    🩺 {item.consultation.diagnosis}
                                  </span>
                                )}
                                {item.prescriptions.length > 0 && (
                                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800">
                                    💊 Ordonnance ({item.prescriptions.length} méd.)
                                  </span>
                                )}
                                {item.labs.length > 0 && (
                                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-800">
                                    🧪 Analyses ({item.labs.length})
                                  </span>
                                )}
                                {item.invoice && (
                                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                    💳 Facture ({formatAr(item.invoice.patientCharge)})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-slate-400">
                              <span className="text-xs text-slate-500 font-semibold hidden sm:inline">
                                {isExpanded ? 'Réduire' : 'Détails'}
                              </span>
                              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </div>
                          </div>

                          {/* Expanded Card Body */}
                          {isExpanded && (
                            <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 space-y-4 text-sm animate-in fade-in duration-150">
                              {/* 1. Consultation info */}
                              {item.consultation && (
                                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center justify-between">
                                    <span>🩺 Consultation Médicale</span>
                                    {item.doctorName && <span className="text-slate-600 font-medium">Dr. {item.doctorName}</span>}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="text-slate-500 font-semibold">Motif :</span>{' '}
                                      <span className="text-slate-800 font-bold">{item.consultation.visitReason || 'Non précisé'}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 font-semibold">Diagnostic :</span>{' '}
                                      <span className="text-emerald-700 font-bold">{item.consultation.diagnosis || 'Non renseigné'}</span>
                                    </div>
                                  </div>
                                  {item.consultation.notes && (
                                    <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-xs text-amber-900">
                                      <strong>Notes du médecin :</strong> {item.consultation.notes}
                                    </div>
                                  )}
                                  {item.consultation.vitalSigns &&
                                    (item.consultation.vitalSigns.temperature ||
                                      item.consultation.vitalSigns.weight ||
                                      item.consultation.vitalSigns.bloodPressureSystolic) && (
                                      <div className="flex flex-wrap gap-2 pt-1">
                                        {item.consultation.vitalSigns.temperature && (
                                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                                            🌡️ T°: <strong>{item.consultation.vitalSigns.temperature}°C</strong>
                                          </span>
                                        )}
                                        {item.consultation.vitalSigns.bloodPressureSystolic && (
                                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                                            🫀 TA: <strong>{item.consultation.vitalSigns.bloodPressureSystolic}/{item.consultation.vitalSigns.bloodPressureDiastolic}</strong>
                                          </span>
                                        )}
                                        {item.consultation.vitalSigns.heartRate && (
                                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                                            💓 FC: <strong>{item.consultation.vitalSigns.heartRate} bpm</strong>
                                          </span>
                                        )}
                                        {item.consultation.vitalSigns.oxygenSaturation && (
                                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                                            🫁 SpO2: <strong>{item.consultation.vitalSigns.oxygenSaturation}%</strong>
                                          </span>
                                        )}
                                        {item.consultation.vitalSigns.weight && (
                                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                                            ⚖️ Poids: <strong>{item.consultation.vitalSigns.weight} kg</strong>
                                          </span>
                                        )}
                                      </div>
                                    )}
                                </div>
                              )}

                              {/* 2. Prescriptions */}
                              {item.prescriptions.length > 0 && (
                                <div className="bg-white p-3.5 rounded-xl border border-purple-200 space-y-2">
                                  <div className="text-xs font-bold text-purple-900 uppercase tracking-wide">
                                    💊 Ordonnance Prescrite ({item.prescriptions.length} médicament{item.prescriptions.length > 1 ? 's' : ''})
                                  </div>
                                  <div className="divide-y border rounded-lg overflow-hidden bg-purple-50/20">
                                    {item.prescriptions.map((p: any) => (
                                      <div key={p.id} className="p-2.5 flex items-start justify-between gap-3 text-xs">
                                        <div>
                                          <div className="font-bold text-slate-800">{p.articleName}</div>
                                          <div className="text-slate-600">
                                            Posologie : <strong className="text-purple-700">{p.posology || 'Selon prescription'}</strong>{' '}
                                            {p.duration ? `· Durée : ${p.duration}` : ''}
                                          </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <div className="font-mono font-bold">×{p.quantity} ({formatAr(p.unitPrice * p.quantity)})</div>
                                          <span
                                            className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 ${
                                              p.delivered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                            }`}
                                          >
                                            {p.delivered ? '✓ Délivré' : 'À délivrer'}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 3. Labs */}
                              {item.labs.length > 0 && (
                                <div className="bg-white p-3.5 rounded-xl border border-cyan-200 space-y-2">
                                  <div className="text-xs font-bold text-cyan-900 uppercase tracking-wide">
                                    🧪 Analyses de Laboratoire ({item.labs.length})
                                  </div>
                                  {item.labs.map((labDisp) => {
                                    const lr = labDisp.lr;
                                    const results = lr.results || [];
                                    return (
                                      <div key={lr.id} className="border rounded-lg overflow-hidden text-xs bg-slate-50/50 p-2.5 space-y-2">
                                        <div className="flex justify-between items-center">
                                          <div className="font-bold text-slate-800">
                                            {lr.examType} <span className="text-slate-400 font-normal">({labCategoryLabel(lr.category || 'autre')})</span>
                                          </div>
                                          {lr.status === 'completed' && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                printLabResultTicket(
                                                  state.ticketSettings,
                                                  patient,
                                                  lr,
                                                  labDisp.doctorName,
                                                  labCategoryLabel(lr.category || 'autre')
                                                );
                                              }}
                                              className="px-2.5 py-1 bg-cyan-700 hover:bg-cyan-800 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-sm cursor-pointer"
                                            >
                                              <Printer className="w-3 h-3" /> Imprimer
                                            </button>
                                          )}
                                        </div>
                                        {results.length > 0 ? (
                                          <table className="w-full bg-white rounded border">
                                            <thead className="bg-cyan-50 text-slate-600 text-[11px]">
                                              <tr>
                                                <th className="p-1.5 text-left">Paramètre</th>
                                                <th className="p-1.5 text-center">Résultat</th>
                                                <th className="p-1.5 text-center">Normes</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {results.map((r: any) => (
                                                <tr key={r.parameter} className={`border-t ${r.isAbnormal ? 'bg-red-50 text-red-800 font-bold' : ''}`}>
                                                  <td className="p-1.5">{r.parameter}</td>
                                                  <td className="p-1.5 text-center font-mono">{r.value} {r.unit}</td>
                                                  <td className="p-1.5 text-center font-mono text-slate-500">
                                                    {r.normalMin} - {r.normalMax} {r.unit}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        ) : (
                                          <div className="text-slate-400 italic text-[11px]">Prélèvement enregistré ({lr.status})</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* 4. Invoice */}
                              {item.invoice && (
                                <div className="bg-white p-3.5 rounded-xl border border-amber-200 space-y-2">
                                  <div className="text-xs font-bold text-amber-900 uppercase tracking-wide flex justify-between">
                                    <span>💳 Facturation & Règlement</span>
                                    <span className="text-emerald-700 font-mono font-bold text-sm">{formatAr(item.invoice.patientCharge)}</span>
                                  </div>
                                  <div className="divide-y border rounded-lg overflow-hidden bg-slate-50 text-xs">
                                    {item.invoice.items.map((it: any, idx: number) => (
                                      <div key={idx} className="p-2 flex justify-between">
                                        <span>{safeInvoiceItemDescriptions(item.invoice!)[idx] || it.type}</span>
                                        <span className="font-mono font-bold">{formatAr(it.unitPrice * (it.quantity || 1))}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 5. Hospitalization */}
                              {item.hbRecord && (
                                <div className="bg-white p-3.5 rounded-xl border border-indigo-200 space-y-2 text-xs">
                                  <div className="font-bold text-indigo-900 uppercase tracking-wide">🏥 Dossier Hospitalisation / Bloc</div>
                                  <div className="p-2.5 bg-indigo-50/50 rounded-lg space-y-1">
                                    <div>Type : <strong className="text-slate-800">{item.hbRecord.type === 'hospit' ? 'Hospitalisation' : 'Bloc Opératoire'}</strong></div>
                                    <div>Lignes d'actes : <strong className="text-slate-800">{item.hbRecord.lines?.length || 0} acte(s)</strong></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* CONSULTATIONS */}
          {tab === 'consultations' && (
            <div className="space-y-3">
              {consultations.length === 0 && <p className="text-slate-400 text-sm text-center py-6">Aucune consultation.</p>}
              {consultations.map((c) => (
                <div key={c.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-3 bg-emerald-50 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{c.doctorName}</div>
                      <div className="text-xs text-slate-500">{new Date(c.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    </div>
                    {c.isEmergency && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-bold">🚨 Urgence</span>}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                    {/* Détails de la consultation */}
                    <div className="p-3 text-sm space-y-1">
                      {c.visitReason && <div><span className="font-medium text-slate-600">Motif :</span> {c.visitReason}</div>}
                      <div><span className="font-medium text-slate-600">Diagnostic :</span> {c.diagnosis}</div>
                      {c.notes && <div><span className="font-medium text-slate-600">Notes :</span> {c.notes}</div>}
                      {state.currentUser?.role === 'doctor' && (
                        <div className="mt-2 pt-2 border-t text-xs">
                          <button className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700" onClick={() => alert('Ajout observation médecin (simulé) — dossier mis à jour.')}>+ Ajouter observation médecin</button>
                        </div>
                      )}
                    </div>
                    {/* Colonne prestations : articles + quantité + posologie */}
                    <div className="bg-slate-50 p-3">
                      {(() => {
                        const hasHiddenPrescriptions = c.prescriptions.length > 0 && paidPrescriptionsForConsultation(state, c).length === 0;
                        const prescriptions = paidPrescriptionsForConsultation(state, c).map((p) => ({
                          id: p.id,
                          name: p.articleName,
                          info: [p.posology, p.duration, p.instructions].filter(Boolean).join(' · ') || undefined,
                          qty: p.quantity,
                          amount: roundTo2(p.unitPrice * p.quantity * (1 - p.discount / 100)),
                          sTxt: p.delivered ? '✓ délivré' : 'à délivrer',
                          sCol: p.delivered ? 'text-emerald-600' : 'text-amber-600',
                        }));
                        const prest = [
                          ...c.labRequests.map((l) => ({ id: l.id, name: l.examType, info: l.sampleType, qty: 1, sTxt: l.status === 'completed' ? '✓ fait' : 'en attente', sCol: l.status === 'completed' ? 'text-emerald-600' : 'text-amber-600' })),
                          ...(c.echoRequests || []).map((e) => ({ id: e.id, name: e.examType, info: e.notes, qty: 1, sTxt: e.status === 'completed' ? '✓ fait' : 'en attente', sCol: e.status === 'completed' ? 'text-emerald-600' : 'text-amber-600' })),
                        ];
                        if (c.hospitalizeRequested) prest.push({ id: `hosp-${c.id}`, name: 'Hospitalisation demandée', info: undefined, qty: 1, sTxt: 'Demande', sCol: 'text-blue-600' });
                        if (c.surgeryRequested) prest.push({ id: `surg-${c.id}`, name: 'Intervention bloc demandée', info: undefined, qty: 1, sTxt: 'Demande', sCol: 'text-blue-600' });
                        const totalItems = prescriptions.length + prest.length + (hasHiddenPrescriptions ? 1 : 0);

                        return totalItems > 0 ? (
                          <div>
                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Prestations ({totalItems} acte{totalItems > 1 ? 's' : ''})</div>
                            {hasHiddenPrescriptions && (
                              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">
                                Prescription masquée — paiement non enregistré.
                              </div>
                            )}
                            {prescriptions.length > 0 && (
                              <div className="mb-3 rounded-lg border border-emerald-100 bg-white p-2">
                                <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                  <Pill className="h-3 w-3" /> Prescriptions ({prescriptions.length})
                                </div>
                                <div className="space-y-1.5">
                                  {prescriptions.map((p) => (
                                    <div key={p.id} className="flex items-start justify-between gap-2 text-xs border-b border-emerald-100 last:border-0 pb-1.5 last:pb-0">
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-slate-700">{p.name}</div>
                                        {p.info && <div className="text-[10px] text-slate-400 mt-0.5">{p.info}</div>}
                                      </div>
                                      <div className="shrink-0 text-right">
                                        <span className="font-mono font-bold text-slate-600">×{p.qty}</span>
                                        <span className="block font-mono text-[10px] text-slate-500">{formatAr(p.amount)}</span>
                                        <span className={`block text-[9px] ${p.sCol}`}>{p.sTxt}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {prest.length > 0 && (
                              <div className="space-y-1.5">
                                {prest.map((p) => (
                                  <div key={p.id} className="flex items-start justify-between gap-2 text-xs border-b border-slate-200 last:border-0 pb-1.5 last:pb-0">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-slate-700">{p.name}</div>
                                      {p.info && <div className="text-[10px] text-slate-400 mt-0.5">{p.info}</div>}
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <span className="font-mono font-bold text-slate-600">×{p.qty}</span>
                                      <span className={`block text-[9px] ${p.sCol}`}>{p.sTxt}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 italic text-center py-4">Aucune prestation</div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ANALYSES */}
          {tab === 'analyses' && (
            <div className="space-y-3">
              {labCount === 0 && <p className="text-slate-400 text-sm text-center py-6">Aucune analyse.</p>}
              {abnormalLabs > 0 && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> {abnormalLabs} analyse(s) avec résultat(s) anormal(aux).
                </div>
              )}
              {allLabs.map((d) => {
                const r = d.lr;
                const hasAbn = (r.results || []).some((x) => x.isAbnormal);
                return (
                  <div key={r.id} className={`border rounded-xl overflow-hidden ${r.status === 'completed' ? (hasAbn ? 'border-red-200' : 'border-emerald-200') : 'border-slate-200'}`}>
                    <div className={`p-3 flex items-center justify-between ${r.status === 'completed' ? (hasAbn ? 'bg-red-50' : 'bg-emerald-50') : 'bg-cyan-50'}`}>
                      <div>
                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                          {r.examType}
                          {r.urgent && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">URGENT</span>}
                          {hasAbn && r.status === 'completed' && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-bold">ANORMAL</span>}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {labCategoryLabel(r.category || 'autre')} · {r.sampleType || '—'} · Prescripteur: {d.doctorName || r.requestedBy || '—'}
                          {r.completedAt ? ` · ${new Date(r.completedAt).toLocaleDateString('fr-FR')}` : (r.requestedAt ? ` · demandé le ${new Date(r.requestedAt).toLocaleDateString('fr-FR')}` : '')}
                        </div>
                      </div>
                      {r.status === 'completed' && (
                        <button
                          onClick={() => printLabResultTicket(state.ticketSettings, patient, r, d.doctorName, labCategoryLabel(r.category || 'autre'))}
                          className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" /> Compte-rendu
                        </button>
                      )}
                    </div>
                    {r.results && (
                      <div className="p-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500">
                              <th className="text-left py-1">Paramètre</th>
                              <th className="text-center py-1">Résultat</th>
                              <th className="text-center py-1">Valeurs usuelles</th>
                              <th className="text-center py-1">État</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.results.map((res) => (
                              <tr key={res.parameter} className={res.isAbnormal ? 'bg-red-50' : ''}>
                                <td className="py-1 text-slate-700">{res.parameter}</td>
                                <td className={`py-1 text-center font-mono font-bold ${res.isAbnormal ? 'text-red-600' : 'text-emerald-600'}`}>{res.value} {res.unit}</td>
                                <td className="py-1 text-center text-xs text-slate-500">{res.normalMin} – {res.normalMax} {res.unit}</td>
                                <td className="py-1 text-center">
                                  {res.isAbnormal
                                    ? <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-bold">ANORMAL</span>
                                    : <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">Normal</span>}
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

          {/* FACTURES */}
          {tab === 'factures' && (
            <div>
              {invoices.length === 0 && <p className="text-slate-400 text-sm text-center py-6">Aucune facture.</p>}
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Réf</th>
                    <th className="p-2 text-left">Détail</th>
                    <th className="p-2 text-right">Montant</th>
                    <th className="p-2 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="border-b border-slate-100">
                      <td className="p-2 text-slate-500">{new Date(i.paidAt || i.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td className="p-2 font-mono text-xs">{i.id.slice(0, 8).toUpperCase()}</td>
                      <td className="p-2 text-xs">{safeInvoiceItemDescriptions(i).join(' ; ')}</td>
                      <td className="p-2 text-right font-mono font-bold">{formatAr(i.patientCharge)}</td>
                      <td className="p-2 text-center">
                        {i.status === 'paid'
                          ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-bold">Payée</span>
                          : <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-bold">En attente</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
