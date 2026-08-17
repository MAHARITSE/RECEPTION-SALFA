import React, { useState, useEffect, useRef } from 'react';
import type { User, Patient, Notification as NotifType } from '../types';
import {
  Hospital, LogOut, Bell, UserCircle, Stethoscope,
  CreditCard, Pill, FlaskConical, Building2, X,
  ChevronRight, MessageCircle, FileText, CheckCircle2, AlertTriangle, Info,
  Sun, Moon
} from 'lucide-react';
import { useDarkMode } from './ThemeToggle';

interface MiseEnPageProps {
  user: User;
  patients?: Patient[];
  notifications: NotifType[];
  onLogout: () => void;
  onMarkRead: (id: string) => void;
  onNotificationAction?: (id: string, accepted: boolean) => void;
  onOpenMessaging: () => void;
  onOpenMedicalRecord?: (patientId?: string) => void;
  unreadMessages: number;
  /** Ouvre la mise en page en mode « pleine fenêtre » (hauteur = 100vh, pas de scroll de page) : utilisé par la console d'administration. */
  fullHeight?: boolean;
  children: React.ReactNode;
}

const roleLabels: Record<string, string> = {
  receptionist: 'Réceptionniste',
  doctor: 'Médecin',
  cashier: 'Caisse',
  pharmacy: 'Pharmacie',
  magasinier: 'Magasinier',
  laboratory: 'Laboratoire',
  billing: 'Responsable facturation',
  admin: 'Administrateur',
};

const roleIcons: Record<string, React.ReactNode> = {
  receptionist: <UserCircle className="w-5 h-5" />,
  doctor: <Stethoscope className="w-5 h-5" />,
  cashier: <CreditCard className="w-5 h-5" />,
  pharmacy: <Pill className="w-5 h-5" />,
  magasinier: <Building2 className="w-5 h-5" />,
  laboratory: <FlaskConical className="w-5 h-5" />,
  billing: <Building2 className="w-5 h-5" />,
  admin: <UserCircle className="w-5 h-5" />,
};

const roleBg: Record<string, string> = {
  receptionist: 'bg-blue-600',
  doctor: 'bg-emerald-600',
  cashier: 'bg-amber-600',
  pharmacy: 'bg-purple-600',
  magasinier: 'bg-orange-600',
  laboratory: 'bg-cyan-600',
  billing: 'bg-indigo-600',
  admin: 'bg-slate-700',
};

export default function MiseEnPage({ user, patients = [], notifications, onLogout, onMarkRead, onNotificationAction, onOpenMessaging, onOpenMedicalRecord, unreadMessages, fullHeight = false, children }: MiseEnPageProps) {
  const [showNotif, setShowNotif] = useState(false);
  const [activeToast, setActiveToast] = useState<NotifType | null>(null);

  const myNotifs = notifications.filter(
    (n) => (user.role === 'pharmacy' || user.role === 'magasinier' || user.role === 'cashier') &&
           (n.targetRole === user.role || n.targetUserId === user.id)
  );
  const unreadCount = myNotifs.filter((n) => !n.read).length;

  const prevCountRef = useRef(myNotifs.length);
  useEffect(() => {
    if (myNotifs.length > prevCountRef.current) {
      const newest = myNotifs[0];
      if (newest && !newest.read) {
        setActiveToast(newest);
        const t = setTimeout(() => setActiveToast(null), 6000);
        return () => clearTimeout(t);
      }
    }
    prevCountRef.current = myNotifs.length;
  }, [myNotifs]);

  return (
    <div className={`w-full bg-slate-50 relative ${fullHeight ? 'h-screen flex flex-col overflow-hidden' : 'min-h-screen overflow-auto'}`}>
      {/* Toast Popup Notification - Centré et colorisé */}
      {activeToast && (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center p-4">
          <div className={`pointer-events-auto max-w-md w-full p-4 sm:p-5 rounded-2xl shadow-2xl border flex items-start gap-3.5 transition-all animate-in fade-in zoom-in-95 backdrop-blur-md ${
            activeToast.type === 'critical'
              ? 'bg-gradient-to-r from-rose-600 via-red-600 to-pink-600 border-rose-300 text-white shadow-rose-500/40'
              : activeToast.type === 'warning'
              ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 border-amber-200 text-white shadow-amber-500/40'
              : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 border-indigo-300 text-white shadow-indigo-500/40'
          }`}>
            <div className="p-2 bg-white/20 backdrop-blur rounded-xl shrink-0 mt-0.5">
              {activeToast.type === 'critical' ? (
                <AlertTriangle className="w-6 h-6 text-white" />
              ) : activeToast.type === 'warning' ? (
                <AlertTriangle className="w-6 h-6 text-white" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-white/80 uppercase tracking-wider">
                Notification Système
              </div>
              <div className="text-sm font-semibold text-white mt-0.5 leading-snug">
                {activeToast.message}
                {activeToast.action?.type === 'pharmacy-unblock' && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { onNotificationAction?.(activeToast.id, true); setActiveToast(null); }} className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold cursor-pointer">Oui, débloquer</button>
                    <button onClick={() => { onNotificationAction?.(activeToast.id, false); setActiveToast(null); }} className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold cursor-pointer">Non</button>
                  </div>
                )}
              </div>
              <div className="text-[10px] text-white/70 mt-1">
                {new Date(activeToast.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
            <button
              onClick={() => {
                onMarkRead(activeToast.id);
                setActiveToast(null);
              }}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/20 cursor-pointer transition"
              title="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`${roleBg[user.role]} text-white shadow-lg`}>
        <div className="w-full max-w-none px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <Hospital className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">MediCare HIS</h1>
              <div className="text-white/70 text-xs flex items-center gap-1">
                {roleIcons[user.role]}
                <span>{roleLabels[user.role]}</span>
                <ChevronRight className="w-3 h-3" />
                <span>{user.name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Notifications — réservées à la Pharmacie et au Magasinier (alertes stock & approvisionnements) */}
            {(user.role === 'pharmacy' || user.role === 'magasinier' || user.role === 'cashier') && (
              <div className="relative">
                <button
                  onClick={() => setShowNotif(!showNotif)}
                  className="relative p-2 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
                  title="Notifications stock"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {showNotif && (
                  <div className="absolute right-0 top-12 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-96 overflow-y-auto">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-800">Notifications Stock</h3>
                      <button onClick={() => setShowNotif(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {myNotifs.length === 0 ? (
                      <div className="p-6 text-center text-slate-400">Aucune notification</div>
                    ) : (
                      myNotifs.slice(0, 20).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => onMarkRead(n.id)}
                          className={`p-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors ${
                            !n.read ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div
                              className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                n.type === 'critical' ? 'bg-red-500' : n.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                              }`}
                            />
                            <div>
                              <p className="text-sm text-slate-700">{n.message}</p>
                              <p className="text-xs text-slate-400 mt-1">
                                {new Date(n.timestamp).toLocaleString('fr-FR')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {onOpenMedicalRecord && (
              <button
                onClick={() => onOpenMedicalRecord()}
                className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 backdrop-blur rounded-lg transition font-medium cursor-pointer"
                title="Dossiers médicaux"
              >
                <FileText className="w-4 h-4" /> Dossiers
              </button>
            )}
            {/* Messagerie */}
            <button
              onClick={onOpenMessaging}
              className="relative p-2 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              title="Messagerie"
            >
              <MessageCircle className="w-5 h-5" />
              {unreadMessages > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </button>

            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      {/* Tous les modules utilisent désormais toute la largeur disponible
          de la fenêtre, comme le Module Réception.
          En mode `fullHeight` (console d'administration), le contenu occupe
          toute la hauteur de la fenêtre et scrolle en interne (pas de scroll de page). */}
      <main className={`w-full max-w-none min-w-0 px-4 sm:px-6 ${fullHeight ? 'flex-1 min-h-0 py-4 flex flex-col' : 'py-6 pb-20'}`}>
        {children}
      </main>
    </div>
  );
}
