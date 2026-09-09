import { useMemo } from 'react';
import type { AppState } from '../store';
import {
  formatAr,
  companyIsAssurance, companyTypeLabel,
  invoiceAssuranceStatut, invoicePaidAmount, invoiceAssuranceReste,
  invoiceAssuranceARembourser, invoiceAssuranceRejete,
} from '../store';
import type { Company, Invoice } from '../types';
import {
  Building2, Shield, ArrowLeft, Receipt, Users, History,
  Calendar, Wallet, Sparkles, ChevronRight, HandCoins,
} from 'lucide-react';

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

interface Props {
  state: AppState;
  filterCompany: string;
  setFilterCompany: (v: string) => void;
  filterMonth: string;
  setFilterMonth: (v: string) => void;
  onGoClient: () => void;
  onGoSociete: () => void;
  onOpenAssurance: (companyName: string) => void;
  onOpenHisto: () => void;
}

type R = { inv: Invoice; patient?: { lastName?: string; firstName?: string; dossier?: string; company?: string }; company?: Company; companyName: string };

export default function ModuleFacturationAccueil({
  state, filterCompany, setFilterCompany, filterMonth, setFilterMonth,
  onGoClient, onGoSociete, onOpenAssurance, onOpenHisto,
}: Props) {
  const allRows: R[] = useMemo(() => {
    const out: R[] = [];
    for (const inv of state.invoices) {
      if (inv.isExternal || inv.clientType !== 'societe') continue;
      const patient = inv.patientId ? state.patients.find((p) => p.id === inv.patientId) : undefined;
      const companyName = patient?.company || inv.clientName;
      const company = state.companies.find((c) => c.name === companyName);
      if (!companyName) continue;
      out.push({ inv, patient, company, companyName });
    }
    return out;
  }, [state]);

  const monthRows = useMemo(
    () => allRows.filter((r) => r.inv.createdAt.startsWith(filterMonth)),
    [allRows, filterMonth]
  );

  type Stat = Record<string, number>;
  interface AssSum { company: Company; rows: R[]; count: number; statut: Stat; aRembourser: number; regle: number; rejete: number; reste: number; }
  interface PaySum { company: Company; rows: R[]; count: number; patients: number; total: number; paid: number; balance: number; account?: { status?: string }; }

  const byName = useMemo(() => {
    const assur = new Map<string, AssSum>();
    const payeur = new Map<string, PaySum>();
    monthRows.forEach((r) => {
      if (!r.company) return;
      const c = r.company;
      if (companyIsAssurance(c)) {
        let e = assur.get(c.name);
        if (!e) { e = { company: c, rows: [], count: 0, statut: { a_envoyer: 0, envoyee: 0, partielle: 0, reglee: 0, rejetee: 0 }, aRembourser: 0, regle: 0, rejete: 0, reste: 0 }; assur.set(c.name, e); }
        e.rows.push(r); e.count++;
        const st = invoiceAssuranceStatut(state, r.inv);
        e.statut[st] = (e.statut[st] || 0) + 1;
        e.aRembourser += invoiceAssuranceARembourser(r.inv);
        e.regle += invoicePaidAmount(state, r.inv);
        e.rejete += invoiceAssuranceRejete(r.inv);
        e.reste += invoiceAssuranceReste(state, r.inv);
      } else {
        let e = payeur.get(c.name);
        if (!e) { e = { company: c, rows: [], count: 0, patients: 0, total: 0, paid: 0, balance: 0 }; payeur.set(c.name, e); }
        e.rows.push(r); e.count++;
        e.total += r.inv.totalAmount;
        e.paid += invoicePaidAmount(state, r.inv);
      }
    });
    // paid/balance du mois pour les payeurs : répartir à partir du compte mensuel si dispo
    payeur.forEach((e) => {
      const acc = state.companyBillingAccounts.find((a) => a.company === e.company.name && a.month === filterMonth);
      e.account = acc;
      if (acc && e.paid === 0) e.paid = Math.min(acc.paidAmount, e.total);
      e.balance = Math.max(0, e.total - e.paid);
      e.patients = new Set(e.rows.map((x) => x.inv.patientId).filter(Boolean)).size;
    });
    const assurSorted = Array.from(assur.values()).sort((a, b) => a.company.name.localeCompare(b.company.name));
    const payeurSorted = Array.from(payeur.values()).sort((a, b) => a.company.name.localeCompare(b.company.name));
    return { assur: assurSorted, payeur: payeurSorted, assurMap: assur, payeurMap: payeur };
  }, [monthRows, state, filterMonth]);

  const selectedCompany = filterCompany !== 'all'
    ? state.companies.find((c) => c.name === filterCompany)
    : undefined;
  const selectedAssur = selectedCompany ? byName.assurMap.get(selectedCompany.name) : undefined;
  const selectedPayeur = selectedCompany ? byName.payeurMap.get(selectedCompany.name) : undefined;

  const chip = (label: string, val: number, cls: string) => (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>{val} {label}</span>
  );

  /* ---------- Workspace d'une société sélectionnée ---------- */
  if (selectedCompany) {
    const c = selectedCompany;
    const isAssur = !!selectedAssur || companyIsAssurance(c);
    return (
      <div className="space-y-4">
        {/* Barre supérieure */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface border border-line rounded-xl shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setFilterCompany('all')}
              className="px-3 py-1.5 bg-surface-hover hover:bg-surface-active text-ink rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Toutes les sociétés
            </button>
            <span className="text-[11px] text-ink-muted font-semibold">Accueil / <strong>{c.name}</strong></span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onGoClient}
              className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5">
              <Receipt className="w-4 h-4" /> Facture Client
            </button>
            <button onClick={onGoSociete}
              className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5">
              <Building2 className="w-4 h-4" /> Facture Société
            </button>
          </div>
        </div>

        {/* En-tête société */}
        <div className="p-5 bg-gradient-to-r from-indigo-50 dark:from-indigo-950/50 to-sky-50 dark:to-sky-950/40 border border-indigo-200 dark:border-indigo-500/20 rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${isAssur ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300' : 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'}`}>
                {isAssur ? <Shield className="w-7 h-7" /> : <Building2 className="w-7 h-7" />}
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-ink-strong flex items-center gap-2">{c.name}
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${isAssur ? 'bg-sky-100 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300' : 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300'}`}>{companyTypeLabel(c)}</span>
                </h2>
                <p className="text-xs text-ink-muted">
                  {isAssur
                    ? (c.tauxCouverture ? `Couverture : ${c.tauxCouverture}% — suivi des prestations par adhérent.` : 'Taux de couverture non défini.')
                    : 'Règlement mensuel global / individuel des factures du mois.'}
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-ink">
              <Calendar className="w-4 h-4 text-ink-faint" /> Mois
              <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                className="px-2.5 py-1.5 border rounded-lg text-xs bg-surface outline-none font-medium" />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            {isAssur && selectedAssur ? (
              <>
                <div className="p-2.5 bg-surface rounded-xl border border-line"><span className="text-ink-muted block">Prestations (mois)</span><strong className="text-ink-strong">{selectedAssur.count}</strong></div>
                <div className="p-2.5 bg-surface rounded-xl border border-line"><span className="text-ink-muted block">À rembourser</span><strong className="text-ink-strong font-mono">{formatAr(selectedAssur.aRembourser)}</strong></div>
                <div className="p-2.5 bg-surface rounded-xl border border-line"><span className="text-ink-muted block">Réglé</span><strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatAr(selectedAssur.regle)}</strong></div>
                <div className="p-2.5 bg-surface rounded-xl border border-line"><span className="text-ink-muted block">Reste à recouvrer</span><strong className="text-rose-600 dark:text-rose-400 font-mono">{formatAr(selectedAssur.reste)}</strong></div>
              </>
            ) : selectedPayeur ? (
              <>
                <div className="p-2.5 bg-surface rounded-xl border border-line"><span className="text-ink-muted block">Prestations (mois)</span><strong className="text-ink-strong">{selectedPayeur.count}</strong></div>
                <div className="p-2.5 bg-surface rounded-xl border border-line"><span className="text-ink-muted block">Patients (mois)</span><strong className="text-ink-strong">{selectedPayeur.patients}</strong></div>
                <div className="p-2.5 bg-surface rounded-xl border border-line"><span className="text-ink-muted block">Déjà payé</span><strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatAr(selectedPayeur.paid)}</strong></div>
                <div className="p-2.5 bg-surface rounded-xl border border-line"><span className="text-ink-muted block">Reste à payer</span><strong className="text-rose-600 dark:text-rose-400 font-mono">{formatAr(selectedPayeur.balance)}</strong></div>
              </>
            ) : (
              <>
                <div className="p-2.5 bg-surface rounded-xl border border-line col-span-2"><span className="text-ink-muted block">Aucune prestation sur ce mois</span><strong className="text-ink-strong">{monthLabel(filterMonth)}</strong></div>
              </>
            )}
          </div>
        </div>

        {/* Gestion : prestations / règlements */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isAssur ? (
            <button onClick={() => onOpenAssurance(c.name)}
              className="text-left p-5 bg-surface border border-sky-200 dark:border-sky-500/25 rounded-2xl shadow-xs hover:border-sky-400 hover:shadow-md transition cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300"><Shield className="w-5 h-5" /></div>
                <div className="flex-1">
                  <div className="font-bold text-ink-strong text-sm flex items-center gap-2">Gestion des Prestations (suivi assurance)
                    <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-sky-500 transition" /></div>
                  <p className="text-[11px] text-ink-muted">Envoi, bordereaux, règlements partiels, rejets &amp; relances par adhérent.</p>
                </div>
              </div>
            </button>
          ) : (
            <button onClick={onGoSociete}
              className="text-left p-5 bg-surface border border-indigo-200 dark:border-indigo-500/25 rounded-2xl shadow-xs hover:border-indigo-400 hover:shadow-md transition cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"><HandCoins className="w-5 h-5" /></div>
                <div className="flex-1">
                  <div className="font-bold text-ink-strong text-sm flex items-center gap-2">Gestion des Règlements (société)
                    <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-indigo-500 transition" /></div>
                  <p className="text-[11px] text-ink-muted">Règlement global mensuel ou paiement individuel par salarié.</p>
                </div>
              </div>
            </button>
          )}
          <button onClick={onOpenHisto}
            className="text-left p-5 bg-surface border border-line rounded-2xl shadow-xs hover:border-blue-400 hover:shadow-md transition cursor-pointer group">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300"><History className="w-5 h-5" /></div>
              <div className="flex-1">
                <div className="font-bold text-ink-strong text-sm flex items-center gap-2">Historique des paiements
                  <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-blue-500 transition" /></div>
                <p className="text-[11px] text-ink-muted">Globaux &amp; individuels antérieurs.</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Vue « toutes les sociétés » (accueil général) ---------- */
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface border border-line rounded-xl shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onGoClient}
            className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"><Receipt className="w-4 h-4" /> Facture Client</button>
          <button onClick={onGoSociete}
            className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"><Building2 className="w-4 h-4" /> Facture Société</button>
          <button onClick={onOpenHisto}
            className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"><History className="w-4 h-4" /> Historique paiements</button>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-ink-muted font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Accueil — vue par société · {monthLabel(filterMonth)}
        </span>
      </div>

      {/* Filtre global par société */}
      <div className="bg-surface rounded-xl shadow-sm border p-3 flex flex-wrap items-center gap-3">
        <label className="block flex-1 min-w-[200px]">
          <span className="text-[11px] font-semibold text-ink-muted uppercase flex items-center gap-1"><Building2 className="w-3 h-3" /> Société</span>
          <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-surface outline-none cursor-pointer font-medium">
            <option value="all">Toutes les sociétés</option>
            {state.companies.map((c) => (<option key={c.id} value={c.name}>{companyTypeLabel(c)} — {c.name}</option>))}
          </select>
        </label>
        <label className="block flex-1 min-w-[160px]">
          <span className="text-[11px] font-semibold text-ink-muted uppercase flex items-center gap-1"><Calendar className="w-3 h-3" /> Mois</span>
          <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-surface outline-none font-medium" />
        </label>
      </div>

      {/* Section Assurances */}
      {byName.assur.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-sky-800 dark:text-sky-300 text-sm">
            <Shield className="w-5 h-5 text-sky-600 dark:text-sky-400" /> Assurances
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {byName.assur.map((e) => (
              <button key={e.company.id} onClick={() => setFilterCompany(e.company.name)}
                className="text-left p-4 bg-surface border border-line rounded-2xl shadow-xs hover:border-sky-300 dark:hover:border-sky-500/40 hover:shadow-md transition cursor-pointer">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-ink-strong text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />{e.company.name}
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-faint" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                  {chip('à envoyer', e.statut.a_envoyer, 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300')}
                  {chip('envoyée(s)', e.statut.envoyee, 'bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-300')}
                  {chip('partielle(s)', e.statut.partielle, 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300')}
                  {chip('réglée(s)', e.statut.reglee, 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300')}
                  {chip('rejetée(s)', e.statut.rejetee, 'bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300')}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">Prestations</span><strong className="text-ink-strong">{e.count}</strong></div>
                  <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">À rembourser</span><strong className="text-ink-strong font-mono">{formatAr(e.aRembourser)}</strong></div>
                  <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">Rejeté</span><strong className="text-rose-600 font-mono">{formatAr(e.rejete)}</strong></div>
                  <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">Reste à recouvrer</span><strong className="text-rose-700 dark:text-rose-400 font-mono">{formatAr(e.reste)}</strong></div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section Payeurs globaux / sociétés */}
      {byName.payeur.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-indigo-800 dark:text-indigo-300 text-sm">
            <Wallet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Payeurs globaux &amp; conventions
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {byName.payeur.map((e) => (
              <button key={e.company.id} onClick={() => setFilterCompany(e.company.name)}
                className="text-left p-4 bg-surface border border-line rounded-2xl shadow-xs hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-md transition cursor-pointer">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-ink-strong text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />{e.company.name}
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-faint" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">Prestations (mois)</span><strong className="text-ink-strong">{e.count}</strong></div>
                  <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">Patients</span><strong className="text-ink-strong">{e.patients}</strong></div>
                  <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">Montant mois</span><strong className="text-ink-strong font-mono">{formatAr(e.total)}</strong></div>
                  <div className="p-2 bg-surface-muted rounded-lg"><span className="text-ink-muted block">Reste à payer</span><strong className="text-rose-600 font-mono">{formatAr(e.balance)}</strong></div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {byName.assur.length === 0 && byName.payeur.length === 0 && (
        <div className="border border-dashed border-line-strong rounded-2xl p-12 text-center space-y-2 bg-surface">
          <Users className="w-10 h-10 text-ink-faint mx-auto" />
          <p className="font-bold text-ink">Aucune prestation de société pour {monthLabel(filterMonth)}.</p>
          <p className="text-xs text-ink-muted">Choisissez un autre mois ou ouvrez l'onglet « Facture Société ».</p>
        </div>
      )}
    </div>
  );
}
