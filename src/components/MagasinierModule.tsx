import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { StockEntry, StockMovement, WarehouseService, InventorySession, InventoryLine, StockLocation } from '../types';
import type { AppState } from '../store';
import {
  addAuditLog, addNotification, formatAr, ARTICLE_FAMILIES, familyLabel,
  transferCategoryLabel, transferCategoryColor, TRANSFER_CATEGORIES,
  applyStockDelta, getArticleStock, locationLabel,
} from '../store';
import {
  Package, PackageCheck, PackagePlus, Search, Truck, Plus, Trash2, Save, Check,
  Filter, X, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, ClipboardList,
  Building2, Settings2, Layers,
} from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }
type Tab = 'stock' | 'appro' | 'requests' | 'inventory' | 'movements' | 'services';

const SERVICE_COLORS = ['purple', 'blue', 'rose', 'emerald', 'amber', 'sky', 'indigo', 'teal'];

export default function MagasinierModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('stock');
  const [searchStock, setSearchStock] = useState('');
  const [entryCatFilter, setEntryCatFilter] = useState<string>('all');
  const [reqFilter, setReqFilter] = useState<'all' | 'pharmacy' | 'other'>('all');
  const [movFilter, setMovFilter] = useState<'all' | StockMovement['type']>('all');

  // === ACHATS → toujours dépôt central ===
  const [supplier, setSupplier] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [purchaseLines, setPurchaseLines] = useState<{ id: string; articleId: string; articleName: string; family: any; quantity: number; purchasePrice: number; expiryDate: string; amount: number; }[]>([]);
  const [purchaseSelLineId, setPurchaseSelLineId] = useState<string | null>(null);
  const [purchaseIsNew, setPurchaseIsNew] = useState(true);
  const [purchaseForm, setPurchaseForm] = useState({ id: '', articleId: '', articleName: '', family: 'MEDIC', quantity: 1, purchasePrice: 0, expiryDate: '' });
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseSearchIdx, setPurchaseSearchIdx] = useState(0);
  const purchaseSearchRef = useRef<HTMLInputElement>(null);

  // === Dispersion / sortie manuelle ===
  const [dispArticleId, setDispArticleId] = useState('');
  const [dispQty, setDispQty] = useState(1);
  const [dispServiceId, setDispServiceId] = useState('svc-pharmacie');
  const [dispReason, setDispReason] = useState('');
  const [exitArticleId, setExitArticleId] = useState('');
  const [exitQty, setExitQty] = useState(1);
  const [exitReason, setExitReason] = useState('');
  const [exitFrom, setExitFrom] = useState<StockLocation>('central');
  const [movSub, setMovSub] = useState<'entry' | 'exit' | 'transfer' | 'history'>('transfer');

  // === Inventaire ===
  const [invLocation, setInvLocation] = useState<StockLocation>('central');
  const [activeInvId, setActiveInvId] = useState<string | null>(null);
  const [invCounts, setInvCounts] = useState<Record<string, string>>({});
  const [invNotes, setInvNotes] = useState('');

  // === Services ===
  const [newSvc, setNewSvc] = useState({ code: '', name: '', color: 'sky' });

  const services = state.warehouseServices || [];
  const activeServices = services.filter((s) => s.active);
  const movements = state.stockMovements || [];
  const inventories = state.inventorySessions || [];

  const cancelRequest = (transferId: string) => {
    if (!confirm('Annuler cette demande ?')) return;
    setState((prev) => ({
      ...prev,
      stockTransfers: prev.stockTransfers.map((t) => (t.id === transferId ? { ...t, status: 'cancelled' as const } : t)),
    }));
  };

  const filteredArticles = state.articles.filter((a) => {
    const q = searchStock.toLowerCase();
    return a.name.toLowerCase().includes(q) || familyLabel(a.family).toLowerCase().includes(q);
  });

  const pendingRequests = state.stockTransfers.filter((t) => {
    if (t.status !== 'requested') return false;
    if (reqFilter === 'pharmacy') return t.requestSource === 'pharmacy' || t.targetServiceId === 'svc-pharmacie' || t.category === 'approvisionnement';
    if (reqFilter === 'other') return t.requestSource !== 'pharmacy' && t.category !== 'approvisionnement';
    return true;
  });

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

  /** Tous les achats entrent dans le DÉPÔT CENTRAL uniquement */
  const validatePurchase = () => {
    if (purchaseLines.length === 0) return;
    if (!supplier.trim()) { alert('Fournisseur requis'); return; }
    if (!invoiceRef.trim()) { alert('N° BL / Facture requis'); return; }

    setState((prev) => {
      let nextArticles = [...prev.articles];
      const newEntries: StockEntry[] = [];
      const newMovs: StockMovement[] = [];

      purchaseLines.forEach((line) => {
        nextArticles = nextArticles.map((a) => {
          if (a.id !== line.articleId) return a;
          return {
            ...a,
            stockCentral: a.stockCentral + line.quantity,
            purchasePrice: line.purchasePrice,
            expiryDate: line.expiryDate || a.expiryDate,
            supplier: supplier.trim(),
          };
        });

        newEntries.push({
          id: uuidv4(),
          articleId: line.articleId,
          articleName: line.articleName,
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
          supplier: supplier.trim(),
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
          reason: `Achat fournisseur ${supplier.trim()}`,
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
      };
      addAuditLog(next, 'ACHAT_DEPOT_CENTRAL', `Achat ${purchaseLines.length} article(s) → Dépôt central chez ${supplier.trim()} (BL: ${invoiceRef.trim()})`);
      return next;
    });

    setPurchaseLines([]);
    setSupplier('');
    setInvoiceRef('');
    purchaseNew();
    alert('Achat validé — stock entré au Dépôt central. Dispersion vers les services via l\'onglet Demandes ou Entrées/Sorties.');
  };

  /** Traite une demande service : transfert dépôt central → service destinataire */
  const fulfillRequest = (transferId: string) => {
    const tr = state.stockTransfers.find((t) => t.id === transferId);
    if (!tr) return;
    const art = state.articles.find((a) => a.id === tr.articleId);
    if (!art) return;

    if (art.stockCentral < tr.quantity) {
      alert(`Stock dépôt central insuffisant (${art.stockCentral}). Effectuez d'abord un achat d'approvisionnement.`);
      return;
    }

    // Déterminer destination
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
        reason: tr.notes || `Demande appro ${serviceName}`,
        ref: tr.id.slice(0, 8),
        date: new Date().toISOString(),
        userId: prev.currentUser?.id || 'MAGASINIER',
        userName: prev.currentUser?.name,
        serviceId: typeof toLoc === 'string' && toLoc !== 'pharmacie' && toLoc !== 'central' ? toLoc : undefined,
        serviceName,
      };

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
      addAuditLog(next, 'DISPERSION_SERVICE', `${tr.articleName} ×${tr.quantity} : Dépôt central → ${serviceName}`);
      if (toLoc === 'pharmacie' || tr.requestSource === 'pharmacy') {
        addNotification(next, 'pharmacy', `📦 Réappro reçu: ${tr.articleName} (${tr.quantity}) depuis dépôt central`, 'info');
      }
      return next;
    });
  };

  /** Dispersion manuelle central → service */
  const doDispersion = () => {
    if (!dispArticleId || dispQty <= 0) { alert('Article et quantité requis'); return; }
    const art = state.articles.find((a) => a.id === dispArticleId);
    if (!art) return;
    if (art.stockCentral < dispQty) { alert(`Stock central insuffisant (${art.stockCentral})`); return; }
    const svc = services.find((s) => s.id === dispServiceId);
    if (!svc) { alert('Service invalide'); return; }
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
        reason: dispReason || `Dispersion vers ${svc.name}`,
        date: new Date().toISOString(),
        userId: prev.currentUser?.id || 'MAGASINIER',
        userName: prev.currentUser?.name,
        serviceId: svc.id,
        serviceName: svc.name,
      };
      const next = { ...prev, articles: updatedArticles, stockMovements: [...(prev.stockMovements || []), mov] };
      addAuditLog(next, 'DISPERSION_MANUELLE', `${art.name} ×${dispQty} → ${svc.name}`);
      if (svc.kind === 'pharmacie') addNotification(next, 'pharmacy', `📦 Dispersion: ${art.name} (${dispQty})`, 'info');
      return next;
    });
    setDispQty(1);
    setDispReason('');
    alert(`Dispersion OK : ${art.name} ×${dispQty} → ${svc.name}`);
  };

  /** Sortie de stock (casse, péremption, don…) */
  const doExit = () => {
    if (!exitArticleId || exitQty <= 0) { alert('Article et quantité requis'); return; }
    if (!exitReason.trim()) { alert('Motif de sortie requis'); return; }
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
    alert('Sortie de stock enregistrée.');
  };

  // === Inventaire ===
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
  };

  const saveInventoryCount = (articleId: string, value: string) => {
    setInvCounts((prev) => ({ ...prev, [articleId]: value }));
  };

  const completeInventory = () => {
    if (!activeInvId) return;
    const session = inventories.find((i) => i.id === activeInvId);
    if (!session) return;
    if (!confirm('Valider l\'inventaire et ajuster les stocks selon les écarts ?')) return;

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
        nextArticles = nextArticles.map((a) => {
          if (a.id !== l.articleId) return a;
          // set absolute stock via delta
          const current = getArticleStock(a, sess.location);
          return applyStockDelta(a, sess.location, l.difference);
          // (current + difference = counted)
          void current;
        });
        newMovs.push({
          id: uuidv4(),
          type: 'inventory_adjust',
          articleId: l.articleId,
          articleName: l.articleName,
          quantity: Math.abs(l.difference),
          fromLocation: l.difference < 0 ? sess.location : ('external' as any),
          toLocation: l.difference > 0 ? sess.location : ('external' as any),
          reason: `Inventaire ${sess.locationLabel}: théorique ${l.theoreticalQty} → compté ${l.countedQty} (écart ${l.difference > 0 ? '+' : ''}${l.difference})`,
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
      addAuditLog(next, 'INVENTAIRE_VALIDE', `Inventaire ${sess.locationLabel} — ${updatedLines.filter((l) => l.difference !== 0).length} écart(s)`);
      return next;
    });
    setActiveInvId(null);
    setInvCounts({});
    setInvNotes('');
    alert('Inventaire validé — stocks ajustés.');
  };

  const cancelInventory = () => {
    if (!activeInvId) return;
    if (!confirm('Annuler cet inventaire en cours ?')) return;
    setState((prev) => ({
      ...prev,
      inventorySessions: (prev.inventorySessions || []).map((i) =>
        i.id === activeInvId ? { ...i, status: 'cancelled' as const, completedAt: new Date().toISOString() } : i
      ),
    }));
    setActiveInvId(null);
    setInvCounts({});
  };

  // === Services ===
  const addService = () => {
    if (!newSvc.code.trim() || !newSvc.name.trim()) { alert('Code et nom requis'); return; }
    if (services.some((s) => s.code.toLowerCase() === newSvc.code.trim().toLowerCase())) {
      alert('Ce code service existe déjà');
      return;
    }
    const svc: WarehouseService = {
      id: `svc-${uuidv4().slice(0, 8)}`,
      code: newSvc.code.trim().toUpperCase(),
      name: newSvc.name.trim(),
      kind: 'service',
      color: newSvc.color,
      active: true,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => {
      const next = { ...prev, warehouseServices: [...(prev.warehouseServices || []), svc] };
      addAuditLog(next, 'AJOUT_SERVICE', `Service entrepôt: ${svc.name} (${svc.code})`);
      return next;
    });
    setNewSvc({ code: '', name: '', color: 'sky' });
  };

  const toggleService = (id: string) => {
    const svc = services.find((s) => s.id === id);
    if (!svc) return;
    if (svc.kind === 'pharmacie') { alert('Le service Pharmacie ne peut pas être désactivé.'); return; }
    setState((prev) => ({
      ...prev,
      warehouseServices: (prev.warehouseServices || []).map((s) => (s.id === id ? { ...s, active: !s.active } : s)),
    }));
  };

  const entriesFiltered = state.stockEntries.filter((e) => entryCatFilter === 'all' || (e.category || 'central') === entryCatFilter);
  const movFiltered = movements.filter((m) => movFilter === 'all' || m.type === movFilter).slice().reverse().slice(0, 80);
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
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {ARTICLE_FAMILIES.map((f) => {
          const arts = state.articles.filter((a) => a.family === f);
          const low = arts.filter((a) => a.stockCentral <= a.minStockCentral).length;
          return (
            <div key={f} className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${low > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                  <Package className={`w-5 h-5 ${low > 0 ? 'text-red-600' : 'text-green-600'}`} />
                </div>
                <div>
                  <div className="text-xl font-bold">{arts.length} <span className="text-sm text-slate-400">({low}⚠️)</span></div>
                  <div className="text-sm text-slate-500">{familyLabel(f)}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div className="bg-gradient-to-br from-sky-50 to-blue-50 rounded-xl p-4 shadow-sm border border-sky-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-100"><Building2 className="w-5 h-5 text-sky-700" /></div>
            <div>
              <div className="text-xl font-bold text-sky-800">{activeServices.length}</div>
              <div className="text-sm text-sky-600">Services actifs</div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-800 flex items-start gap-2">
        <Layers className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong>Architecture dépôt :</strong> tous les achats entrent au <strong>Dépôt central</strong>, puis dispersion vers les services
          (Pharmacie, Bloc, Soins…). Les demandes pharmacie créent une demande d'approvisionnement traitée ici.
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto">
          {[
            { key: 'stock' as Tab, l: '📦 Stock central' },
            { key: 'appro' as Tab, l: `📥 Approvisionnement (${state.stockEntries.length})` },
            { key: 'requests' as Tab, l: `📩 Demandes (${state.stockTransfers.filter((t) => t.status === 'requested').length}${pharmacyPending ? ` · ${pharmacyPending} pharma` : ''})` },
            { key: 'inventory' as Tab, l: '📋 Inventaires' },
            { key: 'movements' as Tab, l: `🔄 Entrées / Sorties (${movements.length})` },
            { key: 'services' as Tab, l: `🏥 Services (${activeServices.length})` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 cursor-pointer whitespace-nowrap ${
                tab === t.key ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500'
              }`}
            >
              {t.l}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ===== STOCK CENTRAL ===== */}
          {tab === 'stock' && (
            <div>
              <div className="mb-3">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                  <input type="text" value={searchStock} onChange={(e) => setSearchStock(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none" placeholder="Rechercher..." />
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-2 text-left">Famille</th>
                      <th className="p-2 text-left">Article</th>
                      <th className="p-2 text-center bg-sky-50">Dépôt central</th>
                      <th className="p-2 text-center">Pharmacie</th>
                      {activeServices.filter((s) => s.kind === 'service').map((s) => (
                        <th key={s.id} className="p-2 text-center text-xs">{s.name}</th>
                      ))}
                      <th className="p-2 text-right">P. Achat</th>
                      <th className="p-2 text-center">État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArticles.map((a) => {
                      const out = a.stockCentral <= 0;
                      const low = a.stockCentral <= a.minStockCentral && !out;
                      return (
                        <tr key={a.id} className={`border-b ${out ? 'bg-red-50' : low ? 'bg-amber-50' : ''}`}>
                          <td className="p-2"><span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{familyLabel(a.family)}</span></td>
                          <td className="p-2 font-medium">{a.name}</td>
                          <td className="p-2 text-center font-mono font-bold bg-sky-50/50">{a.stockCentral}</td>
                          <td className="p-2 text-center font-mono">{a.stockPharmacie}</td>
                          {activeServices.filter((s) => s.kind === 'service').map((s) => (
                            <td key={s.id} className="p-2 text-center font-mono text-slate-600">{a.serviceStocks?.[s.id] ?? 0}</td>
                          ))}
                          <td className="p-2 text-right font-mono">{formatAr(a.purchasePrice)}</td>
                          <td className="p-2 text-center">
                            {out ? <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">RUPTURE</span>
                              : low ? <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">BAS</span>
                              : <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">OK</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== APPROVISIONNEMENT (achats → central) ===== */}
          {tab === 'appro' && (
            <div className="space-y-4">
              <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl">
                <h4 className="font-bold flex items-center gap-2 mb-1 text-sky-800">
                  <PackagePlus className="w-5 h-5" /> Approvisionnement — Entrée au Dépôt central
                </h4>
                <p className="text-xs text-sky-700 mb-3">Tous les achats sont centralisés ici. La dispersion vers pharmacie / bloc / soins se fait ensuite via Demandes ou Entrées-Sorties.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">👤 Fournisseur *</label>
                    <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500 bg-white text-sm" placeholder="Nom du fournisseur..." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">📄 N° BL / Facture *</label>
                    <input type="text" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500 bg-white text-sm" placeholder="Ex: BL-2026-004..." />
                  </div>
                </div>
              </div>

              <div className="bg-[#f4f4f4] border border-slate-300 rounded text-xs select-none p-1">
                <div className="bg-slate-100 border-b border-slate-300 p-2 m-1.5 mb-0 rounded shadow-inner">
                  <div className="flex flex-wrap items-end gap-1.5 font-sans">
                    <div className="flex-1 min-w-[150px] relative">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Article (↑↓ Entrée)</label>
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
                        className="w-full bg-white border border-sky-400 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:ring-1 text-slate-800"
                        placeholder="🔍 Saisir article à acheter..."
                      />
                      {purchaseSearch.length >= 1 && purchaseFiltered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-slate-300 rounded-b shadow-2xl z-40 max-h-40 overflow-y-auto">
                          {purchaseFiltered.map((a, idx) => (
                            <div key={a.id} onClick={() => purchaseSelectArticle(a.id)} className={`px-3 py-1.5 cursor-pointer text-xs flex justify-between border-b border-slate-100 ${idx === purchaseSearchIdx ? 'bg-sky-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}>
                              <span>[{familyLabel(a.family)}] {a.name}</span>
                              <span className={`font-mono ${idx === purchaseSearchIdx ? 'text-white' : 'text-slate-500'}`}>Central: {a.stockCentral}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-24"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Famille</label><input readOnly value={familyLabel(purchaseForm.family as any) || ''} className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-600 truncate font-sans" /></div>
                    <div className="w-20"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quantité</label><input id="purchase-qty-input" type="number" min={1} value={purchaseForm.quantity} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); purchaseSaveLine(); } }} className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800" /></div>
                    <div className="w-24"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">P. Achat Unitaire</label><input type="number" min={0} value={purchaseForm.purchasePrice} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, purchasePrice: parseInt(e.target.value) || 0 }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); purchaseSaveLine(); } }} className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono outline-none focus:border-blue-500 text-slate-800" /></div>
                    <div className="w-28"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Date Péremption</label><input type="date" value={purchaseForm.expiryDate} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, expiryDate: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); purchaseSaveLine(); } }} className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:border-blue-500 text-slate-800" /></div>
                    <div className="w-28"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Montant Total</label><input readOnly value={formatAr(purchaseForm.quantity * purchaseForm.purchasePrice)} className="w-full bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-xs text-right font-mono font-bold text-slate-700" /></div>
                  </div>
                  <div className="flex justify-end gap-1.5 mt-2">
                    <button onClick={purchaseNew} className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 transition cursor-pointer text-xs font-medium"><Plus className="h-3.5 w-3.5 text-slate-500" /> Nouveau</button>
                    <button onClick={purchaseDeleteLine} disabled={!purchaseSelLineId} className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-sm text-slate-700 disabled:opacity-40 transition cursor-pointer text-xs font-medium"><Trash2 className="h-3.5 w-3.5 text-rose-600" /> Supprimer</button>
                    <button onClick={purchaseSaveLine} disabled={!purchaseForm.articleName} className="flex items-center gap-1 px-2.5 py-1 text-white border rounded shadow-sm font-semibold disabled:opacity-40 transition cursor-pointer text-xs bg-sky-500 hover:bg-sky-600 border-sky-600"><Save className="h-3.5 w-3.5" /> Enregistrer</button>
                  </div>
                </div>

                <div className="bg-white mx-1.5 mb-1.5 border-t border-slate-300 overflow-x-auto rounded-b max-h-[220px] overflow-y-auto">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-300 text-slate-600">
                      <tr className="divide-x divide-slate-200">
                        <th className="p-1 font-normal w-24">Famille</th>
                        <th className="p-1 font-normal min-w-[150px]">Article</th>
                        <th className="p-1 font-normal text-right w-16">Qté</th>
                        <th className="p-1 font-normal text-right w-24">P. Achat</th>
                        <th className="p-1 font-normal text-center w-24">Péremption</th>
                        <th className="p-1 font-normal text-right w-28">Montant</th>
                        <th className="p-1 font-normal w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-mono">
                      {purchaseLines.map((l) => {
                        const isSel = l.id === purchaseSelLineId;
                        return (
                          <tr key={l.id} onClick={() => { setPurchaseSelLineId(l.id); setPurchaseForm({ ...l }); setPurchaseIsNew(false); }} className={`cursor-pointer divide-x divide-slate-200 transition-colors ${isSel ? 'bg-sky-500 text-white font-medium' : 'hover:bg-slate-50 text-slate-800'}`}>
                            <td className="p-1 font-sans"><span className={`px-1 rounded text-[10px] ${isSel ? 'bg-white/20 text-white font-medium' : 'bg-slate-200 text-slate-700'}`}>{familyLabel(l.family)}</span></td>
                            <td className="p-1 font-sans">{l.articleName}</td>
                            <td className="p-1 text-right">{l.quantity}</td>
                            <td className="p-1 text-right">{l.purchasePrice.toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-center">{l.expiryDate ? new Date(l.expiryDate).toLocaleDateString('fr-FR') : '—'}</td>
                            <td className="p-1 text-right font-bold">{l.amount.toLocaleString('fr-FR')}</td>
                            <td className="p-1 text-center">
                              <button onClick={(e) => { e.stopPropagation(); setPurchaseLines(purchaseLines.filter((x) => x.id !== l.id)); if (purchaseSelLineId === l.id) purchaseNew(); }} className={`cursor-pointer ${isSel ? 'text-white hover:text-red-200' : 'text-rose-600 hover:text-rose-800'}`}><Trash2 className="w-3.5 h-3.5" /></button>
                            </td>
                          </tr>
                        );
                      })}
                      {purchaseLines.length === 0 && (<tr><td colSpan={7} className="p-4 text-center text-slate-400 font-sans">Aucun article. Saisissez un article ci-dessus.</td></tr>)}
                    </tbody>
                    {purchaseLines.length > 0 && (
                      <tfoot className="bg-emerald-50 border-t-2 border-emerald-300 text-slate-800 font-sans font-bold">
                        <tr><td colSpan={5} className="p-1.5 text-right text-xs">TOTAL → Dépôt central :</td><td colSpan={2} className="p-1.5 text-right font-mono text-lg text-emerald-700">{formatAr(purchaseLines.reduce((s, l) => s + l.amount, 0))}</td></tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                {purchaseLines.length > 0 && (
                  <button onClick={() => { if (confirm('Vider tout le bon ?')) { setPurchaseLines([]); purchaseNew(); } }} className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-sm font-medium cursor-pointer transition">Vider</button>
                )}
                <button onClick={validatePurchase} disabled={purchaseLines.length === 0 || !supplier.trim() || !invoiceRef.trim()} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-40 cursor-pointer flex items-center gap-2 shadow transition"><Check className="w-4 h-4" /> Valider entrée dépôt central</button>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <h5 className="font-bold text-sm text-slate-700">📜 Historique des entrées d'achats (dépôt central)</h5>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <button onClick={() => setEntryCatFilter('all')} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${entryCatFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Tous ({state.stockEntries.length})</button>
                    {TRANSFER_CATEGORIES.map((c) => (
                      <button key={c} onClick={() => setEntryCatFilter(c)} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${entryCatFilter === c ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{transferCategoryLabel(c)}</button>
                    ))}
                  </div>
                </div>
                {entriesFiltered.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b"><tr><th className="p-2">Date</th><th className="p-2">Destination</th><th className="p-2">Article</th><th className="p-2 text-center">Qté</th><th className="p-2 text-right">P. Achat</th><th className="p-2">Fournisseur</th><th className="p-2">Réf BL</th></tr></thead>
                      <tbody>
                        {entriesFiltered.slice(-30).reverse().map((e) => (
                          <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-2 text-slate-500">{new Date(e.date).toLocaleDateString('fr-FR')} {new Date(e.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="p-2"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">Dépôt central</span></td>
                            <td className="p-2 font-medium">{e.articleName}</td>
                            <td className="p-2 text-center font-mono font-bold">{e.quantity}</td>
                            <td className="p-2 text-right font-mono font-bold text-blue-600">{formatAr(e.purchasePrice)}</td>
                            <td className="p-2">{e.supplier}</td>
                            <td className="p-2 font-mono text-xs">{e.invoiceRef}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 border border-dashed rounded-lg">Aucun achat pour ce filtre.</div>
                )}
              </div>
            </div>
          )}

          {/* ===== DEMANDES (pharmacie + autres) ===== */}
          {tab === 'requests' && (
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <Filter className="w-4 h-4 text-slate-400" />
                <button onClick={() => setReqFilter('all')} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${reqFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Toutes ({state.stockTransfers.filter((t) => t.status === 'requested').length})</button>
                <button onClick={() => setReqFilter('pharmacy')} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${reqFilter === 'pharmacy' ? 'bg-purple-700 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>💊 Pharmacie ({pharmacyPending})</button>
                <button onClick={() => setReqFilter('other')} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${reqFilter === 'other' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Autres</button>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="text-center py-12 text-slate-400"><PackageCheck className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Aucune demande en attente</p></div>
              ) : (
                <div className="space-y-2">
                  {pendingRequests.map((tr) => {
                    const art = state.articles.find((a) => a.id === tr.articleId);
                    const requester = state.users.find((u) => u.id === tr.requestedBy);
                    const canTransfer = art && art.stockCentral >= tr.quantity;
                    const isPharma = tr.requestSource === 'pharmacy' || tr.targetServiceId === 'svc-pharmacie' || tr.category === 'approvisionnement';
                    return (
                      <div key={tr.id} className={`border rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap ${isPharma ? 'border-purple-200 bg-purple-50/30' : ''}`}>
                        <div className="flex-1 min-w-[220px]">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isPharma ? 'bg-purple-100 text-purple-700' : transferCategoryColor(tr.category)}`}>
                              {tr.targetServiceName || (isPharma ? 'Pharmacie' : transferCategoryLabel(tr.category))}
                            </span>
                            {isPharma && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Demande d'appro</span>}
                            <span className="font-semibold">{tr.articleName} × {tr.quantity}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            Demandeur: <strong>{requester?.name || '—'}</strong> — {tr.requestedAt ? new Date(tr.requestedAt).toLocaleDateString('fr-FR') : ''}
                            {tr.requestSource === 'pharmacy' && ' · depuis Pharmacie'}
                          </div>
                          {tr.notes && <div className="text-xs text-slate-500 italic">📝 {tr.notes}</div>}
                          <div className="text-xs mt-1">
                            Stock dépôt central: <strong className={canTransfer ? 'text-green-600' : 'text-red-600'}>{art?.stockCentral || 0}</strong>
                            {!canTransfer && <span className="text-red-600 ml-1">— insuffisant, achetez d'abord</span>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => cancelRequest(tr.id)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer text-sm flex items-center gap-1" title="Annuler"><X className="w-4 h-4" /></button>
                          <button
                            onClick={() => fulfillRequest(tr.id)}
                            disabled={!canTransfer}
                            className={`px-4 py-2 text-white rounded-lg hover:opacity-90 cursor-pointer flex items-center gap-2 text-sm disabled:opacity-40 ${isPharma ? 'bg-purple-600' : 'bg-emerald-600'}`}
                          >
                            <Truck className="w-4 h-4" /> Transférer depuis central
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===== INVENTAIRES ===== */}
          {tab === 'inventory' && (
            <div className="space-y-4">
              {!activeInv ? (
                <>
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <h4 className="font-bold text-amber-900 flex items-center gap-2 mb-2"><ClipboardList className="w-5 h-5" /> Nouvel inventaire</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Emplacement</label>
                        <select value={invLocation} onChange={(e) => setInvLocation(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm outline-none cursor-pointer bg-white">
                          {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Notes</label>
                        <input type="text" value={invNotes} onChange={(e) => setInvNotes(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm outline-none" placeholder="Ex: Inventaire mensuel juillet..." />
                      </div>
                    </div>
                    <button onClick={startInventory} className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold cursor-pointer flex items-center gap-2">
                      <ClipboardList className="w-4 h-4" /> Démarrer l'inventaire
                    </button>
                  </div>

                  <div>
                    <h5 className="font-bold text-sm text-slate-700 mb-2">Historique inventaires</h5>
                    {inventories.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm border border-dashed rounded-lg">Aucun inventaire enregistré.</div>
                    ) : (
                      <div className="space-y-2">
                        {[...inventories].reverse().map((inv) => (
                          <div key={inv.id} className="border rounded-lg p-3 flex justify-between items-center flex-wrap gap-2">
                            <div>
                              <div className="font-medium text-sm">{inv.locationLabel} — {new Date(inv.startedAt).toLocaleString('fr-FR')}</div>
                              <div className="text-xs text-slate-500">{inv.startedByName || inv.startedBy} · {inv.lines.length} articles · {inv.lines.filter((l) => l.difference !== 0).length} écart(s){inv.notes ? ` · ${inv.notes}` : ''}</div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              inv.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                                : inv.status === 'in_progress' ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-200 text-slate-600'
                            }`}>
                              {inv.status === 'completed' ? 'Validé' : inv.status === 'in_progress' ? 'En cours' : 'Annulé'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <h4 className="font-bold text-amber-900">Inventaire en cours — {activeInv.locationLabel}</h4>
                      <p className="text-xs text-amber-700">Saisissez les quantités comptées. Laissez vide pour conserver le théorique.</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={cancelInventory} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm cursor-pointer hover:bg-white">Annuler</button>
                      <button onClick={completeInventory} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold cursor-pointer flex items-center gap-1"><Check className="w-4 h-4" /> Valider & ajuster</button>
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-[480px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Article</th>
                          <th className="p-2 text-center">Théorique</th>
                          <th className="p-2 text-center">Compté</th>
                          <th className="p-2 text-center">Écart</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeInv.lines.map((l) => {
                          const raw = invCounts[l.articleId];
                          const counted = raw === undefined || raw === '' ? null : parseInt(raw, 10);
                          const diff = counted === null || !Number.isFinite(counted) ? 0 : counted - l.theoreticalQty;
                          return (
                            <tr key={l.articleId} className={`border-b ${diff !== 0 && counted !== null ? (diff < 0 ? 'bg-red-50' : 'bg-emerald-50') : ''}`}>
                              <td className="p-2 font-medium">{l.articleName}</td>
                              <td className="p-2 text-center font-mono">{l.theoreticalQty}</td>
                              <td className="p-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  value={raw ?? ''}
                                  onChange={(e) => saveInventoryCount(l.articleId, e.target.value)}
                                  className="w-20 px-2 py-1 border rounded text-center font-mono text-sm outline-none focus:ring-2 focus:ring-amber-400"
                                  placeholder={String(l.theoreticalQty)}
                                />
                              </td>
                              <td className={`p-2 text-center font-mono font-bold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                {counted === null ? '—' : (diff > 0 ? `+${diff}` : diff)}
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

          {/* ===== ENTRÉES / SORTIES ===== */}
          {tab === 'movements' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 border-b pb-3">
                {[
                  { k: 'transfer' as const, l: '↔ Dispersion central → service', icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
                  { k: 'exit' as const, l: '↑ Sortie de stock', icon: <ArrowUpFromLine className="w-3.5 h-3.5" /> },
                  { k: 'history' as const, l: '📜 Historique mouvements', icon: <ArrowDownToLine className="w-3.5 h-3.5" /> },
                ].map((s) => (
                  <button key={s.k} onClick={() => setMovSub(s.k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 ${movSub === s.k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {s.icon}{s.l}
                  </button>
                ))}
              </div>

              {movSub === 'transfer' && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3 max-w-2xl">
                  <h4 className="font-bold text-blue-900 flex items-center gap-2"><ArrowLeftRight className="w-5 h-5" /> Dispersion manuelle — Dépôt central → Service</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold mb-1">Article</label>
                      <select value={dispArticleId} onChange={(e) => setDispArticleId(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white cursor-pointer">
                        <option value="">— Choisir —</option>
                        {state.articles.map((a) => <option key={a.id} value={a.id}>{a.name} (central: {a.stockCentral})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Quantité</label>
                      <input type="number" min={1} value={dispQty} onChange={(e) => setDispQty(parseInt(e.target.value) || 1)} className="w-full px-3 py-1.5 border rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Service destinataire</label>
                      <select value={dispServiceId} onChange={(e) => setDispServiceId(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white cursor-pointer">
                        {activeServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold mb-1">Motif</label>
                      <input type="text" value={dispReason} onChange={(e) => setDispReason(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="Optionnel..." />
                    </div>
                  </div>
                  <button onClick={doDispersion} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold cursor-pointer flex items-center gap-2">
                    <Truck className="w-4 h-4" /> Disperser
                  </button>
                </div>
              )}

              {movSub === 'exit' && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3 max-w-2xl">
                  <h4 className="font-bold text-rose-900 flex items-center gap-2"><ArrowUpFromLine className="w-5 h-5" /> Sortie de stock (casse, péremption, don…)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold mb-1">Article</label>
                      <select value={exitArticleId} onChange={(e) => setExitArticleId(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white cursor-pointer">
                        <option value="">— Choisir —</option>
                        {state.articles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Depuis</label>
                      <select value={exitFrom} onChange={(e) => setExitFrom(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white cursor-pointer">
                        {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Quantité</label>
                      <input type="number" min={1} value={exitQty} onChange={(e) => setExitQty(parseInt(e.target.value) || 1)} className="w-full px-3 py-1.5 border rounded-lg text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold mb-1">Motif *</label>
                      <input type="text" value={exitReason} onChange={(e) => setExitReason(e.target.value)} className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="Ex: Péremption lot X, casse, don..." />
                    </div>
                  </div>
                  <button onClick={doExit} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold cursor-pointer flex items-center gap-2">
                    <ArrowUpFromLine className="w-4 h-4" /> Enregistrer sortie
                  </button>
                </div>
              )}

              {movSub === 'history' && (
                <div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Filter className="w-4 h-4 text-slate-400" />
                    {(['all', 'entry', 'exit', 'transfer', 'inventory_adjust'] as const).map((f) => (
                      <button key={f} onClick={() => setMovFilter(f)} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${movFilter === f ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {f === 'all' ? 'Tous' : f === 'entry' ? 'Entrées' : f === 'exit' ? 'Sorties' : f === 'transfer' ? 'Transferts' : 'Inventaires'}
                      </button>
                    ))}
                  </div>
                  {movFiltered.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm border border-dashed rounded-lg">Aucun mouvement.</div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="p-2 text-left">Date</th>
                            <th className="p-2 text-left">Type</th>
                            <th className="p-2 text-left">Article</th>
                            <th className="p-2 text-center">Qté</th>
                            <th className="p-2 text-left">De</th>
                            <th className="p-2 text-left">Vers</th>
                            <th className="p-2 text-left">Motif</th>
                            <th className="p-2 text-left">Par</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movFiltered.map((m) => (
                            <tr key={m.id} className="border-b hover:bg-slate-50">
                              <td className="p-2 text-slate-500">{new Date(m.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                              <td className="p-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  m.type === 'entry' ? 'bg-emerald-100 text-emerald-700'
                                    : m.type === 'exit' ? 'bg-rose-100 text-rose-700'
                                    : m.type === 'transfer' ? 'bg-blue-100 text-blue-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {m.type === 'entry' ? 'Entrée' : m.type === 'exit' ? 'Sortie' : m.type === 'transfer' ? 'Transfert' : 'Inventaire'}
                                </span>
                              </td>
                              <td className="p-2 font-medium">{m.articleName}</td>
                              <td className="p-2 text-center font-mono font-bold">{m.quantity}</td>
                              <td className="p-2">{m.fromLocation === 'external' ? 'Fournisseur' : locationLabel(m.fromLocation, services)}</td>
                              <td className="p-2">{m.toLocation === 'external' ? '—' : locationLabel(m.toLocation, services)}</td>
                              <td className="p-2 text-slate-500 truncate max-w-[160px]">{m.reason || m.ref || '—'}</td>
                              <td className="p-2">{m.userName || m.userId}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== SERVICES ===== */}
          {tab === 'services' && (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <h4 className="font-bold text-indigo-900 flex items-center gap-2 mb-2"><Settings2 className="w-5 h-5" /> Ajouter un service destinataire</h4>
                <p className="text-xs text-indigo-700 mb-3">Le dépôt central disperse vers ces services. Ajoutez-en au fur et à mesure (ex: Maternité, Dialyse…).</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Code *</label>
                    <input type="text" value={newSvc.code} onChange={(e) => setNewSvc({ ...newSvc, code: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-sm uppercase" placeholder="MAT" maxLength={8} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold mb-1">Nom du service *</label>
                    <input type="text" value={newSvc.name} onChange={(e) => setNewSvc({ ...newSvc, name: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="Maternité" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Couleur</label>
                    <select value={newSvc.color} onChange={(e) => setNewSvc({ ...newSvc, color: e.target.value })} className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white cursor-pointer">
                      {SERVICE_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={addService} className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold cursor-pointer flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Ajouter le service
                </button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-3 text-left">Code</th>
                      <th className="p-3 text-left">Nom</th>
                      <th className="p-3 text-center">Type</th>
                      <th className="p-3 text-center">Statut</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id} className={`border-b ${!s.active ? 'opacity-50' : ''}`}>
                        <td className="p-3 font-mono font-bold">{s.code}</td>
                        <td className="p-3 font-medium">{s.name}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.kind === 'pharmacie' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                            {s.kind === 'pharmacie' ? 'Pharmacie' : 'Service'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {s.active
                            ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-bold">Actif</span>
                            : <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] rounded-full font-bold">Inactif</span>}
                        </td>
                        <td className="p-3 text-right">
                          {s.kind !== 'pharmacie' && (
                            <button onClick={() => toggleService(s.id)} className="px-2 py-1 text-xs rounded border cursor-pointer hover:bg-slate-50">
                              {s.active ? 'Désactiver' : 'Réactiver'}
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
