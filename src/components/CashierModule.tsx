import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Invoice, InvoiceItem, ClientType, LabRequest, EchoRequest, User, CashClosing, HbLine, HbRecord, Consultation, Prescription } from '../types';
import type { AppState } from '../store';
import { addAuditLog, addNotification, formatAr, getPrice, calculateAge, generateDossierNumber, addJourneyEvent, generatePharmaClosingNumber } from '../store';
import { CreditCard, ShoppingCart, Trash2, Lock, Printer, Building2, Heart, Save, UserPlus, Edit2, Plus, MessageCircle, Send } from 'lucide-react';
import { printPaymentTicket as openThermalTicket, printClosingTicket, printLabRequestTicket, printEchoRequestTicket, printHbPaymentTicket } from '../utils/printTicket';
import { blockIfUnsavedDraftLine } from '../utils/validation';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onOpenMessagingWithRecipient?: (recipientId: string) => void;
}
type Tab = 'payment' | 'external' | 'hospit' | 'bloc' | 'closing';
type HbModal = 'none' | 'add_patient' | 'add_article' | 'edit_client';

export default function CashierModule({ state, setState, onOpenMessagingWithRecipient }: Props) {
  const [selConsultId, setSelConsultId] = useState<string | null>(null);
  const [selPatientId, setSelPatientId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('payment');
  const payingRef = useRef(false);

  // Rectification modal state
  const [rectificationModal, setRectificationModal] = useState<{
    open: boolean;
    doctorId: string;
    doctorName: string;
    patientName: string;
    dossier: string;
  } | null>(null);
  const [rectificationText, setRectificationText] = useState('');

  // External sale (session-local: n'a pas besoin d'être partagé)
  const [extSearch, setExtSearch] = useState('');
  const [extSearchIdx, setExtSearchIdx] = useState(0);
  const [extLines, setExtLines] = useState<HbLine[]>([]);
  const [extSelLineId, setExtSelLineId] = useState<string | null>(null);
  const [extLineForm, setExtLineForm] = useState<HbLine>({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: new Date().toISOString().split('T')[0] });
  const [extIsNew, setExtIsNew] = useState(false);
  const extSearchRef = useRef<HTMLInputElement>(null);

  // Hospit/Bloc — la liste est PARTAGÉE entre Caisse et Pharmacie (state global),
  // car peu importe qui saisit (caisse ou pharmacie de garde), c'est le paiement qui fait foi.
  const hbRecords: HbRecord[] = state.hbRecords || [];
  const updateHbRecords = (updater: HbRecord[] | ((prev: HbRecord[]) => HbRecord[])) => {
    setState(prev => {
      const base = prev.hbRecords || [];
      const next = typeof updater === 'function' ? (updater as (p: HbRecord[]) => HbRecord[])(base) : updater;
      return { ...prev, hbRecords: next };
    });
  };
  const [hbSelRecordId, setHbSelRecordId] = useState<string | null>(null);
  const [hbPayAmount, setHbPayAmount] = useState(0);
  const [hbModal, setHbModal] = useState<HbModal>('none');

  // HB Modal: patient search/add (ALL fields like reception)
  const [hbPatSearch, setHbPatSearch] = useState('');
  const [hbNewPat, setHbNewPat] = useState({ lastName: '', firstName: '', dateOfBirth: '', gender: 'M' as 'M'|'F', contact: '', address: '', matricule: '', ssn: '', insureName: '', clientType: 'comptoir' as ClientType, company: '', subCompany: '' });

  // HB Modal: article add
  const [hbArtSearch, setHbArtSearch] = useState('');
  const [hbArtIdx, setHbArtIdx] = useState(0);
  const [hbArtForm, setHbArtForm] = useState<HbLine>({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: new Date().toISOString().split('T')[0] });
  const hbArtRef = useRef<HTMLInputElement>(null);
  const [hbSelLineId, setHbSelLineId] = useState<string | null>(null);
  const [hbIsNew, setHbIsNew] = useState(true);

  // HB Modal: edit client type
  const [hbEditClientType, setHbEditClientType] = useState<ClientType>('comptoir');
  const [hbEditCompany, setHbEditCompany] = useState('');

  // Data
  // Unified: patients with pharmacy awaiting payment OR pending lab/echo invoices
  const pendingPatients = state.patients.filter(p =>
    p.status === 'consulted_awaiting_payment' ||
    state.invoices.some(i => i.patientId === p.id && i.status === 'pending' && i.items.some(it => it.category === 'lab' || it.category === 'echo'))
  );

  // Pending lab + echo invoices (merge with pharmacy)
  const pendingServiceInvoices = state.invoices.filter(
    (i) => i.status === 'pending' && i.items.some((it) => it.category === 'lab' || it.category === 'echo'),
  );

  // Helper: get all pending items for a patient (pharmacy + lab + echo)
  const getPendingAmount = (p: any) => {
    const cons = state.consultations.filter(c => c.patientId === p.id && !state.invoices.some(inv => inv.consultationId === c.id && inv.status === 'paid' && inv.items.some(it => it.category === 'pharmacy')));
    let amt = cons.reduce((s, c) => s + c.prescriptions.reduce((ss, pr) => ss + Math.round(pr.unitPrice * pr.quantity * (1 - pr.discount / 100)), 0), 0);
    const svcInvs = pendingServiceInvoices.filter(i => i.patientId === p.id);
    amt += svcInvs.reduce((s, i) => s + i.totalAmount, 0);
    return amt;
  };
  // Consultations dont les médicaments ne sont pas encore encaissés
  const getConsults = (pid: string) => state.consultations.filter(c =>
    c.patientId === pid &&
    c.prescriptions.length > 0 &&
    !state.invoices.some(inv => inv.consultationId === c.id && inv.status === 'paid' && inv.items.some(it => it.category === 'pharmacy'))
  );
  const selConsult = state.consultations.find(c => c.id === selConsultId);
  const selPatient = state.patients.find(p => p.id === (selPatientId || selConsult?.patientId)) || null;

  const handlePayment = () => {
    if (!selPatient) return;
    // Garde anti double-paiement
    if (payingRef.current) return;
    payingRef.current = true;
    const unpaidConsults = getConsults(selPatient.id);
    const medicationItems: InvoiceItem[] = unpaidConsults.flatMap(c => c.prescriptions.map(p => ({
      description: `${p.articleName} × ${p.quantity}${p.discount > 0 ? ` (-${p.discount}%)` : ''}`,
      amount: Math.round(p.unitPrice * p.quantity * (1 - p.discount / 100)), category: 'pharmacy' as const,
    })));
    const serviceInvoices = pendingServiceInvoices.filter(i => i.patientId === selPatient.id);
    const serviceItems = serviceInvoices.flatMap(i => i.items);
    // Déduplication des items service par description + montant (sécurité anti-doublon)
    const seen = new Set<string>();
    const dedupedServiceItems = serviceItems.filter(item => {
      const key = `${item.description}|${item.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const unifiedItems = [...medicationItems, ...dedupedServiceItems];
    const total = unifiedItems.reduce((sum, item) => sum + item.amount, 0);
    if (!unifiedItems.length) { payingRef.current = false; return; }
    const paidAt = new Date().toISOString();
    const inv: Invoice = { id: uuidv4(), patientId: selPatient.id, consultationId: unpaidConsults[0]?.id, clientType: selPatient.clientType, items: unifiedItems, totalAmount: total, patientCharge: total, status: 'paid', paidAt, paidBy: state.currentUser?.id || '', createdAt: paidAt, isExternal: false };

    // Collecter les examens labo / écho à imprimer sur le bon (seulement ceux demandés)
    const paidLabInvoiceIds = new Set(serviceInvoices.filter(i => i.items.some(it => it.category === 'lab')).map(i => i.id));
    const paidEchoInvoiceIds = new Set(serviceInvoices.filter(i => i.items.some(it => it.category === 'echo')).map(i => i.id));
    const patientConsults = state.consultations.filter(c => c.patientId === selPatient.id);
    const labToPrint: LabRequest[] = state.labRequests.filter(r =>
      r.patientId === selPatient.id && (r.status === 'pending' || !r.status) && (
        (r.invoiceId && paidLabInvoiceIds.has(r.invoiceId)) ||
        unpaidConsults.some(c => c.id === r.consultationId)
      )
    );
    // Échos en attente du patient (via facture écho ou consultation non soldée)
    const allEchos: EchoRequest[] = patientConsults.flatMap(c =>
      (c.echoRequests || []).filter(e =>
        (e.status === 'pending' || !e.status) && (
          (e.invoiceId && paidEchoInvoiceIds.has(e.invoiceId)) ||
          unpaidConsults.some(uc => uc.id === c.id) ||
          paidEchoInvoiceIds.size > 0 && !e.invoiceId
        )
      )
    );

    const doctorUser: User | undefined = (() => {
      const refConsult = unpaidConsults[0] || patientConsults[patientConsults.length - 1];
      const docId = refConsult?.doctorId;
      const docName = refConsult?.doctorName;
      if (docId) {
        const u = state.users.find(x => x.id === docId);
        if (u) return u;
      }
      if (docName) return { id: docId || 'DOC', name: docName, role: 'doctor' };
      return state.currentUser || undefined;
    })();

    setState(prev => {
      // Factures labo/écho en attente + anciennes factures pharmacie pending du patient
      const toMarkPaid = new Set([
        ...serviceInvoices.map(i => i.id),
        ...prev.invoices
          .filter(i => i.patientId === selPatient.id && i.status === 'pending' && i.items.every(it => it.category === 'pharmacy'))
          .map(i => i.id),
      ]);
      const next = { ...prev,
        invoices: [
          ...prev.invoices.map(i => toMarkPaid.has(i.id)
            ? { ...i, status: 'paid' as const, paidAt, paidBy: prev.currentUser?.id || '' }
            : i),
          inv,
        ],
        // Marquer les lab requests comme payés
        labRequests: prev.labRequests.map(r =>
          labToPrint.some(l => l.id === r.id) ? { ...r, status: 'paid' as const } : r
        ),
        // Marquer les échos comme payés sur les consultations
        consultations: prev.consultations.map(c => {
          if (c.patientId !== selPatient.id || !c.echoRequests?.length) return c;
          return {
            ...c,
            echoRequests: c.echoRequests.map(e =>
              allEchos.some(x => x.id === e.id) ? { ...e, status: 'paid' as const } : e
            ),
          };
        }),
        // lastVisitAt mis à jour au paiement (clients déjà payés inclus)
        patients: prev.patients.map(p => p.id === selPatient.id
          ? { ...p, status: 'invoice_paid' as const, lastVisitAt: paidAt }
          : p),
      };
      const parts = [
        medicationItems.length ? 'médicaments' : '',
        serviceItems.some(i => i.category === 'lab') ? 'analyses' : '',
        serviceItems.some(i => i.category === 'echo') ? 'échographies' : '',
      ].filter(Boolean).join(' + ');
      addAuditLog(next, 'PAIEMENT_UNIFIE', `${formatAr(total)} — ${parts || 'facture'} — ${selPatient.lastName}`, selPatient.id);
      addJourneyEvent(next, { patientId: selPatient.id, department: 'caisse', action: 'Paiement unifié enregistré', status: 'invoice_paid', details: `${formatAr(total)} (${parts || 'facture'})`, actorName: prev.currentUser?.name });
      if (medicationItems.length > 0) addNotification(next, 'pharmacy', `💊 ${selPatient.lastName} ${selPatient.firstName}`, 'info');
      if (labToPrint.length > 0) addNotification(next, 'laboratory', `🧪 Analyses payées: ${selPatient.lastName} ${selPatient.firstName}`, 'info');
      return next;
    });

    // 1) Ticket caisse (reçu de paiement)
    openThermalTicket(state.ticketSettings, inv, selPatient, state.currentUser || undefined);

    // 2) Bon d'analyse — uniquement les examens demandés — après le ticket
    if (labToPrint.length > 0 && doctorUser) {
      setTimeout(() => {
        printLabRequestTicket(state.ticketSettings, selPatient, doctorUser, new Date(), labToPrint);
      }, 900);
    }
    // 3) Bon d'échographie — uniquement les examens demandés
    if (allEchos.length > 0 && doctorUser) {
      setTimeout(() => {
        printEchoRequestTicket(state.ticketSettings, selPatient, doctorUser, new Date(), allEchos);
      }, labToPrint.length > 0 ? 1800 : 900);
    }

    setSelConsultId(null); setSelPatientId(null);
    payingRef.current = false;
  };

  // LAB items merged: invoices containing lab items are processed in payment queue (no separate lab tab)

  // === EXTERNAL ===
  // Exclure les articles bloqués à la vente (réservé / régularisation)
  const extFiltered = extSearch.length >= 1
    ? state.articles.filter(a => a.name.toLowerCase().includes(extSearch.toLowerCase()) && !a.saleBlocked)
    : [];
  const extLineAmt = (l: HbLine) => Math.round(l.unitPrice * l.quantity * (1 - l.discount / 100));
  const extTotal = extLines.reduce((s, l) => s + extLineAmt(l), 0);

  const extSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    if (a.saleBlocked) {
      alert(`⛔ Vente bloquée pour « ${a.name} »${a.saleBlockReason ? ` — ${a.saleBlockReason}` : ''}. Débloquez l'article en pharmacie.`);
      return;
    }
    // Gestion des stocks : un article en rupture pharmacie ne peut pas faire l'objet d'une vente
    if (a.stockPharmacie <= 0) {
      alert(`🚨 RUPTURE DE STOCK : « ${a.name} » (stock pharmacie = 0).\n\nCet article ne peut pas être vendu. Demandez un réapprovisionnement à la pharmacie.`);
      return;
    }
    // La date saisie est conservée : elle ne s'efface pas entre les lignes (plusieurs sorties le même jour)
    const nl: HbLine = { id: uuidv4(), articleName: a.name, quantity: 1, unitPrice: getPrice(a, 'externe'), discount: 0, dateSort: extLineForm.dateSort || new Date().toISOString().split('T')[0] };
    setExtLineForm({ ...nl }); setExtSelLineId(nl.id); setExtIsNew(true); setExtSearch('');
  };
  const extSaveLine = () => {
    if (!extLineForm.articleName) return;
    // Contrôle stock pharmacie à la validation de la ligne
    const art = state.articles.find(a => a.name === extLineForm.articleName);
    if (art && art.stockPharmacie <= 0) { alert(`🚨 RUPTURE DE STOCK : « ${art.name} » (stock pharmacie = 0).\n\nVente impossible.`); return; }
    if (art && extLineForm.quantity > art.stockPharmacie) {
      if (!confirm(`⚠️ Stock pharmacie insuffisant pour « ${art.name} » : ${art.stockPharmacie} disponible(s), ${extLineForm.quantity} demandée(s).\n\nEnregistrer quand même ?`)) return;
    }
    const lineToSave: HbLine = { ...extLineForm, dateSort: extLineForm.dateSort || new Date().toISOString().split('T')[0] };
    if (extIsNew || !extLines.find(l => l.id === extLineForm.id)) setExtLines([...extLines, lineToSave]);
    else setExtLines(extLines.map(l => l.id === extLineForm.id ? lineToSave : l));
    setExtIsNew(false);
    // La date n'est PAS réinitialisée après validation : une personne peut faire sortir plusieurs médicaments le même jour
    setExtLineForm(prev => ({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: prev.dateSort || new Date().toISOString().split('T')[0] }));
    setTimeout(() => extSearchRef.current?.focus(), 50);
  };
  const extKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setExtSearchIdx(i => Math.min(i + 1, extFiltered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setExtSearchIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (extFiltered.length > 0 && extSearch) extSelectArticle(extFiltered[extSearchIdx].id);
      else if (extLineForm.articleName) extSaveLine(); // Enter = validate
    }
    else if (e.key === 'Escape') setExtSearch('');
  };
  const extPay = () => {
    if (extLines.length === 0) return;
    // Ne pas valider l'encaissement si une ligne de vente est en cours de saisie mais non enregistrée
    if (blockIfUnsavedDraftLine(extLineForm, extLines, { entityLabel: 'l\'article' })) return;
    // Contrôle blocage vente au moment de l'encaissement
    const blockedLines = extLines.filter((l) => {
      const art = state.articles.find((a) => a.name === l.articleName);
      return art?.saleBlocked;
    });
    if (blockedLines.length > 0) {
      alert(`⛔ Vente bloquée pour :\n${blockedLines.map((l) => {
        const art = state.articles.find((a) => a.name === l.articleName);
        return `• ${l.articleName}${art?.saleBlockReason ? ` (${art.saleBlockReason})` : ''}`;
      }).join('\n')}`);
      return;
    }
    // Contrôle rupture : un article en rupture pharmacie ne peut pas faire l'objet d'une vente
    const outLines = extLines.filter((l) => {
      const art = state.articles.find((a) => a.name === l.articleName);
      return !art || art.stockPharmacie <= 0;
    });
    if (outLines.length > 0) {
      alert(`🚨 RUPTURE DE STOCK — vente impossible pour :\n${outLines.map((l) => `• ${l.articleName} (stock pharmacie = 0)`).join('\n')}\n\nRetirez ces lignes ou demandez un réapprovisionnement.`);
      return;
    }
    // Contrôle quantités : avertissement si la quantité vendue dépasse le stock disponible
    const insuffLines = extLines.filter((l) => {
      const art = state.articles.find((a) => a.name === l.articleName);
      return art && art.stockPharmacie < l.quantity;
    });
    if (insuffLines.length > 0) {
      const detail = insuffLines.map((l) => {
        const art = state.articles.find((a) => a.name === l.articleName);
        return `• ${l.articleName} : ${art?.stockPharmacie ?? 0} dispo / ${l.quantity} demandé(s)`;
      }).join('\n');
      if (!confirm(`⚠️ Stock insuffisant pour :\n${detail}\n\nEncaisser quand même ?`)) return;
    }

    // Séparer les médicaments (family === 'MEDIC') des autres articles
    const medicamentLines = extLines.filter((l) => {
      const art = state.articles.find((a) => a.name === l.articleName);
      return art?.family === 'MEDIC';
    });
    const nonMedicamentLines = extLines.filter((l) => {
      const art = state.articles.find((a) => a.name === l.articleName);
      return art?.family !== 'MEDIC';
    });

    let extConsultId: string | undefined = undefined;
    let newConsultations: Consultation[] = [];

    if (medicamentLines.length > 0) {
      extConsultId = uuidv4();
      const prescriptions: Prescription[] = medicamentLines.map((l) => ({
        id: uuidv4(),
        articleId: state.articles.find((a) => a.name === l.articleName)?.id || '',
        articleName: l.articleName,
        quantity: l.quantity,
        posology: 'Vente externe',
        duration: '',
        instructions: '',
        unitPrice: l.unitPrice,
        discount: l.discount,
        delivered: false,
      }));
      const extConsult: Consultation = {
        id: extConsultId,
        patientId: '',
        doctorId: state.currentUser?.id || 'CASHIER',
        doctorName: state.currentUser?.name ? `Vente Externe (${state.currentUser.name})` : 'Vente Externe',
        date: new Date().toISOString(),
        visitReason: 'Vente externe — Pharmacie',
        diagnosis: 'Client Externe',
        prescriptions,
        labRequests: [],
        hospitalizeRequested: false,
        surgeryRequested: false,
        isEmergency: false,
      };
      newConsultations.push(extConsult);
    }

    const inv: Invoice = {
      id: uuidv4(),
      consultationId: extConsultId,
      clientName: 'Client Externe',
      clientType: 'externe',
      items: extLines.map(l => ({ description: `${l.articleName} × ${l.quantity}`, amount: extLineAmt(l), category: 'pharmacy' as const })),
      totalAmount: extTotal,
      patientCharge: extTotal,
      status: 'paid',
      paidAt: new Date().toISOString(),
      paidBy: state.currentUser?.id || '',
      createdAt: new Date().toISOString(),
      isExternal: true
    };

    setState(prev => {
      // Décrémenter stock pharmacie uniquement pour les articles NON-médicaments (les médicaments le seront lors de la délivrance pharmacie)
      let articles = [...prev.articles];
      nonMedicamentLines.forEach((l) => {
        const idx = articles.findIndex((a) => a.name === l.articleName);
        if (idx >= 0) articles[idx] = { ...articles[idx], stockPharmacie: Math.max(0, articles[idx].stockPharmacie - l.quantity) };
      });
      const next = {
        ...prev,
        invoices: [...prev.invoices, inv],
        consultations: [...prev.consultations, ...newConsultations],
        articles
      };
      addAuditLog(next, 'VENTE_EXTERNE', `Client Externe — ${formatAr(extTotal)}${medicamentLines.length > 0 ? ' (avec ordonnance ajoutée à la file d\'attente pharmacie)' : ''}`);
      addNotification(next, 'pharmacy', `🛒 Client Externe — ${formatAr(extTotal)}${medicamentLines.length > 0 ? ' (Ordonnance ajoutée à la file d\'attente)' : ''}`, 'info');
      return next;
    });
    openThermalTicket(state.ticketSettings, inv, undefined, state.currentUser || undefined);
    setExtLines([]); setExtSearch('');
  };

  // === HOSPIT/BLOC ===
  const hbLineAmt = (l: HbLine) => Math.round(l.unitPrice * l.quantity * (1 - l.discount / 100));
  const hbPatFiltered = hbPatSearch.length >= 1 ? state.patients.filter(p => `${p.lastName} ${p.firstName}`.toLowerCase().includes(hbPatSearch.toLowerCase()) || p.dossier.toLowerCase().includes(hbPatSearch.toLowerCase())) : [];

  const hbSelectPatient = (patientId: string) => {
    const p = state.patients.find(x => x.id === patientId);
    if (!p) return;
    const exists = hbRecords.some(r => r.patientId === p.id && r.type === tab);
    if (exists) { alert('Ce patient est déjà dans la liste'); return; }
    const now = new Date().toISOString();
    updateHbRecords([...hbRecords, {
      id: uuidv4(), patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
      clientType: p.clientType, company: p.company,
      type: tab as 'hospit' | 'bloc', lines: [], payments: [],
      openedAt: now, openedBy: state.currentUser?.name, openedByUserId: state.currentUser?.id,
    }]);
    setHbPatSearch(''); setHbModal('none');
  };

  const hbAddNewPatient = () => {
    if (!hbNewPat.lastName || !hbNewPat.firstName) { alert('Nom et prénom requis'); return; }
    const np = {
      id: uuidv4(), dossier: generateDossierNumber(hbNewPat.lastName),
      firstName: hbNewPat.firstName.toUpperCase(), lastName: hbNewPat.lastName.toUpperCase(),
      dateOfBirth: hbNewPat.dateOfBirth || 'N/A', age: hbNewPat.dateOfBirth ? calculateAge(hbNewPat.dateOfBirth) : 'N/A',
      gender: hbNewPat.gender, address: hbNewPat.address.toUpperCase(), contact: hbNewPat.contact,
      ssn: hbNewPat.ssn, matricule: hbNewPat.matricule || undefined,
      insureName: hbNewPat.insureName?.toUpperCase() || undefined,
      clientType: hbNewPat.clientType,
      company: hbNewPat.clientType === 'societe' ? hbNewPat.company : undefined,
      subCompany: hbNewPat.clientType === 'societe' ? hbNewPat.subCompany : undefined,
      allergies: [] as string[], chronicTreatments: [] as string[], antecedents: [] as string[],
      registeredAt: new Date().toISOString(), registeredBy: state.currentUser?.id || 'CAISSE', status: 'registered' as const,
    };
    const now = new Date().toISOString();
    setState(prev => ({ ...prev, patients: [...prev.patients, np] }));
    updateHbRecords([...hbRecords, {
      id: uuidv4(), patientId: np.id, patientName: `${np.lastName} ${np.firstName}`,
      clientType: np.clientType, company: np.company,
      type: tab as 'hospit' | 'bloc', lines: [], payments: [],
      openedAt: now, openedBy: state.currentUser?.name, openedByUserId: state.currentUser?.id,
    }]);
    setHbNewPat({ lastName: '', firstName: '', dateOfBirth: '', gender: 'M', contact: '', address: '', matricule: '', ssn: '', insureName: '', clientType: 'comptoir', company: '', subCompany: '' });
    setHbModal('none');
  };

  // Article modal for hospit/bloc — exclure articles bloqués
  const hbArtFiltered = hbArtSearch.length >= 1
    ? state.articles.filter(a => a.name.toLowerCase().includes(hbArtSearch.toLowerCase()) && !a.saleBlocked)
    : [];

  const hbArtNew = () => {
    // La date d'acte / de sortie n'est JAMAIS effacée par "Nouveau" ni par la validation :
    // une personne peut faire sortir plusieurs médicaments le même jour.
    // (Elle est réinitialisée uniquement à l'ouverture du panneau de saisie.)
    setHbArtForm(prev => ({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: prev.dateSort || new Date().toISOString().split('T')[0] }));
    setHbSelLineId(null);
    setHbIsNew(true);
    setHbArtSearch('');
    setTimeout(() => hbArtRef.current?.focus(), 50);
  };

  const hbArtDelete = () => {
    if (!hbSelRecordId || !hbSelLineId) return;
    updateHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, lines: r.lines.filter(l => l.id !== hbSelLineId) } : r));
    hbArtNew();
  };

  const hbArtSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    if (a.saleBlocked) {
      alert(`⛔ Vente bloquée pour « ${a.name} »${a.saleBlockReason ? ` — ${a.saleBlockReason}` : ''}.`);
      return;
    }
    // Gestion des stocks : un article en rupture pharmacie ne peut pas faire l'objet d'une vente
    if (a.stockPharmacie <= 0) {
      alert(`🚨 RUPTURE DE STOCK : « ${a.name} » (stock pharmacie = 0).\n\nCet article ne peut pas être vendu. Demandez un réapprovisionnement à la pharmacie.`);
      return;
    }
    const rec = hbRecords.find(r => r.id === hbSelRecordId);
    // On conserve la date déjà saisie (sorties multiples le même jour)
    setHbArtForm(prev => ({ id: uuidv4(), articleName: a.name, quantity: 1, unitPrice: getPrice(a, rec?.clientType || 'comptoir'), discount: 0, dateSort: prev.dateSort || new Date().toISOString().split('T')[0] }));
    setHbIsNew(true);
    setHbSelLineId(null);
    setHbArtSearch('');
    setTimeout(() => {
      const qtyInput = document.getElementById('hb-qty-input');
      qtyInput?.focus();
      (qtyInput as HTMLInputElement)?.select();
    }, 50);
  };

  const hbArtSave = () => {
    if (!hbSelRecordId || !hbArtForm.articleName) return;
    const rec = hbRecords.find(r => r.id === hbSelRecordId);
    if (!rec) return;

    // Contrôle stock pharmacie à la validation de la ligne
    const art = state.articles.find(a => a.name === hbArtForm.articleName);
    if (art && art.stockPharmacie <= 0) { alert(`🚨 RUPTURE DE STOCK : « ${art.name} » (stock pharmacie = 0).\n\nVente impossible.`); return; }
    if (art && hbArtForm.quantity > art.stockPharmacie) {
      if (!confirm(`⚠️ Stock pharmacie insuffisant pour « ${art.name} » : ${art.stockPharmacie} disponible(s), ${hbArtForm.quantity} demandée(s).\n\nEnregistrer quand même ?`)) return;
    }

    const lineToSave: HbLine = {
      ...hbArtForm,
      // La date correspond à la date d'acte / de sortie de marchandise.
      // Elle est saisie dans le formulaire et doit être conservée lors de l'enregistrement.
      dateSort: hbArtForm.dateSort || new Date().toISOString().split('T')[0]
    };

    if (hbIsNew || !rec.lines.some(l => l.id === hbArtForm.id)) {
      updateHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, lines: [...r.lines, { ...lineToSave, id: uuidv4() }] } : r));
    } else {
      updateHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, lines: r.lines.map(l => l.id === hbArtForm.id ? lineToSave : l) } : r));
    }
    // Après validation : la zone date n'est PAS effacée (hbArtNew conserve la date saisie)
    hbArtNew();
  };

  const hbArtKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHbArtIdx(i => Math.min(i + 1, hbArtFiltered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHbArtIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (hbArtFiltered.length > 0 && hbArtSearch) hbArtSelectArticle(hbArtFiltered[hbArtIdx].id);
      else if (hbArtForm.articleName) hbArtSave();
    }
    else if (e.key === 'Escape') setHbArtSearch('');
  };

  const addPartialPay = (recordId: string) => {
    const rec = hbRecords.find(r => r.id === recordId);
    if (!rec || hbPayAmount <= 0) return;
    const totalFact = rec.lines.reduce((s, l) => s + hbLineAmt(l), 0);
    const totalPaid = rec.payments.reduce((s, p) => s + p.amount, 0);
    const reste = totalFact - totalPaid;
    if (hbPayAmount > reste) { alert(`Montant supérieur au reste à payer (${formatAr(reste)})`); return; }
    const payment = {
      amount: hbPayAmount,
      paidBy: state.currentUser?.name || '',
      paidByUserId: state.currentUser?.id,
      date: new Date().toISOString(),
    };
    updateHbRecords((prev) => prev.map(r => r.id === recordId ? { ...r, payments: [...r.payments, payment] } : r));

    // Imprimer le ticket de paiement pour hospitalisation/bloc
    const newTotalPaid = totalPaid + hbPayAmount;
    const newReste = totalFact - newTotalPaid;
    const patient = rec.patientId ? state.patients.find(p => p.id === rec.patientId) : undefined;
    printHbPaymentTicket(
      state.ticketSettings,
      rec,
      payment,
      totalFact,
      newTotalPaid,
      newReste,
      state.currentUser || undefined,
      patient,
    );

    setHbPayAmount(0);
  };

  // Edit client type
  const hbSaveClientType = () => {
    if (!hbSelRecordId) return;
    const rec = hbRecords.find(r => r.id === hbSelRecordId);
    updateHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, clientType: hbEditClientType, company: hbEditClientType === 'societe' ? hbEditCompany : undefined } : r));
    // Also update patient in state if linked
    if (rec?.patientId) {
      setState(prev => ({ ...prev, patients: prev.patients.map(p => p.id === rec.patientId ? { ...p, clientType: hbEditClientType === 'externe' ? 'comptoir' : hbEditClientType as 'comptoir'|'societe', company: hbEditClientType === 'societe' ? hbEditCompany : undefined } : p) }));
    }
    setHbModal('none');
  };

  // Auto-add from doctor requests
  const autoAddRequests = () => {
    const now = new Date().toISOString();
    const openerName = state.currentUser?.name;
    const openerId = state.currentUser?.id;
    const additions: HbRecord[] = [];
    state.consultations.forEach(c => {
      const pat = state.patients.find(p => p.id === c.patientId);
      if (!pat) return;
      const name = `${pat.lastName} ${pat.firstName}`;
      if (c.hospitalizeRequested && !hbRecords.some(h => h.patientId === pat.id && h.type === 'hospit'))
        additions.push({ id: uuidv4(), patientId: pat.id, patientName: name, clientType: pat.clientType, company: pat.company, type: 'hospit', lines: [], payments: [], openedAt: now, openedBy: openerName, openedByUserId: openerId });
      if (c.surgeryRequested && !hbRecords.some(h => h.patientId === pat.id && h.type === 'bloc'))
        additions.push({ id: uuidv4(), patientId: pat.id, patientName: name, clientType: pat.clientType, company: pat.company, type: 'bloc', lines: [], payments: [], openedAt: now, openedBy: openerName, openedByUserId: openerId });
    });
    if (additions.length > 0) updateHbRecords(prev => [...prev, ...additions]);
  };
  const switchTab = (t: Tab) => { setTab(t); if (t === 'hospit' || t === 'bloc') autoAddRequests(); };

  // Stats — FILTRÉES PAR LE CAISSIER CONNECTÉ
  // Les paiements se font individuellement et au nom de la personne qui a reçu l'argent.
  // La clôture affiche UNIQUEMENT la caisse du caissier connecté, pas la totalité du jour.
  const currentCashierId = state.currentUser?.id || 'SYS';

  const paidInvoices = state.invoices.filter(inv => inv.status === 'paid');
  const todayInvoices = paidInvoices.filter(inv => new Date(inv.paidAt || '').toDateString() === new Date().toDateString());
  // Factures du caissier connecté uniquement
  const myTodayInvoices = todayInvoices.filter(inv => inv.paidBy === currentCashierId);
  const myTodayTotal = myTodayInvoices.reduce((s, inv) => s + inv.patientCharge, 0);
  const myTodayExtTotal = myTodayInvoices.filter(i => i.isExternal).reduce((s, i) => s + i.patientCharge, 0);
  // Paiements Hospit/Bloc du caissier connecté uniquement
  const myTodayPartialTotal = hbRecords.reduce((s, h) => s + h.payments.filter(p => new Date(p.date).toDateString() === new Date().toDateString() && p.paidByUserId === currentCashierId).reduce((ss, p) => ss + p.amount, 0), 0);

  const myGrandTotal = myTodayTotal + myTodayPartialTotal;

  const curHbRecords = hbRecords.filter(h => h.type === tab);
  const closingDateKey = new Date().toDateString();
  const existingClosing = state.cashClosings.find(c => new Date(c.date).toDateString() === closingDateKey && c.cashierId === currentCashierId);
  // Une facture déjà intégrée dans un Z ne peut jamais être comptée une seconde fois.
  // On ne clôture que les factures du caissier connecté.
  const closeableInvoices = myTodayInvoices.filter(inv => !inv.closingId);

  const closingSections = (invoices: Invoice[], hospitalizationTotal = myTodayPartialTotal) => {
    const consultTotal = invoices.filter(i => !i.isExternal).reduce((sum, i) => sum + i.patientCharge, 0);
    const externalTotal = invoices.filter(i => i.isExternal).reduce((sum, i) => sum + i.patientCharge, 0);
    const hospitTotal = hospitalizationTotal;
    return [
      { title: '1. PAR FAMILLE', rows: [
        { label: 'Consultations / soins', value: formatAr(consultTotal) },
        { label: 'Ventes externes', value: formatAr(externalTotal) },
        { label: 'Hospitalisation / bloc', value: formatAr(hospitTotal) },
      ], total: formatAr(consultTotal + externalTotal + hospitTotal) },
      { title: '2. FACTURES ENCAISSÉES', rows: invoices.map(inv => {
        const patient = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : undefined;
        return { label: `${new Date(inv.paidAt || inv.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — ${patient ? `${patient.lastName} ${patient.firstName}` : inv.clientName || 'Client externe'}`, value: formatAr(inv.patientCharge) };
      }) },
    ];
  };

  const printSavedClosing = (closing: CashClosing) => {
    const invoices = state.invoices.filter(i => closing.invoiceIds.includes(i.id));
    printClosingTicket(state.ticketSettings, { id: closing.cashierId, name: closing.cashierName, role: 'cashier' }, new Date(closing.createdAt), closingSections(invoices, closing.hospitalizationTotal), formatAr(closing.grandTotal));
  };

  const finalizeClosing = () => {
    if (existingClosing) { alert('La caisse de ce caissier est déjà clôturée pour aujourd’hui. Vous pouvez réimprimer le ticket Z ci-dessous.'); return; }
    if (closeableInvoices.length === 0 && myTodayPartialTotal === 0) { alert('Aucun encaissement à clôturer aujourd’hui.'); return; }
    if (!confirm(`Clôturer ${closeableInvoices.length} facture(s) pour ${formatAr(closeableInvoices.reduce((sum, i) => sum + i.patientCharge, 0) + myTodayPartialTotal)} ? Cette opération verrouille les factures dans le Z.`)) return;
    const now = new Date();
    const consultationTotal = closeableInvoices.filter(i => !i.isExternal).reduce((sum, i) => sum + i.patientCharge, 0);
    const externalTotal = closeableInvoices.filter(i => i.isExternal).reduce((sum, i) => sum + i.patientCharge, 0);

    // === Clôture directe des ordonnances (livraisons de garde) ===
    const unclosedPharmaItems = (state.pharmaDeliveryItems || []).filter((item: any) => !item.closingId);
    let pharmaClosingId: string | undefined = undefined;
    if (unclosedPharmaItems.length > 0) {
      const pharmaTotalAmount = unclosedPharmaItems.reduce((s: number, d: any) => s + d.quantity * d.unitPrice, 0);
      const pharmaTotalItems = unclosedPharmaItems.reduce((s: number, d: any) => s + d.quantity, 0);
      const pharmaResponsibleName = state.currentUser?.name || 'Responsable Pharmacie';
      const pharmaResponsibleId = state.currentUser?.id || 'PHA001';
      const pharmaCounter = (state.pharmaClosingCounter || 0) + 1;
      const pharmaClosingNumber = generatePharmaClosingNumber(pharmaCounter);
      pharmaClosingId = uuidv4();
      const pharmaNow = new Date().toISOString();
      const pharmaClosing: import('../types').PharmaDeliveryClosing = {




        id: pharmaClosingId,
        closingNumber: pharmaClosingNumber,
        date: pharmaNow,
        responsibleId: pharmaResponsibleId,
        responsibleName: pharmaResponsibleName,
        deliveryIds: unclosedPharmaItems.map((d: any) => d.id),
        totalItems: pharmaTotalItems,
        totalAmount: pharmaTotalAmount,
        deliveries: unclosedPharmaItems.map((d: any) => ({ ...d, closingId: pharmaClosingId })),
        createdAt: pharmaNow,
      };
      setState((prev) => {
        const updatedItems = (prev.pharmaDeliveryItems || []).map((item: any) => item.closingId ? item : { ...item, closingId: pharmaClosingId });
        const next = {
          ...prev,
          pharmaDeliveryItems: updatedItems,
          pharmaDeliveryClosings: [pharmaClosing, ...(prev.pharmaDeliveryClosings || [])],
          pharmaClosingCounter: pharmaCounter,
        };
        return next;
      });
      // Impression automatique du récap par article par jour après clôture
      setTimeout(() => {
        try {
          const recapData = unclosedPharmaItems.map((d: any) => ({
            date: new Date(d.deliveredAt).toLocaleDateString('fr-FR'),
            patientName: d.patientName,
            articleName: d.articleName,
            quantity: d.quantity,
            deliveredByName: d.deliveredByName,
          }));
          const htmlContent = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Recap livraisons par article/jour</title>
<style>
body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px;max-width:820px;margin:0 auto}
h1{font-size:18px;color:#0369a1;border-bottom:2px solid #0369a1;padding-bottom:6px;margin-bottom:16px}
.table{width:100%;border-collapse:collapse;margin-top:8px}
.table th{background:#f0f9ff;color:#0369a1;text-align:left;padding:8px 6px;border-bottom:2px solid #0369a1;font-size:11px}
.table td{padding:6px;border-bottom:1px solid #e2e8f0;font-size:11px}
.table .bold{font-weight:bold}
.total{font-weight:bold;background:#f0fdf4;border-top:2px solid #10b981}
</style>
</head><body>
<h1>Recapitulatif des livraisons par article par jour</h1>
<div style="font-size:11px;color:#555;margin-bottom:12px">Clôture : ${pharmaClosingNumber} — Responsable : ${pharmaResponsibleName} — ${new Date(pharmaNow).toLocaleString('fr-FR')}</div>
<table class="table">
<thead><tr><th>Date</th><th>Patient / Client</th><th>Article délivré</th><th>Qté</th><th>Responsable</th></tr></thead>
<tbody>
${recapData.map(d => `<tr><td>${d.date}</td><td>${d.patientName}</td><td class="bold">${d.articleName}</td><td class="bold">${d.quantity}</td><td>${d.deliveredByName}</td></tr>`).join('')}
</tbody>
</table>
<div class="total" style="padding:8px">Total articles livrés : ${pharmaTotalItems} — Valeur totale : ${pharmaTotalAmount.toLocaleString('fr-FR')} Ar</div>
${(window as any).printScript ? (window as any).printScript(false) : '<script>window.onload=function(){window.print();}</script>'}
</body></html>`;
          const iframe = document.createElement('iframe');
          iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
          document.body.appendChild(iframe);
          const win = iframe.contentWindow;
          const doc = win?.document || iframe.contentDocument;
          if (!doc || !win) return;
          doc.open();
          doc.write(htmlContent);
          doc.close();
          const cleanup = () => { try { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch { } };
          win.addEventListener?.('afterprint', cleanup);
          setTimeout(cleanup, 45000);
        } catch (e) { console.error('Erreur impression récap', e); }
      }, 800);
    }
    const closing: CashClosing = {
      id: uuidv4(), date: now.toISOString(), cashierId: currentCashierId, cashierName: state.currentUser?.name || 'Caissier',
      invoiceIds: closeableInvoices.map(i => i.id), invoiceCount: closeableInvoices.length,
      consultationTotal, externalTotal, hospitalizationTotal: myTodayPartialTotal,
      grandTotal: consultationTotal + externalTotal + myTodayPartialTotal, createdAt: now.toISOString(),
    };
    setState(prev => {
      const next = { ...prev, cashClosings: [...prev.cashClosings, closing], invoices: prev.invoices.map(i => closing.invoiceIds.includes(i.id) ? { ...i, closingId: closing.id } : i) };
      addAuditLog(next, 'CLOTURE_CAISSE', `Z ${closing.id.slice(0, 8).toUpperCase()} — ${closing.invoiceCount} facture(s), ${formatAr(closing.grandTotal)}`);
      return next;
    });
    printClosingTicket(state.ticketSettings, state.currentUser || { id: 'SYS', name: 'Caissier', role: 'cashier' }, now, closingSections(closeableInvoices), formatAr(closing.grandTotal));
  };

  return (
    <div className="space-y-4 flex flex-col">


      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {([['payment','📋 Facturation',pendingPatients.length],['external','🛒 Vte Externe',0],['hospit','🏨 Hospit.',hbRecords.filter(h=>h.type==='hospit').length],['bloc','🏥 Bloc',hbRecords.filter(h=>h.type==='bloc').length],['closing','🔒 Clôture',0]] as [Tab,string,number][]).map(([k,l,c]) => (
            <button key={k} onClick={() => switchTab(k)} className={`flex items-center gap-1 px-4 py-3 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap ${tab===k?'border-amber-500 text-amber-600 bg-amber-50/50':'border-transparent text-slate-500'}`}>{l}{c > 0 ? ` (${c})` : ''}</button>
          ))}
        </div>

        <div className="p-4">

          {/* PAYMENT */}
          {tab === 'payment' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="divide-y border rounded-lg max-h-[500px] overflow-y-auto">
                {pendingPatients.length === 0 ? <div className="p-6 text-center text-slate-400">Aucune facture</div>
                  : pendingPatients.map(p => {
                    const unpaid = getConsults(p.id);
                    const amount = getPendingAmount(p);
                    return <div key={p.id} className={`p-3 cursor-pointer hover:bg-slate-50 ${selPatientId === p.id ? 'bg-amber-50 border-l-4 border-amber-500' : ''}`} onClick={() => { setSelPatientId(p.id); setSelConsultId(unpaid[0]?.id || null); }}>
                      <div className="flex justify-between items-start"><div><div className="font-medium text-sm">{p.lastName} {p.firstName}</div><div className="text-xs text-slate-500">{unpaid[0]?.doctorName || 'Analyses laboratoire'}</div></div><div className="font-mono font-bold text-sm text-amber-700">{formatAr(amount)}</div></div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <span className="px-1 py-0.5 bg-cyan-100 text-cyan-700 text-[10px] rounded">Médicaments</span>
                        <span className="px-1 py-0.5 bg-teal-100 text-teal-700 text-[10px] rounded">Analyses</span>
                        <span className="px-1 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded">Écho</span>
                      </div>
                    </div>;
                  })}
              </div>
              <div className="lg:col-span-2">
                {!selPatient ? <div className="p-12 text-center text-slate-400"><CreditCard className="w-16 h-16 mx-auto mb-4 opacity-30" /><p>Sélectionnez une consultation</p></div>
                  : <div>
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-3 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-base text-slate-800">{selPatient.lastName} {selPatient.firstName} ({selPatient.dossier})</h3>
                          <p className="text-xs text-slate-600 mt-0.5">{selConsult ? `Consultation du ${new Date(selConsult.date).toLocaleDateString('fr-FR')} | Diagnostic: ${selConsult.diagnosis}` : 'Analyses / Services en attente'}</p>
                        </div>
                      </div>

                      {/* AFFICHAGE NOM DU MÉDECIN PRESCRIPTEUR & BOUTON MESSAGE RECTIFICATION */}
                      <div className="pt-2.5 border-t border-amber-200/80 flex flex-wrap items-center justify-between gap-3 bg-white/80 p-3 rounded-lg border border-amber-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">🩺</div>
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Médecin Prescripteur</div>
                            <div className="text-sm font-bold text-indigo-900">{selConsult?.doctorName || getConsults(selPatient.id)[0]?.doctorName || 'Médecin non spécifié'}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const refConsult = selConsult || getConsults(selPatient.id)[0];
                            const docId = refConsult?.doctorId || 'DOC001';
                            const docName = refConsult?.doctorName || 'Dr. Jean Martin';
                            setRectificationModal({
                              open: true,
                              doctorId: docId,
                              doctorName: docName,
                              patientName: `${selPatient.lastName} ${selPatient.firstName}`,
                              dossier: selPatient.dossier,
                            });
                            setRectificationText(`Bonjour ${docName}, une rectification ou précision est nécessaire concernant la prescription déjà faite pour le patient ${selPatient.lastName} ${selPatient.firstName} (${selPatient.dossier}). `);
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                          title="Envoyer un message de rectification au médecin prescripteur"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> Message pour rectification
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between text-xl font-bold border-t-2 pt-2 mb-4"><span>À PAYER</span><span className="font-mono text-amber-600">{formatAr(getPendingAmount(selPatient))}</span></div>
                    <button onClick={handlePayment} className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 cursor-pointer shadow-lg flex items-center justify-center gap-2"><CreditCard className="w-5 h-5" /> Encaisser {formatAr(getPendingAmount(selPatient))}</button>
                  </div>}
              </div>
            </div>
          )}

          {/* EXTERNAL - Sage */}
          {tab === 'external' && (
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg"><h3 className="font-bold text-purple-800"><ShoppingCart className="w-5 h-5 inline" /> Vente Directe — Client Externe</h3></div>
              <div className="bg-[#f4f4f4] border border-slate-300 rounded">
                <div className="bg-slate-100 border-b border-slate-300 p-1.5 m-2 mb-0 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-1">
                    <div className="flex-1 min-w-[140px] relative">
                      <label className="block text-[9px] text-slate-500">Article (↑↓ Entrée)</label>
                      <input ref={extSearchRef} type="text" value={extLineForm.articleName && !extSearch ? extLineForm.articleName : extSearch} onChange={e => { setExtSearch(e.target.value); setExtSearchIdx(0); }} onKeyDown={extKeyDown} className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-600" placeholder="🔍 Tapez..." />
                      {extSearch.length >= 1 && extFiltered.length > 0 && <div className="absolute top-full left-0 right-0 bg-white border rounded-b shadow-xl z-30 max-h-36 overflow-y-auto">{extFiltered.map((a, idx) => {
                        const isOut = a.stockPharmacie <= 0;
                        const isLow = !isOut && a.stockPharmacie <= a.minStockPharmacie && !a.alertDisabledPharmacie;
                        return (<div key={a.id} onClick={() => extSelectArticle(a.id)} title={isOut ? 'Rupture de stock — vente impossible' : undefined} className={`px-2 py-1 text-xs flex justify-between border-b ${isOut ? 'bg-red-50 text-red-700 cursor-not-allowed' : `cursor-pointer ${idx === extSearchIdx ? 'bg-blue-100' : 'hover:bg-blue-50'}`}`}>
                          <span className={isOut ? 'line-through decoration-red-400/60' : ''}>[{a.family}] {a.name}</span>
                          <span className="flex items-center gap-2">
                            {isOut
                              ? <span className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[9px] font-bold">🚨 RUPTURE — invendable</span>
                              : <span className={`font-mono text-[10px] ${isLow ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>Stock: {a.stockPharmacie}{isLow ? ' ⚠️' : ''}</span>}
                            <span className={`font-mono ${isOut ? 'text-red-400' : 'text-blue-600'}`}>{formatAr(getPrice(a, 'externe'))}</span>
                          </span>
                        </div>);
                      })}</div>}
                    </div>
                    <div className="w-14"><label className="block text-[9px] text-slate-500">Qté</label><input type="number" min={1} value={extLineForm.quantity} onChange={e => setExtLineForm({...extLineForm, quantity: parseInt(e.target.value)||1})} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); extSaveLine(); }}} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono outline-none" /></div>
                    <div className="w-14"><label className="block text-[9px] text-slate-500">Rem%</label><input type="number" min={0} max={100} value={extLineForm.discount} onChange={e => setExtLineForm({...extLineForm, discount: parseInt(e.target.value)||0})} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); extSaveLine(); }}} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono outline-none" /></div>
                    <div className="w-20"><label className="block text-[9px] text-slate-500">P.U.</label><input readOnly value={formatAr(extLineForm.unitPrice)} className="w-full bg-slate-200 border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono" /></div>
                    <div className="w-24"><label className="block text-[9px] text-slate-500">Montant</label><input readOnly value={formatAr(extLineAmt(extLineForm))} className="w-full bg-slate-200 border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono font-bold" /></div>
                    <div className="w-32"><label className="block text-[9px] text-slate-500" title="La date est conservée après chaque validation : plusieurs sorties possibles le même jour">Date sortie 📌</label><input type="date" value={extLineForm.dateSort || ''} onChange={e => setExtLineForm({...extLineForm, dateSort: e.target.value})} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); extSaveLine(); }}} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs font-mono outline-none focus:border-blue-500" title="Date de sortie — conservée après validation de la ligne" /></div>
                  </div>
                  <div className="flex justify-end gap-1 mt-1">
                    <button onClick={() => { if (extSelLineId) { setExtLines(extLines.filter(l => l.id !== extSelLineId)); setExtSelLineId(null); }}} disabled={!extSelLineId} className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[10px] disabled:opacity-40 cursor-pointer"><Trash2 className="h-3 w-3 text-rose-600 inline" /></button>
                    <button onClick={extSaveLine} disabled={!extLineForm.articleName} className="px-2 py-0.5 bg-sky-500 text-white border border-sky-600 rounded text-[10px] disabled:opacity-40 cursor-pointer"><Save className="h-3 w-3 inline" /> Enreg.</button>
                  </div>
                </div>
                <div className="bg-white mx-2 mb-2 border-t border-slate-300 overflow-x-auto rounded-b">
                  <table className="w-full text-[11px]"><thead className="bg-slate-50 border-b text-slate-600"><tr className="divide-x divide-slate-200"><th className="p-1 min-w-[130px]">Article</th><th className="p-1 text-right w-12">Qté</th><th className="p-1 text-center w-12">Rem%</th><th className="p-1 text-right w-20">P.U.</th><th className="p-1 text-right w-24">Montant</th><th className="p-1 w-28">Date sortie</th></tr></thead>
                    <tbody className="divide-y font-mono">{extLines.map(l => (<tr key={l.id} onClick={() => { setExtSelLineId(l.id); setExtLineForm({...l}); setExtIsNew(false); }} className={`cursor-pointer divide-x divide-slate-200 ${l.id === extSelLineId ? 'bg-blue-500 text-white' : 'hover:bg-slate-50'}`}><td className="p-1 font-sans">{l.articleName}</td><td className="p-1 text-right">{l.quantity}</td><td className="p-1 text-center">{l.discount > 0 ? `${l.discount}%` : '—'}</td><td className="p-1 text-right">{l.unitPrice.toLocaleString('fr-FR')}</td><td className="p-1 text-right font-bold">{extLineAmt(l).toLocaleString('fr-FR')}</td><td className="p-1 font-sans text-slate-500">{l.dateSort || '—'}</td></tr>))}
                      {extLines.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-slate-400 font-sans">Tapez un article</td></tr>}
                    </tbody>
                    {extLines.length > 0 && <tfoot className="bg-emerald-50 border-t-2 border-emerald-300"><tr><td colSpan={4} className="p-1 text-right font-bold font-sans">TOTAL:</td><td colSpan={2} className="p-1 text-right font-mono font-bold text-lg">{formatAr(extTotal)}</td></tr></tfoot>}
                  </table>
                </div>
              </div>
              <button onClick={extPay} disabled={extLines.length === 0} className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"><CreditCard className="w-5 h-5" /> Encaisser {formatAr(extTotal)}</button>
            </div>
          )}

          {/* LAB merged — lab items now paid in main payment or unified patient queue above */}

          {/* HOSPIT / BLOC */}
          {(tab === 'hospit' || tab === 'bloc') && (
            <div className="space-y-4">
              <div className={`p-3 rounded-lg border flex justify-between items-center ${tab === 'hospit' ? 'bg-rose-50 border-rose-200' : 'bg-blue-50 border-blue-200'}`}>
                <div>
                  <h3 className="font-bold flex items-center gap-2">{tab === 'hospit' ? <><Building2 className="w-5 h-5 text-rose-600" /> Hospitalisation</> : <><Heart className="w-5 h-5 text-blue-600" /> Bloc Opératoire</>}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Liste <strong>partagée</strong> entre la Caisse et la Pharmacie (caisse de garde).
                    Peu importe qui saisit (articles/bloc/hosp) — c'est le <strong>paiement</strong> qui fait foi.
                  </p>
                </div>
                <button onClick={() => { setHbPatSearch(''); setHbModal('add_patient'); }} className={`px-3 py-1.5 text-white rounded-lg cursor-pointer text-sm flex items-center gap-1 ${tab === 'hospit' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}><UserPlus className="w-4 h-4" /> Ajouter Patient</button>
              </div>

              {/* Records list */}
              {curHbRecords.length === 0 ? <div className="text-center py-8 text-slate-400">Aucun patient</div>
                : curHbRecords.map(record => {
                  const totalFact = record.lines.reduce((s, l) => s + hbLineAmt(l), 0);
                  const totalPaid = record.payments.reduce((s, p) => s + p.amount, 0);
                  const reste = totalFact - totalPaid;
                  const isOpen = hbSelRecordId === record.id;
                  return (
                    <div key={record.id} className={`border rounded-lg overflow-hidden ${isOpen ? 'border-blue-400' : 'border-slate-200'}`}>
                      <div className={`p-3 flex justify-between items-center cursor-pointer ${isOpen ? 'bg-blue-50' : 'bg-slate-50'}`} onClick={() => setHbSelRecordId(isOpen ? null : record.id)}>
                        <div>
                          <div className="font-bold text-sm flex items-center gap-2">{record.patientName}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${record.clientType === 'societe' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{record.clientType === 'societe' ? `🏢 ${record.company}` : '🏪 Comptoir'}</span>
                            <button onClick={(e) => { e.stopPropagation(); setHbSelRecordId(record.id); setHbEditClientType(record.clientType); setHbEditCompany(record.company || ''); setHbModal('edit_client'); }} className="text-blue-500 cursor-pointer" title="Modifier type"><Edit2 className="w-3 h-3" /></button>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">Facture: <strong>{formatAr(totalFact)}</strong> | Payé: <span className="text-green-600">{formatAr(totalPaid)}</span> | Reste: <span className="text-red-600 font-bold">{formatAr(reste)}</span></div>
                        </div>
                        <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setHbSelRecordId(record.id); setHbArtSearch(''); setHbArtForm({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: new Date().toISOString().split('T')[0] }); setHbSelLineId(null); setHbIsNew(true); setHbModal('add_article'); }} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs cursor-pointer transition font-medium">📋 Prescriptions</button>
                          {reste > 0 && <>
                            <input type="number" min={1} max={reste} value={hbPayAmount || ''} onChange={e => setHbPayAmount(Math.min(parseInt(e.target.value) || 0, reste))} className="w-24 px-2 py-1 border rounded text-xs text-right outline-none" placeholder="Montant" />
                            <button onClick={() => addPartialPay(record.id)} disabled={hbPayAmount <= 0 || hbPayAmount > reste} className="px-2 py-1 bg-amber-600 text-white rounded text-xs cursor-pointer disabled:opacity-40">💰 Payer</button>
                          </>}
                        </div>
                      </div>
                      {isOpen && (
                        <div className="p-3 border-t bg-white">
                          {record.lines.length > 0 && <table className="w-full text-[11px] mb-2"><thead className="bg-slate-100"><tr><th className="p-1 text-left w-16">Date</th><th className="p-1 text-left">Article</th><th className="p-1 text-right">Qté</th><th className="p-1 text-right">P.U.</th><th className="p-1 text-right">Montant</th></tr></thead><tbody>{record.lines.map(l => (<tr key={l.id} className="border-b border-slate-100"><td className="p-1 text-slate-500">{l.dateSort || '—'}</td><td className="p-1">{l.articleName}</td><td className="p-1 text-right">{l.quantity}</td><td className="p-1 text-right font-mono">{l.unitPrice.toLocaleString('fr-FR')}</td><td className="p-1 text-right font-mono font-bold">{hbLineAmt(l).toLocaleString('fr-FR')}</td></tr>))}</tbody></table>}
                          {record.lines.length === 0 && <p className="text-slate-400 text-xs text-center py-2">Aucun article — cliquez "+ Article"</p>}
                          {record.payments.length > 0 && <div className="mt-2 text-[10px] text-slate-500 border-t pt-1"><div className="font-bold mb-1">Historique paiements :</div>{record.payments.map((p, i) => (<div key={i}>{new Date(p.date).toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'})} — {formatAr(p.amount)} — {p.paidBy}</div>))}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* CLOSING */}
          {tab === 'closing' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="p-4 bg-slate-800 text-white rounded-lg flex justify-between items-center"><div><h3 className="font-bold text-lg"><Lock className="w-5 h-5 inline" /> Clôture — {new Date().toLocaleDateString('fr-FR')}</h3><p className="text-slate-300 text-sm">{state.currentUser?.name} — Ma caisse personnelle</p></div>
                {existingClosing ? (
                  <button onClick={() => printSavedClosing(existingClosing)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm cursor-pointer flex items-center gap-2"><Printer className="w-4 h-4" /> Réimprimer Z</button>
                ) : (
                  <button onClick={finalizeClosing} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm cursor-pointer flex items-center gap-2"><Lock className="w-4 h-4" /> Clôturer & imprimer Z</button>
                )}
              </div>
              {existingClosing && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800 flex justify-between items-center"><span>✓ Caisse clôturée à {new Date(existingClosing.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — {existingClosing.invoiceCount} facture(s)</span><button onClick={() => printSavedClosing(existingClosing)} className="underline font-semibold cursor-pointer">Réimprimer</button></div>}
              {!existingClosing && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">{closeableInvoices.length} facture(s) non clôturée(s) à intégrer au ticket Z.</div>}

              {/* Section 1: Versements par famille */}
              <div className="bg-white border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">1. Versements par famille (ma caisse)</h4><div className="grid grid-cols-3 gap-2"><div className="p-3 bg-green-50 rounded flex justify-between"><span>Consultations</span><span className="font-mono font-bold">{formatAr(myTodayTotal - myTodayExtTotal)}</span></div><div className="p-3 bg-purple-50 rounded flex justify-between"><span>Ventes Ext.</span><span className="font-mono font-bold">{formatAr(myTodayExtTotal)}</span></div><div className="p-3 bg-rose-50 rounded flex justify-between"><span>Hospit/Bloc</span><span className="font-mono font-bold">{formatAr(myTodayPartialTotal)}</span></div></div></div>

              {/* Section 2: Hospitalisation & Bloc */}
              {hbRecords.filter(h => h.payments.some(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString())).length > 0 && (
                <div className="bg-white border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">2. Hospitalisation & Bloc (mes encaissements)</h4>
                  <table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Patient</th><th className="p-2">Type</th><th className="p-2 text-right">Facture</th><th className="p-2 text-right">Reçu</th><th className="p-2 text-right">Reste</th><th className="p-2">Caissier</th></tr></thead>
                    <tbody>
                      {hbRecords.filter(h => h.payments.some(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString())).map(h => {
                        const tf = h.lines.reduce((s,l) => s+hbLineAmt(l),0);
                        const tp = h.payments.filter(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString()).reduce((s,p) => s+p.amount,0);
                        const tpAll = h.payments.reduce((s,p) => s+p.amount,0);
                        return (<tr key={h.id} className="border-b"><td className="p-2">{h.patientName}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${h.type==='hospit'?'bg-rose-100 text-rose-700':'bg-blue-100 text-blue-700'}`}>{h.type==='hospit'?'Hosp.':'Bloc'}</span></td><td className="p-2 text-right font-mono">{formatAr(tf)}</td><td className="p-2 text-right font-mono text-green-600">{formatAr(tp)}</td><td className="p-2 text-right font-mono text-red-600">{formatAr(tf-tpAll)}</td><td className="p-2">{h.payments.filter(p => p.paidByUserId === currentCashierId).map(p => p.paidBy).filter((v,i,a) => a.indexOf(v)===i).join(', ')}</td></tr>);
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Section 3: Total Général */}
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-lg p-6 text-center"><div className="text-sm text-slate-600">3. TOTAL GÉNÉRAL (ma caisse)</div><div className="text-4xl font-bold font-mono text-emerald-700">{formatAr(myGrandTotal)}</div></div>

              {/* Section 4: Liste clients */}
              <div className="bg-white border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">4. Liste clients (mes encaissements)</h4>
                <table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Heure</th><th className="p-2 text-left">Client</th><th className="p-2">Type</th><th className="p-2 text-right">Montant</th></tr></thead><tbody>
                  {myTodayInvoices.map(inv => { const pat = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : null; return (<tr key={inv.id} className="border-b"><td className="p-2 font-mono">{new Date(inv.paidAt || '').toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td className="p-2">{pat ? `${pat.lastName} ${pat.firstName}` : inv.clientName || 'Ext.'}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${inv.isExternal ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>{inv.isExternal ? 'Externe' : 'Consult.'}</span></td><td className="p-2 text-right font-mono font-bold">{formatAr(inv.patientCharge)}</td></tr>); })}
                  {hbRecords.filter(h => h.payments.some(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString())).map(h => { const tp = h.payments.filter(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString()).reduce((s,p) => s+p.amount,0); return (<tr key={h.id} className="border-b"><td className="p-2 font-mono">{h.payments.filter(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString()).map(p => new Date(p.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})).join(', ')}</td><td className="p-2">{h.patientName}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${h.type==='hospit'?'bg-rose-100 text-rose-700':'bg-blue-100 text-blue-700'}`}>{h.type==='hospit'?'Hosp.':'Bloc'}</span></td><td className="p-2 text-right font-mono font-bold">{formatAr(tp)}</td></tr>); })}
                </tbody><tfoot className="bg-emerald-50"><tr><td colSpan={3} className="p-2 text-right font-bold">TOTAL:</td><td className="p-2 text-right font-mono font-bold text-lg">{formatAr(myGrandTotal)}</td></tr></tfoot></table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === INLINE ADD PATIENT (no modal) === */}
      {hbModal === 'add_patient' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mt-0 order-first">
          <div className={`px-4 py-3 flex justify-between items-center text-white ${tab === 'hospit' ? 'bg-rose-600' : 'bg-blue-600'}`}><span className="font-bold"><UserPlus className="w-5 h-5 inline" /> Ajouter Patient — {tab === 'hospit' ? 'Hospitalisation' : 'Bloc'}</span><button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button></div>
          <div className="p-4 space-y-3">
            {/* Search existing */}
            <div><label className="block text-sm font-medium mb-1">Rechercher patient existant</label>
              <input type="text" value={hbPatSearch} onChange={e => setHbPatSearch(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="🔍 Nom, prénom ou dossier..." autoFocus />
              {hbPatFiltered.length > 0 && <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto">{hbPatFiltered.map(p => (<div key={p.id} onClick={() => hbSelectPatient(p.id)} className="p-2 hover:bg-blue-50 cursor-pointer text-sm flex justify-between border-b"><span className="font-medium">{p.lastName} {p.firstName}</span><span className="text-slate-400 text-xs">{p.dossier} | {p.clientType === 'societe' ? `🏢 ${p.company}` : '🏪 Comptoir'}</span></div>))}</div>}
            </div>
            <div className="border-t pt-3">
              <h4 className="font-bold text-sm mb-2">Ou créer un nouveau patient :</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2 flex items-center gap-3 mb-1">
                  <span className="font-bold text-slate-700">Sexe</span>
                  <div className="flex border border-slate-400 rounded overflow-hidden">
                    <button type="button" onClick={() => setHbNewPat({...hbNewPat, gender: 'M'})} className={`px-3 py-1 font-bold cursor-pointer ${hbNewPat.gender === 'M' ? 'bg-blue-500 text-white' : 'bg-white'}`}>M</button>
                    <button type="button" onClick={() => setHbNewPat({...hbNewPat, gender: 'F'})} className={`px-3 py-1 font-bold border-l border-slate-400 cursor-pointer ${hbNewPat.gender === 'F' ? 'bg-pink-500 text-white' : 'bg-white'}`}>F</button>
                  </div>
                </div>
                <div><label className="block font-bold text-slate-700 mb-0.5">Nom *</label><input type="text" value={hbNewPat.lastName} onChange={e => setHbNewPat({...hbNewPat, lastName: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">Prénom *</label><input type="text" value={hbNewPat.firstName} onChange={e => setHbNewPat({...hbNewPat, firstName: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">Date Naissance</label><input type="date" value={hbNewPat.dateOfBirth} onChange={e => setHbNewPat({...hbNewPat, dateOfBirth: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none bg-white" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">Age</label><input type="text" readOnly value={hbNewPat.dateOfBirth ? calculateAge(hbNewPat.dateOfBirth) : '—'} className="w-full px-2 py-1.5 border rounded bg-slate-100" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">Matricule</label><input type="text" value={hbNewPat.matricule} onChange={e => setHbNewPat({...hbNewPat, matricule: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none font-mono bg-white" placeholder="M-0000" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">Téléphone</label><input type="text" value={hbNewPat.contact} onChange={e => setHbNewPat({...hbNewPat, contact: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none font-mono bg-white" placeholder="034 00 000 00" /></div>
                <div className="col-span-2"><label className="block font-bold text-slate-700 mb-0.5">Adresse</label><input type="text" value={hbNewPat.address} onChange={e => setHbNewPat({...hbNewPat, address: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">N° Sécurité Sociale</label><input type="text" value={hbNewPat.ssn} onChange={e => setHbNewPat({...hbNewPat, ssn: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none bg-white" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">Société</label><input type="text" value={hbNewPat.insureName} onChange={e => setHbNewPat({...hbNewPat, insureName: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">Type Client</label><select value={hbNewPat.clientType} onChange={e => setHbNewPat({...hbNewPat, clientType: e.target.value as ClientType})} className="w-full px-2 py-1.5 border rounded outline-none cursor-pointer bg-white"><option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option></select></div>
                {hbNewPat.clientType === 'societe' && <div><label className="block font-bold text-slate-700 mb-0.5">Société</label><select value={hbNewPat.company} onChange={e => setHbNewPat({...hbNewPat, company: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none cursor-pointer bg-white"><option value="">— Sélectionner —</option>{state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}</select></div>}
                {hbNewPat.clientType === 'societe' && <div className="col-span-2"><label className="block font-bold text-slate-700 mb-0.5">Sous-société (libre)</label><input type="text" value={hbNewPat.subCompany} onChange={e => setHbNewPat({...hbNewPat, subCompany: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" placeholder="Direction, Service..." /></div>}
              </div>
              <button onClick={hbAddNewPatient} className="mt-3 w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer flex items-center justify-center gap-2"><UserPlus className="w-4 h-4" /> Créer et ajouter</button>
            </div>
          </div>
        </div>
      )}

      {/* Prescription — Inline Sage-style (no modal) */}
      {hbModal === 'add_article' && hbSelRecordId && (() => {
        const rec = hbRecords.find(r => r.id === hbSelRecordId);
        const recTotal = rec ? rec.lines.reduce((s, l) => s + hbLineAmt(l), 0) : 0;
        return (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mt-0 order-first">
            <div className="bg-emerald-600 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold flex items-center gap-1">💊 Prescription (Saisie Sage) — {rec?.patientName} ({rec?.type === 'hospit' ? 'Hospitalisation' : 'Bloc'})</span>
              <button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
            </div>
            <div className="p-4 space-y-3">
              {/* Sage-style input bar */}
              <div className="bg-[#f4f4f4] border border-slate-300 rounded text-xs select-none">
                <div className="bg-slate-100 border-b border-slate-300 p-2 m-2 mb-0 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-1.5">
                    <div className="flex-1 min-w-[150px] relative">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Article (↑↓ Entrée)</label>
                      <input
                        ref={hbArtRef}
                        type="text"
                        value={hbArtForm.articleName && !hbArtSearch ? hbArtForm.articleName : hbArtSearch}
                        onChange={e => {
                          setHbArtSearch(e.target.value);
                          setHbArtIdx(0);
                          if (hbArtForm.articleName && e.target.value !== hbArtForm.articleName) {
                            setHbArtForm(prev => ({ ...prev, articleName: '' }));
                          }
                        }}
                        onKeyDown={hbArtKeyDown}
                        className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 text-slate-800"
                        placeholder="🔍 Saisir article..."
                        autoFocus
                      />
                      {hbArtSearch.length >= 1 && hbArtFiltered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                          {hbArtFiltered.map((a, idx) => {
                            const isOut = a.stockPharmacie <= 0;
                            const isLow = !isOut && a.stockPharmacie <= a.minStockPharmacie && !a.alertDisabledPharmacie;
                            return (
                            <div
                              key={a.id}
                              onClick={() => hbArtSelectArticle(a.id)}
                              title={isOut ? 'Rupture de stock — vente impossible' : undefined}
                              className={`px-3 py-1.5 text-xs flex justify-between border-b border-slate-100 ${isOut ? 'bg-red-50 text-red-700 cursor-not-allowed' : `cursor-pointer ${idx === hbArtIdx ? 'bg-blue-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}`}
                            >
                              <span className={isOut ? 'line-through decoration-red-400/60' : ''}>[{a.family}] {a.name}</span>
                              <span className="flex items-center gap-2">
                                {isOut
                                  ? <span className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[9px] font-bold">🚨 RUPTURE — invendable</span>
                                  : <span className={`font-mono text-[10px] ${idx === hbArtIdx ? 'text-white/90' : isLow ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>Stock: {a.stockPharmacie}{isLow ? ' ⚠️' : ''}</span>}
                                <span className={`font-mono ${isOut ? 'text-red-400' : idx === hbArtIdx ? 'text-white' : 'text-blue-600 font-medium'}`}>{formatAr(getPrice(a, rec?.clientType || 'comptoir'))}</span>
                              </span>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="w-16">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Qté</label>
                      <input
                        id="hb-qty-input"
                        type="number"
                        min={1}
                        value={hbArtForm.quantity}
                        onChange={e => setHbArtForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                    <div className="w-16">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Rem%</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={hbArtForm.discount}
                        onChange={e => setHbArtForm(prev => ({ ...prev, discount: parseInt(e.target.value) || 0 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">P.U.</label>
                      <input
                        type="number"
                        value={hbArtForm.unitPrice}
                        onChange={e => setHbArtForm(prev => ({ ...prev, unitPrice: parseInt(e.target.value) || 0 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Montant</label>
                      <input
                        readOnly
                        value={formatAr(hbLineAmt(hbArtForm))}
                        className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono font-bold text-slate-700"
                      />
                    </div>
                    <div className="w-36">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5" title="Cette zone n'est pas effacée après validation de la ligne : plusieurs sorties possibles le même jour">Date d'acte / de sortie 📌</label>
                      <input
                        type="date"
                        value={hbArtForm.dateSort || ''}
                        onChange={e => setHbArtForm(prev => ({ ...prev, dateSort: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-amber-50 border border-amber-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-500 text-slate-800"
                        title="Date de sortie de marchandise ou date de l'acte — conservée après validation de la ligne"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5 mt-2">
                    <button
                      onClick={hbArtNew}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 transition cursor-pointer text-xs font-medium"
                    >
                      <Plus className="h-3.5 w-3.5 text-slate-500" /> Nouveau
                    </button>
                    <button
                      onClick={hbArtDelete}
                      disabled={!hbSelLineId}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 disabled:opacity-40 transition cursor-pointer text-xs font-medium"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Supprimer
                    </button>
                    <button
                      onClick={hbArtSave}
                      disabled={!hbArtForm.articleName}
                      className="flex items-center gap-1 px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white border border-sky-600 rounded shadow-sm font-semibold disabled:opacity-40 transition cursor-pointer text-xs"
                    >
                      <Save className="h-3.5 w-3.5" /> Enregistrer
                    </button>
                  </div>
                </div>

                {/* Lines table */}
                <div className="bg-white mx-2 mb-2 border-t border-slate-300 overflow-x-auto rounded-b max-h-[250px] overflow-y-auto">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
                      <tr className="divide-x divide-slate-200">
                        <th className="p-1 font-normal min-w-[150px]">Article</th>
                        <th className="p-1 font-normal text-right w-12">Qté</th>
                        <th className="p-1 font-normal text-center w-12">Rem%</th>
                        <th className="p-1 font-normal text-right w-20">P.U.</th>
                        <th className="p-1 font-normal text-right w-24">Montant</th>
                        <th className="p-1 font-normal w-36">Date d'acte / de sortie</th>
                        <th className="p-1 font-normal w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-mono">
                      {rec && rec.lines.map(l => {
                        const isSel = l.id === hbSelLineId;
                        return (
                          <tr key={l.id} onClick={() => {
                            setHbSelLineId(l.id);
                            setHbArtForm({ ...l });
                            setHbIsNew(false);
                          }} className={`cursor-pointer divide-x divide-slate-200 transition-colors ${isSel ? 'bg-blue-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}>
                            <td className="p-1 font-sans">{l.articleName}</td>
                            <td className="p-1 text-right">{l.quantity}</td>
                            <td className="p-1 text-center">{l.discount ? `${l.discount}%` : '—'}</td>
                            <td className="p-1 text-right">{l.unitPrice.toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-right font-bold">{hbLineAmt(l).toLocaleString('fr-FR')}</td>
                            <td className="p-1 font-sans text-slate-500">{l.dateSort || '—'}</td>
                            <td className="p-1 text-center">
                              <button onClick={(e) => {
                                e.stopPropagation();
                                updateHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, lines: r.lines.filter(x => x.id !== l.id) } : r));
                                if (hbSelLineId === l.id) {
                                  hbArtNew();
                                }
                              }} className={`cursor-pointer ${isSel ? 'text-white hover:text-red-200' : 'text-rose-600 hover:text-rose-800'}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {rec && rec.lines.length === 0 && (
                        <tr><td colSpan={6} className="p-4 text-center text-slate-400 font-sans">Aucun article enregistré. Tapez ou recherchez un article ci-dessus.</td></tr>
                      )}
                    </tbody>
                    {rec && rec.lines.length > 0 && (
                      <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 text-slate-800 font-sans">
                        <tr className="font-bold">
                          <td colSpan={3} className="p-1.5 text-right">TOTAL PATIENT :</td>
                          <td colSpan={3} className="p-1.5 text-right font-mono text-lg text-emerald-700">{formatAr(recTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              <button onClick={() => { if (rec && blockIfUnsavedDraftLine(hbArtForm, rec.lines, { entityLabel: 'l\'article' })) return; setHbModal('none'); }} className="w-full py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 cursor-pointer font-medium transition text-sm">✅ Terminer et fermer</button>
            </div>
        </div>
        );
      })()}

      {/* Edit Client Type — Inline (no modal) */}
      {hbModal === 'edit_client' && hbSelRecordId && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mt-0 order-first">
            <div className="bg-blue-600 px-4 py-3 flex justify-between items-center text-white"><span className="font-bold"><Edit2 className="w-5 h-5 inline" /> Modifier Type Client</span><button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button></div>
            <div className="p-4 space-y-3">
              <div><label className="block text-sm font-medium mb-1">Type</label><select value={hbEditClientType} onChange={e => setHbEditClientType(e.target.value as ClientType)} className="w-full px-3 py-2 border rounded-lg outline-none cursor-pointer"><option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option></select></div>
              {hbEditClientType === 'societe' && <div><label className="block text-sm font-medium mb-1">Société</label><select value={hbEditCompany} onChange={e => setHbEditCompany(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none cursor-pointer"><option value="">—</option>{state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}</select></div>}
              <button onClick={hbSaveClientType} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">Enregistrer</button>
            </div>
        </div>
      )}

      {/* Modal Message Rectification Prescription */}
      {rectificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col">
            <div className="bg-indigo-600 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold text-sm flex items-center gap-2">
                <MessageCircle className="w-4 h-4" /> Message de rectification — {rectificationModal.doctorName}
              </span>
              <button onClick={() => setRectificationModal(null)} className="hover:bg-white/20 rounded p-1 cursor-pointer text-sm">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-900 leading-relaxed">
                <strong>Destinataire :</strong> {rectificationModal.doctorName}<br />
                <strong>Concerne :</strong> Prescription du patient <strong>{rectificationModal.patientName}</strong> (Dossier: {rectificationModal.dossier})
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Message au médecin pour rectification d'une prescription déjà faite :</label>
                <textarea
                  value={rectificationText}
                  onChange={(e) => setRectificationText(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-slate-800"
                  placeholder="Expliquez la rectification à effectuer sur la prescription..."
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setRectificationModal(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded-lg text-xs font-medium cursor-pointer hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                {onOpenMessagingWithRecipient && (
                  <button
                    onClick={() => {
                      const targetId = rectificationModal.doctorId;
                      setRectificationModal(null);
                      onOpenMessagingWithRecipient(targetId);
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium cursor-pointer transition"
                  >
                    Ouvrir messagerie complète
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!rectificationText.trim()) return;
                    const msg = {
                      id: uuidv4(),
                      fromUserId: state.currentUser?.id || 'CAS001',
                      fromUserName: state.currentUser?.name || 'Caisse Facturation',
                      toUserId: rectificationModal.doctorId,
                      toUserName: rectificationModal.doctorName,
                      content: rectificationText.trim(),
                      timestamp: new Date().toISOString(),
                      read: false,
                    };
                    setState((prev) => {
                      const next = { ...prev, messages: [...prev.messages, msg] };
                      addNotification(next, 'doctor', `💬 [Rectification Prescription] ${rectificationModal.patientName} : ${rectificationText.trim().substring(0, 50)}...`, 'warning', rectificationModal.doctorId);
                      addAuditLog(next, 'MESSAGE_RECTIFICATION', `Message de rectification envoyé à ${rectificationModal.doctorName} (${rectificationModal.patientName})`);
                      return next;
                    });
                    alert(`✅ Message de rectification envoyé avec succès à ${rectificationModal.doctorName}.`);
                    setRectificationModal(null);
                  }}
                  disabled={!rectificationText.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shadow transition"
                >
                  <Send className="w-3.5 h-3.5" /> Envoyer le message
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
