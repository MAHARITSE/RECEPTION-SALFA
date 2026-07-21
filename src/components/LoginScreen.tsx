import { useState } from 'react';
import type { User } from '../types';
import {
  Stethoscope, CreditCard, Pill,
  FlaskConical, Building2, Hospital, ArrowLeft,
  Lock, User as UserIcon, AlertCircle
} from 'lucide-react';

interface LoginScreenProps {
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

const roleColors: Record<string, string> = {
  doctor: 'bg-emerald-600 hover:bg-emerald-700',
  cashier: 'bg-amber-600 hover:bg-amber-700',
  pharmacy: 'bg-purple-600 hover:bg-purple-700',
  magasinier: 'bg-orange-600 hover:bg-orange-700',
  laboratory: 'bg-cyan-600 hover:bg-cyan-700',
  billing: 'bg-indigo-600 hover:bg-indigo-700',
  admin: 'bg-slate-700 hover:bg-slate-800',
};

export default function LoginScreen({ users, onLogin, onBack }: LoginScreenProps) {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Back button */}
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour à la réception


        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 mb-4 shadow-2xl">
            <Hospital className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            MediCare <span className="text-blue-400">HIS</span>
          </h1>
          <p className="text-slate-400">Connexion Personnel Médical</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 shadow-2xl">
          {/* User selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <UserIcon className="w-4 h-4 inline mr-2" />
              Identifiant
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => { setSelectedUserId(e.target.value); setError(''); }}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">-- Sélectionner --</option>
              {staffUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.id} — {user.name} ({roleLabels[user.role] || user.role})
                </option>
              ))}
            </select>
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Lock className="w-4 h-4 inline mr-2" />
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="••••••••"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Login button */}
          <button
            onClick={handleLogin}
            disabled={!selectedUserId || !password}
            className={`w-full py-3 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              selectedUser ? (roleColors[selectedUser.role] || 'bg-blue-600 hover:bg-blue-700') : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {(selectedUser && roleIcons[selectedUser.role]) || null}
            Se connecter
          </button>

          {/* Help text */}
          <div className="mt-6 p-3 bg-slate-700/30 rounded-lg">
            <p className="text-xs text-slate-400 text-center">
              <strong>Mots de passe par défaut:</strong><br />
              Médecins: <code className="bg-slate-600 px-1 rounded">doc123</code> • 
              Caisse: <code className="bg-slate-600 px-1 rounded">caisse123</code><br />
              Pharmacie: <code className="bg-slate-600 px-1 rounded">pharma123</code> • 
              Magasin: <code className="bg-slate-600 px-1 rounded">mag123</code><br />
              Labo: <code className="bg-slate-600 px-1 rounded">labo123</code><br />
              Facturation: <code className="bg-slate-600 px-1 rounded">fact123</code> • 
              Admin: <code className="bg-slate-600 px-1 rounded">admin123</code>
            </p>
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          © 2026 MediCare HIS — Conforme RGPD
        </p>
      </div>
    </div>
  );
}
