import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState } from '../store';
import type { TransferCategory, StockTransfer } from '../types';
import { addAuditLog, addNotification, formatAr, familyLabel, transferCategoryLabel, transferCategoryColor, addJourneyEvent, isArticleSaleable, createMovementWithLines, generatePharmaClosingNumber } from '../store';
import type { MovementType } from '../types';
import { printDeliveryTicket, printPharmaSalesRecapTicket } from '../utils/printTicket';
import DemandeAchatForm, { type ReqLine } from './DemandeAchatForm';
import CashierModule from './CashierModule';
import {
  Pill, Package, CheckCircle, Clock, Search, Send,
  Plus, Trash2, Filter, Printer, Edit3, CreditCard,
  Ban, Unlock, AlertTriangle, Bell, BellOff, Lock
} from 'lucide-react';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onOpenMessagingWithRecipient?: (recipientId: string) => void;
}
type Tab = 'caisse' | 'pending' | 'stock' | 'delivered' | 'request';

const CATEGORIES: TransferCategory[] = ['approvisionnement', 'hospitalisation', 'bloc', 'central'];
const PHARMA_SERVICE_ID = 'svc-pharmacie';

export default function PharmacyModule({ state, setState, onOpenMessagingWithRecipient }: Props) {
  // Caisse de garde en premier par défaut
  const [tab, setTab] = useState<Tab>('caisse');
  const [searchStock, setSearchStock] = useState('');
  const [filterCat, setFilterCat] = useState<TransferCategory | 'all'>('all');
  const [stockSub, setStockSub] = useState<'articles' | 'demandes' | 'historique'>('articles');
  const [blockModal, setBlockModal] = useState<{ articleId: string; name: string; currentlyBlocked: boolean } | null>(null);
  const [blockReason, setBlockReason] = useState('');

  // Nouveaux états pour affichage gauche/droite et clôtures de garde
  const [selConsultId, setSelConsultId] = useState<string | null>(null);
  // Onglets pour la liste après validation : récap par article (défaut) vs détails heure/patient/article/qté
  const [pendingDeliveryView, setPendingDeliveryView] = useState<'recap' | 'details'>('recap');
  const [deliveredDeliveryView, setDeliveredDeliveryView] = useState<'recap' | 'details'>('recap');

  // Reappro Modal State
  const [reapproModalOpen, setReapproModalOpen] = useState(false);
  const [reapproEditingId, setReapproEditingId] = useState<string | null>(null);
  const [reapproEditingLine, setReapproEditingLine] = useState<ReqLine | null>(null);
  const [reapproEditingNotes, setReapproEditingNotes] = useState('');
  const [reapproEditingCategory, setReapproEditingCategory] = useState<TransferCategory | undefined>(undefined);

  const openReapproNew = () => {
    setReapproEditingId(null);
    setReapproEditingLine(null);
    setReapproEditingNotes('');
    setReapproEditingCategory('approvisionnement');
    setReapproModalOpen(true);
  };

  const openReapproEdit = (transferId: string) => {
    const tr = state.stockTransfers.find((t) => t.id === transferId);
    if (!tr) return;
    if (tr.status !== 'requested') { alert('Impossible de modifier une demande déjà traitée.'); return; }
    const a = state.articles.find((x) => x.id === tr.articleId);
    const line: ReqLine = {
      id: uuidv4(),
      articleId: tr.articleId,
      articleName: tr.articleName,
      family: a?.family || 'MEDIC',
      quantity: tr.quantity,
      purchasePrice: tr.purchasePrice || a?.purchasePrice || 0,
      expiryDate: tr.expiryDate || a?.expiryDate || '',
      notes: tr.notes || '',
      amount: tr.quantity * (tr.purchasePrice || a?.purchasePrice || 0),
    };
    setReapproEditingId(tr.id);
    setReapproEditingLine(line);
    setReapproEditingNotes(tr.notes || '');
    setReapproEditingCategory(tr.category);
    setReapproModalOpen(true);
  };

  const closeReappro = () => {
    setReapproModalOpen(false);
    setReapproEditingId(null);
    setReapproEditingLine(null);
    setReapproEditingNotes('');
    setReapproEditingCategory(undefined);
  };

  const submitReappro = (payload: { lines: ReqLine[]; category: TransferCategory; supplier: string; invoiceRef: string; notes: string; }) => {
    if (reapproEditingId) {
      const first = payload.lines[0];
      setState((prev) => {
        const next = {
          ...prev,
          stockTransfers: prev.stockTransfers.map((t) =>
            t.id === reapproEditingId
              ? {
                  ...t,
                  articleId: first.articleId,
                  articleName: first.articleName,
                  quantity: first.quantity,
                  category: payload.category,
                  notes: payload.notes || first.notes,
                  purchasePrice: first.purchasePrice,
                  expiryDate: first.expiryDate,
                  supplier: payload.supplier || t.supplier,
                  invoiceRef: payload.invoiceRef || t.invoiceRef,
                  targetServiceId: PHARMA_SERVICE_ID,
                  targetServiceName: 'Pharmacie',
                  requestSource: 'pharmacy' as const,
                }
              : t
          ),
        };
        addAuditLog(next, 'DEMANDE_REAPPRO_MODIF', `[Pharma] Demande modifiée: ${first.articleName} (${first.quantity})`);
        return next;
      });
      closeReappro();
      return;
    }

    setState((prev) => {
      const newTransfers: StockTransfer[] = payload.lines.map((l) => ({
        id: uuidv4(),
        articleId: l.articleId,
        articleName: l.articleName,
        quantity: l.quantity,
        category: 'approvisionnement' as TransferCategory,
        purchasePrice: l.purchasePrice,
        expiryDate: l.expiryDate,
        supplier: payload.supplier,
        invoiceRef: payload.invoiceRef,
        requestedBy: prev.currentUser?.id,
        requestedAt: new Date().toISOString(),
        status: 'requested' as const,
        notes: payload.notes || l.notes,
        targetServiceId: PHARMA_SERVICE_ID,
        targetServiceName: 'Pharmacie',
        requestSource: 'pharmacy' as const,
      }));
      const next = { ...prev, stockTransfers: [...prev.stockTransfers, ...newTransfers] };
      addAuditLog(next, 'DEMANDE_REAPPRO_PHARMA', `${payload.lines.length} article(s) — Demande d'approvisionnement Pharmacie → Magasinier`);
      addNotification(next, 'magasinier', `📩 [Pharmacie] Demande d'appro: ${payload.lines.length} article(s) — à traiter depuis le dépôt central`, 'info');
      return next;
    });

    closeReappro();
    setTab('stock');
    setStockSub('demandes');
  };

  const paidConsultations = state.consultations.filter((c) => {
    const inv = state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid');
    const hasUndelivered = c.prescriptions.some((p) => !p.delivered);
    return inv && hasUndelivered;
  });
  const emergencyConsults = state.consultations.filter((c) => c.isEmergency && c.prescriptions.some((p) => !p.delivered) && !state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid'));
  const externalInvoices = state.invoices.filter((i) => i.isExternal && i.status === 'paid');
  const allPending = [...paidConsultations, ...emergencyConsults];

  const filtered = state.articles.filter((a) => a.name.toLowerCase().includes(searchStock.toLowerCase()));

  // Demandes pharmacie uniquement
  const myRequests = state.stockTransfers.filter(
    (t) => t.requestSource === 'pharmacy' || t.targetServiceId === PHARMA_SERVICE_ID || t.category === 'approvisionnement'
  );
  const myRequestsFiltered = myRequests.filter((t) => filterCat === 'all' || t.category === filterCat);
  const pendingCount = myRequests.filter((t) => t.status === 'requested').length;

  const cancelRequest = (id: string) => {
    if (!confirm('Annuler cette demande ?')) return;
    setState((prev) => ({ ...prev, stockTransfers: prev.stockTransfers.map(t => t.id === id ? { ...t, status: 'cancelled' as const } : t) }));
  };

  const toggleSaleBlock = () => {
    if (!blockModal) return;
    const reason = blockReason.trim();
    if (!blockModal.currentlyBlocked && !reason) {
      alert('Indiquez le motif du blocage (réservé, en attente de régularisation, etc.).');
      return;
    }
    setState((prev) => {
      const next = {
        ...prev,
        articles: prev.articles.map((a) => {
          if (a.id !== blockModal.articleId) return a;
          if (blockModal.currentlyBlocked) {
            return { ...a, saleBlocked: false, saleBlockReason: undefined, saleBlockedAt: undefined, saleBlockedBy: undefined };
          }
          return {
            ...a,
            saleBlocked: true,
            saleBlockReason: reason,
            saleBlockedAt: new Date().toISOString(),
            saleBlockedBy: prev.currentUser?.id,
          };
        }),
      };
      addAuditLog(
        next,
        blockModal.currentlyBlocked ? 'DEBLOCAGE_VENTE' : 'BLOCAGE_VENTE',
        `${blockModal.name}${reason ? ` — ${reason}` : ''}`
      );
      return next;
    });
    setBlockModal(null);
    setBlockReason('');
  };

  const deliver = (consultationId: string, isExternal?: boolean) => {
    const consultation = state.consultations.find((c) => c.id === consultationId);
    if (!consultation) return;
    const isExt = isExternal || !consultation.patientId || consultation.diagnosis === 'Client Externe';
    const patient = isExt ? null : state.patients.find((p) => p.id === consultation.patientId);
    const name = patient ? `${patient.lastName} ${patient.firstName}` : consultation.diagnosis === 'Client Externe' ? 'Client Externe' : 'Client externe';

    // Vérifier stock + blocages avant délivrance
    const blocked = consultation.prescriptions.filter((p) => {
      if (p.delivered) return false;
      const art = state.articles.find((a) => a.name === p.articleName || a.id === p.articleId);
      return art?.saleBlocked;
    });
    if (blocked.length > 0) {
      alert(
        `⛔ Vente bloquée pour :\n${blocked.map((p) => {
          const art = state.articles.find((a) => a.name === p.articleName);
          return `• ${p.articleName}${art?.saleBlockReason ? ` (${art.saleBlockReason})` : ''}`;
        }).join('\n')}\n\nDébloquez l'article dans Stock pharmacie ou retirez-le de l'ordonnance.`
      );
      return;
    }
    const outOfStock = consultation.prescriptions.filter((p) => {
      if (p.delivered) return false;
      const art = state.articles.find((a) => a.name === p.articleName || a.id === p.articleId);
      return !art || art.stockPharmacie < p.quantity;
    });
    if (outOfStock.length > 0) {
      if (!confirm(`Stock insuffisant pour :\n${outOfStock.map((p) => `• ${p.articleName}`).join('\n')}\n\nDélivrer quand même (stock peut passer à 0) ?`)) return;
    }

    setState((prev) => {
      const updatedConsultations = prev.consultations.map((c) =>
        c.id === consultationId ? { ...c, prescriptions: c.prescriptions.map((p) => ({ ...p, delivered: true })) } : c);
      const updatedArticles = [...prev.articles];
      const venteLines: any[] = [];

      consultation.prescriptions.forEach((p) => {
        if (p.delivered) return;
        const idx = updatedArticles.findIndex((a) => a.name === p.articleName || a.id === p.articleId);
        if (idx >= 0) {
          updatedArticles[idx] = { ...updatedArticles[idx], stockPharmacie: Math.max(0, updatedArticles[idx].stockPharmacie - p.quantity) };
          venteLines.push({
            articleId: updatedArticles[idx].id,
            articleName: p.articleName,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            reason: 'Vente / délivrance pharmacie',
          });
        }
      });

      // === NOUVEAU : Mouvement VENTE (header + lignes) ===
      if (venteLines.length > 0) {
        createMovementWithLines(
          prev,
          {
            type: 'vente' as MovementType,
            ref: `DELIV-${consultationId.slice(0, 8)}`,
            fromLocation: 'pharmacie',
            toLocation: 'external' as any,
            userId: prev.currentUser?.id || 'PHARMACY',
            userName: prev.currentUser?.name,
            notes: `Vente / délivrance à ${name}`,
          },
          venteLines
        );
      }

      // === NOUVEAU : Création des PharmaDeliveryItem pour la base de compilation des livraisons ===
      const newDeliveryItems: import('../types').PharmaDeliveryItem[] = consultation.prescriptions
        .filter((p) => !p.delivered)
        .map((p) => ({
          id: uuidv4(),
          consultationId: consultation.id,
          patientId: consultation.patientId,
          patientName: name,
          doctorName: consultation.doctorName,
          articleId: p.articleId || '',
          articleName: p.articleName,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          posology: p.posology,
          deliveredAt: new Date().toISOString(),
          deliveredByUserId: prev.currentUser?.id || 'PHA001',
          deliveredByName: prev.currentUser?.name || 'Pharmacie',
          isExternal: !!isExternal,
        }));

      const hasLab = updatedConsultations.find((c) => c.id === consultationId)?.labRequests.some((lr) => lr.status !== 'completed');
      const newStatus = hasLab ? 'invoice_paid' : 'medications_delivered';

      const next = {
        ...prev,
        consultations: updatedConsultations,
        articles: updatedArticles,
        pharmaDeliveryItems: [...(prev.pharmaDeliveryItems || []), ...newDeliveryItems],
        patients: patient ? prev.patients.map((p) => p.id === consultation.patientId ? { ...p, status: newStatus as any } : p) : prev.patients,
      };
      addAuditLog(next, 'DELIVRANCE', `Médicaments délivrés: ${name}`, consultation.patientId);
      if (consultation.patientId) addJourneyEvent(next, { patientId: consultation.patientId, department: 'pharmacie', action: 'Médicaments délivrés', status: 'medications_delivered', details: consultation.prescriptions.map((p) => `${p.articleName} ×${p.quantity}`).join(', '), actorName: state.currentUser?.name });
      updatedArticles.forEach((a) => {
        // Alerte désactivée pour cet article (pharmacie) → aucune notification stock
        if (a.alertDisabledPharmacie) return;
        if (a.stockPharmacie <= 0) addNotification(next, 'pharmacy', `🚨 ${a.name} en rupture (pharmacie)`, 'critical');
        else if (a.stockPharmacie <= a.minStockPharmacie) addNotification(next, 'pharmacy', `⚠️ Stock bas pharmacie: ${a.name} (${a.stockPharmacie} / alerte: ${a.minStockPharmacie})`, 'warning');
      });
      return next;
    });
    // EXIGENCE PROMPT : dans partie pharmacie ne pas automatiquement imprimer l'ordonnance
    // L'impression se fait uniquement manuellement par l'utilisateur via le bouton d'impression si souhaité.
  };

  const printDelivery = (consultationId: string, isExternal?: boolean) => {
    const c = state.consultations.find((x) => x.id === consultationId);
    if (!c) return;
    const isExt = isExternal || !c.patientId || c.diagnosis === 'Client Externe';
    const patient = isExt
      ? { id: 'ext', lastName: 'Client Externe', firstName: '', dossier: 'EXT', gender: 'M', dob: '', phone: '', clientType: 'externe', createdAt: '' } as any
      : state.patients.find((p) => p.id === c.patientId);
    if (!patient) return;
    printDeliveryTicket(
      state.ticketSettings,
      patient,
      new Date(c.date),
      c.prescriptions.filter((p) => !p.delivered).map((p) => ({ name: p.articleName, quantity: p.quantity, posology: p.posology })),
      state.currentUser?.name,
    );
  };

  // Stock d'alerte : modification du seuil pharmacie (par article)
  const updateAlertThreshold = (articleId: string, value: number) => {
    setState((prev) => ({
      ...prev,
      articles: prev.articles.map((a) => (a.id === articleId ? { ...a, minStockPharmacie: Math.max(0, Math.round(value)) } : a)),
    }));
  };

  // Activer / désactiver l'alerte stock pour un article (pharmacie uniquement)
  // NB : le blocage de vente en cas de rupture reste toujours actif.
  const togglePharmaAlert = (articleId: string, name: string) => {
    setState((prev) => {
      const art = prev.articles.find((a) => a.id === articleId);
      const next = {
        ...prev,
        articles: prev.articles.map((a) => (a.id === articleId ? { ...a, alertDisabledPharmacie: !a.alertDisabledPharmacie } : a)),
      };
      addAuditLog(next, art?.alertDisabledPharmacie ? 'ALERTE_STOCK_PHARMA_ACTIVEE' : 'ALERTE_STOCK_PHARMA_DESACTIVEE', name);
      return next;
    });
  };

  const blockedCount = state.articles.filter((a) => a.saleBlocked).length;

  // Calcul des livraisons en cours (avant clôture de caisse / garde du responsable pharmacie)
  const unclosedDeliveryItems = (state.pharmaDeliveryItems || []).filter((item) => !item.closingId);
  const unclosedTotalAmt = unclosedDeliveryItems.reduce((s, d) => s + d.quantity * d.unitPrice, 0);

  const handleClosePharmaDeliveries = () => {
    if (unclosedDeliveryItems.length === 0) {
      alert("Aucune livraison en attente de clôture de garde.");
      return;
    }
    const totalAmount = unclosedTotalAmt;
    const totalItems = unclosedDeliveryItems.reduce((s, d) => s + d.quantity, 0);
    const responsibleName = state.currentUser?.name || 'Responsable Pharmacie';
    const responsibleId = state.currentUser?.id || 'PHA001';

    if (!confirm(`🔒 Clôturer et compiler les ${unclosedDeliveryItems.length} ligne(s) de livraison de la garde (${totalItems} articles, valeur totale ${formatAr(totalAmount)}) pour ${responsibleName} ?\n\nCette opération enregistre définitivement la compilation des livraisons de garde.`)) {
      return;
    }

    const counter = (state.pharmaClosingCounter || 0) + 1;
    const closingNumber = generatePharmaClosingNumber(counter);
    const closingId = uuidv4();
    const now = new Date().toISOString();

    const closing: import('../types').PharmaDeliveryClosing = {
      id: closingId,
      closingNumber,
      date: now,
      responsibleId,
      responsibleName,
      deliveryIds: unclosedDeliveryItems.map((d) => d.id),
      totalItems,
      totalAmount,
      deliveries: unclosedDeliveryItems.map((d) => ({ ...d, closingId })),
      createdAt: now,
    };

    setState((prev) => {
      const updatedItems = (prev.pharmaDeliveryItems || []).map((item) =>
        item.closingId ? item : { ...item, closingId }
      );
      const next = {
        ...prev,
        pharmaDeliveryItems: updatedItems,
        pharmaDeliveryClosings: [closing, ...(prev.pharmaDeliveryClosings || [])],
        pharmaClosingCounter: counter,
      };
      addAuditLog(next, 'CLOTURE_LIVRAISONS_PHARMA', `Clôture garde ${closingNumber} — ${totalItems} articles (${formatAr(totalAmount)}) par ${responsibleName}`);
      return next;
    });

    alert(`✅ Compilation ${closingNumber} créée et clôturée avec succès !\n\nLe récapitulatif des ventes par article va être imprimé.`);

    // Imprimer automatiquement le récapitulatif des ventes par article (ticket)
    const byArticle: Record<string, number> = {};
    unclosedDeliveryItems.forEach(item => {
      byArticle[item.articleName] = (byArticle[item.articleName] || 0) + item.quantity;
    });
    const recap = Object.entries(byArticle)
      .map(([articleName, totalQuantity]) => ({ articleName, totalQuantity }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity);
    const totalQty = recap.reduce((s, r) => s + r.totalQuantity, 0);

    printPharmaSalesRecapTicket(
      state.ticketSettings,
      recap,
      totalQty,
      responsibleName,
      closingNumber,
      new Date()
    );
  };

  return (
    <div className="space-y-6 flex flex-col">
      {/* Banner & Sélecteur : Caisse de garde EN PREMIER */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-800 rounded-xl p-4 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/30 border border-blue-400/30 text-xs font-semibold uppercase tracking-wider text-blue-200">
              Service Continu & Garde
            </span>
            <h3 className="font-bold text-lg">Pharmacie & Caisse de garde</h3>
          </div>
          <p className="text-xs text-blue-200 mt-1">
            Caisse de garde en priorité pour les encaissements de nuit et jours fériés. Demandes d'appro transmises au magasinier (dépôt central).
          </p>
        </div>
        <div className="flex items-center gap-2 bg-black/20 p-1 rounded-lg border border-white/10 w-full sm:w-auto">
          <button
            onClick={() => setTab('caisse')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              tab === 'caisse' ? 'bg-blue-600 text-white shadow' : 'text-blue-200 hover:text-white hover:bg-white/5'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Caisse de garde</span>
          </button>
          <button
            onClick={() => setTab('pending')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              tab !== 'caisse' ? 'bg-purple-600 text-white shadow' : 'text-purple-200 hover:text-white hover:bg-white/5'
            }`}
          >
            <Pill className="w-4 h-4" />
            <span>Module Pharmacie</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {[
            { key: 'caisse' as Tab, icon: <CreditCard className="w-4 h-4 text-blue-600" />, label: '💳 Caisse de garde' },
            { key: 'pending' as Tab, icon: <Clock className="w-4 h-4" />, label: `Ordonnances (${allPending.length})` },
            { key: 'stock' as Tab, icon: <Package className="w-4 h-4" />, label: `Stock pharmacie${blockedCount > 0 ? ` ⛔${blockedCount}` : ''}${pendingCount > 0 ? ` · ${pendingCount} dem.` : ''}` },
            { key: 'delivered' as Tab, icon: <CheckCircle className="w-4 h-4" />, label: 'Délivrées' },
            { key: 'request' as Tab, icon: <Send className="w-4 h-4" />, label: 'Nouvelle demande appro' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                tab === t.key ? 'border-purple-500 text-purple-600 bg-purple-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* === CAISSE DE GARDE (premier) === */}
          {tab === 'caisse' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-blue-900 text-base">Caisse de garde — Nuit & Jours fériés</h4>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Encaissement unifié, ventes externes, hospitalisation/bloc et clôture journalière pendant les permanences.
                    </p>
                  </div>
                </div>
              </div>
              <div className="-mx-6 -mb-6 p-6 bg-slate-50/50 border-t border-slate-200">
                <CashierModule state={state} setState={setState} onOpenMessagingWithRecipient={onOpenMessagingWithRecipient} />
              </div>
            </div>
          )}

          {tab === 'pending' && (() => {
            const selConsult = allPending.find((c) => c.id === selConsultId) || allPending[0] || null;
            const patient = selConsult ? state.patients.find((p) => p.id === selConsult.patientId) : null;
            const ext = selConsult ? externalInvoices.find((i) => i.consultationId === selConsult.id) : null;
            const isExtSel = !!ext || (selConsult ? selConsult.diagnosis === 'Client Externe' || !selConsult.patientId : false);
            const isUrgent = selConsult ? selConsult.isEmergency && !state.invoices.find((i) => i.consultationId === selConsult.id && i.status === 'paid') : false;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* À GAUCHE DE L'ÉCRAN : LA FILE D'ATTENTE */}
                <div className="divide-y border border-slate-200 rounded-xl max-h-[640px] overflow-y-auto bg-white shadow-sm">
                  <div className="p-3.5 border-b bg-purple-50 font-semibold text-xs flex justify-between items-center text-purple-900 sticky top-0 z-10">
                    <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-purple-600" /> File d'attente Ordonnances</span>
                    <span className="bg-purple-600 text-white font-mono font-bold px-2 py-0.5 rounded-full text-[10px]">{allPending.length}</span>
                  </div>
                  {allPending.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                      <Pill className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">Aucune ordonnance en attente</p>
                    </div>
                  ) : (
                    allPending.map((c) => {
                      const pat = state.patients.find((p) => p.id === c.patientId);
                      const extInv = externalInvoices.find((i) => i.consultationId === c.id);
                      const urg = c.isEmergency && !state.invoices.find((i) => i.consultationId === c.id && i.status === 'paid');
                      const isSelected = selConsult?.id === c.id;
                      return (
                        <div
                          key={c.id}
                          onClick={() => setSelConsultId(c.id)}
                          className={`p-3.5 cursor-pointer transition-all ${isSelected ? 'bg-purple-50/90 border-l-4 border-purple-600 shadow-sm' : 'hover:bg-slate-50'}`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                                {pat ? `${pat.lastName} ${pat.firstName}` : extInv ? extInv.clientName : c.diagnosis === 'Client Externe' ? 'Client Externe' : 'Inconnu'}
                                {urg && <span className="px-1.5 py-0.2 rounded bg-red-100 text-red-700 text-[10px] font-bold">🚨 URGENT</span>}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">{c.doctorName}</div>
                            </div>
                            <span className="font-mono text-xs font-bold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded">
                              {c.prescriptions.filter((p) => !p.delivered).length} art.
                            </span>
                          </div>
                          {pat && (
                            <div className="mt-1 text-[11px] text-slate-400 font-mono">Dossier: {pat.dossier}</div>
                          )}
                          {!pat && (c.diagnosis === 'Client Externe' || extInv) && (
                            <div className="mt-1 text-[11px] text-purple-600 font-mono">Vente Externe</div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* À DROITE DE L'ÉCRAN : LA LISTE APRÈS VALIDATION & LE TRAITEMENT DE L'ORDONNANCE */}
                <div className="lg:col-span-2 space-y-5">
                  {/* 1. Zone Traitement Ordonnance Sélectionnée */}




                  {!selConsult ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-400">
                      <Pill className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p className="text-base font-medium">Sélectionnez une ordonnance à gauche pour la valider / délivrer</p>
                    </div>
                  ) : (
                    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${isUrgent ? 'border-red-300 ring-2 ring-red-100' : 'border-purple-200 ring-1 ring-purple-100'}`}>
                      <div className="p-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <div className="font-bold text-base flex items-center gap-2">
                            {patient ? `${patient.lastName} ${patient.firstName}` : ext ? ext.clientName : selConsult.diagnosis === 'Client Externe' ? 'Client Externe' : 'Inconnu'}
                            {patient && <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded text-purple-200">({patient.dossier})</span>}
                            {isExtSel && !patient && <span className="text-xs font-mono bg-purple-500/30 px-2 py-0.5 rounded text-purple-200">(Vente Externe)</span>}
                            {isUrgent && <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">🚨 URGENCE</span>}
                          </div>
                          <div className="text-xs text-slate-300 mt-1">Prescrit par : <strong className="text-white">{selConsult.doctorName}</strong> — {new Date(selConsult.date).toLocaleDateString('fr-FR')}</div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => printDelivery(selConsult.id, isExtSel)}
                            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium text-xs flex items-center gap-1.5 cursor-pointer transition"
                            title="Imprimer manuellement le bon de délivrance"
                          >
                            <Printer className="w-3.5 h-3.5" /> Imprimer bon
                          </button>
                          <button
                            onClick={() => deliver(selConsult.id, isExtSel)}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-xs flex items-center gap-2 cursor-pointer shadow transition"
                          >
                            <CheckCircle className="w-4 h-4" /> Délivrer et Valider
                          </button>
                        </div>
                      </div>

                      <div className="p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-600 text-xs">
                              <th className="text-left py-2 font-semibold">Article</th>
                              <th className="text-center py-2 font-semibold">Qté</th>
                              <th className="text-left py-2 font-semibold">Posologie</th>
                              <th className="text-right py-2 font-semibold">Stock Pharma</th>
                              <th className="text-center py-2 font-semibold">Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selConsult.prescriptions.filter((p) => !p.delivered).map((p) => {
                              const art = state.articles.find((a) => a.name === p.articleName);
                              const blocked = !!art?.saleBlocked;
                              const noStock = (art?.stockPharmacie || 0) < p.quantity;
                              return (
                                <tr key={p.id} className={`border-b border-slate-100 ${blocked ? 'bg-orange-50' : noStock ? 'bg-red-50/60' : ''}`}>
                                  <td className="py-2.5 font-bold text-slate-800">{p.articleName}</td>
                                  <td className="py-2.5 text-center font-mono font-bold text-purple-700">{p.quantity}</td>
                                  <td className="py-2.5 text-xs text-slate-600 font-sans">{p.posology || '—'}</td>
                                  <td className={`py-2.5 text-right font-mono font-bold ${(art?.stockPharmacie || 0) <= 0 ? 'text-red-600' : 'text-slate-700'}`}>{art?.stockPharmacie || 0}</td>
                                  <td className="py-2.5 text-center">
                                    {blocked ? (
                                      <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-[10px] rounded-full font-bold">⛔ Bloqué</span>
                                    ) : noStock ? (
                                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full font-bold">Rupture</span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded-full font-bold">OK pour délivrance</span>
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

                  {/* 2. LISTE APRÈS VALIDATION (Livraisons de garde avant clôture) — DEUX ONGLETS */}
                  <div className="border border-emerald-200 rounded-xl bg-emerald-50/40 overflow-hidden shadow-sm">
                    <div className="p-3.5 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex justify-between items-center flex-wrap gap-2">
                      <div>
                        <h4 className="font-bold text-sm flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-300" />
                          Liste après validation : Livraisons avant clôture de garde ({unclosedDeliveryItems.length})
                        </h4>
                        <p className="text-[11px] text-emerald-100 mt-0.5">
                          Ce qui reste dans cette liste après validation constitue les livraisons avant la clôture de caisse / garde du responsable.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {unclosedDeliveryItems.length > 0 ? (
                          <div className="text-[10px] font-bold bg-white/20 px-2 py-1 rounded-full">{unclosedDeliveryItems.length} ligne(s) · {formatAr(unclosedTotalAmt)}</div>
                        ) : null}
                      </div>
                    </div>

                    {/* Onglets : Récap par article (défaut) / Détails Heure Patient Article Qté */}
                    <div className="flex border-b border-emerald-100 bg-white">
                      <button
                        onClick={() => setPendingDeliveryView('recap')}
                        className={`flex-1 px-3 py-2 text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-1.5 ${pendingDeliveryView === 'recap' ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                      >
                        📊 Récap de vente par articles
                      </button>
                      <button
                        onClick={() => setPendingDeliveryView('details')}
                        className={`flex-1 px-3 py-2 text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-1.5 ${pendingDeliveryView === 'details' ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                      >
                        🕒 Heure / Patient / Article / Qté
                      </button>
                    </div>

                    <div className="p-3 bg-white max-h-80 overflow-y-auto">
                      {unclosedDeliveryItems.length === 0 ? (
                        <div className="py-6 text-center text-slate-400 text-xs">
                          Aucune livraison non clôturée. Les ordonnances validées apparaîtront ici avant la clôture du tour de garde.
                        </div>
                      ) : pendingDeliveryView === 'recap' ? (
                        // Récap par article — default
                        (() => {
                          const byArticle: Record<string, { qty: number; totalAmt: number; lastTime: string }> = {};
                          unclosedDeliveryItems.forEach(it => {
                            if (!byArticle[it.articleName]) byArticle[it.articleName] = { qty: 0, totalAmt: 0, lastTime: it.deliveredAt };
                            byArticle[it.articleName].qty += it.quantity;
                            byArticle[it.articleName].totalAmt += it.quantity * it.unitPrice;
                            if (new Date(it.deliveredAt) > new Date(byArticle[it.articleName].lastTime)) byArticle[it.articleName].lastTime = it.deliveredAt;
                          });
                          const recap = Object.entries(byArticle).map(([articleName, v]) => ({ articleName, ...v })).sort((a, b) => b.qty - a.qty);
                          const totalQ = recap.reduce((s, r) => s + r.qty, 0);
                          return (
                            <div>
                              <table className="w-full text-xs">
                                <thead className="bg-emerald-50 text-emerald-800 border-b border-emerald-200">
                                  <tr>
                                    <th className="p-2 text-left">Article délivré</th>
                                    <th className="p-2 text-right">Qté totale</th>
                                    <th className="p-2 text-right">Valeur</th>
                                    <th className="p-2 text-center">Dernière délivrance</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {recap.map((r) => (
                                    <tr key={r.articleName} className="hover:bg-emerald-50/60">
                                      <td className="p-2 font-bold text-emerald-900">{r.articleName}</td>
                                      <td className="p-2 text-right font-mono font-bold text-emerald-700">{r.qty}</td>
                                      <td className="p-2 text-right font-mono text-slate-600">{formatAr(r.totalAmt)}</td>
                                      <td className="p-2 text-center font-mono text-[11px] text-slate-500">{new Date(r.lastTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-emerald-100 font-bold border-t-2 border-emerald-300">
                                  <tr>
                                    <td className="p-2 text-right">TOTAL :</td>
                                    <td className="p-2 text-right font-mono">{totalQ}</td>
                                    <td className="p-2 text-right font-mono">{formatAr(unclosedTotalAmt)}</td>
                                    <td></td>
                                  </tr>
                                </tfoot>
                              </table>
                              <div className="mt-2 text-[10px] text-slate-500 italic">📌 Premier onglet par défaut : récapitulatif des ventes par article — prêt pour clôture de garde.</div>
                            </div>
                          );
                        })()
                      ) : (
                        // Détails Heure / Patient / Article / Qté
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-600 border-b">
                            <tr>
                              <th className="p-2 text-left">Heure</th>
                              <th className="p-2 text-left">Patient / Client</th>
                              <th className="p-2 text-left">Article délivré</th>
                              <th className="p-2 text-right">Qté</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {unclosedDeliveryItems
                              .slice()
                              .sort((a, b) => new Date(a.deliveredAt).getTime() - new Date(b.deliveredAt).getTime())
                              .map((item) => (
                                <tr key={item.id} className="hover:bg-emerald-50/50">
                                  <td className="p-2 font-mono text-slate-500 font-bold">{new Date(item.deliveredAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className="p-2 font-medium text-slate-800">{item.patientName}</td>
                                  <td className="p-2 font-semibold text-emerald-900">{item.articleName}</td>
                                  <td className="p-2 text-right font-mono font-bold">{item.quantity}</td>
                                </tr>
                              ))}
                          </tbody>
                          <tfoot className="bg-emerald-50 font-bold border-t border-emerald-200">
                            <tr>
                              <td colSpan={3} className="p-2 text-right text-emerald-900">TOTAL :</td>
                              <td className="p-2 text-right font-mono text-sm text-emerald-800">{unclosedDeliveryItems.reduce((s, d) => s + d.quantity, 0)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* === STOCK PHARMACIE — réappro + historique fusionnés ici === */}
          {tab === 'stock' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
                {[
                  { k: 'articles' as const, l: '📦 Articles & blocage vente' },
                  { k: 'demandes' as const, l: `📩 Demandes réappro (${pendingCount})` },
                  { k: 'historique' as const, l: '📜 Historique demandes' },
                ].map((s) => (
                  <button
                    key={s.k}
                    onClick={() => setStockSub(s.k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
                      stockSub === s.k ? 'bg-purple-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {s.l}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  onClick={openReapproNew}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow"
                >
                  <Plus className="w-3.5 h-3.5" /> Demander réappro
                </button>
              </div>

              {stockSub === 'articles' && (
                <div>
                  <div className="mb-3 flex flex-wrap gap-3 items-center">
                    <div className="relative max-w-md flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                      <input type="text" value={searchStock} onChange={(e) => setSearchStock(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none" placeholder="Rechercher un article..." />
                    </div>
                    <div className="text-xs text-slate-500 bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg flex items-center gap-2">
                      <Ban className="w-4 h-4 text-orange-600" />
                      Bloquez la vente même si le stock est encore disponible (réservé, régularisation…).
                    </div>
                    <div className="text-xs text-slate-500 bg-sky-50 border border-sky-200 px-3 py-2 rounded-lg flex items-center gap-2">
                      <BellOff className="w-4 h-4 text-sky-600" />
                      Réglez le <strong>stock d'alerte</strong> par article ou désactivez l'alerte (🔕). En rupture, l'article reste <strong>invendable</strong> même si l'alerte est désactivée.
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left py-3 px-3 font-semibold text-slate-600">Famille</th>
                          <th className="text-left py-3 px-3 font-semibold text-slate-600">Article</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-600">Stock Pharma</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-600">Stock Central</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-600" title="Seuil d'alerte (stock bas) pour la pharmacie">Stock d'alerte</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-600" title="Activer / désactiver l'alerte pour cet article">Alerte</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-600">Prix</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-600">État stock</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-600">Vente</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-600">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((a) => {
                          const alertMuted = !!a.alertDisabledPharmacie;
                          const isLow = !alertMuted && a.stockPharmacie <= a.minStockPharmacie && a.stockPharmacie > 0;
                          const isOut = !alertMuted && a.stockPharmacie === 0;
                          const blocked = !!a.saleBlocked;
                          return (
                            <tr key={a.id} className={`border-b border-slate-100 ${blocked ? 'bg-orange-50/80' : isOut ? 'bg-red-50' : isLow ? 'bg-amber-50' : ''}`}>
                              <td className="py-3 px-3"><span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{familyLabel(a.family)}</span></td>
                              <td className="py-3 px-3 font-medium">
                                {a.name}
                                {blocked && a.saleBlockReason && (
                                  <div className="text-[10px] text-orange-700 mt-0.5 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> {a.saleBlockReason}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-bold">{a.stockPharmacie}</td>
                              <td className="py-3 px-3 text-center font-mono text-slate-500">{a.stockCentral}</td>
                              <td className="py-3 px-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  value={a.minStockPharmacie}
                                  onChange={(e) => updateAlertThreshold(a.id, parseInt(e.target.value) || 0)}
                                  className="w-16 px-1.5 py-1 border border-slate-300 rounded text-center font-mono text-xs outline-none focus:border-purple-500 bg-white"
                                  title="Stock d'alerte : en dessous, l'article est signalé « stock bas »"
                                />
                              </td>
                              <td className="py-3 px-3 text-center">
                                <button
                                  onClick={() => togglePharmaAlert(a.id, a.name)}
                                  className={`p-1.5 rounded-lg cursor-pointer ${alertMuted ? 'bg-slate-200 text-slate-500 hover:bg-slate-300' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}`}
                                  title={alertMuted ? 'Alerte désactivée — cliquez pour réactiver' : 'Alerte activée — cliquez pour désactiver'}
                                >
                                  {alertMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                                </button>
                              </td>
                              <td className="py-3 px-3 text-right font-mono">{formatAr(a.priceComptoir)}</td>
                              <td className="py-3 px-3 text-center">
                                {alertMuted ? <span className="px-2 py-1 bg-slate-200 text-slate-600 text-xs rounded-full font-medium" title="Alerte désactivée pour cet article">🔕 Alerte off</span>
                                  : isOut ? <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">RUPTURE</span>
                                  : isLow ? <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">Stock bas</span>
                                  : <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">OK</span>}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {blocked
                                  ? <span className="px-2 py-1 bg-orange-200 text-orange-900 text-xs rounded-full font-bold">⛔ BLOQUÉ</span>
                                  : isArticleSaleable(a)
                                    ? <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">Vendable</span>
                                    : <span className="px-2 py-1 bg-slate-200 text-slate-600 text-xs rounded-full font-medium">Non vendable</span>}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <button
                                  onClick={() => { setBlockModal({ articleId: a.id, name: a.name, currentlyBlocked: blocked }); setBlockReason(a.saleBlockReason || ''); }}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer ml-auto ${
                                    blocked
                                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                      : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                                  }`}
                                >
                                  {blocked ? <><Unlock className="w-3.5 h-3.5" /> Débloquer</> : <><Ban className="w-3.5 h-3.5" /> Bloquer vente</>}
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

              {stockSub === 'demandes' && (
                <div className="space-y-3">
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-800">
                    Les demandes sont transmises au <strong>magasinier</strong> qui les traite depuis le <strong>dépôt central</strong> (dispersion vers la pharmacie).
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <button onClick={() => setFilterCat('all')} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filterCat === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Toutes</button>
                    {CATEGORIES.map(c => (
                      <button key={c} onClick={() => setFilterCat(c)} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filterCat === c ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{transferCategoryLabel(c)}</button>
                    ))}
                  </div>
                  {myRequests.filter(t => t.status === 'requested' && (filterCat === 'all' || t.category === filterCat)).length === 0 ? (
                    <div className="text-center py-8 text-slate-400 bg-slate-50 border border-dashed rounded-lg text-sm">
                      Aucune demande en cours. Cliquez sur <strong>Demander réappro</strong>.
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b text-xs text-slate-600">
                          <tr>
                            <th className="p-2 text-left">Service</th>
                            <th className="p-2 text-left">Article</th>
                            <th className="p-2 text-center">Qté</th>
                            <th className="p-2 text-left">Notes</th>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myRequests.filter(t => t.status === 'requested' && (filterCat === 'all' || t.category === filterCat)).map(tr => (
                            <tr key={tr.id} className="border-b hover:bg-slate-50">
                              <td className="p-2"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">{tr.targetServiceName || 'Pharmacie'}</span></td>
                              <td className="p-2 font-medium">{tr.articleName}</td>
                              <td className="p-2 text-center font-mono font-bold">{tr.quantity}</td>
                              <td className="p-2 text-xs text-slate-500 truncate max-w-[180px]">{tr.notes || '—'}</td>
                              <td className="p-2 text-xs text-slate-500">{tr.requestedAt ? new Date(tr.requestedAt).toLocaleDateString('fr-FR') : '—'}</td>
                              <td className="p-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => openReapproEdit(tr.id)} className="px-2 py-1 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded text-xs flex items-center gap-1 cursor-pointer font-medium">
                                    <Edit3 className="w-3 h-3" /> Modifier
                                  </button>
                                  <button onClick={() => cancelRequest(tr.id)} className="px-2 py-1 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded text-xs cursor-pointer font-medium">
                                    <Trash2 className="w-3 h-3" /> Annuler
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {stockSub === 'historique' && (
                <div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <button onClick={() => setFilterCat('all')} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filterCat === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Toutes</button>
                    {CATEGORIES.map(c => (
                      <button key={c} onClick={() => setFilterCat(c)} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filterCat === c ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{transferCategoryLabel(c)}</button>
                    ))}
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b text-slate-600">
                        <tr>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-left">Service</th>
                          <th className="p-2 text-left">Article</th>
                          <th className="p-2 text-center">Qté</th>
                          <th className="p-2 text-left">Demandeur</th>
                          <th className="p-2 text-center">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myRequestsFiltered.slice().reverse().slice(0, 50).map(tr => {
                          const u = state.users.find(x => x.id === tr.requestedBy);
                          return (
                            <tr key={tr.id} className="border-b hover:bg-slate-50">
                              <td className="p-2 text-slate-500">{tr.requestedAt ? new Date(tr.requestedAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                              <td className="p-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${transferCategoryColor(tr.category)}`}>{tr.targetServiceName || transferCategoryLabel(tr.category)}</span></td>
                              <td className="p-2 font-medium">{tr.articleName}</td>
                              <td className="p-2 text-center font-mono font-bold">{tr.quantity}</td>
                              <td className="p-2">{u?.name || '—'}</td>
                              <td className="p-2 text-center">
                                {tr.status === 'requested' && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-bold">En attente magasinier</span>}
                                {tr.status === 'transferred' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-bold">Livrée</span>}
                                {tr.status === 'cancelled' && <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] rounded-full font-bold">Annulée</span>}
                              </td>
                            </tr>
                          );
                        })}
                        {myRequestsFiltered.length === 0 && (
                          <tr><td colSpan={6} className="p-6 text-center text-slate-400">Aucune demande.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'delivered' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* À GAUCHE DE L'ÉCRAN : LA FILE D'ATTENTE DES LIVRAISONS EN COURS (Avant clôture de garde) */}
              <div className="divide-y border border-slate-200 rounded-xl max-h-[640px] overflow-y-auto bg-white shadow-sm">
                <div className="p-3.5 border-b bg-emerald-50 font-semibold text-xs flex justify-between items-center text-emerald-900 sticky top-0 z-10">
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-emerald-600" /> Livraisons avant clôture garde</span>
                  <span className="bg-emerald-600 text-white font-mono font-bold px-2 py-0.5 rounded-full text-[10px]">{unclosedDeliveryItems.length} art.</span>
                </div>
                {unclosedDeliveryItems.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald-500" />
                    <p className="text-sm font-medium">Aucune livraison non clôturée</p>
                    <p className="text-xs text-slate-400 mt-1">Toutes les livraisons du tour de garde ont été compilées</p>
                  </div>
                ) : (
                  unclosedDeliveryItems.map((item) => (
                    <div key={item.id} className="p-3 hover:bg-emerald-50/60 transition text-xs">
                      <div className="flex justify-between items-start font-bold text-slate-800">
                        <span>{item.patientName}</span>
                        <span className="font-mono text-emerald-700 font-bold">{formatAr(item.quantity * item.unitPrice)}</span>
                      </div>
                      <div className="flex justify-between items-center mt-1 text-[11px] text-slate-600">
                        <span className="font-semibold text-emerald-900">💊 {item.articleName} × {item.quantity}</span>
                        <span className="font-mono text-[10px] text-slate-400">{new Date(item.deliveredAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Responsable: {item.deliveredByName}</div>
                    </div>
                  ))
                )}
              </div>

              {/* À DROITE DE L'ÉCRAN : BASE POUR COMPILER LES LIVRAISONS DE GARDE & ARCHIVES */}
              <div className="lg:col-span-2 space-y-5">
                {/* En-tête de Clôture & Compilation */}
                <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 rounded-xl p-5 text-white shadow-sm flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Lock className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-bold text-base">Compilation des livraisons & Clôture de garde</h3>
                    </div>
                    <p className="text-xs text-emerald-100 mt-1 max-w-lg leading-relaxed">
                      Ce qui reste dans l'onglet délivrées constitue les livraisons effectuées avant la clôture de caisse / garde de la personne responsable de la pharmacie. Créez ici la compilation définitive.
                    </p>
                  </div>
                  <div>
                    {unclosedDeliveryItems.length > 0 ? (
                      <button
                        onClick={handleClosePharmaDeliveries}
                        className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg cursor-pointer transition whitespace-nowrap"
                      >
                        <Lock className="w-4 h-4" /> Clôturer et Compiler ({unclosedDeliveryItems.length} art. — {formatAr(unclosedTotalAmt)})
                      </button>
                    ) : (
                      <div className="px-3.5 py-2 bg-white/10 rounded-lg text-xs font-medium text-emerald-200 border border-white/10">
                        ✓ Aucune livraison à clôturer
                      </div>
                    )}
                  </div>
                </div>

                {/* Liste Délivrées — DEUX ONGLETS : Récap par article (défaut) / Détails Heure Patient Article Qté */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 flex justify-between items-center flex-wrap gap-3">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-blue-600" /> Livraisons avant clôture — Récap & Détails
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">Premier onglet par défaut : récap de vente par articles. Second onglet : heure / patient / article / qté.</p>
                    </div>
                    <div className="flex rounded-lg overflow-hidden border border-blue-200 text-xs font-semibold">
                      <button
                        onClick={() => setDeliveredDeliveryView('recap')}
                        className={`px-3 py-1.5 cursor-pointer transition ${deliveredDeliveryView === 'recap' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                      >
                        📊 Récap par articles
                      </button>
                      <button
                        onClick={() => setDeliveredDeliveryView('details')}
                        className={`px-3 py-1.5 cursor-pointer transition border-l border-blue-200 ${deliveredDeliveryView === 'details' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                      >
                        🕒 Heure / Patient / Article / Qté
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-white overflow-x-auto max-h-80">
                    {unclosedDeliveryItems.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs">Aucune livraison non clôturée à afficher.</div>
                    ) : deliveredDeliveryView === 'recap' ? (
                      (() => {
                        const byArticle: Record<string, number> = {};
                        unclosedDeliveryItems.forEach(it => {
                          byArticle[it.articleName] = (byArticle[it.articleName] || 0) + it.quantity;
                        });
                        const recap = Object.entries(byArticle).map(([articleName, totalQuantity]) => ({ articleName, totalQuantity })).sort((a, b) => b.totalQuantity - a.totalQuantity);
                        const totalQ = recap.reduce((s, r) => s + r.totalQuantity, 0);
                        return (
                          <table className="w-full text-xs">
                            <thead className="bg-blue-50 border-b border-blue-200 text-blue-800">
                              <tr>
                                <th className="p-2 text-left font-semibold">Article délivré</th>
                                <th className="p-2 text-right font-semibold">Qté totale vendue</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {recap.map((r) => (
                                <tr key={r.articleName} className="hover:bg-blue-50/40">
                                  <td className="p-2 font-bold text-blue-900">{r.articleName}</td>
                                  <td className="p-2 text-right font-mono font-bold text-blue-700">{r.totalQuantity}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-blue-100 font-bold border-t-2 border-blue-300">
                              <tr>
                                <td className="p-2 text-right text-blue-900">TOTAL GÉNÉRAL :</td>
                                <td className="p-2 text-right font-mono text-blue-900 text-sm">{totalQ}</td>
                              </tr>
                            </tfoot>
                          </table>
                        );
                      })()
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b text-slate-600">
                          <tr>
                            <th className="p-2 text-left font-semibold">Heure</th>
                            <th className="p-2 text-left font-semibold">Patient / Client</th>
                            <th className="p-2 text-left font-semibold">Article délivré</th>
                            <th className="p-2 text-right font-semibold">Qté</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {unclosedDeliveryItems
                            .slice()
                            .sort((a, b) => new Date(a.deliveredAt).getTime() - new Date(b.deliveredAt).getTime())
                            .map((item) => (
                              <tr key={item.id} className="hover:bg-blue-50/30">
                                <td className="p-2 font-mono text-slate-500 font-bold">{new Date(item.deliveredAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                <td className="p-2 font-medium text-slate-800">{item.patientName}</td>
                                <td className="p-2 font-semibold text-blue-900">{item.articleName}</td>
                                <td className="p-2 text-right font-mono font-bold text-blue-700">{item.quantity}</td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-blue-50 font-bold border-t border-blue-200">
                          <tr>
                            <td colSpan={3} className="p-2 text-right text-blue-900">TOTAL :</td>
                            <td className="p-2 text-right font-mono text-blue-900">{unclosedDeliveryItems.reduce((s, d) => s + d.quantity, 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'request' && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h4 className="font-bold text-purple-800 flex items-center gap-2">
                    <Send className="w-5 h-5 text-purple-600" /> Demande d'approvisionnement → Magasinier
                  </h4>
                  <p className="text-xs text-purple-700 mt-1">
                    La demande est envoyée au magasinier qui crée le transfert depuis le <strong>dépôt central</strong> vers la pharmacie.
                  </p>
                </div>
                <button onClick={openReapproNew} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer shadow transition">
                  <Plus className="w-4 h-4" /> Nouvelle demande
                </button>
              </div>
              <div className="text-center py-6 text-slate-500 text-sm">
                Ou consultez les demandes en cours dans l'onglet <button onClick={() => { setTab('stock'); setStockSub('demandes'); }} className="text-purple-600 font-semibold underline cursor-pointer">Stock pharmacie → Demandes</button>.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Blocage vente — Inline (no modal) */}
      {blockModal && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mt-0 order-first">
          <div className={`px-5 py-3 text-white font-bold flex items-center gap-2 ${blockModal.currentlyBlocked ? 'bg-emerald-600' : 'bg-orange-600'}`}>
            {blockModal.currentlyBlocked ? <Unlock className="w-5 h-5" /> : <Ban className="w-5 h-5" />}
            {blockModal.currentlyBlocked ? 'Débloquer la vente' : 'Bloquer la vente'}
            <div className="flex-1" />
            <button onClick={() => setBlockModal(null)} className="hover:bg-white/20 rounded p-1 px-2 cursor-pointer text-sm">✕ Fermer</button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-slate-700">
              Article : <strong>{blockModal.name}</strong>
            </p>
            {!blockModal.currentlyBlocked ? (
              <>
                <p className="text-xs text-slate-500">
                  Empêche la délivrance / vente même si le stock est encore disponible (réservation, attente de régularisation, lot douteux…).
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Motif du blocage *</label>
                  <input
                    type="text"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                    placeholder="Ex: Réservé patient X / En attente régularisation / Lot à vérifier"
                    autoFocus
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600">Confirmez le déblocage de la vente pour cet article.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setBlockModal(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm cursor-pointer hover:bg-slate-50">Annuler</button>
              <button
                onClick={toggleSaleBlock}
                className={`px-4 py-2 text-white rounded-lg text-sm font-bold cursor-pointer ${blockModal.currentlyBlocked ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'}`}
              >
                {blockModal.currentlyBlocked ? 'Confirmer déblocage' : 'Confirmer blocage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reapproModalOpen && (
        <div className="order-first">
        <DemandeAchatForm
          open={reapproModalOpen}
          onClose={closeReappro}
          articles={state.articles}
          defaultCategory="approvisionnement"
          initialLine={reapproEditingLine}
          initialNotes={reapproEditingNotes}
          initialCategory={reapproEditingCategory}
          isEditMode={!!reapproEditingId}
          onSubmit={submitReappro}
          theme="purple"
          pharmacyMode
        />
        </div>
      )}
    </div>
  );
}
