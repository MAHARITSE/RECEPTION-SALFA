import React, { useState } from 'react';
import type { User, Notification as NotifType } from '../types';
import {
  Hospital, LogOut, Bell, UserCircle, Stethoscope,
  CreditCard, Pill, FlaskConical, Building2, X,
  ChevronRight, MessageCircle, FileText, Clock
} from 'lucide-react';

interface MiseEnPageProps {
  user: User;
  notifications: NotifType[];
  onLogout: () => void;
  onMarkRead: (id: string) => void;
  onOpenMessaging: () => void;
  onOpenMedicalRecord?: () => void;
  unreadMessages: number;
  children: React.ReactNode;
}

const roleLabels: Record<string, string> = {
  receptionist: 'Réception',
  doctor: 'Médecin',
  cashier: 'Caisse',
  pharmacy: 'Pharmacie',
  magasinier: 'Magasin',
  laboratory: 'Labo',
  billing: 'Facturation',
  admin: 'Admin',
};

const roleIcons: Record<string, React.ReactNode> = {
  receptionist: <UserCircle className="w-4 h-4" />,
  doctor: <Stethoscope className="w-4 h-4" />,
  cashier: <CreditCard className="w-4 h-4" />,
  pharmacy: <Pill className="w-4 h-4" />,
  magasinier: <Building2 className="w-4 h-4" />,
  laboratory: <FlaskConical className="w-4 h-4" />,
  billing: <FileText className="w-4 h-4" />,
  admin: <UserCircle className="w-4 h-4" />,
};

function nowStr() {
  const d = new Date();
  return d.toLocaleString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MiseEnPage({
  user, notifications, onLogout, onMarkRead,
  onOpenMessaging, onOpenMedicalRecord, unreadMessages, children,
}: MiseEnPageProps) {
  const [showNotif, setShowNotif] = useState(false);
  const [clock, setClock] = useState(nowStr());

  React.useEffect(() => {
    const t = setInterval(() => setClock(nowStr()), 30_000);
    return () => clearInterval(t);
  }, []);

  const myNotifs = notifications.filter(
    (n) => n.targetRole === user.role || n.targetUserId === user.id
  );
  const unreadCount = myNotifs.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-ward)]">
      {/* ============== HEADER type appareil médical ============== */}
      <header className="device-bar">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Plaque laiton du système */}
            <div className="brass-plaque px-3 py-1.5 flex items-center gap-2 rounded-sm">
              <Hospital className="w-5 h-5" strokeWidth={2.25} />
              <span className="text-sm sm:text-base leading-none">Salfa</span>
              <span className="text-[10px] leading-none opacity-80 hidden sm:inline">· HIS</span>
            </div>

            {/* Breadcrumb rôle */}
            <div className="hidden md:flex items-center gap-2 text-[var(--color-ward-2)] text-xs font-mono uppercase tracking-widest">
              <span className="led text-emerald-400" aria-hidden />
              {roleIcons[user.role]}
              <span className="text-emerald-200 font-semibold">{roleLabels[user.role]}</span>
              <ChevronRight className="w-3 h-3 opacity-60" />
              <span className="text-slate-100 truncate max-w-[220px]">{user.name}</span>
              <span className="text-slate-500 hidden lg:inline">· {user.id}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Horloge LED */}
            <div className="led-clock hidden sm:flex items-center gap-2 text-sm">
              <Clock className="w-3.5 h-3.5" />
              <span>{clock}</span>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotif(v => !v)}
                className="relative p-2 rounded-sm text-slate-200 hover:bg-white/10 transition cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-[var(--color-mud)] text-white text-[10px] font-mono font-bold rounded-sm px-1 min-w-[18px] h-[18px] flex items-center justify-center border border-black/40">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotif && (
                <div className="absolute right-0 top-12 w-96 folder rounded-sm z-50 max-h-[70vh] overflow-hidden flex flex-col">
                  <div className="module-hdr !px-4 !py-2">
                    <span className="flex items-center gap-2"><Bell className="w-3.5 h-3.5" />Notifications</span>
                    <button onClick={() => setShowNotif(false)} className="btn-key !py-0.5 !px-1.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="overflow-y-auto">
                    {myNotifs.length === 0 ? (
                      <div className="p-8 text-center text-[var(--color-inksoft)] text-sm italic">
                        Rien à signaler.
                      </div>
                    ) : (
                      myNotifs.slice(0, 30).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => onMarkRead(n.id)}
                          className={`p-3 border-b border-[var(--color-rule-soft)] cursor-pointer hover:bg-[var(--color-paper)] transition ${
                            !n.read ? 'bg-[var(--color-paper)]' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-1.5 w-2 h-2 rounded-sm flex-shrink-0 ${
                                n.type === 'critical'
                                  ? 'bg-[var(--color-stamp-red)]'
                                  : n.type === 'warning'
                                  ? 'bg-[var(--color-mud)]'
                                  : 'bg-[var(--color-cross)]'
                              }`}
                            />
                            <div className="flex-1">
                              <p className="text-sm text-[var(--color-ink)] leading-snug">{n.message}</p>
                              <p className="text-[10px] font-mono text-[var(--color-inksoft)] mt-1">
                                {new Date(n.timestamp).toLocaleString('fr-FR')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {onOpenMedicalRecord && (
              <button
                onClick={onOpenMedicalRecord}
                title="Dossiers médicaux"
                className="btn-bake"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dossiers</span>
              </button>
            )}

            <button
              onClick={onOpenMessaging}
              title="Messagerie"
              className="relative p-2 rounded-sm text-slate-200 hover:bg-white/10 transition cursor-pointer"
            >
              <MessageCircle className="w-5 h-5" />
              {unreadMessages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-[var(--color-stamp-red)] text-white text-[10px] font-mono font-bold rounded-sm px-1 min-w-[18px] h-[18px] flex items-center justify-center border border-black/40">
                  {unreadMessages}
                </span>
              )}
            </button>

            <button
              onClick={onLogout}
              className="btn-bake danger"
              title="Déconnexion"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sortie</span>
            </button>
          </div>
        </div>
      </header>

      {/* ============== CONTENU ============== */}
      <main className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 pb-16 flex-1">
        {children}
      </main>

      {/* ============== PIED type plaque ============== */}
      <footer className="border-t border-black/30 bg-gradient-to-b from-[#232a26] to-[#141917] text-slate-400 text-xs font-mono tracking-wider">
        <div className="max-w-[1600px] mx-auto px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="led text-emerald-400 animate-pulse" />
            <span>SYSTÈME EN LIGNE</span>
            <span className="opacity-50">·</span>
            <span>Ariary (Ar)</span>
          </div>
          <div className="opacity-70">Salfa HIS v3 · impression thermique 80mm</div>
        </div>
      </footer>
    </div>
  );
}
