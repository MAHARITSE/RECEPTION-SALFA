import { useState, useRef } from 'react';
import type { UserRole, TicketSettings, Company, CompanySettlementMode } from '../types';
import { formatAr, addAuditLog, migrateLegacyToVentes, createInitialState } from '../store';
import type { AppState } from '../store';
import ModuleReception from './ModuleReception';
import ModuleMedecin from './ModuleMedecin';
import ModuleCaisse from './ModuleCaisse';
import ModulePharmacie from './ModulePharmacie';
import ModuleMagasinier from './ModuleMagasinier';
import ModuleLaboratoire from './ModuleLaboratoire';
import ModuleFacturationSocietes from './ModuleFacturationSocietes';
import ModuleDossierMedical from './ModuleDossierMedical';
import {
  Trash2, Plus, X, Check, Download, Upload,
  Eye, Settings as SettingsIcon, Users, Building2,
  Receipt, FileText, Shield, Database, Printer, Image as ImageIcon,
  CreditCard, AlertCircle, Search, RefreshCw, Copy, Activity,
  Key, Edit2, Hospital, Stethoscope, Pill, Package, FlaskConical,
  Menu, LayoutDashboard
} from 'lucide-react';
import { WINDEV_PROMPT, WEB_PROMPT } from '../data/promptsData';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }

type Tab = 'dashboard' | 'societe' | 'tickets' | 'users' | 'companies' | 'audit' | 'backup' | 'system' | 'prompts';
type AppModuleKey = 'reception' | 'doctor' | 'medicalRecords' | 'cashier' | 'pharmacy' | 'magasinier' | 'laboratory' | 'billing';

const roleLabels: Record<string, string> = {
  doctor: 'Médecin',
  cashier: 'Caisse',
  pharmacy: 'Pharmacie',
  magasinier: 'Magasinier',
  laboratory: 'Laboratoire',
  billing: 'Responsable facturation',
  admin: 'Admin'
};

const ALL_ROLES: UserRole[] = ['doctor', 'cashier', 'pharmacy', 'magasinier', 'laboratory', 'billing', 'admin'];

const LOGO_EMOJIS = ['🍺', '🍻', '🍷', '🍸', '☕', '🍽️', '🏥', '⚕️', '💊', '🔬', '🏨', '🏢', '🩺', '⭐', '❤️', '🛡️'];

const TABS: { key: Tab; label: string; icon: any; desc: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, desc: 'Vue d\'ensemble du système' },
  { key: 'societe', label: 'Société & Établissement', icon: Building2, desc: 'Identité, en-tête, NIF, STAT, Logo' },
  { key: 'tickets', label: 'Tickets & Impression', icon: Printer, desc: 'Format 58/80mm, impression directe, aperçu' },
  { key: 'users', label: 'Utilisateurs & Accès', icon: Users, desc: 'Comptes personnels, rôles, mots de passe' },
  { key: 'companies', label: 'Sociétés & Conventions', icon: CreditCard, desc: 'Partenaires conventionnés' },
  { key: 'audit', label: 'Journal d\'audit', icon: Shield, desc: 'Historique de sécurité des actions' },
  { key: 'backup', label: 'Sauvegarde & Restauration', icon: Database, desc: 'Export/Import JSON, réinitialisation' },
  { key: 'system', label: 'Système & Infos', icon: SettingsIcon, desc: 'Paramètres généraux & stockage' },
  { key: 'prompts', label: 'Prompts & Specs', icon: FileText, desc: 'Spécifications techniques WinDev & Web' },
];

const APP_MODULES: { key: AppModuleKey; label: string; icon: any; desc: string }[] = [
  { key: 'reception', label: 'Réception', icon: Hospital, desc: 'Patients, enregistrement, paramètres vitaux' },
  { key: 'doctor', label: 'Médecin / Consultation', icon: Stethoscope, desc: 'File, consultation, ordonnances, examens' },
  { key: 'medicalRecords', label: 'Dossiers médicaux', icon: FileText, desc: 'Identité, parcours, historique et analyses' },
  { key: 'cashier', label: 'Caisse', icon: CreditCard, desc: 'Paiements, ventes externes, hospitalisation/bloc' },
  { key: 'pharmacy', label: 'Pharmacie', icon: Pill, desc: 'Caisse de garde, dispensation, stock pharmacie' },
  { key: 'magasinier', label: 'Magasinier / Stock', icon: Package, desc: 'Articles, achats, transferts, inventaires' },
  { key: 'laboratory', label: 'Laboratoire', icon: FlaskConical, desc: 'Analyses, prélèvements, résultats' },
  { key: 'billing', label: 'Facturation sociétés', icon: Building2, desc: 'Comptes conventionnés et règlements' },
];

export default function ModuleAdministration({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [activeModule, setActiveModule] = useState<AppModuleKey | null>(null);
  const [adminMedicalPatientId, setAdminMedicalPatientId] = useState<string | null>(null);
  
  // Utilisateurs
  const [addUser, setAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ id: '', name: '', role: 'doctor' as UserRole, password: '' });
  const [searchUser, setSearchUser] = useState('');

  // Sociétés / Clients conventionnés
  const [addCompany, setAddCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: '', settlementMode: 'monthly_global' as CompanySettlementMode });
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editCompany, setEditCompany] = useState<{ name: string; settlementMode: CompanySettlementMode }>({ name: '', settlementMode: 'monthly_global' });

  // Aperçu Ticket
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Prompts
  const [promptView, setPromptView] = useState<'windev' | 'web'>('windev');
  const [copied, setCopied] = useState(false);

  // Notification toast
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // ============ TICKETS & SOCIETE CONFIG ============
  const updateTicket = (patch: Partial<TicketSettings>) => {
    setState((prev) => {
      const next = { ...prev, ticketSettings: { ...prev.ticketSettings, ...patch } };
      addAuditLog(next, 'CONFIG_ETABLISSEMENT', JSON.stringify(patch).slice(0, 150));
      return next;
    });
    showToast('Paramètres mis à jour');
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

  // ============ USERS ============
  const saveUser = () => {
    if (!newUser.id.trim() || !newUser.name.trim()) { alert('ID et nom requis'); return; }
    if (state.users.find((u) => u.id.toLowerCase() === newUser.id.trim().toLowerCase())) { alert('Cet ID existe déjà'); return; }
    setState((prev) => {
      const u = {
        id: newUser.id.trim().toUpperCase(),
        name: newUser.name.trim(),
        role: newUser.role,
        password: newUser.password.trim() || 'pass123',
      };
      const next = { ...prev, users: [...prev.users, u] };
      addAuditLog(next, 'AJOUT_UTILISATEUR', `${u.name} (${u.id}) — ${roleLabels[u.role]}`);
      return next;
    });
    setAddUser(false);
    setNewUser({ id: '', name: '', role: 'doctor', password: '' });
    showToast('Utilisateur créé avec succès');
  };

  const deleteUser = (uid: string) => {
    if (uid === 'ADM001') { alert('Impossible de supprimer le compte administrateur racine (ADM001)'); return; }
    if (!confirm(`Supprimer l'utilisateur ${uid} ?`)) return;
    setState((prev) => {
      const next = { ...prev, users: prev.users.filter((u) => u.id !== uid) };
      addAuditLog(next, 'SUPPRESSION_UTILISATEUR', uid);
      return next;
    });
    showToast('Utilisateur supprimé');
  };

  const resetPassword = (uid: string) => {
    const newPwd = prompt(`Nouveau mot de passe pour ${uid} :`, 'pass123');
    if (!newPwd) return;
    setState((prev) => {
      const next = { ...prev, users: prev.users.map((u) => u.id === uid ? { ...u, password: newPwd } : u) };
      addAuditLog(next, 'RESET_PASSWORD', uid);
      return next;
    });
    showToast('Mot de passe mis à jour');
  };

  // ============ COMPANIES ============
  const saveCompany = () => {
    const name = newCompany.name.trim().toUpperCase();
    if (!name) { alert('Veuillez saisir le nom de la société.'); return; }
    if (state.companies.some(c => c.name === name)) { alert('Cette société existe déjà'); return; }
    const company: Company = {
      id: `comp-${Date.now()}`,
      name,
      paymentMode: 'Crédit',
      settlementMode: newCompany.settlementMode,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => {
      const next = { ...prev, companies: [...prev.companies, company] };
      addAuditLog(next, 'AJOUT_SOCIETE_PARTENAIRE', `${name} (sous-mode: ${newCompany.settlementMode === 'monthly_global' ? 'Global mensuel' : 'Individuel par facture'})`);
      return next;
    });
    setNewCompany({ name: '', settlementMode: 'monthly_global' });
    setAddCompany(false);
    showToast('Société ajoutée');
  };

  const startEditCompany = (c: Company) => {
    setEditingCompanyId(c.id);
    setEditCompany({ name: c.name, settlementMode: c.settlementMode });
  };

  const saveEditCompany = () => {
    if (!editingCompanyId) return;
    const name = editCompany.name.trim().toUpperCase();
    if (!name) { alert('Nom invalide'); return; }
    if (state.companies.some(c => c.name === name && c.id !== editingCompanyId)) { alert('Une autre société porte déjà ce nom'); return; }
    setState((prev) => {
      const next = { ...prev, companies: prev.companies.map(c => c.id === editingCompanyId ? { ...c, name, settlementMode: editCompany.settlementMode } : c) };
      addAuditLog(next, 'MODIFICATION_SOCIETE_PARTENAIRE', `${name} — sous-mode: ${editCompany.settlementMode === 'monthly_global' ? 'Global mensuel' : 'Individuel par facture'}`);
      return next;
    });
    setEditingCompanyId(null);
    showToast('Société mise à jour');
  };

  const deleteCompany = (id: string) => {
    if (!confirm('Supprimer cette société partenaire ?')) return;
    setState((prev) => ({ ...prev, companies: prev.companies.filter((c) => c.id !== id) }));
    showToast('Société supprimée');
  };

  // ============ BACKUP & RESTORE ============
  const exportBackup = () => {
    const data = {
      version: '2.0-LOGBARA-SALFA',
      exportedAt: new Date().toISOString(),
      exportedBy: state.currentUser?.id || 'ADM001',
      state: { ...state, currentUser: null },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HIS-salfa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setState((prev) => { const next = { ...prev }; addAuditLog(next, 'EXPORT_BACKUP', a.download); return next; });
    showToast('Sauvegarde exportée avec succès');
  };

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(' Restauration système : Toutes les données actuelles seront remplacées par la sauvegarde. Continuer ?')) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.state) throw new Error('Fichier de sauvegarde invalide');
        setState((prev) => {
          const next = {
            ...prev,
            ...data.state,
            currentUser: prev.currentUser,
            // Garantit la présence des nouvelles tables même dans d'anciens backups.
            ventes: data.state?.ventes || [],
            venteLines: data.state?.venteLines || [],
            ventePayments: data.state?.ventePayments || [],
            factureCounter: data.state?.factureCounter || 0,
          };
          migrateLegacyToVentes(next);
          addAuditLog(next, 'IMPORT_BACKUP', `Restauré depuis ${data.exportedAt || 'fichier'}`);
          return next;
        });
        showToast('Base de données restaurée avec succès');
      } catch (err) {
        alert('Erreur lors de la lecture de la sauvegarde : ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const resetSystem = () => {
    if (!confirm('⚠️ ATTENTION : Réinitialiser TOUTES les données de ventes, factures, patients, mouvements de stock ?')) return;
    if (!confirm('Confirmez-vous la réinitialisation définitive ?')) return;
    setState((prev) => {
      const fresh: AppState = {
        ...prev,
        patients: [], consultations: [], invoices: [],
        stockTransfers: [], stockEntries: [],
        notifications: [], messages: [], auditLogs: [],
        stockMovements: [], inventorySessions: [], journey: [], labRequests: [],
        hbRecords: [],
        ventes: [],
        venteLines: [],
        ventePayments: [],
        factureCounter: 0,
        movementHeaders: [],
        movementLines: [],
        articles: prev.articles,
        companies: prev.companies,
        users: prev.users,
        warehouseServices: prev.warehouseServices,
        fournisseurs: prev.fournisseurs,
        familles: prev.familles,
      };
      addAuditLog(fresh, 'RESET_SYSTEM', 'Réinitialisation des données opérationnelles');
      return fresh;
    });
    showToast('Système réinitialisé');
  };

  const resetAllDatabase = () => {
    if (!confirm('⚠️ RÉINITIALISATION COMPLÈTE : TOUTES les données seront effacées et remplacées par les données de démonstration initiales.\n\nCela inclut : patients, consultations, factures, articles, utilisateurs, sociétés, fournisseurs, tout.\n\nContinuer ?')) return;
    if (!confirm('⚠️ DERNIÈRE CONFIRMATION : Cette action est IRRÉVERSIBLE. Toutes les données saisies seront perdues.\n\nConfirmer la réinitialisation totale ?')) return;
    // Effacer le localStorage s'il existe
    try { localStorage.clear(); } catch { /* ignore */ }
    // Réinitialiser complètement l'état avec les données de seed initiales
    const freshState = createInitialState();
    setState(() => freshState);
    showToast('✅ Base de données entièrement réinitialisée');
  };

  const copyPromptText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Stats
  const todayInvoices = state.invoices.filter(i => i.status === 'paid' && new Date(i.paidAt || '').toDateString() === new Date().toDateString());
  const totalRevenue = todayInvoices.reduce((s, i) => s + i.patientCharge, 0);

  // Preview ticket
  const PreviewTicket = () => {
    const s = state.ticketSettings;
    const w = s.paperWidth;
    const isNarrow = w === 58;
    return (
      <div className="bg-white border-2 border-slate-300 rounded-xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3 pb-2 border-b">
          <span className="font-bold text-sm flex items-center gap-2"><Receipt className="w-4 h-4 text-blue-600" /> Ticket Aperçu {w}mm</span>
          <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div
          className="bg-white mx-auto font-mono text-black shadow-lg border border-slate-200 rounded p-3"
          style={{
            width: w === 58 ? '58mm' : '80mm',
            fontSize: isNarrow ? '9.5px' : '10.5px',
          }}
        >
          {s.showLogo && s.logoUrl && (
            <div className="text-center mb-2">
              {s.logoUrl.length <= 5 ? (
                <div className="text-3xl">{s.logoUrl}</div>
              ) : (
                <img src={s.logoUrl} className="max-h-12 mx-auto object-contain" alt="logo" />
              )}
            </div>
          )}
          <div className="text-center font-bold" style={{ fontSize: isNarrow ? '11px' : '12.5px' }}>{s.facilityName}</div>
          {s.address && <div className="text-center" style={{ fontSize: '8.5px' }}>{s.address}</div>}
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
          <div className="flex justify-between"><span>Consultation Médecine</span><span>10 000 Ar</span></div>
          <div className="flex justify-between"><span>Paracétamol 500mg × 10</span><span>5 000 Ar</span></div>
          <div className="border-t border-dashed border-black my-1.5"></div>
          <div className="flex justify-between font-bold" style={{ fontSize: isNarrow ? '11.5px' : '13px' }}><span>TOTAL PAYÉ</span><span>15 000 Ar</span></div>
          {s.showBarcode && <div className="text-center mt-1" style={{ letterSpacing: '2px', fontSize: isNarrow ? '12px' : '15px' }}>*FAC-2026-0001*</div>}
          {s.showSignature && (
            <div className="flex justify-between mt-3" style={{ fontSize: '8.5px' }}>
              <span className="border-t border-black w-2/5 pt-0.5 text-center">Caissier</span>
              <span className="border-t border-black w-2/5 pt-0.5 text-center">Client</span>
            </div>
          )}
          <div className="border-t-4 border-double border-black my-1.5"></div>
          <div className="text-center" style={{ fontSize: '8.5px' }}>{s.footerMessage}</div>
        </div>
      </div>
    );
  };

  const filteredUsers = state.users.filter(u =>
    u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.id.toLowerCase().includes(searchUser.toLowerCase()) ||
    roleLabels[u.role]?.toLowerCase().includes(searchUser.toLowerCase())
  );

  const selectAdminTab = (key: Tab) => {
    setActiveModule(null);
    setAdminMedicalPatientId(null);
    setTab(key);
  };

  const selectAppModule = (key: AppModuleKey) => {
    setActiveModule(key);
    setAdminMedicalPatientId(null);
  };

  const openAdminMedicalRecord = (patientId?: string) => {
    setAdminMedicalPatientId(patientId || null);
    setActiveModule('medicalRecords');
  };

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'reception':
        return <ModuleReception state={state} setState={setState} onStaffLogin={() => showToast('Vous êtes déjà connecté en administrateur')} onOpenMessaging={() => showToast('Messagerie disponible depuis l\'en-tête')} />;
      case 'doctor':
        return <ModuleMedecin state={state} setState={setState} onOpenMedicalRecord={openAdminMedicalRecord} />;
      case 'medicalRecords':
        return <ModuleDossierMedical state={state} patientId={adminMedicalPatientId} onBack={() => { setAdminMedicalPatientId(null); setActiveModule(null); }} />;
      case 'cashier':
        return <ModuleCaisse state={state} setState={setState} onOpenMessagingWithRecipient={() => showToast('Messagerie disponible depuis l\'en-tête')} />;
      case 'pharmacy':
        return <ModulePharmacie state={state} setState={setState} onOpenMessagingWithRecipient={() => showToast('Messagerie disponible depuis l\'en-tête')} />;
      case 'magasinier':
        return <ModuleMagasinier state={state} setState={setState} />;
      case 'laboratory':
        return <ModuleLaboratoire state={state} setState={setState} />;
      case 'billing':
        return <ModuleFacturationSocietes state={state} setState={setState} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 bg-emerald-700 text-white px-5 py-2.5 rounded-xl shadow-lg z-50 animate-bounce font-medium text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {toast}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex min-h-[calc(100vh-220px)]">
          {/* Sidebar Menu administrateur */}
          <aside className="w-72 shrink-0 border-r bg-slate-900 text-white overflow-y-auto max-h-[calc(100vh-220px)]">
            <div className="sticky top-0 z-10 bg-slate-950/95 px-4 py-4 border-b border-white/10">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Menu className="w-4 h-4 text-emerald-300" /> Menu administrateur
              </div>
              <p className="mt-1 text-[11px] text-slate-400 leading-snug">Accès supervision + toutes les interfaces de l'application.</p>
            </div>

            <div className="p-3 space-y-4">
              <div>
                <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-slate-400 font-bold">Paramètres Admin</div>
                <div className="space-y-1">
                  {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = !activeModule && tab === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => selectAdminTab(t.key)}
                        title={t.desc}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer flex items-start gap-2 transition ${
                          active ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span>
                          <span className="block">{t.label}</span>
                          <span className={`block font-normal text-[10px] leading-tight ${active ? 'text-slate-500' : 'text-slate-500'}`}>{t.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-emerald-300 font-bold">Interfaces Application</div>
                <div className="space-y-1">
                  {APP_MODULES.map((m) => {
                    const Icon = m.icon;
                    const active = activeModule === m.key;
                    return (
                      <button
                        key={m.key}
                        onClick={() => selectAppModule(m.key)}
                        title={m.desc}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer flex items-start gap-2 transition ${
                          active ? 'bg-emerald-500 text-white shadow' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${active ? 'text-white' : 'text-emerald-300'}`} />
                        <span>
                          <span className="block">{m.label}</span>
                          <span className={`block font-normal text-[10px] leading-tight ${active ? 'text-emerald-50' : 'text-slate-500'}`}>{m.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          <section className="flex-1 min-w-0 bg-slate-50">
            {activeModule && (
              <div className="px-5 py-3 border-b bg-white flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold text-emerald-600">Vue administrateur</div>
                  <h3 className="font-bold text-slate-800">{APP_MODULES.find((m) => m.key === activeModule)?.label}</h3>
                </div>
                <span className="text-xs rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 font-semibold">
                  Accès total administrateur
                </span>
              </div>
            )}

            <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              {activeModule ? renderActiveModule() : (
                <>
          {/* ===== DASHBOARD ===== */}
          {tab === 'dashboard' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2">
                    <Activity className="w-6 h-6 text-emerald-600" /> Tableau de bord administrateur
                  </h3>
                  <p className="text-xs text-slate-500">Supervision générale du système et des paramètres fondamentaux</p>
                </div>
                <div className="text-xs bg-slate-100 px-3 py-1.5 rounded-lg text-slate-600 font-mono">
                  Établissement: <strong>{state.ticketSettings.facilityName}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl shadow-sm">
                  <div className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Recettes du jour</div>
                  <div className="text-2xl font-bold text-emerald-800 font-mono mt-1">{formatAr(totalRevenue)}</div>
                  <div className="text-xs text-emerald-600 mt-1 font-medium">{todayInvoices.length} facture(s) réglée(s)</div>
                </div>

                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm">
                  <div className="text-xs text-blue-700 font-semibold uppercase tracking-wider">Comptes Utilisateurs</div>
                  <div className="text-2xl font-bold text-blue-800 font-mono mt-1">{state.users.length}</div>
                  <div className="text-xs text-blue-600 mt-1 font-medium">{ALL_ROLES.length} rôles disponibles</div>
                </div>

                <div className="p-4 bg-gradient-to-br from-purple-50 to-fuchsia-50 border border-purple-200 rounded-xl shadow-sm">
                  <div className="text-xs text-purple-700 font-semibold uppercase tracking-wider">Patients enregistrés</div>
                  <div className="text-2xl font-bold text-purple-800 font-mono mt-1">{state.patients.length}</div>
                  <div className="text-xs text-purple-600 mt-1 font-medium">En base de données</div>
                </div>

                <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl shadow-sm">
                  <div className="text-xs text-amber-700 font-semibold uppercase tracking-wider">Format d'impression</div>
                  <div className="text-2xl font-bold text-amber-800 font-mono mt-1">{state.ticketSettings.paperWidth} mm</div>
                  <div className="text-xs text-amber-600 mt-1 font-medium">Impression {state.ticketSettings.autoPrint ? 'Auto' : 'Manuelle'}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 border rounded-xl bg-slate-50/50 space-y-2">
                  <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <SettingsIcon className="w-4 h-4 text-slate-600" /> Synthèse de la configuration
                  </h4>
                  <ul className="text-xs space-y-1.5 text-slate-600">
                    <li>🏥 Établissement : <strong>{state.ticketSettings.facilityName}</strong></li>
                    <li>📍 Adresse : {state.ticketSettings.address || 'Non spécifiée'}</li>
                    <li>📞 Téléphone : {state.ticketSettings.phone || 'Non spécifié'}</li>
                    <li>📑 NIF / STAT : {state.ticketSettings.nif || 'Non spécifié'}</li>
                    <li>💰 Devise de facturation : <strong>{state.ticketSettings.currency}</strong></li>
                    <li>💳 Modes de paiement acceptés : <strong>{state.ticketSettings.paymentMethods.join(', ')}</strong></li>
                  </ul>
                </div>

                <div className="p-4 border rounded-xl bg-slate-50/50 space-y-2">
                  <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" /> Dernières actions enregistrées
                  </h4>
                  <ul className="text-xs space-y-1 text-slate-600">
                    {state.auditLogs.slice(0, 5).map((log) => (
                      <li key={log.id} className="truncate border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-mono">{new Date(log.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>{' '}
                        <span className="font-semibold text-blue-600">{log.action}</span> — {log.details.slice(0, 50)}
                      </li>
                    ))}
                    {state.auditLogs.length === 0 && <li className="text-slate-400 italic">Aucune action dans le journal</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ===== SOCIETE & ETABLISSEMENT ===== */}
          {tab === 'societe' && (
            <div className="space-y-5 max-w-4xl">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" /> Paramètres d'identité de l'établissement
                </h3>
                <p className="text-sm text-slate-500">Définissez la raison sociale, les numéros fiscaux et l'en-tête figurant sur tous les reçus et documents officiels.</p>
              </div>





              {/* Logo setup */}
              <div className="rounded-xl border p-4 bg-white space-y-3 shadow-sm">
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-purple-600" /> Logo de l'établissement
                </h4>
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="w-28 h-28 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center bg-slate-50 text-slate-400 overflow-hidden shrink-0">
                    {state.ticketSettings.logoUrl ? (
                      state.ticketSettings.logoUrl.length <= 5 ? (
                        <span className="text-4xl">{state.ticketSettings.logoUrl}</span>
                      ) : (
                        <img src={state.ticketSettings.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                      )
                    ) : (
                      <span className="text-xs text-slate-400">Aucun logo</span>
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Choisir un emoji prédéfini :</label>
                      <div className="flex flex-wrap gap-1.5">
                        {LOGO_EMOJIS.map((e) => (
                          <button
                            key={e}
                            onClick={() => updateTicket({ logoUrl: e })}
                            className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition cursor-pointer ${
                              state.ticketSettings.logoUrl === e ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 hover:bg-slate-200'
                            }`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Ou charger une image / URL :</label>
                      <div className="flex gap-2">
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 cursor-pointer flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" /> Téléverser un fichier
                        </button>
                        {state.ticketSettings.logoUrl && (
                          <button onClick={() => updateTicket({ logoUrl: '' })} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 cursor-pointer flex items-center gap-1">
                            <Trash2 className="w-3.5 h-3.5" /> Effacer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Formulaire établissement */}
              <div className="rounded-xl border p-4 bg-white space-y-3 shadow-sm">
                <h4 className="font-bold text-sm text-slate-800">Coordonnées & Informations légales</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Nom de l'établissement *</label>
                    <input value={state.ticketSettings.facilityName} onChange={e => updateTicket({ facilityName: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Sous-titre (ex: Clinique / Service urgences)</label>
                    <input value={state.ticketSettings.ticketFooter2 || ''} onChange={e => updateTicket({ ticketFooter2: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-slate-700 block mb-1">Adresse physique</label>
                    <input value={state.ticketSettings.address} onChange={e => updateTicket({ address: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Téléphone</label>
                    <input value={state.ticketSettings.phone} onChange={e => updateTicket({ phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Adresse E-mail</label>
                    <input value={state.ticketSettings.email || ''} onChange={e => updateTicket({ email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">NIF (Numéro d'Identification Fiscale)</label>
                    <input value={state.ticketSettings.nif} onChange={e => updateTicket({ nif: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Préfixe de numérotation factures</label>
                    <input value={state.ticketSettings.invoicePrefix} onChange={e => updateTicket({ invoicePrefix: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border rounded-lg text-sm uppercase font-mono" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== TICKETS & IMPRESSION ===== */}
          {tab === 'tickets' && (
            <div className="space-y-5">
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <Printer className="w-5 h-5 text-blue-600" /> Configuration des tickets & impression POS
                  </h3>
                  <p className="text-sm text-slate-500">Format papier thermique (58/80mm), impression directe Kiosk et personnalisation.</p>
                </div>
                <button onClick={() => setShowPreview(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer flex items-center gap-2 text-sm font-semibold shadow">
                  <Eye className="w-4 h-4" /> Aperçu & Test du ticket
                </button>
              </div>

              {showPreview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><PreviewTicket /></div>}

              <div className="rounded-xl border-2 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 space-y-4">
                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-blue-600" /> Format papier & Impression directe
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-2">Largeur d'imprimante thermique</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => updateTicket({ paperWidth: 58 })}
                        className={`p-4 border-2 rounded-xl cursor-pointer text-center transition ${
                          state.ticketSettings.paperWidth === 58 ? 'border-blue-600 bg-blue-100/80 shadow-sm' : 'border-slate-300 hover:border-blue-400 bg-white'
                        }`}
                      >
                        <div className="text-2xl font-bold">58 mm</div>
                        <div className="text-xs text-slate-600 mt-1">Imprimante de poche / compacte</div>
                      </button>
                      <button
                        onClick={() => updateTicket({ paperWidth: 80 })}
                        className={`p-4 border-2 rounded-xl cursor-pointer text-center transition ${
                          state.ticketSettings.paperWidth === 80 ? 'border-blue-600 bg-blue-100/80 shadow-sm' : 'border-slate-300 hover:border-blue-400 bg-white'
                        }`}
                      >
                        <div className="text-2xl font-bold">80 mm</div>
                        <div className="text-xs text-slate-600 mt-1">Imprimante de caisse standard POS</div>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-sm font-semibold flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={state.ticketSettings.autoPrint} onChange={e => updateTicket({ autoPrint: e.target.checked })} className="w-4 h-4 rounded text-blue-600" />
                      Lancer l'impression automatique lors de la validation
                    </label>
                    <p className="text-xs text-slate-500 pl-7">
                      Pour contourner le dialogue d'impression Chrome, démarrez le navigateur avec le flag <code className="px-1.5 py-0.5 bg-slate-200 rounded font-mono text-[11px]">--kiosk-printing</code>.
                    </p>
                    <label className="text-sm font-semibold flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={state.ticketSettings.showBarcode} onChange={e => updateTicket({ showBarcode: e.target.checked })} className="w-4 h-4 rounded text-blue-600" />
                      Afficher le code-barres de la facture
                    </label>
                    <label className="text-sm font-semibold flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={state.ticketSettings.showSignature} onChange={e => updateTicket({ showSignature: e.target.checked })} className="w-4 h-4 rounded text-blue-600" />
                      Afficher les zones de signatures
                    </label>
                  </div>
                </div>
              </div>

              {/* Devise & Modes de paiement */}
              <div className="rounded-xl border p-4 bg-white space-y-3 shadow-sm">
                <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <CreditCard className="w-4 h-4 text-emerald-600" /> Devise & Moyens de paiement
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Devise principale</label>
                    <select value={state.ticketSettings.currency} onChange={e => updateTicket({ currency: e.target.value as any })} className="w-full px-3 py-2 border rounded-lg text-sm bg-white cursor-pointer">
                      <option value="Ar">Ariary Malagasy (Ar)</option>
                      <option value="€">Euro (€)</option>
                      <option value="$">Dollar ($)</option>
                      <option value="Fc">Franc Congolais (Fc)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Message de pied de page</label>
                    <input value={state.ticketSettings.footerMessage} onChange={e => updateTicket({ footerMessage: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Merci de votre confiance..." />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== UTILISATEURS ===== */}
          {tab === 'users' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-600" /> Gestion du personnel & Comptes d'accès
                  </h3>
                  <p className="text-sm text-slate-500">Comptes utilisateurs, attribution des rôles et sécurisation des mots de passe.</p>
                </div>
                <button onClick={() => setAddUser(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 cursor-pointer text-sm font-semibold shadow">
                  <Plus className="w-4 h-4" /> Nouvel utilisateur
                </button>
              </div>

              {addUser && (
                <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-3">
                  <h4 className="font-bold text-sm text-slate-800">Création d'un nouveau compte</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input type="text" value={newUser.id} onChange={(e) => setNewUser({ ...newUser, id: e.target.value })} className="px-3 py-2 border rounded-lg text-sm outline-none font-mono uppercase bg-white" placeholder="Identifiant (ex: DOC004)" />
                    <input type="text" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className="px-3 py-2 border rounded-lg text-sm outline-none bg-white" placeholder="Nom complet" />
                    <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })} className="px-3 py-2 border rounded-lg text-sm outline-none cursor-pointer bg-white">
                      {ALL_ROLES.map((r) => (<option key={r} value={r}>{roleLabels[r]}</option>))}
                    </select>
                    <input type="text" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="px-3 py-2 border rounded-lg text-sm outline-none font-mono bg-white" placeholder="Mot de passe" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setAddUser(false)} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer">Annuler</button>
                    <button onClick={saveUser} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Créer le compte
                    </button>
                  </div>
                </div>
              )}

              <div className="relative max-w-md">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input type="text" value={searchUser} onChange={(e) => setSearchUser(e.target.value)} className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-sm" placeholder="Rechercher par nom, ID ou rôle..." />
              </div>

              <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-3">Identifiant ID</th>
                      <th className="p-3">Nom du collaborateur</th>
                      <th className="p-3 text-center">Rôle attribué</th>
                      <th className="p-3 text-center">Mot de passe</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-slate-800">{u.id}</td>
                        <td className="p-3 font-medium">{u.name}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            u.role === 'admin' ? 'bg-purple-100 text-purple-800'
                              : u.role === 'doctor' ? 'bg-blue-100 text-blue-800'
                              : u.role === 'magasinier' ? 'bg-amber-100 text-amber-800'
                              : u.role === 'billing' ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {roleLabels[u.role] || u.role}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono text-slate-400 text-xs">••••••••</td>
                        <td className="p-3 text-right">
                          <button onClick={() => resetPassword(u.id)} className="px-2.5 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg cursor-pointer mr-2 font-semibold flex items-center gap-1 inline-flex">
                            <Key className="w-3 h-3" /> Réinitialiser MDP
                          </button>
                          <button onClick={() => deleteUser(u.id)} disabled={u.id === 'ADM001'} className="p-1 text-rose-600 hover:bg-rose-50 rounded disabled:opacity-30 cursor-pointer inline-flex" title="Supprimer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== SOCIETES / CLIENTS CONVENTIONNES ===== */}
          {tab === 'companies' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-600" /> Sociétés partenaires & Clients conventionnés
                  </h3>
                  <p className="text-sm text-slate-500">Raison sociale des entreprises conventionnées prises en charge (Tarif Société).</p>
                </div>
                <button onClick={() => setAddCompany(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 cursor-pointer text-sm font-semibold shadow">
                  <Plus className="w-4 h-4" /> Nouvelle société
                </button>
              </div>

              {addCompany && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input type="text" value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} className="md:col-span-2 px-3 py-2 border rounded-lg text-sm uppercase bg-white outline-none" placeholder="Nom de la société (ex: ORANGE MADAGASCAR)" />
                    <select value={newCompany.settlementMode} onChange={(e) => setNewCompany({ ...newCompany, settlementMode: e.target.value as CompanySettlementMode })} className="px-3 py-2 border rounded-lg text-sm bg-white outline-none cursor-pointer">
                      <option value="monthly_global">Règlement global mensuel</option>
                      <option value="per_invoice">Règlement individuel par facture</option>
                    </select>
                  </div>
                  <div className="text-xs text-indigo-700 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Les sociétés sont systématiquement en <strong>Crédit</strong>. Les clients comptoir sont réglés en espèces.</div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={saveCompany} className="px-4 py-2 bg-indigo-600 text-white rounded-lg cursor-pointer font-semibold text-xs flex items-center gap-1"><Check className="w-4 h-4" /> Enregistrer</button>
                    <button onClick={() => { setAddCompany(false); setNewCompany({ name: '', settlementMode: 'monthly_global' }); }} className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg cursor-pointer font-semibold text-xs">Annuler</button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto border rounded-xl bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-3 text-left">Nom de la société</th>
                      <th className="p-3 text-left">Mode général</th>
                      <th className="p-3 text-left">Sous-mode de règlement</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.companies.map((c) => (
                      <tr key={c.id} className="border-t hover:bg-slate-50">
                        {editingCompanyId === c.id ? (
                          <>
                            <td className="p-2"><input type="text" value={editCompany.name} onChange={e => setEditCompany({ ...editCompany, name: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm uppercase" /></td>
                            <td className="p-2"><span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">Crédit</span></td>
                            <td className="p-2">
                              <select value={editCompany.settlementMode} onChange={e => setEditCompany({ ...editCompany, settlementMode: e.target.value as CompanySettlementMode })} className="w-full px-2 py-1.5 border rounded text-sm bg-white cursor-pointer">
                                <option value="monthly_global">Règlement global mensuel</option>
                                <option value="per_invoice">Règlement individuel par facture</option>
                              </select>
                            </td>
                            <td className="p-2 text-right space-x-1">
                              <button onClick={saveEditCompany} className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-semibold cursor-pointer">Enregistrer</button>
                              <button onClick={() => setEditingCompanyId(null)} className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs font-semibold cursor-pointer">Annuler</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 font-bold text-slate-800 flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-500" /> {c.name}</td>
                            <td className="p-3"><span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">Crédit</span></td>
                            <td className="p-3 text-xs">
                              {c.settlementMode === 'monthly_global'
                                ? <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">📅 Global mensuel</span>
                                : <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-semibold">🧾 Individuel par facture</span>}
                            </td>
                            <td className="p-3 text-right space-x-1">
                              <button onClick={() => startEditCompany(c)} className="text-indigo-600 hover:text-indigo-800 p-1 cursor-pointer" title="Modifier"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => deleteCompany(c.id)} className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== JOURNAL D'AUDIT ===== */}
          {tab === 'audit' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-600" /> Journal d'audit & Historique de sécurité ({state.auditLogs.length})
                  </h3>
                  <p className="text-sm text-slate-500">Traçabilité complète des actions système, créations, modifications et suppressions.</p>
                </div>
                <button onClick={() => { if (confirm('Purger le journal d\'audit ?')) setState(prev => ({ ...prev, auditLogs: [] })); }} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-rose-700">
                  Vider le journal
                </button>
              </div>

              <div className="border rounded-xl overflow-hidden bg-white shadow-sm max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b sticky top-0">
                    <tr>
                      <th className="p-3">Horodatage</th>
                      <th className="p-3">Opérateur</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Détails de l'opération</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.auditLogs.map((log) => (
                      <tr key={log.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('fr-FR')}</td>
                        <td className="p-3 font-medium">{log.userName} <span className="text-slate-400 font-normal">({log.userRole})</span></td>
                        <td className="p-3"><span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-mono text-[10px] font-bold">{log.action}</span></td>
                        <td className="p-3 text-slate-700">{log.details}</td>
                      </tr>
                    ))}
                    {state.auditLogs.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-medium">Aucun événement dans le journal d'audit.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== SAUVEGARDE & RESTAURATION ===== */}
          {tab === 'backup' && (
            <div className="space-y-5 max-w-3xl">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-600" /> Sauvegarde, Restauration & Maintenance
                </h3>
                <p className="text-sm text-slate-500">Générez des sauvegardes au format JSON ou restaurez un point de sauvegarde antérieur.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 border-2 border-emerald-200 rounded-xl bg-emerald-50/50 space-y-3">
                  <h4 className="font-bold text-emerald-900 flex items-center gap-2 text-sm"><Download className="w-4 h-4" /> Exporter la base (JSON)</h4>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    Téléchargez un fichier de sauvegarde complet contenant tous les patients, consultations, factures, catalogue et historique.
                  </p>
                  <button onClick={exportBackup} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs cursor-pointer flex items-center justify-center gap-2 shadow">
                    <Download className="w-4 h-4" /> Télécharger le fichier JSON
                  </button>
                </div>

                <div className="p-5 border-2 border-blue-200 rounded-xl bg-blue-50/50 space-y-3">
                  <h4 className="font-bold text-blue-900 flex items-center gap-2 text-sm"><Upload className="w-4 h-4" /> Importer / Restaurer</h4>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Chargez un fichier de sauvegarde JSON pour restaurer l'état complet du système.
                  </p>
                  <input ref={restoreInputRef} type="file" accept="application/json" onChange={importBackup} className="hidden" />
                  <button onClick={() => restoreInputRef.current?.click()} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs cursor-pointer flex items-center justify-center gap-2 shadow">
                    <Upload className="w-4 h-4" /> Sélectionner un fichier
                  </button>
                </div>
              </div>

              <div className="p-5 border-2 border-rose-200 rounded-xl bg-rose-50 space-y-3">
                <h4 className="font-bold text-rose-900 flex items-center gap-2 text-sm"><AlertCircle className="w-4 h-4 text-rose-600" /> Zone de danger — Réinitialisation</h4>
                <p className="text-xs text-rose-700 leading-relaxed">
                  Conserve la liste des utilisateurs, les fournisseurs et le catalogue d'articles, mais efface l'intégralité des dossiers patients, factures et mouvements.
                </p>
                <button onClick={resetSystem} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs cursor-pointer flex items-center gap-2 shadow">
                  <RefreshCw className="w-4 h-4" /> Réinitialiser les données opérationnelles
                </button>
              </div>

              <div className="p-5 border-2 border-red-400 rounded-xl bg-gradient-to-br from-red-50 to-rose-100 space-y-3">
                <h4 className="font-bold text-red-900 flex items-center gap-2 text-sm"><AlertCircle className="w-5 h-5 text-red-700" /> ⛔ Réinitialisation TOTALE de la base</h4>
                <p className="text-xs text-red-700 leading-relaxed">
                  Supprime <strong>TOUTES</strong> les données (patients, consultations, factures, articles, utilisateurs, sociétés, fournisseurs, catalogue labo, etc.) et restaure l'état initial de démonstration. <strong>Cette action est irréversible.</strong>
                </p>
                <button onClick={resetAllDatabase} className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold text-xs cursor-pointer flex items-center gap-2 shadow-lg border border-red-600">
                  <RefreshCw className="w-4 h-4" /> Réinitialiser TOUTE la base de données
                </button>
              </div>
            </div>
          )}

          {/* ===== SYSTEM ===== */}
          {tab === 'system' && (
            <div className="space-y-4 max-w-2xl">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-slate-700" /> Diagnostics du système
              </h3>
              <div className="p-4 border rounded-xl bg-white space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b"><span>Application</span><strong className="font-mono">MediCare HIS / Reception SALFA v2.0</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Moteur de stockage</span><strong>Browser LocalStorage</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Espace utilisé estimé</span><strong className="font-mono">~{Math.round(JSON.stringify(state).length / 1024)} Ko</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Total utilisateurs</span><strong>{state.users.length} comptes</strong></div>
                <div className="flex justify-between py-1 border-b"><span>Format ticket actif</span><strong>{state.ticketSettings.paperWidth} mm</strong></div>
              </div>
            </div>
          )}

          {/* ===== PROMPTS ===== */}
          {tab === 'prompts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-600" /> Prompts & Spécifications techniques
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => setPromptView('windev')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${promptView === 'windev' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}>💻 WinDev</button>
                  <button onClick={() => setPromptView('web')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${promptView === 'web' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}>🌐 Web App</button>
                  <button onClick={() => copyPromptText(promptView === 'windev' ? WINDEV_PROMPT : WEB_PROMPT)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1">
                    <Copy className="w-3.5 h-3.5" /> {copied ? 'Copié !' : 'Copier le prompt'}
                  </button>
                </div>
              </div>
              <div className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-auto whitespace-pre-wrap max-h-[500px]">
                {promptView === 'windev' ? WINDEV_PROMPT : WEB_PROMPT}
              </div>
            </div>
          )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
