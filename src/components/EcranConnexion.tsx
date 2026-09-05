import { useState } from 'react';
import type { User } from '../types';
import {
  Stethoscope, CreditCard, Pill,
  FlaskConical, Building2, Hospital, ArrowLeft,
  Lock, User as UserIcon, AlertCircle
} from 'lucide-react';

interface EcranConnexionProps {
  users: User[];
  onLogin: (user: User) => void;
  onBack: () => void;
}

const roleIcons: Record<string, React.ReactNode> = {
  doctor: <Stethoscope className="w-5 h-5" />,
  cashier: <CreditCard className="w-5 h-5" />,
  pharmacy: <Pill className="w-5 h-5" />,
  magasinier: <Building2 className="w-5 h-5" />,
  laboratory: <FlaskConical className="w-5 h-5" />,
  billing: <Building2 className="w-5 h-5" />,
  admin: <UserIcon className="w-5 h-5" />,
};

const roleLabels: Record<string, string> = {
  doctor: 'Médecin',
  cashier: 'Caisse',
  pharmacy: 'Pharmacie',
  magasinier: 'Magasinier',
  laboratory: 'Laboratoire',
  billing: 'Responsable facturation',
  admin: 'Administrateur',
};

export default function EcranConnexion({ users, onLogin, onBack }: EcranConnexionProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const staffUsers = users.filter((u) => u.role !== 'receptionist');
  const selectedUser = users.find((u) => u.id === selectedUserId);

  const handleLogin = () => {
    if (!selectedUserId) {
      setError('Veuillez sélectionner un utilisateur');
      return;
    }
    if (!password) {
      setError('Veuillez entrer le mot de passe');
      return;
    }

    const user = users.find((u) => u.id === selectedUserId);
    if (!user) {
      setError('Utilisateur non trouvé');
      return;
    }

    if (user.password !== password) {
      setError('Mot de passe incorrect');
      return;
    }

    setError('');
    onLogin(user);
  };

  return (
    <div className="theme-login min-h-screen text-ink flex items-center justify-center px-4 pt-8 pb-24">
      <div className="max-w-md w-full">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 flex items-center gap-2 text-ink-muted hover:text-accent transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour à la réception
        </button>

        <div className="text-center mb-8">
          <div className="theme-brand-mark mb-6">
            <Hospital className="w-5 h-5 -rotate-45" />
          </div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-wider text-ink-strong mb-2">
            MediCare <span className="text-accent">HIS</span>
          </h1>
          <p className="text-ink-muted text-sm">Connexion Personnel Médical</p>
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); handleLogin(); }}
          className="bg-surface rounded-2xl border border-line p-6 shadow-xl shadow-black/5"
        >
          <div className="mb-5">
            <label htmlFor="staff-user" className="block text-sm font-medium text-ink mb-2">
              <UserIcon className="w-4 h-4 inline mr-2 text-accent" />
              Identifiant
            </label>
            <select
              id="staff-user"
              autoComplete="username"
              value={selectedUserId}
              onChange={(e) => { setSelectedUserId(e.target.value); setError(''); }}
              className="w-full px-3 py-3 bg-field border border-line rounded-lg text-ink text-sm focus:ring-2 focus:ring-accent/25 focus:border-accent outline-none"
            >
              <option value="">-- Sélectionner --</option>
              {staffUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.id} — {user.name} ({roleLabels[user.role] || user.role})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-5">
            <label htmlFor="staff-password" className="block text-sm font-medium text-ink mb-2">
              <Lock className="w-4 h-4 inline mr-2 text-accent" />
              Mot de passe
            </label>
            <input
              id="staff-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : undefined}
              className="w-full px-4 py-3 bg-field border border-line rounded-lg text-ink focus:ring-2 focus:ring-accent/25 focus:border-accent outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div id="login-error" role="alert" className="mb-4 p-3 bg-red-50 dark:bg-red-500/8 border border-red-200 dark:border-red-500/25 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!selectedUserId || !password}
            className="theme-primary-button w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(selectedUser && roleIcons[selectedUser.role]) || null}
            Se connecter
          </button>

          <div className="mt-6 p-3 bg-surface-muted border border-line rounded-lg">
            <p className="text-xs text-ink-muted text-center leading-relaxed">
              <strong>Mots de passe par défaut :</strong><br />
              Médecins : <code className="bg-surface-active text-ink px-1 rounded">doc123</code> •{' '}
              Caisses (1 &amp; 2) : <code className="bg-surface-active text-ink px-1 rounded">caisse123</code><br />
              Pharmacies (1 &amp; 2) : <code className="bg-surface-active text-ink px-1 rounded">pharma123</code> •{' '}
              Magasin : <code className="bg-surface-active text-ink px-1 rounded">mag123</code><br />
              Labo : <code className="bg-surface-active text-ink px-1 rounded">labo123</code><br />
              Facturation : <code className="bg-surface-active text-ink px-1 rounded">fact123</code> •{' '}
              Admin : <code className="bg-surface-active text-ink px-1 rounded">admin123</code>
            </p>
          </div>
        </form>

        <p className="text-center text-ink-faint text-xs mt-6">
          © 2026 MediCare HIS — Conforme RGPD
        </p>
      </div>
    </div>
  );
}
