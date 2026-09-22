import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Store,
  CreditCard,
  AlertTriangle,
  History,
  Building,
  Users,
  Layers,
  Printer,
  Type,
  Banknote,
} from 'lucide-react';
import { ActiveTab } from '../types';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  /** Nombre de dossiers à traiter dans un onglet (affiché en pastille). */
  badges?: Partial<Record<ActiveTab, number>>;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange, badges }) => {
  const navItems: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    startsGroup?: boolean;
  }[] = [
    { id: 'dashboard', label: "Vue d'ensemble", icon: LayoutDashboard },
    { id: 'prestations', label: 'Facturation', icon: FileText },
    { id: 'comptoir', label: 'Comptoir & Externe', icon: Store },
    { id: 'reliquats', label: 'Bloc & Hospit. — reliquats', icon: Banknote },
    { id: 'paiements', label: 'Règlements', icon: CreditCard },
    { id: 'rejets', label: 'Rejets', icon: AlertTriangle },
    { id: 'historique', label: 'Historique', icon: History },
    { id: 'societes', label: 'Sociétés', icon: Building, startsGroup: true },
    { id: 'familles', label: 'Actes', icon: Layers },
    { id: 'entete', label: 'Entête', icon: Type, startsGroup: true },
  ];

  return (
    <nav
      id="primary-navigation"
      aria-label="Navigation principale"
      className="sticky top-0 z-30 border-b border-line bg-surface"
    >
      <div className="scrollbar-none flex w-full items-center overflow-x-auto px-4 sm:px-6 lg:px-8">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <React.Fragment key={item.id}>
              {item.startsGroup && (
                <span aria-hidden="true" className="mx-2 h-5 w-px shrink-0 bg-surface-active lg:mx-3" />
              )}
              <button
                id={`nav-tab-${item.id}`}
                onClick={() => onTabChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-accent text-accent'
                    : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink-strong'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-ink-faint'}`} />
                <span>{item.label}</span>
                {!!badges?.[item.id] && (
                  <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                    title={`${badges[item.id]} dossier(s) à traiter`}>
                    {badges[item.id]}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};
