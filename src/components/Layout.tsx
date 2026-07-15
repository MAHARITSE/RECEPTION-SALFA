import React, { useState } from 'react';
import type { User, Notification as NotifType } from '../types';
import {
  Hospital, LogOut, Bell, UserCircle, Stethoscope,
  CreditCard, Pill, FlaskConical, Building2, X,
  ChevronRight, MessageCircle
} from 'lucide-react';

interface LayoutProps {
  user: User;
  notifications: NotifType[];
  onLogout: () => void;
  onMarkRead: (id: string) => void;
  onOpenMessaging: () => void;
  unreadMessages: number;
  children: React.ReactNode;
}

const roleLabels: Record<string, string> = {
  receptionist: 'Réceptionniste',
  doctor: 'Médecin',
  cashier: 'Caisse',
  pharmacy: 'Pharmacie',
  magasinier: 'Magasinier',
  laboratory: 'Laboratoire',
  hospitalization: 'Hospitalisation',
  admin: 'Administrateur',
};

const roleIcons: Record<string, React.ReactNode> = {
  receptionist: <UserCircle className="w-5 h-5" />,
  doctor: <Stethoscope className="w-5 h-5" />,
  cashier: <CreditCard className="w-5 h-5" />,
  pharmacy: <Pill className="w-5 h-5" />,
  magasinier: <Building2 className="w-5 h-5" />,
  laboratory: <FlaskConical className="w-5 h-5" />,
  hospitalization: <Building2 className="w-5 h-5" />,
  admin: <UserCircle className="w-5 h-5" />,
};

const roleBg: Record<string, string> = {
  receptionist: 'bg-blue-600',
  doctor: 'bg-emerald-600',
  cashier: 'bg-amber-600',
  pharmacy: 'bg-purple-600',
  magasinier: 'bg-orange-600',
  laboratory: 'bg-cyan-600',
  hospitalization: 'bg-rose-600',
  admin: 'bg-slate-700',
};

export default function Layout({ user, notifications, onLogout, onMarkRead, onOpenMessaging, unreadMessages, children }: LayoutProps) {
  const [showNotif, setShowNotif] = useState(false);

  const myNotifs = notifications.filter(
    (n) => n.targetRole === user.role || n.targetUserId === user.id
  );
  const unreadCount = myNotifs.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-slate-50 overflow-auto">
      {/* Header */}
      <header className={`${roleBg[user.role]} text-white shadow-lg`}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
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

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotif(!showNotif)}
                className="relative p-2 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
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
                    <h3 className="font-semibold text-slate-800">Notifications</h3>
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

      {/* Content */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 pb-20">
        {children}
      </main>
    </div>
  );
}
