/**
 * Fix build 2026-08-18: suppression du bloc JSX dupliqué après `); }` qui
 * provoquait `Expected identifier but found "/"` à 1998:13 (vite/esbuild).
 * Le composant se termine désormais proprement par `</div> ); }` — build OK (1843 modules).
 */
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Invoice, InvoiceItem, ClientType, LabRequest, EchoRequest, User, CashClosing, HbLine, HbRecord, Consultation, Prescription, Article, Patient } from '../types';
import type { AppState, FactureNumberAllocation, FactureNumberSpec } from '../store';
import type { PieceFileCaisse } from '../utils/caisseFileAttente';
import type { Societe } from '../modules/assurance/types';
import {
  addAuditLog, addNotification, formatAr, formatNum, roundTo2, getPrice, calculateAge,
  normalizeDossierNumber, isDossierTaken, addJourneyEvent, generatePharmaClosingNumber, purgePatientFromQueue,
  familyManagesStock, isLabFamily, isEchoFamily, isConsultFamily, allocateFactureNumber, allocateFactureNumberAsync, allocateFactureNumbersAsync, applySocieteUpsert, collectExistingFactureNumbers, companyIsBlocked, companyOptions, sousSocietesConnues,
  invoiceNatureRemise,
} from '../store';
import { CreditCard, ShoppingCart, Trash2, Lock, Printer, Building2, Heart, Save, UserPlus, Edit2, Plus, MessageCircle, Send, FileText, RefreshCw } from 'lucide-react';
import { SearchableSelect, optionsFromValues } from './SearchableSelect';
import { SuggestionInput, classerSuggestions, motsIdentite } from './SuggestionInput';
import { printPaymentTicket as openThermalTicket, printClosingTicket, printExamRequestTicket, printHbPaymentTicket, printPharmaDeliveryClosingTicket } from '../utils/printTicket';
import { hbLineAmt, hbReste } from '../utils/hbDossier';
import {
  baseCommuneCaisse, brutLigneDepuisItem, copayMetadata, estPieceTicketModerateur, repartirItemsCaisse, repartirLotCaisse, societeEtPersonneParmi, quotePartSiTicketModerateur,
  type RepartitionCopay,
} from '../utils/copayCaisse';
import {
  purgePieceFromQueue, piecesSelectionnees, prochaineSelection, medicamentsDejaSurFacture, clefArticle,
  separerOrdonnanceDeLaFacture,
} from '../utils/caisseFileAttente';
import { normaliserRecherche } from '../utils/recherche';
import { suggestionNavKeyDown } from '../utils/suggestionNav';
import { useFlashInfo, FlashInfoBanner } from './FlashInfo';
import { printSalfaIndividualInvoice } from '../utils/printSalfaInvoice';
import { getExamReceipts, type ExamReceipts } from '../utils/examReceipts';
import { blockIfUnsavedDraftLine } from '../utils/validation';
import MoneyInput from './MoneyInput';
import ConfirmModal from './ConfirmModal';
import AlerteArticleIndisponible from './AlerteArticleIndisponible';
import { PhoneInput } from './PhoneInput';
import type { ArticleAlertInfo } from './AlerteArticleIndisponible';
import { Select } from './Select';

/**
 * Clef interne d'une pièce « médicaments » du lot de caisse.
 * RÈGLE : la caisse ne fusionne JAMAIS les prescriptions en attente — les
 * médicaments d'UNE consultation (une prescription) forment une facture à part,
 * créée et numérotée au moment du paiement. Un patient qui revient (répétition)
 * garde donc autant de pièces que de prescriptions, chacune avec son numéro.
 */
const MEDS_PIECE_PREFIX = '__facture_medicaments__';
const medsPieceKey = (consultationId: string) => `${MEDS_PIECE_PREFIX}:${consultationId}`;

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
// du rôle Responsable Facturation (module Facturation).
type Tab = 'payment' | 'hospit' | 'bloc' | 'closing';
type HbModal = 'none' | 'add_patient' | 'add_article' | 'edit_client' | 'discharge';

type ReceiptKind = 'all' | 'payment' | 'exams';
interface ReceiptSnapshot {
  invoice: Invoice;
  patient?: Patient;
  cashier?: User;
  prescriber?: User;
  exams: ExamReceipts;
}


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
  const [lastReceipt, setLastReceipt] = useState<ReceiptSnapshot | null>(null);
  /** Pièces (factures) du dernier encaissement : un duplicata par pièce, jamais fusionnées. */
  const [lastReceiptPieces, setLastReceiptPieces] = useState<Invoice[]>([]);
  // Vente externe : médecin prescripteur (facultatif) — généralement un médecin
  // HORS de notre centre. La saisie assistée est alimentée d'abord par les
  // prescripteurs déjà saisis (base prescripteursExternes), puis par les
  // médecins de l'hôpital ; une valeur libre est acceptée. Le champ reste
  // rempli d'une vente à l'autre (plusieurs clients du même prescripteur).
  const [extPrescripteur, setExtPrescripteur] = useState('');
  const suggestionsPrescripteurs = useMemo(() => {
    const externes = state.prescripteursExternes || [];
    const deja = new Set(externes.map(n => (n || '').trim().toUpperCase()));
    return classerSuggestions(externes, v => deja.has(v.trim().toUpperCase()))
      .concat(classerSuggestions(state.users.filter(u => u.role === 'doctor').map(u => u.name))
        .filter(n => !deja.has(n.trim().toUpperCase())));
  }, [state.prescripteursExternes, state.users]);

  const prepareReceipts = (invoices: Invoice[], invoice: Invoice, exams = getExamReceipts(invoices, state.consultations, state.labRequests)): ReceiptSnapshot => {
    const consultation = state.consultations.find(c => invoices.some(i => i.consultationId === c.id && (!i.patientId || i.patientId === c.patientId)));
    const prescriber = state.users.find(u => u.id === (exams.prescriberId || consultation?.doctorId)) ||
      (consultation?.doctorName ? { id: consultation.doctorId, name: consultation.doctorName, role: 'doctor' as const } : undefined) ||
      // Vente externe (ex : analyses seules, sans consultation créée) : le nom saisi est conservé sur la facture.
      (invoice.prescriberName ? { id: 'EXTERNE', name: invoice.prescriberName, role: 'doctor' as const } : undefined);
    return {
      invoice, exams, prescriber,
      patient: state.patients.find(p => p.id === invoice.patientId),
      cashier: state.users.find(u => u.id === invoice.paidBy) || state.currentUser || undefined,
    };
  };

  // Aucun encaissement ni changement d'état métier ici : cette fonction sert
  // aussi aux duplicatas du dernier paiement et à ceux de la clôture du jour.
  const printReceipts = (receipt: ReceiptSnapshot, kind: ReceiptKind = 'all') => {
    const { invoice, patient, cashier, prescriber, exams } = receipt;
    const ticketPatient = patient || {
      ...EXT_CLIENT_PATIENT,
      dossier: invoice.isExternal ? 'CLIENT EXTERNE' : '—',
      lastName: invoice.clientName || (invoice.isExternal ? 'Client Externe' : 'Patient non renseigné'),
    };
    const date = new Date(invoice.paidAt || invoice.createdAt);
    if (kind === 'all' || kind === 'payment') {
      // Vente externe : seul le médecin prescripteur SAISI figure sur le ticket
      // (conservé sur la facture ; jamais le libellé « Vente Externe (…) »).
      const ticketPrescriber = invoice.isExternal ? invoice.prescriberName : undefined;
      openThermalTicket(effectiveTicketSettings, invoice, patient, cashier, undefined, {
        ...(ticketPrescriber ? { prescriberName: ticketPrescriber } : {}),
        // Remise société (quote-part du taux non encaissée) — affichée sur le ticket.
        ...(invoice.remiseNonEncaise ? { remise: invoice.remiseNonEncaise } : {}),
      });
    }
    // BON D'EXAMENS : UNE PRESCRIPTION = UN BON, un seul bloc (analyses ET
    // échographies réunies, sans découpage par famille), portant le numéro de la
    // facture de cette prescription.
    if ((kind === 'all' || kind === 'exams') && (exams.labLines.length || exams.echoLines.length)) {
      printExamRequestTicket(
        effectiveTicketSettings, ticketPatient, prescriber, date,
        [...exams.labLines, ...exams.echoLines],
        invoice.numeroFacture,
      );
    }
    // La file partagée attend afterprint avant le document / l'exemplaire suivant.
  };

  /**
   * Duplicatas d'un encaissement : UN DOCUMENT PAR PIÈCE — les prescriptions en
   * attente ne sont JAMAIS fusionnées (même au nom de la même personne), chacune
   * garde son numéro ; les bons d'examen restent portés une seule fois pour le lot.
   */
  const receiptButtons = (getReceipts: () => ReceiptSnapshot[], hasLab: boolean, hasEcho: boolean) => (
    <div className="flex flex-wrap gap-1.5">
      {([['payment', 'Reçu', true], ['exams', "Bon d'examens", hasLab || hasEcho]] as const)
        .filter(([, , visible]) => visible)
        .map(([kind, label]) => (
          <button key={kind} type="button" onClick={() => {
            const receipts = getReceipts();
            if (kind === 'payment') { receipts.forEach(r => printReceipts(r, 'payment')); return; }
            // BON D'EXAMENS : UN par prescription (analyses et échographies dans un
            // seul bloc, avec le numéro de la facture) — jamais découpé par famille.
            receipts.forEach(r => printReceipts(r, 'exams'));
          }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-surface border border-line-strong rounded-lg text-xs font-semibold text-ink hover:bg-surface-hover hover:text-accent cursor-pointer"
            title={`Réimprimer : ${label.toLowerCase()} (sans nouveau paiement)`}>
            <Printer className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
    </div>
  );

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

  /** Numéro de facture officiel d'un nouveau dossier hospit/bloc :
   *  AAFAMMJJ + ordre du jour (26FA0917001), sans distinction société /
   *  comptoir / externe (le format FA-MM/CODE est réservé à la facture
   *  GLOBALE mensuelle du module Facturation).
   *  Réservé atomiquement : JETTE une erreur si la numérotation échoue. */
  const hbNumeroFacture = async (clientType: ClientType, company?: string): Promise<string> => {
    const allocated = await allocateFactureNumberAsync(state, {
      clientType,
      company,
      invoiceDate: new Date().toISOString(),
      prescriptionDate: new Date().toISOString(),
    });
    if (allocated.societeUpsert) {
      const upsert = allocated.societeUpsert;
      setState(prev => applySocieteUpsert(prev, upsert));
    }
    return allocated.numeroFacture;
  };
  const [hbSelRecordId, setHbSelRecordId] = useState<string | null>(null);
  // 💡 Saisie du montant INDÉPENDANTE par dossier (chaque patient a sa propre saisie)
  const [hbPayAmounts, setHbPayAmounts] = useState<Record<string, number>>({});
  // 💡 Historique des paiements (affiché via un bouton dédié)
  const [hbHistoryId, setHbHistoryId] = useState<string | null>(null);
  const [hbModal, setHbModal] = useState<HbModal>('none');
  // Sorties : seules les personnes encore hospitalisées / au bloc sont listées par défaut.
  const [hbShowDischarged, setHbShowDischarged] = useState(false);
  const [hbDischargeMotif, setHbDischargeMotif] = useState('');
  const [hbDischargeDonneur, setHbDischargeDonneur] = useState('');

  // HB Modal: patient search/add (ALL fields like reception)
  const [hbPatSearch, setHbPatSearch] = useState('');
  const [hbPatIdx, setHbPatIdx] = useState(0);
  const [hbNewPat, setHbNewPat] = useState({ dossier: '', lastName: '', firstName: '', dateOfBirth: '', gender: 'M' as 'M'|'F', contact: '', address: '', matricule: '', ssn: '', insureName: '', clientType: 'comptoir' as ClientType, company: '', subCompany: '' });

  // Saisie assistée du nouveau patient : valeurs déjà connues dans la base
  // (appariement : noms/prénoms déjà portés ensemble passent en tête).
  const suggestionsDossiers = useMemo(() => classerSuggestions(state.patients.map(p => p.dossier)), [state.patients]);
  // Assistance identité : chaque mot du Nom / Prénom est complété à partir des
  // mots connus de la base (noms ET prénoms confondus). Appariement : les mots
  // déjà portés avec ce qui est saisi passent en tête (RAVELO → AINA, NAINA → RAZAFY).
  const apparieIdentite = useCallback((mot: string) => {
    const M = mot.trim().toUpperCase();
    const saisis = new Set([...motsIdentite(hbNewPat.lastName), ...motsIdentite(hbNewPat.firstName)]);
    if (!M || saisis.size === 0) return false;
    return state.patients.some(p => {
      const identite = [...motsIdentite(p.lastName), ...motsIdentite(p.firstName)];
      return identite.includes(M) && identite.some(m => m !== M && saisis.has(m));
    });
  }, [state.patients, hbNewPat.lastName, hbNewPat.firstName]);
  const suggestionsIdentite = useMemo(() => classerSuggestions(
    state.patients.flatMap(p => [p.lastName, p.firstName]), apparieIdentite,
  ), [state.patients, apparieIdentite]);
  const suggestionsAdresses = useMemo(() => classerSuggestions(state.patients.map(p => p.address)), [state.patients]);
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

  // Factures en attente (consultation, labo, écho) — sociétés incluses.
  // `...Sur(etat)` : calculateurs paramétrés par l'état, afin d'interroger la file
  // sur un état EN COURS de construction (après un retrait de pièce ou un
  // encaissement PARTIEL du dossier) et pas seulement sur `state`.
  const pendingServiceInvoicesSur = (s: AppState) => s.invoices.filter((i) => {
    if (i.status !== 'pending') return false;
    return i.items.some((it) => it.category === 'lab' || it.category === 'echo' || it.category === 'consultation');
  });
  const pendingServiceInvoices = pendingServiceInvoicesSur(state);

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
  const consultationPharmacyPaidSur = (s: AppState, c: { id: string; patientId?: string; date?: string }) => {
    const pid = c.patientId;
    if (!pid) return false;
    if (s.invoices.some(inv =>
      inv.patientId === pid && inv.status === 'paid' && inv.consultationId === c.id &&
      inv.items.some(it => it.category === 'pharmacy'))) return true;
    if ((s.ventes || []).some(v =>
      v.patientId === pid && v.status === 'paid' && v.consultationId === c.id &&
      (s.venteLines || []).some(l => l.venteId === v.id && l.category === 'pharmacy'))) return true;
    const cDay = (c.date || '').slice(0, 10);
    return s.invoices.some(inv =>
      inv.patientId === pid && inv.status === 'paid' && !inv.consultationId &&
      inv.items.some(it => it.category === 'pharmacy') &&
      (inv.createdAt || inv.paidAt || '').slice(0, 10) === cDay);
  };
  /**
   * Une consultation doit-elle ENCORE être facturée en caisse ? Non quand ses
   * médicaments sont déjà réglés, ni quand la pièce « médicaments » a été
   * RETIRÉE INDIVIDUELLEMENT de la file (`facturationRetiree`) : l'ordonnance
   * reste au dossier médical et à la pharmacie, elle ne remonte plus au guichet.
   */
  const consultationFacturableSur = (s: AppState, c: Consultation) =>
    !c.facturationRetiree && !consultationPharmacyPaidSur(s, c);

  /**
   * Lignes « médicaments » d'une liste de consultations : MÊMES arrondis que le
   * traitement du paiement (prix unitaire remisé, puis montant de la ligne).
   * Sert à la file d'attente, à l'aperçu de la modale et au paiement lui-même —
   * le ticket modérateur affiché est donc toujours celui qui sera encaissé.
   */
  const medicationItemsOf = (consults: Consultation[], clientType?: ClientType): InvoiceItem[] =>
    (consults || []).flatMap(c => c.prescriptions.map(p => {
      // Pour client comptoir : la remise est une réduction commerciale qui diminue le prix unitaire.
      // Pour client société : le prix unitaire est le prix brut conventionné ; la quote-part patient
      // (remise centre ou ticket modérateur) vs crédit société est calculée au niveau de repartirItemsCaisse.
      // Pour client externe : jamais de remise.
      const isComptoir = clientType === 'comptoir';
      const unitaire = (isComptoir && p.discount > 0) ? roundTo2(p.unitPrice * (1 - p.discount / 100)) : p.unitPrice;
      return {
        code: p.articleId || 'MEDIC',
        description: p.articleName, quantity: p.quantity, unitPrice: unitaire,
        amount: roundTo2(unitaire * p.quantity), category: 'pharmacy' as const,
        discount: p.discount || 0,
      };
    }));

  // Sociétés / assurés de la base commune (dérivés de la base Réception) :
  // calculés une seule fois par rendu, la file d'attente les interroge par patient.
  const baseCommune = useMemo(
    () => baseCommuneCaisse(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.companies, state.patients, state.assuranceSocietes, state.assurancePersonnes],
  );

  /**
   * BRUT d'une pièce : somme des prix conventionnés AVANT la remise du médecin
   * (le ticket modérateur n'y est donc pas déduit).
   */
  const brutPiece = (items: InvoiceItem[]) =>
    roundTo2((items || []).reduce((s, it) => s + brutLigneDepuisItem(it), 0));

  /**
   * Montant PORTÉ AU CRÉDIT DE LA SOCIÉTÉ pour une pièce : sa part répartie, et
   * à défaut le BRUT de la pièce — jamais le `patientCharge` enregistré, qui
   * peut être 0 sur une pièce société (rien n'est alors dû par le patient).
   */
  const creditPiece = (items: InvoiceItem[], rep?: RepartitionCopay) =>
    rep ? roundTo2(rep.partSociete) : brutPiece(items);

  /**
   * Montant en attente d'un dossier.
   *  - client SOCIÉTÉ : BRUT conventionné (tarif AVANT la remise du médecin, qui
   *    est le ticket modérateur) — même base que « Total prestations » et que le
   *    partage société / patient affiché à côté ;
   *  - comptoir / externe : net à encaisser (la remise est une réduction
   *    commerciale appliquée au prix).
   */
  const getPendingAmount = (p: any) => {
    const societeClient = p.clientType === 'societe';
    const cons = state.consultations.filter(c => c.patientId === p.id && consultationFacturableSur(state, c));
    let amt = cons.reduce((s, c) => s + c.prescriptions.reduce((ss, pr) => {
      const u = (p.clientType === 'comptoir' && (pr.discount || 0) > 0)
        ? roundTo2((pr.unitPrice || 0) * (1 - (pr.discount || 0) / 100))
        : (pr.unitPrice || 0);
      return ss + roundTo2(u * (pr.quantity || 0));
    }, 0), 0);
    const svcInvs = pendingServiceInvoices.filter(i => i.patientId === p.id);
    amt += svcInvs.reduce((s, i) => s + (societeClient
      // Prix « avec ticket » : le brut se relit dans le prix unitaire de la
      // ligne (le montant enregistré est déjà remisé).
      ? i.items.reduce((ss, it) => ss + brutLigneDepuisItem(it), 0)
      : i.totalAmount), 0);
    return amt;
  };
  // Consultations dont les médicaments ne sont pas encore encaissés (ni retirés
  // de la file pièce par pièce) — paramétré par l'état pour être évalué sur un
  // état en cours de construction.
  const getConsultsSur = (s: AppState, pid: string) => s.consultations.filter(c =>
    c.patientId === pid &&
    c.prescriptions.length > 0 &&
    consultationFacturableSur(s, c)
  );
  const getConsults = (pid: string) => getConsultsSur(state, pid);
  /**
   * Quote-part (TICKET MODÉRATEUR) à encaisser en espèces : 0 Ar pour un client
   * comptoir/externe, pour une société dont la réduction est une vraie REMISE ou
   * dont la prise en charge est de 100 %. `items` permet de la calculer SUR UNE
   * SEULE PIÈCE (une ligne de la file) plutôt que sur le dossier entier.
   */
  const getCopayAmount = (p: any, items?: InvoiceItem[]): number => {
    if (!p || p.clientType !== 'societe') return 0;
    const lignes: InvoiceItem[] = items ?? [
      ...medicationItemsOf(getConsults(p.id), p.clientType),
      ...pendingServiceInvoices.filter(i => i.patientId === p.id).flatMap(i => i.items),
    ];
    if (!lignes.length) return 0;
    const { societe, personne } = societeEtPersonneParmi(p, baseCommune.societes, baseCommune.personnes);
    const repartition = repartirItemsCaisse({ societe, personne, items: lignes });
    return repartition.aEncaisser ? roundTo2(repartition.ticketModerateur) : 0;
  };

  /**
   * PIÈCES DU DOSSIER — une pièce par prescription, JAMAIS FUSIONNÉES :
   *  1. chaque facture service en attente (analyses / échographies / consultation) ;
   *  2. les médicaments d'UNE consultation : une pièce par prescription. Une
   *     facture « globale » qui les mélangeait (consultation + médicaments +
   *     analyses) en est DÉCOUPÉE : chaque prescription garde sa ligne, facturable
   *     et retirable SEULE — et un article n'est jamais compté deux fois ;
   *  3. les anciennes factures pharmacie restées en attente (une pièce chacune).
   * Sert à la file d'attente, à l'aperçu de la modale ET à la validation du
   * paiement. Chaque pièce est INDÉPENDANTE : on peut en encaisser une seule, en
   * retirer une seule, et les autres restent au guichet avec leur numéro.
   */
  const pendingPiecesOf = (s: AppState, patient: Patient, consults: Consultation[]) => {
    const services = pendingServiceInvoicesSur(s)
      .filter(i => i.patientId === patient.id)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const pharmacieLegacy = [...s.invoices]
      .filter(i => i.patientId === patient.id && i.status === 'pending'
        && i.items.length > 0 && i.items.every(it => it.category === 'pharmacy'))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    /** Toutes les lignes de l'ordonnance d'une consultation (mêmes déjà réglées). */
    const lignesOrdonnance = (c: Consultation) => medicationItemsOf([c], patient.clientType);

    const consultIdsHandled = new Set<string>();
    const pieces: {
      key: string;
      invoiceId?: string;
      invoiceIds?: string[];
      consultationId?: string;
      numero?: string;
      date?: string;
      items: InvoiceItem[];
      scindee: boolean;
    }[] = [];

    // 1. Regroupement par consultation : tous les actes et prescriptions d'une même consultation
    // (ordonnance médicaments, analyses labo, échographies) fusionnent en UNE SEULE pièce de caisse.
    for (const c of consults) {
      consultIdsHandled.add(c.id);
      if (c.facturationRetiree) continue;

      // Factures en attente rattachées à cette consultation (créées en bloc ou séparément)
      const invs = services.filter(i => i.consultationId === c.id);

      // Médicaments déjà réglés sur une facture payée de cette consultation
      const regles = medicamentsDejaSurFacture(s.invoices.filter(i => i.status === 'paid'), c);

      // Articles déjà présents sur les factures en attente de la consultation
      const dejaSurInvs = new Set(invs.flatMap(i => i.items.map(it => clefArticle(it.description))));

      // Médicaments de l'ordonnance restant à facturer
      const medsNonFactures = lignesOrdonnance(c).filter(
        it => !regles.has(clefArticle(it.description)) && !dejaSurInvs.has(clefArticle(it.description))
      );

      const allItems = [...invs.flatMap(i => i.items), ...medsNonFactures];
      if (allItems.length === 0) continue;

      const primaryInv = invs[0];
      const allInvIds = invs.map(i => i.id);

      pieces.push({
        key: primaryInv?.id || medsPieceKey(c.id),
        invoiceId: (invs.length === 1 && medsNonFactures.length === 0) ? primaryInv.id : undefined,
        invoiceIds: allInvIds,
        consultationId: c.id,
        numero: invs.find(i => i.numeroFacture)?.numeroFacture || undefined,
        date: primaryInv?.createdAt || c.date,
        items: allItems,
        scindee: false,
      });
    }

    // 2. Factures de services sans consultation rattachée (ex: actes externes isolés)
    for (const inv of services) {
      if (inv.consultationId && consultIdsHandled.has(inv.consultationId)) continue;
      pieces.push({
        key: inv.id,
        invoiceId: inv.id,
        invoiceIds: [inv.id],
        consultationId: inv.consultationId,
        numero: inv.numeroFacture || undefined,
        date: inv.createdAt,
        items: inv.items,
        scindee: false,
      });
    }

    // 3. Anciennes factures pharmacie sans consultation rattachée
    for (const f of pharmacieLegacy) {
      if (f.consultationId && consultIdsHandled.has(f.consultationId)) continue;
      pieces.push({
        key: f.id,
        invoiceId: f.id,
        invoiceIds: [f.id],
        consultationId: f.consultationId,
        numero: f.numeroFacture || undefined,
        date: f.createdAt,
        items: f.items,
        scindee: false,
      });
    }
    // ORDRE CHRONOLOGIQUE : les prescriptions d'un dossier se suivent par DATE
    // (la plus ancienne d'abord). AUCUNE classification par famille : chaque
    // pièce est présentée comme UNE prescription, identifiée par sa date et son
    // numéro (ou « en attente (sans numéro) »), jamais par « Analyses »,
    // « Échographies » ou « Médicaments ».
    const chronologique = [...pieces].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return (da || 0) - (db || 0);
    });
    /**
     * RÉSUMÉ DU CONTENU d'une prescription (les articles qu'elle porte) : sert à
     * IDENTIFIER chaque pièce. Sans lui, deux prescriptions du même jour
     * s'afficheraient à l'identique (« Prescription du 16/09/2026 — en attente
     * (sans numéro) » deux fois) — ce qu'il ne faut JAMAIS montrer : chaque
     * prescription reste séparée, avec son propre contenu, son propre montant et
     * son propre numéro.
     */
    const resumeDe = (items: typeof pieces[number]['items']) => {
      const noms = [...new Set(items.map(it => (it.description || '').trim()).filter(Boolean))];
      if (!noms.length) return '';
      const tete = noms.slice(0, 2).join(', ');
      return noms.length > 2 ? `${tete} +${noms.length - 2}` : tete;
    };
    return chronologique.map(p => ({
      ...p,
      label: p.date
        ? `Prescription du ${new Date(p.date).toLocaleDateString('fr-FR')}`
        : 'Prescription',
      resume: resumeDe(p.items),
    }));
  };

  /**
   * FILE D'ATTENTE — UNE LIGNE PAR PRESCRIPTION, NOM RÉPÉTÉ.
   * Chaque prescription en attente occupe SA PROPRE ligne (le nom du patient se
   * répète donc autant de fois qu'il a de prescriptions en attente), avec SON
   * montant et SON numéro. Deux prescriptions du même jour ne sont jamais
   * confondues : chacune affiche son contenu et son numéro (ou « en attente
   * (sans numéro) »). Aucune séparation par famille.
   * Classement par date (le plus récent en haut).
   */
  // RÈGLE : TOUS les patients validés par un médecin arrivent à la caisse pour
  // validation du paiement, y compris les clients société. Les clients société
  // ne paient PAS en espèces : la caisse valide un CRÉDIT SOCIÉTÉ (la somme est
  // portée au compte de la société, réglée ultérieurement par le responsable
  // facturation). Les factures crédit société sont exclues des encaissements et
  // des clôtures de caisse.
  // Ordre décroissant : le dernier arrivé / dernière saisie en haut de la file.
  const pendingPatients = state.patients
    .filter(p =>
      p.status === 'consulted_awaiting_payment' ||
      // Toute facture en attente (y compris les médicaments) : un dossier réglé
      // PARTIELLEMENT (une prescription encaissée, l'autre non) doit rester dans
      // la file pour la facture restante.
      state.invoices.some(i => i.patientId === p.id && i.status === 'pending' && i.items.length > 0) ||
      // TROISIÈME MOTIF, celui qui garde les lignes INDÉPENDANTES : tant qu'il
      // reste une ordonnance à facturer, le dossier reste au guichet — encaisser
      // ou retirer une ligne voisine (même la dernière facture en attente) ne
      // doit JAMAIS faire disparaître les autres prescriptions de la personne.
      state.consultations.some(c => c.patientId === p.id && (c.prescriptions?.length || 0) > 0
        && !c.facturationRetiree && !consultationPharmacyPaidSur(state, c))
    )
    .sort((a, b) => {
      const da = new Date((a.lastVisitAt || a.registeredAt || 0) as string | number).getTime() || 0;
      const db = new Date((b.lastVisitAt || b.registeredAt || 0) as string | number).getTime() || 0;
      return db - da;
    });

  const fileAttente = useMemo(() => {
    type Entree = { patient: Patient; piece: ReturnType<typeof pendingPiecesOf>[number] | null; date?: string | number };
    const entrees: Entree[] = pendingPatients.flatMap((p): Entree[] => {
      const pieces = pendingPiecesOf(state, p, getConsults(p.id));
      if (!pieces.length) return [{ patient: p, piece: null, date: p.lastVisitAt || p.registeredAt }];
      return pieces.map((piece): Entree => ({ patient: p, piece, date: piece.date }));
    });
    return entrees.sort((a, b) => (Date.parse(String(b.date || '')) || 0) - (Date.parse(String(a.date || '')) || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPatients, state.consultations, state.invoices]);

  const selConsult = state.consultations.find(c => c.id === selConsultId);
  const selPatient = state.patients.find(p => p.id === (selPatientId || selConsult?.patientId)) || null;

  /** Toutes les pièces (factures) en attente du dossier sélectionné. */
  const piecesEnAttente = useMemo(
    () => (selPatient ? pendingPiecesOf(state, selPatient, getConsults(selPatient.id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selPatientId, state.consultations, state.invoices],
  );

  /**
   * PIÈCES SÉLECTIONNÉES pour la facturation. La caisse facture CHAQUE
   * prescription INDÉPENDAMMENT :
   *  - ouverte depuis une ligne « Facturer » de la file → cette seule pièce ;
   *  - ouverte depuis la ligne du dossier → `null`, c'est-à-dire TOUTES les
   *    pièces (encaissement groupé, une facture et un numéro PAR prescription) ;
   *  - les cases de la liste ajoutent ou retirent une pièce du lot.
   * `[]` (rien) et `null` (tout) sont DISTINCTS : décocher toutes les cases
   * laisse le lot vide, la validation refuse alors d'encaisser.
   */
  const [selPieceKeys, setSelPieceKeys] = useState<string[] | null>(null);
  const piecesPayees = useMemo(
    () => piecesSelectionnees(piecesEnAttente, selPieceKeys),
    [selPieceKeys, piecesEnAttente],
  );
  /** Le dossier compte-t-il plus d'une pièce ? (sinon, pas de cases à cocher) */
  const lotSelectionnable = piecesEnAttente.length > 1;
  /** Net à encaisser des pièces SÉLECTIONNÉES (comptoir) — jamais le cumul du dossier. */
  const montantSelection = roundTo2(
    piecesPayees.reduce((s, piece) => s + piece.items.reduce((ss, it) => ss + (Number(it.amount) || 0), 0), 0),
  );

  /** Cocher / décocher UNE pièce du lot de facturation. */
  const basculerPiece = (clef: string) =>
    setSelPieceKeys(prochaineSelection(piecesEnAttente.map(p => p.key), selPieceKeys, clef));
  /** « Tout le dossier » : les pièces restent séparées, une facture chacune. */
  const cocherToutLeDossier = (tout: boolean) => setSelPieceKeys(tout ? null : []);

  /**
   * TICKET MODÉRATEUR du dossier sélectionné (client société).
   * La quote-part de l'assuré — différence entre le brut et la part prise en
   * charge par la société (taux contractuel + exclusions) — se règle EN ESPÈCES
   * à la caisse. Elle est nulle quand la réduction de la société est une vraie
   * REMISE, quand la prise en charge est de 100 %, ou quand il n'y a rien à
   * facturer. Même calcul que la facturation société (`repartirPrestation`).
   */
  const copayPreview = useMemo<RepartitionCopay | null>(() => {
    if (!selPatient || selPatient.clientType !== 'societe') return null;
    // Répartition des pièces COCHÉES uniquement : encaisser une seule
    // prescription ne doit pas réclamer la quote-part des autres.
    const items: InvoiceItem[] = piecesPayees.flatMap(piece => piece.items);
    if (!items.length) return null;
    const { societe, personne } = societeEtPersonneParmi(selPatient, baseCommune.societes, baseCommune.personnes);
    return repartirItemsCaisse({ societe, personne, items });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selPatientId, piecesPayees, baseCommune]);

  // État de surchage manuelle du ticket modérateur par l'opérateur de caisse
  const [customTicketModerateur, setCustomTicketModerateur] = useState<number | null>(null);

  /** Montant du ticket modérateur indicatif calculé par défaut (taux standard ou contrat) */
  const defaultCopayDu = copayPreview?.aEncaisser ? roundTo2(copayPreview.ticketModerateur) : 0;

  /** Montant effectif du ticket modérateur (autorisé à être augmenté ou diminué librement par l'opérateur) */
  const isCustomCopay = customTicketModerateur !== null;
  const copayDu = isCustomCopay
    ? roundTo2(Math.max(0, Math.min(copayPreview?.brut || 0, customTicketModerateur)))
    : defaultCopayDu;

  /**
   * Part prise en charge par la société (Crédit société) calculée dynamiquement.
   * Sans répartition (rien de sélectionné, dossier sans facture), on retombe sur
   * le lot SÉLECTIONNÉ — jamais le cumul du dossier : les lignes non cochées ne
   * sont ni encaissées, ni créditées.
   */
  const partSocieteEffective = copayPreview
    ? roundTo2(Math.max(0, (copayPreview.brut || 0) - copayDu))
    : montantSelection;

  // Espèces reçues pour le ticket modérateur : pré-remplies au montant dû.
  const [copayCash, setCopayCash] = useState('');
  useEffect(() => {
    setCopayCash(copayDu > 0 ? String(copayDu) : '');
  }, [copayDu, selPatientId]);
  const copayEspeces = roundTo2(Number(copayCash) || 0);
  const copayManquant = copayDu > 0 ? Math.max(0, roundTo2(copayDu - copayEspeces)) : 0;
  const copayMonnaie = copayDu > 0 ? Math.max(0, roundTo2(copayEspeces - copayDu)) : 0;

  /**
   * Récapitulatif PAR FAMILLE d'articles — remplace l'ancien tableau Pièce/Brut/Ticket mod.
   * Groupement par famille catalogue (MEDIC, LABO, ECHO, CONSULT, etc.) avec totaux brut,
   * ticket modérateur / remise et part société. Utilisé pour l'affichage dans la modale
   * de facturation (demande : supprimer le tableau par pièce et remettre le recap par famille).
   */
  const recapParFamille = useMemo(() => {
    if (!selPatient) return null;
    const pieces = piecesPayees;
    if (pieces.length === 0) return null;
    const { societe, personne } = selPatient.clientType === 'societe'
      ? societeEtPersonneParmi(selPatient, baseCommune.societes, baseCommune.personnes)
      : { societe: undefined, personne: undefined };

    // Résolution de la famille d'un article à partir de son nom / catégorie
    const resolveFamily = (item: InvoiceItem): string => {
      const raw = (item.description || '').trim();
      const baseName = raw.split('×')[0].trim();
      const norm = (s: string) => normaliserRecherche(s);
      const normBase = norm(baseName);
      const normRaw = norm(raw);
      let art = state.articles.find(a => norm(a.name) === normBase || norm(a.name) === normRaw);
      if (!art) {
        art = state.articles.find(a => {
          const n = norm(a.name);
          return n && (normBase.includes(n) || n.includes(normBase) || normRaw.includes(n) || n.includes(normRaw));
        });
      }
      if (!art && (item as any).code) {
        const c = norm((item as any).code);
        art = state.articles.find(a => norm(a.code || '') === c || norm(a.id) === c);
      }
      if (art?.family) return art.family.trim().toUpperCase();
      const catMap: Record<string, string> = { lab: 'LABO', echo: 'ECHO', pharmacy: 'MEDIC', consultation: 'CONSULT', surgery: 'CHIR', hospitalization: 'HOSP', bloc: 'BLOC', externe: 'EXTERNE' };
      return catMap[item.category] || 'AUTRE';
    };

    const groups = new Map<string, { items: InvoiceItem[]; brut: number }>();
    for (const piece of pieces) {
      for (const it of piece.items) {
        const fam = resolveFamily(it);
        const cur = groups.get(fam) || { items: [], brut: 0 };
        cur.items.push(it);
        cur.brut += brutLigneDepuisItem(it);
        groups.set(fam, cur);
      }
    }

    const parFamille = Array.from(groups.entries()).map(([famille, g]) => {
      const brut = roundTo2(g.brut);
      let ticket = 0;
      let remise = 0;
      let partSoc = brut;
      let nature: 'ticket_moderateur' | 'remise' = 'ticket_moderateur';
      if (selPatient.clientType === 'societe') {
        const rep = repartirItemsCaisse({ societe, personne, items: g.items });
        ticket = roundTo2(rep.ticketModerateur);
        partSoc = roundTo2(rep.partSociete);
        nature = rep.nature as any;
        if (nature === 'remise') {
          remise = roundTo2(quotePartSiTicketModerateur({ societe, personne, items: g.items }));
          ticket = 0;
        }
      }
      return { famille, brut, ticket, remise, partSoc, nature, count: g.items.length };
    });

    parFamille.sort((a, b) => a.famille.localeCompare(b.famille));

    const totalBrut = roundTo2(parFamille.reduce((s, f) => s + f.brut, 0));
    const totalTicket = roundTo2(parFamille.reduce((s, f) => s + f.ticket, 0));
    const totalRemise = roundTo2(parFamille.reduce((s, f) => s + f.remise, 0));
    const totalPartSoc = roundTo2(parFamille.reduce((s, f) => s + f.partSoc, 0));
    const natureGlobale = parFamille.find(f => f.nature === 'ticket_moderateur')?.nature || parFamille[0]?.nature || 'ticket_moderateur';
    const hasRemise = parFamille.some(f => f.nature === 'remise' && f.remise > 0);
    const hasTicket = parFamille.some(f => f.ticket > 0);

    return { parFamille, totalBrut, totalTicket, totalRemise, totalPartSoc, natureGlobale, hasRemise, hasTicket, societe: societe || null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selPatientId, piecesPayees, state.articles, baseCommune]);

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

  // Blocage de validation non bloquant : info ~2 s puis reprise de saisie.
  const { message: flashMsg, flash } = useFlashInfo();
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

  /** Une ligne de la file = une pièce (une prescription) du dossier. */
  type PieceFile = ReturnType<typeof pendingPiecesOf>[number];
  /** Descripteur de pièce compris par `purgePieceFromQueue` (facture émise ou ordonnance). */
  const descripteurPiece = (piece: PieceFile): PieceFileCaisse | null =>
    piece.consultationId
      ? { kind: 'consultation', consultationId: piece.consultationId, invoiceIds: piece.invoiceIds }
      : (piece.invoiceId ? { kind: 'facture', invoiceId: piece.invoiceId } : null);
  /** Libellé lisible d'une pièce : date + contenu + numéro (jamais la famille). */
  const libellePiece = (piece: { label: string; resume?: string; numero?: string }) =>
    `${piece.label}${piece.resume ? ` — ${piece.resume}` : ''}${piece.numero ? ` · n° ${piece.numero}` : ' · en attente (sans numéro)'}`;

  /**
   * RETRAIT D'UNE SEULE LIGNE de la file : la prescription visée sort du guichet,
   * les autres lignes du MÊME patient restent facturables et encaissables
   * chacune de leur côté. Rien n'est détruit :
   *  - pièce « médicaments » : l'ordonnance reste au dossier médical et à la
   *    pharmacie, elle n'est simplement plus présentable à la caisse ;
   *  - pièce « facture » (analyses / échographies / ancienne facture pharmacie
   *    non encaissée) : la facture en attente est annulée, accompagnée des
   *    demandes d'examens de CETTE facture qui n'ont jamais été réalisées ;
   *  - une facture ENCAISSÉE n'est jamais retirée (document comptable) : rectifier
   *    par le module Facturation ou par une nouvelle pièce, pas par la file.
   */
  const removePendingPiece = (patient: Patient, piece: PieceFile) => {
    const descripteur = descripteurPiece(piece);
    if (!descripteur) return;
    const montantPiece = roundTo2(piece.items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
    const restantes = pendingPiecesOf(state, patient, getConsults(patient.id)).filter(p => p.key !== piece.key);
    askConfirmation({
      title: "Retrait d'une prescription de la file Caisse",
      message: `Retirer « ${libellePiece(piece)} » (${formatAr(montantPiece)}) de la file caisse pour ${patient.lastName} ${patient.firstName} (${patient.dossier}) ?`,
      subText: descripteur.kind === 'medicaments'
        ? "L'ordonnance reste conservée au dossier médical et à la pharmacie : seule la facturation en caisse est retirée."
        : "La facture non encaissée est annulée, ainsi que les examens qu'elle porte qui n'ont pas encore été réalisés. Le dossier patient reste conservé.",
      confirmText: 'Retirer de la file',
      cancelText: 'Annuler',
      type: 'danger',
      onConfirm: () => {
        let libelleRetiree = '';
        setState(prev => {
          const patientActuel = prev.patients.find(x => x.id === patient.id);
          if (!patientActuel) return prev;
          const next: AppState = { ...prev };
          const res = purgePieceFromQueue(next, patient.id, descripteur, {
            id: prev.currentUser?.id, name: prev.currentUser?.name,
          });
          if (!res.ok) return prev;
          libelleRetiree = res.libelle;
          addAuditLog(next, 'RETRAIT_PIECE_CAISSE',
            `${res.libelle} (${formatAr(res.montant)}) retiré de la file caisse de ${patientActuel.lastName} ${patientActuel.firstName} (${patientActuel.dossier}) — ${restantes.length} prescription(s) restante(s) — dossier conservé`,
            patient.id);
          addJourneyEvent(next, {
            patientId: patient.id, department: 'caisse', action: 'Prescription retirée de la file caisse',
            status: 'consulted_awaiting_payment',
            details: `${res.libelle} — ${formatAr(res.montant)} non facturés, retirés par ${prev.currentUser?.name || 'la caisse'}. ${restantes.length} prescription(s) restante(s)`,
            actorId: prev.currentUser?.id, actorName: prev.currentUser?.name,
            consultationId: descripteur.kind === 'medicaments' ? descripteur.consultationId : piece.consultationId,
          });
          return next;
        });
        // La sélection de la modale ne doit jamais garder une pièce retirée ;
        // un lot vidé repart sur « toutes les pièces restantes du dossier ».
        setSelPieceKeys(prevKeys => {
          if (!prevKeys || !prevKeys.includes(piece.key)) return prevKeys;
          const encore = prevKeys.filter(k => k !== piece.key);
          return encore.length ? encore : null;
        });
        if (restantes.length === 0) {
          setPaymentModalOpen(false);
          setSelPatientId(null);
          setSelConsultId(null);
        }
        setConfirmModalState(prev => ({ ...prev, isOpen: false }));
        flash(libelleRetiree ? `${libelleRetiree} : retiré de la file caisse.` : "Cette ligne a déjà été soldée ou retirée — rien n'a été modifié.");
      },
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
        setSelPieceKeys(null);
        setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Ouverture / fermeture de la facture patient en fenêtre modale
  /**
   * Ouverture de la fenêtre de facturation. SANS `pieceKey` : TOUTES les pièces
   * en attente du dossier sont proposées (encaissement groupé, une facture et un
   * numéro PAR prescription). AVEC `pieceKey` (clic sur la ligne « Facturer » de
   * la file) : SEULE cette prescription est sélectionnée — le reste du dossier
   * reste en attente au guichet. Les cases de la liste permettent d'ajouter ou de
   * retirer une pièce du lot avant validation.
   */
  const openPaymentModal = (pid: string, pieceKey?: string) => {
    const p = state.patients.find(x => x.id === pid);
    if (p) {
      setPayEditClientType(p.clientType === 'externe' ? 'comptoir' : (p.clientType as ClientType));
      setPayEditCompany(p.company || '');
      setPayEditSubCompany(p.subCompany || '');
      setPayEditNewCompany('');
      setShowPayClientTypeEdit(false);
    }
    const consults = getConsults(pid);
    const pieceSeule = pieceKey && p
      ? pendingPiecesOf(state, p, consults).find(x => x.key === pieceKey)
      : undefined;
    setSelPieceKeys(pieceSeule ? [pieceSeule.key] : null);
    setCustomTicketModerateur(null);
    // Ticket modérateur pré-rempli sur le LOT effectivement facturé : une pièce
    // seule n'appelle que sa propre quote-part.
    const initialCopay = p ? getCopayAmount(p, pieceSeule?.items) : 0;
    setCopayCash(initialCopay > 0 ? String(initialCopay) : '');
    setSelPatientId(pid);
    setSelConsultId(pieceSeule?.consultationId || consults[0]?.id || null);
    setPaymentModalOpen(true);
  };
  const closePaymentModal = () => {
    setPaymentModalOpen(false);
    setSelPatientId(null);
    setSelConsultId(null);
    setSelPieceKeys(null);
    setCustomTicketModerateur(null);
    setCopayCash('');
  };

  const handlePayment = async () => {
    if (!selPatient) return;
    // Garde anti double-paiement
    if (payingRef.current) return;
    payingRef.current = true;
    // Client société → pas d'encaissement en espèces : validation en CRÉDIT SOCIÉTÉ.
    const isSocieteCredit = selPatient.clientType === 'societe';
    const unpaidConsults = getConsults(selPatient.id);
    // PIÈCES DU LOT — une par prescription, JAMAIS fusionnées (voir
    // `pendingPiecesOf`) : factures services en attente + médicaments d'UNE
    // consultation par pièce. Quantité et prix unitaire restent dans leurs
    // CHAMPS (imprimés dans les colonnes Qté / Prix de la facture).
    // SEULES LES PIÈCES SÉLECTIONNÉES sont encaissées : le guichet peut régler
    // une prescription isolée, les autres restent dans la file avec leur numéro.
    const pieces = piecesPayees;
    if (pieces.length === 0 && piecesEnAttente.length > 0) {
      flash('Aucune prescription sélectionnée — cochez la (ou les) ligne(s) à encaisser.');
      payingRef.current = false;
      return;
    }
    // Consultation de RÉFÉRENCE DU LOT (et non du dossier entier) : rattache le
    // ticket modérateur et sa numérotation à la prescription réellement encaissée.
    const consultLot = pieces.map(p => p.consultationId).find(Boolean);
    const dateLot = consultLot ? state.consultations.find(c => c.id === consultLot)?.date : undefined;
    // TOUTES les lignes des pièces du dossier (services, médicaments, anciennes
    // factures pharmacie) : la base du total encaissé.
    const unifiedItems: InvoiceItem[] = pieces.flatMap(piece => piece.items);
    const total = unifiedItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const societeUpserts: Societe[] = [];
    const paidAt = new Date().toISOString();

    // === TICKET MODÉRATEUR (quote-part de l'assuré) ===
    // Client société : le montant effectif du ticket modérateur (copayDu) peut
    // être ajusté librement par l'opérateur (augmenté ou diminué) même si le taux
    // standard est configuré à 80 %. La société est créditée de la différence (partSocieteEffective).
    const { societe: societeCopay, personne: personneCopay } = isSocieteCredit
      ? societeEtPersonneParmi(selPatient, baseCommune.societes, baseCommune.personnes)
      : {};
    const lotCopay = isSocieteCredit
      ? repartirLotCaisse({
          societe: societeCopay, personne: personneCopay,
          factures: pieces.map(p => ({ id: p.key, items: p.items })),
        })
      : null;
    /** Brut et quote-part de chaque pièce (même découpage que l'aperçu affiché). */
    const repartitionParPiece = new Map<string, RepartitionCopay>();
    if (lotCopay) pieces.forEach((p, i) => { const rep = lotCopay.parFacture[i]; if (rep) repartitionParPiece.set(p.key, rep); });
    const copayMontant = isSocieteCredit ? copayDu : 0;
    const partSocieteTotale = isSocieteCredit ? partSocieteEffective : total;
    // BRUT de référence du dossier : prix conventionné AVANT la remise du
    // médecin (= avant le ticket), et non la somme des montants déjà remisés.
    const brutDossier = isSocieteCredit
      ? roundTo2(copayPreview?.brut ?? (total || 0))
      : total;
    const effectiveTaux = brutDossier > 0 ? roundTo2((partSocieteTotale / brutDossier) * 100) : 100;
    const copay: RepartitionCopay | null = isSocieteCredit && copayMontant > 0
      ? {
          societe: societeCopay || undefined,
          personne: personneCopay || undefined,
          brut: brutDossier,
          partSociete: partSocieteTotale,
          ticketModerateur: copayMontant,
          taux: effectiveTaux,
          nature: 'ticket_moderateur',
          aEncaisser: true,
          montantExclu: copayPreview?.montantExclu || 0,
          nbActesExclus: copayPreview?.nbActesExclus || 0,
        }
      : null;
    /**
     * NATURE « REMISE » (société ou dérogation de l'assuré) : la quote-part du
     * taux contractuel est une vraie remise — personne ne la paye (ni le
     * patient, ni la société) — et elle est AFFICHÉE comme « Remise » sur le
     * ticket de caisse. (Nature « ticket modérateur » : cette même somme est
     * encaissée en espèces ci-dessus.)
     */
    const remiseSociete = isSocieteCredit && !copay && lotCopay?.total.nature === 'remise' && societeCopay
      ? quotePartSiTicketModerateur({ societe: societeCopay, personne: personneCopay, items: unifiedItems })
      : 0;
    const remiseParFacture = new Map<string, number>();
    if (remiseSociete > 0 && societeCopay) {
      for (const piece of pieces) {
        const q = quotePartSiTicketModerateur({ societe: societeCopay, personne: personneCopay, items: piece.items });
        if (q > 0) remiseParFacture.set(piece.key, q);
      }
    }
    /**
     * Répartition pièce par pièce (net crédité à la société + quote-part).
     * ELLE EST TOUJOURS CALCULÉE POUR UN CLIENT SOCIÉTÉ — même quand il n'y a
     * AUCUN ticket modérateur à encaisser (société à 100 %) : sans cela, le
     * montant porté au crédit de la société resterait le `patientCharge`
     * enregistré sur la pièce (0 sur les pièces en attente créées par le
     * médecin), et le ticket imprimerait « Remise » sur la totalité et un crédit
     * société de 0 Ar.
     */
    const copayParFacture = new Map<string, RepartitionCopay>();
    if (isSocieteCredit && total > 0) {
      if (isCustomCopay) {
        // Répartition proportionnelle si le ticket modérateur a été ajusté par
        // l'opérateur. La proportion s'applique au BRUT de la pièce (prix avant
        // la remise du médecin) : la même base que le partage standard, sinon la
        // remise serait déduite deux fois sur le crédit société.
        const ratioSociete = brutDossier > 0 ? partSocieteTotale / brutDossier : 0;
        for (const piece of pieces) {
          const brut = roundTo2(repartitionParPiece.get(piece.key)?.brut
            ?? piece.items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
          const partSoc = roundTo2(brut * ratioSociete);
          const quote = roundTo2(brut - partSoc);
          copayParFacture.set(piece.key, {
            societe: societeCopay || undefined,
            personne: personneCopay || undefined,
            brut,
            partSociete: partSoc,
            ticketModerateur: quote,
            taux: effectiveTaux,
            nature: 'ticket_moderateur',
            aEncaisser: quote > 0,
            montantExclu: 0,
            nbActesExclus: 0,
          });
        }
      } else if (lotCopay) {
        repartitionParPiece.forEach((rep, clef) => copayParFacture.set(clef, rep));
      }
    }
    // Contrôle des espèces AVANT la numérotation : un paiement refusé ne doit
    // jamais consommer un numéro de facture.
    const copayEspecesRecues = copayMontant > 0 ? roundTo2(Number(copayCash) || 0) : 0;
    if (copayMontant > 0 && copayEspecesRecues < copayMontant) {
      // Info brève (~2 s) puis reprise de saisie dans le champ « Espèces reçues ».
      flash(
        `Ticket modérateur de ${formatAr(copayMontant)} à encaisser en espèces — reste : ${formatAr(roundTo2(copayMontant - copayEspecesRecues))}.`,
        document.getElementById('copayCash') as HTMLElement | null,
      );
      payingRef.current = false;
      return;
    }

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
      setSelConsultId(null); setSelPatientId(null); setPaymentModalOpen(false); setSelPieceKeys(null);
      payingRef.current = false;
      return;
    }

    // NUMÉROTATION AU PAIEMENT — UN NUMÉRO PAR PIÈCE (PRESCRIPTION REGROUPÉE)
    const specPiece = (
      clientType: ClientType, company: string | undefined, invoiceDate: string, prescriptionDate: string,
    ): FactureNumberSpec => ({
      clientType, company, invoiceDate, prescriptionDate,
    });
    const piecesToNumber = pieces.filter(p => !p.numero);
    const specs: FactureNumberSpec[] = [
      ...piecesToNumber.map((piece) => {
        const consultDate = piece.consultationId ? state.consultations.find(c => c.id === piece.consultationId)?.date : undefined;
        return specPiece(
          selPatient.clientType,
          selPatient.company,
          paidAt,
          consultDate || piece.date || paidAt,
        );
      }),
      ...(copayMontant > 0 ? [specPiece('comptoir', undefined, paidAt, dateLot || unpaidConsults[0]?.date || paidAt)] : []),
    ];
    let allocated: FactureNumberAllocation[];
    try {
      allocated = await allocateFactureNumbersAsync(state, specs);
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Numérotation impossible.', 'Numérotation impossible', 'danger');
      payingRef.current = false;
      return;
    }
    const allocatedNumbers = new Map<string, string>();
    let curseur = 0;
    piecesToNumber.forEach(piece => allocatedNumbers.set(piece.key, allocated[curseur++].numeroFacture));
    const copayNumero: string | undefined = copayMontant > 0 ? allocated[curseur++]?.numeroFacture : undefined;
    for (const alloc of allocated) if (alloc.societeUpsert) societeUpserts.push(alloc.societeUpsert);

    // === FACTURES RÉGLÉES : UNE FACTURE PAR PIÈCE ===
    const piecesReglees: Invoice[] = pieces.map((piece) => {
      const rep = copayParFacture.get(piece.key);
      const pieceTotal = roundTo2(piece.items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
      const net = isSocieteCredit ? creditPiece(piece.items, rep) : pieceTotal;
      const numero = piece.numero || allocatedNumbers.get(piece.key);
      const invoiceId = piece.invoiceId || (piece.invoiceIds && piece.invoiceIds[0]) || uuidv4();
      return {
        id: invoiceId,
        patientId: selPatient.id,
        consultationId: piece.consultationId,
        clientType: selPatient.clientType,
        clientName: `${selPatient.lastName} ${selPatient.firstName}`.trim() || undefined,
        items: piece.items,
        totalAmount: pieceTotal,
        patientCharge: net,
        numeroFacture: numero,
        status: 'paid' as const,
        paidAt,
        paidBy: state.currentUser?.id || '',
        createdAt: piece.date || paidAt,
        isExternal: selPatient.clientType === 'externe',
        creditSociete: isSocieteCredit,
        assuranceSuivi: isSocieteCredit && rep ? { montantARembourser: net } : undefined,
        copayTicketModerateur: rep && rep.ticketModerateur > 0
          ? copayMetadata(rep, { numeroFactureSociete: numero })
          : undefined,
        remiseNonEncaise: remiseParFacture.get(piece.key) || undefined,
      };
    });

    const copayInvoice: Invoice | null = copay && copayMontant > 0 ? {
      id: uuidv4(),
      patientId: selPatient.id,
      consultationId: consultLot || piecesReglees[0]?.consultationId,
      clientType: 'comptoir',
      clientName: `${selPatient.lastName} ${selPatient.firstName}`.trim() || undefined,
      items: [{
        description: `Ticket modérateur — quote-part de l'assuré${societeCopay?.nom ? ` (${societeCopay.nom})` : ''}`,
        quantity: 1, unitPrice: copayMontant, amount: copayMontant, category: 'consultation' as const,
      }],
      totalAmount: copayMontant,
      patientCharge: copayMontant,
      numeroFacture: copayNumero,
      status: 'paid',
      paidAt,
      paidBy: state.currentUser?.id || '',
      createdAt: paidAt,
      isExternal: false,
      creditSociete: false,
      copayTicketModerateur: copayMetadata(copay, {
        sourceInvoiceIds: piecesReglees.map(i => i.id),
        numeroFactureSociete: piecesReglees.map(i => i.numeroFacture).find(Boolean),
      }),
    } : null;

    const detailCredit = isSocieteCredit
      ? (copayMontant > 0
        ? ` en crédit société (${formatAr(partSocieteTotale)}) + ticket modérateur ${formatAr(copayMontant)} encaissé en espèces`
        : ' en crédit société')
      : '';

    const receipt = piecesReglees.length ? prepareReceipts(piecesReglees, piecesReglees[0]) : null;

    setState(prev => {
      const aRemplacer = new Set<string>();
      pieces.forEach(p => {
        if (p.invoiceId) aRemplacer.add(p.invoiceId);
        if (p.invoiceIds) p.invoiceIds.forEach(id => aRemplacer.add(id));
      });
      let withCodes: AppState = prev;
      for (const upsert of societeUpserts) withCodes = applySocieteUpsert(withCodes, upsert);

      const pieceConsultIds = new Set(piecesReglees.map(p => p.consultationId).filter(Boolean) as string[]);
      const piecesByConsultId = new Map(piecesReglees.filter(p => p.consultationId).map(p => [p.consultationId as string, p]));

      const next: AppState = {
        ...withCodes,
        invoices: [
          ...withCodes.invoices.filter(i => !aRemplacer.has(i.id)),
          ...piecesReglees,
          ...(copayInvoice ? [copayInvoice] : []),
        ],
        labRequests: prev.labRequests.map(r =>
          receipt?.exams.pendingLabIds.has(r.id) || (r.consultationId && pieceConsultIds.has(r.consultationId))
            ? { ...r, status: 'paid' as const, ...(r.consultationId && piecesByConsultId.has(r.consultationId) ? { invoiceId: piecesByConsultId.get(r.consultationId)!.id } : {}) }
            : r
        ),
        consultations: prev.consultations.map(c => {
          if (c.patientId !== selPatient.id) return c;
          const piecePaid = piecesByConsultId.get(c.id);
          return {
            ...c,
            labRequests: (c.labRequests || []).map(l =>
              receipt?.exams.pendingLabIds.has(l.id) || piecePaid
                ? { ...l, status: 'paid' as const, ...(piecePaid ? { invoiceId: piecePaid.id } : {}) }
                : l
            ),
            echoRequests: (c.echoRequests || []).map(e =>
              receipt?.exams.pendingEchoIds.has(e.id) || piecePaid
                ? { ...e, status: 'paid' as const, ...(piecePaid ? { invoiceId: piecePaid.id } : {}) }
                : e
            ),
          };
        }),
        patients: prev.patients,
      };

      const piecesRestantes = pendingPiecesOf(next, selPatient, getConsultsSur(next, selPatient.id)).length;
      next.patients = prev.patients.map(p => p.id === selPatient.id
        ? {
            ...p,
            status: (piecesRestantes > 0 ? 'consulted_awaiting_payment' : 'invoice_paid') as Patient['status'],
            lastVisitAt: paidAt,
          }
        : p);
      const parts = [
        unifiedItems.some(i => i.category === 'pharmacy') ? 'médicaments' : '',
        unifiedItems.some(i => i.category === 'lab') ? 'analyses' : '',
        unifiedItems.some(i => i.category === 'echo') ? 'échographies' : '',
      ].filter(Boolean).join(' + ');
      const mentionLot = piecesEnAttente.length > 1
        ? ` — ${pieces.length}/${piecesEnAttente.length} prescription(s) du dossier${piecesRestantes > 0 ? `, ${piecesRestantes} restante(s) en file` : ''}`
        : '';
      addAuditLog(next, isSocieteCredit ? 'VALIDATION_CREDIT_SOCIETE' : 'PAIEMENT_UNIFIE', `${formatAr(total)}${detailCredit} — ${parts || 'facture'}${mentionLot} — ${selPatient.lastName}${selPatient.company ? ` (${selPatient.company})` : ''}`, selPatient.id);
      addJourneyEvent(next, { patientId: selPatient.id, department: 'caisse', action: isSocieteCredit ? (copayMontant > 0 ? 'Crédit société validé + ticket modérateur encaissé' : 'Paiement validé en crédit société') : (piecesRestantes > 0 ? 'Paiement partiel enregistré' : 'Paiement unifié enregistré'), status: piecesRestantes > 0 ? 'consulted_awaiting_payment' : 'invoice_paid', details: `${formatAr(total)} (${parts || 'facture'})${mentionLot}${isSocieteCredit ? ` — crédit société ${selPatient.company || ''}${copayMontant > 0 ? ` (${formatAr(partSocieteTotale)}) + ticket modérateur ${formatAr(copayMontant)} réglé en espèces` : ''}` : ''}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name });
      return next;
    });

    if (receipt) setLastReceipt(receipt);
    setLastReceiptPieces(copayInvoice ? [...piecesReglees, copayInvoice] : piecesReglees);

    piecesReglees.forEach(piece => printReceipts(prepareReceipts([piece], piece), 'payment'));
    piecesReglees.forEach(piece => printReceipts(prepareReceipts([piece], piece), 'exams'));
    if (copayInvoice) {
      openThermalTicket(
        effectiveTicketSettings,
        copayInvoice,
        state.patients.find(p => p.id === copayInvoice.patientId),
        state.users.find(u => u.id === copayInvoice.paidBy) || state.currentUser || undefined,
      );
    }
    setSelConsultId(null); setSelPatientId(null); setPaymentModalOpen(false); setCopayCash(''); setSelPieceKeys(null);
    payingRef.current = false;
  };

  // LAB items merged: invoices containing lab items are processed in payment queue (no separate lab tab)

  // === EXTERNAL ===
  // Exclure les articles bloqués à la vente (réservé / régularisation)
  // Les articles bloqués à la vente restent visibles (marqués en rouge « BLOQUÉ ») :
  // le caissier reçoit une notification rouge centrée s'il tente de les sélectionner.
  const extFiltered = extSearch.length >= 1
    ? state.articles.filter(a => { const q = normaliserRecherche(extSearch); return q === '' || normaliserRecherche(a.name).includes(q); })
    : [];
  const extLineAmt = (l: HbLine) => roundTo2(l.unitPrice * l.quantity);
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
    // RÈGLE : un client externe n'a JAMAIS de remise (prix catalogue externe) et
    // la date de sortie n'est plus saisie en caisse — la date du jour fait foi.
    const lineToSave: HbLine = { ...extLineForm, discount: 0, dateSort: new Date().toISOString().split('T')[0] };
    if (extIsNew || !extLines.find(l => l.id === extLineForm.id)) setExtLines([...extLines, lineToSave]);
    else setExtLines(extLines.map(l => l.id === extLineForm.id ? lineToSave : l));
    setExtIsNew(false);
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
  const extPay = async () => {
    if (extLines.length === 0) return;
    // Ne pas valider l'encaissement si une ligne de vente est en cours de saisie mais non enregistrée
    if (blockIfUnsavedDraftLine(extLineForm, extLines, { entityLabel: 'l\'article' })) return;
    // RÈGLE : la saisie du médecin prescripteur est OBLIGATOIRE avant d'encaisser,
    // SAUF si toutes les lignes de la vente sont des articles de la famille
    // Consultation (la consultation porte déjà le nom du médecin qui la fait).
    const toutesConsultations = extLines.every((l) => {
      const art = state.articles.find((a) => a.name === l.articleName);
      return !!art && isConsultFamily(art.family);
    });
    if (!toutesConsultations && !extPrescripteur.trim()) {
      // Info brève (~2 s) puis reprise de saisie dans le champ (comme « Diagnostic * » chez le médecin).
      flash(
        "Médecin prescripteur obligatoire avant d'encaisser (sauf si la vente ne contient que des articles de la famille Consultation).",
        document.getElementById('ext-prescripteur') as HTMLElement | null,
      );
      return;
    }
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
    // Prescripteur saisi : rattaché au médecin de la base quand il existe
    // (identifiant réel), sinon conservé tel quel ; à défaut, libellé caisse.
    const prescripteurSaisi = extPrescripteur.trim();
    const medecinBase = prescripteurSaisi ? state.users.find(u => u.role === 'doctor' && normaliserRecherche(u.name) === normaliserRecherche(prescripteurSaisi)) : undefined;
    const extDoctor: User = prescripteurSaisi
      ? { id: medecinBase?.id || 'EXTERNE', name: prescripteurSaisi, role: 'doctor' }
      : { id: 'CASHIER', name: state.currentUser?.name ? `Vente Externe (${state.currentUser.name})` : 'Vente Externe', role: 'cashier' };

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
        price: roundTo2(l.unitPrice),
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
        price: roundTo2(l.unitPrice),
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
        discount: 0,
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

    // Numérotation officielle : les ventes externes sont des factures « comptoir »
    // → AAFAMMJJ + numéro d'ordre du jour (ex: 26FA0427102).
    // Réservé atomiquement : échec → on alerte et on n'encaisse RIEN.
    let extNumero: string;
    try {
      extNumero = (await allocateFactureNumberAsync(state, { clientType: 'externe', invoiceDate: now })).numeroFacture;
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Numérotation impossible.', 'Numérotation impossible', 'danger');
      return;
    }
    const inv: Invoice = {
      id: invId,
      consultationId: extConsultId,
      clientName: 'Client Externe',
      clientType: 'externe',
      numeroFacture: extNumero,
      // Médecin prescripteur saisi : repris sur le ticket, la facture A5 et les bons (y compris réimpressions).
      prescriberName: prescripteurSaisi || undefined,
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
      // Le prescripteur saisi (hors centre) rejoint la base de la saisie assistée.
      const prescripteurs = prev.prescripteursExternes || [];
      const prescripteursExternes = prescripteurSaisi && !prescripteurs.some(n => normaliserRecherche(n) === normaliserRecherche(prescripteurSaisi))
        ? [...prescripteurs, prescripteurSaisi]
        : prescripteurs;
      const next = {
        ...prev,
        invoices: [...prev.invoices, inv],
        consultations: [...prev.consultations, ...newConsultations],
        labRequests: [...prev.labRequests, ...newLabRequests],
        prescripteursExternes,
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
    const receipt = prepareReceipts([inv], inv, getExamReceipts([inv], newConsultations, newLabRequests));
    receipt.prescriber = extDoctor;
    setLastReceipt(receipt);
    printReceipts(receipt);

    setExtLines([]); setExtSearch('');
  };

  // === HOSPIT/BLOC ===
  // Les montants d'un dossier hospit/bloc viennent de `utils/hbDossier` : caisse,
  // pharmacie de garde et facturation calculent donc exactement pareil (`hbLineAmt`
  // et `hbReste` sont importés en haut du fichier).
  const hbPatFiltered = hbPatSearch.length >= 1 ? state.patients.filter(p => { const q = normaliserRecherche(hbPatSearch); return q === '' || normaliserRecherche(`${p.lastName} ${p.firstName}`).includes(q) || normaliserRecherche(p.dossier).includes(q); }) : [];

  const hbSelectPatient = async (patientId: string) => {
    const p = state.patients.find(x => x.id === patientId);
    if (!p) return;
    const exists = hbRecords.some(r => r.patientId === p.id && r.type === tab);
    if (exists) { alert('Ce patient est déjà dans la liste'); return; }
    const now = new Date().toISOString();
    let numeroFacture: string;
    try {
      numeroFacture = await hbNumeroFacture(p.clientType, p.company);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Numérotation impossible : dossier non créé.');
      return;
    }
    updateHbRecords([...hbRecords, {
      id: uuidv4(), patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
      clientType: p.clientType, company: p.company, subCompany: p.subCompany,
      numeroFacture,
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

  const hbAddNewPatient = async () => {
    // Info brève (~2 s) puis reprise de saisie dans le champ concerné.
    if (!hbNewPat.lastName || !hbNewPat.firstName) {
      flash('Nom et prénom requis.', document.getElementById(!hbNewPat.lastName ? 'caisse-nouveau-nom' : 'caisse-nouveau-prenom') as HTMLElement | null);
      return;
    }
    const dossier = normalizeDossierNumber(hbNewPat.dossier);
    if (!dossier) { flash('Le numéro de dossier est obligatoire (saisie manuelle, majuscules).', document.getElementById('caisse-nouveau-dossier') as HTMLElement | null); return; }
    if (isDossierTaken(state.patients, dossier)) { flash('Ce numéro de dossier existe déjà.', document.getElementById('caisse-nouveau-dossier') as HTMLElement | null); return; }
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
    // Numéro réservé AVANT toute création : en cas d'échec, rien n'est créé.
    let numeroFacture: string;
    try {
      numeroFacture = await hbNumeroFacture(np.clientType, np.company);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Numérotation impossible : patient et dossier non créés.');
      return;
    }
    setState(prev => ({ ...prev, patients: [...prev.patients, np] }));
    updateHbRecords([...hbRecords, {
      id: uuidv4(), patientId: np.id, patientName: `${np.lastName} ${np.firstName}`,
      clientType: np.clientType, company: np.company, subCompany: np.subCompany,
      numeroFacture,
      type: tab as 'hospit' | 'bloc', lines: [], payments: [],
      openedAt: now, openedBy: state.currentUser?.name, openedByUserId: state.currentUser?.id,
    }]);
    setHbNewPat({ dossier: '', lastName: '', firstName: '', dateOfBirth: '', gender: 'M', contact: '', address: '', matricule: '', ssn: '', insureName: '', clientType: 'comptoir', company: '', subCompany: '' });
    setHbModal('none');
  };

  // Article modal for hospit/bloc — exclure articles bloqués
  const hbArtFiltered = hbArtSearch.length >= 1
    ? state.articles.filter(a => { const q = normaliserRecherche(hbArtSearch); return (q === '' || normaliserRecherche(a.name).includes(q)) && !a.saleBlocked; })
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

  const openDischarge = (recordId: string) => {
    setHbSelRecordId(recordId);
    setHbDischargeMotif('');
    setHbDischargeDonneur('');
    setHbModal('discharge');
  };

  const confirmDischarge = () => {
    const rec = hbRecords.find(r => r.id === hbSelRecordId);
    if (!rec || rec.dischargedAt) return;
    const motif = hbDischargeMotif.trim();
    const donneur = hbDischargeDonneur.trim();
    // Hors société (comptoir…) au paiement incomplet : motif + donneur d'ordre obligatoires.
    if (rec.clientType !== 'societe' && hbReste(rec) > 0 && (!motif || !donneur)) {
      showAlert('Sortie sans paiement complet : le motif ET le donneur d’ordre sont obligatoires.', 'Sortie impossible', 'danger');
      return;
    }
    const now = new Date().toISOString();
    const dossierTypeName = rec.type === 'hospit' ? 'hospitalisation' : 'bloc opératoire';
    const totalFact = rec.lines.reduce((s, l) => s + hbLineAmt(l), 0);
    const totalPaid = rec.payments.reduce((s, p) => s + p.amount, 0);
    const reste = hbReste(rec);
    setState(prev => {
      const next: AppState = {
        ...prev,
        hbRecords: (prev.hbRecords || []).map(r => r.id === rec.id ? {
          ...r,
          dischargedAt: now,
          dischargedBy: prev.currentUser?.name,
          dischargedByUserId: prev.currentUser?.id,
          dischargeMotif: motif || undefined,
          dischargeDonneurOrdre: donneur || undefined,
        } : r),
        // La demande est honorée (patient passé par le service puis sorti) :
        // sans cela, l'ajout automatique recréerait le dossier au prochain onglet.
        consultations: prev.consultations.map(c => {
          if (c.patientId !== rec.patientId) return c;
          if (rec.type === 'hospit' && !c.hospitalizeRequested) return c;
          if (rec.type === 'bloc' && !c.surgeryRequested) return c;
          return { ...c, hospitalizeRequested: rec.type === 'hospit' ? false : c.hospitalizeRequested, surgeryRequested: rec.type === 'bloc' ? false : c.surgeryRequested };
        }),
      };
      addAuditLog(next, 'SORTIE_HB', `Sortie d'${dossierTypeName} : ${rec.patientName} — Facture ${formatAr(totalFact)}, payé ${formatAr(totalPaid)}${reste > 0 ? `, RESTE ${formatAr(reste)} (motif : ${motif || '—'} ; donneur d'ordre : ${donneur || '—'})` : ' (soldé)'}`, rec.patientId);
      if (rec.patientId) {
        addJourneyEvent(next, { patientId: rec.patientId, department: 'caisse', action: rec.type === 'hospit' ? "Sortie d'hospitalisation" : 'Sortie de bloc', status: 'discharged', details: `Dossier ${rec.type} clos par ${prev.currentUser?.name || 'la caisse'} — ${formatAr(totalPaid)} / ${formatAr(totalFact)}${reste > 0 ? ` — reste ${formatAr(reste)}` : ''}`, actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, hospitalizationId: rec.id });
      }
      return next;
    });
    setHbModal('none');
    if (hbSelRecordId === rec.id) setHbSelRecordId(null);
    // Le dossier quitte la liste de la caisse à la sortie : sans ce relais, le
    // reste dû ne plus être suivi nulle part.
    if (reste > 0) {
      showAlert(
        `Sortie enregistrée : il reste ${formatAr(reste)} au centre sur ce dossier ${dossierTypeName}.

`
        + "Le suivi et l'encaissement du reliquat se font désormais dans Facturation → « Bloc & Hospit. — reliquats » "
        + "(relances, état imprimable, export Excel). Un règlement saisi là revenant dans ce dossier, la caisse le verra.",
        "Solde ouvert après autorisation de sortie", 'warning');
    }
  };

  const cancelDischarge = (recordId: string) => {
    const rec = hbRecords.find(r => r.id === recordId);
    if (!rec || !rec.dischargedAt) return;
    setState(prev => {
      const next: AppState = {
        ...prev,
        hbRecords: (prev.hbRecords || []).map(r => r.id === recordId ? {
          ...r, dischargedAt: undefined, dischargedBy: undefined, dischargedByUserId: undefined,
          dischargeMotif: undefined, dischargeDonneurOrdre: undefined,
        } : r),
      };
      addAuditLog(next, 'ANNULATION_SORTIE_HB', `Sortie annulée (réadmission) : ${rec.patientName} — dossier ${rec.type} rouvert`, rec.patientId);
      return next;
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
      id: uuidv4(),
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
    const nouveauType = payEditClientType === 'externe' ? 'comptoir' : payEditClientType as 'comptoir'|'societe';
    setState(prev => ({
      ...prev,
      patients: prev.patients.map(p => p.id === selPatient.id ? {
        ...p,
        clientType: nouveauType,
        company: payEditClientType === 'societe' ? payEditCompany : undefined,
        subCompany: payEditClientType === 'societe' ? payEditSubCompany : undefined,
      } : p),
      // Les factures EN ATTENTE de ce patient suivent le nouveau type : la
      // validation à venir arrivera en totalité dans la bonne facturation
      // (société ou comptoir). Les factures déjà validées ne sont pas réécrites.
      invoices: prev.invoices.map(i => i.patientId === selPatient.id && i.status === 'pending'
        ? { ...i, clientType: nouveauType }
        : i),
    }));
    // Mettre à jour aussi hbRecords si patient déjà présent en hospit/bloc
    updateHbRecords(prev => prev.map(r => r.patientId === selPatient.id ? {
      ...r, clientType: payEditClientType, company: payEditClientType === 'societe' ? payEditCompany : undefined, subCompany: payEditClientType === 'societe' ? payEditSubCompany : undefined,
    } : r));
    setShowPayClientTypeEdit(false);
  };

  // Auto-add from doctor requests
  const autoAddRequests = async () => {
    const now = new Date().toISOString();
    const openerName = state.currentUser?.name;
    const openerId = state.currentUser?.id;
    // Plusieurs dossiers peuvent être créés d'affilée : on collecte d'abord
    // les demandes, puis UN SEUL lot atomique les numérote toutes.
    const pending: { pat: Patient; type: 'hospit' | 'bloc' }[] = [];
    state.consultations.forEach(c => {
      const pat = state.patients.find(p => p.id === c.patientId);
      if (!pat) return;
      if (c.hospitalizeRequested && !hbRecords.some(h => h.patientId === pat.id && h.type === 'hospit'))
        pending.push({ pat, type: 'hospit' });
      if (c.surgeryRequested && !hbRecords.some(h => h.patientId === pat.id && h.type === 'bloc'))
        pending.push({ pat, type: 'bloc' });
    });
    if (pending.length === 0) return;
    let allocated: FactureNumberAllocation[];
    try {
      allocated = await allocateFactureNumbersAsync(
        state,
        pending.map(({ pat }) => ({ clientType: pat.clientType, company: pat.company, invoiceDate: now, prescriptionDate: now })),
      );
    } catch {
      return; // ajout automatique : échec silencieux, réessayé au prochain onglet
    }
    setState(prev => {
      let next = prev;
      const fresh = prev.hbRecords || [];
      const additions: HbRecord[] = [];
      pending.forEach(({ pat, type }, i) => {
        // Re-vérification anti-doublon au moment d'écrire (l'onglet a pu
        // recevoir les dossiers d'un autre poste pendant l'allocation).
        if (fresh.some(h => h.patientId === pat.id && h.type === type)
          || additions.some(h => h.patientId === pat.id && h.type === type)) return;
        additions.push({
          id: uuidv4(), patientId: pat.id, patientName: `${pat.lastName} ${pat.firstName}`,
          clientType: pat.clientType, company: pat.company, subCompany: pat.subCompany,
          numeroFacture: allocated[i].numeroFacture, type, lines: [], payments: [],
          openedAt: now, openedBy: openerName, openedByUserId: openerId,
        });
        const upsert = allocated[i].societeUpsert;
        if (upsert) next = applySocieteUpsert(next, upsert);
      });
      if (additions.length === 0) return next === prev ? prev : next;
      return { ...next, hbRecords: [...(next.hbRecords || []), ...additions] };
    });
  };
  const switchTab = (t: Tab) => { setTab(t); if (t === 'hospit' || t === 'bloc') void autoAddRequests(); };

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
    // Un paiement distinct, notamment externe, ne doit pas être fusionné avec
    // celui d'un autre client simplement parce qu'il a eu lieu à la même minute.
    const key = inv.isExternal ? `ext_${inv.id}` : `${inv.patientId || inv.id}_${inv.paidAt || inv.createdAt}`;
    const existing = acc.find(g => g.key === key);
    if (existing) {
      existing.invoices.push(inv);
      existing.mergedInvoice.patientCharge += inv.patientCharge;
      existing.mergedInvoice.totalAmount += inv.totalAmount;
      if (inv.items) {
        existing.mergedInvoice.items = [...(existing.mergedInvoice.items || []), ...inv.items];
      }
    } else {
      acc.push({
        key,
        timeStr,
        invoices: [inv],
        mergedInvoice: { ...inv, items: inv.items ? [...inv.items] : [] }
      });
    }
    return acc;
  }, [] as { key: string; timeStr: string; invoices: Invoice[]; mergedInvoice: typeof myTodayInvoices[0] }[]);
  
  const myTodayTotal = myTodayInvoices.reduce((s, inv) => s + inv.patientCharge, 0);
  const myTodayExtTotal = myTodayInvoices.filter(i => i.isExternal).reduce((s, i) => s + i.patientCharge, 0);
  // Paiements Hospit/Bloc du caissier connecté uniquement
  const myTodayPartialTotal = hbRecords.reduce((s, h) => s + h.payments.filter(p => new Date(p.date).toDateString() === new Date().toDateString() && p.paidByUserId === currentCashierId).reduce((ss, p) => ss + p.amount, 0), 0);

  const myGrandTotal = myTodayTotal + myTodayPartialTotal;

  // Ordre décroissant : dernier saisi / dernier arrivé en haut (hospitalisation & bloc)
  const curHbRecords = hbRecords
    .filter(h => h.type === tab)
    .filter(h => hbShowDischarged || !h.dischargedAt)
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
      // La file d'impression attend la clôture caisse avant la compilation pharma.
      printPharmaDeliveryClosingTicket(effectiveTicketSettings, pc, pc.stockSummary);
    }
  };

  return (
    <div className="space-y-4 flex flex-col">
      <FlashInfoBanner message={flashMsg} />
      {lastReceipt && (
        <section aria-label="Dernier encaissement" className="bg-surface border border-line rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm text-ink-strong">Dernier encaissement — réimpression</p>
            <p className="text-xs text-ink-muted">{lastReceipt.patient ? `${lastReceipt.patient.lastName} ${lastReceipt.patient.firstName}` : lastReceipt.invoice.clientName || 'Client externe'} · {formatAr(lastReceipt.invoice.patientCharge)} · {lastReceipt.invoice.numeroFacture ? `Facture n° ${lastReceipt.invoice.numeroFacture} · ` : ''}Sans nouveau paiement</p>
          </div>
          {(() => {
            // Duplicatas : un ticket ET un bon d'examens PAR PRESCRIPTION (jamais
            // fusionnés, même au nom de la même personne) + le ticket modérateur
            // encaissé en espèces.
            const pieces = lastReceiptPieces.length ? lastReceiptPieces : [lastReceipt.invoice];
            const ticketModerateur = pieces.find(estPieceTicketModerateur);
            return (
              <div className="flex flex-wrap gap-1.5">
                {receiptButtons(() => pieces.map(piece => prepareReceipts(pieces, piece)),
                  lastReceipt.exams.labLines.length > 0, lastReceipt.exams.echoLines.length > 0)}
                {ticketModerateur && (
                  <button type="button"
                    onClick={() => openThermalTicket(effectiveTicketSettings, ticketModerateur, lastReceipt.patient || undefined, lastReceipt.cashier)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-lg text-xs font-semibold text-amber-800 dark:text-amber-300 cursor-pointer"
                    title="Réimprimer le ticket modérateur (sans nouveau paiement)">
                    <Printer className="w-3.5 h-3.5" /> Ticket modérateur
                  </button>
                )}
              </div>
            );
          })()}
        </section>
      )}

      {/* Tabs */}
      <div className="bg-surface rounded-xl shadow-sm border overflow-hidden">
        <div className="flex items-center justify-between border-b overflow-x-auto bg-surface-muted/50 px-2">
          <div className="flex overflow-x-auto">
            {([['payment','📋 Facturation',pendingPatients.length],['hospit','🏨 Hospit.',hbRecords.filter(h=>h.type==='hospit' && !h.dischargedAt).length],['bloc','🏥 Bloc',hbRecords.filter(h=>h.type==='bloc' && !h.dischargedAt).length],['closing','🔒 Clôture',0]] as [Tab,string,number][]).map(([k,l,c]) => (
              <button key={k} onClick={() => switchTab(k)} className={`flex items-center gap-1 px-4 py-3 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap ${tab===k?'border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-500/4':'border-transparent text-ink-muted hover:text-ink-strong'}`}>{l}{c > 0 ? ` (${c})` : ''}</button>
            ))}
          </div>
          <div className="pr-2">
            <button
              onClick={() => { setTempPrinterSettings(printerSettings); setPrinterModalOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-line-strong hover:bg-surface-muted rounded-lg text-xs font-semibold text-ink cursor-pointer shadow-xs transition"
              title="Configurer l'imprimante et le format de ticket pour ce caissier"
            >
              <Printer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Imprimante : {printerSettings.printerName} ({printerSettings.paperWidth}mm)</span>
            </button>
          </div>
        </div>

        <div className="p-4">

          {/* FACTURATION — file d'attente de paiement (popup) + Vente directe client externe */}
          {tab === 'payment' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

              {/* FILE D'ATTENTE DE PAIEMENT — le clic ouvre la facture en popup modale */}
              <div className="border rounded-lg overflow-hidden bg-surface">
                <div className="bg-amber-50 dark:bg-amber-500/8 border-b border-amber-200 dark:border-amber-500/25 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5"><CreditCard className="w-4 h-4" /> File d'attente de paiement</span>
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() => onRefreshQueue?.()}
                      title="Rechercher les nouvelles consultations validées par les médecins"
                      className="p-1 rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-200/70 dark:hover:bg-amber-500/18 cursor-pointer transition"
                    ><RefreshCw className="w-3.5 h-3.5" /></button>
                    <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-bold" title={`${fileAttente.length} prescription(s) en attente`}>{fileAttente.length}</span>
                  </span>
                </div>
                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {fileAttente.length === 0 ? <div className="p-6 text-center text-ink-faint text-sm">Aucune facture</div>
                    : fileAttente.map(({ patient: p, piece, date }) => {
                      const estSociete = p.clientType === 'societe';
                      // Ticket modérateur de CETTE prescription seulement
                      const copayFile = piece ? getCopayAmount(p, piece.items) : getCopayAmount(p);
                      const dateLigne = date ? new Date(date).toLocaleDateString('fr-FR') : undefined;
                      // MONTANT DE CETTE PRESCRIPTION SEULE :
                      const montant = piece
                        ? (estSociete ? brutPiece(piece.items) : roundTo2(piece.items.reduce((ss, it) => ss + (Number(it.amount) || 0), 0)))
                        : getPendingAmount(p);
                      const lib = piece ? libellePiece(piece) : '';
                      const estSelectionnee = selPatientId === p.id && paymentModalOpen && (!piece || (selPieceKeys ? selPieceKeys.includes(piece.key) : true));
                      return (
                        <div
                          key={piece ? `${p.id}-${piece.key}` : `${p.id}-passage`}
                          className={`p-3 cursor-pointer hover:bg-amber-50/60 dark:hover:bg-amber-500/5 transition ${estSelectionnee ? 'bg-amber-50 dark:bg-amber-500/8 border-l-4 border-amber-500' : ''}`}
                          onClick={() => openPaymentModal(p.id, piece?.key)}
                          title={piece ? `Facturer cette prescription : ${lib} (${formatAr(montant)})` : 'Ouvrir la facture'}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">
                                {p.lastName} {p.firstName}
                                {dateLigne ? <span className="text-xs text-ink-muted font-normal"> {dateLigne}</span> : null}
                              </div>
                              <div className="text-xs text-ink-muted truncate" title={lib}>
                                {piece
                                  ? <>{piece.label}{piece.resume ? ` — ${piece.resume}` : ''}{piece.numero ? <span className="font-mono"> · n° {piece.numero}</span> : <span> · en attente (sans numéro)</span>}</>
                                  : <>{(getConsults(p.id)[0]?.doctorName) || 'Passage sans facturation'}</>}
                                {p.company ? ` — ${p.company}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <div className={`font-mono font-bold text-sm ${estSociete ? 'text-blue-700 dark:text-cyan-400' : 'text-amber-700 dark:text-amber-400'}`}>{formatAr(montant)}</div>
                              {piece && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openPaymentModal(p.id, piece.key); }}
                                  className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer shrink-0 transition shadow-xs"
                                  title="Facturer cette prescription"
                                >Facturer</button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (piece) {
                                    removePendingPiece(p, piece);
                                  } else {
                                    removePendingPatient(p.id);
                                  }
                                }}
                                className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/15 hover:text-rose-700 dark:hover:text-rose-400 cursor-pointer transition shrink-0"
                                title="Retirer cette prescription de la file caisse"
                              ><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {estSociete && <span className="px-1 py-0.5 bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400 text-[10px] rounded font-semibold" title={copayFile > 0 ? "Le NET est porté au crédit de la société ; la quote-part de l'assuré se règle en espèces" : "Pas d'espèces : la facture est portée au crédit de la société"}>🏢 Crédit Société</span>}
                            {copayFile > 0 && (
                              <span className="px-1 py-0.5 bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400 text-[10px] rounded font-bold"
                                title="Ticket modérateur : quote-part de l'assuré à encaisser en espèces pour cette prescription (un ticket lui est remis)">
                                💰 Ticket mod. {formatAr(copayFile)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
                {fileAttente.length > 0 && (
                  <div className="px-3 py-1.5 bg-surface-muted border-t text-[10px] text-ink-muted text-center">
                    👆 File traitée par prescription individuelle — un clic sur une ligne ou sur « Facturer » ouvre la prescription à encaisser. L&apos;icône corbeille retire la prescription de la file.
                  </div>
                )}
              </div>

              {/* VENTE DIRECTE — CLIENT EXTERNE (affichée à la place du détail de facturation) */}
              <div className="lg:col-span-2 space-y-3">
                <div className="p-3 bg-purple-50 dark:bg-purple-500/8 border border-purple-200 dark:border-purple-500/25 rounded-lg"><h3 className="font-bold text-purple-800 dark:text-purple-300"><ShoppingCart className="w-5 h-5 inline" /> Vente Directe — Client Externe</h3></div>
                <div className="flex items-end gap-2 -mt-1">
                  <div className="flex-1">
                    <label className="block text-[9px] text-ink-muted" title="Obligatoire avant d'encaisser, sauf si la vente ne contient que des articles de la famille Consultation. Généralement un médecin hors de notre centre. Saisie assistée par les prescripteurs déjà enregistrés (la base s'enrichit à chaque vente) et les médecins de l'hôpital — une valeur libre est acceptée.">Médecin prescripteur (obligatoire avant encaissement — sauf famille Consultation)</label>
                    <SuggestionInput mode="contient" id="ext-prescripteur" value={extPrescripteur} onChange={setExtPrescripteur} suggestions={suggestionsPrescripteurs}
                      ariaLabel="Médecin prescripteur" placeholder="Ex : Dr RAKOTOARISOA (Clinique Fanihy)" maxSuggestions={8}
                      className="w-full bg-surface border border-purple-300 dark:border-purple-500/40 rounded px-2 py-1 text-xs outline-none focus:border-accent" />
                  </div>
                </div>
                <div className="bg-surface-muted border border-line-strong rounded">
                  <div className="bg-surface-hover border-b border-line-strong p-1.5 m-2 mb-0 rounded shadow-inner">
                    <div className="flex flex-wrap items-end gap-1">
                      <div className="flex-1 min-w-[140px] relative">
                        <label className="block text-[9px] text-ink-muted">Article (↑↓ Entrée)</label>
                        <input ref={extSearchRef} type="text" value={extLineForm.articleName && !extSearch ? extLineForm.articleName : extSearch} onChange={e => { setExtSearch(e.target.value); setExtSearchIdx(0); }} onKeyDown={extKeyDown} className="w-full bg-surface border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-accent" placeholder="🔍 Tapez..." />
                        {extSearch.length >= 1 && extFiltered.length > 0 && <div className="absolute top-full left-0 right-0 bg-surface border rounded-b shadow-xl z-30 max-h-36 overflow-y-auto">{extFiltered.map((a, idx) => {
                          const manages = managesStock(a);
                          const isBlocked = !!a.saleBlocked;
                          const isOut = manages && a.stockPharmacie <= 0;
                          const isLow = manages && !isOut && a.stockPharmacie <= a.minStockPharmacie && !a.alertDisabledPharmacie;
                          const isKo = isBlocked || isOut;
                          return (<div key={a.id} onClick={() => extSelectArticle(a.id)} title={isBlocked ? `Bloqué à la vente par la pharmacie${a.saleBlockReason ? ` — ${a.saleBlockReason}` : ''}` : isOut ? 'Rupture de stock — vente impossible' : undefined} className={`px-2 py-1 text-xs flex justify-between border-b ${isKo ? 'bg-red-50 dark:bg-red-500/8 text-red-700 dark:text-red-400 cursor-not-allowed' : `cursor-pointer ${idx === extSearchIdx ? 'bg-blue-100 dark:bg-cyan-500/15' : 'hover:bg-blue-50 dark:hover:bg-cyan-500/8'}`}`}>
                            <span className={isKo ? 'line-through decoration-red-400/60' : ''}>[{a.family}] {a.name}</span>
                            <span className="flex items-center gap-2">
                              {isBlocked
                                ? <span className="px-1.5 py-0.5 bg-red-700 text-white rounded text-[9px] font-bold">⛔ BLOQUÉ — invendable</span>
                                : isOut
                                ? <span className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[9px] font-bold">🚨 RUPTURE — invendable</span>
                                : manages
                                  ? <span className={`font-mono text-[10px] ${isLow ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-ink-faint'}`}>Stock: {a.stockPharmacie}{isLow ? ' ⚠️' : ''}</span>
                                  : isLabExamArticle(a)
                                    ? <span className="px-1.5 py-0.5 bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400 rounded text-[9px] font-bold" title="Analyse de laboratoire — un bon d'analyse sera imprimé après encaissement">BON LABO</span>
                                    : isEchoActArticle(a)
                                      ? <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 rounded text-[9px] font-bold" title="Échographie — un bon d'échographie sera imprimé après encaissement">BON ÉCHO</span>
                                      : <span className="font-mono text-[10px] text-ink-faint" title="Famille non gérée en stock">stock: —</span>}
                              <span className={`font-mono ${isKo ? 'text-red-400' : 'text-blue-600 dark:text-cyan-400'}`}>{formatAr(getPrice(a, 'externe'))}</span>
                            </span>
                          </div>);
                        })}</div>}
                      </div>
                      <div className="w-14"><label className="block text-[9px] text-ink-muted">Qté</label><input type="number" min={1} value={extLineForm.quantity} onChange={e => setExtLineForm({...extLineForm, quantity: parseFloat(e.target.value)||1})} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); extSaveLine(); }}} className="w-full bg-surface border border-line-strong rounded px-1 py-0.5 text-xs text-right font-mono outline-none" /></div>
                      <div className="w-20"><label className="block text-[9px] text-ink-muted">P.U.</label><input readOnly value={formatAr(extLineForm.unitPrice)} className="w-full bg-surface-active border border-line-strong rounded px-1 py-0.5 text-xs text-right font-mono" /></div>
                      <div className="w-24"><label className="block text-[9px] text-ink-muted">Montant</label><input readOnly value={formatAr(extLineAmt(extLineForm))} className="w-full bg-surface-active border border-line-strong rounded px-1 py-0.5 text-xs text-right font-mono font-bold" /></div>
                    </div>
                    <div className="flex justify-end gap-1 mt-1">
                      <button onClick={() => { if (extSelLineId) { setExtLines(extLines.filter(l => l.id !== extSelLineId)); setExtSelLineId(null); }}} disabled={!extSelLineId} className="px-2 py-0.5 bg-surface border border-line-strong rounded text-[10px] disabled:opacity-40 cursor-pointer"><Trash2 className="h-3 w-3 text-rose-600 dark:text-rose-400 inline" /></button>
                      <button onClick={extSaveLine} disabled={!extLineForm.articleName} className="px-2 py-0.5 bg-sky-500 text-white border border-sky-600 rounded text-[10px] disabled:opacity-40 cursor-pointer"><Save className="h-3 w-3 inline" /> Enreg.</button>
                    </div>
                  </div>
                  <div className="bg-surface mx-2 mb-2 border-t border-line-strong overflow-x-auto rounded-b">
                    <table className="w-full text-[11px]"><thead className="bg-surface-muted border-b text-ink-secondary"><tr className="divide-x divide-line"><th className="p-1 min-w-[130px]">Article</th><th className="p-1 text-right w-12">Qté</th><th className="p-1 text-right w-20">P.U.</th><th className="p-1 text-right w-24">Montant</th></tr></thead>
                      <tbody className="divide-y font-mono">{extLines.map(l => (<tr key={l.id} onClick={() => { setExtSelLineId(l.id); setExtLineForm({...l}); setExtIsNew(false); }} className={`cursor-pointer divide-x divide-line ${l.id === extSelLineId ? 'bg-blue-500 text-white' : 'hover:bg-surface-muted'}`}><td className="p-1 font-sans">{l.articleName}</td><td className="p-1 text-right">{l.quantity}</td><td className="p-1 text-right">{formatNum(l.unitPrice)}</td><td className="p-1 text-right font-bold">{formatNum(extLineAmt(l))}</td></tr>))}
                        {extLines.length === 0 && <tr><td colSpan={4} className="p-3 text-center text-ink-faint font-sans">Tapez un article</td></tr>}
                      </tbody>
                      {extLines.length > 0 && <tfoot className="bg-emerald-50 dark:bg-emerald-500/8 border-t-2 border-emerald-300 dark:border-emerald-500/40"><tr><td colSpan={3} className="p-1 text-right font-bold font-sans">SOUS-TOTAL ARTICLES:</td><td colSpan={1} className="p-1 text-right font-mono font-bold text-lg">{formatAr(extArticlesTotal)}</td></tr></tfoot>}
                    </table>
                  </div>
                </div>
                <p className="text-[10px] text-purple-700/80 dark:text-purple-300/80 italic text-center">Client externe : prix catalogue « externe » — <strong>jamais de remise</strong> (la remise est réservée aux clients comptoir comme réduction commerciale, ou accordée par contrat à certaines sociétés).</p>
                <button onClick={extPay} disabled={extLines.length === 0} className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"><CreditCard className="w-5 h-5" /> Encaisser {formatAr(extTotal)}</button>

              </div>
            </div>
          )}

          {/* LAB merged — lab items now paid in main payment or unified patient queue above */}

          {/* HOSPIT / BLOC */}
          {(tab === 'hospit' || tab === 'bloc') && (
            <div className="space-y-4">
              <div className={`p-3 rounded-lg border flex justify-between items-center ${tab === 'hospit' ? 'bg-rose-50 dark:bg-rose-500/8 border-rose-200 dark:border-rose-500/25' : 'bg-blue-50 dark:bg-cyan-500/8 border-blue-200 dark:border-cyan-500/25'}`}>
                <div>
                  <h3 className="font-bold flex items-center gap-2">{tab === 'hospit' ? <><Building2 className="w-5 h-5 text-rose-600 dark:text-rose-400" /> Hospitalisation</> : <><Heart className="w-5 h-5 text-blue-600 dark:text-cyan-400" /> Bloc Opératoire</>}</h3>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    Liste <strong>partagée</strong> entre la Caisse et la Pharmacie (caisse de garde).
                    Peu importe qui saisit (articles/bloc/hosp) — c'est le <strong>paiement</strong> qui fait foi.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {hbRecords.some(h => h.type === tab && h.dischargedAt) && (
                    <button onClick={() => setHbShowDischarged(v => !v)} className="px-3 py-1.5 rounded-lg cursor-pointer text-sm border border-line bg-surface hover:bg-surface-hover text-ink-secondary" title={hbShowDischarged ? 'Masquer les patients sortis' : 'Afficher les patients sortis'}>
                      {hbShowDischarged ? '🙈 Masquer les sortis' : `👁 Sortis (${hbRecords.filter(h => h.type === tab && h.dischargedAt).length})`}
                    </button>
                  )}
                  <button onClick={() => { setHbPatSearch(''); setHbModal('add_patient'); }} className={`px-3 py-1.5 text-white rounded-lg cursor-pointer text-sm flex items-center gap-1 ${tab === 'hospit' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}><UserPlus className="w-4 h-4" /> Ajouter Patient</button>
                </div>
              </div>

              {/* Records list */}
              {curHbRecords.length === 0 ? <div className="text-center py-8 text-ink-faint">{!hbShowDischarged && hbRecords.some(h => h.type === tab && h.dischargedAt) ? `Aucun patient présent — ${hbRecords.filter(h => h.type === tab && h.dischargedAt).length} sorti(s), affichables via « 👁 Sortis »` : 'Aucun patient'}</div>
                : curHbRecords.map(record => {
                  const totalFact = record.lines.reduce((s, l) => s + hbLineAmt(l), 0);
                  const totalPaid = record.payments.reduce((s, p) => s + p.amount, 0);
                  const reste = totalFact - totalPaid;
                  return (
                    <div key={record.id} className="border rounded-lg overflow-hidden border-line">
                      <div className="p-3 flex justify-between items-center bg-surface-muted">
                        <div>
                          <div className="font-bold text-sm flex items-center gap-2">{record.patientName}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${record.clientType === 'societe' ? 'bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400' : 'bg-surface-hover text-ink-secondary'}`}>{record.clientType === 'societe' ? `🏢 ${record.company}${record.subCompany ? ` / ${record.subCompany}` : ''}` : '🏪 Comptoir'}</span>
                            <button onClick={() => { setHbSelRecordId(record.id); setHbEditClientType(record.clientType); setHbEditCompany(record.company || ''); setHbEditSubCompany(record.subCompany || ''); setHbEditNewCompany(''); setHbModal('edit_client'); }} className="text-blue-500 cursor-pointer" title="Modifier société"><Edit2 className="w-3 h-3" /></button>
                          </div>
                          <div className="text-xs text-ink-muted mt-0.5">Facture: <strong>{formatAr(totalFact)}</strong> | Payé: <span className="text-green-600 dark:text-green-400">{formatAr(totalPaid)}</span> | Reste: <span className="text-red-600 dark:text-red-400 font-bold">{formatAr(reste)}</span></div>
                        </div>
                        <div className="flex gap-1 items-center flex-wrap" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setHbHistoryId(record.id)} title="Historique des paiements" className="px-2 py-1 bg-slate-600 hover:bg-slate-700 text-white rounded text-xs cursor-pointer transition font-medium">📜 Historique{record.payments.length > 0 ? ` (${record.payments.length})` : ''}</button>
                          <button onClick={() => { setHbSelRecordId(record.id); setHbArtSearch(''); setHbArtForm({ id: '', articleName: '', quantity: 1, unitPrice: 0, discount: 0, dateSort: new Date().toISOString().split('T')[0] }); setHbSelLineId(null); setHbIsNew(true); setHbModal('add_article'); }} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs cursor-pointer transition font-medium">📋 Prescriptions</button>
                          {totalFact === 0 && totalPaid === 0 && (
                            <button onClick={() => deleteHbRecord(record.id)} className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs cursor-pointer transition font-medium flex items-center gap-1" title="Supprimer ce dossier (Facture 0 Ar)"><Trash2 className="w-3.5 h-3.5" /> Supprimer</button>
                          )}
                          {reste > 0 && <>
                            <MoneyInput value={hbPayAmounts[record.id] || 0} onChange={n => setHbPayAmounts(prev => ({ ...prev, [record.id]: Math.max(0, Math.min(n, reste)) }))} decimals={2} className="w-24 px-2 py-1 border rounded text-xs text-right outline-none" placeholder="Montant" ariaLabel="Montant à payer" title="Montant à payer — séparateur de milliers automatique (ex : 49 450,00)" />
                            <button onClick={() => addPartialPay(record.id)} disabled={!hbPayAmounts[record.id] || hbPayAmounts[record.id] > reste} className="px-2 py-1 bg-amber-600 text-white rounded text-xs cursor-pointer disabled:opacity-40">💰 Payer</button>
                          </>}
                          {!record.dischargedAt ? (
                            <button onClick={() => openDischarge(record.id)} title="Enregistrer la sortie du patient" className="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs cursor-pointer transition font-medium">🚪 Sortie</button>
                          ) : (
                            <>
                              <span className="px-2 py-1 rounded text-xs bg-surface-hover text-ink-secondary" title={`Sortie enregistrée par ${record.dischargedBy || '—'}${record.dischargeDonneurOrdre ? ` — donneur d'ordre : ${record.dischargeDonneurOrdre}` : ''}${record.dischargeMotif ? ` — motif : ${record.dischargeMotif}` : ''}`}>🚪 Sorti le {new Date(record.dischargedAt).toLocaleDateString('fr-FR')}</span>
                              <button onClick={() => cancelDischarge(record.id)} title="Annuler la sortie (réadmettre le patient)" className="px-2 py-1 border border-line rounded text-xs cursor-pointer hover:bg-surface-hover text-ink-secondary">↩ Réadmettre</button>
                            </>
                          )}
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
              {existingClosing && <div className="bg-emerald-50 dark:bg-emerald-500/8 border border-emerald-200 dark:border-emerald-500/25 rounded-lg p-3 text-sm text-emerald-800 dark:text-emerald-300 flex justify-between items-center"><span>✓ Caisse clôturée à {new Date(existingClosing.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — {existingClosing.invoiceCount} facture(s)</span><button onClick={() => printSavedClosing(existingClosing)} className="underline font-semibold cursor-pointer">Réimprimer</button></div>}
              {!existingClosing && <div className="bg-amber-50 dark:bg-amber-500/8 border border-amber-200 dark:border-amber-500/25 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">{closeableInvoices.length} facture(s) non clôturée(s) à intégrer au ticket Z.</div>}

              {(() => {
                const pendingPharma = (state.pharmaDeliveryItems || []).filter((i: any) => !i.closingId);
                const totalQty = pendingPharma.reduce((s: number, d: any) => s + d.quantity, 0);
                const totalAmt = pendingPharma.reduce((s: number, d: any) => s + d.quantity * d.unitPrice, 0);
                if (pendingPharma.length === 0) {
                  return (
                    <div className="bg-emerald-50 dark:bg-emerald-500/8 border border-emerald-200 dark:border-emerald-500/25 rounded-lg p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                      <span>✓ Aucune livraison pharmacie en attente — compilation à jour</span>
                    </div>
                  );
                }
                return (
                  <div className="bg-purple-50 dark:bg-purple-500/8 border-2 border-purple-200 dark:border-purple-500/25 rounded-xl p-4 text-sm">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-2">📦 Compilation des livraisons & Clôture de garde — {pendingPharma.length} livraison(s) en attente</div>
                        <div className="text-xs text-purple-700 dark:text-purple-400 mt-1">Ce qui reste dans les livraisons constitue les livraisons effectuées avant la clôture de caisse / garde de la personne responsable de la pharmacie. La clôture de garde va créer ici la compilation définitive et l&apos;imprimer automatiquement.</div>
                        <div className="text-xs font-mono text-purple-800 dark:text-purple-300 mt-1.5">{totalQty} articles · {formatAr(totalAmt)}</div>
                      </div>
                      <div className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold">{pendingPharma.length} à compiler</div>
                    </div>
                  </div>
                );
              })()}

              {/* Section 1: Versements par famille */}
              <div className="bg-surface border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">1. Versements par famille (ma caisse)</h4><div className="grid grid-cols-3 gap-2"><div className="p-3 bg-green-50 dark:bg-green-500/8 rounded flex justify-between"><span>Consultations</span><span className="font-mono font-bold">{formatAr(myTodayTotal - myTodayExtTotal)}</span></div><div className="p-3 bg-purple-50 dark:bg-purple-500/8 rounded flex justify-between"><span>Ventes Ext.</span><span className="font-mono font-bold">{formatAr(myTodayExtTotal)}</span></div><div className="p-3 bg-rose-50 dark:bg-rose-500/8 rounded flex justify-between"><span>Hospit/Bloc</span><span className="font-mono font-bold">{formatAr(myTodayPartialTotal)}</span></div></div></div>

              {/* Section 2: Hospitalisation & Bloc */}
              {hbRecords.filter(h => h.payments.some(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString())).length > 0 && (
                <div className="bg-surface border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">2. Hospitalisation & Bloc (mes encaissements)</h4>
                  <table className="w-full text-xs"><thead className="bg-surface-hover"><tr><th className="p-2 text-left">Patient</th><th className="p-2">Type</th><th className="p-2 text-right">Facture</th><th className="p-2 text-right">Reçu</th><th className="p-2 text-right">Reste</th><th className="p-2">Caissier</th></tr></thead>
                    <tbody>
                      {hbRecords.filter(h => h.payments.some(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString())).map(h => {
                        const tf = h.lines.reduce((s,l) => s+hbLineAmt(l),0);
                        const tp = h.payments.filter(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString()).reduce((s,p) => s+p.amount,0);
                        const tpAll = h.payments.reduce((s,p) => s+p.amount,0);
                        return (<tr key={h.id} className="border-b"><td className="p-2">{h.patientName}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${h.type==='hospit'?'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400':'bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400'}`}>{h.type==='hospit'?'Hosp.':'Bloc'}</span></td><td className="p-2 text-right font-mono">{formatAr(tf)}</td><td className="p-2 text-right font-mono text-green-600 dark:text-green-400">{formatAr(tp)}</td><td className="p-2 text-right font-mono text-red-600 dark:text-red-400">{formatAr(tf-tpAll)}</td><td className="p-2">{h.payments.filter(p => p.paidByUserId === currentCashierId).map(p => p.paidBy).filter((v,i,a) => a.indexOf(v)===i).join(', ')}</td></tr>);
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Section 3: Total Général */}
              <div className="bg-gradient-to-r from-emerald-50 dark:from-emerald-950/60 to-green-50 dark:to-green-950/60 border-2 border-emerald-300 dark:border-emerald-500/40 rounded-lg p-6 text-center"><div className="text-sm text-ink-secondary">3. TOTAL GÉNÉRAL (ma caisse)</div><div className="text-4xl font-bold font-mono text-emerald-700 dark:text-emerald-400">{formatAr(myGrandTotal)}</div></div>

              {/* Section 4: Liste clients */}
              <div className="bg-surface border rounded-lg p-4"><h4 className="font-bold text-sm mb-2">4. Liste clients (mes encaissements)</h4>
                <table className="w-full text-xs"><thead className="bg-surface-hover"><tr><th className="p-2 text-left">Heure</th><th className="p-2 text-left">Client</th><th className="p-2">Type</th><th className="p-2 text-right">Montant</th><th className="p-2 text-center">Reçus / Bons / Facture A5</th></tr></thead><tbody>
                  {groupedMyTodayInvoices.map(group => {
                    const inv = group.mergedInvoice;
                    const pat = inv.patientId ? state.patients.find(p => p.id === inv.patientId) : null;
                    const comp = pat?.company ? state.companies.find(c => c.name === pat.company) : undefined;
                    return (
                      <tr key={group.key} className="border-b">
                        <td className="p-2 font-mono">{group.timeStr}</td>
                        <td className="p-2">{pat ? `${pat.lastName} ${pat.firstName}` : inv.clientName || 'Ext.'}
                          {inv.numeroFacture && <span className="block text-[10px] font-mono text-ink-faint" title="Numéro de facture">{inv.numeroFacture}</span>}
                        </td>
                        <td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${inv.isExternal ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400' : 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400'}`}>{inv.isExternal ? 'Externe' : 'Consult.'}</span>
                          {inv.copayTicketModerateur && (
                            <span className="block mt-1 px-1 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              title={`Quote-part de l'assuré encaissée en espèces — brut ${formatAr(inv.copayTicketModerateur.brut)}, crédit société ${formatAr(inv.copayTicketModerateur.partSociete)}`}>
                              Ticket mod.
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono font-bold">{formatAr(inv.patientCharge)}</td>
                        <td className="p-2 text-center space-y-1.5">
                          {receiptButtons(
                            // Un duplicata PAR PRESCRIPTION (chacune garde son numéro,
                            // son ticket et son bon d'examens : jamais fusionnées).
                            () => group.invoices.map(piece => prepareReceipts(group.invoices, piece)),
                            inv.items.some(item => item.category === 'lab'),
                            inv.items.some(item => item.category === 'echo'),
                          )}
                          {group.invoices.find(estPieceTicketModerateur) && (
                            <button
                              onClick={() => openThermalTicket(effectiveTicketSettings, group.invoices.find(estPieceTicketModerateur)!, pat || undefined, state.currentUser || undefined)}
                              className="px-2 py-1 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded text-[10px] font-bold text-amber-800 dark:text-amber-300 cursor-pointer inline-flex items-center gap-1"
                              title="Réimprimer le ticket modérateur"
                            >
                              <Printer className="w-3 h-3" /> Ticket mod.
                            </button>
                          )}
                          <button
                            onClick={() => printSalfaIndividualInvoice(effectiveTicketSettings, inv, pat || undefined, comp, invoiceNatureRemise(state, inv))}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold cursor-pointer inline-flex items-center gap-1"
                            title="Imprimer Reçu / Facture A5"
                          >
                            <FileText className="w-3 h-3" /> Facture A5
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {hbRecords.filter(h => h.payments.some(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString())).map(h => { const tp = h.payments.filter(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString()).reduce((s,p) => s+p.amount,0); return (<tr key={h.id} className="border-b"><td className="p-2 font-mono">{h.payments.filter(p => p.paidByUserId === currentCashierId && new Date(p.date).toDateString() === new Date().toDateString()).map(p => new Date(p.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})).join(', ')}</td><td className="p-2">{h.patientName}</td><td className="p-2 text-center"><span className={`px-1 py-0.5 rounded text-[10px] font-bold ${h.type==='hospit'?'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400':'bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400'}`}>{h.type==='hospit'?'Hosp.':'Bloc'}</span></td><td className="p-2 text-right font-mono font-bold">{formatAr(tp)}</td><td className="p-2 text-center text-ink-faint">—</td></tr>); })}
                </tbody><tfoot className="bg-emerald-50 dark:bg-emerald-500/8"><tr><td colSpan={3} className="p-2 text-right font-bold">TOTAL:</td><td className="p-2 text-right font-mono font-bold text-lg">{formatAr(myGrandTotal)}</td><td></td></tr></tfoot></table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === AJOUTER PATIENT — fenêtre modale centrée === */}
      {hbModal === 'add_patient' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setHbModal('none')}>
          <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-surface rounded-xl shadow-2xl border border-line-strong" onClick={(e) => e.stopPropagation()}>
          <div className={`px-4 py-3 flex justify-between items-center text-white sticky top-0 z-10 ${tab === 'hospit' ? 'bg-rose-600' : 'bg-blue-600'}`}><span className="font-bold"><UserPlus className="w-5 h-5 inline" /> Ajouter Patient — {tab === 'hospit' ? 'Hospitalisation' : 'Bloc'}</span><button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button></div>
          <div className="p-4 space-y-3">
            {/* Search existing */}
            <div><label className="block text-sm font-medium mb-1">Rechercher patient existant</label>
              <input type="text" value={hbPatSearch} onChange={e => { setHbPatSearch(e.target.value); setHbPatIdx(0); }} onKeyDown={suggestionNavKeyDown({ open: hbPatFiltered.length > 0, count: hbPatFiltered.length, index: hbPatIdx, onIndex: setHbPatIdx, onPick: (i) => { if (hbPatFiltered[i]) hbSelectPatient(hbPatFiltered[i].id); }, onEscape: () => setHbPatSearch('') })} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-accent/25" placeholder="🔍 Nom, prénom ou dossier... (↑↓ Entrée)" autoFocus />
              {hbPatFiltered.length > 0 && <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto">{hbPatFiltered.map((p, i) => (<div key={p.id} onClick={() => hbSelectPatient(p.id)} className={`p-2 cursor-pointer text-sm flex justify-between border-b ${i === hbPatIdx ? 'bg-blue-100 dark:bg-cyan-500/15' : 'hover:bg-blue-50 dark:hover:bg-cyan-500/8'}`}><span className="font-medium">{p.lastName} {p.firstName}</span><span className="text-ink-faint text-xs">{p.dossier} | {p.clientType === 'societe' ? `🏢 ${p.company}` : '🏪 Comptoir'}</span></div>))}</div>}
            </div>
            <div className="border-t pt-3">
              <h4 className="font-bold text-sm mb-2">Ou créer un nouveau patient :</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2">
                  <label className="block font-bold text-ink mb-0.5">N° Dossier *</label>
                  <SuggestionInput id="caisse-nouveau-dossier" value={hbNewPat.dossier} onChange={v => setHbNewPat({...hbNewPat, dossier: v.toUpperCase()})} suggestions={suggestionsDossiers} placeholder="SAISIE MANUELLE — MAJUSCULES" ariaLabel="Numéro de dossier" className="w-full px-2 py-1.5 border rounded outline-none uppercase font-mono font-bold bg-surface" />
                  <span className="text-[10px] text-ink-muted">Clé unique, jamais incrémentée automatiquement.</span>
                </div>
                <div className="col-span-2 flex items-center gap-3 mb-1">
                  <span className="font-bold text-ink">Sexe</span>
                  <div className="flex border border-line-control rounded overflow-hidden">
                    <button type="button" onClick={() => setHbNewPat({...hbNewPat, gender: 'M'})} className={`px-3 py-1 font-bold cursor-pointer ${hbNewPat.gender === 'M' ? 'bg-blue-500 text-white' : 'bg-surface'}`}>M</button>
                    <button type="button" onClick={() => setHbNewPat({...hbNewPat, gender: 'F'})} className={`px-3 py-1 font-bold border-l border-line-control cursor-pointer ${hbNewPat.gender === 'F' ? 'bg-pink-500 text-white' : 'bg-surface'}`}>F</button>
                  </div>
                </div>
                <div><label className="block font-bold text-ink mb-0.5">Nom *</label><SuggestionInput id="caisse-nouveau-nom" value={hbNewPat.lastName} onChange={v => setHbNewPat({...hbNewPat, lastName: v})} suggestions={suggestionsIdentite} placeholder="Nom de famille" ariaLabel="Nom" className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-surface" /></div>
                <div><label className="block font-bold text-ink mb-0.5">Prénom *</label><SuggestionInput id="caisse-nouveau-prenom" value={hbNewPat.firstName} onChange={v => setHbNewPat({...hbNewPat, firstName: v})} suggestions={suggestionsIdentite} placeholder="Prénom" ariaLabel="Prénom" className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-surface" /></div>
                <div><label className="block font-bold text-ink mb-0.5">Date Naissance</label><input type="date" value={hbNewPat.dateOfBirth} onChange={e => setHbNewPat({...hbNewPat, dateOfBirth: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none bg-surface" /></div>
                <div><label className="block font-bold text-ink mb-0.5">Age</label><input type="text" readOnly value={hbNewPat.dateOfBirth ? calculateAge(hbNewPat.dateOfBirth) : '—'} className="w-full px-2 py-1.5 border rounded bg-surface-hover" /></div>
                <div><label className="block font-bold text-ink mb-0.5">Matricule</label><input type="text" value={hbNewPat.matricule} onChange={e => setHbNewPat({...hbNewPat, matricule: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none font-mono bg-surface" placeholder="M-0000" /></div>
                <div><label className="block font-bold text-ink mb-0.5">Téléphone</label><PhoneInput value={hbNewPat.contact} onChange={v => setHbNewPat({...hbNewPat, contact: v})} className="w-full px-2 py-1.5 border rounded outline-none font-mono bg-surface" placeholder="038 34 092 61" /></div>
                <div className="col-span-2"><label className="block font-bold text-ink mb-0.5">Adresse</label><SuggestionInput id="caisse-nouveau-adresse" value={hbNewPat.address} onChange={v => setHbNewPat({...hbNewPat, address: v})} suggestions={suggestionsAdresses} placeholder="Adresse du patient" ariaLabel="Adresse" className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-surface" /></div>
                <div><label className="block font-bold text-ink mb-0.5">N° Sécurité Sociale</label><input type="text" value={hbNewPat.ssn} onChange={e => setHbNewPat({...hbNewPat, ssn: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none bg-surface" /></div>
                <div><label className="block font-bold text-ink mb-0.5">Société</label><input type="text" value={hbNewPat.insureName} onChange={e => setHbNewPat({...hbNewPat, insureName: e.target.value})} className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-surface" /></div>
                <div><label className="block font-bold text-ink mb-0.5">Type Client</label><select value={hbNewPat.clientType} onChange={e => setHbNewPat({...hbNewPat, clientType: e.target.value as ClientType})} className="w-full px-2 py-1.5 border rounded outline-none cursor-pointer bg-surface"><option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option></select></div>
                {hbNewPat.clientType === 'societe' && <div><label className="block font-bold text-ink mb-0.5">Société</label><SearchableSelect value={hbNewPat.company} onChange={v => setHbNewPat({...hbNewPat, company: v})} options={companyOptions(state.companies)} placeholder="— Taper pour filtrer puis choisir —" ariaLabel="Société" inputClassName="w-full px-2 py-1.5 border rounded outline-none bg-surface" /></div>}
                {hbNewPat.clientType === 'societe' && (
                  <div className="col-span-2 space-y-2">
                    <div className="flex gap-2">
                      <input type="text" value={hbNewCompanyName} onChange={e => setHbNewCompanyName(e.target.value.toUpperCase())} className="flex-1 px-2 py-1.5 border rounded outline-none uppercase bg-surface" placeholder="Nouvelle société partenaire…" />
                      <button type="button" onClick={() => { const name = addPartnerCompany(hbNewCompanyName); if (name) { setHbNewPat({...hbNewPat, company: name}); setHbNewCompanyName(''); } }} className="px-2 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold cursor-pointer">+ Société</button>
                    </div>
                    <div>
                      <label className="block font-bold text-ink mb-0.5">Sous-société</label>
                      <SuggestionInput mode="contient" value={hbNewPat.subCompany} onChange={v => setHbNewPat({...hbNewPat, subCompany: v})} suggestions={classerSuggestions(sousSocietesConnues(state, hbNewPat.company))} placeholder={"Sous-société" + (hbNewPat.company ? " de " + hbNewPat.company : "") + " — saisie libre"} ariaLabel="Sous-société" className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-surface" />
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
          <div className="w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-surface rounded-xl shadow-2xl border border-line-strong" onClick={(e) => e.stopPropagation()}>
            <div className="bg-emerald-600 px-4 py-3 flex justify-between items-center text-white sticky top-0 z-10">
              <span className="font-bold flex items-center gap-1">💊 Prescription (Saisie Sage) — {rec?.patientName} ({rec?.type === 'hospit' ? 'Hospitalisation' : 'Bloc'})</span>
              <button onClick={() => { if (rec && blockIfUnsavedDraftLine(hbArtForm, rec.lines, { entityLabel: 'l\'article' })) return; setHbModal('none'); }} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/25 bg-indigo-50 dark:bg-indigo-500/8 p-3 space-y-2">
                <div className="text-xs font-bold text-indigo-900 dark:text-indigo-300">🏢 Changement de société</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block font-bold text-ink mb-0.5">Type</label>
                    <select value={hbEditClientType} onChange={e => setHbEditClientType(e.target.value as ClientType)} className="w-full px-2 py-1.5 border rounded bg-surface cursor-pointer">
                      <option value="comptoir">Client Comptoir</option>
                      <option value="societe">Client Société</option>
                    </select>
                  </div>
                  {hbEditClientType === 'societe' && (
                    <div>
                      <label className="block font-bold text-ink mb-0.5">Société</label>
                      <SearchableSelect value={hbEditCompany} onChange={setHbEditCompany} options={companyOptions(state.companies)} placeholder="— Taper pour filtrer puis choisir —" ariaLabel="Société" inputClassName="w-full px-2 py-1.5 border rounded outline-none bg-surface" />
                    </div>
                  )}
                </div>
                {hbEditClientType === 'societe' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex gap-1">
                      <input type="text" value={hbEditNewCompany} onChange={e => setHbEditNewCompany(e.target.value.toUpperCase())} className="flex-1 px-2 py-1.5 border rounded uppercase bg-surface" placeholder="Ajouter une société…" />
                      <button type="button" onClick={() => { const name = addPartnerCompany(hbEditNewCompany); if (name) { setHbEditCompany(name); setHbEditNewCompany(''); } }} className="px-2 py-1.5 bg-indigo-600 text-white rounded font-bold">+</button>
                    </div>
                    <div>
                      <label className="block font-bold text-ink mb-0.5">Sous-société</label>
                      <SuggestionInput mode="contient" value={hbEditSubCompany} onChange={setHbEditSubCompany} suggestions={classerSuggestions(sousSocietesConnues(state, hbEditCompany))} placeholder={"Sous-société" + (hbEditCompany ? " de " + hbEditCompany : "") + " — saisie libre"} ariaLabel="Sous-société" className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-surface" />
                    </div>
                  </div>
                )}
                <button type="button" onClick={hbSaveClientType} className="px-3 py-1.5 bg-indigo-700 text-white rounded text-xs font-bold">Enregistrer le type / société</button>
              </div>
              {/* Sage-style input bar */}
              <div className="bg-surface-muted border border-line-strong rounded text-xs select-none">
                <div className="bg-surface-hover border-b border-line-strong p-2 m-2 mb-0 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-1.5">
                    <div className="flex-1 min-w-[150px] relative">
                      <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Article (↑↓ Entrée)</label>
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
                        className="w-full bg-surface border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent/25 text-ink-strong"
                        placeholder="🔍 Saisir article..."
                        autoFocus
                      />
                      {hbArtSearch.length >= 1 && hbArtFiltered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-surface border border-line-strong rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                          {hbArtFiltered.map((a, idx) => {
                            const manages = managesStock(a);
                            const isOut = manages && a.stockPharmacie <= 0;
                            const isLow = manages && !isOut && a.stockPharmacie <= a.minStockPharmacie && !a.alertDisabledPharmacie;
                            return (
                            <div
                              key={a.id}
                              onClick={() => hbArtSelectArticle(a.id)}
                              title={isOut ? 'Rupture de stock — vente impossible' : undefined}
                              className={`px-3 py-1.5 text-xs flex justify-between border-b border-line-soft ${isOut ? 'bg-red-50 dark:bg-red-500/8 text-red-700 dark:text-red-400 cursor-not-allowed' : `cursor-pointer ${idx === hbArtIdx ? 'bg-blue-500 text-white font-medium' : 'hover:bg-surface-muted text-ink-strong'}`}`}
                            >
                              <span className={isOut ? 'line-through decoration-red-400/60' : ''}>[{a.family}] {a.name}</span>
                              <span className="flex items-center gap-2">
                                {isOut
                                  ? <span className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[9px] font-bold">🚨 RUPTURE — invendable</span>
                                  : manages
                                    ? <span className={`font-mono text-[10px] ${idx === hbArtIdx ? 'text-white/90' : isLow ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-ink-faint'}`}>Stock: {a.stockPharmacie}{isLow ? ' ⚠️' : ''}</span>
                                    : <span className={`font-mono text-[10px] ${idx === hbArtIdx ? 'text-white/80' : 'text-ink-faint'}`} title="Famille non gérée en stock">stock: —</span>}
                                <span className={`font-mono ${isOut ? 'text-red-400' : idx === hbArtIdx ? 'text-white' : 'text-blue-600 dark:text-cyan-400 font-medium'}`}>{formatAr(getPrice(a, rec?.clientType || 'comptoir'))}</span>
                              </span>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="w-16">
                      <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Qté</label>
                      <input
                        id="hb-qty-input"
                        type="number"
                        min={1}
                        value={hbArtForm.quantity}
                        onChange={e => setHbArtForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 1 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong"
                      />
                    </div>
                    <div className="w-16">
                      <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Rem%</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={hbArtForm.discount}
                        onChange={e => setHbArtForm(prev => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-ink-muted mb-0.5">P.U.</label>
                      <MoneyInput
                        value={hbArtForm.unitPrice}
                        onChange={n => setHbArtForm(prev => ({ ...prev, unitPrice: n }))}
                        decimals={2}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        ariaLabel="Prix unitaire"
                        title="Prix unitaire — séparateur de milliers automatique (ex : 49 450)"
                        className="w-full bg-surface border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-accent text-ink-strong"
                      />
                    </div>
                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-ink-muted mb-0.5">Montant</label>
                      <input
                        readOnly
                        value={formatAr(hbLineAmt(hbArtForm))}
                        className="w-full bg-surface-active border border-line-strong rounded px-1.5 py-0.5 text-xs text-right font-mono font-bold text-ink"
                      />
                    </div>
                    <div className="w-36">
                      <label className="block text-[10px] font-bold text-ink-muted mb-0.5" title="Cette zone n'est pas effacée après validation de la ligne : plusieurs sorties possibles le même jour">Date d'acte / de sortie 📌</label>
                      <input
                        type="date"
                        value={hbArtForm.dateSort || ''}
                        onChange={e => setHbArtForm(prev => ({ ...prev, dateSort: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); hbArtSave(); } }}
                        className="w-full bg-amber-50 dark:bg-amber-500/8 border border-amber-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-accent text-ink-strong"
                        title="Date de sortie de marchandise ou date de l'acte — conservée après validation de la ligne"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5 mt-2">
                    <button
                      onClick={hbArtNew}
                      className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-muted border border-line-strong rounded shadow-sm text-ink transition cursor-pointer text-xs font-medium"
                    >
                      <Plus className="h-3.5 w-3.5 text-ink-muted" /> Nouveau
                    </button>
                    <button
                      onClick={hbArtDelete}
                      disabled={!hbSelLineId}
                      className="flex items-center gap-1 px-2.5 py-1 bg-surface hover:bg-surface-muted border border-line-strong rounded shadow-sm text-ink disabled:opacity-40 transition cursor-pointer text-xs font-medium"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" /> Supprimer
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
                <div className="bg-surface mx-2 mb-2 border-t border-line-strong overflow-x-auto rounded-b max-h-[250px] overflow-y-auto">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-surface-muted border-b border-line-strong text-ink-secondary">
                      <tr className="divide-x divide-line">
                        <th className="p-1 font-normal min-w-[150px]">Article</th>
                        <th className="p-1 font-normal text-right w-12">Qté</th>
                        <th className="p-1 font-normal text-center w-12">Rem%</th>
                        <th className="p-1 font-normal text-right w-20">P.U.</th>
                        <th className="p-1 font-normal text-right w-24">Montant</th>
                        <th className="p-1 font-normal w-36">Date d'acte / de sortie</th>
                        <th className="p-1 font-normal w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line font-mono">
                      {rec && rec.lines.map(l => {
                        const isSel = l.id === hbSelLineId;
                        return (
                          <tr key={l.id} onClick={() => {
                            setHbSelLineId(l.id);
                            setHbArtForm({ ...l });
                            setHbIsNew(false);
                          }} className={`cursor-pointer divide-x divide-line transition-colors ${isSel ? 'bg-blue-500 text-white font-medium' : 'hover:bg-surface-muted text-ink-strong'}`}>
                            <td className="p-1 font-sans">{l.articleName}</td>
                            <td className="p-1 text-right">{l.quantity}</td>
                            <td className="p-1 text-center">{l.discount ? `${l.discount}%` : '—'}</td>
                            <td className="p-1 text-right">{formatNum(l.unitPrice)}</td>
                            <td className="p-1 text-right font-bold">{formatNum(hbLineAmt(l))}</td>
                            <td className="p-1 font-sans text-ink-muted">{l.dateSort || '—'}</td>
                            <td className="p-1 text-center">
                              <button onClick={(e) => {
                                e.stopPropagation();
                                updateHbRecords(hbRecords.map(r => r.id === hbSelRecordId ? { ...r, lines: r.lines.filter(x => x.id !== l.id) } : r));
                                if (hbSelLineId === l.id) {
                                  hbArtNew();
                                }
                              }} className={`cursor-pointer ${isSel ? 'text-white hover:text-red-200' : 'text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300'}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {rec && rec.lines.length === 0 && (
                        <tr><td colSpan={6} className="p-4 text-center text-ink-faint font-sans">Aucun article enregistré. Tapez ou recherchez un article ci-dessus.</td></tr>
                      )}
                    </tbody>
                    {rec && rec.lines.length > 0 && (
                      <tfoot className="bg-emerald-50 dark:bg-emerald-500/8 border-t-2 border-emerald-300 dark:border-emerald-500/40 text-ink-strong font-sans">
                        <tr className="font-bold">
                          <td colSpan={3} className="p-1.5 text-right">TOTAL PATIENT :</td>
                          <td colSpan={3} className="p-1.5 text-right font-mono text-lg text-emerald-700 dark:text-emerald-400">{formatAr(recTotal)}</td>
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
          <div className="w-full max-w-md bg-surface rounded-xl shadow-2xl border border-line-strong overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-blue-600 px-4 py-3 flex justify-between items-center text-white"><span className="font-bold"><Edit2 className="w-5 h-5 inline" /> Modifier Type Client</span><button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button></div>
            <div className="p-4 space-y-3">
              <div><label className="block text-sm font-medium mb-1">Type</label><select value={hbEditClientType} onChange={e => setHbEditClientType(e.target.value as ClientType)} className="w-full px-3 py-2 border rounded-lg outline-none cursor-pointer"><option value="comptoir">Client Comptoir</option><option value="societe">Client Société</option></select></div>
              {hbEditClientType === 'societe' && <div><label className="block text-sm font-medium mb-1">Société</label><SearchableSelect value={hbEditCompany} onChange={setHbEditCompany} options={companyOptions(state.companies)} placeholder="— Taper pour filtrer puis choisir —" ariaLabel="Société" inputClassName="w-full px-3 py-2 border rounded-lg outline-none bg-surface" /></div>}
              <button onClick={hbSaveClientType} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sortie (Hospitalisation / Bloc) */}
      {hbModal === 'discharge' && hbSelRecordId && (() => {
        const record = hbRecords.find(r => r.id === hbSelRecordId);
        if (!record || record.dischargedAt) return null;
        const totalFact = record.lines.reduce((s, l) => s + hbLineAmt(l), 0);
        const totalPaid = record.payments.reduce((s, p) => s + p.amount, 0);
        const reste = hbReste(record);
        // Hors société (comptoir…) au paiement incomplet : motif + donneur d'ordre obligatoires.
        const exigeJustificatif = record.clientType !== 'societe' && reste > 0;
        const peutValider = !exigeJustificatif || (hbDischargeMotif.trim() !== '' && hbDischargeDonneur.trim() !== '');
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setHbModal('none')}>
            <div className="w-full max-w-md bg-surface rounded-xl shadow-2xl border border-line-strong overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-teal-600 px-4 py-3 flex justify-between items-center text-white"><span className="font-bold">🚪 Sortie — {record.type === 'hospit' ? 'Hospitalisation' : 'Bloc Opératoire'}</span><button onClick={() => setHbModal('none')} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button></div>
              <div className="p-4 space-y-3">
                <div className="text-sm"><strong>{record.patientName}</strong>{record.numeroFacture && <span className="ml-2 font-mono text-xs text-ink-faint">{record.numeroFacture}</span>}</div>
                <div className="p-3 rounded-lg bg-surface-muted border border-line text-sm flex justify-between gap-2 flex-wrap">
                  <span>Facture : <strong>{formatAr(totalFact)}</strong></span>
                  <span>Payé : <strong className="text-green-600 dark:text-green-400">{formatAr(totalPaid)}</strong></span>
                  <span>Reste : <strong className={reste > 0 ? 'text-red-600 dark:text-red-400' : ''}>{formatAr(reste)}</strong></span>
                </div>
                {exigeJustificatif ? (
                  <>
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/8 border border-amber-200 dark:border-amber-500/25 text-xs text-amber-800 dark:text-amber-300">
                      ⚠️ <strong>Paiement incomplet</strong> (reste {formatAr(reste)}). La sortie exige un <strong>motif</strong> et un <strong>donneur d'ordre</strong>.
                    </div>
                    <div><label className="block text-sm font-medium mb-1">Motif de la sortie *</label><input value={hbDischargeMotif} onChange={e => setHbDischargeMotif(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none" placeholder="Ex : transfert, accord direction, urgence familiale…" /></div>
                    <div><label className="block text-sm font-medium mb-1">Donneur d'ordre *</label><input value={hbDischargeDonneur} onChange={e => setHbDischargeDonneur(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none" placeholder="Ex : Dr Rabe, Directeur, Chef de service…" /></div>
                  </>
                ) : (
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/8 border border-emerald-200 dark:border-emerald-500/25 text-xs text-emerald-800 dark:text-emerald-300">
                    {record.clientType === 'societe' ? `🏢 Client société (${record.company || '—'}) : le solde sera facturé à la société.` : '✅ Facture soldée : sortie simple.'}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setHbModal('none')} className="flex-1 py-2 border border-line rounded-lg hover:bg-surface-muted cursor-pointer">Annuler</button>
                  <button onClick={confirmDischarge} disabled={!peutValider} className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg cursor-pointer disabled:opacity-40 font-semibold">Confirmer la sortie</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Message Rectification Prescription */}
      {rectificationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg bg-surface rounded-xl shadow-2xl border border-line-strong overflow-hidden flex flex-col">
            <div className="bg-indigo-600 px-4 py-3 flex justify-between items-center text-white">
              <span className="font-bold text-sm flex items-center gap-2">
                <MessageCircle className="w-4 h-4" /> Message de rectification — {rectificationModal.doctorName}
              </span>
              <button onClick={() => setRectificationModal(null)} className="hover:bg-white/20 rounded p-1 cursor-pointer text-sm">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-500/8 border border-indigo-100 dark:border-indigo-500/25 rounded-lg text-xs text-indigo-900 dark:text-indigo-300 leading-relaxed">
                <strong>Destinataire :</strong> {rectificationModal.doctorName}<br />
                <strong>Concerne :</strong> Prescription du patient <strong>{rectificationModal.patientName}</strong> (Dossier: {rectificationModal.dossier})
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Message au médecin pour rectification d'une prescription déjà faite :</label>
                <textarea
                  value={rectificationText}
                  onChange={(e) => setRectificationText(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-sans text-ink-strong"
                  placeholder="Expliquez la rectification à effectuer sur la prescription..."
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  onClick={() => setRectificationModal(null)}
                  className="px-3.5 py-2 border border-line-strong rounded-lg text-xs font-medium cursor-pointer hover:bg-surface-muted transition"
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
                    className="px-3.5 py-2 bg-surface-hover hover:bg-surface-active text-ink rounded-lg text-xs font-medium cursor-pointer transition"
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
            <div className="w-full max-w-md bg-surface rounded-xl shadow-2xl border border-line-strong overflow-hidden flex flex-col">
              <div className={`${titleColor} px-4 py-3 flex justify-between items-center text-white`}>
                <span className="font-bold text-sm">📜 Historique des paiements — {rec.patientName}</span>
                <button onClick={() => setHbHistoryId(null)} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-surface-muted rounded"><div className="text-ink-muted">Facture</div><div className="font-mono font-bold text-ink-strong">{formatAr(totalFact)}</div></div>
                  <div className="p-2 bg-green-50 dark:bg-green-500/8 rounded"><div className="text-ink-muted">Reçu</div><div className="font-mono font-bold text-green-700 dark:text-green-400">{formatAr(totalPaid)}</div></div>
                  <div className="p-2 bg-red-50 dark:bg-red-500/8 rounded"><div className="text-ink-muted">Reste</div><div className="font-mono font-bold text-red-700 dark:text-red-400">{formatAr(totalFact - totalPaid)}</div></div>
                </div>
                {rec.payments.length === 0 ? (
                  <p className="text-center text-ink-faint text-sm py-6">Aucun paiement enregistré pour ce dossier.</p>
                ) : (
                  <div className="space-y-2 max-h-[55vh] overflow-y-auto">
                    {rec.payments.slice().reverse().map((p, i) => (
                      <div key={i} className="border rounded-lg p-3 bg-surface shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatAr(p.amount)}</span>
                          <span className="text-[10px] text-ink-faint">{new Date(p.date).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                        </div>
                        <div className="text-xs text-ink-secondary mt-1.5 flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.receivedBy === 'pharmacie' ? 'bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400' : 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>
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
          <div className="w-full max-w-3xl bg-surface rounded-xl shadow-2xl border border-line-strong overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-600 px-4 py-3 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Facturation — {selPatient.lastName} {selPatient.firstName}
                </span>
              </div>
              <button onClick={closePaymentModal} className="hover:bg-white/20 rounded p-1 cursor-pointer text-sm" title="Fermer">✕</button>
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="p-4 bg-amber-50 dark:bg-amber-500/8 border border-amber-200 dark:border-amber-500/25 rounded-xl mb-3 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-base text-ink-strong flex items-center gap-1.5 flex-wrap">
                      <span>{selPatient.lastName} {selPatient.firstName}</span>
                      <span className="font-mono">({selPatient.dossier})</span>
                      {selPatient.clientType === 'societe'
                        ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-cyan-500/15 text-blue-700 dark:text-cyan-400">🏢 {selPatient.company || 'Société'}{selPatient.subCompany ? ` / ${selPatient.subCompany}` : ''}</span>
                        : <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-surface-hover text-ink-secondary">🏪 Comptoir</span>}
                      <button
                        type="button"
                        onClick={() => setShowPayClientTypeEdit(v => !v)}
                        className="ml-0.5 p-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 rounded transition cursor-pointer"
                        title="Modifier le type de client / société"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </h3>
                    <p className="text-xs text-ink-secondary mt-0.5">{selConsult ? `Consultation du ${new Date(selConsult.date).toLocaleDateString('fr-FR')} | Diagnostic: ${selConsult.diagnosis}` : 'Analyses / Services en attente'}</p>
                  </div>
                </div>

                {/* AFFICHAGE NOM DU MÉDECIN PRESCRIPTEUR & BOUTON MESSAGE RECTIFICATION */}
                <div className="pt-2.5 border-t border-amber-200/80 dark:border-amber-500/20 flex flex-wrap items-center justify-between gap-3 bg-surface/80 p-3 rounded-lg border border-amber-100 dark:border-amber-500/25">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">🩺</div>
                    <div>
                      <div className="text-[10px] text-ink-muted uppercase tracking-wider font-semibold">Médecin Prescripteur</div>
                      <div className="text-sm font-bold text-indigo-900 dark:text-indigo-300">{selConsult?.doctorName || getConsults(selPatient.id)[0]?.doctorName || 'Médecin non spécifié'}</div>
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
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/25 bg-indigo-50 dark:bg-indigo-500/8 p-3 space-y-2">
                <div className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">🏢 Société / Type client
                  <button type="button" onClick={() => setShowPayClientTypeEdit(false)} className="ml-auto text-indigo-500 hover:text-indigo-800 dark:hover:text-indigo-300 cursor-pointer" title="Fermer">✕</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block font-bold text-ink mb-0.5">Type</label>
                    <select value={payEditClientType} onChange={e => setPayEditClientType(e.target.value as ClientType)} className="w-full px-2 py-1.5 border rounded bg-surface cursor-pointer">
                      <option value="comptoir">Client Comptoir</option>
                      <option value="societe">Client Société</option>
                    </select>
                  </div>
                  {payEditClientType === 'societe' && (
                    <div>
                      <label className="block font-bold text-ink mb-0.5">Société</label>
                      <SearchableSelect value={payEditCompany} onChange={setPayEditCompany} options={companyOptions(state.companies)} placeholder="— Taper pour filtrer puis choisir —" ariaLabel="Société" inputClassName="w-full px-2 py-1.5 border rounded outline-none bg-surface" />
                    </div>
                  )}
                </div>
                {payEditClientType === 'societe' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex gap-1">
                      <input type="text" value={payEditNewCompany} onChange={e => setPayEditNewCompany(e.target.value.toUpperCase())} className="flex-1 px-2 py-1.5 border rounded uppercase bg-surface" placeholder="Nouvelle société…" />
                      <button type="button" onClick={() => { const name = addPartnerCompany(payEditNewCompany); if (name) { setPayEditCompany(name); setPayEditNewCompany(''); }}} className="px-2 py-1.5 bg-indigo-600 text-white rounded font-bold">+</button>
                    </div>
                    <div>
                      <label className="block font-bold text-ink mb-0.5">Sous-société</label>
                      <SuggestionInput mode="contient" value={payEditSubCompany} onChange={setPayEditSubCompany} suggestions={classerSuggestions(sousSocietesConnues(state, payEditCompany))} placeholder={"Sous-société" + (payEditCompany ? " de " + payEditCompany : "") + " — saisie libre"} ariaLabel="Sous-société" className="w-full px-2 py-1.5 border rounded outline-none uppercase bg-surface" />
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={paySaveClientType} className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded text-xs font-bold cursor-pointer">Enregistrer type / société</button>
                  <button type="button" onClick={() => setShowPayClientTypeEdit(false)} className="px-3 py-1.5 bg-surface border border-line-strong hover:bg-surface-hover text-ink rounded text-xs font-bold cursor-pointer">Annuler</button>
                </div>
              </div>
              )}

              {/* === LISTE DES ARTICLES DE LA PRESCRIPTION SÉLECTIONNÉE === */}
              <div className="border rounded-lg overflow-hidden mb-3">
                <div className="bg-surface-hover px-3 py-2 border-b font-bold text-sm text-ink flex items-center justify-between">
                  <span>📋 Articles à facturer</span>
                  {piecesPayees.length === 1 && (
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 font-mono">
                      {piecesPayees[0].resume || piecesPayees[0].label}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-muted border-b text-ink-secondary sticky top-0">
                      <tr>
                        <th className="p-2 text-left min-w-[120px]">Article</th>
                        <th className="p-2 text-center w-8">Qté</th>
                        <th className="p-2 text-center w-8">Rem%</th>
                        <th className="p-2 text-right w-16">P.U.</th>
                        <th className="p-2 text-right w-20">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(() => {
                        const pieces = piecesPayees;
                        const societeClient = selPatient.clientType === 'societe';
                        if (pieces.length === 0) {
                          return <tr><td colSpan={5} className="p-4 text-center text-ink-faint">Aucune prescription sélectionnée — veuillez en choisir une</td></tr>;
                        }
                        const lignesDePiece = (piece: typeof pieces[number]) => piece.items.map(it => {
                          const qty = it.quantity || 1;
                          const brut = brutLigneDepuisItem(it);
                          return {
                            description: it.description, quantity: qty, discount: it.discount || 0,
                            unitPrice: societeClient ? (qty > 0 ? roundTo2(brut / qty) : brut) : (it.unitPrice || it.amount),
                            amount: societeClient ? brut : it.amount,
                          };
                        });
                        return pieces.flatMap((piece) =>
                          lignesDePiece(piece).map((item, idx) => (
                            <tr
                              key={`${piece.key}-${idx}`}
                              className="hover:bg-surface-muted transition-colors"
                            >
                              <td className="p-2 font-sans">
                                <span>{item.description}</span>
                              </td>
                              <td className="p-2 text-center font-mono">{item.quantity || '—'}</td>
                              <td className="p-2 text-center font-mono text-amber-700 dark:text-amber-400 font-semibold">{item.discount ? `${item.discount}%` : '—'}</td>
                              <td className="p-2 text-right font-mono">{item.unitPrice ? formatNum(Number(item.unitPrice)) : '—'}</td>
                              <td className="p-2 text-right font-mono font-bold">{formatNum(item.amount)}</td>
                            </tr>
                          ))
                        );
                      })()}
                    </tbody>
                    <tfoot className="bg-amber-50 dark:bg-amber-500/8 border-t-2 border-amber-300 dark:border-amber-500/40">
                      <tr>
                        <td colSpan={4} className="p-2 text-right font-bold font-sans">
                          TOTAL :
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-amber-700 dark:text-amber-400 text-sm">
                          {formatAr(selPatient.clientType === 'societe'
                            ? (copayPreview?.brut ?? 0)
                            : roundTo2(piecesPayees.flatMap(piece => piece.items).reduce((ss, it) => ss + (Number(it.amount) || 0), 0)))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

               {/* === RÉCAPITULATIF PAR FAMILLE D'ARTICLES — remplace l'ancien tableau Pièce/Brut/Ticket mod. === */}
              {recapParFamille && recapParFamille.parFamille.length > 0 && (
                <div className="mb-3 border border-line rounded-lg overflow-hidden">
                  <div className="bg-surface-muted px-2.5 py-1.5 border-b border-line text-[11px] font-bold text-ink flex items-center gap-1.5">
                    📦 Récapitulatif par famille d'articles
                    <span className="ml-auto font-normal text-ink-muted">{recapParFamille.parFamille.length} famille(s) · {piecesPayees.flatMap(p => p.items).length} article(s)</span>
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-surface-muted text-ink-muted">
                        <th className="text-left p-1.5 font-semibold">Famille</th>
                        <th className="text-center p-1.5 font-semibold">Nb</th>
                        <th className="text-right p-1.5 font-semibold">Brut</th>
                        {selPatient.clientType === 'societe' ? (
                          <>
                            <th className="text-right p-1.5 font-semibold">{recapParFamille.natureGlobale === 'remise' || recapParFamille.hasRemise ? 'Remise' : 'Ticket mod. (à payer)'}</th>
                            <th className="text-right p-1.5 font-semibold">Crédit Société</th>
                          </>
                        ) : (
                          <th className="text-right p-1.5 font-semibold">Montant</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {recapParFamille.parFamille.map(f => (
                        <tr key={f.famille} className="border-t border-line-soft">
                          <td className="p-1.5 font-bold">{f.famille}</td>
                          <td className="p-1.5 text-center font-mono">{f.count}</td>
                          <td className="p-1.5 text-right font-mono">{formatAr(f.brut)}</td>
                          {selPatient.clientType === 'societe' ? (
                            <>
                              <td className={`p-1.5 text-right font-mono font-bold ${f.nature === 'remise' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {formatAr(f.nature === 'remise' ? f.remise : f.ticket)}
                              </td>
                              <td className="p-1.5 text-right font-mono font-bold text-blue-700 dark:text-cyan-400">{formatAr(f.partSoc)}</td>
                            </>
                          ) : (
                            <td className="p-1.5 text-right font-mono font-bold">{formatAr(f.brut)}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-line bg-surface-muted/60 font-bold">
                        <td className="p-1.5">TOTAL</td>
                        <td className="p-1.5 text-center font-mono">{recapParFamille.parFamille.reduce((s, f) => s + f.count, 0)}</td>
                        <td className="p-1.5 text-right font-mono">{formatAr(recapParFamille.totalBrut)}</td>
                        {selPatient.clientType === 'societe' ? (
                          <>
                            <td className={`p-1.5 text-right font-mono ${recapParFamille.natureGlobale === 'remise' || recapParFamille.hasRemise ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                              {formatAr(recapParFamille.hasRemise && recapParFamille.totalTicket === 0 ? recapParFamille.totalRemise : recapParFamille.totalTicket)}
                            </td>
                            <td className="p-1.5 text-right font-mono text-blue-700 dark:text-cyan-400">{formatAr(recapParFamille.totalPartSoc)}</td>
                          </>
                        ) : (
                          <td className="p-1.5 text-right font-mono">{formatAr(recapParFamille.totalBrut)}</td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                  {selPatient.clientType === 'societe' && !recapParFamille.societe && (
                    <div className="p-1.5 text-[10px] bg-orange-50 dark:bg-orange-500/10 text-orange-800 dark:text-orange-300">
                      ⚠ Société « {selPatient.company || 'inconnue'} » non reconnue dans la base assurance — quote-part calculée par défaut ou ajustable manuellement.
                    </div>
                  )}
                </div>
              )}

              {selPatient.clientType === 'societe' && copayPreview && (
                <div className="p-3 bg-amber-50/80 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl mb-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          Client Société{selPatient.company ? ` — ${selPatient.company}` : ''}
                        </div>
                        <div className="text-[11px] text-amber-800/90 dark:text-amber-300 flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span>Couverture Sté : <strong>{formatAr(partSocieteEffective)}</strong> ({copayPreview.brut > 0 ? Math.round((partSocieteEffective / copayPreview.brut) * 100) : copayPreview.taux}%)</span>
                          <span>•</span>
                          <span>Ticket modérateur : <strong className="text-amber-900 dark:text-amber-200">{formatAr(copayDu)}</strong> ({copayPreview.brut > 0 ? Math.round((copayDu / copayPreview.brut) * 100) : 0}%)</span>
                          {isCustomCopay && (
                            <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-200/80 dark:bg-amber-500/25 px-1.5 py-0.2 rounded">
                              Ajusté
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isCustomCopay && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomTicketModerateur(null);
                          setCopayCash(defaultCopayDu > 0 ? String(defaultCopayDu) : '');
                        }}
                        className="text-[10px] font-bold text-blue-700 dark:text-cyan-400 bg-blue-50 dark:bg-cyan-500/15 hover:bg-blue-100 px-2 py-1 rounded-md border border-blue-200 dark:border-cyan-500/30 cursor-pointer shrink-0"
                      >
                        ↺ Rétablir standard ({formatAr(defaultCopayDu)})
                      </button>
                    )}
                  </div>

                  {/* Encaissement des espèces si ticket modérateur > 0 */}
                  {copayDu > 0 ? (
                    <div className="pt-2 border-t border-amber-200 dark:border-amber-500/20 space-y-2">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[160px]">
                          <div className="flex items-center justify-between mb-0.5">
                            <label htmlFor="copayCash" className="block text-[11px] font-bold text-amber-900 dark:text-amber-300">
                              Espèces reçues du patient :
                            </label>
                            <button
                              type="button"
                              onClick={() => setCopayCash(String(copayDu))}
                              className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 underline cursor-pointer"
                            >
                              Montant exact ({formatAr(copayDu)})
                            </button>
                          </div>
                          <MoneyInput
                            id="copayCash"
                            value={Number(copayCash) || 0}
                            onChange={n => setCopayCash(n === 0 ? '' : String(n))}
                            decimals={2}
                            ariaLabel="Espèces reçues pour le ticket modérateur"
                            title="Espèces reçues — séparateur de milliers automatique (ex : 49 450,00)"
                            className={`w-full px-3 py-2 border rounded-lg bg-surface font-mono text-sm font-bold focus:outline-none focus:ring-2 ${copayManquant > 0 ? 'border-rose-400 focus:ring-rose-400' : 'border-amber-300 focus:ring-amber-500'}`}
                          />
                        </div>
                        <div className="text-xs font-mono pb-2">
                          {copayManquant > 0 ? (
                            <span className="font-bold text-rose-600 dark:text-rose-400">Reste à encaisser : {formatAr(copayManquant)}</span>
                          ) : (
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">Monnaie à rendre : {formatAr(copayMonnaie)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-blue-50/80 dark:bg-cyan-500/10 border border-blue-200 dark:border-cyan-500/20 rounded-lg text-xs text-blue-900 dark:text-cyan-200 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-600 dark:text-cyan-400 shrink-0" />
                      <span>Prise en charge intégrale à 100 % : <strong>0 Ar</strong> à la charge du patient, totalité portée en <strong>Crédit Société ({formatAr(copayPreview.brut)})</strong>.</span>
                    </div>
                  )}

                  {/* Raccourcis ajustement en bas de espèces reçues du patient */}
                  <div className="pt-2 border-t border-amber-200 dark:border-amber-500/20">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-amber-900/80 dark:text-amber-300 font-semibold text-[10px] mr-1">Raccourcis ajustement :</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomTicketModerateur(0);
                            setCopayCash('');
                          }}
                          className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${copayDu === 0 ? 'bg-blue-600 text-white' : 'bg-surface hover:bg-surface-hover text-ink border border-amber-300 dark:border-amber-500/30'}`}
                        >
                          0% (100% Sté)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = roundTo2(copayPreview.brut * 0.1);
                            setCustomTicketModerateur(next);
                            setCopayCash(next > 0 ? String(next) : '');
                          }}
                          className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${Math.round((copayDu / (copayPreview.brut || 1)) * 100) === 10 ? 'bg-amber-600 text-white' : 'bg-surface hover:bg-surface-hover text-ink border border-amber-300 dark:border-amber-500/30'}`}
                        >
                          10%
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = roundTo2(copayPreview.brut * 0.2);
                            setCustomTicketModerateur(next);
                            setCopayCash(next > 0 ? String(next) : '');
                          }}
                          className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${Math.round((copayDu / (copayPreview.brut || 1)) * 100) === 20 ? 'bg-amber-600 text-white' : 'bg-surface hover:bg-surface-hover text-ink border border-amber-300 dark:border-amber-500/30'}`}
                        >
                          20% (Standard)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = roundTo2(copayPreview.brut * 0.3);
                            setCustomTicketModerateur(next);
                            setCopayCash(next > 0 ? String(next) : '');
                          }}
                          className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${Math.round((copayDu / (copayPreview.brut || 1)) * 100) === 30 ? 'bg-amber-600 text-white' : 'bg-surface hover:bg-surface-hover text-ink border border-amber-300 dark:border-amber-500/30'}`}
                        >
                          30%
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = roundTo2(copayPreview.brut * 0.5);
                            setCustomTicketModerateur(next);
                            setCopayCash(next > 0 ? String(next) : '');
                          }}
                          className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${Math.round((copayDu / (copayPreview.brut || 1)) * 100) === 50 ? 'bg-amber-600 text-white' : 'bg-surface hover:bg-surface-hover text-ink border border-amber-300 dark:border-amber-500/30'}`}
                        >
                          50%
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = copayPreview.brut;
                            setCustomTicketModerateur(next);
                            setCopayCash(next > 0 ? String(next) : '');
                          }}
                          className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition ${copayDu === copayPreview.brut ? 'bg-amber-600 text-white' : 'bg-surface hover:bg-surface-hover text-ink border border-amber-300 dark:border-amber-500/30'}`}
                        >
                          100% (Tout patient)
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Diminuer de 5 000 Ar"
                          onClick={() => {
                            const next = Math.max(0, copayDu - 5000);
                            setCustomTicketModerateur(next);
                            setCopayCash(next > 0 ? String(next) : '');
                          }}
                          className="px-1.5 py-0.5 text-[10px] font-bold bg-surface hover:bg-surface-hover border border-amber-300 dark:border-amber-500/30 rounded text-ink cursor-pointer"
                        >
                          -5k
                        </button>
                        <button
                          type="button"
                          title="Diminuer de 1 000 Ar"
                          onClick={() => {
                            const next = Math.max(0, copayDu - 1000);
                            setCustomTicketModerateur(next);
                            setCopayCash(next > 0 ? String(next) : '');
                          }}
                          className="px-1.5 py-0.5 text-[10px] font-bold bg-surface hover:bg-surface-hover border border-amber-300 dark:border-amber-500/30 rounded text-ink cursor-pointer"
                        >
                          -1k
                        </button>
                        <button
                          type="button"
                          title="Augmenter de 1 000 Ar"
                          onClick={() => {
                            const next = Math.min(copayPreview.brut, copayDu + 1000);
                            setCustomTicketModerateur(next);
                            setCopayCash(next > 0 ? String(next) : '');
                          }}
                          className="px-1.5 py-0.5 text-[10px] font-bold bg-surface hover:bg-surface-hover border border-amber-300 dark:border-amber-500/30 rounded text-ink cursor-pointer"
                        >
                          +1k
                        </button>
                        <button
                          type="button"
                          title="Augmenter de 5 000 Ar"
                          onClick={() => {
                            const next = Math.min(copayPreview.brut, copayDu + 5000);
                            setCustomTicketModerateur(next);
                            setCopayCash(next > 0 ? String(next) : '');
                          }}
                          className="px-1.5 py-0.5 text-[10px] font-bold bg-surface hover:bg-surface-hover border border-amber-300 dark:border-amber-500/30 rounded text-ink cursor-pointer"
                        >
                          +5k
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {selPatient.clientType === 'societe' && !copayPreview && (
                <div className="p-3 bg-blue-50 dark:bg-cyan-500/8 border border-blue-200 dark:border-cyan-500/25 rounded-xl mb-3 flex items-start gap-2.5">
                  <Building2 className="w-5 h-5 text-blue-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900 dark:text-cyan-300 leading-relaxed">
                    <strong>Client société{selPatient.company ? ` — ${selPatient.company}` : ''}.</strong>{' '}
                    Pas de règlement en espèces : la caisse valide le paiement en <strong>CRÉDIT SOCIÉTÉ</strong> — le montant est porté au compte de la société et sera réglé ultérieurement via le module « Facturation ».
                  </div>
                </div>
              )}
              {selPatient.clientType === 'societe' && copayPreview && (
                <div className="flex justify-between text-sm font-semibold border-t-2 pt-2 text-ink-secondary">
                  <span>Total prestations</span>
                  <span className="font-mono">{formatAr(copayPreview.brut)}</span>
                </div>
              )}
              <div className={`flex justify-between items-baseline text-xl font-bold ${selPatient.clientType === 'societe' ? 'text-blue-800 dark:text-cyan-300' : ''} ${copayDu > 0 ? 'pt-1' : 'border-t-2 pt-2'} mb-2`}>
                <div>
                  <span>{selPatient.clientType === 'societe' ? 'MONTANT EN CRÉDIT SOCIÉTÉ' : 'À PAYER'}</span>
                  {piecesPayees.length === 1 && (
                    <span className="block text-xs font-normal text-ink-secondary mt-0.5">
                      Prescription : <strong>{piecesPayees[0].resume || piecesPayees[0].label}</strong>
                    </span>
                  )}
                </div>
                <span className={`font-mono ${selPatient.clientType === 'societe' ? 'text-blue-600 dark:text-cyan-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {formatAr(selPatient.clientType === 'societe' && copayPreview ? partSocieteEffective : montantSelection)}
                </span>
              </div>
              {selPatient.clientType === 'societe' && copayPreview && (
                <div className={`flex justify-between items-center rounded-lg px-2.5 py-1.5 mb-4 border ${copayDu > 0 ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/25' : 'bg-surface-muted border-line'}`}>
                  <span className={`font-bold text-sm ${copayDu > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-ink-secondary'}`}>
                    PART À PAYER PAR LE PATIENT{copayDu > 0 ? ' (TICKET MODÉRATEUR)' : ' (0 Ar — PRIS EN CHARGE)'}
                  </span>
                  <span className={`font-mono font-bold text-base ${copayDu > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`}>
                    {formatAr(copayDu)}
                  </span>
                </div>
              )}
              {selPatient.clientType === 'societe' ? (
                copayDu > 0 ? (
                  <div className="space-y-2">
                    <button onClick={handlePayment} className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 cursor-pointer shadow-lg flex items-center justify-center gap-2">
                      <CreditCard className="w-5 h-5" /> Encaisser {formatAr(copayDu)} + Crédit société {formatAr(partSocieteEffective)}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <button onClick={handlePayment} disabled={piecesPayees.length === 0 && piecesEnAttente.length > 0} className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 cursor-pointer disabled:opacity-40 shadow-lg flex items-center justify-center gap-2">
                      <Building2 className="w-5 h-5" /> {piecesPayees.length === 0 && piecesEnAttente.length > 0
                        ? 'Aucune prescription sélectionnée'
                        : `Valider en Crédit Société ${formatAr(partSocieteEffective)}`}
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-1.5">
                  <button onClick={handlePayment} className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 cursor-pointer shadow-lg flex items-center justify-center gap-2">
                    <CreditCard className="w-5 h-5" /> {piecesEnAttente.length === 0
                      ? 'Valider le passage (0 Ar)'
                      : piecesPayees.length === 0
                        ? 'Aucune prescription sélectionnée'
                        : `Encaisser ${formatAr(montantSelection)}`}
                  </button>
                </div>
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
          <div className="bg-surface rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-line animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Printer className="w-5 h-5 text-amber-400" /> Configuration Imprimante & Reçus
              </div>
              <button
                onClick={() => setPrinterModalOpen(false)}
                className="text-ink-faint hover:text-white p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <p className="text-ink-muted leading-relaxed">
                Chaque caissier peut configurer sa propre imprimante et son format de ticket thermique (le réglage est mémorisé sur ce poste / navigateur pour votre compte).
              </p>
              <div>
                <label className="block font-semibold text-ink mb-1">Nom / Poste de l'imprimante</label>
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
                  <label className="block font-semibold text-ink mb-1">Format Papier Thermique</label>
                  <Select
                    value={tempPrinterSettings.paperWidth}
                    onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, paperWidth: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium bg-surface"
                  >
                    <option value={80}>80 mm (Standard POS)</option>
                    <option value={58}>58 mm (Étroit / Portable)</option>
                  </Select>
                </div>
                <div>
                  <label className="block font-semibold text-ink mb-1">Nombre d'exemplaires</label>
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
                <label className="block font-semibold text-ink mb-1">Titre du reçu / ticket</label>
                <input
                  type="text"
                  value={tempPrinterSettings.receiptTitle}
                  onChange={e => setTempPrinterSettings({ ...tempPrinterSettings, receiptTitle: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  placeholder="ex: REÇU DE PAIEMENT"
                />
              </div>
              <div>
                <label className="block font-semibold text-ink mb-1">Message de pied de page</label>
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
                  className="w-4 h-4 text-amber-600 dark:text-amber-400 rounded focus:ring-amber-500"
                />
                <label htmlFor="autoPrintCheck" className="font-semibold text-ink cursor-pointer">
                  Lancer l'impression silencieuse / automatique (si supporté)
                </label>
              </div>
            </div>
            <div className="bg-surface-muted px-5 py-3 border-t flex justify-end gap-2">
              <button
                onClick={() => setPrinterModalOpen(false)}
                className="px-4 py-2 bg-surface border border-line-strong hover:bg-surface-hover rounded-xl text-xs font-semibold text-ink cursor-pointer"
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
