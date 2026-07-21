import { useState, useEffect, Component, type ReactNode, type ErrorInfo } from 'react';
import type { User } from './types';
import { createInitialState, migrateLegacyToVentes, type AppState } from './store';
import ReceptionModule from './components/ReceptionModule';
import LoginScreen from './components/LoginScreen';
import Layout from './components/Layout';
import DoctorModule from './components/DoctorModule';
import CashierModule from './components/CashierModule';
import PharmacyModule from './components/PharmacyModule';
import MagasinierModule from './components/MagasinierModule';
import LaboratoryModule from './components/LaboratoryModule';
import AdminModule from './components/AdminModule';
import MedicalRecordModule from './components/MedicalRecordModule';
import Messaging from './components/Messaging';

const roleTitles: Record<string, string> = {
  doctor: '🩺 Médecin — Consultation & Prescription',
  cashier: '💳 Caisse — Facturation & Ventes',
  pharmacy: '💊 Pharmacie — Dispensation & Stock',
  magasinier: '📦 Magasinier — Stock Central, Achats & Transferts',
  laboratory: '🔬 Laboratoire — Analyses & Résultats',
  admin: '⚙️ Administration — Configuration système',
};

type AppView = 'reception' | 'login' | 'staff' | 'medicalRecord';

/* ─── Error Boundary : empêche l'écran blanc si un module plante ─── */
interface EBState { hasError: boolean; error: Error | null; }
class ModuleErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): EBState { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ModuleErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-bold text-red-700">Une erreur est survenue</h2>
          <p className="text-sm text-slate-600 max-w-md">{this.state.error?.message || 'Erreur inconnue du module.'}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); this.props.onReset(); }}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Error Boundary GLOBAL : plus AUCUN écran blanc possible, même si
   la page de connexion, la réception, le layout ou la messagerie plante.
   Affiche un message clair avec un bouton « Réessayer » (recharge l'app). ─── */
class AppErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): EBState { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[AppErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-white">MediCare HIS — Une erreur est survenue</h1>
          <p className="text-sm text-slate-300 max-w-lg">
            L'application a rencontré un problème inattendu. Vos données de session n'ont pas été perdues.
            <br />
            <span className="text-slate-400">{this.state.error?.message || 'Erreur inconnue.'}</span>
          </p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer"
            >
              Réessayer
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-slate-700 text-white rounded-lg font-semibold hover:bg-slate-600 cursor-pointer"
            >
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const [state, setState] = useState<AppState>(createInitialState());
  const [view, setView] = useState<AppView>('reception');
  const [showMessaging, setShowMessaging] = useState(false);
  const [messagingRecipientId, setMessagingRecipientId] = useState<string | null>(null);

  // Migration automatique idempotente : au 1er chargement, les anciennes
  // factures + dossiers hospit/bloc sont dupliqués dans la table unifiée `ventes`.
  useEffect(() => {
    setState((prev) => {
      // On vérifie s'il y a quelque chose à migrer.
      const hasLegacy = (prev.invoices?.length || 0) + (prev.hbRecords?.length || 0) > 0;
      const alreadyMigrated = (prev.ventes?.length || 0) > 0;
      if (!hasLegacy || alreadyMigrated) return prev;
      const next = { ...prev };
      const { migratedInvoices, migratedHb } = migrateLegacyToVentes(next);
      if (migratedInvoices === 0 && migratedHb === 0) return prev;
      // eslint-disable-next-line no-console
      console.info(`[ventes] migration automatique : ${migratedInvoices} facture(s), ${migratedHb} dossier(s) hospit/bloc.`);
      return next;
    });

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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (user: User) => {
    setState((prev) => ({ ...prev, currentUser: user }));
    setView('staff');
  };

  const handleLogout = () => {
    setState((prev) => ({ ...prev, currentUser: null }));
    setView('reception');
  };

  const handleOpenMedicalRecord = () => setView('medicalRecord');

  const handleMarkRead = (notifId: string) => {
    setState((prev) => ({ ...prev, notifications: prev.notifications.map((n) => n.id === notifId ? { ...n, read: true } : n) }));
  };

  const myMsgCount = state.messages.filter((m) => m.toUserId === (state.currentUser?.id || 'RECEPTION') && !m.read).length;

  const handleOpenMessagingWithRecipient = (id?: string | null) => {
    if (id) setMessagingRecipientId(id);
    setShowMessaging(true);
  };

  const handleCloseMessaging = () => {
    setShowMessaging(false);
    setMessagingRecipientId(null);
  };

  /* ─── Vue Réception ─── */
  if (view === 'reception') {
    return (
      <>
        <ReceptionModule state={state} setState={setState} onStaffLogin={() => setView('login')} onOpenMessaging={() => handleOpenMessagingWithRecipient(null)} />
        {showMessaging && <Messaging state={state} setState={setState} onClose={handleCloseMessaging} initialRecipientId={messagingRecipientId} />}
      </>
    );
  }

  /* ─── Vue Login ─── */
  if (view === 'login') {
    return <LoginScreen users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} />;
  }

  /* ─── Garde : si pas d'utilisateur connecté, rediriger vers login (SANS setView pendant le rendu) ─── */
  if (!state.currentUser) {
    return <LoginScreen users={state.users} onLogin={handleLogin} onBack={() => setView('reception')} />;
  }

  /* ─── Vue Dossier Médical (médecins uniquement) ─── */
  if (view === 'medicalRecord') {
    if (state.currentUser.role !== 'doctor') {
      return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-red-700 font-semibold">Accès refusé : seuls les médecins peuvent consulter les dossiers médicaux.</div>;
    }
    return (
      <>
        <Layout
          user={state.currentUser}
          notifications={state.notifications}
          onLogout={handleLogout}
          onMarkRead={handleMarkRead}
          onOpenMessaging={() => handleOpenMessagingWithRecipient(null)}
          onOpenMedicalRecord={handleOpenMedicalRecord}
          unreadMessages={myMsgCount}
        >
          <MedicalRecordModule state={state} onBack={() => setView('staff')} />
        </Layout>
        {showMessaging && <Messaging state={state} setState={setState} onClose={handleCloseMessaging} initialRecipientId={messagingRecipientId} />}
      </>
    );
  }

  /* ─── Vue Staff (modules par rôle) ─── */
  const renderModule = () => {
    switch (state.currentUser?.role) {
      case 'doctor': return <DoctorModule state={state} setState={setState} />;
      case 'cashier': return <CashierModule state={state} setState={setState} onOpenMessagingWithRecipient={handleOpenMessagingWithRecipient} />;
      case 'pharmacy': return <PharmacyModule state={state} setState={setState} onOpenMessagingWithRecipient={handleOpenMessagingWithRecipient} />;
      case 'magasinier': return <MagasinierModule state={state} setState={setState} />;
      case 'laboratory': return <LaboratoryModule state={state} setState={setState} />;
      case 'admin': return <AdminModule state={state} setState={setState} />;
      default: return <div>Module non trouvé</div>;
    }
  };

  return (
    <>
      <Layout user={state.currentUser} notifications={state.notifications} onLogout={handleLogout} onMarkRead={handleMarkRead}
        onOpenMessaging={() => handleOpenMessagingWithRecipient(null)} onOpenMedicalRecord={state.currentUser.role === 'doctor' ? handleOpenMedicalRecord : undefined} unreadMessages={myMsgCount}>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-800">{roleTitles[state.currentUser.role] || 'Module'}</h2>
          <p className="text-slate-500 text-sm mt-1">
            Connecté: <strong>{state.currentUser.name}</strong> ({state.currentUser.id}) — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <ModuleErrorBoundary onReset={handleLogout}>
          {renderModule()}
        </ModuleErrorBoundary>
      </Layout>
      {showMessaging && <Messaging state={state} setState={setState} onClose={handleCloseMessaging} initialRecipientId={messagingRecipientId} />}
    </>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
