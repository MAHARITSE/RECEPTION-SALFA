import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  StockEntry, StockMovement, WarehouseService, InventorySession, InventoryLine,
  StockLocation, Article, ArticleFamily, Fournisseur, Famille,
  MovementHeader, MovementLine, MovementType
} from '../types';
import type { AppState } from '../store';
import {
  addAuditLog, addNotification, formatAr, ARTICLE_FAMILIES, familyLabel,
  transferCategoryLabel, TRANSFER_CATEGORIES,
  applyStockDelta, getArticleStock, locationLabel,
  createMovementWithLines,
} from '../store';
import { blockIfUnsavedDraftLine } from '../utils/validation';
import {
  Package, PackageCheck, PackagePlus, Search, Truck, Plus, Trash2, Save, Check,
  Filter, X, ArrowUpFromLine, ArrowLeftRight, ClipboardList,
  Building2, Settings2, Layers, Tag, DollarSign, Edit2, ShieldAlert,
  Calendar, CreditCard, ShoppingBag, Barcode, Bell, BellOff
} from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type Tab = 'stock' | 'articles' | 'familles' | 'fournisseurs' | 'appro' | 'requests' | 'inventory' | 'movements' | 'services';

const SERVICE_COLORS = ['purple', 'blue', 'rose', 'emerald', 'amber', 'sky', 'indigo', 'teal'];
const FAMILLE_COLORS = ['#0D47A1', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#6366F1'];

export default function ModuleMagasinier({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('stock');

  // Toasts
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // Stock central search
  const [searchStock, setSearchStock] = useState('');
  const [familyStockFilter, setFamilyStockFilter] = useState<string>('all');

  // === ARTICLES / CATALOGUE ===
  const [searchArticle, setSearchArticle] = useState('');
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [editingArtId, setEditingArtId] = useState<string | null>(null);
  const [artForm, setArtForm] = useState<{
    name: string;
    family: ArticleFamily;
    unit: string;
    barcode: string;
    purchasePrice: number;
    priceComptoir: number;
    priceSociete: number;
    priceExterne: number;
    minStockCentral: number;
    minStockPharmacie: number;
    alertDisabledCentral: boolean;
    alertDisabledPharmacie: boolean;
    saleBlocked: boolean;
    saleBlockReason: string;
  }>({
    name: '', family: 'MEDIC', unit: 'comprimé', barcode: '',
    purchasePrice: 0, priceComptoir: 0, priceSociete: 0, priceExterne: 0,
    minStockCentral: 10, minStockPharmacie: 5,
    alertDisabledCentral: false, alertDisabledPharmacie: false,
    saleBlocked: false, saleBlockReason: ''
  });

  // Grille tarifaire directe
  const [editingPricesArtId, setEditingPricesArtId] = useState<string | null>(null);
  const [editPrices, setEditPrices] = useState({ purchasePrice: 0, priceComptoir: 0, priceSociete: 0, priceExterne: 0 });

  // === FAMILLES ===
  const [showFamModal, setShowFamModal] = useState(false);
  const [editingFamId, setEditingFamId] = useState<string | null>(null);
  const [famForm, setFamForm] = useState({ code: '', name: '', color: '#0D47A1' });

  // === FOURNISSEURS ===
  const [searchSup, setSearchSup] = useState('');
  const [showSupModal, setShowSupModal] = useState(false);
  const [editingSupId, setEditingSupId] = useState<string | null>(null);
  const [supForm, setSupForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', nif: '', stat: '', notes: '' });

  // === ACHATS / APPROVISIONNEMENT ===
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [purchaseLines, setPurchaseLines] = useState<{ id: string; articleId: string; articleName: string; family: any; quantity: number; purchasePrice: number; expiryDate: string; amount: number; }[]>([]);
  const [purchaseSelLineId, setPurchaseSelLineId] = useState<string | null>(null);
  const [purchaseIsNew, setPurchaseIsNew] = useState(true);
  const [purchaseForm, setPurchaseForm] = useState({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 1, purchasePrice: 0, expiryDate: '' });
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseSearchIdx, setPurchaseSearchIdx] = useState(0);
  const purchaseSearchRef = useRef<HTMLInputElement>(null);
  const [entryCatFilter, setEntryCatFilter] = useState<string>('all');

  // Demandes & dispersion
  const [reqFilter, setReqFilter] = useState<'all' | 'pharmacy' | 'other'>('all');
  const [dispArticleId, setDispArticleId] = useState('');
  const [dispQty, setDispQty] = useState(1);
  const [dispServiceId, setDispServiceId] = useState('svc-pharmacie');
  const [dispReason, setDispReason] = useState('');

  // Sorties manuelle
  const [exitArticleId, setExitArticleId] = useState('');
  const [exitQty, setExitQty] = useState(1);
  const [exitReason, setExitReason] = useState('');
  const [exitFrom, setExitFrom] = useState<StockLocation>('central');
  const [movSub, setMovSub] = useState<'transfer' | 'exit' | 'history'>('transfer');
  const [movFilter, setMovFilter] = useState<'all' | StockMovement['type']>('all');

  // Inventaire
  const [invLocation, setInvLocation] = useState<StockLocation>('central');
  const [activeInvId, setActiveInvId] = useState<string | null>(null);
  const [invCounts, setInvCounts] = useState<Record<string, string>>({});
  const [invNotes, setInvNotes] = useState('');

  // Services
  const [newSvc, setNewSvc] = useState({ code: '', name: '', color: 'sky' });

  const services = state.warehouseServices || [];
  const activeServices = services.filter((s) => s.active);
  const fournisseurs = state.fournisseurs || [];
  const familles = state.familles || [];
  const familyOptions: Famille[] = familles.length
    ? familles
    : ARTICLE_FAMILIES.map((code, order) => ({ id: `default-${code}`, code, name: familyLabel(code), color: '#64748B', order }));
  const movements = state.stockMovements || [];
  const inventories = state.inventorySessions || [];

  // ============ ARTICLES CATALOGUE ============
  const openNewArticleModal = () => {
    setEditingArtId(null);
    setArtForm({
      name: '', family: 'MEDIC', unit: 'comprimé', barcode: '',
      purchasePrice: 0, priceComptoir: 0, priceSociete: 0, priceExterne: 0,
      minStockCentral: 10, minStockPharmacie: 5,
      alertDisabledCentral: false, alertDisabledPharmacie: false,
      saleBlocked: false, saleBlockReason: ''
    });
    setShowArticleModal(true);
  };

  const openEditArticleModal = (a: Article) => {
    setEditingArtId(a.id);
    setArtForm({
      name: a.name, family: a.family, unit: a.unit, barcode: a.barcode || '',
      purchasePrice: a.purchasePrice, priceComptoir: a.priceComptoir,
      priceSociete: a.priceSociete, priceExterne: a.priceExterne,
      minStockCentral: a.minStockCentral, minStockPharmacie: a.minStockPharmacie,
      alertDisabledCentral: !!a.alertDisabledCentral, alertDisabledPharmacie: !!a.alertDisabledPharmacie,
      saleBlocked: !!a.saleBlocked, saleBlockReason: a.saleBlockReason || ''
    });
    setShowArticleModal(true);
  };

  const saveArticle = () => {
    if (!artForm.name.trim() || !artForm.unit.trim()) { alert('Nom et unité requis'); return; }
    if (editingArtId) {
      setState(prev => {
        const next = {
          ...prev,
          articles: prev.articles.map(a => a.id === editingArtId ? { ...a, ...artForm, name: artForm.name.trim() } : a)
        };
        addAuditLog(next, 'MODIF_ARTICLE', `${artForm.name}`);
        return next;
      });
      showToast('Article mis à jour');
    } else {
      const newA: Article = {
        id: uuidv4(),
        name: artForm.name.trim(),
        family: artForm.family,
        unit: artForm.unit.trim(),
        barcode: artForm.barcode.trim() || undefined,
        purchasePrice: artForm.purchasePrice,
        priceComptoir: artForm.priceComptoir,
        priceSociete: artForm.priceSociete,
        priceExterne: artForm.priceExterne,
        stockCentral: 0,
        stockPharmacie: 0,
        minStockCentral: artForm.minStockCentral,
        minStockPharmacie: artForm.minStockPharmacie,
        alertDisabledCentral: artForm.alertDisabledCentral,
        alertDisabledPharmacie: artForm.alertDisabledPharmacie,
        saleBlocked: artForm.saleBlocked,
        saleBlockReason: artForm.saleBlockReason,
      };
      setState(prev => {
        const next = { ...prev, articles: [...prev.articles, newA] };
        addAuditLog(next, 'AJOUT_ARTICLE', `${newA.name}`);
        return next;
      });
      showToast('Nouvel article créé');
    }
    setShowArticleModal(false);
  };

  const deleteArticle = (id: string, name: string) => {
    if (!confirm(`Supprimer l'article "${name}" du catalogue ?`)) return;
    setState(prev => {
      const next = { ...prev, articles: prev.articles.filter(a => a.id !== id) };
      addAuditLog(next, 'SUPPRESSION_ARTICLE', name);
      return next;
    });
    showToast('Article supprimé');
  };

  const saveQuickPrices = () => {
    if (!editingPricesArtId) return;
    setState(prev => {
      const next = {
        ...prev,
        articles: prev.articles.map(a => a.id === editingPricesArtId ? { ...a, ...editPrices } : a)
      };
      addAuditLog(next, 'MODIF_TARIFS', `Article ${editingPricesArtId}`);
      return next;
    });
    setEditingPricesArtId(null);
    showToast('Tarifs mis à jour');
  };

  // Stock d'alerte : modification rapide du seuil central (par article)
  const updateCentralAlertThreshold = (articleId: string, value: number) => {
    setState(prev => ({
      ...prev,
      articles: prev.articles.map(a => (a.id === articleId ? { ...a, minStockCentral: Math.max(0, Math.round(value)) } : a))
    }));
  };

  // Activer / désactiver l'alerte stock d'un article pour le dépôt central
  const toggleCentralAlert = (articleId: string, name: string) => {
    setState(prev => {
      const art = prev.articles.find(a => a.id === articleId);
      const next = {
        ...prev,
        articles: prev.articles.map(a => (a.id === articleId ? { ...a, alertDisabledCentral: !a.alertDisabledCentral } : a))
      };
      addAuditLog(next, art?.alertDisabledCentral ? 'ALERTE_STOCK_CENTRAL_ACTIVEE' : 'ALERTE_STOCK_CENTRAL_DESACTIVEE', name);
      return next;
    });
    showToast('Préférence d\'alerte mise à jour');
  };

  // ============ FAMILLES ============
  const openNewFamilleModal = () => {
    setEditingFamId(null);
    setFamForm({ code: '', name: '', color: '#0D47A1' });
    setShowFamModal(true);
  };

  const openEditFamilleModal = (f: Famille) => {
    setEditingFamId(f.id);
    setFamForm({ code: f.code, name: f.name, color: f.color });
    setShowFamModal(true);
  };

  const saveFamille = () => {
    if (!famForm.code.trim() || !famForm.name.trim()) { alert('Code et nom obligatoires'); return; }
    const codeUpper = famForm.code.trim().toUpperCase();
    if (editingFamId) {
      setState(prev => ({
        ...prev,
        familles: prev.familles.map(f => f.id === editingFamId ? { ...f, code: codeUpper, name: famForm.name.trim(), color: famForm.color } : f)
      }));
      showToast('Famille mise à jour');
    } else {
      const newFam: Famille = {
        id: `fam-${uuidv4().slice(0, 8)}`,
        code: codeUpper,
        name: famForm.name.trim(),
        color: famForm.color,
        order: (familles.length || 0) + 1,
      };
      setState(prev => ({ ...prev, familles: [...(prev.familles || []), newFam] }));
      showToast('Nouvelle famille créée');
    }
    setShowFamModal(false);
  };

  const deleteFamille = (f: Famille) => {
    const count = state.articles.filter(a => a.family === f.code as any).length;
    if (count > 0) { alert(`Impossible de supprimer la famille "${f.name}" : ${count} article(s) y sont rattachés.`); return; }
    if (!confirm(`Supprimer la famille "${f.name}" ?`)) return;
    setState(prev => ({ ...prev, familles: prev.familles.filter(x => x.id !== f.id) }));
    showToast('Famille supprimée');
  };

  // ============ FOURNISSEURS ============
  const openNewSupModal = () => {
    setEditingSupId(null);
    setSupForm({ name: '', contactPerson: '', phone: '', email: '', address: '', nif: '', stat: '', notes: '' });
    setShowSupModal(true);
  };

  const openEditSupModal = (f: Fournisseur) => {
    setEditingSupId(f.id);
    setSupForm({
      name: f.name, contactPerson: f.contactPerson || '', phone: f.phone || '',
      email: f.email || '', address: f.address || '', nif: f.nif || '',
      stat: f.stat || '', notes: f.notes || ''
    });
    setShowSupModal(true);
  };

  const saveSupplier = () => {
    if (!supForm.name.trim()) { alert('Nom du fournisseur obligatoire'); return; }
    if (editingSupId) {
      setState(prev => ({
        ...prev,
        fournisseurs: prev.fournisseurs.map(f => f.id === editingSupId ? { ...f, ...supForm, name: supForm.name.trim() } : f)
      }));
      showToast('Fournisseur modifié');
    } else {
      const newF: Fournisseur = {
        id: `fourn-${uuidv4().slice(0, 8)}`,
        ...supForm,
        name: supForm.name.trim(),
        createdAt: new Date().toISOString()
      };
      setState(prev => ({ ...prev, fournisseurs: [...(prev.fournisseurs || []), newF] }));
      showToast('Nouveau fournisseur enregistré');
    }
    setShowSupModal(false);
  };

  const deleteSupplier = (f: Fournisseur) => {
    const countEntries = state.stockEntries.filter(e => e.supplier.toLowerCase() === f.name.toLowerCase()).length;
    if (countEntries > 0) { alert(`Impossible de supprimer le fournisseur "${f.name}" : ${countEntries} bon(s) de réception d'achat sont liés.`); return; }
    if (!confirm(`Supprimer le fournisseur "${f.name}" ?`)) return;
    setState(prev => ({ ...prev, fournisseurs: prev.fournisseurs.filter(x => x.id !== f.id) }));
    showToast('Fournisseur supprimé');
  };

  // ============ ACHATS & APPROVISIONNEMENT ============
  const purchaseFiltered = purchaseSearch.length >= 1
    ? state.articles.filter((a) => a.name.toLowerCase().includes(purchaseSearch.toLowerCase()))
    : [];

  const purchaseSelectArticle = (articleId: string) => {
    const a = state.articles.find((x) => x.id === articleId);
    if (!a) return;
    setPurchaseForm({
      id: uuidv4(),
      articleId: a.id,
      articleName: a.name,
      family: a.family,
      quantity: 1,
      purchasePrice: a.purchasePrice,
      expiryDate: a.expiryDate || '',
    });
    setPurchaseIsNew(true);
    setPurchaseSelLineId(null);
    setPurchaseSearch('');
    setTimeout(() => {
      const qtyInput = document.getElementById('purchase-qty-input');
      qtyInput?.focus();
      (qtyInput as HTMLInputElement)?.select();
    }, 50);
  };

  const purchaseArtKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setPurchaseSearchIdx((i) => Math.min(i + 1, purchaseFiltered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPurchaseSearchIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (purchaseFiltered.length > 0 && purchaseSearch) purchaseSelectArticle(purchaseFiltered[purchaseSearchIdx].id);
      else if (purchaseForm.articleName) purchaseSaveLine();
    } else if (e.key === 'Escape') { setPurchaseSearch(''); }
  };

  const purchaseSaveLine = () => {
    if (!purchaseForm.articleId || !purchaseForm.articleName) return;
    const amount = purchaseForm.quantity * purchaseForm.purchasePrice;
    const lineToSave = { ...purchaseForm, amount };
    if (purchaseIsNew || !purchaseLines.some((l) => l.id === purchaseForm.id)) {
      setPurchaseLines([...purchaseLines, { ...lineToSave, id: uuidv4() }]);
    } else {
      setPurchaseLines(purchaseLines.map((l) => (l.id === purchaseForm.id ? lineToSave : l)));
    }
    purchaseNew();
  };

  const purchaseNew = () => {
    setPurchaseForm({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 1, purchasePrice: 0, expiryDate: '' });
    setPurchaseSelLineId(null);
    setPurchaseIsNew(true);
    setPurchaseSearch('');
    setTimeout(() => purchaseSearchRef.current?.focus(), 50);
  };

  const purchaseDeleteLine = () => {
    if (!purchaseSelLineId) return;
    setPurchaseLines(purchaseLines.filter((l) => l.id !== purchaseSelLineId));
    purchaseNew();
  };

  const validatePurchase = () => {
    if (purchaseLines.length === 0) return;
    // Ne pas valider l'entrée d'achat si une ligne est en cours de saisie mais non enregistrée
    if (blockIfUnsavedDraftLine(purchaseForm, purchaseLines, { entityLabel: 'l\'article' })) return;
    if (!selectedSupplierId) { alert('Veuillez sélectionner un fournisseur dans la base'); return; }
    if (!invoiceRef.trim()) { alert('Référence du BL / Facture obligatoire'); return; }

    const supObj = fournisseurs.find(f => f.id === selectedSupplierId);
    const supName = supObj ? supObj.name : 'Fournisseur externe';

    setState((prev) => {
      let nextArticles = [...prev.articles];
      const newEntries: StockEntry[] = [];
      const newMovs: StockMovement[] = [];

      // === NOUVEAU : Créer en-tête + lignes mouvement ACHAT ===
      const movementLinesForHeader = purchaseLines.map(l => ({
        articleId: l.articleId,
        articleName: l.articleName,
        quantity: l.quantity,
        purchasePrice: l.purchasePrice,
        reason: `Achat ${supName}`,
      }));

      const { header: achatHeader } = createMovementWithLines(
        prev,
        {
          type: 'achat' as MovementType,
          ref: invoiceRef.trim(),
          fromLocation: 'external' as any,
          toLocation: 'central',
          userId: prev.currentUser?.id || 'MAGASINIER',
          userName: prev.currentUser?.name,
          notes: `Achat fournisseur ${supName}`,
        },
        movementLinesForHeader
      );

      purchaseLines.forEach((line) => {
        nextArticles = nextArticles.map((a) => {
          if (a.id !== line.articleId) return a;
          return {
            ...a,
            stockCentral: a.stockCentral + line.quantity,
            purchasePrice: line.purchasePrice,
            expiryDate: line.expiryDate || a.expiryDate,
            supplier: supName,
          };
        });

        newEntries.push({
          id: uuidv4(),
          articleId: line.articleId,
          articleName: line.articleName,
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
          supplier: supName,
          invoiceRef: invoiceRef.trim(),
          expiryDate: line.expiryDate || undefined,
          date: new Date().toISOString(),
          enteredBy: prev.currentUser?.id || 'MAGASINIER',
          category: 'central',
          destination: 'central',
        });

        newMovs.push({
          id: uuidv4(),
          type: 'entry',
          articleId: line.articleId,
          articleName: line.articleName,
          quantity: line.quantity,
          fromLocation: 'external' as any,
          toLocation: 'central',
          reason: `Achat fournisseur ${supName}`,
          ref: invoiceRef.trim(),
          date: new Date().toISOString(),
          userId: prev.currentUser?.id || 'MAGASINIER',
          userName: prev.currentUser?.name,
        });
      });

      const next = {
        ...prev,
        articles: nextArticles,
        stockEntries: [...prev.stockEntries, ...newEntries],
        stockMovements: [...(prev.stockMovements || []), ...newMovs],
        // movementHeaders & movementLines déjà mis à jour par createMovementWithLines
      };
      addAuditLog(next, 'ACHAT_DEPOT_CENTRAL', `Entrée d'achat ${purchaseLines.length} article(s) de ${supName} (BL: ${invoiceRef.trim()})`);
      return next;
    });

    setPurchaseLines([]);
    setInvoiceRef('');
    purchaseNew();
    showToast('Achat validé et entré au Dépôt central');
  };

  // Traite demande
  const fulfillRequest = (transferId: string) => {
    const tr = state.stockTransfers.find((t) => t.id === transferId);
    if (!tr) return;
    const art = state.articles.find((a) => a.id === tr.articleId);
    if (!art) return;

    if (art.stockCentral < tr.quantity) {
      alert(`Stock dépôt central insuffisant (${art.stockCentral}). Réalisez d'abord une entrée d'achat d'approvisionnement.`);
      return;
    }

    let toLoc: StockLocation = 'pharmacie';
    let serviceName = tr.targetServiceName || 'Pharmacie';
    const svcId = tr.targetServiceId;

    if (svcId) {
      const svc = services.find((s) => s.id === svcId);
      if (svc) {
        serviceName = svc.name;
        toLoc = svc.kind === 'pharmacie' ? 'pharmacie' : svc.id;
      }
    } else if (tr.category === 'approvisionnement' || tr.requestSource === 'pharmacy') {
      toLoc = 'pharmacie';
      serviceName = 'Pharmacie';
    } else if (tr.category === 'hospitalisation') {
      const soins = services.find((s) => s.code === 'SOINS' || s.name.toLowerCase().includes('soins'));
      toLoc = soins ? soins.id : 'svc-soins';
      serviceName = soins?.name || 'Soins / Hospitalisation';
    } else if (tr.category === 'bloc') {
      const bloc = services.find((s) => s.code === 'BLOC' || s.name.toLowerCase().includes('bloc'));
      toLoc = bloc ? (bloc.kind === 'pharmacie' ? 'pharmacie' : bloc.id) : 'svc-bloc';
      serviceName = bloc?.name || 'Bloc opératoire';
    }

    setState((prev) => {
      const updatedArticles = prev.articles.map((a) => {
        if (a.id !== tr.articleId) return a;
        let next = applyStockDelta(a, 'central', -tr.quantity);
        next = applyStockDelta(next, toLoc, tr.quantity);
        return next;
      });

      const mov: StockMovement = {
        id: uuidv4(),
        type: 'transfer',
        articleId: tr.articleId,
        articleName: tr.articleName,
        quantity: tr.quantity,
        fromLocation: 'central',
        toLocation: toLoc,
        reason: tr.notes || `Transfert vers ${serviceName}`,
        ref: tr.id.slice(0, 8),
        date: new Date().toISOString(),
        userId: prev.currentUser?.id || 'MAGASINIER',
        userName: prev.currentUser?.name,
        serviceId: typeof toLoc === 'string' && toLoc !== 'pharmacie' && toLoc !== 'central' ? toLoc : undefined,
        serviceName,
      };

      // === NOUVEAU : Mouvement TRANSFERT avec header + ligne ===
      createMovementWithLines(
        prev,
        {
          type: 'transfert' as MovementType,
          ref: tr.id.slice(0, 8),
          fromLocation: 'central',
          toLocation: toLoc,
          userId: prev.currentUser?.id || 'MAGASINIER',
          userName: prev.currentUser?.name,
          notes: tr.notes || `Transfert vers ${serviceName}`,
        },
        [{
          articleId: tr.articleId,
          articleName: tr.articleName,
          quantity: tr.quantity,
          reason: tr.notes || `Transfert vers ${serviceName}`,
        }]
      );

      const next = {
        ...prev,
        stockTransfers: prev.stockTransfers.map((t) =>
          t.id === transferId
            ? { ...t, status: 'transferred' as const, transferredBy: prev.currentUser?.id, transferredAt: new Date().toISOString(), targetServiceName: serviceName }
            : t
        ),
        articles: updatedArticles,
        stockMovements: [...(prev.stockMovements || []), mov],
      };
      addAuditLog(next, 'DISPERSION_SERVICE', `${tr.articleName} ×${tr.quantity} : Central → ${serviceName}`);
      if (toLoc === 'pharmacie' || tr.requestSource === 'pharmacy') {
        addNotification(next, 'pharmacy', `📦 Reçu réapprovisionnement: ${tr.articleName} (${tr.quantity})`, 'info');
      }
      return next;
    });
    showToast(`Transfert effectué vers ${serviceName}`);
  };

  const cancelRequest = (transferId: string) => {
    if (!confirm('Annuler cette demande ?')) return;
    setState((prev) => ({
      ...prev,
      stockTransfers: prev.stockTransfers.map((t) => (t.id === transferId ? { ...t, status: 'cancelled' as const } : t)),
    }));
    showToast('Demande annulée');
  };

  // Dispersion manuelle
  const doDispersion = () => {
    if (!dispArticleId || dispQty <= 0) { alert('Sélectionnez un article et une quantité valide'); return; }
    const art = state.articles.find((a) => a.id === dispArticleId);
    if (!art) return;
    if (art.stockCentral < dispQty) { alert(`Stock central insuffisant (${art.stockCentral})`); return; }
    const svc = services.find((s) => s.id === dispServiceId);
    if (!svc) { alert('Service destinataire invalide'); return; }
    const toLoc: StockLocation = svc.kind === 'pharmacie' ? 'pharmacie' : svc.id;

    setState((prev) => {
      const updatedArticles = prev.articles.map((a) => {
        if (a.id !== dispArticleId) return a;
        let next = applyStockDelta(a, 'central', -dispQty);
        next = applyStockDelta(next, toLoc, dispQty);
        return next;
      });
      const mov: StockMovement = {
        id: uuidv4(),
        type: 'transfer',
        articleId: art.id,
        articleName: art.name,
        quantity: dispQty,
        fromLocation: 'central',
        toLocation: toLoc,
        reason: dispReason || `Dispersion manuelle → ${svc.name}`,
        date: new Date().toISOString(),
        userId: prev.currentUser?.id || 'MAGASINIER',
        userName: prev.currentUser?.name,
        serviceId: svc.id,
        serviceName: svc.name,
      };
      const next = { ...prev, articles: updatedArticles, stockMovements: [...(prev.stockMovements || []), mov] };
      addAuditLog(next, 'DISPERSION_MANUELLE', `${art.name} ×${dispQty} → ${svc.name}`);
      return next;
    });
    setDispQty(1);
    setDispReason('');
    showToast(`Dispersion effectuée vers ${svc.name}`);
  };

  // Sortie
  const doExit = () => {
    if (!exitArticleId || exitQty <= 0) { alert('Article et quantité requis'); return; }
    if (!exitReason.trim()) { alert('Motif obligatoire'); return; }
    const art = state.articles.find((a) => a.id === exitArticleId);
    if (!art) return;
    const available = getArticleStock(art, exitFrom);
    if (available < exitQty) { alert(`Stock insuffisant sur ${locationLabel(exitFrom, services)} (${available})`); return; }

    setState((prev) => {
      const updatedArticles = prev.articles.map((a) => (a.id === exitArticleId ? applyStockDelta(a, exitFrom, -exitQty) : a));
      const mov: StockMovement = {
        id: uuidv4(),
        type: 'exit',
        articleId: art.id,
        articleName: art.name,
        quantity: exitQty,
        fromLocation: exitFrom,
        toLocation: 'external' as any,
        reason: exitReason.trim(),
        date: new Date().toISOString(),
        userId: prev.currentUser?.id || 'MAGASINIER',
        userName: prev.currentUser?.name,
      };
      const next = { ...prev, articles: updatedArticles, stockMovements: [...(prev.stockMovements || []), mov] };
      addAuditLog(next, 'SORTIE_STOCK', `${art.name} ×${exitQty} depuis ${locationLabel(exitFrom, services)} — ${exitReason}`);
      return next;
    });
    setExitQty(1);
    setExitReason('');
    showToast('Sortie de stock enregistrée');
  };

  // Inventaire
  const startInventory = () => {
    const lines: InventoryLine[] = state.articles.map((a) => ({
      articleId: a.id,
      articleName: a.name,
      theoreticalQty: getArticleStock(a, invLocation),
      countedQty: null,
      difference: 0,
    }));
    const session: InventorySession = {
      id: uuidv4(),
      location: invLocation,
      locationLabel: locationLabel(invLocation, services),
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      startedBy: state.currentUser?.id || 'MAGASINIER',
      startedByName: state.currentUser?.name,
      lines,
      notes: invNotes,
    };
    setState((prev) => ({ ...prev, inventorySessions: [...(prev.inventorySessions || []), session] }));
    setActiveInvId(session.id);
    setInvCounts({});
    showToast('Session d\'inventaire démarrée');
  };

  const completeInventory = () => {
    if (!activeInvId) return;
    const session = inventories.find((i) => i.id === activeInvId);
    if (!session) return;
    if (!confirm('Valider l\'inventaire et ajuster les stocks théoriques selon les comptages réels ?')) return;

    setState((prev) => {
      const sess = (prev.inventorySessions || []).find((i) => i.id === activeInvId);
      if (!sess) return prev;

      const updatedLines: InventoryLine[] = sess.lines.map((l) => {
        const raw = invCounts[l.articleId];
        const counted = raw === undefined || raw === '' ? l.theoreticalQty : parseInt(raw, 10);
        const c = Number.isFinite(counted) ? counted : l.theoreticalQty;
        return { ...l, countedQty: c, difference: c - l.theoreticalQty };
      });

      let nextArticles = [...prev.articles];
      const newMovs: StockMovement[] = [];

      updatedLines.forEach((l) => {
        if (l.difference === 0) return;
        nextArticles = nextArticles.map((a) => (a.id === l.articleId ? applyStockDelta(a, sess.location, l.difference) : a));
        newMovs.push({
          id: uuidv4(),
          type: 'inventory_adjust',
          articleId: l.articleId,
          articleName: l.articleName,
          quantity: Math.abs(l.difference),
          fromLocation: l.difference < 0 ? sess.location : ('external' as any),
          toLocation: l.difference > 0 ? sess.location : ('external' as any),
          reason: `Ajustement inventaire ${sess.locationLabel}: théorique ${l.theoreticalQty} → compté ${l.countedQty}`,
          date: new Date().toISOString(),
          userId: prev.currentUser?.id || 'MAGASINIER',
          userName: prev.currentUser?.name,
        });
      });

      const next = {
        ...prev,
        articles: nextArticles,
        stockMovements: [...(prev.stockMovements || []), ...newMovs],
        inventorySessions: (prev.inventorySessions || []).map((i) =>
          i.id === activeInvId
            ? { ...i, status: 'completed' as const, completedAt: new Date().toISOString(), lines: updatedLines, notes: invNotes || i.notes }
            : i
        ),
      };

      // === NOUVEAU : Mouvement INVENTAIRE avec header + lignes ===
      const invAdjustLines = updatedLines
        .filter(l => l.difference !== 0)
        .map(l => ({
          articleId: l.articleId,
          articleName: l.articleName,
          quantity: Math.abs(l.difference),
          reason: `Ajustement inventaire: ${l.theoreticalQty} → ${l.countedQty}`,
        }));

      if (invAdjustLines.length > 0) {
        createMovementWithLines(
          prev,
          {
            type: 'inventaire' as MovementType,
            ref: `INV-${sess.id.slice(0, 8)}`,
            fromLocation: sess.location,
            toLocation: sess.location,
            userId: prev.currentUser?.id || 'MAGASINIER',
            userName: prev.currentUser?.name,
            notes: `Inventaire ${sess.locationLabel}`,
          },
          invAdjustLines
        );
      }

      addAuditLog(next, 'INVENTAIRE_VALIDE', `Inventaire ${sess.locationLabel} validé — ${updatedLines.filter((l) => l.difference !== 0).length} écart(s) ajustés`);
      return next;
    });
    setActiveInvId(null);
    setInvCounts({});
    setInvNotes('');
    showToast('Inventaire validé & stocks réajustés');
  };

  // Services
  const addService = () => {
    if (!newSvc.code.trim() || !newSvc.name.trim()) { alert('Code et nom du service requis'); return; }
    const codeUp = newSvc.code.trim().toUpperCase();
    if (services.some((s) => s.code.toUpperCase() === codeUp)) { alert('Ce code service existe déjà'); return; }

    const svc: WarehouseService = {
      id: `svc-${uuidv4().slice(0, 8)}`,
      code: codeUp,
      name: newSvc.name.trim(),
      kind: 'service',
      color: newSvc.color,
      active: true,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => {
      const next = { ...prev, warehouseServices: [...(prev.warehouseServices || []), svc] };
      addAuditLog(next, 'AJOUT_SERVICE_ENTREPOT', `Service: ${svc.name} (${svc.code})`);
      return next;
    });
    setNewSvc({ code: '', name: '', color: 'sky' });
    showToast('Service créé');
  };

  const toggleService = (id: string) => {
    const svc = services.find((s) => s.id === id);
    if (!svc) return;
    if (svc.kind === 'pharmacie') { alert('Le service Pharmacie est fixe.'); return; }
    setState((prev) => ({
      ...prev,
      warehouseServices: (prev.warehouseServices || []).map((s) => (s.id === id ? { ...s, active: !s.active } : s)),
    }));
    showToast('Statut du service mis à jour');
  };

  // Filtres
  const filteredStockArticles = state.articles.filter((a) => {
    const q = searchStock.toLowerCase();
    const matchQ = a.name.toLowerCase().includes(q) || familyLabel(a.family, familles).toLowerCase().includes(q) || (a.barcode || '').includes(q);
    const matchFam = familyStockFilter === 'all' || a.family === familyStockFilter;
    return matchQ && matchFam;
  });

  const filteredCatalogArticles = state.articles.filter((a) => {
    const q = searchArticle.toLowerCase();
    return a.name.toLowerCase().includes(q) || familyLabel(a.family, familles).toLowerCase().includes(q) || (a.barcode || '').includes(q);
  });

  const filteredSuppliers = fournisseurs.filter((f) => {
    const q = searchSup.toLowerCase();
    return f.name.toLowerCase().includes(q) || (f.phone || '').includes(q) || (f.email || '').toLowerCase().includes(q);
  });

  const pendingRequests = state.stockTransfers.filter((t) => {
    if (t.status !== 'requested') return false;
    if (reqFilter === 'pharmacy') return t.requestSource === 'pharmacy' || t.targetServiceId === 'svc-pharmacie' || t.category === 'approvisionnement';
    if (reqFilter === 'other') return t.requestSource !== 'pharmacy' && t.category !== 'approvisionnement';
    return true;
  });

  const entriesFiltered = state.stockEntries.filter((e) => entryCatFilter === 'all' || (e.category || 'central') === entryCatFilter);
  const movFiltered = movements.filter((m) => movFilter === 'all' || m.type === movFilter).slice().reverse().slice(0, 100);
  const activeInv = inventories.find((i) => i.id === activeInvId && i.status === 'in_progress');
  const pharmacyPending = state.stockTransfers.filter(
    (t) => t.status === 'requested' && (t.requestSource === 'pharmacy' || t.targetServiceId === 'svc-pharmacie' || t.category === 'approvisionnement')
  ).length;

  const locationOptions: { value: StockLocation; label: string }[] = [
    { value: 'central', label: 'Dépôt central' },
    { value: 'pharmacie', label: 'Pharmacie' },
    ...activeServices.filter((s) => s.kind === 'service').map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-lg z-50 animate-bounce font-medium text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {toast}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl p-3.5 shadow-sm border">
          <div className="text-xs text-slate-500 font-medium">Catalogue</div>
          <div className="text-xl font-bold text-slate-800 mt-0.5">{state.articles.length} <span className="text-xs font-normal text-slate-400">articles</span></div>
        </div>
        <div className="bg-white rounded-xl p-3.5 shadow-sm border">
          <div className="text-xs text-amber-600 font-medium">Alertes Stock Bas</div>
          <div className="text-xl font-bold text-amber-700 mt-0.5">
            {state.articles.filter(a => !a.alertDisabledCentral && a.stockCentral <= a.minStockCentral).length} <span className="text-xs font-normal text-slate-400">central</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-3.5 shadow-sm border">
          <div className="text-xs text-rose-600 font-medium">Ruptures Central</div>
          <div className="text-xl font-bold text-rose-700 mt-0.5">
            {state.articles.filter(a => a.stockCentral <= 0).length} <span className="text-xs font-normal text-slate-400">articles</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-3.5 shadow-sm border">
          <div className="text-xs text-indigo-600 font-medium">Fournisseurs</div>
          <div className="text-xl font-bold text-indigo-800 mt-0.5">{fournisseurs.length} <span className="text-xs font-normal text-slate-400">actifs</span></div>
        </div>
        <div className="bg-white rounded-xl p-3.5 shadow-sm border">
          <div className="text-xs text-purple-600 font-medium">Demandes Appro</div>




          <div className="text-xl font-bold text-purple-800 mt-0.5">{state.stockTransfers.filter(t => t.status === 'requested').length} <span className="text-xs font-normal text-slate-400">en attente</span></div>
        </div>
        <div className="bg-white rounded-xl p-3.5 shadow-sm border">
          <div className="text-xs text-emerald-600 font-medium">Services Entrepôt</div>
          <div className="text-xl font-bold text-emerald-800 mt-0.5">{activeServices.length} <span className="text-xs font-normal text-slate-400">destinataires</span></div>
        </div>
      </div>

      {/* Main Module Wrapper */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto bg-slate-50">
          {[
            { key: 'stock' as Tab, l: '📦 Stock Central & Emplacements', icon: WarehouseIcon },
            { key: 'articles' as Tab, l: `🏷️ Catalogue & Articles (${state.articles.length})` },
            { key: 'familles' as Tab, l: `🔖 Familles (${familles.length || ARTICLE_FAMILIES.length})` },
            { key: 'fournisseurs' as Tab, l: `🚚 Fournisseurs (${fournisseurs.length})` },
            { key: 'appro' as Tab, l: `📥 Approvisionnement & Achats` },
            { key: 'requests' as Tab, l: `📩 Demandes (${state.stockTransfers.filter((t) => t.status === 'requested').length})` },
            { key: 'inventory' as Tab, l: '📋 Inventaires Physiques' },
            { key: 'movements' as Tab, l: `🔄 Entrées / Sorties (${movements.length})` },
            { key: 'services' as Tab, l: `🏥 Services Destinataires` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-xs font-semibold border-b-2 cursor-pointer whitespace-nowrap transition ${
                tab === t.key ? 'border-blue-600 text-blue-700 bg-white shadow-sm' : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* ===== STOCK CENTRAL & EMPLACEMENTS ===== */}
          {tab === 'stock' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type="text" value={searchStock} onChange={(e) => setSearchStock(e.target.value)} className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm outline-none" placeholder="Filtrer par nom, code-barres..." />
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Filter className="w-4 h-4 text-slate-400 mr-1" />
                  <button onClick={() => setFamilyStockFilter('all')} className={`px-2.5 py-1 rounded text-xs cursor-pointer ${familyStockFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>Tous</button>
                  {familyOptions.map(f => (
                    <button key={f.code} onClick={() => setFamilyStockFilter(f.code)} className={`px-2.5 py-1 rounded text-xs cursor-pointer ${familyStockFilter === f.code ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{f.name}</button>
                  ))}
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-2.5">Famille</th>
                      <th className="p-2.5">Article</th>
                      <th className="p-2.5 text-center bg-sky-50 font-bold text-sky-900">Stock Dépôt Central</th>
                      <th className="p-2.5 text-center">Stock Pharmacie</th>
                      {activeServices.filter((s) => s.kind === 'service').map((s) => (
                        <th key={s.id} className="p-2.5 text-center">{s.name}</th>
                      ))}
                      <th className="p-2.5 text-right">Prix d'Achat</th>
                      <th className="p-2.5 text-center" title="Seuil d'alerte (stock bas) pour le dépôt central">Stock d'alerte</th>
                      <th className="p-2.5 text-center" title="Activer / désactiver l'alerte pour cet article">Alerte</th>
                      <th className="p-2.5 text-center">Statut Central</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStockArticles.map((a) => {
                      const alertMuted = !!a.alertDisabledCentral;
                      const out = !alertMuted && a.stockCentral <= 0;
                      const low = !alertMuted && a.stockCentral <= a.minStockCentral && a.stockCentral > 0;
                      return (
                        <tr key={a.id} className={`border-b hover:bg-slate-50/80 ${out ? 'bg-rose-50/50' : low ? 'bg-amber-50/50' : ''}`}>
                          <td className="p-2.5"><span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold">{familyLabel(a.family, familles)}</span></td>
                          <td className="p-2.5 font-medium text-slate-900">
                            {a.name}
                            {a.saleBlocked && <span className="ml-2 px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[9px] font-bold">Vente Bloquée</span>}
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-sm bg-sky-50/30">{a.stockCentral} {a.unit}</td>
                          <td className="p-2.5 text-center font-mono text-slate-700">{a.stockPharmacie}</td>
                          {activeServices.filter((s) => s.kind === 'service').map((s) => (
                            <td key={s.id} className="p-2.5 text-center font-mono text-slate-500">{a.serviceStocks?.[s.id] ?? 0}</td>
                          ))}
                          <td className="p-2.5 text-right font-mono text-slate-600">{formatAr(a.purchasePrice)}</td>
                          <td className="p-2.5 text-center">
                            <input
                              type="number"
                              min={0}
                              value={a.minStockCentral}
                              onChange={(e) => updateCentralAlertThreshold(a.id, parseInt(e.target.value) || 0)}
                              className="w-16 px-1.5 py-1 border border-slate-300 rounded text-center font-mono text-xs outline-none focus:border-blue-500 bg-white"
                              title="Stock d'alerte : en dessous, l'article est signalé « stock bas »"
                            />
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              onClick={() => toggleCentralAlert(a.id, a.name)}
                              className={`p-1.5 rounded-lg cursor-pointer ${alertMuted ? 'bg-slate-200 text-slate-500 hover:bg-slate-300' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                              title={alertMuted ? 'Alerte désactivée — cliquez pour réactiver' : 'Alerte activée — cliquez pour désactiver'}
                            >
                              {alertMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="p-2.5 text-center">
                            {alertMuted ? <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] rounded-full font-bold" title="Alerte désactivée pour cet article">🔕 ALERTE OFF</span>
                              : out ? <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] rounded-full font-bold">RUPTURE</span>
                              : low ? <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-full font-bold">STOCK BAS</span>
                              : <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded-full font-bold">OK</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== CATALOGUE & ARTICLES ===== */}
          {tab === 'articles' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input type="text" value={searchArticle} onChange={(e) => setSearchArticle(e.target.value)} className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm outline-none" placeholder="Rechercher un article du catalogue..." />
                </div>
                <button onClick={openNewArticleModal} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 cursor-pointer text-xs font-semibold shadow">
                  <Plus className="w-4 h-4" /> Nouvel article
                </button>
              </div>

              <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-2.5">Famille</th>
                      <th className="p-2.5">Code / Nom Article</th>
                      <th className="p-2.5">Unité</th>
                      <th className="p-2.5 text-right">P. Achat</th>
                      <th className="p-2.5 text-right text-blue-700">P. Comptoir</th>
                      <th className="p-2.5 text-right text-indigo-700">P. Société</th>
                      <th className="p-2.5 text-right text-purple-700">P. Externe</th>
                      <th className="p-2.5 text-center" title="Stock d'alerte Central / Pharmacie">Stock alerte C/P</th>
                      <th className="p-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalogArticles.map((a) => (
                      <tr key={a.id} className="border-b hover:bg-slate-50">
                        <td className="p-2.5"><span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">{familyLabel(a.family, familles)}</span></td>
                        <td className="p-2.5 font-semibold text-slate-900">
                          {a.name}
                          {a.barcode && <span className="block text-[10px] font-mono text-slate-400">Barcode: {a.barcode}</span>}
                        </td>
                        <td className="p-2.5 text-slate-500">{a.unit}</td>
                        <td className="p-2.5 text-right font-mono text-slate-600">{formatAr(a.purchasePrice)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-blue-700">{formatAr(a.priceComptoir)}</td>
                        <td className="p-2.5 text-right font-mono text-indigo-700">{formatAr(a.priceSociete)}</td>
                        <td className="p-2.5 text-right font-mono text-purple-700">{formatAr(a.priceExterne)}</td>
                        <td className="p-2.5 text-center font-mono text-slate-500">{a.minStockCentral} / {a.minStockPharmacie}</td>
                        <td className="p-2.5 text-right">
                          <button onClick={() => openEditArticleModal(a)} className="p-1 text-blue-600 hover:bg-blue-50 rounded cursor-pointer mr-1" title="Modifier fiche">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => deleteArticle(a.id, a.name)} className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer" title="Supprimer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal Article Form */}
              {showArticleModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
                    <div className="bg-blue-700 text-white px-6 py-4 flex justify-between items-center">
                      <h3 className="font-bold text-base flex items-center gap-2">
                        <Package className="w-5 h-5" /> {editingArtId ? 'Modifier l\'article' : 'Créer un nouvel article'}
                      </h3>
                      <button onClick={() => setShowArticleModal(false)} className="cursor-pointer text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
                    </div>

                    <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="font-bold block text-slate-700 mb-1">Désignation / Nom de l'article *</label>
                          <input type="text" value={artForm.name} onChange={e => setArtForm({ ...artForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" placeholder="Ex: Paracétamol 500mg" />
                        </div>
                        <div>
                          <label className="font-bold block text-slate-700 mb-1">Famille d'articles *</label>
                          <select value={artForm.family} onChange={e => setArtForm({ ...artForm, family: e.target.value as ArticleFamily })} className="w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none cursor-pointer">
                            {familyOptions.map(f => <option key={f.code} value={f.code}>{f.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="font-bold block text-slate-700 mb-1">Unité de conditionnement *</label>
                          <input type="text" value={artForm.unit} onChange={e => setArtForm({ ...artForm, unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" placeholder="comprimé, flacon, boîte..." />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="font-bold block text-slate-700 mb-1">Code-barres / EAN (optionnel)</label>
                          <input type="text" value={artForm.barcode} onChange={e => setArtForm({ ...artForm, barcode: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm outline-none font-mono" placeholder="370001234567..." />
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 border rounded-xl space-y-3">
                        <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-emerald-600" /> Grille tarifaire & Prix d'achat</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Prix d'Achat</label>
                            <input type="number" min={0} value={artForm.purchasePrice} onChange={e => setArtForm({ ...artForm, purchasePrice: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded font-mono text-sm" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-blue-700 mb-0.5">P. Comptoir</label>
                            <input type="number" min={0} value={artForm.priceComptoir} onChange={e => setArtForm({ ...artForm, priceComptoir: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded font-mono text-sm" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-indigo-700 mb-0.5">P. Société</label>
                            <input type="number" min={0} value={artForm.priceSociete} onChange={e => setArtForm({ ...artForm, priceSociete: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded font-mono text-sm" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-purple-700 mb-0.5">P. Externe</label>
                            <input type="number" min={0} value={artForm.priceExterne} onChange={e => setArtForm({ ...artForm, priceExterne: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1.5 border rounded font-mono text-sm" />
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                        <h4 className="font-bold text-amber-900 text-xs flex items-center gap-1.5"><Bell className="w-4 h-4 text-amber-600" /> Stocks d'alerte & notifications</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="font-bold block text-slate-700 mb-1">Stock d'alerte Dépôt Central</label>
                            <input type="number" min={0} value={artForm.minStockCentral} onChange={e => setArtForm({ ...artForm, minStockCentral: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
                            <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                              <input type="checkbox" checked={artForm.alertDisabledCentral} onChange={e => setArtForm({ ...artForm, alertDisabledCentral: e.target.checked })} className="w-3.5 h-3.5 rounded text-amber-600" />
                              🔕 Désactiver l'alerte (central)
                            </label>
                          </div>
                          <div>
                            <label className="font-bold block text-slate-700 mb-1">Stock d'alerte Pharmacie</label>
                            <input type="number" min={0} value={artForm.minStockPharmacie} onChange={e => setArtForm({ ...artForm, minStockPharmacie: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
                            <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                              <input type="checkbox" checked={artForm.alertDisabledPharmacie} onChange={e => setArtForm({ ...artForm, alertDisabledPharmacie: e.target.checked })} className="w-3.5 h-3.5 rounded text-amber-600" />
                              🔕 Désactiver l'alerte (pharmacie)
                            </label>
                          </div>
                        </div>
                        <p className="text-[10px] text-amber-800">En dessous du stock d'alerte, l'article est signalé « stock bas ». L'alerte peut être désactivée par article et par dépôt — la vente reste bloquée en cas de rupture même si l'alerte est off.</p>
                      </div>

                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                        <label className="flex items-center gap-2 font-bold text-rose-800 cursor-pointer">
                          <input type="checkbox" checked={artForm.saleBlocked} onChange={e => setArtForm({ ...artForm, saleBlocked: e.target.checked })} className="w-4 h-4 rounded text-rose-600" />
                          Bloquer la vente en pharmacie
                        </label>
                        {artForm.saleBlocked && (
                          <input type="text" value={artForm.saleBlockReason} onChange={e => setArtForm({ ...artForm, saleBlockReason: e.target.value })} className="w-full px-3 py-1.5 border border-rose-300 rounded text-xs" placeholder="Motif du blocage (ex: réservé, rupture forcée...)" />
                        )}
                      </div>

                      <button onClick={saveArticle} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer shadow flex items-center justify-center gap-2 text-sm">
                        <Check className="w-4 h-4" /> {editingArtId ? 'Enregistrer les modifications' : 'Créer l\'article'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== FAMILLES / CATEGORIES ===== */}
          {tab === 'familles' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <Tag className="w-5 h-5 text-purple-600" /> Gestion des familles & catégories d'articles
                  </h3>
                  <p className="text-sm text-slate-500">Classification dynamique par couleur et code court.</p>
                </div>
                <button onClick={openNewFamilleModal} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 cursor-pointer text-xs font-semibold shadow">
                  <Plus className="w-4 h-4" /> Nouvelle famille
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {familles.map(f => {
                  const count = state.articles.filter(a => a.family === f.code as any).length;
                  return (
                    <div key={f.id} className="bg-white border rounded-xl shadow-sm overflow-hidden p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-xs font-bold text-white font-mono" style={{ backgroundColor: f.color }}>{f.code}</span>
                        <div className="flex gap-1">
                          <button onClick={() => openEditFamilleModal(f)} className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteFamille(f)} className="p-1 hover:bg-rose-50 rounded text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div>
                        <div className="font-bold text-base text-slate-800">{f.name}</div>
                        <div className="text-xs text-slate-500 mt-1">{count} article(s) relié(s)</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {showFamModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="bg-purple-700 text-white px-5 py-3.5 flex justify-between items-center">
                      <h3 className="font-bold text-sm flex items-center gap-2"><Tag className="w-4 h-4" /> {editingFamId ? 'Modifier la famille' : 'Nouvelle famille'}</h3>
                      <button onClick={() => setShowFamModal(false)} className="cursor-pointer text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-5 space-y-3 text-xs">
                      <div>
                        <label className="font-bold block mb-1">Code court (ex: MEDIC) *</label>
                        <input type="text" value={famForm.code} onChange={e => setFamForm({ ...famForm, code: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border rounded-lg uppercase font-mono" placeholder="MEDIC" maxLength={8} />
                      </div>
                      <div>
                        <label className="font-bold block mb-1">Intitulé de la famille *</label>
                        <input type="text" value={famForm.name} onChange={e => setFamForm({ ...famForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="Médicaments..." />
                      </div>
                      <div>
                        <label className="font-bold block mb-1">Couleur distinctive</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {FAMILLE_COLORS.map(c => (
                            <button key={c} onClick={() => setFamForm({ ...famForm, color: c })} className={`w-7 h-7 rounded-full cursor-pointer ${famForm.color === c ? 'ring-2 ring-offset-2 ring-purple-600' : ''}`} style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      </div>
                      <button onClick={saveFamille} className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg cursor-pointer text-xs shadow">
                        Enregistrer la famille
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== FOURNISSEURS ===== */}
          {tab === 'fournisseurs' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input type="text" value={searchSup} onChange={(e) => setSearchSup(e.target.value)} className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm outline-none" placeholder="Rechercher un fournisseur..." />
                </div>
                <button onClick={openNewSupModal} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 cursor-pointer text-xs font-semibold shadow">
                  <Plus className="w-4 h-4" /> Nouveau fournisseur
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredSuppliers.map((f) => {
                  const countAchats = state.stockEntries.filter(e => e.supplier.toLowerCase() === f.name.toLowerCase()).length;
                  return (
                    <div key={f.id} className="bg-white border rounded-xl shadow-sm p-4 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                            <Truck className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold text-sm text-slate-800">{f.name}</div>
                            <div className="text-[11px] text-slate-500">{countAchats} bon(s) de réception d'achat</div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => openEditSupModal(f)} className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteSupplier(f)} className="p-1 hover:bg-rose-50 rounded text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="text-xs space-y-1 pt-2 text-slate-600 border-t">
                        <div>📞 Tél: {f.phone || '—'}</div>
                        <div>✉️ Email: {f.email || '—'}</div>
                        <div>📍 Adresse: {f.address || '—'}</div>
                        <div className="flex gap-4 text-[11px] text-slate-500 pt-1">
                          <span>NIF: {f.nif || '—'}</span>
                          <span>STAT: {f.stat || '—'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {showSupModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                    <div className="bg-indigo-700 text-white px-5 py-3.5 flex justify-between items-center">
                      <h3 className="font-bold text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> {editingSupId ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h3>
                      <button onClick={() => setShowSupModal(false)} className="cursor-pointer text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-5 space-y-3 text-xs">
                      <div>
                        <label className="font-bold block mb-1">Raison sociale / Nom *</label>
                        <input type="text" value={supForm.name} onChange={e => setSupForm({ ...supForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ex: PHARMA LABS S.A." />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-bold block mb-1">Téléphone</label>
                          <input type="text" value={supForm.phone} onChange={e => setSupForm({ ...supForm, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="034 00 111 22" />
                        </div>
                        <div>
                          <label className="font-bold block mb-1">E-mail</label>
                          <input type="email" value={supForm.email} onChange={e => setSupForm({ ...supForm, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="contact@fournisseur.mg" />
                        </div>
                      </div>
                      <div>
                        <label className="font-bold block mb-1">Adresse</label>
                        <input type="text" value={supForm.address} onChange={e => setSupForm({ ...supForm, address: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="Ankorondrano, Antananarivo" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-bold block mb-1">NIF</label>
                          <input type="text" value={supForm.nif} onChange={e => setSupForm({ ...supForm, nif: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                        </div>
                        <div>
                          <label className="font-bold block mb-1">STAT</label>
                          <input type="text" value={supForm.stat} onChange={e => setSupForm({ ...supForm, stat: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                        </div>
                      </div>
                      <button onClick={saveSupplier} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer text-xs shadow">
                        Enregistrer le fournisseur
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== APPROVISIONNEMENT & ACHATS ===== */}
          {tab === 'appro' && (
            <div className="space-y-4">
              <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-3">
                <h4 className="font-bold text-sky-900 flex items-center gap-2">
                  <PackagePlus className="w-5 h-5" /> Entrée d'Achat Fournisseur → Dépôt Central
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">👤 Sélectionner le Fournisseur *</label>
                    <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white cursor-pointer">
                      <option value="">— Choisir dans la base fournisseurs —</option>
                      {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.name} {f.phone ? `(${f.phone})` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">📄 N° BL / Bon de Livraison / Facture *</label>
                    <input type="text" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none bg-white font-mono" placeholder="BL-2026-001..." />
                  </div>
                </div>
              </div>

              {/* Grid Achat */}
              <div className="bg-[#f4f4f4] border border-slate-300 rounded text-xs p-2">
                <div className="bg-slate-100 border-b border-slate-300 p-2 mb-2 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[200px] relative">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Article à ajouter (Tapez le nom...)</label>
                      <input
                        ref={purchaseSearchRef}
                        type="text"
                        value={purchaseForm.articleName && !purchaseSearch ? purchaseForm.articleName : purchaseSearch}
                        onChange={(e) => {
                          setPurchaseSearch(e.target.value);
                          setPurchaseSearchIdx(0);
                          if (purchaseForm.articleName && e.target.value !== purchaseForm.articleName) setPurchaseForm((prev) => ({ ...prev, articleName: '', articleId: '' }));
                        }}
                        onKeyDown={purchaseArtKeyDown}
                        className="w-full bg-white border border-sky-400 rounded px-2 py-1 text-xs outline-none text-slate-800"
                        placeholder="🔍 Recherche article catalogue..."
                      />
                      {purchaseSearch.length >= 1 && purchaseFiltered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                          {purchaseFiltered.map((a, idx) => (
                            <div key={a.id} onClick={() => purchaseSelectArticle(a.id)} className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b ${idx === purchaseSearchIdx ? 'bg-sky-600 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}>
                              <span>[{familyLabel(a.family, familles)}] {a.name}</span>
                              <span className="font-mono text-[11px]">Stock: {a.stockCentral}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-24"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Famille</label><input readOnly value={familyLabel(purchaseForm.family as any, familles) || ''} className="w-full bg-slate-200 border border-slate-300 rounded px-2 py-1 text-xs text-slate-600 truncate" /></div>
                    <div className="w-20"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quantité</label><input id="purchase-qty-input" type="number" min={1} value={purchaseForm.quantity} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); purchaseSaveLine(); } }} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-right font-mono" /></div>
                    <div className="w-24"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">P. Achat Unitaire</label><input type="number" min={0} value={purchaseForm.purchasePrice} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, purchasePrice: parseInt(e.target.value) || 0 }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); purchaseSaveLine(); } }} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-right font-mono" /></div>
                    <div className="w-28"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Date Péremption</label><input type="date" value={purchaseForm.expiryDate} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, expiryDate: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); purchaseSaveLine(); } }} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono" /></div>
                    <div className="w-28"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Total Ligne</label><input readOnly value={formatAr(purchaseForm.quantity * purchaseForm.purchasePrice)} className="w-full bg-slate-200 border border-slate-300 rounded px-2 py-1 text-xs text-right font-mono font-bold" /></div>
                  </div>
                  <div className="flex justify-end gap-1.5 mt-2">
                    <button onClick={purchaseNew} className="px-2.5 py-1 bg-white border rounded text-xs font-semibold cursor-pointer">Effacer</button>
                    <button onClick={purchaseSaveLine} disabled={!purchaseForm.articleName} className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-bold cursor-pointer disabled:opacity-40">
                      Ajouter au bon
                    </button>
                  </div>
                </div>

                {/* Lines Table */}
                <div className="bg-white border rounded overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 border-b">
                      <tr>
                        <th className="p-1.5">Famille</th>
                        <th className="p-1.5">Article</th>
                        <th className="p-1.5 text-right">Quantité</th>
                        <th className="p-1.5 text-right">P. Achat</th>
                        <th className="p-1.5 text-center">Péremption</th>
                        <th className="p-1.5 text-right">Montant Total</th>
                        <th className="p-1.5 text-center w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-mono">
                      {purchaseLines.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="p-1.5 font-sans">{familyLabel(l.family, familles)}</td>
                          <td className="p-1.5 font-sans font-medium">{l.articleName}</td>
                          <td className="p-1.5 text-right">{l.quantity}</td>
                          <td className="p-1.5 text-right">{l.purchasePrice.toLocaleString('fr-FR')} Ar</td>
                          <td className="p-1.5 text-center">{l.expiryDate ? new Date(l.expiryDate).toLocaleDateString('fr-FR') : '—'}</td>
                          <td className="p-1.5 text-right font-bold text-emerald-700">{formatAr(l.amount)}</td>
                          <td className="p-1.5 text-center"><button onClick={() => setPurchaseLines(purchaseLines.filter(x => x.id !== l.id))} className="text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></td>
                        </tr>
                      ))}
                      {purchaseLines.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-slate-400 font-sans">Aucun article dans ce bon de réception.</td></tr>}
                    </tbody>
                    {purchaseLines.length > 0 && (
                      <tfoot className="bg-emerald-50 font-bold font-sans">
                        <tr>
                          <td colSpan={5} className="p-2 text-right text-xs">TOTAL ACHAT → CENTRAL :</td>
                          <td colSpan={2} className="p-2 font-mono text-base text-emerald-800 text-right">{formatAr(purchaseLines.reduce((s, l) => s + l.amount, 0))}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={validatePurchase} disabled={purchaseLines.length === 0 || !selectedSupplierId || !invoiceRef.trim()} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold cursor-pointer disabled:opacity-40 shadow flex items-center gap-2">
                  <Check className="w-4 h-4" /> Valider l'entrée d'achat au dépôt central
                </button>
              </div>

              {/* Historique des réceptions */}
              <div className="border-t pt-4">
                <h5 className="font-bold text-sm text-slate-800 mb-2">📜 Historique des bons de réception fournisseur</h5>
                <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="p-2">Date / Heure</th>
                        <th className="p-2">Article</th>
                        <th className="p-2 text-center">Quantité</th>
                        <th className="p-2 text-right">P. Achat</th>
                        <th className="p-2">Fournisseur</th>
                        <th className="p-2 font-mono">N° BL / Facture</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entriesFiltered.slice(-20).reverse().map((e) => (
                        <tr key={e.id} className="border-b hover:bg-slate-50">
                          <td className="p-2 text-slate-500 font-mono">{new Date(e.date).toLocaleString('fr-FR')}</td>
                          <td className="p-2 font-medium">{e.articleName}</td>
                          <td className="p-2 text-center font-mono font-bold">{e.quantity}</td>
                          <td className="p-2 text-right font-mono font-bold text-blue-600">{formatAr(e.purchasePrice)}</td>
                          <td className="p-2">{e.supplier}</td>
                          <td className="p-2 font-mono">{e.invoiceRef}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===== DEMANDES DE STOCK ===== */}
          {tab === 'requests' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <button onClick={() => setReqFilter('all')} className={`px-2.5 py-1 rounded text-xs cursor-pointer ${reqFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>Toutes ({state.stockTransfers.filter(t => t.status === 'requested').length})</button>
                <button onClick={() => setReqFilter('pharmacy')} className={`px-2.5 py-1 rounded text-xs cursor-pointer ${reqFilter === 'pharmacy' ? 'bg-purple-700 text-white' : 'bg-purple-50 text-purple-700'}`}>💊 Pharmacie ({pharmacyPending})</button>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-medium"><PackageCheck className="w-12 h-12 mx-auto mb-2 opacity-40" />Aucune demande en attente</div>
              ) : (
                <div className="space-y-2">
                  {pendingRequests.map((tr) => {
                    const art = state.articles.find((a) => a.id === tr.articleId);
                    const requester = state.users.find((u) => u.id === tr.requestedBy);
                    const canTransfer = art && art.stockCentral >= tr.quantity;
                    return (
                      <div key={tr.id} className="border rounded-xl p-4 flex items-center justify-between gap-3 bg-white shadow-sm flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">{tr.targetServiceName || 'Pharmacie'}</span>
                            <span className="font-bold text-sm text-slate-900">{tr.articleName} × {tr.quantity}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            Demandé par <strong>{requester?.name || 'Service'}</strong> · Stock central disponible: <strong className={canTransfer ? 'text-emerald-600' : 'text-rose-600'}>{art?.stockCentral || 0}</strong>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => cancelRequest(tr.id)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"><X className="w-4 h-4" /></button>
                          <button onClick={() => fulfillRequest(tr.id)} disabled={!canTransfer} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shadow">
                            <Truck className="w-4 h-4" /> Transférer
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===== INVENTAIRE ===== */}
          {tab === 'inventory' && (
            <div className="space-y-4">
              {!activeInv ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                  <h4 className="font-bold text-amber-900 flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Démarrer un inventaire physique</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Emplacement à compter</label>
                      <select value={invLocation} onChange={(e) => setInvLocation(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white cursor-pointer">
                        {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold mb-1">Observation / Motif</label>
                      <input type="text" value={invNotes} onChange={(e) => setInvNotes(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-xs" placeholder="Inventaire mensuel..." />
                    </div>
                  </div>
                  <button onClick={startInventory} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-2 shadow">
                    <ClipboardList className="w-4 h-4" /> Lancer le comptage
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-100 border border-amber-300 rounded-xl flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <div className="font-bold text-amber-900">Comptage en cours — {activeInv.locationLabel}</div>
                      <div className="text-xs text-amber-800">Laissez vide si le stock réel est identique au théorique.</div>
                    </div>
                    <button onClick={completeInventory} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1 shadow">
                      <Check className="w-4 h-4" /> Valider & Réajuster les stocks
                    </button>
                  </div>

                  <div className="border rounded-xl overflow-hidden bg-white shadow-sm max-h-[450px] overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b sticky top-0">
                        <tr>
                          <th className="p-2.5">Article</th>
                          <th className="p-2.5 text-center">Théorique</th>
                          <th className="p-2.5 text-center">Comptage Réel</th>
                          <th className="p-2.5 text-center">Écart</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeInv.lines.map((l) => {
                          const raw = invCounts[l.articleId];
                          const counted = raw === undefined || raw === '' ? null : parseInt(raw, 10);
                          const diff = counted === null || !Number.isFinite(counted) ? 0 : counted - l.theoreticalQty;
                          return (
                            <tr key={l.articleId} className={`border-b ${diff !== 0 && counted !== null ? 'bg-amber-50' : ''}`}>
                              <td className="p-2.5 font-medium">{l.articleName}</td>
                              <td className="p-2.5 text-center font-mono">{l.theoreticalQty}</td>
                              <td className="p-2.5 text-center">
                                <input type="number" min={0} value={raw ?? ''} onChange={(e) => setInvCounts({ ...invCounts, [l.articleId]: e.target.value })} className="w-20 px-2 py-1 border rounded font-mono text-center" placeholder={String(l.theoreticalQty)} />
                              </td>
                              <td className={`p-2.5 text-center font-mono font-bold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                {counted === null ? '0' : (diff > 0 ? `+${diff}` : diff)}
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

          {/* ===== MOUVEMENTS & SORTIES ===== */}
          {tab === 'movements' && (
            <div className="space-y-4">
              <div className="flex gap-2 border-b pb-2">
                <button onClick={() => setMovSub('transfer')} className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${movSub === 'transfer' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>↔ Dispersion manuelle</button>
                <button onClick={() => setMovSub('exit')} className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${movSub === 'exit' ? 'bg-rose-600 text-white' : 'bg-slate-100'}`}>↑ Sortie de stock (perte/casse)</button>
                <button onClick={() => setMovSub('history')} className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${movSub === 'history' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>📜 Historique global</button>
              </div>

              {movSub === 'transfer' && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3 max-w-xl">
                  <h4 className="font-bold text-blue-900 text-sm">Transfert Dépôt Central → Service</h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="font-bold block mb-1">Article à transférer</label>
                      <select value={dispArticleId} onChange={(e) => setDispArticleId(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white">
                        <option value="">— Sélectionner article —</option>
                        {state.articles.map((a) => <option key={a.id} value={a.id}>{a.name} (central: {a.stockCentral})</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-bold block mb-1">Quantité</label>
                        <input type="number" min={1} value={dispQty} onChange={(e) => setDispQty(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="font-bold block mb-1">Service destinataire</label>
                        <select value={dispServiceId} onChange={(e) => setDispServiceId(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white">
                          {activeServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Motif</label>
                      <input type="text" value={dispReason} onChange={(e) => setDispReason(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Complément de dotation..." />
                    </div>
                    <button onClick={doDispersion} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer text-xs shadow">Disperser les produits</button>
                  </div>
                </div>
              )}

              {movSub === 'exit' && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3 max-w-xl">
                  <h4 className="font-bold text-rose-900 text-sm">Sortie exceptionnelle de stock</h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="font-bold block mb-1">Article concerné</label>
                      <select value={exitArticleId} onChange={(e) => setExitArticleId(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white">
                        <option value="">— Sélectionner article —</option>
                        {state.articles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-bold block mb-1">Depuis</label>
                        <select value={exitFrom} onChange={(e) => setExitFrom(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white">
                          {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="font-bold block mb-1">Quantité à déduire</label>
                        <input type="number" min={1} value={exitQty} onChange={(e) => setExitQty(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                    </div>
                    <div>
                      <label className="font-bold block mb-1">Motif obligatoire *</label>
                      <input type="text" value={exitReason} onChange={(e) => setExitReason(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Péremption lot, casse au transport, don..." />
                    </div>
                    <button onClick={doExit} className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg cursor-pointer text-xs shadow">Enregistrer la sortie</button>
                  </div>
                </div>
              )}

              {movSub === 'history' && (
                <div className="border rounded-xl overflow-hidden bg-white shadow-sm max-h-[500px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b sticky top-0">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Article</th>
                        <th className="p-2.5 text-center">Quantité</th>
                        <th className="p-2.5">Provenance</th>
                        <th className="p-2.5">Destination</th>
                        <th className="p-2.5">Motif / Réf</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movFiltered.map((m) => (
                        <tr key={m.id} className="border-b hover:bg-slate-50">
                          <td className="p-2.5 font-mono text-slate-500">{new Date(m.date).toLocaleString('fr-FR')}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.type === 'entry' ? 'bg-emerald-100 text-emerald-800'
                                : m.type === 'exit' ? 'bg-rose-100 text-rose-800'
                                : m.type === 'transfer' ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {m.type === 'entry' ? 'Entrée' : m.type === 'exit' ? 'Sortie' : m.type === 'transfer' ? 'Transfert' : 'Inventaire'}
                            </span>
                          </td>
                          <td className="p-2.5 font-medium">{m.articleName}</td>
                          <td className="p-2.5 text-center font-mono font-bold">{m.quantity}</td>
                          <td className="p-2.5">{m.fromLocation === 'external' ? 'Fournisseur' : locationLabel(m.fromLocation, services)}</td>
                          <td className="p-2.5">{m.toLocation === 'external' ? '—' : locationLabel(m.toLocation, services)}</td>
                          <td className="p-2.5 text-slate-600">{m.reason || m.ref || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ===== SERVICES DESTINATAIRES ===== */}
          {tab === 'services' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Settings2 className="w-4 h-4" /> Ajouter un service destinataire</h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Code *</label>
                    <input type="text" value={newSvc.code} onChange={(e) => setNewSvc({ ...newSvc, code: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-xs uppercase" placeholder="MAT" maxLength={8} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold mb-1">Nom du service *</label>
                    <input type="text" value={newSvc.name} onChange={(e) => setNewSvc({ ...newSvc, name: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-xs" placeholder="Maternité" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Couleur</label>
                    <select value={newSvc.color} onChange={(e) => setNewSvc({ ...newSvc, color: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white cursor-pointer">
                      {SERVICE_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={addService} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Enregistrer le service
                </button>
              </div>

              <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-3">Code</th>
                      <th className="p-3">Nom du service</th>
                      <th className="p-3 text-center">Type</th>
                      <th className="p-3 text-center">Statut</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id} className="border-b">
                        <td className="p-3 font-mono font-bold">{s.code}</td>
                        <td className="p-3 font-medium">{s.name}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.kind === 'pharmacie' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                            {s.kind === 'pharmacie' ? 'Pharmacie' : 'Service'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {s.active ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">Actif</span> : <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full font-bold">Inactif</span>}
                        </td>
                        <td className="p-3 text-right">
                          {s.kind !== 'pharmacie' && (
                            <button onClick={() => toggleService(s.id)} className="px-2 py-1 border rounded text-xs cursor-pointer hover:bg-slate-50">
                              {s.active ? 'Désactiver' : 'Activer'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WarehouseIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><path d="M6 10h12"/></svg>
  );
}
