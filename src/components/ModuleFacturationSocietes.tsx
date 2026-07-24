import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState } from '../store';
import {
  addAuditLog, addCompanyBillingPayment, billingStatusClasses, billingStatusLabel,
  formatAr, getCompanyInvoicesForMonth, addJourneyEvent, safeInvoiceItemDescriptions,
} from '../store';
import type { CompanyBillingAccount, Company, CompanySettlementMode, Invoice } from '../types';
import {
  Building2, Calendar, Check, CreditCard, Download, Eye, HandCoins,
  Printer, Receipt, Search, Trash2, Wallet, X, FileText, BadgeCheck,
  ListChecks, Hash, User as UserIcon,
} from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }

type Tab = 'global' | 'individual' | 'liste';

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

const settlementModeLabel = (mode: CompanySettlementMode): string =>
  mode === 'monthly_global' ? 'Global mensuel' : 'Individuel par facture';

const invoiceStatusLabel = (inv: Invoice, state: AppState) => {
  // Un compte société qui a réglé cette facture ?
  const totalPaid = state.companyBillingAccounts
    .flatMap(a => a.payments.filter(p => p.invoiceIds?.includes(inv.id)).map(p => p.amount))
    .reduce((s, v) => s + v, 0);
  if (inv.status === 'paid') return { label: 'Payée', color: 'bg-emerald-100 text-emerald-700', paid: inv.totalAmount, balance: 0 };
  if (totalPaid >= inv.totalAmount) return { label: 'Payée', color: 'bg-emerald-100 text-emerald-700', paid: inv.totalAmount, balance: 0 };
  if (totalPaid > 0) return { label: 'Partiellement payée', color: 'bg-amber-100 text-amber-700', paid: totalPaid, balance: inv.totalAmount - totalPaid };
  return { label: 'Impayée', color: 'bg-rose-100 text-rose-700', paid: 0, balance: inv.totalAmount };
};

const invoiceDesignation = (inv: Invoice, state: AppState, separator = ', ') => {
  const st = invoiceStatusLabel(inv, state);
  return safeInvoiceItemDescriptions(inv, st.balance <= 0).join(separator);
};

export default function ModuleFacturationSocietes({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('liste');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth());
  const [filterStatus, setFilterStatus] = useState<'all' | 'impaye' | 'partiel' | 'payee'>('all');
  const [filterSettlement, setFilterSettlement] = useState<'all' | CompanySettlementMode>('all');
  const [search, setSearch] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);

  // ====== MODAL : Règlement global mensuel ======
  const [payingAccount, setPayingAccount] = useState<CompanyBillingAccount | null>(null);
  const [payDate, setPayDate] = useState(today());
  const [payMethod, setPayMethod] = useState('Virement');
  const [payReference, setPayReference] = useState('');
  const [payObservation, setPayObservation] = useState('');

  // ====== MODAL : Règlement individuel ======
  const [payingIndividual, setPayingIndividual] = useState<{ ids: string[] } | null>(null);
  const [indivAmount, setIndivAmount] = useState('');
  const [indivDate, setIndivDate] = useState(today());
  const [indivMethod, setIndivMethod] = useState('Virement');
  const [indivReference, setIndivReference] = useState('');
  const [indivObservation, setIndivObservation] = useState('');

  const paymentMethods = state.ticketSettings?.paymentMethods?.length
    ? state.ticketSettings.paymentMethods
    : ['Virement', 'Chèque', 'Mobile Money', 'Espèces'];

  // Garde d'accès : le responsable facturation et l'administrateur ont un accès complet.
  if (state.currentUser?.role !== 'billing' && state.currentUser?.role !== 'admin') {
    return (
      <div className="p-12 text-center text-rose-700 font-semibold bg-rose-50 border border-rose-200 rounded-xl">
        Accès refusé — le module « Facturation sociétés » est réservé au rôle Responsable facturation ou Administrateur.
      </div>
    );
  }

  /* ======================= DONNÉES ======================= */

  /** Toutes les factures société (quelque soit le mois), avec patient et société. */
  const allCompanyInvoices = useMemo(() => {
    return state.invoices
      .map(inv => {
        const patient = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : undefined;
        const companyName = patient?.company || inv.clientName;
        const company = state.companies.find(c => c.name === companyName);
        return { inv, patient, company, companyName: companyName || '' };
      })
      .filter(x => x.companyName && x.company);
  }, [state]);

  /** Liste filtrée des factures sociétés pour l'onglet principal. */
  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCompanyInvoices.filter(({ inv, patient, company }) => {
      if (!company) return false;
      if (filterCompany !== 'all' && company.name !== filterCompany) return false;
      if (!inv.createdAt.startsWith(filterMonth)) return false;
      if (filterSettlement !== 'all' && company.settlementMode !== filterSettlement) return false;
      const st = invoiceStatusLabel(inv, state);
      if (filterStatus === 'impaye' && st.label !== 'Impayée') return false;
      if (filterStatus === 'partiel' && st.label !== 'Partiellement payée') return false;
      if (filterStatus === 'payee' && st.label !== 'Payée') return false;
      if (!q) return true;
      return [
        company.name, patient?.lastName, patient?.firstName, patient?.dossier, inv.id,
      ].some(v => (v || '').toLowerCase().includes(q));
    });
  }, [allCompanyInvoices, filterCompany, filterMonth, filterStatus, filterSettlement, search, state]);

  /** Comptes mensuels globaux (sociétés en monthly_global). */
  const monthAccounts = state.companyBillingAccounts
    .filter(a => a.month === filterMonth && (filterCompany === 'all' || a.company === filterCompany))
    .filter(a => state.companies.find(c => c.name === a.company)?.settlementMode === 'monthly_global')
    .sort((a, b) => a.company.localeCompare(b.company));

  const monthlyGlobalCompanies = state.companies.filter(c => c.settlementMode === 'monthly_global');
  const individualCompanies = state.companies.filter(c => c.settlementMode === 'per_invoice');

  /** Entreprises en global mensuel qui ont des factures sur le mois mais pas encore de compte. */
  const ungroupedCompanies = monthlyGlobalCompanies
    .map(c => c.name)
    .filter(name => filterCompany === 'all' || name === filterCompany)
    .filter(name => !state.companyBillingAccounts.some(a => a.company === name && a.month === filterMonth))
    .filter(name => getCompanyInvoicesForMonth(state, name, filterMonth).length > 0)
    .sort();

  /* ======================= TOTAUX ======================= */
  const totalBilled = filteredInvoices.reduce((s, x) => s + x.inv.totalAmount, 0);
  const totalPaid = filteredInvoices.reduce((s, x) => s + invoiceStatusLabel(x.inv, state).paid, 0);
  const totalBalance = totalBilled - totalPaid;

  /* ======================= ACTIONS ======================= */

  const groupCompanyMonth = (company: string) => {
    const invoices = getCompanyInvoicesForMonth(state, company, filterMonth);
    if (!invoices.length) return;
    if (state.companyBillingAccounts.some(a => a.company === company && a.month === filterMonth)) return;
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

  const groupAllCompanies = () => {
    if (!ungroupedCompanies.length) return;
    if (!confirm(`Regrouper les factures de ${ungroupedCompanies.length} société(s) pour ${monthLabel(filterMonth)} ?`)) return;
    ungroupedCompanies.forEach(groupCompanyMonth);
  };

  const deleteAccount = (account: CompanyBillingAccount) => {
    if (!confirm(`Supprimer le regroupement ${account.company} — ${monthLabel(account.month)} ?\n\nLes factures d'origine sont conservées.`)) return;
    setState(prev => {
      const next = { ...prev, companyBillingAccounts: prev.companyBillingAccounts.filter(a => a.id !== account.id) };
      addAuditLog(next, 'SUPPRESSION_REGROUPEMENT', `${account.company} — ${monthLabel(account.month)}`);
      return next;
    });
    if (detailAccountId === account.id) setDetailAccountId(null);
  };

  /** Régler TOUTES les factures impayées d'un mois pour une société (global mensuel) */
  const openGlobalSettleModal = (account: CompanyBillingAccount) => {
    setPayingAccount(account);
    setPayDate(today());
    setPayMethod(paymentMethods.includes('Virement') ? 'Virement' : paymentMethods[0]);
    setPayReference('');
    setPayObservation('');
  };

  const saveGlobalPayment = () => {
    if (!payingAccount) return;
    if (!payDate) { alert('Date requise.'); return; }
    const iso = new Date(`${payDate}T12:00:00`).toISOString();
    const balance = payingAccount.totalAmount - payingAccount.paidAmount;
    if (balance <= 0) { alert('Ce relevé est déjà soldé.'); return; }
    setState(prev => {
      const next = { ...prev };
      const payId = uuidv4();
      // Marquer les factures impayées comme payées
      next.invoices = next.invoices.map(inv => {
        if (!payingAccount.invoiceIds.includes(inv.id)) return inv;
        if (inv.status === 'paid') return inv;
        return { ...inv, status: 'paid' as const, paidAt: iso, paidBy: prev.currentUser?.id };
      });
      // Marquer patients comme invoice_paid si toutes leurs factures du mois sont payées
      next.patients = next.patients.map(p => {
        if (p.clientType !== 'societe' || p.company !== payingAccount.company) return p;
        return { ...p, lastVisitAt: iso };
      });
      // Ajouter le paiement sur le compte et le solder
      next.companyBillingAccounts = next.companyBillingAccounts.map(a => {
        if (a.id !== payingAccount.id) return a;
        return {
          ...a,
          paidAmount: a.totalAmount,
          status: 'paid' as const,
          finalSettlementAmount: balance,
          finalSettlementDate: iso,
          finalSettlementMethod: payMethod,
          finalSettlementReference: payReference || undefined,
          finalSettlementObservation: payObservation || undefined,
          settledBy: prev.currentUser?.id,
          settledByName: prev.currentUser?.name,
          payments: [...a.payments, {
            id: payId, amount: balance, date: iso, method: payMethod,
            reference: payReference || undefined, observation: payObservation || undefined,
            invoiceIds: a.invoiceIds,
            receivedBy: prev.currentUser?.name, receivedByUserId: prev.currentUser?.id,
          }],
        };
      });
      // Journal d'audit + notifications
      addAuditLog(next, 'RELEVE_MENSUEL_SOLDE',
        `${payingAccount.company} — ${monthLabel(payingAccount.month)} — ${formatAr(balance)} (${payMethod}${payReference ? ' — ' + payReference : ''})`);
      payingAccount.invoiceIds.forEach(iid => {
        const inv = next.invoices.find(x => x.id === iid);
        if (inv?.patientId) {
          addJourneyEvent(next, { patientId: inv.patientId, department: 'administration', action: 'Facture réglée (relevé mensuel société)', status: 'invoice_paid', details: `${payingAccount.company} — ${formatAr(inv.totalAmount)}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, invoiceId: iid, timestamp: iso });
        }
      });
      return next;
    });
    setPayingAccount(null);
  };

  /** Règlement d'une ou plusieurs factures en mode individuel */
  const openIndividualSettle = (ids: string[]) => {
    if (!ids.length) return;
    setPayingIndividual({ ids });
    const total = allCompanyInvoices
      .filter(x => ids.includes(x.inv.id))
      .reduce((s, x) => s + invoiceStatusLabel(x.inv, state).balance, 0);
    setIndivAmount(String(total));
    setIndivDate(today());
    setIndivMethod(paymentMethods.includes('Virement') ? 'Virement' : paymentMethods[0]);
    setIndivReference('');
    setIndivObservation('');
  };

  const saveIndividualPayment = () => {
    if (!payingIndividual) return;
    const amount = Number(indivAmount);
    if (!amount || amount <= 0) { alert('Montant invalide.'); return; }
    if (!indivDate) { alert('Date requise.'); return; }
    const iso = new Date(`${indivDate}T12:00:00`).toISOString();
    // On ajoute le paiement à un « compte individuel » par société + mois s'il existe,
    // sinon on en crée un nouveau (compte technique marqué pour le suivi des paiements individuels).
    setState(prev => {
      const next = { ...prev };
      const byCompany = new Map<string, Invoice[]>();
      payingIndividual.ids.forEach(iid => {
        const inv = next.invoices.find(i => i.id === iid);
        if (!inv) return;
        const p = inv.patientId ? next.patients.find(x => x.id === inv.patientId) : undefined;
        const cname = p?.company;
        if (!cname) return;
        if (!byCompany.has(cname)) byCompany.set(cname, []);
        byCompany.get(cname)!.push(inv);
      });
      // Répartir le montant au prorata des soldes par facture (paiement partiel possible)
      let remaining = amount;
      const paidInvoiceIds: string[] = [];
      next.companyBillingAccounts = next.companyBillingAccounts.map(a => a); // copie
      byCompany.forEach((invs, companyName) => {
        const m = filterMonth;
        let account = next.companyBillingAccounts.find(a => a.company === companyName && a.month === m);
        if (!account) {
          // Création d'un compte technique de suivi (il regroupe les factures réglées + futures)
          const allMonth = getCompanyInvoicesForMonth(next, companyName, m).map(i => i.id);
          account = {
            id: uuidv4(), company: companyName, month: m, invoiceIds: allMonth,
            totalAmount: getCompanyInvoicesForMonth(next, companyName, m).reduce((s, i) => s + i.totalAmount, 0),
            paidAmount: 0, status: 'open' as const, createdAt: new Date().toISOString(), payments: [],
          };
          next.companyBillingAccounts = [...next.companyBillingAccounts, account];
        }
        const payId = uuidv4();
        const payAmount = Math.min(remaining, invs.reduce((s, inv) => s + Math.max(0, inv.totalAmount - (inv.status === 'paid' ? inv.totalAmount : 0)), 0));
        // Marquage des factures : si le montant couvre le solde de la facture → paid ; sinon on garde pending (partiel)
        // Pour simplifier le flux, on applique le paiement facture par facture en marquant 'paid'
        // lorsque le solde de la facture est entièrement couvert.
        let leftForCompany = payAmount;
        next.invoices = next.invoices.map(inv => {
          if (!invs.find(x => x.id === inv.id)) return inv;
          if (inv.status === 'paid') { paidInvoiceIds.push(inv.id); return inv; }
          const bal = inv.totalAmount;
          if (leftForCompany >= bal) {
            leftForCompany -= bal;
            paidInvoiceIds.push(inv.id);
            return { ...inv, status: 'paid' as const, paidAt: iso, paidBy: prev.currentUser?.id };
          }
          return inv;
        });
        remaining = Math.max(0, remaining - payAmount);
        // Ajout du paiement au compte
        next.companyBillingAccounts = next.companyBillingAccounts.map(a => {
          if (a.id !== account!.id) return a;
          const totalPaidOnAccount = a.payments.reduce((s, p) => s + p.amount, 0) + payAmount;
          return {
            ...a,
            paidAmount: Math.min(a.totalAmount, totalPaidOnAccount),
            status: totalPaidOnAccount >= a.totalAmount ? 'paid' as const : totalPaidOnAccount > 0 ? 'partial' as const : 'open' as const,
            payments: [...a.payments, {
              id: payId, amount: payAmount, date: iso, method: indivMethod,
              reference: indivReference || undefined, observation: indivObservation || undefined,
              invoiceIds: invs.map(i => i.id),
              receivedBy: prev.currentUser?.name, receivedByUserId: prev.currentUser?.id,
            }],
          };
        });
      });
      addAuditLog(next, 'REGLEMENT_INDIVIDUEL_FACTURES',
        `${payingIndividual.ids.length} facture(s) — ${formatAr(amount)} (${indivMethod}${indivReference ? ' — ' + indivReference : ''})`);
      paidInvoiceIds.forEach(iid => {
        const inv = next.invoices.find(x => x.id === iid);
        if (inv?.patientId) {
          addJourneyEvent(next, { patientId: inv.patientId, department: 'administration', action: 'Facture réglée (individuel)', status: 'invoice_paid', details: `${formatAr(inv.totalAmount)} (${indivMethod})`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, invoiceId: iid, timestamp: iso });
        }
      });
      return next;
    });
    setSelectedInvoiceIds(new Set());
    setPayingIndividual(null);
  };

  /* ======================= IMPRESSION / EXPORT ======================= */

  const accountInvoices = (account: CompanyBillingAccount): Invoice[] =>
    account.invoiceIds
      .map(id => state.invoices.find(i => i.id === id))
      .filter((i): i is Invoice => Boolean(i))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const patientOf = (inv: Invoice) => (inv.patientId ? state.patients.find(p => p.id === inv.patientId) : undefined);

  const printStatement = (account: CompanyBillingAccount, invoiceIds?: string[]) => {
    const invoices = invoiceIds ? invoiceIds.map(id => state.invoices.find(i => i.id === id)).filter((i): i is Invoice => Boolean(i)) : accountInvoices(account);
    const ts = state.ticketSettings;
    const rows = invoices.map(inv => {
      const p = patientOf(inv);
      const st = invoiceStatusLabel(inv, state);
      return `<tr><td>${inv.id.slice(0, 8).toUpperCase()}</td><td>${new Date(inv.createdAt).toLocaleDateString('fr-FR')}</td><td>${p ? `${p.lastName} ${p.firstName}` : inv.clientName || '—'}</td><td>${p?.dossier || '—'}</td><td>${invoiceDesignation(inv, state)}</td><td class="num">${formatAr(inv.totalAmount)}</td><td class="num">${formatAr(st.paid)}</td><td class="num">${formatAr(st.balance)}</td><td>${st.label}</td></tr>`;
    }).join('');
    const payRows = (invoiceIds
        ? account.payments.filter(p => p.invoiceIds?.some(id => invoiceIds.includes(id)))
        : account.payments)
      .map(p => `<tr><td>${new Date(p.date).toLocaleDateString('fr-FR')}</td><td class="num">${formatAr(p.amount)}</td><td>${p.method || '—'}</td><td>${p.reference || '—'}</td><td>${p.receivedBy || '—'}</td><td>${p.observation || ''}</td></tr>`).join('');
    const totalAmt = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalPaidAmt = invoices.reduce((s, i) => s + invoiceStatusLabel(i, state).paid, 0);
    const bal = totalAmt - totalPaidAmt;
    const title = invoiceIds ? 'RELEVÉ DE FACTURES SÉLECTIONNÉES' : 'RELEVÉ MENSUEL SOCIÉTÉ';
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" />
<title>${account.company} — ${monthLabel(account.month)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:24px}h1{font-size:18px;margin:0 0 2px}h2{font-size:14px;margin:18px 0 6px}.head{display:flex;justify-content:space-between;border-bottom:2px solid #1e40af;padding-bottom:10px;margin-bottom:14px}.muted{color:#64748b;font-size:12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left}th{background:#f1f5f9}.num{text-align:right;white-space:nowrap}.totals td{font-weight:bold;background:#f8fafc}.status{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:bold;background:#d1fae5;color:#047857}@media print{.noprint{display:none}}</style></head><body>
<div class="head"><div><h1>${ts.facilityName}</h1><div class="muted">${ts.address||''} ${ts.phone?'— '+ts.phone:''} ${ts.nif?'— NIF: '+ts.nif:''}</div></div><div style="text-align:right"><h1>${title}</h1><div class="muted">Édité le ${new Date().toLocaleDateString('fr-FR')} par ${state.currentUser?.name || ''}</div></div></div>
<p><strong>Société :</strong> ${account.company} &nbsp;|&nbsp; <strong>Période :</strong> ${monthLabel(account.month)} &nbsp;|&nbsp; <strong>État :</strong> <span class="status">${billingStatusLabel(account.status).toUpperCase()}</span></p>
<h2>Factures (${invoices.length})</h2>
<table><thead><tr><th>N° Facture</th><th>Date</th><th>Patient / Salarié</th><th>Dossier</th><th>Désignation</th><th class="num">Facturé</th><th class="num">Réglé</th><th class="num">Solde</th><th>Statut</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="totals"><td colspan="5">TOTAUX</td><td class="num">${formatAr(totalAmt)}</td><td class="num">${formatAr(totalPaidAmt)}</td><td class="num">${formatAr(bal)}</td><td></td></tr></tfoot></table>
<h2>Règlements</h2>
<table><thead><tr><th>Date</th><th class="num">Montant</th><th>Mode</th><th>Référence</th><th>Reçu par</th><th>Observation</th></tr></thead><tbody>${payRows||'<tr><td colspan="6" style="text-align:center;color:#94a3b8">Aucun règlement</td></tr>'}</tbody></table>
<script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Veuillez autoriser les pop-ups.'); return; }
    w.document.write(html); w.document.close(); w.focus();
  };

  const exportCsv = (account: CompanyBillingAccount, invoiceIds?: string[]) => {
    const invoices = invoiceIds ? invoiceIds.map(id => state.invoices.find(i => i.id === id)).filter((i): i is Invoice => Boolean(i)) : accountInvoices(account);
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      `RELEVE;${esc(account.company)};${esc(monthLabel(account.month))}`,
      'N° Facture;Date;Patient;Dossier;Designation;Montant;Regle;Solde;Statut',
      ...invoices.map(inv => {
        const p = patientOf(inv); const st = invoiceStatusLabel(inv, state);
        return [inv.id.slice(0,8).toUpperCase(), new Date(inv.createdAt).toLocaleDateString('fr-FR'), p ? `${p.lastName} ${p.firstName}` : inv.clientName||'', p?.dossier||'', invoiceDesignation(inv, state, ' | '), inv.totalAmount, st.paid, st.balance, st.label].map(esc).join(';');
      }),
    ];
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `Releve_${account.company.replace(/[^A-Za-z0-9]+/g,'_')}_${account.month}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  /* ======================= RENDU ======================= */

  const TABS: [Tab, string, JSX.Element][] = [
    ['liste', <span className="flex items-center gap-1"><ListChecks className="w-4 h-4" /> Toutes les factures</span>, undefined],
    ['global', <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> Règlement global mensuel</span>, undefined],
    ['individual', <span className="flex items-center gap-1"><Receipt className="w-4 h-4" /> Règlement individuel</span>, undefined],
  ];

  return (
    <div className="space-y-4">
      {/* ===== BARRE DE FILTRES ===== */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-sm shrink-0">
            <Building2 className="w-5 h-5 text-indigo-600" /> Facturation sociétés
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 flex-1">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Building2 className="w-3 h-3" /> Société</span>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none cursor-pointer">
                <option value="all">Toutes les sociétés</option>
                {state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Calendar className="w-3 h-3" /> Mois</span>
              <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> Statut</span>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none cursor-pointer">
                <option value="all">Tous les statuts</option>
                <option value="impaye">Impayée</option>
                <option value="partiel">Partiellement payée</option>
                <option value="payee">Payée</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><FileText className="w-3 h-3" /> Sous-mode</span>
              <select value={filterSettlement} onChange={e => setFilterSettlement(e.target.value as any)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none cursor-pointer">
                <option value="all">Tous les sous-modes</option>
                <option value="monthly_global">Global mensuel</option>
                <option value="per_invoice">Individuel par facture</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Search className="w-3 h-3" /> Recherche</span>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Patient, dossier, n° facture…" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white outline-none" />
            </label>
          </div>
        </div>
      </div>

      {/* ===== SYNTHÈSE ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Receipt className="w-3.5 h-3.5" /> Total facturé</div>
          <div className="text-xl font-bold font-mono text-slate-800 mt-1">{formatAr(totalBilled)}</div>
          <div className="text-[11px] text-slate-400 mt-1">{filteredInvoices.length} facture(s)</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Total réglé</div>
          <div className="text-xl font-bold font-mono text-emerald-600 mt-1">{formatAr(totalPaid)}</div>
          <div className="text-[11px] text-slate-400 mt-1">{monthAccounts.length} relevé(s) mensuel(s)</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1"><HandCoins className="w-3.5 h-3.5" /> Solde restant</div>
          <div className={`text-xl font-bold font-mono mt-1 ${totalBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatAr(totalBalance)}</div>
        </div>
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl shadow-sm p-4 text-white">
          <div className="text-[11px] font-semibold uppercase opacity-80">Période</div>
          <div className="text-xl font-bold mt-1 capitalize">{monthLabel(filterMonth)}</div>
          <div className="text-[11px] opacity-80 mt-1">{filterCompany === 'all' ? 'Toutes les sociétés' : filterCompany}</div>
        </div>
      </div>

      {/* ===== ONGLETS ===== */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-3 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap flex items-center gap-1 ${tab === k ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ===== ONGLET LISTE DES FACTURES ===== */}
          {tab === 'liste' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-600">
                  Mode général de l'hôpital : <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-xs">Espèces</span> pour les comptoirs / individuels ;
                  <span className="ml-1 px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold text-xs">Crédit</span> pour toutes les sociétés.
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    const ids = Array.from(selectedInvoiceIds);
                    if (!ids.length) return alert('Sélectionnez au moins une facture.');
                    openIndividualSettle(ids);
                  }} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1">
                    <CreditCard className="w-4 h-4" /> Régler {selectedInvoiceIds.size > 0 ? `${selectedInvoiceIds.size} facture(s)` : 'la sélection'}
                  </button>
                </div>
              </div>
              <div className="border rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="p-2 w-8"><input type="checkbox" checked={filteredInvoices.length > 0 && filteredInvoices.every(x => selectedInvoiceIds.has(x.inv.id))} onChange={e => {
                        if (e.target.checked) setSelectedInvoiceIds(new Set(filteredInvoices.map(x => x.inv.id)));
                        else setSelectedInvoiceIds(new Set());
                      }} /></th>
                      <th className="p-2 text-left font-semibold text-slate-600">N° Facture</th>
                      <th className="p-2 text-left font-semibold text-slate-600">Date</th>
                      <th className="p-2 text-left font-semibold text-slate-600">Société</th>
                      <th className="p-2 text-left font-semibold text-slate-600">Patient / Salarié</th>
                      <th className="p-2 text-left font-semibold text-slate-600">Dossier</th>
                      <th className="p-2 text-right font-semibold text-slate-600">Facturé</th>
                      <th className="p-2 text-right font-semibold text-slate-600">Réglé</th>
                      <th className="p-2 text-right font-semibold text-slate-600">Solde</th>
                      <th className="p-2 text-center font-semibold text-slate-600">Statut</th>
                      <th className="p-2 text-center font-semibold text-slate-600">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.length === 0 && (
                      <tr><td colSpan={11} className="p-10 text-center text-slate-400">Aucune facture société pour ce filtre.</td></tr>
                    )}
                    {filteredInvoices.map(({ inv, patient, company }) => {
                      const st = invoiceStatusLabel(inv, state);
                      return (
                        <tr key={inv.id} className="border-b hover:bg-slate-50">
                          <td className="p-2 text-center">
                            {st.balance > 0 && (
                              <input type="checkbox" checked={selectedInvoiceIds.has(inv.id)}
                                onChange={e => {
                                  const next = new Set(selectedInvoiceIds);
                                  if (e.target.checked) next.add(inv.id); else next.delete(inv.id);
                                  setSelectedInvoiceIds(next);
                                }} />
                            )}
                          </td>
                          <td className="p-2 font-mono text-slate-600 flex items-center gap-1"><Hash className="w-3 h-3" /> {inv.id.slice(0,8).toUpperCase()}</td>
                          <td className="p-2 whitespace-nowrap">{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</td>
                          <td className="p-2">
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">🏢 {company?.name}</span>
                            <span className="ml-1 text-[10px] text-slate-500">
                              {company?.settlementMode === 'monthly_global' ? '📅 Global' : '🧾 Individuel'}
                            </span>
                          </td>
                          <td className="p-2 font-medium flex items-center gap-1"><UserIcon className="w-3 h-3 text-slate-400" />{patient ? `${patient.lastName} ${patient.firstName}` : inv.clientName || '—'}</td>
                          <td className="p-2 font-mono text-slate-500">{patient?.dossier || '—'}</td>
                          <td className="p-2 text-right font-mono font-bold">{formatAr(inv.totalAmount)}</td>
                          <td className="p-2 text-right font-mono text-emerald-600">{formatAr(st.paid)}</td>
                          <td className="p-2 text-right font-mono text-rose-600">{formatAr(st.balance)}</td>
                          <td className="p-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${st.color}`}>{st.label}</span></td>
                          <td className="p-2 text-center space-x-1">
                            {st.balance > 0 && company?.settlementMode === 'per_invoice' && (
                              <button onClick={() => openIndividualSettle([inv.id])} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold cursor-pointer">Régler</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== ONGLET GLOBAL MENSUEL ===== */}
          {tab === 'global' && (
            <div className="space-y-4">
              {ungroupedCompanies.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <p className="text-sm text-indigo-800">
                    <strong>{ungroupedCompanies.length}</strong> société(s) en « Global mensuel » ont des factures non regroupées pour {monthLabel(filterMonth)}.
                  </p>
                  <button onClick={groupAllCompanies} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer">Tout regrouper</button>
                </div>
              )}
              {monthAccounts.length === 0 && ungroupedCompanies.length === 0 && (
                <div className="p-12 text-center text-slate-400"><Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />Aucun relevé mensuel pour ce filtre.</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {monthAccounts.map(account => {
                  const invoices = accountInvoices(account);
                  const balance = account.totalAmount - account.paidAmount;
                  const open = detailAccountId === account.id;
                  return (
                    <div key={account.id} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                      <div className="p-4 space-y-2 bg-slate-50">
                        <div className="flex justify-between items-start gap-2">
                          <b className="text-sm text-slate-800 flex items-center gap-1.5"><Building2 className="w-4 h-4 text-indigo-600" /> {account.company}</b>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${billingStatusClasses(account.status)}`}>{billingStatusLabel(account.status)}</span>
                        </div>
                        <p className="text-xs text-slate-500 capitalize">{monthLabel(account.month)} — {invoices.length} facture(s) — 📅 Global mensuel</p>
                        <div className="grid grid-cols-3 gap-1 text-xs">
                          <div className="p-1.5 bg-white border rounded text-center"><div className="text-slate-400">Facturé</div><div className="font-mono font-bold">{formatAr(account.totalAmount)}</div></div>
                          <div className="p-1.5 bg-white border rounded text-center"><div className="text-slate-400">Réglé</div><div className="font-mono font-bold text-emerald-600">{formatAr(account.paidAmount)}</div></div>
                          <div className="p-1.5 bg-white border rounded text-center"><div className="text-slate-400">Solde</div><div className={`font-mono font-bold ${balance>0?'text-rose-600':'text-emerald-600'}`}>{formatAr(balance)}</div></div>
                        </div>
                      </div>
                      <div className="p-3 flex flex-wrap gap-1.5 border-t bg-white">
                        <button onClick={() => setDetailAccountId(open?null:account.id)} className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer flex items-center gap-1"><Eye className="w-3 h-3"/>{open?'Masquer':'Détails'}</button>
                        {balance > 0 && (
                          <button onClick={() => openGlobalSettleModal(account)} className="px-2 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer flex items-center gap-1"><BadgeCheck className="w-3 h-3"/>Régler tout le mois</button>
                        )}
                        <button onClick={() => printStatement(account)} className="px-2 py-1 text-[11px] font-semibold bg-slate-700 hover:bg-slate-800 text-white rounded cursor-pointer flex items-center gap-1"><Printer className="w-3 h-3"/>Imprimer</button>
                        <button onClick={() => exportCsv(account)} className="px-2 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer flex items-center gap-1"><Download className="w-3 h-3"/>CSV</button>
                        <button onClick={() => deleteAccount(account)} className="ml-auto p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5"/></button>
                      </div>
                      {open && (
                        <div className="p-3 border-t space-y-3 text-xs">
                          <div className="border rounded max-h-48 overflow-y-auto">
                            <table className="w-full">
                              <thead className="bg-slate-50 sticky top-0"><tr><th className="p-1.5 text-left">Date</th><th className="p-1.5 text-left">Patient</th><th className="p-1.5 text-right">Montant</th><th className="p-1.5 text-center">Statut</th></tr></thead>
                              <tbody>{invoices.map(inv => {
                                const p = patientOf(inv); const st = invoiceStatusLabel(inv, state);
                                return (<tr key={inv.id} className="border-t"><td className="p-1.5">{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</td><td className="p-1.5">{p?`${p.lastName} ${p.firstName}`:'—'}</td><td className="p-1.5 text-right font-mono">{formatAr(inv.totalAmount)}</td><td className="p-1.5 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${st.color}`}>{st.label}</span></td></tr>);
                              })}</tbody>
                            </table>
                          </div>
                          {account.finalSettlementObservation && (
                            <div className="p-2 bg-slate-50 border rounded text-slate-600"><strong>Observation :</strong> {account.finalSettlementObservation}</div>
                          )}
                          <div className="text-slate-500">Validé par : <strong>{account.settledByName || '—'}</strong></div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {ungroupedCompanies.map(name => {
                  const invoices = getCompanyInvoicesForMonth(state, name, filterMonth);
                  const total = invoices.reduce((s,i)=>s+i.totalAmount,0);
                  return (
                    <div key={name} className="border-2 border-dashed border-indigo-200 rounded-xl p-4 bg-indigo-50/40 flex flex-col justify-between gap-3">
                      <div>
                        <b className="text-sm flex items-center gap-1.5"><Building2 className="w-4 h-4 text-indigo-400"/>{name}</b>
                        <p className="text-xs text-slate-500 mt-1">{invoices.length} facture(s) — {formatAr(total)} — 📅 Global mensuel</p>
                      </div>
                      <button onClick={()=>groupCompanyMonth(name)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center justify-center gap-1"><Check className="w-3.5 h-3.5"/>Créer le relevé</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== ONGLET INDIVIDUEL ===== */}
          {tab === 'individual' && (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                Sous-mode : <strong>Individuel par facture</strong> — cochez les factures à régler et cliquez sur « Régler la sélection » dans l'onglet « Toutes les factures », ou cliquez sur « Régler » à droite d'une facture.
              </div>
              <div className="border rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-2 text-left">Société</th>
                      <th className="p-2 text-left">Mode</th>
                      <th className="p-2 text-right">Factures dus</th>
                      <th className="p-2 text-right">Solde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {individualCompanies.map(c => {
                      const invs = allCompanyInvoices.filter(x => x.company?.name === c.name && x.inv.createdAt.startsWith(filterMonth));
                      const n = invs.filter(x => invoiceStatusLabel(x.inv,state).balance > 0).length;
                      const bal = invs.reduce((s,x)=>s+invoiceStatusLabel(x.inv,state).balance,0);
                      return (
                        <tr key={c.id} className="border-t">
                          <td className="p-2 font-bold flex items-center gap-1"><Building2 className="w-4 h-4 text-indigo-500"/>{c.name}</td>
                          <td className="p-2"><span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">🧾 Individuel par facture</span></td>
                          <td className="p-2 text-right font-mono">{n}</td>
                          <td className="p-2 text-right font-mono font-bold text-rose-600">{formatAr(bal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== MODAL : RÈGLEMENT GLOBAL ===== */}
      {payingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>setPayingAccount(null)}>
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold flex items-center gap-2"><BadgeCheck className="w-5 h-5"/> Régler toutes les factures du mois — {payingAccount.company}</span>
              <button onClick={()=>setPayingAccount(null)} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="p-3 bg-slate-50 border rounded-lg text-xs grid grid-cols-3 gap-2 text-center">
                <div><div className="text-slate-400">Facturé</div><div className="font-mono font-bold">{formatAr(payingAccount.totalAmount)}</div></div>
                <div><div className="text-slate-400">Déjà réglé</div><div className="font-mono font-bold text-emerald-600">{formatAr(payingAccount.paidAmount)}</div></div>
                <div><div className="text-slate-400">Solde</div><div className="font-mono font-bold text-rose-600">{formatAr(payingAccount.totalAmount-payingAccount.paidAmount)}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Date de paiement</label><input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none"/></div>
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Mode de paiement</label><select value={payMethod} onChange={e=>setPayMethod(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white cursor-pointer">{paymentMethods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
              </div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Référence de paiement</label><input type="text" value={payReference} onChange={e=>setPayReference(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono outline-none" placeholder="Ex: VIR-2026-01234"/></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Observation</label><textarea value={payObservation} onChange={e=>setPayObservation(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" placeholder="Note libre…"/></div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={()=>setPayingAccount(null)} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer">Annuler</button>
                <button onClick={saveGlobalPayment} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"><Check className="w-3.5 h-3.5"/>Valider et solder le relevé</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL : RÈGLEMENT INDIVIDUEL ===== */}
      {payingIndividual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>setPayingIndividual(null)}>
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold flex items-center gap-2"><CreditCard className="w-5 h-5"/> Règlement individuel — {payingIndividual.ids.length} facture(s)</span>
              <button onClick={()=>setPayingIndividual(null)} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Montant (Ar)</label><input type="number" min={1} value={indivAmount} onChange={e=>setIndivAmount(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono outline-none"/></div>
                <div><label className="block text-xs font-semibold text-slate-600 mb-1">Date</label><input type="date" value={indivDate} onChange={e=>setIndivDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none"/></div>
              </div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Mode de paiement</label><select value={indivMethod} onChange={e=>setIndivMethod(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white cursor-pointer">{paymentMethods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Référence</label><input type="text" value={indivReference} onChange={e=>setIndivReference(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono outline-none"/></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1">Observation</label><textarea value={indivObservation} onChange={e=>setIndivObservation(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm outline-none"/></div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={()=>setPayingIndividual(null)} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer">Annuler</button>
                <button onClick={saveIndividualPayment} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"><Check className="w-3.5 h-3.5"/>Enregistrer le paiement</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
