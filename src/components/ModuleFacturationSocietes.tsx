import { useMemo, useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState } from '../store';
import {
  addAuditLog, billingStatusClasses, billingStatusLabel,
  formatAr, formatNum, getCompanyInvoicesForMonth, addJourneyEvent, safeInvoiceItemDescriptions, familyLabel,
  isLabFamily, isEchoFamily, isHospFamily,
  companyIsAssurance, companyTypeLabel,
  invoiceAssuranceStatut, invoicePaidAmount, invoiceAssuranceReste,
  invoiceAssuranceARembourser, invoiceAssuranceRejete,
} from '../store';
import type { CompanyBillingAccount, CompanySettlementMode, Invoice, InvoiceItem } from '../types';
import {
  Building2, Calendar, Check, CreditCard, Download, Eye, HandCoins,
  Printer, Receipt, Search, Trash2, Wallet, X, FileText, BadgeCheck,
  Hash, User as UserIcon, Edit2, Plus, Users, ShoppingBag, Store, Save,
  History, Sparkles, Layers, ListPlus, RotateCcw, FileSpreadsheet, Copy, Filter, Zap, Table, CheckCircle2,
  Shield, ArrowLeft,
} from 'lucide-react';
import { printSalfaCompanyMonthlyInvoice, printSalfaIndividualInvoice } from '../utils/printSalfaInvoice';
import SuiviAssurance from './SuiviAssurance';
import ModuleFacturationAccueil from './ModuleFacturationAccueil';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }

/** Deux grandes familles de factures, conformément au métier :
 *  - 'client'   → Facture Client : chaque personne est facturée individuellement (A5).
 *                 Inclut TOUTES les factures individuelles — comptoir, externe ET société
 *                 (un salarié de société, même facturé en crédit société, apparaît ici
 *                 pour être traité individuellement, A5 en bonne et due forme).
 *  - 'societe'  → Facture Société : regroupement mensuel de toutes les personnes d'une société.
 */
type Tab = 'accueil' | 'client' | 'societe' | 'historique_paiements';

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

const invoiceStatusLabel = (inv: Invoice, state: AppState) => {
  const totalPaid = state.companyBillingAccounts
    .flatMap(a => a.payments.filter(p => p.invoiceIds?.includes(inv.id)).map(p => p.amount))
    .reduce((s, v) => s + v, 0);
  if (totalPaid >= inv.totalAmount && inv.totalAmount > 0) return { label: 'Payée', color: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', paid: inv.totalAmount, balance: 0 };
  // Facture validée en caisse en CRÉDIT SOCIÉTÉ : aucune espèce n'a été encaissée.
  // La société reste débitrice tant qu'aucun règlement n'est enregistré ici.
  if (inv.creditSociete) return { label: 'Crédit Société', color: 'bg-blue-100 dark:bg-cyan-500/15 text-blue-800 dark:text-cyan-300', paid: totalPaid, balance: inv.totalAmount - totalPaid };
  if (inv.status === 'paid') return { label: 'Payée', color: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', paid: inv.totalAmount, balance: 0 };
  if (totalPaid > 0) return { label: 'Partiellement payée', color: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400', paid: totalPaid, balance: inv.totalAmount - totalPaid };
  return { label: 'Impayée', color: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400', paid: 0, balance: inv.totalAmount };
};

const invoiceDesignation = (inv: Invoice, state: AppState, separator = ', ') => {
  const st = invoiceStatusLabel(inv, state);
  return safeInvoiceItemDescriptions(inv, st.balance <= 0).join(separator);
};

export default function ModuleFacturationSocietes({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('accueil');
  // Vue ASSURANCES : suivi individuel des prestations des sociétés de type assurance.
  const [assuranceMode, setAssuranceMode] = useState(false);
  // Société à ouvrir automatiquement dans le suivi des assurances (accueil « par société »).
  const [assuranceInitialCompany, setAssuranceInitialCompany] = useState<string | undefined>(undefined);
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth());
  const [filterStatus, setFilterStatus] = useState<'all' | 'impaye' | 'partiel' | 'payee'>('all');
  const [search, setSearch] = useState('');
  const [filterNameComptoir, setFilterNameComptoir] = useState('');
  const [filterNumFactureExterne, setFilterNumFactureExterne] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  // Sous-filtre de l'onglet « Facture Client » : toutes / comptoir / société / externe.
  const [clientKind, setClientKind] = useState<'all' | 'comptoir' | 'externe' | 'societe'>('all');

  // ====== MODAL : Patients & Prescriptions d'une société (Double-clic) ======
  const [activeCompanyForPatients, setActiveCompanyForPatients] = useState<string | null>(null);

  // Mode de saisie des paiements sociétés : 'global' (Global mensuel) vs 'individuel' (Paiement individuel par salarié)
  const [societeMode, setSocieteMode] = useState<'global' | 'individuel'>('global');

  // Saisies locales pour le paiement individuel : map invoice.id => { amount, method, ref, obs }
  const [indivPaymentInputs, setIndivPaymentInputs] = useState<Record<string, { amount: string; method: string; ref: string; obs: string }>>({});

  // ====== MODAL : Édition Prescription / Facture ======
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editingItems, setEditingItems] = useState<InvoiceItem[]>([]);

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

  // ====== SAISIE SAGE — CATALOGUE PRÉMÉDITÉ ======
  const [sageSearch, setSageSearch] = useState('');
  const [sageCategoryFilter, setSageCategoryFilter] = useState<string>('all');

  // Sage Line Editor Form State inside Invoicing Editing Modal
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);
  const [activeCode, setActiveCode] = useState('');
  const [activeDescription, setActiveDescription] = useState('');
  const [activeCategory, setActiveCategory] = useState<'consultation' | 'lab' | 'pharmacy' | 'surgery' | 'hospitalization' | 'echo'>('pharmacy');
  const [activeQuantity, setActiveQuantity] = useState(1);
  const [activeUnitPrice, setActiveUnitPrice] = useState(0);
  const [sageSearchIdx, setSageSearchIdx] = useState(0);
  const sageSearchRef = useRef<HTMLInputElement>(null);

  const unifiedCatalog = useMemo(() => {
    type CatalogCategory = 'consultation' | 'lab' | 'pharmacy' | 'surgery' | 'hospitalization' | 'echo';
    interface PredefinedItem {
      code: string;
      description: string;
      category: CatalogCategory;
      price: number;
      familyLabel: string;
      badgeColor: string;
    }

    const items: PredefinedItem[] = [
      { code: 'CONS-GEN', description: 'Consultation Médecin Généraliste', category: 'consultation', price: 15000, familyLabel: 'Consultation', badgeColor: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300' },
      { code: 'CONS-SPE', description: 'Consultation Médecin Spécialiste', category: 'consultation', price: 35000, familyLabel: 'Consultation', badgeColor: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300' },
      { code: 'CONS-URG', description: 'Consultation Urgences / Garde', category: 'consultation', price: 25000, familyLabel: 'Consultation', badgeColor: 'bg-rose-100 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300' },
      { code: 'SOIN-INJ', description: 'Injection / Pansement / Petite Chirurgie', category: 'surgery', price: 20000, familyLabel: 'Soins & Chirurgie', badgeColor: 'bg-rose-100 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300' },
      { code: 'BLOC-OP', description: 'Acte Chirurgical — Bloc Opératoire', category: 'surgery', price: 250000, familyLabel: 'Bloc opératoire', badgeColor: 'bg-rose-100 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300' },
    ];

    // Ajouter tous les articles de la base unifiée (médicaments, laboratoire, échographies,
    // hospitalisation — famille HOSP —, consommables, etc.)
    (state.articles || []).forEach(art => {
      const isLab = isLabFamily(art.family);
      const isEcho = isEchoFamily(art.family);
      const isHosp = isHospFamily(art.family);
      const cat: CatalogCategory = isLab ? 'lab' : isEcho ? 'echo' : isHosp ? 'hospitalization' : 'pharmacy';
      const label = isLab ? 'Laboratoire' : isEcho ? 'Échographie' : isHosp ? 'Hospitalisation' : familyLabel(art.family, state.familles);
      const badge = isLab ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : isEcho ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300' : isHosp ? 'bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300' : 'bg-blue-100 dark:bg-cyan-500/15 text-blue-800 dark:text-cyan-300';

      items.push({
        code: art.code || art.barcode || art.id,
        description: art.name,
        category: cat,
        price: art.priceSociete || art.priceComptoir || 0,
        familyLabel: label,
        badgeColor: badge,
      });
    });

    return items;
  }, [state.articles, state.familles]);

  const filteredSageCatalog = useMemo(() => {
    return unifiedCatalog.filter(item => {
      if (sageCategoryFilter !== 'all' && item.category !== sageCategoryFilter) return false;
      if (!sageSearch.trim()) return false;
      const q = sageSearch.toLowerCase();
      return item.code.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.familyLabel.toLowerCase().includes(q);
    });
  }, [unifiedCatalog, sageSearch, sageCategoryFilter]);

  // ====== HISTORIQUE DES RÈGLEMENTS / PAIEMENTS ANTÉRIEURS (GLOBAUX & INDIVIDUELS) ======
  const [histTypeFilter, setHistTypeFilter] = useState<'all' | 'global' | 'individuel'>('all');
  const [histCompanyFilter, setHistCompanyFilter] = useState<string>('all');
  const [histMonthFilter, setHistMonthFilter] = useState<string>('all');
  const [histSearch, setHistSearch] = useState('');
  const [previewReceiptPayment, setPreviewReceiptPayment] = useState<any | null>(null);

  const historicalPaymentsList = useMemo(() => {
    interface HistPayment {
      id: string;
      date: string;
      type: 'global' | 'individuel';
      company: string;
      month: string;
      amount: number;
      method: string;
      reference?: string;
      observation?: string;
      beneficiaryLabel: string;
      receivedBy?: string;
      invoiceIds?: string[];
      source: 'companyBilling' | 'invoice';
      accountId?: string;
    }

    const list: HistPayment[] = [];

    // 1. Depuis companyBillingAccounts (relevés et paiements)
    state.companyBillingAccounts.forEach(acc => {
      acc.payments.forEach(p => {
        const isGlobal = (p.invoiceIds && p.invoiceIds.length > 1) || p.amount === acc.totalAmount || !p.invoiceIds || p.invoiceIds.length === 0;
        let beneficiary = isGlobal
          ? `Relevé mensuel ${monthLabel(acc.month)} (${p.invoiceIds?.length || 0} factures)`
          : 'Facture individuelle';
        if (!isGlobal && p.invoiceIds && p.invoiceIds.length === 1) {
          const inv = state.invoices.find(i => i.id === p.invoiceIds![0]);
          if (inv) {
            const pat = state.patients.find(pt => pt.id === inv.patientId);
            const patName = pat ? `${pat.lastName} ${pat.firstName}` : (inv.clientName || 'Salarié');
            beneficiary = `${patName} — Facture #${inv.id.slice(0, 8).toUpperCase()}`;
          }
        }
        list.push({
          id: p.id,
          date: p.date,
          type: isGlobal ? 'global' : 'individuel',
          company: acc.company,
          month: acc.month,
          amount: p.amount,
          method: p.method || 'Versement / Virement',
          reference: p.reference,
          observation: p.observation,
          beneficiaryLabel: beneficiary,
          receivedBy: p.receivedBy,
          invoiceIds: p.invoiceIds,
          source: 'companyBilling',
          accountId: acc.id,
        });
      });
    });

    // 2. Depuis state.invoices pour les factures 'paid' ou avec 'paidAt' non présentes au-dessus
    const existingPayInvIds = new Set<string>();
    state.companyBillingAccounts.forEach(acc => {
      acc.payments.forEach(p => {
        (p.invoiceIds || []).forEach(id => existingPayInvIds.add(id));
      });
    });

    state.invoices.forEach(inv => {
      // Les factures validées en CRÉDIT SOCIÉTÉ ne sont pas des encaissements :
      // elles n'apparaissent dans l'historique qu'une fois réellement réglées
      // par la société (via les comptes de facturation ci-dessus).
      if ((inv.status === 'paid' || inv.paidAt) && !inv.creditSociete && !existingPayInvIds.has(inv.id)) {
        const pat = state.patients.find(pt => pt.id === inv.patientId);
        const patName = pat ? `${pat.lastName} ${pat.firstName}` : (inv.clientName || 'Salarié');
        const comp = pat?.company || (inv.clientType === 'societe' ? 'Société conventionnée' : 'Patient individuel');
        list.push({
          id: `invpay-${inv.id}`,
          date: inv.paidAt || inv.createdAt,
          type: 'individuel',
          company: comp,
          month: inv.createdAt.slice(0, 7),
          amount: inv.totalAmount,
          method: 'Versement / Caisse',
          reference: `FACT-${inv.id.slice(0, 8).toUpperCase()}`,
          observation: 'Règlement facture individuelle',
          beneficiaryLabel: `${patName} — Facture #${inv.id.slice(0, 8).toUpperCase()}`,
          receivedBy: 'Facturation',
          invoiceIds: [inv.id],
          source: 'invoice',
        });
      }
    });

    // Filtrage
    return list.filter(p => {
      if (histTypeFilter !== 'all' && p.type !== histTypeFilter) return false;
      if (histCompanyFilter !== 'all' && p.company !== histCompanyFilter) return false;
      if (histMonthFilter !== 'all' && p.month !== histMonthFilter) return false;
      if (histSearch.trim()) {
        const q = histSearch.toLowerCase();
        const match = [
          p.company, p.beneficiaryLabel, p.method, p.reference, p.observation, p.receivedBy,
        ].some(v => (v || '').toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.companyBillingAccounts, state.invoices, state.patients, histTypeFilter, histCompanyFilter, histMonthFilter, histSearch]);

  const cancelHistoricalPayment = (p: { id: string; source: 'companyBilling' | 'invoice'; accountId?: string; invoiceIds?: string[]; amount: number; beneficiaryLabel: string }) => {
    if (!confirm(`Voulez-vous vraiment annuler le règlement de ${formatAr(p.amount)} (${p.beneficiaryLabel}) ? Le solde des factures et relevés sera rétabli.`)) return;

    setState(prev => {
      const next = { ...prev };
      if (p.source === 'companyBilling' && p.accountId) {
        next.companyBillingAccounts = next.companyBillingAccounts.map(acc => {
          if (acc.id !== p.accountId) return acc;
          const filteredPayments = acc.payments.filter(pay => pay.id !== p.id);
          const newPaid = filteredPayments.reduce((s, pay) => s + pay.amount, 0);
          return {
            ...acc,
            payments: filteredPayments,
            paidAmount: newPaid,
            status: (newPaid >= acc.totalAmount ? 'paid' : newPaid > 0 ? 'partial' : 'open') as CompanyBillingAccount['status'],
          };
        });
      }
      if (p.invoiceIds && p.invoiceIds.length > 0) {
        next.invoices = next.invoices.map(inv => {
          if (!p.invoiceIds!.includes(inv.id)) return inv;
          return {
            ...inv,
            status: 'pending' as const,
            paidAt: undefined,
            paidBy: undefined,
          };
        });
      }
      addAuditLog(next, 'ANNULATION_PAIEMENT_HISTORIQUE', `Règlement de ${formatAr(p.amount)} (${p.beneficiaryLabel}) annulé par ${prev.currentUser?.name || 'Administrateur'}`);
      return next;
    });
  };

  const histAvailableCompanies = useMemo(() => {
    const setComp = new Set<string>();
    state.companyBillingAccounts.forEach(a => setComp.add(a.company));
    state.invoices.forEach(i => {
      const pat = state.patients.find(p => p.id === i.patientId);
      if (pat?.company) setComp.add(pat.company);
      else if (i.clientType === 'societe') setComp.add('Société conventionnée');
    });
    return Array.from(setComp).sort();
  }, [state.companyBillingAccounts, state.invoices, state.patients]);

  const histAvailableMonths = useMemo(() => {
    const setM = new Set<string>();
    state.companyBillingAccounts.forEach(a => setM.add(a.month));
    state.invoices.forEach(i => setM.add(i.createdAt.slice(0, 7)));
    return Array.from(setM).sort().reverse();
  }, [state.companyBillingAccounts, state.invoices]);

  // Garde d'accès : le responsable facturation et l'administrateur ont un accès complet.
  if (state.currentUser?.role !== 'billing' && state.currentUser?.role !== 'admin') {
    return (
      <div className="p-12 text-center text-rose-700 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-500/8 border border-rose-200 dark:border-rose-500/25 rounded-xl">
        Accès refusé — le module « Facturation sociétés » est réservé au rôle Responsable facturation ou Administrateur.
      </div>
    );
  }

  /* ======================= CLASSIFICATION DES FACTURES ======================= */

  /** 1. Factures Sociétés (liées à une entreprise conventionnée) */
  const allCompanyInvoices = useMemo(() => {
    return state.invoices
      .map(inv => {
        const patient = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : undefined;
        const companyName = patient?.company || inv.clientName;
        const company = state.companies.find(c => c.name === companyName);
        return { inv, patient, company, companyName: companyName || '' };
      })
      .filter(x => x.companyName && x.company && !x.inv.isExternal && x.inv.clientType === 'societe');
  }, [state]);

  /** 2. Factures Patients au Comptoir */
  const comptoirInvoices = useMemo(() => {
    return state.invoices
      .map(inv => {
        const patient = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : undefined;
        return { inv, patient };
      })
      .filter(x => !x.inv.isExternal && x.inv.clientType === 'comptoir');
  }, [state]);

  /** 3. Factures Ventes / Examens Externes */
  const externeInvoices = useMemo(() => {
    return state.invoices
      .map(inv => {
        const patient = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : undefined;
        return { inv, patient };
      })
      .filter(x => x.inv.isExternal || x.inv.clientType === 'externe');
  }, [state]);

  /* ======================= FILTRES ET TOTAUX ======================= */

  const filteredCompanyInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCompanyInvoices.filter(({ inv, patient, company }) => {
      if (!company) return false;
      if (filterCompany !== 'all' && company.name !== filterCompany) return false;
      if (!inv.createdAt.startsWith(filterMonth)) return false;
      const st = invoiceStatusLabel(inv, state);
      if (filterStatus === 'impaye' && st.label !== 'Impayée' && st.label !== 'Crédit Société') return false;
      if (filterStatus === 'partiel' && st.label !== 'Partiellement payée') return false;
      if (filterStatus === 'payee' && st.label !== 'Payée') return false;
      if (!q) return true;
      return [
        company.name, patient?.lastName, patient?.firstName, patient?.dossier, inv.id,
      ].some(v => (v || '').toLowerCase().includes(q));
    });
  }, [allCompanyInvoices, filterCompany, filterMonth, filterStatus, search, state]);

  const filteredComptoirInvoices = useMemo(() => {
    const qName = filterNameComptoir.trim().toLowerCase();
    const qSearch = search.trim().toLowerCase();
    return comptoirInvoices.filter(({ inv, patient }) => {
      const st = invoiceStatusLabel(inv, state);
      // Onglet Comptoir : n'afficher que les ventes payées seulement
      if (st.label !== 'Payée') return false;
      if (!inv.createdAt.startsWith(filterMonth)) return false;

      const pName = patient ? `${patient.lastName} ${patient.firstName}` : (inv.clientName || '');
      if (qName && !pName.toLowerCase().includes(qName)) return false;

      if (!qSearch) return true;
      return [
        patient?.lastName, patient?.firstName, patient?.dossier, inv.clientName, inv.id,
      ].some(v => (v || '').toLowerCase().includes(qSearch));
    });
  }, [comptoirInvoices, filterMonth, filterNameComptoir, search, state]);

  const filteredExterneInvoices = useMemo(() => {
    const qNum = filterNumFactureExterne.trim().toLowerCase();
    const qSearch = search.trim().toLowerCase();
    return externeInvoices.filter(({ inv, patient }) => {
      if (!inv.createdAt.startsWith(filterMonth)) return false;
      const st = invoiceStatusLabel(inv, state);
      if (filterStatus === 'impaye' && st.label !== 'Impayée') return false;
      if (filterStatus === 'partiel' && st.label !== 'Partiellement payée') return false;
      if (filterStatus === 'payee' && st.label !== 'Payée') return false;

      if (qNum && !inv.id.toLowerCase().includes(qNum)) return false;

      if (!qSearch) return true;
      return [
        patient?.lastName, patient?.firstName, patient?.dossier, inv.clientName, inv.id,
      ].some(v => (v || '').toLowerCase().includes(qSearch));
    });
  }, [externeInvoices, filterMonth, filterStatus, filterNumFactureExterne, search, state]);

  /** Liste unifiée de l'onglet « Facture Client » : TOUTES les factures individuelles
   *  (comptoir + externe + société), traitées personne par personne (A5). Même les
   *  factures en crédit société (clientType 'societe') apparaissent ici pour être
   *  traitées individuellement ; elles restent également dans le regroupement mensuel
   *  de l'onglet Facture Société. */
  const clientInvoices = useMemo(() => {
    const seen = new Set<string>();
    const out: { inv: Invoice; patient?: typeof state.patients[number]; source: 'comptoir' | 'externe' | 'societe'; company?: string }[] = [];
    comptoirInvoices.forEach((x) => { if (!seen.has(x.inv.id)) { seen.add(x.inv.id); out.push({ ...x, source: 'comptoir' as const }); } });
    externeInvoices.forEach((x) => { if (!seen.has(x.inv.id)) { seen.add(x.inv.id); out.push({ ...x, source: 'externe' as const }); } });
    allCompanyInvoices.forEach((x) => {
      if (seen.has(x.inv.id)) return;
      seen.add(x.inv.id);
      out.push({ inv: x.inv, patient: x.patient, source: 'societe' as const, company: x.companyName || x.patient?.company });
    });
    return out;
  }, [comptoirInvoices, externeInvoices, allCompanyInvoices]);

  /** Factures individuelles filtrées (onglet Facture Client). */
  const filteredClientInvoices = useMemo(() => {
    const q = (search.trim() || filterNameComptoir.trim()).toLowerCase();
    return clientInvoices.filter(({ inv, patient, source }) => {
      if (clientKind !== 'all' && source !== clientKind) return false;
      if (!inv.createdAt.startsWith(filterMonth)) return false;
      const st = invoiceStatusLabel(inv, state);
      if (filterStatus === 'impaye' && st.balance <= 0) return false;
      if (filterStatus === 'partiel' && st.label !== 'Partiellement payée') return false;
      if (filterStatus === 'payee' && st.label !== 'Payée') return false;
      if (!q) return true;
      return [
        patient?.lastName, patient?.firstName, patient?.dossier, patient?.company,
        inv.clientName, inv.id, source,
      ].some((v) => (v || '').toLowerCase().includes(q));
    }).sort((a, b) => new Date(b.inv.createdAt).getTime() - new Date(a.inv.createdAt).getTime());
  }, [clientInvoices, clientKind, filterMonth, filterStatus, search, filterNameComptoir, state]);

  /** Synthèse par société pour l'onglet Société */
  const companySummaryList = useMemo(() => {
    const map = new Map<string, {
      company: typeof state.companies[0];
      monthInvoices: typeof allCompanyInvoices;
      allInvoices: typeof allCompanyInvoices;
      account?: CompanyBillingAccount;
    }>();

    state.companies.forEach(c => {
      if (filterCompany !== 'all' && c.name !== filterCompany) return;
      const compInvoices = allCompanyInvoices.filter(x => x.companyName === c.name);
      const mInvoices = compInvoices.filter(x => x.inv.createdAt.startsWith(filterMonth));

      if (compInvoices.length > 0 || filterCompany !== 'all') {
        const account = state.companyBillingAccounts.find(a => a.company === c.name && a.month === filterMonth);
        map.set(c.name, {
          company: c,
          monthInvoices: mInvoices,
          allInvoices: compInvoices,
          account,
        });
      }
    });

    return Array.from(map.values()).map(({ company, monthInvoices, allInvoices, account }) => {
      // Patients distincts du mois
      const patientCountMonth = new Set(monthInvoices.map(x => x.inv.patientId).filter(Boolean)).size;
      const montantTotalMois = monthInvoices.reduce((s, x) => s + x.inv.totalAmount, 0);
      const montantGlobalFactures = allInvoices.reduce((s, x) => s + x.inv.totalAmount, 0);
      const montantDejaPaye = allInvoices.reduce((s, x) => s + invoiceStatusLabel(x.inv, state).paid, 0);
      const resteAPayer = montantGlobalFactures - montantDejaPaye;

      return {
        company,
        monthInvoices,
        allInvoices,
        account,
        patientCountMonth,
        montantTotalMois,
        montantGlobalFactures,
        montantDejaPaye,
        resteAPayer,
      };
    }).sort((a, b) => a.company.name.localeCompare(b.company.name));
  }, [state, allCompanyInvoices, filterCompany, filterMonth]);

  /** Mode 2 : Liste des salariés (avec factures impayées ou partiellement payées) pour le mode 2 : Paiement Individuel */
  const unpaidSalariesList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCompanyInvoices.filter(({ inv, patient, company, companyName }) => {
      if (!company) return false;
      if (filterCompany !== 'all' && companyName !== filterCompany) return false;
      if (!inv.createdAt.startsWith(filterMonth)) return false;
      const st = invoiceStatusLabel(inv, state);
      // Afficher uniquement les factures avec solde restant dû (partiellement payée, impayée ou crédit société)
      if (st.balance <= 0) return false;
      if (filterStatus === 'impaye' && st.label !== 'Impayée' && st.label !== 'Crédit Société') return false;
      if (filterStatus === 'partiel' && st.label !== 'Partiellement payée') return false;

      if (!q) return true;
      return [
        companyName,
        patient?.lastName,
        patient?.firstName,
        patient?.dossier,
        patient?.matricule,
        patient?.famille,
        inv.id,
      ].some(v => (v || '').toLowerCase().includes(q));
    });
  }, [allCompanyInvoices, filterCompany, filterMonth, filterStatus, search, state]);

  /* ======================= TOTAUX GLOBAUX ======================= */
  const activeInvoicesList = tab === 'societe'
    ? filteredCompanyInvoices.map(x => x.inv)
    : tab === 'client'
    ? filteredClientInvoices.map(x => x.inv)
    : [];

  const totalBilled = activeInvoicesList.reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = activeInvoicesList.reduce((s, i) => s + invoiceStatusLabel(i, state).paid, 0);
  const totalBalance = totalBilled - totalPaid;

  /* ======================= ACTIONS ======================= */

  const deleteAllCompanyBilling = () => {
    if (!confirm("Voulez-vous vraiment supprimer toutes les données du module Facturation Sociétés (comptes, relevés et règlements) ?")) return;
    setState(prev => {
      const next = {
        ...prev,
        companyBillingAccounts: [],
      };
      addAuditLog(next, 'SUPPRESSION_TOTALE_FACTURATION_SOCIETES', `Toutes les données de facturation sociétés ont été supprimées par ${prev.currentUser?.name || 'Administrateur'}`);
      return next;
    });
    setSelectedInvoiceIds(new Set());
  };

  /** Régler TOUTES les factures impayées d'un mois pour une société */
  const openGlobalSettleModal = (companyName: string) => {
    let account = state.companyBillingAccounts.find(a => a.company === companyName && a.month === filterMonth);
    const mInvoices = allCompanyInvoices.filter(x => x.companyName === companyName && x.inv.createdAt.startsWith(filterMonth)).map(x => x.inv);
    if (!mInvoices.length) {
      alert(`Aucune facture trouvée pour ${companyName} pour ${monthLabel(filterMonth)}.`);
      return;
    }
    const tot = mInvoices.reduce((s, i) => s + i.totalAmount, 0);
    if (!account) {
      account = {
        id: uuidv4(),
        company: companyName,
        month: filterMonth,
        invoiceIds: mInvoices.map(i => i.id),
        totalAmount: tot,
        paidAmount: 0,
        status: 'open',
        createdAt: new Date().toISOString(),
        payments: [],
      };
    }
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
      next.invoices = next.invoices.map(inv => {
        if (!payingAccount.invoiceIds.includes(inv.id)) return inv;
        if (inv.status === 'paid') return inv;
        return { ...inv, status: 'paid' as const, paidAt: iso, paidBy: prev.currentUser?.id };
      });
      next.patients = next.patients.map(p => {
        if (p.clientType !== 'societe' || p.company !== payingAccount.company) return p;
        return { ...p, lastVisitAt: iso };
      });
      const exists = next.companyBillingAccounts.some(a => a.id === payingAccount.id);
      if (!exists) {
        next.companyBillingAccounts = [...next.companyBillingAccounts, {
          ...payingAccount,
          paidAmount: payingAccount.totalAmount,
          status: 'paid',
          finalSettlementAmount: balance,
          finalSettlementDate: iso,
          finalSettlementMethod: payMethod,
          finalSettlementReference: payReference || undefined,
          finalSettlementObservation: payObservation || undefined,
          settledBy: prev.currentUser?.id,
          settledByName: prev.currentUser?.name,
          payments: [{
            id: payId, amount: balance, date: iso, method: payMethod,
            reference: payReference || undefined, observation: payObservation || undefined,
            invoiceIds: payingAccount.invoiceIds,
            receivedBy: prev.currentUser?.name, receivedByUserId: prev.currentUser?.id,
          }],
        }];
      } else {
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
      }
      addAuditLog(next, 'RELEVE_MENSUEL_SOLDE', `${payingAccount.company} — ${monthLabel(payingAccount.month)} — ${formatAr(balance)} (${payMethod}${payReference ? ' — ' + payReference : ''})`);
      return next;
    });
    setPayingAccount(null);
  };

  /** Règlement individuel */
  const openIndividualSettle = (ids: string[]) => {
    if (!ids.length) return;
    setPayingIndividual({ ids });
    const total = state.invoices
      .filter(x => ids.includes(x.id))
      .reduce((s, x) => s + invoiceStatusLabel(x, state).balance, 0);
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
    setState(prev => {
      const next = { ...prev };
      payingIndividual.ids.forEach(iid => {
        next.invoices = next.invoices.map(inv => {
          if (inv.id !== iid) return inv;
          return { ...inv, status: 'paid' as const, paidAt: iso, paidBy: prev.currentUser?.id };
        });
      });
      addAuditLog(next, 'REGLEMENT_INDIVIDUEL_FACTURES', `${payingIndividual.ids.length} facture(s) — ${formatAr(amount)} (${indivMethod})`);
      return next;
    });
    setSelectedInvoiceIds(new Set());
    setPayingIndividual(null);
  };

  /** Mode 2 : Enregistrer le rajout de montant à payer pour un salarié spécifique */
  const saveSingleEmployeePayment = (inv: Invoice, companyName: string, amountToPay: number, method: string, ref: string, obs: string) => {
    if (!amountToPay || amountToPay <= 0) {
      alert('Veuillez saisir un montant de versement supérieur à 0 Ar.');
      return;
    }
    const currentSt = invoiceStatusLabel(inv, state);
    if (amountToPay > currentSt.balance) {
      if (!confirm(`Le versement (${formatAr(amountToPay)}) dépasse le solde restant dû (${formatAr(currentSt.balance)}). Voulez-vous tout de même continuer ?`)) {
        return;
      }
    }

    const iso = new Date().toISOString();

    setState(prev => {
      const next = { ...prev };
      const payId = uuidv4();

      const st = invoiceStatusLabel(inv, prev);
      const newPaidTotal = st.paid + amountToPay;
      const isNowFullyPaid = newPaidTotal >= inv.totalAmount;

      // 1. Mettre à jour la facture (statut 'paid' si solde atteint)
      next.invoices = next.invoices.map(i => {
        if (i.id !== inv.id) return i;
        return {
          ...i,
          status: isNowFullyPaid ? ('paid' as const) : i.status,
          paidAt: isNowFullyPaid ? iso : i.paidAt,
          paidBy: isNowFullyPaid ? prev.currentUser?.id : i.paidBy,
        };
      });

      // 2. Créer ou mettre à jour le compte de facturation société
      const invMonth = inv.createdAt.slice(0, 7);
      let account = next.companyBillingAccounts.find(a => a.company === companyName && a.month === invMonth);

      const newPayment = {
        id: payId,
        amount: amountToPay,
        date: iso,
        method: method || 'Virement',
        reference: ref || undefined,
        observation: obs || undefined,
        invoiceIds: [inv.id],
        receivedBy: prev.currentUser?.name,
        receivedByUserId: prev.currentUser?.id,
      };

      if (!account) {
        const compInvs = next.invoices.filter(x => {
          const p = x.patientId ? next.patients.find(pt => pt.id === x.patientId) : undefined;
          const cName = p?.company || x.clientName;
          return cName === companyName && x.createdAt.startsWith(invMonth);
        });
        account = {
          id: uuidv4(),
          company: companyName,
          month: invMonth,
          invoiceIds: compInvs.map(x => x.id),
          totalAmount: compInvs.reduce((s, x) => s + x.totalAmount, 0),
          paidAmount: amountToPay,
          status: isNowFullyPaid && compInvs.length === 1 ? 'paid' : 'partial',
          createdAt: iso,
          payments: [newPayment],
        };
        next.companyBillingAccounts = [...next.companyBillingAccounts, account];
      } else {
        next.companyBillingAccounts = next.companyBillingAccounts.map(a => {
          if (a.id !== account!.id) return a;
          const updatedPayments = [...a.payments, newPayment];
          const updatedPaidAmount = a.paidAmount + amountToPay;
          const allInvsPaid = a.invoiceIds.every(iid => {
            const targetInv = next.invoices.find(x => x.id === iid);
            return targetInv && invoiceStatusLabel(targetInv, next).balance <= 0;
          });
          return {
            ...a,
            paidAmount: updatedPaidAmount,
            status: allInvsPaid ? ('paid' as const) : ('partial' as const),
            payments: updatedPayments,
          };
        });
      }

      const patient = inv.patientId ? next.patients.find(p => p.id === inv.patientId) : undefined;
      const patientName = patient ? `${patient.lastName} ${patient.firstName}` : (inv.clientName || 'Salarié');

      addAuditLog(
        next,
        'REGLEMENT_INDIVIDUEL_SALARIE',
        `Versement individuel de ${formatAr(amountToPay)} pour le salarié ${patientName} (${companyName} — Facture ${inv.id.slice(0, 8).toUpperCase()})`
      );

      return next;
    });

    // Effacer l'entrée locale pour cette facture
    setIndivPaymentInputs(prev => {
      const copy = { ...prev };
      delete copy[inv.id];
      return copy;
    });

    alert(`✅ Versement de ${formatAr(amountToPay)} enregistré pour la facture !`);
  };

  /* ======================= ÉDITION EN LIGNE DES PRESCRIPTIONS / FACTURE ======================= */

  const startEditingInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    const enrichedItems = inv.items.map((item, idx) => {
      const q = item.quantity || 1;
      const pu = item.unitPrice !== undefined ? item.unitPrice : (item.amount / q);
      return {
        ...item,
        code: item.code || `ACT-${String(idx + 1).padStart(2, '0')}`,
        quantity: q,
        unitPrice: pu,
        amount: item.amount,
      };
    });
    setEditingItems(enrichedItems);
    setSageSearch('');
    setSageCategoryFilter('all');
    setSelectedItemIdx(null);
    setActiveCode('');
    setActiveDescription('');
    setActiveCategory('pharmacy');
    setActiveQuantity(1);
    setActiveUnitPrice(0);
    setSageSearchIdx(0);
  };

  const selectItemForEditing = (idx: number) => {
    setSelectedItemIdx(idx);
    const item = editingItems[idx];
    if (item) {
      setActiveCode(item.code || '');
      setActiveDescription(item.description);
      setActiveCategory(item.category);
      setActiveQuantity(item.quantity || 1);
      setActiveUnitPrice(item.unitPrice !== undefined ? item.unitPrice : (item.amount / (item.quantity || 1)));
      setSageSearch('');
      setSageSearchIdx(0);
    }
  };

  const handleResetLine = () => {
    setSelectedItemIdx(null);
    setActiveCode('');
    setActiveDescription('');
    setActiveCategory('pharmacy');
    setActiveQuantity(1);
    setActiveUnitPrice(0);
    setSageSearch('');
    setSageSearchIdx(0);
    setTimeout(() => sageSearchRef.current?.focus(), 50);
  };

  const handleSaveLine = () => {
    if (!activeDescription.trim()) return;

    const qty = Number(activeQuantity) || 1;
    const pu = Number(activeUnitPrice) || 0;
    const amount = qty * pu;

    const newLine: InvoiceItem = {
      code: activeCode || `ACT-${String(editingItems.length + 1).padStart(2, '0')}`,
      description: activeDescription.trim(),
      category: activeCategory,
      quantity: qty,
      unitPrice: pu,
      amount: amount,
    };

    if (selectedItemIdx !== null) {
      // Update existing item
      setEditingItems(prev => {
        const copy = [...prev];
        copy[selectedItemIdx] = newLine;
        return copy;
      });
    } else {
      // Add new item
      setEditingItems(prev => [...prev, newLine]);
    }

    // Reset line form
    handleResetLine();
  };

  const handleDeleteLine = () => {
    if (selectedItemIdx !== null) {
      setEditingItems(prev => prev.filter((_, idx) => idx !== selectedItemIdx));
      handleResetLine();
    }
  };

  const handleSelectCatalogItem = (catalogItem: {
    code: string;
    description: string;
    category: 'consultation' | 'lab' | 'pharmacy' | 'surgery' | 'hospitalization' | 'echo';
    price: number;
  }) => {
    setActiveCode(catalogItem.code);
    setActiveDescription(catalogItem.description);
    setActiveCategory(catalogItem.category);
    setActiveUnitPrice(catalogItem.price);
    if (activeQuantity <= 0) {
      setActiveQuantity(1);
    }
    setSageSearch('');
    setSageSearchIdx(0);
  };

  const handleSageSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredSageCatalog.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSageSearchIdx(prev => (prev + 1) % filteredSageCatalog.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSageSearchIdx(prev => (prev - 1 + filteredSageCatalog.length) % filteredSageCatalog.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = filteredSageCatalog[sageSearchIdx];
      if (sel) {
        handleSelectCatalogItem(sel);
      }
    }
  };

  const addPremeditatedItem = (catalogItem: {
    code: string;
    description: string;
    category: 'consultation' | 'lab' | 'pharmacy' | 'surgery' | 'hospitalization' | 'echo';
    price: number;
  }) => {
    setEditingItems(prev => {
      const idx = prev.findIndex(item => item.code === catalogItem.code || (item.description.trim().toLowerCase() === catalogItem.description.trim().toLowerCase() && item.category === catalogItem.category));
      if (idx >= 0) {
        const next = [...prev];
        const existing = next[idx];
        const q = (Number(existing.quantity) || 1) + 1;
        const pu = Number(existing.unitPrice !== undefined ? existing.unitPrice : existing.amount) || catalogItem.price;
        next[idx] = {
          ...existing,
          quantity: q,
          unitPrice: pu,
          amount: q * pu,
        };
        return next;
      }
      return [
        ...prev,
        {
          code: catalogItem.code,
          description: catalogItem.description,
          category: catalogItem.category,
          quantity: 1,
          unitPrice: catalogItem.price,
          amount: catalogItem.price,
        },
      ];
    });
  };

  const updateEditingItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setEditingItems(prev => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      const q = Number(item.quantity) || 1;
      const pu = Number(item.unitPrice !== undefined ? item.unitPrice : item.amount) || 0;
      item.amount = q * pu;
      next[index] = item;
      return next;
    });
  };

  const saveInvoiceItems = () => {
    if (!editingInvoice) return;
    const normalizedItems = editingItems.map(i => {
      const q = Number(i.quantity) || 1;
      const pu = Number(i.unitPrice !== undefined ? i.unitPrice : i.amount) || 0;
      return {
        ...i,
        quantity: q,
        unitPrice: pu,
        amount: q * pu,
      };
    });
    const newTotal = normalizedItems.reduce((s, i) => s + Number(i.amount || 0), 0);
    setState(prev => {
      const next: AppState = {
        ...prev,
        invoices: prev.invoices.map(inv => {
          if (inv.id !== editingInvoice.id) return inv;
          return {
            ...inv,
            items: normalizedItems,
            totalAmount: newTotal,
            patientCharge: newTotal,
          };
        }),
      };

      // Si l'acte/facture provient d'une consultation, on met aussi à jour la consultation si nécessaire
      if (editingInvoice.consultationId) {
        next.consultations = next.consultations.map(c => {
          if (c.id !== editingInvoice.consultationId) return c;
          return c;
        });
      }

      addAuditLog(next, 'MODIFICATION_PRESCRIPTION_FACTURE', `Facture ${editingInvoice.id.slice(0, 8)} modifiée (${normalizedItems.length} lignes, total ${formatAr(newTotal)}) par Dr. / Facturation ${prev.currentUser?.name || ''}`);
      return next;
    });
    setEditingInvoice(null);
  };

  /* ======================= RENDU DES ONGLETS ======================= */

  const TABS: [Tab, React.ReactNode][] = [
    ['accueil', <span className="flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" /> Accueil <span className="hidden sm:inline font-semibold text-ink-faint">(par société)</span></span>],
    ['client', <span className="flex items-center gap-1.5"><Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Facture Client <span className="hidden sm:inline font-semibold text-ink-faint">(A5 individuel)</span></span>],
    ['societe', <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Facture Société <span className="hidden sm:inline font-semibold text-ink-faint">(Regroupement mensuel)</span></span>],
  ];

  // ===== Vue d'ACCUEIL (par société) — nouvelle entrée « GitHub-like » du module =====
  if (tab === 'accueil') {
    return (
      <ModuleFacturationAccueil
        state={state}
        filterCompany={filterCompany}
        setFilterCompany={setFilterCompany}
        filterMonth={filterMonth}
        setFilterMonth={setFilterMonth}
        onGoClient={() => setTab('client')}
        onGoSociete={() => setTab('societe')}
        onOpenAssurance={(name) => { setAssuranceInitialCompany(name); setAssuranceMode(true); }}
        onOpenHisto={() => setTab('historique_paiements')}
      />
    );
  }

  // ===== Vue dédiée : SUIVI DES ASSURANCES (le Payeur global garde son écran ci-dessous) =====
  if (assuranceMode) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface border border-line rounded-xl shadow-xs">
          <button
            onClick={() => { setAssuranceMode(false); setAssuranceInitialCompany(undefined); setTab('accueil'); }}
            className="px-3 py-1.5 bg-surface-hover hover:bg-surface-active text-ink rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" /> Retour à l'accueil
          </button>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300 text-[11px] font-bold flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" /> Assurances — suivi par adhérent / facture
            </span>
          </div>
        </div>
        <SuiviAssurance
          state={state}
          setState={setState}
          initialCompanyName={assuranceInitialCompany}
          onConsumeInitial={() => setAssuranceInitialCompany(undefined)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ===== Commutateur : Suivi des Assurances (dédié) ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gradient-to-r from-indigo-50 dark:from-indigo-950/50 to-sky-50 dark:to-sky-950/40 border border-indigo-200 dark:border-indigo-500/20 rounded-xl">
        <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Facturation des payeurs globaux (relevé mensuel global + paiement individuel)
        </span>
        <button
          onClick={() => setAssuranceMode(true)}
          className="px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white shadow-sm"
        >
          <Shield className="w-4 h-4" /> Suivi des Assurances <span className="hidden sm:inline font-semibold opacity-80">(par adhérent / facture)</span>
        </button>
      </div>

      {/* ===== BARRE DE FILTRES GLOBALE ET COMPACTE ===== */}
      <div className="bg-surface rounded-xl shadow-sm border p-3">
        <div className="flex flex-wrap items-center gap-3">
          {tab === 'societe' && (
            <label className="block flex-1 min-w-[160px]">
              <span className="text-[11px] font-semibold text-ink-muted uppercase flex items-center gap-1"><Building2 className="w-3 h-3" /> Société</span>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-surface outline-none cursor-pointer font-medium">
                <option value="all">Toutes les sociétés</option>
                {state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
              </select>
            </label>
          )}
          <label className="block flex-1 min-w-[140px]">
            <span className="text-[11px] font-semibold text-ink-muted uppercase flex items-center gap-1"><Calendar className="w-3 h-3" /> Mois</span>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-surface outline-none font-medium" />
          </label>
          {tab !== 'historique_paiements' && (
            <label className="block flex-1 min-w-[140px]">
              <span className="text-[11px] font-semibold text-ink-muted uppercase flex items-center gap-1"><BadgeCheck className="w-3 h-3" /> Statut</span>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-surface outline-none cursor-pointer font-medium">
                <option value="all">Tous les statuts</option>
                <option value="impaye">Impayée</option>
                <option value="partiel">Partiellement payée</option>
                <option value="payee">Payée</option>
              </select>
            </label>
          )}
          <label className="block flex-1 min-w-[180px]">
            <span className="text-[11px] font-semibold text-ink-muted uppercase flex items-center gap-1"><Search className="w-3 h-3" /> Recherche Globale</span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Recherche rapide..." className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-surface outline-none font-medium" />
          </label>
        </div>
      </div>

      {/* ===== BARRE DES 3 ONGLETS PRINCIPAUX ===== */}
      <div className="bg-surface rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto bg-surface-muted/50 p-1.5 gap-2">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-5 py-3 text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap flex items-center gap-2 transition ${tab === k ? 'bg-surface text-indigo-700 dark:text-indigo-400 shadow-sm border border-line' : 'text-ink-secondary hover:bg-surface-hover'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ==================== 2. FACTURE SOCIÉTÉ (Regroupement mensuel) ==================== */}
          {tab === 'societe' && (
            <div className="space-y-4">
              {/* Selector Bar between Mode 1 and Mode 2 */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gradient-to-r from-indigo-50 dark:from-indigo-950/60 to-blue-50 dark:to-cyan-950/60 border border-indigo-200 dark:border-indigo-500/25 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Mode de Saisie des Règlements Sociétés :
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSocieteMode('global')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition flex items-center gap-1.5 ${
                      societeMode === 'global'
                        ? 'bg-indigo-700 text-white shadow-sm'
                        : 'bg-surface text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/25 hover:bg-indigo-100 dark:hover:bg-indigo-500/15'
                    }`}
                  >
                    <Building2 className="w-4 h-4" /> 1 - Global Mensuel (Totalité)
                  </button>
                  <button
                    onClick={() => setSocieteMode('individuel')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition flex items-center gap-1.5 ${
                      societeMode === 'individuel'
                        ? 'bg-indigo-700 text-white shadow-sm'
                        : 'bg-surface text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/25 hover:bg-indigo-100 dark:hover:bg-indigo-500/15'
                    }`}
                  >
                    <Users className="w-4 h-4" /> 2 - Paiement Individuel (Par Salarié)
                    {unpaidSalariesList.length > 0 && (
                      <span className="px-2 py-0.5 bg-rose-500 text-white text-[10px] rounded-full font-extrabold shadow-xs">
                        {unpaidSalariesList.length} impayé(s)
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setTab('historique_paiements')}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                  >
                    <History className="w-4 h-4" /> 3 - Voir Paiements Antérieurs (Globaux & Individuels)
                  </button>
                </div>
              </div>

              {/* MODE 1 : GLOBAL MENSUEL */}
              {societeMode === 'global' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-indigo-50/60 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/25 rounded-xl text-xs text-indigo-900 dark:text-indigo-300">
                    <span>💡 <strong>Mode 1 (Global Mensuel) :</strong> La société paie la totalité des factures du mois en une seule fois. Double-cliquez sur une ligne pour voir ses patients.</span>
                  </div>

                  <div className="border rounded-xl overflow-x-auto shadow-sm">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-hover text-ink border-b">
                        <tr>
                          <th className="p-3 text-left font-bold">Société / Convention</th>
                          <th className="p-3 text-center font-bold">Patients (Mois)</th>
                          <th className="p-3 text-right font-bold">Montant Total Mois</th>
                          <th className="p-3 text-right font-bold">Montant Global Factures</th>
                          <th className="p-3 text-right font-bold text-emerald-700 dark:text-emerald-400">Déjà Payé</th>
                          <th className="p-3 text-right font-bold text-rose-700 dark:text-rose-400">Reste à Payer</th>
                          <th className="p-3 text-center font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-soft">
                        {companySummaryList.length === 0 && (
                          <tr><td colSpan={7} className="p-10 text-center text-ink-faint">Aucune société répertoriée.</td></tr>
                        )}
                        {companySummaryList.map((item) => {
                          const c = item.company;
                          return (
                            <tr
                              key={c.id}
                              onDoubleClick={() => setActiveCompanyForPatients(c.name)}
                              className="hover:bg-indigo-50/40 dark:hover:bg-indigo-500/3 transition cursor-pointer group"
                              title="Double-cliquez pour voir les patients du mois et éditer les prescriptions"
                            >
                              <td className="p-3 font-bold text-ink-strong flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                <span>{c.name}</span>
                              </td>
                              <td className="p-3 text-center">
                                <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 rounded-full font-bold text-[11px]">
                                  👥 {item.patientCountMonth} patient(s)
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-ink-strong">{formatAr(item.montantTotalMois)}</td>
                              <td className="p-3 text-right font-mono font-bold text-indigo-900 dark:text-indigo-300">{formatAr(item.montantGlobalFactures)}</td>
                              <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatAr(item.montantDejaPaye)}</td>
                              <td className="p-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">{formatAr(item.resteAPayer)}</td>
                              <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => setActiveCompanyForPatients(c.name)}
                                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold cursor-pointer shadow-xs flex items-center gap-1"
                                    title="Voir les patients et modifier leurs prescriptions (Double-clic)"
                                  >
                                    <Users className="w-3.5 h-3.5" /> Patients ({item.patientCountMonth})
                                  </button>
                                  <button
                                    onClick={() => {
                                      const invs = item.monthInvoices.map(x => x.inv);
                                      printSalfaCompanyMonthlyInvoice(state.ticketSettings, c, invs, monthLabel(filterMonth), `FACT-${c.name.slice(0, 4).toUpperCase()}`, state.patients);
                                    }}
                                    className="px-2.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-[11px] font-bold cursor-pointer shadow-xs flex items-center gap-1"
                                    title="Imprimer la Facture Globale Société au Format Officiel A4"
                                  >
                                    <FileText className="w-3.5 h-3.5" /> Facture A4
                                  </button>
                                  {item.resteAPayer > 0 && (
                                    <>
                                      <button
                                        onClick={() => openGlobalSettleModal(c.name)}
                                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer shadow-xs flex items-center gap-1"
                                        title="Solder l'intégralité des factures du mois en une seule fois"
                                      >
                                        <BadgeCheck className="w-3.5 h-3.5" /> Régler Tout
                                      </button>
                                      <button
                                        onClick={() => {
                                          setFilterCompany(c.name);
                                          setSocieteMode('individuel');
                                        }}
                                        className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold cursor-pointer shadow-xs flex items-center gap-1"
                                        title="Saisir les règlements individuellement par salarié"
                                      >
                                        <Users className="w-3.5 h-3.5" /> Saisie Individuelle
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* MODE 2 : PAIEMENT INDIVIDUEL (PAR SALARIÉ) */}
              {societeMode === 'individuel' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-amber-50 dark:bg-amber-500/8 border border-amber-200 dark:border-amber-500/25 rounded-xl text-xs text-amber-900 dark:text-amber-300">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                      <span>💡 <strong>Mode 2 (Paiement Individuel) :</strong> Affichage de tous les salariés payés partiellement ou non payés ({unpaidSalariesList.length}). Vous pouvez saisir un rajout de montant à payer pour chaque salarié.</span>
                    </div>
                  </div>

                  <div className="border rounded-xl overflow-x-auto shadow-sm bg-surface">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-hover text-ink border-b">
                        <tr>
                          <th className="p-2.5 text-left font-bold">Salarié / Patient</th>
                          <th className="p-2.5 text-left font-bold">Société</th>
                          <th className="p-2.5 text-left font-bold">Facture & Date</th>
                          <th className="p-2.5 text-left font-bold">Désignation / Actes</th>
                          <th className="p-2.5 text-right font-bold">Montant Facturé</th>
                          <th className="p-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400">Déjà Payé</th>
                          <th className="p-2.5 text-right font-bold text-rose-700 dark:text-rose-400">Reste à Payer</th>
                          <th className="p-2.5 text-center font-bold text-indigo-900 dark:text-indigo-300">Rajout de Montant à Payer (Ar)</th>
                          <th className="p-2.5 text-center font-bold">Mode & Réf.</th>
                          <th className="p-2.5 text-center font-bold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-soft">
                        {unpaidSalariesList.length === 0 && (
                          <tr>
                            <td colSpan={10} className="p-12 text-center text-ink-faint">
                              🎉 Aucun salarié en attente de versement ou impayé pour les filtres sélectionnés ({filterCompany === 'all' ? 'Toutes les sociétés' : filterCompany} — {monthLabel(filterMonth)}).
                            </td>
                          </tr>
                        )}
                        {unpaidSalariesList.map(({ inv, patient, companyName }) => {
                          const st = invoiceStatusLabel(inv, state);
                          const inputState = indivPaymentInputs[inv.id] || { amount: '', method: 'Virement', ref: '', obs: '' };

                          return (
                            <tr key={inv.id} className="hover:bg-surface-muted/80 transition">
                              <td className="p-2.5">
                                <div className="font-bold text-ink-strong flex items-center gap-1">
                                  <UserIcon className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                                  <span>{patient ? `${patient.lastName} ${patient.firstName}` : inv.clientName || 'Salarié'}</span>
                                </div>
                                <div className="text-[10px] text-ink-muted font-mono mt-0.5">
                                  Dossier: {patient?.dossier || '—'} {patient?.matricule ? `| Matr: ${patient.matricule}` : ''}
                                </div>
                                {patient?.famille && (
                                  <div className="text-[10px] text-indigo-700 dark:text-indigo-400 font-medium mt-0.5">
                                    👨‍👩‍👧 {patient.famille} {patient?.lienFamilial ? `(${patient.lienFamilial})` : ''}
                                  </div>
                                )}
                              </td>

                              <td className="p-2.5 font-bold text-indigo-900 dark:text-indigo-300 whitespace-nowrap">
                                <Building2 className="w-3.5 h-3.5 text-indigo-500 inline mr-1" />
                                {companyName}
                              </td>

                              <td className="p-2.5 whitespace-nowrap">
                                <div className="font-mono font-bold text-ink">#{inv.id.slice(0, 8).toUpperCase()}</div>
                                <div className="text-[10px] text-ink-muted">{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</div>
                              </td>

                              <td className="p-2.5 max-w-xs truncate text-ink-secondary" title={invoiceDesignation(inv, state)}>
                                {invoiceDesignation(inv, state)}
                              </td>

                              <td className="p-2.5 text-right font-mono font-bold text-ink-strong whitespace-nowrap">
                                {formatAr(inv.totalAmount)}
                              </td>

                              <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                {formatAr(st.paid)}
                              </td>

                              <td className="p-2.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                <div>{formatAr(st.balance)}</div>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${st.color}`}>
                                  {st.label}
                                </span>
                              </td>

                              {/* CHAMP DE RAJOUT DE MONTANT À PAYER */}
                              <td className="p-2.5 text-center bg-indigo-50/40 dark:bg-indigo-500/3 border-x border-indigo-100 dark:border-indigo-500/25">
                                <div className="flex items-center justify-center gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    placeholder="Montant Ar..."
                                    value={inputState.amount}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setIndivPaymentInputs(prev => ({
                                        ...prev,
                                        [inv.id]: { ...inputState, amount: val },
                                      }));
                                    }}
                                    className="w-28 px-2.5 py-1.5 border border-indigo-300 dark:border-indigo-500/40 rounded-lg text-xs font-mono font-bold bg-surface text-indigo-900 dark:text-indigo-300 outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                                  />
                                  <button
                                    onClick={() => {
                                      setIndivPaymentInputs(prev => ({
                                        ...prev,
                                        [inv.id]: { ...inputState, amount: String(st.balance) },
                                      }));
                                    }}
                                    className="px-2 py-1.5 bg-surface-active hover:bg-line-strong text-ink-strong rounded-lg text-[10px] font-bold cursor-pointer shrink-0 transition"
                                    title="Remplir automatiquement le solde restant dû"
                                  >
                                    Solder
                                  </button>
                                </div>
                              </td>

                              {/* MODE ET RÉFÉRENCE DE PAIEMENT */}
                              <td className="p-2.5 text-center">
                                <div className="space-y-1 min-w-[120px]">
                                  <select
                                    value={inputState.method}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setIndivPaymentInputs(prev => ({
                                        ...prev,
                                        [inv.id]: { ...inputState, method: val },
                                      }));
                                    }}
                                    className="w-full px-2 py-1 border rounded text-[11px] bg-surface cursor-pointer font-medium"
                                  >
                                    {paymentMethods.map(m => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    placeholder="N° Réf..."
                                    value={inputState.ref}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setIndivPaymentInputs(prev => ({
                                        ...prev,
                                        [inv.id]: { ...inputState, ref: val },
                                      }));
                                    }}
                                    className="w-full px-2 py-1 border rounded text-[10px] font-mono bg-surface outline-none"
                                  />
                                </div>
                              </td>

                              {/* ACTION : VALIDER VERSEMENT */}
                              <td className="p-2.5 text-center whitespace-nowrap">
                                <button
                                  onClick={() =>
                                    saveSingleEmployeePayment(
                                      inv,
                                      companyName,
                                      Number(inputState.amount || 0),
                                      inputState.method,
                                      inputState.ref,
                                      inputState.obs
                                    )
                                  }
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer shadow-xs flex items-center gap-1 mx-auto transition"
                                >
                                  <Check className="w-3.5 h-3.5" /> Valider
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== 1. FACTURE CLIENT (A5 individuel) ==================== */}
          {tab === 'client' && (
            <div className="space-y-3">
              {/* En-tête explicatif */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-emerald-50/70 dark:bg-emerald-500/6 border border-emerald-200 dark:border-emerald-500/25 rounded-xl text-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-300">
                  <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Facture Client — factures individuelles ({filteredClientInvoices.length})</span>
                </div>
                <p className="text-emerald-800/80 dark:text-emerald-300/80 italic">
                  Chaque personne est traitée individuellement (Facture A5) : comptoir, externe et salariés de société (y compris en crédit société).
                </p>
              </div>

              {/* Sous-filtre du type de client */}
              <div className="flex flex-wrap items-center gap-2">
                {([['all', 'Tous les clients'], ['comptoir', 'Comptoir & salariés'], ['societe', 'Société'], ['externe', 'Externes']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setClientKind(v)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer transition ${clientKind === v ? 'bg-emerald-600 text-white shadow-sm' : 'bg-surface border border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/15'}`}>
                    {l}
                  </button>
                ))}
                <div className="relative w-full sm:w-72 ml-auto">
                  <UserIcon className="absolute left-2.5 top-2 w-3.5 h-3.5 text-ink-faint" />
                  <input
                    type="text"
                    value={filterNameComptoir}
                    onChange={e => setFilterNameComptoir(e.target.value)}
                    placeholder="Filtrer par nom, société, n° facture…"
                    className="w-full pl-8 pr-3 py-1.5 bg-surface border border-emerald-300 dark:border-emerald-500/40 rounded-lg text-xs font-medium outline-none focus:border-emerald-600 shadow-inner"
                  />
                </div>
              </div>

              <div className="border rounded-xl overflow-x-auto shadow-sm">
                <table className="w-full text-xs">
                  <thead className="bg-surface-hover text-ink">
                    <tr>
                      <th className="p-2.5 text-left font-bold">Type</th>
                      <th className="p-2.5 text-left font-bold">N° Facture</th>
                      <th className="p-2.5 text-left font-bold">Date</th>
                      <th className="p-2.5 text-left font-bold">Client</th>
                      <th className="p-2.5 text-left font-bold">Désignation</th>
                      <th className="p-2.5 text-right font-bold">Facturé</th>
                      <th className="p-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400">Réglé</th>
                      <th className="p-2.5 text-right font-bold text-rose-700 dark:text-rose-400">Solde</th>
                      <th className="p-2.5 text-center font-bold">Statut</th>
                      <th className="p-2.5 text-center font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {filteredClientInvoices.length === 0 && (
                      <tr><td colSpan={10} className="p-10 text-center text-ink-faint">Aucune facture client pour ce filtre.</td></tr>
                    )}
                    {filteredClientInvoices.map(({ inv, patient, source, company }) => {
                      const st = invoiceStatusLabel(inv, state);
                      return (
                        <tr key={inv.id} className="hover:bg-surface-muted transition">
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              source === 'comptoir' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : source === 'societe' ? 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
                              : 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400'
                            }`}>
                              {source === 'comptoir' ? 'Comptoir' : source === 'societe' ? 'Société' : 'Externe'}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-ink-secondary font-bold flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5 text-ink-faint" /> {inv.id.slice(0, 8).toUpperCase()}
                          </td>
                          <td className="p-2.5 whitespace-nowrap">{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</td>
                          <td className="p-2.5 font-bold text-ink-strong">
                            {patient ? `${patient.lastName} ${patient.firstName}` : inv.clientName || 'Client'}
                            <div className="text-[10px] font-normal text-ink-faint">
                              {patient?.dossier ? `Dossier ${patient.dossier}` : ''} {company ? ` · ${company}` : ''}
                            </div>
                          </td>
                          <td className="p-2.5 max-w-xs truncate text-ink-secondary" title={invoiceDesignation(inv, state)}>{invoiceDesignation(inv, state)}</td>
                          <td className="p-2.5 text-right font-mono font-bold">{formatAr(inv.totalAmount)}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatAr(st.paid)}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400">{formatAr(st.balance)}</td>
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.color}`}>{st.label}</span>
                          </td>
                          <td className="p-2.5 text-center flex items-center justify-center gap-1">
                            <button
                              onClick={() => printSalfaIndividualInvoice(state.ticketSettings, inv, patient)}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1"
                              title="Imprimer Facture A5"
                            >
                              <FileText className="w-3 h-3" /> Facture A5
                            </button>
                            {st.balance > 0 && (
                              <button onClick={() => openIndividualSettle([inv.id])} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer">
                                Régler
                              </button>
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

          {/* ==================== 4. ONGLET HISTORIQUE DES PAIEMENTS ANTÉRIEURS ==================== */}
          {tab === 'historique_paiements' && (
            <div className="space-y-4">
              {/* Retour vers les factures */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-surface-muted border border-line rounded-xl">
                <button onClick={() => setTab('societe')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-line text-xs font-bold text-ink hover:bg-surface-hover cursor-pointer transition">
                  <RotateCcw className="w-3.5 h-3.5" /> Retour aux factures
                </button>
                <span className="text-[11px] font-semibold text-ink-muted">Historique &amp; règlements antérieurs — Globaux &amp; individuels</span>
              </div>

              {/* En-tête / Statistiques rapides */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-gradient-to-br from-blue-700 to-indigo-800 text-white rounded-xl shadow-xs">
                  <div className="text-xs font-medium text-blue-200">Total Encaissé (Sélection)</div>
                  <div className="text-xl font-bold font-mono mt-1">
                    {formatAr(historicalPaymentsList.reduce((acc, p) => acc + p.amount, 0))}
                  </div>
                  <div className="text-[11px] text-blue-200 mt-0.5">
                    {historicalPaymentsList.length} règlement(s) répertorié(s)
                  </div>
                </div>

                <div className="p-3.5 bg-surface border border-line rounded-xl shadow-xs">
                  <div className="text-xs font-medium text-ink-muted">Règlements de Sociétés (Globaux)</div>
                  <div className="text-xl font-bold font-mono text-purple-700 dark:text-purple-400 mt-1">
                    {formatAr(historicalPaymentsList.filter(p => p.type === 'global').reduce((acc, p) => acc + p.amount, 0))}
                  </div>
                  <div className="text-[11px] text-ink-faint mt-0.5">
                    {historicalPaymentsList.filter(p => p.type === 'global').length} relevé(s) payé(s)
                  </div>
                </div>

                <div className="p-3.5 bg-surface border border-line rounded-xl shadow-xs">
                  <div className="text-xs font-medium text-ink-muted">Règlements Individuels (Par Patient)</div>
                  <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                    {formatAr(historicalPaymentsList.filter(p => p.type === 'individuel').reduce((acc, p) => acc + p.amount, 0))}
                  </div>
                  <div className="text-[11px] text-ink-faint mt-0.5">
                    {historicalPaymentsList.filter(p => p.type === 'individuel').length} facture(s) individuelle(s)
                  </div>
                </div>
              </div>

              {/* Barre de filtres et de recherche */}
              <div className="bg-surface p-3 rounded-xl border border-line shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Filtres :
                  </span>

                  <select
                    value={histTypeFilter}
                    onChange={e => setHistTypeFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 border border-line-strong rounded-lg bg-surface font-medium text-ink cursor-pointer"
                  >
                    <option value="all">Tous types de règlements</option>
                    <option value="global">Règlements Globaux (Relevé Société)</option>
                    <option value="individuel">Règlements Individuels (Par Facture)</option>
                  </select>

                  <select
                    value={histCompanyFilter}
                    onChange={e => setHistCompanyFilter(e.target.value)}
                    className="px-2.5 py-1.5 border border-line-strong rounded-lg bg-surface font-medium text-ink cursor-pointer max-w-[200px]"
                  >
                    <option value="all">Toutes les sociétés</option>
                    {histAvailableCompanies.map(comp => (
                      <option key={comp} value={comp}>{comp}</option>
                    ))}
                  </select>

                  <select
                    value={histMonthFilter}
                    onChange={e => setHistMonthFilter(e.target.value)}
                    className="px-2.5 py-1.5 border border-line-strong rounded-lg bg-surface font-medium text-ink cursor-pointer"
                  >
                    <option value="all">Tous les mois / périodes</option>
                    {histAvailableMonths.map(m => (
                      <option key={m} value={m}>{monthLabel(m)}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-4 h-4 text-ink-faint absolute left-2.5 top-2" />
                    <input
                      type="text"
                      value={histSearch}
                      onChange={e => setHistSearch(e.target.value)}
                      placeholder="Rechercher référence, patient, n°…"
                      className="w-full pl-8 pr-3 py-1.5 border border-line-strong rounded-lg text-xs outline-none focus:border-indigo-500"
                    />
                    {histSearch && (
                      <button onClick={() => setHistSearch('')} className="absolute right-2 top-2 text-ink-faint hover:text-ink-secondary">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tableau d'historique des règlements */}
              <div className="bg-surface rounded-xl border border-line shadow-xs overflow-hidden">
                <div className="p-3 bg-surface-muted border-b border-line flex items-center justify-between text-xs">
                  <span className="font-bold text-ink flex items-center gap-1.5">
                    <History className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                    Règlements & Paiements Antérieurs enregistrés ({historicalPaymentsList.length})
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-hover text-ink-secondary uppercase text-[10px] font-bold">
                      <tr>
                        <th className="p-2.5 text-left">Date</th>
                        <th className="p-2.5 text-center">Type</th>
                        <th className="p-2.5 text-left">Société / Convention</th>
                        <th className="p-2.5 text-left">Bénéficiaire & Détail</th>
                        <th className="p-2.5 text-left">Mode & Référence</th>
                        <th className="p-2.5 text-left">Observation</th>
                        <th className="p-2.5 text-right">Montant Payé (Ar)</th>
                        <th className="p-2.5 text-center">Actions / Reçu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {historicalPaymentsList.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-12 text-center text-ink-faint">
                            Aucun paiement antérieur ne correspond à vos filtres.
                          </td>
                        </tr>
                      ) : (
                        historicalPaymentsList.map((p) => (
                          <tr key={p.id} className="hover:bg-surface-muted/80 transition">
                            <td className="p-2.5 whitespace-nowrap text-ink-secondary">
                              {new Date(p.date).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="p-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                p.type === 'global' ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300' : 'bg-blue-100 dark:bg-cyan-500/15 text-blue-800 dark:text-cyan-300'
                              }`}>
                                {p.type === 'global' ? 'RÈGLEMENT GLOBAL' : 'INDIVIDUEL'}
                              </span>
                            </td>
                            <td className="p-2.5 font-bold text-ink-strong">
                              {p.company}
                              <div className="text-[10px] text-ink-faint font-normal">Période : {monthLabel(p.month)}</div>
                            </td>
                            <td className="p-2.5 font-medium text-ink">
                              {p.beneficiaryLabel}
                            </td>
                            <td className="p-2.5">
                              <span className="font-semibold text-ink-strong">{p.method}</span>
                              {p.reference && (
                                <div className="text-[10px] text-ink-muted font-mono">Réf: {p.reference}</div>
                              )}
                            </td>
                            <td className="p-2.5 text-ink-secondary italic">
                              {p.observation || '—'}
                              {p.receivedBy && <div className="text-[10px] text-ink-faint not-italic">Par: {p.receivedBy}</div>}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                              {formatAr(p.amount)}
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setPreviewReceiptPayment(p)}
                                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1 shadow-xs"
                                  title="Aperçu & Justificatif A5"
                                >
                                  <FileText className="w-3.5 h-3.5" /> Reçu A5
                                </button>
                                <button
                                  onClick={() => cancelHistoricalPayment(p)}
                                  className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/8 rounded cursor-pointer transition"
                                  title="Annuler ce règlement et rétablir le solde"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== MODAL DOUBLE-CLIC : LISTE PATIENTS & PRESCRIPTIONS D'UNE SOCIÉTÉ ==================== */}
      {activeCompanyForPatients && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" onClick={() => setActiveCompanyForPatients(null)}>
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-gradient-to-r from-indigo-800 to-blue-700 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-6 h-6 text-indigo-200" />
                <div>
                  <h3 className="font-bold text-lg">Patients & Prescriptions du Mois — {activeCompanyForPatients}</h3>
                  <p className="text-xs text-indigo-200 capitalize">Période : {monthLabel(filterMonth)}</p>
                </div>
              </div>
              <button onClick={() => setActiveCompanyForPatients(null)} className="p-1 hover:bg-white/20 rounded-lg text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
              {(() => {
                const compInvs = allCompanyInvoices.filter(x => x.companyName === activeCompanyForPatients && x.inv.createdAt.startsWith(filterMonth));
                if (compInvs.length === 0) {
                  return (
                    <div className="p-12 text-center text-ink-faint">
                      Aucune facture / prescription enregistrée pour {activeCompanyForPatients} pendant ce mois.
                    </div>
                  );
                }

                return compInvs.map(({ inv, patient }) => {
                  const st = invoiceStatusLabel(inv, state);
                  const consultation = inv.consultationId ? state.consultations.find(c => c.id === inv.consultationId) : undefined;

                  return (
                    <div key={inv.id} className="bg-surface-muted rounded-xl p-4 border border-line space-y-3">
                      <div className="flex flex-wrap justify-between items-start gap-2 border-b border-line pb-2">
                        <div>
                          <h4 className="font-bold text-sm text-ink-strong flex items-center gap-2">
                            <span>{patient ? `${patient.lastName} ${patient.firstName}` : inv.clientName || 'Patient'}</span>
                            <span className="font-mono text-blue-600 dark:text-cyan-400 text-xs">({patient?.dossier || '—'})</span>
                            {patient?.famille && <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 rounded text-[10px] font-medium">👨‍👩‍👧 {patient.famille}</span>}
                          </h4>
                          <div className="text-[11px] text-ink-muted mt-0.5">
                            Date: {new Date(inv.createdAt).toLocaleDateString('fr-FR')} | N° Facture: <span className="font-mono font-bold">{inv.id.slice(0, 8).toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.color}`}>{st.label}</span>
                          <button
                            onClick={() => startEditingInvoice(inv)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-xs"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Modifier Prescription / Actes
                          </button>
                        </div>
                      </div>

                      {/* Diagnostic & ordonnances si consultation */}
                      {consultation && (
                        <div className="p-2.5 bg-surface rounded-lg border border-line text-xs space-y-1">
                          {consultation.diagnosis && (
                            <div><strong className="text-ink">Diagnostic Médecin :</strong> <span className="text-ink-strong font-medium">{consultation.diagnosis}</span></div>
                          )}
                          {consultation.doctorName && (
                            <div className="text-[11px] text-ink-muted">Prescrit par : Dr. {consultation.doctorName}</div>
                          )}
                        </div>
                      )}

                      {/* Détail des lignes facturées / prescriptions */}
                      <div className="bg-surface rounded-lg border border-line overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-surface-hover text-ink-secondary">
                            <tr>
                              <th className="p-2 text-left">Désignation / Acte / Médicament</th>
                              <th className="p-2 text-center">Catégorie</th>
                              <th className="p-2 text-right">Montant (Ar)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line-soft">
                            {inv.items.map((it, idx) => (
                              <tr key={idx} className="hover:bg-surface-muted">
                                <td className="p-2 font-medium text-ink-strong">{it.description}</td>
                                <td className="p-2 text-center uppercase text-[10px] font-bold text-ink-muted">{it.category}</td>
                                <td className="p-2 text-right font-mono font-bold">{formatAr(it.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-surface-muted font-bold border-t">
                            <tr>
                              <td colSpan={2} className="p-2 text-right uppercase text-ink-secondary">Total Facturé :</td>
                              <td className="p-2 text-right font-mono text-indigo-900 dark:text-indigo-300 text-sm">{formatAr(inv.totalAmount)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="p-3 bg-surface-hover border-t border-line flex justify-between items-center text-xs">
              <span className="text-ink-muted">Société sélectionnée : <strong>{activeCompanyForPatients}</strong></span>
              <button
                onClick={() => setActiveCompanyForPatients(null)}
                className="px-4 py-1.5 bg-surface-active hover:bg-line-strong text-ink font-bold rounded-lg cursor-pointer transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL : ÉDITION DES PRESCRIPTIONS / FACTURE ==================== */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" onClick={() => setEditingInvoice(null)}>
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-4xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-indigo-700 text-white flex justify-between items-center font-sans">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-200" />
                <h3 className="font-bold text-base">Modifier les Actes & Prescriptions (Facture {editingInvoice.id.slice(0, 8).toUpperCase()})</h3>
              </div>
              <button onClick={() => setEditingInvoice(null)} className="p-1 hover:bg-white/20 rounded text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              <div className="p-3 bg-blue-50 dark:bg-cyan-500/8 border border-blue-200 dark:border-cyan-500/25 text-blue-900 dark:text-cyan-300 rounded-lg font-sans">
                <p className="font-semibold mb-0.5">Saisie Sage (Saisie Préméditée) :</p>
                <p className="text-ink-secondary">Recherchez un article ou acte dans le catalogue complet ci-dessous, ajustez la quantité ou le prix unitaire, puis cliquez sur <strong>Enregistrer la ligne</strong> (ou cliquez sur une ligne du tableau ci-dessous pour la modifier ou la supprimer).</p>
              </div>

              {/* Saisie Sage / Catalogue Prémédité block */}
              <div className="bg-surface-muted border border-line-strong rounded-lg p-3 select-none space-y-3 font-sans">
                {/* Search Input */}
                <div className="relative">
                  <label className="block text-[10px] font-bold text-ink-muted mb-1">🔍 Recherche d'Article / Examen (Saisie Préméditée : tapez pour rechercher, ↑↓ + Entrée)</label>
                  <input
                    ref={sageSearchRef}
                    type="text"
                    value={sageSearch}
                    onChange={e => {
                      setSageSearch(e.target.value);
                      setSageSearchIdx(0);
                    }}
                    onKeyDown={handleSageSearchKeyDown}
                    className="w-full bg-surface border border-blue-400 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent/25 text-ink-strong"
                    placeholder="Tapez le nom d'un médicament, d'un examen de labo, d'une consultation ou échographie..."
                    autoFocus
                  />
                  
                  {/* Dropdown for catalog search */}
                  {sageSearch.trim().length >= 1 && filteredSageCatalog.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-surface border border-line-strong rounded-b-lg shadow-2xl z-50 max-h-48 overflow-y-auto">
                      {filteredSageCatalog.map((item, idx) => (
                        <div
                          key={`${item.code}-${idx}`}
                          onClick={() => handleSelectCatalogItem(item)}
                          className={`px-3 py-2 text-xs flex justify-between border-b border-line-soft cursor-pointer transition-colors ${
                            idx === sageSearchIdx ? 'bg-blue-500 text-white font-medium' : 'hover:bg-surface-muted text-ink-strong'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${idx === sageSearchIdx ? 'bg-blue-600 text-white' : 'bg-surface-active text-ink'}`}>
                              {item.code}
                            </span>
                            <span>{item.description}</span>
                            <span className={`text-[10px] ${idx === sageSearchIdx ? 'text-blue-100' : 'text-ink-faint'}`}>({item.familyLabel})</span>
                          </span>
                          <span className={`font-mono font-bold ${idx === sageSearchIdx ? 'text-white' : 'text-blue-600 dark:text-cyan-400'}`}>
                            {formatAr(item.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Input fields bar for the line */}
                <div className="bg-surface-hover border border-line rounded-lg p-2.5 shadow-inner">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    
                    {/* Code input */}
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-ink-muted mb-1">Référence / Code</label>
                      <input
                        type="text"
                        value={activeCode}
                        onChange={e => setActiveCode(e.target.value)}
                        className="w-full bg-surface border border-line-strong rounded px-2.5 py-1 text-xs font-mono text-ink outline-none focus:border-line-control"
                        placeholder="Ex: PHA-01"
                      />
                    </div>

                    {/* Designation input */}
                    <div className="col-span-4">
                      <label className="block text-[10px] font-bold text-ink-muted mb-1">Désignation / Acte / Médicament</label>
                      <input
                        type="text"
                        value={activeDescription}
                        onChange={e => setActiveDescription(e.target.value)}
                        className="w-full bg-surface border border-line-strong rounded px-2.5 py-1 text-xs text-ink-strong font-medium outline-none focus:border-line-control"
                        placeholder="Saisissez un acte ou article..."
                      />
                    </div>

                    {/* Category select */}
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-ink-muted mb-1">Catégorie</label>
                      <select
                        value={activeCategory}
                        onChange={e => setActiveCategory(e.target.value as any)}
                        className="w-full bg-surface border border-line-strong rounded px-2.5 py-1 text-xs text-ink-strong cursor-pointer font-medium outline-none focus:border-line-control"
                      >
                        <option value="consultation">Consultation</option>
                        <option value="pharmacy">Pharmacie</option>
                        <option value="lab">Laboratoire</option>
                        <option value="echo">Échographie</option>
                        <option value="hospitalization">Hospitalisation</option>
                        <option value="surgery">Bloc opératoire</option>
                      </select>
                    </div>

                    {/* Qté input */}
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-ink-muted mb-1">Qté</label>
                      <input
                        type="number"
                        min={1}
                        value={activeQuantity}
                        onChange={e => setActiveQuantity(parseFloat(e.target.value) || 1)}
                        className="w-full bg-surface border border-line-strong rounded px-2.5 py-1 text-xs text-right font-mono text-ink-strong outline-none focus:border-line-control"
                      />
                    </div>

                    {/* P.U. input */}
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-ink-muted mb-1">P.U. (Ar)</label>
                      <input
                        type="number"
                        min={0}
                        value={activeUnitPrice}
                        onChange={e => setActiveUnitPrice(parseFloat(e.target.value) || 0)}
                        className="w-full bg-surface border border-line-strong rounded px-2.5 py-1 text-xs text-right font-mono font-bold text-ink-strong outline-none focus:border-line-control"
                      />
                    </div>

                    {/* Montant calculated */}
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-ink-muted mb-1">Montant</label>
                      <input
                        type="text"
                        readOnly
                        value={formatNum(activeQuantity * activeUnitPrice)}
                        className="w-full bg-surface-active border border-line-strong rounded px-2.5 py-1 text-xs text-right font-mono font-bold text-ink-secondary"
                      />
                    </div>

                  </div>

                  {/* Save, reset, delete buttons */}
                  <div className="flex justify-end gap-1.5 mt-2.5">
                    <button
                      type="button"
                      onClick={handleResetLine}
                      className="flex items-center gap-1 px-3 py-1 bg-surface hover:bg-surface-muted border border-line-strong rounded text-ink font-semibold cursor-pointer shadow-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nouveau / Effacer
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteLine}
                      disabled={selectedItemIdx === null}
                      className="flex items-center gap-1 px-3 py-1 bg-surface hover:bg-rose-50 dark:hover:bg-rose-500/8 border border-line-strong text-rose-600 dark:text-rose-400 disabled:opacity-40 rounded font-semibold cursor-pointer shadow-xs transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Supprimer
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveLine}
                      disabled={!activeDescription.trim()}
                      className="flex items-center gap-1 px-4 py-1 bg-sky-500 hover:bg-sky-600 border border-sky-600 text-white disabled:opacity-40 rounded font-bold cursor-pointer shadow-sm transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" /> Enregistrer la ligne
                    </button>
                  </div>
                </div>
              </div>

              {/* Table of items in the Invoice */}
              <div className="bg-surface border border-line-strong rounded-lg overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface-hover border-b border-line-strong text-ink-secondary font-bold font-sans">
                    <tr className="divide-x divide-line">
                      <th className="p-2 w-24">Code</th>
                      <th className="p-2">Désignation / Acte / Médicament</th>
                      <th className="p-2 w-32 text-center">Catégorie</th>
                      <th className="p-2 w-16 text-right">Qté</th>
                      <th className="p-2 w-24 text-right">P.U. (Ar)</th>
                      <th className="p-2 w-28 text-right">Montant (Ar)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line font-mono">
                    {editingItems.map((item, idx) => {
                      const isSel = idx === selectedItemIdx;
                      return (
                        <tr
                          key={idx}
                          onClick={() => selectItemForEditing(idx)}
                          className={`cursor-pointer divide-x divide-line transition-colors ${
                            isSel
                              ? 'bg-blue-500 text-white font-semibold'
                              : 'hover:bg-surface-muted text-ink-strong'
                          }`}
                        >
                          <td className="p-2 truncate">{item.code || `ACT-${String(idx + 1).padStart(2, '0')}`}</td>
                          <td className={`p-2 truncate ${isSel ? 'text-white' : 'text-ink-strong font-medium font-sans'}`}>
                            {item.description}
                          </td>
                          <td className="p-2 text-center uppercase text-[10px] font-bold">
                            <span className={`px-1.5 py-0.5 rounded font-sans ${
                              isSel 
                                ? 'bg-blue-600 text-white' 
                                : item.category === 'pharmacy' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                                : item.category === 'lab' ? 'bg-blue-100 dark:bg-cyan-500/15 text-blue-800 dark:text-cyan-300'
                                : item.category === 'consultation' ? 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300'
                                : item.category === 'echo' ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300'
                                : 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                            }`}>
                              {item.category === 'surgery' ? 'bloc' : item.category}
                            </span>
                          </td>
                          <td className="p-2 text-right">{item.quantity || 1}</td>
                          <td className="p-2 text-right">
                            {formatNum(item.unitPrice !== undefined ? item.unitPrice : (item.amount / (item.quantity || 1)))}
                          </td>
                          <td className={`p-2 text-right font-bold ${isSel ? 'text-white' : 'text-indigo-900 dark:text-indigo-300'}`}>
                            {formatNum(item.amount)}
                          </td>
                        </tr>
                      );
                    })}
                    {editingItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-ink-faint font-sans">
                          Aucun acte ou prescription dans cette facture. Utilisez la Saisie Sage ci-dessus pour ajouter des lignes.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-indigo-50 dark:bg-indigo-500/8 border border-indigo-200 dark:border-indigo-500/25 rounded-lg flex justify-between items-center text-sm font-bold text-indigo-900 dark:text-indigo-300 font-sans">
                <span>Nouveau Total Facture :</span>
                <span className="font-mono text-base">{formatAr(editingItems.reduce((s, i) => s + Number(i.amount || 0), 0))}</span>
              </div>
            </div>

            <div className="p-3 bg-surface-hover border-t flex justify-end gap-2 font-sans">
              <button onClick={() => setEditingInvoice(null)} className="px-4 py-1.5 bg-surface-active hover:bg-line-strong text-ink font-bold rounded-lg text-xs cursor-pointer">
                Annuler
              </button>
              <button onClick={saveInvoiceItems} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer shadow-md">
                <Save className="w-4 h-4" /> Enregistrer les modifications
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL : RÈGLEMENT GLOBAL ===== */}
      {payingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>setPayingAccount(null)}>
          <div className="w-full max-w-lg bg-surface rounded-xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold flex items-center gap-2"><BadgeCheck className="w-5 h-5"/> Régler toutes les factures du mois — {payingAccount.company}</span>
              <button onClick={()=>setPayingAccount(null)} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="p-3 bg-surface-muted border rounded-lg text-xs grid grid-cols-3 gap-2 text-center">
                <div><div className="text-ink-faint">Facturé</div><div className="font-mono font-bold">{formatAr(payingAccount.totalAmount)}</div></div>
                <div><div className="text-ink-faint">Déjà réglé</div><div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatAr(payingAccount.paidAmount)}</div></div>
                <div><div className="text-ink-faint">Solde</div><div className="font-mono font-bold text-rose-600 dark:text-rose-400">{formatAr(payingAccount.totalAmount-payingAccount.paidAmount)}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-ink-secondary mb-1">Date de paiement</label><input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none"/></div>
                <div><label className="block text-xs font-semibold text-ink-secondary mb-1">Mode de paiement</label><select value={payMethod} onChange={e=>setPayMethod(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-surface cursor-pointer">{paymentMethods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
              </div>
              <div><label className="block text-xs font-semibold text-ink-secondary mb-1">Référence de paiement</label><input type="text" value={payReference} onChange={e=>setPayReference(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono outline-none" placeholder="Ex: VIR-2026-01234"/></div>
              <div><label className="block text-xs font-semibold text-ink-secondary mb-1">Observation</label><textarea value={payObservation} onChange={e=>setPayObservation(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" placeholder="Note libre…"/></div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={()=>setPayingAccount(null)} className="px-3 py-2 bg-surface-active hover:bg-line-strong text-ink rounded-lg text-xs font-semibold cursor-pointer">Annuler</button>
                <button onClick={saveGlobalPayment} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"><Check className="w-3.5 h-3.5"/>Valider et solder le relevé</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL : RÈGLEMENT INDIVIDUEL ===== */}
      {payingIndividual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={()=>setPayingIndividual(null)}>
          <div className="w-full max-w-lg bg-surface rounded-xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold flex items-center gap-2"><CreditCard className="w-5 h-5"/> Règlement individuel — {payingIndividual.ids.length} facture(s)</span>
              <button onClick={()=>setPayingIndividual(null)} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-ink-secondary mb-1">Montant (Ar)</label><input type="number" min={1} value={indivAmount} onChange={e=>setIndivAmount(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono outline-none"/></div>
                <div><label className="block text-xs font-semibold text-ink-secondary mb-1">Date</label><input type="date" value={indivDate} onChange={e=>setIndivDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none"/></div>
              </div>
              <div><label className="block text-xs font-semibold text-ink-secondary mb-1">Mode de paiement</label><select value={indivMethod} onChange={e=>setIndivMethod(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-surface cursor-pointer">{paymentMethods.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-ink-secondary mb-1">Référence</label><input type="text" value={indivReference} onChange={e=>setIndivReference(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono outline-none"/></div>
              <div><label className="block text-xs font-semibold text-ink-secondary mb-1">Observation</label><textarea value={indivObservation} onChange={e=>setIndivObservation(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm outline-none"/></div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={()=>setPayingIndividual(null)} className="px-3 py-2 bg-surface-active hover:bg-line-strong text-ink rounded-lg text-xs font-semibold cursor-pointer">Annuler</button>
                <button onClick={saveIndividualPayment} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"><Check className="w-3.5 h-3.5"/>Enregistrer le paiement</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
