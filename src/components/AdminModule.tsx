import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { UserRole, Article, ArticleFamily, TicketSettings } from '../types';
import type { AppState } from '../store';
import { ARTICLE_FAMILIES, familyLabel, formatAr, addAuditLog } from '../store';
import {
  DollarSign, Save, Trash2, Plus, X, Check, Download, Upload,
  Eye, Settings as SettingsIcon, Users, Package, Building2,
  Receipt, FileText, Shield, Database, Printer, Image as ImageIcon,
  CreditCard, AlertCircle, Search, RefreshCw, Copy, Activity
} from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }

type Tab = 'dashboard' | 'users' | 'articles' | 'prices' | 'companies' | 'tickets' | 'audit' | 'backup' | 'prompts' | 'system';
import { WINDEV_PROMPT, WEB_PROMPT } from '../data/promptsData';

const roleLabels: Record<string, string> = { doctor:'Médecin', cashier:'Caisse', pharmacy:'Pharmacie', magasinier:'Magasinier', laboratory:'Laboratoire', hospitalization:'Hospitalisation', admin:'Admin' };
const ALL_ROLES: UserRole[] = ['doctor','cashier','pharmacy','magasinier','laboratory','hospitalization','admin'];

const TABS: { key: Tab; label: string; icon: any; desc: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: Activity, desc: 'Vue d\'ensemble du système' },
  { key: 'tickets', label: 'Tickets & impression', icon: Printer, desc: 'Format 58/80mm, logo, texte' },
  { key: 'users', label: 'Utilisateurs', icon: Users, desc: 'Comptes et accès' },
  { key: 'articles', label: 'Articles', icon: Package, desc: 'Catalogue & stock' },
  { key: 'prices', label: 'Tarifs', icon: DollarSign, desc: '3 grilles tarifaires' },
  { key: 'companies', label: 'Sociétés / Clients', icon: Building2, desc: 'Partenaires & conventions' },
  { key: 'audit', label: 'Journal d\'audit', icon: Shield, desc: 'Historique des actions' },
  { key: 'backup', label: 'Sauvegarde', icon: Database, desc: 'Exporter / importer' },
  { key: 'system', label: 'Système', icon: SettingsIcon, desc: 'Paramètres généraux' },
  { key: 'prompts', label: 'Prompts', icon: FileText, desc: 'Spécifications techniques' },
];

export default function AdminModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [addUser, setAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ id: '', name: '', role: 'doctor' as UserRole, password: '' });
  const [addArticle, setAddArticle] = useState(false);
  const [newArt, setNewArt] = useState({ name: '', family: 'MEDIC' as ArticleFamily, unit: '', priceComptoir: 0, priceSociete: 0, priceExterne: 0, purchasePrice: 0 });
  const [editingArt, setEditingArt] = useState<string | null>(null);
  const [editPrices, setEditPrices] = useState({ priceComptoir: 0, priceSociete: 0, priceExterne: 0 });
  const [addCompany, setAddCompany] = useState(false);
  const [newCompany, setNewCompany] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // ============ USERS ============
  const saveUser = () => {
    if (!newUser.id || !newUser.name) { alert('ID et nom requis'); return; }
    if (state.users.find((u) => u.id === newUser.id)) { alert('ID existe déjà'); return; }
    setState((prev) => {
      const next = { ...prev, users: [...prev.users, { ...newUser, password: newUser.password || 'pass123' }] };
      addAuditLog(next, 'AJOUT_UTILISATEUR', `${newUser.name} (${newUser.id}) — ${roleLabels[newUser.role]}`);
      return next;
    });
    setAddUser(false); setNewUser({ id: '', name: '', role: 'doctor', password: '' });
  };
  const deleteUser = (uid: string) => {
    if (uid === 'ADM001' || !confirm(`Supprimer ${uid} ?`)) return;
    setState((prev) => {
      const next = { ...prev, users: prev.users.filter((u) => u.id !== uid) };
      addAuditLog(next, 'SUPPRESSION_UTILISATEUR', uid);
      return next;
    });
  };
  const resetPassword = (uid: string) => {
    const newPwd = prompt(`Nouveau mot de passe pour ${uid} :`, 'pass123');
    if (!newPwd) return;
    setState((prev) => {
      const next = { ...prev, users: prev.users.map((u) => u.id === uid ? { ...u, password: newPwd } : u) };
      addAuditLog(next, 'RESET_PASSWORD', `${uid}`);
      return next;
    });
  };

  // ============ ARTICLES ============
  const saveArticle = () => {
    if (!newArt.name || !newArt.unit) { alert('Nom et unité requis'); return; }
    const a: Article = { id: uuidv4(), ...newArt, stockCentral: 0, stockPharmacie: 0, minStockCentral: 10, minStockPharmacie: 5 };
    setState((prev) => {
      const next = { ...prev, articles: [...prev.articles, a] };
      addAuditLog(next, 'AJOUT_ARTICLE', `${a.name}`);
      return next;
    });
    setAddArticle(false); setNewArt({ name: '', family: 'MEDIC', unit: '', priceComptoir: 0, priceSociete: 0, priceExterne: 0, purchasePrice: 0 });
  };
  const deleteArticle = (id: string) => {
    if (!confirm('Supprimer cet article ?')) return;
    setState((prev) => {
      const next = { ...prev, articles: prev.articles.filter((a) => a.id !== id) };
      addAuditLog(next, 'SUPPRESSION_ARTICLE', id);
      return next;
    });
  };
  const startEditPrices = (a: Article) => { setEditingArt(a.id); setEditPrices({ priceComptoir: a.priceComptoir, priceSociete: a.priceSociete, priceExterne: a.priceExterne }); };
  const savePrices = () => {
    if (!editingArt) return;
    setState((prev) => {
      const next = { ...prev, articles: prev.articles.map((a) => a.id === editingArt ? { ...a, ...editPrices } : a) };
      addAuditLog(next, 'MODIF_TARIFS', `Article ${editingArt}`);
      return next;
    });
    setEditingArt(null);
  };

  // ============ COMPANIES ============
  const saveCompany = () => {
    if (!newCompany) return;
    setState((prev) => {
      const next = { ...prev, companies: [...prev.companies, { id: uuidv4(), name: newCompany.toUpperCase() }] };
      addAuditLog(next, 'AJOUT_SOCIETE', newCompany.toUpperCase());
      return next;
    });
    setNewCompany(''); setAddCompany(false);
  };
  const deleteCompany = (id: string) => setState((prev) => ({ ...prev, companies: prev.companies.filter((c) => c.id !== id) }));

  // ============ TICKETS ============
  const updateTicket = (patch: Partial<TicketSettings>) => {
    setState((prev) => {
      const next = { ...prev, ticketSettings: { ...prev.ticketSettings, ...patch } };
      addAuditLog(next, 'CONFIG_TICKET', JSON.stringify(patch).slice(0, 200));
      return next;
    });
  };
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { alert('Image trop volumineuse (max 1 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      updateTicket({ logoUrl: result });
    };
    reader.readAsDataURL(file);
  };
  const clearLogo = () => updateTicket({ logoUrl: '' });

  // ============ PAYMENT METHODS ============
  const addPaymentMethod = () => {
    const m = prompt('Nouveau mode de paiement :');
    if (!m) return;
    const list = state.ticketSettings.paymentMethods;
    if (list.includes(m)) { alert('Ce mode existe déjà'); return; }
    updateTicket({ paymentMethods: [...list, m] });
  };
  const removePaymentMethod = (m: string) => {
    updateTicket({ paymentMethods: state.ticketSettings.paymentMethods.filter((x) => x !== m) });
  };

  // ============ BACKUP ============
  const exportBackup = () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: state.currentUser?.id || 'SYSTEM',
      state: { ...state, currentUser: null },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medicare-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setState((prev) => { const next = { ...prev }; addAuditLog(next, 'EXPORT_BACKUP', a.download); return next; });
  };
  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Restaurer cette sauvegarde ? Toutes les données actuelles seront remplacées.')) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.state) throw new Error('Format invalide');
        setState((prev) => {
          const next = { ...prev, ...data.state, currentUser: prev.currentUser };
          addAuditLog(next, 'IMPORT_BACKUP', `Depuis ${data.exportedAt || '?'}`);
          return next;
        });
        alert('Sauvegarde restaurée avec succès.');
      } catch (err) {
        alert('Erreur de lecture du fichier : ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ============ RESET ============
  const resetSystem = () => {
    if (!confirm('⚠️ ATTENTION : Réinitialiser TOUTES les données (patients, factures, stock...) ? Cette action est IRRÉVERSIBLE.')) return;
    if (!confirm('Confirmez-vous vraiment la réinitialisation complète ?')) return;
    setState((prev) => {
      // On garde les paramètres admin
      const fresh: AppState = {
        ...prev,
        patients: [], consultations: [], invoices: [],
        stockTransfers: [], stockEntries: [], hospitalizations: [],
        notifications: [], messages: [], auditLogs: [],
        stockMovements: [], inventorySessions: [],
        journey: [], labRequests: [],
        articles: prev.articles, // on garde le catalogue
        companies: prev.companies, // on garde les sociétés
        users: prev.users, // on garde les utilisateurs
        warehouseServices: prev.warehouseServices, // on garde les services entrepôt
      };
      addAuditLog(fresh, 'RESET_SYSTEM', 'Réinitialisation complète');
      return fresh;
    });
    alert('Système réinitialisé.');
  };

  // ============ PROMPTS ============
  const [promptView, setPromptView] = useState<'windev' | 'web'>('windev');
  const [copied, setCopied] = useState(false);
  const copyPromptText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ============ DASHBOARD STATS ============
  const todayInvoices = state.invoices.filter(i => i.status === 'paid' && new Date(i.paidAt || '').toDateString() === new Date().toDateString());
  const totalRevenue = todayInvoices.reduce((s, i) => s + i.patientCharge, 0);
  const totalArticles = state.articles.length;
  const totalUsers = state.users.length;
  const lowStock = state.articles.filter(a => a.stockCentral < a.minStockCentral || a.stockPharmacie < a.minStockPharmacie).length;

  // ============ TICKET PREVIEW ============
  const PreviewTicket = () => {
    const s = state.ticketSettings;
    const w = s.paperWidth;
    const isNarrow = w === 58;
    return (
      <div className="bg-white border-2 border-slate-300 rounded-lg p-4 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3 pb-2 border-b">
          <span className="font-bold text-sm flex items-center gap-2"><Receipt className="w-4 h-4" /> Aperçu {w}mm</span>
          <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div
          className="bg-white mx-auto font-mono text-black shadow-lg"
          style={{
            width: w === 58 ? '58mm' : '80mm',
            padding: isNarrow ? '3mm' : '4mm',
            fontSize: isNarrow ? '9.5px' : '10.5px',
          }}
        >
          {s.showLogo && s.logoUrl && <div className="text-center"><img src={s.logoUrl} className="max-h-12 mx-auto" alt="logo" /></div>}
          <div className="text-center font-bold" style={{ fontSize: isNarrow ? '11px' : '12.5px' }}>{s.facilityName}</div>
          <div className="text-center" style={{ fontSize: '8.5px' }}>{s.address}</div>
          {s.phone && <div className="text-center" style={{ fontSize: '8.5px' }}>Tél. : {s.phone}</div>}
          {s.nif && <div className="text-center" style={{ fontSize: '8.5px' }}>NIF : {s.nif}</div>}
          {s.email && <div className="text-center" style={{ fontSize: '8.5px' }}>{s.email}</div>}
          {s.ticketFooter2 && <div className="text-center italic" style={{ fontSize: '8.5px' }}>{s.ticketFooter2}</div>}
          <div className="border-t border-dashed border-black my-1.5"></div>
          <div className="text-center font-bold" style={{ fontSize: isNarrow ? '11px' : '12.5px' }}>{s.receiptTitle}</div>
          <div className="text-center" style={{ fontSize: '8.5px' }}>N° {s.invoicePrefix}-2026-0001 · {new Date().toLocaleString('fr-FR')}</div>
          <div className="border-t border-dashed border-black my-1.5"></div>
          <div className="font-bold">DUPONT Marie</div>
          <div style={{ fontSize: '8.5px' }}>Dossier : DUP102</div>
          <div style={{ fontSize: '8.5px' }}>Société : JIRAMA</div>
          <div style={{ fontSize: '8.5px' }}>Caissier : Pierre Duval</div>
          <div className="border-t border-dashed border-black my-1.5"></div>
          <div className="flex justify-between"><span>Paracétamol × 10</span><span>5 000 Ar</span></div>
          <div className="flex justify-between"><span>Consultation</span><span>10 000 Ar</span></div>
          <div className="border-t border-dashed border-black my-1.5"></div>
          <div className="flex justify-between font-bold" style={{ fontSize: isNarrow ? '11.5px' : '13px' }}><span>TOTAL PAYÉ</span><span>15 000 Ar</span></div>
          {s.showBarcode && <div className="text-center mt-1" style={{ letterSpacing: '2px', fontSize: isNarrow ? '12px' : '15px' }}>*ABC123XYZ*</div>}
          {s.showSignature && <div className="flex justify-between mt-3" style={{ fontSize: '8.5px' }}><span className="border-t border-black w-1/2 pt-0.5 text-center">Caissier</span><span className="border-t border-black w-1/2 pt-0.5 text-center">Client</span></div>}
          <div className="border-t-4 border-double border-black my-1.5"></div>
          <div className="text-center" style={{ fontSize: '8.5px' }}>{s.footerMessage}</div>
        </div>
        <div className="mt-3 text-center text-xs text-slate-500">
          Mode paiement : {s.paymentMethods.join(', ')}<br/>
          Devise : {s.currency} · Copies : {s.copies} · Auto-print : {s.autoPrint ? 'Oui' : 'Non'}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b overflow-x-auto bg-slate-50">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                title={t.desc}
                className={`px-4 py-3 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  tab === t.key
                    ? 'border-slate-800 text-slate-800 bg-white'
                    : 'border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {/* ===== DASHBOARD ===== */}
          {tab === 'dashboard' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Activity className="w-5 h-5" /> Tableau de bord administrateur</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg">
                  <div className="text-xs text-emerald-700 font-medium">Recettes du jour</div>
                  <div className="text-2xl font-bold text-emerald-800 font-mono mt-1">{formatAr(totalRevenue)}</div>
                  <div className="text-xs text-emerald-600 mt-1">{todayInvoices.length} facture(s)</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg">
                  <div className="text-xs text-blue-700 font-medium">Patients enregistrés</div>
                  <div className="text-2xl font-bold text-blue-800 font-mono mt-1">{state.patients.length}</div>
                  <div className="text-xs text-blue-600 mt-1">Total en base</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg">
                  <div className="text-xs text-purple-700 font-medium">Articles catalogue</div>
                  <div className="text-2xl font-bold text-purple-800 font-mono mt-1">{totalArticles}</div>
                  <div className="text-xs text-purple-600 mt-1">{ARTICLE_FAMILIES.length} familles</div>
                </div>
                <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg">
                  <div className="text-xs text-amber-700 font-medium">Comptes utilisateurs</div>
                  <div className="text-2xl font-bold text-amber-800 font-mono mt-1">{totalUsers}</div>
                  <div className="text-xs text-amber-600 mt-1">{ALL_ROLES.length} rôles</div>
                </div>
              </div>
              {lowStock > 0 && (
                <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-red-800">{lowStock} article(s) en stock bas</div>
                    <div className="text-sm text-red-700">Vérifiez les seuils et déclenchez un réapprovisionnement.</div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-bold mb-2 text-sm">Configuration active</h4>
                  <ul className="text-xs space-y-1 text-slate-600">
                    <li>📄 Format ticket : <strong>{state.ticketSettings.paperWidth}mm</strong></li>
                    <li>🏥 Établissement : <strong>{state.ticketSettings.facilityName}</strong></li>
                    <li>💰 Devise : <strong>{state.ticketSettings.currency}</strong></li>
                    <li>💳 Modes de paiement : <strong>{state.ticketSettings.paymentMethods.length}</strong></li>
                    <li>🖨️ Auto-print : <strong>{state.ticketSettings.autoPrint ? 'Activé' : 'Désactivé'}</strong></li>
                  </ul>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-bold mb-2 text-sm">Activité récente (5 dernières actions)</h4>
                  <ul className="text-xs space-y-1 text-slate-600">
                    {state.auditLogs.slice(0, 5).map((log) => (
                      <li key={log.id} className="truncate">
                        <span className="text-slate-400">{new Date(log.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>{' '}
                        <span className="font-mono text-blue-600">{log.action}</span> — {log.details.slice(0, 60)}
                      </li>
                    ))}
                    {state.auditLogs.length === 0 && <li className="text-slate-400 italic">Aucune action enregistrée</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ===== TICKETS ===== */}
          {tab === 'tickets' && (
            <div className="space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Printer className="w-5 h-5" /> Configuration des tickets imprimables</h3>
                  <p className="text-sm text-slate-500">Personnalisez tous les tickets (paiement, file d'attente, ordonnance, labo, pharmacie, hospit, clôture).</p>
                </div>
                <button onClick={() => setShowPreview(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer flex items-center gap-2 text-sm"><Eye className="w-4 h-4" /> Aperçu & impression test</button>
              </div>

              {showPreview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><PreviewTicket /></div>}

              {/* Format papier — section clé */}
              <div className="rounded-xl border-2 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Receipt className="w-5 h-5 text-blue-600" /> Format d'impression</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">Largeur du papier thermique</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateTicket({ paperWidth: 58 })}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                          state.ticketSettings.paperWidth === 58 ? 'border-blue-600 bg-blue-100' : 'border-slate-300 hover:border-blue-400'
                        }`}
                      >
                        <div className="text-2xl font-bold">58 mm</div>
                        <div className="text-xs text-slate-600 mt-1">Format compact</div>
                        <div className="text-[10px] text-slate-500 mt-1">Imprimantes portables</div>
                      </button>
                      <button
                        onClick={() => updateTicket({ paperWidth: 80 })}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                          state.ticketSettings.paperWidth === 80 ? 'border-blue-600 bg-blue-100' : 'border-slate-300 hover:border-blue-400'
                        }`}
                      >
                        <div className="text-2xl font-bold">80 mm</div>
                        <div className="text-xs text-slate-600 mt-1">Format standard</div>
                        <div className="text-[10px] text-slate-500 mt-1">Imprimantes POS classiques</div>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <input type="checkbox" checked={state.ticketSettings.autoPrint} onChange={e => updateTicket({ autoPrint: e.target.checked })} className="w-4 h-4" />
                      Impression directe (sans aperçu dans l'app)
                    </label>
                    <p className="text-[11px] text-slate-500 leading-snug pl-6">
                      Les tickets partent directement vers l'imprimante par défaut.
                      Pour supprimer aussi la boîte de dialogue Windows/Chrome : lancer Chrome avec
                      <code className="mx-1 px-1 bg-slate-200 rounded">--kiosk-printing</code>
                      et définir l'imprimante thermique par défaut.
                    </p>
                    <label className="text-sm font-medium flex items-center gap-2">
                      <input type="checkbox" checked={state.ticketSettings.showLogo} onChange={e => updateTicket({ showLogo: e.target.checked })} className="w-4 h-4" />
                      Afficher le logo
                    </label>
                    <label className="text-sm font-medium flex items-center gap-2">
                      <input type="checkbox" checked={state.ticketSettings.showBarcode} onChange={e => updateTicket({ showBarcode: e.target.checked })} className="w-4 h-4" />
                      Afficher le code-barres
                    </label>
                    <label className="text-sm font-medium flex items-center gap-2">
                      <input type="checkbox" checked={state.ticketSettings.showSignature} onChange={e => updateTicket({ showSignature: e.target.checked })} className="w-4 h-4" />
                      Afficher la zone signature
                    </label>
                    <div>
                      <label className="text-sm font-medium block mb-1">Nombre d'exemplaires</label>
                      <input type="number" min={1} max={5} value={state.ticketSettings.copies} onChange={e => updateTicket({ copies: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })} className="w-24 px-3 py-1.5 border rounded-lg" />
                    </div>
                  </div>
                </div>
              </div>

              {/* En-tête établissement */}
              <div className="rounded-xl border p-4 bg-white">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Building2 className="w-5 h-5 text-emerald-600" /> En-tête de l'établissement</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-sm font-medium">Nom de l'établissement *
                    <input value={state.ticketSettings.facilityName} onChange={e => updateTicket({ facilityName: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                  </label>
                  <label className="text-sm font-medium">Titre du reçu (par défaut : REÇU DE PAIEMENT)
                    <input value={state.ticketSettings.receiptTitle} onChange={e => updateTicket({ receiptTitle: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                  </label>
                  <label className="text-sm font-medium">Adresse
                    <input value={state.ticketSettings.address} onChange={e => updateTicket({ address: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                  </label>
                  <label className="text-sm font-medium">Téléphone
                    <input value={state.ticketSettings.phone} onChange={e => updateTicket({ phone: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                  </label>
                  <label className="text-sm font-medium">E-mail
                    <input type="email" value={state.ticketSettings.email || ''} onChange={e => updateTicket({ email: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                  </label>
                  <label className="text-sm font-medium">Site web
                    <input value={state.ticketSettings.website || ''} onChange={e => updateTicket({ website: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                  </label>
                  <label className="text-sm font-medium">NIF / Numéro fiscal
                    <input value={state.ticketSettings.nif} onChange={e => updateTicket({ nif: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                  </label>
                  <label className="text-sm font-medium">Préfixe facture
                    <input value={state.ticketSettings.invoicePrefix} onChange={e => updateTicket({ invoicePrefix: e.target.value.toUpperCase() })} className="mt-1 w-full px-3 py-2 border rounded-lg" placeholder="FAC" />
                  </label>
                  <label className="text-sm font-medium md:col-span-2">Sous-titre (ex: "Service des urgences")
                    <input value={state.ticketSettings.ticketFooter2 || ''} onChange={e => updateTicket({ ticketFooter2: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                  </label>
                </div>
              </div>

              {/* Logo */}
              <div className="rounded-xl border p-4 bg-white">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-purple-600" /> Logo</h4>
                <div className="flex items-start gap-4">
                  {state.ticketSettings.logoUrl ? (
                    <div className="p-3 border-2 border-slate-200 rounded-lg bg-slate-50">
                      <img src={state.ticketSettings.logoUrl} alt="logo" className="max-h-24 max-w-[200px]" />
                    </div>
                  ) : (
                    <div className="w-32 h-24 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 text-xs">Aucun logo</div>
                  )}
                  <div className="flex-1 space-y-2">
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogoUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm cursor-pointer hover:bg-purple-700"><Upload className="w-4 h-4 inline" /> Téléverser une image</button>
                    {state.ticketSettings.logoUrl && <button onClick={clearLogo} className="px-3 py-2 bg-rose-600 text-white rounded-lg text-sm cursor-pointer hover:bg-rose-700"><Trash2 className="w-4 h-4 inline" /> Supprimer</button>}
                    <p className="text-xs text-slate-500">PNG, JPG ou SVG · max 1 Mo · optimal : 200×200 px</p>
                    <label className="text-xs font-medium block">Ou URL directe :</label>
                    <input value={state.ticketSettings.logoUrl.startsWith('data:') ? '' : state.ticketSettings.logoUrl} onChange={e => updateTicket({ logoUrl: e.target.value })} placeholder="https://..." className="w-full px-2 py-1.5 border rounded text-xs" />
                  </div>
                </div>
              </div>

              {/* Devise & modes de paiement */}
              <div className="rounded-xl border p-4 bg-white">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><CreditCard className="w-5 h-5 text-amber-600" /> Devise & moyens de paiement</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-sm font-medium">Devise
                    <select value={state.ticketSettings.currency} onChange={e => updateTicket({ currency: e.target.value as any })} className="mt-1 w-full px-3 py-2 border rounded-lg cursor-pointer">
                      <option value="Ar">Ariary (Ar) — Malagasy</option>
                      <option value="€">Euro (€)</option>
                      <option value="$">Dollar ($)</option>
                      <option value="Fc">Franc Congolais (Fc)</option>
                    </select>
                  </label>
                  <div>
                    <div className="text-sm font-medium mb-1">Modes de paiement acceptés</div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {state.ticketSettings.paymentMethods.map((m) => (
                        <span key={m} className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs flex items-center gap-1">
                          {m}
                          <button onClick={() => removePaymentMethod(m)} className="hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                    <button onClick={addPaymentMethod} className="text-xs px-2 py-1 bg-amber-500 text-white rounded cursor-pointer hover:bg-amber-600"><Plus className="w-3 h-3 inline" /> Ajouter</button>
                  </div>
                </div>
              </div>

              {/* Pied de ticket */}
              <div className="rounded-xl border p-4 bg-white">
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><FileText className="w-5 h-5 text-slate-600" /> Pied de ticket</h4>
                <label className="text-sm font-medium block">Message de fin (par défaut : merci de votre confiance)
                  <input value={state.ticketSettings.footerMessage} onChange={e => updateTicket({ footerMessage: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" />
                </label>
                <p className="text-xs text-slate-500 mt-2">Ce message apparaît en bas de tous les tickets (paiement, ordonnance, labo, etc.).</p>
              </div>
            </div>
          )}

          {/* ===== USERS ===== */}
          {tab === 'users' && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Users className="w-5 h-5" /> Gestion des utilisateurs</h3>
                <button onClick={() => setAddUser(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 cursor-pointer text-sm"><Plus className="w-4 h-4" /> Nouvel utilisateur</button>
              </div>
              {addUser && (
                <div className="grid grid-cols-4 gap-2 mb-3 p-3 bg-slate-50 rounded-lg text-sm">
                  <input type="text" value={newUser.id} onChange={(e) => setNewUser({ ...newUser, id: e.target.value })} className="px-2 py-1.5 border rounded outline-none" placeholder="ID (ex: DOC004)" />
                  <input type="text" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className="px-2 py-1.5 border rounded outline-none" placeholder="Nom complet" />
                  <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })} className="px-2 py-1.5 border rounded outline-none cursor-pointer">{ALL_ROLES.map((r) => (<option key={r} value={r}>{roleLabels[r]}</option>))}</select>
                  <div className="flex gap-1">
                    <input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="flex-1 px-2 py-1.5 border rounded outline-none" placeholder="MDP" />
                    <button onClick={saveUser} className="px-2 bg-emerald-600 text-white rounded cursor-pointer"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setAddUser(false)} className="px-2 bg-slate-400 text-white rounded cursor-pointer"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-2 text-left">ID</th>
                      <th className="p-2 text-left">Nom</th>
                      <th className="p-2 text-left">Rôle</th>
                      <th className="p-2 text-left">Mot de passe</th>
                      <th className="p-2 w-32 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.users.map((u) => (
                      <tr key={u.id} className="border-b border-slate-100">
                        <td className="p-2 font-mono font-bold">{u.id}</td>
                        <td className="p-2">{u.name}</td>
                        <td className="p-2"><span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{roleLabels[u.role]}</span></td>
                        <td className="p-2 font-mono text-slate-400">••••••</td>
                        <td className="p-2 text-right">
                          <button onClick={() => resetPassword(u.id)} className="text-blue-600 hover:text-blue-800 cursor-pointer text-xs mr-2">🔑 Reset</button>
                          <button onClick={() => deleteUser(u.id)} disabled={u.id === 'ADM001'} className="text-red-500 disabled:opacity-30 cursor-pointer"><Trash2 className="w-4 h-4 inline" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== ARTICLES ===== */}
          {tab === 'articles' && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5" /> Catalogue articles</h3>
                <button onClick={() => setAddArticle(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 cursor-pointer text-sm"><Plus className="w-4 h-4" /> Nouvel article</button>
              </div>
              {addArticle && (
                <div className="p-3 bg-blue-50 rounded-lg mb-3 space-y-2 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" value={newArt.name} onChange={(e) => setNewArt({ ...newArt, name: e.target.value })} className="px-2 py-1.5 border rounded outline-none" placeholder="Nom article *" />
                    <select value={newArt.family} onChange={(e) => setNewArt({ ...newArt, family: e.target.value as ArticleFamily })} className="px-2 py-1.5 border rounded outline-none cursor-pointer">{ARTICLE_FAMILIES.map((f) => (<option key={f} value={f}>{familyLabel(f)}</option>))}</select>
                    <input type="text" value={newArt.unit} onChange={(e) => setNewArt({ ...newArt, unit: e.target.value })} className="px-2 py-1.5 border rounded outline-none" placeholder="Unité (comprimé, flacon...)" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <input type="number" value={newArt.purchasePrice || ''} onChange={(e) => setNewArt({ ...newArt, purchasePrice: parseInt(e.target.value) || 0 })} className="px-2 py-1.5 border rounded outline-none" placeholder="P. Achat (Ar)" />
                    <input type="number" value={newArt.priceComptoir || ''} onChange={(e) => setNewArt({ ...newArt, priceComptoir: parseInt(e.target.value) || 0 })} className="px-2 py-1.5 border rounded outline-none" placeholder="P. Comptoir" />
                    <input type="number" value={newArt.priceSociete || ''} onChange={(e) => setNewArt({ ...newArt, priceSociete: parseInt(e.target.value) || 0 })} className="px-2 py-1.5 border rounded outline-none" placeholder="P. Société" />
                    <input type="number" value={newArt.priceExterne || ''} onChange={(e) => setNewArt({ ...newArt, priceExterne: parseInt(e.target.value) || 0 })} className="px-2 py-1.5 border rounded outline-none" placeholder="P. Externe" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveArticle} className="px-4 py-1.5 bg-blue-600 text-white rounded cursor-pointer flex items-center gap-1"><Check className="w-4 h-4" /> Enregistrer</button>
                    <button onClick={() => setAddArticle(false)} className="px-4 py-1.5 bg-slate-400 text-white rounded cursor-pointer">Annuler</button>
                  </div>
                </div>
              )}
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-2 text-left">Famille</th>
                      <th className="p-2 text-left">Nom</th>
                      <th className="p-2">Unité</th>
                      <th className="p-2 text-right">P.Achat</th>
                      <th className="p-2 text-right">P.Comptoir</th>
                      <th className="p-2 text-right">P.Société</th>
                      <th className="p-2 text-right">P.Externe</th>
                      <th className="p-2 text-center">Stocks C/P</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.articles.map((a) => (
                      <tr key={a.id} className="border-b border-slate-100">
                        <td className="p-2"><span className="px-1.5 py-0.5 bg-slate-200 rounded text-[10px]">{familyLabel(a.family)}</span></td>
                        <td className="p-2 font-medium">{a.name}</td>
                        <td className="p-2 text-slate-500">{a.unit}</td>
                        <td className="p-2 text-right font-mono">{formatAr(a.purchasePrice)}</td>
                        <td className="p-2 text-right font-mono">{formatAr(a.priceComptoir)}</td>
                        <td className="p-2 text-right font-mono">{formatAr(a.priceSociete)}</td>
                        <td className="p-2 text-right font-mono">{formatAr(a.priceExterne)}</td>
                        <td className="p-2 text-center font-mono">{a.stockCentral}/{a.stockPharmacie}</td>
                        <td className="p-2 text-center"><button onClick={() => deleteArticle(a.id)} className="text-red-500 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== PRICES ===== */}
          {tab === 'prices' && (
            <div>
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><DollarSign className="w-5 h-5" /> Grille tarifaire (3 prix par article)</h3>
              {ARTICLE_FAMILIES.map((f) => {
                const arts = state.articles.filter((a) => a.family === f);
                return (
                  <div key={f} className="mb-4">
                    <h4 className="font-semibold mb-1 text-sm">{familyLabel(f)}</h4>
                    <div className="overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="p-2 text-left">Article</th>
                            <th className="p-2 text-right">Comptoir</th>
                            <th className="p-2 text-right">Société</th>
                            <th className="p-2 text-right">Externe</th>
                            <th className="p-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {arts.map((a) => (
                            <tr key={a.id} className="border-b border-slate-100">
                              {editingArt === a.id ? (
                                <>
                                  <td className="p-2 font-medium">{a.name}</td>
                                  <td className="p-1"><input type="number" value={editPrices.priceComptoir} onChange={(e) => setEditPrices({ ...editPrices, priceComptoir: parseInt(e.target.value) || 0 })} className="w-full px-1 py-0.5 border rounded text-right outline-none" /></td>
                                  <td className="p-1"><input type="number" value={editPrices.priceSociete} onChange={(e) => setEditPrices({ ...editPrices, priceSociete: parseInt(e.target.value) || 0 })} className="w-full px-1 py-0.5 border rounded text-right outline-none" /></td>
                                  <td className="p-1"><input type="number" value={editPrices.priceExterne} onChange={(e) => setEditPrices({ ...editPrices, priceExterne: parseInt(e.target.value) || 0 })} className="w-full px-1 py-0.5 border rounded text-right outline-none" /></td>
                                  <td className="p-1"><button onClick={savePrices} className="text-emerald-600 cursor-pointer"><Save className="w-4 h-4" /></button></td>
                                </>
                              ) : (
                                <>
                                  <td className="p-2 font-medium">{a.name}</td>
                                  <td className="p-2 text-right font-mono">{formatAr(a.priceComptoir)}</td>
                                  <td className="p-2 text-right font-mono">{formatAr(a.priceSociete)}</td>
                                  <td className="p-2 text-right font-mono">{formatAr(a.priceExterne)}</td>
                                  <td className="p-1"><button onClick={() => startEditPrices(a)} className="text-blue-600 cursor-pointer"><DollarSign className="w-4 h-4" /></button></td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ===== COMPANIES ===== */}
          {tab === 'companies' && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Building2 className="w-5 h-5" /> Sociétés & clients conventionnés</h3>
                <button onClick={() => setAddCompany(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 cursor-pointer text-sm"><Plus className="w-4 h-4" /> Nouvelle société</button>
              </div>
              {addCompany && (
                <div className="flex gap-2 mb-3">
                  <input type="text" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} className="flex-1 px-3 py-2 border rounded-lg outline-none" placeholder="Nom de la société" />
                  <button onClick={saveCompany} className="px-4 py-2 bg-emerald-600 text-white rounded-lg cursor-pointer"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setAddCompany(false)} className="px-4 py-2 bg-slate-400 text-white rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {state.companies.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 border rounded-lg">
                    <span className="font-medium text-sm">{c.name}</span>
                    <button onClick={() => deleteCompany(c.id)} className="text-red-500 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== AUDIT LOG ===== */}
          {tab === 'audit' && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Shield className="w-5 h-5" /> Journal d'audit ({state.auditLogs.length})</h3>
                <button onClick={() => {
                  if (!confirm('Effacer tout le journal d\'audit ?')) return;
                  setState((prev) => ({ ...prev, auditLogs: [] }));
                }} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs cursor-pointer hover:bg-rose-700">Vider le journal</button>
              </div>
              <div className="mb-3 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Rechercher dans le journal..." className="w-full pl-8 pr-3 py-1.5 border rounded text-sm" />
                </div>
              </div>
              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Date / Heure</th>
                      <th className="p-2 text-left">Utilisateur</th>
                      <th className="p-2 text-left">Action</th>
                      <th className="p-2 text-left">Détails</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.auditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2 font-mono text-slate-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('fr-FR')}</td>
                        <td className="p-2">{log.userName} <span className="text-slate-400">({log.userRole})</span></td>
                        <td className="p-2"><span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono">{log.action}</span></td>
                        <td className="p-2">{log.details}</td>
                      </tr>
                    ))}
                    {state.auditLogs.length === 0 && (
                      <tr><td colSpan={4} className="p-6 text-center text-slate-400">Aucune entrée dans le journal</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== BACKUP ===== */}
          {tab === 'backup' && (
            <div className="space-y-4 max-w-2xl">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Database className="w-5 h-5" /> Sauvegarde & restauration</h3>
              <p className="text-sm text-slate-600">Exportez l'intégralité de la base (patients, factures, stock, articles, utilisateurs) dans un fichier JSON, ou restaurez une sauvegarde existante.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 border-2 border-emerald-200 rounded-lg bg-emerald-50">
                  <h4 className="font-bold text-emerald-800 mb-2 flex items-center gap-2"><Download className="w-5 h-5" /> Exporter</h4>
                  <p className="text-sm text-emerald-700 mb-3">Téléchargez un fichier .json contenant toutes les données.</p>
                  <button onClick={exportBackup} className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer font-medium"><Download className="w-4 h-4 inline" /> Télécharger la sauvegarde</button>
                </div>
                <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                  <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2"><Upload className="w-5 h-5" /> Importer</h4>
                  <p className="text-sm text-blue-700 mb-3">Restaure un fichier .json précédemment exporté.</p>
                  <input ref={restoreInputRef} type="file" accept="application/json" onChange={importBackup} className="hidden" />
                  <button onClick={() => restoreInputRef.current?.click()} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer font-medium"><Upload className="w-4 h-4 inline" /> Choisir un fichier</button>
                </div>
              </div>
              <div className="p-4 border-2 border-rose-300 rounded-lg bg-rose-50">
                <h4 className="font-bold text-rose-800 mb-2 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Zone dangereuse</h4>
                <p className="text-sm text-rose-700 mb-3">Réinitialisation complète : vide patients, factures, stock, hospitalisations, etc. Le catalogue articles, sociétés et utilisateurs sont conservés.</p>
                <button onClick={resetSystem} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 cursor-pointer font-medium"><RefreshCw className="w-4 h-4 inline" /> Réinitialiser le système</button>
              </div>
            </div>
          )}

          {/* ===== SYSTEM ===== */}
          {tab === 'system' && (
            <div className="space-y-4 max-w-2xl">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><SettingsIcon className="w-5 h-5" /> Paramètres système</h3>
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-sm mb-2">Informations</h4>
                <ul className="text-xs space-y-1 text-slate-600">
                  <li>Application : <strong>MediCare HIS v1.0</strong></li>
                  <li>Base de données : <strong>LocalStorage (navigateur)</strong></li>
                  <li>Format ticket actif : <strong>{state.ticketSettings.paperWidth}mm</strong></li>
                  <li>Devise : <strong>{state.ticketSettings.currency}</strong></li>
                  <li>Stockage : <strong>~{Math.round(JSON.stringify(state).length / 1024)} Ko</strong> utilisés</li>
                </ul>
              </div>
              <div className="p-4 border rounded-lg bg-blue-50">
                <h4 className="font-semibold text-sm mb-2">Aide-mémoire</h4>
                <ul className="text-xs space-y-1 text-slate-700 list-disc pl-4">
                  <li>Pour imprimer un ticket, configurez d'abord le format 58 ou 80mm dans l'onglet "Tickets & impression".</li>
                  <li>Vous pouvez téléverser votre logo ou saisir une URL.</li>
                  <li>Les modifications sont enregistrées automatiquement.</li>
                  <li>Faites des sauvegardes régulières depuis l'onglet "Sauvegarde".</li>
                </ul>
              </div>
            </div>
          )}

          {/* ===== PROMPTS ===== */}
          {tab === 'prompts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5" /> Prompts & spécifications techniques</h3>
                <div className="flex gap-2">
                  <button onClick={() => setPromptView('windev')} className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${promptView === 'windev' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>💻 WinDev</button>
                  <button onClick={() => setPromptView('web')} className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${promptView === 'web' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>🌐 Web</button>
                  <button onClick={() => copyPromptText(promptView === 'windev' ? WINDEV_PROMPT : WEB_PROMPT)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 cursor-pointer">
                    <Copy className="w-4 h-4" /> {copied ? 'Copié !' : 'Copier le prompt'}
                  </button>
                </div>
              </div>
              <div className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-auto whitespace-pre-wrap" style={{ maxHeight: 'calc(100vh - 360px)' }}>
                {promptView === 'windev' ? WINDEV_PROMPT : WEB_PROMPT}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
