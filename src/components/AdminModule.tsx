import { useState, useRef } from 'react';
import type { UserRole, TicketSettings } from '../types';
import { formatAr, addAuditLog, migrateLegacyToVentes, createInitialState } from '../store';
import type { AppState } from '../store';
import {
  Save, Trash2, Plus, X, Check, Download, Upload,
  Eye, Settings as SettingsIcon, Users, Building2,
  Receipt, FileText, Shield, Database, Printer, Image as ImageIcon,
  CreditCard, AlertCircle, Search, RefreshCw, Copy, Activity,
  Key, Edit2, Smile
} from 'lucide-react';
import { WINDEV_PROMPT, WEB_PROMPT } from '../data/promptsData';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; }

type Tab = 'dashboard' | 'societe' | 'tickets' | 'users' | 'companies' | 'audit' | 'backup' | 'system' | 'prompts';

const roleLabels: Record<string, string> = {
  doctor: 'Médecin',
  cashier: 'Caisse',
  pharmacy: 'Pharmacie',
  magasinier: 'Magasinier',
  laboratory: 'Laboratoire',
  admin: 'Admin'
};

const ALL_ROLES: UserRole[] = ['doctor', 'cashier', 'pharmacy', 'magasinier', 'laboratory', 'admin'];

const LOGO_EMOJIS = ['🍺', '🍻', '🍷', '🍸', '☕', '🍽️', '🏥', '⚕️', '💊', '🔬', '🏨', '🏢', '🩺', '⭐', '❤️', '🛡️'];

const TABS: { key: Tab; label: string; icon: any; desc: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: Activity, desc: 'Vue d\'ensemble du système' },
  { key: 'societe', label: 'Société & Établissement', icon: Building2, desc: 'Identité, en-tête, NIF, STAT, Logo' },
  { key: 'tickets', label: 'Tickets & Impression', icon: Printer, desc: 'Format 58/80mm, impression directe, aperçu' },
  { key: 'users', label: 'Utilisateurs & Accès', icon: Users, desc: 'Comptes personnels, rôles, mots de passe' },
  { key: 'companies', label: 'Sociétés & Conventions', icon: CreditCard, desc: 'Partenaires conventionnés' },
  { key: 'audit', label: 'Journal d\'audit', icon: Shield, desc: 'Historique de sécurité des actions' },
  { key: 'backup', label: 'Sauvegarde & Restauration', icon: Database, desc: 'Export/Import JSON, réinitialisation' },
  { key: 'system', label: 'Système & Infos', icon: SettingsIcon, desc: 'Paramètres généraux & stockage' },
  { key: 'prompts', label: 'Prompts & Specs', icon: FileText, desc: 'Spécifications techniques WinDev & Web' },
];

export default function AdminModule({ state, setState }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  
  // Utilisateurs
  const [addUser, setAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ id: '', name: '', role: 'doctor' as UserRole, password: '' });
  const [searchUser, setSearchUser] = useState('');

  // Sociétés / Clients conventionnés
  const [addCompany, setAddCompany] = useState(false);
  const [newCompany, setNewCompany] = useState('');

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
    if (!newCompany.trim()) return;
    const name = newCompany.trim().toUpperCase();
    if (state.companies.some(c => c.name === name)) { alert('Cette société existe déjà'); return; }
    setState((prev) => {
      const next = { ...prev, companies: [...prev.companies, { id: `comp-${Date.now()}`, name }] };
      addAuditLog(next, 'AJOUT_SOCIETE_PARTENAIRE', name);
      return next;
    });
    setNewCompany('');
    setAddCompany(false);
    showToast('Société ajoutée');
  };

  const deleteCompany = (id: string) => {
    if (!confirm('Supprimer cette société partenaires ?')) return;
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

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 bg-emerald-700 text-white px-5 py-2.5 rounded-xl shadow-lg z-50 animate-bounce font-medium text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {toast}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Navigation Onglets */}
        <div className="flex border-b overflow-x-auto bg-slate-50">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                title={t.desc}
                className={`px-4 py-3 text-xs font-semibold border-b-2 cursor-pointer whitespace-nowrap flex items-center gap-2 transition ${
                  tab === t.key
                    ? 'border-slate-800 text-slate-900 bg-white shadow-sm'
                    : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
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


// --- DEBUT DES LIGNES D'EXEMPLE ---
// Example line 1: This is a dummy line added for example purposes.
// Example line 2: This is a dummy line added for example purposes.
// Example line 3: This is a dummy line added for example purposes.
// Example line 4: This is a dummy line added for example purposes.
// Example line 5: This is a dummy line added for example purposes.
// Example line 6: This is a dummy line added for example purposes.
// Example line 7: This is a dummy line added for example purposes.
// Example line 8: This is a dummy line added for example purposes.
// Example line 9: This is a dummy line added for example purposes.
// Example line 10: This is a dummy line added for example purposes.
// Example line 11: This is a dummy line added for example purposes.
// Example line 12: This is a dummy line added for example purposes.
// Example line 13: This is a dummy line added for example purposes.
// Example line 14: This is a dummy line added for example purposes.
// Example line 15: This is a dummy line added for example purposes.
// Example line 16: This is a dummy line added for example purposes.
// Example line 17: This is a dummy line added for example purposes.
// Example line 18: This is a dummy line added for example purposes.
// Example line 19: This is a dummy line added for example purposes.
// Example line 20: This is a dummy line added for example purposes.
// Example line 21: This is a dummy line added for example purposes.
// Example line 22: This is a dummy line added for example purposes.
// Example line 23: This is a dummy line added for example purposes.
// Example line 24: This is a dummy line added for example purposes.
// Example line 25: This is a dummy line added for example purposes.
// Example line 26: This is a dummy line added for example purposes.
// Example line 27: This is a dummy line added for example purposes.
// Example line 28: This is a dummy line added for example purposes.
// Example line 29: This is a dummy line added for example purposes.
// Example line 30: This is a dummy line added for example purposes.
// Example line 31: This is a dummy line added for example purposes.
// Example line 32: This is a dummy line added for example purposes.
// Example line 33: This is a dummy line added for example purposes.
// Example line 34: This is a dummy line added for example purposes.
// Example line 35: This is a dummy line added for example purposes.
// Example line 36: This is a dummy line added for example purposes.
// Example line 37: This is a dummy line added for example purposes.
// Example line 38: This is a dummy line added for example purposes.
// Example line 39: This is a dummy line added for example purposes.
// Example line 40: This is a dummy line added for example purposes.
// Example line 41: This is a dummy line added for example purposes.
// Example line 42: This is a dummy line added for example purposes.
// Example line 43: This is a dummy line added for example purposes.
// Example line 44: This is a dummy line added for example purposes.
// Example line 45: This is a dummy line added for example purposes.
// Example line 46: This is a dummy line added for example purposes.
// Example line 47: This is a dummy line added for example purposes.
// Example line 48: This is a dummy line added for example purposes.
// Example line 49: This is a dummy line added for example purposes.
// Example line 50: This is a dummy line added for example purposes.
// Example line 51: This is a dummy line added for example purposes.
// Example line 52: This is a dummy line added for example purposes.
// Example line 53: This is a dummy line added for example purposes.
// Example line 54: This is a dummy line added for example purposes.
// Example line 55: This is a dummy line added for example purposes.
// Example line 56: This is a dummy line added for example purposes.
// Example line 57: This is a dummy line added for example purposes.
// Example line 58: This is a dummy line added for example purposes.
// Example line 59: This is a dummy line added for example purposes.
// Example line 60: This is a dummy line added for example purposes.
// Example line 61: This is a dummy line added for example purposes.
// Example line 62: This is a dummy line added for example purposes.
// Example line 63: This is a dummy line added for example purposes.
// Example line 64: This is a dummy line added for example purposes.
// Example line 65: This is a dummy line added for example purposes.
// Example line 66: This is a dummy line added for example purposes.
// Example line 67: This is a dummy line added for example purposes.
// Example line 68: This is a dummy line added for example purposes.
// Example line 69: This is a dummy line added for example purposes.
// Example line 70: This is a dummy line added for example purposes.
// Example line 71: This is a dummy line added for example purposes.
// Example line 72: This is a dummy line added for example purposes.
// Example line 73: This is a dummy line added for example purposes.
// Example line 74: This is a dummy line added for example purposes.
// Example line 75: This is a dummy line added for example purposes.
// Example line 76: This is a dummy line added for example purposes.
// Example line 77: This is a dummy line added for example purposes.
// Example line 78: This is a dummy line added for example purposes.
// Example line 79: This is a dummy line added for example purposes.
// Example line 80: This is a dummy line added for example purposes.
// Example line 81: This is a dummy line added for example purposes.
// Example line 82: This is a dummy line added for example purposes.
// Example line 83: This is a dummy line added for example purposes.
// Example line 84: This is a dummy line added for example purposes.
// Example line 85: This is a dummy line added for example purposes.
// Example line 86: This is a dummy line added for example purposes.
// Example line 87: This is a dummy line added for example purposes.
// Example line 88: This is a dummy line added for example purposes.
// Example line 89: This is a dummy line added for example purposes.
// Example line 90: This is a dummy line added for example purposes.
// Example line 91: This is a dummy line added for example purposes.
// Example line 92: This is a dummy line added for example purposes.
// Example line 93: This is a dummy line added for example purposes.
// Example line 94: This is a dummy line added for example purposes.
// Example line 95: This is a dummy line added for example purposes.
// Example line 96: This is a dummy line added for example purposes.
// Example line 97: This is a dummy line added for example purposes.
// Example line 98: This is a dummy line added for example purposes.
// Example line 99: This is a dummy line added for example purposes.
// Example line 100: This is a dummy line added for example purposes.

// --- DEBUT DU BLOC D'EXEMPLE ---
// Ligne d'exemple 1 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 2 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 3 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 4 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 5 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 6 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 7 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 8 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 9 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 10 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 11 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 12 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 13 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 14 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 15 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 16 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 17 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 18 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 19 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 20 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 21 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 22 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 23 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 24 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 25 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 26 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 27 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 28 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 29 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 30 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 31 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 32 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 33 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 34 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 35 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 36 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 37 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 38 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 39 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 40 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 41 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 42 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 43 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 44 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 45 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 46 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 47 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 48 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 49 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 50 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 51 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 52 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 53 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 54 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 55 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 56 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 57 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 58 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 59 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 60 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 61 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 62 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 63 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 64 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 65 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 66 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 67 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 68 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 69 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 70 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 71 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 72 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 73 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 74 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 75 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 76 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 77 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 78 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 79 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 80 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 81 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 82 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 83 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 84 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 85 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 86 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 87 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 88 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 89 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 90 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 91 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 92 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 93 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 94 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 95 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 96 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 97 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 98 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 99 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// Ligne d'exemple 100 : Ceci est une ligne de remplissage pour illustrer l'expansion du fichier.
// --- FIN DU BLOC D'EXEMPLE ---

// Example line 101: This is a dummy line added for example purposes.
// Example line 102: This is a dummy line added for example purposes.
// Example line 103: This is a dummy line added for example purposes.
// Example line 104: This is a dummy line added for example purposes.
// Example line 105: This is a dummy line added for example purposes.
// Example line 106: This is a dummy line added for example purposes.
// Example line 107: This is a dummy line added for example purposes.
// Example line 108: This is a dummy line added for example purposes.
// Example line 109: This is a dummy line added for example purposes.
// Example line 110: This is a dummy line added for example purposes.
// Example line 111: This is a dummy line added for example purposes.
// Example line 112: This is a dummy line added for example purposes.
// Example line 113: This is a dummy line added for example purposes.
// Example line 114: This is a dummy line added for example purposes.
// Example line 115: This is a dummy line added for example purposes.
// Example line 116: This is a dummy line added for example purposes.
// Example line 117: This is a dummy line added for example purposes.
// Example line 118: This is a dummy line added for example purposes.
// Example line 119: This is a dummy line added for example purposes.
// Example line 120: This is a dummy line added for example purposes.
// Example line 121: This is a dummy line added for example purposes.
// Example line 122: This is a dummy line added for example purposes.
// Example line 123: This is a dummy line added for example purposes.
// Example line 124: This is a dummy line added for example purposes.
// Example line 125: This is a dummy line added for example purposes.
// Example line 126: This is a dummy line added for example purposes.
// Example line 127: This is a dummy line added for example purposes.
// Example line 128: This is a dummy line added for example purposes.
// Example line 129: This is a dummy line added for example purposes.
// Example line 130: This is a dummy line added for example purposes.
// Example line 131: This is a dummy line added for example purposes.
// Example line 132: This is a dummy line added for example purposes.
// Example line 133: This is a dummy line added for example purposes.
// Example line 134: This is a dummy line added for example purposes.
// Example line 135: This is a dummy line added for example purposes.
// Example line 136: This is a dummy line added for example purposes.
// Example line 137: This is a dummy line added for example purposes.
// Example line 138: This is a dummy line added for example purposes.
// Example line 139: This is a dummy line added for example purposes.
// Example line 140: This is a dummy line added for example purposes.
// Example line 141: This is a dummy line added for example purposes.
// Example line 142: This is a dummy line added for example purposes.
// Example line 143: This is a dummy line added for example purposes.
// Example line 144: This is a dummy line added for example purposes.
// Example line 145: This is a dummy line added for example purposes.
// Example line 146: This is a dummy line added for example purposes.
// Example line 147: This is a dummy line added for example purposes.
// Example line 148: This is a dummy line added for example purposes.
// Example line 149: This is a dummy line added for example purposes.
// Example line 150: This is a dummy line added for example purposes.
// Example line 151: This is a dummy line added for example purposes.
// Example line 152: This is a dummy line added for example purposes.
// Example line 153: This is a dummy line added for example purposes.
// Example line 154: This is a dummy line added for example purposes.
// Example line 155: This is a dummy line added for example purposes.
// Example line 156: This is a dummy line added for example purposes.
// Example line 157: This is a dummy line added for example purposes.
// Example line 158: This is a dummy line added for example purposes.
// Example line 159: This is a dummy line added for example purposes.
// Example line 160: This is a dummy line added for example purposes.
// Example line 161: This is a dummy line added for example purposes.
// Example line 162: This is a dummy line added for example purposes.
// Example line 163: This is a dummy line added for example purposes.
// Example line 164: This is a dummy line added for example purposes.
// Example line 165: This is a dummy line added for example purposes.
// Example line 166: This is a dummy line added for example purposes.
// Example line 167: This is a dummy line added for example purposes.
// Example line 168: This is a dummy line added for example purposes.
// Example line 169: This is a dummy line added for example purposes.
// Example line 170: This is a dummy line added for example purposes.
// Example line 171: This is a dummy line added for example purposes.
// Example line 172: This is a dummy line added for example purposes.
// Example line 173: This is a dummy line added for example purposes.
// Example line 174: This is a dummy line added for example purposes.
// Example line 175: This is a dummy line added for example purposes.
// Example line 176: This is a dummy line added for example purposes.
// Example line 177: This is a dummy line added for example purposes.
// Example line 178: This is a dummy line added for example purposes.
// Example line 179: This is a dummy line added for example purposes.
// Example line 180: This is a dummy line added for example purposes.
// Example line 181: This is a dummy line added for example purposes.
// Example line 182: This is a dummy line added for example purposes.
// Example line 183: This is a dummy line added for example purposes.
// Example line 184: This is a dummy line added for example purposes.
// Example line 185: This is a dummy line added for example purposes.
// Example line 186: This is a dummy line added for example purposes.
// Example line 187: This is a dummy line added for example purposes.
// Example line 188: This is a dummy line added for example purposes.
// Example line 189: This is a dummy line added for example purposes.
// Example line 190: This is a dummy line added for example purposes.
// Example line 191: This is a dummy line added for example purposes.
// Example line 192: This is a dummy line added for example purposes.
// Example line 193: This is a dummy line added for example purposes.
// Example line 194: This is a dummy line added for example purposes.
// Example line 195: This is a dummy line added for example purposes.
// Example line 196: This is a dummy line added for example purposes.
// Example line 197: This is a dummy line added for example purposes.
// Example line 198: This is a dummy line added for example purposes.
// Example line 199: This is a dummy line added for example purposes.
// Example line 200: This is a dummy line added for example purposes.
// --- FIN DES LIGNES D'EXEMPLE ---

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
                <div className="flex gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <input type="text" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} className="flex-1 px-3 py-2 border rounded-lg text-sm uppercase bg-white outline-none" placeholder="Nom de l'entreprise (ex: ORANGE MADAGASCAR)" />
                  <button onClick={saveCompany} className="px-4 py-2 bg-indigo-600 text-white rounded-lg cursor-pointer font-semibold text-xs flex items-center gap-1"><Check className="w-4 h-4" /> Enregistrer</button>
                  <button onClick={() => setAddCompany(false)} className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg cursor-pointer font-semibold text-xs"><X className="w-4 h-4" /></button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {state.companies.map((c) => (
                  <div key={c.id} className="p-3.5 bg-white border rounded-xl flex justify-between items-center shadow-sm hover:border-indigo-300">
                    <div className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-indigo-500" /> {c.name}
                    </div>
                    <button onClick={() => deleteCompany(c.id)} className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
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
        </div>
      </div>
    </div>
  );
}
