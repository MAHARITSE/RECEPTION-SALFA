import { useMemo, useState } from 'react';
import type { AppState } from '../store';
import {
  addAuditLog, formatAr,
  companyIsAssurance, companyTypeLabel,
  assuranceStatutLabel, assuranceStatutBadge,
  invoiceAssuranceStatut, invoicePaidAmount, invoiceAssuranceReste,
  invoiceAssuranceARembourser, invoiceAssuranceRejete, invoiceAssuranceTicketModerateur,
} from '../store';
import type { Company, Invoice } from '../types';
import { printSalfaIndividualInvoice } from '../utils/printSalfaInvoice';
import {
  Building2, Shield, Check, X, ArrowLeft, Send, CircleDollarSign, FileX2, Repeat,
  Printer, Search, Calendar, Hash, Eye, StickyNote, Save, Inbox,
} from 'lucide-react';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const ar = (n?: number) => formatAr(n || 0);

const PAYMENT_METHODS = ['Espèces', 'Chèque', 'Virement', 'Dépôt mobile'];

type Row = {
  inv: Invoice;
  patient?: { lastName?: string; firstName?: string; dossier?: string; matricule?: string };
  company: Company;
};

const STATUT_BLOCKS: [string, string, string][] = [
  ['a_envoyer', 'À envoyer', 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300'],
  ['envoyee', 'Envoyées', 'bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-300'],
  ['partielle', 'Partielles', 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'],
  ['reglee', 'Réglées', 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'],
  ['rejetee', 'Rejetées', 'bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300'],
];

export default function SuiviAssurance({ state, setState }: Props) {
  const assuranceCompanies = useMemo(() => state.companies.filter((c) => companyIsAssurance(c)), [state]);

  const allRows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const inv of state.invoices) {
      if (inv.isExternal || inv.clientType !== 'societe') continue;
      const patient = inv.patientId ? state.patients.find((p) => p.id === inv.patientId) : undefined;
      const companyName = patient?.company || inv.clientName;
      const company = state.companies.find((c) => c.name === companyName);
      if (!company || !companyIsAssurance(company)) continue;
      out.push({ inv, patient, company });
    }
    return out.sort((a, b) => (a.inv.createdAt < b.inv.createdAt ? 1 : -1));
  }, [state]);

  // Assurance actuellement ouverte (détail dans une fenêtre modale au-dessus de la liste).
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [month, setMonth] = useState<string>(currentMonth());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Modal d'action sur une facture (suivi détaillé).
  const [open, setOpen] = useState<Row | null>(null);
  const [dateEnvoi, setDateEnvoi] = useState(today());
  const [aRembourser, setARembourser] = useState('');
  const [bordereau, setBordereau] = useState('');
  const [regAmount, setRegAmount] = useState('');
  const [regDate, setRegDate] = useState(today());
  const [regMethod, setRegMethod] = useState(PAYMENT_METHODS[2]);
  const [regRef, setRegRef] = useState('');
  const [regObs, setRegObs] = useState('');
  const [rejMontant, setRejMontant] = useState('');
  const [rejMotif, setRejMotif] = useState('');
  const [relanceNote, setRelanceNote] = useState('');

  const companyRows = useMemo(
    () => (activeCompany ? allRows.filter((r) => r.company.name === activeCompany.name) : []),
    [activeCompany, allRows]
  );

  const monthRows = companyRows.filter((r) => r.inv.createdAt.startsWith(month));

  const filteredRows = monthRows.filter((r) => {
    const st = invoiceAssuranceStatut(state, r.inv);
    if (statusFilter !== 'all' && st !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [
      r.patient?.lastName, r.patient?.firstName, r.patient?.dossier, r.patient?.matricule, r.inv.id,
    ].some((v) => (v || '').toLowerCase().includes(q));
  });

  const countByStatus = useMemo(() => {
    const counts: Record<string, number> = { a_envoyer: 0, envoyee: 0, partielle: 0, reglee: 0, rejetee: 0 };
    companyRows.forEach((r) => {
      const st = invoiceAssuranceStatut(state, r.inv);
      counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }, [companyRows, state]);

  // ---- Helpers ----
  const patchSuivi = (invoices: Invoice[], invoiceId: string, patch: object): Invoice[] =>
    invoices.map((i) => (i.id === invoiceId ? { ...i, assuranceSuivi: { ...(i.assuranceSuivi || {}), ...patch } } : i));

  const openRow = (r: Row) => {
    const suivi = r.inv.assuranceSuivi || {};
    setDateEnvoi(suivi.dateEnvoi ? suivi.dateEnvoi.slice(0, 10) : today());
    setARembourser(suivi.montantARembourser ? String(suivi.montantARembourser) : String(r.inv.totalAmount || 0));
    setBordereau(suivi.numeroBordereau || '');
    setRegDate(today());
    setRegAmount('');
    setRegMethod(PAYMENT_METHODS[2]);
    setRegRef('');
    setRegObs('');
    setRejMontant(suivi.montantRejete ? String(suivi.montantRejete) : '');
    setRejMotif(suivi.motifRejet || '');
    setRelanceNote('');
    setOpen(r);
  };

  /** Marquer la facture comme ENVOYÉE à l'assurance (bordereau de transmission). */
  const saveTransmission = () => {
    if (!open) return;
    const numero = bordereau.trim();
    if (!numero) { alert('Veuillez saisir le n° de bordereau / de transmission.'); return; }
    if (!dateEnvoi) { alert('Date d’envoi requise.'); return; }
    const brut = open.inv.totalAmount || 0;
    let remb = brut;
    if (aRembourser.trim() !== '') {
      const v = Number(aRembourser);
      if (!isNaN(v) && v >= 0) remb = Math.min(v, brut);
    }
    const iso = new Date(`${dateEnvoi}T12:00:00`).toISOString();
    const companyName = open.company.name;
    setState((prev) => {
      const next: AppState = {
        ...prev,
        invoices: patchSuivi(prev.invoices, open.inv.id, { dateEnvoi: iso, numeroBordereau: numero, montantARembourser: remb }),
      };
      addAuditLog(next, 'ASSURANCE_ENVOI', `${companyName} — Facture ${open.inv.id.slice(0, 8).toUpperCase()} transmise (Bordereau ${numero}, ${ar(remb)} à rembourser)`);
      return next;
    });
    setOpen(null);
  };

  /** Enregistrer un RÈGLEMENT (partiel ou total) reçu de l'assurance. */
  const saveReglement = () => {
    if (!open) return;
    const amount = Number(regAmount);
    if (!amount || amount <= 0) { alert('Montant du règlement invalide.'); return; }
    if (!regDate) { alert('Date de règlement requise.'); return; }
    const companyName = open.company.name;
    const invId = open.inv.id;
    setState((prev) => {
      const inv = prev.invoices.find((i) => i.id === invId);
      if (!inv) return prev;
      const remb = invoiceAssuranceARembourser(inv);
      const rejete = invoiceAssuranceRejete(inv);
      const paidNow = invoicePaidAmount(prev, inv);
      const reste = Math.max(0, remb - paidNow - rejete);
      const effective = Math.min(amount, reste || amount);
      if (effective <= 0) return prev;
      const newPaid = paidNow + effective;
      const fullyPaid = remb > 0 && (newPaid >= remb || Math.max(0, remb - newPaid - rejete) <= 0);
      const iso = new Date(`${regDate}T12:00:00`).toISOString();
      const next: AppState = { ...prev };
      next.invoices = next.invoices.map((i) => {
        if (i.id !== invId) return i;
        return {
          ...i,
          status: fullyPaid ? ('paid' as const) : i.status,
          paidAt: fullyPaid ? iso : i.paidAt,
          paidBy: fullyPaid ? prev.currentUser?.id : i.paidBy,
          assuranceSuivi: { ...(i.assuranceSuivi || {}), dateDernierReglement: iso },
        };
      });
      const invMonth = inv.createdAt.slice(0, 7);
      const payment = {
        id: `pay-${Date.now()}`,
        amount: effective,
        date: iso,
        method: regMethod || PAYMENT_METHODS[2],
        reference: regRef.trim() || undefined,
        observation: regObs.trim() || undefined,
        invoiceIds: [invId],
        receivedBy: prev.currentUser?.name,
        receivedByUserId: prev.currentUser?.id,
      };
      const accIdx = next.companyBillingAccounts.findIndex((a) => a.company === companyName && a.month === invMonth);
      if (accIdx >= 0) {
        next.companyBillingAccounts = next.companyBillingAccounts.map((a, idx) => {
          if (idx !== accIdx) return a;
          return { ...a, paidAmount: a.paidAmount + effective, status: fullyPaid ? ('paid' as const) : ('partial' as const), payments: [...a.payments, payment] };
        });
      } else {
        const compInvs = next.invoices.filter((x) => {
          const p = x.patientId ? next.patients.find((pt) => pt.id === x.patientId) : undefined;
          return (p?.company || x.clientName) === companyName && x.createdAt.startsWith(invMonth);
        });
        next.companyBillingAccounts = [...next.companyBillingAccounts, {
          id: `cba-${Date.now()}`,
          company: companyName,
          month: invMonth,
          invoiceIds: compInvs.map((x) => x.id),
          totalAmount: compInvs.reduce((s, x) => s + x.totalAmount, 0),
          paidAmount: effective,
          status: ('partial' as const),
          createdAt: new Date().toISOString(),
          payments: [payment],
        }];
      }
      addAuditLog(next, 'ASSURANCE_REGLEMENT', `${companyName} — Règlement assurance ${ar(effective)}${fullyPaid ? ' (soldé)' : ''} (${regMethod})`);
      return next;
    });
    setOpen(null);
  };

  /** Enregistrer un REJET / une EXCLUSION partielle ou totale de l'assurance. */
  const saveRejet = () => {
    if (!open) return;
    const montant = Number(rejMontant);
    if (!montant || montant < 0) { alert('Montant rejeté invalide.'); return; }
    const motif = rejMotif.trim() || 'Non pris en charge';
    const companyName = open.company.name;
    setState((prev) => {
      const next: AppState = {
        ...prev,
        invoices: patchSuivi(prev.invoices, open.inv.id, { montantRejete: montant, motifRejet: motif }),
      };
      addAuditLog(next, 'ASSURANCE_REJET', `${companyName} — Facture ${open.inv.id.slice(0, 8).toUpperCase()} rejetée : ${ar(montant)} (${motif})`);
      return next;
    });
    setOpen(null);
  };

  /** Ajouter une note de RELANCE / de suivi interne. */
  const saveRelance = () => {
    if (!open) return;
    const note = relanceNote.trim();
    if (!note) { alert('Veuillez saisir le contenu de la relance / note.'); return; }
    const companyName = open.company.name;
    const stamp = new Date().toLocaleString('fr-FR');
    setState((prev) => {
      const existing = open.inv.assuranceSuivi?.note;
      const next: AppState = {
        ...prev,
        invoices: patchSuivi(prev.invoices, open.inv.id, { note: existing ? `${existing}\n[${stamp}] ${note}` : `[${stamp}] ${note}` }),
      };
      addAuditLog(next, 'ASSURANCE_RELANCE', `${companyName} — Relance sur la facture ${open.inv.id.slice(0, 8).toUpperCase()} : ${note}`);
      return next;
    });
    setOpen(null);
  };

  const patientName = (r: Row) => (r.patient ? `${r.patient.lastName || ''} ${r.patient.firstName || ''}`.trim() : (r.inv.clientName || 'Adhérent'));
  const designation = (r: Row) => (r.inv.items || []).map((i) => i.description).join(', ');

  // ===================== LISTE DES ASSURANCES (toujours visible) =====================
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gradient-to-r from-sky-50 dark:from-sky-950/50 to-indigo-50 dark:to-indigo-950/40 border border-sky-200 dark:border-sky-500/25 rounded-xl">
        <div className="flex items-center gap-2 font-bold text-sky-900 dark:text-sky-300 text-sm">
          <Shield className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          <span>Suivi des Assurances — remboursements, rejets &amp; relances</span>
        </div>
        <p className="text-[11px] text-sky-800/80 dark:text-sky-300/80 italic">
          Cliquez sur une assurance pour ouvrir son suivi. Chaque prestation (facture d'adhérent) est suivie individuellement.
        </p>
      </div>

      {assuranceCompanies.length === 0 && (
        <div className="border border-dashed border-line-strong rounded-2xl p-10 text-center space-y-3 bg-surface">
          <Inbox className="w-10 h-10 text-ink-faint mx-auto" />
          <p className="font-bold text-ink">Aucune société de type « Assurance » enregistrée.</p>
          <p className="text-xs text-ink-muted">
            Allez dans <strong>Administration → Sociétés &amp; Conventions</strong> pour créer un partenaire en le
            classant <strong>Assurance</strong> (et son taux de couverture).
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assuranceCompanies.map((c) => {
          const rows = allRows.filter((r) => r.company.name === c.name);
          const nb = rows.length;
          const totalARemb = rows.reduce((s, r) => s + invoiceAssuranceARembourser(r.inv), 0);
          const totalRegle = rows.reduce((s, r) => s + invoicePaidAmount(state, r.inv), 0);
          const totalRejete = rows.reduce((s, r) => s + invoiceAssuranceRejete(r.inv), 0);
          const reste = rows.reduce((s, r) => s + invoiceAssuranceReste(state, r.inv), 0);
          const counts: Record<string, number> = { a_envoyer: 0, envoyee: 0, partielle: 0, reglee: 0, rejetee: 0 };
          rows.forEach((r) => { counts[invoiceAssuranceStatut(state, r.inv)]++; });
          return (
            <button
              key={c.id}
              onClick={() => setActiveCompany(c)}
              className="text-left p-4 bg-surface border border-line rounded-2xl shadow-xs hover:border-sky-300 dark:hover:border-sky-500/40 hover:shadow-md transition cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-xl bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-ink-strong text-sm flex items-center gap-2">
                      {c.name}
                      <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px] font-bold">{companyTypeLabel(c)}</span>
                    </div>
                    {c.tauxCouverture ? (
                      <div className="text-[11px] text-ink-muted">Couverture : <strong className="text-ink">{c.tauxCouverture}%</strong></div>
                    ) : (
                      <div className="text-[11px] text-ink-faint">Taux de couverture non défini</div>
                    )}
                  </div>
                </div>
                <ChevronRightSmall />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300">{counts.a_envoyer} à envoyer</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-300">{counts.envoyee} envoyée(s)</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">{counts.partielle} partielle(s)</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{counts.reglee} réglée(s)</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300">{counts.rejetee} rejetée(s)</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">Factures</span><strong className="text-ink-strong">{nb}</strong></div>
                <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">À rembourser</span><strong className="text-ink-strong font-mono">{ar(totalARemb)}</strong></div>
                <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">Rejeté / exclu</span><strong className="text-rose-600 font-mono">{ar(totalRejete)}</strong></div>
                <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">Reste à recouvrer</span><strong className="text-rose-700 dark:text-rose-400 font-mono">{ar(reste)}</strong></div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ===================== MODALE : SUIVI D'UNE ASSURANCE ===================== */}
      {activeCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-line overflow-hidden">
            {/* En-tête de la modale */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line bg-surface-muted/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-ink-strong text-base truncate">{activeCompany.name}</h3>
                  <p className="text-[11px] text-ink-muted">Suivi des prestations par adhérent — cliquer une ligne pour les actions (envoi, règlement, rejet, relance).</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 text-[11px] font-bold shrink-0">{companyTypeLabel(activeCompany)}</span>
                {activeCompany.tauxCouverture ? (
                  <span className="px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 text-[11px] font-bold shrink-0">{activeCompany.tauxCouverture}% couvert</span>
                ) : null}
              </div>
              <button onClick={() => { setActiveCompany(null); setStatusFilter('all'); }} className="text-ink-faint hover:text-ink cursor-pointer p-1.5 rounded-lg hover:bg-surface-active shrink-0" title="Fermer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenu défilant */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Compteurs par statut */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
                {STATUT_BLOCKS.map(([key, label, cls]) => (
                  <button key={key} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
                    className={`rounded-xl border p-2 cursor-pointer transition ${statusFilter === key ? 'ring-2 ring-sky-400 border-sky-300' : 'border-line bg-surface-muted'} ${cls}`}>
                    <div className="text-lg font-extrabold">{countByStatus[key] || 0}</div>
                    <div className="font-semibold text-[10px] opacity-80">{label}</div>
                  </button>
                ))}
              </div>

              {/* Filtres : mois + recherche */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-ink">
                  <Calendar className="w-4 h-4 text-ink-faint" /> Mois
                  <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none font-medium" />
                </label>
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-ink-faint" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Adhérent, dossier, n° facture…" className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs bg-surface outline-none" />
                </div>
                <span className="text-[11px] text-ink-muted font-semibold">{filteredRows.length} facture(s) · {monthLabel(month)}</span>
              </div>

              {/* Tableau des prestations */}
              <div className="border border-line rounded-xl overflow-x-auto bg-surface">
                <table className="w-full text-xs">
                  <thead className="bg-surface-hover text-ink border-b">
                    <tr>
                      <th className="p-2.5 text-left font-bold">Date / N°</th>
                      <th className="p-2.5 text-left font-bold">Adhérent</th>
                      <th className="p-2.5 text-left font-bold">Prestation</th>
                      <th className="p-2.5 text-right font-bold" title="Montant brut de la prestation">Facturé (brut)</th>
                      <th className="p-2.5 text-right font-bold text-sky-700 dark:text-sky-300" title="Net à rembourser par l'assurance">À rembourser</th>
                      <th className="p-2.5 text-right font-bold text-rose-600 dark:text-rose-400">Rejeté</th>
                      <th className="p-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400">Réglé</th>
                      <th className="p-2.5 text-right font-bold text-rose-700 dark:text-rose-400">Reste</th>
                      <th className="p-2.5 text-center font-bold">Statut</th>
                      <th className="p-2.5 text-center font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {filteredRows.length === 0 && (
                      <tr><td colSpan={10} className="p-10 text-center text-ink-faint">Aucune facture pour ce filtre.</td></tr>
                    )}
                    {filteredRows.map((r) => {
                      const st = invoiceAssuranceStatut(state, r.inv);
                      const rejete = invoiceAssuranceRejete(r.inv);
                      const regle = invoicePaidAmount(state, r.inv);
                      const mod = invoiceAssuranceTicketModerateur(r.inv);
                      const reste = invoiceAssuranceReste(state, r.inv);
                      return (
                        <tr key={r.inv.id} className="hover:bg-sky-50/40 dark:hover:bg-sky-500/3 transition">
                          <td className="p-2.5 whitespace-nowrap">
                            <div className="font-semibold text-ink-strong">{new Date(r.inv.createdAt).toLocaleDateString('fr-FR')}</div>
                            <div className="font-mono text-[10px] text-ink-faint flex items-center gap-1"><Hash className="w-3 h-3" /> {r.inv.id.slice(0, 8).toUpperCase()}</div>
                          </td>
                          <td className="p-2.5 font-bold text-ink-strong">
                            {patientName(r)}
                            <div className="text-[10px] font-normal text-ink-faint">
                              {r.patient?.dossier ? `Dossier ${r.patient.dossier}` : ''} {r.patient?.matricule ? `· ${r.patient.matricule}` : ''}
                            </div>
                          </td>
                          <td className="p-2.5 max-w-[180px] truncate text-ink-secondary" title={designation(r)}>{designation(r) || '—'}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-ink-strong">{ar(r.inv.totalAmount)}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-sky-700 dark:text-sky-400">{ar(invoiceAssuranceARembourser(r.inv))}</td>
                          <td className="p-2.5 text-right font-mono text-rose-600 dark:text-rose-400">{ar(rejete)}</td>
                          <td className="p-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{ar(regle)}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-rose-700 dark:text-rose-400">{ar(reste)}</td>
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${assuranceStatutBadge(st)}`}>{assuranceStatutLabel(st)}</span>
                            {mod > 0 && (
                              <div className="text-[9px] text-ink-faint mt-0.5">ticket modérateur : {ar(mod)}</div>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <button onClick={() => openRow(r)} className="px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1" title="Suivre la facture (actions)">
                                <Eye className="w-3 h-3" /> Suivre
                              </button>
                              <button
                                onClick={() => r.patient ? printSalfaIndividualInvoice(state.ticketSettings, r.inv, state.patients.find(p => p.id === r.inv.patientId)) : printSalfaIndividualInvoice(state.ticketSettings, r.inv, undefined)}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1" title="Imprimer la Facture A5"
                              >
                                <Printer className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODALE : SUIVI D'UNE FACTURE (actions) ===================== */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-5 space-y-4 border border-line">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-ink-strong text-base flex items-center gap-2">
                  <Shield className="w-5 h-5 text-sky-600 dark:text-sky-400" /> Suivi de la facture
                  <span className="font-mono text-xs text-ink-faint">{open.inv.id.slice(0, 8).toUpperCase()}</span>
                </h3>
                <div className="text-xs text-ink-muted mt-0.5">
                  {patientName(open)} · {open.company.name} · {new Date(open.inv.createdAt).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <button onClick={() => setOpen(null)} className="text-ink-faint hover:text-ink cursor-pointer p-1"><X className="w-5 h-5" /></button>
            </div>

            {/* Résumé (montants, logique suivi_assurance) */}
            <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
              <div className="p-3 bg-surface-muted rounded-xl"><div className="text-ink-muted" title="Montant brut de la prestation">Facturé (brut)</div><div className="font-bold text-ink-strong font-mono text-sm">{ar(open.inv.totalAmount)}</div></div>
              <div className="p-3 bg-sky-50 dark:bg-sky-500/8 rounded-xl"><div className="text-sky-700 dark:text-sky-300">À rembourser</div><div className="font-bold text-sky-700 dark:text-sky-400 font-mono text-sm">{ar(invoiceAssuranceARembourser(open.inv))}</div></div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-500/8 rounded-xl"><div className="text-emerald-700 dark:text-emerald-300">Déjà réglé</div><div className="font-bold text-emerald-700 dark:text-emerald-400 font-mono text-sm">{ar(invoicePaidAmount(state, open.inv))}</div></div>
              <div className="p-3 bg-rose-50 dark:bg-rose-500/8 rounded-xl"><div className="text-rose-700 dark:text-rose-300">Reste</div><div className="font-bold text-rose-700 dark:text-rose-400 font-mono text-sm">{ar(invoiceAssuranceReste(state, open.inv))}</div></div>
            </div>

            {/* 1. Transmission */}
            <div className="p-3 border border-sky-200 dark:border-sky-500/20 rounded-xl bg-sky-50/40 dark:bg-sky-500/5 space-y-2">
              <div className="font-bold text-xs text-sky-900 dark:text-sky-300 flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Transmission à l'assurance (bordereau)</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input type="date" value={dateEnvoi} onChange={(e) => setDateEnvoi(e.target.value)} className="px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none" />
                <input type="text" value={bordereau} onChange={(e) => setBordereau(e.target.value)} placeholder="N° bordereau d'envoi…" className="px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none" />
                <label className="col-span-2 flex items-center gap-2 text-[11px] font-semibold text-sky-800 dark:text-sky-300">
                  À rembourser (Ar)
                  <input type="number" min={0} value={aRembourser} onChange={(e) => setARembourser(e.target.value)} placeholder="Totalité de la facture" className="flex-1 min-w-[90px] px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none font-medium text-ink" />
                </label>
              </div>
              <button onClick={saveTransmission} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Marquer comme transmise</button>
            </div>

            {/* 2. Règlement */}
            <div className="p-3 border border-emerald-200 dark:border-emerald-500/20 rounded-xl bg-emerald-50/40 dark:bg-emerald-500/5 space-y-2">
              <div className="font-bold text-xs text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5"><CircleDollarSign className="w-3.5 h-3.5" /> Enregistrer un règlement de l'assurance</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input type="number" value={regAmount} onChange={(e) => setRegAmount(e.target.value)} placeholder="Montant (Ar)" className="col-span-2 px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none" />
                <input type="date" value={regDate} onChange={(e) => setRegDate(e.target.value)} className="px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none" />
                <select value={regMethod} onChange={(e) => setRegMethod(e.target.value)} className="px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none cursor-pointer">
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="text" value={regRef} onChange={(e) => setRegRef(e.target.value)} placeholder="Référence (n° chèque / virement)…" className="px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none" />
                <input type="text" value={regObs} onChange={(e) => setRegObs(e.target.value)} placeholder="Observation…" className="px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none" />
              </div>
              <button onClick={saveReglement} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Enregistrer le règlement</button>
            </div>

            {/* 3. Rejet / exclusion */}
            <div className="p-3 border border-rose-200 dark:border-rose-500/20 rounded-xl bg-rose-50/40 dark:bg-rose-500/5 space-y-2">
              <div className="font-bold text-xs text-rose-900 dark:text-rose-300 flex items-center gap-1.5"><FileX2 className="w-3.5 h-3.5" /> Rejet / exclusion par l'assurance</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="number" value={rejMontant} onChange={(e) => setRejMontant(e.target.value)} placeholder="Montant exclu / rejeté (Ar)" className="px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none" />
                <input type="text" value={rejMotif} onChange={(e) => setRejMotif(e.target.value)} placeholder="Motif du rejet (ex : non pris en charge)" className="px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none" />
              </div>
              <button onClick={saveRejet} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1.5"><FileX2 className="w-3.5 h-3.5" /> Enregistrer le rejet</button>
            </div>

            {/* 4. Relance / note */}
            <div className="p-3 border border-indigo-200 dark:border-indigo-500/20 rounded-xl bg-indigo-50/40 dark:bg-indigo-500/5 space-y-2">
              <div className="font-bold text-xs text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> Relance / note de suivi interne</div>
              <textarea value={relanceNote} onChange={(e) => setRelanceNote(e.target.value)} rows={2} placeholder="Contenu de la relance (téléphone, courrier, email, date de rappel…)" className="w-full px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none resize-none" />
              <button onClick={saveRelance} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> Ajouter la relance / note</button>
            </div>

            {/* Historique de la note */}
            {open.inv.assuranceSuivi?.note && (
              <div className="p-3 border border-line rounded-xl bg-surface-muted">
                <div className="font-bold text-[11px] text-ink flex items-center gap-1.5 mb-1.5"><StickyNote className="w-3.5 h-3.5 text-ink-faint" /> Notes &amp; relances précédentes</div>
                <pre className="text-[11px] text-ink-secondary whitespace-pre-wrap font-sans">{open.inv.assuranceSuivi.note}</pre>
              </div>
            )}

            <div className="flex justify-end border-t pt-3">
              <button onClick={() => setOpen(null)} className="px-4 py-2 bg-surface-hover hover:bg-surface-active text-ink rounded-xl text-xs font-semibold cursor-pointer">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Petite chevron à droite de chaque carte d'assurance. */
function ChevronRightSmall() {
  return (
    <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-surface-muted text-ink-faint">
      →
    </span>
  );
}
