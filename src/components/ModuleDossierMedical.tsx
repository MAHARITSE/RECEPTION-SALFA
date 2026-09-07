import { useRef, useState } from 'react';
import type { AppState } from '../store';
import { labCategoryLabel, paidPrescriptionsForConsultation, safeInvoiceItemDescriptions } from '../store';
import type { LabRequest, Consultation, Invoice, HbRecord } from '../types';
import { printDossierTicket, printLabResultTicket } from '../utils/printTicket';
import {
  ArrowLeft, Printer, Search, FileText, FlaskConical, Stethoscope,
  Receipt, AlertTriangle, Droplets, Pill, Clock, Calendar, Activity,
  ChevronDown, ChevronUp,
} from 'lucide-react';

interface Props {
  state: AppState;
  patientId?: string | null;
  onBack?: () => void;
}

type DispLab = { lr: LabRequest; doctorName: string; consultationId?: string };
type Tab = 'timeline' | 'analyses';

const statusCfg: Record<string, { label: string; bg: string; text: string }> = {
  registered: { label: 'Enregistré', bg: 'bg-surface-active', text: 'text-ink' },
  waiting_consultation: { label: '⏳ Attente', bg: 'bg-amber-200 dark:bg-amber-500/25', text: 'text-amber-800 dark:text-amber-300' },
  in_consultation: { label: '🩺 Consult.', bg: 'bg-blue-200 dark:bg-cyan-500/25', text: 'text-blue-800 dark:text-cyan-300' },
  consulted_awaiting_payment: { label: '💰 À payer', bg: 'bg-orange-200 dark:bg-orange-500/25', text: 'text-orange-800 dark:text-orange-300' },
  invoice_paid: { label: '✅ Payé', bg: 'bg-green-200 dark:bg-green-500/25', text: 'text-green-800 dark:text-green-300' },
  medications_delivered: { label: '💊 Délivré', bg: 'bg-emerald-200 dark:bg-emerald-500/25', text: 'text-emerald-800 dark:text-emerald-300' },
  analyses_pending: { label: '🧪 Analyse', bg: 'bg-cyan-200 dark:bg-cyan-500/25', text: 'text-cyan-800 dark:text-cyan-300' },
  analyses_complete: { label: '🧪 Résultats', bg: 'bg-teal-200 dark:bg-teal-500/25', text: 'text-teal-800 dark:text-teal-300' },
  completed: { label: '✅ Terminé', bg: 'bg-emerald-200 dark:bg-emerald-500/25', text: 'text-emerald-800 dark:text-emerald-300' },
};

export default function ModuleDossierMedical({ state, patientId, onBack }: Props) {
  const [localId, setLocalId] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('timeline');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null);
  const lastRowClickRef = useRef<{ patientId: string; timestamp: number } | null>(null);
  // Ne jamais rendre une donnée clinique si le composant est appelé hors du parcours médecin / administrateur.
  if (state.currentUser?.role !== 'doctor' && state.currentUser?.role !== 'admin') return <div className="rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/8 p-6 text-red-800 dark:text-red-300">Accès refusé : le dossier médical est réservé aux médecins et administrateurs.</div>;

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
    // Dossier médical (réservé médecin/admin) : on montre TOUJOURS le détail
    // clinique de l'ordonnance, indépendamment de son règlement — pas besoin de
    // la règle de confidentialité réservée aux écrans Caisse/Pharmacie.
    const prescr = (c.prescriptions || []).map((p) => ({ ...p }));

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

  // Chronologie 100 % clinique : on retire les factures (financier) — ni
  // rattachées à une visite, ni en événement « Facture directe ».
  // Un filtre sur un intervalle de dates (bornes incluses) est appliqué ensuite.
  const filteredTimeline = encounters.filter((item) => {
    if (item.type === 'invoice') return false;
    if (dateFrom && item.timestamp < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
    if (dateTo && item.timestamp > new Date(`${dateTo}T23:59:59`).getTime()) return false;
    return true;
  });

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
        <div className="bg-surface rounded-xl shadow-sm border p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink-strong flex items-center gap-2">
              <FileText className="w-5 h-5 text-ink" /> Dossiers Médicaux
            </h2>
            <p className="text-sm text-ink-muted">Gestion totale du dossier : identité, parcours, historique et analyses.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex px-2 py-1 bg-amber-50 dark:bg-amber-500/8 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/25 rounded-lg text-xs font-semibold">
              💡 Double-clic sur une ligne → ouvrir le dossier
            </span>
            {onBack && (
              <button onClick={onBack} className="px-3 py-2 bg-surface-active hover:bg-line-strong rounded-lg text-sm flex items-center gap-2 cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> Retour
              </button>
            )}
          </div>
        </div>
        <div className="bg-surface rounded-xl shadow-sm border p-4">
          <div className="relative max-w-md mb-3">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-ink-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-line-strong rounded-lg outline-none focus:ring-2 focus:ring-line-control"
              placeholder="Rechercher: Nom, Dossier, Matricule..."
            />
          </div>
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover sticky top-0">
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
                      className={`border-b border-line-soft cursor-pointer outline-none transition-colors ${
                        isSelected ? 'bg-accent-soft hover:bg-accent-hover ring-1 ring-inset ring-blue-200 dark:ring-cyan-500/25' : 'hover:bg-surface-muted focus:bg-surface-muted'
                      }`}
                    >
                      <td className="p-2 font-mono font-bold text-blue-700 dark:text-cyan-400">{p.dossier}</td>
                      <td className="p-2 font-medium uppercase">{p.lastName} {p.firstName}</td>
                      <td className="p-2 text-center">
                        <span className={`inline-block w-6 h-6 rounded-full font-bold text-xs leading-6 ${p.gender === 'F' ? 'bg-pink-100 dark:bg-pink-500/15 text-pink-700 dark:text-pink-400' : 'bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400'}`}>{p.gender}</span>
                      </td>
                      <td className="p-2">{p.age}</td>
                      <td className="p-2">{p.company || p.insureName || '—'}</td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-ink-faint">Aucun patient trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const st = statusCfg[patient.status] || { label: patient.status, bg: 'bg-surface-hover', text: 'text-ink-secondary' };
  const vitals = patient.vitalSigns || consultations[0]?.vitalSigns;
  const labCount = allLabs.length;
  const abnormalLabs = allLabs.filter((d) => (d.lr.results || []).some((r) => r.isAbnormal)).length;

  return (
    <div className="space-y-4">
      {/* En-tête identité */}
      <div className="bg-surface rounded-xl shadow-sm border overflow-hidden">
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
        <div className="flex flex-wrap gap-2 p-3 bg-surface-muted border-b">
          {patient.allergies.length > 0 && (
            <span className="px-2 py-1 bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 rounded text-xs font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Allergies : {patient.allergies.join(', ')}
            </span>
          )}
          {patient.antecedents.length > 0 && (
            <span className="px-2 py-1 bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 rounded text-xs font-semibold">Antécédents : {patient.antecedents.join(', ')}</span>
          )}
          {patient.chronicTreatments.length > 0 && (
            <span className="px-2 py-1 bg-sky-100 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 rounded text-xs font-semibold flex items-center gap-1">
              <Pill className="w-3 h-3" /> Traitements : {patient.chronicTreatments.join(', ')}
            </span>


          )}
          {patient.bloodGroup && (
            <span className="px-2 py-1 bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 rounded text-xs font-semibold flex items-center gap-1">
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
              <div key={x.l} className="bg-surface-muted rounded-lg p-2">
                <div className="text-[10px] text-ink-muted">{x.l}</div>
                <div className="font-bold text-ink">{x.v || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="bg-surface rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {[
            { key: 'timeline' as Tab, icon: <Clock className="w-4 h-4" />, label: `Chronologie (${encounters.length})` },
            { key: 'analyses' as Tab, icon: <FlaskConical className="w-4 h-4" />, label: `Analyses (${labCount})` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.key ? 'border-indigo-600 text-indigo-900 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-500/4 font-bold' : 'border-transparent text-ink-muted hover:text-ink'
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
              <div className="bg-surface-muted border border-line p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-bold text-ink-strong text-sm">Visites & rencontres médicales</span>
                  <span className="text-xs bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded-full font-semibold">
                    {filteredTimeline.length}
                  </span>
                </div>

                {/* Filtre par intervalle de dates */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5 bg-surface border border-line rounded-lg px-2 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-ink-faint" />
                    <span className="font-semibold text-ink-secondary">Du</span>
                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="bg-transparent outline-none text-ink"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 bg-surface border border-line rounded-lg px-2 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-ink-faint" />
                    <span className="font-semibold text-ink-secondary">Au</span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="bg-transparent outline-none text-ink"
                    />
                  </label>
                  {(dateFrom || dateTo) && (
                    <button
                      onClick={() => { setDateFrom(''); setDateTo(''); }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/25 bg-indigo-50 dark:bg-indigo-500/8 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 transition cursor-pointer"
                    >
                      ✕ Réinitialiser
                    </button>
                  )}
                </div>
              </div>

              {/* Timeline Container */}
              {filteredTimeline.length === 0 ? (
                <div className="text-center py-12 bg-surface rounded-2xl border border-dashed border-line-strong p-8">
                  <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-ink-secondary font-semibold text-base">Aucune visite dans cet intervalle de dates</p>
                  <p className="text-ink-faint text-xs mt-1">Élargissez la période (« Du » / « Au ») ou réinitialisez le filtre.</p>
                </div>
              ) : (
                <div className="relative pl-6 sm:pl-8 border-l-2 border-indigo-200 dark:border-indigo-500/25 ml-4 sm:ml-6 space-y-5 py-2">
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
                        <div className="bg-surface border border-line rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden">
                          {/* Card Header */}
                          <div
                            onClick={() => setExpandedTimelineId(isExpanded ? null : item.id)}
                            className="p-4 flex items-center justify-between cursor-pointer select-none bg-gradient-to-r from-surface-muted/80 to-surface hover:bg-surface-muted transition"
                          >
                            <div className="flex-1 min-w-0 pr-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                                  {item.type === 'visit'
                                    ? 'Visite Médicale'
                                    : item.type === 'lab'
                                    ? 'Examen Labo Seul'
                                    : item.type === 'invoice'
                                    ? 'Facturation Seule'
                                    : 'Hospitalisation / Bloc'}
                                </span>
                                <span className="text-xs font-mono font-medium text-ink-faint">
                                  • {item.dateFormatted} à {item.timeFormatted}
                                </span>
                              </div>
                              <div className="text-base font-bold text-ink-strong mt-0.5 truncate">
                                {item.title}
                              </div>

                              {/* Summary Badges for this Visit Encounter */}
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {item.isEmergency && (
                                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400">
                                    🚨 Urgence
                                  </span>
                                )}
                                {item.consultation?.diagnosis && (
                                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
                                    🩺 {item.consultation.diagnosis}
                                  </span>
                                )}
                                {item.prescriptions.length > 0 && (
                                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300">
                                    💊 Ordonnance ({item.prescriptions.length} méd.)
                                  </span>
                                )}
                                {item.labs.length > 0 && (
                                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-500/15 text-cyan-800 dark:text-cyan-300">
                                    🧪 Analyses ({item.labs.length})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-ink-faint">
                              <span className="text-xs text-ink-muted font-semibold hidden sm:inline">
                                {isExpanded ? 'Réduire' : 'Détails'}
                              </span>
                              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </div>
                          </div>

                          {/* Expanded Card Body */}
                          {isExpanded && (
                            <div className="p-4 sm:p-5 border-t border-line-soft bg-surface-muted/50 space-y-4 text-sm animate-in fade-in duration-150">
                              {/* 1. Consultation info */}
                              {item.consultation && (
                                <div className="bg-surface p-3.5 rounded-xl border border-line space-y-2">
                                  <div className="text-xs font-bold text-ink-muted uppercase tracking-wide flex items-center justify-between">
                                    <span>🩺 Consultation Médicale</span>
                                    {item.doctorName && <span className="text-ink-secondary font-medium">Dr. {item.doctorName}</span>}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="text-ink-muted font-semibold">Motif :</span>{' '}
                                      <span className="text-ink-strong font-bold">{item.consultation.visitReason || 'Non précisé'}</span>
                                    </div>
                                    <div>
                                      <span className="text-ink-muted font-semibold">Diagnostic :</span>{' '}
                                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">{item.consultation.diagnosis || 'Non renseigné'}</span>
                                    </div>
                                  </div>
                                  {item.consultation.notes && (
                                    <div className="bg-amber-50 dark:bg-amber-500/8 p-2.5 rounded-lg border border-amber-200 dark:border-amber-500/25 text-xs text-amber-900 dark:text-amber-300">
                                      <strong>Notes du médecin :</strong> {item.consultation.notes}
                                    </div>
                                  )}
                                  {item.consultation.vitalSigns &&
                                    (item.consultation.vitalSigns.temperature ||
                                      item.consultation.vitalSigns.weight ||
                                      item.consultation.vitalSigns.bloodPressureSystolic) && (
                                      <div className="flex flex-wrap gap-2 pt-1">
                                        {item.consultation.vitalSigns.temperature && (
                                          <span className="px-2 py-0.5 bg-surface-hover rounded text-xs">
                                            🌡️ T°: <strong>{item.consultation.vitalSigns.temperature}°C</strong>
                                          </span>
                                        )}
                                        {item.consultation.vitalSigns.bloodPressureSystolic && (
                                          <span className="px-2 py-0.5 bg-surface-hover rounded text-xs">
                                            🫀 TA: <strong>{item.consultation.vitalSigns.bloodPressureSystolic}/{item.consultation.vitalSigns.bloodPressureDiastolic}</strong>
                                          </span>
                                        )}
                                        {item.consultation.vitalSigns.heartRate && (
                                          <span className="px-2 py-0.5 bg-surface-hover rounded text-xs">
                                            💓 FC: <strong>{item.consultation.vitalSigns.heartRate} bpm</strong>
                                          </span>
                                        )}
                                        {item.consultation.vitalSigns.oxygenSaturation && (
                                          <span className="px-2 py-0.5 bg-surface-hover rounded text-xs">
                                            🫁 SpO2: <strong>{item.consultation.vitalSigns.oxygenSaturation}%</strong>
                                          </span>
                                        )}
                                        {item.consultation.vitalSigns.weight && (
                                          <span className="px-2 py-0.5 bg-surface-hover rounded text-xs">
                                            ⚖️ Poids: <strong>{item.consultation.vitalSigns.weight} kg</strong>
                                          </span>
                                        )}
                                      </div>
                                    )}
                                </div>
                              )}

                              {/* 2. Prescriptions */}
                              {item.prescriptions.length > 0 && (
                                <div className="bg-surface p-3.5 rounded-xl border border-purple-200 dark:border-purple-500/25 space-y-2">
                                  <div className="text-xs font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wide">
                                    💊 Ordonnance Prescrite ({item.prescriptions.length} médicament{item.prescriptions.length > 1 ? 's' : ''})
                                  </div>
                                  <div className="divide-y border rounded-lg overflow-hidden bg-purple-50/20 dark:bg-purple-500/2">
                                    {item.prescriptions.map((p: any) => (
                                      <div key={p.id} className="p-2.5 flex items-start justify-between gap-3 text-xs">
                                        <div className="min-w-0 flex-1">
                                          <div className="font-bold text-ink-strong">
                                            {p.articleName}
                                            {p.quantity ? (
                                              <span className="ml-1.5 font-mono font-bold text-purple-700 dark:text-purple-400">× {p.quantity}</span>
                                            ) : null}
                                          </div>
                                          <div className="mt-0.5 text-ink-secondary">
                                            <span className="font-semibold text-ink-muted">Posologie :</span>{' '}
                                            <strong className="text-purple-700 dark:text-purple-400">{p.posology || 'Selon prescription'}</strong>
                                          </div>
                                          {(p.duration || p.instructions) && (
                                            <div className="text-[11px] text-ink-muted mt-0.5">
                                              {p.duration ? <span>Durée : {p.duration}</span> : null}
                                              {p.duration && p.instructions ? ' · ' : ''}
                                              {p.instructions ? <span>{p.instructions}</span> : null}
                                            </div>
                                          )}
                                        </div>
                                        <div className="shrink-0 flex flex-col items-end gap-1">
                                          <span
                                            className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                              p.delivered ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400'
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
                                <div className="bg-surface p-3.5 rounded-xl border border-cyan-200 dark:border-cyan-500/25 space-y-2">
                                  <div className="text-xs font-bold text-cyan-900 dark:text-cyan-300 uppercase tracking-wide">
                                    🧪 Analyses de Laboratoire ({item.labs.length})
                                  </div>
                                  {item.labs.map((labDisp) => {
                                    const lr = labDisp.lr;
                                    const results = lr.results || [];
                                    return (
                                      <div key={lr.id} className="border rounded-lg overflow-hidden text-xs bg-surface-muted/50 p-2.5 space-y-2">
                                        <div className="flex justify-between items-center">
                                          <div className="font-bold text-ink-strong">
                                            {lr.examType} <span className="text-ink-faint font-normal">({labCategoryLabel(lr.category || 'autre')})</span>
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
                                          <table className="w-full bg-surface rounded border">
                                            <thead className="bg-cyan-50 dark:bg-cyan-500/8 text-ink-secondary text-[11px]">
                                              <tr>
                                                <th className="p-1.5 text-left">Paramètre</th>
                                                <th className="p-1.5 text-center">Résultat</th>
                                                <th className="p-1.5 text-center">Normes</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {results.map((r: any) => (
                                                <tr key={r.parameter} className={`border-t ${r.isAbnormal ? 'bg-red-50 dark:bg-red-500/8 text-red-800 dark:text-red-300 font-bold' : ''}`}>
                                                  <td className="p-1.5">{r.parameter}</td>
                                                  <td className="p-1.5 text-center font-mono">{r.value} {r.unit}</td>
                                                  <td className="p-1.5 text-center font-mono text-ink-muted">
                                                    {r.normalMin} - {r.normalMax} {r.unit}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        ) : (
                                          <div className="text-ink-faint italic text-[11px]">Prélèvement enregistré ({lr.status})</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Hospitalization */}
                              {item.hbRecord && (
                                <div className="bg-surface p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-500/25 space-y-2 text-xs">
                                  <div className="font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wide">🏥 Dossier Hospitalisation / Bloc</div>
                                  <div className="p-2.5 bg-indigo-50/50 dark:bg-indigo-500/4 rounded-lg space-y-1">
                                    <div>Type : <strong className="text-ink-strong">{item.hbRecord.type === 'hospit' ? 'Hospitalisation' : 'Bloc Opératoire'}</strong></div>
                                    <div>Lignes d'actes : <strong className="text-ink-strong">{item.hbRecord.lines?.length || 0} acte(s)</strong></div>
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

          {/* ANALYSES */}
          {tab === 'analyses' && (
            <div className="space-y-3">
              {labCount === 0 && <p className="text-ink-faint text-sm text-center py-6">Aucune analyse.</p>}
              {abnormalLabs > 0 && (
                <div className="p-2 bg-red-50 dark:bg-red-500/8 border border-red-200 dark:border-red-500/25 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> {abnormalLabs} analyse(s) avec résultat(s) anormal(aux).
                </div>
              )}
              {allLabs.map((d) => {
                const r = d.lr;
                const hasAbn = (r.results || []).some((x) => x.isAbnormal);
                return (
                  <div key={r.id} className={`border rounded-xl overflow-hidden ${r.status === 'completed' ? (hasAbn ? 'border-red-200 dark:border-red-500/25' : 'border-emerald-200 dark:border-emerald-500/25') : 'border-line'}`}>
                    <div className={`p-3 flex items-center justify-between ${r.status === 'completed' ? (hasAbn ? 'bg-red-50 dark:bg-red-500/8' : 'bg-emerald-50 dark:bg-emerald-500/8') : 'bg-cyan-50 dark:bg-cyan-500/8'}`}>
                      <div>
                        <div className="font-semibold text-ink-strong flex items-center gap-2">
                          {r.examType}
                          {r.urgent && <span className="px-2 py-0.5 bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 text-xs rounded-full">URGENT</span>}
                          {hasAbn && r.status === 'completed' && <span className="px-2 py-0.5 bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 text-xs rounded-full font-bold">ANORMAL</span>}
                        </div>
                        <div className="text-xs text-ink-muted mt-0.5">
                          {labCategoryLabel(r.category || 'autre')} · {r.sampleType || '—'} · Prescripteur: {d.doctorName || r.requestedBy || '—'}
                          {r.completedAt ? ` · ${new Date(r.completedAt).toLocaleDateString('fr-FR')}` : (r.requestedAt ? ` · demandé le ${new Date(r.requestedAt).toLocaleDateString('fr-FR')}` : '')}
                        </div>
                      </div>
                      {r.status === 'completed' && (
                        <button
                          onClick={() => printLabResultTicket(state.ticketSettings, patient, r, d.doctorName, labCategoryLabel(r.category || 'autre'))}
                          className="px-3 py-1.5 bg-surface border border-line-strong hover:bg-surface-muted rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" /> Compte-rendu
                        </button>
                      )}
                    </div>
                    {r.results && (
                      <div className="p-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-line text-ink-muted">
                              <th className="text-left py-1">Paramètre</th>
                              <th className="text-center py-1">Résultat</th>
                              <th className="text-center py-1">Valeurs usuelles</th>
                              <th className="text-center py-1">État</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.results.map((res) => (
                              <tr key={res.parameter} className={res.isAbnormal ? 'bg-red-50 dark:bg-red-500/8' : ''}>
                                <td className="py-1 text-ink">{res.parameter}</td>
                                <td className={`py-1 text-center font-mono font-bold ${res.isAbnormal ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{res.value} {res.unit}</td>
                                <td className="py-1 text-center text-xs text-ink-muted">{res.normalMin} – {res.normalMax} {res.unit}</td>
                                <td className="py-1 text-center">
                                  {res.isAbnormal
                                    ? <span className="px-2 py-0.5 bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 text-xs rounded-full font-bold">ANORMAL</span>
                                    : <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-xs rounded-full">Normal</span>}
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
        </div>
      </div>
    </div>
  );
}
