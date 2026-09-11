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
} from 'lucide-react';
import { ActiveTab } from '../types';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const navItems: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    startsGroup?: boolean;
  }[] = [
    { id: 'dashboard', label: "Vue d'ensemble", icon: LayoutDashboard },
    { id: 'prestations', label: 'Facturation', icon: FileText },
    { id: 'comptoir', label: 'Comptoir & Externe', icon: Store },
    { id: 'paiements', label: 'Règlements', icon: CreditCard },
    { id: 'rejets', label: 'Rejets', icon: AlertTriangle },
    { id: 'historique', label: 'Historique', icon: History },
    { id: 'societes', label: 'Sociétés', icon: Building, startsGroup: true },
    { id: 'personnes', label: 'Assurés', icon: Users },
    { id: 'familles', label: 'Actes', icon: Layers },
    { id: 'etats', label: 'Rapports', icon: Printer },
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
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};
