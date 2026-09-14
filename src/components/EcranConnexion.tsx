import { useEffect, useState } from 'react';
import type { User } from '../types';
import { credentialAutofillOptOut, passwordInputOptOut } from '../utils/credentialAutofill';
import { verifyPassword, hashPassword, isHashedPassword } from '../utils/motDePasse';
import { IS_WAMP_BUILD, loginToMysql, fetchPublicUsers } from '../wamp';
import {
  Stethoscope, CreditCard, Pill,
  FlaskConical, Building2, Hospital, ArrowLeft,
  Lock, User as UserIcon, AlertCircle, ClipboardList,
} from 'lucide-react';

interface EcranConnexionProps {
  /** Comptes connus (mode navigateur uniquement ; en WAMP la liste publique est chargée). */
  users: User[];
  onLogin: (user: User) => void;
  onBack: () => void;
  /** Migration transparente : un mot de passe historique en clair devient une empreinte. */
  onPasswordUpgraded?: (userId: string, hash: string) => void;
}

const roleIcons: Record<string, React.ReactNode> = {
  receptionist: <ClipboardList className="w-5 h-5" />,
  doctor: <Stethoscope className="w-5 h-5" />,
  cashier: <CreditCard className="w-5 h-5" />,
  pharmacy: <Pill className="w-5 h-5" />,
  magasinier: <Building2 className="w-5 h-5" />,
  laboratory: <FlaskConical className="w-5 h-5" />,
  billing: <Building2 className="w-5 h-5" />,
  admin: <UserIcon className="w-5 h-5" />,
};

const roleLabels: Record<string, string> = {
  receptionist: 'Réception',
  doctor: 'Médecin',
  cashier: 'Caisse',
  pharmacy: 'Pharmacie',
  magasinier: 'Magasinier',
  laboratory: 'Laboratoire',
  billing: 'Responsable Facturation',
  admin: 'Administrateur',
};

export default function EcranConnexion({ users, onLogin, onBack, onPasswordUpgraded }: EcranConnexionProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // WAMP : liste publique des comptes (identifiants + rôles, JAMAIS de mot de passe).
  const [remoteUsers, setRemoteUsers] = useState<User[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(IS_WAMP_BUILD);
  const [usersError, setUsersError] = useState('');

  useEffect(() => {
    if (!IS_WAMP_BUILD) return;
    let cancelled = false;
    fetchPublicUsers()
      .then((list) => {
        if (cancelled) return;
        setRemoteUsers(list);
        setLoadingUsers(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadingUsers(false);
        setUsersError(e instanceof Error ? e.message : 'Comptes injoignables.');
      });
    return () => { cancelled = true; };
  }, []);

  // WAMP : tout le monde se connecte, y compris la réception (la base MySQL
  // n'est lisible qu'avec un jeton de session). Navigateur : réception publique.
  const staffUsers = (IS_WAMP_BUILD ? remoteUsers || [] : users).filter((u) =>
    IS_WAMP_BUILD ? true : u.role !== 'receptionist',
  );
  const selectedUser = staffUsers.find((u) => u.id === selectedUserId);

  const handleLogin = async () => {
    if (!selectedUserId) {
      setError('Veuillez sélectionner un utilisateur');
      return;
    }
    if (!password) {
      setError('Veuillez entrer le mot de passe');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (IS_WAMP_BUILD) {
        // Authentification SERVEUR : le mot de passe est vérifié en bcrypt
        // côté MySQL, un jeton de session est délivré (voir wamp.ts).
        const user = await loginToMysql(selectedUserId, password);
        setPassword('');
        onLogin(user);
        return;
      }
      const user = users.find((u) => u.id === selectedUserId);
      if (!user) {
        setError('Utilisateur non trouvé');
        return;
      }
      if (!(await verifyPassword(password, user.password))) {
        setError('Mot de passe incorrect');
        return;
      }
      if (!isHashedPassword(user.password)) {
        // Mot de passe historique en clair : migré vers une empreinte.
        onPasswordUpgraded?.(user.id, await hashPassword(password));
      }
      setError('');
      setPassword('');
      onLogin(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="theme-login min-h-screen text-ink flex items-center justify-center px-4 pt-8 pb-24">
      <div className="max-w-md w-full">
        {!IS_WAMP_BUILD && (
          <button
            type="button"
            onClick={onBack}
            className="mb-8 flex items-center gap-2 text-ink-muted hover:text-accent transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à la réception
          </button>
        )}

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
          {...credentialAutofillOptOut}
          onSubmit={(event) => { event.preventDefault(); void handleLogin(); }}
          className="bg-surface rounded-2xl border border-line p-6 shadow-xl shadow-black/5"
        >
          <div className="mb-5">
            <label htmlFor="staff-user" className="block text-sm font-medium text-ink mb-2">
              <UserIcon className="w-4 h-4 inline mr-2 text-accent" />
              Identifiant
            </label>
            <select
              id="staff-user"
              {...credentialAutofillOptOut}
              value={selectedUserId}
              disabled={loadingUsers || busy}
              onChange={(e) => { setSelectedUserId(e.target.value); setPassword(''); setError(''); }}
              className="w-full px-3 py-3 bg-field border border-line rounded-lg text-ink text-sm focus:ring-2 focus:ring-accent/25 focus:border-accent outline-none disabled:opacity-60"
            >
              <option value="">{loadingUsers ? 'Chargement des comptes…' : '-- Sélectionner --'}</option>
              {staffUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.id} — {user.name} ({roleLabels[user.role] || user.role})
                </option>
              ))}
            </select>
            {usersError && (
              <p className="mt-2 text-xs text-red-700 dark:text-red-400">⚠️ {usersError} Vérifiez WAMP (icône verte) puis rechargez la page.</p>
            )}
          </div>

          <div className="mb-5">
            <label htmlFor="staff-password" className="block text-sm font-medium text-ink mb-2">
              <Lock className="w-4 h-4 inline mr-2 text-accent" />
              Mot de passe
            </label>
            <input
              id="staff-password"
              type="password"
              {...passwordInputOptOut}
              value={password}
              disabled={busy}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : undefined}
              className="w-full px-4 py-3 bg-field border border-line rounded-lg text-ink focus:ring-2 focus:ring-accent/25 focus:border-accent outline-none disabled:opacity-60"
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
            disabled={!selectedUserId || !password || busy || loadingUsers}
            className="theme-primary-button w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(selectedUser && roleIcons[selectedUser.role]) || null}
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>

          <div className="mt-6 p-3 bg-surface-muted border border-line rounded-lg">
            <p className="text-xs text-ink-muted text-center leading-relaxed">
              🔒 Première connexion ? Demandez vos identifiants à l'administrateur
              {IS_WAMP_BUILD ? ' (la réception se connecte aussi, avec le compte Réception).' : '.'}
            </p>
          </div>
        </form>

        <p className="text-center text-ink-faint text-xs mt-6">
          © 2026 MediCare HIS
        </p>
      </div>
    </div>
  );
}
