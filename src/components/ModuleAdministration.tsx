import { useState } from 'react';
import type { UserRole, TicketSettings, User } from '../types';
import { formatAr, addAuditLog, familyManagesStock, createInitialState, prepareLoadedState } from '../store';
import { normaliserRecherche } from '../utils/recherche';
import { IS_WAMP_BUILD, setWampPassword } from '../wamp';
import { credentialAutofillOptOut, passwordInputOptOut } from '../utils/credentialAutofill';
import { exporterSauvegardeSql } from '../utils/sauvegarde';
import { telechargerFichier } from '../utils/exportFichier';
import { hashPassword } from '../utils/motDePasse';
import type { AppState } from '../store';
import { saveStateToBrowser } from '../browserDb';
import localSeedData from '../data/localData.json';
import ModuleReception from './ModuleReception';
import ModuleMedecin from './ModuleMedecin';
import ModuleCaisse from './ModuleCaisse';
import ModulePharmacie from './ModulePharmacie';
import ModuleMagasinier from './ModuleMagasinier';
import ModuleLaboratoire from './ModuleLaboratoire';
import ModuleSuiviAssurance from '../modules/assurance/ModuleSuiviAssurance';
import ModuleDossierMedical from './ModuleDossierMedical';
import TableEtablissements from './TableEtablissements';
import EnTeteFactureEditor from './EnTeteFactureEditor';
import {
  Trash2, Plus, X, Check,
  Eye, Settings as SettingsIcon, Users, Building2,
  Receipt, FileText, Shield, Database, Printer,
  CreditCard, Search, RefreshCw, Copy, Activity,
  Key, Edit2, Hospital, Stethoscope, Pill, Package, FlaskConical,
  Menu, LayoutDashboard, AlertTriangle, ArrowRight, HardDrive, FileSpreadsheet, Lock, Unlock, CheckCircle2,
  Landmark, Download, FileJson, Table, ChevronLeft, ChevronRight, FolderOpen
} from 'lucide-react';
import { Select } from './Select';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

type Tab = 'dashboard' | 'etablissements' | 'tickets' | 'invoiceHeader' | 'users' | 'audit' | 'system';
type AppModuleKey = 'reception' | 'doctor' | 'medicalRecords' | 'cashier' | 'pharmacy' | 'magasinier' | 'laboratory' | 'billing';

const roleLabels: Record<string, string> = {
  doctor: 'Médecin',
  cashier: 'Caisse',
  pharmacy: 'Pharmacie',
  magasinier: 'Magasinier',
  laboratory: 'Laboratoire',
  billing: 'Responsable Facturation',
  admin: 'Admin'
};

const ALL_ROLES: UserRole[] = ['doctor', 'cashier', 'pharmacy', 'magasinier', 'laboratory', 'billing', 'admin'];

const TABS: { key: Tab; label: string; icon: any; desc: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, desc: 'Vue d\'ensemble & supervision générale' },
  { key: 'etablissements', label: 'Société / Hôpital', icon: Landmark, desc: 'Identification, coordonnées, agrément, logo et en-tête des documents' },
  { key: 'tickets', label: 'Tickets POS & Format', icon: Printer, desc: 'Format 58/80mm, options & aperçu direct' },
  { key: 'invoiceHeader', label: 'En-tête Facture', icon: FileText, desc: 'En-tête des factures A4/A5 (texte & images) — hors tickets POS' },
  { key: 'users', label: 'Personnel & Accès', icon: Users, desc: 'Comptes utilisateurs, rôles & sécurisation' },
  { key: 'audit', label: 'Journal d\'audit', icon: Shield, desc: 'Traçabilité complète des événements' },
  { key: 'system', label: 'Diagnostics Système', icon: HardDrive, desc: 'Santé du stockage et volume de la base de données' },
];

const APP_MODULES: { key: AppModuleKey; label: string; icon: any; desc: string }[] = [
  { key: 'reception', label: 'Réception & Accueil', icon: Hospital, desc: 'Enregistrement des patients & constantes' },
  { key: 'doctor', label: 'Consultations Médicales', icon: Stethoscope, desc: 'Examens, prescriptions & diagnostics' },
  { key: 'medicalRecords', label: 'Dossiers Médicaux', icon: FileText, desc: 'Historique, ordonnances & examens' },
  { key: 'cashier', label: 'Caisse & Règlements', icon: CreditCard, desc: 'Encaissement des actes & hospitalisations' },
  { key: 'pharmacy', label: 'Pharmacie & Dispensation', icon: Pill, desc: 'Vente directe & délivrance des ordonnances' },
  { key: 'magasinier', label: 'Gestion des Stocks', icon: Package, desc: 'Stock central, entrées, achats & transferts' },
  { key: 'laboratory', label: 'Analyses Laboratoire', icon: FlaskConical, desc: 'Prélèvements, paillasse & compte-rendu' },
  { key: 'billing', label: 'Facturation', icon: Building2, desc: 'Factures, prescriptions, règlements et rapports' },
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
    roles?: UserRole[];
    password?: string;
  };
}

interface ResetPasswordModalState {
  isOpen: boolean;
  user: User | null;
  newPassword: string;
  showPassword: boolean;
}

export default function ModuleAdministration({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [activeModule, setActiveModule] = useState<AppModuleKey | null>(null);
  const [adminMedicalPatientId, setAdminMedicalPatientId] = useState<string | null>(null);

  // Search & Filters
  const [searchUser, setSearchUser] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');

  const [searchAudit, setSearchAudit] = useState('');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<string>('all');

  // Aperçu Ticket
  const [showPreview, setShowPreview] = useState(false);

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
    user: { id: '', name: '', role: 'doctor', roles: ['doctor'], password: '' },
  });

  const [resetPasswordModal, setResetPasswordModal] = useState<ResetPasswordModalState>({
    isOpen: false,
    user: null,
    newPassword: '',
    showPassword: true,
  });

  // Local Data Explorer State
  const [selectedTable, setSelectedTable] = useState<string>('patients');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tablePage, setTablePage] = useState<number>(0);
  const [inspectedRecord, setInspectedRecord] = useState<{ table: string; data: any } | null>(null);
  const [recordCopied, setRecordCopied] = useState<boolean>(false);

  const handleResetToLocalData = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Recharger localData.json ?',
      message: 'Voulez-vous réinitialiser l\'application avec les données du fichier localData.json ? Les modifications non enregistrées seront remplacées.',
      variant: 'warning',
      onConfirm: () => {
        try {
          const loaded = prepareLoadedState(localSeedData as any);
          setState(loaded);
          saveStateToBrowser(loaded);
          showToast('Données réinitialisées avec succès depuis localData.json');
        } catch (e: any) {
          showToast('Erreur lors du chargement : ' + (e?.message || 'Inconnue'));
        }
      },
    });
  };

  const handleDownloadLocalData = () => {
    try {
      const blob = new Blob([JSON.stringify(localSeedData, null, 2)], { type: 'application/json' });
      telechargerFichier(blob, `localData_${new Date().toISOString().split('T')[0]}.json`);
      showToast('Fichier localData.json téléchargé');
    } catch {
      showToast('Erreur lors du téléchargement');
    }
  };

  const handleDownloadCurrentState = () => {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      telechargerFichier(blob, `salfa_etat_actuel_${new Date().toISOString().split('T')[0]}.json`);
      showToast('État actuel exporté en JSON');
    } catch {
      showToast('Erreur lors de l\'exportation');
    }
  };

  // ============ TICKETS & SOCIETE CONFIG ============
  const updateTicket = (patch: Partial<TicketSettings>) => {
    setState((prev) => {
      const next = { ...prev, ticketSettings: { ...prev.ticketSettings, ...patch } };
      addAuditLog(next, 'CONFIG_ETABLISSEMENT', JSON.stringify(patch).slice(0, 150));
      return next;
    });
    showToast('Paramètres de l\'établissement mis à jour');
  };

  // ============ USERS MANAGEMENT ============
  const openAddUserModal = () => {
    setUserModal({
      isOpen: true,
      mode: 'add',
      user: { id: '', name: '', role: 'doctor', roles: ['doctor'], password: 'pass' + Math.floor(100 + Math.random() * 900) },
    });
  };

  const openEditUserModal = (user: User) => {
    setUserModal({
      isOpen: true,
      mode: 'edit',
      user: { id: user.id, name: user.name, role: user.role, roles: user.roles || [user.role], password: '' },
    });
  };

  /**
   * Pousse un mot de passe vers MySQL (WAMP, admin uniquement : bcrypt serveur).
   * À la CRÉATION d'un compte, la synchronisation de la ligne peut ne pas avoir
   * encore eu lieu → on réessaie quelques secondes en cas de « compte introuvable ».
   */
  const pushWampPassword = async (id: string, clear: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await setWampPassword(id, clear);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Mot de passe non enregistré';
        if (!/introuvable/.test(msg) || attempt === 5) {
          showToast(`⚠️ ${msg}`);
          return false;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    return false;
  };

  const saveUserModal = async () => {
    const { mode, user } = userModal;
    const cleanId = user.id.trim().toUpperCase();
    const cleanName = user.name.trim();

    if (!cleanId || !cleanName) {
      showToast('⚠️ L\'identifiant ID et le nom sont obligatoires');
      return;
    }

    if (!user.roles || user.roles.length === 0) {
      showToast('⚠️ Veuillez sélectionner au moins un rôle');
      return;
    }

    if (mode === 'add') {
      if (state.users.some(u => u.id.toLowerCase() === cleanId.toLowerCase())) {
        showToast('⚠️ Cet identifiant ID existe déjà');
        return;
      }
      const clearPwd = user.password?.trim() || 'pass123';
      const newU: User = {
        id: cleanId,
        name: cleanName,
        role: user.roles[0],
        roles: user.roles,
        // Navigateur : haché dès la saisie. WAMP : AUCUN mot de passe en mémoire
        // (le serveur bcrypt via action=password ; les lectures sont expurgées).
        ...(!IS_WAMP_BUILD ? { password: await hashPassword(clearPwd) } : {}),
      };
      setState((prev) => {
        const next = { ...prev, users: [...prev.users, newU] };
        addAuditLog(next, 'AJOUT_UTILISATEUR', `${newU.name} (${newU.id}) — ${roleLabels[newU.role]}`);
        return next;
      });
      if (IS_WAMP_BUILD) await pushWampPassword(cleanId, clearPwd);
      showToast(`✅ Utilisateur ${cleanId} créé avec succès`);
    } else {
      // Edit mode — champ vide = inchangé. WAMP : le mot de passe part vers
      // action=password (jamais stocké en mémoire) ; navigateur : haché ici.
      const clearEdit = user.password?.trim() || '';
      const hashedEdit = !IS_WAMP_BUILD && clearEdit ? await hashPassword(clearEdit) : undefined;
      setState((prev) => {
        const next = {
          ...prev,
          users: prev.users.map((u) => {
            if (u.id === cleanId) {
              return {
                ...u,
                name: cleanName,
                role: user.roles![0],
                roles: user.roles,
                ...(hashedEdit ? { password: hashedEdit } : {}),
              };
            }
            return u;
          }),
        };
        addAuditLog(next, 'MODIFICATION_UTILISATEUR', `${cleanName} (${cleanId}) — ${roleLabels[user.roles![0]]}`);
        return next;
      });
      if (IS_WAMP_BUILD && clearEdit) await pushWampPassword(cleanId, clearEdit);
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

  const saveResetPassword = async () => {
    const { user, newPassword } = resetPasswordModal;
    if (!user || !newPassword.trim()) return;
    const clear = newPassword.trim();
    if (IS_WAMP_BUILD) {
      // Le compte existe déjà : pas d'attente de synchronisation, une tentative suffit.
      try {
        await setWampPassword(user.id, clear);
      } catch (e) {
        showToast(`⚠️ ${e instanceof Error ? e.message : 'Mot de passe non modifié'}`);
        return;
      }
      setState((prev) => {
        const next = { ...prev };
        addAuditLog(next, 'RESET_PASSWORD', `${user.name} (${user.id})`);
        return next;
      });
    } else {
      const hashedReset = await hashPassword(clear);
      setState((prev) => {
        const next = {
          ...prev,
          users: prev.users.map((u) => (u.id === user.id ? { ...u, password: hashedReset } : u)),
        };
        addAuditLog(next, 'RESET_PASSWORD', `${user.name} (${user.id})`);
        return next;
      });
    }
    showToast(`✅ Mot de passe mis à jour pour ${user.id}`);
    setResetPasswordModal((rpm) => ({ ...rpm, isOpen: false }));
  };

  // ============ SAUVEGARDE SQL (tableau de bord — sauvegarde uniquement) ============
  const exportSqlBackup = () => {
    // Fichier .sql au format du schéma MySQL : réimportable dans reception_salfa
    // (mysql < fichier.sql ou phpMyAdmin). Volume trop lourd pour l'onglet ->
    // le message renvoyé oriente vers outils/sauvegarder.bat (mysqldump).
    const res = exporterSauvegardeSql(state);
    if (!res.ok) {
      showToast(`⚠️ ${res.message || 'Export de sauvegarde SQL impossible.'}`);
      return;
    }
    setState((prev) => {
      const next = {
        ...prev,
        lastBackupAt: new Date().toISOString(),
        lastBackupBy: prev.currentUser?.id || 'ADM001',
      };
      addAuditLog(next, 'EXPORT_BACKUP_SQL', res.message);
      return next;
    });
    showToast(`✅ Sauvegarde SQL : ${res.message}`);
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

    // Le « BOM » \uFEFF est conservé : Excel sans lui ouvre un CSV en ANSI et
    // casse les accents malgaches et les noms propres.
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const resultat = telechargerFichier(csvContent, `journal_audit_${new Date().toISOString().slice(0, 10)}.csv`, { mime: 'text/csv;charset=utf-8' });
    // Un `data:` URL en haut d'onglet est bloqué par Chrome : le fichier partait
    // dans le vide sans message. Blob + <a download> est le seul chemin fiable.
    if (resultat.ok) showToast(`✅ ${resultat.message}`);
  };



  // Stats calculation
  const todayInvoices = state.invoices.filter(i => i.status === 'paid' && new Date(i.paidAt || '').toDateString() === new Date().toDateString());
  // Recettes = espèces réellement encaissées : les factures validées en CRÉDIT
  // SOCIÉTÉ ne rapportent rien à la caisse (seul leur ticket modérateur éventuel,
  // porté par une facture d'espèces distincte, est encaissé).
  const totalRevenue = todayInvoices.reduce((s, i) => s + (i.creditSociete ? 0 : i.patientCharge), 0);

  const lowStockArticles = state.articles.filter((a) => {
    if (!familyManagesStock(a.family, state.familles)) return false; // famille non gérée en stock
    const isCentralLow = !a.alertDisabledCentral && a.stockCentral <= a.minStockCentral;
    const isPharmacieLow = !a.alertDisabledPharmacie && a.stockPharmacie <= a.minStockPharmacie;
    return isCentralLow || isPharmacieLow;
  });

  // Filtering
  const filteredUsers = state.users.filter((u) => {
    const q = normaliserRecherche(searchUser);
    const matchesSearch = q === '' || normaliserRecherche(u.name).includes(q) ||
      normaliserRecherche(u.id).includes(q) ||
      normaliserRecherche(roleLabels[u.role] ?? '').includes(q);
    const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredAuditLogs = state.auditLogs.filter((log) => {
    const q = normaliserRecherche(searchAudit);
    const matchesSearch = q === '' || normaliserRecherche(log.userName).includes(q) ||
      normaliserRecherche(log.action).includes(q) ||
      normaliserRecherche(log.details).includes(q);
    
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
      <div className="bg-surface border-2 border-line-strong rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto max-w-lg w-full">
        <div className="flex justify-between items-center mb-4 pb-3 border-b">
          <span className="font-bold text-base flex items-center gap-2 text-ink-strong">
            <Receipt className="w-5 h-5 text-blue-600 dark:text-cyan-400" /> Aperçu du Ticket POS {w}mm
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimer test
            </button>
            <button onClick={() => setShowPreview(false)} className="text-ink-faint hover:text-ink cursor-pointer p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div
          className="theme-paper mx-auto font-mono shadow-lg border border-line rounded-lg p-4"
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
        return <ModuleSuiviAssurance state={state} setState={setState} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center p-4">
          <div className="pointer-events-auto bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white border border-emerald-300/40 dark:border-emerald-500/16 px-6 py-4 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 font-semibold text-sm flex items-center gap-3">
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
          <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-line">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${
                confirmModal.variant === 'danger' ? 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400' : confirmModal.variant === 'warning' ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-blue-100 dark:bg-cyan-500/15 text-blue-600 dark:text-cyan-400'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-ink-strong text-lg">{confirmModal.title}</h3>
            </div>
            <p className="text-sm text-ink-secondary leading-relaxed">{confirmModal.message}</p>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setConfirmModal((cm) => ({ ...cm, isOpen: false }))}
                className="px-4 py-2 bg-surface-hover hover:bg-surface-active text-ink rounded-xl text-xs font-semibold cursor-pointer"
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
          <div className="bg-surface rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-line">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-ink-strong text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                {userModal.mode === 'add' ? 'Créer un nouveau compte utilisateur' : `Modifier le compte ${userModal.user.id}`}
              </h3>
              <button onClick={() => setUserModal({ ...userModal, isOpen: false })} className="text-ink-faint hover:text-ink cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-ink block mb-1">Identifiant ID *</label>
                <input
                  type="text"
                  {...credentialAutofillOptOut}
                  disabled={userModal.mode === 'edit'}
                  value={userModal.user.id}
                  onChange={(e) => setUserModal({ ...userModal, user: { ...userModal.user, id: e.target.value } })}
                  className="w-full px-3 py-2 border rounded-xl text-sm font-mono uppercase bg-surface-muted disabled:bg-surface-hover outline-none"
                  placeholder="Ex: DOC004, CAI002"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">Nom complet du collaborateur *</label>
                <input
                  type="text"
                  value={userModal.user.name}
                  onChange={(e) => setUserModal({ ...userModal, user: { ...userModal.user, name: e.target.value } })}
                  className="w-full px-3 py-2 border rounded-xl text-sm outline-none"
                  placeholder="Ex: Dr. RAKOTO Jean"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">Rôles et permissions (Cocher un ou plusieurs) *</label>
                <div className="grid grid-cols-2 gap-2 border rounded-xl p-3 bg-surface-muted max-h-48 overflow-y-auto">
                  {ALL_ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surface-hover p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={userModal.user.roles?.includes(r) || false}
                        onChange={(e) => {
                          const currentRoles = userModal.user.roles || [];
                          let newRoles;
                          if (e.target.checked) {
                            newRoles = [...currentRoles, r];
                          } else {
                            newRoles = currentRoles.filter(role => role !== r);
                          }
                          setUserModal({ ...userModal, user: { ...userModal.user, roles: newRoles, role: newRoles.length > 0 ? newRoles[0] : userModal.user.role } });
                        }}
                        className="w-4 h-4 text-blue-600 dark:text-cyan-400 rounded cursor-pointer accent-blue-600"
                      />
                      <span className="text-ink select-none">{roleLabels[r]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  {userModal.mode === 'add' ? 'Mot de passe initial *' : 'Nouveau mot de passe (laisser vide pour ne pas modifier)'}
                </label>
                <input
                  type="text"
                  name="user-secret-val"
                  {...passwordInputOptOut}
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
                className="px-4 py-2 bg-surface-hover text-ink rounded-xl text-xs font-semibold hover:bg-surface-active cursor-pointer"
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
          <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-line">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-ink-strong text-lg flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-600 dark:text-cyan-400" /> Réinitialiser le mot de passe
              </h3>
              <button onClick={() => setResetPasswordModal((rpm) => ({ ...rpm, isOpen: false }))} className="text-ink-faint hover:text-ink cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-surface-muted p-3 rounded-xl border text-xs text-ink space-y-1">
                <div>Collaborateur : <strong className="text-ink-strong">{resetPasswordModal.user?.name}</strong></div>
                <div>Identifiant ID : <strong className="font-mono text-blue-700 dark:text-cyan-400">{resetPasswordModal.user?.id}</strong></div>
                <div>Rôle : <strong className="text-ink-strong">{roleLabels[resetPasswordModal.user?.role || '']}</strong></div>
              </div>

              <div>
                <label htmlFor="admin-reset-password" className="text-xs font-bold text-ink block mb-1">Nouveau mot de passe :</label>
                <div className="relative">
                  <input
                    id="admin-reset-password"
                    name="token-reset-field"
                    {...passwordInputOptOut}
                    type={resetPasswordModal.showPassword ? 'text' : 'password'}
                    value={resetPasswordModal.newPassword}
                    onChange={(e) => setResetPasswordModal({ ...resetPasswordModal, newPassword: e.target.value })}
                    className="w-full pl-3 pr-10 py-2 border rounded-xl text-sm font-mono outline-none"
                  />
                  <button
                    type="button"
                    aria-label={resetPasswordModal.showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    onClick={() => setResetPasswordModal({ ...resetPasswordModal, showPassword: !resetPasswordModal.showPassword })}
                    className="absolute right-3 top-2.5 text-ink-faint hover:text-ink cursor-pointer"
                  >
                    {resetPasswordModal.showPassword ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setResetPasswordModal({ ...resetPasswordModal, newPassword: 'pass' + Math.floor(100 + Math.random() * 900) })}
                className="text-xs text-blue-600 dark:text-cyan-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Générer un mot de passe aléatoire
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                onClick={() => setResetPasswordModal((rpm) => ({ ...rpm, isOpen: false }))}
                className="px-4 py-2 bg-surface-hover text-ink rounded-xl text-xs font-semibold hover:bg-surface-active cursor-pointer"
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

      {/* Main Admin Workspace Card — occupe toute la fenêtre (hauteur restante) */}
      <div className="flex min-h-0 flex-1 bg-surface rounded-2xl shadow-sm border border-line overflow-hidden">
          {/* Main Content Area */}
          <section className="flex min-w-0 flex-1 flex-col bg-surface-muted/70">
             {/* Top Navigation Bar with Tabs & Modules */}
            <div className="bg-surface text-ink px-4 py-2.5 border-b border-line flex items-center justify-between gap-4 overflow-x-auto shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-accent font-mono font-bold px-2 whitespace-nowrap">Admin :</span>
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const active = !activeModule && tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => { setActiveModule(null); setTab(t.key); }}
                      title={t.desc}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition ${
                        active ? 'bg-accent-soft text-accent-strong border border-accent-line shadow-sm' : 'text-ink-muted border border-transparent hover:bg-surface-hover hover:text-ink-strong'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {activeModule && (
              <div className="px-5 py-3 border-b bg-surface flex items-center justify-between gap-3 shadow-xs">
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400">Mode Supervision Administrateur</div>
                  <h3 className="font-bold text-ink-strong text-base">{APP_MODULES.find((m) => m.key === activeModule)?.label}</h3>
                </div>
                <button
                  onClick={() => setActiveModule(null)}
                  className="px-3 py-1.5 bg-surface-hover hover:bg-surface-active text-ink rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" /> Retour au panneau admin
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {activeModule ? renderActiveModule() : (
                <>
                  {/* ===== TAB 1: DASHBOARD ===== */}
                  {tab === 'dashboard' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-3">
                        <div>
                          <h3 className="font-bold text-ink-strong text-xl flex items-center gap-2.5">
                            <Activity className="w-6 h-6 text-emerald-600 dark:text-emerald-400" /> Tableau de bord & Supervision Système
                          </h3>
                          <p className="text-xs text-ink-muted mt-0.5">Vue globale de l'activité médicale, des ventes et des paramètres d'infrastructure.</p>
                        </div>
                        <div className="text-xs bg-surface border border-line px-3.5 py-2 rounded-xl text-ink font-mono shadow-xs flex items-center gap-2">
                          <Hospital className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Établissement : <strong className="text-ink-strong">{state.ticketSettings.facilityName}</strong></span>
                        </div>
                      </div>

                      {/* Stock Alert Warning Banner if any */}
                      {lowStockArticles.length > 0 && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-500/8 border border-amber-200 dark:border-amber-500/25 rounded-2xl flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 dark:bg-amber-500/15 rounded-xl text-amber-700 dark:text-amber-400 shrink-0">
                              <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-bold text-amber-900 dark:text-amber-300 text-sm">Alertes Stock : {lowStockArticles.length} article(s) en seuil critique ou rupture</div>
                              <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Des articles requièrent un réapprovisionnement au dépôt central ou en pharmacie.</div>
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
                        <div className="p-4 bg-surface border border-line rounded-2xl shadow-xs space-y-1">
                          <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                            <span>Recettes du jour</span>
                            <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="text-2xl font-bold text-ink-strong font-mono">{formatAr(totalRevenue)}</div>
                          <div className="text-xs text-ink-muted font-medium">{todayInvoices.length} facture(s) réglée(s) aujourd'hui</div>
                        </div>

                        <div className="p-4 bg-surface border border-line rounded-2xl shadow-xs space-y-1">
                          <div className="text-xs text-blue-700 dark:text-cyan-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                            <span>Personnel & Comptes</span>
                            <Users className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                          </div>
                          <div className="text-2xl font-bold text-ink-strong font-mono">{state.users.length}</div>
                          <div className="text-xs text-ink-muted font-medium">{ALL_ROLES.length} rôles opérationnels définis</div>
                        </div>

                        <div className="p-4 bg-surface border border-line rounded-2xl shadow-xs space-y-1">
                          <div className="text-xs text-purple-700 dark:text-purple-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                            <span>Dossiers Patients</span>
                            <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div className="text-2xl font-bold text-ink-strong font-mono">{state.patients.length}</div>
                          <div className="text-xs text-ink-muted font-medium">{state.consultations.length} consultation(s) enregistrée(s)</div>
                        </div>

                        <div className="p-4 bg-surface border border-line rounded-2xl shadow-xs space-y-1">
                          <div className="text-xs text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                            <span>Impression POS</span>
                            <Printer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="text-2xl font-bold text-ink-strong font-mono">{state.ticketSettings.paperWidth} mm</div>
                          <div className="text-xs text-ink-muted font-medium">Impression {state.ticketSettings.autoPrint ? 'Automatique' : 'Manuelle'}</div>
                        </div>
                      </div>

                      {/* Quick Actions Toolbar */}
                      <div className="bg-surface p-5 border border-line rounded-2xl shadow-xs space-y-3">
                        <h4 className="font-bold text-ink-strong text-sm flex items-center gap-2">
                          <SettingsIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Raccourcis Administrateur Rapides
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                          <button
                            onClick={openAddUserModal}
                            className="p-3 bg-surface-muted hover:bg-emerald-50 dark:hover:bg-emerald-500/8 hover:border-emerald-300 dark:hover:border-emerald-500/40 border rounded-xl text-xs font-semibold text-ink hover:text-emerald-800 dark:hover:text-emerald-300 transition flex flex-col items-center gap-2 cursor-pointer text-center"
                          >
                            <Plus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            <span>Nouveau Compte</span>
                          </button>
                          <button
                            onClick={() => selectAppModule('billing')}
                            className="p-3 bg-surface-muted hover:bg-accent-soft border rounded-xl text-xs font-semibold text-ink transition flex flex-col items-center gap-2 cursor-pointer text-center"
                          >
                            <Shield className="w-5 h-5 text-accent" />
                            <span>Facturation</span>
                          </button>
                          <button
                            onClick={exportSqlBackup}
                            title="Télécharge un fichier .sql réimportable dans la base reception_salfa (mysql < fichier.sql ou outils\restaurer.bat). Les mots de passe en clair n'y figurent jamais."
                            className="p-3 bg-surface-muted hover:bg-blue-50 dark:hover:bg-cyan-500/8 hover:border-blue-300 dark:hover:border-cyan-500/40 border rounded-xl text-xs font-semibold text-ink hover:text-blue-800 dark:hover:text-cyan-300 transition flex flex-col items-center gap-2 cursor-pointer text-center"
                          >
                            <Database className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                            <span>Sauvegarde SQL<br /><span className="text-[10px] font-normal opacity-70">fichier .sql à télécharger</span></span>
                          </button>
                          <button
                            onClick={() => setShowPreview(true)}
                            className="p-3 bg-surface-muted hover:bg-purple-50 dark:hover:bg-purple-500/8 hover:border-purple-300 dark:hover:border-purple-500/40 border rounded-xl text-xs font-semibold text-ink hover:text-purple-800 dark:hover:text-purple-300 transition flex flex-col items-center gap-2 cursor-pointer text-center"
                          >
                            <Printer className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            <span>Tester Ticket POS</span>
                          </button>
                          <button
                            onClick={() => selectAdminTab('audit')}
                            className="p-3 bg-surface-muted hover:bg-cyan-50 dark:hover:bg-cyan-500/8 hover:border-cyan-300 dark:hover:border-cyan-500/40 border rounded-xl text-xs font-semibold text-ink hover:text-cyan-800 dark:hover:text-cyan-300 transition flex flex-col items-center gap-2 cursor-pointer text-center"
                          >
                            <Shield className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                            <span>Journal d'Audit</span>
                          </button>
                        </div>
                      </div>

                      {/* Two Column Section: Configuration Summary + Audit feed */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="p-5 border border-line rounded-2xl bg-surface space-y-3 shadow-xs">
                          <h4 className="font-bold text-sm text-ink-strong flex items-center justify-between border-b pb-2">
                            <span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Configuration de l'établissement</span>
                            <button onClick={() => selectAdminTab('etablissements')} className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer">Modifier</button>
                          </h4>
                          <ul className="text-xs space-y-2 text-ink-secondary">
                            <li className="flex justify-between border-b border-line-soft pb-1.5">
                              <span className="text-ink-muted">Nom établissement :</span>
                              <strong className="text-ink-strong">{state.ticketSettings.facilityName}</strong>
                            </li>
                            <li className="flex justify-between border-b border-line-soft pb-1.5">
                              <span className="text-ink-muted">Adresse :</span>
                              <span className="text-ink-strong font-medium">{state.ticketSettings.address || 'Non spécifiée'}</span>
                            </li>
                            <li className="flex justify-between border-b border-line-soft pb-1.5">
                              <span className="text-ink-muted">Téléphone :</span>
                              <span className="text-ink-strong font-medium">{state.ticketSettings.phone || 'Non spécifié'}</span>
                            </li>
                            <li className="flex justify-between border-b border-line-soft pb-1.5">
                              <span className="text-ink-muted">NIF / STAT :</span>
                              <span className="text-ink-strong font-mono font-medium">{state.ticketSettings.nif || 'Non renseigné'}</span>
                            </li>
                            <li className="flex justify-between border-b border-line-soft pb-1.5">
                              <span className="text-ink-muted">Préfixe factures :</span>
                              <strong className="text-emerald-700 dark:text-emerald-400 font-mono">{state.ticketSettings.invoicePrefix}</strong>
                            </li>
                            <li className="flex justify-between">
                              <span className="text-ink-muted">Devise facturation :</span>
                              <strong className="text-ink-strong font-mono">{state.ticketSettings.currency}</strong>
                            </li>
                          </ul>
                        </div>

                        <div className="p-5 border border-line rounded-2xl bg-surface space-y-3 shadow-xs">
                          <h4 className="font-bold text-sm text-ink-strong flex items-center justify-between border-b pb-2">
                            <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-blue-600 dark:text-cyan-400" /> Activités récentes (Audit)</span>
                            <button onClick={() => selectAdminTab('audit')} className="text-xs text-blue-600 dark:text-cyan-400 font-semibold hover:underline cursor-pointer">Tout voir ({state.auditLogs.length})</button>
                          </h4>
                          <ul className="text-xs space-y-2 text-ink-secondary">
                            {state.auditLogs.slice(0, 5).map((log) => (
                              <li key={log.id} className="border-b border-line-soft pb-1.5 space-y-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-ink-strong">{log.userName} <span className="text-ink-faint font-normal">({log.userRole})</span></span>
                                  <span className="text-[10px] text-ink-faint font-mono">{new Date(log.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-cyan-500/15 text-blue-800 dark:text-cyan-300 rounded text-[10px] font-mono font-bold">{log.action}</span>
                                  <span className="truncate text-ink-secondary">{log.details}</span>
                                </div>
                              </li>
                            ))}
                            {state.auditLogs.length === 0 && <li className="text-ink-faint italic py-2">Aucune action enregistrée pour le moment.</li>}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ===== TAB 2: SOCIETE & ETABLISSEMENT ===== */}
                  {/* ===== TAB 2: IDENTIFICATION SOCIÉTÉ / HÔPITAL ===== */}
                  {tab === 'etablissements' && (
                    <TableEtablissements state={state} setState={setState} showToast={showToast} />
                  )}

                  {/* ===== TAB 3: TICKETS POS ===== */}
                  {tab === 'tickets' && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-start flex-wrap gap-3">
                        <div>
                          <h3 className="font-bold text-ink-strong text-xl flex items-center gap-2.5">
                            <Printer className="w-6 h-6 text-blue-600 dark:text-cyan-400" /> Configuration Impression & Format Reçus POS
                          </h3>
                          <p className="text-xs text-ink-muted mt-0.5">Personnalisation des tickets thermiques (58mm / 80mm), impression directe Kiosk et options de mise en page.</p>
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

                      <div className="rounded-2xl border-2 p-5 bg-gradient-to-r from-blue-50/70 dark:from-cyan-950/42 to-indigo-50/70 dark:to-indigo-950/42 border-blue-200 dark:border-cyan-500/25 space-y-4">
                        <h4 className="font-bold text-ink-strong flex items-center gap-2 text-sm">
                          <Receipt className="w-5 h-5 text-blue-600 dark:text-cyan-400" /> Largeur du papier papier thermique
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button
                            onClick={() => updateTicket({ paperWidth: 58 })}
                            className={`p-5 border-2 rounded-2xl cursor-pointer text-center transition ${
                              state.ticketSettings.paperWidth === 58 ? 'border-blue-600 bg-surface shadow-md ring-2 ring-blue-400' : 'border-line-strong hover:border-blue-400 bg-surface/70'
                            }`}
                          >
                            <div className="text-3xl font-extrabold text-ink-strong">58 mm</div>
                            <div className="text-xs text-ink-secondary mt-1.5 font-medium">Imprimante compacte / mobile Bluetooth & POS</div>
                          </button>
                          <button
                            onClick={() => updateTicket({ paperWidth: 80 })}
                            className={`p-5 border-2 rounded-2xl cursor-pointer text-center transition ${
                              state.ticketSettings.paperWidth === 80 ? 'border-blue-600 bg-surface shadow-md ring-2 ring-blue-400' : 'border-line-strong hover:border-blue-400 bg-surface/70'
                            }`}
                          >
                            <div className="text-3xl font-extrabold text-ink-strong">80 mm</div>
                            <div className="text-xs text-ink-secondary mt-1.5 font-medium">Imprimante thermique standard caisse POS</div>
                          </button>
                        </div>

                        <div className="space-y-3 pt-2">
                          <label className="text-xs font-bold text-ink flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={state.ticketSettings.autoPrint}
                              onChange={e => updateTicket({ autoPrint: e.target.checked })}
                              className="w-4 h-4 rounded text-blue-600 dark:text-cyan-400 cursor-pointer"
                            />
                            <span>Lancer l'impression automatique dès la validation des règlements à la caisse</span>
                          </label>
                        </div>
                      </div>

                      {/* Devise & Messages */}
                      <div className="rounded-2xl border border-line p-5 bg-surface space-y-4 shadow-xs">
                        <h4 className="font-bold text-ink-strong flex items-center gap-2 text-sm">
                          <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Devise & Messages du Ticket
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-ink block mb-1">Devise monétaire principale</label>
                            <Select
                              value={state.ticketSettings.currency}
                              onChange={e => updateTicket({ currency: e.target.value as any })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm bg-surface cursor-pointer outline-none"
                            >
                              <option value="Ar">Ariary Malagasy (Ar)</option>
                              <option value="€">Euro (€)</option>
                              <option value="$">Dollar ($)</option>
                              <option value="Fc">Franc Congolais (Fc)</option>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-ink block mb-1">Titre principal du reçu</label>
                            <input
                              value={state.ticketSettings.receiptTitle}
                              onChange={e => updateTicket({ receiptTitle: e.target.value })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm text-ink-strong outline-none"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs font-bold text-ink block mb-1">Message de remerciement en bas de reçu</label>
                            <input
                              value={state.ticketSettings.footerMessage}
                              onChange={e => updateTicket({ footerMessage: e.target.value })}
                              className="w-full px-3.5 py-2 border rounded-xl text-sm text-ink-strong outline-none"
                              placeholder="Merci de votre confiance et prompt rétablissement !"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ===== TAB 3-bis: EN-TÊTE DES FACTURES (A4/A5) ===== */}
                  {tab === 'invoiceHeader' && (
                    <EnTeteFactureEditor
                      settings={state.ticketSettings}
                      updateTicket={updateTicket}
                      showToast={showToast}
                    />
                  )}

                  {/* ===== TAB 4: USERS & ACCESS ===== */}
                  {tab === 'users' && (
                    <div className="space-y-5">
                      <div className="flex justify-between items-center flex-wrap gap-3">
                        <div>
                          <h3 className="font-bold text-ink-strong text-xl flex items-center gap-2.5">
                            <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" /> Gestion du Personnel & Comptes d'Accès
                          </h3>
                          <p className="text-xs text-ink-muted mt-0.5">Comptes personnels des agents, attribution des rôles et réinitialisation des mots de passe.</p>
                        </div>
                        <button
                          onClick={openAddUserModal}
                          className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 cursor-pointer text-xs font-bold shadow-md"
                        >
                          <Plus className="w-4 h-4" /> Nouveau compte utilisateur
                        </button>
                      </div>

                      {/* Filter Bar */}
                      <div className="bg-surface p-3.5 border border-line rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
                        <div className="relative flex-1 min-w-[240px] max-w-md">
                          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-ink-faint" />
                          <input
                            type="text"
                            value={searchUser}
                            onChange={(e) => setSearchUser(e.target.value)}
                            className="w-full pl-9 pr-3.5 py-1.5 border rounded-xl text-xs outline-none"
                            placeholder="Rechercher par nom, ID ou rôle..."
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-ink-muted mr-1">Rôle :</span>
                          <button
                            onClick={() => setUserRoleFilter('all')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                              userRoleFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-surface-hover text-ink-secondary hover:bg-surface-active'
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
                                  userRoleFilter === r ? 'bg-emerald-600 text-white' : 'bg-surface-hover text-ink-secondary hover:bg-surface-active'
                                }`}
                              >
                                {roleLabels[r]} ({count})
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Users Table */}
                      <div className="border border-line rounded-2xl overflow-hidden bg-surface shadow-xs">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-surface-muted border-b text-ink-secondary font-bold">
                            <tr>
                              <th className="p-3.5">ID Utilisateur</th>
                              <th className="p-3.5">Nom du collaborateur</th>
                              <th className="p-3.5 text-center">Rôle attribué</th>
                              <th className="p-3.5 text-center">Mot de passe</th>
                              <th className="p-3.5 text-right">Actions de supervision</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y border-line-soft">
                            {filteredUsers.map((u) => (
                              <tr key={u.id} className="hover:bg-surface-muted/80 transition">
                                <td className="p-3.5 font-mono font-bold text-ink-strong">{u.id}</td>
                                <td className="p-3.5 font-bold text-ink-strong">{u.name}</td>
                                <td className="p-3.5 text-center">
                                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                    u.role === 'admin' ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300'
                                      : u.role === 'doctor' ? 'bg-blue-100 dark:bg-cyan-500/15 text-blue-800 dark:text-cyan-300'
                                      : u.role === 'magasinier' ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                      : u.role === 'billing' ? 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300'
                                      : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                                  }`}>
                                    {roleLabels[u.role] || u.role}
                                  </span>
                                </td>
                                <td className="p-3.5 text-center font-mono text-ink-faint">••••••••</td>
                                <td className="p-3.5 text-right space-x-1.5">
                                  <button
                                    onClick={() => openEditUserModal(u)}
                                    className="px-2.5 py-1 text-xs bg-surface-hover text-ink hover:bg-surface-active rounded-lg cursor-pointer font-semibold inline-flex items-center gap-1"
                                    title="Modifier le compte"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" /> Modifier
                                  </button>
                                  <button
                                    onClick={() => openResetPasswordModal(u)}
                                    className="px-2.5 py-1 text-xs bg-blue-50 dark:bg-cyan-500/8 text-blue-700 dark:text-cyan-400 hover:bg-blue-100 dark:hover:bg-cyan-500/15 rounded-lg cursor-pointer font-semibold inline-flex items-center gap-1"
                                    title="Réinitialiser le mot de passe"
                                  >
                                    <Key className="w-3.5 h-3.5" /> MDP
                                  </button>
                                  <button
                                    onClick={() => deleteUser(u.id, u.name)}
                                    disabled={u.id === 'ADM001'}
                                    className="p-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/8 rounded-lg disabled:opacity-30 cursor-pointer inline-flex"
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {filteredUsers.length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-8 text-center text-ink-faint italic">
                                  Aucun utilisateur ne correspond à vos critères de recherche.
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
                          <h3 className="font-bold text-ink-strong text-xl flex items-center gap-2.5">
                            <Shield className="w-6 h-6 text-blue-600 dark:text-cyan-400" /> Journal d'Audit & Historique de Sécurité ({state.auditLogs.length})
                          </h3>
                          <p className="text-xs text-ink-muted mt-0.5">Traçabilité et journal de sécurité de toutes les opérations effectuées dans le système.</p>
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
                      <div className="bg-surface p-3.5 border border-line rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
                        <div className="relative flex-1 min-w-[240px] max-w-md">
                          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-ink-faint" />
                          <input
                            type="text"
                            value={searchAudit}
                            onChange={(e) => setSearchAudit(e.target.value)}
                            className="w-full pl-9 pr-3.5 py-1.5 border rounded-xl text-xs outline-none"
                            placeholder="Rechercher par opérateur, action ou détails..."
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-ink-muted">Catégorie :</span>
                          <button
                            onClick={() => setAuditCategoryFilter('all')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              auditCategoryFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-surface-hover text-ink-secondary'
                            }`}
                          >
                            Toutes
                          </button>
                          <button
                            onClick={() => setAuditCategoryFilter('users')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              auditCategoryFilter === 'users' ? 'bg-blue-600 text-white' : 'bg-surface-hover text-ink-secondary'
                            }`}
                          >
                            Utilisateurs
                          </button>
                          <button
                            onClick={() => setAuditCategoryFilter('config')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              auditCategoryFilter === 'config' ? 'bg-blue-600 text-white' : 'bg-surface-hover text-ink-secondary'
                            }`}
                          >
                            Config & Établissement
                          </button>
                          <button
                            onClick={() => setAuditCategoryFilter('backup')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              auditCategoryFilter === 'backup' ? 'bg-blue-600 text-white' : 'bg-surface-hover text-ink-secondary'
                            }`}
                          >
                            Sauvegarde / Reset
                          </button>
                        </div>
                      </div>

                      {/* Audit Table */}
                      <div className="border border-line rounded-2xl overflow-hidden bg-surface shadow-xs max-h-[550px] overflow-y-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-surface-muted border-b sticky top-0 text-ink-secondary font-bold">
                            <tr>
                              <th className="p-3.5">Horodatage</th>
                              <th className="p-3.5">Opérateur</th>
                              <th className="p-3.5">Action</th>
                              <th className="p-3.5">Détails de l'opération</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y border-line-soft">
                            {filteredAuditLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-surface-muted/80 transition">
                                <td className="p-3.5 font-mono text-ink-muted whitespace-nowrap">
                                  {new Date(log.timestamp).toLocaleString('fr-FR')}
                                </td>
                                <td className="p-3.5 font-bold text-ink-strong whitespace-nowrap">
                                  {log.userName} <span className="text-ink-faint font-normal">({log.userRole})</span>
                                </td>
                                <td className="p-3.5 whitespace-nowrap">
                                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-cyan-500/15 text-blue-800 dark:text-cyan-300 rounded font-mono text-[10px] font-bold">
                                    {log.action}
                                  </span>
                                </td>
                                <td className="p-3.5 text-ink">{log.details}</td>
                              </tr>
                            ))}
                            {filteredAuditLogs.length === 0 && (
                              <tr>
                                <td colSpan={4} className="p-8 text-center text-ink-faint italic">
                                  Aucun événement enregistré dans le journal.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ===== TAB 7: SYSTEM DIAGNOSTICS & LOCALDATA.JSON EXPLORER ===== */}
                  {tab === 'system' && (() => {
                    const SYSTEM_TABLES: { key: string; label: string; count: number; desc: string }[] = [
                      { key: 'patients', label: 'Patients', count: state.patients?.length || 0, desc: 'Dossiers patients' },
                      { key: 'consultations', label: 'Consultations', count: state.consultations?.length || 0, desc: 'Consultations médicales' },
                      { key: 'ventes', label: 'Ventes Caisse', count: state.ventes?.length || 0, desc: 'Factures de caisse' },
                      { key: 'venteLines', label: 'Lignes de Vente', count: state.venteLines?.length || 0, desc: 'Actes et articles vendus' },
                      { key: 'ventePayments', label: 'Règlements', count: state.ventePayments?.length || 0, desc: 'Paiements caisse' },
                      { key: 'invoices', label: 'Factures Globales', count: state.invoices?.length || 0, desc: 'Factures prestations' },
                      { key: 'articles', label: 'Articles & Stocks', count: state.articles?.length || 0, desc: 'Médicaments & catalogue' },
                      { key: 'cashClosings', label: 'Clôtures Caisse', count: state.cashClosings?.length || 0, desc: 'Arrêtés journaliers' },
                      { key: 'labCatalog', label: 'Analyses Labo', count: state.labCatalog?.length || 0, desc: 'Catalogue examens' },
                      { key: 'labRequests', label: 'Demandes Labo', count: state.labRequests?.length || 0, desc: 'Prescriptions labo' },
                      { key: 'users', label: 'Utilisateurs', count: state.users?.length || 0, desc: 'Comptes d\'accès' },
                      { key: 'companies', label: 'Sociétés & Assurances', count: state.companies?.length || 0, desc: 'Conventions' },
                      { key: 'familles', label: 'Familles Articles', count: state.familles?.length || 0, desc: 'Catégories' },
                      { key: 'auditLogs', label: 'Journal d\'Audit', count: state.auditLogs?.length || 0, desc: 'Traçabilité' },
                    ];

                    const currentTableRows: any[] = (() => {
                      switch (selectedTable) {
                        case 'patients': return state.patients || [];
                        case 'consultations': return state.consultations || [];
                        case 'ventes': return state.ventes || [];
                        case 'venteLines': return state.venteLines || [];
                        case 'ventePayments': return state.ventePayments || [];
                        case 'invoices': return state.invoices || [];
                        case 'articles': return state.articles || [];
                        case 'cashClosings': return state.cashClosings || [];
                        case 'labCatalog': return state.labCatalog || [];
                        case 'labRequests': return state.labRequests || [];
                        case 'users': return state.users || [];
                        case 'companies': return state.companies || [];
                        case 'familles': return state.familles || [];
                        case 'auditLogs': return state.auditLogs || [];
                        default: return [];
                      }
                    })();

                    const searchFilter = normaliserRecherche(tableSearch.trim());
                    const filteredTableRows = searchFilter
                      ? currentTableRows.filter((r) => normaliserRecherche(JSON.stringify(r)).includes(searchFilter))
                      : currentTableRows;

                    const PAGE_LIMIT = 12;
                    const maxPages = Math.ceil(filteredTableRows.length / PAGE_LIMIT) || 1;
                    const currentPage = Math.min(tablePage, maxPages - 1);
                    const pagedRows = filteredTableRows.slice(currentPage * PAGE_LIMIT, (currentPage + 1) * PAGE_LIMIT);

                    return (
                      <div className="space-y-6">
                        {/* En-tête et actions sur src/data/localData.json */}
                        <div className="p-5 border border-line rounded-2xl bg-surface space-y-4 shadow-xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <Database className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                                <h3 className="font-bold text-ink-strong text-lg">
                                  Base de Référence : <code className="text-blue-700 dark:text-cyan-300 font-mono text-base">src/data/localData.json</code>
                                </h3>
                              </div>
                              <p className="text-xs text-ink-muted mt-1">
                                Fichier source embarqué contenant les données de test initiales (~4.78 Mo, 23 collections relationnelles).
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={handleResetToLocalData}
                                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer transition"
                                title="Réinitialiser l'état de l'application à partir du fichier localData.json"
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> Recharger localData.json
                              </button>
                              <button
                                type="button"
                                onClick={handleDownloadLocalData}
                                className="px-3 py-2 bg-surface border border-line hover:border-blue-500 text-ink rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                                title="Télécharger le fichier localData.json original"
                              >
                                <Download className="w-3.5 h-3.5" /> Télécharger localData.json
                              </button>
                              <button
                                type="button"
                                onClick={handleDownloadCurrentState}
                                className="px-3 py-2 bg-surface border border-line hover:border-emerald-500 text-ink rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                                title="Télécharger l'état complet actuel en JSON"
                              >
                                <FileJson className="w-3.5 h-3.5" /> Exporter état actuel
                              </button>
                            </div>
                          </div>

                          {/* Métriques globales */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
                            <div className="p-2.5 bg-surface-muted border border-line rounded-xl">
                              <span className="text-ink-muted block text-[11px]">Patients</span>
                              <strong className="text-sm font-mono text-ink-strong">{state.patients.length}</strong>
                            </div>
                            <div className="p-2.5 bg-surface-muted border border-line rounded-xl">
                              <span className="text-ink-muted block text-[11px]">Consultations</span>
                              <strong className="text-sm font-mono text-ink-strong">{state.consultations.length}</strong>
                            </div>
                            <div className="p-2.5 bg-surface-muted border border-line rounded-xl">
                              <span className="text-ink-muted block text-[11px]">Factures</span>
                              <strong className="text-sm font-mono text-ink-strong">{state.invoices.length}</strong>
                            </div>
                            <div className="p-2.5 bg-surface-muted border border-line rounded-xl">
                              <span className="text-ink-muted block text-[11px]">Ventes Caisse</span>
                              <strong className="text-sm font-mono text-ink-strong">{state.ventes?.length || 0}</strong>
                            </div>
                            <div className="p-2.5 bg-surface-muted border border-line rounded-xl">
                              <span className="text-ink-muted block text-[11px]">Lignes Ventes</span>
                              <strong className="text-sm font-mono text-ink-strong">{state.venteLines?.length || 0}</strong>
                            </div>
                            <div className="p-2.5 bg-surface-muted border border-line rounded-xl">
                              <span className="text-ink-muted block text-[11px]">Articles / Stocks</span>
                              <strong className="text-sm font-mono text-ink-strong">{state.articles.length}</strong>
                            </div>
                            <div className="p-2.5 bg-surface-muted border border-line rounded-xl">
                              <span className="text-ink-muted block text-[11px]">Utilisateurs</span>
                              <strong className="text-sm font-mono text-ink-strong">{state.users.length}</strong>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-ink-secondary pt-1">
                            <span>Moteur de persistence actif : <strong className="text-emerald-700 dark:text-emerald-400">IndexedDB & localStorage</strong></span>
                            <span>Taille estimée en mémoire : <strong className="font-mono text-ink-strong">{Math.round(JSON.stringify(state).length / 1024)} Ko</strong></span>
                          </div>
                        </div>

                        {/* Explorateur de tables */}
                        <div className="p-5 border border-line rounded-2xl bg-surface space-y-4 shadow-xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <h4 className="font-bold text-ink-strong text-base flex items-center gap-2">
                                <Table className="w-4 h-4 text-accent" /> Explorateur des Collections de Données
                              </h4>
                              <p className="text-xs text-ink-muted mt-0.5">
                                Inspectez les enregistrements ligne par ligne et visualisez le JSON brut correspondant.
                              </p>
                            </div>

                            <div className="relative w-full sm:w-64">
                              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                              <input
                                type="text"
                                value={tableSearch}
                                onChange={(e) => { setTableSearch(e.target.value); setTablePage(0); }}
                                placeholder="Rechercher dans cette table…"
                                className="w-full pl-8 pr-7 py-1.5 bg-surface-muted border border-line rounded-lg text-xs text-ink focus:outline-none focus:border-accent"
                              />
                              {tableSearch && (
                                <button
                                  type="button"
                                  onClick={() => { setTableSearch(''); setTablePage(0); }}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Sélecteur de collection sous forme d'onglets défilants */}
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                            {SYSTEM_TABLES.map((t) => {
                              const active = selectedTable === t.key;
                              return (
                                <button
                                  key={t.key}
                                  type="button"
                                  onClick={() => { setSelectedTable(t.key); setTablePage(0); setTableSearch(''); }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                                    active
                                      ? 'bg-accent text-white shadow-xs'
                                      : 'bg-surface-muted hover:bg-surface-hover text-ink border border-line'
                                  }`}
                                >
                                  <span>{t.label}</span>
                                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${active ? 'bg-white/20 text-white' : 'bg-line text-ink-muted'}`}>
                                    {t.count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Tableau des enregistrements */}
                          <div className="border border-line rounded-xl overflow-x-auto bg-surface">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-surface-muted border-b border-line text-ink-muted font-semibold">
                                  <th className="p-2.5 w-14">#</th>
                                  <th className="p-2.5 w-28">Identifiant</th>
                                  <th className="p-2.5">Aperçu des Données</th>
                                  <th className="p-2.5 w-28 text-right">JSON</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                {pagedRows.length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="p-6 text-center text-ink-muted">
                                      Aucun enregistrement trouvé {tableSearch ? 'pour cette recherche' : ''}.
                                    </td>
                                  </tr>
                                ) : (
                                  pagedRows.map((row, idx) => {
                                    const rowId = row.id || row.code || row.matricule || `item-${currentPage * PAGE_LIMIT + idx + 1}`;
                                    // Aperçu texte synthétique selon le type d'objet
                                    const preview = (() => {
                                      if (selectedTable === 'patients') {
                                        return `${row.nom || ''} ${row.prenom || ''} • Sexe : ${row.sexe || 'N/A'} • Âge : ${row.age || 'N/A'} ans • Tél : ${row.telephone || 'N/A'} • Type : ${row.typeClient || 'Standard'} ${row.societe ? `(${row.societe})` : ''}`;
                                      }
                                      if (selectedTable === 'consultations') {
                                        return `Date : ${row.date || 'N/A'} • Médecin : ${row.medecinNom || 'N/A'} • Patient : ${row.patientId || 'N/A'} • Motif : ${row.motif || 'N/A'}`;
                                      }
                                      if (selectedTable === 'ventes') {
                                        return `Date : ${row.date || 'N/A'} • Client : ${row.clientNom || 'Anonyme'} • Type : ${row.typeClient || 'comptant'} • Net : ${formatAr(row.totalNet || row.montantNet || 0)} • Statut : ${row.statut || 'N/A'}`;
                                      }
                                      if (selectedTable === 'venteLines') {
                                        return `Article : ${row.designation || row.articleNom || row.codeArticle || 'N/A'} • Qté : ${row.quantite || 1} • Prix Unit : ${formatAr(row.prixUnitaire || 0)} • Total : ${formatAr(row.total || 0)}`;
                                      }
                                      if (selectedTable === 'ventePayments') {
                                        return `Date : ${row.date || 'N/A'} • Mode : ${row.mode || row.methode || 'N/A'} • Montant : ${formatAr(row.montant || 0)} • Reçu : ${row.reference || 'N/A'}`;
                                      }
                                      if (selectedTable === 'invoices') {
                                        return `Facture n° ${row.numero || row.id || 'N/A'} • Patient : ${row.patientNom || 'N/A'} • Total : ${formatAr(row.montantTotal || row.total || 0)} • Reste : ${formatAr(row.resteAPayer || 0)}`;
                                      }
                                      if (selectedTable === 'articles') {
                                        return `${row.nom || row.designation || 'N/A'} • Famille : ${row.famille || 'N/A'} • Stock Pharma : ${row.stock || row.stockPharma || 0} • Prix : ${formatAr(row.prixVente || row.prix || 0)}`;
                                      }
                                      if (selectedTable === 'users') {
                                        return `Nom : ${row.name || 'N/A'} • Rôle : ${roleLabels[row.role] || row.role} • Statut : ${row.active !== false ? 'Actif' : 'Inactif'}`;
                                      }
                                      if (selectedTable === 'auditLogs') {
                                        return `[${row.timestamp || 'N/A'}] ${row.operator || 'Système'} (${row.role || 'admin'}) : ${row.action} — ${row.details || ''}`;
                                      }
                                      // Fallback : aperçu JSON court
                                      const keys = Object.keys(row).slice(0, 4);
                                      return keys.map((k) => `${k}: ${String(row[k])}`).join(' • ');
                                    })();

                                    return (
                                      <tr key={rowId + idx} className="hover:bg-surface-hover transition">
                                        <td className="p-2.5 font-mono text-ink-faint text-[11px]">
                                          {currentPage * PAGE_LIMIT + idx + 1}
                                        </td>
                                        <td className="p-2.5 font-mono font-bold text-ink-strong">
                                          {rowId}
                                        </td>
                                        <td className="p-2.5 text-ink-secondary truncate max-w-md">
                                          {preview}
                                        </td>
                                        <td className="p-2.5 text-right">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setInspectedRecord({ table: selectedTable, data: row });
                                              setRecordCopied(false);
                                            }}
                                            className="px-2.5 py-1 bg-surface-muted hover:bg-surface-hover border border-line rounded-lg text-xs font-mono font-semibold text-blue-700 dark:text-cyan-300 inline-flex items-center gap-1 cursor-pointer transition"
                                          >
                                            <FileJson className="w-3.5 h-3.5" /> JSON
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* Pagination */}
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-muted pt-1">
                            <span>
                              {filteredTableRows.length} élément{filteredTableRows.length > 1 ? 's' : ''} au total • Page {currentPage + 1} sur {maxPages}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={currentPage === 0}
                                onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                                className="px-3 py-1 bg-surface border border-line rounded-lg hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" /> Précédent
                              </button>
                              <span className="px-2.5 py-1 font-mono font-bold text-ink">
                                {currentPage + 1} / {maxPages}
                              </span>
                              <button
                                type="button"
                                disabled={currentPage >= maxPages - 1}
                                onClick={() => setTablePage((p) => Math.min(maxPages - 1, p + 1))}
                                className="px-3 py-1 bg-surface border border-line rounded-lg hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                              >
                                Suivant <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}


                </>
              )}
            </div>
          </section>
        {/* Modal d'inspection JSON */}
        {inspectedRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setInspectedRecord(null); }}>
            <div className="w-full max-w-2xl bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-4 border-b border-line flex items-center justify-between bg-surface-muted">
                <div className="flex items-center gap-2">
                  <FileJson className="w-5 h-5 text-blue-600" />
                  <h4 className="font-bold text-sm text-ink-strong">
                    Enregistrement <span className="font-mono text-blue-600">[{inspectedRecord.table}]</span>
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(inspectedRecord.data, null, 2));
                      setRecordCopied(true);
                      setTimeout(() => setRecordCopied(false), 2000);
                    }}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface border border-line hover:bg-surface-hover flex items-center gap-1 cursor-pointer"
                  >
                    {recordCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {recordCopied ? 'Copié !' : 'Copier'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectedRecord(null)}
                    className="p-1 rounded-lg text-ink-muted hover:bg-surface hover:text-ink cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-4 overflow-auto flex-1 bg-slate-950 text-slate-100 font-mono text-xs">
                <pre>{JSON.stringify(inspectedRecord.data, null, 2)}</pre>
              </div>
              <div className="p-3 border-t border-line bg-surface flex justify-end">
                <button
                  type="button"
                  onClick={() => setInspectedRecord(null)}
                  className="px-4 py-1.5 bg-surface-muted hover:bg-surface-hover border border-line rounded-xl text-xs font-semibold text-ink cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
