import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState } from '../store';
import {
  addAuditLog, addCompanyBillingPayment, billingStatusClasses, billingStatusLabel,
  formatAr, getCompanyInvoicesForMonth, invoiceNumero,
} from '../store';
import type { CompanyBillingAccount, Invoice } from '../types';
import {
  Building2, Calendar, Check, CreditCard, Download, Eye, HandCoins,
  Printer, Receipt, Search, Trash2, Wallet, X,
} from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }

type Tab = 'accounts' | 'invoices' | 'payments';

/** Libellé lisible d'un mois YYYY-MM (ex : « juillet 2026 »). */
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

/** Date du jour au format YYYY-MM (valeur par défaut du filtre mois). */
const currentMonth = () => new Date().toISOString().slice(0, 7);

/** Date du jour au format YYYY-MM-DD (valeur par défaut du champ date de règlement). */
const today = () => new Date().toISOString().slice(0, 10);

export default function BillingModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('accounts');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth());
  const [search, setSearch] = useState('');
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);

  // Modal d'encaissement d'un règlement (partiel ou complet)
  const [payingAccount, setPayingAccount] = useState<CompanyBillingAccount | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today());
  const [payMethod, setPayMethod] = useState('Virement');
  const [payReference, setPayReference] = useState('');

  const paymentMethods = state.ticketSettings?.paymentMethods?.length
    ? state.ticketSettings.paymentMethods
    : ['Espèces', 'Carte bancaire', 'Mobile Money', 'Virement', 'Chèque'];

  /* ======================= DONNÉES FILTRÉES ======================= */

  /** Comptes du mois filtré (éventuellement restreints à une société). */
  const monthAccounts = state.companyBillingAccounts
    .filter(a => a.month === filterMonth && (filterCompany === 'all' || a.company === filterCompany))
    .sort((a, b) => a.company.localeCompare(b.company));

  /** Sociétés ayant des factures sur le mois mais pas encore regroupées en compte. */
  const ungroupedCompanies = state.companies
    .map(c => c.name)
    .filter(name => filterCompany === 'all' || name === filterCompany)
    .filter(name => !state.companyBillingAccounts.some(a => a.company === name && a.month === filterMonth))
    .filter(name => getCompanyInvoicesForMonth(state, name, filterMonth).length > 0)
    .sort();

  /** Factures sociétés du filtre courant (société + mois), recherchables. */
  const filteredInvoices = useMemo(() => {
    const invoices = getCompanyInvoicesForMonth(state, filterCompany, filterMonth);
    const q = search.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(inv => {
      const patient = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : undefined;
      const patientName = patient ? `${patient.lastName} ${patient.firstName}`.toLowerCase() : '';
      const dossier = patient?.dossier.toLowerCase() || '';
      const numero = invoiceNumero(state, inv.id).toLowerCase();
      const company = patient?.company?.toLowerCase() || '';
      return patientName.includes(q) || dossier.includes(q) || numero.includes(q) || company.includes(q);
    });
  }, [state, filterCompany, filterMonth, search]);

  /** Règlements enregistrés sur les comptes du filtre courant. */
  const filteredPayments = monthAccounts
    .flatMap(a => a.payments.map(p => ({ account: a, payment: p })))
    .sort((x, y) => y.payment.date.localeCompare(x.payment.date));

  // Garde d'accès : ce module est exclusivement réservé au rôle Responsable facturation.
  // (placée après tous les hooks pour respecter les règles des hooks React)
  if (state.currentUser?.role !== 'billing') {
    return (
      <div className="p-12 text-center text-rose-700 font-semibold bg-rose-50 border border-rose-200 rounded-xl">
        Accès refusé — le module « Facturation sociétés » est réservé au rôle Responsable facturation.
      </div>
    );
  }

  /* ======================= TOTAUX DU FILTRE ======================= */

  const billedFromAccounts = monthAccounts.reduce((s, a) => s + a.totalAmount, 0);
  const paidFromAccounts = monthAccounts.reduce((s, a) => s + a.paidAmount, 0);
  const billedFromUngrouped = ungroupedCompanies.reduce(
    (s, name) => s + getCompanyInvoicesForMonth(state, name, filterMonth).reduce((ss, inv) => ss + inv.totalAmount, 0), 0);
  const totalBilled = billedFromAccounts + billedFromUngrouped;
  const totalPaid = paidFromAccounts;
  const totalBalance = totalBilled - totalPaid;

  /* ======================= ACTIONS ======================= */

  /** Regroupe les factures d'une société pour le mois filtré en un compte mensuel. */
  const groupCompanyMonth = (company: string) => {
    const invoices = getCompanyInvoicesForMonth(state, company, filterMonth);
    if (!invoices.length) { alert('Aucune facture société à regrouper pour cette période.'); return; }
    if (state.companyBillingAccounts.some(a => a.company === company && a.month === filterMonth)) {
      alert('Un compte existe déjà pour cette société et ce mois.'); return;
    }
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    setState(prev => {
      const next = {
        ...prev,
        companyBillingAccounts: [...prev.companyBillingAccounts, {
          id: uuidv4(), company, month: filterMonth, invoiceIds: invoices.map(i => i.id),
          totalAmount, paidAmount: 0, status: 'open' as const, createdAt: new Date().toISOString(), payments: [],
        }],
      };
      addAuditLog(next, 'REGROUPEMENT_FACTURATION', `${company} — ${monthLabel(filterMonth)} — ${invoices.length} facture(s), ${formatAr(totalAmount)}`);
      return next;
    });
  };

  /** Regroupe d'un coup toutes les sociétés ayant des factures non regroupées sur le mois. */
  const groupAllCompanies = () => {
    if (!ungroupedCompanies.length) return;
    if (!confirm(`Regrouper les factures de ${ungroupedCompanies.length} société(s) pour ${monthLabel(filterMonth)} ?`)) return;
    ungroupedCompanies.forEach(groupCompanyMonth);
  };

  /** Supprime un regroupement mensuel (les factures d'origine sont conservées). */
  const deleteAccount = (account: CompanyBillingAccount) => {
    if (!confirm(`Supprimer le regroupement ${account.company} — ${monthLabel(account.month)} ?\n\nLes factures d'origine sont conservées.`)) return;
    setState(prev => {
      const next = { ...prev, companyBillingAccounts: prev.companyBillingAccounts.filter(a => a.id !== account.id) };
      addAuditLog(next, 'SUPPRESSION_REGROUPEMENT', `${account.company} — ${monthLabel(account.month)}`);
      return next;
    });
    if (detailAccountId === account.id) setDetailAccountId(null);
  };

  const openPaymentModal = (account: CompanyBillingAccount) => {
    const balance = account.totalAmount - account.paidAmount;
    setPayingAccount(account);
    setPayAmount(balance > 0 ? String(balance) : '');
    setPayDate(today());
    setPayMethod(paymentMethods.includes('Virement') ? 'Virement' : paymentMethods[0]);
    setPayReference('');
  };

  /** Enregistre un règlement partiel ou complet (date + mode + référence). */
  const savePayment = () => {
    if (!payingAccount) return;
    const balance = payingAccount.totalAmount - payingAccount.paidAmount;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) { alert('Saisissez un montant valide.'); return; }
    if (amount > balance) { alert(`Le montant dépasse le solde restant (${formatAr(balance)}).`); return; }
    if (!payDate) { alert('Saisissez la date du règlement.'); return; }
    const reference = payReference.trim() || undefined;
    setState(prev => {
      const next = { ...prev };
      addCompanyBillingPayment(next, payingAccount.id, {
        amount, date: new Date(`${payDate}T${new Date().toTimeString().slice(0, 8)}`).toISOString(),
        method: payMethod, reference, receivedBy: prev.currentUser?.name,
      });
      addAuditLog(next, 'REGLEMENT_SOCIETE',
        `${payingAccount.company} — ${monthLabel(payingAccount.month)} — ${formatAr(amount)} (${payMethod}${reference ? ` — ${reference}` : ''})`);
      return next;
    });
    setPayingAccount(null);
  };

  /* ======================= RELEVÉ MENSUEL (impression / export) ======================= */

  const accountInvoices = (account: CompanyBillingAccount): Invoice[] =>
    account.invoiceIds
      .map(id => state.invoices.find(i => i.id === id))
      .filter((i): i is Invoice => Boolean(i))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const patientOf = (inv: Invoice) => (inv.patientId ? state.patients.find(p => p.id === inv.patientId) : undefined);

  /** Impression du relevé mensuel d'une société (fenêtre d'impression dédiée). */
  const printStatement = (account: CompanyBillingAccount) => {
    const invoices = accountInvoices(account);
    const balance = account.totalAmount - account.paidAmount;
    const ts = state.ticketSettings;
    const rows = invoices.map(inv => {
      const p = patientOf(inv);
      return `<tr>
        <td>${invoiceNumero(state, inv.id)}</td>
        <td>${new Date(inv.createdAt).toLocaleDateString('fr-FR')}</td>
        <td>${p ? `${p.lastName} ${p.firstName}` : inv.clientName || '—'}</td>
        <td>${p?.dossier || '—'}</td>
        <td>${inv.items.map(i => i.description).join(', ')}</td>
        <td class="num">${formatAr(inv.totalAmount)}</td>
        <td>${inv.status === 'paid' ? 'Payée' : 'En attente'}</td>
      </tr>`;
    }).join('');
    const payRows = account.payments.map(p => `<tr>
        <td>${new Date(p.date).toLocaleDateString('fr-FR')}</td>
        <td class="num">${formatAr(p.amount)}</td>
        <td>${p.method || '—'}</td>
        <td>${p.reference || '—'}</td>
        <td>${p.receivedBy || '—'}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" />
<title>Relevé ${account.company} — ${monthLabel(account.month)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 18px 0 6px; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #1e40af; padding-bottom: 10px; margin-bottom: 14px; }
  .muted { color: #64748b; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; }
  th { background: #f1f5f9; }
  .num { text-align: right; white-space: nowrap; }
  .totals td { font-weight: bold; background: #f8fafc; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: bold;
    background: ${account.status === 'paid' ? '#d1fae5' : account.status === 'partial' ? '#fef3c7' : '#ffe4e6'};
    color: ${account.status === 'paid' ? '#047857' : account.status === 'partial' ? '#b45309' : '#be123c'}; }
  @media print { .noprint { display: none; } }
</style></head><body>
  <div class="head">
    <div>
      <h1>${ts.facilityName}</h1>
      <div class="muted">${ts.address || ''} ${ts.phone ? '— ' + ts.phone : ''} ${ts.nif ? '— NIF: ' + ts.nif : ''}</div>
    </div>
    <div style="text-align:right">
      <h1>RELEVÉ MENSUEL SOCIÉTÉ</h1>
      <div class="muted">Édité le ${new Date().toLocaleDateString('fr-FR')} par ${state.currentUser?.name || ''}</div>
    </div>
  </div>
  <p><strong>Société :</strong> ${account.company} &nbsp;|&nbsp; <strong>Période :</strong> ${monthLabel(account.month)}
     &nbsp;|&nbsp; <strong>État du compte :</strong> <span class="status">${billingStatusLabel(account.status).toUpperCase()}</span></p>
  <h2>1. Factures des patients rattachés (${invoices.length})</h2>
  <table>
    <thead><tr><th>N° Facture</th><th>Date</th><th>Patient</th><th>Dossier</th><th>Désignation</th><th class="num">Montant</th><th>Statut</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="totals"><td colspan="5">TOTAL FACTURÉ</td><td class="num">${formatAr(account.totalAmount)}</td><td></td></tr></tfoot>
  </table>
  <h2>2. Règlements reçus (${account.payments.length})</h2>
  <table>
    <thead><tr><th>Date</th><th class="num">Montant</th><th>Mode de paiement</th><th>Référence</th><th>Reçu par</th></tr></thead>
    <tbody>${payRows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">Aucun règlement enregistré</td></tr>'}</tbody>
    <tfoot><tr class="totals"><td>TOTAL RÉGLÉ</td><td class="num">${formatAr(account.paidAmount)}</td><td colspan="3"></td></tr></tfoot>
  </table>
  <h2>3. Situation du compte</h2>
  <table>
    <tbody>
      <tr><td>Total facturé</td><td class="num">${formatAr(account.totalAmount)}</td></tr>
      <tr><td>Montant payé</td><td class="num">${formatAr(account.paidAmount)}</td></tr>
      <tr class="totals"><td>SOLDE RESTANT</td><td class="num">${formatAr(balance)}</td></tr>
    </tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Veuillez autoriser les fenêtres pop-up pour imprimer le relevé.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  };

  /** Export CSV (relevé mensuel) d'une société — compatible Excel FR (séparateur ;). */
  const exportStatementCsv = (account: CompanyBillingAccount) => {
    const invoices = accountInvoices(account);
    const balance = account.totalAmount - account.paidAmount;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines: string[] = [
      `RELEVE MENSUEL SOCIETE;${esc(account.company)};${esc(monthLabel(account.month))}`,
      `Statut du compte;${esc(billingStatusLabel(account.status))}`,
      '',
      'FACTURES',
      'N° Facture;Date;Patient;Dossier;Désignation;Montant (Ar);Statut',
      ...invoices.map(inv => {
        const p = patientOf(inv);
        return [invoiceNumero(state, inv.id), new Date(inv.createdAt).toLocaleDateString('fr-FR'),
          p ? `${p.lastName} ${p.firstName}` : inv.clientName || '', p?.dossier || '',
          inv.items.map(i => i.description).join(' | '), inv.totalAmount, inv.status === 'paid' ? 'Payée' : 'En attente',
        ].map(esc).join(';');
      }),
      `TOTAL FACTURE;;;${esc(account.totalAmount)}`,
      '',
      'REGLEMENTS',
      'Date;Montant (Ar);Mode de paiement;Référence;Reçu par',
      ...account.payments.map(p => [new Date(p.date).toLocaleDateString('fr-FR'), p.amount, p.method || '', p.reference || '', p.receivedBy || ''].map(esc).join(';')),
      `TOTAL REGLE;;;${esc(account.paidAmount)}`,
      '',
      `SOLDE RESTANT;;;${esc(balance)}`,
    ];
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Releve_${account.company.replace(/[^A-Za-z0-9]+/g, '_')}_${account.month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ======================= RENDU ======================= */

  const TABS: [Tab, string][] = [
    ['accounts', '🏢 Comptes sociétés'],
    ['invoices', '🧾 Factures'],
    ['payments', '💰 Règlements'],
  ];

  const payingBalance = payingAccount ? payingAccount.totalAmount - payingAccount.paidAmount : 0;

  return (
    <div className="space-y-4">
      {/* ===== BARRE DE FILTRES ===== */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-sm shrink-0">
            <Building2 className="w-5 h-5 text-indigo-600" /> Facturation sociétés
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Société</span>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none cursor-pointer">
                <option value="all">Toutes les sociétés</option>
                {state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Calendar className="w-3 h-3" /> Mois</span>
              <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Search className="w-3 h-3" /> Recherche</span>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Patient, dossier, n° facture…"
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none" />
            </label>
          </div>
        </div>
      </div>

      {/* ===== SYNTHÈSE DU FILTRE ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Receipt className="w-3.5 h-3.5" /> Total facturé</div>
          <div className="text-xl font-bold font-mono text-slate-800 mt-1">{formatAr(totalBilled)}</div>
          <div className="text-[11px] text-slate-400 mt-1">{monthAccounts.length} compte(s) + {ungroupedCompanies.length} à regrouper</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Montant payé</div>
          <div className="text-xl font-bold font-mono text-emerald-600 mt-1">{formatAr(totalPaid)}</div>
          <div className="text-[11px] text-slate-400 mt-1">{filteredPayments.length} règlement(s) sur la période</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><HandCoins className="w-3.5 h-3.5" /> Solde restant</div>
          <div className={`text-xl font-bold font-mono mt-1 ${totalBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatAr(totalBalance)}</div>
          <div className="text-[11px] text-slate-400 mt-1">{totalBilled > 0 ? `${Math.round((totalPaid / totalBilled) * 100)} % recouvré` : '—'}</div>
        </div>
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl shadow-sm p-4 text-white">
          <div className="text-[11px] font-semibold uppercase opacity-80">Période affichée</div>
          <div className="text-xl font-bold mt-1 capitalize">{monthLabel(filterMonth)}</div>
          <div className="text-[11px] opacity-80 mt-1">{filterCompany === 'all' ? 'Toutes les sociétés' : filterCompany}</div>
        </div>
      </div>

      {/* ===== ONGLETS ===== */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-3 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap ${tab === k ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ===== ONGLET COMPTES ===== */}
          {tab === 'accounts' && (
            <div className="space-y-4">
              {ungroupedCompanies.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <p className="text-sm text-indigo-800">
                    <strong>{ungroupedCompanies.length}</strong> société(s) ont des factures à regrouper pour {monthLabel(filterMonth)} :
                    {' '}{ungroupedCompanies.join(', ')}.
                  </p>
                  <button onClick={groupAllCompanies}
                    className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer">
                    Tout regrouper
                  </button>
                </div>
              )}

              {monthAccounts.length === 0 && ungroupedCompanies.length === 0 && (
                <div className="p-12 text-center text-slate-400">
                  <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  Aucune facture société pour {filterCompany === 'all' ? 'cette période' : `${filterCompany} sur cette période`}.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {/* Comptes déjà regroupés */}
                {monthAccounts.map(account => {
                  const balance = account.totalAmount - account.paidAmount;
                  const invoices = accountInvoices(account);
                  const open = detailAccountId === account.id;
                  return (
                    <div key={account.id} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                      <div className="p-4 space-y-2 bg-slate-50">
                        <div className="flex justify-between items-start gap-2">
                          <b className="text-sm text-slate-800 flex items-center gap-1.5"><Building2 className="w-4 h-4 text-indigo-600" /> {account.company}</b>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${billingStatusClasses(account.status)}`}>
                            {billingStatusLabel(account.status)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 capitalize">{monthLabel(account.month)} — {invoices.length} facture(s) regroupée(s)</p>
                        <div className="grid grid-cols-3 gap-1 text-xs">
                          <div className="p-1.5 bg-white border rounded text-center"><div className="text-slate-400">Facturé</div><div className="font-mono font-bold text-slate-700">{formatAr(account.totalAmount)}</div></div>
                          <div className="p-1.5 bg-white border rounded text-center"><div className="text-slate-400">Payé</div><div className="font-mono font-bold text-emerald-600">{formatAr(account.paidAmount)}</div></div>
                          <div className="p-1.5 bg-white border rounded text-center"><div className="text-slate-400">Solde</div><div className={`font-mono font-bold ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatAr(balance)}</div></div>
                        </div>
                        {/* Barre de progression du recouvrement */}
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full ${account.status === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${account.totalAmount > 0 ? Math.min(100, (account.paidAmount / account.totalAmount) * 100) : 0}%` }} />
                        </div>
                      </div>
                      <div className="p-3 flex flex-wrap gap-1.5 border-t bg-white">
                        <button onClick={() => setDetailAccountId(open ? null : account.id)}
                          className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {open ? 'Masquer' : 'Détails'}
                        </button>
                        <button onClick={() => openPaymentModal(account)} disabled={balance <= 0}
                          className="px-2 py-1 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded cursor-pointer disabled:opacity-40 flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> Encaisser
                        </button>
                        <button onClick={() => printStatement(account)}
                          className="px-2 py-1 text-[11px] font-semibold bg-slate-700 hover:bg-slate-800 text-white rounded cursor-pointer flex items-center gap-1">
                          <Printer className="w-3 h-3" /> Relevé
                        </button>
                        <button onClick={() => exportStatementCsv(account)}
                          className="px-2 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer flex items-center gap-1">
                          <Download className="w-3 h-3" /> CSV
                        </button>
                        <button onClick={() => deleteAccount(account)}
                          className="ml-auto p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer" title="Supprimer le regroupement (factures conservées)">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Détail : factures regroupées + historique des règlements */}
                      {open && (
                        <div className="p-3 border-t space-y-3 bg-white text-xs">
                          <div>
                            <div className="font-bold text-slate-600 mb-1">Factures des patients rattachés</div>
                            <div className="border rounded-lg max-h-44 overflow-y-auto">
                              <table className="w-full">
                                <thead className="bg-slate-50 sticky top-0"><tr>
                                  <th className="p-1.5 text-left font-semibold text-slate-500">N°</th>
                                  <th className="p-1.5 text-left font-semibold text-slate-500">Patient</th>
                                  <th className="p-1.5 text-right font-semibold text-slate-500">Montant</th>
                                </tr></thead>
                                <tbody>
                                  {invoices.map(inv => {
                                    const p = patientOf(inv);
                                    return (
                                      <tr key={inv.id} className="border-t">
                                        <td className="p-1.5 font-mono text-slate-500">{invoiceNumero(state, inv.id)}</td>
                                        <td className="p-1.5">{p ? `${p.lastName} ${p.firstName}` : inv.clientName || '—'} <span className="text-slate-400">({p?.dossier || '—'})</span></td>
                                        <td className="p-1.5 text-right font-mono">{formatAr(inv.totalAmount)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div>
                            <div className="font-bold text-slate-600 mb-1">Règlements enregistrés</div>
                            {account.payments.length === 0 ? <p className="text-slate-400">Aucun règlement.</p> : (
                              <div className="border rounded-lg max-h-32 overflow-y-auto">
                                <table className="w-full">
                                  <thead className="bg-slate-50 sticky top-0"><tr>
                                    <th className="p-1.5 text-left font-semibold text-slate-500">Date</th>
                                    <th className="p-1.5 text-right font-semibold text-slate-500">Montant</th>
                                    <th className="p-1.5 text-left font-semibold text-slate-500">Mode</th>
                                    <th className="p-1.5 text-left font-semibold text-slate-500">Référence</th>
                                  </tr></thead>
                                  <tbody>
                                    {account.payments.map(p => (
                                      <tr key={p.id} className="border-t">
                                        <td className="p-1.5">{new Date(p.date).toLocaleDateString('fr-FR')}</td>
                                        <td className="p-1.5 text-right font-mono text-emerald-600">{formatAr(p.amount)}</td>
                                        <td className="p-1.5">{p.method || '—'}</td>
                                        <td className="p-1.5 font-mono text-slate-500">{p.reference || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Sociétés à regrouper */}
                {ungroupedCompanies.map(name => {
                  const invoices = getCompanyInvoicesForMonth(state, name, filterMonth);
                  const total = invoices.reduce((s, inv) => s + inv.totalAmount, 0);
                  return (
                    <div key={name} className="border-2 border-dashed border-indigo-200 rounded-xl p-4 bg-indigo-50/40 flex flex-col justify-between gap-3">
                      <div>
                        <b className="text-sm text-slate-800 flex items-center gap-1.5"><Building2 className="w-4 h-4 text-indigo-400" /> {name}</b>
                        <p className="text-xs text-slate-500 mt-1">{invoices.length} facture(s) disponible(s) — {formatAr(total)}</p>
                        <p className="text-[11px] text-indigo-500 mt-0.5">Regroupement mensuel non effectué</p>
                      </div>
                      <button onClick={() => groupCompanyMonth(name)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center justify-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Regrouper le mois
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== ONGLET FACTURES ===== */}
          {tab === 'invoices' && (
            <div className="border rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5 text-left font-semibold text-slate-600">N° Facture</th>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Date</th>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Patient</th>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Dossier</th>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Société</th>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Désignation</th>
                      <th className="p-2.5 text-right font-semibold text-slate-600">Montant</th>
                      <th className="p-2.5 text-center font-semibold text-slate-600">Statut</th>
                      <th className="p-2.5 text-center font-semibold text-slate-600">Regroupée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.length === 0 && (
                      <tr><td colSpan={9} className="p-10 text-center text-slate-400">Aucune facture société trouvée pour ce filtre.</td></tr>
                    )}
                    {filteredInvoices.map(inv => {
                      const p = patientOf(inv);
                      const grouped = state.companyBillingAccounts.some(a => a.invoiceIds.includes(inv.id));
                      return (
                        <tr key={inv.id} className="border-b hover:bg-slate-50">
                          <td className="p-2.5 font-mono text-slate-500">{invoiceNumero(state, inv.id)}</td>
                          <td className="p-2.5 whitespace-nowrap">{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</td>
                          <td className="p-2.5 font-medium">{p ? `${p.lastName} ${p.firstName}` : inv.clientName || '—'}</td>
                          <td className="p-2.5 font-mono text-slate-500">{p?.dossier || '—'}</td>
                          <td className="p-2.5"><span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">🏢 {p?.company}</span></td>
                          <td className="p-2.5 max-w-[260px] truncate" title={inv.items.map(i => i.description).join(', ')}>{inv.items.map(i => i.description).join(', ')}</td>
                          <td className="p-2.5 text-right font-mono font-bold">{formatAr(inv.totalAmount)}</td>
                          <td className="p-2.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {inv.status === 'paid' ? 'Payée' : 'En attente'}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">{grouped ? <Check className="w-3.5 h-3.5 text-emerald-600 inline" /> : <X className="w-3.5 h-3.5 text-slate-300 inline" />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filteredInvoices.length > 0 && (
                    <tfoot className="bg-slate-100 sticky bottom-0">
                      <tr>
                        <td colSpan={6} className="p-2.5 text-right font-bold">TOTAL ({filteredInvoices.length} facture(s)) :</td>
                        <td className="p-2.5 text-right font-mono font-bold text-indigo-700">{formatAr(filteredInvoices.reduce((s, i) => s + i.totalAmount, 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ===== ONGLET RÈGLEMENTS ===== */}
          {tab === 'payments' && (
            <div className="border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Date</th>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Société</th>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Période</th>
                      <th className="p-2.5 text-right font-semibold text-slate-600">Montant</th>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Mode de paiement</th>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Référence</th>
                      <th className="p-2.5 text-left font-semibold text-slate-600">Reçu par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.length === 0 && (
                      <tr><td colSpan={7} className="p-10 text-center text-slate-400">Aucun règlement enregistré pour ce filtre.</td></tr>
                    )}
                    {filteredPayments.map(({ account, payment }) => (
                      <tr key={payment.id} className="border-b hover:bg-slate-50">
                        <td className="p-2.5 whitespace-nowrap">{new Date(payment.date).toLocaleDateString('fr-FR')}</td>
                        <td className="p-2.5 font-medium">{account.company}</td>
                        <td className="p-2.5 capitalize text-slate-500">{monthLabel(account.month)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-600">{formatAr(payment.amount)}</td>
                        <td className="p-2.5">{payment.method || '—'}</td>
                        <td className="p-2.5 font-mono text-slate-500">{payment.reference || '—'}</td>
                        <td className="p-2.5 text-slate-500">{payment.receivedBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredPayments.length > 0 && (
                    <tfoot className="bg-slate-100">
                      <tr>
                        <td colSpan={3} className="p-2.5 text-right font-bold">TOTAL DES RÈGLEMENTS :</td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700">{formatAr(filteredPayments.reduce((s, x) => s + x.payment.amount, 0))}</td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== MODAL : ENREGISTRER UN RÈGLEMENT ===== */}
      {payingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPayingAccount(null)}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold flex items-center gap-2"><CreditCard className="w-5 h-5" /> Règlement — {payingAccount.company}</span>
              <button onClick={() => setPayingAccount(null)} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="p-3 bg-slate-50 border rounded-lg text-xs grid grid-cols-3 gap-2 text-center">
                <div><div className="text-slate-400">Facturé</div><div className="font-mono font-bold">{formatAr(payingAccount.totalAmount)}</div></div>
                <div><div className="text-slate-400">Déjà payé</div><div className="font-mono font-bold text-emerald-600">{formatAr(payingAccount.paidAmount)}</div></div>
                <div><div className="text-slate-400">Solde restant</div><div className="font-mono font-bold text-rose-600">{formatAr(payingBalance)}</div></div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Montant reçu (Ar) — partiel ou complet</label>
                <div className="flex gap-2">
                  <input type="number" min={1} max={payingBalance} value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono outline-none" placeholder="Montant" />
                  <button onClick={() => setPayAmount(String(payingBalance))}
                    className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap">
                    Solder tout
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Date du règlement</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mode de paiement</label>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none cursor-pointer bg-white">
                    {paymentMethods.map(m => (<option key={m} value={m}>{m}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Référence (n° chèque, virement, transaction…)</label>
                <input type="text" value={payReference} onChange={e => setPayReference(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono outline-none" placeholder="Ex : VIR-2026-00123" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setPayingAccount(null)}
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer">Annuler</button>
                <button onClick={savePayment}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Enregistrer le règlement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
