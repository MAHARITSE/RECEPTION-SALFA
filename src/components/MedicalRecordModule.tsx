import { useState } from 'react';
import type { AppState } from '../store';
import { formatAr, labCategoryLabel } from '../store';
import type { LabRequest } from '../types';
import { printDossierTicket, printLabResultTicket } from '../utils/printTicket';
import PatientJourney from './PatientJourney';
import {
  ArrowLeft, Printer, Search, FileText, FlaskConical, Stethoscope,
  Receipt, Route, AlertTriangle, Droplets, Pill,
} from 'lucide-react';

interface Props {
  state: AppState;
  patientId?: string | null;
  onBack?: () => void;
}

type DispLab = { lr: LabRequest; doctorName: string; consultationId?: string };
type Tab = 'parcours' | 'consultations' | 'analyses' | 'factures';

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

export default function MedicalRecordModule({ state, patientId, onBack }: Props) {
  const [localId, setLocalId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('parcours');
  // Ne jamais rendre une donnée clinique si le composant est appelé hors du parcours médecin.
  if (state.currentUser?.role !== 'doctor') return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">Accès refusé : le dossier médical est réservé aux médecins.</div>;

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

  const allLabs: DispLab[] = pid
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
      ].sort((a, b) => {
        const da = new Date(a.lr.completedAt || a.lr.requestedAt || 0).getTime();
        const db = new Date(b.lr.completedAt || b.lr.requestedAt || 0).getTime();
        return db - da;
      })
    : [];

  // ---- File des patients (colonne gauche, toujours visible) ----
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
    .sort((a, b) => new Date(b.lastVisitAt || b.registeredAt).getTime() - new Date(a.lastVisitAt || a.registeredAt).getTime());

  const st = patient
    ? (statusCfg[patient.status] || { label: patient.status, bg: 'bg-slate-100', text: 'text-slate-600' })
    : { label: '', bg: 'bg-slate-100', text: 'text-slate-600' };
  const vitals = patient ? (patient.vitalSigns || consultations[0]?.vitalSigns) : undefined;
  const labCount = allLabs.length;
  const abnormalLabs = allLabs.filter((d) => (d.lr.results || []).some((r) => r.isAbnormal)).length;

  return (
    <div className="space-y-4">
      {/* En-tête de page */}
      <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-700" /> Dossiers Médicaux
          </h2>
          <p className="text-sm text-slate-500">File des patients passés au centre — sélectionnez un patient pour afficher son parcours à droite.</p>
        </div>
        {onBack && (
          <button onClick={onBack} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm flex items-center gap-2 cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* COLONNE GAUCHE : file des patients (passage au centre) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden lg:sticky lg:top-4">
          <div className="p-3.5 border-b bg-slate-800 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm flex items-center gap-1.5"><Route className="w-4 h-4" /> Passage au centre</span>
              <span className="bg-white/20 font-mono font-bold px-2 py-0.5 rounded-full text-[10px]">{list.length}</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg text-slate-800 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Rechercher: Nom, Dossier..."
              />
            </div>
          </div>
          <div className="divide-y max-h-[68vh] overflow-y-auto">
            {list.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">Aucun patient trouvé</div>
            ) : (
              list.map((p) => {
                const pst = statusCfg[p.status] || { label: p.status, bg: 'bg-slate-100', text: 'text-slate-600' };
                const isSelected = patient?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setLocalId(p.id)}
                    className={`p-3 cursor-pointer transition-all ${isSelected ? 'bg-slate-100 border-l-4 border-slate-700' : 'hover:bg-slate-50 border-l-4 border-transparent'}`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-800 uppercase truncate">{p.lastName} {p.firstName}</div>
                        <div className="text-xs text-slate-500 font-mono">{p.dossier} · {p.gender === 'M' ? 'H' : 'F'} · {p.age}</div>
                        {(p.company || p.insureName) && <div className="text-[11px] text-slate-400 truncate">🏢 {p.company || p.insureName}</div>}
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${pst.bg} ${pst.text}`}>{pst.label}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      Dernier passage : {new Date(p.lastVisitAt || p.registeredAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLONNE DROITE : détail / parcours du patient sélectionné */}
        <div className="lg:col-span-2 space-y-4">
          {!patient ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-400">
              <Route className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-base font-medium">Sélectionnez un patient dans la file à gauche pour afficher son parcours</p>
            </div>
          ) : (
            <>
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
              onClick={() => printDossierTicket(state.ticketSettings, patient, { consultations, labRequests: allLabs.map((d) => d.lr), invoices, journey })}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Imprimer le dossier
            </button>
            {onBack && (
              <button onClick={onBack} className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm flex items-center gap-2 cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> Retour
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
            { key: 'parcours' as Tab, icon: <Route className="w-4 h-4" />, label: `Parcours (${journey.length})` },
            { key: 'consultations' as Tab, icon: <Stethoscope className="w-4 h-4" />, label: `Consult. (${consultations.length})` },
            { key: 'analyses' as Tab, icon: <FlaskConical className="w-4 h-4" />, label: `Analyses (${labCount})` },
            { key: 'factures' as Tab, icon: <Receipt className="w-4 h-4" />, label: `Factures (${invoices.length})` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.key ? 'border-slate-700 text-slate-800 bg-slate-50' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* PARCOURS */}
          {tab === 'parcours' && (
            <div>
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2"><Route className="w-4 h-4" /> Parcours du patient dans l'établissement</h3>
              <PatientJourney events={journey} />
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
                  <div className="p-3 text-sm space-y-1">
                    {c.visitReason && <div><span className="font-medium text-slate-600">Motif :</span> {c.visitReason}</div>}
                    <div><span className="font-medium text-slate-600">Diagnostic :</span> {c.diagnosis}</div>
                    {c.notes && <div><span className="font-medium text-slate-600">Notes :</span> {c.notes}</div>}
                    {c.prescriptions.length > 0 && (
                      <div className="pt-1">
                        <div className="font-medium text-slate-600 mb-1">Ordonnance :</div>
                        <ul className="list-disc pl-5 text-slate-700">
                          {c.prescriptions.map((p) => (
                            <li key={p.id}>
                              {p.articleName} × {p.quantity}
                              {p.posology ? ` (${p.posology})` : ''}
                              {p.delivered ? <span className="text-emerald-600"> ✓ délivré</span> : <span className="text-amber-600"> (à délivrer)</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {state.currentUser?.role === 'doctor' && (
                      <div className="mt-2 pt-2 border-t text-xs">
                        <button className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700" onClick={() => alert('Ajout observation médecin (simulé) — dossier mis à jour.')}>+ Ajouter observation médecin</button>
                      </div>
                    )}
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
                      <td className="p-2 text-xs">{i.items.map((it) => it.description).join(' ; ')}</td>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
