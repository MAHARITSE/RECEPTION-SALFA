/**
 * Fix build 2026-08-18: suppression du bloc JSX dupliqué après `); }` qui
 * provoquait `Expected identifier but found "/"` à 1998:13 (vite/esbuild).
 * Le composant se termine désormais proprement par `</div> ); }` — build OK (1843 modules).
 */
import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Invoice, InvoiceItem, ClientType, LabRequest, EchoRequest, User, CashClosing, HbLine, HbRecord, Consultation, Prescription, Article, Patient } from '../types';
import type { AppState } from '../store';
import {
  addAuditLog, addNotification, formatAr, formatNum, roundTo2, getPrice, calculateAge,
  normalizeDossierNumber, isDossierTaken, addJourneyEvent, generatePharmaClosingNumber, purgePatientFromQueue,
  familyManagesStock, isLabFamily, isEchoFamily,
} from '../store';
import { CreditCard, ShoppingCart, Trash2, Lock, Printer, Building2, Heart, Save, UserPlus, Edit2, Plus, MessageCircle, Send, FileText, RefreshCw } from 'lucide-react';
import { printPaymentTicket as openThermalTicket, printClosingTicket, printLabRequestTicket, printEchoRequestTicket, printHbPaymentTicket, printPharmaDeliveryClosingTicket } from '../utils/printTicket';
import { printSalfaIndividualInvoice } from '../utils/printSalfaInvoice';
import { blockIfUnsavedDraftLine } from '../utils/validation';
import ConfirmModal from './ConfirmModal';
import AlerteArticleIndisponible from './AlerteArticleIndisponible';
import { PhoneInput } from './PhoneInput';
import type { ArticleAlertInfo } from './AlerteArticleIndisponible';

/** Patient factice utilisé pour imprimer les bons d'analyse / d'échographie des ventes
 *  externes (un client externe n'a pas de dossier ouvert en réception). */
const EXT_CLIENT_PATIENT: Patient = {
  id: 'ext', dossier: 'CLIENT EXTERNE', matricule: undefined, firstName: '', lastName: 'Client Externe',
  dateOfBirth: '', age: '—', gender: 'M', address: '', contact: '', ssn: '',
  insureName: undefined, clientType: 'externe', company: undefined, subCompany: undefined,
  allergies: [], chronicTreatments: [], antecedents: [],
  registeredAt: '', registeredBy: '', status: 'completed',
};

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onOpenMessagingWithRecipient?: (recipientId: string) => void;
  /** Force la relecture immédiate des saisies des autres postes (médecins, laboratoire...). */
  onRefreshQueue?: () => void;
}
// L'ancien onglet « Comptes sociétés » a été déplacé vers le module dédié
// du rôle Responsable facturation (ModuleFacturationSocietes).
type Tab = 'payment' | 'hospit' | 'bloc' | 'closing';
type HbModal = 'none' | 'add_patient' | 'add_article' | 'edit_client';

export default function ModuleCaisse({ state, setState, onOpenMessagingWithRecipient, onRefreshQueue }: Props) {
  // Familles « ne pas gérer en stock » : vente sans contrôle ni décompte de stock
  // Prestations (services) issues de la base unifiée des articles : examens de
  // laboratoire (famille LABO, unité « analyse ») et actes d'échographie
  // (famille ECHO, unité « acte »). Ce ne sont pas des marchandises : aucun
  // stock à décompter, mais un bon d'examen à imprimer après encaissement.
  const isLabExamArticle = (a: Article | undefined) =>
    !!a && isLabFamily(a.family) && !['unité', 'flacon', 'boîte'].includes(a.unit);
  const isEchoActArticle = (a: Article | undefined) =>
    !!a && isEchoFamily(a.family) && !['unité', 'flacon', 'boîte'].includes(a.unit);
  const isServiceArticle = (a: Article | undefined) => isLabExamArticle(a) || isEchoActArticle(a);
  const managesStock = (a: Article | undefined) =>
    !!a && !isServiceArticle(a) && familyManagesStock(a.family, state.familles);
  const [selConsultId, setSelConsultId] = useState<string | null>(null);
  const [selPatientId, setSelPatientId] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('payment');

  // Configuration imprimante & tickets spécifique au caissier connecté
  const cashierId = state.currentUser?.id || 'default';
  const [printerSettings, setPrinterSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(`salfa_caisse_printer_${cashierId}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      printerName: state.currentUser?.name ? `Imprimante de ${state.currentUser.name}` : 'Imprimante Caisse',
      paperWidth: state.ticketSettings?.paperWidth || 80,
      autoPrint: state.ticketSettings?.autoPrint ?? true,
      copies: state.ticketSettings?.copies || 1,
      receiptTitle: state.ticketSettings?.receiptTitle || 'REÇU DE PAIEMENT',
      footerMessage: state.ticketSettings?.footerMessage || 'Merci de votre visite. Prompt rétablissement !'
    };
  });
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [tempPrinterSettings, setTempPrinterSettings] = useState(printerSettings);

  const effectiveTicketSettings = {
    ...state.ticketSettings,
    paperWidth: printerSettings.paperWidth,
    autoPrint: printerSettings.autoPrint,
    copies: printerSettings.copies,
    receiptTitle: printerSettings.receiptTitle,
    footerMessage: printerSettings.footerMessage,
  };
  // Facturation : le détail de la facture s'ouvre en fenêtre modale (clic sur la file d'attente)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
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
  // Notification rouge centrée (ventes externes) : article bloqué en vente par la pharmacie ou en rupture de stock
  const [articleAlert, setArticleAlert] = useState<ArticleAlertInfo | null>(null);
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
  // 💡 Saisie du montant INDÉPENDANTE par dossier (chaque patient a sa propre saisie)
  const [hbPayAmounts, setHbPayAmounts] = useState<Record<string, number>>({});
  // 💡 Historique des paiements (affiché via un bouton dédié)
  const [hbHistoryId, setHbHistoryId] = useState<string | null>(null);
  const [hbModal, setHbModal] = useState<HbModal>('none');

  // HB Modal: patient search/add (ALL fields like reception)
  const [hbPatSearch, setHbPatSearch] = useState('');
  const [hbNewPat, setHbNewPat] = useState({ dossier: '', lastName: '', firstName: '', dateOfBirth: '', gender: 'M' as 'M'|'F', contact: '', address: '', matricule: '', ssn: '', insureName: '', clientType: 'comptoir' as ClientType, company: '', subCompany: '' });
  const [hbNewCompanyName, setHbNewCompanyName] = useState('');

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
  const [hbEditSubCompany, setHbEditSubCompany] = useState('');
  const [hbEditNewCompany, setHbEditNewCompany] = useState('');

  // Edition société pour la facture sélectionnée (file d'attente de paiement) — toujours visible
  const [payEditClientType, setPayEditClientType] = useState<ClientType>('comptoir');
  const [payEditCompany, setPayEditCompany] = useState('');
  const [payEditSubCompany, setPayEditSubCompany] = useState('');
  const [payEditNewCompany, setPayEditNewCompany] = useState('');
  const [showPayClientTypeEdit, setShowPayClientTypeEdit] = useState(false);

  // Data
  // RÈGLE : TOUS les patients validés par un médecin arrivent à la caisse pour
  // validation du paiement, y compris les clients société. Les clients société
  // ne paient PAS en espèces : la caisse valide un CRÉDIT SOCIÉTÉ (la somme est
  // portée au compte de la société, réglée ultérieurement par le responsable
  // facturation). Les factures crédit société sont exclues des encaissements et
  // des clôtures de caisse.
  // Ordre décroissant : le dernier arrivé / dernière saisie en haut de la file (exigence utilisateur).
  const pendingPatients = state.patients
    .filter(p =>
      p.status === 'consulted_awaiting_payment' ||
      state.invoices.some(i => i.patientId === p.id && i.status === 'pending' && i.items.some(it => it.category === 'lab' || it.category === 'echo' || it.category === 'consultation'))
    )
    .sort((a, b) => {
      const da = new Date((a.lastVisitAt || a.registeredAt || 0) as string | number).getTime() || 0;
      const db = new Date((b.lastVisitAt || b.registeredAt || 0) as string | number).getTime() || 0;
      return db - da;
    });

  // Factures en attente (consultation, labo, écho) — sociétés incluses.
  const pendingServiceInvoices = state.invoices.filter((i) => {
    if (i.status !== 'pending') return false;
    return i.items.some((it) => it.category === 'lab' || it.category === 'echo' || it.category === 'consultation');
  });

  /**
   * Les médicaments d'une consultation sont-ils déjà encaissés/réglés ?
   * Une ordonnance est considérée payée quand :
   *  1. il existe une facture payée comportant une ligne pharmacie liée à cette
   *     consultation (`consultationId`), ou une vente payée « pharmacie » liée ;
   *  2. sinon (données legacy / démo : la consultation et sa facture « globale »
   *     n'ont pas de lien `consultationId`), une facture **payée** du même
   *     patient, comportant une ligne pharmacie, datée du même jour que la
   *     consultation. Évite de ré-afficher en Caisse des médicaments déjà
   *     facturés/réglés (cas par ex. des lignes « Médicaments & Soins »).
   */
  const consultationPharmacyPaid = (c: { id: string; patientId?: string; date?: string }) => {
    const pid = c.patientId;
    if (!pid) return false;
    if (state.invoices.some(inv =>
      inv.patientId === pid && inv.status === 'paid' && inv.consultationId === c.id &&
      inv.items.some(it => it.category === 'pharmacy'))) return true;
    if ((state.ventes || []).some(v =>
      v.patientId === pid && v.status === 'paid' && v.consultationId === c.id &&
      (state.venteLines || []).some(l => l.venteId === v.id && l.category === 'pharmacy'))) return true;
    const cDay = (c.date || '').slice(0, 10);
    return state.invoices.some(inv =>
      inv.patientId === pid && inv.status === 'paid' && !inv.consultationId &&
      inv.items.some(it => it.category === 'pharmacy') &&
      (inv.createdAt || inv.paidAt || '').slice(0, 10) === cDay);
  };

  // Helper: get all pending items for a patient (pharmacy + lab + echo)
  const getPendingAmount = (p: any) => {
    const cons = state.consultations.filter(c => c.patientId === p.id && !consultationPharmacyPaid(c));
    let amt = cons.reduce((s, c) => s + c.prescriptions.reduce((ss, pr) => ss + roundTo2((pr.unitPrice || 0) * (pr.quantity || 0) * (1 - (pr.discount || 0) / 100)), 0), 0);
    const svcInvs = pendingServiceInvoices.filter(i => i.patientId === p.id);
    amt += svcInvs.reduce((s, i) => s + i.totalAmount, 0);
    return amt;
  };
  // Consultations dont les médicaments ne sont pas encore encaissés
  const getConsults = (pid: string) => state.consultations.filter(c =>
    c.patientId === pid &&
    c.prescriptions.length > 0 &&
    !consultationPharmacyPaid(c)
  );
  const selConsult = state.consultations.find(c => c.id === selConsultId);
  const selPatient = state.patients.find(p => p.id === (selPatientId || selConsult?.patientId)) || null;

  // Confirmation Modal State
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    subText?: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info' | 'success';
    showCancel?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {},
  });

  const askConfirmation = (opts: {
    title?: string;
    message: string;
    subText?: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info' | 'success';
    showCancel?: boolean;
    onConfirm: () => void;
  }) => {
    setConfirmModalState({
      isOpen: true,
      title: opts.title || 'Confirmation',
      message: opts.message,
      subText: opts.subText,
      confirmText: opts.confirmText || 'Confirmer',
      cancelText: opts.cancelText || 'Annuler',
      type: opts.type || 'danger',
      showCancel: opts.showCancel !== undefined ? opts.showCancel : true,
      onConfirm: opts.onConfirm,
    });
  };

  const showAlert = (message: string, title: string = 'Information', type: 'warning' | 'info' | 'danger' = 'warning') => {
    setConfirmModalState({
      isOpen: true,
      title,
      message,
      confirmText: "D'accord",
      type,
      showCancel: false,
      onConfirm: () => setConfirmModalState((prev) => ({ ...prev, isOpen: false })),
    });
  };

  // Retrait de la file caisse : seules les consultations/factures en attente sont annulées ; le dossier est conservé.
  const removePendingPatient = (pid: string) => {
    const p = state.patients.find((x) => x.id === pid);
    if (!p) return;
    askConfirmation({
      title: 'Retrait de la file Caisse',
      message: `Retirer ${p.lastName} ${p.firstName} (${p.dossier}) de la file caisse ?`,
      subText: 'Les consultations et factures en attente seront annulées. Le dossier patient (VitalSigns et historique) reste conservé dans la base de données.',
      confirmText: 'Retirer de la file',
      cancelText: 'Annuler',
      type: 'warning',
      onConfirm: () => {
        setState((prev) => {
          const next = { ...prev };
          purgePatientFromQueue(next, pid);
          addAuditLog(next, 'RETRAIT_FILE_CAISSE', `${p.lastName} ${p.firstName} (${p.dossier}) retiré de la file caisse — dossier conservé`, pid);
          addJourneyEvent(next, { patientId: pid, department: 'caisse', action: 'Consultations retirées de la file caisse', status: 'registered', details: `Facturation en attente annulée — dossier conservé par ${prev.currentUser?.name || 'la caisse'}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name });
          return next;
        });
        if (selPatientId === pid) { setSelPatientId(null); setSelConsultId(null); setPaymentModalOpen(false); }
        setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Ouverture / fermeture de la facture patient en fenêtre modale
  const openPaymentModal = (pid: string) => {
    const p = state.patients.find(x => x.id === pid);
    if (p) {
      setPayEditClientType(p.clientType === 'externe' ? 'comptoir' : (p.clientType as ClientType));
      setPayEditCompany(p.company || '');
      setPayEditSubCompany(p.subCompany || '');
      setPayEditNewCompany('');
      setShowPayClientTypeEdit(false);
    }
    setSelPatientId(pid);
    setSelConsultId(getConsults(pid)[0]?.id || null);
    setPaymentModalOpen(true);
  };
  const closePaymentModal = () => {
    setPaymentModalOpen(false);
    setSelPatientId(null);
    setSelConsultId(null);
  };

  const handlePayment = () => {
    if (!selPatient) return;
    // Garde anti double-paiement
    if (payingRef.current) return;
    payingRef.current = true;
    // Client société → pas d'encaissement en espèces : validation en CRÉDIT SOCIÉTÉ.
    const isSocieteCredit = selPatient.clientType === 'societe';
    const unpaidConsults = getConsults(selPatient.id);
    const medicationItems: InvoiceItem[] = unpaidConsults.flatMap(c => c.prescriptions.map(p => ({
      description: `${p.articleName} × ${p.quantity}${p.discount > 0 ? ` (-${p.discount}%)` : ''}`,
      amount: roundTo2(p.unitPrice * p.quantity * (1 - p.discount / 100)), category: 'pharmacy' as const,
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
    const paidAt = new Date().toISOString();

    // Passage sans facturation (consultation sans ordonnance ni examen) :
    // la caisse valide simplement le passage — aucun montant à encaisser.
    if (!unifiedItems.length) {
      setState(prev => {
        const next: AppState = {
          ...prev,
          patients: prev.patients.map(p => p.id === selPatient.id
            ? { ...p, status: 'invoice_paid' as const, lastVisitAt: paidAt }
            : p),
        };
        addAuditLog(next, 'VALIDATION_PASSAGE_CAISSE', `${selPatient.lastName} ${selPatient.firstName} (${selPatient.dossier}) — passage validé en caisse (0 Ar)${isSocieteCredit ? ' — crédit société' : ''}`, selPatient.id);
        addJourneyEvent(next, { patientId: selPatient.id, department: 'caisse', action: 'Passage validé en caisse', status: 'invoice_paid', details: `Aucune facture — passage validé (0 Ar)${isSocieteCredit ? ' — crédit société' : ''}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name });
        return next;
      });
      setSelConsultId(null); setSelPatientId(null); setPaymentModalOpen(false);
      payingRef.current = false;
      return;
    }

    // Nouvelle facture unifiée : uniquement les MÉDICAMENTS (jamais facturés avant).
    // Les services (consultation / labo / écho) possèdent DÉJÀ leurs factures en
    // attente : celles-ci sont soldées directement ci-dessous. Cela évite le double
    // comptage dans la facturation sociétés (crédit société).
    const medsTotal = medicationItems.reduce((sum, item) => sum + item.amount, 0);
    const inv: Invoice | null = medicationItems.length > 0 ? {
      id: uuidv4(), patientId: selPatient.id, consultationId: unpaidConsults[0]?.id, clientType: selPatient.clientType,
      items: medicationItems, totalAmount: medsTotal, patientCharge: medsTotal,
      status: 'paid', paidAt, paidBy: state.currentUser?.id || '', createdAt: paidAt, isExternal: false, creditSociete: isSocieteCredit,
    } : null;
    // Facture combinée (médicaments + services) utilisée UNIQUEMENT pour le ticket.
    const printInvoice: Invoice = inv
      ? { ...inv, items: unifiedItems, totalAmount: total, patientCharge: total }
      : {
          id: serviceInvoices[0]?.id || `caisse-${uuidv4()}`, patientId: selPatient.id,
          consultationId: serviceInvoices[0]?.consultationId || unpaidConsults[0]?.id,
          clientType: selPatient.clientType, items: unifiedItems, totalAmount: total, patientCharge: total,
          status: 'paid', paidAt, paidBy: state.currentUser?.id || '', createdAt: paidAt, isExternal: false, creditSociete: isSocieteCredit,
        };

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
            ? { ...i, status: 'paid' as const, paidAt, paidBy: prev.currentUser?.id || '', creditSociete: i.creditSociete || isSocieteCredit }
            : i),
          ...(inv ? [inv] : []),
        ],
        // Marquer les lab requests comme payés
        labRequests: prev.labRequests.map(r =>
          labToPrint.some(l => l.id === r.id) ? { ...r, status: 'paid' as const } : r
        ),
        // Marquer les analyses ET les échos comme payés sur les consultations.
        // ⚠️ IMPORTANT : le laboratoire affiche les demandes via la copie rattachée à la
        // consultation (déduplication par id) — sans ce statut 'paid', les analyses payées
        // restaient 'pending' et n'apparaissaient JAMAIS dans la file d'attente du laboratoire.
        consultations: prev.consultations.map(c => {
          if (c.patientId !== selPatient.id) return c;
          return {
            ...c,
            labRequests: c.labRequests.map(l =>
              labToPrint.some(x => x.id === l.id) ? { ...l, status: 'paid' as const } : l
            ),
            echoRequests: (c.echoRequests || []).map(e =>
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
      addAuditLog(next, isSocieteCredit ? 'VALIDATION_CREDIT_SOCIETE' : 'PAIEMENT_UNIFIE', `${formatAr(total)}${isSocieteCredit ? ' en crédit société' : ''} — ${parts || 'facture'} — ${selPatient.lastName}${selPatient.company ? ` (${selPatient.company})` : ''}`, selPatient.id);
      addJourneyEvent(next, { patientId: selPatient.id, department: 'caisse', action: isSocieteCredit ? 'Paiement validé en crédit société' : 'Paiement unifié enregistré', status: 'invoice_paid', details: `${formatAr(total)} (${parts || 'facture'})${isSocieteCredit ? ` — crédit société ${selPatient.company || ''}` : ''}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name });
      return next;
    });

    // 1) Ticket caisse — reçu de paiement (espèces) OU bon de prise en charge crédit société
    openThermalTicket(effectiveTicketSettings, printInvoice, selPatient, state.currentUser || undefined, undefined, { creditSociete: isSocieteCredit });

    // 2) Bon d'analyse — uniquement les examens demandés — après le ticket
    if (labToPrint.length > 0 && doctorUser) {
      setTimeout(() => {
        printLabRequestTicket(effectiveTicketSettings, selPatient, doctorUser, new Date(), labToPrint);
      }, 900);
    }
    // 3) Bon d'échographie — uniquement les examens demandés
    if (allEchos.length > 0 && doctorUser) {
      setTimeout(() => {
        printEchoRequestTicket(effectiveTicketSettings, selPatient, doctorUser, new Date(), allEchos);
      }, labToPrint.length > 0 ? 1800 : 900);
    }

    setSelConsultId(null); setSelPatientId(null); setPaymentModalOpen(false);
    payingRef.current = false;
  };

  // LAB items merged: invoices containing lab items are processed in payment queue (no separate lab tab)

  // === EXTERNAL ===
  // Exclure les articles bloqués à la vente (réservé / régularisation)
  // Les articles bloqués à la vente restent visibles (marqués en rouge « BLOQUÉ ») :
  // le caissier reçoit une notification rouge centrée s'il tente de les sélectionner.
  const extFiltered = extSearch.length >= 1
    ? state.articles.filter(a => a.name.toLowerCase().includes(extSearch.toLowerCase()))
    : [];
  const extLineAmt = (l: HbLine) => roundTo2(l.unitPrice * l.quantity * (1 - l.discount / 100));
  const extArticlesTotal = extLines.reduce((s, l) => s + extLineAmt(l), 0);
  const extTotal = roundTo2(extArticlesTotal);

  const extSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    if (a.saleBlocked) {
      setArticleAlert({
        kind: 'blocked',
        title: '⛔ Article bloqué à la vente par la pharmacie',
        message: `« ${a.name} »`,
        reason: a.saleBlockReason || undefined,
        hint: "Vente externe impossible : demandez le déblocage de l'article à la pharmacie.",
      });
      setExtSearch('');
      return;
    }
    // Gestion des stocks : un article en rupture pharmacie ne peut pas faire l'objet d'une vente
    // (sauf famille non gérée en stock)
    if (managesStock(a) && a.stockPharmacie <= 0) {
      setArticleAlert({
        kind: 'out_of_stock',
        title: '🚨 Rupture de stock pharmacie',
        message: `« ${a.name} » — stock pharmacie = 0`,
        hint: 'Cet article ne peut pas être vendu. Demandez un réapprovisionnement à la pharmacie.',
      });
      setExtSearch('');
      return;
    }
    // La date saisie est conservée : elle ne s'efface pas entre les lignes (plusieurs sorties le même jour)
    const nl: HbLine = { id: uuidv4(), articleName: a.name, quantity: 1, unitPrice: getPrice(a, 'externe'), discount: 0, dateSort: extLineForm.dateSort || new Date().toISOString().split('T')[0] };
    setExtLineForm({ ...nl }); setExtSelLineId(nl.id); setExtIsNew(true); setExtSearch('');
  };
  const extSaveLine = () => {
    if (!extLineForm.articleName) return;
    // Contrôle stock pharmacie à la validation de la ligne (sauf famille non gérée en stock)
    const art = state.articles.find(a => a.name === extLineForm.articleName);
    if (art?.saleBlocked) {
      setArticleAlert({
        kind: 'blocked',
        title: '⛔ Article bloqué à la vente par la pharmacie',
        message: `« ${art.name} »`,
        reason: art.saleBlockReason || undefined,
        hint: "Vente externe impossible : demandez le déblocage de l'article à la pharmacie.",
      });
      return;
    }
    if (art && managesStock(art) && art.stockPharmacie <= 0) {
      setArticleAlert({
        kind: 'out_of_stock',
        title: '🚨 Rupture de stock pharmacie',
        message: `« ${art.name} » — stock pharmacie = 0`,
        hint: 'Vente impossible : demandez un réapprovisionnement à la pharmacie.',
      });
      return;
    }
    if (art && managesStock(art) && extLineForm.quantity > art.stockPharmacie) {
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
      setArticleAlert({
        kind: 'blocked',
        title: '⛔ Vente bloquée par la pharmacie',
        message: `${blockedLines.length} article(s) bloqué(s) à la vente — encaissement impossible.`,
        items: blockedLines.map((l) => {
          const art = state.articles.find((a) => a.name === l.articleName);
          return `${l.articleName}${art?.saleBlockReason ? ` (${art.saleBlockReason})` : ''}`;
        }),
        hint: "Retirez ces lignes ou demandez le déblocage des articles à la pharmacie.",
      });
      return;
    }
    // Contrôle rupture : un article en rupture pharmacie ne peut pas faire l'objet d'une vente
    // (sauf famille non gérée en stock)
    const outLines = extLines.filter((l) => {
      const art = state.articles.find((a) => a.name === l.articleName);
      return !art || (managesStock(art) && art.stockPharmacie <= 0);
    });
    if (outLines.length > 0) {
      setArticleAlert({
        kind: 'out_of_stock',
        title: '🚨 Rupture de stock — vente impossible',
        message: `${outLines.length} article(s) en rupture de stock pharmacie.`,
        items: outLines.map((l) => `${l.articleName} (stock pharmacie = 0)`),
        hint: 'Retirez ces lignes ou demandez un réapprovisionnement à la pharmacie.',
      });
      return;
    }
    // Contrôle quantités : avertissement si la quantité vendue dépasse le stock disponible
    // (sauf famille non gérée en stock)
    const insuffLines = extLines.filter((l) => {
      const art = state.articles.find((a) => a.name === l.articleName);
      return !!art && managesStock(art) && art.stockPharmacie < l.quantity;
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
    // Prestations laboratoire / échographie vendues au client externe : elles ne
    // décomptent aucun stock et donnent lieu à l'impression d'un bon d'examen.
    const labSaleLines = extLines.filter((l) => isLabExamArticle(state.articles.find((a) => a.name === l.articleName)));
    const echoSaleLines = extLines.filter((l) => isEchoActArticle(state.articles.find((a) => a.name === l.articleName)));
    const nonMedicamentLines = extLines.filter((l) => {
      const art = state.articles.find((a) => a.name === l.articleName);
      return art?.family !== 'MEDIC' && !isServiceArticle(art);
    });

    const invId = uuidv4();
    const now = new Date().toISOString();
    const extDoctor: User = {
      id: 'CASHIER',
      name: state.currentUser?.name ? `Vente Externe (${state.currentUser.name})` : 'Vente Externe',
      role: 'cashier',
    };

    // ---- Demandes d'analyses du client externe : la vente étant encaissée, elles
    // sont créées directement au statut 'paid' et arrivent donc dans la file
    // d'attente du laboratoire. ----
    const newLabRequests: LabRequest[] = labSaleLines.flatMap((l) => {
      const art = state.articles.find((a) => a.name === l.articleName);
      const qty = Math.max(1, Math.round(l.quantity) || 1);
      return Array.from({ length: qty }, () => ({
        id: uuidv4(),
        examType: l.articleName,
        code: art?.code || art?.barcode,
        category: art?.category as LabRequest['category'],
        parameters: art?.parameters && art.parameters.length > 0 ? [...art.parameters] : [l.articleName],
        urgent: false,
        status: 'paid' as const,
        sampleType: art?.sampleType || 'Sang veineux',
        requestedBy: state.currentUser?.id || 'CASHIER',
        requestedAt: now,
        invoiceId: invId,
        price: roundTo2(l.unitPrice * (1 - l.discount / 100)),
      }));
    });

    // ---- Demandes d'échographie du client externe (rattachées à la consultation externe) ----
    const newEchoRequests: EchoRequest[] = echoSaleLines.flatMap((l) => {
      const qty = Math.max(1, Math.round(l.quantity) || 1);
      return Array.from({ length: qty }, () => ({
        id: uuidv4(),
        examType: l.articleName,
        urgent: false,
        status: 'paid' as const,
        requestedBy: state.currentUser?.id || 'CASHIER',
        requestedAt: now,
        invoiceId: invId,
        price: roundTo2(l.unitPrice * (1 - l.discount / 100)),
      }));
    });

    let extConsultId: string | undefined = undefined;
    let newConsultations: Consultation[] = [];

    if (medicamentLines.length > 0 || newEchoRequests.length > 0) {
      extConsultId = uuidv4();
      newEchoRequests.forEach((e) => { e.consultationId = extConsultId; });
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
        doctorName: extDoctor.name,
        date: now,
        visitReason: `Vente externe${medicamentLines.length > 0 ? ' — Pharmacie' : ''}${newEchoRequests.length > 0 ? ' — Échographie' : ''}`,
        diagnosis: 'Client Externe',
        prescriptions,
        labRequests: [],
        echoRequests: newEchoRequests,
        hospitalizeRequested: false,
        surgeryRequested: false,
        isEmergency: false,
        vitalSigns: { temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' },
        notes: '',
      };
      newConsultations.push(extConsult);
    }

    const inv: Invoice = {
      id: invId,
      consultationId: extConsultId,
      clientName: 'Client Externe',
      clientType: 'externe',
      items: extLines.map(l => {
        const art = state.articles.find(a => a.name === l.articleName);
        const category: InvoiceItem['category'] = isLabExamArticle(art) ? 'lab' : isEchoActArticle(art) ? 'echo' : 'pharmacy';
        return { description: `${l.articleName} × ${l.quantity}`, amount: extLineAmt(l), category };
      }),
      totalAmount: extTotal,
      patientCharge: extTotal,
      status: 'paid',
      paidAt: now,
      paidBy: state.currentUser?.id || '',
      createdAt: now,
      isExternal: true
    };

    setState(prev => {
      // Décrémenter stock pharmacie uniquement pour les articles NON-médicaments (les médicaments le seront lors de la délivrance pharmacie)
      // Les articles des familles non gérées en stock ne sont pas décomptés.
      let articles = [...prev.articles];
      nonMedicamentLines.forEach((l) => {
        const idx = articles.findIndex((a) => a.name === l.articleName);
        if (idx >= 0 && familyManagesStock(articles[idx].family, prev.familles)) {
          articles[idx] = { ...articles[idx], stockPharmacie: Math.max(0, articles[idx].stockPharmacie - l.quantity) };
        }
      });
      const next = {
        ...prev,
        invoices: [...prev.invoices, inv],
        consultations: [...prev.consultations, ...newConsultations],
        labRequests: [...prev.labRequests, ...newLabRequests],
        articles
      };
      const parts = [
        medicamentLines.length > 0 ? 'médicaments' : '',
        newLabRequests.length > 0 ? 'analyses' : '',
        newEchoRequests.length > 0 ? 'échographies' : '',
      ].filter(Boolean).join(' + ');
      addAuditLog(next, 'VENTE_EXTERNE', `Client Externe — ${formatAr(extTotal)}${parts ? ` (${parts})` : ''}${medicamentLines.length > 0 ? ' — ordonnance ajoutée à la file d\'attente pharmacie' : ''}`);
      return next;
    });
    // 1) Reçu de paiement (ticket de caisse)
    openThermalTicket(effectiveTicketSettings, inv, undefined, state.currentUser || undefined);
    // 2) Bon d'analyse laboratoire — client externe (imprimé après le reçu)
    if (newLabRequests.length > 0) {
      setTimeout(() => {
        printLabRequestTicket(effectiveTicketSettings, EXT_CLIENT_PATIENT, extDoctor, new Date(), newLabRequests);
      }, 900);
    }
    // 3) Bon d'échographie — client externe
    if (newEchoRequests.length > 0) {
      setTimeout(() => {
        printEchoRequestTicket(effectiveTicketSettings, EXT_CLIENT_PATIENT, extDoctor, new Date(), newEchoRequests);
      }, newLabRequests.length > 0 ? 1800 : 900);
    }

    setExtLines([]); setExtSearch('');
  };

  // === HOSPIT/BLOC ===
  const hbLineAmt = (l: HbLine) => roundTo2(l.unitPrice * l.quantity * (1 - l.discount / 100));
  const hbPatFiltered = hbPatSearch.length >= 1 ? state.patients.filter(p => `${p.lastName} ${p.firstName}`.toLowerCase().includes(hbPatSearch.toLowerCase()) || p.dossier.toLowerCase().includes(hbPatSearch.toLowerCase())) : [];

  const hbSelectPatient = (patientId: string) => {
    const p = state.patients.find(x => x.id === patientId);
    if (!p) return;
    const exists = hbRecords.some(r => r.patientId === p.id && r.type === tab);
    if (exists) { alert('Ce patient est déjà dans la liste'); return; }
    const now = new Date().toISOString();
    updateHbRecords([...hbRecords, {
      id: uuidv4(), patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
      clientType: p.clientType, company: p.company, subCompany: p.subCompany,
      type: tab as 'hospit' | 'bloc', lines: [], payments: [],
      openedAt: now, openedBy: state.currentUser?.name, openedByUserId: state.currentUser?.id,
    }]);
    setHbPatSearch(''); setHbModal('none');
  };

  const addPartnerCompany = (rawName: string): string | null => {
    const name = rawName.trim().toUpperCase();
    if (!name) return null;
    const existing = state.companies.find(c => c.name.toUpperCase() === name);
    if (existing) return existing.name;
    setState(prev => ({
      ...prev,
      companies: [...prev.companies, { id: `comp-${Date.now()}`, name, paymentMode: 'Crédit', settlementMode: 'monthly_global', createdAt: new Date().toISOString() }],
    }));
    return name;
  };

  const hbAddNewPatient = () => {
    if (!hbNewPat.lastName || !hbNewPat.firstName) { alert('Nom et prénom requis'); return; }
    const dossier = normalizeDossierNumber(hbNewPat.dossier);
    if (!dossier) { alert('Le numéro de dossier est obligatoire (saisie manuelle, majuscules).'); return; }
    if (isDossierTaken(state.patients, dossier)) { alert('Ce numéro de dossier existe déjà.'); return; }
    const np = {
      id: uuidv4(), dossier,
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
      clientType: np.clientType, company: np.company, subCompany: np.subCompany,
      type: tab as 'hospit' | 'bloc', lines: [], payments: [],
      openedAt: now, openedBy: state.currentUser?.name, openedByUserId: state.currentUser?.id,
    }]);
    setHbNewPat({ dossier: '', lastName: '', firstName: '', dateOfBirth: '', gender: 'M', contact: '', address: '', matricule: '', ssn: '', insureName: '', clientType: 'comptoir', company: '', subCompany: '' });
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

  const deleteHbRecord = (recordId: string) => {
    const rec = hbRecords.find(r => r.id === recordId);
    if (!rec) return;
    const totalFact = rec.lines.reduce((s, l) => s + hbLineAmt(l), 0);
    const totalPaid = rec.payments.reduce((s, p) => s + p.amount, 0);
    if (totalFact > 0 || totalPaid > 0) {
      showAlert("La suppression n'est autorisée que pour les dossiers dont la facture est égale à 0 Ar.", "Suppression non autorisée", "danger");
      return;
    }
    const dossierTypeName = rec.type === 'hospit' ? 'hospitalisation' : 'bloc opératoire';
    askConfirmation({
      title: `Suppression du dossier ${dossierTypeName}`,
      message: `Supprimer le dossier ${dossierTypeName} de ${rec.patientName} ?`,
      subText: `Facture = 0 Ar. Ce dossier sera supprimé de la liste caisse, mais le patient sera conservé dans la base de données.`,
      confirmText: 'Supprimer le dossier',
      cancelText: 'Annuler',
      type: 'danger',
      onConfirm: () => {
        updateHbRecords(hbRecords.filter(r => r.id !== recordId));
        if (hbSelRecordId === recordId) setHbSelRecordId(null);
        addAuditLog(state, 'SUPPRESSION_DOSSIER_HB', `Dossier ${rec.type} de ${rec.patientName} supprimé (Facture 0 Ar)`, rec.patientId);
        setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const hbArtSelectArticle = (articleId: string) => {
    const a = state.articles.find(x => x.id === articleId);
    if (!a) return;
    if (a.saleBlocked) {
      alert(`⛔ Vente bloquée pour « ${a.name} »${a.saleBlockReason ? ` — ${a.saleBlockReason}` : ''}.`);
      return;
    }
    // Gestion des stocks : un article en rupture pharmacie ne peut pas faire l'objet d'une vente
    // (sauf famille non gérée en stock)
    if (managesStock(a) && a.stockPharmacie <= 0) {
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

    // Contrôle stock pharmacie à la validation de la ligne (sauf famille non gérée en stock)
    const art = state.articles.find(a => a.name === hbArtForm.articleName);
    if (art && managesStock(art) && art.stockPharmacie <= 0) { alert(`🚨 RUPTURE DE STOCK : « ${art.name} » (stock pharmacie = 0).\n\nVente impossible.`); return; }
    if (art && managesStock(art) && hbArtForm.quantity > art.stockPharmacie) {
      askConfirmation({
        title: 'Stock pharmacie insuffisant',
        message: `Stock pharmacie insuffisant pour « ${art.name} » : ${art.stockPharmacie} disponible(s), ${hbArtForm.quantity} demandée(s).`,
        subText: 'Enregistrer la ligne de prescription quand même ?',
        confirmText: 'Enregistrer quand même',
        type: 'warning',
        onConfirm: () => {
          const lineToSave: HbLine = {
            ...hbArtForm,
            dateSort: hbArtForm.dateSort || new Date().toISOString().split('T')[0]
          };
          updateHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? {
            ...r,
            lines: hbIsNew || !r.lines.find(l => l.id === hbArtForm.id)
              ? [...r.lines, lineToSave]
              : r.lines.map(l => l.id === hbArtForm.id ? lineToSave : l)
          } : r));
          setHbIsNew(false);
          setHbArtForm(prev => ({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: prev.dateSort || new Date().toISOString().split('T')[0] }));
          setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
        }
      });
      return;
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
    const amount = hbPayAmounts[recordId] || 0;
    if (!rec || amount <= 0) return;
    const totalFact = rec.lines.reduce((s, l) => s + hbLineAmt(l), 0);
    const totalPaid = rec.payments.reduce((s, p) => s + p.amount, 0);
    const reste = totalFact - totalPaid;
    if (amount > reste) { alert(`Montant supérieur au reste à payer (${formatAr(reste)})`); return; }
    // 💡 On conserve qui a reçu l'argent : caisse ou pharmacie (selon le rôle de l'utilisateur connecté)
    const receivedBy: 'caisse' | 'pharmacie' = state.currentUser?.role === 'pharmacy' ? 'pharmacie' : 'caisse';
    const payment = {
      amount,
      paidBy: state.currentUser?.name || '',
      paidByUserId: state.currentUser?.id,
      date: new Date().toISOString(),
      receivedBy,
    };
    updateHbRecords((prev) => prev.map(r => r.id === recordId ? { ...r, payments: [...r.payments, payment] } : r));

    // Imprimer le ticket de paiement pour hospitalisation/bloc
    const newTotalPaid = totalPaid + amount;
    const newReste = totalFact - newTotalPaid;
    const patient = rec.patientId ? state.patients.find(p => p.id === rec.patientId) : undefined;
    printHbPaymentTicket(
      effectiveTicketSettings,
      rec,
      payment,
      newReste,
      state.currentUser || undefined,
      patient,
    );

    // 💡 Réinitialiser UNIQUEMENT la saisie de CE dossier (les autres restent indépendants)
    setHbPayAmounts(prev => ({ ...prev, [recordId]: 0 }));
  };

  // Edit client type
  const hbSaveClientType = () => {
    if (!hbSelRecordId) return;
    const rec = hbRecords.find(r => r.id === hbSelRecordId);
    updateHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, clientType: hbEditClientType, company: hbEditClientType === 'societe' ? hbEditCompany : undefined, subCompany: hbEditClientType === 'societe' ? hbEditSubCompany : undefined } : r));
    if (rec?.patientId) {
      setState(prev => ({ ...prev, patients: prev.patients.map(p => p.id === rec.patientId ? { ...p, clientType: hbEditClientType === 'externe' ? 'comptoir' : hbEditClientType as 'comptoir'|'societe', company: hbEditClientType === 'societe' ? hbEditCompany : undefined, subCompany: hbEditClientType === 'societe' ? hbEditSubCompany : undefined } : p) }));
    }
    setHbModal('none');
  };

  // Edition société pour la facture en attente (toujours visible quand patient choisi)
  const paySaveClientType = () => {
    if (!selPatient) return;
    setState(prev => ({
      ...prev,
      patients: prev.patients.map(p => p.id === selPatient.id ? {
        ...p,
        clientType: payEditClientType === 'externe' ? 'comptoir' : payEditClientType as 'comptoir'|'societe',
        company: payEditClientType === 'societe' ? payEditCompany : undefined,
        subCompany: payEditClientType === 'societe' ? payEditSubCompany : undefined,
      } : p),
    }));
    // Mettre à jour aussi hbRecords si patient déjà présent en hospit/bloc
    updateHbRecords(prev => prev.map(r => r.patientId === selPatient.id ? {
      ...r, clientType: payEditClientType, company: payEditClientType === 'societe' ? payEditCompany : undefined, subCompany: payEditClientType === 'societe' ? payEditSubCompany : undefined,
    } : r));
    setShowPayClientTypeEdit(false);
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
        additions.push({ id: uuidv4(), patientId: pat.id, patientName: name, clientType: pat.clientType, company: pat.company, subCompany: pat.subCompany, type: 'hospit', lines: [], payments: [], openedAt: now, openedBy: openerName, openedByUserId: openerId });
      if (c.surgeryRequested && !hbRecords.some(h => h.patientId === pat.id && h.type === 'bloc'))
        additions.push({ id: uuidv4(), patientId: pat.id, patientName: name, clientType: pat.clientType, company: pat.company, subCompany: pat.subCompany, type: 'bloc', lines: [], payments: [], openedAt: now, openedBy: openerName, openedByUserId: openerId });
    });
    if (additions.length > 0) updateHbRecords(prev => [...prev, ...additions]);
  };
  const switchTab = (t: Tab) => { setTab(t); if (t === 'hospit' || t === 'bloc') autoAddRequests(); };

  // Stats — FILTRÉES PAR LE CAISSIER CONNECTÉ
  // Les paiements se font individuellement et au nom de la personne qui a reçu l'argent.
  // La clôture affiche UNIQUEMENT la caisse du caissier connecté, pas la totalité du jour.
  const currentCashierId = state.currentUser?.id || 'SYS';

  const paidInvoices = state.invoices.filter(inv => inv.status === 'paid');
  // ⚠️ Les factures validées en CRÉDIT SOCIÉTÉ ne représentent AUCUN encaissement
  // en espèces : elles sont exclues des totaux et des clôtures Z de la caisse.
  const todayInvoices = paidInvoices.filter(inv => !inv.creditSociete && new Date(inv.paidAt || '').toDateString() === new Date().toDateString());
  // Factures du caissier connecté uniquement
  const myTodayInvoices = todayInvoices.filter(inv => inv.paidBy === currentCashierId);
  const groupedMyTodayInvoices = myTodayInvoices.reduce((acc, inv) => {
    const timeStr = new Date(inv.paidAt || inv.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const key = `${inv.patientId || inv.clientName || 'ext'}_${timeStr}`;
    const existing = acc.find(g => g.key === key);
    if (existing) {
      existing.mergedInvoice.patientCharge += inv.patientCharge;
      existing.mergedInvoice.totalAmount += inv.totalAmount;
      if (inv.items) {
        existing.mergedInvoice.items = [...(existing.mergedInvoice.items || []), ...inv.items];
      }
    } else {
      acc.push({
        key,
        timeStr,
        mergedInvoice: { ...inv, items: inv.items ? [...inv.items] : [] }
      });
    }
    return acc;
  }, [] as { key: string; timeStr: string; mergedInvoice: typeof myTodayInvoices[0] }[]);
  
  const myTodayTotal = myTodayInvoices.reduce((s, inv) => s + inv.patientCharge, 0);
  const myTodayExtTotal = myTodayInvoices.filter(i => i.isExternal).reduce((s, i) => s + i.patientCharge, 0);
  // Paiements Hospit/Bloc du caissier connecté uniquement
  const myTodayPartialTotal = hbRecords.reduce((s, h) => s + h.payments.filter(p => new Date(p.date).toDateString() === new Date().toDateString() && p.paidByUserId === currentCashierId).reduce((ss, p) => ss + p.amount, 0), 0);

  const myGrandTotal = myTodayTotal + myTodayPartialTotal;

  // Ordre décroissant : dernier saisi / dernier arrivé en haut (hospitalisation & bloc)
  const curHbRecords = hbRecords
    .filter(h => h.type === tab)
    .sort((a, b) => new Date((b.openedAt || 0) as string | number).getTime() - new Date((a.openedAt || 0) as string | number).getTime());
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
    printClosingTicket(effectiveTicketSettings, { id: closing.cashierId, name: closing.cashierName, role: 'cashier' }, new Date(closing.createdAt), closingSections(invoices, closing.hospitalizationTotal), formatAr(closing.grandTotal));
  };

  const finalizeClosing = () => {
    if (existingClosing) { alert('La caisse de ce caissier est déjà clôturée pour aujourd’hui. Vous pouvez réimprimer le ticket Z ci-dessous.'); return; }
    if (closeableInvoices.length === 0 && myTodayPartialTotal === 0) {
      const hasUnclosedPharma = (state.pharmaDeliveryItems || []).some((item) => !item.closingId);
      if (!hasUnclosedPharma) { alert('Aucun encaissement à clôturer aujourd’hui.'); return; }
    }
    const totalForConfirm = closeableInvoices.reduce((sum, i) => sum + i.patientCharge, 0) + myTodayPartialTotal;
    const unclosedPharmaPreview = (state.pharmaDeliveryItems || []).filter((item) => !item.closingId);
    const confirmMsg = unclosedPharmaPreview.length > 0
      ? "Cl\u00f4turer " + closeableInvoices.length + " facture(s) pour " + formatAr(totalForConfirm) + " et compiler " + unclosedPharmaPreview.length + " livraison(s) pharmacie en attente ?\n\nCette op\u00e9ration verrouille les factures dans le Z et cr\u00e9e la compilation d\u00e9finitive des livraisons de garde (\u00ab Compilation des livraisons & Cl\u00f4ture de garde \u00bb) qui sera imprim\u00e9e automatiquement."
      : "Cl\u00f4turer " + closeableInvoices.length + " facture(s) pour " + formatAr(totalForConfirm) + " ? Cette op\u00e9ration verrouille les factures dans le Z.";
    if (!confirm(confirmMsg)) return;
    const now = new Date();
    const consultationTotal = closeableInvoices.filter(i => !i.isExternal).reduce((sum, i) => sum + i.patientCharge, 0);
    const externalTotal = closeableInvoices.filter(i => i.isExternal).reduce((sum, i) => sum + i.patientCharge, 0);

    let pharmaClosing: import('../types').PharmaDeliveryClosing | null = null;
    {
      const unclosed = (state.pharmaDeliveryItems || []).filter((item) => !item.closingId);
      if (unclosed.length > 0) {
        const pharmaTotalAmount = unclosed.reduce((s, d) => s + d.quantity * d.unitPrice, 0);
        const pharmaTotalItems = unclosed.reduce((s, d) => s + d.quantity, 0);
        const responsibleName = state.currentUser?.name || 'Responsable Pharmacie';
        const responsibleId = state.currentUser?.id || 'PHA001';
        const pharmaCounter = (state.pharmaClosingCounter || 0) + 1;
        const pharmaClosingNumber = generatePharmaClosingNumber(pharmaCounter);
        const pharmaNow = new Date().toISOString();
        const closingId = uuidv4();
        // Synthèse imprimée : UNIQUEMENT les médicaments gérés en stock, avec la
        // quantité sortie du jour (si sortie) et le stock pharmacie final.
        // Le détail ligne à ligne des livraisons n'est plus imprimé.
        const stockSummary = (() => {
          const acc = new Map<string, { articleId?: string; articleName: string; qtyOut: number; finalStock: number }>();
          unclosed.forEach((d) => {
            const art = state.articles.find((a) => (d.articleId && a.id === d.articleId) || a.name === d.articleName);
            // Seuls les articles gérés en stock (familles « gérées en stock ») sont retenus
            if (!art || !familyManagesStock(art.family, state.familles)) return;
            const key = art.id;
            const prev = acc.get(key);
            if (prev) prev.qtyOut += d.quantity;
            else acc.set(key, { articleId: art.id, articleName: art.name, qtyOut: d.quantity, finalStock: art.stockPharmacie });
          });
          return Array.from(acc.values())
            .filter((r) => r.qtyOut > 0)
            .sort((a, b) => b.qtyOut - a.qtyOut);
        })();
        pharmaClosing = {
          id: closingId,
          closingNumber: pharmaClosingNumber,
          date: pharmaNow,
          responsibleId,
          responsibleName,
          deliveryIds: unclosed.map((d) => d.id),
          totalItems: pharmaTotalItems,
          totalAmount: pharmaTotalAmount,
          deliveries: unclosed.map((d) => ({ ...d, closingId })),
          stockSummary,
          createdAt: pharmaNow,
        };
        (pharmaClosing as any)._counter = pharmaCounter;
      }
    }

    const closing: CashClosing = {
      id: uuidv4(), date: now.toISOString(), cashierId: currentCashierId, cashierName: state.currentUser?.name || 'Caissier',
      invoiceIds: closeableInvoices.map(i => i.id), invoiceCount: closeableInvoices.length,
      consultationTotal, externalTotal, hospitalizationTotal: myTodayPartialTotal,
      grandTotal: consultationTotal + externalTotal + myTodayPartialTotal, createdAt: now.toISOString(),
    };

    setState(prev => {
      let next: any = { ...prev };
      if (pharmaClosing) {
        const pc = pharmaClosing as any;
        const counter = pc._counter;
        delete pc._counter;
        next.pharmaDeliveryItems = (prev.pharmaDeliveryItems || []).map((item) => item.closingId ? item : { ...item, closingId: pharmaClosing.id });
        next.pharmaDeliveryClosings = [pharmaClosing, ...(prev.pharmaDeliveryClosings || [])];
        next.pharmaClosingCounter = counter;
        addAuditLog(next, 'CLOTURE_LIVRAISONS_PHARMA', "Cl\u00f4ture garde " + pharmaClosing.closingNumber + " \u2014 " + pharmaClosing.totalItems + " articles (" + formatAr(pharmaClosing.totalAmount) + ") par " + pharmaClosing.responsibleName + " \u2014 via cl\u00f4ture caisse de garde");
      }
      next.cashClosings = [...prev.cashClosings, closing];
      next.invoices = prev.invoices.map(i => closing.invoiceIds.includes(i.id) ? { ...i, closingId: closing.id } : i);
      addAuditLog(next, 'CLOTURE_CAISSE', "Z " + closing.id.slice(0, 8).toUpperCase() + " \u2014 " + closing.invoiceCount + " facture(s), " + formatAr(closing.grandTotal) + (pharmaClosing ? " + compilation pharma " + pharmaClosing.closingNumber : ""));
      return next;
    });

    printClosingTicket(effectiveTicketSettings, state.currentUser || { id: 'SYS', name: 'Caissier', role: 'cashier' }, now, closingSections(closeableInvoices), formatAr(closing.grandTotal));

    if (pharmaClosing) {
      const pc = pharmaClosing;
      setTimeout(() => {
        try {
          // Ticket de clôture : sorties du jour + stock final (sans détail des livraisons)
          printPharmaDeliveryClosingTicket(effectiveTicketSettings, pc, pc.stockSummary);
        } catch (e) { console.error('Erreur impression compilation pharma', e); }
      }, 900);
    }
  };

  return (
    <div className="space-y-4 flex flex-col">


      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex items-center justify-between border-b overflow-x-auto bg-slate-50/50 px-2">
          <div className="flex overflow-x-auto">
            {([['payment','📋 Facturation',pendingPatients.length],['hospit','🏨 Hospit.',hbRecords.filter(h=>h.type==='hospit').length],['bloc','🏥 Bloc',hbRecords.filter(h=>h.type==='bloc').length],['closing','🔒 Clôture',0]] as [Tab,string,number][]).map(([k,l,c]) => (
              <button key={k} onClick={() => switchTab(k)} className={`flex items-center gap-1 px-4 py-3 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap ${tab===k?'border-amber-500 text-amber-600 bg-amber-50/50':'border-transparent text-slate-500 hover:text-slate-800'}`}>{l}{c > 0 ? ` (${c})` : ''}</button>
            ))}
          </div>
          <div className="pr-2">
            <button
              onClick={() => { setTempPrinterSettings(printerSettings); setPrinterModalOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer shadow-xs transition"
              title="Configurer l'imprimante et le format de ticket pour ce caissier"
            >
              <Printer className="w-4 h-4 text-amber-600" />
              <span>Imprimante : {printerSettings.printerName} ({printerSettings.paperWidth}mm)</span>
            </button>
          </div>
        </div>

        <div className="p-4">

          {/* FACTURATION — file d'attente de paiement (popup) + Vente directe client externe */}
          {tab === 'payment' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

              {/* FILE D'ATTENTE DE PAIEMENT — le clic ouvre la facture en popup modale */}
              <div className="border rounded-lg overflow-hidden bg-white">
                <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-amber-800 flex items-center gap-1.5"><CreditCard className="w-4 h-4" /> File d'attente de paiement</span>
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() => onRefreshQueue?.()}
                      title="Rechercher les nouvelles consultations validées par les médecins"
                      className="p-1 rounded-lg text-amber-700 hover:bg-amber-200/70 cursor-pointer transition"
                    ><RefreshCw className="w-3.5 h-3.5" /></button>
                    <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-bold">{pendingPatients.length}</span>
                  </span>
                </div>
                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {pendingPatients.length === 0 ? <div className="p-6 text-center text-slate-400 text-sm">Aucune facture</div>
                    : pendingPatients.map(p => {
                      const unpaid = getConsults(p.id);
                      const amount = getPendingAmount(p);
                      const svcInvs = pendingServiceInvoices.filter(i => i.patientId === p.id);
                      const hasMeds = unpaid.length > 0;
                      const hasLab = svcInvs.some(i => i.items.some(it => it.category === 'lab'));
                      const hasEcho = svcInvs.some(i => i.items.some(it => it.category === 'echo'));
                      const hasConsult = svcInvs.some(i => i.items.some(it => it.category === 'consultation'));
                      return <div key={p.id} className={`p-3 cursor-pointer hover:bg-amber-50/60 transition ${selPatientId === p.id && paymentModalOpen ? 'bg-amber-50 border-l-4 border-amber-500' : ''}`} onClick={() => openPaymentModal(p.id)} title="Ouvrir la facture en fenêtre modale">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0"><div className="font-medium text-sm">{p.lastName} {p.firstName}</div><div className="text-xs text-slate-500">{unpaid[0]?.doctorName || 'Analyses laboratoire'}{p.company ? ` — ${p.company}` : ''}</div></div>
                          <div className="flex items-start gap-1 shrink-0">
                            <div className={`font-mono font-bold text-sm ${p.clientType === 'societe' ? 'text-blue-700' : 'text-amber-700'}`}>{formatAr(amount)}</div>
                            <button
                              onClick={(e) => { e.stopPropagation(); removePendingPatient(p.id); }}
                              className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 hover:text-rose-700 cursor-pointer transition"
                              title="Retirer de la file caisse — dossier patient conservé"
                            ><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {p.clientType === 'societe' && <span className="px-1 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-semibold" title="Pas d'espèces : la facture est portée au crédit de la société">🏢 Crédit Société</span>}
                          {hasMeds && <span className="px-1 py-0.5 bg-cyan-100 text-cyan-700 text-[10px] rounded">Médicaments</span>}
                          {hasLab && <span className="px-1 py-0.5 bg-teal-100 text-teal-700 text-[10px] rounded">Analyses</span>}
                          {hasEcho && <span className="px-1 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded">Écho</span>}
                          {hasConsult && <span className="px-1 py-0.5 bg-sky-100 text-sky-700 text-[10px] rounded">Consultation</span>}
                          {!hasMeds && !hasLab && !hasEcho && !hasConsult && <span className="px-1 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded">Passage (0 Ar)</span>}
                        </div>
                      </div>;
                    })}
                </div>
                {pendingPatients.length > 0 && <div className="px-3 py-1.5 bg-slate-50 border-t text-[10px] text-slate-500 text-center">👆 Cliquez sur un patient pour ouvrir sa facture</div>}
              </div>

              {/* VENTE DIRECTE — CLIENT EXTERNE (affichée à la place du détail de facturation) */}
              <div className="lg:col-span-2 space-y-3">
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg"><h3 className="font-bold text-purple-800"><ShoppingCart className="w-5 h-5 inline" /> Vente Directe — Client Externe</h3></div>
                <div className="bg-[#f4f4f4] border border-slate-300 rounded">
                  <div className="bg-slate-100 border-b border-slate-300 p-1.5 m-2 mb-0 rounded shadow-inner">
                    <div className="flex flex-wrap items-end gap-1">
                      <div className="flex-1 min-w-[140px] relative">
                        <label className="block text-[9px] text-slate-500">Article (↑↓ Entrée)</label>
                        <input ref={extSearchRef} type="text" value={extLineForm.articleName && !extSearch ? extLineForm.articleName : extSearch} onChange={e => { setExtSearch(e.target.value); setExtSearchIdx(0); }} onKeyDown={extKeyDown} className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-600" placeholder="🔍 Tapez..." />
                        {extSearch.length >= 1 && extFiltered.length > 0 && <div className="absolute top-full left-0 right-0 bg-white border rounded-b shadow-xl z-30 max-h-36 overflow-y-auto">{extFiltered.map((a, idx) => {
                          const manages = managesStock(a);
                          const isBlocked = !!a.saleBlocked;
                          const isOut = manages && a.stockPharmacie <= 0;
                          const isLow = manages && !isOut && a.stockPharmacie <= a.minStockPharmacie && !a.alertDisabledPharmacie;
                          const isKo = isBlocked || isOut;
                          return (<div key={a.id} onClick={() => extSelectArticle(a.id)} title={isBlocked ? `Bloqué à la vente par la pharmacie${a.saleBlockReason ? ` — ${a.saleBlockReason}` : ''}` : isOut ? 'Rupture de stock — vente impossible' : undefined} className={`px-2 py-1 text-xs flex justify-between border-b ${isKo ? 'bg-red-50 text-red-700 cursor-not-allowed' : `cursor-pointer ${idx === extSearchIdx ? 'bg-blue-100' : 'hover:bg-blue-50'}`}`}>
                            <span className={isKo ? 'line-through decoration-red-400/60' : ''}>[{a.family}] {a.name}</span>
                            <span className="flex items-center gap-2">
                              {isBlocked
                                ? <span className="px-1.5 py-0.5 bg-red-700 text-white rounded text-[9px] font-bold">⛔ BLOQUÉ — invendable</span>
                                : isOut
                                ? <span className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[9px] font-bold">🚨 RUPTURE — invendable</span>
                                : manages
                                  ? <span className={`font-mono text-[10px] ${isLow ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>Stock: {a.stockPharmacie}{isLow ? ' ⚠️' : ''}</span>
                                  : isLabExamArticle(a)
                                    ? <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-[9px] font-bold" title="Analyse de laboratoire — un bon d'analyse sera imprimé après encaissement">BON LABO</span>
                                    : isEchoActArticle(a)
                                      ? <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-bold" title="Échographie — un bon d'échographie sera imprimé après encaissement">BON ÉCHO</span>
                                      : <span className="font-mono text-[10px] text-slate-400" title="Famille non gérée en stock">stock: —</span>}
                              <span className={`font-mono ${isKo ? 'text-red-400' : 'text-blue-600'}`}>{formatAr(getPrice(a, 'externe'))}</span>
                            </span>
                          </div>);
                        })}</div>}
                      </div>
                      <div className="w-14"><label className="block text-[9px] text-slate-500">Qté</label><input type="number" min={1} value={extLineForm.quantity} onChange={e => setExtLineForm({...extLineForm, quantity: parseFloat(e.target.value)||1})} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); extSaveLine(); }}} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono outline-none" /></div>
                      <div className="w-14"><label className="block text-[9px] text-slate-500">Rem%</label><input type="number" min={0} max={100} value={extLineForm.discount} onChange={e => setExtLineForm({...extLineForm, discount: parseFloat(e.target.value)||0})} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); extSaveLine(); }}} className="w-full bg-white border border-slate-300 rounded px-1 py-0.5 text-xs text-right font-mono outline-none" /></div>
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
                      <tbody className="divide-y font-mono">{extLines.map(l => (<tr key={l.id} onClick={() => { setExtSelLineId(l.id); setExtLineForm({...l}); setExtIsNew(false); }} className={`cursor-pointer divide-x divide-slate-200 ${l.id === extSelLineId ? 'bg-blue-500 text-white' : 'hover:bg-slate-50'}`}><td className="p-1 font-sans">{l.articleName}</td><td className="p-1 text-right">{l.quantity}</td><td className="p-1 text-center">{l.discount > 0 ? `${l.discount}%` : '—'}</td><td className="p-1 text-right">{formatNum(l.unitPrice)}</td><td className="p-1 text-right font-bold">{formatNum(extLineAmt(l))}</td><td className="p-1 font-sans text-slate-500">{l.dateSort || '—'}</td></tr>))}
                        {extLines.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-slate-400 font-sans">Tapez un article</td></tr>}
                      </tbody>
                      {extLines.length > 0 && <tfoot className="bg-emerald-50 border-t-2 border-emerald-300"><tr><td colSpan={4} className="p-1 text-right font-bold font-sans">SOUS-TOTAL ARTICLES:</td><td colSpan={2} className="p-1 text-right font-mono font-bold text-lg">{formatAr(extArticlesTotal)}</td></tr></tfoot>}
                    </table>
                  </div>
                </div>
                <button onClick={extPay} disabled={extLines.length === 0} className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"><CreditCard className="w-5 h-5" /> Encaisser {formatAr(extTotal)}</button>

              </div>
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
                  return (
                    <div key={record.id} className="border rounded-lg overflow-hidden border-slate-200">
                      <div className="p-3 flex justify-between items-center bg-slate-50">
                        <div>
                          <div className="font-bold text-sm flex items-center gap-2">{record.patientName}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${record.clientType === 'societe' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{record.clientType === 'societe' ? `🏢 ${record.company}${record.subCompany ? ` / ${record.subCompany}` : ''}` : '🏪 Comptoir'}</span>
                            <button onClick={() => { setHbSelRecordId(record.id); setHbEditClientType(record.clientType); setHbEditCompany(record.company || ''); setHbEditSubCompany(record.subCompany || ''); setHbEditNewCompany(''); setHbModal('edit_client'); }} className="text-blue-500 cursor-pointer" title="Modifier société"><Edit2 className="w-3 h-3" /></button>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">Facture: <strong>{formatAr(totalFact)}</strong> | Payé: <span className="text-green-600">{formatAr(totalPaid)}</span> | Reste: <span className="text-red-600 font-bold">{formatAr(reste)}</span></div>
                        </div>
                        <div className="flex gap-1 items-center flex-wrap" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setHbHistoryId(record.id)} title="Historique des paiements" className="px-2 py-1 bg-slate-600 hover:bg-slate-700 text-white rounded text-xs cursor-pointer transition font-medium">📜 Historique{record.payments.length > 0 ? ` (${record.payments.length})` : ''}</button>
                          <button onClick={() => { setHbSelRecordId(record.id); setHbArtSearch(''); setHbArtForm({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: new Date().toISOString().split('T')[0] }); setHbSelLineId(null); setHbIsNew(true); setHbModal('add_article'); }} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs cursor-pointer transition font-medium">📋 Prescriptions</button>
                          {totalFact === 0 && totalPaid === 0 && (
                            <button onClick={() => deleteHbRecord(record.id)} className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs cursor-pointer transition font-medium flex items-center gap-1" title="Supprimer ce dossier (Facture 0 Ar)"><Trash2 className="w-3.5 h-3.5" /> Supprimer</button>
                          )}
                          {reste > 0 && <>
                            <input type="number" min={1} max={reste} value={hbPayAmounts[record.id] || ''} onChange={e => setHbPayAmounts(prev => ({ ...prev, [record.id]: Math.max(0, Math.min(parseFloat(e.target.value) || 0, reste)) }))} className="w-24 px-2 py-1 border rounded text-xs text-right outline-none" placeholder="Montant" />
                            <button onClick={() => addPartialPay(record.id)} disabled={!hbPayAmounts[record.id] || hbPayAmounts[record.id] > reste} className="px-2 py-1 bg-amber-600 text-white rounded text-xs cursor-pointer disabled:opacity-40">💰 Payer</button>
                          </>}
                        </div>
                      </div>
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

              {(() => {
                const pendingPharma = (state.pharmaDeliveryItems || []).filter((i: any) => !i.closingId);
                const totalQty = pendingPharma.reduce((s: number, d: any) => s + d.quantity, 0);
                const totalAmt = pendingPharma.reduce((s: number, d: any) => s + d.quantity * d.unitPrice, 0);
                if (pendingPharma.length === 0) {
                  return (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800 flex items-center gap-2">
                      <span>✓ Aucune livraison pharmacie en attente — compilation à jour</span>
                    </div>
                  );
                }
                return (
                  <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 text-sm">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="font-bold text-purple-900 flex items-center gap-2">📦 Compilation des livraisons & Clôture de garde — {pendingPharma.length} livraison(s) en attente</div>
                        <div className="text-xs text-purple-700 mt-1">Ce qui reste dans les livraisons constitue les livraisons effectuées avant la clôture de caisse / garde de la personne responsable de la pharmacie. La clôture de garde va créer ici la compilation définitive et l&apos;imprimer automatiquement.</div>
                        <div className="text-xs font-mono text-purple-800 mt-1.5">{totalQty} articles · {formatAr(totalAmt)}</div>
                      </div>
                      <div className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold">{pendingPharma.length} à compiler</div>
                    </div>
                  </div>
                );
              })()}

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
                <table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Heure</th><th className="p-2 text-left">Client</th><th className="p-2">Type</th><th className="p-2 text-right">Montant</th><th className="p-2 text-center">Facture A5</th></tr></thead><tbody>
                  {groupedMyTodayInvoices.map(group => {
                    const inv = group.mergedInvoice;
                    const pat = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : null;
                    const comp = pat?.company ? state.companies.find(c => c.name === pat.company) : undefined;
                    return (
                      <tr key={group.key} className="border-b">
                        <td className="p-2 font-mono">{group.timeStr}</td>
                        <td className="p-2">{pat ? `${pat.lastName} ${pat.firstName}` : inv.clientName || 'Ext.'}</td>
                        <td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${inv.isExternal ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>{inv.isExternal ? 'Externe' : 'Consult.'}</span></td>
                        <td className="p-2 text-right font-mono font-bold">{formatAr(inv.patientCharge)}</td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => printSalfaIndividualInvoice(effectiveTicketSettings, inv, pat || undefined, comp)}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold cursor-pointer inline-flex items-center gap-1"
                            title="Imprimer Reçu / Facture A5"
                          >
                            <FileText className="w-3 h-3" /> Facture A5
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {hbRecords.filter(h => h.payments.some(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString())).map(h => { const tp = h.payments.filter(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString()).reduce((s,p) => s+p.amount,0); return (<tr key={h.id} className="border-b"><td className="p-2 font-mono">{h.payments.filter(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString()).map(p => new Date(p.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})).join(', ')}</td><td className="p-2">{h.patientName}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${h.type==='hospit'?'bg-rose-100 text-rose-700':'bg-blue-100 text-blue-700'}`}>{h.type==='hospit'?'Hosp.':'Bloc'}</span></td><td className="p-2 text-right font-mono font-bold">{formatAr(tp)}</td><td className="p-2 text-center text-slate-400">—</td></tr>); })}
                </tbody><tfoot className="bg-emerald-50"><tr><td colSpan={3} className="p-2 text-right font-bold">TOTAL:</td><td className="p-2 text-right font-mono font-bold text-lg">{formatAr(myGrandTotal)}</td><td></td></tr></tfoot></table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === AJOUTER PATIENT — fenêtre modale centrée === */}
      {hbModal === 'add_patient' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setHbModal('none')}>
          <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-300" onClick={(e) => e.stopPropagation()}>
          <div className={`px-4 py-3 flex justify-between items-center text-white sticky top-0 z-10 ${tab === 'hospit' ? 'bg-rose-600' : 'bg-blue-600'}`}><span className="font-bold"><UserPlus className="w-5 h-5 inline" /> Ajouter Patient — {tab === 'hospit' ? 'Hospitalisation' : 'Bloc'}</span><button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button></div>
          <div className="p-4 space-y-3">
            {/* Search existing */}
            <div><label className="block text-sm font-medium mb-1">Rechercher patient existant</label>
              <input type="text" value={hbPatSearch} onChange={e => setHbPatSearch(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="🔍 Nom, prénom ou dossier..." autoFocus />
              {hbPatFiltered.length > 0 && <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto">{hbPatFiltered.map(p => (<div key={p.id} onClick={() => hbSelectPatient(p.id)} className="p-2 hover:bg-blue-50 cursor-pointer text-sm flex justify-between border-b"><span className="font-medium">{p.lastName} {p.firstName}</span><span className="text-slate-400 text-xs">{p.dossier} | {p.clientType === 'societe' ? `🏢 ${p.company}` : '🏪 Comptoir'}</span></div>))}</div>}
            </div>
            <div className="border-t pt-3">
              <h4 className="font-bold text-sm mb-2">Ou créer un nouveau patient :</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-0.5">N° Dossier *</label>
                  <input type="text" value={hbNewPat.dossier} onChange={e => setHbNewPat({...hbNewPat, dossier: e.target.value.toUpperCase()})} className="w-full px-2 py-1.5 border rounded outline-none uppercase font-mono font-bold bg-white" placeholder="SAISIE MANUELLE — MAJUSCULES" />
                  <span className="text-[10px] text-slate-500">Clé unique, jamais incrémentée automatiquement.</span>
                </div>
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
                <div><label className="block font-bold text-slate-700 mb-0.5">Téléphone</label><PhoneInput value={hbNewPat.contact} onChange={v => setHbNewPat({...hbNewPat, contact: v})} className="w-full px-2 py-1.5 border rounded outline-none font-mono bg-white" placeholder="038 34 092 61" /></div>
                <div className="col-span-2"><label className="block font-bold text-slate-700 mb-0.5">Adresse</label><input type="text" value={hbNewPat.address} onChange={e => setHbNewPat({...hbNewPat, address: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">N° Sécurité Sociale</label><input type="text" value={hbNewPat.ssn} onChange={e => setHbNewPat({...hbNewPat, ssn: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none bg-white" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">Société</label><input type="text" value={hbNewPat.insureName} onChange={e => setHbNewPat({...hbNewPat, insureName: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" /></div>
                <div><label className="block font-bold text-slate-700 mb-0.5">Type Client</label><select value={hbNewPat.clientType} onChange={e => setHbNewPat({...hbNewPat, clientType: e.target.value as ClientType})} className="w-full px-2 py-1.5 border rounded outline-none cursor-pointer bg-white"><option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option></select></div>
                {hbNewPat.clientType === 'societe' && <div><label className="block font-bold text-slate-700 mb-0.5">Société</label><select value={hbNewPat.company} onChange={e => setHbNewPat({...hbNewPat, company: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none cursor-pointer bg-white"><option value="">— Sélectionner —</option>{state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}</select></div>}
                {hbNewPat.clientType === 'societe' && (
                  <div className="col-span-2 space-y-2">
                    <div className="flex gap-2">
                      <input type="text" value={hbNewCompanyName} onChange={e => setHbNewCompanyName(e.target.value.toUpperCase())} className="flex-1 px-2 py-1.5 border rounded outline-none uppercase bg-white" placeholder="Nouvelle société partenaire…" />
                      <button type="button" onClick={() => { const name = addPartnerCompany(hbNewCompanyName); if (name) { setHbNewPat({...hbNewPat, company: name}); setHbNewCompanyName(''); } }} className="px-2 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold cursor-pointer">+ Société</button>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-0.5">Sous-société</label>
                      <input type="text" value={hbNewPat.subCompany} onChange={e => setHbNewPat({...hbNewPat, subCompany: e.target.value.toUpperCase()})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-white" placeholder="Direction, Service..." />
                    </div>
                  </div>
                )}
              </div>
              <button onClick={hbAddNewPatient} className="mt-3 w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer flex items-center justify-center gap-2"><UserPlus className="w-4 h-4" /> Créer et ajouter</button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Prescription — fenêtre modale centrée (saisie Sage) */}
      {hbModal === 'add_article' && hbSelRecordId && (() => {
        const rec = hbRecords.find(r => r.id === hbSelRecordId);
        const recTotal = rec ? rec.lines.reduce((s, l) => s + hbLineAmt(l), 0) : 0;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={() => { if (rec && blockIfUnsavedDraftLine(hbArtForm, rec.lines, { entityLabel: 'l\'article' })) return; setHbModal('none'); }}>
          <div className="w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-300" onClick={(e) => e.stopPropagation()}>
            <div className="bg-emerald-600 px-4 py-3 flex justify-between items-center text-white sticky top-0 z-10">
              <span className="font-bold flex items-center gap-1">💊 Prescription (Saisie Sage) — {rec?.patientName} ({rec?.type === 'hospit' ? 'Hospitalisation' : 'Bloc'})</span>
              <button onClick={() => { if (rec && blockIfUnsavedDraftLine(hbArtForm, rec.lines, { entityLabel: 'l\'article' })) return; setHbModal('none'); }} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                <div className="text-xs font-bold text-indigo-900">🏢 Changement de société</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-0.5">Type</label>
                    <select value={hbEditClientType} onChange={e => setHbEditClientType(e.target.value as ClientType)} className="w-full px-2 py-1.5 border rounded bg-white cursor-pointer">
                      <option value="comptoir">Client Comptoir</option>
                      <option value="societe">Client Société</option>
                    </select>
                  </div>
                  {hbEditClientType === 'societe' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-0.5">Société</label>
                      <select value={hbEditCompany} onChange={e => setHbEditCompany(e.target.value)} className="w-full px-2 py-1.5 border rounded bg-white cursor-pointer">
                        <option value="">—</option>
                        {state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
                      </select>
                    </div>
                  )}
                </div>
                {hbEditClientType === 'societe' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex gap-1">
                      <input type="text" value={hbEditNewCompany} onChange={e => setHbEditNewCompany(e.target.value.toUpperCase())} className="flex-1 px-2 py-1.5 border rounded uppercase bg-white" placeholder="Ajouter une société…" />
                      <button type="button" onClick={() => { const name = addPartnerCompany(hbEditNewCompany); if (name) { setHbEditCompany(name); setHbEditNewCompany(''); } }} className="px-2 py-1.5 bg-indigo-600 text-white rounded font-bold">+</button>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-0.5">Sous-société</label>
                      <input type="text" value={hbEditSubCompany} onChange={e => setHbEditSubCompany(e.target.value.toUpperCase())} className="w-full px-2 py-1.5 border rounded uppercase bg-white" placeholder="Direction, service…" />
                    </div>
                  </div>
                )}
                <button type="button" onClick={hbSaveClientType} className="px-3 py-1.5 bg-indigo-700 text-white rounded text-xs font-bold">Enregistrer le type / société</button>
              </div>
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
                            const manages = managesStock(a);
                            const isOut = manages && a.stockPharmacie <= 0;
                            const isLow = manages && !isOut && a.stockPharmacie <= a.minStockPharmacie && !a.alertDisabledPharmacie;
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
                                  : manages
                                    ? <span className={`font-mono text-[10px] ${idx === hbArtIdx ? 'text-white/90' : isLow ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>Stock: {a.stockPharmacie}{isLow ? ' ⚠️' : ''}</span>
                                    : <span className={`font-mono text-[10px] ${idx === hbArtIdx ? 'text-white/80' : 'text-slate-400'}`} title="Famille non gérée en stock">stock: —</span>}
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
                        onChange={e => setHbArtForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 1 }))}
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
                        onChange={e => setHbArtForm(prev => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">P.U.</label>
                      <input
                        type="number"
                        value={hbArtForm.unitPrice}
                        onChange={e => setHbArtForm(prev => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
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
                            <td className="p-1 text-right">{formatNum(l.unitPrice)}</td>
                            <td className="p-1 text-right font-bold">{formatNum(hbLineAmt(l))}</td>
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
        </div>
        );
      })()}

      {/* Edit Client Type — fenêtre modale centrée */}
      {hbModal === 'edit_client' && hbSelRecordId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setHbModal('none')}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-blue-600 px-4 py-3 flex justify-between items-center text-white"><span className="font-bold"><Edit2 className="w-5 h-5 inline" /> Modifier Type Client</span><button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button></div>
            <div className="p-4 space-y-3">
              <div><label className="block text-sm font-medium mb-1">Type</label><select value={hbEditClientType} onChange={e => setHbEditClientType(e.target.value as ClientType)} className="w-full px-3 py-2 border rounded-lg outline-none cursor-pointer"><option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option></select></div>
              {hbEditClientType === 'societe' && <div><label className="block text-sm font-medium mb-1">Société</label><select value={hbEditCompany} onChange={e => setHbEditCompany(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none cursor-pointer"><option value="">—</option>{state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}</select></div>}
              <button onClick={hbSaveClientType} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Message Rectification Prescription */}
      {rectificationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
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

      {/* Modal Historique des paiements (Hospitalisation / Bloc) */}
      {hbHistoryId && (() => {
        const rec = hbRecords.find(r => r.id === hbHistoryId);
        if (!rec) return null;
        const totalFact = rec.lines.reduce((s, l) => s + hbLineAmt(l), 0);
        const totalPaid = rec.payments.reduce((s, p) => s + p.amount, 0);
        const titleColor = rec.type === 'hospit' ? 'bg-rose-600' : 'bg-blue-600';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col">
              <div className={`${titleColor} px-4 py-3 flex justify-between items-center text-white`}>
                <span className="font-bold text-sm">📜 Historique des paiements — {rec.patientName}</span>
                <button onClick={() => setHbHistoryId(null)} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-slate-50 rounded"><div className="text-slate-500">Facture</div><div className="font-mono font-bold text-slate-800">{formatAr(totalFact)}</div></div>
                  <div className="p-2 bg-green-50 rounded"><div className="text-slate-500">Reçu</div><div className="font-mono font-bold text-green-700">{formatAr(totalPaid)}</div></div>
                  <div className="p-2 bg-red-50 rounded"><div className="text-slate-500">Reste</div><div className="font-mono font-bold text-red-700">{formatAr(totalFact - totalPaid)}</div></div>
                </div>
                {rec.payments.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-6">Aucun paiement enregistré pour ce dossier.</p>
                ) : (
                  <div className="space-y-2 max-h-[55vh] overflow-y-auto">
                    {rec.payments.slice().reverse().map((p, i) => (
                      <div key={i} className="border rounded-lg p-3 bg-white shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-mono font-bold text-emerald-700">{formatAr(p.amount)}</span>
                          <span className="text-[10px] text-slate-400">{new Date(p.date).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1.5 flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.receivedBy === 'pharmacie' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {p.receivedBy === 'pharmacie' ? '🏥 Pharmacie' : '💵 Caisse'}
                          </span>
                          <span>Reçu par : <strong>{p.paidBy || '—'}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODALE — Facture du patient sélectionné dans la file d'attente de paiement */}
      {paymentModalOpen && selPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closePaymentModal}>
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-600 px-4 py-3 flex justify-between items-center text-white shrink-0">
              <span className="font-bold text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Facturation — {selPatient.lastName} {selPatient.firstName}
              </span>
              <button onClick={closePaymentModal} className="hover:bg-white/20 rounded p-1 cursor-pointer text-sm" title="Fermer">✕</button>
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-3 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-base text-slate-800 flex items-center gap-1.5 flex-wrap">
                      <span>{selPatient.lastName} {selPatient.firstName}</span>
                      <span className="font-mono">({selPatient.dossier})</span>
                      {selPatient.clientType === 'societe'
                        ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">🏢 {selPatient.company || 'Société'}{selPatient.subCompany ? ` / ${selPatient.subCompany}` : ''}</span>
                        : <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">🏪 Comptoir</span>}
                      <button
                        type="button"
                        onClick={() => setShowPayClientTypeEdit(v => !v)}
                        className="ml-0.5 p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded transition cursor-pointer"
                        title="Modifier le type de client / société"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </h3>
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

              {/* 🏢 Société / Type client — panneau repliable, ouvert via l'icône stylo du titre */}
              {showPayClientTypeEdit && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">🏢 Société / Type client
                  <button type="button" onClick={() => setShowPayClientTypeEdit(false)} className="ml-auto text-indigo-500 hover:text-indigo-800 cursor-pointer" title="Fermer">✕</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-0.5">Type</label>
                    <select value={payEditClientType} onChange={e => setPayEditClientType(e.target.value as ClientType)} className="w-full px-2 py-1.5 border rounded bg-white cursor-pointer">
                      <option value="comptoir">Client Comptoir</option>
                      <option value="societe">Client Société</option>
                    </select>
                  </div>
                  {payEditClientType === 'societe' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-0.5">Société</label>
                      <select value={payEditCompany} onChange={e => setPayEditCompany(e.target.value)} className="w-full px-2 py-1.5 border rounded bg-white cursor-pointer">
                        <option value="">— Sélectionner —</option>
                        {state.companies.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
                      </select>
                    </div>
                  )}
                </div>
                {payEditClientType === 'societe' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex gap-1">
                      <input type="text" value={payEditNewCompany} onChange={e => setPayEditNewCompany(e.target.value.toUpperCase())} className="flex-1 px-2 py-1.5 border rounded uppercase bg-white" placeholder="Nouvelle société…" />
                      <button type="button" onClick={() => { const name = addPartnerCompany(payEditNewCompany); if (name) { setPayEditCompany(name); setPayEditNewCompany(''); }}} className="px-2 py-1.5 bg-indigo-600 text-white rounded font-bold">+</button>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-0.5">Sous-société</label>
                      <input type="text" value={payEditSubCompany} onChange={e => setPayEditSubCompany(e.target.value.toUpperCase())} className="w-full px-2 py-1.5 border rounded uppercase bg-white" placeholder="Direction, service…" />
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={paySaveClientType} className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded text-xs font-bold cursor-pointer">Enregistrer type / société</button>
                  <button type="button" onClick={() => setShowPayClientTypeEdit(false)} className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded text-xs font-bold cursor-pointer">Annuler</button>
                </div>
              </div>
              )}

              {/* === LISTE DES PRESCRIPTIONS === */}
              <div className="border rounded-lg overflow-hidden mb-3">
                <div className="bg-slate-100 px-3 py-2 border-b font-bold text-sm text-slate-700 flex items-center gap-2">📋 Liste des prescriptions</div>
                <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b text-slate-600 sticky top-0">
                      <tr>
                        <th className="p-2 text-left min-w-[120px]">Article</th>
                        <th className="p-2 text-center w-8">Qté</th>
                        <th className="p-2 text-center w-8">Rem%</th>
                        <th className="p-2 text-right w-16">P.U.</th>
                        <th className="p-2 text-right w-20">Montant</th>
                        <th className="p-2 text-center w-16">Catégorie</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(() => {
                        const unpaidConsults = getConsults(selPatient.id);
                        // Medications
                        const medicationItems = unpaidConsults.flatMap(c => c.prescriptions.map(p => ({
                          description: p.articleName,
                          quantity: p.quantity,
                          discount: p.discount,
                          unitPrice: p.unitPrice,
                          amount: roundTo2(p.unitPrice * p.quantity * (1 - p.discount / 100)),
                          category: 'Médicament',
                          categoryColor: 'bg-cyan-100 text-cyan-700',
                          consultId: c.id,
                        })));
                        // Lab + Echo from pending invoices
                        const svcInvs = pendingServiceInvoices.filter(i => i.patientId === selPatient.id);
                        const serviceItems = svcInvs.flatMap(i => i.items.map(it => ({
                          description: it.description,
                          quantity: '',
                          discount: '',
                          unitPrice: '',
                          amount: it.amount,
                          category: it.category === 'lab' ? 'Analyse' : it.category === 'echo' ? 'Échographie' : it.category === 'consultation' ? 'Consultation' : 'Service',
                          categoryColor: it.category === 'lab' ? 'bg-teal-100 text-teal-700' : it.category === 'echo' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700',
                          consultId: i.id,
                        })));
                        const allItems = [...medicationItems, ...serviceItems];
                        if (allItems.length === 0) return <tr><td colSpan={6} className="p-4 text-center text-slate-400">Aucune prescription</td></tr>;
                        return allItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-sans">{item.description}</td>
                            <td className="p-2 text-center font-mono">{item.quantity || '—'}</td>
                            <td className="p-2 text-center font-mono">{item.discount ? `${item.discount}%` : '—'}</td>
                            <td className="p-2 text-right font-mono">{item.unitPrice ? formatNum(Number(item.unitPrice)) : '—'}</td>
                            <td className="p-2 text-right font-mono font-bold">{formatNum(item.amount)}</td>
                            <td className="p-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.categoryColor}`}>{item.category}</span></td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                    <tfoot className="bg-amber-50 border-t-2 border-amber-300">
                      <tr>
                        <td colSpan={4} className="p-2 text-right font-bold font-sans">TOTAL :</td>
                        <td colSpan={2} className="p-2 text-right font-mono font-bold text-amber-700 text-sm">{formatAr(getPendingAmount(selPatient))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {selPatient.clientType === 'societe' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl mb-3 flex items-start gap-2.5">
                  <Building2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900 leading-relaxed">
                    <strong>Client société{selPatient.company ? ` — ${selPatient.company}` : ''}.</strong>{' '}
                    Pas de règlement en espèces : la caisse valide le paiement en{' '}
                    <strong>CRÉDIT SOCIÉTÉ</strong> — le montant est porté au compte de la société et sera
                    réglé ultérieurement via le module « Facturation sociétés ».
                  </div>
                </div>
              )}
              <div className={`flex justify-between text-xl font-bold border-t-2 pt-2 mb-4 ${selPatient.clientType === 'societe' ? 'text-blue-800' : ''}`}>
                <span>{selPatient.clientType === 'societe' ? 'MONTANT À PORTER EN CRÉDIT SOCIÉTÉ' : 'À PAYER'}</span>
                <span className={`font-mono ${selPatient.clientType === 'societe' ? 'text-blue-600' : 'text-amber-600'}`}>{formatAr(getPendingAmount(selPatient))}</span>
              </div>
              {selPatient.clientType === 'societe' ? (
                <button onClick={handlePayment} className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 cursor-pointer shadow-lg flex items-center justify-center gap-2">
                  <Building2 className="w-5 h-5" /> Valider en Crédit Société {formatAr(getPendingAmount(selPatient))}
                </button>
              ) : (
                <button onClick={handlePayment} className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 cursor-pointer shadow-lg flex items-center justify-center gap-2">
                  <CreditCard className="w-5 h-5" /> {getPendingAmount(selPatient) > 0 ? `Encaisser ${formatAr(getPendingAmount(selPatient))}` : 'Valider le passage (0 Ar)'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        subText={confirmModalState.subText}
        confirmText={confirmModalState.confirmText}
        cancelText={confirmModalState.cancelText}
        type={confirmModalState.type}
        showCancel={confirmModalState.showCancel}
        onConfirm={confirmModalState.onConfirm}
        onCancel={() => setConfirmModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {printerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Printer className="w-5 h-5 text-amber-400" /> Configuration Imprimante & Reçus
              </div>
              <button
                onClick={() => setPrinterModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-500 leading-relaxed">
                Chaque caissier peut configurer sa propre imprimante et son format de ticket thermique (le réglage est mémorisé sur ce poste / navigateur pour votre compte).
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nom / Poste de l'imprimante</label>
                <input
                  type="text"
                  value={tempPrinterSettings.printerName}
                  onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, printerName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  placeholder="ex: Caisse 1 - Imprimante Thermique Bureau"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Format Papier Thermique</label>
                  <select
                    value={tempPrinterSettings.paperWidth}
                    onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, paperWidth: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium bg-white"
                  >
                    <option value={80}>80 mm (Standard POS)</option>
                    <option value={58}>58 mm (Étroit / Portable)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre d'exemplaires</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={tempPrinterSettings.copies}
                    onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, copies: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Titre du reçu / ticket</label>
                <input
                  type="text"
                  value={tempPrinterSettings.receiptTitle}
                  onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, receiptTitle: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  placeholder="ex: REÇU DE PAIEMENT"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Message de pied de page</label>
                <input
                  type="text"
                  value={tempPrinterSettings.footerMessage}
                  onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, footerMessage: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  placeholder="ex: Merci de votre visite !"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="autoPrintCheck"
                  checked={tempPrinterSettings.autoPrint}
                  onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, autoPrint: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                />
                <label htmlFor="autoPrintCheck" className="font-semibold text-slate-700 cursor-pointer">
                  Lancer l'impression silencieuse / automatique (si supporté)
                </label>
              </div>
            </div>
            <div className="bg-slate-50 px-5 py-3 border-t flex justify-end gap-2">
              <button
                onClick={() => setPrinterModalOpen(false)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setPrinterSettings(tempPrinterSettings);
                  try {
                    localStorage.setItem(`salfa_caisse_printer_${cashierId}`, JSON.stringify(tempPrinterSettings));
                  } catch (e) {}
                  setPrinterModalOpen(false);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
              >
                Enregistrer mes préférences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification rouge centrée : article bloqué en vente par la pharmacie ou en rupture de stock */}
      <AlerteArticleIndisponible
        alert={articleAlert}
        onClose={() => { setArticleAlert(null); setTimeout(() => extSearchRef.current?.focus(), 50); }}
      />

    </div>
  );
}
