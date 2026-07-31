import { useState, useRef } from 'react';
import type { UserRole, TicketSettings, Company, CompanySettlementMode, User } from '../types';
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
  Menu, LayoutDashboard, AlertTriangle, ArrowRight, HardDrive, FileSpreadsheet, Lock, Unlock, CheckCircle2
} from 'lucide-react';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

type Tab = 'dashboard' | 'societe' | 'tickets' | 'users' | 'companies' | 'audit' | 'backup' | 'system';
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

const LOGO_EMOJIS = ['🏥', '⚕️', '💊', '🔬', '🏨', '🏢', '🩺', '⭐', '❤️', '🛡️', '🍺', '🍷', '☕', '🍽️'];

const TABS: { key: Tab; label: string; icon: any; desc: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, desc: 'Vue d\'ensemble & supervision générale' },
  { key: 'societe', label: 'Établissement & En-tête', icon: Building2, desc: 'Identité, NIF, STAT, adresse, Logo' },
  { key: 'tickets', label: 'Tickets POS & Format', icon: Printer, desc: 'Format 58/80mm, options & aperçu direct' },
  { key: 'users', label: 'Personnel & Accès', icon: Users, desc: 'Comptes utilisateurs, rôles & sécurisation' },
  { key: 'companies', label: 'Sociétés & Conventions', icon: CreditCard, desc: 'Entreprises & modes de règlement' },
  { key: 'audit', label: 'Journal d\'audit', icon: Shield, desc: 'Traçabilité complète des événements' },
  { key: 'backup', label: 'Sauvegarde & Restauration', icon: Database, desc: 'Export JSON, réinitialisation & maintenance' },
  { key: 'system', label: 'Diagnostics Système', icon: HardDrive, desc: 'État du stockage & statistiques tables' },
];

const APP_MODULES: { key: AppModuleKey; label: string; icon: any; desc: string }[] = [
  { key: 'reception', label: 'Réception & Accueil', icon: Hospital, desc: 'Enregistrement des patients & constantes' },
  { key: 'doctor', label: 'Consultations Médicales', icon: Stethoscope, desc: 'Examens, prescriptions & diagnostics' },
  { key: 'medicalRecords', label: 'Dossiers Médicaux', icon: FileText, desc: 'Historique, ordonnances & examens' },
  { key: 'cashier', label: 'Caisse & Règlements', icon: CreditCard, desc: 'Encaissement des actes & hospitalisations' },
  { key: 'pharmacy', label: 'Pharmacie & Dispensation', icon: Pill, desc: 'Vente directe & délivrance des ordonnances' },
  { key: 'magasinier', label: 'Gestion des Stocks', icon: Package, desc: 'Stock central, entrées, achats & transferts' },
  { key: 'laboratory', label: 'Analyses Laboratoire', icon: FlaskConical, desc: 'Prélèvements, paillasse & compte-rendu' },
  { key: 'billing', label: 'Facturation Sociétés', icon: Building2, desc: 'Relevés des comptes conventionnés' },
];

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
}

interface UserModalState {
  isOpen: boolean;
  mode: 'add' | 'edit';
  user: {
    id: string;
    name: string;
    role: UserRole;
    password?: string;
  };
}

interface ResetPasswordModalState {
  isOpen: boolean;
  user: User | null;
  newPassword: string;
  showPassword: boolean;
}

interface RestoreModalState {
  isOpen: boolean;
  fileName: string;
  exportedAt?: string;
  exportedBy?: string;
  version?: string;
  stats?: {
    patientsCount: number;
    invoicesCount: number;
    articlesCount: number;
    usersCount: number;
  };
  parsedState: AppState | null;
}

export default function ModuleAdministration({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [activeModule, setActiveModule] = useState<AppModuleKey | null>(null);
  const [adminMedicalPatientId, setAdminMedicalPatientId] = useState<string | null>(null);

  // Search & Filters
  const [searchUser, setSearchUser] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');

  const [searchCompany, setSearchCompany] = useState('');
  const [companySettlementFilter, setCompanySettlementFilter] = useState<string>('all');

  const [searchAudit, setSearchAudit] = useState('');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<string>('all');

  // Sociétés / Clients conventionnés
  const [addCompany, setAddCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: '', settlementMode: 'monthly_global' as CompanySettlementMode });
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editCompany, setEditCompany] = useState<{ name: string; settlementMode: CompanySettlementMode }>({ name: '', settlementMode: 'monthly_global' });

  // Aperçu Ticket
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);



  // Notification Toast
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // Custom Modals State
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [userModal, setUserModal] = useState<UserModalState>({
    isOpen: false,
    mode: 'add',
    user: { id: '', name: '', role: 'doctor', password: '' },
  });

  const [resetPasswordModal, setResetPasswordModal] = useState<ResetPasswordModalState>({
    isOpen: false,
    user: null,
    newPassword: '',
    showPassword: true,
  });

  const [restoreModal, setRestoreModal] = useState<RestoreModalState>({
    isOpen: false,
    fileName: '',
    parsedState: null,
  });

  // ============ TICKETS & SOCIETE CONFIG ============
  const updateTicket = (patch: Partial<TicketSettings>) => {
    setState((prev) => {
      const next = { ...prev, ticketSettings: { ...prev.ticketSettings, ...patch } };
      addAuditLog(next, 'CONFIG_ETABLISSEMENT', JSON.stringify(patch).slice(0, 150));
      return next;
    });
    showToast('Paramètres de l\'établissement mis à jour');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast('⚠️ Image trop volumineuse (maximum 1 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      updateTicket({ logoUrl: result });
    };
    reader.readAsDataURL(file);
  };

  // ============ USERS MANAGEMENT ============
  const openAddUserModal = () => {
    setUserModal({
      isOpen: true,
      mode: 'add',
      user: { id: '', name: '', role: 'doctor', password: 'pass' + Math.floor(100 + Math.random() * 900) },
    });
  };

  const openEditUserModal = (user: User) => {
    setUserModal({
      isOpen: true,
      mode: 'edit',
      user: { id: user.id, name: user.name, role: user.role, password: '' },
    });
  };

  const saveUserModal = () => {
    const { mode, user } = userModal;
    const cleanId = user.id.trim().toUpperCase();
    const cleanName = user.name.trim();

    if (!cleanId || !cleanName) {
      showToast('⚠️ L\'identifiant ID et le nom sont obligatoires');
      return;
    }

    if (mode === 'add') {
      if (state.users.some(u => u.id.toLowerCase() === cleanId.toLowerCase())) {
        showToast('⚠️ Cet identifiant ID existe déjà');
        return;
      }
      const newU: User = {
        id: cleanId,
        name: cleanName,
        role: user.role,
        password: user.password?.trim() || 'pass123',
      };
      setState((prev) => {
        const next = { ...prev, users: [...prev.users, newU] };
        addAuditLog(next, 'AJOUT_UTILISATEUR', `${newU.name} (${newU.id}) — ${roleLabels[newU.role]}`);
        return next;
      });
      showToast(`✅ Utilisateur ${cleanId} créé avec succès`);
    } else {
      // Edit mode
      setState((prev) => {
        const next = {
          ...prev,
          users: prev.users.map((u) => {
            if (u.id === cleanId) {
              return {
                ...u,
                name: cleanName,
                role: user.role,
                ...(user.password?.trim() ? { password: user.password.trim() } : {}),
              };
            }
            return u;
          }),
        };
        addAuditLog(next, 'MODIFICATION_UTILISATEUR', `${cleanName} (${cleanId}) — ${roleLabels[user.role]}`);
        return next;
      });
      showToast(`✅ Utilisateur ${cleanId} mis à jour`);
    }

    setUserModal({ ...userModal, isOpen: false });
  };

  const deleteUser = (uid: string, name: string) => {
    if (uid === 'ADM001') {
      showToast('⚠️ Impossible de supprimer le compte administrateur racine (ADM001)');
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Supprimer cet utilisateur ?',
      message: `Êtes-vous sûr de vouloir supprimer définitivement l'utilisateur "${name}" (${uid}) ? Il ne pourra plus se connecter au système.`,
      confirmText: 'Oui, supprimer',
      variant: 'danger',
      onConfirm: () => {
        setState((prev) => {
          const next = { ...prev, users: prev.users.filter((u) => u.id !== uid) };
          addAuditLog(next, 'SUPPRESSION_UTILISATEUR', `${name} (${uid})`);
          return next;
        });
        showToast('Utilisateur supprimé');
        setConfirmModal((cm) => ({ ...cm, isOpen: false }));
      },
    });
  };

  const openResetPasswordModal = (user: User) => {
    const randomPwd = 'pass' + Math.floor(100 + Math.random() * 900);
    setResetPasswordModal({
      isOpen: true,
      user,
      newPassword: randomPwd,
      showPassword: true,
    });
  };

  const saveResetPassword = () => {
    const { user, newPassword } = resetPasswordModal;
    if (!user || !newPassword.trim()) return;
    setState((prev) => {
      const next = {
        ...prev,
        users: prev.users.map((u) => (u.id === user.id ? { ...u, password: newPassword.trim() } : u)),
      };
      addAuditLog(next, 'RESET_PASSWORD', `${user.name} (${user.id})`);
      return next;
    });
    showToast(`✅ Mot de passe mis à jour pour ${user.id}`);
    setResetPasswordModal((rpm) => ({ ...rpm, isOpen: false }));
  };

  // ============ COMPANIES MANAGEMENT ============
  const saveCompany = () => {
    const name = newCompany.name.trim().toUpperCase();
    if (!name) { showToast('⚠️ Veuillez saisir le nom de la société'); return; }
    if (state.companies.some(c => c.name === name)) { showToast('⚠️ Cette société existe déjà'); return; }
    const company: Company = {
      id: `comp-${Date.now()}`,
      name,
      paymentMode: 'Crédit',
      settlementMode: newCompany.settlementMode,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => {
      const next = { ...prev, companies: [...prev.companies, company] };
      addAuditLog(next, 'AJOUT_SOCIETE_PARTENAIRE', `${name} (${newCompany.settlementMode === 'monthly_global' ? 'Global mensuel' : 'Individuel par facture'})`);
      return next;
    });
    setNewCompany({ name: '', settlementMode: 'monthly_global' });
    setAddCompany(false);
    showToast('Société partenaire enregistrée');
  };

  const startEditCompany = (c: Company) => {
    setEditingCompanyId(c.id);
    setEditCompany({ name: c.name, settlementMode: c.settlementMode });
  };

  const saveEditCompany = () => {
    if (!editingCompanyId) return;
    const name = editCompany.name.trim().toUpperCase();
    if (!name) { showToast('⚠️ Nom invalide'); return; }
    if (state.companies.some(c => c.name === name && c.id !== editingCompanyId)) { showToast('⚠️ Une autre société porte déjà ce nom'); return; }
    setState((prev) => {
      const next = { ...prev, companies: prev.companies.map(c => c.id === editingCompanyId ? { ...c, name, settlementMode: editCompany.settlementMode } : c) };
      addAuditLog(next, 'MODIFICATION_SOCIETE_PARTENAIRE', `${name} — ${editCompany.settlementMode === 'monthly_global' ? 'Global mensuel' : 'Individuel par facture'}`);
      return next;
    });
    setEditingCompanyId(null);
    showToast('Société partenaire mise à jour');
  };

  const deleteCompany = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Supprimer la société partenaire ?',
      message: `Confirmez-vous la suppression de la société "${name}" ? Les factures existantes associées ne seront pas effacées.`,
      confirmText: 'Supprimer la société',
      variant: 'danger',
      onConfirm: () => {
        setState((prev) => ({ ...prev, companies: prev.companies.filter((c) => c.id !== id) }));
        showToast('Société supprimée');
        setConfirmModal((cm) => ({ ...cm, isOpen: false }));
      },
    });
  };

  // ============ BACKUP & RESTORE ============
  const exportBackup = () => {
    const data = {
      version: '2.0-LOGBARA-SALFA',
      exportedAt: new Date().toISOString(),
      exportedBy: state.currentUser?.id || 'ADM001',
      stats: {
        patientsCount: state.patients.length,
        invoicesCount: state.invoices.length,
        articlesCount: state.articles.length,
        usersCount: state.users.length,
      },
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
    showToast('✅ Fichier de sauvegarde JSON exporté');
  };

  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.state) throw new Error('Fichier de sauvegarde invalide ou corrompu');
        
        const backupState: AppState = data.state;
        setRestoreModal({
          isOpen: true,
          fileName: file.name,
          exportedAt: data.exportedAt,
          exportedBy: data.exportedBy,
          version: data.version,
          stats: {
            patientsCount: backupState.patients?.length || 0,
            invoicesCount: backupState.invoices?.length || 0,
            articlesCount: backupState.articles?.length || 0,
            usersCount: backupState.users?.length || 0,
          },
          parsedState: backupState,
        });
      } catch (err) {
        showToast('❌ Erreur lors de la lecture du fichier : ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmImportBackup = () => {
    if (!restoreModal.parsedState) return;
    const backupState = restoreModal.parsedState;

    setState((prev) => {
      const next = {
        ...prev,
        ...backupState,
        currentUser: prev.currentUser,
        ventes: backupState.ventes || [],
        venteLines: backupState.venteLines || [],
        ventePayments: backupState.ventePayments || [],
        factureCounter: backupState.factureCounter || 0,
      };
      migrateLegacyToVentes(next);
      addAuditLog(next, 'IMPORT_BACKUP', `Restauré depuis ${restoreModal.fileName}`);
      return next;
    });
    showToast('✅ Base de données restaurée avec succès');
    setRestoreModal({ isOpen: false, fileName: '', parsedState: null });
  };

  const resetSystem = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Réinitialiser les données opérationnelles ?',
      message: 'ATTENTION : Cette action supprimera TOUS les dossiers patients, factures, consultations, ordonnances et mouvements de stock. Les comptes utilisateurs, les articles et les sociétés seront conservés.',
      confirmText: 'Réinitialiser les données',
      variant: 'warning',
      onConfirm: () => {
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
        showToast('Données opérationnelles réinitialisées');
        setConfirmModal((cm) => ({ ...cm, isOpen: false }));
      },
    });
  };

  const resetAllDatabase = () => {
    setConfirmModal({
      isOpen: true,
      title: '⛔ RÉINITIALISATION TOTALE DE LA BASE ?',
      message: 'ATTENTION EXTRÊME : Cette action est IRREVOCABLE. Toutes les données saisies (patients, factures, catalogue d\'articles, utilisateurs, sociétés) seront EFFACÉES et remplacées par les données de démonstration initiales.',
      confirmText: 'Confirmer la réinitialisation TOTALE',
      variant: 'danger',
      onConfirm: () => {
        try { localStorage.clear(); } catch { /* ignore */ }
        const freshState = createInitialState();
        setState(() => freshState);
        showToast('✅ Base de données entièrement réinitialisée');
        setConfirmModal((cm) => ({ ...cm, isOpen: false }));
      },
    });
  };

  // CSV Export for Audit Logs
  const exportAuditCSV = () => {
    if (state.auditLogs.length === 0) {
      showToast('⚠️ Aucun journal d\'audit à exporter');
      return;
    }
    const headers = ['ID', 'Horodatage', 'Opérateur', 'Rôle', 'Action', 'Détails'];
    const rows = state.auditLogs.map((l) => [
      l.id,
      new Date(l.timestamp).toLocaleString('fr-FR'),
      `"${(l.userName || '').replace(/"/g, '""')}"`,
      l.userRole || '',
      l.action || '',
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `journal_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✅ Journal d\'audit exporté au format CSV');
  };



  // Stats calculation
  const todayInvoices = state.invoices.filter(i => i.status === 'paid' && new Date(i.paidAt || '').toDateString() === new Date().toDateString());
  const totalRevenue = todayInvoices.reduce((s, i) => s + i.patientCharge, 0);

  const lowStockArticles = state.articles.filter((a) => {
    const isCentralLow = !a.alertDisabledCentral && a.stockCentral <= a.minStockCentral;
    const isPharmacieLow = !a.alertDisabledPharmacie && a.stockPharmacie <= a.minStockPharmacie;
    return isCentralLow || isPharmacieLow;
  });

  // Filtering
  const filteredUsers = state.users.filter((u) => {
    const matchesSearch = u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.id.toLowerCase().includes(searchUser.toLowerCase()) ||
      roleLabels[u.role]?.toLowerCase().includes(searchUser.toLowerCase());
    const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredCompanies = state.companies.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchCompany.toLowerCase());
    const matchesSettlement = companySettlementFilter === 'all' || c.settlementMode === companySettlementFilter;
    return matchesSearch && matchesSettlement;
  });

  const filteredAuditLogs = state.auditLogs.filter((log) => {
    const matchesSearch = log.userName.toLowerCase().includes(searchAudit.toLowerCase()) ||
      log.action.toLowerCase().includes(searchAudit.toLowerCase()) ||
      log.details.toLowerCase().includes(searchAudit.toLowerCase());
    
    if (auditCategoryFilter === 'all') return matchesSearch;
    if (auditCategoryFilter === 'users') return matchesSearch && (log.action.includes('UTILISATEUR') || log.action.includes('PASSWORD'));
    if (auditCategoryFilter === 'config') return matchesSearch && (log.action.includes('CONFIG') || log.action.includes('SOCIETE'));
    if (auditCategoryFilter === 'backup') return matchesSearch && (log.action.includes('BACKUP') || log.action.includes('RESET'));
    return matchesSearch;
  });

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

  // Ticket POS Component
  const PreviewTicket = () => {
    const s = state.ticketSettings;
    const w = s.paperWidth;
    const isNarrow = w === 58;
    return (
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto max-w-lg w-full">
        <div className="flex justify-between items-center mb-4 pb-3 border-b">
          <span className="font-bold text-base flex items-center gap-2 text-slate-800">
            <Receipt className="w-5 h-5 text-blue-600" /> Aperçu du Ticket POS {w}mm
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimer test
            </button>
            <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div
          className="bg-white mx-auto font-mono text-black shadow-lg border border-slate-200 rounded-lg p-4"
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
          {s.ticketFooter2 && <div className="text-center italic mt-0.5" style={{ fontSize: '8.5px' }}>{s.ticketFooter2}</div>}
          <div className="border-t border-dashed border-black my-2"></div>
          <div className="text-center font-bold" style={{ fontSize: isNarrow ? '11px' : '12.5px' }}>{s.receiptTitle}</div>
          <div className="text-center" style={{ fontSize: '8.5px' }}>N° {s.invoicePrefix}-2026-0001 · {new Date().toLocaleString('fr-FR')}</div>
          <div className="border-t border-dashed border-black my-2"></div>
          <div className="font-bold">DUPONT Marie</div>
          <div style={{ fontSize: '8.5px' }}>Dossier : DUP102</div>
          <div style={{ fontSize: '8.5px' }}>Société : JIRAMA</div>
          <div style={{ fontSize: '8.5px' }}>Caissier : Pierre Duval</div>
          <div className="border-t border-dashed border-black my-2"></div>
          <div className="flex justify-between"><span>Consultation Médecine</span><span>10 000 Ar</span></div>
          <div className="flex justify-between"><span>Paracétamol 500mg × 10</span><span>5 000 Ar</span></div>
          <div className="border-t border-dashed border-black my-2"></div>
          <div className="flex justify-between font-bold" style={{ fontSize: isNarrow ? '11.5px' : '13px' }}>
            <span>TOTAL PAYÉ</span>
            <span>15 000 {s.currency}</span>
          </div>
          {s.showBarcode && <div className="text-center mt-2" style={{ letterSpacing: '2px', fontSize: isNarrow ? '12px' : '15px' }}>*FAC-2026-0001*</div>}
          {s.showSignature && (
            <div className="flex justify-between mt-4" style={{ fontSize: '8.5px' }}>
              <span className="border-t border-black w-2/5 pt-0.5 text-center">Caissier</span>
              <span className="border-t border-black w-2/5 pt-0.5 text-center">Client</span>
            </div>
          )}
          <div className="border-t-4 border-double border-black my-2"></div>
          <div className="text-center" style={{ fontSize: '8.5px' }}>{s.footerMessage}</div>
        </div>
      </div>
    );
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
      {/* Toast Notification */}
      {toast && (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center p-4">
          <div className="pointer-events-auto bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white border border-emerald-300/40 px-6 py-4 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 font-semibold text-sm flex items-center gap-3">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <Check className="w-5 h-5 text-white" />
            </div>
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${
                confirmModal.variant === 'danger' ? 'bg-red-100 text-red-600' : confirmModal.variant === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">{confirmModal.title}</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{confirmModal.message}</p>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setConfirmModal((cm) => ({ ...cm, isOpen: false }))}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                {confirmModal.cancelText || 'Annuler'}
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-4 py-2 text-white rounded-xl text-xs font-bold shadow cursor-pointer ${
                  confirmModal.variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {confirmModal.confirmText || 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Create / Edit Modal */}
      {userModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                {userModal.mode === 'add' ? 'Créer un nouveau compte utilisateur' : `Modifier le compte ${userModal.user.id}`}
              </h3>
              <button onClick={() => setUserModal({ ...userModal, isOpen: false })} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Identifiant ID *</label>
                <input
                  type="text"
                  disabled={userModal.mode === 'edit'}
                  value={userModal.user.id}
                  onChange={(e) => setUserModal({ ...userModal, user: { ...userModal.user, id: e.target.value } })}
                  className="w-full px-3 py-2 border rounded-xl text-sm font-mono uppercase bg-slate-50 disabled:bg-slate-100 outline-none"
                  placeholder="Ex: DOC004, CAI002"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nom complet du collaborateur *</label>
                <input
                  type="text"
                  value={userModal.user.name}
                  onChange={(e) => setUserModal({ ...userModal, user: { ...userModal.user, name: e.target.value } })}
                  className="w-full px-3 py-2 border rounded-xl text-sm outline-none"
                  placeholder="Ex: Dr. RAKOTO Jean"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Rôle et permissions *</label>
                <select
                  value={userModal.user.role}
                  onChange={(e) => setUserModal({ ...userModal, user: { ...userModal.user, role: e.target.value as UserRole } })}
                  className="w-full px-3 py-2 border rounded-xl text-sm bg-white cursor-pointer outline-none"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>{roleLabels[r]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {userModal.mode === 'add' ? 'Mot de passe initial *' : 'Nouveau mot de passe (laisser vide pour ne pas modifier)'}
                </label>
                <input
                  type="text"
                  value={userModal.user.password || ''}
                  onChange={(e) => setUserModal({ ...userModal, user: { ...userModal.user, password: e.target.value } })}
                  className="w-full px-3 py-2 border rounded-xl text-sm font-mono outline-none"
                  placeholder="Mot de passe"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                onClick={() => setUserModal({ ...userModal, isOpen: false })}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={saveUserModal}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> {userModal.mode === 'add' ? 'Créer le compte' : 'Enregistrer les modifications'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-600" /> Réinitialiser le mot de passe
              </h3>
              <button onClick={() => setResetPasswordModal((rpm) => ({ ...rpm, isOpen: false }))} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-xl border text-xs text-slate-700 space-y-1">
                <div>Collaborateur : <strong className="text-slate-900">{resetPasswordModal.user?.name}</strong></div>
                <div>Identifiant ID : <strong className="font-mono text-blue-700">{resetPasswordModal.user?.id}</strong></div>
                <div>Rôle : <strong className="text-slate-800">{roleLabels[resetPasswordModal.user?.role || '']}</strong></div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nouveau mot de passe :</label>
                <div className="relative">
                  <input
                    type={resetPasswordModal.showPassword ? 'text' : 'password'}
                    value={resetPasswordModal.newPassword}
                    onChange={(e) => setResetPasswordModal({ ...resetPasswordModal, newPassword: e.target.value })}
                    className="w-full pl-3 pr-10 py-2 border rounded-xl text-sm font-mono outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setResetPasswordModal({ ...resetPasswordModal, showPassword: !resetPasswordModal.showPassword })}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {resetPasswordModal.showPassword ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setResetPasswordModal({ ...resetPasswordModal, newPassword: 'pass' + Math.floor(100 + Math.random() * 900) })}
                className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Générer un mot de passe aléatoire
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                onClick={() => setResetPasswordModal((rpm) => ({ ...rpm, isOpen: false }))}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={saveResetPassword}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Appliquer le mot de passe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Backup Inspection Modal */}
      {restoreModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" /> Restauration système
              </h3>
              <button onClick={() => setRestoreModal({ ...restoreModal, isOpen: false })} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1.5">
                <div className="font-bold text-sm text-blue-950 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-700" /> {restoreModal.fileName}
                </div>
                <div>Date d'exportation : <strong>{restoreModal.exportedAt ? new Date(restoreModal.exportedAt).toLocaleString('fr-FR') : 'Non spécifiée'}</strong></div>
                <div>Opérateur source : <strong>{restoreModal.exportedBy || 'ADM001'}</strong></div>
                <div>Version du format : <strong>{restoreModal.version || 'Standard'}</strong></div>
              </div>

              <div className="border rounded-xl p-3 bg-slate-50 space-y-2 text-xs">
                <div className="font-bold text-slate-700">Contenu détecté dans la sauvegarde :</div>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="bg-white p-2 border rounded">👥 Patients : <strong>{restoreModal.stats?.patientsCount}</strong></div>
                  <div className="bg-white p-2 border rounded">💳 Factures : <strong>{restoreModal.stats?.invoicesCount}</strong></div>
                  <div className="bg-white p-2 border rounded">💊 Articles : <strong>{restoreModal.stats?.articlesCount}</strong></div>
                  <div className="bg-white p-2 border rounded">👤 Utilisateurs : <strong>{restoreModal.stats?.usersCount}</strong></div>
                </div>
              </div>

              <p className="text-xs text-red-600 font-medium">
                ⚠️ En confirmant la restauration, toutes les données actuelles de l'application seront écrasées et remplacées par celles du fichier.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                onClick={() => setRestoreModal({ ...restoreModal, isOpen: false })}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={confirmImportBackup}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Restaurer la base
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Admin Workspace Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex min-h-[calc(100vh-200px)]">
          {/* Sidebar Menu administrateur */}
          <aside className="w-72 shrink-0 border-r border-slate-800 bg-slate-900 text-white overflow-y-auto max-h-[calc(100vh-200px)]">
            <div className="sticky top-0 z-10 bg-slate-950/95 px-4 py-4 border-b border-white/10">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                <Menu className="w-4 h-4 text-emerald-400" /> Console d'Administration
              </div>
              <p className="mt-1 text-[11px] text-slate-400 leading-snug">Supervision système, sécurité & accès directs aux modules.</p>
            </div>

            <div className="p-3 space-y-5">
              <div>
                <div className="px-2 pb-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-bold">Panneaux d'administration</div>
                <div className="space-y-1">
                  {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = !activeModule && tab === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => selectAdminTab(t.key)}
                        title={t.desc}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer flex items-start gap-2.5 transition ${
                          active ? 'bg-white text-slate-900 shadow-md font-bold' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span>
                          <span className="block">{t.label}</span>
                          <span className={`block font-normal text-[10px] leading-tight ${active ? 'text-slate-500' : 'text-slate-400'}`}>{t.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="px-2 pb-1.5 text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Interfaces Applicatives</div>
                <div className="space-y-1">
                  {APP_MODULES.map((m) => {
                    const Icon = m.icon;
                    const active = activeModule === m.key;
                    return (
                      <button
                        key={m.key}
                        onClick={() => selectAppModule(m.key)}
                        title={m.desc}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer flex items-start gap-2.5 transition ${
                          active ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${active ? 'text-white' : 'text-emerald-400'}`} />
                        <span>
                          <span className="block">{m.label}</span>
                          <span className={`block font-normal text-[10px] leading-tight ${active ? 'text-emerald-100' : 'text-slate-400'}`}>{m.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <section className="flex-1 min-w-0 bg-slate-50/70">
            {activeModule && (
              <div className="px-5 py-3 border-b bg-white flex items-center justify-between gap-3 shadow-xs">
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold text-emerald-600">Mode Supervision Administrateur</div>
                  <h3 className="font-bold text-slate-800 text-base">{APP_MODULES.find((m) => m.key === activeModule)?.label}</h3>
                </div>
                <button
                  onClick={() => setActiveModule(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" /> Retour au panneau admin
                </button>
              </div>
            )}

            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
              {activeModule ? renderActiveModule() : (
                <>
                  {/* ===== TAB 1: DASHBOARD ===== */}
                  {tab === 'dashboard' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-3">
                        <div>
                          <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2.5">
                            <Activity className="w-6 h-6 text-emerald-600" /> Tableau de bord & Supervision Système
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">Vue globale de l'activité médicale, des ventes et des paramètres d'infrastructure.</p>
                        </div>
                        <div className="text-xs bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-slate-700 font-mono shadow-xs flex items-center gap-2">
                          <Hospital className="w-4 h-4 text-emerald-600" />
                          <span>Établissement : <strong className="text-slate-900">{state.ticketSettings.facilityName}</strong></span>
                        </div>
                      </div>

                      {/* Stock Alert Warning Banner if any */}
                      {lowStockArticles.length > 0 && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0">
                              <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-bold text-amber-900 text-sm">Alertes Stock : {lowStockArticles.length} article(s) en seuil critique ou rupture</div>
                              <div className="text-xs text-amber-700 mt-0.5">Des articles requièrent un réapprovisionnement au dépôt central ou en pharmacie.</div>
                            </div>
                          </div>
                          <button
                            onClick={() => selectAppModule('magasinier')}
                            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer shadow-sm flex items-center gap-1.5"
                          >
                            <Package className="w-4 h-4" /> Gérer le stock
                          </button>
                        </div>
                      )}

                      {/* Metric Cards Row */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
                          <div className="text-xs text-emerald-700 font-semibold uppercase tracking-wider flex items-center justify-between">
                            <span>Recettes du jour</span>
                            <Receipt className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div className="text-2xl font-bold text-slate-900 font-mono">{formatAr(totalRevenue)}</div>
                          <div className="text-xs text-slate-500 font-medium">{todayInvoices.length} facture(s) réglée(s) aujourd'hui</div>
                        </div>

                        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
                          <div className="text-xs text-blue-700 font-semibold uppercase tracking-wider flex items-center justify-between">
                            <span>Personnel & Comptes</span>
                            <Users className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="text-2xl font-bold text-slate-900 font-mono">{state.users.length}</div>
                          <div className="text-xs text-slate-500 font-medium">{ALL_ROLES.length} rôles opérationnels définis</div>
                        </div>

                        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
                          <div className="text-xs text-purple-700 font-semibold uppercase tracking-wider flex items-center justify-between">
                            <span>Dossiers Patients</span>
                            <FileText className="w-4 h-4 text-purple-600" />
                          </div>
                          <div className="text-2xl font-bold text-slate-900 font-mono">{state.patients.length}</div>
                          <div className="text-xs text-slate-500 font-medium">{state.consultations.length} consultation(s) enregistrée(s)</div>
                        </div>

                        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-1">
                          <div className="text-xs text-amber-700 font-semibold uppercase tracking-wider flex items-center justify-between">
                            <span>Impression POS</span>
                            <Printer className="w-4 h-4 text-amber-600" />
                          </div>
                          <div className="text-2xl font-bold text-slate-900 font-mono">{state.ticketSettings.paperWidth} mm</div>
                          <div className="text-xs text-slate-500 font-medium">Impression {state.ticketSettings.autoPrint ? 'Automatique' : 'Manuelle'}</div>
                        </div>
                      </div>

                      {/* Quick Actions Toolbar */}
                      <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-xs space-y-3">
                        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                          <SettingsIcon className="w-4 h-4 text-emerald-600" /> Raccourcis Administrateur Rapides
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                          <button
                            onClick={openAddUserModal}
                            className="p-3 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 border rounded-xl text-xs font-semibold text-slate-700 hover:text-emerald-800 transition flex flex-col items-center gap-2 cursor-pointer text-center"
                          >
                            <Plus className="w-5 h-5 text-emerald-600" />
                            <span>Nouveau Compte</span>
                          </button>
                          <button
                            onClick={() => { selectAdminTab('companies'); setAddCompany(true); }}
                            className="p-3 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 border rounded-xl text-xs font-semibold text-slate-700 hover:text-indigo-800 transition flex flex-col items-center gap-2 cursor-pointer text-center"
                          >
                            <Building2 className="w-5 h-5 text-indigo-600" />
                            <span>Société Partenaire</span>
                          </button>
                          <button
                            onClick={exportBackup}
                            className="p-3 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 border rounded-xl text-xs font-semibold text-slate-700 hover:text-blue-800 transition flex flex-col items-center gap-2 cursor-pointer text-center"
                          >
                            <Download className="w-5 h-5 text-blue-600" />
                            <span>Exporter Base (JSON)</span>
                          </button>
                          <button
                            onClick={() => setShowPreview(true)}
                            className="p-3 bg-slate-50 hover:bg-purple-50 hover:border-purple-300 border rounded-xl text-xs font-semibold text-slate-700 hover:text-purple-800 transition flex flex-col items-center gap-2 cursor-pointer text-center"
                          >
                            <Printer className="w-5 h-5 text-purple-600" />
                            <span>Tester Ticket POS</span>
                          </button>
                          <button
                            onClick={() => selectAdminTab('audit')}
                            className="p-3 bg-slate-50 hover:bg-cyan-50 hover:border-cyan-300 border rounded-xl text-xs font-semibold text-slate-700 hover:text-cyan-800 transition flex flex-col items-center gap-2 cursor-pointer text-center"
                          >
                            <Shield className="w-5 h-5 text-cyan-600" />
                            <span>Journal d'Audit</span>
                          </button>
                        </div>
                      </div>

                      {/* Two Column Section: Configuration Summary + Audit feed */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="p-5 border border-slate-200 rounded-2xl bg-white space-y-3 shadow-xs">
                          <h4 className="font-bold text-sm text-slate-800 flex items-center justify-between border-b pb-2">
                            <span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-600" /> Configuration de l'établissement</span>
                            <button onClick={() => selectAdminTab('societe')} className="text-xs text-indigo-600 font-semibold hover:underline cursor-pointer">Modifier</button>
                          </h4>
                          <ul className="text-xs space-y-2 text-slate-600">
                            <li className="flex justify-between border-b border-slate-100 pb-1.5">
                              <span className="text-slate-500">Nom établissement :</span>
                              <strong className="text-slate-800">{state.ticketSettings.facilityName}</strong>
                            </li>
                            <li className="flex justify-between border-b border-slate-100 pb-1.5">
                              <span className="text-slate-500">Adresse :</span>
                              <span className="text-slate-800 font-medium">{state.ticketSettings.address || 'Non spécifiée'}</span>
                            </li>
                            <li className="flex justify-between border-b border-slate-100 pb-1.5">
                              <span className="text-slate-500">Téléphone :</span>
                              <span className="text-slate-800 font-medium">{state.ticketSettings.phone || 'Non spécifié'}</span>
                            </li>
                            <li className="flex justify-between border-b border-slate-100 pb-1.5">
                              <span className="text-slate-500">NIF / STAT :</span>
                              <span className="text-slate-800 font-mono font-medium">{state.ticketSettings.nif || 'Non renseigné'}</span>
                            </li>
                            <li className="flex justify-between border-b border-slate-100 pb-1.5">
                              <span className="text-slate-500">Préfixe factures :</span>
                              <strong className="text-emerald-700 font-mono">{state.ticketSettings.invoicePrefix}</strong>
                            </li>
                            <li className="flex justify-between">
                              <span className="text-slate-500">Devise facturation :</span>
                              <strong className="text-slate-800 font-mono">{state.ticketSettings.currency}</strong>
                            </li>
                          </ul>
                        </div>

                        <div className="p-5 border border-slate-200 rounded-2xl bg-white space-y-3 shadow-xs">
                          <h4 className="font-bold text-sm text-slate-800 flex items-center justify-between border-b pb-2">
                            <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-blue-600" /> Activités récentes (Audit)</span>
                            <button onClick={() => selectAdminTab('audit')} className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer">Tout voir ({state.auditLogs.length})</button>
                          </h4>
                          <ul className="text-xs space-y-2 text-slate-600">
                            {state.auditLogs.slice(0, 5).map((log) => (
                              <li key={log.id} className="border-b border-slate-100 pb-1.5 space-y-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-800">{log.userName} <span className="text-slate-400 font-normal">({log.userRole})</span></span>
                                  <span className="text-[10px] text-slate-400 font-mono">{new Date(log.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-mono font-bold">{log.action}</span>
                                  <span className="truncate text-slate-600">{log.details}</span>
                                </div>
                              </li>
                            ))}
                            {state.auditLogs.length === 0 && <li className="text-slate-400 italic py-2">Aucune action enregistrée pour le moment.</li>}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ===== TAB 2: SOCIETE & ETABLISSEMENT ===== */}
                  {tab === 'societe' && (
                    <div className="space-y-6 max-w-4xl">
                      <div>
                        <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2.5">
                          <Building2 className="w-6 h-6 text-indigo-600" /> Établissement & En-tête des documents
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Identité juridique, coordonnées fiscales et visuel de logo apparaissant sur les reçus, factures et bilans.</p>
                      </div>

                      {/* Logo selection card */}
                      <div className="rounded-2xl border border-slate-200 p-5 bg-white space-y-4 shadow-xs">
                        <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-purple-600" /> Logo de l'Établissement
                        </h4>
                        <div className="flex flex-col sm:flex-row items-start gap-5">
                          <div className="w-28 h-28 border-2 border-dashed border-slate-300 rounded-2xl flex items-center justify-center bg-slate-50 text-slate-400 overflow-hidden shrink-0 shadow-inner">
                            {state.ticketSettings.logoUrl ? (
                              state.ticketSettings.logoUrl.length <= 5 ? (
                                <span className="text-5xl">{state.ticketSettings.logoUrl}</span>
                              ) : (
                                <img src={state.ticketSettings.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                              )
                            ) : (
                              <span className="text-xs text-slate-400 text-center px-2">Aucun logo configuré</span>
                            )}
                          </div>

                          <div className="flex-1 space-y-4">
                            <div>
                              <label className="text-xs font-bold text-slate-700 block mb-1.5">Emojis médicaux prédéfinis :</label>
                              <div className="flex flex-wrap gap-2">
                                {LOGO_EMOJIS.map((e) => (
                                  <button
                                    key={e}
                                    onClick={() => updateTicket({ logoUrl: e })}
                                    className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition cursor-pointer ${
                                      state.ticketSettings.logoUrl === e ? 'bg-indigo-600 text-white shadow-md scale-105' : 'bg-slate-100 hover:bg-slate-200'
                                    }`}
                                  >
                                    {e}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="text-xs font-bold text-slate-700 block mb-1.5">Ou charger une image locale (PNG/JPEG) :</label>
                              <div className="flex gap-2">
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                                <button
                                  onClick={() => fileInputRef.current?.click()}
                                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-xs"
                                >
                                  <Upload className="w-3.5 h-3.5" /> Choisir une image (max 1 Mo)
                                </button>
                                {state.ticketSettings.logoUrl && (
                                  <button
                                    onClick={() => updateTicket({ logoUrl: '' })}
                                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1 border border-rose-200"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Effacer
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* General Identity Form */}
                      <div className="rounded-2xl border border-slate-200 p-5 bg-white space-y-4 shadow-xs">
                        <h4 className="font-bold text-sm text-slate-800">Coordonnées Officielles & Fiscales</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">Nom de l'établissement *</label>
                            <input
                              value={state.ticketSettings.facilityName}
                              onChange={e => updateTicket({ facilityName: e.target.value })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">Sous-titre / En-tête secondaire</label>
                            <input
                              value={state.ticketSettings.ticketFooter2 || ''}
                              onChange={e => updateTicket({ ticketFooter2: e.target.value })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm text-slate-800 outline-none"
                              placeholder="Ex: Centre Médical & Urgences 24/7"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs font-bold text-slate-700 block mb-1">Adresse physique complète</label>
                            <input
                              value={state.ticketSettings.address}
                              onChange={e => updateTicket({ address: e.target.value })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm text-slate-800 outline-none"
                              placeholder="Ex: Ambohibao, Antananarivo 101"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">Téléphone de contact</label>
                            <input
                              value={state.ticketSettings.phone}
                              onChange={e => updateTicket({ phone: e.target.value })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm text-slate-800 outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">Adresse E-mail</label>
                            <input
                              value={state.ticketSettings.email || ''}
                              onChange={e => updateTicket({ email: e.target.value })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm text-slate-800 outline-none"
                              placeholder="contact@salfa.mg"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">NIF (Identification Fiscale)</label>
                            <input
                              value={state.ticketSettings.nif}
                              onChange={e => updateTicket({ nif: e.target.value })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm font-mono text-slate-800 outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">Préfixe de numérotation des factures</label>
                            <input
                              value={state.ticketSettings.invoicePrefix}
                              onChange={e => updateTicket({ invoicePrefix: e.target.value.toUpperCase() })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm uppercase font-mono text-slate-800 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ===== TAB 3: TICKETS POS ===== */}
                  {tab === 'tickets' && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-start flex-wrap gap-3">
                        <div>
                          <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2.5">
                            <Printer className="w-6 h-6 text-blue-600" /> Configuration Impression & Format Reçus POS
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">Personnalisation des tickets thermiques (58mm / 80mm), impression directe Kiosk et options de mise en page.</p>
                        </div>
                        <button
                          onClick={() => setShowPreview(true)}
                          className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 cursor-pointer flex items-center gap-2 text-xs font-bold shadow-md"
                        >
                          <Eye className="w-4 h-4" /> Prévisualiser le Ticket POS
                        </button>
                      </div>

                      {showPreview && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
                          <PreviewTicket />
                        </div>
                      )}

                      <div className="rounded-2xl border-2 p-5 bg-gradient-to-r from-blue-50/70 to-indigo-50/70 border-blue-200 space-y-4">
                        <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                          <Receipt className="w-5 h-5 text-blue-600" /> Largeur du papier papier thermique
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button
                            onClick={() => updateTicket({ paperWidth: 58 })}
                            className={`p-5 border-2 rounded-2xl cursor-pointer text-center transition ${
                              state.ticketSettings.paperWidth === 58 ? 'border-blue-600 bg-white shadow-md ring-2 ring-blue-400' : 'border-slate-300 hover:border-blue-400 bg-white/70'
                            }`}
                          >
                            <div className="text-3xl font-extrabold text-slate-800">58 mm</div>
                            <div className="text-xs text-slate-600 mt-1.5 font-medium">Imprimante compacte / mobile Bluetooth & POS</div>
                          </button>
                          <button
                            onClick={() => updateTicket({ paperWidth: 80 })}
                            className={`p-5 border-2 rounded-2xl cursor-pointer text-center transition ${
                              state.ticketSettings.paperWidth === 80 ? 'border-blue-600 bg-white shadow-md ring-2 ring-blue-400' : 'border-slate-300 hover:border-blue-400 bg-white/70'
                            }`}
                          >
                            <div className="text-3xl font-extrabold text-slate-800">80 mm</div>
                            <div className="text-xs text-slate-600 mt-1.5 font-medium">Imprimante thermique standard caisse POS</div>
                          </button>
                        </div>

                        <div className="space-y-3 pt-2">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={state.ticketSettings.autoPrint}
                              onChange={e => updateTicket({ autoPrint: e.target.checked })}
                              className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                            />
                            <span>Lancer l'impression automatique dès la validation des règlements à la caisse</span>
                          </label>
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={state.ticketSettings.showBarcode}
                              onChange={e => updateTicket({ showBarcode: e.target.checked })}
                              className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                            />
                            <span>Afficher le code-barres textuel du numéro de la facture</span>
                          </label>
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={state.ticketSettings.showSignature}
                              onChange={e => updateTicket({ showSignature: e.target.checked })}
                              className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                            />
                            <span>Afficher les zones d'émargement et signature (Caissier & Client)</span>
                          </label>
                        </div>
                      </div>

                      {/* Devise & Messages */}
                      <div className="rounded-2xl border border-slate-200 p-5 bg-white space-y-4 shadow-xs">
                        <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                          <CreditCard className="w-4 h-4 text-emerald-600" /> Devise & Messages du Ticket
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">Devise monétaire principale</label>
                            <select
                              value={state.ticketSettings.currency}
                              onChange={e => updateTicket({ currency: e.target.value as any })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm bg-white cursor-pointer outline-none"
                            >
                              <option value="Ar">Ariary Malagasy (Ar)</option>
                              <option value="€">Euro (€)</option>
                              <option value="$">Dollar ($)</option>
                              <option value="Fc">Franc Congolais (Fc)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">Titre principal du reçu</label>
                            <input
                              value={state.ticketSettings.receiptTitle}
                              onChange={e => updateTicket({ receiptTitle: e.target.value })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm text-slate-800 outline-none"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs font-bold text-slate-700 block mb-1">Message de remerciement en bas de reçu</label>
                            <input
                              value={state.ticketSettings.footerMessage}
                              onChange={e => updateTicket({ footerMessage: e.target.value })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm text-slate-800 outline-none"
                              placeholder="Merci de votre confiance et prompt rétablissement !"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ===== TAB 4: USERS & ACCESS ===== */}
                  {tab === 'users' && (
                    <div className="space-y-5">
                      <div className="flex justify-between items-center flex-wrap gap-3">
                        <div>
                          <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2.5">
                            <Users className="w-6 h-6 text-emerald-600" /> Gestion du Personnel & Comptes d'Accès
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">Comptes personnels des agents, attribution des rôles et réinitialisation des mots de passe.</p>
                        </div>
                        <button
                          onClick={openAddUserModal}
                          className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 cursor-pointer text-xs font-bold shadow-md"
                        >
                          <Plus className="w-4 h-4" /> Nouveau compte utilisateur
                        </button>
                      </div>

                      {/* Filter Bar */}
                      <div className="bg-white p-3.5 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
                        <div className="relative flex-1 min-w-[240px] max-w-md">
                          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={searchUser}
                            onChange={(e) => setSearchUser(e.target.value)}
                            className="w-full pl-9 pr-3.5 py-1.5 border rounded-xl text-xs outline-none"
                            placeholder="Rechercher par nom, ID ou rôle..."
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-500 mr-1">Rôle :</span>
                          <button
                            onClick={() => setUserRoleFilter('all')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                              userRoleFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Tous ({state.users.length})
                          </button>
                          {ALL_ROLES.map((r) => {
                            const count = state.users.filter((u) => u.role === r).length;
                            return (
                              <button
                                key={r}
                                onClick={() => setUserRoleFilter(r)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                                  userRoleFilter === r ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {roleLabels[r]} ({count})
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Users Table */}
                      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 border-b text-slate-600 font-bold">
                            <tr>
                              <th className="p-3.5">ID Utilisateur</th>
                              <th className="p-3.5">Nom du collaborateur</th>
                              <th className="p-3.5 text-center">Rôle attribué</th>
                              <th className="p-3.5 text-center">Mot de passe</th>
                              <th className="p-3.5 text-right">Actions de supervision</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y border-slate-100">
                            {filteredUsers.map((u) => (
                              <tr key={u.id} className="hover:bg-slate-50/80 transition">
                                <td className="p-3.5 font-mono font-bold text-slate-900">{u.id}</td>
                                <td className="p-3.5 font-bold text-slate-800">{u.name}</td>
                                <td className="p-3.5 text-center">
                                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                    u.role === 'admin' ? 'bg-purple-100 text-purple-800'
                                      : u.role === 'doctor' ? 'bg-blue-100 text-blue-800'
                                      : u.role === 'magasinier' ? 'bg-amber-100 text-amber-800'
                                      : u.role === 'billing' ? 'bg-indigo-100 text-indigo-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {roleLabels[u.role] || u.role}
                                  </span>
                                </td>
                                <td className="p-3.5 text-center font-mono text-slate-400">••••••••</td>
                                <td className="p-3.5 text-right space-x-1.5">
                                  <button
                                    onClick={() => openEditUserModal(u)}
                                    className="px-2.5 py-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer font-semibold inline-flex items-center gap-1"
                                    title="Modifier le compte"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" /> Modifier
                                  </button>
                                  <button
                                    onClick={() => openResetPasswordModal(u)}
                                    className="px-2.5 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg cursor-pointer font-semibold inline-flex items-center gap-1"
                                    title="Réinitialiser le mot de passe"
                                  >
                                    <Key className="w-3.5 h-3.5" /> MDP
                                  </button>
                                  <button
                                    onClick={() => deleteUser(u.id, u.name)}
                                    disabled={u.id === 'ADM001'}
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30 cursor-pointer inline-flex"
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {filteredUsers.length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                                  Aucun utilisateur ne correspond à vos critères de recherche.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ===== TAB 5: COMPANIES & CONVENTIONS ===== */}
                  {tab === 'companies' && (
                    <div className="space-y-5">
                      <div className="flex justify-between items-center flex-wrap gap-3">
                        <div>
                          <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2.5">
                            <Building2 className="w-6 h-6 text-indigo-600" /> Sociétés Partenaires & Clients Conventionnés
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">Raison sociale des entreprises partenaires et sous-modes de règlement (Global mensuel / Individuel par facture).</p>
                        </div>
                        <button
                          onClick={() => setAddCompany(true)}
                          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2 cursor-pointer text-xs font-bold shadow-md"
                        >
                          <Plus className="w-4 h-4" /> Nouvelle société partenaire
                        </button>
                      </div>

                      {/* Add company form */}
                      {addCompany && (
                        <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3 animate-in fade-in">
                          <h4 className="font-bold text-sm text-indigo-950">Enregistrer une entreprise partenaire</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <input
                              type="text"
                              value={newCompany.name}
                              onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                              className="md:col-span-2 px-3.5 py-2 border rounded-xl text-sm uppercase bg-white outline-none"
                              placeholder="Nom de la société (ex: ORANGE MADAGASCAR, JIRAMA)"
                            />
                            <select
                              value={newCompany.settlementMode}
                              onChange={(e) => setNewCompany({ ...newCompany, settlementMode: e.target.value as CompanySettlementMode })}
                              className="px-3.5 py-2 border rounded-xl text-sm bg-white outline-none cursor-pointer"
                            >
                              <option value="monthly_global">Règlement global mensuel</option>
                              <option value="per_invoice">Règlement individuel par facture</option>
                            </select>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => { setAddCompany(false); setNewCompany({ name: '', settlementMode: 'monthly_global' }); }}
                              className="px-3.5 py-2 bg-slate-200 text-slate-700 rounded-xl cursor-pointer font-semibold text-xs"
                            >
                              Annuler
                            </button>
                            <button
                              onClick={saveCompany}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer font-bold text-xs flex items-center gap-1.5 shadow-sm"
                            >
                              <Check className="w-4 h-4" /> Enregistrer la société
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Filter Bar */}
                      <div className="bg-white p-3.5 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
                        <div className="relative flex-1 min-w-[240px] max-w-md">
                          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={searchCompany}
                            onChange={(e) => setSearchCompany(e.target.value)}
                            className="w-full pl-9 pr-3.5 py-1.5 border rounded-xl text-xs outline-none"
                            placeholder="Filtrer les sociétés par nom..."
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">Sous-mode :</span>
                          <button
                            onClick={() => setCompanySettlementFilter('all')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              companySettlementFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            Toutes ({state.companies.length})
                          </button>
                          <button
                            onClick={() => setCompanySettlementFilter('monthly_global')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              companySettlementFilter === 'monthly_global' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            📅 Mensuel global
                          </button>
                          <button
                            onClick={() => setCompanySettlementFilter('per_invoice')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              companySettlementFilter === 'per_invoice' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            🧾 Par facture
                          </button>
                        </div>
                      </div>

                      {/* Companies Table */}
                      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 border-b text-slate-600 font-bold">
                            <tr>
                              <th className="p-3.5">Nom de la société partenaire</th>
                              <th className="p-3.5 text-center">Mode Général</th>
                              <th className="p-3.5 text-center">Sous-mode de Règlement</th>
                              <th className="p-3.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y border-slate-100">
                            {filteredCompanies.map((c) => (
                              <tr key={c.id} className="hover:bg-slate-50/80 transition">
                                {editingCompanyId === c.id ? (
                                  <>
                                    <td className="p-2.5">
                                      <input
                                        type="text"
                                        value={editCompany.name}
                                        onChange={e => setEditCompany({ ...editCompany, name: e.target.value })}
                                        className="w-full px-3 py-1.5 border rounded-xl text-xs font-bold uppercase outline-none"
                                      />
                                    </td>
                                    <td className="p-2.5 text-center">
                                      <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-bold">Crédit</span>
                                    </td>
                                    <td className="p-2.5">
                                      <select
                                        value={editCompany.settlementMode}
                                        onChange={e => setEditCompany({ ...editCompany, settlementMode: e.target.value as CompanySettlementMode })}
                                        className="w-full px-2 py-1.5 border rounded-xl text-xs bg-white cursor-pointer"
                                      >
                                        <option value="monthly_global">Règlement global mensuel</option>
                                        <option value="per_invoice">Règlement individuel par facture</option>
                                      </select>
                                    </td>
                                    <td className="p-2.5 text-right space-x-1">
                                      <button onClick={saveEditCompany} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold cursor-pointer">
                                        Enregistrer
                                      </button>
                                      <button onClick={() => setEditingCompanyId(null)} className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer">
                                        Annuler
                                      </button>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="p-3.5 font-bold text-slate-900 flex items-center gap-2">
                                      <Building2 className="w-4 h-4 text-indigo-600" /> {c.name}
                                    </td>
                                    <td className="p-3.5 text-center">
                                      <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-bold">Crédit</span>
                                    </td>
                                    <td className="p-3.5 text-center">
                                      {c.settlementMode === 'monthly_global' ? (
                                        <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[11px] font-semibold">
                                          📅 Global mensuel
                                        </span>
                                      ) : (
                                        <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 text-[11px] font-semibold">
                                          🧾 Individuel par facture
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3.5 text-right space-x-1">
                                      <button onClick={() => startEditCompany(c)} className="text-indigo-600 hover:text-indigo-800 p-1.5 cursor-pointer rounded-lg hover:bg-indigo-50" title="Modifier">
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button onClick={() => deleteCompany(c.id, c.name)} className="text-rose-600 hover:text-rose-800 p-1.5 cursor-pointer rounded-lg hover:bg-rose-50" title="Supprimer">
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                            {filteredCompanies.length === 0 && (
                              <tr>
                                <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                                  Aucune société partenaire trouvée.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ===== TAB 6: AUDIT LOGS ===== */}
                  {tab === 'audit' && (
                    <div className="space-y-5">
                      <div className="flex justify-between items-center flex-wrap gap-3">
                        <div>
                          <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2.5">
                            <Shield className="w-6 h-6 text-blue-600" /> Journal d'Audit & Historique de Sécurité ({state.auditLogs.length})
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">Traçabilité et journal de sécurité de toutes les opérations effectuées dans le système.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={exportAuditCSV}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Exporter CSV
                          </button>
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Purger le journal d\'audit ?',
                                message: 'Voulez-vous effacer tout l\'historique du journal d\'audit ? Cette action supprimera les lignes de traçabilité enregistrées.',
                                confirmText: 'Vider le journal',
                                variant: 'danger',
                                onConfirm: () => {
                                  setState((prev) => ({ ...prev, auditLogs: [] }));
                                  showToast('Journal d\'audit vidé');
                                  setConfirmModal((cm) => ({ ...cm, isOpen: false }));
                                },
                              });
                            }}
                            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm"
                          >
                            Vider le journal
                          </button>
                        </div>
                      </div>

                      {/* Filter Bar */}
                      <div className="bg-white p-3.5 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
                        <div className="relative flex-1 min-w-[240px] max-w-md">
                          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={searchAudit}
                            onChange={(e) => setSearchAudit(e.target.value)}
                            className="w-full pl-9 pr-3.5 py-1.5 border rounded-xl text-xs outline-none"
                            placeholder="Rechercher par opérateur, action ou détails..."
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-500">Catégorie :</span>
                          <button
                            onClick={() => setAuditCategoryFilter('all')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              auditCategoryFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            Toutes
                          </button>
                          <button
                            onClick={() => setAuditCategoryFilter('users')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              auditCategoryFilter === 'users' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            Utilisateurs
                          </button>
                          <button
                            onClick={() => setAuditCategoryFilter('config')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              auditCategoryFilter === 'config' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            Config & Établissement
                          </button>
                          <button
                            onClick={() => setAuditCategoryFilter('backup')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              auditCategoryFilter === 'backup' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            Sauvegarde / Reset
                          </button>
                        </div>
                      </div>

                      {/* Audit Table */}
                      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs max-h-[550px] overflow-y-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 border-b sticky top-0 text-slate-600 font-bold">
                            <tr>
                              <th className="p-3.5">Horodatage</th>
                              <th className="p-3.5">Opérateur</th>
                              <th className="p-3.5">Action</th>
                              <th className="p-3.5">Détails de l'opération</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y border-slate-100">
                            {filteredAuditLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-slate-50/80 transition">
                                <td className="p-3.5 font-mono text-slate-500 whitespace-nowrap">
                                  {new Date(log.timestamp).toLocaleString('fr-FR')}
                                </td>
                                <td className="p-3.5 font-bold text-slate-800 whitespace-nowrap">
                                  {log.userName} <span className="text-slate-400 font-normal">({log.userRole})</span>
                                </td>
                                <td className="p-3.5 whitespace-nowrap">
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-mono text-[10px] font-bold">
                                    {log.action}
                                  </span>
                                </td>
                                <td className="p-3.5 text-slate-700">{log.details}</td>
                              </tr>
                            ))}
                            {filteredAuditLogs.length === 0 && (
                              <tr>
                                <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                                  Aucun événement enregistré dans le journal.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ===== TAB 7: BACKUP & RESTORE ===== */}
                  {tab === 'backup' && (
                    <div className="space-y-6 max-w-4xl">
                      <div>
                        <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2.5">
                          <Database className="w-6 h-6 text-emerald-600" /> Sauvegarde, Restauration & Maintenance Système
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Exportation intégrale au format JSON, importation sécurisée avec vérification et maintenance opérationnelle.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="p-6 border-2 border-emerald-200 rounded-2xl bg-emerald-50/40 space-y-4 shadow-xs">
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl">
                              <Download className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="font-bold text-emerald-950 text-base">Sauvegarder la Base (JSON)</h4>
                              <p className="text-xs text-emerald-700">Téléchargement instantané de toutes les données.</p>
                            </div>
                          </div>
                          <p className="text-xs text-emerald-800 leading-relaxed">
                            Exporte un fichier JSON certifié contenant les dossiers patients, consultations, ordonnances, factures, catalogue d'articles et journaux d'audit.
                          </p>
                          <button
                            onClick={exportBackup}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center justify-center gap-2 shadow-md"
                          >
                            <Download className="w-4 h-4" /> Exporter le fichier de sauvegarde JSON
                          </button>
                        </div>

                        <div className="p-6 border-2 border-blue-200 rounded-2xl bg-blue-50/40 space-y-4 shadow-xs">
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-100 text-blue-800 rounded-xl">
                              <Upload className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="font-bold text-blue-950 text-base">Restaurer un Fichier JSON</h4>
                              <p className="text-xs text-blue-700">Chargement et inspection préalable.</p>
                            </div>
                          </div>
                          <p className="text-xs text-blue-800 leading-relaxed">
                            Chargez un fichier de sauvegarde JSON antérieur. Le système affichera un rapport de contrôle du contenu avant de valider le remplacement.
                          </p>
                          <input ref={restoreInputRef} type="file" accept="application/json" onChange={handleBackupFileSelect} className="hidden" />
                          <button
                            onClick={() => restoreInputRef.current?.click()}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center justify-center gap-2 shadow-md"
                          >
                            <Upload className="w-4 h-4" /> Sélectionner le fichier de restauration
                          </button>
                        </div>
                      </div>

                      {/* Reset Danger Zones */}
                      <div className="p-6 border-2 border-rose-200 rounded-2xl bg-rose-50/60 space-y-4 shadow-xs">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
                            <AlertTriangle className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="font-bold text-rose-950 text-base">Réinitialisation des Données Opérationnelles</h4>
                            <p className="text-xs text-rose-700">Purger les transactions sans effacer le personnel ni le catalogue.</p>
                          </div>
                        </div>
                        <p className="text-xs text-rose-800 leading-relaxed">
                          Efface l'intégralité des consultations, factures, prescriptions et mouvements de stock. Les comptes d'accès du personnel, les articles du catalogue et les sociétés partenaires sont préservés.
                        </p>
                        <button
                          onClick={resetSystem}
                          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center gap-2 shadow-sm"
                        >
                          <RefreshCw className="w-4 h-4" /> Purger les données opérationnelles
                        </button>
                      </div>

                      <div className="p-6 border-2 border-red-300 rounded-2xl bg-gradient-to-br from-red-50 to-rose-100 space-y-4 shadow-xs">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-red-200 text-red-900 rounded-xl">
                            <AlertCircle className="w-6 h-6 text-red-700" />
                          </div>
                          <div>
                            <h4 className="font-bold text-red-950 text-base">Réinitialisation TOTALE de la Base de Données</h4>
                            <p className="text-xs text-red-700 font-semibold">Remise à zéro complète avec seed initial de démonstration.</p>
                          </div>
                        </div>
                        <p className="text-xs text-red-800 leading-relaxed">
                          Supprime définitivement l'ensemble des données personnalisées de l'application et recharge l'état initial.
                        </p>
                        <button
                          onClick={resetAllDatabase}
                          className="px-6 py-3 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center gap-2 shadow-md border border-red-600"
                        >
                          <RefreshCw className="w-4 h-4" /> Réinitialiser TOUTE la base de données
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ===== TAB 8: SYSTEM DIAGNOSTICS ===== */}
                  {tab === 'system' && (
                    <div className="space-y-6 max-w-3xl">
                      <div>
                        <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2.5">
                          <HardDrive className="w-6 h-6 text-slate-700" /> Diagnostics & Santé du Stockage
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Statistiques d'utilisation des tables et volume de stockage du navigateur.</p>
                      </div>

                      <div className="p-5 border border-slate-200 rounded-2xl bg-white space-y-4 shadow-xs">
                        <h4 className="font-bold text-sm text-slate-800 border-b pb-2 flex items-center justify-between">
                          <span>Volume & Métriques des Entités</span>
                          <span className="text-xs font-mono text-emerald-600 font-bold">Système SALFA v2.0</span>
                        </h4>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                          <div className="p-3 bg-slate-50 border rounded-xl space-y-1">
                            <span className="text-slate-500 block">Dossiers Patients</span>
                            <strong className="text-base text-slate-900 font-mono">{state.patients.length}</strong>
                          </div>
                          <div className="p-3 bg-slate-50 border rounded-xl space-y-1">
                            <span className="text-slate-500 block">Consultations</span>
                            <strong className="text-base text-slate-900 font-mono">{state.consultations.length}</strong>
                          </div>
                          <div className="p-3 bg-slate-50 border rounded-xl space-y-1">
                            <span className="text-slate-500 block">Factures Émises</span>
                            <strong className="text-base text-slate-900 font-mono">{state.invoices.length}</strong>
                          </div>
                          <div className="p-3 bg-slate-50 border rounded-xl space-y-1">
                            <span className="text-slate-500 block">Articles Catalogue</span>
                            <strong className="text-base text-slate-900 font-mono">{state.articles.length}</strong>
                          </div>
                          <div className="p-3 bg-slate-50 border rounded-xl space-y-1">
                            <span className="text-slate-500 block">Ventes Caisse</span>
                            <strong className="text-base text-slate-900 font-mono">{state.ventes?.length || 0}</strong>
                          </div>
                          <div className="p-3 bg-slate-50 border rounded-xl space-y-1">
                            <span className="text-slate-500 block">Lignes d'Audit</span>
                            <strong className="text-base text-slate-900 font-mono">{state.auditLogs.length}</strong>
                          </div>
                        </div>

                        <div className="pt-2 border-t text-xs text-slate-600 space-y-2">
                          <div className="flex justify-between py-1">
                            <span>Taille estimée en mémoire LocalStorage :</span>
                            <strong className="font-mono text-slate-900">{Math.round(JSON.stringify(state).length / 1024)} Ko</strong>
                          </div>
                          <div className="flex justify-between py-1">
                            <span>Moteur de persistence actif :</span>
                            <strong className="text-emerald-700">HTML5 Web Storage (LocalStorage)</strong>
                          </div>
                        </div>
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
